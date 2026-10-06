/**
 * probar-meta.js — metadatos seguros y completos para fichas y buscadores.
 *
 * Corre contra una base y una carpeta de fotos temporales. No toca datos
 * reales ni necesita arrancar el servidor.
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const TEMPORAL = path.join(__dirname, '..', '.tmp', 'prueba-meta');
fs.rmSync(TEMPORAL, { recursive: true, force: true });
fs.mkdirSync(TEMPORAL, { recursive: true });
process.env.MERCA_DB = path.join(TEMPORAL, 'prueba.db');
process.env.MERCA_FOTOS = path.join(TEMPORAL, 'fotos');

const db = require('./db');
const meta = require('./meta');

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

function cuenta(correo, nombre, tipo = 'particular') {
  const creada = db.crearCuenta({
    correo,
    clave: 'UnaClaveLargaYSegura9',
    nombre,
    telefono: '8095550000',
    tipo,
    ...(tipo === 'dealer' ? {
      empresa: nombre,
      rnc: '131111111',
      direccion: 'Calle de Prueba 1',
      provincia: 'santo-domingo',
      solicitud: { encargado: nombre, aniosOperando: 5 },
    } : {}),
  });
  return { ...creada, org: db.organizacionDe(creada.idUsuario) };
}

function anuncio(org, numero, extra = {}) {
  return db.crearAnuncio({
    idOrg: org.id,
    categoria: 'excavadoras',
    subcategoria: 'exc-mediana',
    marca: 'caterpillar',
    modelo: `Meta ${numero}`,
    anio: 2024,
    condicion: 'nuevo',
    descripcion: `Descripción de prueba ${numero}.`,
    provincia: 'santo-domingo',
    precio: 1000000 + numero,
    moneda: 'DOP',
    modalidadPrecio: 'fijo',
    disponibilidad: 'en-pais',
    vence: db.sumarDias(30),
    fotos: [],
    telefonos: [],
    ...extra,
  });
}

function consulta(ruta) {
  return new URL(ruta, 'https://mercamaquinarias.com').searchParams;
}

function jsonDelHtml(html) {
  const hallado = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  return hallado ? JSON.parse(hallado[1]) : null;
}

function cierresTrasJsonLd(html) {
  const desde = html.indexOf('<script type="application/ld+json">');
  const hasta = html.indexOf('</head>', desde);
  return (html.slice(desde, hasta).match(/<\/script>/g) || []).length;
}

const plantillaEquipo = fs.readFileSync(path.join(__dirname, '..', 'equipo.html'), 'utf8');
const plantillaDealer = fs.readFileSync(path.join(__dirname, '..', 'dealer.html'), 'utf8');
const plantillaPortada = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const particular = cuenta('meta@ejemplo.test', 'Vendedor de Meta');
const descripcionPeligrosa = 'Descripción segura </script><b>x</b> que debe conservarse.';
const idPeligroso = anuncio(particular.org, 1, { descripcion: descripcionPeligrosa });

console.log('\nJSON-LD de un anuncio');
const datosPeligrosos = meta.para('/equipo.html', consulta(`/equipo.html?id=${idPeligroso}`));
const htmlPeligroso = meta.aplicar(plantillaEquipo, datosPeligrosos);
comprobar(cierresTrasJsonLd(htmlPeligroso) === 1,
  'la única etiqueta de cierre de script es la del JSON-LD');
comprobar(jsonDelHtml(htmlPeligroso).description === descripcionPeligrosa,
  'el JSON parsea y conserva la descripción original del anuncio');
comprobar((htmlPeligroso.match(/<title>/g) || []).length === 1,
  'el HTML tiene exactamente un título');
comprobar((htmlPeligroso.match(/<link rel="canonical"/g) || []).length === 1,
  'el HTML tiene exactamente un canonical');
comprobar((htmlPeligroso.match(/type="application\/ld\+json"/g) || []).length === 1,
  'el HTML tiene exactamente un JSON-LD');

console.log('\nJSON-LD de un dealer');
const dealer = cuenta('dealer-meta@ejemplo.test', 'Dealer Meta', 'dealer');
db.abrir().prepare(`UPDATE organizaciones
  SET descripcion = ?, estado_revision = 'aprobada', perfil_publico = 1,
      estado_pagina = 'publicada'
  WHERE id = ?`).run(descripcionPeligrosa, dealer.org.id);
const datosDealer = meta.para('/dealer.html', consulta(`/dealer.html?d=${dealer.org.slug}`));
const htmlDealer = meta.aplicar(plantillaDealer, datosDealer);
comprobar(cierresTrasJsonLd(htmlDealer) === 1,
  'la descripción del dealer tampoco puede cerrar el script');
comprobar(jsonDelHtml(htmlDealer).description === descripcionPeligrosa,
  'el JSON del dealer parsea y conserva su descripción original');

console.log('\nPáginas fijas');
const rutasFijas = [
  '/', '/equipos.html', '/categorias.html', '/dealers.html', '/alquiler.html',
  '/importar.html', '/planes.html', '/contacto.html', '/estafas.html', '/legal.html',
];
for (const ruta of rutasFijas) {
  const archivo = ruta === '/' ? 'index.html' : ruta.slice(1);
  const plantilla = fs.readFileSync(path.join(__dirname, '..', archivo), 'utf8');
  const compuesto = meta.aplicar(plantilla, meta.para(ruta, consulta(ruta)));
  comprobar((compuesto.match(/<link rel="canonical"/g) || []).length === 1
    && compuesto.includes(`href="${meta.SITIO}${ruta}"`),
  `${ruta} lleva exactamente su canonical`);
}
comprobar(meta.para('/index.html', consulta('/index.html'))?.url === `${meta.SITIO}/`,
  '/index.html normaliza su canonical a la raíz');
comprobar(meta.para('/equipos.html', consulta('/equipos.html?q=grua')) === null,
  'una página fija con consulta no gana canonical');
comprobar(meta.para('/panel.html', consulta('/panel.html')) === null
  && meta.para('/404.html', consulta('/404.html')) === null,
'panel y 404 no ganan canonical');

const portada = meta.aplicar(plantillaPortada, meta.para('/', consulta('/')));
const datosPortada = jsonDelHtml(portada);
comprobar(Array.isArray(datosPortada['@graph'])
  && datosPortada['@graph'].some((nodo) => nodo['@type'] === 'Organization')
  && datosPortada['@graph'].some((nodo) => nodo['@type'] === 'WebSite'),
'el JSON-LD parseable de la portada declara Organization y WebSite');
comprobar(!portada.includes('telephone') && !portada.includes('"address"'),
  'la organización no publica teléfono ni dirección');
const portadaDosVeces = meta.aplicar(portada, meta.para('/', consulta('/')));
comprobar((portadaDosVeces.match(/<link rel="canonical"/g) || []).length === 1
  && (portadaDosVeces.match(/type="application\/ld\+json"/g) || []).length === 1,
'componer dos veces no duplica canonical ni JSON-LD');

console.log('\nCatálogo por categoría');
const categoriaValida = meta.para('/equipos.html', consulta('/equipos.html?categoria=excavadoras'));
comprobar(categoriaValida.titulo
  === 'Excavadoras en venta en República Dominicana | MercaMaquinarias',
'una categoría válida obtiene su título específico');
comprobar(categoriaValida.url === `${meta.SITIO}/equipos.html?categoria=excavadoras`,
  'la categoría válida obtiene su canonical');
const catalogoCategoria = meta.aplicar(
  fs.readFileSync(path.join(__dirname, '..', 'equipos.html'), 'utf8'), categoriaValida,
);
comprobar((catalogoCategoria.match(/<link rel="canonical"/g) || []).length === 1
  && catalogoCategoria.includes(`<meta property="og:title" content="${categoriaValida.titulo}">`)
  && catalogoCategoria.includes(`<meta property="og:url" content="${categoriaValida.url}">`),
'la categoría compuesta lleva un canonical y Open Graph coherente');
comprobar(meta.para('/equipos.html', consulta('/equipos.html?categoria=no-existe')) === null,
  'una categoría inválida conserva los metadatos genéricos');
comprobar(meta.para('/equipos.html',
  consulta('/equipos.html?categoria=excavadoras&orden=precio')) === null,
'una categoría con filtros adicionales conserva los metadatos genéricos');

console.log('\nCondición, disponibilidad y precio');
const usadoPedido = anuncio(particular.org, 2, {
  condicion: 'usado', disponibilidad: 'bajo-pedido',
});
const productoUsado = meta.para('/equipo.html', consulta(`/equipo.html?id=${usadoPedido}`)).jsonld;
comprobar(productoUsado.itemCondition === 'https://schema.org/UsedCondition',
  'un equipo usado se identifica como UsedCondition');
comprobar(productoUsado.offers.availability === 'https://schema.org/BackOrder',
  'un equipo bajo pedido se identifica como BackOrder');
comprobar(productoUsado.url.endsWith(`/equipo.html?id=${usadoPedido}`),
  'el Product lleva la URL de su ficha');

const productoNuevo = datosPeligrosos.jsonld;
comprobar(productoNuevo.itemCondition === 'https://schema.org/NewCondition',
  'un equipo nuevo se identifica como NewCondition');
comprobar(productoNuevo.offers.availability === 'https://schema.org/InStock',
  'un equipo en el país se identifica como InStock');
const sinPrecio = anuncio(particular.org, 3, { precio: null, modalidadPrecio: 'ofertas' });
comprobar(!Object.hasOwn(meta.para('/equipo.html', consulta(`/equipo.html?id=${sinPrecio}`)).jsonld, 'offers'),
  'un anuncio sin precio no lleva offers');

console.log('\nSitemap paginado');
const activos = [idPeligroso, usadoPedido, sinPrecio];
for (let i = 4; i <= 63; i++) activos.push(anuncio(particular.org, i));
const inactivo = anuncio(particular.org, 64);
db.cambiarEstadoAnuncio(inactivo, particular.org.id, 'pausado');
const mapa = meta.sitemap();
comprobar(activos.every((id) => mapa.includes(`<loc>${meta.SITIO}/equipo.html?id=${id}</loc>`)),
  'el sitemap incluye los 63 anuncios activos, también los de la segunda página');
comprobar(!mapa.includes(`<loc>${meta.SITIO}/equipo.html?id=${inactivo}</loc>`),
  'el sitemap excluye los anuncios no activos');

console.log('\nRutas inexistentes');
comprobar(meta.para('/equipo.html', consulta('/equipo.html?id=no-existe')) === null,
  'para() devuelve null para un anuncio inexistente sin lanzar');

function pedir(puerto, ruta, cabeceras = {}) {
  return new Promise((resolve, reject) => {
    http.get({ hostname: '127.0.0.1', port: puerto, path: ruta, headers: cabeceras }, (res) => {
      const partes = [];
      res.on('data', (parte) => partes.push(parte));
      res.on('end', () => resolve({
        estado: res.statusCode, cabeceras: res.headers, cuerpo: Buffer.concat(partes).toString(),
      }));
    }).on('error', reject);
  });
}

async function probarEtagCompuesto() {
  console.log('\nCaché del HTML compuesto');
  const puerto = 19000 + (process.pid % 1000);
  const servidor = spawn(process.execPath,
    [path.join(__dirname, 'serve.js'), '--port', String(puerto)], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, PORT: String(puerto) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  try {
    await new Promise((resolve, reject) => {
      const temporizador = setTimeout(() => reject(new Error('el servidor no arrancó')), 10000);
      servidor.stdout.on('data', (salida) => {
        if (!salida.toString().includes('MercaMaquinarias en')) return;
        clearTimeout(temporizador);
        resolve();
      });
      servidor.once('exit', (codigo) => reject(new Error(`el servidor terminó con ${codigo}`)));
    });
    const primera = await pedir(puerto, '/');
    const segunda = await pedir(puerto, '/', { 'If-None-Match': primera.cabeceras.etag });
    comprobar(primera.estado === 200 && primera.cuerpo.includes('<link rel="canonical"'),
      'el servidor entrega la portada compuesta');
    comprobar(Boolean(primera.cabeceras.etag) && segunda.estado === 304 && !segunda.cuerpo,
      'el ETag del compuesto permite responder 304');
  } finally {
    servidor.kill();
  }
}

probarEtagCompuesto().catch((e) => {
  mal++;
  console.error(`  MAL caché del HTML compuesto: ${e.message}`);
}).finally(() => {
  console.log(`\n${bien} comprobaciones bien; ${mal} mal.`);
  fs.rmSync(TEMPORAL, { recursive: true, force: true });
  process.exit(mal ? 1 : 0);
});
