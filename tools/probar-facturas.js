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
const api = require('./api');
const { EventEmitter } = require('events');

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

/* Una petición real al enrutador permite comprobar tanto el JSON como el
   CSV sin levantar un puerto ni salir de la base temporal. */
function pedir(url, cabeceras) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = 'GET';
    req.url = url;
    req.headers = { 'user-agent': 'prueba-facturas', ...cabeceras };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      cabeceras: {},
      setHeader() {},
      writeHead(codigo, headers = {}) {
        res.codigo = codigo;
        res.cabeceras = headers;
        return res;
      },
      destroy() {},
      end(cuerpo) {
        resolver({ codigo: res.codigo, cabeceras: res.cabeceras, cuerpo: cuerpo || '' });
      },
    };

    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => req.emit('end'));
  });
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

console.log();
console.log('10. El asunto del correo lleva la etiqueta y los dos códigos');

/* Con el transporte de archivo, `enviar` escribe los correos en disco
   en vez de mandarlos: así se puede leer el asunto que habría salido. */
(async () => {
  await facturas.enviar(db.facturaPorId(f2.id), { correoCliente: 'cliente@ejemplo.do' });
  const enviada = db.facturaPorId(f2.id);
  ok(!!enviada.enviada_interna, 'la copia interna queda marcada como enviada');

  const SALTO = /\r?\n/;
  const bandeja = path.join(__dirname, '..', '.tmp', 'correos');
  /* El transporte de archivo guarda cada correo como .txt con sus
     cabeceras arriba: el asunto es la línea que empieza por «Asunto:». */
  const asuntos = fs.existsSync(bandeja)
    ? fs.readdirSync(bandeja).filter((f) => f.endsWith('.txt')).sort().slice(-2)
      .map((f) => fs.readFileSync(path.join(bandeja, f), 'utf8'))
      .map((c) => (c.split(SALTO).find((x) => x.startsWith('Asunto: ')) || '').slice(8))
      .filter(Boolean)
    : [];

  const bueno = asuntos.find((s) => s.startsWith('[Facturación]')
    && s.includes(enviada.numero) && s.includes(enviada.referencia_pago));
  ok(!!bueno, bueno || `no salió el asunto esperado; salieron: ${asuntos.join(' | ') || 'ninguno'}`);

  console.log();
  console.log('11. El mes se corta a medianoche de Santo Domingo en listado y CSV');

  const d = conexion();
  d.prepare('UPDATE facturas SET fecha = ? WHERE id = ?').run('2025-10-01T03:59:59.999Z', f1.id);
  d.prepare('UPDATE facturas SET fecha = ? WHERE id = ?').run('2025-10-01T04:00:00.000Z', f2.id);
  const { idUsuario: idAdmin } = db.crearCuenta({
    correo: 'admin-facturas@prueba.invalid', clave: 'UnaClaveLargaYSegura9',
    nombre: 'Administradora de prueba', telefono: '8095550199', tipo: 'particular',
  });
  d.prepare('UPDATE usuarios SET es_admin = 1 WHERE id = ?').run(idAdmin);
  const antes = d.prepare('SELECT id, fecha FROM facturas ORDER BY id').all();
  d.close();

  const cabeceras = { cookie: `te_sesion=${db.abrirSesion(idAdmin)}` };
  const septiembre = await pedir('/api/admin/facturas?mes=2025-09', cabeceras);
  const octubre = await pedir('/api/admin/facturas?mes=2025-10', cabeceras);
  const listaSeptiembre = JSON.parse(septiembre.cuerpo).facturas;
  const listaOctubre = JSON.parse(octubre.cuerpo).facturas;
  ok(septiembre.codigo === 200 && listaSeptiembre.some((f) => f.id === f1.id)
    && !listaSeptiembre.some((f) => f.id === f2.id),
  '03:59:59.999Z sale en septiembre en el listado');
  ok(octubre.codigo === 200 && listaOctubre.some((f) => f.id === f2.id)
    && !listaOctubre.some((f) => f.id === f1.id),
  '04:00:00.000Z sale en octubre en el listado');

  const csvSeptiembre = await pedir('/api/admin/facturas.csv?mes=2025-09', cabeceras);
  const csvOctubre = await pedir('/api/admin/facturas.csv?mes=2025-10', cabeceras);
  const textoSeptiembre = Buffer.from(csvSeptiembre.cuerpo).toString('utf8');
  const textoOctubre = Buffer.from(csvOctubre.cuerpo).toString('utf8');
  ok(csvSeptiembre.codigo === 200 && textoSeptiembre.includes(f1.numero)
    && !textoSeptiembre.includes(f2.numero), '03:59:59.999Z sale en septiembre en el CSV');
  ok(csvOctubre.codigo === 200 && textoOctubre.includes(f2.numero)
    && !textoOctubre.includes(f1.numero), '04:00:00.000Z sale en octubre en el CSV');

  const verificacion = conexion();
  const despues = verificacion.prepare('SELECT id, fecha FROM facturas ORDER BY id').all();
  verificacion.close();
  ok(JSON.stringify(despues) === JSON.stringify(antes), 'los dos filtros son de solo lectura');

  /* #64 — La fecha impresa en el comprobante. `fechaCorta` usaba getUTC*, así
     que lo cobrado de 20:00 a 24:00 en Santo Domingo salía con el día
     siguiente, y el cliente lo cruza así en su 606. Desde FECHA_HORA_RD los
     comprobantes imprimen la fecha dominicana; los anteriores conservan la
     que ya se imprimió, para que un PDF repuesto salga idéntico al que
     recibió el cliente (un comprobante emitido no se reescribe). */
  console.log('\n── Fecha del comprobante en hora dominicana (#64) ──');
  const { fechaCorta, FECHA_HORA_RD } = facturas;
  ok(typeof fechaCorta === 'function', 'facturas exporta fechaCorta');
  ok(FECHA_HORA_RD === '2026-10-02T04:00:00.000Z',
    'el cambio rige desde el 2 de octubre de 2026 a las 00:00 de Santo Domingo');
  if (typeof fechaCorta === 'function') {
    ok(fechaCorta('2026-10-05T02:30:00.000Z') === '04/10/2026',
      '22:30 del 4 de octubre en Santo Domingo se imprime 04/10/2026');
    ok(fechaCorta('2026-10-05T03:59:59.999Z') === '04/10/2026', '23:59:59 sigue siendo el día 4');
    ok(fechaCorta('2026-10-05T04:00:00.000Z') === '05/10/2026', '00:00 de Santo Domingo ya es el día 5');
    ok(fechaCorta('2026-12-31T23:00:00.000Z') === '31/12/2026', 'fin de año sin desbordar');
    ok(fechaCorta('2027-01-01T03:00:00.000Z') === '31/12/2026', 'Año Nuevo en UTC sigue siendo 31 en Santo Domingo');
    ok(fechaCorta('2026-09-30T02:30:00.000Z') === '30/09/2026',
      'un comprobante anterior al cambio conserva la fecha UTC que ya se imprimió');
    ok(fechaCorta('2026-10-02T03:59:59.999Z') === '02/10/2026', 'el último instante antes del cambio sigue en UTC');
    // El vencimiento de la secuencia se guarda sin hora (`2027-12-31`):
    // convertirlo a hora dominicana lo imprimiría como el día 30.
    ok(fechaCorta('2027-12-31') === '31/12/2027', 'una fecha sin hora se imprime tal cual');
    ok(fechaCorta('no es fecha') === '' && fechaCorta(null) === '', 'lo que no es fecha da cadena vacía');
  }

  console.log();
  console.log(`PDF de muestra en ${path.relative(process.cwd(), process.env.MERCA_FACTURAS)}`);
  console.log();
  console.log(fallos ? `${fallos} comprobación(es) fallidas` : 'Todo correcto');
  process.exitCode = fallos ? 1 : 0;
})();
