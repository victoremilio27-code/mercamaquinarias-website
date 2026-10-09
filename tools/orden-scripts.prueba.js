/**
 * Guarda el orden de los scripts del navegador. Sin compilador, un global usado
 * antes de que exista solo falla al abrir la página que toma ese camino.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');

const DEPENDENCIAS = {
  // Cabecera de app.js: data.js; detección: SESION, taxonomía, precios y servicios.
  'assets/app.js': ['assets/sesion.js', 'assets/taxonomia.js', 'assets/precios.js', 'assets/servicios.js', 'assets/data.js'],
  // Detección: api/haySesion de sesion.js y esc de app.js.
  'assets/alertas.js': ['assets/sesion.js', 'assets/app.js'],
  // Detección: api de sesion.js, documento de legales.js y utilidades de app.js.
  'assets/admin.js': ['assets/sesion.js', 'assets/servicios.js', 'assets/legales.js', 'assets/app.js'],
  // Cabecera de cardnet.js y detección: api de sesion.js y esc de app.js.
  'assets/cardnet.js': ['assets/sesion.js', 'assets/app.js'],
  // Detección: api de sesion.js y esc de app.js.
  'assets/chat.js': ['assets/sesion.js', 'assets/app.js'],
  // Cabecera de contactos.js: sesion.js (api) y app.js (esc, icono, $, $$).
  'assets/contactos.js': ['assets/sesion.js', 'assets/app.js'],
  // Detección: sesión, documentos legales y utilidades de app.js.
  'assets/cuenta.js': ['assets/sesion.js', 'assets/legales.js', 'assets/app.js'],
  // Detección: categoria de taxonomia.js valida las claves compartidas.
  'assets/especificaciones.js': ['assets/taxonomia.js'],
  // Detección: api de sesion.js y utilidades de app.js.
  'assets/mi-pagina.js': ['assets/sesion.js', 'assets/app.js'],
  // Cabecera de mapa.js: SILUETA_RD y CIUDADES_RD de data.js.
  'assets/mapa.js': ['assets/data.js'],
  // Detección: sesión, catálogos, precios, legales, contactos, CardNet y app.js.
  'assets/panel.js': ['assets/sesion.js', 'assets/taxonomia.js', 'assets/precios.js', 'assets/servicios.js', 'assets/legales.js', 'assets/app.js', 'assets/contactos.js', 'assets/cardnet.js'],
  // Detección: api de sesion.js, categoria de taxonomia.js y utilidades de app.js.
  'assets/perfil.js': ['assets/sesion.js', 'assets/taxonomia.js', 'assets/app.js'],
  // Detección: sesión, precios, legales, utilidades de app.js y CardNet.
  'assets/planes.js': ['assets/sesion.js', 'assets/precios.js', 'assets/legales.js', 'assets/app.js', 'assets/cardnet.js'],
  // Detección: todos los catálogos y ayudantes cargados antes del asistente.
  'assets/publicar.js': ['assets/sesion.js', 'assets/taxonomia.js', 'assets/precios.js', 'assets/data.js', 'assets/legales.js', 'assets/app.js', 'assets/contactos.js', 'assets/cardnet.js', 'assets/especificaciones.js'],
};

function esLocal(src) {
  return !/^(?:[a-z]+:)?\/\//i.test(src) && !/^(?:data:|javascript:|#)/i.test(src);
}

function rutaLocal(src) {
  return decodeURIComponent(src.split(/[?#]/, 1)[0]).replace(/^\/+/, '');
}

function scriptsDe(html) {
  const scripts = [];
  const patron = /<script\b[^>]*\bsrc\s*=\s*(["'])(.*?)\1[^>]*>/gi;
  for (const coincidencia of html.matchAll(patron)) {
    if (esLocal(coincidencia[2])) {
      scripts.push({ src: rutaLocal(coincidencia[2]), indice: coincidencia.index });
    }
  }
  return scripts;
}

const paginas = fs.readdirSync(RAIZ)
  .filter((nombre) => nombre.endsWith('.html') && fs.statSync(path.join(RAIZ, nombre)).isFile())
  .sort();

for (const pagina of paginas) {
  const html = fs.readFileSync(path.join(RAIZ, pagina), 'utf8');
  const scripts = scriptsDe(html);
  const posiciones = new Map(scripts.map(({ src }, indice) => [src, indice]));

  test(`${pagina}: las dependencias locales están cargadas antes`, () => {
    for (const [indice, { src }] of scripts.entries()) {
      for (const dependencia of DEPENDENCIAS[src] || []) {
        assert.ok(posiciones.has(dependencia), `${pagina}: ${src} necesita ${dependencia}, que no está cargado`);
        assert.ok(posiciones.get(dependencia) < indice, `${pagina}: ${src} necesita ${dependencia}, pero este se carga después`);
      }
    }
  });

  test(`${pagina}: tema.js se carga en el head`, () => {
    const tema = scripts.find(({ src }) => src === 'assets/tema.js');
    assert.ok(tema, `${pagina}: assets/tema.js no está cargado`);
    const cierreHead = html.search(/<\/head\s*>/i);
    assert.ok(cierreHead !== -1 && tema.indice < cierreHead, `${pagina}: assets/tema.js debe cargarse dentro del <head>`);
  });

  test(`${pagina}: ningún script local está repetido`, () => {
    const vistos = new Set();
    for (const { src } of scripts) {
      assert.ok(!vistos.has(src), `${pagina}: ${src} aparece más de una vez`);
      vistos.add(src);
    }
  });

  test(`${pagina}: todos los scripts locales existen`, () => {
    for (const { src } of scripts) {
      assert.ok(fs.existsSync(path.join(RAIZ, src)), `${pagina}: ${src} no existe en el repositorio`);
    }
  });
}
