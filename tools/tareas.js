/**
 * tareas.js — mantenimiento automático de la plataforma.
 *
 *   node tools/tareas.js            # todas las tareas
 *   node tools/tareas.js caducar    # una sola
 *   node tools/tareas.js --seco     # dice qué haría, sin hacerlo
 *
 * Pensado para un temporizador de systemd (ver deploy/) que lo
 * despierte una vez al día. Se ejecuta y termina: no queda un proceso
 * vivo que haya que vigilar, y si una ejecución falla, la siguiente
 * recoge lo que quedó pendiente.
 *
 * Toda tarea es idempotente. Correrlo dos veces seguidas no manda dos
 * correos ni hace dos respaldos del mismo minuto: lo que ya se hizo
 * queda anotado en la base.
 */

require('./entorno');

const fs = require('fs');
const path = require('path');

const db = require('./db');
const correo = require('./correo');
const facturas = require('./facturas');

const RAIZ = path.resolve(__dirname, '..');

const SECO = process.argv.includes('--seco');
const DIAS_AVISO = Number(process.env.MERCA_DIAS_AVISO) || 5;
const RESPALDOS = process.env.MERCA_RESPALDOS || path.join(RAIZ, '.tmp', 'respaldos');
const RESPALDOS_MAX = Number(process.env.MERCA_RESPALDOS_MAX) || 14;

const registro = [];
const anotar = (tarea, mensaje) => {
  registro.push({ tarea, mensaje });
  console.log(`  ${SECO ? '[seco] ' : ''}${mensaje}`);
};

/* ── Tareas ─────────────────────────────────────────────── */

/* Pasa a 'vencido' lo que llegó a su fecha. El servidor ya lo hace al
   consultar el catálogo, pero eso solo ocurre si alguien entra: sin
   esta tarea, un sitio sin visitas de madrugada deja anuncios
   caducados marcados como activos hasta la primera visita. */
function caducar() {
  if (SECO) {
    const n = db.abrir().prepare(
      "SELECT COUNT(*) AS n FROM anuncios WHERE estado = 'activo' AND vence IS NOT NULL AND vence < ?")
      .get(db.ahora()).n;
    return anotar('caducar', `${n} anuncio(s) pasarían a vencidos`);
  }
  const r = db.caducarAnuncios();
  anotar('caducar', `${r.changes} anuncio(s) marcados como vencidos`);
}

/* Aviso antes del corte. Se manda una sola vez por anuncio: la marca
   se pone solo si el correo salió, así un fallo del proveedor no
   consume el aviso y el intento se repite mañana. */
async function avisarPorVencer() {
  const pendientes = db.anunciosPorVencer(DIAS_AVISO);
  if (!pendientes.length) return anotar('por-vencer', 'sin anuncios próximos a vencer');

  let enviados = 0;
  for (const a of pendientes) {
    const dias = Math.max(1, Math.ceil((new Date(a.vence) - Date.now()) / 86400000));
    if (SECO) { enviados++; continue; }

    const r = await correo.enviarAnuncioPorVencer({
      para: a.correo,
      nombre: a.nombre,
      equipo: `${a.anio} ${a.marca} ${a.modelo}`,
      idAnuncio: a.id,
      vence: a.vence,
      dias,
    });
    if (r && r.entregado) { db.marcarAviso(a.id, 'por-vencer'); enviados++; }
  }
  anotar('por-vencer', `${enviados} de ${pendientes.length} aviso(s) de vencimiento`);
}

async function avisarVencidos() {
  const pendientes = db.anunciosVencidosSinAvisar();
  if (!pendientes.length) return anotar('vencidos', 'sin vencidos por avisar');

  let enviados = 0;
  for (const a of pendientes) {
    if (SECO) { enviados++; continue; }
    const r = await correo.enviarAnuncioVencido({
      para: a.correo,
      nombre: a.nombre,
      equipo: `${a.anio} ${a.marca} ${a.modelo}`,
      idAnuncio: a.id,
    });
    if (r && r.entregado) { db.marcarAviso(a.id, 'vencido'); enviados++; }
  }
  anotar('vencidos', `${enviados} de ${pendientes.length} aviso(s) de corte`);
}

/* Comprobantes que no llegaron a enviarse.
 *
 * Emitir y notificar son cosas distintas: el comprobante queda emitido
 * y guardado aunque el proveedor de correo esté caído. Esta tarea
 * recoge lo que quedó pendiente.
 *
 * Se abandona a los 10 intentos. Un correo que ha fallado diez días
 * seguidos no va a salir el undécimo —la dirección no existe, o el
 * buzón está lleno— y seguir intentándolo solo gasta cuota de envío.
 * Queda marcado en el panel para reenviarlo a mano. */
const MAXIMO_REINTENTOS = 10;

async function reenviarComprobantes() {
  /* Primero el papel que falte. Un comprobante emitido hay que poder
     recuperarlo, y si dibujarlo falló en su momento —o el archivo se
     perdió— la fila existe y el PDF no. Se repone antes de intentar
     mandar nada: mandar el correo sin adjunto y darlo por enviado
     sacaba el comprobante de la lista de pendientes para siempre. */
  if (!SECO) {
    const { hechos, fallos } = facturas.regenerarPdfsPendientes({ limite: 200 });
    if (hechos.length) anotar('comprobantes', `${hechos.length} PDF repuesto(s): ${hechos.join(', ')}`);
    fallos.forEach((f) => console.error(`  ✗ no se pudo redibujar ${f}`));
  }

  const pendientes = db.facturas({ pendientes: true, limite: 100 })
    .filter((f) => f.intentos_envio < MAXIMO_REINTENTOS);

  if (!pendientes.length) return anotar('comprobantes', 'sin comprobantes pendientes de enviar');
  if (SECO) return anotar('comprobantes', `reintentaría ${pendientes.length} envío(s)`);

  let salieron = 0;
  for (const f of pendientes) {
    const dueno = f.organizacion_id && db.propietarioDe(f.organizacion_id);
    const r = await facturas.enviar(f, { correoCliente: dueno && dueno.correo });
    if (r && r.enviada_cliente && r.enviada_interna) salieron++;
  }
  anotar('comprobantes', `${salieron} de ${pendientes.length} comprobante(s) completados`);
}

/* Aviso cuando una secuencia de NCF se está acabando.
 *
 * Sin NCF disponible no se puede emitir una factura fiscal, y pedir un
 * rango nuevo a la DGII no es inmediato. El aviso tiene que llegar con
 * margen, no el día que se agota. */
async function avisarNcf() {
  const bajas = facturas.secuenciasBajas();
  if (!bajas.length) return anotar('ncf', 'todas las secuencias con margen');

  /* El motivo, porque son dos y piden cosas distintas: quedarse sin
     números se arregla pidiendo un rango nuevo; que venza el plazo,
     también, pero con la prisa de una fecha en el calendario. */
  const porQue = (s) => {
    if (s.vencida) return `VENCIDA el ${s.vence}`;
    if (s.porVencer) return `vence el ${s.vence}`;
    return `quedan ${s.quedan} de ${s.hasta - s.desde + 1}`;
  };

  const detalle = bajas.map((s) => `${s.tipo}: ${porQue(s)}`).join(' · ');
  if (SECO) return anotar('ncf', `avisaría: ${detalle}`);

  /* El asunto cambia cuando queda uno: ese correo ya no es un recordatorio,
     es que el próximo cobro sale sin comprobante fiscal. */
  const critico = bajas.some((s) => s.critica);

  await correo.avisarInternamente({
    buzon: 'facturacion',
    asunto: `${critico ? 'URGENTE: se agota la secuencia' : 'Se están acabando los comprobantes fiscales'}`
      + ` · ${bajas.map((s) => s.tipo).join(', ')}`,
    texto: [
      'Estas secuencias de comprobantes piden atención:',
      '',
      ...bajas.map((s) => `  ${s.tipo} (${s.nombre}): ${porQue(s)}`),
      '',
      'Sin NCF disponible no se puede emitir una factura fiscal: quien pida',
      'comprobante con RNC recibirá un recibo no fiscal.',
      '',
      'Y un NCF de una secuencia vencida no sirve: el sistema deja de emitirlos',
      'en cuanto pasa la fecha, para no entregar un crédito fiscal que el cliente',
      'no va a poder usar.',
      '',
      'Solicite un rango nuevo a la DGII a través del contador.',
      '',
      'MercaMaquinarias',
    ].join('\n'),
  });
  anotar('ncf', detalle);
}

/* Sesiones, códigos y contadores caducados. */
function limpiar() {
  if (SECO) return anotar('limpiar', 'purgaría sesiones, códigos e intentos caducados');
  db.purgar();
  anotar('limpiar', 'purgadas sesiones, códigos e intentos caducados');
}

/* Respaldo de la base.
 *
 * Se usa la API `.backup()` de SQLite y no `cp`: copiar el archivo
 * mientras hay una escritura en curso produce un respaldo corrupto que
 * solo se descubre el día que hace falta restaurarlo.
 *
 * Se prueba abrir la copia antes de darla por buena. Un respaldo que
 * nunca se verifica es una carpeta que ocupa disco. */
function respaldar() {
  const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const destino = path.join(RESPALDOS, `mercamaquinarias-${sello}.db`);

  if (SECO) return anotar('respaldo', `escribiría ${destino}`);

  fs.mkdirSync(RESPALDOS, { recursive: true });
  const d = db.abrir();

  // VACUUM INTO produce un archivo compacto y consistente, y a
  // diferencia de .backup deja el resultado ya desfragmentado.
  d.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);

  const { DatabaseSync } = require('node:sqlite');
  const prueba = new DatabaseSync(destino, { readOnly: true });
  const n = prueba.prepare('SELECT COUNT(*) AS n FROM anuncios').get().n;
  const integridad = prueba.prepare('PRAGMA integrity_check').get();
  prueba.close();

  const bien = Object.values(integridad)[0] === 'ok';
  if (!bien) {
    fs.rmSync(destino, { force: true });
    throw new Error('el respaldo no pasó integrity_check y se descartó');
  }

  const kb = Math.round(fs.statSync(destino).size / 1024);
  anotar('respaldo', `${path.basename(destino)} · ${kb} KB · ${n} anuncios · íntegro`);

  // Rotación: se conservan los últimos RESPALDOS_MAX.
  const viejos = fs.readdirSync(RESPALDOS)
    .filter((f) => f.startsWith('mercamaquinarias-') && f.endsWith('.db'))
    .sort().reverse().slice(RESPALDOS_MAX);
  viejos.forEach((f) => fs.rmSync(path.join(RESPALDOS, f), { force: true }));
  if (viejos.length) anotar('respaldo', `${viejos.length} respaldo(s) antiguos eliminados`);
}

/* Deja la base compacta y con las estadísticas del planificador al
   día. Sin esto, las consultas se degradan lentamente a medida que se
   borran filas. */
function optimizar() {
  if (SECO) return anotar('optimizar', 'ejecutaría ANALYZE y PRAGMA optimize');
  const d = db.abrir();
  d.exec('ANALYZE');
  d.exec('PRAGMA optimize');
  anotar('optimizar', 'estadísticas del planificador actualizadas');
}

/* ── Orquestación ───────────────────────────────────────── */

/* ── Informes de negocio ────────────────────────────────────
 *
 * A gerencia, con copia a facturación. Uno semanal los lunes y otro
 * mensual el día 1, que es cuando alguien se sienta a mirar el mes
 * cerrado.
 *
 * Van en TEXTO PLANO alineado y no en tablas HTML. Un informe interno
 * se lee de un vistazo en el teléfono, se reenvía y a veces se pega en
 * un mensaje: el texto plano sobrevive a las tres cosas y una tabla
 * HTML no. Los números van alineados a la derecha porque una columna
 * de cifras desalineada no se compara, se descifra.
 */

const pesos = (n) => `RD$ ${Number(n || 0).toLocaleString('en-US')}`;
const num = (n, ancho = 7) => String(n == null ? 0 : n).padStart(ancho);

/* Una fila de «rótulo ......... valor», que es lo que hace legible un
   informe de texto en un ancho de teléfono. */
const fila = (rotulo, valor, ancho = 44) => {
  const v = String(valor);
  const puntos = Math.max(1, ancho - rotulo.length - v.length);
  return `  ${rotulo} ${'.'.repeat(puntos)} ${v}`;
};

const titulo = (t) => `\n${t}\n${'─'.repeat(t.length)}`;

function componerInforme(i, periodo) {
  const l = [];

  l.push(`MercaMaquinarias · informe ${periodo}`);
  l.push(`Del ${i.desde} al ${i.hasta}`);

  l.push(titulo('Dinero'));
  l.push(fila('Cobros aprobados', `${i.dinero.cobros.n} · ${pesos(i.dinero.cobros.total)}`));
  if (i.dinero.devueltos.n) {
    l.push(fila('Devoluciones', `${i.dinero.devueltos.n} · ${pesos(i.dinero.devueltos.total)}`));
  }

  l.push(titulo('Comprobantes emitidos'));
  if (!i.comprobantes.porTipo.length) {
    l.push('  Ninguno en el periodo.');
  } else {
    i.comprobantes.porTipo.forEach((c) => l.push(fila(c.tipo, `${c.n} · ${pesos(c.total)}`)));
  }
  if (i.comprobantes.sinEnviar) {
    l.push(fila('PENDIENTES DE ENVIAR', i.comprobantes.sinEnviar));
  }
  if (i.comprobantes.recibos) {
    l.push(fila('Recibos sin NCF (esperan la B02)', i.comprobantes.recibos));
  }

  l.push(titulo('Comprobantes autorizados que quedan'));
  i.ncf.forEach((n) => l.push(fila(
    `${n.tipo} · ${n.nombre}`,
    `${n.quedan}${n.vence ? ` · vence ${n.vence}` : ''}`)));

  l.push(titulo('Catálogo'));
  l.push(fila('Equipos publicados en el periodo', i.anuncios.publicados));
  l.push(fila('Activos ahora mismo', i.anuncios.activos));
  l.push(fila('Vencidos', i.anuncios.vencidos));
  l.push(fila('Vendidos', i.anuncios.vendidos));
  if (i.anuncios.porCategoria.length) {
    l.push('');
    l.push('  Por categoría:');
    i.anuncios.porCategoria.forEach((c) => l.push(`    ${num(c.n, 5)}  ${c.categoria}`));
  }

  l.push(titulo('Cuentas'));
  l.push(fila('Cuentas nuevas', i.cuentas.nuevas));
  l.push(fila('Total de cuentas', i.cuentas.total));
  l.push(fila('Dealers nuevos', i.cuentas.dealersNuevos));
  l.push(fila('Dealers aprobados', i.cuentas.dealersAprobados));
  if (i.cuentas.dealersPendientes) {
    l.push(fila('SOLICITUDES SIN REVISAR', i.cuentas.dealersPendientes));
  }

  l.push(titulo('Tráfico del sitio'));
  l.push(fila('Páginas vistas', i.trafico.vistas));
  l.push(fila('Visitantes distintos', i.trafico.unicos));
  if (i.trafico.porPagina.length) {
    l.push('');
    l.push('  Las más vistas:');
    i.trafico.porPagina.slice(0, 8).forEach((p) => l.push(
      `    ${num(p.vistas, 6)} vistas ${num(p.visitantes, 6)} personas   ${p.pagina}`));
  }

  l.push(titulo('Interés en los anuncios'));
  l.push(fila('Fichas vistas', i.contactos.vistas));
  l.push(fila('Pidieron el teléfono', i.contactos.telefono));
  l.push(fila('Escribieron por WhatsApp', i.contactos.whatsapp));

  if (i.solicitudes.length) {
    l.push(titulo('Cotizaciones pedidas'));
    i.solicitudes.forEach((s) => l.push(fila(`${s.servicio} · ${s.estado}`, s.n)));
  }

  l.push('');
  l.push('Este informe lo genera el propio sitio. Si una cifra no cuadra,');
  l.push('el dato está en la base y se puede recalcular.');
  l.push('');
  l.push('MercaMaquinarias');

  return l.join('\n');
}

const soloFecha = (d) => d.toISOString().slice(0, 10);

async function mandarInforme(periodo, desde, hasta) {
  const i = db.informe({ desde, hasta });
  const texto = componerInforme(i, periodo);

  if (SECO) {
    console.log(texto);
    return anotar(`informe-${periodo}`, `enviaría el informe ${periodo} (${desde} a ${hasta})`);
  }

  await correo.avisarInternamente({
    buzon: 'gerencia',
    copia: 'facturacion',
    asunto: `Informe ${periodo} · ${desde} a ${hasta} · ${i.dinero.cobros.n} cobro(s) · ${pesos(i.dinero.cobros.total)}`,
    texto,
  });

  anotar(`informe-${periodo}`,
    `informe ${periodo} enviado a gerencia · ${i.dinero.cobros.n} cobro(s), ${i.trafico.unicos} visitante(s)`);
}

/* Lunes: los siete días anteriores, de lunes a domingo. No «los
   últimos siete días» a secas, porque entonces el informe de cada
   semana solaparía con el de la anterior y las cifras no se podrían
   sumar. */
function informeSemanal() {
  const hoyD = new Date();
  const fin = new Date(hoyD);
  fin.setUTCDate(fin.getUTCDate() - 1);
  const ini = new Date(fin);
  ini.setUTCDate(ini.getUTCDate() - 6);
  return mandarInforme('semanal', soloFecha(ini), soloFecha(fin));
}

/* Día 1: el mes anterior completo. */
function informeMensual() {
  const hoyD = new Date();
  const fin = new Date(Date.UTC(hoyD.getUTCFullYear(), hoyD.getUTCMonth(), 0));
  const ini = new Date(Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth(), 1));
  return mandarInforme('mensual', soloFecha(ini), soloFecha(fin));
}

/* Archivos que se subieron y no acabaron en ninguna parte.
 *
 * El asistente de publicación sube cada foto en cuanto se elige, no al
 * enviar el formulario. Quien lo empieza tres veces y se rinde deja
 * veinticuatro archivos en el disco para siempre: nada los borraba,
 * porque el único borrado que existe es el de eliminar un anuncio. Con
 * los topes vigentes, una cuenta legítima puede dejar casi doscientos
 * megas de video huérfano al día sin saltarse ninguna regla.
 *
 * LAS 48 HORAS NO SON DECORATIVAS. Entre que se sube una foto y que se
 * envía el anuncio puede pasar un rato largo —el asistente guarda
 * borrador—, así que borrar lo reciente destruiría el trabajo de
 * alguien que está a mitad. Dos días es de sobra. */
const GRACIA_HORAS = 48;

/* Tope por ejecución. Esta es la única tarea que BORRA archivos del
   cliente, y el borrado no se deshace. Si un día alguien cambia el
   formato de las rutas y `rutasEnUso` deja de reconocer las suyas, esta
   línea convierte una catástrofe en un aviso raro en el registro: se
   borran doscientos, se nota, y el resto sigue ahí. Lo que sobre se
   recoge mañana. */
const MAXIMO_POR_EJECUCION = 200;

function recogerHuerfanos() {
  const carpetas = [
    [process.env.MERCA_FOTOS || path.join(RAIZ, '.tmp', 'fotos'), '/fotos'],
    [process.env.MERCA_VIDEOS || path.join(RAIZ, '.tmp', 'videos'), '/videos'],
  ];

  const enUso = db.rutasEnUso();
  const limite = Date.now() - GRACIA_HORAS * 3600 * 1000;
  let borrados = 0;
  let tope = false;
  let bytes = 0;

  for (const [carpeta, prefijo] of carpetas) {
    if (!fs.existsSync(carpeta)) continue;

    /* Las subcarpetas son por mes: /fotos/2026-09/<hex>.jpg */
    for (const mes of fs.readdirSync(carpeta)) {
      const dirMes = path.join(carpeta, mes);
      if (!fs.statSync(dirMes).isDirectory()) continue;

      for (const archivo of fs.readdirSync(dirMes)) {
        const completa = path.join(dirMes, archivo);
        const info = fs.statSync(completa);
        if (!info.isFile() || info.mtimeMs > limite) continue;
        if (enUso.has(`${prefijo}/${mes}/${archivo}`)) continue;
        if (borrados >= MAXIMO_POR_EJECUCION) { tope = true; continue; }

        if (!SECO) fs.rmSync(completa, { force: true });
        borrados++;
        bytes += info.size;
      }
    }
  }

  const mb = (bytes / 1048576).toFixed(1);
  if (!borrados) return anotar('huerfanos', 'sin archivos huérfanos que recoger');
  anotar('huerfanos', `${SECO ? 'borraría' : 'borrados'} ${borrados} archivo(s) sin usar · ${mb} MB`
    + (tope ? ` · se alcanzó el tope de ${MAXIMO_POR_EJECUCION}, el resto mañana` : ''));
}

/* El perfil público se apaga cuando vence el plan que lo incluía.
 *
 * No lo hacía nadie: el único sitio del código que ponía
 * `perfil_publico = 0` era el alta de dealer, así que una vez
 * encendido quedaba encendido para siempre. El plan se pagaba una vez
 * y la página seguía publicada años después.
 *
 * La página no se borra ni se despublica: pierde la visibilidad y el
 * borrador queda intacto, esperando a que renueve. */
function apagarPerfiles() {
  if (SECO) {
    return anotar('perfiles', 'comprobaría qué perfiles se quedaron sin plan');
  }
  const { apagados } = db.apagarPerfilesSinPlan();
  if (!apagados.length) return anotar('perfiles', 'todos los perfiles publicados tienen plan vigente');
  anotar('perfiles', `${apagados.length} perfil(es) retirados del directorio por plan vencido`);
}

const TAREAS = {
  caducar,
  perfiles: apagarPerfiles,
  'informe-semanal': informeSemanal,
  'informe-mensual': informeMensual,
  'por-vencer': avisarPorVencer,
  vencidos: avisarVencidos,
  comprobantes: reenviarComprobantes,
  ncf: avisarNcf,
  limpiar,
  huerfanos: recogerHuerfanos,
  respaldo: respaldar,
  optimizar,
};

(async () => {
  const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));

  /* Sin argumentos se ejecuta el mantenimiento DIARIO, que no es todo.
   *
   * Los informes tienen su propio temporizador —lunes y día 1— y meterlos
   * en la tanda diaria haría que gerencia recibiera el informe semanal
   * todos los días. Un informe que llega a diario se deja de leer en
   * una semana, y entonces el que importa tampoco se lee. */
  const aEjecutar = pedidas.length
    ? pedidas
    : Object.keys(TAREAS).filter((t) => !t.startsWith('informe-'));

  const desconocidas = aEjecutar.filter((t) => !TAREAS[t]);
  if (desconocidas.length) {
    console.error(`Tarea desconocida: ${desconocidas.join(', ')}`);
    console.error(`Disponibles: ${Object.keys(TAREAS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\nMercaMaquinarias · mantenimiento ${new Date().toISOString()}${SECO ? ' (simulación)' : ''}\n`);
  db.abrir();

  let fallos = 0;
  for (const nombre of aEjecutar) {
    try {
      await TAREAS[nombre]();
    } catch (e) {
      fallos++;
      // Una tarea que falla no detiene a las demás: que el respaldo
      // falle no es razón para no purgar ni avisar.
      console.error(`  ✗ ${nombre}: ${e.message}`);
    }
  }

  console.log(`\n${aEjecutar.length - fallos}/${aEjecutar.length} tarea(s) completadas\n`);
  process.exit(fallos ? 1 : 0);
})();
