/**
 * Contrato HTTP de las búsquedas guardadas (fase 16).
 * Corre contra una base temporal y usa el enrutador real con req/res fingidos.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-busquedas-api');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
const api = require('./api.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) {
    bien++;
    console.log(`  ok  ${que}`);
  } else {
    mal++;
    console.log(`  MAL ${que}`);
  }
}

function pedir({ metodo = 'GET', url, cuerpo, testigo, ip = '201.8.7.6' }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = {
      'user-agent': 'prueba-busquedas-api',
      'cf-connecting-ip': ip,
      ...(testigo ? { cookie: `te_sesion=${testigo}` } : {}),
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      writeHead(codigo) { res.codigo = codigo; return res; },
      end(datos) {
        resolver({ codigo: res.codigo, datos: datos ? JSON.parse(datos) : null });
      },
    };
    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => {
      if (cuerpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(cuerpo)));
      req.emit('end');
    });
  });
}

function crearUsuario(correo) {
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre: 'Persona de prueba',
    telefono: '8095550000', tipo: 'particular',
  });
  db.marcarCorreoVerificado(idUsuario);
  return { id: idUsuario, testigo: db.abrirSesion(idUsuario) };
}

async function probar() {
  console.log('\nBúsquedas guardadas por API');
  const ana = crearUsuario('ana-busquedas@ejemplo.test');
  const bia = crearUsuario('bia-busquedas@ejemplo.test');

  let r = await pedir({ metodo: 'POST', url: '/api/busquedas', cuerpo: { marca: 'cat' } });
  comprobar(r.codigo === 401, 'guardar sin sesión devuelve 401');
  r = await pedir({ url: '/api/busquedas' });
  comprobar(r.codigo === 401, 'listar sin sesión devuelve 401');
  r = await pedir({ metodo: 'DELETE', url: '/api/busquedas/cualquiera' });
  comprobar(r.codigo === 401, 'borrar sin sesión devuelve 401');

  r = await pedir({ metodo: 'POST', url: '/api/busquedas', cuerpo: { desconocido: 'x', precioMin: 0 }, testigo: ana.testigo });
  comprobar(r.codigo === 400 && r.datos.error === 'Elija al menos un filtro antes de guardar la búsqueda.',
    'rechaza un cuerpo sin filtros del catálogo');

  r = await pedir({ metodo: 'POST', url: '/api/busquedas', cuerpo: {
    q: 'retroexcavadora', marca: 'cat', precioMin: '1500000', desconocido: 'fuera',
  }, testigo: ana.testigo });
  const idAna = r.datos.id;
  comprobar(r.codigo === 201 && !r.datos.repetida && r.datos.resumen.includes('retroexcavadora'),
    'crea y resume una búsqueda normalizada con 201');

  r = await pedir({ metodo: 'POST', url: '/api/busquedas', cuerpo: {
    precioMin: 1500000, marca: 'cat', q: 'retroexcavadora',
  }, testigo: ana.testigo });
  comprobar(r.codigo === 200 && r.datos.repetida && r.datos.id === idAna,
    'la misma búsqueda devuelve 200 y repetida');

  r = await pedir({ url: '/api/busquedas', testigo: ana.testigo });
  comprobar(r.codigo === 200 && r.datos.busquedas.length === 1
    && r.datos.busquedas[0].filtros.precioMin === 1500000 && r.datos.busquedas[0].activa,
  'lista solamente las búsquedas del usuario con filtros tipados');

  const ajena = db.guardarBusqueda({ idUsuario: bia.id, filtros: { q: 'grúa' }, resumen: 'grúa' });
  r = await pedir({ metodo: 'DELETE', url: `/api/busquedas/${ajena.id}`, testigo: ana.testigo });
  const errorAjeno = r.datos.error;
  comprobar(r.codigo === 404 && db.busquedasDe(bia.id).length === 1,
    'no permite borrar una búsqueda ajena');
  r = await pedir({ metodo: 'DELETE', url: '/api/busquedas/no-existe', testigo: ana.testigo });
  comprobar(r.codigo === 404 && r.datos.error === errorAjeno,
    'una búsqueda ajena y una inexistente responden igual');

  r = await pedir({ metodo: 'DELETE', url: `/api/busquedas/${idAna}`, testigo: ana.testigo });
  comprobar(r.codigo === 200 && r.datos.ok && db.busquedasDe(ana.id).length === 0,
    'borra la búsqueda propia');

  const primera = db.guardarBusqueda({ idUsuario: ana.id, filtros: { q: 'primera' }, resumen: 'primera' });
  const segunda = db.guardarBusqueda({ idUsuario: ana.id, filtros: { q: 'segunda' }, resumen: 'segunda' });
  const testigoPrimera = db.testigoBajaBusqueda(primera.id);
  r = await pedir({ url: `/api/busquedas/baja?testigo=${encodeURIComponent(testigoPrimera)}` });
  // 405 y no 404 desde el issue #136: la ruta existe, pero solo por POST.
  comprobar(r.codigo === 405 && db.busquedasDe(ana.id).find((b) => b.id === primera.id).activa,
    'abrir por GET el enlace no da de baja la búsqueda');
  r = await pedir({ metodo: 'POST', url: '/api/busquedas/baja', cuerpo: { testigo: 'incorrecto' }, ip: '201.8.7.7' });
  const errorMalo = r.datos.error;
  comprobar(r.codigo === 400, 'rechaza un testigo mal firmado sin sesión');
  r = await pedir({ metodo: 'POST', url: '/api/busquedas/baja', cuerpo: {
    testigo: db.testigoBajaBusqueda('no-existe'),
  }, ip: '201.8.7.8' });
  comprobar(r.codigo === 400 && r.datos.error === errorMalo,
    'el error no revela si la búsqueda existe');
  r = await pedir({ metodo: 'POST', url: '/api/busquedas/baja', cuerpo: { testigo: testigoPrimera }, ip: '201.8.7.9' });
  comprobar(r.codigo === 200 && r.datos.ok && r.datos.resumen === 'primera',
    'la baja pública devuelve el resumen');
  r = await pedir({ url: '/api/busquedas', testigo: ana.testigo });
  const lista = r.datos.busquedas;
  comprobar(lista.find((b) => b.id === primera.id).activa === false,
    'la búsqueda dada de baja sigue en la lista como inactiva');
  comprobar(lista.find((b) => b.id === segunda.id).activa === true,
    'el testigo de una búsqueda no da de baja otra');

  for (let n = db.busquedasDe(bia.id).length; n < 20; n++) {
    db.guardarBusqueda({ idUsuario: bia.id, filtros: { q: `tope-${n}` }, resumen: `tope-${n}` });
  }
  r = await pedir({ metodo: 'POST', url: '/api/busquedas', cuerpo: { q: 'una-más' }, testigo: bia.testigo });
  comprobar(r.codigo === 409 && /20/.test(r.datos.error), 'el tope devuelve 409 y dice su cantidad');

  const permitirReal = db.permitir;
  const clavesLimitadas = [];
  db.permitir = (clave) => { clavesLimitadas.push(clave); return false; };
  r = await pedir({ metodo: 'POST', url: '/api/busquedas', cuerpo: { q: 'limitada' }, testigo: ana.testigo });
  comprobar(r.codigo === 429 && clavesLimitadas[0] === `guardar-busqueda:${ana.id}`,
    'guardar está limitado por usuario');
  r = await pedir({ metodo: 'POST', url: '/api/busquedas/baja', cuerpo: { testigo: testigoPrimera }, ip: '203.0.113.42' });
  comprobar(r.codigo === 429 && clavesLimitadas[1] === 'baja-busqueda:203.0.113.42',
    'la baja está limitada por CF-Connecting-IP');
  db.permitir = permitirReal;

  console.log(`\n${bien} comprobaciones bien; ${mal} mal.`);
  if (mal) process.exitCode = 1;
}

probar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
