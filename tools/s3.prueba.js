const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { configurada, firmar, subir } = require('./s3');

const VACIO_SHA256 = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const CREDENCIALES = {
  clave: 'AKIAIOSFODNN7EXAMPLE',
  secreto: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
};

test('reproduce el vector oficial GET Object de AWS', () => {
  const cabeceras = firmar({
    metodo: 'GET',
    url: 'https://examplebucket.s3.amazonaws.com/test.txt',
    cabeceras: { Range: 'bytes=0-9' },
    cuerpoSha256: VACIO_SHA256,
    region: 'us-east-1',
    servicio: 's3',
    ...CREDENCIALES,
    fecha: new Date('2013-05-24T00:00:00Z'),
  });

  assert.equal(cabeceras.Authorization,
    'AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE/20130524/us-east-1/s3/aws4_request,' +
    'SignedHeaders=host;range;x-amz-content-sha256;x-amz-date,' +
    'Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41');
});

test('codifica espacios, tildes y segmentos una sola vez', () => {
  const comun = {
    metodo: 'GET',
    cabeceras: {},
    cuerpoSha256: VACIO_SHA256,
    region: 'us-east-1',
    servicio: 's3',
    ...CREDENCIALES,
    fecha: new Date('2013-05-24T00:00:00Z'),
  };
  const sinCodificar = firmar({ ...comun, url: 'https://example.com/carpeta/año nuevo.txt' });
  const codificada = firmar({ ...comun, url: 'https://example.com/carpeta/a%C3%B1o%20nuevo.txt' });

  assert.equal(sinCodificar.Authorization, codificada.Authorization);
  assert.match(codificada.Authorization,
    /Signature=bf9c5a05292fd28d23a731e46f49d123025f6af328752ed8155e01c819dea05d$/);
});

test('sube por streaming y devuelve los errores HTTP sin revelar el secreto', async (t) => {
  const temporal = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'merca-s3-'));
  const archivo = path.join(temporal, 'respaldo.db');
  const contenido = Buffer.from('bytes exactos del respaldo');
  await fs.promises.writeFile(archivo, contenido);
  t.after(() => fs.promises.rm(temporal, { recursive: true, force: true }));

  let estado = 200;
  const recibidas = [];
  const servidor = http.createServer((peticion, respuesta) => {
    const bloques = [];
    peticion.on('data', (bloque) => bloques.push(bloque));
    peticion.on('end', () => {
      recibidas.push({ peticion, cuerpo: Buffer.concat(bloques) });
      if (estado === 403) {
        respuesta.writeHead(403);
        respuesta.end(`denegado: ${CREDENCIALES.secreto}`);
      } else {
        respuesta.writeHead(200, { ETag: '"abc123"' });
        respuesta.end();
      }
    });
  });
  await new Promise((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => servidor.close(resolve)));
  const endpoint = `http://127.0.0.1:${servidor.address().port}`;
  const opciones = {
    endpoint,
    cubo: 'copias',
    clave: 'diarias/octubre 2.db',
    archivo,
    credenciales: CREDENCIALES,
    region: 'us-east-1',
  };

  assert.deepEqual(await subir(opciones), { ok: true, etag: '"abc123"' });
  assert.equal(recibidas[0].peticion.method, 'PUT');
  assert.equal(recibidas[0].peticion.url, '/copias/diarias/octubre%202.db');
  assert.equal(Number(recibidas[0].peticion.headers['content-length']), contenido.length);
  assert.match(recibidas[0].peticion.headers.authorization, /^AWS4-HMAC-SHA256 /);
  assert.deepEqual(recibidas[0].cuerpo, contenido);

  estado = 403;
  const error = await subir(opciones);
  assert.equal(error.ok, false);
  assert.equal(error.estado, 403);
  assert.doesNotMatch(error.error, new RegExp(CREDENCIALES.secreto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('solo está configurada con las cuatro variables obligatorias', () => {
  assert.equal(configurada({}), false);
  assert.equal(configurada({
    MERCA_S3_ENDPOINT: 'espacio.example.com',
    MERCA_S3_CUBO: 'copias',
    MERCA_S3_CLAVE: 'clave',
    MERCA_S3_SECRETO: 'secreto',
  }), true);
  assert.equal(configurada({
    MERCA_S3_ENDPOINT: 'espacio.example.com',
    MERCA_S3_CUBO: 'copias',
    MERCA_S3_CLAVE: 'clave',
    MERCA_S3_SECRETO: '',
    MERCA_S3_REGION: 'nyc3',
  }), false);
});
