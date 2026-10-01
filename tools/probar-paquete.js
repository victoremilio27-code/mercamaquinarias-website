/**
 * probar-paquete.js — el paquete mensual para el contador (#59).
 *
 *   node tools/probar-paquete.js
 *
 * ESTA PRUEBA ES LA ESPECIFICACIÓN. La escribió Claude antes que el
 * código, porque el paquete es fiscal: lo que va dentro es lo que el
 * contador declara. Quien implemente `lote.armarPaquete` y `lote.previa`
 * lo hace hasta que esto pase, sin tocar este archivo.
 *
 * Decisiones de Victor que fija (R-02..R-05 de 12-CONTEXT.md):
 * - ZIP con dos carpetas, `con-ncf/` y `sin-ncf/`, cada una con sus PDF y
 *   su `resumen.csv`; `resumen.pdf` y `LEEME.txt` en la raíz.
 * - Corte por la fecha del comprobante (la del cobro) en mes calendario de
 *   Santo Domingo.
 * - El PDF va tal como está guardado; si falta se repone y el CSV lo dice.
 * - El sitio nunca lo envía: solo se genera cuando alguien lo descarga.
 *
 * Y las barreras: un paquete incompleto o que no cuadra con la base es
 * peor que ninguno, así que en esos casos no sale.
 *
 * Corre sobre una base y una carpeta temporales (`.tmp/prueba-paquete/`),
 * con datos de 2025 (año cerrado) y un `ahora` fijo: nada depende del reloj.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* Antes de cargar db.js: la ruta de la base se resuelve al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-paquete');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');

const db = require('./db');
const facturas = require('./facturas');
const lote = require('./lote');

let fallos = 0;
function ok(condicion, texto) {
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

/* Lo que se espera que lance, con su código. Devuelve el error para
   mirarlo, o null si no lanzó. */
function lanza(fn) {
  try { fn(); } catch (e) { return e; }
  return null;
}

function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}

/* Lector mínimo de ZIP «stored» (sin compresión), que es lo que escribe
   `lote.zip`. Devuelve [{ nombre, datos }] en el orden del archivo. */
function leerZip(buf) {
  const entradas = [];
  let i = 0;
  while (i + 4 <= buf.length && buf.readUInt32LE(i) === 0x04034b50) {
    const metodo = buf.readUInt16LE(i + 8);
    const tamano = buf.readUInt32LE(i + 18);
    const largoNombre = buf.readUInt16LE(i + 26);
    const largoExtra = buf.readUInt16LE(i + 28);
    const nombre = buf.slice(i + 30, i + 30 + largoNombre).toString('utf8');
    const inicio = i + 30 + largoNombre + largoExtra;
    entradas.push({ nombre, metodo, datos: buf.slice(inicio, inicio + tamano) });
    i = inicio + tamano;
  }
  return entradas;
}

const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
const CABECERA_CSV = 'Fecha;Fecha UTC;Numero;Tipo;NCF;NCF modificado;NCF vence;Cliente;RNC;'
  + 'Subtotal gravado;ITBIS;Total;Moneda;Metodo de pago;Anulado;Cuadra;PDF;Archivo';

/* Un CSV del paquete como lista de objetos por cabecera. Las celdas de
   esta prueba no llevan `;` ni comillas, así que basta con partir. */
function leerCsv(buf) {
  const texto = buf.slice(BOM.length).toString('utf8');
  const lineas = texto.split('\r\n');
  const cabecera = lineas[0];
  const filas = lineas.slice(1).filter((l) => l !== '').map((l) => {
    const celdas = l.split(';');
    return Object.fromEntries(cabecera.split(';').map((c, n) => [c, celdas[n]]));
  });
  return { texto, lineas, cabecera, filas };
}

const EMISOR = {
  razonSocial: 'Emisor de Prueba, S.R.L.', rnc: '131279759', registroMercantil: '',
  domicilioFiscal: 'Calle Que No Debe Salir 4', correoFacturacion: 'facturacion@invalid',
};

/* ── El banco: septiembre de 2025 y sus bordes ─────────────────────── */

const ID_ORG = 'org-paquete';
{
  const d = conexion();
  db.secuenciasNcf();                                   // aplica esquema y migraciones
  const t = '2025-08-01T12:00:00.000Z';
  d.prepare(`INSERT INTO organizaciones (id, tipo, nombre, creada, actualizada)
             VALUES (?, 'particular', 'Cliente del paquete', ?, ?)`).run(ID_ORG, t, t);
  d.close();
}

/* Un pago aprobado con su `creado`: es la fecha que hereda el comprobante. */
function pago(referencia, { subtotal, itbis, total, creado, procesador = 'transferencia' }) {
  const d = conexion();
  const idPago = `pago-${referencia}`;
  d.prepare(`INSERT INTO pagos (id, organizacion_id, suscripcion_id, subtotal, itbis, total,
              estado, referencia, procesador, creado)
             VALUES (?, ?, NULL, ?, ?, ?, 'aprobado', ?, ?, ?)`)
    .run(idPago, ID_ORG, subtotal, itbis, total, referencia, procesador, creado);
  const fila = d.prepare('SELECT * FROM pagos WHERE id = ?').get(idPago);
  d.close();
  return fila;
}

function emitir(referencia, importes, cliente = {}) {
  return facturas.emitirPorPago(pago(referencia, importes), {
    concepto: 'Plan Estándar · 1 cupo · 30 días', cliente, emisor: EMISOR,
  });
}

/* Nota de crédito con la fecha que se le dé. `emitirNotaCredito` usa la
   hora actual, y aquí hace falta una en septiembre de 2025: se crea con
   las mismas piezas (B04 de la secuencia, mismos importes, original
   marcado como anulado) y se le dibuja su PDF. */
function nota(original, fecha) {
  const ncf = db.tomarNcf('B04');
  const { id } = db.crearFactura({
    pagoId: original.pago_id, organizacionId: original.organizacion_id,
    tipo: 'nota_credito', ncf: ncf.ncf, ncfVencimiento: ncf.vence,
    ncfModificado: original.ncf || original.numero,
    razonSocial: original.razon_social, rnc: original.rnc,
    concepto: `Anulación de ${original.numero}`,
    subtotal: original.subtotal, itbis: original.itbis, itbisTasa: original.itbis_tasa,
    total: original.total, moneda: original.moneda, condicionPago: 'Anulación',
    metodoPago: original.metodo_pago, anulaA: original.id, fecha,
  });
  db.marcarAnulada(original.id, id);
  facturas.reponerPdfsDe([db.facturaPorId(id)], { emisor: EMISOR });
  return db.facturaPorId(id);
}

// Borde de agosto: 23:59:59.999 del 31 de agosto en Santo Domingo.
const A1 = emitir('A1', { subtotal: 100, itbis: 18, total: 118, creado: '2025-09-01T03:59:59.999Z' });
// Primer instante de septiembre en Santo Domingo. El «=» prueba la protección contra fórmulas.
const S1 = emitir('S1', { subtotal: 2000, itbis: 360, total: 2360, creado: '2025-09-01T04:00:00.000Z' },
  { razonSocial: '=Constructora del Este', rnc: '130123456', correo: 'compras@ejemplo.do' });
const S2 = emitir('S2', { subtotal: 1000, itbis: 180, total: 1180, creado: '2025-09-15T15:00:00.000Z' },
  { razonSocial: 'Ferretería Central', rnc: '101010101' });
const S3 = emitir('S3', { subtotal: 500, itbis: 90, total: 590, creado: '2025-09-20T12:00:00.000Z' });
// Recibo que no cuadra por sí solo, cobrado a las 23:30 del 30 de septiembre en Santo Domingo.
const S4 = emitir('S4', { subtotal: 1000, itbis: 180, total: 1200, creado: '2025-10-01T03:30:00.000Z' });
const N1 = nota(db.facturaPorId(S2.id), '2025-09-25T12:00:00.000Z');      // sobre un B01: resta
const N2 = nota(db.facturaPorId(S3.id), '2025-09-26T12:00:00.000Z');      // sobre un recibo: aparte
db.cargarSecuencia({ tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 50, vence: '2027-12-31', usaSitio: true });
const C1 = emitir('C1', { subtotal: 300, itbis: 54, total: 354, creado: '2025-09-28T12:00:00.000Z' });
// Primer instante de octubre en Santo Domingo.
const O1 = emitir('O1', { subtotal: 200, itbis: 36, total: 236, creado: '2025-10-01T04:00:00.000Z' });

const AHORA = Date.parse('2025-11-15T12:00:00.000Z');
const SEPTIEMBRE = [S1, S2, S3, S4, N1, N2, C1];
const CON_NCF = [S1, S2, N1, N2, C1];
const SIN_NCF = [S3, S4];

console.log('\n0 · El banco de pruebas');
ok(S1.tipo === 'factura_credito_fiscal' && S2.tipo === 'factura_credito_fiscal'
  && S3.tipo === 'recibo' && S4.tipo === 'recibo' && C1.tipo === 'factura_consumo'
  && N1.tipo === 'nota_credito' && N2.tipo === 'nota_credito' && A1 && O1,
`${SEPTIEMBRE.map((f) => `${f.numero}:${f.tipo}`).join(' · ')}`);
ok(N2.ncf_modificado === S3.numero && N1.ncf_modificado === S2.ncf,
  'N1 modifica el NCF de S2; N2 modifica el número interno del recibo S3');

/* ── 1. La vista previa ────────────────────────────────────────────── */

console.log('\n1 · lote.previa: lo que se verá en la consola, sin tocar nada');
{
  const p = lote.previa('2025-09', { ahora: AHORA });
  ok(p.mes === '2025-09' && p.parcial === false && p.archivo === 'comprobantes-2025-09.zip',
    `mes, parcial y nombre del archivo · ${p.archivo}`);
  ok(p.desde === '2025-09-01T04:00:00.000Z' && p.hasta === '2025-10-01T04:00:00.000Z',
    'el corte es el mes calendario de Santo Domingo');
  ok(p.cantidad === 7 && p.conNcf === 5 && p.sinNcf === 2,
    `7 comprobantes: 5 con NCF y 2 sin NCF · ${p.cantidad}/${p.conNcf}/${p.sinNcf}`);
  /* Con valor fiscal: S1 + S2 + C1 − N1. La nota sobre el recibo no
     resta: si restara, el neto que ve el contador bajaría por anular algo
     que nunca se declaró. */
  ok(JSON.stringify(p.fiscal) === JSON.stringify({ cantidad: 4, subtotal: 2300, itbis: 414, total: 2714 }),
    `con valor fiscal (las notas restan) · ${JSON.stringify(p.fiscal)}`);
  ok(JSON.stringify(p.sinValorFiscal) === JSON.stringify({ cantidad: 2, subtotal: 1500, itbis: 270, total: 1790 }),
    `sin valor fiscal (recibos) · ${JSON.stringify(p.sinValorFiscal)}`);
  ok(JSON.stringify(p.notasSobreRecibos) === JSON.stringify({ cantidad: 1, subtotal: 500, itbis: 90, total: 590 }),
    `notas de crédito sobre recibos, aparte · ${JSON.stringify(p.notasSobreRecibos)}`);
  ok(p.notasCredito === 2 && p.anulados === 2 && p.noCuadran === 1,
    `2 notas, 2 anulados, 1 que no cuadra por sí solo · ${p.notasCredito}/${p.anulados}/${p.noCuadran}`);
  ok(p.faltanPdf === 0 && p.fechasIrregulares === 0, 'no falta ningún PDF ni hay fechas irregulares');

  const vacio = lote.previa('2025-03', { ahora: AHORA });
  ok(vacio.cantidad === 0 && vacio.fiscal.total === 0 && vacio.sinValorFiscal.cantidad === 0,
    'un mes sin comprobantes da ceros, no un error');

  const futuro = lanza(() => lote.previa('2025-12', { ahora: AHORA }));
  ok(futuro && futuro.codigo === 400, 'un mes posterior al actual es un 400');
}

/* ── 2. El paquete ─────────────────────────────────────────────────── */

console.log('\n2 · lote.armarPaquete: el ZIP de septiembre');
let entradas;
{
  const r = lote.armarPaquete('2025-09', { emisor: EMISOR, ahora: AHORA });
  ok(r.nombre === 'comprobantes-2025-09.zip' && Buffer.isBuffer(r.zip),
    `devuelve el nombre y el ZIP · ${r.nombre}`);
  ok(r.previa && r.previa.cantidad === 7, 'y la misma vista previa');

  entradas = leerZip(r.zip);
  const nombres = entradas.map((e) => e.nombre).sort();
  const esperados = [
    ...CON_NCF.map((f) => `con-ncf/${f.numero}.pdf`), 'con-ncf/resumen.csv',
    ...SIN_NCF.map((f) => `sin-ncf/${f.numero}.pdf`), 'sin-ncf/resumen.csv',
    'resumen.pdf', 'LEEME.txt', '607-202509.txt',
  ].sort();
  ok(JSON.stringify(nombres) === JSON.stringify(esperados),
    `las dos carpetas y la raíz, sin nada de agosto ni de octubre · ${nombres.length} entradas`);
  ok(entradas.every((e) => e.metodo === 0), 'el ZIP lo escribe lote.zip (sin compresión)');

  const iguales = SEPTIEMBRE.every((f) => {
    const fila = db.facturaPorId(f.id);
    const carpeta = fila.ncf ? 'con-ncf' : 'sin-ncf';
    const e = entradas.find((x) => x.nombre === `${carpeta}/${fila.numero}.pdf`);
    return e && e.datos.equals(fs.readFileSync(facturas.rutaAbsoluta(fila.ruta_pdf)));
  });
  ok(iguales, 'cada PDF del ZIP es byte a byte el que está guardado');

  const otra = lote.armarPaquete('2025-09', { emisor: EMISOR, ahora: AHORA });
  ok(otra.zip.equals(r.zip), 'el mismo mes da los mismos bytes (sin fecha de generación)');
}

console.log('\n3 · Los dos resumen.csv');
{
  const conNcf = entradas.find((e) => e.nombre === 'con-ncf/resumen.csv').datos;
  const sinNcf = entradas.find((e) => e.nombre === 'sin-ncf/resumen.csv').datos;
  ok(conNcf.slice(0, 3).equals(BOM) && sinNcf.slice(0, 3).equals(BOM), 'empiezan por el BOM (Excel en español)');

  const c = leerCsv(conNcf);
  const s = leerCsv(sinNcf);
  ok(c.cabecera === CABECERA_CSV && s.cabecera === CABECERA_CSV, 'la cabecera, separada por «;»');
  ok(!/[^\r]\n/.test(c.texto) && c.texto.endsWith('\r\n') && s.texto.endsWith('\r\n'),
    'líneas en CRLF, con salto final');
  ok(c.filas.length === 5 && s.filas.length === 2, `5 filas con NCF y 2 sin NCF · ${c.filas.length}/${s.filas.length}`);

  const todas = [...c.filas, ...s.filas];
  const cuadranConLaBase = SEPTIEMBRE.every((f) => {
    const fila = db.facturaPorId(f.id);
    const csv = todas.find((x) => x.Numero === fila.numero);
    return csv && csv.NCF === (fila.ncf || '') && csv['Subtotal gravado'] === String(fila.subtotal)
      && csv.ITBIS === String(fila.itbis) && csv.Total === String(fila.total)
      && csv.Moneda === fila.moneda && csv['Fecha UTC'] === fila.fecha
      && csv.Archivo === `${fila.numero}.pdf` && csv.Tipo === facturas.TITULOS[fila.tipo];
  });
  ok(cuadranConLaBase, 'cada fila trae el NCF, los importes enteros, la fecha UTC y el archivo de la base');

  const f4 = s.filas.find((x) => x.Numero === S4.numero);
  ok(f4 && f4.Fecha === '30/09/2025' && f4['Fecha UTC'] === '2025-10-01T03:30:00.000Z',
    'la columna Fecha es el día de Santo Domingo; la UTC va al lado');
  ok(f4 && f4.Cuadra === 'no' && s.filas.find((x) => x.Numero === S3.numero).Cuadra === 'si',
    'el recibo cuyo subtotal + ITBIS no da el total se señala, no se corrige');
  ok(c.filas.find((x) => x.Numero === S1.numero).Cliente === "'=Constructora del Este",
    'una celda que empieza por «=» se protege con comilla simple');
  ok(c.filas.find((x) => x.Numero === C1.numero).Cliente === 'Consumidor final',
    'sin razón social, «Consumidor final»');
  ok(c.filas.find((x) => x.Numero === N2.numero)['NCF modificado'] === S3.numero
    && c.filas.find((x) => x.Numero === S2.numero).Anulado === 'si'
    && c.filas.find((x) => x.Numero === S1.numero).Anulado === 'no',
  'NCF modificado y anulado');
  ok(todas.every((x) => x.PDF === 'guardado'), 'con todo en disco, cada PDF es «guardado»');
}

console.log('\n4 · resumen.pdf y LEEME.txt');
{
  const resumen = entradas.find((e) => e.nombre === 'resumen.pdf').datos;
  const texto = resumen.toString('latin1');
  ok(texto.startsWith('%PDF-') && /%%EOF\s*$/.test(texto), 'resumen.pdf es un PDF');
  ok((texto.match(/\/Type \/Page\b(?!s)/g) || []).length === 1, 'de una sola página');

  const leeme = entradas.find((e) => e.nombre === 'LEEME.txt').datos;
  const l = leeme.slice(BOM.length).toString('utf8');
  ok(leeme.slice(0, 3).equals(BOM) && !/[^\r]\n/.test(l), 'LEEME.txt en UTF-8 con BOM y CRLF');
  for (const frase of [
    'septiembre de 2025', EMISOR.razonSocial, EMISOR.rnc, 'con-ncf/', 'sin-ncf/',
    'America/Santo_Domingo', 'Notas de crédito sobre recibos sin NCF', 'repuesto al generar',
    'El sitio no lo envía a nadie',
  ]) ok(l.includes(frase), `LEEME dice «${frase}»`);
  ok(!l.includes(EMISOR.domicilioFiscal) && !texto.includes('Calle Que No Debe Salir'),
    'ni el LEEME ni el resumen llevan el domicilio (no son comprobantes)');
  ok(!l.includes('parcial'), 'un mes cerrado no se llama parcial');
}

/* ── 5. Las barreras ───────────────────────────────────────────────── */

console.log('\n5 · Un PDF perdido se repone y se dice');
{
  const ruta = facturas.rutaAbsoluta(db.facturaPorId(S2.id).ruta_pdf);
  fs.rmSync(ruta);
  const p = lote.previa('2025-09', { ahora: AHORA });
  ok(p.faltanPdf === 1 && !fs.existsSync(ruta), 'la vista previa lo cuenta y no lo repone (solo lee)');

  const r = lote.armarPaquete('2025-09', { emisor: EMISOR, ahora: AHORA });
  const c = leerCsv(leerZip(r.zip).find((e) => e.nombre === 'con-ncf/resumen.csv').datos);
  ok(fs.existsSync(ruta), 'el paquete lo repuso en disco');
  ok(c.filas.find((x) => x.Numero === S2.numero).PDF === 'repuesto al generar'
    && c.filas.filter((x) => x.Numero !== S2.numero).every((x) => x.PDF === 'guardado'),
  'el CSV marca ese «repuesto al generar» y el resto «guardado»');
}

console.log('\n6 · Un PDF que no se puede reponer: 409 y no sale nada');
{
  const ruta = facturas.rutaAbsoluta(db.facturaPorId(S1.id).ruta_pdf);
  fs.rmSync(ruta);
  const e = lanza(() => lote.armarPaquete('2025-09', {
    emisor: EMISOR, ahora: AHORA, reponer: () => ({ hechos: [], fallos: ['disco lleno'] }),
  }));
  ok(e && e.codigo === 409 && Array.isArray(e.faltan) && e.faltan.length === 1 && e.faltan[0] === S1.numero,
    `409 con la lista de lo que falta · ${e && e.codigo} ${e && JSON.stringify(e.faltan)}`);
  ok(e && e.message.includes(S1.numero), 'el mensaje nombra el comprobante');
  lote.armarPaquete('2025-09', { emisor: EMISOR, ahora: AHORA });       // repone de verdad
  ok(fs.existsSync(ruta), 'con la reposición normal vuelve a salir');
}

console.log('\n7 · Si no cuadra con la base, no sale');
{
  const e = lanza(() => lote.armarPaquete('2025-09', {
    emisor: EMISOR, ahora: AHORA,
    sumas: (desde, hasta) => db.sumaDelPeriodo(desde, hasta)
      .map((f, i) => (i === 0 ? { ...f, total: f.total + 1 } : f)),
  }));
  ok(e && e.codigo === 500 && /no cuadra/.test(e.message), `500 «no cuadra» · ${e && e.message}`);
}

console.log('\n8 · Una fecha sin hora cerca del mes bloquea ese mes y solo ese');
{
  const d = conexion();
  d.prepare(`INSERT INTO facturas (id, numero, tipo, concepto, subtotal, itbis, total, moneda, fecha, creada)
             VALUES ('irregular', 'MM-2025-000900', 'recibo', 'Fecha vieja', 100, 18, 118, 'DOP', '2025-09-30', ?)`)
    .run('2025-09-30T12:00:00.000Z');
  d.close();
  const e = lanza(() => lote.armarPaquete('2025-09', { emisor: EMISOR, ahora: AHORA }));
  ok(e && e.codigo === 500 && e.message.includes('MM-2025-000900'),
    `500 con el número de la fila irregular · ${e && e.message}`);
  ok(lote.previa('2025-10', { ahora: AHORA }).fechasIrregulares === 1, 'el mes vecino la cuenta en su vista previa');
  ok(!lanza(() => lote.armarPaquete('2025-05', { emisor: EMISOR, ahora: AHORA })),
    'un mes lejano sale igual: una fila rara no bloquea todos los meses');
  const borrar = conexion();
  borrar.prepare("DELETE FROM facturas WHERE id = 'irregular'").run();
  borrar.close();
  ok(!lanza(() => lote.armarPaquete('2025-09', { emisor: EMISOR, ahora: AHORA })), 'sin ella, septiembre vuelve a salir');
}

console.log('\n9 · Mes vacío, mes en curso, mes futuro y sin emisor');
{
  const vacio = leerZip(lote.armarPaquete('2025-03', { emisor: EMISOR, ahora: AHORA }).zip);
  ok(JSON.stringify(vacio.map((e) => e.nombre).sort())
    === JSON.stringify(['607-202503.txt', 'LEEME.txt', 'con-ncf/resumen.csv', 'resumen.pdf', 'sin-ncf/resumen.csv']),
  'un mes vacío da las dos hojas con solo la cabecera, el 607, el resumen y el LEEME');
  ok((vacio.find((e) => e.nombre === '607-202503.txt') || { datos: Buffer.alloc(0) }).datos.toString('latin1') === '607|131279759|202503|0\r\n',
    'el 607 de un mes vacío es solo el encabezado con 0 líneas');
  ok(leerCsv(vacio.find((e) => e.nombre === 'con-ncf/resumen.csv').datos).filas.length === 0, 'sin filas');

  const enCurso = lote.armarPaquete('2025-10', { emisor: EMISOR, ahora: Date.parse('2025-10-15T12:00:00.000Z') });
  const leeme = leerZip(enCurso.zip).find((e) => e.nombre === 'LEEME.txt').datos.toString('utf8');
  ok(enCurso.nombre === 'comprobantes-2025-10-parcial.zip' && enCurso.previa.parcial === true,
    `el mes en curso se llama parcial · ${enCurso.nombre}`);
  ok(leeme.includes('parcial'), 'y el LEEME lo dice');
  // O1 se emitió con la secuencia B02 ya cargada: es de consumo y lleva NCF.
  ok(O1.tipo === 'factura_consumo'
    && leerZip(enCurso.zip).some((e) => e.nombre === `con-ncf/${O1.numero}.pdf`), 'octubre lleva lo de octubre');

  const futuro = lanza(() => lote.armarPaquete('2025-12', { emisor: EMISOR, ahora: AHORA }));
  ok(futuro && futuro.codigo === 400, 'un mes futuro es un 400');
  const sinEmisor = lanza(() => lote.armarPaquete('2025-09', { ahora: AHORA }));
  ok(sinEmisor && !sinEmisor.codigo, 'sin emisor lanza un error de programación (sin código HTTP)');
}

/* #91 (R-01) — El Formato 607 va en la raíz del paquete como BORRADOR para
   el contador: lo revisa y lo sube él. Es exactamente lo que da
   `formato607` con las filas del mes; el paquete no lo reescribe. */
console.log('\n9b · El Formato 607 dentro del paquete (#91)');
{
  const { formato607 } = require('./formato607');
  const r = lote.armarPaquete('2025-09', { emisor: EMISOR, ahora: AHORA });
  const z = leerZip(r.zip);
  const p = lote.validarMes('2025-09', AHORA);
  const esperado = formato607(db.comprobantesDelPeriodo(p.desde, p.hasta), { rncEmisor: EMISOR.rnc, mes: '2025-09' });
  const txt = z.find((e) => e.nombre === '607-202509.txt');
  ok(txt && txt.datos.equals(Buffer.from(esperado.texto, 'latin1')), '607-202509.txt es byte a byte lo que da formato607');
  ok(txt && !txt.datos.slice(0, 3).equals(BOM), 'sin BOM: es el TXT de la DGII');
  const leeme = z.find((e) => e.nombre === 'LEEME.txt').datos.toString('utf8');
  ok(leeme.includes('607-202509.txt') && /borrador/i.test(leeme) && leeme.includes('el contador'),
    'el LEEME dice que el 607 es un borrador para el contador');
  ok(/retenci/i.test(leeme), 'y que las retenciones van vacías');
  ok(esperado.avisos.length > 0 && esperado.avisos.every((a) => leeme.includes(a)),
    `el LEEME copia los avisos del 607 · ${esperado.avisos.length}`);
  ok(z.filter((e) => e.nombre.startsWith('607-')).length === 1, 'un solo 607, en la raíz');
}

console.log('\n10 · Nada de esto sale solo');
{
  const fuente = fs.readFileSync(path.join(__dirname, 'lote.js'), 'utf8');
  ok(!/require\(['"]\.\/correo['"]\)/.test(fuente) && !/\.enviar\(/.test(fuente),
    'tools/lote.js no carga el correo ni envía nada: el paquete solo se descarga');
}

console.log();
console.log(fallos ? `${fallos} comprobación(es) fallidas` : 'Todo correcto');
process.exit(fallos ? 1 : 0);
