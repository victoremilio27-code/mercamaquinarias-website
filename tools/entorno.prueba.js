const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PREFIJO = 'PRUEBA_ENTORNO_';
const directorios = [];

// entorno.js carga sus rutas predeterminadas al importarse. Esta ruta imposible
// evita que las pruebas dependan del .env de quien las ejecute.
process.env.MERCA_ENV = path.join(os.tmpdir(), `${PREFIJO}NO_EXISTE`);
const { cargar, cargarUnidad } = require('./entorno');

test.afterEach(() => {
  for (const clave of Object.keys(process.env)) {
    if (clave.startsWith(PREFIJO)) delete process.env[clave];
  }
  for (const directorio of directorios.splice(0)) {
    fs.rmSync(directorio, { recursive: true, force: true });
  }
});

function archivo(nombre, contenido) {
  const directorio = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-entorno-'));
  directorios.push(directorio);
  const ruta = path.join(directorio, nombre);
  fs.writeFileSync(ruta, contenido);
  return ruta;
}

test('cargar devuelve cero si el archivo no existe', () => {
  assert.equal(cargar(path.join(os.tmpdir(), `${PREFIJO}AUSENTE`)), 0);
});

test('cargar ignora líneas que no definen variables', () => {
  const ruta = archivo('vacio.env', [
    '',
    '   ',
    '# comentario',
    'sin-igual',
    '=sin-clave',
  ].join('\n'));

  assert.equal(cargar(ruta), 0);
});

test('cargar quita solo comillas envolventes y conserva iguales interiores', () => {
  const ruta = archivo('valores.env', [
    `${PREFIJO}DOBLES="valor con espacios"`,
    `${PREFIJO}SIMPLES='otro valor'`,
    `${PREFIJO}IZQUIERDA="sin cierre`,
    `${PREFIJO}DERECHA=sin inicio'`,
    `${PREFIJO}IGUALES=b=c`,
  ].join('\n'));

  assert.equal(cargar(ruta), 5);
  assert.equal(process.env[`${PREFIJO}DOBLES`], 'valor con espacios');
  assert.equal(process.env[`${PREFIJO}SIMPLES`], 'otro valor');
  assert.equal(process.env[`${PREFIJO}IZQUIERDA`], '"sin cierre');
  assert.equal(process.env[`${PREFIJO}DERECHA`], "sin inicio'");
  assert.equal(process.env[`${PREFIJO}IGUALES`], 'b=c');
});

test('cargar acepta por igual saltos LF y CRLF', () => {
  const rutaLf = archivo('lf.env', `${PREFIJO}LF_UNO=uno\n${PREFIJO}LF_DOS=dos\n`);
  const rutaCrlf = archivo('crlf.env', `${PREFIJO}CRLF_UNO=uno\r\n${PREFIJO}CRLF_DOS=dos\r\n`);

  assert.equal(cargar(rutaLf), 2);
  assert.equal(cargar(rutaCrlf), 2);
  assert.equal(process.env[`${PREFIJO}LF_DOS`], process.env[`${PREFIJO}CRLF_DOS`]);
});

test('cargar respeta el entorno y cuenta solamente las claves puestas', () => {
  process.env[`${PREFIJO}EXISTENTE`] = 'del entorno';
  const ruta = archivo('prioridad.env', [
    `${PREFIJO}EXISTENTE=del archivo`,
    `${PREFIJO}NUEVA=nueva`,
  ].join('\n'));

  assert.equal(cargar(ruta), 1);
  assert.equal(process.env[`${PREFIJO}EXISTENTE`], 'del entorno');
  assert.equal(process.env[`${PREFIJO}NUEVA`], 'nueva');
});

test('cargarUnidad lee Environment con y sin comillas e ignora las demás líneas', () => {
  const ruta = archivo('servicio.service', [
    '[Service]',
    'ExecStart=/usr/bin/node servidor.js',
    `Environment=${PREFIJO}SIMPLE=valor`,
    `Environment="${PREFIJO}ESPACIOS=valor con espacios"`,
  ].join('\n'));

  assert.equal(cargarUnidad(ruta), 2);
  assert.equal(process.env[`${PREFIJO}SIMPLE`], 'valor');
  assert.equal(process.env[`${PREFIJO}ESPACIOS`], 'valor con espacios');
});

test('cargarUnidad carga EnvironmentFile normal y opcional y suma sus claves', () => {
  const primerEnv = archivo('primero.env', `${PREFIJO}ARCHIVO_UNO=uno\n`);
  const segundoEnv = archivo('segundo.env', `${PREFIJO}ARCHIVO_DOS=dos\n`);
  const unidad = archivo('archivos.service', [
    `EnvironmentFile=${primerEnv}`,
    `EnvironmentFile=-${segundoEnv}`,
    `Environment=${PREFIJO}UNIDAD=tres`,
  ].join('\n'));

  assert.equal(cargarUnidad(unidad), 3);
  assert.equal(process.env[`${PREFIJO}ARCHIVO_UNO`], 'uno');
  assert.equal(process.env[`${PREFIJO}ARCHIVO_DOS`], 'dos');
  assert.equal(process.env[`${PREFIJO}UNIDAD`], 'tres');
});

test('cargarUnidad no lanza si un EnvironmentFile no existe', () => {
  const unidad = archivo(
    'ausente.service',
    `EnvironmentFile=-${path.join(os.tmpdir(), `${PREFIJO}ARCHIVO_AUSENTE`)}\n`,
  );

  assert.doesNotThrow(() => cargarUnidad(unidad));
  assert.equal(cargarUnidad(unidad), 0);
});

test('cargarUnidad deja que el entorno gane en la unidad y sus archivos', () => {
  process.env[`${PREFIJO}FIJA`] = 'del entorno';
  const env = archivo('prioridad-unidad.env', [
    `${PREFIJO}FIJA=del archivo`,
    `${PREFIJO}DEL_ARCHIVO=nueva`,
  ].join('\n'));
  const unidad = archivo('prioridad.service', [
    `Environment=${PREFIJO}FIJA=de la unidad`,
    `EnvironmentFile=${env}`,
  ].join('\n'));

  assert.equal(cargarUnidad(unidad), 1);
  assert.equal(process.env[`${PREFIJO}FIJA`], 'del entorno');
  assert.equal(process.env[`${PREFIJO}DEL_ARCHIVO`], 'nueva');
});
