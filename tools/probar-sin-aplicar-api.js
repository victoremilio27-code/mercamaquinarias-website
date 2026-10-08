/**
 * Contrato HTTP para devolver desde la consola un cobro aprobado sin aplicar.
 * Usa el enrutador real con una base desechable y req/res fingidos.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-sin-aplicar-api');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
process.env.MERCA_ENV = path.join(BANCO, 'no-existe.env');

const db = require('./db');
const api = require('./api');

let bien = 0;
let mal = 0;
const respuestas = [];
function comprobar(condicion, texto) {
  if (condicion) bien++;
  else mal++;
  console.log(`  ${condicion ? 'ok ' : 'MAL'} ${texto}`);
}

function pedir({ url, cuerpo, testigo, ip = '201.8.7.6' }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = url;
    req.headers = {
      'user-agent': 'prueba-sin-aplicar-api',
      'cf-connecting-ip': ip,
      ...(testigo ? { cookie: `te_sesion=${testigo}` } : {}),
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};
    const res = {
      codigo: 0,
      writeHead(codigo) { res.codigo = codigo; return res; },
      end(datos) {
        const respuesta = { codigo: res.codigo, datos: datos ? JSON.parse(datos) : null };
        respuestas.push(respuesta);
        resolver(respuesta);
      },
    };
    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => {
      req.emit('data', Buffer.from(JSON.stringify(cuerpo || {})));
      req.emit('end');
    });
  });
}

function cuenta(correo, nombre) {
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre,
    telefono: '8095550000', tipo: 'particular',
  });
  db.marcarCorreoVerificado(idUsuario);
  return { id: idUsuario, testigo: db.abrirSesion(idUsuario), org: db.organizacionDe(idUsuario) };
}

const d = db.abrir();
const admin = cuenta('admin-api@ejemplo.test', 'Administradora API');
db.marcarAdmin('admin-api@ejemplo.test', true);
const normal = cuenta('normal-api@ejemplo.test', 'Persona normal');
const cliente = cuenta('cliente-api@ejemplo.test', 'Cliente API');
let numero = 0;
function pago(procesador = 'cardnet') {
  numero++;
  const id = `pago-api-${numero}`;
  d.prepare(`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia,
               procesador, creado, intencion)
             VALUES (?, ?, 1000, 180, 1180, 'pendiente', ?, ?, ?, ?)`)
    .run(id, cliente.org.id, `API-${numero}`, procesador, new Date().toISOString(), JSON.stringify({
      tipo: 'compra', idPlan: 'plan-inexistente', concepto: 'Membresía de prueba',
    }));
  db.anotarEventoPago({
    pagoId: id, procesador, origen: 'notificacion', tipo: 'aprobado-sin-aplicar', cuerpo: { prueba: true },
  });
  return id;
}

(async () => {
  console.log('\nDevolución de cobro sin aplicar por API');
  const idBueno = pago();
  const ruta = (id) => `/api/admin/pagos/${id}/devolver-sin-aplicar`;
  const motivo = 'Devuelto en el portal de CardNet, operación API-123.';

  let r = await pedir({ url: ruta(idBueno), cuerpo: { motivo } });
  comprobar(r.codigo === 401, 'sin sesión devuelve 401');

  r = await pedir({ url: ruta(idBueno), cuerpo: { motivo }, testigo: normal.testigo });
  /* conAdmin oculta las rutas del personal a las cuentas normales. */
  comprobar(r.codigo === 404, 'un usuario normal recibe el 404 de conAdmin');

  r = await pedir({ url: ruta(idBueno), cuerpo: { motivo: 'corto' }, testigo: admin.testigo });
  comprobar(r.codigo === 400, 'un motivo corto devuelve 400');

  r = await pedir({ url: ruta('no-existe'), cuerpo: { motivo }, testigo: admin.testigo });
  comprobar(r.codigo === 404, 'un pago inexistente devuelve 404');

  const idTransferencia = pago('transferencia');
  r = await pedir({ url: ruta(idTransferencia), cuerpo: { motivo }, testigo: admin.testigo });
  comprobar(r.codigo === 409, 'un pago de transferencia devuelve 409');

  r = await pedir({ url: ruta(idBueno), cuerpo: { motivo }, testigo: admin.testigo, ip: '201.9.8.7' });
  comprobar(r.codigo === 200 && r.datos.ok && r.datos.pago.estado === 'devuelto',
    'el caso bueno devuelve 200 y el pago devuelto');
  const anotacion = d.prepare(`SELECT accion, ip FROM bitacora_admin
                                WHERE objeto_id = ? ORDER BY creada DESC LIMIT 1`).get(idBueno);
  comprobar(anotacion && anotacion.accion === 'pago.devolver-sin-aplicar'
    && anotacion.ip === '201.9.8.7', 'la bitácora guarda la acción y la IP de Cloudflare');

  r = await pedir({ url: ruta(idBueno), cuerpo: { motivo }, testigo: admin.testigo });
  comprobar(r.codigo === 409, 'repetir la devolución devuelve 409');
  comprobar(respuestas.every((x) => x.codigo < 500), 'ninguna respuesta es 5xx');

  console.log(`\n${bien} bien, ${mal} mal`);
  if (mal) process.exitCode = 1;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
