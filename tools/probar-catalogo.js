/**
 * probar-catalogo.js — que el buscador del catálogo no mienta.
 *
 *   node tools/probar-catalogo.js
 *
 * POR QUÉ EXISTE
 *
 * El filtro y el orden por precio comparaban la cifra cruda aunque el
 * anuncio estuviera en dólares: una excavadora de US$120,000 no salía en
 * «desde RD$1,000,000» y se ordenaba por debajo de una camioneta de
 * RD$500,000. Es el tipo de fallo que no se ve leyendo el código ni
 * mirando una página con pocos anuncios, y que un dealer descubre el
 * primer día. Aquí se reproducen, literales, los criterios de éxito de
 * la fase 8 del ROADMAP contra la API de verdad (req y res fingidos).
 *
 * Corre contra una base TEMPORAL —`.tmp/prueba-catalogo/`— que se borra
 * y se rehace en cada ejecución. No toca la base real.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/* Antes de cargar db.js: la ruta del archivo se resuelve al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-catalogo');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
// La tasa de partida es la de assets/precios.js, no la del entorno de
// quien corra la prueba.
delete process.env.MERCA_TASA_USD;

const db = require('./db.js');
const api = require('./api.js');
const precios = require('../assets/precios.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) {
    bien++;
    console.log(`  ok  ${que}`);
    return;
  }
  mal++;
  console.log(`  MAL ${que}`);
}

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Copia del arnés de probar-bitacora.js: cada archivo de prueba lleva
   el suyo, a propósito. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-catalogo', ...cabeceras };
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

/* ── Siembra ─────────────────────────────────────────────── */

function cuenta(correo, nombre) {
  const { idUsuario } = db.crearCuenta({
    correo,
    clave: 'UnaClaveLargaYSegura9',
    nombre,
    telefono: '8095550000',
    tipo: 'particular',
  });
  return { idUsuario, org: db.organizacionDe(idUsuario) };
}

function anuncio(org, extra) {
  const r = db.crearAnuncio({
    idOrg: org.id,
    categoria: 'excavadoras',
    subcategoria: 'exc-mediana',
    marca: 'caterpillar',
    modelo: 'Prueba',
    anio: 2018,
    condicion: 'bueno',
    usoValor: 5000,
    usoUnidad: 'h',
    descripcion: 'Anuncio sembrado por la prueba del catálogo.',
    provincia: 'Santo Domingo',
    moneda: 'DOP',
    modalidadPrecio: 'fijo',
    vence: db.sumarDias(30),
    fotos: [],
    telefonos: [{ numero: '8095550000', tipo: 'ambos', nota: null }],
    ...extra,
  });
  return r.idAnuncio || r.id || r;
}

const S = {};
function sembrar() {
  S.vendedor = cuenta('vendedor@ejemplo.test', 'Vendedora de Prueba');
  S.ajeno = cuenta('ajeno@ejemplo.test', 'Otro Vendedor');
  S.admin = cuenta('admin@ejemplo.test', 'Administradora de Prueba');
  db.marcarAdmin('admin@ejemplo.test', true);

  const org = S.vendedor.org;
  // Los tres precios del criterio de éxito, y uno caro para acotar.
  S.dop500 = anuncio(org, { modelo: 'RD500K', precio: 500000, moneda: 'DOP' });
  S.usd120 = anuncio(org, { modelo: 'US120K', precio: 120000, moneda: 'USD' });
  S.dop2m = anuncio(org, { modelo: 'RD2M', precio: 2000000, moneda: 'DOP' });
  S.dop9m = anuncio(org, { modelo: 'RD9M', precio: 9000000, moneda: 'DOP' });

  S.comoAdmin = { cookie: `te_sesion=${db.abrirSesion(S.admin.idUsuario)}` };
  S.comoVendedor = { cookie: `te_sesion=${db.abrirSesion(S.vendedor.idUsuario)}` };
  S.comoAjeno = { cookie: `te_sesion=${db.abrirSesion(S.ajeno.idUsuario)}` };
}

const catalogo = async (consulta) => {
  const r = await pedir({ url: `/api/anuncios?porPagina=60&${consulta}` });
  return r.datos || { anuncios: [] };
};
const ids = (r) => r.anuncios.map((a) => a.id);

/* ── CAT-01 · la moneda ──────────────────────────────────── */
async function bloqueMoneda() {
  console.log('\nLa tasa de partida');
  comprobar(db.tasaUsd().tasa === precios.TASA_USD_POR_DEFECTO && db.tasaUsd().fuente === 'defecto',
    `sin ajuste ni entorno, la tasa es la de precios.js (${precios.TASA_USD_POR_DEFECTO})`);
  comprobar(precios.precioEnPesos(120000, 'USD', 63) === 7560000 && precios.precioEnPesos(500000, 'DOP', 63) === 500000,
    'precioEnPesos convierte los dólares y deja los pesos');

  console.log('\nCriterio 1 · «desde RD$1,000,000» incluye la de US$120,000');
  let r = await catalogo('precioMin=1000000');
  comprobar(ids(r).includes(S.usd120), 'la máquina de US$120,000 sale en «desde RD$1,000,000»');
  comprobar(!ids(r).includes(S.dop500), 'la de RD$500,000 no sale');
  comprobar(r.total === 3, `el conteo cuadra con la página (total ${r.total}, se esperaban 3)`);

  r = await catalogo('precioMax=1000000');
  comprobar(!ids(r).includes(S.usd120), '«hasta RD$1,000,000» deja fuera la de US$120,000');
  comprobar(ids(r).includes(S.dop500), 'y deja dentro la de RD$500,000');

  r = await catalogo('precioMin=5000000&precioMax=8000000');
  comprobar(ids(r).length === 1 && ids(r)[0] === S.usd120,
    'un rango RD$5M-8M encuentra solo la de US$120,000 (≈ RD$7,560,000)');

  console.log('\nCriterio 2 · el orden por precio');
  r = await catalogo('orden=precio-asc');
  let orden = ids(r);
  comprobar(orden.indexOf(S.usd120) > orden.indexOf(S.dop500),
    'de menor a mayor, la de US$120,000 va por encima (después) de la de RD$500,000');
  comprobar(orden.indexOf(S.usd120) > orden.indexOf(S.dop2m) && orden.indexOf(S.usd120) < orden.indexOf(S.dop9m),
    'y cae entre la de RD$2M y la de RD$9M, donde le toca');
  r = await catalogo('orden=precio-desc');
  orden = ids(r);
  comprobar(orden.indexOf(S.usd120) < orden.indexOf(S.dop500),
    'de mayor a menor, la de US$120,000 va antes que la de RD$500,000');

  console.log('\nLa trampa del parámetro sobrante (:tasa solo en el ORDER BY)');
  r = await catalogo('');
  comprobar(r.total === 4 && r.anuncios.length === 4, 'sin filtros, el conteo y la página no revientan');
  r = await catalogo('orden=precio-asc&q=caterpillar');
  comprobar(r.total === 4, 'orden por precio con búsqueda de texto y sin rango de precio responde');

  console.log('\nLa respuesta dice con qué tasa comparó');
  comprobar(r.tasaUsd && r.tasaUsd.tasa === precios.TASA_USD_POR_DEFECTO,
    `el catálogo devuelve tasaUsd (${r.tasaUsd && r.tasaUsd.tasa})`);

  console.log('\nLa tasa del ajuste manda');
  db.guardarAjuste('tasa_usd', '3');
  comprobar(db.tasaUsd().tasa === 63, 'una tasa fuera de rango (3) se ignora');
  db.guardarAjuste('tasa_usd', '40');
  r = await catalogo('precioMin=5000000');
  comprobar(!ids(r).includes(S.usd120) && r.tasaUsd.tasa === 40,
    'con 40 RD$ por dólar, US$120,000 son RD$4.8M y ya no llegan a «desde RD$5M»');
  db.guardarAjuste('tasa_usd', '');
  r = await catalogo('precioMin=5000000');
  comprobar(ids(r).includes(S.usd120) && r.tasaUsd.fuente === 'defecto', 'al borrar el ajuste vuelve la de partida');

  process.env.MERCA_TASA_USD = '41,5';
  comprobar(db.tasaUsd().tasa === 41.5 && db.tasaUsd().fuente === 'entorno',
    'sin ajuste, manda MERCA_TASA_USD (y admite la coma decimal)');
  delete process.env.MERCA_TASA_USD;
}

(async () => {
  console.log('\nMercaMaquinarias · comprobaciones del catálogo\n');
  sembrar();
  await bloqueMoneda();

  console.log(`\n${bien} bien, ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
