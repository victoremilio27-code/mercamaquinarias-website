/**
 * Pruebas de la fórmula del precio.
 *
 *   node --test tools/precios.prueba.js
 *
 * Existe porque el precio final sale de UNA función, `desglose` de
 * assets/precios.js, y de ella beben la tarjeta de planes, el resumen de
 * compra, lo que guarda cada pago y el comprobante con NCF. La fórmula
 * es la de research/modelo-comercial.md §12: base → ajuste del 3 % →
 * subtotal gravado → ITBIS 18 % → final. Si aquí se equivoca un peso,
 * se equivoca en todas partes a la vez.
 *
 * Todo va en pesos enteros (D-03 de la fase 05.1): `aCentavos` del plan
 * 06-01 lanza con decimales, y un total de 2.187,72 rompería el cobro
 * con CardNet. Por eso las invariantes exigen enteros y que
 * subtotal + ITBIS = total por construcción, sin redondeos sueltos.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const precios = require('../assets/precios.js');
const { desglose, precioCompra, precioAmpliacion, precioRenovacion, siguienteCupo } = precios;

/* Solo los importes, sin los campos extra de compra o ampliación. */
const importes = (d) => ({
  base: d.base, ajusteTasa: d.ajusteTasa, ajuste: d.ajuste,
  subtotal: d.subtotal, itbisTasa: d.itbisTasa, itbis: d.itbis, total: d.total,
});

test('las tasas están exportadas y son las del modelo', () => {
  assert.equal(precios.AJUSTE, 0.03);
  assert.equal(precios.ITBIS, 0.18);
});

test('los casos de la auditoría §3 dan exacto', () => {
  assert.deepEqual(importes(desglose(1800)), {
    base: 1800, ajusteTasa: 0.03, ajuste: 54, subtotal: 1854, itbisTasa: 0.18, itbis: 334, total: 2188,
  });
  assert.deepEqual(importes(desglose(3200)), {
    base: 3200, ajusteTasa: 0.03, ajuste: 96, subtotal: 3296, itbisTasa: 0.18, itbis: 593, total: 3889,
  });
  assert.deepEqual(importes(desglose(5500)), {
    base: 5500, ajusteTasa: 0.03, ajuste: 165, subtotal: 5665, itbisTasa: 0.18, itbis: 1020, total: 6685,
  });
  assert.deepEqual(importes(desglose(2000)), {
    base: 2000, ajusteTasa: 0.03, ajuste: 60, subtotal: 2060, itbisTasa: 0.18, itbis: 371, total: 2431,
  });
});

test('el importe cero sigue siendo cero, y lo negativo también (D-04)', () => {
  for (const b of [0, -5]) {
    const d = desglose(b);
    assert.equal(d.base, 0);
    assert.equal(d.ajuste, 0);
    assert.equal(d.subtotal, 0);
    assert.equal(d.itbis, 0);
    assert.equal(d.total, 0);
  }
});

test('invariantes: enteros, subtotal = base + ajuste, total = subtotal + ITBIS', () => {
  const bases = [9900, 7200, 1600];
  for (let b = 0; b <= 20000; b += 7) bases.push(b);
  for (const b of bases) {
    const d = desglose(b);
    for (const campo of ['base', 'ajuste', 'subtotal', 'itbis', 'total']) {
      assert.ok(Number.isInteger(d[campo]), `${campo} de ${b} no es entero: ${d[campo]}`);
    }
    assert.equal(d.base, b);
    assert.equal(d.subtotal, d.base + d.ajuste, `subtotal de ${b}`);
    assert.equal(d.total, d.subtotal + d.itbis, `total de ${b}`);
    assert.ok(Math.abs(d.itbis - d.subtotal * 0.18) <= 0.5, `ITBIS de ${b} fuera de medio peso`);
  }
});

test('la compra pasa por desglose: un cupo y cinco cupos (uno gratis)', () => {
  assert.equal(precioCompra({ precioUnitario: 1800, cupo: 1, dias: 30 }).total, 2188);

  const cinco = precioCompra({ precioUnitario: 1800, cupo: 5, dias: 30 });
  assert.equal(cinco.cupo, 5);
  assert.equal(cinco.cobrados, 4);
  assert.equal(cinco.gratis, 1);
  assert.equal(cinco.dias, 30);
  assert.equal(cinco.base, 7200);
  assert.equal(cinco.ajuste, 216);
  assert.equal(cinco.subtotal, 7416);
  assert.equal(cinco.itbis, 1335);
  assert.equal(cinco.total, 8751);
});

test('sesenta días: el factor se aplica a la base, antes del ajuste', () => {
  const d = precioCompra({ precioUnitario: 5500, cupo: 1, dias: 60 });
  assert.equal(d.dias, 60);
  assert.equal(d.base, 9900);
  assert.equal(d.ajuste, 297);
  assert.equal(d.subtotal, 10197);
  assert.equal(d.itbis, 1835);
  assert.equal(d.total, 12032);
});

test('la ampliación prorratea la base y conserva sus campos', () => {
  const d = precioAmpliacion({ precioUnitario: 3200, cupoActual: 1, cupoNuevo: 2, dias: 30, diasRestantes: 15 });
  assert.equal(d.base, 1600);
  assert.equal(d.ajuste, 48);
  assert.equal(d.subtotal, 1648);
  assert.equal(d.itbis, 297);
  assert.equal(d.total, 1945);
  assert.equal(d.cupo, 2);
  assert.equal(d.anade, 1);
  assert.equal(d.cobrados, 1);
  assert.equal(d.gratis, 0);
  assert.equal(d.dias, 30);
  assert.equal(d.diasRestantes, 15);
  assert.equal(d.proporcion, 0.5);
});

test('de 4 a 5 cupos no cuesta nada: el quinto es el gratis', () => {
  const d = precioAmpliacion({ precioUnitario: 3200, cupoActual: 4, cupoNuevo: 5, dias: 30, diasRestantes: 20 });
  assert.equal(d.total, 0);
  assert.equal(d.gratis, 1);
  const s = siguienteCupo({ precioUnitario: 3200, cupoActual: 4, dias: 30, diasRestantes: 20 });
  assert.equal(s.gratuito, true);
});

test('la renovación cuesta lo mismo que la compra', () => {
  for (const datos of [
    { precioUnitario: 1800, cupo: 1, dias: 30 },
    { precioUnitario: 3200, cupo: 7, dias: 60 },
    { precioUnitario: 5500, cupo: 10, dias: 30 },
  ]) {
    assert.deepEqual(precioRenovacion(datos), precioCompra(datos));
  }
});
