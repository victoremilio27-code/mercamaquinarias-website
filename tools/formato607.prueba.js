/* Formato 607 de la DGII como BORRADOR para el contador (R-01, issue #60).
 *
 * El sitio nunca lo envía: lo genera para que el contador lo revise y lo
 * suba él. La especificación está investigada en la sección «Formato 607
 * (R-01)» de 12-RESEARCH.md (rama claude/fase-12-lote-comprobantes); estas
 * pruebas la fijan línea a línea. Son la especificación: no se tocan para
 * que pase la implementación. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { formato607 } = require('./formato607');

/* Una línea de detalle tiene 23 columnas separadas por `|`. Se escribe por
   número de columna para que el orden se lea sin contar barras. */
const linea = (campos) => Array.from({ length: 23 }, (_, i) => campos[i + 1] ?? '').join('|');

const base = { rnc: '101010101', ncf_modificado: null, descuento: 0 };
const FILAS = [
  // Recibo sin NCF: no es fiscal, no va.
  { ...base, numero: '09-2025-000004', tipo: 'recibo', ncf: null, rnc: null,
    fecha: '2025-09-05T15:00:00.000Z', subtotal: 500, itbis: 90, total: 590, metodo_pago: 'transferencia' },
  // Crédito fiscal pagado por transferencia → columna 18.
  { ...base, numero: '09-2025-000001', tipo: 'factura_credito_fiscal', ncf: 'B0100000001',
    fecha: '2025-09-10T15:00:00.000Z', subtotal: 1854, itbis: 334, total: 2188, metodo_pago: 'transferencia' },
  // Cobrado a las 23:30 del 30 de septiembre en Santo Domingo: fecha 20250930, columna 19 (tarjeta).
  { ...base, rnc: '1-31-00000-1', numero: '09-2025-000007', tipo: 'factura_credito_fiscal', ncf: 'B0100000003',
    fecha: '2025-10-01T03:30:00.000Z', subtotal: 3296, itbis: 593, total: 3889, metodo_pago: 'cardnet' },
  // Nota de crédito sobre un B01: va en positivo, con el NCF modificado y sin forma de venta.
  { ...base, numero: '09-2025-000005', tipo: 'nota_credito', ncf: 'B0400000001', ncf_modificado: 'B0100000001',
    fecha: '2025-09-20T12:00:00.000Z', subtotal: 1854, itbis: 334, total: 2188, metodo_pago: 'transferencia' },
  // Nota de crédito sobre un RECIBO: su «NCF modificado» es un número interno. Fuera y con aviso.
  { ...base, numero: '09-2025-000006', tipo: 'nota_credito', ncf: 'B0400000002', ncf_modificado: '09-2025-000004',
    fecha: '2025-09-21T12:00:00.000Z', subtotal: 500, itbis: 90, total: 590, metodo_pago: 'transferencia' },
  // Consumo menor de 250 000: fuera del TXT, al resumen de consumo.
  { ...base, rnc: null, numero: '09-2025-000002', tipo: 'factura_consumo', ncf: 'B0200000001',
    fecha: '2025-09-12T12:00:00.000Z', subtotal: 1000, itbis: 180, total: 1180, metodo_pago: 'transferencia' },
  // Consumo de 250 000 o más: no se puede escribir sin la cédula del comprador. Fuera, al resumen y con aviso.
  { ...base, rnc: null, numero: '09-2025-000003', tipo: 'factura_consumo', ncf: 'B0200000002',
    fecha: '2025-09-13T12:00:00.000Z', subtotal: 250000, itbis: 45000, total: 295000, metodo_pago: 'cardnet' },
  // Cobro de demostración: columna 23 («otras formas») y aviso.
  { ...base, numero: '09-2025-000008', tipo: 'factura_credito_fiscal', ncf: 'B0100000002',
    fecha: '2025-09-25T12:00:00.000Z', subtotal: 1000, itbis: 180, total: 1180, metodo_pago: 'demo' },
];

const ESPERADO = [
  '607|131279759|202509|4',
  linea({ 1: '101010101', 2: '1', 3: 'B0100000001', 5: '01', 6: '20250910', 8: '1854.00', 9: '334.00', 18: '2188.00' }),
  linea({ 1: '101010101', 2: '1', 3: 'B0400000001', 4: 'B0100000001', 5: '01', 6: '20250920', 8: '1854.00', 9: '334.00' }),
  linea({ 1: '101010101', 2: '1', 3: 'B0100000002', 5: '01', 6: '20250925', 8: '1000.00', 9: '180.00', 23: '1180.00' }),
  linea({ 1: '131000001', 2: '1', 3: 'B0100000003', 5: '01', 6: '20250930', 8: '3296.00', 9: '593.00', 19: '3889.00' }),
].join('\r\n') + '\r\n';

const generar = () => formato607(FILAS, { rncEmisor: '1-31-27975-9', mes: '2025-09' });

test('el TXT sale exactamente así: encabezado, 4 líneas ordenadas por fecha y número, CRLF y salto final', () => {
  assert.equal(generar().texto, ESPERADO);
});

test('cada línea de detalle tiene 23 columnas', () => {
  const lineas = generar().texto.split('\r\n').slice(1, -1);
  assert.equal(lineas.length, 4);
  for (const l of lineas) assert.equal(l.split('|').length, 23);
});

test('es ASCII puro y sin BOM: el BOM sería basura delante del 607', () => {
  const { texto } = generar();
  assert.ok(texto.startsWith('607|'));
  assert.ok(/^[\x20-\x7e\r\n]*$/.test(texto));
});

test('el resumen de consumo suma todos los B02, también los de 250 000 o más', () => {
  assert.deepEqual(generar().consumo, {
    cantidad: 2,
    subtotal: 251000,
    itbis: 45180,
    porForma: { efectivo: 0, transferencia: 1180, tarjeta: 295000, otras: 0 },
  });
});

test('avisa de lo que no puede declarar y de lo que declara a ciegas, nombrando el comprobante', () => {
  const { avisos } = generar();
  assert.equal(avisos.length, 3);
  assert.ok(avisos.some((a) => a.includes('09-2025-000003') && a.includes('250')), 'B02 de 250 000 o más');
  assert.ok(avisos.some((a) => a.includes('09-2025-000006') && a.includes('09-2025-000004')), 'nota de crédito sobre un recibo');
  assert.ok(avisos.some((a) => a.includes('09-2025-000008')), 'cobro de demostración en «otras formas»');
});

test('los recibos no van ni al TXT ni al resumen ni a los avisos', () => {
  const r = generar();
  assert.ok(!r.texto.includes('000004'));
  assert.ok(!r.avisos.some((a) => a.includes('09-2025-000004') && !a.includes('09-2025-000006')));
});

test('es determinista y no depende del orden de entrada', () => {
  const otraVez = formato607([...FILAS].reverse(), { rncEmisor: '1-31-27975-9', mes: '2025-09' });
  assert.deepEqual(otraVez, generar());
});

test('no modifica las filas que recibe', () => {
  const copia = JSON.parse(JSON.stringify(FILAS));
  generar();
  assert.deepEqual(FILAS, copia);
});

test('un mes sin comprobantes fiscales da solo el encabezado con 0', () => {
  const r = formato607([], { rncEmisor: '1-31-27975-9', mes: '2025-08' });
  assert.equal(r.texto, '607|131279759|202508|0\r\n');
  assert.deepEqual(r.avisos, []);
  assert.equal(r.consumo.cantidad, 0);
});

test('rechaza un mes mal formado o un RNC de emisor que no tiene 9 dígitos', () => {
  assert.throws(() => formato607([], { rncEmisor: '1-31-27975-9', mes: '2025-9' }));
  assert.throws(() => formato607([], { rncEmisor: '12345', mes: '2025-09' }));
});
