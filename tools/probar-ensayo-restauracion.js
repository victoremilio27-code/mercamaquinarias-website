/** Prueba aislada del ensayo de restauración. */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mercamaquinarias-ensayo-prueba-'));
const archivoBase = path.join(raiz, 'base.db');
const respaldos = path.join(raiz, 'respaldos');
const vacios = path.join(raiz, 'vacios');
const ensayo = path.join(__dirname, 'ensayo-restauracion.js');

// db.js fija la ruta al cargar el módulo; cambiarla después pondría en riesgo la base local.
process.env.MERCA_DB = archivoBase;
process.env.MERCA_SECRETO = 'secreto-solo-para-probar-restauracion';
const db = require('./db');
const { elegirMasReciente, armarResumen } = require('./ensayo-restauracion');

let comprobaciones = 0;
const comprobar = (condicion, mensaje) => {
  assert.ok(condicion, mensaje);
  comprobaciones++;
  console.log(`  ✓ ${mensaje}`);
};

const ejecutar = (carpeta, archivo) => spawnSync(process.execPath, [ensayo, ...(archivo ? [archivo] : [])], {
  cwd: path.resolve(__dirname, '..'),
  env: { ...process.env, MERCA_RESPALDOS: carpeta },
  encoding: 'utf8',
});

try {
  fs.mkdirSync(respaldos);
  fs.mkdirSync(vacios);
  const base = db.abrir();
  db.crearCuenta({
    correo: 'ensayo@example.com',
    clave: 'una-clave-segura',
    nombre: 'Persona de ensayo',
    telefono: '8095550101',
    tipo: 'particular',
  });

  const antiguo = 'mercamaquinarias-2026-10-07-01-02-03.db';
  const reciente = 'mercamaquinarias-2026-10-08-01-02-03.db';
  base.exec(`VACUUM INTO '${path.join(respaldos, antiguo).replace(/'/g, "''")}'`);
  base.exec(`VACUUM INTO '${path.join(respaldos, reciente).replace(/'/g, "''")}'`);

  comprobar(elegirMasReciente(['otro.db', reciente, antiguo]) === reciente,
    'la pieza pura elige el respaldo más reciente');
  const resumen = armarResumen({
    archivo: reciente, fecha: '2026-10-08', tamano: 10, integridad: 'ok',
    recuentos: { usuarios: 1, anuncios: 0, pagos: 0, facturas: null }, migraciones: true,
  });
  comprobar(resumen.includes('facturas: tabla no existe') && resumen.includes('Migraciones: correctas'),
    'la pieza pura informa tablas ausentes y migraciones correctas');

  const rutaReciente = path.join(respaldos, reciente);
  const antes = fs.statSync(rutaReciente);
  const correcto = ejecutar(respaldos);
  comprobar(correcto.status === 0, 'el ensayo correcto termina con código 0');
  comprobar(correcto.stdout.includes(`Archivo: ${rutaReciente}`), 'se ensaya el respaldo más reciente');
  comprobar(correcto.stdout.includes('integrity_check: ok'), 'se informa la integridad correcta');
  comprobar(correcto.stdout.includes('usuarios: 1'), 'se informa el recuento de usuarios');
  comprobar(correcto.stdout.includes('Migraciones: correctas'), 'las migraciones se prueban en un proceso hijo');
  const despues = fs.statSync(rutaReciente);
  comprobar(despues.size === antes.size && despues.mtimeMs === antes.mtimeMs,
    'el respaldo original conserva tamaño y fecha de modificación');

  const sinRespaldo = ejecutar(vacios);
  comprobar(sinRespaldo.status === 2, 'una carpeta vacía termina con código 2');
  comprobar(sinRespaldo.stderr.includes(vacios), 'el error de carpeta vacía dice dónde buscó');

  const corrupto = path.join(raiz, 'corrupto.db');
  fs.writeFileSync(corrupto, Buffer.from([3, 19, 87, 201, 44, 0, 255]));
  const fallo = ejecutar(respaldos, corrupto);
  comprobar(fallo.status === 1, 'un archivo corrupto termina con código 1');
  comprobar(fallo.stderr.includes('No se pudo ensayar'), 'el archivo corrupto produce un mensaje claro');

  console.log(`\n${comprobaciones} comprobaciones pasaron.`);
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}
