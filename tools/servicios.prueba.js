/**
 * Pruebas del interruptor de servicios.
 *
 *   node --test tools/servicios.prueba.js
 *
 * Existe porque transporte y financiamiento están apagados a propósito en
 * assets/servicios.js, y de esa única lista beben los menús, el servidor
 * (que redirige sus páginas) y la API (que rechaza sus solicitudes). Si
 * alguien los enciende sin querer, o rompe el final compartido con el
 * navegador, esto lo dice antes de llegar a producción.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const servicios = require('../assets/servicios.js');
const {
  SERVICIOS,
  ASISTENTE,
  seOfrece,
  paginasApagadas,
  serviciosQueAdmitenSolicitud,
} = servicios;

test('se carga con require() y expone las piezas de servicios', () => {
  assert.equal(typeof SERVICIOS, 'object');
  assert.equal(typeof seOfrece, 'function');
  assert.equal(typeof paginasApagadas, 'function');
  assert.equal(typeof serviciosQueAdmitenSolicitud, 'function');
});

test('el asistente se exporta y hoy está apagado', () => {
  assert.equal(typeof ASISTENTE, 'object');
  assert.equal(typeof ASISTENTE.activo, 'boolean');
  assert.equal(ASISTENTE.activo, false);
});

test('alquiler e importación se ofrecen; transporte y financiamiento no', () => {
  assert.equal(seOfrece('alquiler'), true);
  assert.equal(seOfrece('importacion'), true);
  assert.equal(seOfrece('transporte'), false);
  assert.equal(seOfrece('financiamiento'), false);
});

test('un servicio desconocido no se ofrece y no lanza', () => {
  assert.equal(seOfrece('no-existe'), false);
  assert.equal(seOfrece(undefined), false);
});

test('las páginas apagadas son exactamente las de transporte y financiamiento', () => {
  assert.deepEqual(paginasApagadas(), ['/transporte.html', '/financiamiento.html']);
  for (const p of paginasApagadas()) assert.ok(p.startsWith('/'), p);
});

test('solo se admiten solicitudes de lo que se ofrece, más el contacto general', () => {
  const admitidos = serviciosQueAdmitenSolicitud();
  for (const s of ['alquiler', 'importacion', 'contacto']) assert.ok(admitidos.includes(s), s);
  for (const s of ['transporte', 'financiamiento']) assert.ok(!admitidos.includes(s), s);
});

test('coherencia: todo servicio apagado tiene su página apagada y ninguno encendido la tiene', () => {
  const apagadas = paginasApagadas();
  for (const [clave, s] of Object.entries(SERVICIOS)) {
    assert.equal(apagadas.includes(`/${s.pagina}`), !s.activo, clave);
  }
});

test('cada servicio tiene nombre y una página HTML que existe', () => {
  for (const [clave, { nombre, pagina }] of Object.entries(SERVICIOS)) {
    assert.ok(nombre.trim(), clave);
    assert.ok(pagina.endsWith('.html'), clave);
    assert.ok(fs.existsSync(path.join(__dirname, '..', pagina)), clave);
  }
});
