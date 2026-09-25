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

  /* ── 05-01, tarea 2: la transición dentro de la bitácora ──── */

  const { idUsuario: idAdmin } = db.crearCuenta({
    correo: 'admin-transferencia@ejemplo.test', clave: 'UnaClaveLargaYSegura9',
    nombre: 'Administradora de Prueba', telefono: '8095550000', tipo: 'particular',
  });
  db.marcarAdmin('admin-transferencia@ejemplo.test', true);

  /* Lo que hará la ruta de la consola en 05-02: la misma transición de
     la fase 3, envuelta en la anotación. `falla` simula un error
     DESPUÉS de haber otorgado los cupos, que es el caso que importa:
     si la anotación no se puede escribir, los cupos no pueden quedar. */
  const enBitacora = (pago, { falla = false } = {}) => (aprobar) => db.enNombreDe({
    idAdmin, idOrganizacion: pago.organizacion_id, accion: 'pago.transferencia_recibida',
    objetoTipo: 'pago', objetoId: pago.id, motivo: 'REF-BANCO-PRUEBA', ip: '127.0.0.1',
  }, () => {
    const antes = { estado: db.pagoPorId(pago.id).estado };
    const r = aprobar();
    if (falla) throw new Error('fallo simulado después de aprobar');
    return { antes, despues: { estado: r.pago.estado, yaEstaba: r.yaEstaba }, resultado: r };
  });

  console.log('\n7. Confirmar una transferencia dentro de la bitácora: cupos, anotación y comprobante, una vez');
  const pRecibida = pendiente('RECIBIDA', { cupo: 2 });
  let r1 = null;
  {
    const antesB02 = siguienteB02();
    const antesMemb = membresiasDe(ID_ORG);
    const antesFilas = filasBitacora('pago.transferencia_recibida');
    const e = lanza(() => { r1 = pagos.confirmarPago(pRecibida.id, { envolver: enBitacora(pRecibida) }); });
    ok(!e && !!r1, e ? `lanzó: ${e.message}` : 'confirmarPago devolvió resultado');
    ok(db.pagoPorId(pRecibida.id).estado === 'aprobado', `pago ${db.pagoPorId(pRecibida.id).estado}`);
    ok(!!r1 && !!r1.membresia && r1.membresia.anuncios_incluidos === 2,
      `membresía con ${r1 && r1.membresia && r1.membresia.anuncios_incluidos} cupo(s)`);
    ok(membresiasDe(ID_ORG) === antesMemb + 1, `membresías: ${membresiasDe(ID_ORG)} (se esperaban ${antesMemb + 1})`);
    ok(filasBitacora('pago.transferencia_recibida') === antesFilas + 1, 'una fila de bitácora con la acción');
    ok(!!r1 && !!r1.comprobante && !!r1.comprobante.ncf, `comprobante ${r1 && r1.comprobante && r1.comprobante.ncf}`);
    ok(facturasDelPago(pRecibida.id) === 1, `facturas del pago: ${facturasDelPago(pRecibida.id)}`);
    ok(siguienteB02() === antesB02 + 1, `B02 avanzó ${siguienteB02() - antesB02} (se esperaba 1)`);
    const fila = consulta("SELECT * FROM bitacora_admin WHERE accion = 'pago.transferencia_recibida' ORDER BY id DESC LIMIT 1");
    ok(!!fila && fila.objeto_id === pRecibida.id && fila.motivo === 'REF-BANCO-PRUEBA' && fila.admin_id === idAdmin,
      'la fila dice qué pago, qué referencia de banco y quién');
  }

  console.log('\n8. Pulsar otra vez: misma factura, B02 quieto, pero otra fila (alguien pulsó)');
  {
    const antesB02 = siguienteB02();
    const antesFilas = filasBitacora('pago.transferencia_recibida');
    let r2 = null;
    const e = lanza(() => { r2 = pagos.confirmarPago(pRecibida.id, { envolver: enBitacora(pRecibida) }); });
    ok(!e && !!r2 && r2.yaEstaba === true, e ? `lanzó: ${e.message}` : `yaEstaba=${r2 && r2.yaEstaba}`);
    ok(!!r1 && !!r2 && !!r2.comprobante && r2.comprobante.id === r1.comprobante.id, 'la misma factura');
    ok(siguienteB02() === antesB02, `B02 avanzó ${siguienteB02() - antesB02} (se esperaba 0)`);
    ok(facturasDelPago(pRecibida.id) === 1, `facturas del pago: ${facturasDelPago(pRecibida.id)}`);
    ok(filasBitacora('pago.transferencia_recibida') === antesFilas + 1, 'una segunda fila de bitácora');
    const fila = consulta("SELECT despues FROM bitacora_admin WHERE accion = 'pago.transferencia_recibida' ORDER BY id DESC LIMIT 1");
    let despues = null;
    try { despues = JSON.parse(fila.despues); } catch (_) { /* se informa abajo */ }
    ok(!!despues && despues.yaEstaba === true, `despues=${fila && fila.despues}`);
  }

  console.log('\n9. Si falla después de aprobar, no queda nada: ni cupos, ni fila, ni factura, ni NCF');
  {
    const p = pendiente('FALLA');
    const antesB02 = siguienteB02();
    const antesMemb = membresiasDe(ID_ORG);
    const antesFilas = filasBitacora('pago.transferencia_recibida');
    const e = lanza(() => pagos.confirmarPago(p.id, { envolver: enBitacora(p, { falla: true }) }));
    ok(!!e && /fallo simulado/.test(e.message), e ? `lanzó: ${e.message}` : 'NO lanzó');
    ok(db.pagoPorId(p.id).estado === 'pendiente', `pago ${db.pagoPorId(p.id).estado} (se esperaba pendiente)`);
    ok(db.pagoPorId(p.id).suscripcion_id === null, 'el pago no quedó enlazado a ninguna membresía');
    ok(membresiasDe(ID_ORG) === antesMemb, `membresías: ${membresiasDe(ID_ORG)} (se esperaban ${antesMemb})`);
    ok(filasBitacora('pago.transferencia_recibida') === antesFilas, 'sin fila de bitácora');
    ok(facturasDelPago(p.id) === 0, `facturas del pago: ${facturasDelPago(p.id)}`);
    ok(siguienteB02() === antesB02, `B02 avanzó ${siguienteB02() - antesB02} (se esperaba 0)`);
    // Y la base no quedó con una transacción abierta: se puede seguir.
    let r = null;
    const e2 = lanza(() => { r = pagos.confirmarPago(p.id, { envolver: enBitacora(p) }); });
    ok(!e2 && !!r && r.pago.estado === 'aprobado', e2 ? `el reintento lanzó: ${e2.message}` : 'el reintento aprueba');
  }

  console.log('\n10. confirmarPago sin opciones sigue como en la fase 3');
  {
    const p = pendiente('SUELTA');
    const antesFilas = consulta('SELECT COUNT(*) AS n FROM bitacora_admin').n;
    let r = null;
    const e = lanza(() => { r = pagos.confirmarPago(p.id); });
    ok(!e && !!r && r.pago.estado === 'aprobado' && !!r.membresia && !!r.comprobante,
      e ? `lanzó: ${e.message}` : `estado=${r && r.pago.estado}`);
    ok(consulta('SELECT COUNT(*) AS n FROM bitacora_admin').n === antesFilas, 'sin fila de bitácora');
    const e404 = lanza(() => pagos.confirmarPago('no-existe'));
    ok(!!e404 && e404.codigo === 404, `pago inexistente: ${e404 ? e404.codigo : 'no lanzó'}`);
  }

  console.log('\n11. Las acciones de la fase 5 están en el catálogo cerrado');
  ok(db.ACCIONES_BITACORA['pago.transferencia_recibida'] === 'Transferencia marcada como recibida',
    'pago.transferencia_recibida');
  ok(db.ACCIONES_BITACORA['pago.transferencia_anulada'] === 'Transferencia anulada sin cobro',
    'pago.transferencia_anulada');

  console.log('\n12. pagosPendientesDe: solo los pendientes de esa organización');
  const pOtra = pendiente('OTRA', { idOrg: ID_ORG_OTRA });
  {
    const lista = db.pagosPendientesDe(ID_ORG);
    ok(Array.isArray(lista) && lista.length > 0 && lista.every((x) => x.id !== pOtra.id),
      `no trae pagos de otra organización (${lista.length} pendientes)`);
    ok(lista.every((x) => db.pagoPorId(x.id).estado === 'pendiente'), 'todos pendientes');
    ok(!lista.some((x) => x.id === pRecibida.id), 'el aprobado no sale');
    const f = lista[0];
    ok(!!f && ['id', 'referencia', 'total', 'subtotal', 'itbis', 'creado', 'procesador', 'concepto', 'tipo']
      .every((k) => k in f), `campos: ${f && Object.keys(f).join(', ')}`);
    ok(!!f && !('cliente' in f) && !('intencion' in f), 'sin los datos del cliente ni la intención entera');
    ok(lista.every((x, i) => i === 0 || lista[i - 1].creado >= x.creado), 'más recientes primero');
    const deOtra = db.pagosPendientesDe(ID_ORG_OTRA);
    ok(deOtra.length === 1 && deOtra[0].id === pOtra.id && deOtra[0].tipo === 'compra', 'la otra ve solo el suyo');
    // Una intención rota no rompe la lista.
    const roto = pendiente('ROTO', { idOrg: ID_ORG_OTRA });
    ejecuta("UPDATE pagos SET intencion = '{roto' WHERE id = ?", roto.id);
    const conRoto = db.pagosPendientesDe(ID_ORG_OTRA).find((x) => x.id === roto.id);
    ok(!!conRoto && conRoto.concepto === 'Membresía', `intención rota → concepto ${conRoto && conRoto.concepto}`);
  }

  console.log('\n13. pagosParaConsola: solo transferencias, con empresa, concepto y membresía viva');
  {
    const pDemo = pendiente('DEMO', { procesador: 'demo' });
    const lista = db.pagosParaConsola({ estado: 'pendiente' });
    ok(lista.length > 0 && lista.every((x) => x.procesador === 'transferencia'), 'solo procesador transferencia');
    ok(!lista.some((x) => x.id === pDemo.id), 'un pendiente de demo no sale');
    const f = lista.find((x) => x.id === pOtra.id);
    ok(!!f && f.organizacion === 'Otra empresa' && f.concepto.startsWith('Destacado') && f.tipo === 'compra'
      && f.correoCliente === CLIENTE.correo && 'idSusc' in f && f.membresiaViva === true,
    `fila=${JSON.stringify(f)}`);
    const aprobados = db.pagosParaConsola({ estado: 'aprobado' });
    const a = aprobados.find((x) => x.id === pRecibida.id);
    ok(!!a && !!a.factura && a.factura.ncf === r1.comprobante.ncf && !!a.factura.numero,
      `aprobado con su factura: ${a && JSON.stringify(a.factura)}`);
    const raro = db.pagosParaConsola({ estado: 'DROP TABLE' });
    ok(raro.every((x) => db.pagoPorId(x.id).estado === 'pendiente'), 'un estado desconocido se trata como pendiente');
  }

  console.log('\n14. Una ampliación cuya membresía ya no está viva: membresiaViva false');
  {
    const base = db.comprarCupos({
      idOrg: ID_ORG, idPlan: 'destacado', cupo: 1, dias: 30,
      cobro: { subtotal: 0, itbis: 0, total: 0, referencia: referencia('BASE') },
    });
    const pAmplia = db.registrarCobro({
      idOrg: ID_ORG, idSusc: base.id, cobro: cobroDe(2000, 'AMPLIA'),
      intencion: {
        tipo: 'ampliacion', idSusc: base.id, cupoAnterior: 1, cupoNuevo: 2, anadidos: 1,
        concepto: 'Ampliación de Destacado · 1 cupo(s) más · hasta 2', cliente: CLIENTE, correoCliente: CLIENTE.correo,
      },
    });
    const viva = db.pagosParaConsola({ estado: 'pendiente' }).find((x) => x.id === pAmplia.id);
    ok(!!viva && viva.tipo === 'ampliacion' && viva.idSusc === base.id && viva.membresiaViva === true,
      `con la membresía activa: ${viva && viva.membresiaViva}`);
    ejecuta("UPDATE suscripciones SET estado = 'vencida' WHERE id = ?", base.id);
    const muerta = db.pagosParaConsola({ estado: 'pendiente' }).find((x) => x.id === pAmplia.id);
    ok(!!muerta && muerta.membresiaViva === false, `vencida: membresiaViva=${muerta && muerta.membresiaViva}`);
  }

  apagar();
  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
