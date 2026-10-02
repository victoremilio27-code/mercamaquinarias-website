const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');

const { respaldar, pendientesDe } = require('./respaldo-antes-de-migrar.js');

const NOMBRES = ['2026-10-primera', '2026-10-segunda', '2026-10-tercera'];

function temporal(t) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-respaldo-'));
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  return carpeta;
}

function crearBase(archivo, migraciones) {
  const base = new DatabaseSync(archivo);
  base.exec('CREATE TABLE ejemplo (valor TEXT NOT NULL)');
  base.prepare('INSERT INTO ejemplo (valor) VALUES (?)').run('dato que debe conservarse');
  if (migraciones) {
    base.exec('CREATE TABLE migraciones (nombre TEXT PRIMARY KEY, aplicada TEXT)');
    const insertar = base.prepare('INSERT INTO migraciones (nombre, aplicada) VALUES (?, ?)');
    for (const nombre of migraciones) insertar.run(nombre, '2026-10-02T12:00:00.000Z');
  }
  base.close();
}

function respaldos(carpeta) {
  return fs.readdirSync(carpeta).filter((nombre) => /^antes-.*\.db$/.test(nombre)).sort();
}

test('sin archivo de base no crea la carpeta de respaldos', (t) => {
  const raiz = temporal(t);
  const carpeta = path.join(raiz, 'respaldos');
  assert.deepEqual(respaldar({
    base: path.join(raiz, 'inexistente.db'), carpeta, conservar: 2, nombres: NOMBRES,
  }), { hecho: false, motivo: 'sin-base' });
  assert.equal(fs.existsSync(carpeta), false);
});

test('una base con todas las migraciones está al día y no se respalda', (t) => {
  const raiz = temporal(t);
  const archivo = path.join(raiz, 'base.db');
  const carpeta = path.join(raiz, 'respaldos');
  crearBase(archivo, NOMBRES);
  assert.deepEqual(respaldar({ base: archivo, carpeta, conservar: 2, nombres: NOMBRES }), {
    hecho: false, motivo: 'al-dia',
  });
  assert.equal(fs.existsSync(carpeta), false);
});

test('sin tabla migraciones considera pendientes todos los nombres y respalda', (t) => {
  const raiz = temporal(t);
  const archivo = path.join(raiz, 'base.db');
  const carpeta = path.join(raiz, 'respaldos');
  crearBase(archivo);
  assert.deepEqual(pendientesDe(archivo, NOMBRES), NOMBRES);
  assert.equal(respaldar({ base: archivo, carpeta, conservar: 2, nombres: NOMBRES }).hecho, true);
  assert.equal(respaldos(carpeta).length, 1);
});

test('respalda íntegra la base sin aplicarle las dos migraciones pendientes', (t) => {
  const raiz = temporal(t);
  const archivo = path.join(raiz, 'base.db');
  const carpeta = path.join(raiz, 'respaldos');
  crearBase(archivo, [NOMBRES[0]]);

  const resultado = respaldar({ base: archivo, carpeta, conservar: 3, nombres: NOMBRES });
  assert.equal(resultado.hecho, true);
  assert.equal(path.dirname(resultado.archivo), carpeta);
  assert.match(path.basename(resultado.archivo), /^antes-2026-10-segunda-.+\.db$/);
  assert.equal(fs.existsSync(resultado.archivo), true);

  const copia = new DatabaseSync(resultado.archivo, { readOnly: true });
  assert.equal(copia.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
  assert.equal(copia.prepare('SELECT valor FROM ejemplo').get().valor, 'dato que debe conservarse');
  assert.deepEqual(copia.prepare('SELECT nombre FROM migraciones ORDER BY nombre').all(), [
    { nombre: NOMBRES[0] },
  ]);
  copia.close();

  const original = new DatabaseSync(archivo, { readOnly: true });
  assert.deepEqual(original.prepare('SELECT nombre FROM migraciones ORDER BY nombre').all(), [
    { nombre: NOMBRES[0] },
  ]);
  original.close();
});

test('la rotación conserva solo los dos respaldos más nuevos y deja archivos ajenos', (t) => {
  const raiz = temporal(t);
  const archivo = path.join(raiz, 'base.db');
  const carpeta = path.join(raiz, 'respaldos');
  crearBase(archivo, []);
  fs.mkdirSync(carpeta);
  fs.writeFileSync(path.join(carpeta, 'notas.txt'), 'no borrar');

  const creados = [];
  for (let indice = 0; indice < 4; indice += 1) {
    const resultado = respaldar({ base: archivo, carpeta, conservar: 2, nombres: NOMBRES });
    creados.push(path.basename(resultado.archivo));
    const fecha = new Date(Date.now() + (indice * 1000));
    fs.utimesSync(resultado.archivo, fecha, fecha);
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
  }

  assert.deepEqual(respaldos(carpeta), creados.slice(-2).sort());
  assert.equal(fs.readFileSync(path.join(carpeta, 'notas.txt'), 'utf8'), 'no borrar');
});

test('una carpeta de destino imposible lanza sin dejar una base a medias', (t) => {
  const raiz = temporal(t);
  const archivo = path.join(raiz, 'base.db');
  const carpeta = path.join(raiz, 'no-es-carpeta');
  crearBase(archivo, []);
  fs.writeFileSync(carpeta, 'archivo regular');

  assert.throws(() => respaldar({ base: archivo, carpeta, conservar: 2, nombres: NOMBRES }));
  assert.equal(fs.readdirSync(raiz).some((nombre) => nombre.endsWith('.db') && nombre !== 'base.db'), false);
});

test('limpia los caracteres raros de una migración sin escapar de la carpeta', (t) => {
  const raiz = temporal(t);
  const archivo = path.join(raiz, 'base.db');
  const carpeta = path.join(raiz, 'respaldos');
  crearBase(archivo, []);

  const resultado = respaldar({
    base: archivo, carpeta, conservar: 2, nombres: ['2026-10-a b/c'],
  });
  assert.equal(path.dirname(resultado.archivo), carpeta);
  assert.match(path.basename(resultado.archivo), /^antes-2026-10-a_b_c-/);
  assert.equal(fs.existsSync(resultado.archivo), true);
});

test('el despliegue respalda después de fusionar y vuelve atrás antes de reiniciar si falla', () => {
  const texto = fs.readFileSync(path.join(__dirname, '..', 'deploy', 'desplegar-mercamaquinarias'), 'utf8');
  assert.equal(texto.includes('\r'), false);
  const fusion = texto.indexOf('git merge --ff-only');
  const respaldo = texto.indexOf('tools/respaldo-antes-de-migrar.js');
  const reinicio = texto.indexOf('systemctl restart');
  assert.ok(fusion >= 0 && respaldo > fusion && reinicio > respaldo);
  assert.match(texto, /MERCA_DB=\/var\/lib\/mercamaquinarias\/mercamaquinarias\.db/);
  assert.match(texto, /MERCA_RESPALDOS=\/var\/backups\/mercamaquinarias/);

  const fallo = texto.slice(respaldo, reinicio);
  const vueltaAtras = fallo.indexOf('git reset --hard "$ANTES"');
  const salida = fallo.indexOf('exit 1');
  assert.ok(vueltaAtras >= 0 && salida > vueltaAtras);
  assert.equal(fallo.slice(vueltaAtras, salida).includes('systemctl restart'), false);
});

test('el proceso informa el respaldo íntegro y devuelve error si el destino es imposible', (t) => {
  const raiz = temporal(t);
  const archivo = path.join(raiz, 'base.db');
  const carpeta = path.join(raiz, 'respaldos');
  crearBase(archivo, []);
  const script = path.join(__dirname, 'respaldo-antes-de-migrar.js');

  const correcto = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, MERCA_DB: archivo, MERCA_RESPALDOS: carpeta },
  });
  assert.equal(correcto.status, 0, correcto.stderr);
  assert.match(correcto.stdout, /íntegro/i);

  const imposible = path.join(raiz, 'archivo-regular');
  fs.writeFileSync(imposible, 'no es carpeta');
  const fallido = spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, MERCA_DB: archivo, MERCA_RESPALDOS: imposible },
  });
  assert.equal(fallido.status, 1, fallido.stdout + fallido.stderr);
  assert.match(fallido.stderr, /ERROR/);
});
