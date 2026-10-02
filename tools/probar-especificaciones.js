/** Prueba de integración del contrato de especificaciones de los anuncios. */
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-especificaciones');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db');
const api = require('./api');
const legales = require('../assets/legales.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, texto) {
  if (condicion) bien++; else mal++;
  console.log(`  ${condicion ? 'OK  ' : 'MAL '} ${texto}`);
}

function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-especificaciones', ...cabeceras };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};
    const res = {
      codigo: 0, setHeader() {}, destroy() {},
      writeHead(codigo) { res.codigo = codigo; return res; },
      end(datos) {
        let json = null;
        try { json = datos ? JSON.parse(datos) : null; } catch (_) { json = null; }
        resolver({ codigo: res.codigo, datos: json });
      },
    };
    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => {
      if (cuerpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(cuerpo)));
      req.emit('end');
    });
  });
}

(async () => {
  db.secuenciasNcf();
  const cuenta = db.crearCuenta({
    correo: 'especificaciones@prueba.invalid', clave: 'UnaClaveLargaYSegura9',
    nombre: 'Prueba', telefono: '8095550000', tipo: 'particular',
  });
  Object.values(legales.DOCUMENTOS).forEach((doc) => db.registrarAceptacion({
    usuarioId: cuenta.idUsuario, documento: doc.id, version: doc.version,
    ip: '127.0.0.1', userAgent: 'prueba',
  }));
  const org = db.organizacionDe(cuenta.idUsuario);
  const cabeceras = { cookie: `te_sesion=${db.abrirSesion(cuenta.idUsuario)}` };
  const id = db.crearBorrador({ idOrg: org.id, idUsuario: cuenta.idUsuario, idPlan: 'estandar', dias: 30 });

  let r = await pedir({ metodo: 'PUT', url: `/api/borradores/${id}`, cabeceras, cuerpo: {
    categoria: 'excavadoras', subcategoria: 'exc-mini', marca: 'caterpillar',
    especificaciones: { 'peso-operativo': '5,5', 'potencia-neta': 90 },
    implementosLista: ['martillo-hidraulico', 'pulgar'],
  } });
  comprobar(r.codigo === 200, 'guarda valores válidos');
  let fila = db.anuncio(id);
  comprobar(fila.especificaciones === '{"peso-operativo":5.5,"potencia-neta":90}', 'normaliza y guarda el objeto JSON');
  comprobar(fila.implementos_lista === '["martillo-hidraulico","pulgar"]', 'guarda la lista JSON');

  r = await pedir({ metodo: 'PUT', url: `/api/borradores/${id}`, cabeceras,
    cuerpo: { especificaciones: { 'peso-operativo': 8 } } });
  comprobar(r.codigo === 400, 'rechaza un valor fuera del rango de la subcategoría');
  r = await pedir({ metodo: 'PUT', url: `/api/borradores/${id}`, cabeceras,
    cuerpo: { especificaciones: { 'numero-ejes': 3 } } });
  comprobar(r.codigo === 400, 'rechaza una especificación de otra categoría');
  r = await pedir({ metodo: 'PUT', url: `/api/borradores/${id}`, cabeceras,
    cuerpo: { implementosLista: ['toma-fuerza'] } });
  comprobar(r.codigo === 400, 'rechaza un implemento de otra categoría');

  r = await pedir({ metodo: 'PUT', url: `/api/borradores/${id}`, cabeceras,
    cuerpo: { categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt' } });
  fila = db.anuncio(id);
  comprobar(r.codigo === 200 && fila.especificaciones === null && fila.implementos_lista === null,
    'al cambiar de categoría descarta los datos que ya no corresponden');

  const activo = db.crearAnuncio({
    idOrg: org.id, idUsuario: cuenta.idUsuario, categoria: 'camiones', subcategoria: 'cam-volteo',
    marca: 'peterbilt', modelo: '567', anio: 2020, precio: 100,
    especificaciones: '{"numero-ejes":3}', implementosLista: '["toma-fuerza"]',
  });
  r = await pedir({ url: `/api/anuncios/${activo}` });
  comprobar(r.codigo === 200 && r.datos.anuncio.especificaciones['numero-ejes'] === 3,
    'la ficha devuelve las especificaciones parseadas');
  comprobar(Array.isArray(r.datos.anuncio.implementos_lista)
    && r.datos.anuncio.implementos_lista[0] === 'toma-fuerza', 'la ficha devuelve los implementos parseados');

  const viejo = db.crearAnuncio({
    idOrg: org.id, idUsuario: cuenta.idUsuario, categoria: 'camiones', subcategoria: 'cam-volteo',
    marca: 'peterbilt', modelo: '379', anio: 2000, precio: 100,
  });
  r = await pedir({ url: `/api/anuncios/${viejo}` });
  comprobar(r.datos.anuncio.especificaciones === null
    && Array.isArray(r.datos.anuncio.implementos_lista) && !r.datos.anuncio.implementos_lista.length,
  'un anuncio viejo devuelve null y una lista vacía');

  console.log(`\n${bien + mal} comprobaciones, ${mal} fallos`);
  process.exit(mal ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
