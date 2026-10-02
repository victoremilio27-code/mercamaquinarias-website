const test = require('node:test');
const assert = require('node:assert/strict');

const { rangoDe } = require('./rango');

test('devuelve los límites indicados', () => {
  assert.deepEqual(rangoDe('bytes=0-99', 1000), { desde: 0, hasta: 99 });
  assert.deepEqual(rangoDe('bytes=0-0', 1000), { desde: 0, hasta: 0 });
});

test('completa los rangos abiertos', () => {
  assert.deepEqual(rangoDe('bytes=100-', 1000), { desde: 100, hasta: 999 });
  assert.deepEqual(rangoDe('bytes=-500', 1000), { desde: 500, hasta: 999 });
});

test('recorta el final al tamaño del archivo', () => {
  assert.deepEqual(rangoDe('bytes=900-1200', 1000), { desde: 900, hasta: 999 });
});

test('rechaza los rangos que no se pueden servir', () => {
  assert.deepEqual(rangoDe('bytes=-', 1000), { invalido: true });
  assert.deepEqual(rangoDe('bytes=200-100', 1000), { invalido: true });
  assert.deepEqual(rangoDe('bytes=1000-', 1000), { invalido: true });
  assert.deepEqual(rangoDe('bytes=0-0', 0), { invalido: true });
});

test('ignora una cabecera ausente o no compatible', () => {
  assert.equal(rangoDe('', 1000), null);
  assert.equal(rangoDe(undefined, 1000), null);
  assert.equal(rangoDe('bytes=0-1,5-6', 1000), null);
});
