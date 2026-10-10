const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { limpiar } = require('./imagen-limpia');

function segmentoJpeg(marcador, datos) {
  const cabecera = Buffer.alloc(4);
  cabecera[0] = 0xFF;
  cabecera[1] = marcador;
  cabecera.writeUInt16BE(datos.length + 2, 2);
  return Buffer.concat([cabecera, datos]);
}

const tablaCrc = Array.from({ length: 256 }, (_, numero) => {
  let crc = numero;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) ? (0xEDB88320 ^ (crc >>> 1)) : (crc >>> 1);
  return crc >>> 0;
});

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = tablaCrc[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function fragmentoPng(tipo, datos) {
  const nombre = Buffer.from(tipo, 'ascii');
  const salida = Buffer.alloc(12 + datos.length);
  salida.writeUInt32BE(datos.length, 0);
  nombre.copy(salida, 4);
  datos.copy(salida, 8);
  salida.writeUInt32BE(crc32(Buffer.concat([nombre, datos])), 8 + datos.length);
  return salida;
}

const firmaPng = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function fragmentoWebp(tipo, datos) {
  const cabecera = Buffer.alloc(8);
  cabecera.write(tipo, 0, 'ascii');
  cabecera.writeUInt32LE(datos.length, 4);
  return Buffer.concat([cabecera, datos, datos.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
}

function webp(fragmentos) {
  const cuerpo = Buffer.concat([Buffer.from('WEBP'), ...fragmentos]);
  const cabecera = Buffer.alloc(8);
  cabecera.write('RIFF', 0, 'ascii');
  cabecera.writeUInt32LE(cuerpo.length, 4);
  return Buffer.concat([cabecera, cuerpo]);
}

const app0 = segmentoJpeg(0xE0, Buffer.from('JFIF'));
const app1 = segmentoJpeg(0xE1, Buffer.from('Exif\0\0GPS casa'));
const app2 = segmentoJpeg(0xE2, Buffer.from('ICC_PROFILE'));
const app14 = segmentoJpeg(0xEE, Buffer.from('Adobe'));
const dqt = segmentoJpeg(0xDB, Buffer.from([0]));
const sof0 = segmentoJpeg(0xC0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
const dht = segmentoJpeg(0xC4, Buffer.from([0]));
const sosYDatos = Buffer.concat([segmentoJpeg(0xDA, Buffer.from([1, 2, 3, 4])), Buffer.from([5, 0xFF, 0, 6, 0xFF, 0xD9])]);
const jpegConExif = Buffer.concat([
  Buffer.from([0xFF, 0xD8]), app0, app1, app2, app14, dqt, sof0, dht, sosYDatos,
]);

test('JPEG rechaza marcadores nulos, longitudes imposibles y SOS sin SOF', () => {
  assert.doesNotThrow(() => limpiar(Buffer.from([0xFF, 0xD8, 0xFF, 0x00])));
  assert.equal(limpiar(Buffer.from([0xFF, 0xD8, 0xFF, 0x00])), null);

  const longitudImposible = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0xFF, 0xFF]);
  assert.doesNotThrow(() => limpiar(longitudImposible));
  assert.equal(limpiar(longitudImposible), null);

  const sinImagen = Buffer.concat([
    Buffer.from([0xFF, 0xD8]), segmentoJpeg(0xDA, Buffer.alloc(0)), Buffer.from('<html><script>'),
  ]);
  assert.equal(limpiar(sinImagen), null);
});

test('JPEG mínimo con SOF antes de SOS sigue pasando', () => {
  const minimo = Buffer.concat([
    Buffer.from([0xFF, 0xD8]), app0, dqt, sof0, dht, sosYDatos,
  ]);
  assert.deepEqual(limpiar(minimo), minimo);
});

test('JPEG quita metadatos sin alterar perfiles ni datos comprimidos', () => {
  const salida = limpiar(jpegConExif);
  assert.ok(Buffer.isBuffer(salida));
  assert.equal(salida.includes(Buffer.from('GPS')), false);
  for (const conservado of [app0, app2, app14]) assert.equal(salida.includes(conservado), true);
  assert.deepEqual(salida.subarray(salida.indexOf(Buffer.from([0xFF, 0xDA]))), sosYDatos);
});

test('PNG quita fragmentos de metadatos y conserva fragmentos con CRC válido', () => {
  const ihdr = fragmentoPng('IHDR', Buffer.alloc(13));
  const texto = fragmentoPng('tEXt', Buffer.from('GPS=patio'));
  const exif = fragmentoPng('eXIf', Buffer.from('Exif GPS'));
  const idat = fragmentoPng('IDAT', Buffer.from([1, 2, 3]));
  const iend = fragmentoPng('IEND', Buffer.alloc(0));
  const salida = limpiar(Buffer.concat([firmaPng, ihdr, texto, exif, idat, iend]));
  assert.equal(salida.includes(Buffer.from('GPS')), false);
  assert.deepEqual(salida, Buffer.concat([firmaPng, ihdr, idat, iend]));

  let posicion = 8;
  while (posicion < salida.length) {
    const longitud = salida.readUInt32BE(posicion);
    const datos = salida.subarray(posicion + 4, posicion + 8 + longitud);
    assert.equal(salida.readUInt32BE(posicion + 8 + longitud), crc32(datos));
    posicion += 12 + longitud;
  }
});

test('WebP quita EXIF y XMP, apaga sus banderas y corrige RIFF', () => {
  const vp8x = fragmentoWebp('VP8X', Buffer.from([0x0C, 0, 0, 0, 0, 0, 0, 0, 0, 0]));
  const pixeles = fragmentoWebp('VP8 ', Buffer.from([1, 2, 3]));
  const salida = limpiar(webp([
    vp8x,
    fragmentoWebp('EXIF', Buffer.from('GPS')),
    fragmentoWebp('XMP ', Buffer.from('texto')),
    pixeles,
  ]));
  assert.equal(salida.includes(Buffer.from('EXIF')), false);
  assert.equal(salida.includes(Buffer.from('XMP ')), false);
  assert.equal(salida[20] & 0x0C, 0);
  assert.equal(salida.readUInt32LE(4), salida.length - 8);
  assert.deepEqual(salida.subarray(12 + vp8x.length), pixeles);
});

test('una imagen sin metadatos conserva exactamente sus bytes', () => {
  const png = Buffer.concat([
    firmaPng,
    fragmentoPng('IHDR', Buffer.alloc(13)),
    fragmentoPng('IDAT', Buffer.from([8, 9])),
    fragmentoPng('IEND', Buffer.alloc(0)),
  ]);
  assert.equal(limpiar(png).equals(png), true);
});

test('rechaza imágenes truncadas a mitad de segmento o fragmento', () => {
  assert.equal(limpiar(jpegConExif.subarray(0, 9)), null);
  const pngTruncado = Buffer.concat([firmaPng, fragmentoPng('tEXt', Buffer.from('dato')).subarray(0, 10)]);
  assert.equal(limpiar(pngTruncado), null);
  const webpTruncado = webp([fragmentoWebp('EXIF', Buffer.from('dato'))]);
  webpTruncado.writeUInt32LE(webpTruncado.length - 9, 4);
  assert.equal(limpiar(webpTruncado.subarray(0, -1)), null);
});

test('PDF queda intacto y con la misma referencia', () => {
  const pdf = Buffer.from('%PDF-1.7\n/Author (alguien)');
  assert.equal(limpiar(pdf), pdf);
});

test('fotos.guardar y documentos.guardar escriben la imagen ya limpia', () => {
  const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-imagen-limpia-'));
  process.env.MERCA_FOTOS = path.join(temporal, 'fotos');
  process.env.MERCA_DOCUMENTOS = path.join(temporal, 'documentos');
  const fotos = require('./fotos');
  const documentos = require('./documentos');

  const rutaFoto = fotos.guardar(`data:image/jpeg;base64,${jpegConExif.toString('base64')}`);
  const fotoGuardada = fs.readFileSync(fotos.archivoDe(rutaFoto));
  assert.equal(fotoGuardada.includes(Buffer.from('Exif')), false);

  const documento = documentos.guardar(jpegConExif);
  const documentoGuardado = fs.readFileSync(path.join(documentos.CARPETA, documento.ruta));
  assert.equal(documentoGuardado.includes(Buffer.from('Exif')), false);
  assert.equal(documento.bytes, documentoGuardado.length);
  fs.rmSync(temporal, { recursive: true, force: true });
});
