/**
 * Pruebas del importe en letras.
 *
 *   node --test tools/numero-a-letras.prueba.js
 *
 * Se usa `node:test`, que viene en Node: el proyecto no añade un
 * corredor de pruebas por una función, igual que no añade un generador
 * de PDF por un comprobante.
 */

const test = require('node:test');
const assert = require('node:assert');

const { enLetras, enPalabras } = require('./numero-a-letras.js');

test('los casos de la especificación', () => {
  assert.equal(enLetras(0), 'Cero pesos dominicanos con 00/100');
  assert.equal(enLetras(1), 'Un peso dominicano con 00/100');
  assert.equal(enLetras(21), 'Veintiún pesos dominicanos con 00/100');
  assert.equal(enLetras(100), 'Cien pesos dominicanos con 00/100');
  assert.equal(enLetras(1000), 'Mil pesos dominicanos con 00/100');
  assert.equal(enLetras(1000000), 'Un millón de pesos dominicanos con 00/100');
});

test('decimales', () => {
  assert.equal(enLetras(1.5), 'Un peso dominicano con 50/100');
  assert.equal(enLetras(2360.05), 'Dos mil trescientos sesenta pesos dominicanos con 05/100');
  assert.equal(enLetras(0.99), 'Cero pesos dominicanos con 99/100');
  /* El redondeo de los centavos no puede perder un peso. */
  assert.equal(enLetras(1.999), 'Dos pesos dominicanos con 00/100');
});

test('apócope delante del sustantivo', () => {
  assert.equal(enLetras(101), 'Ciento un pesos dominicanos con 00/100');
  assert.equal(enLetras(31), 'Treinta y un pesos dominicanos con 00/100');
  assert.equal(enLetras(21000), 'Veintiún mil pesos dominicanos con 00/100');
});

test('el millón redondo lleva «de» y el que no, no', () => {
  assert.equal(enLetras(2000000), 'Dos millones de pesos dominicanos con 00/100');
  assert.equal(enLetras(1500000), 'Un millón quinientos mil pesos dominicanos con 00/100');
});

test('importes reales de la plataforma', () => {
  assert.equal(enLetras(2360), 'Dos mil trescientos sesenta pesos dominicanos con 00/100');
  assert.equal(enLetras(8260), 'Ocho mil doscientos sesenta pesos dominicanos con 00/100');
  assert.equal(enLetras(4130), 'Cuatro mil ciento treinta pesos dominicanos con 00/100');
});

test('enPalabras por separado', () => {
  assert.equal(enPalabras(0), 'cero');
  assert.equal(enPalabras(16), 'dieciséis');
  assert.equal(enPalabras(999999999), 'novecientos noventa y nueve millones novecientos noventa y nueve mil novecientos noventa y nueve');
});
