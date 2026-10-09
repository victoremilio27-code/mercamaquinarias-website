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
const pdf = require('./pdf');
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

/* Lo mismo para un POST con cuerpo JSON: la anulación (#168) se prueba
   por la ruta y no por la función, porque el pago se quedaba `aprobado`
   justo en el tramo de la ruta que venía después de emitir la nota. */
function enviarPost(url, cabeceras, cuerpo) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = url;
    req.headers = { 'user-agent': 'prueba-facturas', 'content-type': 'application/json', ...cabeceras };
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
      end(texto) {
        let json = null;
        try { json = JSON.parse(texto || 'null'); } catch { /* no era JSON */ }
        resolver({ codigo: res.codigo, json });
      },
    };

    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => {
      req.emit('data', Buffer.from(JSON.stringify(cuerpo || {})));
      req.emit('end');
    });
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

  /* #58 — Un PDF repuesto sale idéntico al original. Antes se redibujaba
     solo con la fila: el «2 cupos × RD$ 3.500» de f2 volvía como
     «1 × RD$ 7.000», y con el emisor de ese momento, no el del día en que
     se emitió. El emisor distinto de abajo simula un domicilio cambiado. */
  console.log('\n── El PDF repuesto es idéntico al emitido (#58) ──');
  const otroEmisor = {
    razonSocial: 'Otra Razón, S.R.L.', rnc: '999999999', registroMercantil: '',
    domicilioFiscal: 'Otro domicilio', correoFacturacion: 'otro@invalid',
  };
  const reponerIgual = (idFactura) => {
    const fila = db.facturaPorId(idFactura);
    const antes = facturas.leerPdf(fila.ruta_pdf);
    fs.rmSync(facturas.rutaAbsoluta(fila.ruta_pdf));
    const r = facturas.reponerPdfsDe([db.facturaPorId(idFactura)], { emisor: otroEmisor });
    const despues = facturas.leerPdf(db.facturaPorId(idFactura).ruta_pdf);
    return r.hechos.includes(fila.numero) && !!antes && !!despues && Buffer.compare(antes, despues) === 0;
  };
  /* Uno nuevo y no f1/f2: la sección 11 les cambió la fecha a propósito,
     y con otra fecha el papel ya no es el mismo. */
  const p5 = pago({ subtotal: 7000, itbis: 1260, total: 8260, referencia: 'PRUEBA-5' });
  const f5 = facturas.emitirPorPago(p5, {
    concepto: 'Plan Destacado · 2 cupos · 30 días',
    detalle: { cantidad: 2, precio_unitario: 3500, periodo: '23/09/2026 al 23/10/2026' },
    cliente: { razonSocial: 'Constructora del Este, S.R.L.', rnc: '130123456', correo: 'compras@ejemplo.do' },
  });
  const dibujoF5 = JSON.parse(db.facturaPorId(f5.id).dibujo || 'null');
  ok(dibujoF5 && dibujoF5.detalle.cantidad === 2 && dibujoF5.detalle.precio_unitario === 3500
    && dibujoF5.emisor && dibujoF5.emisor.domicilioFiscal,
  'al emitir se guarda la cantidad, el precio unitario y el emisor');
  ok(reponerIgual(f5.id), 'la factura de 2 cupos se repone byte a byte, aunque el emisor de hoy sea otro');
  ok(reponerIgual(nota.id), 'la nota de crédito también');
  ok(reponerIgual(f4.id), 'y la de consumo sin detalle');
  const vista = facturas.comoHtml(db.facturaPorId(f5.id));
  ok(vista.includes('<td class="c">2</td>') && !vista.includes('Otro domicilio'),
    'la vista web sale de lo guardado: 2 cupos y el emisor de entonces');

  {
    const d = conexion();
    let bloqueado = false;
    try {
      d.prepare("UPDATE facturas SET dibujo = '{}' WHERE id = ?").run(f5.id);
    } catch (e) {
      bloqueado = /no se reescribe/.test(e.message);
    }
    /* Lo emitido antes de #58 no tiene `dibujo` y no se le inventa: se
       redibuja con la fila y el emisor que se pase, como siempre. */
    const viejo = { ...db.facturaPorId(f3.id), dibujo: null };
    d.close();
    ok(bloqueado, 'la base no deja reescribir el dibujo de un comprobante');
    const html = facturas.comoHtml(viejo, { emisor: otroEmisor });
    ok(html.includes('Otro domicilio'), 'un comprobante sin dibujo guardado se dibuja como antes');
  }

  /* #168 (1) — Una secuencia «solo contabilidad» (`usa_sitio = 0`) es del
     contador: el sitio no la toca. Antes `tomarNcf` solo miraba `activa`,
     así que una B02 cargada desde la consola sin marcar «la usa el sitio»
     empezaba a gastarse sin que `secuenciasBajas` avisara de nada, y el
     mismo NCF acababa en dos comprobantes ante la DGII. */
  console.log('\n── Secuencias «solo contabilidad» (#168) ──');
  {
    const siguienteDe = (tipo) => {
      const d = conexion();
      const fila = d.prepare('SELECT siguiente FROM secuencias_ncf WHERE tipo = ? AND activa = 1').get(tipo);
      d.close();
      return fila ? fila.siguiente : null;
    };
    const marcarUsaSitio = (tipo, valor) => {
      const d = conexion();
      d.prepare('UPDATE secuencias_ncf SET usa_sitio = ? WHERE tipo = ? AND activa = 1').run(valor, tipo);
      d.close();
    };

    marcarUsaSitio('B02', 0);
    const b02Antes = siguienteDe('B02');
    ok(db.tomarNcf('B02') === null, 'tomarNcf no da un número de una B02 marcada «solo contabilidad»');
    const pSoloConta = pago({ subtotal: 2000, itbis: 360, total: 2360, referencia: 'PRUEBA-168-B02' });
    const fSoloConta = facturas.emitirPorPago(pSoloConta, { concepto: 'Plan Estándar · 1 cupo · 30 días', cliente: {} });
    ok(fSoloConta.tipo === 'recibo' && !fSoloConta.ncf,
      `sin B02 del sitio el pago cae al recibo, como si no hubiera secuencia (tipo=${fSoloConta.tipo} ncf=${fSoloConta.ncf})`);
    ok(siguienteDe('B02') === b02Antes, `la B02 del contador no avanza (${b02Antes} → ${siguienteDe('B02')})`);
    marcarUsaSitio('B02', 1);

    /* Y con la B04: una devolución no puede gastar un número del contador.
       Se responde como sin B04, antes de tocar el original. */
    const pB04 = pago({ subtotal: 7000, itbis: 1260, total: 8260, referencia: 'PRUEBA-168-B04' });
    const fB04 = facturas.emitirPorPago(pB04, {
      concepto: 'Plan Destacado · 2 cupos · 30 días',
      cliente: { razonSocial: 'Constructora del Este, S.R.L.', rnc: '130123456' },
    });
    marcarUsaSitio('B04', 0);
    const b04Antes = siguienteDe('B04');
    let errorB04 = null;
    try { facturas.emitirNotaCredito(db.facturaPorId(fB04.id), { motivo: 'Prueba #168' }); } catch (e) { errorB04 = e; }
    ok(!!errorB04 && errorB04.codigo === 409, `sin B04 del sitio la nota no se emite (${errorB04 ? errorB04.message : 'se emitió'})`);
    ok(siguienteDe('B04') === b04Antes && !db.facturaPorId(fB04.id).anulado_por,
      'ni se gasta el B04 del contador ni se anula el original');
    marcarUsaSitio('B04', 1);
  }

  /* #168 (2) — La nota de crédito, de una pieza. Antes tomaba el B04,
     creaba la nota y anulaba el original cada cosa por su lado, y dibujaba
     el PDF sin `try`: un fallo a mitad dejaba un B04 gastado sin
     comprobante, y un fallo del PDF devolvía 500 con la nota ya emitida,
     sin pasar el pago a `devuelto`; el reintento contestaba 409 «ya está
     anulado» y el pago se quedaba `aprobado` para siempre. */
  console.log('\n── La nota de crédito es atómica (#168) ──');
  {
    const d0 = conexion();
    const siguienteB04 = () => {
      const fila = d0.prepare("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B04' AND activa = 1").get();
      return fila ? fila.siguiente : null;
    };
    const notasDe = (idPago) => d0.prepare(
      "SELECT * FROM facturas WHERE pago_id = ? AND tipo = 'nota_credito'").all(idPago);
    const estadoPago = (idPago) => d0.prepare('SELECT estado FROM pagos WHERE id = ?').get(idPago).estado;
    const facturaConB01 = (referencia) => {
      const p = pago({ subtotal: 7000, itbis: 1260, total: 8260, referencia });
      return facturas.emitirPorPago(p, {
        concepto: 'Plan Destacado · 2 cupos · 30 días',
        cliente: { razonSocial: 'Constructora del Este, S.R.L.', rnc: '130123456' },
      });
    };

    for (const [paso, nombre] of [['crearFactura', 'la inserción de la nota'], ['marcarAnulada', 'la anulación del original']]) {
      const f = facturaConB01(`PRUEBA-168-${paso}`);
      const antes = siguienteB04();
      const real = db[paso];
      db[paso] = () => { throw new Error(`fallo simulado en ${paso}`); };
      let error = null;
      try { facturas.emitirNotaCredito(db.facturaPorId(f.id), { motivo: 'Prueba #168' }); } catch (e) { error = e; } finally { db[paso] = real; }
      ok(!!error, `si falla ${nombre}, el error llega al que llama`);
      ok(siguienteB04() === antes, `si falla ${nombre}, el B04 no se gasta (${antes} → ${siguienteB04()})`);
      ok(notasDe(f.pago_id).length === 0 && !db.facturaPorId(f.id).anulado_por && estadoPago(f.pago_id) === 'aprobado',
        `si falla ${nombre}, no queda nota, el original sigue vigente y el pago aprobado`);
    }

    /* El PDF falla: la nota, la anulación y el pago devuelto quedan
       escritos igual, la ruta responde 201 y el papel se repone después. */
    const f = facturaConB01('PRUEBA-168-PDF');
    const antes = siguienteB04();
    const documentoReal = pdf.documento;
    const errorReal = console.error;
    pdf.documento = () => { throw new Error('fallo simulado al dibujar'); };
    console.error = () => {};
    let r;
    try {
      r = await enviarPost(`/api/admin/facturas/${f.id}/anular`, cabeceras, { motivo: 'Prueba #168' });
    } finally {
      pdf.documento = documentoReal;
      console.error = errorReal;
    }
    const notas = notasDe(f.pago_id);
    ok(r.codigo === 201, `si falla el PDF la anulación responde 201 (respondió ${r.codigo})`);
    ok(notas.length === 1 && /^B04/.test(notas[0].ncf || '') && siguienteB04() === antes + 1,
      `la nota queda emitida con su B04 (${notas.map((n) => n.ncf).join(', ') || 'ninguna'})`);
    ok(notas.length === 1 && db.facturaPorId(f.id).anulado_por === notas[0].id, 'el original queda anulado por esa nota');
    ok(estadoPago(f.pago_id) === 'devuelto', `el pago queda devuelto (estado=${estadoPago(f.pago_id)})`);
    ok(notas.length === 1 && !notas[0].ruta_pdf, 'la nota queda sin PDF, pendiente de reponer');

    const repuesta = facturas.regenerarPdfsPendientes({ limite: 1000 });
    const nota168 = notas.length ? db.facturaPorId(notas[0].id) : null;
    ok(!!nota168 && repuesta.hechos.includes(nota168.numero) && !!nota168.ruta_pdf
      && fs.existsSync(facturas.rutaAbsoluta(nota168.ruta_pdf)),
    'regenerarPdfsPendientes le dibuja el PDF después');

    const otra = await enviarPost(`/api/admin/facturas/${f.id}/anular`, cabeceras, { motivo: 'Otra vez' });
    ok(otra.codigo === 409 && notasDe(f.pago_id).length === 1, 'un segundo intento no emite otra nota');
    d0.close();
  }

  /* Auditoría 2026-10 (FISCAL-2). Mientras no haya B02, todo particular
     recibe un recibo sin NCF, y anularlo gastaba un B04 (quedan diez) que
     «modificaba» un documento sin NCF: la norma no lo admite y el 607 lo
     deja fuera, así que quedaba un NCF emitido y nunca declarado. Ahora
     un recibo se anula con una anulación interna, también sin NCF: no
     toca la B04, deja el recibo anulado (sin reescribirlo) y el pago
     devuelto, y su papel no presume de nada ante la DGII. */
  console.log('\n── Anular un recibo sin NCF no gasta un B04 (auditoría 2026-10) ──');
  {
    const d0 = conexion();
    const siguienteB04 = () => {
      const fila = d0.prepare("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B04' AND activa = 1").get();
      return fila ? fila.siguiente : null;
    };
    d0.prepare("UPDATE secuencias_ncf SET usa_sitio = 0 WHERE tipo = 'B02'").run();
    const pRec = pago({ subtotal: 3296, itbis: 593, total: 3889, referencia: 'PRUEBA-AUD-RECIBO' });
    const rec = facturas.emitirPorPago(pRec, { concepto: 'Publicación Destacado · 30 días', cliente: { razonSocial: 'Julio Pérez' } });
    d0.prepare("UPDATE secuencias_ncf SET usa_sitio = 1 WHERE tipo = 'B02'").run();
    ok(rec.tipo === 'recibo' && !rec.ncf, `de partida, un recibo sin NCF (${rec.numero})`);

    const htmlRecibo = facturas.comoHtml(db.facturaPorId(rec.id));
    ok(!/Comprobante fiscal emitido conforme/.test(htmlRecibo) && /no constituye comprobante fiscal/.test(htmlRecibo),
      'la vista web de un recibo no dice que sea comprobante fiscal');
    const htmlB01 = facturas.comoHtml(db.facturaPorId(f2.id));
    ok(/crédito fiscal/.test(htmlB01) && !/no constituye comprobante fiscal/.test(htmlB01),
      'la de una B01 sigue diciendo a qué da derecho');

    const b04Antes = siguienteB04();
    const r = await enviarPost(`/api/admin/facturas/${rec.id}/anular`, cabeceras, { motivo: 'Devolución al particular' });
    const anulacion = r.json && r.json.nota ? db.facturaPorId(r.json.nota.id) : null;
    ok(r.codigo === 201, `la anulación de un recibo responde 201 (respondió ${r.codigo}${r.json && r.json.error ? `: ${r.json.error}` : ''})`);
    ok(siguienteB04() === b04Antes, `no gasta B04 (${b04Antes} → ${siguienteB04()})`);
    ok(!!anulacion && anulacion.tipo === 'nota_credito' && !anulacion.ncf && !anulacion.ncf_vencimiento,
      `la anulación es interna, sin NCF (${anulacion ? `${anulacion.numero} ncf=${anulacion.ncf}` : 'ninguna'})`);
    ok(!!anulacion && anulacion.ncf_modificado === rec.numero && anulacion.total === rec.total,
      'cita el número del recibo y su importe');
    const recDespues = db.facturaPorId(rec.id);
    ok(!!anulacion && recDespues.anulado_por === anulacion.id && recDespues.total === rec.total && !recDespues.ncf,
      'el recibo queda anulado por ella, sin reescribirse');
    ok(d0.prepare('SELECT estado FROM pagos WHERE id = ?').get(pRec.id).estado === 'devuelto', 'el pago queda devuelto');
    if (anulacion) {
      const htmlAnulacion = facturas.comoHtml(anulacion);
      ok(!/DGII/.test(htmlAnulacion) && /ANULACIÓN DE RECIBO/.test(htmlAnulacion) && /SIN VALOR FISCAL/.test(htmlAnulacion),
        'su papel dice «Anulación de recibo», sin valor fiscal y sin nombrar a la DGII');
    }

    /* Una B01 sigue anulándose con su B04, como siempre. */
    const pB01 = pago({ subtotal: 7000, itbis: 1260, total: 8260, referencia: 'PRUEBA-AUD-B01' });
    const fB01 = facturas.emitirPorPago(pB01, {
      concepto: 'Plan Destacado · 2 cupos · 30 días',
      cliente: { razonSocial: 'Constructora del Este, S.R.L.', rnc: '130123456' },
    });
    const nB01 = facturas.emitirNotaCredito(db.facturaPorId(fB01.id), { motivo: 'Prueba' });
    ok(/^B04/.test(nB01.ncf || '') && siguienteB04() === b04Antes + 1, `una B01 se anula con B04 (${nB01.ncf})`);
    d0.close();
  }

  /* Auditoría 2026-10 (FISCAL-5): el documento del cliente de una B01. */
  console.log('\n── RNC y cédula con su dígito verificador (auditoría 2026-10) ──');
  {
    const casos = [
      ['131279759', '131279759'], ['1-31-27975-9', '131279759'], ['131279750', null],
      ['00100000017', '00100000017'], ['001-0000001-7', '00100000017'], ['00100000018', null],
      ['13127975', null], ['1312797590', null], ['13127975A', null], ['', null], [null, null],
    ];
    for (const [entrada, esperado] of casos) {
      const r = facturas.documentoFiscal(entrada);
      ok(r === esperado, `documentoFiscal(${JSON.stringify(entrada)}) = ${JSON.stringify(r)}`);
    }
  }

  /* Auditoría 2026-10 (FISCAL-4): si la B01 se acaba entre el pedido y la
     confirmación, el cliente con RNC recibe un recibo. Eso no puede
     enterarse nadie a fin de mes: gerencia y facturación lo saben al
     momento, con la referencia, para regularizarlo. */
  console.log('\n── Una empresa que se queda sin B01 avisa al momento (auditoría 2026-10) ──');
  {
    const correoMod = require('./correo');
    const real = correoMod.avisarInternamente;
    const avisos = [];
    correoMod.avisarInternamente = (aviso) => { avisos.push(aviso); return Promise.resolve({ entregado: true }); };
    const d0 = conexion();
    try {
      ok(db.ncfDisponible('B01') === true, 'con B01 cargada, ncfDisponible dice que sí');
      d0.prepare("UPDATE secuencias_ncf SET siguiente = hasta + 1 WHERE tipo = 'B01'").run();
      ok(db.ncfDisponible('B01') === false, 'agotada, ncfDisponible dice que no y no gasta nada');
      const p = pago({ subtotal: 3296, itbis: 593, total: 3889, referencia: 'PRUEBA-AUD-SINB01' });
      const f = facturas.emitirPorPago(p, {
        concepto: 'Publicación Destacado · 30 días',
        cliente: { razonSocial: 'Constructora del Este, S.R.L.', rnc: '131279759' },
      });
      ok(f.tipo === 'recibo' && !f.ncf && f.agotada === 'B01', `sale el recibo (tipo=${f.tipo})`);
      const aviso = avisos[0];
      ok(avisos.length === 1 && aviso.buzon === 'gerencia' && aviso.copia === 'facturacion',
        `un aviso a gerencia con copia aparte a facturación (${avisos.map((a) => `${a.buzon}+${a.copia}`).join(', ')})`);
      ok(!!aviso && aviso.texto.includes(f.numero) && aviso.texto.includes('PRUEBA-AUD-SINB01') && /B01/.test(aviso.asunto),
        'el aviso cita el recibo, la referencia y la B01');
      d0.prepare("UPDATE secuencias_ncf SET siguiente = 1 WHERE tipo = 'B01'").run();
    } finally {
      correoMod.avisarInternamente = real;
      d0.close();
    }
  }

  console.log();
  console.log(`PDF de muestra en ${path.relative(process.cwd(), process.env.MERCA_FACTURAS)}`);
  console.log();
  console.log(fallos ? `${fallos} comprobación(es) fallidas` : 'Todo correcto');
  process.exitCode = fallos ? 1 : 0;
})();
