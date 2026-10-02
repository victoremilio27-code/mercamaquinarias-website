/**
 * videos.js — almacenamiento de los videos de los anuncios.
 *
 * Hermano de fotos.js y con las mismas reglas: los bytes van a disco,
 * la base guarda solo la ruta, el nombre lo elige el servidor y el tipo
 * se decide por los primeros bytes del archivo y no por lo que diga
 * quien sube.
 *
 * QUÉ CAMBIA RESPECTO A UNA FOTO
 *
 * El peso. Una foto ya reducida ronda los 500 KB; un video de 30 s a
 * 720p ronda los 6 MB, doce veces más. Con 3 GB libres en el disco del
 * VPS eso son unos 500 videos, así que aquí hay dos defensas que las
 * fotos no necesitan:
 *
 *   - un tope por archivo (TOPE_BYTES), y
 *   - un suelo de disco libre (MINIMO_LIBRE): por debajo de eso se
 *     rechaza la subida.
 *
 * El suelo importa más de lo que parece. Cuando a este servidor se le
 * acaba el disco no se cae con elegancia: SQLite deja de poder escribir
 * y se pierden publicaciones. Es preferible que un anuncio se quede sin
 * video a que el sitio deje de aceptar anuncios.
 *
 * POR QUÉ NO SE RECODIFICA AQUÍ
 *
 * Reducir a 720p se hace en el navegador, antes de subir. El VPS tiene
 * 512 MB de RAM y un solo núcleo: pasarle ffmpeg a un video de 60 MB
 * dejaría el sitio sin responder durante minutos, y con varios a la vez
 * lo tumbaría. Lo que llega aquí ya viene reducido; este módulo solo
 * comprueba y guarda.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RAIZ = path.resolve(__dirname, '..');

/* Fuera del proyecto, como las fotos: así un despliegue no las toca y
   se respaldan aparte. */
const CARPETA = process.env.MERCA_VIDEOS || path.join(RAIZ, '.tmp', 'videos');

const RUTA_PUBLICA = '/videos';

/* Tope por archivo. El navegador manda unos 6 MB para 30 s a 720p;
   16 MB deja margen de sobra para un video con mucho movimiento, donde
   el codificador gasta más.
 *
 * El número NO se puede subir a la ligera: el video viaja como data URL
 * dentro del JSON, y base64 engorda un 33 %. Con el tope de cuerpo de
 * la API en 25 MB (ver leerCuerpo en api.js), 16 MB se convierten en
 * unos 21,3 MB y caben; 20 MB se convertirían en 26,7 y el servidor
 * cortaría con «Cuerpo demasiado grande», un error que no dice nada de
 * lo que pasó. Si se sube este tope, hay que subir aquel primero. */
const TOPE_BYTES = 16 * 1024 * 1024;

/* Por debajo de esto no se aceptan videos nuevos. 500 MB es margen de
   sobra para que la base siga escribiendo y para que los respaldos
   quepan mientras se libera espacio. */
const MINIMO_LIBRE = 500 * 1024 * 1024;

/* Duración máxima, en segundos. Se comprueba en el navegador —aquí no
   se puede sin decodificar— pero el número vive aquí para que la
   interfaz y el servidor no se contradigan. */
const SEGUNDOS_MAXIMOS = 30;

/* Firmas binarias. Igual que en las fotos: ni el Content-Type ni la
   extensión, que los pone quien sube.

   MP4 y sus parientes llevan «ftyp» en los bytes 4 a 8. WebM es
   Matroska, que empieza por la cabecera EBML 1A 45 DF A3. */
const FIRMAS = [
  {
    ext: 'mp4',
    mime: 'video/mp4',
    prueba: (b) => b.length > 12 && b.toString('ascii', 4, 8) === 'ftyp',
  },
  {
    ext: 'webm',
    mime: 'video/webm',
    prueba: (b) => b.length > 4
      && b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3,
  },
];

const TIPOS_SERVIDOS = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/* Espacio libre en la partición donde viven los videos. Devuelve null
   si no se puede saber: en ese caso no se bloquea la subida, porque
   negarse por no poder medir sería peor que el riesgo que evita. */
function bytesLibres() {
  try {
    fs.mkdirSync(CARPETA, { recursive: true });
    const est = fs.statfsSync(CARPETA);
    return est.bavail * est.bsize;
  } catch {
    return null;
  }
}

/* Convierte un data URI en bytes. Devuelve null si no lo es.
 *
 * SE BUSCA `;base64,` Y SE TOMA LO QUE VENGA DESPUÉS. Lo de delante no
 * se mira: el tipo lo decide la firma binaria unas líneas más abajo, no
 * lo que diga quien sube.
 *
 * Aquí había una expresión regular, y rechazaba TODOS los videos. Lo
 * que manda el navegador es:
 *
 *   data:video/mp4;codecs=avc1.42001e,mp4a.40.2;base64,…
 *
 * Con DOS códecs separados por COMA. Cualquier intento de describir esa
 * cabecera con una expresión acaba tropezando: si se para en la primera
 * coma, corta por la mitad del parámetro; si no, hay que empezar a
 * contemplar comillas y parámetros que nadie usa. Y el precio de
 * equivocarse era un «El video no llegó en el formato esperado» que no
 * dice nada: el video estaba perfecto, lo que no encajaba era su
 * etiqueta.
 *
 * Buscar el separador y cortar ahí no tiene ese problema. El alfabeto
 * de base64 no incluye `;`, así que la primera aparición de `;base64,`
 * es siempre la de verdad y nunca una del contenido. */
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

/* Guarda un video y devuelve su ruta pública.
   Lanza con `.codigo` para que la API responda 4xx y no 500. */
function guardar(dataUri) {
  const bytes = bytesDeDataUri(dataUri);
  if (!bytes) throw Object.assign(new Error('El video no llegó en el formato esperado'), { codigo: 400 });

  if (bytes.length > TOPE_BYTES) {
    throw Object.assign(
      new Error(`El video pesa demasiado. El máximo son ${Math.round(TOPE_BYTES / 1024 / 1024)} MB`),
      { codigo: 413 },
    );
  }

  const firma = FIRMAS.find((f) => f.prueba(bytes));
  if (!firma) {
    throw Object.assign(new Error('Solo se admiten videos MP4 o WebM'), { codigo: 400 });
  }

  const libres = bytesLibres();
  if (libres !== null && libres - bytes.length < MINIMO_LIBRE) {
    throw Object.assign(
      new Error('No hay espacio en el servidor para más videos. Avise al equipo de MercaMaquinarias.'),
      { codigo: 507 },
    );
  }

  const mes = new Date().toISOString().slice(0, 7);
  const destino = path.join(CARPETA, mes);
  fs.mkdirSync(destino, { recursive: true });

  const nombre = `${crypto.randomBytes(16).toString('hex')}.${firma.ext}`;
  fs.writeFileSync(path.join(destino, nombre), bytes);

  return `${RUTA_PUBLICA}/${mes}/${nombre}`;
}

/* Resuelve una ruta pública a un archivo real, o null. Misma defensa
   que en fotos.js: exige el prefijo, resuelve y comprueba que no se
   haya salido de la carpeta. */
function archivoDe(rutaPublica) {
  const cruda = String(rutaPublica || '');
  if (!cruda.startsWith(`${RUTA_PUBLICA}/`)) return null;

  const relativa = cruda.slice(RUTA_PUBLICA.length + 1);
  /* Solo se aceptan nombres que pudo producir guardar. La validación
     explícita evita que una normalización posterior convierta barras,
     segmentos codificados o controles en una ruta distinta. */
  if (!relativa || /[\\%]|\.\.|[\x00-\x1F\x7F]/.test(relativa)) return null;
  if (!/^\d{4}-(?:0[1-9]|1[0-2])\/[0-9a-f]{32}\.(?:mp4|webm)$/.test(relativa)) return null;

  const completa = path.resolve(CARPETA, relativa);
  if (completa !== CARPETA && !completa.startsWith(CARPETA + path.sep)) return null;
  if (!TIPOS_SERVIDOS[path.extname(completa).toLowerCase()]) return null;

  return completa;
}

function rutaExiste(rutaPublica) {
  const archivo = archivoDe(rutaPublica);
  return !!archivo && fs.existsSync(archivo);
}

const tipoDe = (archivo) => TIPOS_SERVIDOS[path.extname(archivo).toLowerCase()] || 'application/octet-stream';

function borrar(rutaPublica) {
  const archivo = archivoDe(rutaPublica);
  if (archivo) fs.rmSync(archivo, { force: true });
}

module.exports = {
  guardar, archivoDe, rutaExiste, borrar, tipoDe, bytesDeDataUri, bytesLibres,
  CARPETA, RUTA_PUBLICA, TOPE_BYTES, MINIMO_LIBRE, SEGUNDOS_MAXIMOS,
};
