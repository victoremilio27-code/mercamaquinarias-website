/**
 * Contrato HTTP del estado operativo, con una base y carpetas temporales.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-estado-api');
fs.rmSync(BANCO, { recursive: true, force: true });
for (const nombre of ['respaldos', 'fotos', 'videos', 'documentos', 'facturas']) {
  fs.mkdirSync(path.join(BANCO, nombre), { recursive: true });
}
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_RESPALDOS = path.join(BANCO, 'respaldos');
process.env.MERCA_FOTOS = path.join(BANCO, 'fotos');
process.env.MERCA_VIDEOS = path.join(BANCO, 'videos');
process.env.MERCA_DOCUMENTOS = path.join(BANCO, 'documentos');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
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

function pedir(testigo) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = 'GET';
    req.url = '/api/admin/estado';
    req.headers = testigo ? { cookie: `te_sesion=${testigo}` } : {};
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};
    const res = {
      codigo: 0,
      cabeceras: {},
      writeHead(codigo, cabeceras) {
        res.codigo = codigo;
        res.cabeceras = cabeceras;
        return res;
      },
      end(datos) {
        resolver({ codigo: res.codigo, cabeceras: res.cabeceras, datos: JSON.parse(datos) });
      },
    };
    api.manejar(req, res, '/api/admin/estado');
    setImmediate(() => req.emit('end'));
  });
}

function crearUsuario(correo, administrador = false) {
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre: 'Persona de prueba',
    telefono: '8095550000', tipo: 'particular',
  });
  db.marcarCorreoVerificado(idUsuario);
  if (administrador) db.marcarAdmin(correo, true);
  return db.abrirSesion(idUsuario);
}

async function probar() {
  console.log('\nEstado del sistema por API');
  const normal = crearUsuario('normal-estado@ejemplo.test');
  const personal = crearUsuario('personal-estado@ejemplo.test', true);

  let r = await pedir();
  comprobar(r.codigo === 401, 'sin sesión devuelve 401');
  r = await pedir(normal);
  comprobar(r.codigo === 403, 'una cuenta normal devuelve 403');

  fs.writeFileSync(path.join(BANCO, 'respaldos', 'mercamaquinarias-falso.db'), 'respaldo');
  fs.writeFileSync(path.join(BANCO, 'fotos', 'foto.jpg'), 'foto');
  r = await pedir(personal);
  comprobar(r.codigo === 200 && r.datos.base.bytes > 0 && r.datos.carpetas.fotos.archivos === 1
    && r.datos.respaldo.nombre === 'mercamaquinarias-falso.db' && r.datos.generado,
  'el personal recibe el estado de la base, las carpetas y el respaldo');
  comprobar(r.cabeceras['Cache-Control'] === 'no-store', 'la respuesta impide el almacenamiento en caché');

  fs.rmSync(path.join(BANCO, 'respaldos'), { recursive: true, force: true });
  fs.mkdirSync(path.join(BANCO, 'respaldos'));
  r = await pedir(personal);
  comprobar(r.codigo === 200 && r.datos.avisos.some((aviso) => /No hay ningún respaldo/.test(aviso)),
    'avisa cuando la carpeta de respaldos está vacía');

  console.log(`\n${bien} comprobaciones bien; ${mal} mal.`);
  if (mal) process.exitCode = 1;
}

probar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
