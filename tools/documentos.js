/**
 * documentos.js — almacenamiento de los documentos adjuntos a anuncios.
 *
 * El nombre y la extensión los decide el servidor después de reconocer
 * la firma binaria. La ruta que se guarda en la base siempre es relativa
 * a CARPETA para que mover el directorio no invalide las filas existentes.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { limpiar } = require('./imagen-limpia');

const RAIZ = path.resolve(__dirname, '..');
const CARPETA = path.resolve(process.env.MERCA_DOCUMENTOS || path.join(RAIZ, '.tmp', 'documentos'));

const FIRMAS = [
  { mime: 'application/pdf', ext: 'pdf', prueba: (b) => b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-' },
  { mime: 'image/jpeg', ext: 'jpg', prueba: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { mime: 'image/png', ext: 'png', prueba: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  {
    mime: 'image/webp', ext: 'webp',
    prueba: (b) => b.length >= 12
      && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

function tipoDe(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  const firma = FIRMAS.find((f) => f.prueba(buffer));
  return firma ? { mime: firma.mime, ext: firma.ext } : null;
}

function guardar(buffer) {
  const tipo = tipoDe(buffer);
  if (!tipo) throw new Error('El tipo de documento no está admitido');
  const bufferLimpio = limpiar(buffer);
  if (!bufferLimpio) throw new Error('El tipo de documento no está admitido');

  const mes = new Date().toISOString().slice(0, 7);
  const destino = path.join(CARPETA, mes);
  fs.mkdirSync(destino, { recursive: true });
  const nombre = `${crypto.randomUUID()}.${tipo.ext}`;
  fs.writeFileSync(path.join(destino, nombre), bufferLimpio);

  return { ruta: `${mes}/${nombre}`, tipo: tipo.mime, bytes: bufferLimpio.length };
}

function archivoDe(ruta) {
  const relativa = String(ruta || '');
  /* Un documento válido siempre conserva el nombre UUID v4 que creó
     guardar. Se rechazan los caracteres ambiguos antes de resolver. */
  if (!relativa || path.isAbsolute(relativa)
    || /[\\%]|\.\.|[\x00-\x1F\x7F]/.test(relativa)
    || !/^\d{4}-(?:0[1-9]|1[0-2])\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:pdf|jpg|png|webp)$/.test(relativa)) return null;
  const completa = path.resolve(CARPETA, relativa);
  if (!completa.startsWith(CARPETA + path.sep) || !fs.existsSync(completa)) return null;

  /* existsSync no basta si alguien sustituyera una subcarpeta por un
     enlace simbólico: realpath confirma que el archivo sigue dentro. */
  const real = fs.realpathSync(completa);
  let raizReal;
  try { raizReal = fs.realpathSync(CARPETA); } catch (_) { return null; }
  return real.startsWith(raizReal + path.sep) ? completa : null;
}

function borrar(ruta) {
  const archivo = archivoDe(ruta);
  if (archivo) fs.rmSync(archivo, { force: true });
}

module.exports = { tipoDe, guardar, archivoDe, borrar, CARPETA };
