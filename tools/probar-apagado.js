/**
 * Prueba el apagado con un servidor real: los dobles no descubren si Node
 * corta el socket que todavía está entregando el cuerpo de una petición.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TEMPORAL = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-apagado-'));
let bien = 0;
let mal = 0;

function comprobar(condicion, que) {
  if (condicion) bien++;
  else {
    mal++;
    console.log(`  MAL ${que}`);
  }
}

function puertoLibre() {
  return new Promise((resolver, rechazar) => {
    const sonda = http.createServer();
    sonda.once('error', rechazar);
    sonda.listen(0, '127.0.0.1', () => {
      const puerto = sonda.address().port;
      sonda.close((error) => error ? rechazar(error) : resolver(puerto));
    });
  });
}

function arrancar(puerto, nombre) {
  const hijo = spawn(process.execPath, [path.join(__dirname, 'serve.js'), '--port', String(puerto)], {
    env: {
      ...process.env,
      MERCA_DB: path.join(TEMPORAL, `${nombre}.db`),
      MERCA_CORREO: 'archivo',
      MERCA_SECRETO: 'x',
      MERCA_HTTPS: '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let salida = '';
  hijo.stdout.on('data', (trozo) => { salida += trozo; });
  hijo.stderr.on('data', (trozo) => { salida += trozo; });
  return { hijo, salida: () => salida };
}

function pedir(puerto, opciones = {}) {
  return new Promise((resolver, rechazar) => {
    const req = http.request({ hostname: '127.0.0.1', port: puerto, ...opciones }, (res) => {
      const trozos = [];
      res.on('data', (trozo) => trozos.push(trozo));
      res.on('end', () => resolver({ codigo: res.statusCode, cuerpo: Buffer.concat(trozos) }));
    });
    req.once('error', rechazar);
    req.end();
  });
}

async function esperarSalud(puerto, hijo) {
  const limite = Date.now() + 5_000;
  while (Date.now() < limite && hijo.exitCode === null) {
    try {
      const respuesta = await pedir(puerto, { path: '/api/salud' });
      if (respuesta.codigo === 200) return;
    } catch (_) {
      // El puerto tarda unas vueltas en abrirse; eso es parte normal del arranque.
    }
    await new Promise((resolver) => setTimeout(resolver, 50));
  }
  throw new Error('el servidor no respondió salud a tiempo');
}

function esperarSalida(hijo, limite) {
  return new Promise((resolver, rechazar) => {
    if (hijo.exitCode !== null) return resolver({ codigo: hijo.exitCode, duracion: 0 });
    const inicio = Date.now();
    const temporizador = setTimeout(() => {
      hijo.kill('SIGKILL');
      rechazar(new Error(`el proceso no salió en ${limite} ms`));
    }, limite);
    hijo.once('exit', (codigo, senal) => {
      clearTimeout(temporizador);
      resolver({ codigo, senal, duracion: Date.now() - inicio });
    });
  });
}

function peticionLenta(puerto) {
  let req;
  const respuesta = new Promise((resolver, rechazar) => {
    req = http.request({
      hostname: '127.0.0.1', port: puerto, method: 'POST', path: '/api/cuenta/registro',
      headers: { 'Content-Type': 'application/json', 'Transfer-Encoding': 'chunked' },
    }, (res) => {
      const trozos = [];
      res.on('data', (trozo) => trozos.push(trozo));
      res.on('end', () => resolver({ codigo: res.statusCode, cuerpo: Buffer.concat(trozos) }));
    });
    req.once('error', rechazar);
    req.write('{"nombre":');
  });
  return { req, respuesta };
}

async function probarPeticionEnCurso() {
  const puerto = await puertoLibre();
  const proceso = arrancar(puerto, 'con-peticion');
  await esperarSalud(puerto, proceso.hijo);

  const lenta = peticionLenta(puerto);
  await new Promise((resolver) => setTimeout(resolver, 100));
  proceso.hijo.kill('SIGTERM');
  await new Promise((resolver) => setTimeout(resolver, 50));
  proceso.hijo.kill('SIGINT');
  await new Promise((resolver) => setTimeout(resolver, 950));
  lenta.req.end('"prueba"}');

  const [respuesta, salida] = await Promise.all([
    lenta.respuesta,
    esperarSalida(proceso.hijo, 12_000),
  ]);
  comprobar(Number.isInteger(respuesta.codigo) && respuesta.cuerpo.length > 0,
    'la petición en curso recibe una respuesta HTTP completa');
  comprobar(salida.codigo === 0 && salida.duracion < 12_000,
    'SIGTERM termina con código 0 antes de 12 segundos');
  comprobar(/Apagado ordenado iniciado/.test(proceso.salida()) && /Apagado ordenado terminado/.test(proceso.salida()),
    'el servidor registra el inicio y el final del apagado');
  comprobar(/Apagado ya en curso; se ignora SIGINT/.test(proceso.salida()),
    'una segunda señal se registra y no inicia otro apagado');

  let rechazo = false;
  try { await pedir(puerto, { path: '/api/salud' }); } catch (_) { rechazo = true; }
  comprobar(rechazo, 'una conexión nueva falla después de salir');
}

async function probarSinPeticiones() {
  const puerto = await puertoLibre();
  const proceso = arrancar(puerto, 'sin-peticiones');
  await esperarSalud(puerto, proceso.hijo);
  proceso.hijo.kill('SIGTERM');
  const salida = await esperarSalida(proceso.hijo, 2_000);
  comprobar(salida.codigo === 0 && salida.duracion < 2_000,
    'SIGTERM sin peticiones termina con código 0 antes de 2 segundos');
}

async function probar() {
  console.log('\nApagado ordenado del servidor');
  try {
    await probarPeticionEnCurso();
    await probarSinPeticiones();
  } finally {
    fs.rmSync(TEMPORAL, { recursive: true, force: true });
  }
  console.log(`\n${bien} comprobaciones bien; ${mal} mal.`);
  if (mal) process.exitCode = 1;
}

probar().catch((error) => {
  console.error(error);
  fs.rmSync(TEMPORAL, { recursive: true, force: true });
  process.exitCode = 1;
});
