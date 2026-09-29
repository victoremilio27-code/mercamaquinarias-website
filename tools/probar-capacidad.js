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

/* Abrir la base aplica el esquema y las migraciones. Sin una secuencia
   activa el sitio emite recibos sin valor fiscal y no se consume NCF, y
   la prueba de «el NCF no avanzó» no diría nada. */
db.secuenciasNcf();
db.cargarSecuencia({
  tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 500,
  vence: '2027-12-31', usaSitio: true,
});

(async () => {
  const PRECIO_LISTA = db.planPorId('destacado').precio;

  console.log('\n1. Prorrateo y regla del quinto por la ruta; el importe lo calcula el servidor');
  {
    const dueno = cuenta('prorrateo');
    const sTres = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
    const esperado = precios.precioAmpliacion({
      precioUnitario: PRECIO_LISTA, cupoActual: 3, cupoNuevo: 7, dias: 30, diasRestantes: 20,
    });
    const pagosAntes = pagosTotales();
    const r = await ampliar(sTres, { cupo: 7, total: 1, precio: 1, base: 1, subtotal: 1 }, dueno);
    const d = r.datos || {};
    ok(r.codigo === 202, `3 a 7 con importe: 202 pendiente (${r.codigo}: ${errorDe(r)})`);
    ok(!!d.cobro && d.cobro.total === esperado.total && esperado.total > 0,
      `el total es el del servidor (${d.cobro && d.cobro.total}, se esperaba ${esperado.total}), no el 1 del cuerpo`);
    ok(esperado.cobrados === 3 && esperado.gratis === 1, `3 cobrables y 1 gratis (${esperado.cobrados}/${esperado.gratis})`);
    ok(!!d.cobro && !('base' in d.cobro) && !('ajuste' in d.cobro) && !('ajusteTasa' in d.cobro),
      'la respuesta al dealer no lleva base ni ajuste');
    ok(pagosTotales() === pagosAntes + 1, 'un solo pago nuevo');
    ok(cupoDe(sTres) === 3, 'el cupo no cambia hasta confirmar');

    // De 4 a 5: el quinto es el gratis, al instante y sin importe.
    const sCuatro = membresia(dueno.idOrg, { cupo: 4, finEnDias: 20 });
    const r5 = await ampliar(sCuatro, { cupo: 5 }, dueno);
    const d5 = r5.datos || {};
    ok(r5.codigo === 200 && !!d5.cobro && d5.cobro.total === 0, `4 a 5: 200 y total 0 (${r5.codigo}, ${d5.cobro && d5.cobro.total})`);
    const p5 = d5.cobro && consulta('SELECT procesador, estado FROM pagos WHERE referencia = ?', d5.cobro.referencia);
    ok(!!p5 && p5.procesador === 'sin-costo' && p5.estado === 'aprobado', `pago sin-costo aprobado (${p5 && p5.procesador}/${p5 && p5.estado})`);
    ok(cupoDe(sCuatro) === 5, `cupo 5 (${cupoDe(sCuatro)})`);

    // Renovada por adelantado: fin a más de un ciclo, se cobran los días reales.
    const sLarga = membresia(dueno.idOrg, { cupo: 3, finEnDias: 50 });
    const esperado50 = precios.precioAmpliacion({
      precioUnitario: PRECIO_LISTA, cupoActual: 3, cupoNuevo: 4, dias: 30, diasRestantes: 50,
    });
    const r50 = await ampliar(sLarga, { cupo: 4 }, dueno);
    ok(r50.codigo === 202 && !!r50.datos.cobro && r50.datos.cobro.total === esperado50.total,
      `fin a +50 días: total ${r50.datos && r50.datos.cobro && r50.datos.cobro.total}, se esperaba ${esperado50.total}`);
    const treinta = precios.precioAmpliacion({
      precioUnitario: PRECIO_LISTA, cupoActual: 3, cupoNuevo: 4, dias: 30, diasRestantes: 30,
    });
    ok(esperado50.total > treinta.total, 'y es más que con el tope de un ciclo (P13)');
  }

  console.log('\n2. Una sola operación de capacidad pendiente por membresía');
  {
    const dueno = cuenta('unica');
    const sA = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
    const r1 = await ampliar(sA, { cupo: 7 }, dueno);
    ok(r1.codigo === 202, `primera ampliación: 202 (${r1.codigo}: ${errorDe(r1)})`);
    const p1 = db.pagoPendienteDeAmpliacion(sA);
    ok(!!p1, 'queda registrada como pendiente');

    const antes = pagosTotales();
    const r2 = await ampliar(sA, { cupo: 9 }, dueno);
    ok(r2.codigo === 409 && errorDe(r2).includes(p1.referencia) && !!(r2.datos || {}).pago,
      `segunda con importe: 409 con la referencia (${r2.codigo}: ${errorDe(r2)})`);
    ok(pagosTotales() === antes && cupoDe(sA) === 3, 'sin pago nuevo y sin cambiar el cupo');

    // Importe cero (4 a 5) con otra ampliación pendiente: también 409.
    const sB = membresia(dueno.idOrg, { cupo: 4, finEnDias: 20 });
    const rB = await ampliar(sB, { cupo: 6 }, dueno);
    ok(rB.codigo === 202, `4 a 6 pendiente (${rB.codigo}: ${errorDe(rB)})`);
    const antesB = pagosTotales();
    const rB2 = await ampliar(sB, { cupo: 5 }, dueno);
    ok(rB2.codigo === 409, `4 a 5 de importe cero con una pendiente: 409 (${rB2.codigo}: ${errorDe(rB2)})`);
    ok(cupoDe(sB) === 4, `anuncios_incluidos sigue en 4 (${cupoDe(sB)})`);
    ok(pagosTotales() === antesB, 'ninguna fila de pagos nueva');

    // Renovar con una ampliación pendiente.
    const antesR = pagosTotales();
    const rR = await renovar(sA, dueno);
    ok(rR.codigo === 409 && errorDe(rR).includes(p1.referencia), `renovar con ampliación pendiente: 409 (${rR.codigo}: ${errorDe(rR)})`);
    ok(pagosTotales() === antesR, 'sin pago nuevo');

    // Ampliar con una renovación pendiente.
    const sC = membresia(dueno.idOrg, { cupo: 2, finEnDias: 20 });
    const rC = await renovar(sC, dueno);
    ok(rC.codigo === 202, `renovación pendiente (${rC.codigo}: ${errorDe(rC)})`);
    const antesC = pagosTotales();
    const rC2 = await ampliar(sC, { cupo: 3 }, dueno);
    ok(rC2.codigo === 409, `ampliar con renovación pendiente: 409 (${rC2.codigo}: ${errorDe(rC2)})`);
    ok(pagosTotales() === antesC && cupoDe(sC) === 2, 'sin pago nuevo ni cupo distinto');

    // Al anular la pendiente se vuelve a aceptar.
    db.rechazarPago(p1.id);
    const r3 = await ampliar(sA, { cupo: 7 }, dueno);
    ok(r3.codigo === 202, `anulada la pendiente, ampliar vuelve a aceptarse (${r3.codigo}: ${errorDe(r3)})`);
  }

  console.log('\n3b. La consola traduce la ampliación huérfana a 409');
  {
    const dueno = cuenta('huerfana');
    const { idUsuario: idAdmin } = db.crearCuenta({
      correo: `admin-${SELLO}@prueba.invalid`, clave: 'UnaClaveLargaYSegura9',
      nombre: 'Administradora de Prueba', telefono: '8095550000', tipo: 'particular',
    });
    db.marcarAdmin(`admin-${SELLO}@prueba.invalid`, true);
    const comoAdmin = { cookie: `te_sesion=${db.abrirSesion(idAdmin)}`, 'cf-connecting-ip': '190.1.2.3' };
    const recibido = (idPago) =>
      pedir({ metodo: 'POST', url: `/api/admin/pagos/${idPago}/recibido`, cuerpo: {}, cabeceras: comoAdmin });

    const sH = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
    const pH = ampliacionPendiente({ idOrg: dueno.idOrg, idSusc: sH, cupoActual: 3, cupoNuevo: 5 });
    ejecuta('UPDATE suscripciones SET fin = ? WHERE id = ?', enDias(-1), sH);
    const facturasAntes = facturasTotales();
    const b02 = siguienteB02();
    const r = await recibido(pH.id);
    ok(r.codigo === 409 && errorDe(r).includes('Anule el pago'), `vista previa: 409 (${r.codigo}: ${errorDe(r)})`);

    // La carrera: la consulta previa todavía la ve viva, pero al aprobar ya no lo está.
    const original = db.suscripcion;
    let rC = null;
    try {
      db.suscripcion = (idSusc, idOrg) => (idSusc === sH ? { id: sH } : original(idSusc, idOrg));
      rC = await recibido(pH.id);
    } finally {
      db.suscripcion = original;
    }
    ok(rC.codigo === 409 && errorDe(rC).includes('Anule el pago'), `carrera: 409 con el texto de la huérfana (${rC.codigo}: ${errorDe(rC)})`);
    ok(estadoPago(pH.id) === 'pendiente' && cupoDe(sH) === 3 && facturasTotales() === facturasAntes && siguienteB02() === b02,
      'pago pendiente, sin cupo, sin factura y sin NCF');
  }

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

  console.log('\n4. Ampliar exige la contratación vigente aceptada');
  {
    const sin = cuenta('sinlegales', { sinLegales: true });
    const s = membresia(sin.idOrg, { cupo: 3, finEnDias: 20 });
    const antes = pagosTotales();
    const r = await ampliar(s, { cupo: 7 }, sin);
    ok(r.codigo === 409 && Array.isArray((r.datos || {}).faltan) && r.datos.faltan.includes('contratacion'),
      `sin aceptar: 409 con faltan (${r.codigo}: ${JSON.stringify((r.datos || {}).faltan)})`);
    ok(pagosTotales() === antes && cupoDe(s) === 3, 'ningún pago y el cupo no cambia');

    // Con importe cero (4 a 5) también se exige: no es un atajo para saltarse la aceptación.
    const s4 = membresia(sin.idOrg, { cupo: 4, finEnDias: 20 });
    const r0 = await ampliar(s4, { cupo: 5 }, sin);
    ok(r0.codigo === 409 && cupoDe(s4) === 4, `4 a 5 sin aceptar: 409 y cupo 4 (${r0.codigo}, ${cupoDe(s4)})`);

    // Aceptada la contratación, pasa.
    legales.PARA_PAGAR.forEach((id) => db.registrarAceptacion({
      usuarioId: sin.idUsuario, documento: id, version: legales.versionDe(id), ip: '127.0.0.1', userAgent: 'prueba',
    }));
    const r2 = await ampliar(s, { cupo: 7 }, sin);
    ok(r2.codigo === 202, `aceptadas las condiciones: 202 (${r2.codigo}: ${errorDe(r2)})`);
  }

  console.log('\n5. La API le habla al dealer de capacidad y publicaciones activas, no de «cupos»');
  {
    const SIN_CUPO = (r) => !/cupo/i.test(errorDe(r));
    const HABLA_DE_CAPACIDAD = (r) => /publicaciones activas|capacidad/i.test(errorDe(r));
    const sinCobroInterno = (r) => {
      const c = (r && r.datos && r.datos.cobro) || null;
      return !c || (!('base' in c) && !('ajuste' in c) && !('ajusteTasa' in c));
    };
    const anuncioEn = (dueno, idSusc, serie) => db.crearAnuncio({
      idOrg: dueno.idOrg, idUsuario: dueno.idUsuario, idSuscripcion: idSusc, categoria: 'excavadoras',
      marca: 'caterpillar', modelo: `M-${serie}`, anio: 2019, provincia: 'santo-domingo', precio: 1000000,
      moneda: 'DOP', vence: db.sumarDias(30), serie, fotos: ['/fotos/2026-09/placa.jpg'], telefonos: [],
    });

    // Publicar sin nada contratado: 402. El cuerpo vacío basta, la capacidad se mira antes de validar campos.
    const sin = cuenta('sincontrato');
    const r402 = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: {}, cabeceras: sin.cabeceras });
    ok(r402.codigo === 402 && SIN_CUPO(r402) && HABLA_DE_CAPACIDAD(r402),
      `sin membresía: 402 sin «cupo» y con capacidad/publicaciones activas (${r402.codigo}: ${errorDe(r402)})`);

    // Publicar con la capacidad llena: 409.
    const llena = cuenta('llena');
    const sLlena = membresia(llena.idOrg, { cupo: 1, finEnDias: 20 });
    const idOcupa = anuncioEn(llena, sLlena, 'CAP-OCUPA-1');
    const r409 = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: { membresia: sLlena }, cabeceras: llena.cabeceras });
    ok(r409.codigo === 409 && SIN_CUPO(r409) && HABLA_DE_CAPACIDAD(r409),
      `capacidad llena: 409 sin «cupo» (${r409.codigo}: ${errorDe(r409)})`);
    const rTodo = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: {}, cabeceras: llena.cabeceras });
    ok(rTodo.codigo === 402 && SIN_CUPO(rTodo) && HABLA_DE_CAPACIDAD(rTodo),
      `todo lleno sin elegir membresía: 402 sin «cupo» (${rTodo.codigo}: ${errorDe(rTodo)})`);

    // Mover a una membresía llena: 409.
    const sVacia = membresia(llena.idOrg, { cupo: 2, finEnDias: 20 });
    const idMovible = anuncioEn(llena, sVacia, 'CAP-MOVER-1');
    const rMover = await pedir({
      metodo: 'PATCH', url: `/api/anuncios/${idMovible}/plan`, cuerpo: { membresia: sLlena }, cabeceras: llena.cabeceras,
    });
    ok(rMover.codigo === 409 && SIN_CUPO(rMover) && HABLA_DE_CAPACIDAD(rMover),
      `mover a una membresía llena: 409 sin «cupo» (${rMover.codigo}: ${errorDe(rMover)})`);

    // Reactivar un vendido sin capacidad: 409.
    const idVendido = anuncioEn(llena, sLlena, 'CAP-VENDIDO-1');
    ejecuta("UPDATE anuncios SET estado = 'vendido' WHERE id = ?", idVendido);
    const rReact = await pedir({
      metodo: 'PATCH', url: `/api/anuncios/${idVendido}`, cuerpo: { estado: 'activo' }, cabeceras: llena.cabeceras,
    });
    ok(rReact.codigo === 409 && SIN_CUPO(rReact) && HABLA_DE_CAPACIDAD(rReact),
      `reactivar sin capacidad: 409 sin «cupo» (${rReact.codigo}: ${errorDe(rReact)})`);
    ok(!!idOcupa, 'el anuncio que ocupa la capacidad existe');

    // Ampliación por transferencia: 202 y su aviso sin «cupo».
    const dueno = cuenta('avisos');
    const sA = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
    const r202 = await ampliar(sA, { cupo: 7 }, dueno);
    const avisoA = (r202.datos || {}).aviso || '';
    ok(r202.codigo === 202 && avisoA.length > 0 && !/cupo/i.test(avisoA),
      `ampliar con transferencia: 202 con aviso sin «cupo» (${r202.codigo}: ${avisoA})`);
    ok(sinCobroInterno(r202), 'sin base ni ajuste en la respuesta de la ampliación');

    // Compra con transferencia: el mismo aviso compartido.
    const rCompra = await pedir({
      metodo: 'POST', url: '/api/membresias', cuerpo: { plan: 'destacado', cupo: 2, dias: 30 }, cabeceras: dueno.cabeceras,
    });
    const avisoC = (rCompra.datos || {}).aviso || '';
    ok(rCompra.codigo === 202 && !/cupo/i.test(avisoC), `comprar con transferencia: aviso sin «cupo» (${rCompra.codigo}: ${avisoC})`);
    ok(sinCobroInterno(rCompra), 'sin base ni ajuste en la respuesta de la compra');

    // Rechazo del procesador: 402 con el texto de NO_APROBADO y de EN_PROCESO sin «cupo».
    const original = pagos.PROCESADORES.transferencia;
    try {
      const sR = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
      pagos.PROCESADORES.transferencia = async () => ({ resultado: 'rechazado', motivo: 'prueba' });
      const rRech = await ampliar(sR, { cupo: 7 }, dueno);
      ok(rRech.codigo === 402 && SIN_CUPO(rRech) && sinCobroInterno(rRech),
        `ampliación rechazada: 402 sin «cupo» ni base/ajuste (${rRech.codigo}: ${errorDe(rRech)})`);
      ok(cupoDe(sR) === 3, 'y el cupo no cambia');

      const sP = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
      pagos.PROCESADORES.transferencia = async () => ({ resultado: 'pendiente' });
      const rEnProceso = await ampliar(sP, { cupo: 7 }, dueno);
      ok(rEnProceso.codigo === 202 && !/cupo/i.test((rEnProceso.datos || {}).aviso || ''),
        `ampliación en proceso: aviso sin «cupo» (${rEnProceso.codigo})`);
    } finally {
      pagos.PROCESADORES.transferencia = original;
    }
  }

  console.log('\n5b. El concepto del comprobante: vocabulario nuevo solo hacia adelante');
  {
    const conceptoDe = (r) => {
      const fila = consulta('SELECT intencion FROM pagos WHERE referencia = ?', ((r.datos || {}).cobro || {}).referencia);
      return fila ? JSON.parse(fila.intencion).concepto : null;
    };
    const dueno = cuenta('concepto');

    const c5 = await pedir({
      metodo: 'POST', url: '/api/membresias', cuerpo: { plan: 'destacado', cupo: 5, dias: 30 }, cabeceras: dueno.cabeceras,
    });
    ok(conceptoDe(c5) === 'Destacado · 5 publicaciones activas · 30 días', `compra de 5: «${conceptoDe(c5)}»`);
    const c1 = await pedir({
      metodo: 'POST', url: '/api/membresias', cuerpo: { plan: 'destacado', cupo: 1, dias: 30 }, cabeceras: dueno.cabeceras,
    });
    ok(conceptoDe(c1) === 'Destacado · 1 publicación activa · 30 días', `compra de 1: «${conceptoDe(c1)}»`);

    const sA = membresia(dueno.idOrg, { cupo: 5, finEnDias: 20 });
    const a2 = await ampliar(sA, { cupo: 7 }, dueno);
    ok(conceptoDe(a2) === 'Ampliación de Destacado · 2 publicaciones activas más · hasta 7', `ampliación de 2: «${conceptoDe(a2)}»`);
    const sB = membresia(dueno.idOrg, { cupo: 5, finEnDias: 20 });
    const a1 = await ampliar(sB, { cupo: 6 }, dueno);
    ok(a1.codigo === 202 && conceptoDe(a1) === 'Ampliación de Destacado · 1 publicación activa más · hasta 6',
      `ampliación de 1: «${conceptoDe(a1)}»`);

    // Confirmar la ampliación nueva: cuadra, mismo total que el pago y el NCF avanza una vez.
    const pagoA2 = consulta('SELECT * FROM pagos WHERE referencia = ?', a2.datos.cobro.referencia);
    const antesB02 = siguienteB02();
    const antesB01 = siguienteB01();
    const conf = pagos.confirmarPago(pagoA2.id);
    const f = consulta("SELECT * FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", pagoA2.id);
    ok(!!f && f.subtotal + f.itbis === f.total && f.total === pagoA2.total,
      `el comprobante cuadra y coincide con el pago: ${f && `${f.subtotal} + ${f.itbis} = ${f.total}`} / ${pagoA2.total}`);
    ok(!!f && /publicaciones activas más/.test(f.concepto), `el comprobante nuevo lleva el concepto nuevo: «${f && f.concepto}»`);
    const avance = (siguienteB02() - antesB02) + (siguienteB01() - antesB01);
    ok(avance === 1, `el NCF avanzó exactamente una vez (${avance})`);
    ok(!!conf.comprobante && cupoDe(sA) === 7, `y el cupo pasó a 7 (${cupoDe(sA)})`);

    // Anular una ampliación pendiente no crea factura ni consume NCF.
    const pagoA1 = consulta('SELECT id FROM pagos WHERE referencia = ?', a1.datos.cobro.referencia);
    const facturasAntes = facturasTotales();
    const b02 = siguienteB02();
    const b01 = siguienteB01();
    db.rechazarPago(pagoA1.id);
    ok(facturasTotales() === facturasAntes && siguienteB02() === b02 && siguienteB01() === b01 && cupoDe(sB) === 5,
      'ampliación anulada: sin factura, sin NCF y sin cupo');

    // Una intención ya guardada con el vocabulario viejo se confirma tal cual: nada la reescribe.
    const sV = membresia(dueno.idOrg, { cupo: 3, finEnDias: 20 });
    const pViejo = ampliacionPendiente({ idOrg: dueno.idOrg, idSusc: sV, cupoActual: 3, cupoNuevo: 5 });
    const conceptoViejo = JSON.parse(consulta('SELECT intencion FROM pagos WHERE id = ?', pViejo.id).intencion).concepto;
    ok(/cupos más/.test(conceptoViejo), `la intención vieja dice «${conceptoViejo}»`);
    pagos.confirmarPago(pViejo.id);
    const fViejo = consulta("SELECT concepto FROM facturas WHERE pago_id = ?", pViejo.id);
    const intencionDespues = JSON.parse(consulta('SELECT intencion FROM pagos WHERE id = ?', pViejo.id).intencion).concepto;
    ok(!!fViejo && /cupos más/.test(fViejo.concepto) && intencionDespues === conceptoViejo,
      `el comprobante lleva el concepto viejo tal cual y la intención no se reescribió: «${fViejo && fViejo.concepto}»`);
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
