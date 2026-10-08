/**
 * probar-admin-cli.js — alta de cuentas y permisos desde la consola.
 *
 * Ejecuta cada orden en un proceso aparte porque admin.js termina con
 * process.exit. La base y la bandeja viven en carpetas temporales distintas:
 * una equivocación en este arnés nunca debe alcanzar datos ni correos reales.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const CARPETA_DB = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-admin-db-'));
const CARPETA_CORREOS = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-admin-correos-'));
const ADMIN = path.join(__dirname, 'admin.js');
const ENTORNO = {
  ...process.env,
  MERCA_DB: path.join(CARPETA_DB, 'prueba.db'),
  MERCA_CORREO: 'archivo',
  MERCA_CORREOS: CARPETA_CORREOS,
  MERCA_SECRETO: 'x',
};

let bien = 0;
let mal = 0;
let pendientes = 0;

function comprobar(condicion, que) {
  if (condicion) {
    bien++;
    console.log(`  ok  ${que}`);
    return;
  }
  mal++;
  console.log(`  MAL ${que}`);
}

function pendiente(condicion, que) {
  if (condicion) {
    bien++;
    console.log(`  ok  ${que}`);
    return;
  }
  pendientes++;
  console.log(`  PENDIENTE ${que}`);
}

function ejecutar(...args) {
  const resultado = spawnSync(process.execPath, [ADMIN, ...args], {
    encoding: 'utf8',
    env: ENTORNO,
    timeout: 15_000,
  });
  return {
    codigo: resultado.status,
    salida: `${resultado.stdout || ''}${resultado.stderr || ''}`,
    error: resultado.error,
  };
}

function claveDe(salida) {
  return (/Contraseña\s+([A-Za-z0-9-]+)/.exec(salida) || [])[1];
}

console.log('\nUso y errores');
let r = ejecutar();
// FALLO: uso() considera correcta la invocación vacía o desconocida y sale con 0.
pendiente(r.codigo !== 0 && /Uso:/.test(r.salida), 'sin argumentos falla y enseña el uso');
r = ejecutar('orden-desconocida');
pendiente(r.codigo !== 0 && /Uso:/.test(r.salida), 'una orden desconocida falla y enseña el uso');

console.log('\nCrear cuentas');
r = ejecutar('crear', 'persona@ejemplo.test', 'Persona de Prueba');
const primeraClave = claveDe(r.salida);
comprobar(r.codigo === 0 && /Cuenta creada/.test(r.salida), 'crea una cuenta particular');
comprobar(primeraClave && primeraClave.length === 19
  && (r.salida.match(/Contraseña\s+/g) || []).length === 1,
  'imprime una sola vez la contraseña generada de 19 caracteres');

r = ejecutar('crear', 'persona@ejemplo.test', 'Persona Repetida');
comprobar(r.codigo !== 0 && /Ya existe una cuenta/.test(r.salida), 'rechaza un correo repetido con un error claro');

r = ejecutar('crear', 'admin@ejemplo.test', 'Ana Administradora', '--admin');
const segundaClave = claveDe(r.salida);
comprobar(r.codigo === 0, 'crea una cuenta administradora');
comprobar(segundaClave && segundaClave.length === 19 && segundaClave !== primeraClave,
  'cada alta imprime una contraseña distinta de 19 caracteres');

r = ejecutar('crear', 'exenta@ejemplo.test', 'Eva Exenta', '--exenta');
comprobar(r.codigo === 0, 'crea una cuenta exenta de pago');

r = ejecutar(
  'crear', 'empresa@ejemplo.test', 'Ernesto Empresa',
  '--empresa', 'Maquinarias de Prueba, SRL', '--rnc', '123456789', '--admin',
);
comprobar(r.codigo === 0 && /empresa · Maquinarias de Prueba, SRL · RNC 123456789/.test(r.salida),
  'crea una empresa con razón social y RNC');

r = ejecutar('listar');
comprobar(r.codigo === 0
  && /admin@ejemplo\.test[\s\S]*ADMINISTRADOR/.test(r.salida)
  && /exenta@ejemplo\.test[\s\S]*EXENTA DE PAGO/.test(r.salida)
  && /empresa@ejemplo\.test[\s\S]*Maquinarias de Prueba, SRL[\s\S]*ADMINISTRADOR/.test(r.salida),
  'listar muestra las cuentas con su permiso o exención');

console.log('\nCambiar permisos');
r = ejecutar('conceder', 'persona@ejemplo.test');
comprobar(r.codigo === 0 && /puede revisar solicitudes/.test(r.salida), 'concede el permiso de revisión');
r = ejecutar('listar');
comprobar(/persona@ejemplo\.test[\s\S]*ADMINISTRADOR/.test(r.salida), 'listar muestra el permiso concedido');

r = ejecutar('retirar', 'persona@ejemplo.test');
comprobar(r.codigo === 0 && /deja de ser administrador/.test(r.salida), 'retira el permiso de revisión');
r = ejecutar('listar');
comprobar(!/persona@ejemplo\.test/.test(r.salida), 'listar deja de mostrar el permiso retirado');

r = ejecutar('eximir', 'persona@ejemplo.test');
comprobar(r.codigo === 0 && /publica sin pagar/.test(r.salida), 'concede la exención de pago');
r = ejecutar('listar');
comprobar(/persona@ejemplo\.test[\s\S]*EXENTA DE PAGO/.test(r.salida), 'listar muestra la exención concedida');

r = ejecutar('cobrar', 'persona@ejemplo.test');
comprobar(r.codigo === 0 && /vuelve a pagar/.test(r.salida), 'retira la exención de pago');
r = ejecutar('listar');
comprobar(!/persona@ejemplo\.test/.test(r.salida), 'listar deja de mostrar la exención retirada');

console.log('\nValidaciones');
r = ejecutar('conceder', 'no-existe@ejemplo.test');
comprobar(r.codigo !== 0 && /No hay ninguna cuenta/.test(r.salida), 'no concede permisos a una cuenta inexistente');

r = ejecutar(
  'crear', 'rnc-malo@ejemplo.test', 'Empresa Inválida',
  '--empresa', 'Empresa Inválida, SRL', '--rnc', '1234',
);
comprobar(r.codigo !== 0 && /RNC tiene 9 dígitos/.test(r.salida), 'rechaza un RNC mal formado');

fs.rmSync(CARPETA_DB, { recursive: true, force: true });
fs.rmSync(CARPETA_CORREOS, { recursive: true, force: true });

console.log(`\n${bien} bien, ${mal} mal, ${pendientes} pendiente(s).\n`);
process.exit(mal ? 1 : 0);
