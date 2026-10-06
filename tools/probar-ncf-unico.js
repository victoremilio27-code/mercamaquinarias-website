/**
 * probar-ncf-unico.js — un cobro, un comprobante, un NCF (#65, base #146).
 *
 *   node tools/probar-ncf-unico.js
 *
 * POR QUÉ HAY PROCESOS HIJOS
 *
 * El fallo de #65 no se ve con un solo proceso: la notificación de
 * CardNet y la conciliación del temporizador emiten a la vez, cada una
 * con su conexión, y las dos ven «este pago no tiene factura». Una
 * prueba en un solo proceso nunca abre esa ventana. Aquí dos procesos
 * hijos llaman a `facturas.emitirPorPago` sobre el mismo pago y arrancan
 * juntos gracias a un archivo barrera.
 *
 * Lo que fija esta prueba lo implementa #150 en `tools/facturas.js`. Con
 * la base sola (el índice único y `db.enTransaccionInmediata`) FALLAN a
 * propósito las comprobaciones de carrera (mismo id y NCF que avanza 1)
 * y la de «sin hueco de NCF». Por eso no está colgada de CI hasta que
 * llegue #150. Las demás pasan ya.
 *
 * Corre contra una base TEMPORAL (`.tmp/prueba-ncf-unico/`) que se borra
 * en cada ejecución. Un comprobante emitido no se toca, y menos para
 * probar.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const ES_HIJO = process.argv[2] === '--hijo';
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-ncf-unico');

/* Antes de cargar db.js: la ruta de la base se resuelve al importarlo.
   El hijo hereda el entorno del padre y NO borra el banco: lo comparte. */
if (!ES_HIJO) {
  fs.rmSync(BANCO, { recursive: true, force: true });
  fs.mkdirSync(BANCO, { recursive: true });
  process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
  process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
  process.env.MERCA_CORREO = 'archivo';
  process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
}

const db = require('./db');
const facturas = require('./facturas');

const dormir = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/* ── El proceso hijo ─────────────────────────────────────── */

if (ES_HIJO) {
  const [, , , idPago, barrera, quiereRnc] = process.argv;
  const pago = db.pagoPorId(idPago);
  const cliente = quiereRnc === 'rnc'
    ? { razonSocial: 'Constructora de Prueba, S.R.L.', rnc: '130123456' }
    : { razonSocial: 'Cliente sin RNC' };

  // «Estoy listo» y a esperar la barrera: así los dos emiten a la vez y
  // no uno detrás de otro por lo que tarde cada uno en cargar los módulos.
  fs.writeFileSync(`${barrera}.${process.pid}.listo`, '');
  const limite = Date.now() + 20000;
  while (!fs.existsSync(barrera) && Date.now() < limite) dormir(1);

  let salida;
  try {
    const f = facturas.emitirPorPago(pago, { concepto: 'Prueba de carrera', cliente });
    salida = { id: f.id, ncf: f.ncf || null, tipo: f.tipo };
  } catch (e) {
    salida = { error: e.message };
  }
  process.stdout.write(`\n${JSON.stringify(salida)}\n`);
  process.exit(0);
}

/* ── El padre ────────────────────────────────────────────── */

const ID_ORG = 'org-ncf-unico';

let fallos = 0;
function ok(condicion, texto) {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA busy_timeout = 5000');
  return d;
}

function leer(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).all(...args); } finally { d.close(); }
}

function ejecutar(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).run(...args); } finally { d.close(); }
}

let correlativo = 0;
function pagoAprobado() {
  correlativo++;
  const idPago = `pago-ncf-${correlativo}`;
  ejecutar(`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia,
              procesador, creado, confirmado, itbis_tasa)
            VALUES (?, ?, 3090, 556, 3646, 'aprobado', ?, 'cardnet', ?, ?, 0.18)`,
  idPago, ID_ORG, `NCF-${correlativo}`, new Date().toISOString(), new Date().toISOString());
  return idPago;
}

const siguiente = (tipo) => {
  const fila = leer('SELECT siguiente FROM secuencias_ncf WHERE tipo = ? AND activa = 1', tipo)[0];
  return fila ? fila.siguiente : null;
};
const comprobantesDe = (idPago) => leer(
  "SELECT * FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", idPago);
const estadoDe = (idPago) => leer('SELECT estado FROM pagos WHERE id = ?', idPago)[0].estado;

function hijo(idPago, barrera, quiereRnc) {
  return new Promise((resolver) => {
    const p = spawn(process.execPath, ['--no-warnings', __filename, '--hijo', idPago, barrera, quiereRnc],
      { env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let fuera = '';
    let errores = '';
    p.stdout.on('data', (b) => { fuera += b; });
    p.stderr.on('data', (b) => { errores += b; });
    p.on('close', (codigo) => {
      const linea = fuera.split(/\r?\n/).filter((l) => l.startsWith('{')).pop();
      let r;
      try { r = JSON.parse(linea); } catch (_) { r = { error: `sin respuesta (salida ${codigo}) ${errores.trim()}` }; }
      resolver(r);
    });
  });
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* Una ronda: dos hijos sobre el mismo pago, soltados a la vez. */
async function ronda(idPago, quiereRnc, n) {
  const barrera = path.join(BANCO, `barrera-${n}`);
  const promesas = [hijo(idPago, barrera, quiereRnc), hijo(idPago, barrera, quiereRnc)];
  const limite = Date.now() + 20000;
  const listos = () => fs.readdirSync(BANCO)
    .filter((f) => f.startsWith(`barrera-${n}.`) && f.endsWith('.listo')).length;
  while (listos() < 2 && Date.now() < limite) await esperar(5);
  fs.writeFileSync(barrera, '');
  return Promise.all(promesas);
}

const RONDAS = 20;

async function carrera(titulo, { quiereRnc, tipoSecuencia }) {
  console.log(`\n${titulo}`);
  let unaFila = 0;
  let mismoId = 0;
  let avanzaUno = 0;
  const errores = [];
  for (let i = 0; i < RONDAS; i++) {
    const idPago = pagoAprobado();
    const antes = tipoSecuencia ? siguiente(tipoSecuencia) : null;
    const [a, b] = await ronda(idPago, quiereRnc ? 'rnc' : 'sin-rnc', `${titulo.slice(0, 2)}${i}`);
    const filas = comprobantesDe(idPago);
    if (filas.length === 1) unaFila++;
    if (a.id && b.id && a.id === b.id) mismoId++;
    for (const r of [a, b]) if (r.error) errores.push(r.error);
    const despues = tipoSecuencia ? siguiente(tipoSecuencia) : null;
    if (!tipoSecuencia || despues - antes === 1) avanzaUno++;
  }
  ok(unaFila === RONDAS, `exactamente un comprobante por pago: ${unaFila}/${RONDAS}`);
  ok(mismoId === RONDAS, `los dos procesos devuelven el mismo comprobante: ${mismoId}/${RONDAS}`
    + (errores.length ? ` · error: ${errores[0]}` : ''));
  if (tipoSecuencia) {
    ok(avanzaUno === RONDAS, `${tipoSecuencia} avanza exactamente 1 por pago: ${avanzaUno}/${RONDAS}`);
  } else {
    ok(siguiente('B01') === sinTocarB01 && siguiente('B04') === sinTocarB04,
      'el recibo no consume ningún NCF');
  }
}

let sinTocarB01;
let sinTocarB04;

(async () => {
  /* Abrir la base aplica el esquema y las migraciones. */
  db.secuenciasNcf();
  const t = new Date().toISOString();
  ejecutar(`INSERT INTO organizaciones (id, tipo, nombre, creada, actualizada)
            VALUES (?, 'particular', 'Cliente NCF único', ?, ?)`, ID_ORG, t, t);
  db.cargarSecuencia({ tipo: 'B01', nombre: 'Crédito fiscal', desde: 1000, hasta: 999999, vence: '2099-12-31', usaSitio: true });
  db.cargarSecuencia({ tipo: 'B02', nombre: 'Consumo', desde: 1000, hasta: 999999, vence: '2099-12-31', usaSitio: true });
  db.cargarSecuencia({ tipo: 'B04', nombre: 'Notas de crédito', desde: 1000, hasta: 999999, vence: '2099-12-31', usaSitio: true });

  console.log('\n1. El índice existe y deja fuera la nota de crédito');
  const indice = leer("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'ux_facturas_pago_unica'")[0];
  ok(!!indice && /UNIQUE/i.test(indice.sql) && /nota_credito/.test(indice.sql),
    indice ? indice.sql.replace(/\s+/g, ' ') : 'no existe ux_facturas_pago_unica');
  ok(leer("SELECT 1 FROM migraciones WHERE id = '2026-10-factura-unica-por-pago'").length === 1,
    'la migración queda anotada');

  console.log('\n2. enTransaccionInmediata: confirma, deshace y no se anida');
  ok(typeof db.enTransaccionInmediata === 'function', 'db.enTransaccionInmediata existe');
  const pagoTx = pagoAprobado();
  const devuelto = db.enTransaccionInmediata(() => {
    db.anotarEventoPago({ pagoId: pagoTx, procesador: 'cardnet', origen: 'prueba', tipo: 'prueba-commit' });
    return 42;
  });
  ok(devuelto === 42 && leer("SELECT 1 FROM pagos_eventos WHERE pago_id = ? AND tipo = 'prueba-commit'", pagoTx).length === 1,
    'devuelve lo de la función y confirma su escritura');
  let lanzo = null;
  try {
    db.enTransaccionInmediata(() => {
      db.anotarEventoPago({ pagoId: pagoTx, procesador: 'cardnet', origen: 'prueba', tipo: 'prueba-rollback' });
      throw new Error('a propósito');
    });
  } catch (e) { lanzo = e; }
  ok(lanzo && lanzo.message === 'a propósito'
    && leer("SELECT 1 FROM pagos_eventos WHERE pago_id = ? AND tipo = 'prueba-rollback'", pagoTx).length === 0,
  'ante una excepción deshace y la relanza');
  let anidada = null;
  try { db.enTransaccionInmediata(() => db.enTransaccionInmediata(() => 1)); } catch (e) { anidada = e; }
  ok(!!anidada && /ya hay una transacción/.test(anidada.message), 'dentro de otra transacción lanza en vez de anidar');
  let despues = null;
  try { despues = db.enTransaccionInmediata(() => 'libre'); } catch (e) { despues = e.message; }
  ok(despues === 'libre', 'la conexión queda fuera de transacción después de todo lo anterior');

  await carrera('3. Carrera, camino B01 (con RNC)', { quiereRnc: true, tipoSecuencia: 'B01' });
  await carrera('4. Carrera, camino B02 (sin RNC)', { quiereRnc: false, tipoSecuencia: 'B02' });

  ejecutar("UPDATE secuencias_ncf SET activa = 0 WHERE tipo = 'B02'");
  sinTocarB01 = siguiente('B01');
  sinTocarB04 = siguiente('B04');
  await carrera('5. Carrera, recibo sin NCF (B02 inactiva)', { quiereRnc: false, tipoSecuencia: null });

  console.log('\n6. Un segundo comprobante no-B04 del mismo pago lo rechaza la base');
  const pagoDoble = pagoAprobado();
  const primera = facturas.emitirPorPago(db.pagoPorId(pagoDoble), {
    concepto: 'Prueba', cliente: { razonSocial: 'Constructora de Prueba, S.R.L.', rnc: '130123456' },
  });
  let choque = null;
  try {
    ejecutar(`INSERT INTO facturas (id, pago_id, organizacion_id, numero, tipo, concepto, subtotal, itbis, total, moneda, fecha, creada)
              VALUES ('factura-intrusa', ?, ?, 'MM-2099-000001', 'recibo', 'Intrusa', 1, 0, 1, 'DOP', ?, ?)`,
    pagoDoble, ID_ORG, t, t);
  } catch (e) { choque = e; }
  ok(!!choque && /UNIQUE/i.test(choque.message), choque ? choque.message : 'el INSERT entró');
  ok(comprobantesDe(pagoDoble).length === 1, 'sigue habiendo un solo comprobante del pago');

  console.log('\n7. La nota de crédito (B04) no choca con el índice');
  let nota = null;
  try {
    nota = facturas.emitirNotaCredito(db.facturaPorId(primera.id), { motivo: 'Prueba del índice' });
  } catch (e) { console.log(`     ${e.message}`); }
  ok(!!nota && nota.tipo === 'nota_credito' && nota.pago_id === pagoDoble && /^B04/.test(nota.ncf || ''),
    nota ? `nota ${nota.numero} ncf=${nota.ncf} sobre el mismo pago` : 'no se pudo emitir la nota');
  ok(db.facturaDePago(pagoDoble).id === primera.id, 'facturaDePago sigue devolviendo el original');

  console.log('\n8. Sin hueco de NCF si la inserción falla después de tomar el número');
  const pagoHueco = pagoAprobado();
  const b01Antes = siguiente('B01');
  const original = db.crearFactura;
  db.crearFactura = () => { throw new Error('fallo simulado al insertar'); };
  let fallo = null;
  try {
    facturas.emitirPorPago(db.pagoPorId(pagoHueco), {
      concepto: 'Prueba', cliente: { razonSocial: 'Constructora de Prueba, S.R.L.', rnc: '130123456' },
    });
  } catch (e) { fallo = e; } finally { db.crearFactura = original; }
  ok(!!fallo, 'el error de la inserción llega al que llama');
  ok(siguiente('B01') === b01Antes, `B01 no avanza: ${b01Antes} → ${siguiente('B01')}`);
  ok(comprobantesDe(pagoHueco).length === 0, 'no queda ninguna fila');

  /* Lo de hoy, que #150 no puede cambiar: sin número válido se emite el
     recibo no fiscal (con el aviso `agotada`), no se gasta ningún NCF y
     el pago sigue aprobado. (El issue #146 decía «no hay fila»; el código
     de hoy emite el recibo, y es lo que manda: la prueba fija lo que hay.) */
  console.log('\n9. Secuencia agotada o vencida: recibo, ningún NCF, el pago sigue aprobado');
  const filaB01 = leer("SELECT * FROM secuencias_ncf WHERE tipo = 'B01' AND activa = 1")[0];
  for (const [caso, cambio, deshacer] of [
    ['agotada', () => ejecutar('UPDATE secuencias_ncf SET hasta = siguiente - 1 WHERE id = ?', filaB01.id),
      () => ejecutar('UPDATE secuencias_ncf SET hasta = ? WHERE id = ?', filaB01.hasta, filaB01.id)],
    ['vencida', () => ejecutar("UPDATE secuencias_ncf SET vence = '2020-01-01' WHERE id = ?", filaB01.id),
      () => ejecutar('UPDATE secuencias_ncf SET vence = ? WHERE id = ?', filaB01.vence, filaB01.id)],
  ]) {
    cambio();
    const antes = leer('SELECT siguiente FROM secuencias_ncf WHERE id = ?', filaB01.id)[0].siguiente;
    const idPago = pagoAprobado();
    const f = facturas.emitirPorPago(db.pagoPorId(idPago), {
      concepto: 'Prueba', cliente: { razonSocial: 'Constructora de Prueba, S.R.L.', rnc: '130123456' },
    });
    const despues = leer('SELECT siguiente FROM secuencias_ncf WHERE id = ?', filaB01.id)[0].siguiente;
    ok(f.tipo === 'recibo' && !f.ncf && f.agotada === 'B01', `${caso}: recibo sin NCF con aviso (tipo=${f.tipo} ncf=${f.ncf})`);
    ok(despues === antes, `${caso}: no se consume ningún B01 (${antes} → ${despues})`);
    ok(estadoDe(idPago) === 'aprobado', `${caso}: el pago sigue aprobado`);
    deshacer();
  }

  console.log(`\n${fallos ? `${fallos} comprobación(es) fallaron` : 'Todo en orden'}`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
