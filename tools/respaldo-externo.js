/**
 * Cifra el respaldo antes de sacarlo del VPS. Los PDF no viajan: pueden
 * regenerarse desde facturas.dibujo y duplicarlos aumentaría la exposición.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');

const s3 = require('./s3');

const MAGICO = Buffer.from('MMRESP01');
const LARGO_IV = 12;
const LARGO_ETIQUETA = 16;

function clave(claveHex) {
  if (!/^[0-9a-fA-F]{64}$/.test(claveHex || '')) {
    throw new Error('MERCA_RESPALDO_CLAVE debe contener exactamente 64 caracteres hexadecimales');
  }
  return Buffer.from(claveHex, 'hex');
}

async function cifrar(origen, destino, claveHex) {
  const iv = crypto.randomBytes(LARGO_IV);
  const cifrador = crypto.createCipheriv('aes-256-gcm', clave(claveHex), iv);
  const salida = fs.createWriteStream(destino);
  salida.write(MAGICO);
  salida.write(iv);
  try {
    await pipeline(fs.createReadStream(origen), cifrador, salida, { end: false });
    await new Promise((resolve, reject) => {
      salida.end(cifrador.getAuthTag(), (error) => error ? reject(error) : resolve());
    });
  } catch (error) {
    salida.destroy();
    await fs.promises.rm(destino, { force: true });
    throw error;
  }
}

async function descifrar(origen, destino, claveHex) {
  let descriptor;
  try {
    descriptor = await fs.promises.open(origen, 'r');
    const { size } = await descriptor.stat();
    if (size < MAGICO.length + LARGO_IV + LARGO_ETIQUETA) {
      throw new Error('el respaldo cifrado está incompleto');
    }
    const cabecera = Buffer.alloc(MAGICO.length + LARGO_IV);
    const etiqueta = Buffer.alloc(LARGO_ETIQUETA);
    await descriptor.read(cabecera, 0, cabecera.length, 0);
    await descriptor.read(etiqueta, 0, etiqueta.length, size - LARGO_ETIQUETA);
    if (!cabecera.subarray(0, MAGICO.length).equals(MAGICO)) {
      throw new Error('el archivo no tiene el formato MMRESP01');
    }
    const descifrador = crypto.createDecipheriv(
      'aes-256-gcm', clave(claveHex), cabecera.subarray(MAGICO.length));
    descifrador.setAuthTag(etiqueta);
    await descriptor.close();
    descriptor = null;
    await pipeline(
      fs.createReadStream(origen, { start: cabecera.length, end: size - LARGO_ETIQUETA - 1 }),
      descifrador,
      fs.createWriteStream(destino));
  } catch (error) {
    if (descriptor) await descriptor.close();
    await fs.promises.rm(destino, { force: true });
    throw error;
  }
}

function claveRemota(archivoDb, fecha = new Date()) {
  const ano = String(fecha.getUTCFullYear());
  const mes = String(fecha.getUTCMonth() + 1).padStart(2, '0');
  return `respaldos/${ano}/${mes}/${path.basename(archivoDb)}.cifrado`;
}

async function subirRespaldo(archivoDb, { env = process.env } = {}) {
  if (!s3.configurada(env)) {
    return { omitido: true, motivo: 'almacenamiento S3 no configurado' };
  }
  if (!/^[0-9a-fA-F]{64}$/.test(env.MERCA_RESPALDO_CLAVE || '')) {
    return { omitido: true, motivo: 'MERCA_RESPALDO_CLAVE falta o no tiene 64 caracteres hexadecimales' };
  }

  const temporal = `${archivoDb}.${crypto.randomBytes(8).toString('hex')}.cifrado`;
  const claveObjeto = claveRemota(archivoDb);
  try {
    await cifrar(archivoDb, temporal, env.MERCA_RESPALDO_CLAVE);
    const bytes = (await fs.promises.stat(temporal)).size;
    const resultado = await s3.subir({
      endpoint: env.MERCA_S3_ENDPOINT,
      cubo: env.MERCA_S3_CUBO,
      clave: claveObjeto,
      archivo: temporal,
      credenciales: { clave: env.MERCA_S3_CLAVE, secreto: env.MERCA_S3_SECRETO },
      region: env.MERCA_S3_REGION,
    });
    if (!resultado.ok) throw new Error(resultado.error || 'no se pudo subir el respaldo externo');
    return { ok: true, clave: claveObjeto, bytes };
  } finally {
    await fs.promises.rm(temporal, { force: true });
  }
}

async function principal() {
  const [, , orden, entrada, salida] = process.argv;
  if (orden !== 'descifrar' || !entrada || !salida) {
    throw new Error('uso: node tools/respaldo-externo.js descifrar <entrada.cifrado> <salida.db>');
  }
  await descifrar(entrada, salida, process.env.MERCA_RESPALDO_CLAVE);
  const { DatabaseSync } = require('node:sqlite');
  const base = new DatabaseSync(salida, { readOnly: true });
  try {
    const integridad = Object.values(base.prepare('PRAGMA integrity_check').get())[0];
    const anuncios = base.prepare('SELECT COUNT(*) AS n FROM anuncios').get().n;
    console.log(`integrity_check: ${integridad} · ${anuncios} anuncio(s)`);
    if (integridad !== 'ok') process.exitCode = 1;
  } finally {
    base.close();
  }
}

if (require.main === module) {
  principal().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { cifrar, descifrar, subirRespaldo, claveRemota };
