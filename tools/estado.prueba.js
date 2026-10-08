const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { UMBRALES, estadoDelSistema, formatoBytes } = require('./estado');

function preparar(t) {
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-estado-'));
  t.after(() => fs.rmSync(temporal, { recursive: true, force: true }));
  const base = path.join(temporal, 'mercamaquinarias.db');
  const respaldos = path.join(temporal, 'respaldos');
  fs.writeFileSync(base, 'base');
  fs.mkdirSync(respaldos);
  return { temporal, base, respaldos };
}

function fsConDisco(libres, total) {
  return Object.assign({}, fs, {
    statfsSync() {
      return { bsize: 1, blocks: total, bavail: libres };
    },
  });
}

test('reúne tamaños de la base, el disco y las carpetas sin seguir enlaces', (t) => {
  const { temporal, base, respaldos } = preparar(t);
  fs.writeFileSync(`${base}-wal`, 'wal');
  fs.writeFileSync(`${base}-shm`, 'shm!');
  const fotos = path.join(temporal, 'fotos');
  fs.mkdirSync(path.join(fotos, 'interior'), { recursive: true });
  fs.writeFileSync(path.join(fotos, 'una.jpg'), '12345');
  fs.writeFileSync(path.join(fotos, 'interior', 'otra.jpg'), '1234567');
  fs.symlinkSync(path.join(fotos, 'interior'), path.join(fotos, 'atajo'));

  const estado = estadoDelSistema({
    archivoBase: base,
    carpetaRespaldos: respaldos,
    carpetas: { fotos },
    fsx: fsConDisco(80, 100),
  });

  assert.deepEqual(estado.base, { bytes: 4, wal: 3, shm: 4 });
  assert.deepEqual(estado.disco, { libres: 80, total: 100, porcentajeLibre: 80 });
  assert.deepEqual(estado.carpetas.fotos, { archivos: 2, bytes: 12 });
  assert.deepEqual(estado.avisos, ['No hay ningún respaldo de la base de datos.']);
});

test('elige el respaldo más reciente y calcula su antigüedad', (t) => {
  const { base, respaldos } = preparar(t);
  const ahora = Date.parse('2026-10-08T12:00:00Z');
  const viejo = path.join(respaldos, 'mercamaquinarias-2026-10-01-05-00-00.db');
  const reciente = path.join(respaldos, 'mercamaquinarias-2026-10-08-05-00-00.db');
  fs.writeFileSync(viejo, 'viejo');
  fs.writeFileSync(reciente, 'reciente');
  fs.utimesSync(viejo, new Date(ahora - 40 * 3_600_000), new Date(ahora - 40 * 3_600_000));
  fs.utimesSync(reciente, new Date(ahora - 7 * 3_600_000), new Date(ahora - 7 * 3_600_000));

  const estado = estadoDelSistema({
    archivoBase: base,
    carpetaRespaldos: respaldos,
    ahora,
    fsx: fsConDisco(80, 100),
  });
  assert.deepEqual(estado.respaldo, {
    nombre: path.basename(reciente),
    bytes: 8,
    antiguedadHoras: 7,
  });
  assert.deepEqual(estado.avisos, []);
});

test('produce cada aviso solo al romper su umbral', (t) => {
  const { base, respaldos } = preparar(t);
  const ahora = Date.now();
  const respaldo = path.join(respaldos, 'mercamaquinarias-2026-10-01-05-00-00.db');
  fs.writeFileSync(respaldo, 'copia');
  fs.utimesSync(respaldo, new Date(ahora - 31 * 3_600_000), new Date(ahora - 31 * 3_600_000));
  fs.writeFileSync(`${base}-wal`, '');
  fs.truncateSync(`${base}-wal`, UMBRALES.walBytes + 1);

  const estado = estadoDelSistema({
    archivoBase: base,
    carpetaRespaldos: respaldos,
    ahora,
    fsx: fsConDisco(14, 100),
  });
  assert.equal(estado.avisos.length, 3);
  assert.ok(estado.avisos.some((aviso) => aviso.includes('espacio libre')));
  assert.ok(estado.avisos.some((aviso) => aviso.includes('30 horas')));
  assert.ok(estado.avisos.some((aviso) => aviso.includes('100 MB')));

  fs.utimesSync(respaldo, new Date(ahora - 30 * 3_600_000), new Date(ahora - 30 * 3_600_000));
  fs.truncateSync(`${base}-wal`, UMBRALES.walBytes);
  const limites = estadoDelSistema({
    archivoBase: base,
    carpetaRespaldos: respaldos,
    ahora,
    fsx: fsConDisco(15, 100),
  });
  assert.deepEqual(limites.avisos, []);
});

test('aísla los errores de lectura y nunca lanza', (t) => {
  const { base, respaldos, temporal } = preparar(t);
  const fsx = Object.assign({}, fs, {
    statfsSync() {
      throw new Error('disco no disponible');
    },
  });
  const estado = estadoDelSistema({
    archivoBase: base,
    carpetaRespaldos: respaldos,
    carpetas: { perdida: path.join(temporal, 'no-existe') },
    fsx,
  });
  assert.deepEqual(estado.disco, { error: 'disco no disponible' });
  assert.match(estado.carpetas.perdida.error, /no such file|no se puede encontrar/i);
});

test('formatea bytes con unidades de 1024 y coma decimal', () => {
  assert.equal(formatoBytes(0), '0 B');
  assert.equal(formatoBytes(1023), '1023 B');
  assert.equal(formatoBytes(1024), '1 KB');
  assert.equal(formatoBytes(1.5 * 1024 * 1024), '1,5 MB');
  assert.equal(formatoBytes(3 * 1024 ** 3), '3 GB');
});
