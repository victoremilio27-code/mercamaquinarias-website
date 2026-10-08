/**
 * Prueba aislada de la guarda que separa la demostración de producción.
 *
 * Cada ejecución recibe una base temporal distinta: una falla nunca puede
 * alcanzar la base habitual ni ocultarse detrás de datos de otra prueba.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), 'mercamaquinarias-seed-guarda-'));
const semilla = path.join(__dirname, 'seed.js');
let comprobaciones = 0;

const comprobar = (condicion, mensaje) => {
  assert.ok(condicion, mensaje);
  comprobaciones++;
  console.log(`  ✓ ${mensaje}`);
};

const ejecutar = (nombre, variables = {}, argumentos = []) => {
  const base = path.join(raiz, `${nombre}.db`);
  const entorno = { ...process.env, MERCA_DB: base, MERCA_HTTPS: '0' };
  delete entorno.NODE_ENV;
  Object.assign(entorno, variables);
  const resultado = spawnSync(process.execPath, [semilla, ...argumentos], {
    env: entorno,
    encoding: 'utf8',
  });
  return { ...resultado, base };
};

try {
  const porNodeEnv = ejecutar('node-env', { NODE_ENV: 'production' });
  comprobar(porNodeEnv.status === 1, 'NODE_ENV=production rechaza la siembra con código 1');
  comprobar(!fs.existsSync(porNodeEnv.base), 'NODE_ENV=production no crea el archivo de base');
  comprobar(porNodeEnv.stderr.includes('--solo-flota'), 'el rechazo explica la orden correcta para la flota');

  const porHttps = ejecutar('https', { MERCA_HTTPS: '1' });
  comprobar(porHttps.status === 1, 'MERCA_HTTPS=1 rechaza la siembra con código 1');
  comprobar(!fs.existsSync(porHttps.base), 'MERCA_HTTPS=1 no crea el archivo de base');

  const desarrollo = ejecutar('desarrollo');
  comprobar(desarrollo.status === 0, 'sin señales de producción la demostración se siembra');
  comprobar(fs.existsSync(desarrollo.base), 'la siembra permitida crea el archivo de base');

  const flota = ejecutar('flota', { NODE_ENV: 'production' }, ['--solo-flota']);
  comprobar(flota.status === 0, '--solo-flota sigue funcionando en producción');

  process.env.MERCA_DB = path.join(raiz, 'modulo.db');
  const { pareceProduccion } = require('./seed');
  comprobar(!!pareceProduccion({ MERCA_DB: '/var/lib/x/y.db' }),
    'una base resuelta dentro de /var/lib se reconoce como producción');
  comprobar(pareceProduccion({}) === null, 'un entorno vacío no parece producción');

  console.log(`\n${comprobaciones} comprobaciones pasaron.`);
} finally {
  fs.rmSync(raiz, { recursive: true, force: true });
}
