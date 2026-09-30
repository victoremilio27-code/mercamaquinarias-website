/**
 * cabeceras.js — cabeceras de seguridad de todas las respuestas.
 *
 * Vivían dentro de tools/serve.js, que llama a `listen` al cargarse y por
 * eso ninguna prueba podía requerirlo. Aquí se pueden probar sin arrancar
 * el servidor. Cero dependencias.
 */

const cardnet = require('./cardnet');

/* Cabeceras de seguridad. Van en todas las respuestas, también en las
   de la API y en los errores: una cabecera que solo se pone en el
   camino feliz no protege el camino que importa.

   La CSP puede ser estricta porque el sitio no tiene ni un solo
   <script> en línea ni un atributo onclick: todo el JavaScript vive en
   assets/ y se carga con src. Lo único de fuera son las fuentes de
   Google, declaradas una a una.

   `style-src` sí lleva 'unsafe-inline' porque quedan dos atributos
   style= en el HTML y dos asignaciones a element.style en el JS. Es la
   concesión mínima y solo afecta a estilos, no a scripts, que es donde
   está el riesgo real. */

/* La política se arma en cada llamada y no una vez al cargar: encender o
   apagar CardNet (variables de entorno y reinicio) basta, sin tocar
   código, y la prueba puede alternar los dos estados en una ejecución.

   `frame-src` solo aparece con CardNet encendido y apunta al origen
   exacto de su URL base. Se permite ese iframe porque la tarjeta se
   teclea en CardNet y no en nuestra página: es lo que deja el sitio
   fuera del alcance de PCI. Su script, en cambio, NO se permite:
   `script-src` sigue siendo 'self', de modo que nuestra página nunca
   ejecuta código de captura de tarjetas. Apagado, la cadena es la de
   siempre, carácter a carácter. */
function armarPolitica(origenCardnet) {
  const lista = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    /* `blob:` hace falta para preparar el video ANTES de subirlo.
     *
     * Quien elige un video de su galería no manda el archivo tal cual:
     * el navegador lo abre en un <video> a partir de una URL blob:, lo
     * repinta a 720p sobre un canvas y graba el resultado. Sin esta
     * línea, `media-src` cae en `default-src 'self'`, el navegador se
     * niega a abrir ese blob: y la subida muere con un error de
     * seguridad en la consola que no explica nada a quien lo sufre.
     *
     * Los videos ya publicados se sirven desde el propio dominio, así
     * que para verlos basta con 'self'. El blob: es solo el paso
     * intermedio, y nunca sale del navegador de quien sube. */
    "media-src 'self' blob:",
  ];
  if (origenCardnet) lista.push(`frame-src ${origenCardnet}`);
  lista.push(
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  );
  return lista.join('; ');
}

function politicaDeContenido() {
  return armarPolitica(cardnet.origenCaptura());
}

const CABECERAS_SEGURIDAD = {
  // Nada de adivinar el tipo: un .txt subido no se ejecuta como script.
  'X-Content-Type-Options': 'nosniff',
  // El sitio no se embebe en iframes ajenos, así que no hay clickjacking.
  'X-Frame-Options': 'DENY',
  // No filtrar la URL completa —con sus filtros de búsqueda— a terceros.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // El sitio no usa cámara, micrófono ni geolocalización del navegador.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  /* La constante guarda la política APAGADA (para quien la lea como
     constante); `cabecerasDe` la sustituye por la calculada. */
  'Content-Security-Policy': armarPolitica(null),
};

function cabecerasDe(extra = {}, { produccion = false } = {}) {
  const h = { ...CABECERAS_SEGURIDAD, 'Content-Security-Policy': politicaDeContenido(), ...extra };
  // HSTS solo con HTTPS activo. Enviarlo por HTTP no hace nada, y
  // enviarlo antes de tener certificado deja el dominio inaccesible en
  // los navegadores que ya lo hayan recordado.
  if (produccion && process.env.MERCA_HTTPS === '1') {
    h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return h;
}

module.exports = { CABECERAS_SEGURIDAD, cabecerasDe, politicaDeContenido };
