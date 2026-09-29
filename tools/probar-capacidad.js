/**
 * probar-capacidad.js — «Agregar publicaciones activas»: prorrateo y guardas.
 *
 *   node tools/probar-capacidad.js
 *
 * POR QUÉ EXISTE
 *
 * Ampliar la capacidad de una membresía es un cobro que suma cupos, y la
 * fase 05.4 lo convierte en el gesto principal del dealer. Antes de que
 * las pantallas lo enseñen hay que asegurar que el servidor no deja
 * cobrar de menos ni regalar capacidad:
 *
 *   1. El prorrateo cobra los días que de verdad quedan (una renovación
 *      anticipada puede dejar `fin` a más de un ciclo) y la regla de
 *      uno gratis por cada cinco no cambia. El importe lo calcula
 *      siempre el servidor: un `total` o `precio` del cuerpo se ignora.
 *   2. Solo puede haber UNA operación de capacidad pendiente por
 *      membresía (ampliación o renovación). Dos ampliaciones pendientes
 *      sumarían capacidad dos veces sobre el mismo ciclo; una ampliación
 *      de importe cero fija el cupo absoluto y pisaría a la pendiente.
 *   3. `aprobarPago` no suma capacidad a una membresía que ya venció:
 *      la consola ya lo frenaba, pero CardNet (fase 6) y cualquier otra
 *      llamada a `confirmarPago` no. Sin comprobante ni NCF consumido.
 *   4. Ampliar exige la contratación vigente aceptada, como comprar.
 *
 * Como probar-transferencia.js, corre contra una base DESECHABLE en
 * `.tmp/prueba-capacidad/`, con el correo en modo archivo y sin red.
 * Los datos bancarios son falsos a la vista.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* Las variables de entorno ANTES de cargar db.js: la ruta de la base
   se resuelve al importarlo. Hecho después, la prueba escribiría en la
   base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-capacidad');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
process.env.MERCA_FOTOS = path.join(BANCO, 'fotos');
process.env.MERCA_VIDEOS = path.join(BANCO, 'videos');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

/* Un .env local o el entorno de quien corre la prueba no puede decidir
   el resultado: se borra todo lo que venga de fuera y la transferencia
   se enciende con datos falsos, para que los pagos con importe queden
   pendientes en vez de aprobarse solos con el procesador `demo`. */
for (const k of Object.keys(process.env)) {
  if (k.startsWith('MERCA_TRANSFERENCIA') || k.startsWith('MERCA_CARDNET')) delete process.env[k];
}
Object.assign(process.env, {
  MERCA_TRANSFERENCIA_BANCO: 'BANCO DE PRUEBA',
  MERCA_TRANSFERENCIA_TITULAR: 'TITULAR DE PRUEBA, S.R.L.',
  MERCA_TRANSFERENCIA_RNC: '000000000',
  MERCA_TRANSFERENCIA_TIPO: 'corriente',
  MERCA_TRANSFERENCIA_CUENTA: '000-000000-0',
});

const db = require('./db');
const pagos = require('./pagos');
const api = require('./api');
const precios = require('../assets/precios.js');
const legales = require('../assets/legales.js');
const { EventEmitter } = require('events');

const SELLO = Date.now().toString(36);
const DIA = 86400000;

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

/* Una conexión aparte para preparar fechas y mirar filas: lo que se
   prueba son las funciones de db.js, no el SQL de la prueba. */
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

const enDias = (dias) => new Date(Date.now() + dias * DIA).toISOString();
let contador = 0;
const referencia = (etiqueta) => `CAP-${etiqueta}-${SELLO}-${++contador}`;

const siguienteB02 = () => {
  const s = consulta("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B02' AND activa = 1");
  return s ? s.siguiente : null;
};
const siguienteB01 = () => {
  const s = consulta("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B01' AND activa = 1");
  return s ? s.siguiente : null;
};
const facturasTotales = () => consulta('SELECT COUNT(*) AS n FROM facturas').n;
const pagosTotales = () => consulta('SELECT COUNT(*) AS n FROM pagos').n;
const cupoDe = (idSusc) => consulta('SELECT anuncios_incluidos AS n FROM suscripciones WHERE id = ?', idSusc).n;
const estadoPago = (idPago) => consulta('SELECT estado FROM pagos WHERE id = ?', idPago).estado;

/* Cuenta de dealer con sesión. Por omisión acepta todas las
   condiciones vigentes (las versiones salen de `legales`, nunca
   escritas a mano: la fase sube la contratación). */
function cuenta(etiqueta, { sinLegales = false } = {}) {
  const correo = `${etiqueta}-${SELLO}@prueba.invalid`;
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre: `Prueba ${etiqueta}`,
    telefono: '8095550000', tipo: 'dealer', empresa: `Empresa ${etiqueta} ${SELLO}`,
  });
  if (!sinLegales) {
    Object.values(legales.DOCUMENTOS || {}).forEach((doc) => {
      db.registrarAceptacion({
        usuarioId: idUsuario, documento: doc.id, version: legales.versionDe(doc.id), ip: '127.0.0.1', userAgent: 'prueba',
      });
    });
  }
  return {
    idUsuario, correo,
    idOrg: db.organizacionDe(idUsuario).id,
    cabeceras: { cookie: `te_sesion=${db.abrirSesion(idUsuario)}`, 'cf-connecting-ip': '201.8.8.8' },
  };
}

/* Una membresía de `cupo` cupos que termina dentro de `finEnDias`. Se
   compra por el camino de importe cero y se le mueve el fin: el flujo
   normal tardaría semanas en producir estas fechas. */
function membresia(idOrg, { cupo = 3, dias = 30, finEnDias = 20, plan = 'destacado' } = {}) {
  const m = db.comprarCupos({
    idOrg, idPlan: plan, cupo, dias, cobro: { ...precios.desglose(0), referencia: referencia('BASE') },
  });
  ejecuta('UPDATE suscripciones SET fin = ? WHERE id = ?', enDias(finEnDias), m.id);
  return m.id;
}

const CLIENTE = { razonSocial: 'Cliente de prueba', correo: 'cliente@prueba.invalid' };

/* Una ampliación pendiente, armada como la arma la ruta. */
function ampliacionPendiente({ idOrg, idSusc, cupoActual, cupoNuevo, diasRestantes = 20, dias = 30 }) {
  const cobro = {
    ...precios.precioAmpliacion({
      precioUnitario: db.planPorId('destacado').precio, cupoActual, cupoNuevo, dias, diasRestantes,
    }),
    referencia: referencia('AMPL'), procesador: 'transferencia',
  };
  return db.registrarCobro({
    idOrg, idSusc, cobro,
    intencion: {
      tipo: 'ampliacion', idSusc, cupoAnterior: cupoActual, cupoNuevo, anadidos: cupoNuevo - cupoActual,
      concepto: `Ampliación de Destacado · ${cupoNuevo - cupoActual} cupos más · hasta ${cupoNuevo}`,
      cliente: CLIENTE, correoCliente: CLIENTE.correo,
    },
  });
}

/* Una petición de verdad contra el enrutador, con req y res fingidos. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-capacidad', ...cabeceras };
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

const ampliar = (idSusc, cuerpo, quien) =>
  pedir({ metodo: 'POST', url: `/api/membresias/${idSusc}/ampliar`, cuerpo, cabeceras: quien.cabeceras });
const renovar = (idSusc, quien, cuerpo = {}) =>
  pedir({ metodo: 'POST', url: `/api/membresias/${idSusc}/renovar`, cuerpo, cabeceras: quien.cabeceras });
const errorDe = (r) => ((r && r.datos) || {}).error || '';

(async () => {
  const PRECIO_LISTA = db.planPorId('destacado').precio;

  /* SECCIONES-1-2 */

  console.log('\n3. aprobarPago no suma capacidad a una membresía vencida');
  {
    const dueno = cuenta('vencida');

    // Método directo: `pagoPendienteDeAmpliacion` ve la pendiente de esa suscripción y de ninguna otra.
    const sVieja = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
    const sOtra = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
    ok(db.pagoPendienteDeAmpliacion(sVieja) === null, 'sin ampliación en espera: null');
    const p1 = ampliacionPendiente({ idOrg: dueno.idOrg, idSusc: sVieja, cupoActual: 3, cupoNuevo: 5 });
    const visto = db.pagoPendienteDeAmpliacion(sVieja);
    ok(!!visto && visto.id === p1.id, 'devuelve la pendiente de esa suscripción');
    ok(db.pagoPendienteDeAmpliacion(sOtra) === null, 'ignora las de otras suscripciones');

    // Vence por fecha: fin ayer.
    ejecuta('UPDATE suscripciones SET fin = ? WHERE id = ?', enDias(-1), sVieja);
    const facturasAntes = facturasTotales();
    const b02 = siguienteB02();
    const b01 = siguienteB01();
    const e = lanza(() => pagos.confirmarPago(p1.id));
    ok(!!e && e.codigo === 409, `fin pasado: lanza 409 (${e && e.codigo}: ${e && e.message})`);
    ok(cupoDe(sVieja) === 3, `el cupo sigue en 3 (${cupoDe(sVieja)})`);
    ok(estadoPago(p1.id) === 'pendiente', 'el pago sigue pendiente');
    ok(facturasTotales() === facturasAntes, 'ninguna factura nueva');
    ok(siguienteB02() === b02 && siguienteB01() === b01, 'el NCF no avanzó');

    // Vence por estado, con el fin todavía futuro.
    ejecuta("UPDATE suscripciones SET fin = ?, estado = 'vencida' WHERE id = ?", enDias(10), sVieja);
    const e2 = lanza(() => pagos.confirmarPago(p1.id));
    ok(!!e2 && e2.codigo === 409, `estado vencida: lanza 409 (${e2 && e2.codigo})`);
    ok(cupoDe(sVieja) === 3 && estadoPago(p1.id) === 'pendiente' && facturasTotales() === facturasAntes,
      'sin cupo, sin cambio de estado y sin factura');

    // Viva: se aprueba, suma, el comprobante cuadra y el NCF avanza una vez.
    const sViva = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
    const p2 = ampliacionPendiente({ idOrg: dueno.idOrg, idSusc: sViva, cupoActual: 3, cupoNuevo: 5 });
    const antesB02 = siguienteB02();
    const antesB01 = siguienteB01();
    const r = pagos.confirmarPago(p2.id);
    ok(cupoDe(sViva) === 5, `viva: el cupo pasa a 5 (${cupoDe(sViva)})`);
    ok(estadoPago(p2.id) === 'aprobado', 'el pago queda aprobado');
    const f = consulta("SELECT * FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", p2.id);
    ok(!!f && f.subtotal + f.itbis === f.total, `el comprobante cuadra: ${f && `${f.subtotal} + ${f.itbis} = ${f.total}`}`);
    const avance = (siguienteB02() - antesB02) + (siguienteB01() - antesB01);
    ok(avance === 1, `el NCF avanzó una vez (${avance})`);
    ok(!!r && !!r.comprobante, 'la confirmación devuelve el comprobante');
  }

  /* SECCIONES-4 */

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
