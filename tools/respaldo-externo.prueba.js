const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');

const { cifrar, descifrar, subirRespaldo } = require('./respaldo-externo');

const CLAVE = crypto.randomBytes(32).toString('hex');

async function carpetaTemporal(t) {
  const carpeta = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'merca-respaldo-'));
  t.after(() => fs.promises.rm(carpeta, { recursive: true, force: true }));
  return carpeta;
}

test('cifra y descifra por flujos un archivo de 1 MB', async (t) => {
  const carpeta = await carpetaTemporal(t);
  const origen = path.join(carpeta, 'origen.db');
  const cifrado = path.join(carpeta, 'origen.db.cifrado');
  const salida = path.join(carpeta, 'salida.db');
  const contenido = crypto.randomBytes(1024 * 1024);
  await fs.promises.writeFile(origen, contenido);

  await cifrar(origen, cifrado, CLAVE);
  await descifrar(cifrado, salida, CLAVE);
  assert.deepEqual(await fs.promises.readFile(salida), contenido);
  assert.equal((await fs.promises.readFile(cifrado)).subarray(0, 8).toString(), 'MMRESP01');
});

test('rechaza clave equivocada, alteración y mágico distinto sin dejar salida', async (t) => {
  const carpeta = await carpetaTemporal(t);
  const origen = path.join(carpeta, 'origen.db');
  const cifrado = path.join(carpeta, 'origen.cifrado');
  await fs.promises.writeFile(origen, crypto.randomBytes(4096));
  await cifrar(origen, cifrado, CLAVE);

  const casos = [
    async () => descifrar(cifrado, path.join(carpeta, 'clave.db'), crypto.randomBytes(32).toString('hex')),
    async () => {
      const cambiado = path.join(carpeta, 'cambiado.cifrado');
      const bytes = await fs.promises.readFile(cifrado);
      bytes[100] ^= 1;
      await fs.promises.writeFile(cambiado, bytes);
      return descifrar(cambiado, path.join(carpeta, 'cambiado.db'), CLAVE);
    },
    async () => {
      const invalido = path.join(carpeta, 'invalido.cifrado');
      const bytes = await fs.promises.readFile(cifrado);
      bytes[0] ^= 1;
      await fs.promises.writeFile(invalido, bytes);
      return descifrar(invalido, path.join(carpeta, 'invalido.db'), CLAVE);
    },
  ];
  const salidas = ['clave.db', 'cambiado.db', 'invalido.db'];
  for (let i = 0; i < casos.length; i++) {
    await assert.rejects(casos[i]);
    assert.equal(fs.existsSync(path.join(carpeta, salidas[i])), false);
  }
});

test('sube solamente el cifrado, usa la ruta fechada y elimina el temporal', async (t) => {
  const carpeta = await carpetaTemporal(t);
  const archivo = path.join(carpeta, 'mercamaquinarias-prueba.db');
  await fs.promises.writeFile(archivo, Buffer.from('SQLite format 3\0datos privados'));
  let peticiones = 0;
  let recibida;
  const servidor = http.createServer((peticion, respuesta) => {
    const bloques = [];
    peticion.on('data', (bloque) => bloques.push(bloque));
    peticion.on('end', () => {
      peticiones++;
      recibida = { url: peticion.url, cuerpo: Buffer.concat(bloques) };
      respuesta.writeHead(200);
      respuesta.end();
    });
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const env = {
    MERCA_S3_ENDPOINT: `http://127.0.0.1:${servidor.address().port}`,
    MERCA_S3_CUBO: 'copias',
    MERCA_S3_CLAVE: 'acceso',
    MERCA_S3_SECRETO: 'muy-secreto',
    MERCA_S3_REGION: 'region-prueba',
    MERCA_RESPALDO_CLAVE: CLAVE,
  };

  const resultado = await subirRespaldo(archivo, { env });
  assert.equal(resultado.ok, true);
  assert.match(resultado.clave, /^respaldos\/\d{4}\/\d{2}\/mercamaquinarias-prueba\.db\.cifrado$/);
  assert.equal(recibida.url, `/copias/${resultado.clave}`);
  assert.equal(recibida.cuerpo.includes(Buffer.from('SQLite format 3')), false);
  assert.equal(recibida.cuerpo.length, resultado.bytes);
  assert.equal(peticiones, 1);
  assert.deepEqual(await fs.promises.readdir(carpeta), ['mercamaquinarias-prueba.db']);

  const omitido = await subirRespaldo(archivo, { env: {} });
  assert.equal(omitido.omitido, true);
  assert.equal(peticiones, 1);
});

test('el error remoto no revela el secreto y elimina el temporal', async (t) => {
  const carpeta = await carpetaTemporal(t);
  const archivo = path.join(carpeta, 'respaldo.db');
  await fs.promises.writeFile(archivo, 'datos');
  const secreto = 'SECRETO-QUE-NO-DEBE-SALIR';
  const servidor = http.createServer((_peticion, respuesta) => {
    respuesta.writeHead(403);
    respuesta.end(`rechazado ${secreto}`);
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));

  await assert.rejects(subirRespaldo(archivo, { env: {
    MERCA_S3_ENDPOINT: `http://127.0.0.1:${servidor.address().port}`,
    MERCA_S3_CUBO: 'copias', MERCA_S3_CLAVE: 'acceso', MERCA_S3_SECRETO: secreto,
    MERCA_RESPALDO_CLAVE: CLAVE,
  } }), (error) => !error.message.includes(secreto));
  assert.deepEqual(await fs.promises.readdir(carpeta), ['respaldo.db']);
});

test('la orden descifrar verifica una base creada con VACUUM INTO', async (t) => {
  const carpeta = await carpetaTemporal(t);
  const original = path.join(carpeta, 'original.db');
  const respaldo = path.join(carpeta, 'respaldo.db');
  const cifrado = path.join(carpeta, 'respaldo.cifrado');
  const restaurada = path.join(carpeta, 'restaurada.db');
  const base = new DatabaseSync(original);
  base.exec("CREATE TABLE anuncios (id INTEGER PRIMARY KEY); INSERT INTO anuncios DEFAULT VALUES");
  base.exec(`VACUUM INTO '${respaldo.replaceAll("'", "''")}'`);
  base.close();
  await cifrar(respaldo, cifrado, CLAVE);

  const orden = spawnSync(process.execPath,
    [path.join(__dirname, 'respaldo-externo.js'), 'descifrar', cifrado, restaurada],
    { encoding: 'utf8', env: { ...process.env, MERCA_RESPALDO_CLAVE: CLAVE } });
  assert.equal(orden.status, 0, orden.stderr);
  assert.match(orden.stdout, /integrity_check: ok · 1 anuncio/);
});
