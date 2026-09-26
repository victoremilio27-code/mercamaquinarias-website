/**
 * probar-pagos.js — un pago no se da por cobrado hasta que se confirma.
 *
 *   node tools/probar-pagos.js
 *
 * POR QUÉ EXISTE
 *
 * Hasta la fase 3, `anotarPago` escribía 'aprobado' a mano en el SQL y
 * la compra otorgaba los cupos en la misma transacción. Con un
 * procesador de verdad eso significa que una tarjeta rechazada deja
 * cupos regalados y, peor, un NCF consumido por dinero que nunca
 * entró: un comprobante fiscal no se borra, solo se corrige con una
 * nota de crédito B04 por un error que no tenía por qué ocurrir.
 *
 * Aquí se comprueba la transición entera —pendiente, aprobado,
 * rechazado— y que repetirla no duplica nada. Como en
 * probar-facturas.js, corre contra una base DESECHABLE en
 * `.tmp/prueba-pagos/` que se borra y se recrea en cada pasada. Nunca
 * toca la red ni la base real: una prueba de pagos contra la base de
 * desarrollo es de lo peor que puede pasar.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* Las variables de entorno ANTES de cargar db.js: la ruta de la base
   se resuelve al importarlo. Hecho después, la prueba escribiría en la
   base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-pagos');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db');
const facturas = require('./facturas');
const pagos = require('./pagos');
const api = require('./api');
const precios = require('../assets/precios.js');
const { EventEmitter } = require('events');

const ID_ORG = 'org-pagos';
const ID_ORG_AMPLIA = 'org-pagos-amplia';

/* La bandeja de correos se comparte entre pasadas y entre pruebas; el
   sello hace únicas las referencias de esta ejecución para no contar
   correos de una pasada anterior. */
const SELLO = Date.now().toString(36);

let fallos = 0;
let comprobaciones = 0;
function ok(condicion, texto) {
  comprobaciones++;
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

/* Una llamada que debería lanzar y no lanza es un fallo; una que lanza
   cuando no debía, también, pero se ve con su mensaje. */
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

const suscripcionesDe = (idOrg) =>
  consulta('SELECT COUNT(*) AS n FROM suscripciones WHERE organizacion_id = ?', idOrg).n;
const facturasTotales = () => consulta('SELECT COUNT(*) AS n FROM facturas').n;
const cobrosEntre = (desde, hasta) => db.informe({ desde, hasta }).dinero.cobros.n;

function prepararOrganizacion(idOrg, nombre) {
  const t = new Date().toISOString();
  ejecuta(`INSERT OR IGNORE INTO organizaciones (id, tipo, nombre, creada, actualizada)
           VALUES (?, 'particular', ?, ?, ?)`, idOrg, nombre, t, t);
}

let contadorRef = 0;
const referencia = (etiqueta) => `PRUEBA-${etiqueta}-${SELLO}-${++contadorRef}`;

/* El cobro sale de la fórmula única (`precios.desglose`), igual que en
   las rutas: `registrarCobro` rechaza un cobro armado a mano que no
   cuadre, así que la prueba no puede inventarse el subtotal. El número
   que se pasa es la BASE, antes del ajuste. */
const cobroDe = (base, etiqueta) =>
  ({ ...precios.desglose(base), referencia: referencia(etiqueta), procesador: 'demo' });

const CLIENTE = { razonSocial: 'Cliente de prueba', correo: 'cliente@prueba.invalid' };

const intencionCompra = (cupo = 2, dias = 30) => ({
  tipo: 'compra', idPlan: 'destacado', cupo, dias,
  concepto: `Destacado · ${cupo} cupo(s) · ${dias} días`,
  cliente: CLIENTE, correoCliente: CLIENTE.correo,
});

const diaDe = (iso) => iso.slice(0, 10);
const HOY = diaDe(new Date().toISOString());

/* Abrir la base aplica el esquema y las migraciones. */
db.secuenciasNcf();
prepararOrganizacion(ID_ORG, 'Cliente de pagos');
prepararOrganizacion(ID_ORG_AMPLIA, 'Cliente que amplía');

/* ── 03-01: la transición en la base ─────────────────────── */

console.log('\n1. La migración deja las columnas y queda anotada');
{
  const d = conexion();
  const columnas = d.prepare('PRAGMA table_info(pagos)').all().map((c) => c.name);
  const migrada = d.prepare("SELECT 1 AS si FROM migraciones WHERE id = '2026-09-pagos-pendientes'").get();
  d.close();
  for (const c of ['intencion', 'confirmado', 'actualizado']) {
    ok(columnas.includes(c), `pagos.${c} ${columnas.includes(c) ? 'existe' : 'NO existe'}`);
  }
  ok(!!migrada, `migración 2026-09-pagos-pendientes ${migrada ? 'anotada' : 'NO anotada'}`);
}

console.log('\n2. Un cobro con importe nace pendiente: sin membresía, sin cupos, sin comprobante');
let pagoCompra = null;
{
  const antesFacturas = facturasTotales();
  const e = lanza(() => {
    pagoCompra = db.registrarCobro({ idOrg: ID_ORG, cobro: cobroDe(7000, 'COMPRA'), intencion: intencionCompra(2, 30) });
  });
  ok(!e && !!pagoCompra, e ? `registrarCobro lanzó: ${e.message}` : 'registrarCobro devolvió la fila');
  if (pagoCompra) {
    ok(pagoCompra.estado === 'pendiente', `estado=${pagoCompra.estado} (se esperaba pendiente)`);
    ok(pagoCompra.suscripcion_id === null, `suscripcion_id=${pagoCompra.suscripcion_id} (se esperaba NULL)`);
    ok(pagoCompra.confirmado === null, `confirmado=${pagoCompra.confirmado} (se esperaba NULL)`);
    let intencion = null;
    try { intencion = JSON.parse(pagoCompra.intencion); } catch (_) { /* se informa abajo */ }
    ok(!!intencion && intencion.tipo === 'compra' && intencion.cupo === 2 && intencion.idPlan === 'destacado',
      `intencion=${pagoCompra.intencion}`);
  }
  ok(suscripcionesDe(ID_ORG) === 0, `membresías de la organización: ${suscripcionesDe(ID_ORG)} (se esperaba 0)`);
  ok(facturasTotales() === antesFacturas, `facturas: ${facturasTotales()} (se esperaban ${antesFacturas})`);
}

console.log('\n3. Aprobar otorga la membresía y marca el pago en un solo paso');
{
  let r = null;
  const e = pagoCompra ? lanza(() => { r = db.aprobarPago(pagoCompra.id); }) : new Error('no hay pago');
  ok(!e && !!r, e ? `aprobarPago lanzó: ${e.message}` : 'aprobarPago devolvió resultado');
  if (r) {
    ok(r.yaEstaba === false, `yaEstaba=${r.yaEstaba} (se esperaba false)`);
    ok(r.pago.estado === 'aprobado' && !!r.pago.confirmado,
      `estado=${r.pago.estado} confirmado=${r.pago.confirmado}`);
    ok(!!r.membresia && !!r.membresia.id && !!r.membresia.inicio && !!r.membresia.fin,
      `membresia=${r.membresia ? `${r.membresia.id} ${r.membresia.inicio} → ${r.membresia.fin}` : 'null'}`);
    const s = r.membresia ? consulta('SELECT * FROM suscripciones WHERE id = ?', r.membresia.id) : null;
    ok(!!s && s.estado === 'activa' && s.anuncios_incluidos === 2 && s.dias_ciclo === 30 && s.precio_pactado === 7000,
      s ? `activa=${s.estado} cupo=${s.anuncios_incluidos} días=${s.dias_ciclo} pactado=${s.precio_pactado}` : 'sin suscripción');
    ok(!!s && r.pago.suscripcion_id === s.id, `pago enlazado a ${r.pago.suscripcion_id}`);
  }
  ok(suscripcionesDe(ID_ORG) === 1, `membresías de la organización: ${suscripcionesDe(ID_ORG)} (se esperaba 1)`);
}

console.log('\n4. Aprobar otra vez no crea otra membresía');
{
  let r = null;
  const e = pagoCompra ? lanza(() => { r = db.aprobarPago(pagoCompra.id); }) : new Error('no hay pago');
  ok(!e && !!r && r.yaEstaba === true, e ? `lanzó: ${e.message}` : `yaEstaba=${r && r.yaEstaba} (se esperaba true)`);
  ok(suscripcionesDe(ID_ORG) === 1, `membresías de la organización: ${suscripcionesDe(ID_ORG)} (se esperaba 1)`);
}

console.log('\n5. Ampliar suma lo pagado al confirmarse, y solo una vez');
{
  let base = null;
  const e0 = lanza(() => {
    base = db.comprarCupos({
      idOrg: ID_ORG_AMPLIA, idPlan: 'destacado', cupo: 1, dias: 30,
      cobro: { subtotal: 0, itbis: 0, total: 0, referencia: `PRUEBA-BASE-${SELLO}` },
    });
  });
  ok(!e0 && !!base && base.anuncios_incluidos === 1,
    e0 ? `la membresía de cero lanzó: ${e0.message}` : `membresía de partida con ${base && base.anuncios_incluidos} cupo`);

  const cupo = () => (base ? consulta('SELECT anuncios_incluidos AS n FROM suscripciones WHERE id = ?', base.id).n : null);
  let pago = null;
  const e1 = base ? lanza(() => {
    pago = db.registrarCobro({
      idOrg: ID_ORG_AMPLIA, idSusc: base.id, cobro: cobroDe(3000, 'AMPLIA'),
      intencion: {
        tipo: 'ampliacion', idSusc: base.id, cupoAnterior: 1, cupoNuevo: 3, anadidos: 2,
        concepto: 'Ampliación de Destacado · 2 cupo(s) más · hasta 3', cliente: CLIENTE, correoCliente: CLIENTE.correo,
      },
    });
  }) : new Error('no hay membresía');
  ok(!e1 && !!pago && pago.estado === 'pendiente', e1 ? `lanzó: ${e1.message}` : `pago ${pago && pago.estado}`);
  ok(cupo() === 1, `cupo tras anotar el cobro: ${cupo()} (se esperaba 1)`);

  const e2 = pago ? lanza(() => db.aprobarPago(pago.id)) : new Error('no hay pago');
  ok(!e2 && cupo() === 3, e2 ? `lanzó: ${e2.message}` : `cupo tras aprobar: ${cupo()} (se esperaba 3)`);
  const e3 = pago ? lanza(() => db.aprobarPago(pago.id)) : new Error('no hay pago');
  ok(!e3 && cupo() === 3, e3 ? `lanzó: ${e3.message}` : `cupo tras aprobar otra vez: ${cupo()} (se esperaba 3)`);
}

console.log('\n6. Un rechazo no deja nada y ya no se puede aprobar');
{
  const antes = suscripcionesDe(ID_ORG);
  let pago = null;
  let r = null;
  const e = lanza(() => {
    pago = db.registrarCobro({ idOrg: ID_ORG, cobro: cobroDe(3500, 'RECHAZO'), intencion: intencionCompra(1, 30) });
    r = db.rechazarPago(pago.id);
  });
  ok(!e && !!r && r.cambiado === true && r.pago.estado === 'rechazado',
    e ? `lanzó: ${e.message}` : `cambiado=${r && r.cambiado} estado=${r && r.pago.estado}`);
  ok(!!r && r.pago.suscripcion_id === null, `suscripcion_id=${r && r.pago.suscripcion_id}`);

  let r2 = null;
  const e2 = pago ? lanza(() => { r2 = db.aprobarPago(pago.id); }) : new Error('no hay pago');
  const tras = pago ? db.pagoPorId(pago.id) : null;
  ok(!e2 && !!tras && tras.estado === 'rechazado' && (!r2 || r2.yaEstaba === true),
    e2 ? `lanzó: ${e2.message}` : `tras intentar aprobar: ${tras && tras.estado}`);
  ok(suscripcionesDe(ID_ORG) === antes, `membresías: ${suscripcionesDe(ID_ORG)} (se esperaban ${antes})`);

  let r3 = null;
  const e3 = pagoCompra ? lanza(() => { r3 = db.rechazarPago(pagoCompra.id); }) : new Error('no hay pago');
  ok(!e3 && !!r3 && r3.cambiado === false && db.pagoPorId(pagoCompra.id).estado === 'aprobado',
    e3 ? `lanzó: ${e3.message}` : `rechazar un aprobado: cambiado=${r3 && r3.cambiado}`);
}

console.log('\n7. El importe cero no pasa por registrarCobro');
{
  const e = lanza(() => db.registrarCobro({
    idOrg: ID_ORG, cobro: { subtotal: 0, itbis: 0, total: 0, referencia: referencia('CERO') },
    intencion: intencionCompra(1, 30),
  }));
  ok(!!e, e ? `lanza: ${e.message}` : 'NO lanzó con importe cero');
}

console.log('\n8. Un pago como los de producción se cuenta y se factura igual que antes');
{
  const antes = cobrosEntre(HOY, HOY);
  const idPago = `pago-viejo-${SELLO}`;
  const creado = new Date().toISOString();
  ejecuta(`INSERT INTO pagos (id, organizacion_id, suscripcion_id, subtotal, itbis, total,
            estado, referencia, procesador, creado)
           VALUES (?, ?, NULL, 2000, 360, 2360, 'aprobado', ?, 'demo', ?)`,
  idPago, ID_ORG, referencia('VIEJO'), creado);
  ok(cobrosEntre(HOY, HOY) === antes + 1, `cobros de hoy: ${cobrosEntre(HOY, HOY)} (se esperaban ${antes + 1})`);
  let f = null;
  const e = lanza(() => { f = facturas.emitirPorPago(db.pagoPorId(idPago), { concepto: 'prueba', cliente: {} }); });
  ok(!e && !!f && f.fecha === creado, e ? `lanzó: ${e.message}` : `fecha=${f && f.fecha} (se esperaba ${creado})`);
}

console.log('\n9. Un pago confirmado días después se fecha y se cuenta el día que entró el dinero');
{
  const hace40 = new Date(Date.now() - 40 * 86400000);
  const mes = hace40.toISOString().slice(0, 7);
  const [a, m] = mes.split('-').map(Number);
  const finDeMes = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`;

  const antesHoy = cobrosEntre(HOY, HOY);
  let pago = null;
  let f = null;
  const e = lanza(() => {
    pago = db.registrarCobro({ idOrg: ID_ORG, cobro: cobroDe(2000, 'TARDE'), intencion: intencionCompra(1, 30) });
    ejecuta('UPDATE pagos SET creado = ? WHERE id = ?', hace40.toISOString(), pago.id);
    db.aprobarPago(pago.id);
    f = facturas.emitirPorPago(db.pagoPorId(pago.id), { concepto: 'prueba', cliente: {} });
  });
  const fila = pago ? db.pagoPorId(pago.id) : null;
  ok(!e && !!f && !!fila && !!fila.confirmado && f.fecha === fila.confirmado,
    e ? `lanzó: ${e.message}` : `fecha=${f && f.fecha} confirmado=${fila && fila.confirmado} creado=${fila && fila.creado}`);
  ok(cobrosEntre(HOY, HOY) === antesHoy + 1, `cobros de hoy: ${cobrosEntre(HOY, HOY)} (se esperaban ${antesHoy + 1})`);
  ok(cobrosEntre(`${mes}-01`, finDeMes) === 0, `cobros de ${mes}: ${cobrosEntre(`${mes}-01`, finDeMes)} (se esperaban 0)`);
}

/* ── 03-02: la transición completa, con comprobante ───────
   Desde aquí se prueba `tools/pagos.js`, que es quien junta los cupos
   y el comprobante. Lo que se mide es lo que no se puede deshacer: la
   factura, el NCF consumido de la secuencia y el correo al cliente. */

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const BANDEJA = path.join(__dirname, '..', '.tmp', 'correos');
const SALTO = /\r?\n/;

const siguienteB02 = () => {
  const s = consulta("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B02' AND activa = 1");
  return s ? s.siguiente : null;
};
const facturasDelPago = (idPago) =>
  consulta("SELECT COUNT(*) AS n FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", idPago).n;

/* Los correos al cliente de un comprobante. El transporte de archivo
   deja cada correo como .txt con las cabeceras arriba; se cuentan los
   que van al cliente y llevan en el asunto el número del comprobante y
   la referencia del cobro, que es única de esta pasada. */
function correosAlCliente(numero, ref) {
  if (!fs.existsSync(BANDEJA)) return 0;
  return fs.readdirSync(BANDEJA).filter((f) => f.endsWith('.txt'))
    .map((f) => fs.readFileSync(path.join(BANDEJA, f), 'utf8').split(SALTO))
    .filter((l) => l.includes(`Para: ${CLIENTE.correo}`))
    .map((l) => (l.find((x) => x.startsWith('Asunto: ')) || ''))
    .filter((a) => a.includes(numero) && a.includes(ref)).length;
}

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Copiada de probar-seguridad.js, sin los trozos partidos que aquí no
   hacen falta. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-pagos', ...cabeceras };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      setHeader() {},
      writeHead(c) { res.codigo = c; return res; },
      destroy() {},
      end(d) {
        let datos = null;
        try { datos = d ? JSON.parse(d) : null; } catch { datos = null; }
        resolver({ codigo: res.codigo, datos });
      },
    };

    const ruta = new URL(url, 'http://localhost').pathname;
    api.manejar(req, res, ruta);
    setImmediate(() => {
      if (cuerpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(cuerpo), 'utf8'));
      req.emit('end');
    });
  });
}

const pendienteDeCompra = (etiqueta, cupo = 1) => db.registrarCobro({
  idOrg: ID_ORG, cobro: cobroDe(3500 * cupo, etiqueta), intencion: intencionCompra(cupo, 30),
});

(async () => {
  console.log('\n10. Confirmar un pendiente otorga la membresía y emite su comprobante');
  db.cargarSecuencia({
    tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 50,
    vence: '2027-12-31', usaSitio: true,
  });
  const b02Antes = siguienteB02();
  const pConfirma = pendienteDeCompra('CONFIRMA', 2);
  let r1 = null;
  const e1 = lanza(() => { r1 = pagos.confirmarPago(pConfirma.id); });
  ok(!e1 && !!r1 && !!r1.comprobante && !!r1.comprobante.ncf,
    e1 ? `lanzó: ${e1.message}` : `comprobante=${r1 && r1.comprobante && r1.comprobante.numero} ncf=${r1 && r1.comprobante && r1.comprobante.ncf}`);
  ok(!!r1 && !!r1.membresia && r1.membresia.anuncios_incluidos === 2,
    `membresía con ${r1 && r1.membresia && r1.membresia.anuncios_incluidos} cupo(s) (se esperaban 2)`);
  ok(db.pagoPorId(pConfirma.id).estado === 'aprobado', `pago ${db.pagoPorId(pConfirma.id).estado}`);

  console.log('\n11. Confirmar otra vez no duplica: misma factura, un NCF, un correo');
  let r2 = null;
  const e2 = lanza(() => { r2 = pagos.confirmarPago(pConfirma.id); });
  ok(!e2 && !!r2 && r2.yaEstaba === true, e2 ? `lanzó: ${e2.message}` : `yaEstaba=${r2 && r2.yaEstaba}`);
  ok(!!r1 && !!r2 && !!r1.comprobante && !!r2.comprobante
    && r2.comprobante.id === r1.comprobante.id && r2.comprobante.ncf === r1.comprobante.ncf,
  `misma factura: ${r2 && r2.comprobante && r2.comprobante.ncf}`);
  ok(facturasDelPago(pConfirma.id) === 1, `facturas del pago: ${facturasDelPago(pConfirma.id)} (se esperaba 1)`);
  ok(siguienteB02() === b02Antes + 1, `B02 avanzó ${siguienteB02() - b02Antes} (se esperaba 1)`);
  await esperar(200);
  const nCorreos = r1 && r1.comprobante ? correosAlCliente(r1.comprobante.numero, pConfirma.referencia) : 0;
  ok(nCorreos === 1, `correos al cliente con ese comprobante: ${nCorreos} (se esperaba 1)`);

  console.log('\n12. Un rechazo no emite ni consume NCF');
  {
    const antes = siguienteB02();
    const p = pendienteDeCompra('RECHAZA');
    let r = null;
    const e = lanza(() => { r = pagos.rechazarPago(p.id); });
    ok(!e && !!r && r.cambiado === true && r.pago.estado === 'rechazado',
      e ? `lanzó: ${e.message}` : `estado=${r && r.pago.estado}`);
    ok(facturasDelPago(p.id) === 0, `facturas del pago: ${facturasDelPago(p.id)} (se esperaba 0)`);
    ok(siguienteB02() === antes, `B02 avanzó ${siguienteB02() - antes} (se esperaba 0)`);

    console.log('\n13. Confirmar un rechazado no hace nada');
    const susc = suscripcionesDe(ID_ORG);
    let rc = null;
    const ec = lanza(() => { rc = pagos.confirmarPago(p.id); });
    ok(!ec && !!rc && rc.comprobante === null, ec ? `lanzó: ${ec.message}` : `comprobante=${rc && rc.comprobante}`);
    ok(facturasDelPago(p.id) === 0 && suscripcionesDe(ID_ORG) === susc,
      `facturas=${facturasDelPago(p.id)} membresías=${suscripcionesDe(ID_ORG)} (se esperaban 0 y ${susc})`);
  }

  console.log('\n14. Si la emisión falla, el cobro sigue aprobado y confirmar otra vez la completa');
  {
    const p = pendienteDeCompra('FALLA-EMISION');
    const original = facturas.emitirPorPago;
    let r = null;
    let e = null;
    try {
      facturas.emitirPorPago = () => { throw new Error('emisión simulada que falla'); };
      e = lanza(() => { r = pagos.confirmarPago(p.id); });
    } finally {
      facturas.emitirPorPago = original;
    }
    const fila = db.pagoPorId(p.id);
    ok(!e, e ? `confirmarPago lanzó: ${e.message}` : 'confirmarPago no lanza');
    ok(!!r && r.comprobante === null, `comprobante=${r && r.comprobante}`);
    ok(fila.estado === 'aprobado' && !!fila.suscripcion_id,
      `pago ${fila.estado} con membresía ${fila.suscripcion_id}`);

    let r2b = null;
    const e2b = lanza(() => { r2b = pagos.confirmarPago(p.id); });
    ok(!e2b && !!r2b && !!r2b.comprobante && facturasDelPago(p.id) === 1,
      e2b ? `lanzó: ${e2b.message}` : `segunda confirmación emitió ${r2b && r2b.comprobante && r2b.comprobante.numero}`);
  }

  console.log('\n15. Una ampliación confirmada factura los cupos añadidos, no el total');
  {
    const base = db.comprarCupos({
      idOrg: ID_ORG_AMPLIA, idPlan: 'destacado', cupo: 1, dias: 30,
      cobro: { subtotal: 0, itbis: 0, total: 0, referencia: `PRUEBA-BASE2-${SELLO}` },
    });
    const p = db.registrarCobro({
      idOrg: ID_ORG_AMPLIA, idSusc: base.id, cobro: cobroDe(3000, 'AMPLIA2'),
      intencion: {
        tipo: 'ampliacion', idSusc: base.id, cupoAnterior: 1, cupoNuevo: 3, anadidos: 2,
        concepto: 'Ampliación de Destacado · 2 cupos más · hasta 3', cliente: CLIENTE, correoCliente: CLIENTE.correo,
      },
    });
    const original = facturas.emitirPorPago;
    let visto = null;
    let r = null;
    try {
      facturas.emitirPorPago = (pago, opciones) => { visto = opciones; return original(pago, opciones); };
      r = pagos.confirmarPago(p.id);
    } finally {
      facturas.emitirPorPago = original;
    }
    const det = visto && visto.detalle;
    // El subtotal facturado es el gravado (base 3000 + ajuste): el ajuste
    // va dentro de la línea, sin línea aparte.
    ok(!!det && det.cantidad === 2 && det.cantidad * det.precio_unitario === p.subtotal,
      det ? `detalle: ${det.cantidad} × ${det.precio_unitario} (${det.periodo})` : 'no se emitió');
    ok(!!r && !!r.membresia && r.membresia.anuncios_incluidos === 3 && !!r.comprobante,
      `cupo ${r && r.membresia && r.membresia.anuncios_incluidos} y comprobante ${r && r.comprobante && r.comprobante.numero}`);
  }

  console.log('\n16. cobrar pregunta al procesador y acaba en aprobado, rechazado o pendiente');
  {
    const pA = pendienteDeCompra('COBRA-DEMO');
    const rA = await pagos.cobrar(pA);
    ok(rA.estado === 'aprobado' && !!rA.comprobante, `demo: ${rA.estado} con ${rA.comprobante && rA.comprobante.numero}`);

    const demo = pagos.PROCESADORES.demo;
    try {
      pagos.PROCESADORES.demo = async () => ({ resultado: 'rechazado', motivo: '51' });
      const pR = pendienteDeCompra('COBRA-RECHAZO');
      const rR = await pagos.cobrar(pR);
      ok(rR.estado === 'rechazado' && rR.motivo === '51' && facturasDelPago(pR.id) === 0
        && db.pagoPorId(pR.id).estado === 'rechazado',
      `rechazo: ${rR.estado} motivo=${rR.motivo} facturas=${facturasDelPago(pR.id)}`);
    } finally {
      pagos.PROCESADORES.demo = demo;
    }

    try {
      pagos.PROCESADORES.demo = async () => { throw new Error('la red se cayó a mitad'); };
      const pF = pendienteDeCompra('COBRA-FALLA');
      const rF = await pagos.cobrar(pF);
      ok(rF.estado === 'pendiente' && db.pagoPorId(pF.id).estado === 'pendiente' && facturasDelPago(pF.id) === 0,
        `procesador que lanza: ${rF.estado}`);
    } finally {
      pagos.PROCESADORES.demo = demo;
    }

    let llamadas = 0;
    try {
      pagos.PROCESADORES.demo = async () => { llamadas++; return { resultado: 'aprobado' }; };
      const pT = db.registrarCobro({
        idOrg: ID_ORG, cobro: { ...cobroDe(3500, 'TRANSFERENCIA'), procesador: 'transferencia' },
        intencion: intencionCompra(1, 30),
      });
      const rT = await pagos.cobrar(pT);
      ok(rT.estado === 'pendiente' && llamadas === 0 && db.pagoPorId(pT.id).estado === 'pendiente',
        `transferencia: ${rT.estado}, procesadores llamados: ${llamadas}`);
    } finally {
      pagos.PROCESADORES.demo = demo;
    }
  }

  /* ── 03-03: las rutas de compra pasan por la transición ───
     Por el enrutador de verdad, con req y res fingidos como en
     probar-seguridad.js: lo que importa es lo que ve el anunciante. */

  const { idUsuario } = db.crearCuenta({
    correo: 'comprador@prueba.invalid',
    clave: 'UnaClaveLargaYSegura9',
    nombre: 'Comprador de prueba',
    telefono: '8095550000',
    tipo: 'particular',
  });
  const orgApi = db.organizacionDe(idUsuario);
  const legales = require('../assets/legales.js');
  Object.values(legales.DOCUMENTOS || {}).forEach((doc) => {
    db.registrarAceptacion({
      usuarioId: idUsuario, documento: doc.id, version: doc.version, ip: '127.0.0.1', userAgent: 'prueba',
    });
  });
  const conSesion = { cookie: `te_sesion=${db.abrirSesion(idUsuario)}`, 'cf-connecting-ip': '201.8.8.8' };
  const comprar = (cuerpo) => pedir({ metodo: 'POST', url: '/api/membresias', cuerpo, cabeceras: conSesion });
  const ampliar = (idSusc, cupo) =>
    pedir({ metodo: 'POST', url: `/api/membresias/${idSusc}/ampliar`, cuerpo: { cupo }, cabeceras: conSesion });
  const cupoDe = (idSusc) => consulta('SELECT anuncios_incluidos AS n FROM suscripciones WHERE id = ?', idSusc).n;

  console.log('\n17. Comprar con el procesador demo: 201 con comprobante, y el pago pasó por pendiente');
  const compraApi = await comprar({ plan: 'destacado', cupo: 1, dias: 30 });
  let idSuscApi = null;
  {
    const d = compraApi.datos || {};
    ok(compraApi.codigo === 201 && !!d.comprobante, `código ${compraApi.codigo}, comprobante ${d.comprobante && d.comprobante.numero}`);
    ok(!!d.pago && d.pago.estado === 'aprobado', `pago.estado=${d.pago && d.pago.estado}`);
    const ref = d.cobro && d.cobro.referencia;
    const n = consulta('SELECT COUNT(*) AS n FROM pagos WHERE referencia = ?', ref).n;
    const fila = consulta('SELECT * FROM pagos WHERE referencia = ?', ref);
    let intencion = null;
    try { intencion = JSON.parse(fila.intencion); } catch (_) { /* se informa abajo */ }
    ok(n === 1 && fila.estado === 'aprobado' && !!fila.confirmado && !!intencion && intencion.tipo === 'compra',
      `pagos con la referencia: ${n}, estado ${fila && fila.estado}, confirmado ${fila && fila.confirmado}, intención ${intencion && intencion.tipo}`);
    idSuscApi = d.membresia && d.membresia.id;
  }

  console.log('\n18. Si el procesador rechaza: 402, pago rechazado, sin membresía ni comprobante');
  {
    const demo = pagos.PROCESADORES.demo;
    const suscAntes = suscripcionesDe(orgApi.id);
    const factAntes = facturasTotales();
    let r = null;
    try {
      pagos.PROCESADORES.demo = async () => ({ resultado: 'rechazado' });
      r = await comprar({ plan: 'destacado', cupo: 2, dias: 30 });
    } finally {
      pagos.PROCESADORES.demo = demo;
    }
    const d = r.datos || {};
    ok(r.codigo === 402 && typeof d.error === 'string' && d.error.length > 10, `código ${r.codigo}: ${d.error}`);
    const fila = d.pago ? db.pagoPorId(d.pago.id) : null;
    ok(!!fila && fila.estado === 'rechazado', `pago en la base: ${fila && fila.estado}`);
    ok(suscripcionesDe(orgApi.id) === suscAntes, `membresías: ${suscripcionesDe(orgApi.id)} (se esperaban ${suscAntes})`);
    ok(facturasTotales() === factAntes, `facturas: ${facturasTotales()} (se esperaban ${factAntes})`);
  }

  console.log('\n19. El Estándar en promoción sigue aprobado al instante y sin comprobante');
  {
    const r = await comprar({ plan: 'estandar', cupo: 1, dias: 30 });
    const d = r.datos || {};
    const fila = d.pago ? db.pagoPorId(d.pago.id) : null;
    ok(r.codigo === 201 && d.cobro && d.cobro.total === 0 && !d.comprobante,
      `código ${r.codigo}, total ${d.cobro && d.cobro.total}, comprobante ${d.comprobante}`);
    ok(!!fila && fila.estado === 'aprobado' && fila.procesador === 'sin-costo',
      `pago ${fila && fila.estado} por ${fila && fila.procesador}`);
  }

  console.log('\n20. Ampliar con demo suma y factura; si el procesador rechaza, nada cambia');
  {
    const factAntes = facturasTotales();
    const r = idSuscApi ? await ampliar(idSuscApi, 3) : { codigo: 0, datos: {} };
    ok(r.codigo === 200 && !!r.datos.comprobante && cupoDe(idSuscApi) === 3 && facturasTotales() === factAntes + 1,
      `código ${r.codigo}, cupo ${idSuscApi && cupoDe(idSuscApi)}, facturas ${factAntes} → ${facturasTotales()}`);

    const demo = pagos.PROCESADORES.demo;
    const factMedio = facturasTotales();
    let r2 = null;
    try {
      pagos.PROCESADORES.demo = async () => ({ resultado: 'rechazado' });
      r2 = idSuscApi ? await ampliar(idSuscApi, 5) : { codigo: 0, datos: {} };
    } finally {
      pagos.PROCESADORES.demo = demo;
    }
    ok(r2.codigo === 402 && cupoDe(idSuscApi) === 3 && facturasTotales() === factMedio,
      `código ${r2.codigo}, cupo ${idSuscApi && cupoDe(idSuscApi)}, facturas ${factMedio} → ${facturasTotales()}`);
  }

  console.log('\n21. Si el procesador deja el cobro en proceso: 202 sin nada, y confirmarlo después lo completa');
  {
    const demo = pagos.PROCESADORES.demo;
    let r = null;
    try {
      pagos.PROCESADORES.demo = async () => ({ resultado: 'pendiente' });
      r = await comprar({ plan: 'destacado', cupo: 1, dias: 60 });
    } finally {
      pagos.PROCESADORES.demo = demo;
    }
    const d = r.datos || {};
    ok(r.codigo === 202 && d.membresia === null && !!d.pago && d.pago.estado === 'pendiente'
      && facturasDelPago(d.pago.id) === 0,
    `código ${r.codigo}, membresía ${d.membresia}, pago ${d.pago && d.pago.estado}`);
    let c = null;
    const e = d.pago ? lanza(() => { c = pagos.confirmarPago(d.pago.id); }) : new Error('no hay pago');
    ok(!e && !!c && !!c.membresia && !!c.comprobante && c.membresia.dias_ciclo === 60,
      e ? `lanzó: ${e.message}` : `membresía ${c.membresia && c.membresia.id} y comprobante ${c.comprobante && c.comprobante.numero}`);
  }

  console.log('\n22. Nadie más otorga cupos por un cobro con importe');
  {
    const cobro = cobroDe(3500, 'PUERTA');
    ok(!!lanza(() => db.comprarCupos({ idOrg: ID_ORG, idPlan: 'destacado', cupo: 1, dias: 30, cobro })),
      'comprarCupos con importe lanza');
    ok(!!lanza(() => db.ampliarCupos({ idSusc: idSuscApi, idOrg: orgApi.id, cupoNuevo: 9, cobro })),
      'ampliarCupos con importe lanza');
    ok(cupoDe(idSuscApi) === 3, `el cupo sigue en ${cupoDe(idSuscApi)}`);
  }

  /* ── 05.1-02: precio único ────────────────────────────────
     `research/modelo-comercial.md` §13 pide guardar el desglose en cada
     transacción: base, ajuste, subtotal gravado, ITBIS y total. El
     comprobante lleva el gravado y tiene que cuadrar ante la DGII con
     lo cobrado; sin la base guardada, nadie podría reconstruir después
     de dónde salió el precio. */

  console.log('\n23. Precio único: migración y desglose guardado');
  {
    const d = conexion();
    const columnas = d.prepare('PRAGMA table_info(pagos)').all().map((c) => c.name);
    const migradas = d.prepare(`SELECT id FROM migraciones
                                 WHERE id IN ('2026-09-pagos-desglose', '2026-09-precios-base')`).all().map((m) => m.id);
    d.close();
    for (const c of ['base', 'ajuste', 'ajuste_tasa', 'itbis_tasa']) {
      ok(columnas.includes(c), `pagos.${c} ${columnas.includes(c) ? 'existe' : 'NO existe'}`);
    }
    ok(migradas.length === 2, `migraciones del precio único anotadas: ${migradas.join(', ') || 'ninguna'}`);

    const est = db.planPorId('estandar');
    const des = db.planPorId('destacado');
    const pre = db.planPorId('premium');
    ok(est.precio === 1800 && des.precio === 3200 && pre.precio === 5500,
      `precios base: estándar ${est.precio}, destacado ${des.precio}, premium ${pre.precio} (se esperaban 1800, 3200, 5500)`);
    ok(est.precio_promocional === 0 && !!est.promo_hasta,
      `la promoción del Estándar sigue: ${est.precio_promocional} hasta ${est.promo_hasta}`);

    // Un cobro de la fórmula se guarda entero.
    let p = null;
    const e = lanza(() => {
      p = db.registrarCobro({ idOrg: ID_ORG, cobro: cobroDe(3200, 'DESGLOSE'), intencion: intencionCompra(1, 30) });
    });
    ok(!e && !!p && p.base === 3200 && p.ajuste === 96 && p.ajuste_tasa === 0.03 && p.subtotal === 3296
      && p.itbis === 593 && p.itbis_tasa === 0.18 && p.total === 3889,
    e ? `lanzó: ${e.message}` : `guardado: base ${p.base} ajuste ${p.ajuste} (${p.ajuste_tasa}) subtotal ${p.subtotal} itbis ${p.itbis} (${p.itbis_tasa}) total ${p.total}`);

    // Un cobro que no sale de la fórmula no entra.
    const antes = consulta('SELECT COUNT(*) AS n FROM pagos').n;
    const malos = [
      { subtotal: 3200, itbis: 576, total: 3776, referencia: referencia('SIN-BASE'), procesador: 'demo' },
      { ...cobroDe(3200, 'INCOHERENTE-SUB'), subtotal: 3200 },
      { ...cobroDe(3200, 'INCOHERENTE-TOT'), total: 1 },
    ];
    for (const cobro of malos) {
      const em = lanza(() => db.registrarCobro({ idOrg: ID_ORG, cobro, intencion: intencionCompra(1, 30) }));
      ok(!!em && em.codigo === 500, em ? `rechaza ${cobro.referencia}: ${em.message}` : `NO lanzó con ${cobro.referencia}`);
    }
    ok(consulta('SELECT COUNT(*) AS n FROM pagos').n === antes, 'ningún cobro incoherente dejó fila');

    // El pactado es la base, no el gravado.
    let r = null;
    const ea = p ? lanza(() => { r = db.aprobarPago(p.id); }) : new Error('no hay pago');
    const s = r && r.membresia ? consulta('SELECT precio_pactado FROM suscripciones WHERE id = ?', r.membresia.id) : null;
    ok(!ea && !!s && s.precio_pactado === 3200, ea ? `lanzó: ${ea.message}` : `precio_pactado=${s && s.precio_pactado} (se esperaba 3200)`);

    // Un pago de antes (base NULL) se lee como sin ajuste: pactado = subtotal.
    const idViejo = `pago-viejo-pendiente-${SELLO}`;
    const t = new Date().toISOString();
    ejecuta(`INSERT INTO pagos (id, organizacion_id, suscripcion_id, subtotal, itbis, total,
              estado, referencia, procesador, creado, intencion, actualizado)
             VALUES (?, ?, NULL, 3500, 630, 4130, 'pendiente', ?, 'demo', ?, ?, ?)`,
    idViejo, ID_ORG, referencia('VIEJO-PEND'), t, JSON.stringify(intencionCompra(1, 30)), t);
    let rv = null;
    const ev = lanza(() => { rv = db.aprobarPago(idViejo); });
    const sv = rv && rv.membresia ? consulta('SELECT precio_pactado FROM suscripciones WHERE id = ?', rv.membresia.id) : null;
    ok(!ev && !!sv && sv.precio_pactado === 3500, ev ? `lanzó: ${ev.message}` : `pago viejo: precio_pactado=${sv && sv.precio_pactado} (se esperaba 3500)`);

    // El importe cero también guarda su desglose (todo a 0).
    let m0 = null;
    const e0 = lanza(() => {
      m0 = db.comprarCupos({
        idOrg: ID_ORG_AMPLIA, idPlan: 'estandar', cupo: 1, dias: 30,
        cobro: { ...precios.desglose(0), referencia: referencia('CERO-DESGLOSE') },
      });
    });
    const f0 = m0 ? consulta('SELECT base, ajuste, total FROM pagos WHERE suscripcion_id = ?', m0.id) : null;
    ok(!e0 && !!f0 && f0.base === 0 && f0.ajuste === 0 && f0.total === 0,
      e0 ? `lanzó: ${e0.message}` : `importe cero: base ${f0 && f0.base} ajuste ${f0 && f0.ajuste}`);

    // El comprador no ve la base ni el ajuste; la consola sí.
    const pt = db.registrarCobro({
      idOrg: ID_ORG, cobro: { ...cobroDe(3200, 'CONSOLA'), procesador: 'transferencia' }, intencion: intencionCompra(1, 30),
    });
    const delComprador = db.pagosPendientesDe(ID_ORG);
    ok(delComprador.length > 0 && delComprador.every((f) => !('base' in f) && !('ajuste' in f)),
      `pagosPendientesDe sin base ni ajuste: ${delComprador.length ? Object.keys(delComprador[0]).join(', ') : 'vacío'}`);
    const deConsola = db.pagosParaConsola({ estado: 'pendiente' }).find((f) => f.id === pt.id);
    ok(!!deConsola && deConsola.base === 3200 && deConsola.ajuste === 96 && deConsola.ajuste_tasa === 0.03 && deConsola.itbis_tasa === 0.18,
      deConsola ? `consola: base ${deConsola.base} ajuste ${deConsola.ajuste} (${deConsola.ajuste_tasa}) itbis ${deConsola.itbis_tasa}` : 'la consola no lo lista');

    // Un rechazo no mueve la B02 ni el número de facturas.
    const b02 = siguienteB02();
    const fact = facturasTotales();
    const rr = db.rechazarPago(pt.id);
    ok(rr.cambiado && rr.pago.estado === 'rechazado' && siguienteB02() === b02 && facturasTotales() === fact,
      `rechazo: ${rr.pago.estado}, B02 ${b02} → ${siguienteB02()}, facturas ${fact} → ${facturasTotales()}`);
  }

  console.log();
  console.log(fallos ? `${fallos} de ${comprobaciones} comprobación(es) fallidas` : `Todo correcto (${comprobaciones} comprobaciones)`);
  process.exitCode = fallos ? 1 : 0;
})().catch((e) => {
  console.error('la prueba se cayó:', e);
  process.exitCode = 1;
});
