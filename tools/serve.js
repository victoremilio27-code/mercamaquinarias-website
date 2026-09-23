/**
 * serve.js — servidor del sitio. Estáticos + API. Sin dependencias.
 *
 * Uso:
 *   npm start                        # http://127.0.0.1:8080
 *   node tools/serve.js --port 3000
 *   node tools/serve.js --sin-api    # solo estáticos
 *   node tools/serve.js --root otra/carpeta --port 8081
 *   node tools/serve.js --host 0.0.0.0   # visible en la red local
 *
 * Con la API montada, /api/* lo atiende tools/api.js contra la base
 * SQLite de db/. El resto son archivos del proyecto.
 */

// Lo primero: el .env debe estar cargado antes de que nadie lea
// process.env, incluidos db y correo al importarse.
require('./entorno');

const http = require('http');
const fs = require('fs');
const path = require('path');

const fotos = require('./fotos');
const videos = require('./videos');

const RAIZ_PROYECTO = path.resolve(__dirname, '..');

const PRODUCCION = process.env.NODE_ENV === 'production';

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
};

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
const CABECERAS_SEGURIDAD = {
  // Nada de adivinar el tipo: un .txt subido no se ejecuta como script.
  'X-Content-Type-Options': 'nosniff',
  // El sitio no se embebe en iframes ajenos, así que no hay clickjacking.
  'X-Frame-Options': 'DENY',
  // No filtrar la URL completa —con sus filtros de búsqueda— a terceros.
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // El sitio no usa cámara, micrófono ni geolocalización del navegador.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
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
    "connect-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; '),
};

function cabecerasDe(extra = {}) {
  const h = { ...CABECERAS_SEGURIDAD, ...extra };
  // HSTS solo con HTTPS activo. Enviarlo por HTTP no hace nada, y
  // enviarlo antes de tener certificado deja el dominio inaccesible en
  // los navegadores que ya lo hayan recordado.
  if (PRODUCCION && process.env.MERCA_HTTPS === '1') {
    h['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  }
  return h;
}

/* En desarrollo, nunca cachear: siempre quieres el archivo recién
   guardado. En producción sí, pero con cuidado: los nombres no llevan
   hash, así que un caché largo en styles.css o app.js dejaría a la
   gente con la versión vieja después de un despliegue. El HTML
   revalida siempre y el resto dura lo justo. */
function cacheDe(ext) {
  if (!PRODUCCION) return 'no-store';
  /* `no-cache` no significa «no guardes»: significa «guárdalo pero
     pregunta antes de usarlo». Con el ETag de abajo, esa pregunta se
     responde con un 304 vacío, así que se ahorra la descarga igual y
     además se ve el cambio al instante.

     Antes styles.css y los scripts llevaban max-age=3600 SIN ETag: un
     despliegue tardaba hasta una hora en verse y la única salida era
     Ctrl+F5. Los nombres no llevan hash, así que cachear a ciegas no
     es una opción.

     Las imágenes de marca sí duran: cambian cada muchos meses y
     revalidarlas en cada visita no compensa. */
  if (ext === '.html' || ext === '.css' || ext === '.js') return 'no-cache';
  return 'public, max-age=604800';
}

/* Marca de versión del archivo. Tamaño y fecha de modificación bastan
   —no hace falta leer el contenido para compararlo— y cambian con
   cualquier despliegue, que es justo cuando el navegador tiene que
   volver a pedirlo. */
const etagDe = (est) => `W/"${est.size.toString(36)}-${est.mtimeMs.toString(36)}"`;

/* QUÉ SE PUEDE PEDIR POR HTTP.
 *
 * Lista blanca, no lista negra. Antes se servía cualquier archivo bajo
 * la raíz del proyecto y eso dejaba a la vista:
 *
 *   /.env              la clave de Brevo y el secreto de sesión
 *   /db/mercamaquinarias.db  la base entera: correos, hashes, RNC
 *   /.git/config       el repositorio
 *   /tools/db.js       el código del servidor
 *
 * Con una lista negra siempre se olvida algo —un .bak, un .env.old, un
 * volcado que alguien dejó en la carpeta—. Con una lista blanca, lo
 * que no está previsto no se sirve, y añadir un archivo público es una
 * línea aquí.
 *
 * Las fotografías NO están en esta lista: viven fuera del proyecto y
 * las atiende su propia rama, más arriba.
 */
const PUBLICO = [
  /^\/[\w-]+\.html$/,                       // páginas del sitio
  /^\/assets\/[\w.-]+\.(js|svg|css|woff2?)$/, // scripts e iconos
  /* Logotipos y las fotografías del héroe, que viven en
     brand_assets/portada. Se admite UN nivel de subcarpeta y su nombre
     solo puede llevar letras, dígitos y guiones: sin puntos no hay
     «..» que valga, así que no se sale de aquí. */
  /^\/brand_assets\/(?:[\w-]+\/)?[\w.-]+\.(png|svg|jpe?g|webp)$/,
  /^\/styles\.css$/,
  /^\/favicon\.ico$/,
  /^\/robots\.txt$/,
  /^\/sitemap\.xml$/,
];

const esPublico = (ruta) => PUBLICO.some((p) => p.test(ruta));

/* Se escucha SOLO en la interfaz local.
 *
 * Sin dirección, Node escucha en todas: en el servidor, el proceso
 * quedaba expuesto en el puerto 8080 de la IP pública, y lo único que
 * lo tapaba era el cortafuegos. La unidad de systemd llevaba escrito
 * «el servidor escucha solo en local» desde el primer día y no era
 * cierto; una regla de ufw mal tocada lo habría publicado entero, sin
 * HTTPS y saltándose a nginx.
 *
 * `--host 0.0.0.0` lo abre a propósito, que es lo que hace falta para
 * probar desde el teléfono en la misma red. */
function leerArgs(argv) {
  const args = {
    port: Number(process.env.PORT) || 8080,
    host: process.env.MERCA_HOST || '127.0.0.1',
    root: '.',
    api: true,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--port' || argv[i] === '-p') args.port = Number(argv[++i]);
    else if (argv[i] === '--host' || argv[i] === '-h') args.host = argv[++i];
    else if (argv[i] === '--root' || argv[i] === '-r') args.root = argv[++i];
    else if (argv[i] === '--sin-api') args.api = false;
  }
  return args;
}

const args = leerArgs(process.argv.slice(2));
const RAIZ = path.resolve(RAIZ_PROYECTO, args.root);

/* La API se carga solo si se pide y solo si su base arranca. Si algo
   falla, el sitio sigue sirviéndose como estático en vez de no
   levantar: es un entorno de desarrollo, no conviene un todo o nada. */
let api = null;

/* Los metadatos de compartir leen de la base, así que cargan con la
   API y no antes: sin base no hay ficha que describir, y un require
   arriba tumbaría el servidor estático que este bloque está tratando
   de salvar. */
let metadatos = { para: () => null, aplicar: (html) => html };

if (args.api) {
  try {
    api = require('./api');
    metadatos = require('./meta');
    const db = require('./db');
    db.abrir();
    // Sesiones, códigos y contadores caducados se barren cada hora.
    // `unref` evita que este temporizador mantenga vivo el proceso.
    db.purgar();
    setInterval(() => db.purgar(), 3600 * 1000).unref();
  } catch (e) {
    /* En producción esto no es recuperable: sin API no hay cuentas ni
       publicaciones, y un sitio a medias es peor que uno caído porque
       systemd no lo reinicia y nadie se entera. */
    if (PRODUCCION) {
      console.error('API no disponible:', e.message);
      process.exit(1);
    }
    console.warn('API no disponible, se sirve solo el sitio estático:', e.message);
    api = null;
  }
}

/* pipe() deja los errores del origen sin escuchar, y un ReadStream
   que emite «error» sin manejador es una excepción no capturada que
   mata el proceso. Aquí se corta la respuesta y se sigue viviendo. */
function enviarArchivo(flujo, res, archivo) {
  flujo.on('error', (e) => {
    console.error(`estáticos: no se pudo leer ${archivo} · ${e.message}`);
    res.destroy();
  });
  flujo.pipe(res);
}

/* Última red del proceso. Node mata el proceso ante una promesa
   rechazada sin manejador, y hasta ahora eso no dejaba ni una traza
   útil más allá de lo que recogiera systemd. Se registra y se sigue:
   tumbar el sitio entero por un correo que no salió es peor que el
   correo que no salió. */
process.on('unhandledRejection', (razon) => {
  console.error('promesa rechazada sin manejador:', (razon && razon.stack) || razon);
});

/* La excepción no capturada sí deja el proceso en estado dudoso, así
   que aquí se registra y se sale con código de error para que systemd
   reinicie limpio. La diferencia con no tener el manejador es que
   queda escrito QUÉ pasó. */
process.on('uncaughtException', (e) => {
  console.error('excepción no capturada:', e && e.stack);
  process.exit(1);
});

const servidor = http.createServer((req, res) => {
  /* Las cabeceras de seguridad se fijan antes de mirar siquiera qué se
     pide, de modo que las lleven también el 400, el 403 y el 404. Con
     `setHeader` sobreviven a cualquier `writeHead` posterior, incluido
     el de la API, que no sabe nada de esto. */
  Object.entries(cabecerasDe()).forEach(([k, v]) => res.setHeader(k, v));

  let ruta;
  let consulta;
  try {
    const u = new URL(req.url, 'http://localhost');
    ruta = decodeURIComponent(u.pathname);
    consulta = u.searchParams;
  } catch {
    res.writeHead(400).end('URL inválida');
    return;
  }

  /* El mapa del sitio se compone en el momento: cambia cada vez que
     alguien publica o le vence un anuncio, y un archivo estático
     acabaría mandando al buscador a fichas que ya no existen. */
  if (api && ruta === '/sitemap.xml') {
    res.writeHead(200, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    });
    res.end(metadatos.sitemap());
    console.log(`200  ${ruta}`);
    return;
  }

  if (api && ruta.startsWith('/api/')) {
    api.manejar(req, res, ruta).catch((e) => {
      console.error('API', e);
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"Error del servidor"}');
    });
    return;
  }

  /* Fotografías de los anuncios. Viven fuera del proyecto —en el VPS,
     en /var/lib— así que no las alcanza el servidor de estáticos de
     más abajo y necesitan su propia rama.

     Caché de un año e `immutable`: el nombre de cada archivo es
     aleatorio y nunca se reescribe, así que una foto descargada no hay
     que volver a pedirla jamás. Es lo que convierte la segunda visita
     al catálogo en instantánea. */
  if (ruta.startsWith('/fotos/')) {
    const archivo = fotos.archivoDe(ruta);
    if (!archivo) {
      res.writeHead(404).end('No existe');
      return;
    }
    fs.readFile(archivo, (err, datos) => {
      if (err) {
        res.writeHead(404).end('No existe');
        return;
      }
      res.writeHead(200, {
        'Content-Type': fotos.tipoDe(archivo),
        'Cache-Control': PRODUCCION ? 'public, max-age=31536000, immutable' : 'no-store',
      });
      res.end(datos);
    });
    return;
  }

  /* Videos de los anuncios. Rama aparte de las fotos, y no por
     ordenarlo bonito: un video NO se puede servir como se sirve una
     foto.

     Las fotos se leen enteras a memoria con readFile y se mandan de una
     vez. Con un video eso trae dos problemas:

       1. `<video>` pide por rangos. Sin `Accept-Ranges` y sin responder
          206 no se puede adelantar, y iOS Safari directamente NO
          reproduce: pide los primeros bytes, recibe un 200 con el
          archivo entero y abandona.
       2. Son 6 MB por archivo. Cargarlos enteros en RAM en un servidor
          de 512 MB, con varias visitas a la vez, es quedarse sin
          memoria.

     Así que aquí se responde al rango pedido y se manda en streaming,
     que además empieza a reproducir antes. */
  if (ruta.startsWith('/videos/')) {
    const archivo = videos.archivoDe(ruta);
    if (!archivo) {
      res.writeHead(404).end('No existe');
      return;
    }

    fs.stat(archivo, (err, est) => {
      if (err || !est.isFile()) {
        res.writeHead(404).end('No existe');
        return;
      }

      const total = est.size;
      const comunes = {
        'Content-Type': videos.tipoDe(archivo),
        'Accept-Ranges': 'bytes',
        // El nombre es aleatorio y el archivo nunca se reescribe.
        'Cache-Control': PRODUCCION ? 'public, max-age=31536000, immutable' : 'no-store',
      };

      const pedido = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');

      if (!pedido) {
        res.writeHead(200, { ...comunes, 'Content-Length': total });
        if (req.method === 'HEAD') { res.end(); return; }
        enviarArchivo(fs.createReadStream(archivo), res, archivo);
        return;
      }

      // `bytes=-500` son los ÚLTIMOS 500, no los primeros.
      const sufijo = pedido[1] === '';
      let desde = sufijo ? total - Number(pedido[2] || 0) : Number(pedido[1]);
      let hasta = sufijo || pedido[2] === '' ? total - 1 : Number(pedido[2]);

      desde = Math.max(0, desde);
      hasta = Math.min(total - 1, hasta);

      if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde > hasta || desde >= total) {
        res.writeHead(416, { ...comunes, 'Content-Range': `bytes */${total}` }).end();
        return;
      }

      res.writeHead(206, {
        ...comunes,
        'Content-Range': `bytes ${desde}-${hasta}/${total}`,
        'Content-Length': hasta - desde + 1,
      });
      if (req.method === 'HEAD') { res.end(); return; }
      enviarArchivo(fs.createReadStream(archivo, { start: desde, end: hasta }), res, archivo);
    });
    return;
  }

  if (ruta.endsWith('/')) ruta += 'index.html';

  /* Solo lo declarado público. Se comprueba ANTES de tocar el disco:
     así el servidor ni siquiera revela, por la diferencia entre un 403
     y un 404, qué archivos existen fuera de la lista. */
  if (!esPublico(ruta)) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>No existe.</p>');
    console.log(`404  ${ruta}  (fuera de la lista pública)`);
    return;
  }

  const archivo = path.join(RAIZ, ruta);

  // Cinturón y tirantes: aunque la lista blanca ya lo impide, no
  // servir nada que quede fuera de la raíz declarada.
  if (!archivo.startsWith(RAIZ + path.sep) && archivo !== RAIZ) {
    res.writeHead(403).end('Prohibido');
    return;
  }

  fs.stat(archivo, (errEst, est) => {
    if (errEst || !est.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p>No existe <code>' + ruta.replace(/[<>&]/g, '') + '</code></p>');
      console.log(`404  ${ruta}`);
      return;
    }

    const ext = path.extname(archivo).toLowerCase();

    /* La vista previa al compartir.
     *
     * Solo entra aquí `equipo.html?id=…` y `dealer.html?d=…`. La misma
     * página sin parámetro se sirve por el camino de siempre, con su
     * ETag y su caché: quien entra sin id no está compartiendo nada.
     *
     * Va sin caché a propósito: el título y la foto cambian con el
     * anuncio, así que un ETag de archivo mentiría. Son unos kilobytes
     * y solo en las fichas. */
    const meta = api && ext === '.html' ? metadatos.para(ruta, consulta) : null;
    if (meta) {
      fs.readFile(archivo, 'utf8', (err, html) => {
        if (err) { res.writeHead(404).end('No existe'); return; }
        const compuesto = metadatos.aplicar(html, meta);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
        });
        res.end(compuesto);
        console.log(`200  ${ruta} (con vista previa)`);
      });
      return;
    }

    const etag = etagDe(est);
    const cabeceras = {
      'Content-Type': TIPOS[ext] || 'application/octet-stream',
      'Cache-Control': cacheDe(ext),
      ETag: etag,
      'Last-Modified': new Date(est.mtimeMs).toUTCString(),
    };

    /* El navegador ya lo tiene y no ha cambiado: se le responde 304 sin
       cuerpo. Cuesta unos cientos de bytes en vez de los cien kilos del
       archivo, y en cuanto se despliega algo el ETag cambia y se manda
       la versión nueva sin que nadie tenga que forzar la recarga. */
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, cabeceras);
      res.end();
      console.log(`304  ${ruta}`);
      return;
    }

    fs.readFile(archivo, (err, datos) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<h1>404</h1><p>No existe.</p>');
        return;
      }
      res.writeHead(200, cabeceras);
      res.end(datos);
      console.log(`200  ${ruta}`);
    });
  });
});

servidor.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`El puerto ${args.port} está ocupado. Prueba: node tools/serve.js --port ${args.port + 1}`);
    process.exit(1);
  }
  throw e;
});

servidor.listen(args.port, args.host, () => {
  console.log(`MercaMaquinarias en http://${args.host}:${args.port}`);
  console.log(`Sirviendo   ${RAIZ}`);
  console.log(`API         ${api ? 'activa en /api' : 'desactivada'}`);
  console.log('Ctrl+C para detener.\n');
});
