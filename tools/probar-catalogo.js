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

  // ORDENES_SQL[clave] con una clave heredada de Object («constructor»,
  // «toString») devolvía una función, se interpolaba en el ORDER BY y
  // el catálogo público respondía 500 a cualquiera que la escribiera.
  console.log('\nUn orden que es nombre de Object no revienta el catálogo');
  for (const clave of ['constructor', 'toString', '__proto__']) {
    const x = await pedir({ url: `/api/anuncios?orden=${clave}` });
    comprobar(x.codigo === 200 && x.datos && x.datos.total === 4, `«orden=${clave}» responde 200 con el orden por defecto`);
  }

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

  console.log('\nSolo un administrador cambia la tasa');
  const ruta = '/api/admin/tasa-cambio';
  let x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { tasa: 10 } });
  comprobar(x.codigo === 404 || x.codigo === 401, `sin sesión no se cambia (respondió ${x.codigo})`);
  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { tasa: 60 }, cabeceras: S.comoVendedor });
  comprobar(x.codigo === 404, `un anunciante recibe 404 (respondió ${x.codigo})`);
  comprobar(db.tasaUsd().fuente === 'defecto', 'y la tasa no se movió');
  x = await pedir({ url: ruta, cabeceras: S.comoVendedor });
  comprobar(x.codigo === 404, 'tampoco la puede leer por la ruta de administración');

  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { tasa: '60.25' }, cabeceras: S.comoAdmin });
  comprobar(x.codigo === 200 && x.datos.tasa === 60.25 && x.datos.fuente === 'ajuste',
    `el administrador la fija en 60.25 (respondió ${x.codigo})`);
  r = await catalogo('');
  comprobar(r.tasaUsd.tasa === 60.25, 'y el catálogo compara con ella');

  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { tasa: 630 }, cabeceras: S.comoAdmin });
  comprobar(x.codigo === 400 && db.tasaUsd().tasa === 60.25, 'una tasa fuera de rango (630) se rechaza con 400 y no se guarda');
  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { tasa: 'sesenta' }, cabeceras: S.comoAdmin });
  comprobar(x.codigo === 400, 'un texto que no es número también');

  x = await pedir({ url: ruta, cabeceras: S.comoAdmin });
  comprobar(x.codigo === 200 && x.datos.porDefecto === precios.TASA_USD_POR_DEFECTO && x.datos.minimo === precios.TASA_USD_MIN,
    'la lectura de administración dice la vigente, el rango y la de partida');

  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { tasa: '' }, cabeceras: S.comoAdmin });
  comprobar(x.codigo === 200 && x.datos.fuente === 'defecto' && x.datos.tasa === precios.TASA_USD_POR_DEFECTO,
    'vacío vuelve a la de partida');

  comprobar(api.ESCRITURAS_ADMIN_PROPIAS.size > 0
    && api.RUTAS.some(([m, p, h]) => m === 'PATCH' && p.test(ruta) && api.ESCRITURAS_ADMIN_PROPIAS.has(h)),
  'la escritura de la tasa está declarada como propia de la plataforma (no va a la bitácora)');
}

/* ── CAT-02 · en el país o bajo pedido ───────────────────── */
async function bloqueDisponibilidad() {
  const d = db.abrir();
  console.log('\nLa columna y su migración');
  comprobar(!!d.prepare("SELECT 1 FROM migraciones WHERE id = '2026-09-anuncios-disponibilidad'").get(),
    'la migración 2026-09-anuncios-disponibilidad queda anotada');
  comprobar(d.prepare('SELECT COUNT(*) AS n FROM anuncios WHERE disponibilidad = ?').get('en-pais').n === 4,
    'los anuncios creados sin decir nada quedan «en el país»');
  let e = null;
  try { d.prepare("UPDATE anuncios SET disponibilidad = 'en-camino' WHERE id = ?").run(S.dop500); } catch (x) { e = x; }
  comprobar(!!e, 'la base rechaza un valor que no es de los dos admitidos');

  S.pedido = anuncio(S.vendedor.org, { modelo: 'PEDIDO', precio: 90000, moneda: 'USD', disponibilidad: 'bajo-pedido' });
  S.raro = anuncio(S.vendedor.org, { modelo: 'RARO', precio: 800000, disponibilidad: '<script>' });
  comprobar(db.anuncio(S.raro).disponibilidad === 'en-pais', 'crearAnuncio normaliza un valor desconocido a «en el país»');

  console.log('\nCriterio 3 · la ficha lo dice');
  let x = await pedir({ url: `/api/anuncios/${S.pedido}` });
  comprobar(x.codigo === 200 && x.datos.anuncio.disponibilidad === 'bajo-pedido', 'la ficha pública trae «bajo-pedido»');
  x = await pedir({ url: `/api/anuncios/${S.dop500}` });
  comprobar(x.datos.anuncio.disponibilidad === 'en-pais', 'y «en-pais» en uno que está aquí');
  let r = await catalogo('');
  const tarjeta = r.anuncios.find((a) => a.id === S.pedido);
  comprobar(tarjeta && tarjeta.disponibilidad === 'bajo-pedido', 'la tarjeta del catálogo también la trae');

  console.log('\nCriterio 3 · el catálogo filtra por ello');
  r = await catalogo('disponibilidad=bajo-pedido');
  comprobar(r.total === 1 && ids(r)[0] === S.pedido, `«bajo pedido» devuelve solo ese (total ${r.total})`);
  r = await catalogo('disponibilidad=en-pais');
  comprobar(r.total === 5 && !ids(r).includes(S.pedido), `«en el país» devuelve los otros cinco (total ${r.total})`);
  r = await catalogo('disponibilidad=cualquier-cosa');
  comprobar(r.total === 6, 'un valor desconocido no filtra (no deja el catálogo vacío)');

  console.log('\nEl dueño la cambia desde su panel');
  const ruta = `/api/anuncios/${S.pedido}/disponibilidad`;
  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { disponibilidad: 'en-pais' } });
  comprobar(x.codigo === 401 || x.codigo === 404, `sin sesión no (respondió ${x.codigo})`);
  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { disponibilidad: 'en-pais' }, cabeceras: S.comoAjeno });
  comprobar(x.codigo === 404 && db.anuncio(S.pedido).disponibilidad === 'bajo-pedido',
    `otra organización recibe 404 y no cambia nada (respondió ${x.codigo})`);
  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { disponibilidad: 'llegando' }, cabeceras: S.comoVendedor });
  comprobar(x.codigo === 400, 'un valor inventado recibe 400');
  x = await pedir({ metodo: 'PATCH', url: ruta, cuerpo: { disponibilidad: 'en-pais' }, cabeceras: S.comoVendedor });
  comprobar(x.codigo === 200 && db.anuncio(S.pedido).disponibilidad === 'en-pais', 'el dueño la pasa a «en el país»');
  x = await pedir({ url: '/api/mis-anuncios', cabeceras: S.comoVendedor });
  const enPanel = x.datos && (x.datos.anuncios || []).find((a) => a.id === S.pedido);
  comprobar(enPanel && enPanel.disponibilidad === 'en-pais', 'y el panel la ve cambiada');
  db.guardarDisponibilidad(S.pedido, S.vendedor.org.id, 'bajo-pedido');
}

/* ── CAT-03 · permuta e ITBIS como filtros ───────────────── */
async function bloqueCondiciones() {
  const org = S.vendedor.org;
  S.permuta = anuncio(org, { modelo: 'PERMUTA', precio: 1500000, permuta: true });
  S.itbis = anuncio(org, { modelo: 'ITBIS', precio: 3000000, itbisIncluido: true });
  S.ambas = anuncio(org, { modelo: 'AMBAS', precio: 50000, moneda: 'USD', permuta: true, itbisIncluido: true });

  console.log('\nCriterio 4 · permuta e ITBIS incluido filtran');
  let r = await catalogo('permuta=1');
  comprobar(r.total === 2 && ids(r).includes(S.permuta) && ids(r).includes(S.ambas),
    `«acepta permuta» devuelve los dos que la aceptan (total ${r.total})`);
  r = await catalogo('itbis=1');
  comprobar(r.total === 2 && ids(r).includes(S.itbis) && ids(r).includes(S.ambas),
    `«ITBIS incluido» devuelve los dos que lo incluyen (total ${r.total})`);
  r = await catalogo('permuta=1&itbis=1');
  comprobar(r.total === 1 && ids(r)[0] === S.ambas, 'las dos juntas, solo el que cumple ambas');

  console.log('\nCombinados con moneda y disponibilidad');
  r = await catalogo('permuta=1&precioMin=2000000');
  comprobar(r.total === 1 && ids(r)[0] === S.ambas,
    'permuta y «desde RD$2M» encuentra el de US$50,000 (≈ RD$3.15M) y no el de RD$1.5M');
  r = await catalogo('itbis=1&disponibilidad=bajo-pedido');
  comprobar(r.total === 0, 'ITBIS incluido y bajo pedido no encuentra ninguno (no hay)');
  r = await catalogo('itbis=1&orden=precio-desc');
  comprobar(ids(r)[0] === S.ambas && ids(r)[1] === S.itbis,
    'ordenado por precio, el de US$50,000 va antes que el de RD$3M');

  console.log('\nValores que no activan el filtro');
  const todos = (await catalogo('')).total;
  r = await catalogo('permuta=si&itbis=true');
  comprobar(r.total === todos, `«permuta=si» o «itbis=true» no filtran (total ${r.total} de ${todos})`);
  r = await catalogo('permuta=0');
  comprobar(r.total === todos, '«permuta=0» tampoco');

  console.log('\nLa tarjeta trae las condiciones');
  r = await catalogo('permuta=1&itbis=1');
  const t = r.anuncios[0] || {};
  comprobar(t.permuta === 1 && t.itbis_incluido === 1, 'el listado devuelve permuta e itbis_incluido');
}

(async () => {
  console.log('\nMercaMaquinarias · comprobaciones del catálogo\n');
  sembrar();
  await bloqueMoneda();
  await bloqueDisponibilidad();
  await bloqueCondiciones();

  console.log(`\n${bien} bien, ${mal} mal`);
  process.exit(mal ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
