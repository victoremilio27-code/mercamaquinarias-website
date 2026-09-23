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

const SECO = process.argv.includes('--seco');
const DIAS_AVISO = Number(process.env.MERCA_DIAS_AVISO) || 5;
const RESPALDOS = process.env.MERCA_RESPALDOS || path.resolve(__dirname, '..', '.tmp', 'respaldos');
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

  const detalle = bajas.map((s) => `${s.tipo}: quedan ${s.quedan} de ${s.hasta - s.desde + 1}`).join(' · ');
  if (SECO) return anotar('ncf', `avisaría: ${detalle}`);

  /* El asunto cambia cuando queda uno: ese correo ya no es un recordatorio,
     es que el próximo cobro sale sin comprobante fiscal. */
  const critico = bajas.some((s) => s.critica);

  await correo.avisarInternamente({
    buzon: 'facturacion',
    asunto: `${critico ? 'URGENTE: se agota la secuencia' : 'Se están acabando los comprobantes fiscales'}`
      + ` · ${bajas.map((s) => s.tipo).join(', ')}`,
    texto: [
      'Quedan pocos comprobantes autorizados en estas secuencias:',
      '',
      ...bajas.map((s) => `  ${s.tipo} (${s.nombre}): ${s.quedan} de ${s.hasta - s.desde + 1}`),
      '',
      'Sin NCF disponible no se puede emitir una factura fiscal: quien pida',
      'comprobante con RNC recibirá un recibo no fiscal.',
      '',
      'Solicite un rango nuevo a la DGII a través del contador antes de que se agote.',
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

const TAREAS = {
  caducar,
  'por-vencer': avisarPorVencer,
  vencidos: avisarVencidos,
  comprobantes: reenviarComprobantes,
  ncf: avisarNcf,
  limpiar,
  respaldo: respaldar,
  optimizar,
};

(async () => {
  const pedidas = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const aEjecutar = pedidas.length ? pedidas : Object.keys(TAREAS);

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
