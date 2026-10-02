/**
 * Recorrido defensivo de cada entrada del enrutador. No afirma el contrato
 * funcional de cada ruta: prueba que entradas hostiles terminan en una
 * respuesta controlada y nunca revelan detalles internos.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-rutas');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
const api = require('./api.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) {
    bien++;
  } else {
    mal++;
    console.log(`  MAL ${que}`);
  }
}

function pedir({ metodo, url, testigo, cuerpo, bruto }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = {
      'content-type': 'application/json',
      'user-agent': 'prueba-rutas-api',
      'cf-connecting-ip': '203.0.113.20',
      ...(testigo ? { cookie: `te_sesion=${testigo}` } : {}),
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      cabeceras: {},
      writeHead(codigo, cabeceras = {}) {
        res.codigo = codigo;
        res.cabeceras = cabeceras;
        return res;
      },
      end(datos) {
        resolver({ codigo: res.codigo, cabeceras: res.cabeceras, texto: datos ? String(datos) : '' });
      },
    };
    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => {
      if (bruto !== undefined) req.emit('data', Buffer.from(bruto));
      else if (cuerpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(cuerpo)));
      req.emit('end');
    });
  });
}

function crearSesion(correo, administrador = false) {
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre: 'Persona de prueba',
    telefono: '8095550000', tipo: 'particular',
  });
  db.marcarCorreoVerificado(idUsuario);
  if (administrador) db.marcarAdmin(correo);
  return db.abrirSesion(idUsuario);
}

function urlPara(patron, valor) {
  let fuente = patron.source.replace(/^\^/, '').replace(/\$$/, '');
  fuente = fuente
    .replace(/\(\[\\w-\]\+\)/g, valor)
    .replace(/\(\\w\+\)/g, valor)
    .replace(/\(\\d\{4\}-\\d\{2\}\)/g, valor === '0' ? '0000-00' : '9999-99')
    .replace(/\\\//g, '/')
    .replace(/\\\./g, '.');
  return fuente;
}

const CUERPOS = [
  { bruto: '{incompleto' },
  { cuerpo: [] },
  { cuerpo: null },
  { cuerpo: { nombre: 123, correo: {}, cantidad: {}, precio: 'texto', fotos: 7 } },
  { cuerpo: { nombre: 'x'.repeat(10000), comentario: 'x'.repeat(10000), mensaje: 'x'.repeat(10000) } },
];
const VALORES = ['no-existe', '0', '-1', '%00', 'x'.repeat(300)];
const PATRONES_PRIVADOS = [/^\/api\/chat$/, /^\/api\/pagos\/cardnet\//];

async function probar() {
  console.log('\nRecorrido de rutas de API');
  const sesiones = [null, crearSesion('normal-rutas@ejemplo.test'), crearSesion('admin-rutas@ejemplo.test', true)];

  for (const [metodo, patron] of api.RUTAS) {
    // CardNet y Anthropic llaman servicios externos y no pueden ejercitarse
    // de forma determinista sin sus claves ni red. Brevo sí queda aislado
    // por MERCA_CORREO=archivo, por lo que sus rutas permanecen incluidas.
    if (PATRONES_PRIVADOS.some((excluido) => excluido.test(urlPara(patron, 'no-existe')))) continue;

    const cuerpos = ['POST', 'PUT', 'PATCH'].includes(metodo) ? CUERPOS : [{}];
    for (const valor of VALORES) {
      const url = urlPara(patron, valor);
      for (const testigo of sesiones) {
        for (const cuerpo of cuerpos) {
          const r = await pedir({ metodo, url, testigo, ...cuerpo });
          const etiqueta = `${metodo} ${patron} con ${valor}`;
          comprobar(r.codigo > 0 && r.codigo < 500, `${etiqueta} devolvió ${r.codigo}`);
          comprobar(!/SQLITE|TypeError|\bat\s+|(?:[A-Za-z]:)?[\\/]workspace[\\/]|[\\/]home[\\/]|[\\/]root[\\/]/i.test(r.texto),
            `${etiqueta} reveló un detalle interno: ${r.texto.slice(0, 160)}`);
        }
      }
    }
  }

  let r = await pedir({ metodo: 'GET', url: '/api/salud' });
  comprobar(r.codigo === 200 && JSON.parse(r.texto).ok === true, 'salud responde 200 cuando la base está disponible');
  comprobar(String(r.cabeceras['Cache-Control']).includes('no-store'), 'salud impide almacenar la respuesta');

  const abrirReal = db.abrir;
  db.abrir = () => { throw new Error('base rota para la prueba'); };
  r = await pedir({ metodo: 'GET', url: '/api/salud' });
  db.abrir = abrirReal;
  comprobar(r.codigo === 503 && JSON.parse(r.texto).ok === false, 'salud responde 503 cuando la base falla');
  comprobar(!r.texto.includes('base rota'), 'salud no revela el error de la base');

  r = await pedir({ metodo: 'GET', url: '/api/ruta-que-no-existe' });
  comprobar(r.codigo === 404 && !!JSON.parse(r.texto).error, 'una ruta desconocida responde 404 JSON');
  r = await pedir({ metodo: 'DELETE', url: '/api/salud' });
  comprobar(r.codigo === 405 && !!JSON.parse(r.texto).error, 'un método equivocado responde 405 JSON');
  comprobar(r.cabeceras.Allow === 'GET', 'el 405 incluye la cabecera Allow');

  console.log(`\n${bien} comprobaciones bien; ${mal} mal.`);
  if (mal) process.exitCode = 1;
}

probar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
