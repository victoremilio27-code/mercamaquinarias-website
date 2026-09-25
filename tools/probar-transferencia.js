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
const api = require('./api');
const { EventEmitter } = require('events');
const { spawnSync } = require('child_process');

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

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Copiada de probar-pagos.js: lo que importa es lo que ve quien llama,
   no lo que devuelven las funciones de dentro. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-transferencia', ...cabeceras };
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

/* La bandeja del transporte de archivo es compartida entre pruebas y
   pasadas: se buscan los correos por la referencia del cobro, que es
   única de esta ejecución. */
const BANDEJA = path.join(__dirname, '..', '.tmp', 'correos');
function correosCon(cadena) {
  if (!fs.existsSync(BANDEJA)) return [];
  return fs.readdirSync(BANDEJA).filter((f) => f.endsWith('.txt'))
    .map((f) => {
      const texto = fs.readFileSync(path.join(BANDEJA, f), 'utf8');
      const html = path.join(BANDEJA, f.replace(/\.txt$/, '.html'));
      return { texto, html: fs.existsSync(html) ? fs.readFileSync(html, 'utf8') : '' };
    })
    .filter((c) => c.texto.includes(cadena));
}
const paraDe = (c) => ((/^Para: (.*)$/m.exec(c.texto) || [])[1] || '').trim();
/* Soporte solo por correo y por el asistente: ningún correo de cobro
   puede llevar un número de teléfono ni mandar a WhatsApp. Diez
   dígitos seguidos o en grupos 3-3-4 es un teléfono dominicano. */
const TELEFONO = /(?<!\d)\d{3}[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
const sinTelefono = (c) => !TELEFONO.test(c.texto) && !TELEFONO.test(c.html)
  && !/whatsapp/i.test(c.texto) && !/whatsapp/i.test(c.html);
const dinero = (n) => `RD$${Number(n).toLocaleString('en-US')}`;
const pagosTotales = () => consulta('SELECT COUNT(*) AS n FROM pagos').n;
const facturasTotales = () => consulta('SELECT COUNT(*) AS n FROM facturas').n;

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

  /* ── 05-02, tarea 1: el comprador pide pagar por transferencia ───
     Por el enrutador de verdad. Dos cuentas: la compradora, con los
     documentos legales aceptados, y otra ajena que no debe ver nada de
     la primera. */

  const cuentaConLegales = (correoCuenta, nombre) => {
    const { idUsuario } = db.crearCuenta({
      correo: correoCuenta, clave: 'UnaClaveLargaYSegura9', nombre, telefono: '8095550000', tipo: 'particular',
    });
    const legales = require('../assets/legales.js');
    Object.values(legales.DOCUMENTOS || {}).forEach((doc) => {
      db.registrarAceptacion({
        usuarioId: idUsuario, documento: doc.id, version: doc.version, ip: '127.0.0.1', userAgent: 'prueba',
      });
    });
    return {
      idUsuario,
      org: db.organizacionDe(idUsuario),
      cabeceras: { cookie: `te_sesion=${db.abrirSesion(idUsuario)}`, 'cf-connecting-ip': '201.8.8.8' },
    };
  };
  const compradora = cuentaConLegales('compradora-transferencia@prueba.invalid', 'Compradora de Prueba');
  const ajena = cuentaConLegales('ajena-transferencia@prueba.invalid', 'Cuenta Ajena');

  const comprar = (cuerpo, quien = compradora) =>
    pedir({ metodo: 'POST', url: '/api/membresias', cuerpo, cabeceras: quien.cabeceras });
  const ampliar = (idSusc, cuerpo, quien = compradora) =>
    pedir({ metodo: 'POST', url: `/api/membresias/${idSusc}/ampliar`, cuerpo, cabeceras: quien.cabeceras });
  const misMembresias = (quien) => pedir({ url: '/api/membresias', cabeceras: quien.cabeceras });
  const cupoDe = (idSusc) => consulta('SELECT anuncios_incluidos AS n FROM suscripciones WHERE id = ?', idSusc).n;

  /* `demo` aprueba siempre. Con la transferencia encendida, llamarlo
     sería regalar cupos: se sustituye por un espía que cuenta. */
  let llamadasDemo = 0;
  const demoOriginal = pagos.PROCESADORES.demo;
  const espiarDemo = () => {
    llamadasDemo = 0;
    pagos.PROCESADORES.demo = async () => { llamadasDemo++; return { resultado: 'aprobado' }; };
  };
  const soltarDemo = () => { pagos.PROCESADORES.demo = demoOriginal; };

  console.log('\n15. Apagada: la compra sigue como en la fase 3, y pedir transferencia es un 400');
  apagar();
  let idSuscCompradora = null;
  {
    const r = await comprar({ plan: 'destacado', cupo: 1, dias: 30 });
    const d = r.datos || {};
    ok(r.codigo === 201 && !!d.comprobante && !!d.pago && d.pago.estado === 'aprobado' && !d.transferencia,
      `código ${r.codigo}, pago ${d.pago && d.pago.estado}, transferencia ${JSON.stringify(d.transferencia)}`);
    const fila = d.cobro ? consulta('SELECT procesador FROM pagos WHERE referencia = ?', d.cobro.referencia) : null;
    ok(!!fila && fila.procesador === 'demo', `procesador en la base: ${fila && fila.procesador}`);
    idSuscCompradora = d.membresia && d.membresia.id;

    const antes = pagosTotales();
    const r2 = await comprar({ plan: 'destacado', cupo: 1, dias: 30, metodo: 'transferencia' });
    ok(r2.codigo === 400 && (r2.datos || {}).error === 'Ese método de pago no está disponible.',
      `código ${r2.codigo}: ${(r2.datos || {}).error}`);
    ok(pagosTotales() === antes, `pagos: ${pagosTotales()} (se esperaban ${antes})`);
  }

  console.log('\n16. Encendida: la compra responde 202 con los datos de la cuenta, sin membresía, factura ni NCF');
  encender();
  let compraTransferencia = null;
  {
    espiarDemo();
    const antesB02 = siguienteB02();
    const antesMemb = membresiasDe(compradora.org.id);
    const antesFact = facturasTotales();
    let r = null;
    try {
      r = await comprar({ plan: 'destacado', cupo: 1, dias: 30 });
    } finally {
      soltarDemo();
    }
    const d = r.datos || {};
    compraTransferencia = d;
    ok(r.codigo === 202, `código ${r.codigo}`);
    ok(!!d.pago && d.pago.estado === 'pendiente' && d.membresia === null && d.comprobante === null,
      `pago ${d.pago && d.pago.estado}, membresía ${d.membresia}, comprobante ${d.comprobante}`);
    const t = d.transferencia || {};
    ok(t.banco === 'BANCO DE PRUEBA' && t.titular === 'TITULAR DE PRUEBA, S.R.L.' && t.rnc === '000000000'
      && t.tipoCuenta === 'corriente' && t.cuenta === '000-000000-0' && t.moneda === 'DOP',
    `transferencia=${JSON.stringify(d.transferencia)}`);
    ok(t.correo === 'facturacion@mercamaquinarias.com', `correo para el comprobante de la transferencia: ${t.correo}`);
    ok(typeof d.aviso === 'string' && /referencia/i.test(d.aviso) && /comprobante fiscal/i.test(d.aviso),
      `aviso: ${d.aviso}`);
    const fila = d.pago ? db.pagoPorId(d.pago.id) : null;
    ok(!!fila && !!d.cobro && fila.referencia === d.cobro.referencia && fila.total === d.cobro.total && d.cobro.total > 0,
      `referencia ${d.cobro && d.cobro.referencia} / ${fila && fila.referencia}, total ${d.cobro && d.cobro.total}`);
    ok(!!fila && fila.procesador === 'transferencia' && fila.estado === 'pendiente',
      `en la base: ${fila && fila.procesador} ${fila && fila.estado}`);
    ok(membresiasDe(compradora.org.id) === antesMemb, `membresías: ${membresiasDe(compradora.org.id)} (se esperaban ${antesMemb})`);
    ok(facturasTotales() === antesFact, `facturas: ${facturasTotales()} (se esperaban ${antesFact})`);
    ok(siguienteB02() === antesB02, `B02 avanzó ${siguienteB02() - antesB02} (se esperaba 0)`);
    ok(llamadasDemo === 0, `el procesador demo se llamó ${llamadasDemo} vez/veces`);
  }

  console.log('\n17. Encendida: pedir demo es un 400 y no deja pago');
  {
    espiarDemo();
    const antes = pagosTotales();
    let r = null;
    try {
      r = await comprar({ plan: 'destacado', cupo: 1, dias: 30, metodo: 'demo' });
    } finally {
      soltarDemo();
    }
    ok(r.codigo === 400 && (r.datos || {}).error === 'Ese método de pago no está disponible.',
      `código ${r.codigo}: ${(r.datos || {}).error}`);
    ok(pagosTotales() === antes, `pagos: ${pagosTotales()} (se esperaban ${antes})`);
    ok(llamadasDemo === 0, `demo se llamó ${llamadasDemo} vez/veces`);
  }

  console.log('\n18. Encendida: ampliar responde 202 con los datos y la membresía no cambia de cupo');
  let ampliacionTransferencia = null;
  {
    espiarDemo();
    const cupoAntes = idSuscCompradora ? cupoDe(idSuscCompradora) : null;
    const antesFact = facturasTotales();
    let r = { codigo: 0, datos: {} };
    try {
      if (idSuscCompradora) r = await ampliar(idSuscCompradora, { cupo: cupoAntes + 1 });
    } finally {
      soltarDemo();
    }
    const d = r.datos || {};
    ampliacionTransferencia = d;
    ok(r.codigo === 202 && !!d.pago && d.pago.estado === 'pendiente' && d.comprobante === null,
      `código ${r.codigo}, pago ${d.pago && d.pago.estado}`);
    ok(!!d.transferencia && d.transferencia.cuenta === '000-000000-0' && !!d.cobro && !!d.cobro.referencia,
      `transferencia ${JSON.stringify(d.transferencia)}`);
    ok(!!d.membresia && d.membresia.id === idSuscCompradora && d.membresia.anuncios_incluidos === cupoAntes,
      `membresía en la respuesta con ${d.membresia && d.membresia.anuncios_incluidos} cupo(s)`);
    ok(idSuscCompradora && cupoDe(idSuscCompradora) === cupoAntes, `cupo en la base: ${idSuscCompradora && cupoDe(idSuscCompradora)} (era ${cupoAntes})`);
    ok(facturasTotales() === antesFact, 'sin factura');
    ok(llamadasDemo === 0, `demo se llamó ${llamadasDemo} vez/veces`);
    const fila = d.pago ? db.pagoPorId(d.pago.id) : null;
    ok(!!fila && fila.procesador === 'transferencia', `procesador ${fila && fila.procesador}`);
  }

  console.log('\n19. Importe cero: al instante, sin transferencia, como siempre');
  {
    const r = await comprar({ plan: 'estandar', cupo: 1, dias: 30 });
    const d = r.datos || {};
    ok(r.codigo === 201 && !!d.cobro && d.cobro.total === 0 && !d.transferencia && !!d.membresia,
      `código ${r.codigo}, total ${d.cobro && d.cobro.total}, transferencia ${JSON.stringify(d.transferencia)}`);
  }

  console.log('\n20. Los correos: datos al comprador (no es comprobante fiscal) y aviso a facturación, sin teléfono');
  {
    const ref = compraTransferencia && compraTransferencia.cobro && compraTransferencia.cobro.referencia;
    const correos = ref ? correosCon(ref) : [];
    const alComprador = correos.find((c) => paraDe(c) === 'compradora-transferencia@prueba.invalid');
    const interno = correos.find((c) => paraDe(c) === 'facturacion@mercamaquinarias.com');
    ok(!!alComprador, `correo al comprador con la referencia ${ref}`);
    ok(!!alComprador && alComprador.texto.includes(dinero(compraTransferencia.cobro.total))
      && alComprador.texto.includes('000-000000-0') && alComprador.texto.includes('BANCO DE PRUEBA'),
    'lleva el importe en RD$ y los datos de la cuenta');
    ok(!!alComprador && /no es un comprobante fiscal/i.test(alComprador.texto)
      && /no es un comprobante fiscal/i.test(alComprador.html), 'dice que no es un comprobante fiscal (texto y HTML)');
    ok(!!alComprador && /Responder a: facturacion@mercamaquinarias\.com/.test(alComprador.texto),
      'se responde a facturación, que es a donde va el comprobante de la transferencia');
    ok(!!interno && interno.texto.includes(dinero(compraTransferencia.cobro.total)),
      'aviso interno a facturación con el importe');
    ok(correos.length > 0 && correos.every(sinTelefono), 'ninguno lleva un teléfono ni WhatsApp');
    const refAmp = ampliacionTransferencia && ampliacionTransferencia.cobro && ampliacionTransferencia.cobro.referencia;
    ok(!!refAmp && correosCon(refAmp).some((c) => paraDe(c) === 'compradora-transferencia@prueba.invalid'),
      'la ampliación también manda los datos al comprador');
  }

  console.log('\n21. GET /api/membresias: cada organización ve SUS pendientes, con los datos de la cuenta');
  {
    const propia = await misMembresias(compradora);
    const d = propia.datos || {};
    const ids = (d.pagosPendientes || []).map((p) => p.id);
    ok(propia.codigo === 200 && Array.isArray(d.pagosPendientes)
      && !!compraTransferencia.pago && ids.includes(compraTransferencia.pago.id),
    `la propia ve su pendiente (${ids.length})`);
    ok(!!d.transferencia && d.transferencia.cuenta === '000-000000-0' && d.transferencia.correo === 'facturacion@mercamaquinarias.com',
      `con los datos: ${JSON.stringify(d.transferencia)}`);
    const otra = await misMembresias(ajena);
    const o = otra.datos || {};
    ok(otra.codigo === 200 && Array.isArray(o.pagosPendientes) && o.pagosPendientes.length === 0,
      `la ajena no ve nada: ${JSON.stringify(o.pagosPendientes)}`);
    ok(!o.transferencia, 'y sin pendientes por transferencia no recibe la cuenta');

    // Apagada después: el pendiente se sigue listando, sin inventar cuenta.
    apagar();
    const tras = (await misMembresias(compradora)).datos || {};
    ok(Array.isArray(tras.pagosPendientes) && tras.pagosPendientes.some((p) => p.id === compraTransferencia.pago.id),
      'apagada: el pendiente sigue en la lista');
    ok(!tras.transferencia && typeof tras.avisoTransferencia === 'string'
      && tras.avisoTransferencia.includes('facturacion@mercamaquinarias.com'),
    `apagada: sin datos y con el aviso de escribir a facturación (${tras.avisoTransferencia})`);
    encender();
  }

  console.log('\n22. GET /api/planes dice qué métodos hay, sin la cuenta');
  {
    const r = await pedir({ url: '/api/planes' });
    const s = JSON.stringify(r.datos || {});
    ok(r.codigo === 200 && JSON.stringify((r.datos || {}).metodosPago) === '["transferencia"]',
      `encendida: metodosPago=${JSON.stringify((r.datos || {}).metodosPago)}`);
    ok(!s.includes('000-000000-0') && !s.includes('BANCO DE PRUEBA') && !s.includes('TITULAR DE PRUEBA'),
      'sin datos bancarios en una ruta pública');
    apagar();
    const r2 = await pedir({ url: '/api/planes' });
    ok(JSON.stringify((r2.datos || {}).metodosPago) === '["demo"]', `apagada: ${JSON.stringify((r2.datos || {}).metodosPago)}`);
    encender();
  }

  console.log('\n23. Al arrancar, una configuración a medias avisa con los NOMBRES que faltan, nunca los valores');
  {
    const arrancar = (entorno) => spawnSync(process.execPath, ['-e', "require('./tools/api')"], {
      cwd: path.join(__dirname, '..'),
      env: {
        PATH: process.env.PATH,
        MERCA_DB: path.join(BANCO, 'arranque.db'),
        MERCA_CORREO: 'archivo',
        MERCA_SECRETO: 'secreto-de-prueba-no-usar-en-produccion',
        ...entorno,
      },
      encoding: 'utf8',
    });
    const aMedias = arrancar({ MERCA_TRANSFERENCIA_BANCO: 'BANCO DE PRUEBA', MERCA_TRANSFERENCIA_CUENTA: '000-000000-0' });
    const salida = `${aMedias.stdout}${aMedias.stderr}`;
    ok(aMedias.status === 0, `el módulo carga (estado ${aMedias.status})`);
    ok(salida.includes('MERCA_TRANSFERENCIA_TITULAR') && salida.includes('MERCA_TRANSFERENCIA_RNC')
      && salida.includes('MERCA_TRANSFERENCIA_TIPO'), `nombra las que faltan: ${salida.trim()}`);
    ok(!salida.includes('BANCO DE PRUEBA') && !salida.includes('000-000000-0'), 'no escribe ningún valor');
    const sinNada = arrancar({});
    ok(!/MERCA_TRANSFERENCIA/.test(`${sinNada.stdout}${sinNada.stderr}`), 'sin ninguna variable no avisa: es lo normal');
    const completa = arrancar(PRUEBA);
    ok(!/MERCA_TRANSFERENCIA/.test(`${completa.stdout}${completa.stderr}`), 'completa tampoco avisa');
  }

  apagar();
  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
