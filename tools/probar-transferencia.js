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
process.env.MERCA_FOTOS = path.join(BANCO, 'fotos');
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
const facturas = require('./facturas');
const precios = require('../assets/precios.js');
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

/* El cobro sale de la fórmula única, como en las rutas: `registrarCobro`
   rechaza un cobro armado a mano. El número que se pasa es la base. */
const cobroDe = (base, etiqueta, procesador = 'transferencia') =>
  ({ ...precios.desglose(base), referencia: referencia(etiqueta), procesador });

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
/* Un NCF (B02 y ocho cifras; un e-CF, E y doce) lleva diez dígitos
   seguidos tras la letra y casaba como teléfono en el correo del
   comprobante. Se quita antes de buscar: no es un canal de contacto. */
const sinNcf = (s) => String(s || '').replace(/\b[BE]\d{10,12}\b/g, '');
const sinTelefono = (c) => !TELEFONO.test(sinNcf(c.texto)) && !TELEFONO.test(sinNcf(c.html))
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

  /* ── 05-02, tarea 2: la consola marca la transferencia como recibida o la anula ───
     La administradora de la sección 7, ahora por el enrutador. La IP
     llega por CF-Connecting-IP, que es la fiable detrás de Cloudflare. */

  const IP_ADMIN = '190.1.2.3';
  const comoAdmin = { cookie: `te_sesion=${db.abrirSesion(idAdmin)}`, 'cf-connecting-ip': IP_ADMIN };
  const listarAdmin = (estado) =>
    pedir({ url: `/api/admin/pagos${estado ? `?estado=${estado}` : ''}`, cabeceras: comoAdmin });
  const recibido = (idPago, cuerpo = {}, cabeceras = comoAdmin) =>
    pedir({ metodo: 'POST', url: `/api/admin/pagos/${idPago}/recibido`, cuerpo, cabeceras });
  const anular = (idPago, cuerpo = {}, cabeceras = comoAdmin) =>
    pedir({ metodo: 'POST', url: `/api/admin/pagos/${idPago}/anular`, cuerpo, cabeceras });
  const todasLasFilas = () => consulta('SELECT COUNT(*) AS n FROM bitacora_admin').n;
  const ultimaFila = (accion) =>
    consulta('SELECT * FROM bitacora_admin WHERE accion = ? ORDER BY id DESC LIMIT 1', accion);
  const leer = (texto) => { try { return JSON.parse(texto); } catch (_) { return null; } };
  const TEXTO_D07 = 'La membresía que ampliaba este pago ya no existe. No se añadió ningún cupo ni se '
    + 'emitió comprobante. Anule el pago y devuelva la transferencia al cliente.';

  const idCompraTr = compraTransferencia && compraTransferencia.pago && compraTransferencia.pago.id;
  const idAmpliaTr = ampliacionTransferencia && ampliacionTransferencia.pago && ampliacionTransferencia.pago.id;

  console.log('\n24. GET /api/admin/pagos: las transferencias pendientes, y las aprobadas con su NCF');
  {
    const r = await listarAdmin();
    const d = r.datos || {};
    ok(r.codigo === 200 && d.estado === 'pendiente' && Array.isArray(d.pagos)
      && d.pagos.some((p) => p.id === idCompraTr) && d.pagos.every((p) => p.procesador === 'transferencia'),
    `código ${r.codigo}, estado ${d.estado}, ${d.pagos && d.pagos.length} pago(s)`);
    const a = await listarAdmin('aprobado');
    const fila = ((a.datos || {}).pagos || []).find((p) => p.id === pRecibida.id);
    ok(a.codigo === 200 && (a.datos || {}).estado === 'aprobado' && !!fila && !!fila.factura && !!fila.factura.ncf,
      `aprobado con NCF: ${fila && JSON.stringify(fila.factura)}`);
  }

  console.log('\n25. Marcar recibida: cupos, comprobante con NCF y fila de bitácora en la misma respuesta');
  let comprobanteCompra = null;
  {
    const antesB02 = siguienteB02();
    const antesMemb = membresiasDe(compradora.org.id);
    const antesFilas = filasBitacora('pago.transferencia_recibida');
    const r = idCompraTr ? await recibido(idCompraTr, { motivo: 'Ref. banco 123' }) : { codigo: 0, datos: {} };
    const d = r.datos || {};
    comprobanteCompra = d.comprobante;
    ok(r.codigo === 200 && d.yaEstaba === false && !!d.pago && d.pago.estado === 'aprobado',
      `código ${r.codigo}, pago ${d.pago && d.pago.estado}, yaEstaba ${d.yaEstaba}${d.error ? `, ${d.error}` : ''}`);
    ok(!!d.membresia && d.membresia.anuncios_incluidos === 1, `membresía con ${d.membresia && d.membresia.anuncios_incluidos} cupo(s)`);
    ok(!!d.comprobante && !!d.comprobante.numero && !!d.comprobante.tipo && !!d.comprobante.ncf
      && Object.keys(d.comprobante).length === 3, `comprobante ${JSON.stringify(d.comprobante)}`);
    ok(!!idCompraTr && db.pagoPorId(idCompraTr).estado === 'aprobado', 'en la base: aprobado');
    ok(membresiasDe(compradora.org.id) === antesMemb + 1, `membresías ${membresiasDe(compradora.org.id)} (se esperaban ${antesMemb + 1})`);
    ok(!!idCompraTr && facturasDelPago(idCompraTr) === 1, 'una factura');
    ok(siguienteB02() === antesB02 + 1, `B02 avanzó ${siguienteB02() - antesB02} (se esperaba 1)`);
    ok(filasBitacora('pago.transferencia_recibida') === antesFilas + 1, 'una fila de bitácora');
    const fila = ultimaFila('pago.transferencia_recibida');
    const antes = leer(fila && fila.antes);
    const despues = leer(fila && fila.despues);
    ok(!!fila && fila.organizacion_id === compradora.org.id && fila.admin_id === idAdmin
      && fila.objeto_tipo === 'pago' && fila.objeto_id === idCompraTr,
    `la fila: org ${fila && fila.organizacion_id}, admin ${fila && fila.admin_id}, objeto ${fila && fila.objeto_id}`);
    ok(!!fila && fila.ip === IP_ADMIN, `IP de CF-Connecting-IP: ${fila && fila.ip}`);
    ok(!!fila && fila.motivo === 'Ref. banco 123', `motivo: ${fila && fila.motivo}`);
    ok(!!antes && antes.estado === 'pendiente' && !!despues && despues.estado === 'aprobado'
      && despues.referencia === compraTransferencia.cobro.referencia && despues.yaEstaba === false,
    `antes ${fila && fila.antes} → después ${fila && fila.despues}`);
  }

  console.log('\n26. Pulsar otra vez: 200, yaEstaba, el mismo comprobante, B02 quieto y otra fila');
  {
    const antesB02 = siguienteB02();
    const antesFilas = filasBitacora('pago.transferencia_recibida');
    const r = idCompraTr ? await recibido(idCompraTr, {}) : { codigo: 0, datos: {} };
    const d = r.datos || {};
    ok(r.codigo === 200 && d.yaEstaba === true, `código ${r.codigo}, yaEstaba ${d.yaEstaba}`);
    ok(!!d.comprobante && !!comprobanteCompra && d.comprobante.numero === comprobanteCompra.numero
      && d.comprobante.ncf === comprobanteCompra.ncf, 'el mismo comprobante');
    ok(siguienteB02() === antesB02, `B02 avanzó ${siguienteB02() - antesB02} (se esperaba 0)`);
    ok(!!idCompraTr && facturasDelPago(idCompraTr) === 1, 'sigue habiendo una factura');
    ok(filasBitacora('pago.transferencia_recibida') === antesFilas + 1, 'una segunda fila (alguien pulsó)');
  }

  console.log('\n27. Lo que no se marca: otro procesador (409), inexistente (404), rechazado (409), y sin fila');
  {
    const pDemo = pendiente('DEMO-CONSOLA', { procesador: 'demo', idOrg: compradora.org.id });
    const pRech = pendiente('RECHAZADA', { idOrg: compradora.org.id });
    db.rechazarPago(pRech.id);
    const antes = todasLasFilas();
    const rDemo = await recibido(pDemo.id, {});
    ok(rDemo.codigo === 409 && db.pagoPorId(pDemo.id).estado === 'pendiente',
      `demo: código ${rDemo.codigo} (${(rDemo.datos || {}).error}), pago ${db.pagoPorId(pDemo.id).estado}`);
    const rNo = await recibido('no-existe', {});
    ok(rNo.codigo === 404, `inexistente: código ${rNo.codigo}`);
    const rRech = await recibido(pRech.id, {});
    ok(rRech.codigo === 409 && db.pagoPorId(pRech.id).estado === 'rechazado' && facturasDelPago(pRech.id) === 0,
      `rechazado: código ${rRech.codigo} (${(rRech.datos || {}).error})`);
    ok(todasLasFilas() === antes, `filas de bitácora: ${todasLasFilas() - antes} nuevas (se esperaban 0)`);
  }

  console.log('\n28. Ampliación cuya membresía ya no está: el listado lo dice y marcar recibido es 409 sin tocar nada');
  {
    ok(!!idSuscCompradora && !!idAmpliaTr, 'hay una ampliación pendiente de la sección 18');
    ejecuta("UPDATE suscripciones SET estado = 'vencida' WHERE id = ?", idSuscCompradora);
    const lista = ((await listarAdmin()).datos || {}).pagos || [];
    const fila = lista.find((p) => p.id === idAmpliaTr);
    ok(!!fila && fila.membresiaViva === false, `membresiaViva=${fila && fila.membresiaViva}`);
    const antesFilas = todasLasFilas();
    const antesB02 = siguienteB02();
    const cupoAntes = cupoDe(idSuscCompradora);
    const r = await recibido(idAmpliaTr, { motivo: 'Ref. banco 456' });
    ok(r.codigo === 409 && (r.datos || {}).error === TEXTO_D07, `código ${r.codigo}: ${(r.datos || {}).error}`);
    ok(db.pagoPorId(idAmpliaTr).estado === 'pendiente' && facturasDelPago(idAmpliaTr) === 0,
      `pago ${db.pagoPorId(idAmpliaTr).estado}, facturas ${facturasDelPago(idAmpliaTr)}`);
    ok(cupoDe(idSuscCompradora) === cupoAntes, 'la membresía vencida no recibió cupos');
    ok(todasLasFilas() === antesFilas && siguienteB02() === antesB02, 'sin fila y sin NCF');

    /* La carrera: la consulta previa todavía la ve, pero cuando se
       aprueba ya no existe. db.aprobarPago lanza 404 y la ruta lo
       traduce al mismo 409. */
    const base = db.comprarCupos({
      idOrg: compradora.org.id, idPlan: 'destacado', cupo: 1, dias: 30,
      cobro: { subtotal: 0, itbis: 0, total: 0, referencia: referencia('CARRERA-BASE') },
    });
    const pCarrera = db.registrarCobro({
      idOrg: compradora.org.id, idSusc: base.id, cobro: cobroDe(2000, 'CARRERA'),
      intencion: {
        tipo: 'ampliacion', idSusc: base.id, cupoAnterior: 1, cupoNuevo: 2, anadidos: 1,
        concepto: 'Ampliación de Destacado · 1 cupo más · hasta 2', cliente: CLIENTE, correoCliente: CLIENTE.correo,
      },
    });
    ejecuta('UPDATE pagos SET suscripcion_id = NULL WHERE suscripcion_id = ?', base.id);
    ejecuta('DELETE FROM suscripciones WHERE id = ?', base.id);
    const suscripcionOriginal = db.suscripcion;
    let rC = null;
    const antesC = todasLasFilas();
    try {
      db.suscripcion = (idSusc, idOrg) => (idSusc === base.id ? { id: base.id } : suscripcionOriginal(idSusc, idOrg));
      rC = await recibido(pCarrera.id, {});
    } finally {
      db.suscripcion = suscripcionOriginal;
    }
    ok(rC.codigo === 409 && (rC.datos || {}).error === TEXTO_D07, `carrera: código ${rC.codigo}: ${(rC.datos || {}).error}`);
    ok(db.pagoPorId(pCarrera.id).estado === 'pendiente' && facturasDelPago(pCarrera.id) === 0
      && todasLasFilas() === antesC, 'carrera: pago pendiente, sin factura y sin fila');
  }

  console.log('\n29. Anular: motivo obligatorio, rechazado sin NCF, con fila y correo al comprador');
  {
    const antesFilas = todasLasFilas();
    const sin = await anular(idAmpliaTr, {});
    const corto = await anular(idAmpliaTr, { motivo: 'no ' });
    ok(sin.codigo === 400 && corto.codigo === 400 && todasLasFilas() === antesFilas
      && db.pagoPorId(idAmpliaTr).estado === 'pendiente',
    `sin motivo ${sin.codigo}, motivo corto ${corto.codigo}`);

    const antesB02 = siguienteB02();
    const MOTIVO = 'La membresía venció antes de recibir la transferencia';
    const r = await anular(idAmpliaTr, { motivo: MOTIVO });
    const d = r.datos || {};
    ok(r.codigo === 200 && !!d.pago && d.pago.estado === 'rechazado', `código ${r.codigo}, pago ${d.pago && d.pago.estado}${d.error ? `, ${d.error}` : ''}`);
    ok(db.pagoPorId(idAmpliaTr).estado === 'rechazado' && facturasDelPago(idAmpliaTr) === 0 && siguienteB02() === antesB02,
      'en la base: rechazado, sin factura, sin NCF');
    const fila = ultimaFila('pago.transferencia_anulada');
    ok(!!fila && fila.objeto_id === idAmpliaTr && fila.motivo === MOTIVO && fila.organizacion_id === compradora.org.id
      && fila.ip === IP_ADMIN && fila.admin_id === idAdmin, `la fila: ${fila && fila.objeto_id}, ${fila && fila.motivo}`);
    const despues = leer(fila && fila.despues);
    ok(!!despues && despues.estado === 'rechazado' && (leer(fila.antes) || {}).estado === 'pendiente',
      `antes ${fila && fila.antes} → después ${fila && fila.despues}`);
    const refAmp = ampliacionTransferencia.cobro.referencia;
    const aviso = correosCon(refAmp).find((c) => paraDe(c) === 'compradora-transferencia@prueba.invalid'
      && c.texto.includes(MOTIVO));
    ok(!!aviso && sinTelefono(aviso), 'correo al comprador con el motivo, sin teléfono');

    const antes2 = todasLasFilas();
    const otraVez = await anular(idAmpliaTr, { motivo: MOTIVO });
    ok(otraVez.codigo === 409 && todasLasFilas() === antes2, `anular otra vez: ${otraVez.codigo}, sin fila`);
    const aprobado = await anular(idCompraTr, { motivo: 'Intento sobre un pago ya aprobado' });
    ok(aprobado.codigo === 409 && db.pagoPorId(idCompraTr).estado === 'aprobado' && todasLasFilas() === antes2,
      `anular un aprobado: ${aprobado.codigo} (${(aprobado.datos || {}).error})`);
    const pDemo = pendiente('DEMO-ANULA', { procesador: 'demo', idOrg: compradora.org.id });
    const demo = await anular(pDemo.id, { motivo: 'No es una transferencia' });
    ok(demo.codigo === 409 && db.pagoPorId(pDemo.id).estado === 'pendiente', `anular un demo: ${demo.codigo}`);
    const no = await anular('no-existe', { motivo: 'No existe este pago' });
    ok(no.codigo === 404 && todasLasFilas() === antes2, `anular inexistente: ${no.codigo}, sin fila`);
  }

  console.log('\n30. A quien no es administrador, las tres rutas le responden 404');
  {
    const lista = await pedir({ url: '/api/admin/pagos', cabeceras: compradora.cabeceras });
    const pOtro = pendiente('NO-ADMIN', { idOrg: ajena.org.id });
    const marca = await recibido(pOtro.id, {}, compradora.cabeceras);
    const anula = await anular(pOtro.id, { motivo: 'Intento sin permiso' }, compradora.cabeceras);
    ok(lista.codigo === 404 && marca.codigo === 404 && anula.codigo === 404,
      `listar ${lista.codigo}, recibido ${marca.codigo}, anular ${anula.codigo}`);
    ok(db.pagoPorId(pOtro.id).estado === 'pendiente', 'el pago sigue pendiente');
  }

  console.log('\n31. La guarda de la bitácora ve las dos escrituras nuevas');
  {
    const ruta = (patron) => api.RUTAS.find(([m, p]) => m === 'POST' && p.source === patron);
    const rec = ruta('^\\/api\\/admin\\/pagos\\/([\\w-]+)\\/recibido$');
    const anu = ruta('^\\/api\\/admin\\/pagos\\/([\\w-]+)\\/anular$');
    ok(!!rec && rec[2].bitacora === 'pago.transferencia_recibida' && !api.ESCRITURAS_ADMIN_PROPIAS.has(rec[2]),
      `recibido: ${rec ? rec[2].bitacora : 'sin ruta'}`);
    ok(!!anu && anu[2].bitacora === 'pago.transferencia_anulada' && !api.ESCRITURAS_ADMIN_PROPIAS.has(anu[2]),
      `anular: ${anu ? anu[2].bitacora : 'sin ruta'}`);
    const idxGet = api.RUTAS.findIndex(([m, p]) => m === 'GET' && p.source === '^\\/api\\/admin\\/pagos$');
    ok(idxGet >= 0, 'GET /api/admin/pagos está en RUTAS');
    const fuente = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
    ok(!/db\.aprobarPago/.test(fuente), 'api.js no llama a db.aprobarPago: la transición es pagos.confirmarPago');
  }

  /* ── 05-05: extremo a extremo ─────────────────────────────────
     El criterio 5 de la fase entero, por el enrutador y sin atajos:
     una organización que no existía compra cupos por transferencia,
     no puede publicar mientras el pago espera, el personal lo marca
     recibido y entonces publica un anuncio que el público ve.

     Es la razón de ser de la fase: el 14 de octubre tiene que poderse
     cobrar y publicar sin CardNet ni nadie de fuera. Cada eslabón ya
     tiene su prueba suelta arriba; esta falla si se rompe la cadena
     aunque cada eslabón por separado siga en verde (por ejemplo, si el
     marcado otorga cupos en una membresía que `publicar` no encuentra).

     Organización NUEVA a propósito: con una de las secciones previas,
     «una fila de bitácora» y «un comprobante» se contarían mezclados
     con los de antes y la comprobación no diría nada. */

  console.log('\n32. Extremo a extremo: comprar por transferencia, marcar recibido, publicar');
  {
    encender();
    ok(JSON.stringify(pagos.metodosDeCobro()) === '["transferencia"]',
      `encendida, el comprador solo tiene transferencia: ${JSON.stringify(pagos.metodosDeCobro())}`);
    /* Si la fase 6 ya añadió su pasarela, aquí tiene que estar apagada:
       el recorrido demuestra que se cobra SIN ningún procesador externo. */
    const otros = Object.keys(pagos.PROCESADORES).filter((k) => k !== 'demo' && k !== 'transferencia');
    ok(otros.every((k) => !pagos.metodosDeCobro().includes(k)),
      `ninguna pasarela al alcance del comprador (${otros.length ? otros.join(', ') : 'ninguna definida'})`);

    let llamadasDemoE2E = 0;
    const demoAntes = pagos.PROCESADORES.demo;
    pagos.PROCESADORES.demo = async () => { llamadasDemoE2E++; return { resultado: 'aprobado' }; };
    try {
      const nueva = cuentaConLegales('extremo-transferencia@prueba.invalid', 'Empresa de Extremo a Extremo');
      const idOrgNueva = nueva.org && nueva.org.id;
      ok(!!idOrgNueva && membresiasDe(idOrgNueva) === 0 && db.facturasDe(idOrgNueva).length === 0,
        'la organización es nueva: sin membresías ni facturas');
      const filasDeOrg = () =>
        consulta('SELECT COUNT(*) AS n FROM bitacora_admin WHERE organizacion_id = ?', idOrgNueva).n;

      // El catálogo de planes ofrece la transferencia, sin la cuenta.
      const planes = await pedir({ url: '/api/planes', cabeceras: nueva.cabeceras });
      ok(planes.codigo === 200 && JSON.stringify((planes.datos || {}).metodosPago) === '["transferencia"]',
        `GET /api/planes: metodosPago=${JSON.stringify((planes.datos || {}).metodosPago)}`);

      // Pide los cupos sin decir método: el servidor elige transferencia.
      const antesB02 = siguienteB02();
      const compra = await comprar({ plan: 'destacado', cupo: 1, dias: 30 }, nueva);
      const c = compra.datos || {};
      const ref = c.cobro && c.cobro.referencia;
      const idPago = c.pago && c.pago.id;
      ok(compra.codigo === 202 && !!c.pago && c.pago.estado === 'pendiente' && !!ref
        && !!c.transferencia && c.transferencia.cuenta === '000-000000-0',
      `compra: código ${compra.codigo}, pago ${c.pago && c.pago.estado}, referencia ${ref}`);

      // Las fotos se suben antes, como hace publicar.html.
      const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
        + 'AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
      const foto = await pedir({ metodo: 'POST', url: '/api/fotos', cuerpo: { completa: PNG }, cabeceras: nueva.cabeceras });
      const rutaFoto = (foto.datos || {}).completa;
      ok(foto.codigo === 201 && /^\/fotos\//.test(rutaFoto || ''), `foto subida: ${foto.codigo} ${rutaFoto}`);
      const ANUNCIO = {
        categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt', modelo: '567',
        anio: 2019, condicion: 'usado', usoValor: 1000, usoUnidad: 'km',
        descripcion: `Prueba de extremo a extremo de la transferencia ${SELLO}.`,
        provincia: 'santo-domingo', precio: 1000000, moneda: 'DOP',
        fotos: [rutaFoto, rutaFoto, rutaFoto],
        /* El teléfono del VENDEDOR en su anuncio, que es la prestación
           del plan; no es un canal de soporte del sitio. */
        telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }],
      };

      // Mientras el pago espera: no publica, y no hay nada otorgado ni emitido.
      const antesDeTiempo = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: ANUNCIO, cabeceras: nueva.cabeceras });
      ok(antesDeTiempo.codigo === 402
        && (antesDeTiempo.datos || {}).error === 'Todavía no tiene cupos. Contrate un plan para publicar este equipo.',
      `publicar con el pago pendiente: ${antesDeTiempo.codigo} (${(antesDeTiempo.datos || {}).error})`);
      const espera = (await misMembresias(nueva)).datos || {};
      ok(Array.isArray(espera.pagosPendientes) && espera.pagosPendientes.length === 1
        && espera.pagosPendientes[0].referencia === ref,
      `pagosPendientes: ${JSON.stringify((espera.pagosPendientes || []).map((p) => p.referencia))}`);
      ok(Array.isArray(espera.membresias) && espera.membresias.length === 0, 'ninguna membresía todavía');
      ok(db.facturasDe(idOrgNueva).length === 0 && siguienteB02() === antesB02,
        `sin factura ni NCF antes del marcado (facturas ${db.facturasDe(idOrgNueva).length}, B02 +${siguienteB02() - antesB02})`);
      ok(filasDeOrg() === 0, 'sin fila de bitácora antes del marcado');

      // El personal la ve en la consola y la marca recibida.
      const consola = (await listarAdmin()).datos || {};
      ok((consola.pagos || []).some((p) => p.id === idPago && p.referencia === ref && p.organizacion === 'Empresa de Extremo a Extremo'),
        'la consola lista el pago con su referencia y la empresa');
      const IP_E2E = '190.5.5.5';
      const marcado = await recibido(idPago, { motivo: 'Ref. banco E2E' },
        { ...comoAdmin, 'cf-connecting-ip': IP_E2E });
      const m = marcado.datos || {};
      ok(marcado.codigo === 200 && !!m.comprobante && /^B02\d{8}$/.test(m.comprobante.ncf || ''),
        `marcar recibido: ${marcado.codigo}, NCF ${m.comprobante && m.comprobante.ncf}${m.error ? `, ${m.error}` : ''}`);

      // Ahora sí: una membresía, un comprobante del pago, una fila.
      ok(membresiasDe(idOrgNueva) === 1 && !!m.membresia && m.membresia.anuncios_incluidos === 1,
        `membresías ${membresiasDe(idOrgNueva)}, cupos ${m.membresia && m.membresia.anuncios_incluidos}`);
      const facturasOrg = db.facturasDe(idOrgNueva);
      ok(facturasOrg.length === 1 && facturasDelPago(idPago) === 1
        && facturasOrg[0].ncf === m.comprobante.ncf && siguienteB02() === antesB02 + 1,
      `un comprobante con NCF ${facturasOrg[0] && facturasOrg[0].ncf}, B02 +${siguienteB02() - antesB02}`);
      ok(filasDeOrg() === 1, `filas de bitácora de la organización: ${filasDeOrg()} (se esperaba 1)`);
      const fila = consulta('SELECT * FROM bitacora_admin WHERE organizacion_id = ?', idOrgNueva);
      ok(!!fila && fila.accion === 'pago.transferencia_recibida' && fila.ip === IP_E2E
        && fila.objeto_id === idPago && fila.admin_id === idAdmin,
      `la fila: ${fila && fila.accion}, IP ${fila && fila.ip}`);
      const tras = (await misMembresias(nueva)).datos || {};
      ok(Array.isArray(tras.pagosPendientes) && tras.pagosPendientes.length === 0, 'pagosPendientes vacío');

      /* El comprobante se envía sin esperar a la respuesta: se le da un
         momento al transporte de archivo antes de buscarlo. Se busca
         por la referencia, que es de esta pasada: el NCF se repite en
         cada base nueva y la bandeja guarda los correos de las
         anteriores. */
      let alCliente = null;
      for (let i = 0; i < 40 && !alCliente; i++) {
        alCliente = correosCon(ref).find((x) => paraDe(x) === 'extremo-transferencia@prueba.invalid'
          && x.texto.includes(`NCF: ${m.comprobante.ncf}`)) || null;
        if (!alCliente) await new Promise((r) => setTimeout(r, 50));
      }
      ok(!!alCliente, `correo del comprobante al comprador con el NCF y la referencia ${ref}`);
      ok(!!alCliente && sinTelefono(alCliente), 'sin teléfono ni WhatsApp');

      // Y publica: el anuncio sale en el catálogo público, sin sesión.
      const publicado = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: ANUNCIO, cabeceras: nueva.cabeceras });
      const idAnuncio = publicado.datos && publicado.datos.anuncio && publicado.datos.anuncio.id;
      ok(publicado.codigo === 201 && !!idAnuncio,
        `publicar tras el marcado: ${publicado.codigo}${(publicado.datos || {}).error ? ` (${publicado.datos.error})` : ''}`);
      const catalogo = await pedir({ url: '/api/anuncios?categoria=camiones&porPagina=50' });
      ok(catalogo.codigo === 200 && ((catalogo.datos || {}).anuncios || []).some((a) => a.id === idAnuncio),
        `el anuncio está en el catálogo público (${((catalogo.datos || {}).anuncios || []).length} en la página)`);
    } finally {
      pagos.PROCESADORES.demo = demoAntes;
    }
    ok(llamadasDemoE2E === 0, `el procesador demo se llamó ${llamadasDemoE2E} vez/veces en todo el recorrido`);
  }

  /* ── 05.1-04: precio único por transferencia, de punta a punta ───
     Es el FISCAL de la sección 39 de research/modelo-comercial.md, por
     el camino de cobro que ya está en producción (apagado hasta los
     cinco datos bancarios): el ajuste del 3 % vive dentro del subtotal
     gravado, nunca a la vista del comprador; la consola sí lo ve; el
     comprobante cuadra; y anular un pendiente no gasta NCF.

     Los importes esperados (3889, 3296, 593, 6685…) se escriben
     literales porque son los de la tabla de la auditoría §3 que Victor
     aprobó: si no salen, falla la fórmula, no la prueba. */

  const NOMBRA_AJUSTE_33 = /ajuste|comisi[oó]n|\+ ?3 ?%/i;
  const CORREO_CON_AJUSTE_33 = /ajuste|comisi[oó]n|\+ ?3 ?%|RD\$3,200\b/i;

  console.log('\n33. Precio único por transferencia: el 3 % dentro del subtotal, el comprobante cuadra y anular no gasta NCF');
  {
    encender();
    let llamadasDemo33 = 0;
    const demoAntes33 = pagos.PROCESADORES.demo;
    pagos.PROCESADORES.demo = async () => { llamadasDemo33++; return { resultado: 'aprobado' }; };
    try {
      const nueva = cuentaConLegales('precio-unico-transferencia@prueba.invalid', 'Empresa de Precio Único');

      // Comprar 1 cupo Destacado 30 días: 202, total 3889, sin base ni ajuste en la respuesta.
      const antesB02 = siguienteB02();
      const compra = await comprar({ plan: 'destacado', cupo: 1, dias: 30 }, nueva);
      const c = compra.datos || {};
      ok(compra.codigo === 202 && !!c.cobro && c.cobro.total === 3889
        && !('base' in c.cobro) && !('ajuste' in c.cobro) && !('ajusteTasa' in c.cobro),
      `compra: código ${compra.codigo}, total ${c.cobro && c.cobro.total}, claves ${c.cobro ? Object.keys(c.cobro).join(', ') : 'sin cobro'}`);
      const idPago = c.pago && c.pago.id;
      const ref = c.cobro && c.cobro.referencia;

      // La fila del pago: pendiente, con el desglose completo guardado.
      const fila = idPago ? db.pagoPorId(idPago) : null;
      ok(!!fila && fila.estado === 'pendiente' && fila.procesador === 'transferencia'
        && fila.base === 3200 && fila.ajuste === 96 && fila.ajuste_tasa === 0.03
        && fila.subtotal === 3296 && fila.itbis === 593 && fila.itbis_tasa === 0.18 && fila.total === 3889,
      fila ? `base ${fila.base} ajuste ${fila.ajuste} (${fila.ajuste_tasa}) subtotal ${fila.subtotal} itbis ${fila.itbis} (${fila.itbis_tasa}) total ${fila.total}`
        : 'sin pago');

      // El correo de datos de transferencia dice el final, nunca la base ni el ajuste.
      let alComprador = null;
      for (let i = 0; i < 40 && !alComprador; i++) {
        alComprador = correosCon(ref).find((x) => paraDe(x) === 'precio-unico-transferencia@prueba.invalid') || null;
        if (!alComprador) await new Promise((r) => setTimeout(r, 50));
      }
      ok(!!alComprador && alComprador.texto.includes(dinero(3889)), `correo de datos con ${dinero(3889)}`);
      ok(!!alComprador && !CORREO_CON_AJUSTE_33.test(alComprador.texto) && !CORREO_CON_AJUSTE_33.test(alComprador.html),
        'el correo no nombra el ajuste ni la base (RD$3,200)');

      // GET /api/membresias del comprador: el pendiente, sin base ni ajuste.
      const propia = (await misMembresias(nueva)).datos || {};
      const pend = (propia.pagosPendientes || []).find((p) => p.id === idPago);
      ok(!!pend && !('base' in pend) && !('ajuste' in pend),
        `pagosPendientes: ${pend ? Object.keys(pend).join(', ') : 'no encontrado'}`);

      // La consola sí ve base y ajuste.
      const consola = db.pagosParaConsola({ estado: 'pendiente' }).find((p) => p.id === idPago);
      ok(!!consola && consola.base === 3200 && consola.ajuste === 96,
        `consola: base ${consola && consola.base}, ajuste ${consola && consola.ajuste}`);

      // Marcar recibido: B02, comprobante que cuadra, pactado = base.
      const marcado = await recibido(idPago, { motivo: 'Ref. banco precio único' });
      const m = marcado.datos || {};
      ok(marcado.codigo === 200 && !!m.comprobante && /^B02\d{8}$/.test(m.comprobante.ncf || ''),
        `marcar recibido: ${marcado.codigo}, NCF ${m.comprobante && m.comprobante.ncf}${m.error ? `, ${m.error}` : ''}`);
      ok(siguienteB02() === antesB02 + 1, `B02 avanzó ${siguienteB02() - antesB02} (se esperaba 1)`);

      const f = idPago ? db.facturaDePago(idPago) : null;
      ok(!!f && f.subtotal === 3296 && f.itbis === 593 && f.total === 3889
        && f.subtotal + f.itbis === f.total && !!fila && f.total === fila.total,
      f ? `comprobante ${f.ncf}: ${f.subtotal} + ${f.itbis} = ${f.total} (cobrado ${fila && fila.total})` : 'sin comprobante');
      const s = consulta(
        'SELECT precio_pactado FROM suscripciones WHERE organizacion_id = ? ORDER BY creada DESC LIMIT 1', nueva.org.id);
      ok(!!s && s.precio_pactado === 3200, `precio_pactado=${s && s.precio_pactado} (se esperaba 3200)`);
      const html = f ? facturas.comoHtml(f) : '';
      const casa = html.match(NOMBRA_AJUSTE_33);
      ok(!!html && !casa, casa ? `el comprobante nombra el ajuste: «${casa[0]}»` : 'el comprobante no nombra el ajuste');

      // Segunda compra, Premium, anulada: sin factura ni NCF gastado.
      const antesB02b = siguienteB02();
      const compra2 = await comprar({ plan: 'premium', cupo: 1, dias: 30 }, nueva);
      const c2 = compra2.datos || {};
      ok(compra2.codigo === 202 && !!c2.cobro && c2.cobro.total === 6685,
        `segunda compra (premium): código ${compra2.codigo}, total ${c2.cobro && c2.cobro.total}`);
      const idPago2 = c2.pago && c2.pago.id;
      const fila2 = idPago2 ? db.pagoPorId(idPago2) : null;
      ok(!!fila2 && fila2.base === 5500 && fila2.ajuste === 165 && fila2.subtotal === 5665
        && fila2.itbis === 1020 && fila2.total === 6685,
      fila2 ? `base ${fila2.base} ajuste ${fila2.ajuste} subtotal ${fila2.subtotal} itbis ${fila2.itbis} total ${fila2.total}`
        : 'sin pago');

      const anulado = idPago2 ? await anular(idPago2, { motivo: 'Prueba: anular sin gastar NCF' }) : { codigo: 0, datos: {} };
      const a = anulado.datos || {};
      ok(anulado.codigo === 200 && !!a.pago && a.pago.estado === 'rechazado',
        `anular: ${anulado.codigo}, pago ${a.pago && a.pago.estado}${a.error ? `, ${a.error}` : ''}`);
      ok(!!idPago2 && db.pagoPorId(idPago2).estado === 'rechazado' && siguienteB02() === antesB02b
        && facturasDelPago(idPago2) === 0,
      `en la base: rechazado, B02 quieto (+${siguienteB02() - antesB02b}), sin factura`);
    } finally {
      pagos.PROCESADORES.demo = demoAntes33;
    }
    ok(llamadasDemo33 === 0, `el procesador demo se llamó ${llamadasDemo33} vez/veces en la sección 33`);
  }

  apagar();
  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
