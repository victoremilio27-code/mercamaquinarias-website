/**
 * Pruebas de las direcciones de redes sociales compartidas por todos los pies.
 *
 *   node --test tools/redes.prueba.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { REDES } = require('../assets/redes.js');

const PORTADAS = /^https:\/\/(?:www\.)?(?:instagram|facebook)\.com\/?$/i;

test('REDES se exporta como una lista', () => {
  assert.ok(Array.isArray(REDES));
});

test('cada red tiene nombre y enlace', () => {
  for (const red of REDES) {
    assert.equal(typeof red.nombre, 'string');
    assert.ok(red.nombre.trim());
    assert.equal(typeof red.enlace, 'string');
  }
});

test('cada enlace configurado usa https y no lleva a la portada de la red', () => {
  for (const { nombre, enlace } of REDES) {
    if (!enlace) continue;
    assert.ok(enlace.startsWith('https://'), nombre);
    assert.doesNotMatch(enlace, PORTADAS, nombre);
  }
});
