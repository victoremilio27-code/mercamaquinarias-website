/**
 * Ensaya un respaldo sin abrir en escritura el archivo conservado.
 *
 * La copia temporal es deliberada: abrir el respaldo para probar las
 * migraciones lo modificaría y dejaría de ser evidencia de lo respaldado.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.resolve(__dirname, '..');
const RESPALDOS = process.env.MERCA_RESPALDOS || path.join(RAIZ, '.tmp', 'respaldos');
const PATRON_RESPALDO = /^mercamaquinarias-.*\.db$/;
const TABLAS = ['usuarios', 'anuncios', 'pagos', 'facturas'];

function elegirMasReciente(nombres) {
  return nombres.filter((nombre) => PATRON_RESPALDO.test(nombre)).sort().at(-1) || null;
}

function armarResumen({ archivo, fecha, tamano, integridad, recuentos, migraciones, errorMigraciones }) {
  const lineas = [
    'Ensayo de restauración',
    `Archivo: ${archivo}`,
    `Fecha: ${fecha}`,
    `Tamaño: ${tamano} bytes`,
    `integrity_check: ${integridad}`,
    'Recuentos:',
    ...TABLAS.map((tabla) => `  ${tabla}: ${recuentos[tabla] === null ? 'tabla no existe' : recuentos[tabla]}`),
    `Migraciones: ${migraciones ? 'correctas' : 'fallaron'}`,
  ];
  if (errorMigraciones) lineas.push(`Error de migraciones:\n${errorMigraciones.trim()}`);
  return lineas.join('\n');
}

function contarTablas(base) {
  const recuentos = {};
  for (const tabla of TABLAS) {
    const existe = base.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tabla);
    recuentos[tabla] = existe ? Number(base.prepare(`SELECT COUNT(*) AS n FROM ${tabla}`).get().n) : null;
  }
  return recuentos;
}

function respaldoSolicitado(argumento) {
  if (argumento) return path.resolve(argumento);
  let nombres;
  try {
    nombres = fs.readdirSync(RESPALDOS);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  const nombre = elegirMasReciente(nombres);
  return nombre ? path.join(RESPALDOS, nombre) : null;
}

function principal() {
  let temporal;
  const origen = respaldoSolicitado(process.argv[2]);
  if (!origen) {
    console.error(`No hay respaldo que ensayar; se buscó en ${RESPALDOS}`);
    return 2;
  }

  try {
    const datos = fs.statSync(origen);
    temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'mercamaquinarias-restauracion-'));
    const copia = path.join(temporal, path.basename(origen));
    fs.copyFileSync(origen, copia);

    const base = new DatabaseSync(copia, { readOnly: true });
    let integridad;
    let recuentos;
    try {
      integridad = Object.values(base.prepare('PRAGMA integrity_check').get())[0];
      recuentos = contarTablas(base);
    } finally {
      base.close();
    }

    let migraciones = false;
    let errorMigraciones = '';
    if (integridad === 'ok') {
      const hijo = spawnSync(process.execPath, ['-e', "require('./tools/db').abrir()"], {
        cwd: RAIZ,
        env: { ...process.env, MERCA_DB: copia },
        encoding: 'utf8',
      });
      migraciones = hijo.status === 0;
      if (!migraciones) errorMigraciones = [hijo.stdout, hijo.stderr].filter(Boolean).join('\n');
    }

    console.log(armarResumen({
      archivo: origen,
      fecha: datos.mtime.toISOString(),
      tamano: datos.size,
      integridad,
      recuentos,
      migraciones,
      errorMigraciones,
    }));
    return integridad === 'ok' && migraciones ? 0 : 1;
  } catch (error) {
    console.error(`No se pudo ensayar el respaldo ${origen}: ${error.stack || error.message}`);
    return 1;
  } finally {
    if (temporal) fs.rmSync(temporal, { recursive: true, force: true });
  }
}

module.exports = { elegirMasReciente, armarResumen };

if (require.main === module) process.exitCode = principal();
