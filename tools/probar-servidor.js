/**
 * probar-servidor.js — fija la frontera pública del servidor de archivos.
 *
 * Antes la lista blanca no tenía una prueba de extremo a extremo: una expresión
 * regular aparentemente inocente podía volver a publicar secretos, la base o el
 * repositorio. Este arnés usa rutas en crudo para conservar también los intentos
 * de recorrido que URL normalizaría antes de enviarlos.
 */

const fs = require('fs');
const http = require('http');
const net = require('net');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const TEMPORAL = path.join(RAIZ, '.tmp', 'prueba-servidor');

let fallos = 0;
let comprobaciones = 0;

function ok(condicion, texto) {
  comprobaciones++;
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function puertoLibre() {
  return new Promise((resolver, rechazar) => {
    const s = net.createServer();
    s.once('error', rechazar);
    s.listen(0, '127.0.0.1', () => {
      const puerto = s.address().port;
      s.close((error) => error ? rechazar(error) : resolver(puerto));
    });
  });
}

/* `path` llega directamente a http.request. Construir una URL aquí borraría
   los `..` antes de que el servidor pudiera demostrar que sabe rechazarlos. */
function pedir(puerto, ruta, cabeceras = {}) {
  return new Promise((resolver, rechazar) => {
    const peticion = http.request({
      host: '127.0.0.1', puerto, port: puerto, method: 'GET', path: ruta,
      headers: cabeceras,
    }, (respuesta) => {
      const trozos = [];
      respuesta.on('data', (trozo) => trozos.push(trozo));
      respuesta.on('end', () => resolver({
        estado: respuesta.statusCode,
        cabeceras: respuesta.headers,
        cuerpo: Buffer.concat(trozos),
      }));
    });
    peticion.setTimeout(3000, () => peticion.destroy(new Error(`tiempo agotado para ${ruta.slice(0, 80)}`)));
    peticion.on('error', rechazar);
    peticion.end();
  });
}

async function esperar(puerto, hijo) {
  for (let intento = 0; intento < 80; intento++) {
    if (hijo.exitCode !== null) throw new Error(`el servidor terminó con código ${hijo.exitCode}`);
    try {
      const respuesta = await pedir(puerto, '/');
      if (respuesta.estado < 500) return;
    } catch {}
    await new Promise((resolver) => setTimeout(resolver, 100));
  }
  throw new Error('el servidor no respondió a tiempo');
}

function detener(hijo) {
  if (!hijo || hijo.exitCode !== null) return Promise.resolve();
  return new Promise((resolver) => {
    const tope = setTimeout(() => hijo.kill('SIGKILL'), 2000);
    hijo.once('exit', () => { clearTimeout(tope); resolver(); });
    hijo.kill('SIGTERM');
  });
}

(async () => {
  fs.rmSync(TEMPORAL, { recursive: true, force: true });
  for (const carpeta of ['fotos', 'videos', 'documentos']) {
    fs.mkdirSync(path.join(TEMPORAL, carpeta), { recursive: true });
  }

  const puerto = await puertoLibre();
  const entorno = {
    ...process.env,
    MERCA_DB: path.join(TEMPORAL, 'prueba.db'),
    MERCA_CORREO: 'archivo',
    MERCA_SECRETO: 'secreto-de-prueba-no-usar-en-produccion',
    MERCA_HTTPS: '0',
    MERCA_FOTOS: path.join(TEMPORAL, 'fotos'),
    MERCA_VIDEOS: path.join(TEMPORAL, 'videos'),
    MERCA_DOCUMENTOS: path.join(TEMPORAL, 'documentos'),
    MERCA_ENV: path.join(TEMPORAL, 'no-existe.env'),
  };
  const hijo = spawn(process.execPath, ['tools/serve.js', '--port', String(puerto)], {
    cwd: RAIZ, env: entorno, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let registro = '';
  hijo.stdout.on('data', (datos) => { registro += datos; });
  hijo.stderr.on('data', (datos) => { registro += datos; });

  try {
    await esperar(puerto, hijo);

    console.log('\n1 · archivos públicos y tipos');
    const publicos = [
      ['/'],
      ['/index.html'],
      ['/styles.css', 'text/css'],
      ['/assets/app.js', 'javascript'],
      ['/brand_assets/svg/isotipo-tuerca.svg', 'image/svg+xml'],
      ['/favicon.ico'],
      ['/robots.txt'],
      ['/sitemap.xml'],
      ['/404.html'],
    ];
    let estilos;
    for (const [ruta, tipo] of publicos) {
      const respuesta = await pedir(puerto, ruta);
      if (ruta === '/styles.css') estilos = respuesta;
      ok(respuesta.estado === 200, `${ruta}: HTTP ${respuesta.estado}`);
      if (tipo) {
        ok(String(respuesta.cabeceras['content-type']).toLowerCase().includes(tipo),
          `${ruta}: tipo ${respuesta.cabeceras['content-type'] || 'ausente'}`);
      }
      ok(respuesta.cabeceras['x-content-type-options'] === 'nosniff', `${ruta}: nosniff`);
    }

    console.log('\n2 · nada privado sale del repositorio');
    const privados = [
      '/.env.example', '/.env', '/.gitignore', '/.gitattributes', '/package.json',
      '/package-lock.json', '/CLAUDE.md', '/AGENTS.md', '/db/schema.sql', '/tools/db.js',
      '/tools/serve.js', '/deploy/nginx.conf', '/.github/workflows/desplegar.yml',
      '/.planning/STATE.md', '/.git/config', '/brand_assets/README.md',
      '/brand_assets/guia-de-marca.html', '/node_modules/puppeteer/package.json',
    ];
    for (const ruta of privados) {
      const respuesta = await pedir(puerto, ruta);
      ok(respuesta.estado !== 200 && respuesta.estado < 500, `${ruta}: HTTP ${respuesta.estado}`);
    }

    console.log('\n3 · rutas tramposas');
    const tramposas = [
      '/assets/../.env.example', '/assets/%2e%2e/.env.example',
      '/assets/%2e%2e%2f.env.example', '/%2e%2e/package.json', '//etc/passwd',
      '/assets/app.js%00.html', '/assets\\..\\package.json',
      '/brand_assets/svg/../../CLAUDE.md', '/fotos/../../.env.example',
      '/fotos/%2e%2e/%2e%2e/package.json', '/videos/../package.json',
      `/${'a'.repeat(5000)}`,
    ];
    for (const ruta of tramposas) {
      const respuesta = await pedir(puerto, ruta);
      ok(respuesta.estado !== 200 && respuesta.estado < 500,
        `${ruta.length > 100 ? 'ruta de 5.000 caracteres' : ruta}: HTTP ${respuesta.estado}`);
    }

    console.log('\n4 · caché, servicios y 404');
    ok(!!estilos.cabeceras.etag, 'styles.css entrega ETag');
    const revalidada = await pedir(puerto, '/styles.css', { 'If-None-Match': estilos.cabeceras.etag });
    ok(revalidada.estado === 304, `ETag coincidente: HTTP ${revalidada.estado}`);
    ok(revalidada.cuerpo.length === 0, 'la respuesta 304 no lleva cuerpo');

    const { SERVICIOS } = require('../assets/servicios.js');
    for (const nombre of ['transporte', 'financiamiento']) {
      if (!SERVICIOS[nombre].activo) {
        const respuesta = await pedir(puerto, `/${SERVICIOS[nombre].pagina}`);
        ok(respuesta.estado === 302 && respuesta.cabeceras.location === '/',
          `${nombre} apagado redirige a /`);
      }
    }
    const ausente = await pedir(puerto, '/no-existe.html');
    ok(ausente.estado === 404, `página inexistente: HTTP ${ausente.estado}`);
    ok(ausente.cuerpo.toString('utf8').includes('MercaMaquinarias'), 'el 404 usa la página de la marca');
  } finally {
    await detener(hijo);
    fs.rmSync(TEMPORAL, { recursive: true, force: true });
    if (hijo.exitCode && registro) console.error(registro);
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
