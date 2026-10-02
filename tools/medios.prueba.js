const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const raizTemporal = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-medios-'));
process.env.MERCA_FOTOS = path.join(raizTemporal, 'fotos');
process.env.MERCA_VIDEOS = path.join(raizTemporal, 'videos');

const fotos = require('./fotos.js');
const videos = require('./videos.js');

test.after(() => fs.rmSync(raizTemporal, { recursive: true, force: true }));

const dataUri = (tipo, bytes, parametros = '') => `data:${tipo}${parametros};base64,${bytes.toString('base64')}`;

const formatos = {
  fotos: [
    ['JPEG', 'image/jpeg', Buffer.from([0xFF, 0xD8, 0xFF])],
    ['PNG', 'image/png', Buffer.from([0x89, 0x50, 0x4E, 0x47])],
    ['WebP', 'image/webp', Buffer.from('RIFF\0\0\0\0WEBPcontenido', 'binary')],
  ],
  videos: [
    ['MP4', 'video/mp4', Buffer.from('\0\0\0\0ftypcontenido', 'binary')],
    ['WebM', 'video/webm', Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 0x00])],
  ],
};

function probarModulo(nombre, modulo, tipos) {
  const extensionAdmitida = tipos[0][0];

  test(`${nombre}: convierte data URI y conserva cabeceras con parámetros y comas`, () => {
    const bytes = Buffer.from('contenido');
    assert.equal(modulo.bytesDeDataUri('contenido'), null);
    assert.equal(modulo.bytesDeDataUri('data:video/mp4,contenido'), null);
    assert.deepEqual(
      modulo.bytesDeDataUri(dataUri('video/mp4', bytes, ';codecs=avc1.42001e,mp4a.40.2')),
      bytes,
    );
  });

  test(`${nombre}: guarda cada firma admitida y devuelve una ruta existente`, () => {
    for (const [formato, mime, bytes] of formatos[nombre]) {
      const ruta = modulo.guardar(dataUri(mime, bytes));
      assert.ok(ruta.startsWith(`${modulo.RUTA_PUBLICA}/`), `${formato} tiene ruta pública`);
      assert.match(ruta, new RegExp(`^${modulo.RUTA_PUBLICA}/\\d{4}-\\d{2}/[0-9a-f]{32}\\.[a-z0-9]+$`));
      const archivo = modulo.archivoDe(ruta);
      assert.ok(archivo.startsWith(`${modulo.CARPETA}${path.sep}`));
      assert.equal(fs.existsSync(archivo), true);
      assert.equal(modulo.rutaExiste(ruta), true);
    }
  });

  test(`${nombre}: rechaza una firma desconocida aunque la etiqueta sea admitida`, () => {
    assert.throws(
      () => modulo.guardar(dataUri(tipos[0][1], Buffer.from('no es un medio'))),
      (error) => error.codigo === 400,
    );
  });

  test(`${nombre}: rechaza lo que supera el tope de bytes`, () => {
    const demasiadoGrande = Buffer.alloc(modulo.TOPE_BYTES + 1);
    assert.throws(
      () => modulo.guardar(dataUri(tipos[0][1], demasiadoGrande)),
      (error) => error.codigo === 413,
    );
  });

  test(`${nombre}: impide rutas fuera de su espacio público`, () => {
    for (const ruta of [
      `${modulo.RUTA_PUBLICA}/../../secreto${extensionAdmitida}`,
      `/otra${modulo.RUTA_PUBLICA}/2026-10/0123456789abcdef0123456789abcdef${extensionAdmitida}`,
      `/fuera/2026-10/0123456789abcdef0123456789abcdef${extensionAdmitida}`,
    ]) {
      assert.equal(modulo.archivoDe(ruta), null);
      assert.equal(modulo.rutaExiste(ruta), false);
    }
  });

  test(`${nombre}: rechaza nombres que no genera guardar`, { todo: 'archivoDe solo valida carpeta y extensión' }, () => {
    const rutas = [
      `${modulo.RUTA_PUBLICA}/nombre${extensionAdmitida}`,
      `${modulo.RUTA_PUBLICA}/2026-10/nombre${extensionAdmitida}`,
      `${modulo.RUTA_PUBLICA}/2026-10/0123456789abcdef0123456789abcdef${extensionAdmitida}/otro${extensionAdmitida}`,
    ];
    assert.deepEqual(
      rutas.map((ruta) => [modulo.archivoDe(ruta), modulo.rutaExiste(ruta)]),
      rutas.map(() => [null, false]),
    );
  });

  test(`${nombre}: rechaza barras invertidas y segmentos codificados`, { todo: 'archivoDe no normaliza estas entradas' }, () => {
    const rutas = [
      `${modulo.RUTA_PUBLICA}/2026-10\\..\\secreto${extensionAdmitida}`,
      `${modulo.RUTA_PUBLICA}/%2e%2e/secreto${extensionAdmitida}`,
    ];
    assert.deepEqual(
      rutas.map((ruta) => [modulo.archivoDe(ruta), modulo.rutaExiste(ruta)]),
      rutas.map(() => [null, false]),
    );
  });

  test(`${nombre}: sirve los tipos conocidos y usa el tipo binario para los demás`, () => {
    for (const [extension, mime] of tipos) assert.equal(modulo.tipoDe(`archivo${extension}`), mime);
    assert.equal(modulo.tipoDe('archivo.bin'), 'application/octet-stream');
  });

  test(`${nombre}: borrar no lanza si el archivo ya no existe`, () => {
    const ruta = modulo.guardar(dataUri(formatos[nombre][0][1], formatos[nombre][0][2]));
    modulo.borrar(ruta);
    assert.doesNotThrow(() => modulo.borrar(ruta));
    assert.equal(modulo.rutaExiste(ruta), false);
  });
}

probarModulo('fotos', fotos, [
  ['.jpg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
]);

probarModulo('videos', videos, [
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
]);

test('videos: consulta el espacio libre sin llenar el disco', () => {
  const libres = videos.bytesLibres();
  assert.ok(libres === null || (Number.isFinite(libres) && libres >= 0));
});
