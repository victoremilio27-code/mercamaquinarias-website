/**
 * probar-sin-aplicar.js — devolver un cobro aprobado sin aplicar (#66, base #147).
 *
 *   node tools/probar-sin-aplicar.js
 *
 * POR QUÉ EXISTE
 *
 * CardNet puede aprobar un cobro que ya no se puede aplicar (la membresía
 * venció entre medias, el pago se había reemplazado). El dinero entró y no
 * se otorgó nada ni se emitió comprobante. `db.devolverCobroSinAplicar`
 * deja constancia de que el personal lo devolvió en el portal de CardNet.
 * Lo que se fija aquí:
 *   - cada requisito con su código (400, 404, 409), y que un rechazo no
 *     escribe NADA (ni estado, ni evento, ni bitácora);
 *   - el efecto: estado `devuelto`, evento `devuelto-manual` y una fila de
 *     bitácora, juntos;
 *   - que no se emite comprobante ni se consume ningún NCF (no hubo
 *     comprobante que anular: una B04 sin original sería un documento de
 *     algo que no ocurrió), ni se toca la capacidad;
 *   - que repetirla es 409 sin escribir;
 *   - que un pago devuelto no revive: ni `confirmarPago`, ni un aprobado
 *     tardío de CardNet (`resolver`), ni la conciliación otorgan o emiten;
 *   - que la tarea `reconciliar` del temporizador sale con 0 sin CardNet.
 *
 * Base DESECHABLE en `.tmp/prueba-sin-aplicar/`, correo en archivo y sin red.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

/* El entorno ANTES de cargar db.js: la ruta de la base se resuelve al
   importarlo. Hecho después, la prueba escribiría en la base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-sin-aplicar');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
// Que un .env local no encienda CardNet a mitad de prueba.
process.env.MERCA_ENV = path.join(BANCO, 'no-existe.env');
for (const k of Object.keys(process.env)) {
  if (k.startsWith('MERCA_CARDNET')) delete process.env[k];
}

const db = require('./db');
const pagos = require('./pagos');
const cardnet = require('./cardnet');

let intentosDeRed = 0;
cardnet._transporte = () => {
  intentosDeRed++;
  throw new Error('la prueba intentó salir a la red');
};

let fallos = 0;
function ok(condicion, texto) {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function lanza(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

const d = db.abrir();
const uno = (sql, ...a) => d.prepare(sql).get(...a);
const n = (sql, ...a) => d.prepare(sql).get(...a).n;

/* ── Siembra ─────────────────────────────────────────────── */

function cuenta(correo, nombre) {
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre, telefono: '8095550000', tipo: 'particular',
  });
  return { idUsuario, org: db.organizacionDe(idUsuario) };
}

const admin = cuenta('admin@ejemplo.test', 'Administradora de Prueba');
db.marcarAdmin('admin@ejemplo.test', true);
const normal = cuenta('normal@ejemplo.test', 'Usuario Normal');
const cliente = cuenta('cliente@ejemplo.test', 'Cliente de Prueba');
const ID_ORG = cliente.org.id;

db.cargarSecuencia({ tipo: 'B01', nombre: 'Crédito fiscal', desde: 1, hasta: 500, vence: '2099-12-31', usaSitio: true });
db.cargarSecuencia({ tipo: 'B02', nombre: 'Consumo', desde: 1, hasta: 500, vence: '2099-12-31', usaSitio: true });
db.cargarSecuencia({ tipo: 'B04', nombre: 'Notas de crédito', desde: 1, hasta: 500, vence: '2099-12-31', usaSitio: true });

let correlativo = 0;
/* Un pago como lo deja `pagos.resolver` tras un aprobado que no se pudo
   aplicar: en `estado`, con el evento `aprobado-sin-aplicar`. */
function pago({ procesador = 'cardnet', estado = 'pendiente', sinAplicar = true } = {}) {
  correlativo++;
  const idPago = `pago-sa-${correlativo}`;
  const intencion = JSON.stringify({
    tipo: 'compra', idPlan: 'plan-inexistente', concepto: 'Membresía de prueba',
    cliente: { razonSocial: 'Cliente de Prueba' }, correoCliente: 'cliente@ejemplo.test',
  });
  d.prepare(`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia,
               procesador, creado, intencion)
             VALUES (?, ?, 3090, 556, 3646, ?, ?, ?, ?, ?)`)
    .run(idPago, ID_ORG, estado, `SA-${correlativo}`, procesador, new Date().toISOString(), intencion);
  if (sinAplicar) {
    db.anotarEventoPago({
      pagoId: idPago, procesador, origen: 'notificacion', tipo: 'aprobado-sin-aplicar',
      cuerpo: { referencia: `SA-${correlativo}`, causa: 'prueba' },
    });
  }
  return idPago;
}

const MOTIVO = 'Devuelto en el portal de CardNet, operación 123456.';
const devolver = (idPago, extra = {}) => db.devolverCobroSinAplicar({
  idPago, idAdmin: admin.idUsuario, motivo: MOTIVO, ip: '201.4.4.4', ...extra,
});

/* Todo lo que una devolución podría escribir, para comprobar que un
   rechazo no deja nada y que un acierto no toca lo fiscal. */
function foto(idPago) {
  return {
    estado: idPago ? (uno('SELECT estado FROM pagos WHERE id = ?', idPago) || {}).estado : null,
    eventos: n('SELECT COUNT(*) AS n FROM pagos_eventos'),
    bitacora: n('SELECT COUNT(*) AS n FROM bitacora_admin'),
    facturas: n('SELECT COUNT(*) AS n FROM facturas'),
    ncf: d.prepare('SELECT tipo, siguiente FROM secuencias_ncf ORDER BY tipo, desde').all()
      .map((s) => `${s.tipo}:${s.siguiente}`).join(' '),
    suscripciones: n('SELECT COUNT(*) AS n FROM suscripciones'),
  };
}
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function rechaza(titulo, codigo, fn, idPago, texto) {
  const antes = foto(idPago);
  const e = lanza(fn);
  ok(!!e && e.codigo === codigo && (!texto || texto.test(e.message)),
    `${titulo}: ${codigo}${e ? ` «${e.message}»` : ' (no lanzó)'}`);
  ok(igual(foto(idPago), antes), `${titulo}: no escribe nada`);
}

(async () => {
  console.log('\n1. Requisitos, cada uno con su código');
  rechaza('pago inexistente', 404, () => devolver('no-existe'), null);
  rechaza('sin idPago', 404, () => db.devolverCobroSinAplicar({ idAdmin: admin.idUsuario, motivo: MOTIVO }), null);

  const pMotivo = pago();
  rechaza('motivo de 9 caracteres', 400, () => devolver(pMotivo, { motivo: '123456789' }), pMotivo);
  rechaza('motivo de espacios que recortado es corto', 400, () => devolver(pMotivo, { motivo: '   corto     ' }), pMotivo);
  rechaza('motivo de 501 caracteres', 400, () => devolver(pMotivo, { motivo: 'x'.repeat(501) }), pMotivo);
  rechaza('sin motivo', 400, () => devolver(pMotivo, { motivo: undefined }), pMotivo);
  rechaza('quien no es administrador', 404, () => devolver(pMotivo, { idAdmin: normal.idUsuario }), pMotivo);

  const pTransf = pago({ procesador: 'transferencia' });
  rechaza('pago de transferencia', 409, () => devolver(pTransf), pTransf, /CardNet/);

  const pAprobado = pago({ estado: 'aprobado' });
  rechaza('pago aprobado', 409, () => devolver(pAprobado), pAprobado, /aprobado/);

  const pSinEvento = pago({ sinAplicar: false });
  rechaza('pendiente sin evento aprobado-sin-aplicar', 409, () => devolver(pSinEvento), pSinEvento, /no consta/);

  const pConFactura = pago();
  const t = new Date().toISOString();
  d.prepare(`INSERT INTO facturas (id, pago_id, organizacion_id, numero, tipo, concepto, subtotal, itbis, total, moneda, fecha, creada)
             VALUES ('factura-sa', ?, ?, 'MM-2099-000001', 'recibo', 'Prueba', 3090, 556, 3646, 'DOP', ?, ?)`)
    .run(pConFactura, ID_ORG, t, t);
  rechaza('con comprobante emitido', 409, () => devolver(pConFactura), pConFactura, /nota de crédito/);

  console.log('\n2. El caso bueno: estado, evento y bitácora juntos, nada fiscal');
  const pBueno = pago();
  const antes = foto(pBueno);
  let r = null;
  const e = lanza(() => { r = devolver(pBueno, { motivo: `   ${MOTIVO}   ` }); });
  ok(!e, `no lanza${e ? `: ${e.message}` : ''}`);
  ok(!!r && r.id === pBueno && r.estado === 'devuelto', 'devuelve el pago ya devuelto');
  ok(uno('SELECT estado FROM pagos WHERE id = ?', pBueno).estado === 'devuelto', 'el pago queda devuelto');

  const ev = db.eventosDePago(pBueno).filter((x) => x.tipo === 'devuelto-manual');
  ok(ev.length === 1 && ev[0].origen === 'consola' && ev[0].procesador === 'cardnet',
    'un evento devuelto-manual con origen consola');
  ok(ev.length === 1 && ev[0].cuerpo && ev[0].cuerpo.motivo === MOTIVO && ev[0].cuerpo.idAdmin === admin.idUsuario,
    'el evento guarda el motivo recortado y el id del administrador');

  const fila = uno("SELECT * FROM bitacora_admin WHERE accion = 'pago.devolver-sin-aplicar' AND objeto_id = ?", pBueno);
  ok(!!fila && fila.objeto_tipo === 'pago' && fila.organizacion_id === ID_ORG && fila.admin_id === admin.idUsuario
    && fila.motivo === MOTIVO && fila.ip === '201.4.4.4',
  'una fila de bitácora: acción, pago, organización, administrador, motivo e IP');
  ok(!!fila && JSON.parse(fila.antes).estado === 'pendiente' && JSON.parse(fila.despues).estado === 'devuelto',
    'la bitácora dice de qué estado a qué estado');
  ok(db.ACCIONES_BITACORA['pago.devolver-sin-aplicar'] !== undefined, 'la acción está en el catálogo de la bitácora');

  const despues = foto(pBueno);
  ok(despues.bitacora === antes.bitacora + 1 && despues.eventos === antes.eventos + 1,
    `una fila de bitácora y un evento más (+${despues.bitacora - antes.bitacora}, +${despues.eventos - antes.eventos})`);
  ok(despues.facturas === antes.facturas && despues.ncf === antes.ncf,
    `ningún comprobante ni NCF consumido (${despues.ncf})`);
  ok(despues.suscripciones === antes.suscripciones, 'no toca membresías ni capacidad');
  ok(intentosDeRed === 0, 'no llama a CardNet');

  console.log('\n3. Repetirla: 409 «Ya está devuelto» sin escribir');
  rechaza('segunda vez', 409, () => devolver(pBueno), pBueno, /Ya está devuelto/);

  console.log('\n4. Un pago rechazado con el evento (reemplazado y aprobado tarde) también se cierra');
  const pRechazado = pago({ estado: 'rechazado' });
  let r2 = null;
  const e2 = lanza(() => { r2 = devolver(pRechazado); });
  ok(!e2 && r2 && r2.estado === 'devuelto', `rechazado → devuelto${e2 ? `: ${e2.message}` : ''}`);
  const fila2 = uno("SELECT antes FROM bitacora_admin WHERE accion = 'pago.devolver-sin-aplicar' AND objeto_id = ?", pRechazado);
  ok(!!fila2 && JSON.parse(fila2.antes).estado === 'rechazado', 'la bitácora guarda que venía de rechazado');

  console.log('\n5. Lo que ve el personal');
  const abierto = pago();
  const consola = db.cobrosParaConsola({}).cobros;
  const deFila = (id) => consola.find((c) => c.id === id) || {};
  ok(deFila(abierto).sinAplicar === true, 'el cobro sin aplicar abierto trae sinAplicar en la consola');
  ok(deFila(pBueno).sinAplicar === false && deFila(pBueno).estado === 'devuelto', 'el devuelto ya no ofrece devolverlo');
  ok(deFila(pSinEvento).sinAplicar === false, 'un pendiente cualquiera tampoco');
  const informe = db.cobrosSinAplicar().map((x) => x.id);
  ok(informe.includes(abierto) && !informe.includes(pBueno) && !informe.includes(pRechazado),
    'el informe deja de enseñar los devueltos y sigue enseñando el abierto');

  console.log('\n6. Un pago devuelto no revive');
  let antesRevivir = foto(pBueno);
  const conf = pagos.confirmarPago(pBueno);
  ok(conf.pago.estado === 'devuelto' && conf.comprobante === null, 'confirmarPago no lo aprueba ni emite');
  ok(igual(foto(pBueno), antesRevivir), 'confirmarPago no escribe nada');

  antesRevivir = foto(pBueno);
  const tarde = pagos.resolver(db.pagoPorId(pBueno), { resultado: 'aprobado', origen: 'notificacion', procesadorId: 'P-TARDE' });
  ok(db.pagoPorId(pBueno).estado === 'devuelto' && !tarde.comprobante, 'un aprobado tardío de CardNet no lo aprueba ni emite');
  const trasTarde = foto(pBueno);
  ok(trasTarde.facturas === antesRevivir.facturas && trasTarde.ncf === antesRevivir.ncf
    && trasTarde.suscripciones === antesRevivir.suscripciones && trasTarde.eventos === antesRevivir.eventos,
  'ni comprobante, ni NCF, ni capacidad, ni otro evento aprobado-sin-aplicar');

  const futuro = new Date(Date.now() + 86400000);
  ok(!db.pagosCardnetPorReconciliar({ minutos: 0, ahora: futuro }).some((p) => p.id === pBueno),
    'la conciliación no lo vuelve a mirar');
  const rec = await pagos.reconciliar({ minutos: 0, ahora: futuro });
  ok(rec.apagado === true && igual(foto(pBueno), trasTarde), 'pagos.reconciliar con CardNet apagado no toca nada');

  console.log('\n7. La tarea del temporizador sin CardNet');
  const tarea = spawnSync(process.execPath, ['--no-warnings', path.join(__dirname, 'tareas.js'), 'reconciliar'],
    { env: process.env, encoding: 'utf8' });
  ok(tarea.status === 0 && /CardNet apagado/.test(tarea.stdout),
    `tools/tareas.js reconciliar sale con ${tarea.status}: ${(tarea.stdout || tarea.stderr || '').trim().split(/\r?\n/).pop()}`);
  ok(igual(foto(pBueno), trasTarde), 'y no escribe nada');

  ok(intentosDeRed === 0, 'ninguna llamada a la red en toda la prueba');
  console.log(`\n${fallos ? `${fallos} comprobación(es) fallaron` : 'Todo en orden'}`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
