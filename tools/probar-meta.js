/**
 * probar-meta.js — metadatos seguros y completos para fichas y buscadores.
 *
 * Corre contra una base y una carpeta de fotos temporales. No toca datos
 * reales ni necesita arrancar el servidor.
 */

const fs = require('fs');
const path = require('path');

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

console.log(`\n${bien} comprobaciones bien; ${mal} mal.`);
fs.rmSync(TEMPORAL, { recursive: true, force: true });
process.exit(mal ? 1 : 0);
