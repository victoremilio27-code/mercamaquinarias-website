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
 * queda anotado en la base (los avisos de vencimiento, en `recordatorios`).
 */

require('./entorno');

const fs = require('fs');
const path = require('path');

const db = require('./db');
const correo = require('./correo');
const facturas = require('./facturas');

const RAIZ = path.resolve(__dirname, '..');

const SECO = process.argv.includes('--seco');
const RESPALDOS = process.env.MERCA_RESPALDOS || path.join(RAIZ, '.tmp', 'respaldos');
const CARPETA_FACTURAS = process.env.MERCA_FACTURAS || path.join(RAIZ, '.tmp', 'facturas');
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

/* Pasa a 'vencida' toda membresía cuyo `fin` ya pasó.
 *
 * Antes nada lo hacía (auditoría §1.9): un plan pagado una vez seguía
 * «activo» para siempre y sostenía anuncios y la página del dealer. Va
 * PRIMERA en la tanda para que `caducar` y `perfiles` vean el estado de
 * hoy: en la misma pasada los anuncios dejan de publicarse y la página se
 * apaga. Nada se borra y repetirla no cambia nada. */
function vencerMembresias() {
  if (SECO) {
    const n = db.abrir().prepare(
      "SELECT COUNT(*) AS n FROM suscripciones WHERE estado = 'activa' AND fin IS NOT NULL AND fin < ?")
      .get(db.ahora()).n;
    return anotar('suscripciones', `${n} membresía(s) pasarían a vencidas`);
  }
  const { vencidas } = db.vencerSuscripciones();
  anotar('suscripciones', `${vencidas} membresía(s) vencidas`);
}

/* Avisos de 7 días, 3 días y 24 horas antes del corte, una sola vez por
 * anuncio y ciclo de `vence` (sustituyen al aviso único de 5 días, D-08).
 *
 * Reservar ANTES de enviar es lo que impide dos correos si dos pasadas
 * coinciden: la reserva es síncrona y el UNIQUE de `recordatorios` hace el
 * resto, así que la segunda pasada ya no ve el aviso como pendiente. Un
 * correo que falla queda 'fallido' y se reintenta en la pasada siguiente.
 * No hay preferencia de «no quiero avisos» en la base y no se inventa
 * (D-10). */
async function avisarRecordatorios() {
  /* Con CardNet activo, la suscripción que se va a renovar sola no recibe
     los avisos 7/3/1: dirían «vence» de algo que no vencerá. Los sustituye
     el aviso de renovación y, si el cobro falla, el correo de rechazo
     (R-06). Apagado, la opción es false y todo sale exactamente como antes. */
  const pendientes = db.recordatoriosPendientes(undefined, { omitirAutomaticas: require('./cardnet').activo() });
  if (!pendientes.length) return anotar('por-vencer', 'sin anuncios próximos a vencer');

  let enviados = 0;
  const porTipo = { '7d': 0, '3d': 0, '1d': 0 };
  for (const a of pendientes) {
    if (SECO) { enviados++; porTipo[a.tipo]++; continue; }

    const idRec = db.reservarRecordatorio({ idAnuncio: a.id, tipo: a.tipo, vence: a.vence });
    if (!idRec) continue;

    let entregado = false;
    try {
      const r = await correo.enviarRecordatorioVencimiento({
        para: a.correo,
        nombre: a.nombre,
        equipo: `${a.anio} ${a.marca_nombre || a.marca} ${a.modelo}`,
        idAnuncio: a.id,
        vence: a.vence,
        tipo: a.tipo,
        plan: a.plan_nombre,
      });
      entregado = !!(r && r.entregado);
    } catch (e) {
      // Un fallo del proveedor no detiene a los demás avisos.
      console.error(`  ✗ aviso de ${a.id}: ${e.message}`);
    }
    db.anotarRecordatorio(idRec, entregado ? 'enviado' : 'fallido');
    if (entregado) { enviados++; porTipo[a.tipo]++; }
  }
  anotar('por-vencer', `${enviados} de ${pendientes.length} aviso(s) de vencimiento `
    + `(7d: ${porTipo['7d']}, 3d: ${porTipo['3d']}, 1d: ${porTipo['1d']})`);
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

function copiarFacturas(origen, destino) {
  let total = 0;
  let copiadas = 0;

  const recorrer = (carpeta, relativa = '') => {
    if (!fs.existsSync(carpeta)) return;
    for (const entrada of fs.readdirSync(carpeta, { withFileTypes: true })) {
      const rutaOrigen = path.join(carpeta, entrada.name);
      const rutaRelativa = path.join(relativa, entrada.name);
      if (entrada.isDirectory()) {
        recorrer(rutaOrigen, rutaRelativa);
        continue;
      }
      if (!entrada.isFile() || path.extname(entrada.name).toLowerCase() !== '.pdf') continue;

      total++;
      const rutaDestino = path.join(destino, rutaRelativa);
      const tamano = fs.statSync(rutaOrigen).size;
      const yaCopiada = fs.existsSync(rutaDestino)
        && fs.statSync(rutaDestino).isFile()
        && fs.statSync(rutaDestino).size === tamano;
      if (yaCopiada) continue;

      copiadas++;
      if (!SECO) {
        fs.mkdirSync(path.dirname(rutaDestino), { recursive: true });
        fs.copyFileSync(rutaOrigen, rutaDestino);
      }
    }
  };

  recorrer(origen);
  return { copiadas, total };
}

/* Respaldo de la base y de los PDF de comprobantes.
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
  const destinoFacturas = path.join(RESPALDOS, 'facturas');

  if (SECO) {
    const { copiadas, total } = copiarFacturas(CARPETA_FACTURAS, destinoFacturas);
    return anotar('respaldo', `escribiría ${destino} · copiaría ${copiadas} de ${total} PDF`);
  }

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

  const { copiadas, total } = copiarFacturas(CARPETA_FACTURAS, destinoFacturas);
  const kb = Math.round(fs.statSync(destino).size / 1024);
  anotar('respaldo', `${path.basename(destino)} · ${kb} KB · ${n} anuncios · íntegro`
    + ` · ${copiadas} de ${total} PDF copiado(s)`);

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

  /* Un cobro aprobado en la pasarela sin fila aprobada nuestra, o cobrado
     y sin poder aplicar, tiene que ser ruidoso: es dinero de un cliente.
     Este informe ya lo leen gerencia y facturación (nunca un contador:
     sale solo por `mandarInforme`). Con CardNet apagado y sin nada que
     contar, la sección no existe y el informe sale como siempre. */
  const p = i.pasarela || {};
  const recuperados = p.recuperados || [];
  const sinAplicar = p.sinAplicar || [];
  const atascados = p.atascados || 0;
  if (require('./cardnet').activo() || recuperados.length || sinAplicar.length || atascados) {
    l.push(titulo('Pasarela de pago'));
    l.push(fila('Pagos recuperados por la conciliación', recuperados.length));
    recuperados.forEach((r) => l.push(`    ${r.referencia} · ${pesos(r.total)}`));
    l.push(fila('Pagos con tarjeta atascados', atascados));
    l.push(fila('Cobrados sin aplicar (devolver)', sinAplicar.length));
    sinAplicar.forEach((r) => l.push(`    ${r.referencia} · ${pesos(r.total)}`));
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

/* Borradores del particular que nadie paga (D-08 de la fase 05.2).
 *
 * El borrador vive en el servidor desde que se elige plan. Quien se rinde
 * lo deja ahí con sus fotos y videos, y a los 10 abiertos queda bloqueado
 * por BORRADORES_ABIERTOS sin haber publicado nada. A los 30 días sin
 * tocarlo y SIN pago se borra; con un pago pendiente o aprobado, nunca
 * (`db.borradoresAbandonados` lo garantiza en la propia consulta).
 *
 * Como `eliminarAnuncio` de la API: la fila primero, los archivos después.
 * Si se hiciera al revés y la transacción fallara, quedaría un borrador
 * apuntando a fotos que ya no están. Un archivo que no se pueda borrar no
 * detiene la tarea: lo recoge `huerfanos`, que por eso va justo después.
 * Idempotente: lo borrado ya no aparece en la pasada siguiente. */
const DIAS_BORRADOR_ABANDONADO = 30;

function limpiarBorradores() {
  const lista = db.borradoresAbandonados(DIAS_BORRADOR_ABANDONADO);
  if (!lista.length) return anotar('borradores', 'sin borradores abandonados que limpiar');
  if (SECO) return anotar('borradores', `borraría ${lista.length} borrador(es) abandonado(s)`);

  const fotos = require('./fotos');
  const videos = require('./videos');
  let borrados = 0;
  for (const b of lista) {
    try {
      const rutas = db.borrarAnuncio(b.id, b.organizacion_id);
      if (!rutas) continue;
      borrados++;
      rutas.fotos.forEach((r) => { try { fotos.borrar(r); } catch (_) { /* ya no estaba */ } });
      rutas.videos.forEach((r) => { try { videos.borrar(r); } catch (_) { /* ya no estaba */ } });
    } catch (e) {
      // Uno que falla no impide limpiar los demás.
      console.error(`  ✗ no se pudo borrar el borrador ${b.id}: ${e.message}`);
    }
  }
  anotar('borradores', `${borrados} borrador(es) abandonado(s) borrado(s)`);
}

/* La conciliación de pagos con tarjeta: el proceso de `mercamaquinarias-pagos`
   la corre cada 10 minutos y la tanda diaria la repite por si el
   temporizador no estuviera instalado. Es idempotente y barata. Con CardNet
   apagado no llama a nada. */
async function reconciliarPagos() {
  const cardnet = require('./cardnet');
  if (!cardnet.activo()) return anotar('reconciliar', 'CardNet apagado: nada que conciliar');
  const pagos = require('./pagos');
  if (SECO) {
    const n = db.pagosCardnetPorReconciliar({ minutos: 10 }).length;
    return anotar('reconciliar', `revisaría ${n} pago(s) con tarjeta pendientes`);
  }
  const r = await pagos.reconciliar();
  anotar('reconciliar', `${r.revisados} pago(s) revisados · ${r.recuperados.length} recuperados · ${r.rechazados} rechazados · ${r.fallidos} fallidos`);
}

/* La renovación automática con tarjeta (06-08), en este orden: primero
 * los avisos de 7 días (una vez por ciclo), luego los cobros de hoy y un
 * correo por cada rechazo. Va antes de los avisos de vencimiento: el
 * cobro de hoy se intenta antes de avisar de nada.
 *
 * El aviso solo se anota si el correo se entregó: uno que falla se
 * reintenta en la pasada siguiente, y uno entregado no se repite aunque
 * la tarea corra dos veces. Con CardNet apagado no hace nada. Todos los
 * correos van al propietario de la cuenta y a nadie más. */
async function renovarSuscripciones() {
  const cardnet = require('./cardnet');
  if (!cardnet.activo()) return anotar('renovar', 'CardNet apagado: no se renueva nada');
  const pagos = require('./pagos');

  const porAvisar = db.suscripcionesPorAvisar();
  if (SECO) {
    return anotar('renovar', `avisaría ${porAvisar.length} renovación(es) próximas y cobraría ${db.suscripcionesPorRenovar().length}`);
  }

  let avisos = 0;
  for (const s of porAvisar) {
    if (!s.correo) continue;
    try {
      // El mismo anuncio que nombrará el cobro (ver pagos.renovarAutomaticas).
      const idAnuncio = s.anuncios_incluidos === 1 ? db.anuncioUnicoDeSuscripcion(s.id) : null;
      const { cobro, intencion } = pagos.cobroDeRenovacion(s, { idAnuncio });
      const r = await correo.enviarRenovacionProxima({
        para: s.correo, nombre: s.nombre, concepto: intencion.concepto, total: cobro.total,
        // Si no se podrá renovar sola, lo que importa es cuándo vence.
        fecha: s.usable ? s.primerIntento : s.fin,
        marca: s.marca, ultimos4: s.ultimos4, noSeRenovara: !s.usable,
        idAnuncio,
      });
      if (r && r.entregado) { db.anotarAvisoRenovacion(s.id, s.fin); avisos++; }
    } catch (e) {
      console.error(`  ✗ aviso de renovación de ${s.id}: ${e.message}`);
    }
  }

  const r = await pagos.renovarAutomaticas();
  let correos = 0;
  for (const x of r.rechazadas) {
    if (!x.correo) continue;
    try {
      const enviado = await correo.enviarRenovacionRechazada({
        para: x.correo, nombre: x.nombre, concepto: x.concepto, motivo: x.motivo,
        intento: x.intento, quedan: x.quedan, fin: x.fin, idAnuncio: x.idAnuncio,
      });
      if (enviado && enviado.entregado) correos++;
    } catch (e) {
      console.error(`  ✗ correo de rechazo de ${x.idSusc}: ${e.message}`);
    }
  }
  anotar('renovar', `${avisos} aviso(s) de 7 días · ${r.cobradas.length} cobrada(s) · ${r.gratuitas.length} sin costo · `
    + `${r.rechazadas.length} rechazada(s) (${correos} correo(s)) · ${r.pendientes.length} pendiente(s) · ${r.omitidas.length} omitida(s)`);
}

/* Un aviso por tarjeta que vence este mes o ya venció y sostiene alguna
   renovación automática; `aviso_vencimiento` guarda el mes avisado y
   repetir la tarea no reenvía. Apagado, no hace nada. */
async function avisarTarjetas() {
  const cardnet = require('./cardnet');
  if (!cardnet.activo()) return anotar('avisar-tarjetas', 'CardNet apagado: nada que avisar');
  const lista = db.tarjetasPorVencer();
  if (SECO) return anotar('avisar-tarjetas', `avisaría de ${lista.length} tarjeta(s) por vencer`);
  let enviados = 0;
  for (const m of lista) {
    if (!m.correo) continue;
    try {
      const r = await correo.enviarTarjetaPorVencer({
        para: m.correo, nombre: m.nombre, marca: m.marca, ultimos4: m.ultimos4, venceMes: m.vence_mes, venceAnio: m.vence_anio,
      });
      if (r && r.entregado) { db.anotarAvisoVencimiento(m.id, m.mes); enviados++; }
    } catch (e) {
      console.error(`  ✗ aviso de tarjeta ${m.id}: ${e.message}`);
    }
  }
  anotar('avisar-tarjetas', `${enviados} de ${lista.length} aviso(s) de tarjeta por vencer`);
}

const TAREAS = {
  suscripciones: vencerMembresias,
  caducar,
  perfiles: apagarPerfiles,
  'informe-semanal': informeSemanal,
  'informe-mensual': informeMensual,
  renovar: renovarSuscripciones,
  'avisar-tarjetas': avisarTarjetas,
  'por-vencer': avisarRecordatorios,
  vencidos: avisarVencidos,
  comprobantes: reenviarComprobantes,
  ncf: avisarNcf,
  limpiar,
  borradores: limpiarBorradores,
  huerfanos: recogerHuerfanos,
  respaldo: respaldar,
  optimizar,
  reconciliar: reconciliarPagos,
};

async function principal() {
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
}

/* Se ejecuta solo si es el punto de entrada: el arnés de pruebas hace
   `require('./tareas')` para llamar a las tareas y no debe arrancar la
   tanda ni terminar el proceso. */
if (require.main === module) principal();

module.exports = { TAREAS, vencerMembresias, avisarRecordatorios, componerInforme };
