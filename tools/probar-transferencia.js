/**
 * probar-transferencia.js — el cobro por transferencia bancaria.
 *
 *   node tools/probar-transferencia.js
 *
 * POR QUÉ EXISTE
 *
 * Es la contingencia del lanzamiento: si la afiliación de CardNet no
 * llega a tiempo, la transferencia es el ÚNICO camino por el que la
 * empresa cobra el 14 de octubre. Y es un camino donde una persona
 * aprueba a mano, así que un error aquí se paga caro: regala cupos por
 * dinero que no entró, o emite un NCF de un cobro que no ocurrió, y un
 * comprobante fiscal no se borra: solo se corrige con una nota de
 * crédito B04.
 *
 * Se comprueba que la transferencia está apagada salvo con los cinco
 * datos bancarios completos y válidos, que nunca aprueba por sí sola,
 * que al encenderla el procesador `demo` (que aprueba siempre) deja de
 * estar al alcance de un comprador, y que confirmarla desde la consola
 * deja cupos y bitácora juntos o nada.
 *
 * Como probar-pagos.js, corre contra una base DESECHABLE en
 * `.tmp/prueba-transferencia/`, con el correo en modo archivo y sin
 * red. Los datos bancarios de esta prueba son falsos a la vista
 * («BANCO DE PRUEBA», cuenta «000-000000-0»): nunca se parecen a una
 * cuenta real y nunca salen de aquí.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* Las variables de entorno ANTES de cargar db.js: la ruta de la base
   se resuelve al importarlo. Hecho después, la prueba escribiría en la
   base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-transferencia');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

/* Un .env local o el entorno de quien corre la prueba no puede decidir
   el resultado: se borra todo lo que venga de fuera. */
const VARIABLES = [
  'MERCA_TRANSFERENCIA_BANCO', 'MERCA_TRANSFERENCIA_TITULAR', 'MERCA_TRANSFERENCIA_RNC',
  'MERCA_TRANSFERENCIA_TIPO', 'MERCA_TRANSFERENCIA_CUENTA',
];
for (const k of Object.keys(process.env)) {
  if (k.startsWith('MERCA_TRANSFERENCIA')) delete process.env[k];
}

const db = require('./db');
const pagos = require('./pagos');
const transferencia = require('./transferencia');

let fallos = 0;
let comprobaciones = 0;
function ok(condicion, texto) {
  comprobaciones++;
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function lanza(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}

function consulta(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).get(...args); } finally { d.close(); }
}

function ejecuta(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).run(...args); } finally { d.close(); }
}

const siguienteB02 = () => {
  const s = consulta("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B02' AND activa = 1");
  return s ? s.siguiente : null;
};
const facturasDelPago = (idPago) =>
  consulta("SELECT COUNT(*) AS n FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", idPago).n;
const membresiasDe = (idOrg) =>
  consulta('SELECT COUNT(*) AS n FROM suscripciones WHERE organizacion_id = ?', idOrg).n;
const filasBitacora = (accion) =>
  consulta('SELECT COUNT(*) AS n FROM bitacora_admin WHERE accion = ?', accion).n;

/* Datos falsos a la vista. Con espacios alrededor para comprobar que
   se recortan. */
const PRUEBA = {
  MERCA_TRANSFERENCIA_BANCO: '  BANCO DE PRUEBA ',
  MERCA_TRANSFERENCIA_TITULAR: ' TITULAR DE PRUEBA, S.R.L. ',
  MERCA_TRANSFERENCIA_RNC: ' 000000000 ',
  MERCA_TRANSFERENCIA_TIPO: ' corriente ',
  MERCA_TRANSFERENCIA_CUENTA: ' 000-000000-0 ',
};
function encender(cambios = {}) {
  delete process.env.MERCA_TRANSFERENCIA;
  Object.assign(process.env, PRUEBA);
  for (const [k, v] of Object.entries(cambios)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}
function apagar() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('MERCA_TRANSFERENCIA')) delete process.env[k];
  }
}

const SELLO = Date.now().toString(36);
let contadorRef = 0;
const referencia = (etiqueta) => `PRUEBA-TR-${etiqueta}-${SELLO}-${++contadorRef}`;

const CLIENTE = { razonSocial: 'Cliente de prueba', correo: 'cliente@prueba.invalid' };
const ID_ORG = 'org-transferencia';
const ID_ORG_OTRA = 'org-transferencia-otra';

function prepararOrganizacion(idOrg, nombre) {
  const t = new Date().toISOString();
  ejecuta(`INSERT OR IGNORE INTO organizaciones (id, tipo, nombre, creada, actualizada)
           VALUES (?, 'particular', ?, ?, ?)`, idOrg, nombre, t, t);
}

const cobroDe = (subtotal, etiqueta, procesador = 'transferencia') => {
  const itbis = Math.round(subtotal * 0.18);
  return { subtotal, itbis, total: subtotal + itbis, referencia: referencia(etiqueta), procesador };
};

const intencionCompra = (cupo = 1, dias = 30) => ({
  tipo: 'compra', idPlan: 'destacado', cupo, dias,
  concepto: `Destacado · ${cupo} cupo(s) · ${dias} días`,
  cliente: CLIENTE, correoCliente: CLIENTE.correo,
});

const pendiente = (etiqueta, { idOrg = ID_ORG, procesador = 'transferencia', cupo = 1 } = {}) =>
  db.registrarCobro({ idOrg, cobro: cobroDe(3500 * cupo, etiqueta, procesador), intencion: intencionCompra(cupo, 30) });

/* Abrir la base aplica el esquema y las migraciones. */
db.secuenciasNcf();
prepararOrganizacion(ID_ORG, 'Cliente de transferencia');
prepararOrganizacion(ID_ORG_OTRA, 'Otra empresa');
db.cargarSecuencia({
  tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 50,
  vence: '2027-12-31', usaSitio: true,
});

(async () => {
  /* ── 05-01, tarea 1: configuración, selector y procesador ─── */

  console.log('\n1. Sin ninguna variable la transferencia está apagada');
  apagar();
  ok(transferencia.datosTransferencia() === null, 'datosTransferencia() es null');
  ok(transferencia.transferenciaActiva() === false, 'transferenciaActiva() es false');
  {
    const f = transferencia.faltantes();
    ok(VARIABLES.every((v) => f.includes(v)) && f.length === 5, `faltantes() nombra las cinco: ${f.join(', ')}`);
  }

  console.log('\n2. Con las cinco válidas devuelve los datos recortados, en DOP');
  encender();
  {
    const d = transferencia.datosTransferencia();
    ok(!!d && d.banco === 'BANCO DE PRUEBA' && d.titular === 'TITULAR DE PRUEBA, S.R.L.'
      && d.rnc === '000000000' && d.tipoCuenta === 'corriente' && d.cuenta === '000-000000-0'
      && d.moneda === 'DOP', `datos=${JSON.stringify(d)}`);
    ok(transferencia.transferenciaActiva() === true, 'transferenciaActiva() es true');
    ok(transferencia.faltantes().length === 0, `faltantes()=${JSON.stringify(transferencia.faltantes())}`);
  }
  encender({ MERCA_TRANSFERENCIA_RNC: '000-0000000-0', MERCA_TRANSFERENCIA_TIPO: 'Ahorros' });
  ok(transferencia.transferenciaActiva() === true, 'una cédula de 11 dígitos con guiones y «Ahorros» también valen');
  ok((transferencia.datosTransferencia() || {}).tipoCuenta === 'ahorros', 'el tipo se normaliza a minúsculas');

  console.log('\n3. Una sola variable que falte o no valide la apaga');
  {
    const casos = [
      ['sin cuenta', { MERCA_TRANSFERENCIA_CUENTA: undefined }],
      ['banco en blanco', { MERCA_TRANSFERENCIA_BANCO: '   ' }],
      ['RNC de 8 dígitos', { MERCA_TRANSFERENCIA_RNC: '00000000' }],
      ['RNC con letras', { MERCA_TRANSFERENCIA_RNC: '00000000A' }],
      ['tipo «plazo»', { MERCA_TRANSFERENCIA_TIPO: 'plazo' }],
      ['cuenta de 5 caracteres', { MERCA_TRANSFERENCIA_CUENTA: '00000' }],
      ['cuenta con letras', { MERCA_TRANSFERENCIA_CUENTA: '000-ABC-000' }],
      ['MERCA_TRANSFERENCIA=0', { MERCA_TRANSFERENCIA: '0' }],
    ];
    for (const [nombre, cambios] of casos) {
      encender(cambios);
      ok(transferencia.datosTransferencia() === null && transferencia.transferenciaActiva() === false,
        `${nombre}: apagada`);
    }
    encender({ MERCA_TRANSFERENCIA_RNC: '00000000' });
    const f = transferencia.faltantes();
    ok(f.length === 1 && f[0] === 'MERCA_TRANSFERENCIA_RNC', `faltantes() nombra solo el RNC: ${f.join(', ')}`);
    ok(!f.some((x) => x.includes('00000000')), 'faltantes() no devuelve valores, solo nombres');
  }

  console.log('\n4. Los métodos de cobro los decide el servidor, en cada llamada');
  apagar();
  ok(JSON.stringify(pagos.metodosDeCobro()) === '["demo"]', `apagada: ${JSON.stringify(pagos.metodosDeCobro())}`);
  encender();
  ok(JSON.stringify(pagos.metodosDeCobro()) === '["transferencia"]', `encendida: ${JSON.stringify(pagos.metodosDeCobro())}`);
  apagar();
  ok(JSON.stringify(pagos.metodosDeCobro()) === '["demo"]', 'apagada otra vez en la misma ejecución: vuelve a demo');

  console.log('\n5. procesadorDeCobro: el pedido se valida contra la lista del servidor');
  apagar();
  ok(pagos.procesadorDeCobro() === 'demo', `apagada, sin pedido: ${pagos.procesadorDeCobro()}`);
  ok(pagos.procesadorDeCobro('') === 'demo', 'apagada, pedido vacío: demo');
  {
    const e = lanza(() => pagos.procesadorDeCobro('transferencia'));
    ok(!!e && e.codigo === 400 && e.message === 'Ese método de pago no está disponible.',
      `apagada, pide transferencia: ${e ? `${e.codigo} ${e.message}` : 'no lanzó'}`);
  }
  encender();
  ok(pagos.procesadorDeCobro() === 'transferencia', `encendida, sin pedido: ${pagos.procesadorDeCobro()}`);
  ok(pagos.procesadorDeCobro('transferencia') === 'transferencia', 'encendida, pide transferencia: transferencia');
  {
    const e = lanza(() => pagos.procesadorDeCobro('demo'));
    ok(!!e && e.codigo === 400, `encendida, pide demo: ${e ? `${e.codigo} ${e.message}` : 'NO lanzó: demo al alcance del comprador'}`);
    const e2 = lanza(() => pagos.procesadorDeCobro('cardnet'));
    ok(!!e2 && e2.codigo === 400, 'encendida, pide un procesador que no existe: 400');
    const e3 = lanza(() => pagos.procesadorDeCobro('constructor'));
    ok(!!e3 && e3.codigo === 400, 'un nombre heredado de Object («constructor») tampoco cuela');
  }

  console.log('\n6. Cobrar por transferencia deja el pago pendiente: sin membresía, sin factura, sin NCF');
  {
    ok(typeof pagos.PROCESADORES.transferencia === 'function', 'PROCESADORES tiene la entrada transferencia');
    const antesB02 = siguienteB02();
    const antesMemb = membresiasDe(ID_ORG);
    const p = pendiente('COBRA');
    let r = null;
    try { r = await pagos.cobrar(p); } catch (e) { ok(false, `cobrar lanzó: ${e.message}`); }
    ok(!!r && r.estado === 'pendiente', `estado=${r && r.estado}`);
    ok(!!r && r.membresia === null && r.comprobante === null, 'sin membresía ni comprobante en la respuesta');
    ok(db.pagoPorId(p.id).estado === 'pendiente', `en la base: ${db.pagoPorId(p.id).estado}`);
    ok(membresiasDe(ID_ORG) === antesMemb, `membresías: ${membresiasDe(ID_ORG)} (se esperaban ${antesMemb})`);
    ok(facturasDelPago(p.id) === 0, `facturas del pago: ${facturasDelPago(p.id)}`);
    ok(siguienteB02() === antesB02, `B02 avanzó ${siguienteB02() - antesB02} (se esperaba 0)`);
  }

  apagar();
  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
