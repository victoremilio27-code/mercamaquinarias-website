/**
 * probar-lote.js — consultas y reposición de PDF del lote mensual.
 *
 * Corre sobre una base y una carpeta temporales: no emite comprobantes
 * ni toca los archivos reales.
 */

const crypto = require('node:crypto');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-lote');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');

const db = require('./db');
const facturas = require('./facturas');
const lote = require('./lote');
const { validarMes } = lote;
const api = require('./api');

let fallos = 0;
function ok(condicion, texto) {
  if (!condicion) fallos += 1;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}

function insertar(d, fila) {
  d.prepare(`INSERT INTO facturas
    (id, numero, tipo, ncf, concepto, subtotal, itbis, total, moneda, fecha, ruta_pdf, creada)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(fila.id, fila.numero, fila.tipo, fila.ncf || null, fila.concepto,
      fila.subtotal, fila.itbis, fila.total, fila.moneda || 'DOP', fila.fecha,
      fila.rutaPdf || null, '2025-11-15T12:00:00.000Z');
}

/* Abrir aplica el esquema. Los datos se insertan directamente porque
   esta prueba comprueba lecturas, no el flujo irreversible de emisión. */
db.secuenciasNcf();
const d = conexion();
const filas = [
  { id: 'sep', numero: 'MM-2025-000001', tipo: 'recibo', concepto: 'Septiembre',
    subtotal: 100, itbis: 18, total: 118, fecha: '2025-10-01T03:59:59.999Z' },
  { id: 'oct-b', numero: 'MM-2025-000003', tipo: 'factura_consumo', ncf: 'B0200000002',
    concepto: 'Octubre B', subtotal: 300, itbis: 54, total: 354,
    fecha: '2025-10-15T10:00:00Z', rutaPdf: '2025/10/MM-2025-000003.pdf' },
  { id: 'oct-a', numero: 'MM-2025-000002', tipo: 'factura_consumo', ncf: 'B0200000001',
    concepto: 'Octubre A', subtotal: 200, itbis: 36, total: 236,
    fecha: '2025-10-01T04:00:00.000Z' },
  { id: 'irregular', numero: 'MM-2025-000004', tipo: 'recibo', concepto: 'Fecha vieja',
    subtotal: 400, itbis: 72, total: 472, fecha: '2025-10-20' },
  { id: 'nov', numero: 'MM-2025-000005', tipo: 'recibo', concepto: 'Noviembre',
    subtotal: 500, itbis: 90, total: 590, fecha: '2025-11-01T04:00:00.000Z' },
];
filas.forEach((fila) => insertar(d, fila));
d.close();

const periodo = validarMes('2025-10', Date.parse('2025-11-15T12:00:00.000Z'));

console.log('\n1. El periodo usa el corte dominicano y no tiene límite');
const comprobantes = db.comprobantesDelPeriodo(periodo.desde, periodo.hasta);
ok(comprobantes.map((f) => f.id).join(',') === 'oct-a,oct-b,irregular',
  comprobantes.map((f) => `${f.id}:${f.fecha}`).join(' · '));
ok(!comprobantes.some((f) => f.id === 'sep' || f.id === 'nov'),
  'excluye ambos extremos ajenos al periodo');

console.log('\n2. Los importes se agrupan por tipo y moneda');
const sumas = db.sumaDelPeriodo(periodo.desde, periodo.hasta);
const consumo = sumas.find((fila) => fila.tipo === 'factura_consumo' && fila.moneda === 'DOP');
const recibo = sumas.find((fila) => fila.tipo === 'recibo' && fila.moneda === 'DOP');
ok(consumo && consumo.cantidad === 2 && consumo.subtotal === 500
  && consumo.itbis === 90 && consumo.total === 590, JSON.stringify(consumo));
ok(recibo && recibo.cantidad === 1 && recibo.total === 472, JSON.stringify(recibo));

console.log('\n3. Se encuentran solamente las fechas no ISO completas');
const irregulares = db.fechasIrregulares(['2025-10', '2025-11']);
ok(irregulares.length === 1 && irregulares[0].id === 'irregular',
  irregulares.map((fila) => `${fila.numero}:${fila.fecha}`).join(' · ') || 'ninguna');
ok(db.fechasIrregulares([]).length === 0, 'una lista vacía devuelve una lista vacía');

function huellaFiscal() {
  const base = conexion();
  const fiscales = base.prepare(`SELECT numero, ncf, fecha, subtotal, itbis, total
    FROM facturas ORDER BY id`).all();
  base.close();
  return crypto.createHash('sha256').update(JSON.stringify(fiscales)).digest('hex');
}

console.log('\n4. Solo se reponen los PDF que faltan');
const carpetaExistente = path.join(process.env.MERCA_FACTURAS, '2025', '10');
fs.mkdirSync(carpetaExistente, { recursive: true });
const pdfExistente = path.join(carpetaExistente, 'MM-2025-000003.pdf');
fs.writeFileSync(pdfExistente, 'papel existente');
const antes = huellaFiscal();
const emisor = {
  razonSocial: 'Inversiones XZT, S.R.L.', rnc: '131279759', registroMercantil: '',
  direccion: 'Santo Domingo, República Dominicana', telefono: '', correo: 'prueba@invalid',
};
const reposicion = facturas.reponerPdfsDe(comprobantes, { emisor });
ok(reposicion.hechos.join(',') === 'MM-2025-000002,MM-2025-000004'
  && reposicion.fallos.length === 0, JSON.stringify(reposicion));
ok(fs.readFileSync(pdfExistente, 'utf8') === 'papel existente', 'no redibuja el PDF que ya existe');
ok(huellaFiscal() === antes, 'las consultas y la reposición no cambian columnas fiscales');

function pedir(url, cookie) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = 'GET';
    req.url = url;
    req.headers = { 'user-agent': 'prueba-lote', ...(cookie ? { cookie } : {}) };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};
    const res = {
      codigo: 0, cabeceras: {},
      setHeader() {}, destroy() {},
      writeHead(codigo, cabeceras = {}) {
        res.codigo = codigo;
        res.cabeceras = cabeceras;
        return res;
      },
      end(cuerpo) { resolver({ codigo: res.codigo, cabeceras: res.cabeceras, cuerpo }); },
    };
    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => req.emit('end'));
  });
}

(async () => {
  console.log('\n5. La API solo permite la descarga manual por un administrador');
  const sinSesion = await pedir('/api/admin/lote-contador/2025-03');
  const zipSinSesion = await pedir('/api/admin/lote-contador/2025-03.zip');
  ok(sinSesion.codigo === 401 && zipSinSesion.codigo === 401,
    `las dos rutas sin sesión devuelven ${sinSesion.codigo}/${zipSinSesion.codigo}`);

  const { idUsuario } = db.crearCuenta({
    correo: 'admin-lote@prueba.invalid', clave: 'UnaClaveLargaYSegura9',
    nombre: 'Administradora del lote', telefono: '8095550188', tipo: 'particular',
  });
  const base = conexion();
  base.prepare('UPDATE usuarios SET es_admin = 1 WHERE id = ?').run(idUsuario);
  base.close();
  const cookie = `te_sesion=${db.abrirSesion(idUsuario)}`;

  const vista = await pedir('/api/admin/lote-contador/2025-03', cookie);
  const jsonVista = JSON.parse(vista.cuerpo);
  ok(vista.codigo === 200 && jsonVista.previa.mes === '2025-03'
    && jsonVista.previa.cantidad === 0 && jsonVista.previa.archivo === 'comprobantes-2025-03.zip',
  'la vista previa devuelve el contrato completo de lote.previa');

  const bandeja = path.join(__dirname, '..', '.tmp', 'correos');
  const correosAntes = fs.existsSync(bandeja) ? fs.readdirSync(bandeja).sort() : [];
  const descarga = await pedir('/api/admin/lote-contador/2025-03.zip', cookie);
  const correosDespues = fs.existsSync(bandeja) ? fs.readdirSync(bandeja).sort() : [];
  ok(descarga.codigo === 200 && Buffer.isBuffer(descarga.cuerpo)
    && descarga.cabeceras['Content-Type'] === 'application/zip'
    && descarga.cabeceras['Content-Disposition'] === 'attachment; filename="comprobantes-2025-03.zip"'
    && descarga.cabeceras['Content-Length'] === descarga.cuerpo.length
    && descarga.cabeceras['Cache-Control'] === 'private, no-store'
    && descarga.cabeceras['X-Content-Type-Options'] === 'nosniff',
  'la descarga entrega el ZIP con nombre, longitud y cabeceras privadas');
  ok(JSON.stringify(correosDespues) === JSON.stringify(correosAntes),
    'armar el paquete por la API no añade nada a la bandeja de correos');

  const mesMalo = await pedir('/api/admin/lote-contador/2025-13', cookie);
  ok(mesMalo.codigo === 400, `validarMes conserva su código 400 · ${mesMalo.codigo}`);

  const armarOriginal = lote.armarPaquete;
  lote.armarPaquete = () => { throw Object.assign(new Error('Faltan papeles'), { codigo: 409, faltan: ['MM-1'] }); };
  const conflicto = await pedir('/api/admin/lote-contador/2025-03.zip', cookie);
  const jsonConflicto = JSON.parse(conflicto.cuerpo);
  ok(conflicto.codigo === 409 && jsonConflicto.error === 'Faltan papeles'
    && jsonConflicto.faltan.join(',') === 'MM-1', 'el 409 conserva el mensaje y la lista faltan');
  lote.armarPaquete = () => { throw Object.assign(new Error('Hay fechas irregulares: MM-1.'), { codigo: 500 }); };
  const interno = await pedir('/api/admin/lote-contador/2025-03.zip', cookie);
  ok(interno.codigo === 500 && JSON.parse(interno.cuerpo).error === 'Hay fechas irregulares: MM-1.',
    'el 500 conserva el mensaje de armarPaquete');
  // Cualquier otro fallo interno sale genérico (issue #136): no se filtra el texto de SQLite.
  lote.armarPaquete = () => { throw new Error('SQLITE_BUSY: database is locked'); };
  const opaco = await pedir('/api/admin/lote-contador/2025-03.zip', cookie);
  ok(opaco.codigo === 500 && JSON.parse(opaco.cuerpo).error === 'Error del servidor',
    'un fallo interno cualquiera no enseña su mensaje');
  lote.armarPaquete = armarOriginal;

  console.log('\n6. No existe ningún camino automático para el lote');
  const fuenteLote = fs.readFileSync(path.join(__dirname, 'lote.js'), 'utf8');
  const fuenteApi = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  const bloqueApi = fuenteApi.slice(fuenteApi.indexOf('const previaLoteContador'),
    fuenteApi.indexOf('const reenviarFactura'));
  ok(!fuenteLote.includes("require('./correo')") && !fuenteLote.includes('.enviar('),
    'lote.js no carga correo ni llama a enviar');
  ok(!bloqueApi.includes('.enviar('), 'el bloque de la API del lote no llama a enviar');
  const fuentesAutomaticas = [path.join(__dirname, 'tareas.js'), path.join(__dirname, 'serve.js')];
  const pendientes = [path.join(__dirname, '..', 'deploy')];
  while (pendientes.length) {
    const actual = pendientes.pop();
    for (const entrada of fs.readdirSync(actual, { withFileTypes: true })) {
      const destino = path.join(actual, entrada.name);
      if (entrada.isDirectory()) pendientes.push(destino);
      else fuentesAutomaticas.push(destino);
    }
  }
  const menciones = fuentesAutomaticas.filter((archivo) => /lote/i.test(fs.readFileSync(archivo, 'utf8')));
  ok(menciones.length === 0, `tareas.js, serve.js y deploy no mencionan el lote · ${menciones.join(', ') || 'ninguna'}`);

  console.log();
  console.log(fallos ? `${fallos} comprobación(es) fallidas` : 'Todo correcto');
  process.exitCode = fallos ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
