const http = require('node:http');
const https = require('node:https');
const { paginasApagadas } = require('../assets/servicios.js');

const ESPERA_MS = 15_000;
const AGENTE = 'MercaMaquinarias-humo/1';

const argumentoBase = (() => {
  const posicion = process.argv.indexOf('--base');
  if (posicion === -1) return 'http://127.0.0.1:8080';
  if (!process.argv[posicion + 1] || process.argv[posicion + 2]) {
    console.error('Uso: node tools/humo.js --base http://127.0.0.1:8080');
    process.exit(1);
  }
  return process.argv[posicion + 1];
})();

let base;
try {
  base = new URL(argumentoBase);
  if (!['http:', 'https:'].includes(base.protocol)) throw new Error('protocolo inválido');
} catch {
  console.error(`Base inválida: ${argumentoBase}. Use una URL http o https.`);
  process.exit(1);
}

const color = process.stdout.isTTY;
const verde = (texto) => color ? `\u001b[32m${texto}\u001b[0m` : texto;
const rojo = (texto) => color ? `\u001b[31m${texto}\u001b[0m` : texto;
const resultados = [];
const respuestas5xx = [];

function pedirUnaVez(ruta, metodo) {
  return new Promise((resolve, reject) => {
    const url = new URL(ruta, base);
    const cliente = url.protocol === 'https:' ? https : http;
    const peticion = cliente.request(url, {
      method: metodo,
      headers: { 'User-Agent': AGENTE },
      timeout: ESPERA_MS,
    }, (respuesta) => {
      const partes = [];
      respuesta.on('data', (parte) => partes.push(parte));
      respuesta.on('end', () => resolve({
        estado: respuesta.statusCode,
        cabeceras: respuesta.headers,
        cuerpo: Buffer.concat(partes).toString('utf8'),
      }));
    });
    peticion.on('timeout', () => peticion.destroy(new Error('agotó los 15 s de espera')));
    peticion.on('error', reject);
    peticion.end();
  });
}

async function pedir(ruta, metodo = 'GET') {
  let ultimoError;
  for (let intento = 0; intento < 2; intento += 1) {
    try {
      const respuesta = await pedirUnaVez(ruta, metodo);
      if (respuesta.estado >= 500) respuestas5xx.push(`${metodo} ${ruta}: ${respuesta.estado}`);
      return respuesta;
    } catch (error) {
      ultimoError = error;
    }
  }
  throw new Error(`error de red después de un reintento: ${ultimoError.message}`);
}

async function comprobar(nombre, accion) {
  try {
    await accion();
    resultados.push(true);
    console.log(verde(`✓ ${nombre}`));
  } catch (error) {
    resultados.push(false);
    console.log(rojo(`✗ ${nombre}: ${error.message}`));
  }
}

function exigir(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

async function estado(ruta, metodo = 'GET') {
  const respuesta = await pedir(ruta, metodo);
  exigir(respuesta.estado === 200, `respondió ${respuesta.estado}`);
  return respuesta;
}

async function ejecutar() {
  await comprobar('GET /api/salud responde 200 y ok', async () => {
    const respuesta = await estado('/api/salud');
    let datos;
    try { datos = JSON.parse(respuesta.cuerpo); } catch { throw new Error('no devolvió JSON válido'); }
    exigir(datos.ok === true, 'el JSON no contiene { ok: true }');
  });

  let portada;
  await comprobar('GET / responde HTML', async () => {
    portada = await estado('/');
    exigir(/^text\/html(?:;|$)/i.test(portada.cabeceras['content-type'] || ''), 'no devolvió text/html');
  });

  for (const ruta of ['/equipos.html', '/categorias.html', '/planes.html', '/contacto.html', '/legal.html']) {
    await comprobar(`HEAD ${ruta} responde HTML`, async () => {
      const respuesta = await estado(ruta, 'HEAD');
      exigir(/^text\/html(?:;|$)/i.test(respuesta.cabeceras['content-type'] || ''), 'no devolvió text/html');
    });
  }

  await comprobar('GET /api/anuncios devuelve JSON', async () => {
    const respuesta = await estado('/api/anuncios');
    try { JSON.parse(respuesta.cuerpo); } catch { throw new Error('no devolvió JSON válido'); }
  });
  for (const ruta of ['/api/taxonomia', '/api/planes']) {
    await comprobar(`GET ${ruta} responde 200`, () => estado(ruta));
  }

  await comprobar('GET /sitemap.xml devuelve XML', async () => {
    const respuesta = await estado('/sitemap.xml');
    exigir(respuesta.cuerpo.startsWith('<?xml'), 'no empieza por <?xml');
  });
  await comprobar('GET /robots.txt responde 200', () => estado('/robots.txt'));

  for (const ruta of paginasApagadas()) {
    await comprobar(`GET ${ruta} redirige a /`, async () => {
      const respuesta = await pedir(ruta);
      exigir(respuesta.estado >= 300 && respuesta.estado < 400, `respondió ${respuesta.estado}`);
      exigir(!!respuesta.cabeceras.location, 'no incluyó la cabecera Location');
      exigir(new URL(respuesta.cabeceras.location, base).pathname === '/', 'no redirigió a /');
    });
  }

  const privadas = [
    '/.env', '/.env.example', '/package.json', '/db/schema.sql',
    '/db/mercamaquinarias.db', '/tools/db.js', '/.git/config',
    '/.planning/STATE.md', '/CLAUDE.md', '/deploy/nginx.conf',
  ];
  for (const ruta of privadas) {
    await comprobar(`GET ${ruta} no se sirve`, async () => {
      const respuesta = await pedir(ruta);
      exigir(respuesta.estado !== 200, 'respondió 200');
    });
  }

  await comprobar('La portada incluye las cabeceras de seguridad', async () => {
    if (!portada) portada = await estado('/');
    exigir(!!portada.cabeceras['content-security-policy'], 'falta Content-Security-Policy');
    exigir(portada.cabeceras['x-content-type-options'] === 'nosniff', 'falta X-Content-Type-Options: nosniff');
    if (base.protocol === 'https:') {
      exigir(!!portada.cabeceras['strict-transport-security'], 'falta Strict-Transport-Security');
    }
  });

  await comprobar('Ninguna respuesta fue 5xx', async () => {
    exigir(respuestas5xx.length === 0, respuestas5xx.join(', '));
  });

  const aprobadas = resultados.filter(Boolean).length;
  const fallidas = resultados.length - aprobadas;
  console.log(`\nResumen: ${aprobadas} aprobadas, ${fallidas} fallidas.`);
  process.exitCode = fallidas ? 1 : 0;
}

ejecutar().catch((error) => {
  console.error(rojo(`✗ Fallo inesperado: ${error.message}`));
  process.exitCode = 1;
});
