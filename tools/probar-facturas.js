/**
 * probar-facturas.js — la emisión de comprobantes, de punta a punta.
 *
 *   node tools/probar-facturas.js
 *
 * POR QUÉ NO ES UNA PRUEBA UNITARIA
 *
 * Lo que hay que comprobar aquí no es una función: es que al cobrar
 * salga el documento correcto, con el NCF correcto, numerado sin
 * huecos, y que el día que se cargue la secuencia que falta el sistema
 * cambie solo. Eso solo se ve ejecutando la emisión de verdad contra
 * una base de verdad.
 *
 * Por eso corre contra una base TEMPORAL —`.tmp/prueba-facturas/`— que
 * se borra y se vuelve a crear en cada ejecución. No toca la base real
 * ni los PDF emitidos: un comprobante emitido no se toca, y menos para
 * probar.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* Antes de cargar db.js: la ruta del archivo se resuelve al
   importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-facturas');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');

const db = require('./db');
const facturas = require('./facturas');

const ID_ORG = 'org-prueba';

let fallos = 0;
function ok(condicion, texto) {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

/* La organización y los pagos se insertan por fuera de db.js: aquí hace
   falta un pago aprobado sin pasar por la compra entera, que es otra
   cosa y tiene su propia auditoría. */
function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}

function prepararOrganizacion() {
  const d = conexion();
  const t = new Date().toISOString();
  d.prepare(`INSERT OR IGNORE INTO organizaciones (id, tipo, nombre, creada, actualizada)
             VALUES (?, 'particular', 'Cliente de prueba', ?, ?)`).run(ID_ORG, t, t);
  d.close();
}

function pago({ subtotal, itbis, total, referencia }) {
  const d = conexion();
  const idPago = `pago-${referencia}`;
  d.prepare(`INSERT INTO pagos (id, organizacion_id, suscripcion_id, subtotal, itbis, total,
              estado, referencia, procesador, creado)
             VALUES (?, ?, NULL, ?, ?, ?, 'aprobado', ?, 'demo', ?)`)
    .run(idPago, ID_ORG, subtotal, itbis, total, referencia, new Date().toISOString());
  const fila = d.prepare('SELECT * FROM pagos WHERE id = ?').get(idPago);
  d.close();
  return fila;
}

/* Abrir la base aplica el esquema y las migraciones. */
db.secuenciasNcf();
prepararOrganizacion();

console.log('\n1. Cliente SIN RNC y sin secuencia B02 → recibo no fiscal');
const p1 = pago({ subtotal: 2000, itbis: 360, total: 2360, referencia: 'PRUEBA-1' });
const f1 = facturas.emitirPorPago(p1, {
  concepto: 'Plan Estándar · 1 cupo · 30 días',
  detalle: { cantidad: 1, precio_unitario: 2000, periodo: '23/09/2026 al 23/10/2026' },
  cliente: { razonSocial: 'Juan Pérez', correo: 'juan@ejemplo.com' },
});
ok(f1.tipo === 'recibo' && !f1.ncf, `tipo=${f1.tipo} ncf=${f1.ncf} numero=${f1.numero}`);
ok(!!f1.ruta_pdf, `PDF guardado en ${f1.ruta_pdf}`);

console.log('\n2. Cliente CON RNC → factura de crédito fiscal con B01');
const p2 = pago({ subtotal: 7000, itbis: 1260, total: 8260, referencia: 'PRUEBA-2' });
const f2 = facturas.emitirPorPago(p2, {
  concepto: 'Plan Destacado · 2 cupos · 30 días',
  detalle: { cantidad: 2, precio_unitario: 3500, periodo: '23/09/2026 al 23/10/2026' },
  cliente: {
    razonSocial: 'Constructora del Este, S.R.L.', rnc: '130123456',
    direccion: 'Av. España 45, San Pedro de Macorís', correo: 'compras@ejemplo.do',
  },
});
ok(f2.tipo === 'factura_credito_fiscal' && /^B01/.test(f2.ncf || ''), `tipo=${f2.tipo} ncf=${f2.ncf}`);

console.log('\n3. El correlativo interno no deja huecos');
const p3 = pago({ subtotal: 2000, itbis: 360, total: 2360, referencia: 'PRUEBA-3' });
const f3 = facturas.emitirPorPago(p3, { concepto: 'Plan Estándar · 1 cupo · 30 días', cliente: {} });
const numeros = [f1.numero, f2.numero, f3.numero];
const serie = numeros.map((n) => Number(n.slice(-6)));
ok(serie.every((n, i) => i === 0 || n === serie[i - 1] + 1), numeros.join(' → '));

console.log('\n4. El mismo pago no se factura dos veces');
const repetida = facturas.emitirPorPago(p2, { concepto: 'otra cosa', cliente: {} });
ok(repetida.id === f2.id, `misma factura ${repetida.numero}`);

console.log('\n5. Devolución: nota de crédito enlazada, original intacto');
const nota = facturas.emitirNotaCredito(db.facturaPorId(f2.id), { motivo: 'Cobro duplicado' });
const original = db.facturaPorId(f2.id);
ok(nota.tipo === 'nota_credito' && /^B04/.test(nota.ncf || ''), `ncf=${nota.ncf}`);
ok(nota.ncf_modificado === f2.ncf, `modifica ${nota.ncf_modificado}`);
ok(original.anulado_por === nota.id, 'el original queda anulado, no borrado');
ok(original.total === f2.total && original.ncf === f2.ncf, 'el original no se reescribió');

console.log('\n6. Los recibos quedan listados como pendientes de regularizar');
const pendientes = facturas.pendientesDeRegularizar();
ok(pendientes.length === 2, `${pendientes.length} recibo(s): ${pendientes.map((f) => f.numero).join(', ')}`);

console.log('\n7. Se carga la secuencia B02 y el sistema cambia sin tocar código');
db.cargarSecuencia({
  tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 50,
  vence: '2027-12-31', usaSitio: true,
});
const p4 = pago({ subtotal: 2000, itbis: 360, total: 2360, referencia: 'PRUEBA-4' });
const f4 = facturas.emitirPorPago(p4, {
  concepto: 'Plan Estándar · 1 cupo · 30 días',
  cliente: { razonSocial: 'Ana Gómez' },
});
ok(f4.tipo === 'factura_consumo' && /^B02/.test(f4.ncf || ''),
  `tipo=${f4.tipo} ncf=${f4.ncf} vence=${f4.ncf_vencimiento}`);

console.log('\n8. La vista web sale completa y sin variables sin rellenar');
const html = facturas.comoHtml(db.facturaPorId(f2.id));
ok(!/\{\{[A-Z_]+\}\}/.test(html), `${html.length} bytes de HTML`);
ok(html.includes(f2.ncf) && html.includes('Ocho mil doscientos sesenta'),
  'lleva el NCF y el importe en letras');
ok(!html.includes('data-opcional="DESCUENTO"'), 'los bloques opcionales vacíos se eliminan');

console.log('\n9. Aviso de secuencias que se acaban');
const bajas = facturas.secuenciasBajas();
ok(bajas.every((s) => s.quedan <= s.umbral),
  `umbral ${bajas.length ? bajas[0].umbral : '—'} · ${bajas.map((s) => `${s.tipo}:${s.quedan}`).join(' ') || 'ninguna'}`);

console.log(`\nPDF de muestra en ${path.relative(process.cwd(), process.env.MERCA_FACTURAS)}`);
console.log(fallos ? `\n${fallos} comprobación(es) fallidas` : '\nTodo correcto');
process.exitCode = fallos ? 1 : 0;
