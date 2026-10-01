/**
 * Prueba aislada del respaldo incremental de comprobantes.
 *
 * Usa una base y carpetas temporales: nunca mira ni modifica los datos
 * configurados para el sitio.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mercamaquinarias-respaldo-'));
const base = path.join(raiz, 'prueba.db');
const facturas = path.join(raiz, 'facturas');
const respaldos = path.join(raiz, 'respaldos');
const tarea = path.join(__dirname, 'tareas.js');
const entorno = {
  ...process.env,
  MERCA_DB: base,
  MERCA_FACTURAS: facturas,
  MERCA_RESPALDOS: respaldos,
  MERCA_SECRETO: 'secreto-solo-para-probar-respaldo',
};

let comprobaciones = 0;
const comprobar = (condicion, mensaje) => {
  assert.ok(condicion, mensaje);
  comprobaciones++;
  console.log(`  ✓ ${mensaje}`);
};

const ejecutar = (...argumentos) => {
  const r = spawnSync(process.execPath, [tarea, 'respaldo', ...argumentos], {
    env: entorno,
    encoding: 'utf8',
  });
  if (r.status !== 0) {
    process.stderr.write(r.stdout);
    process.stderr.write(r.stderr);
    throw new Error(`la tarea de respaldo terminó con código ${r.status}`);
  }
  return r.stdout;
};

try {
  fs.mkdirSync(path.join(facturas, '2026', '09'), { recursive: true });
  fs.mkdirSync(path.join(facturas, '2026', '10'), { recursive: true });
  fs.writeFileSync(path.join(facturas, '2026', '09', 'A.pdf'), 'factura A');
  fs.writeFileSync(path.join(facturas, '2026', '10', 'B.pdf'), 'factura B');
  fs.writeFileSync(path.join(facturas, 'ignorar.txt'), 'no es un comprobante');

  const primera = ejecutar();
  comprobar(primera.includes('2 de 2 PDF copiado(s)'), 'la primera pasada informa dos PDF copiados');
  comprobar(fs.existsSync(path.join(respaldos, 'facturas', '2026', '09', 'A.pdf')),
    'la primera pasada copia el primer PDF conservando su ruta');
  comprobar(fs.existsSync(path.join(respaldos, 'facturas', '2026', '10', 'B.pdf')),
    'la primera pasada copia el segundo PDF conservando su ruta');
  comprobar(!fs.existsSync(path.join(respaldos, 'facturas', 'ignorar.txt')),
    'el respaldo de comprobantes ignora archivos que no son PDF');

  // El nombre del respaldo lleva segundos y VACUUM INTO no sobrescribe.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
  const segunda = ejecutar();
  comprobar(segunda.includes('0 de 2 PDF copiado(s)'), 'la segunda pasada no vuelve a copiar los mismos PDF');

  fs.rmSync(path.join(facturas, '2026', '09', 'A.pdf'));
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1100);
  const tercera = ejecutar();
  comprobar(tercera.includes('0 de 1 PDF copiado(s)'), 'la pasada posterior cuenta solo el PDF que queda en origen');
  comprobar(fs.existsSync(path.join(respaldos, 'facturas', '2026', '09', 'A.pdf')),
    'borrar un PDF del origen no lo borra del respaldo');

  const simulada = ejecutar('--seco');
  comprobar(simulada.includes('copiaría 0 de 1 PDF'), 'el modo seco anota lo que haría sin copiar');

  console.log(`\n${comprobaciones} comprobaciones pasaron.`);
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}
