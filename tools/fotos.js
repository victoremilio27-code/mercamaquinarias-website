/**
 * fotos.js — almacenamiento de las fotografías de los anuncios.
 *
 * POR QUÉ EXISTE ESTE MÓDULO
 *
 * Antes las fotos se guardaban como `data:` URI dentro de la base y
 * viajaban incrustadas en el JSON del catálogo. Medido con el mismo
 * código de publicar.js sobre una foto de 4000×3000:
 *
 *   una foto ya reducida a 1600 px …… 523 KB de JPEG
 *   la misma en base64 ……………………… 697 KB   (+33 %)
 *   una página de catálogo (24) ………… 16,3 MB
 *   1.000 anuncios × 8 fotos ………………  5,3 GB en la base
 *
 * Y ninguna se podía cachear: al ir dentro de la respuesta JSON, el
 * navegador las volvía a descargar en cada visita.
 *
 * Ahora se escriben en disco y la base guarda solo la ruta. El
 * navegador las pide como archivos normales, con caché de un año, y el
 * JSON del catálogo baja a unos pocos KB.
 *
 * DOS TAMAÑOS
 *
 * El catálogo pinta tarjetas de unos 400 px: mandarle una imagen de
 * 1600 es tirar el 90 % de los bytes. Por eso se guardan dos, y cada
 * pantalla pide la que necesita.
 *
 *   miniatura  900 px  — tarjetas del catálogo y del directorio
 *   completa  1600 px  — ficha del equipo y galería
 *
 * NOMBRES ALEATORIOS
 *
 * El nombre no lo elige quien sube: se genera aquí. Aceptar el nombre
 * del archivo es el camino más corto a que alguien escriba fuera de la
 * carpeta con «../» o suba algo que el servidor luego interprete.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..');

/* En el VPS conviene sacarlas del proyecto para que un `git pull` no
   las toque y para poder respaldarlas aparte. */
const CARPETA = process.env.MERCA_FOTOS || path.join(RAIZ, '.tmp', 'fotos');

/* Ruta pública. Es la que acaba en la base y en el HTML. */
const RUTA_PUBLICA = '/fotos';

/* Tope por imagen ya reducida. El navegador manda ~500 KB en el peor
   caso; 3 MB deja margen de sobra sin dejar la puerta abierta. */
const TOPE_BYTES = 3 * 1024 * 1024;

/* Tipos admitidos, con su firma binaria. NO se mira el `Content-Type`
   ni la extensión: los dos los pone quien sube y los dos se falsean en
   un segundo. Lo que manda son los primeros bytes del archivo. */
const FIRMAS = [
  { ext: 'jpg', mime: 'image/jpeg', prueba: (b) => b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF },
  { ext: 'png', mime: 'image/png', prueba: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 },
  {
    ext: 'webp',
    mime: 'image/webp',
    prueba: (b) => b.length > 12
      && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
  },
];

const TIPOS_SERVIDOS = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

/* Convierte un data URI en bytes. Devuelve null si no lo es: quien
   llama decide, aquí no se lanza por una entrada mal formada.

   Se busca `;base64,` y se toma lo de después. Lo de delante no se
   mira: el tipo lo decide la firma binaria, no la etiqueta. Antes había
   aquí una expresión regular que exigía un tipo MIME sin parámetros;
   parecía más estricta y solo servía para rechazar entradas válidas.
   Con las fotos nunca saltó —el canvas genera `data:image/webp;base64,`
   a secas— pero con los videos rechazaba absolutamente todos. Mismo
   código, mismo fallo latente; se arregla en los dos a la vez. */
const MARCA_BASE64 = ';base64,';

function bytesDeDataUri(cadena) {
  const texto = String(cadena || '');
  if (!texto.startsWith('data:')) return null;

  const corte = texto.indexOf(MARCA_BASE64);
  if (corte < 0) return null;

  try {
    return Buffer.from(texto.slice(corte + MARCA_BASE64.length), 'base64');
  } catch {
    return null;
  }
}

/* Guarda una imagen y devuelve su ruta pública.
   Lanza con `.codigo` para que la API responda 400 y no 500. */
function guardar(dataUri) {
  const bytes = bytesDeDataUri(dataUri);
  if (!bytes) throw Object.assign(new Error('La imagen no llegó en el formato esperado'), { codigo: 400 });

  if (bytes.length > TOPE_BYTES) {
    throw Object.assign(new Error('La imagen pesa demasiado'), { codigo: 413 });
  }

  const firma = FIRMAS.find((f) => f.prueba(bytes));
  if (!firma) {
    throw Object.assign(new Error('Solo se admiten imágenes JPG, PNG o WebP'), { codigo: 400 });
  }

  // Repartidas en subcarpetas por mes: un directorio con cien mil
  // archivos es lento de listar y molesto de respaldar.
  const mes = new Date().toISOString().slice(0, 7);
  const destino = path.join(CARPETA, mes);
  fs.mkdirSync(destino, { recursive: true });

  const nombre = `${crypto.randomBytes(16).toString('hex')}.${firma.ext}`;
  fs.writeFileSync(path.join(destino, nombre), bytes);

  return `${RUTA_PUBLICA}/${mes}/${nombre}`;
}

/* Resuelve una ruta pública a un archivo real, o null si no lo es. Es
   la comprobación que impide que «/fotos/../../.env» devuelva lo que
   no debe.

   EXIGE el prefijo /fotos. Antes solo lo quitaba si estaba, y lo que
   no lo llevara se trataba como ruta relativa: «https://otro.com/x.jpg»
   resolvía dentro de la carpeta y la función respondía que sí. Para
   servir archivos daba igual —ese archivo no existe—, pero en cuanto
   se usó para validar de dónde sale una imagen, una URL de un tercero
   pasaba el filtro. */
function archivoDe(rutaPublica) {
  const cruda = String(rutaPublica || '');
  if (!cruda.startsWith(`${RUTA_PUBLICA}/`)) return null;

  const relativa = cruda.slice(RUTA_PUBLICA.length + 1);
  /* Solo se aceptan nombres que pudo producir guardar. La validación
     explícita evita que una normalización posterior convierta barras,
     segmentos codificados o controles en una ruta distinta. */
  if (!relativa || /[\\%]|\.\.|[\x00-\x1F\x7F]/.test(relativa)) return null;
  if (!/^\d{4}-(?:0[1-9]|1[0-2])\/[0-9a-f]{32}\.(?:jpg|png|webp)$/.test(relativa)) return null;

  const completa = path.resolve(CARPETA, relativa);
  if (completa !== CARPETA && !completa.startsWith(CARPETA + path.sep)) return null;
  if (!TIPOS_SERVIDOS[path.extname(completa).toLowerCase()]) return null;

  return completa;
}

/* ¿Está el archivo en disco? La ruta pasa antes por archivoDe, que
   es quien impide salirse de la carpeta. Sirve para no ofrecer en la
   portada una fotografía cuyo archivo ya no existe. */
function rutaExiste(rutaPublica) {
  const archivo = archivoDe(rutaPublica);
  return !!archivo && fs.existsSync(archivo);
}

const tipoDe = (archivo) => TIPOS_SERVIDOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream';

/* Borra una foto. No lanza si ya no está: se llama al eliminar un
   anuncio y que falte el archivo no debe impedir borrar la fila. */
function borrar(rutaPublica) {
  const archivo = archivoDe(rutaPublica);
  if (archivo) fs.rmSync(archivo, { force: true });
}

module.exports = {
  guardar, archivoDe, rutaExiste, borrar, tipoDe, bytesDeDataUri,
  CARPETA, RUTA_PUBLICA, TOPE_BYTES,
};
