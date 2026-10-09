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
  /* En segundos enteros: utimes no guarda siempre los milisegundos, y con
     Date.now() el respaldo «de 30 horas justas» salía a veces una fracción
     más viejo y la prueba fallaba una de cada pocas veces. */
  const ahora = Math.floor(Date.now() / 1000) * 1000;
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

/* Auditoría 2026-10 (FISCAL-1): que el sitio no pueda cobrar, o que cobre
   con `demo`, tiene que verse en la consola y no solo en el registro. */
test('en producción avisa si no hay método de cobro o si está el de demostración', (t) => {
  const { base, respaldos } = preparar(t);
  const llamar = (metodosPago, produccion) => estadoDelSistema({
    archivoBase: base, carpetaRespaldos: respaldos, fsx: fsConDisco(80, 100), metodosPago, produccion,
  });
  const sinCobro = llamar([], true);
  assert.deepEqual(sinCobro.pagos, { metodos: [] });
  assert.ok(sinCobro.avisos.some((aviso) => /no puede cobrar/.test(aviso)));
  assert.ok(llamar(['demo'], true).avisos.some((aviso) => /demostración/.test(aviso)));
  assert.ok(!llamar(['transferencia'], true).avisos.some((aviso) => /cobr|demostración/.test(aviso)));
  assert.ok(!llamar(['demo'], false).avisos.some((aviso) => /cobr|demostración/.test(aviso)),
    'fuera de producción, demo es lo normal');
  assert.equal(llamar(undefined, true).pagos, undefined, 'sin el dato, no se inventa nada');
});

test('formatea bytes con unidades de 1024 y coma decimal', () => {
  assert.equal(formatoBytes(0), '0 B');
  assert.equal(formatoBytes(1023), '1023 B');
  assert.equal(formatoBytes(1024), '1 KB');
  assert.equal(formatoBytes(1.5 * 1024 * 1024), '1,5 MB');
  assert.equal(formatoBytes(3 * 1024 ** 3), '3 GB');
});
