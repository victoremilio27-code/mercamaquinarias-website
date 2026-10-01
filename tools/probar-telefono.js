/**
 * probar-telefono.js — el celular de la cuenta y los códigos por SMS (fase 10.2).
 *
 *   node tools/probar-telefono.js
 *
 * POR QUÉ EXISTE
 *
 * Aquí se decide qué celular sirve para entrar a una cuenta. Un fallo no da
 * un error visible: da una cuenta en manos de quien tiene una SIM duplicada.
 * Por eso se comprueba lo que nadie ve leyendo el código: que un código sirve
 * una sola vez y solo para su propósito y su número, que dos cuentas no
 * pueden tener verificado el mismo celular, que «No fui yo» deja la cuenta
 * sin celular verificado y que la migración no pierde nada de una base de la
 * 10.1.
 *
 * Corre contra una base TEMPORAL —`.tmp/prueba-telefono/`— que se borra y se
 * rehace en cada ejecución. No toca la base real ni manda nada: los correos y
 * los SMS, si los hubiera, van a archivo.
 *
 * El plan 04 y el 05 añaden aquí las rutas de la API (por eso `api.js` todavía
 * no se carga).
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { execFileSync } = require('child_process');

/* Antes de cargar db.js: la ruta del archivo se resuelve al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-telefono');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
for (const v of ['MERCA_SMS', 'MERCA_SMS_TOPE_DIA', 'MERCA_SMS_RUTA', 'MERCA_SMS_REMITENTE', 'BREVO_API_KEY']) {
  delete process.env[v];
}

const { EventEmitter } = require('events');

const db = require('./db.js');
const correo = require('./correo.js');
const api = require('./api.js');
const legales = require('../assets/legales.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) {
    bien++;
    console.log(`  ok  ${que}`);
    return;
  }
  mal++;
  console.log(`  MAL ${que}`);
}
const seccion = (titulo) => console.log(`\n${titulo}`);

/* Revisión de la fase 12: nada de esta prueba depende del reloj. Lo vencido
   se fuerza a PASADO y lo vigente a FUTURO; si una prueba de ruta necesita
   «hace un día», se calcula en SQL con
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'), nunca con el reloj de JS. */
const PASADO = '2000-01-01T00:00:00.000Z';
const FUTURO = '2999-01-01T00:00:00.000Z';
const DESDE_FIJO = new Date('2026-01-01T00:00:00.000Z');

const CLAVE = 'UnaClaveLargaYSegura9';

/* La bandeja de correos es compartida con otras pruebas: se leen solo los
   archivos que no estaban en la última lectura. */
const vistos = new Set(fs.existsSync(correo.BANDEJA) ? fs.readdirSync(correo.BANDEJA) : []);
function nuevos() {
  if (!fs.existsSync(correo.BANDEJA)) return [];
  const salida = [];
  for (const nombre of fs.readdirSync(correo.BANDEJA).sort()) {
    if (vistos.has(nombre)) continue;
    vistos.add(nombre);
    if (!nombre.endsWith('.txt')) continue;
    const t = fs.readFileSync(path.join(correo.BANDEJA, nombre), 'utf8');
    salida.push({
      para: (/^Para: (.*)$/m.exec(t) || [])[1],
      asunto: (/^Asunto: (.*)$/m.exec(t) || [])[1],
      texto: t,
    });
  }
  return salida;
}

/* Lo mismo para la bandeja de SMS: el número va al final del nombre del
   archivo (`…-8095551234.txt`) y el código son los seis dígitos del texto. */
const vistosSms = new Set(fs.existsSync(correo.BANDEJA_SMS) ? fs.readdirSync(correo.BANDEJA_SMS) : []);
function nuevosSms() {
  if (!fs.existsSync(correo.BANDEJA_SMS)) return [];
  const salida = [];
  for (const nombre of fs.readdirSync(correo.BANDEJA_SMS).sort()) {
    if (vistosSms.has(nombre)) continue;
    vistosSms.add(nombre);
    if (!nombre.endsWith('.txt')) continue;
    const t = fs.readFileSync(path.join(correo.BANDEJA_SMS, nombre), 'utf8');
    salida.push({
      numero: (/-(\d{10})\.txt$/.exec(nombre) || [])[1],
      texto: t,
      codigo: (/\b(\d{6})\b/.exec(t) || [])[1] || null,
    });
  }
  return salida;
}

const fila = (sql, ...args) => db.abrir().prepare(sql).get(...args);
const todas = (sql, ...args) => db.abrir().prepare(sql).all(...args);

let contador = 0;
function cuenta(correoCuenta, nombre, { telefono = '8095550000', telefonoEmpresa, dealer } = {}) {
  const datos = {
    correo: correoCuenta, clave: CLAVE, nombre, telefono, telefonoEmpresa,
    tipo: dealer ? 'dealer' : 'particular',
  };
  if (dealer) {
    Object.assign(datos, {
      empresa: dealer, rnc: String(132000000 + (++contador)),
      direccion: 'Calle Principal No. 10', provincia: 'santo-domingo',
      solicitud: { encargado: nombre, aniosOperando: 5 },
    });
  }
  return db.crearCuenta(datos).idUsuario;
}

/* Para comparar la DDL de dos tablas: SQLite reescribe las comillas al
   renombrar y no conserva el «IF NOT EXISTS». */
function normalizarDdl(s) {
  return String(s)
    .replace(/"/g, '')
    .replace(/IF NOT EXISTS /g, '')
    .replace(/cambios_correo_nueva/g, 'cambios_correo')
    .replace(/\s+/g, ' ')
    .replace(/\s*([(),])\s*/g, '$1')
    .trim();
}

/* ── 1. La migración ─────────────────────────────────────────── */
seccion('1. La migración 2026-10-telefono-cuenta');
{
  const d = db.abrir();
  const anotadas = d.prepare('SELECT id FROM migraciones ORDER BY rowid').all().map((r) => r.id);
  const pos = anotadas.indexOf('2026-10-telefono-cuenta');
  comprobar(pos >= 0 && pos > anotadas.indexOf('2026-10-cuenta-recuperacion') && anotadas.indexOf('2026-10-cuenta-recuperacion') >= 0,
    'se anotó después de 2026-10-cuenta-recuperacion');
  comprobar(anotadas.filter((x) => x === '2026-10-telefono-cuenta').length === 1, 'anotada una sola vez');

  const colsUsuarios = d.prepare('PRAGMA table_info(usuarios)').all().map((c) => c.name);
  comprobar(colsUsuarios.includes('telefono_verificado') && colsUsuarios.includes('enfriamiento_hasta'),
    'usuarios tiene telefono_verificado y enfriamiento_hasta');
  const indice = fila("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'ux_usuarios_telefono_verificado'");
  comprobar(!!indice && /WHERE telefono_verificado IS NOT NULL/.test(indice.sql), 'el índice único de celular verificado es parcial');
  for (const t of ['codigos_telefono', 'cambios_telefono']) {
    comprobar(!!fila("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", t), `existe la tabla ${t}`);
  }
  for (const i of ['ix_codigos_telefono_vigentes', 'ux_codigos_telefono_autoriza', 'ix_cambios_telefono_usuario']) {
    comprobar(!!fila("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?", i), `existe el índice ${i}`);
  }

  const esquema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  comprobar(!esquema.includes('telefono_verificado') && !esquema.includes('codigos_telefono'),
    'db/schema.sql no contiene nada de la migración (abrir() lo ejecuta antes que migrar())');

  /* La DDL de cambios_correo, igual a la de la 10.1 salvo el CHECK. */
  const fuente = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  const desde = fuente.indexOf("['2026-10-cuenta-recuperacion'");
  const ini = fuente.indexOf('CREATE TABLE IF NOT EXISTS cambios_correo (', desde);
  const fin = fuente.indexOf(')`', ini);
  const ddl101 = desde > 0 && ini > desde && fin > ini ? fuente.slice(ini, fin + 1) : '';
  const actual = fila("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cambios_correo'").sql;
  comprobar(ddl101.length > 100, 'se encontró la DDL de cambios_correo de la 10.1 en tools/db.js');
  comprobar(normalizarDdl(actual).replace(",'sms'", '') === normalizarDdl(ddl101),
    'cambios_correo: la DDL es la de la 10.1 salvo el CHECK de via');
  comprobar(/,'sms'/.test(normalizarDdl(actual)), 'el CHECK de via admite sms');

  /* Base vieja: la copia con la migración deshecha, abierta en un hijo. */
  const copia = path.join(BANCO, 'vieja.db');
  d.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);
  const v = new DatabaseSync(copia);
  v.exec("DELETE FROM migraciones WHERE id = '2026-10-telefono-cuenta'");
  v.exec('DROP INDEX ux_usuarios_telefono_verificado');
  v.exec('DROP TABLE codigos_telefono');
  v.exec('DROP TABLE cambios_telefono');
  v.exec('DROP TABLE cambios_correo');
  v.exec(ddl101);
  v.exec('CREATE INDEX IF NOT EXISTS ix_cambios_correo_usuario ON cambios_correo (usuario_id)');
  v.exec('CREATE UNIQUE INDEX IF NOT EXISTS ux_cambios_correo_revertir ON cambios_correo (revertir_hash)');
  v.exec('ALTER TABLE usuarios DROP COLUMN enfriamiento_hasta');
  v.exec('ALTER TABLE usuarios DROP COLUMN telefono_verificado');
  v.exec(`INSERT INTO usuarios (id, correo, nombre, clave_hash, clave_sal, creado)
          VALUES ('u-vieja', 'vieja@ejemplo.test', 'Vieja', 'h', 's', '${PASADO}')`);
  v.exec(`INSERT INTO cambios_correo (id, usuario_id, anterior, nuevo, via, creado)
          VALUES ('cc-viejo', 'u-vieja', 'a@ejemplo.test', 'vieja@ejemplo.test', 'usuario', '${PASADO}')`);
  v.close();

  const salida = execFileSync(process.execPath, ['-e', `
    const db = require(${JSON.stringify(path.join(__dirname, 'db.js'))});
    const d = db.abrir();
    const cols = (t) => d.prepare('PRAGMA table_info(' + t + ')').all().map((c) => c.name + ':' + c.type + ':' + c.notnull + ':' + c.dflt_value).sort();
    const veces = d.prepare("SELECT COUNT(*) AS n FROM migraciones WHERE id = '2026-10-telefono-cuenta'").get().n;
    const vieja = d.prepare("SELECT via FROM cambios_correo WHERE id = 'cc-viejo'").get();
    let sms = null;
    try {
      d.prepare("INSERT INTO cambios_correo (id, usuario_id, anterior, nuevo, via, creado) VALUES ('cc-sms', 'u-vieja', 'x@ejemplo.test', 'y@ejemplo.test', 'sms', 'x')").run();
      sms = true;
    } catch (e) { sms = e.message; }
    console.log(JSON.stringify({
      usuarios: cols('usuarios'), cambios_correo: cols('cambios_correo'),
      codigos_telefono: cols('codigos_telefono'), cambios_telefono: cols('cambios_telefono'),
      veces, via: vieja && vieja.via, sms,
    }));
  `], { env: { ...process.env, MERCA_DB: copia }, encoding: 'utf8' });
  const vieja = JSON.parse(salida.trim().split('\n').pop());
  const cols = (t) => d.prepare(`PRAGMA table_info(${t})`).all().map((c) => `${c.name}:${c.type}:${c.notnull}:${c.dflt_value}`).sort();
  for (const t of ['usuarios', 'cambios_correo', 'codigos_telefono', 'cambios_telefono']) {
    comprobar(JSON.stringify(vieja[t]) === JSON.stringify(cols(t)), `${t}: la base vieja migrada y la nueva tienen las mismas columnas`);
  }
  comprobar(vieja.veces === 1, 'la migración corrió una vez sobre la base vieja');
  comprobar(vieja.via === 'usuario', 'la fila vieja de cambios_correo se conservó');
  comprobar(vieja.sms === true, 'la base vieja migrada admite una fila con via sms');
}

/* Un código que no es el que se emitió. */
const otroCodigo = (c) => (c === '000000' ? '111111' : '000000');
const lanza = (fn) => { try { fn(); return null; } catch (e) { return e; } };

/* ── 2. celularRd y crearCuenta ──────────────────────────────── */
seccion('2. celularRd y crearCuenta');
{
  comprobar(db.celularRd('(809) 555-1234') === '8095551234', 'celularRd: formato con paréntesis y guion');
  comprobar(db.celularRd('18295551234') === '8295551234', 'celularRd: quita el 1 internacional');
  comprobar(db.celularRd('849-555-1234') === '8495551234', 'celularRd: acepta 849');
  comprobar(db.celularRd('8005551234') === null, 'celularRd: 800 no es dominicano');
  comprobar(db.celularRd('809555123') === null, 'celularRd: nueve dígitos no sirven');
  comprobar(db.celularRd(null) === null, 'celularRd: null da null');
  comprobar(JSON.stringify(db.AREAS_RD) === '["809","829","849"]' && Object.isFrozen(db.AREAS_RD), 'AREAS_RD congelada');

  const p = cuenta('particular-2@ejemplo.test', 'Particular', { telefono: '(829) 555-0101' });
  const up = db.usuarioPorId(p);
  comprobar(up.telefono === '8295550101', 'particular: usuarios.telefono queda en 10 dígitos');
  comprobar(up.telefono_verificado === null && up.enfriamiento_hasta === null, 'particular: nace sin verificar y sin enfriamiento');

  const d1 = cuenta('dealer-2a@ejemplo.test', 'Dealer A', { telefono: '8095550202', telefonoEmpresa: '8095550303', dealer: 'Empresa A' });
  const o1 = db.organizacionDe(d1);
  comprobar(db.usuarioPorId(d1).telefono === '8095550202', 'dealer: el usuario guarda su celular');
  comprobar(o1.telefono === '8095550303', 'dealer: la organización guarda el teléfono de la empresa');
  comprobar(db.sucursalPrincipal(o1.id).telefono === '8095550303', 'dealer: la sucursal principal guarda el de la empresa');

  const d2 = cuenta('dealer-2b@ejemplo.test', 'Dealer B', { telefono: '8095550404', dealer: 'Empresa B' });
  const o2 = db.organizacionDe(d2);
  comprobar(o2.telefono === '8095550404' && db.sucursalPrincipal(o2.id).telefono === '8095550404',
    'dealer sin teléfono de empresa: se usa el celular');
}

/* ── 3. Códigos SMS ──────────────────────────────────────────── */
seccion('3. Códigos SMS');
{
  const u = cuenta('codigos-3@ejemplo.test', 'Codigos', { telefono: '8295550101' });
  const N = '8295550101';
  const c = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'verificar' });
  comprobar(/^\d{6}$/.test(c.codigo), 'el código tiene 6 dígitos');
  comprobar(c.minutos === 15 && c.numero === N && !!c.id, 'devuelve id, minutos y número');
  const f = fila('SELECT * FROM codigos_telefono WHERE id = ?', c.id);
  comprobar(Date.parse(f.expira) - Date.parse(f.creado) === 900000, 'vence exactamente a los 15 minutos');
  comprobar(!JSON.stringify(f).includes(c.codigo), 'el código no queda en la base, solo su firma');
  comprobar(db.MINUTOS_SMS.restablecer === 20 && db.MINUTOS_SMS.clave === 20 && db.MINUTOS_SMS.recuperar === 15 && db.MINUTOS_SMS.cambio === 15,
    'vencimientos por propósito');
  comprobar(JSON.stringify(db.PROPOSITOS_SMS) === '["verificar","cambio","restablecer","clave","recuperar"]'
    && Object.isFrozen(db.PROPOSITOS_SMS), 'PROPOSITOS_SMS congelada y completa');

  const e1 = lanza(() => db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'otro' }));
  comprobar(e1 && e1.codigo === 400, 'un propósito fuera de la lista lanza 400');
  const e2 = lanza(() => db.crearCodigoTelefono({ idUsuario: u, numero: '8005551234', proposito: 'verificar' }));
  comprobar(e2 && e2.codigo === 400, 'un número fuera de 809/829/849 lanza 400');

  const c2 = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'verificar' });
  comprobar(fila('SELECT consumido FROM codigos_telefono WHERE id = ?', c.id).consumido === 1,
    'un segundo código anula el primero');

  const mal1 = db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'verificar', codigo: otroCodigo(c2.codigo) });
  comprobar(!mal1.ok && mal1.motivo === 'incorrecto' && mal1.restantes === 4,
    'un código equivocado da incorrecto con 4 intentos restantes');

  /* Intentos: cinco fallos y el bueno ya no vale. */
  const a = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'cambio' });
  const restantes = [];
  for (let i = 0; i < 5; i++) {
    restantes.push(db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'cambio', codigo: otroCodigo(a.codigo) }).restantes);
  }
  comprobar(restantes.join(',') === '4,3,2,1,0', 'los intentos restantes bajan 4,3,2,1,0');
  const ag = db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'cambio', codigo: a.codigo });
  comprobar(!ag.ok && ag.motivo === 'agotado', 'tras 5 fallos, el código bueno da agotado');
  comprobar(fila('SELECT consumido FROM codigos_telefono WHERE id = ?', a.id).consumido === 1, 'agotado queda consumido');

  /* Vencido. */
  const v = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'restablecer' });
  db.abrir().prepare('UPDATE codigos_telefono SET expira = ? WHERE id = ?').run(PASADO, v.id);
  const rv = db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'restablecer', codigo: v.codigo });
  comprobar(!rv.ok && rv.motivo === 'vencido', 'un código con expira en el pasado da vencido');

  /* Propósito y número cuentan. */
  const x = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'clave' });
  comprobar(db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'recuperar', codigo: x.codigo }).motivo === 'inexistente',
    'el código de un propósito no vale para otro');
  comprobar(db.verificarCodigoTelefono({ idUsuario: u, numero: '8295559999', proposito: 'clave', codigo: x.codigo }).motivo === 'inexistente',
    'el código de un número no vale para otro');
  comprobar(db.verificarCodigoTelefono({ idUsuario: 'otro-usuario', numero: N, proposito: 'clave', codigo: x.codigo }).motivo === 'inexistente',
    'el código de una cuenta no vale para otra');

  const bien1 = db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'clave', codigo: ` ${x.codigo} ` });
  comprobar(bien1.ok === true && bien1.id === x.id, 'el código correcto acierta (con espacios alrededor)');
  comprobar(db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'clave', codigo: x.codigo }).motivo === 'inexistente',
    'repetido: ya no existe');
}

/* ── 4. Testigo de la recuperación ───────────────────────────── */
seccion('4. Testigo de la recuperación');
{
  const u = cuenta('testigo-4@ejemplo.test', 'Testigo', { telefono: '8295550101' });
  const N = '8295550101';
  const sacar = () => {
    const c = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'recuperar' });
    const r = db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'recuperar', codigo: c.codigo });
    return r.id;
  };
  const idOk = sacar();
  const testigo = db.autorizarRecuperacion(idOk);
  comprobar(/^[0-9a-f]{64}$/.test(testigo), 'el testigo son 64 hex');
  comprobar(!JSON.stringify(fila('SELECT * FROM codigos_telefono WHERE id = ?', idOk)).includes(testigo),
    'el testigo no está en la base, solo su firma');
  const l = db.leerAutorizacion(testigo);
  comprobar(l.ok === true && l.id === idOk && l.idUsuario === u && l.numero === N, 'leerAutorizacion devuelve id, usuario y número');
  comprobar(db.gastarAutorizacion(testigo) === true, 'gastar: la primera vez true');
  comprobar(db.gastarAutorizacion(testigo) === false, 'gastar: la segunda false');
  comprobar(db.leerAutorizacion(testigo).motivo === 'usado', 'leer tras gastar da usado');
  comprobar(lanza(() => db.autorizarRecuperacion(idOk)) !== null, 'una fila ya autorizada no se autoriza otra vez');

  const idVenc = sacar();
  const tVenc = db.autorizarRecuperacion(idVenc);
  db.abrir().prepare('UPDATE codigos_telefono SET autoriza_expira = ? WHERE id = ?').run(PASADO, idVenc);
  comprobar(db.leerAutorizacion(tVenc).motivo === 'vencido', 'autoriza_expira en el pasado da vencido');
  comprobar(db.leerAutorizacion('ab'.repeat(32)).motivo === 'inexistente', 'un testigo al azar da inexistente');
  comprobar(db.leerAutorizacion(undefined).motivo === 'inexistente', 'sin testigo da inexistente');

  const sinConsumir = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'recuperar' });
  const e1 = lanza(() => db.autorizarRecuperacion(sinConsumir.id));
  comprobar(e1 && e1.codigo === 400, 'autorizar una fila no consumida lanza 400');
  const otroProp = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'verificar' });
  db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'verificar', codigo: otroProp.codigo });
  const e2 = lanza(() => db.autorizarRecuperacion(otroProp.id));
  comprobar(e2 && e2.codigo === 400, 'autorizar una fila de otro propósito lanza 400');
  comprobar(lanza(() => db.autorizarRecuperacion('no-existe')) !== null, 'autorizar una fila inexistente lanza');
}

/* ── 5. Unicidad, guardar sin verificar y quitar ─────────────── */
seccion('5. Unicidad, guardar sin verificar y quitar');
{
  const A = cuenta('unica-5a@ejemplo.test', 'Cuenta A', { telefono: '8095550001' });
  const B = cuenta('unica-5b@ejemplo.test', 'Cuenta B', { telefono: '8295550002' });
  const N = '8095550001';

  const rA = db.verificarTelefonoCuenta({ idUsuario: A, numero: N, via: 'verificado', ip: '201.1.1.1' });
  comprobar(rA.numero === N && rA.liberados.length === 0, 'A verifica: nadie liberado');
  comprobar(!!db.usuarioPorId(A).telefono_verificado, 'A queda con telefono_verificado');

  const rB = db.verificarTelefonoCuenta({ idUsuario: B, numero: N, via: 'cambio' });
  comprobar(rB.liberados.length === 1 && rB.liberados[0].id === A && rB.liberados[0].correo === 'unica-5a@ejemplo.test'
    && rB.liberados[0].nombre === 'Cuenta A', 'B verifica el mismo número: A queda liberada y se devuelve para avisarle');
  comprobar(rB.anterior === '8295550002', 'devuelve el celular anterior de B');
  comprobar(db.usuarioPorId(A).telefono_verificado === null, 'A pierde la verificación');
  comprobar(!!db.usuarioPorId(B).telefono_verificado && db.usuarioPorId(B).telefono === N, 'B se queda el número verificado');
  const cA = todas('SELECT * FROM cambios_telefono WHERE usuario_id = ?', A);
  const cB = todas('SELECT * FROM cambios_telefono WHERE usuario_id = ?', B);
  comprobar(cA.some((x) => x.via === 'liberado' && x.anterior === N && x.nuevo === null), 'A: fila liberado en la bitácora');
  comprobar(cB.some((x) => x.via === 'cambio' && x.nuevo === N && x.anterior === '8295550002'), 'B: fila del cambio en la bitácora');
  comprobar(cA.some((x) => x.via === 'verificado' && x.nuevo === N), 'A: fila verificado en la bitácora');

  const eu = lanza(() => db.abrir().prepare('UPDATE usuarios SET telefono_verificado = ? WHERE id = ?').run(PASADO, A));
  comprobar(eu && /UNIQUE/i.test(eu.message), 'dos verificados con el mismo número: lo impide el índice');

  const e1 = lanza(() => db.verificarTelefonoCuenta({ idUsuario: A, numero: '8005550000', via: 'verificado' }));
  comprobar(e1 && e1.codigo === 400, 'verificar un número fuera de área lanza 400');
  const e2 = lanza(() => db.verificarTelefonoCuenta({ idUsuario: A, numero: '8095550009', via: 'otra' }));
  comprobar(e2 && e2.codigo === 400, 'una vía no válida lanza 400');

  /* Guardar sin verificar. */
  const g = db.guardarTelefonoSinVerificar({ idUsuario: A, numero: '(829) 555-0707', ip: '201.1.1.2' });
  comprobar(g.numero === '8295550707' && g.anterior === N && db.usuarioPorId(A).telefono === '8295550707',
    'guardar sin verificar normaliza el número');
  comprobar(todas('SELECT 1 FROM cambios_telefono WHERE usuario_id = ? AND via = ?', A, 'sin_verificar').length === 1,
    'guardar sin verificar anota sin_verificar');
  const e3 = lanza(() => db.guardarTelefonoSinVerificar({ idUsuario: B, numero: '8095550010' }));
  comprobar(e3 && e3.codigo === 409, 'guardar sin verificar en una cuenta verificada lanza 409');
  const e4 = lanza(() => db.guardarTelefonoSinVerificar({ idUsuario: A, numero: '123' }));
  comprobar(e4 && e4.codigo === 400, 'guardar un número no válido lanza 400');

  /* Quitar la verificación. */
  const pend = db.crearCodigoTelefono({ idUsuario: B, numero: N, proposito: 'cambio' });
  comprobar(db.quitarVerificacionTelefono({ idUsuario: B, ip: '201.1.1.3' }) === true, 'quitar: la primera vez true');
  comprobar(db.usuarioPorId(B).telefono_verificado === null, 'quitar: la cuenta queda sin verificar');
  comprobar(fila('SELECT consumido FROM codigos_telefono WHERE id = ?', pend.id).consumido === 1, 'quitar: anula los códigos pendientes');
  comprobar(todas('SELECT 1 FROM cambios_telefono WHERE usuario_id = ? AND via = ?', B, 'reversion').length === 1,
    'quitar: anota reversion');
  comprobar(db.quitarVerificacionTelefono({ idUsuario: B }) === false, 'quitar: la segunda vez false');
}

/* ── 6. Enfriamiento y acción por SMS reciente ───────────────── */
seccion('6. Enfriamiento y acción por SMS reciente');
{
  const H = '2030-01-01T00:00:00.000Z';
  comprobar(db.enEnfriamiento({ enfriamiento_hasta: H }, '2029-12-31T23:59:59.999Z') === true, 'enEnfriamiento: un milisegundo antes del final');
  comprobar(db.enEnfriamiento({ enfriamiento_hasta: H }, H) === false, 'enEnfriamiento: en el instante exacto ya no');
  comprobar(db.enEnfriamiento({ enfriamiento_hasta: null }, H) === false, 'enEnfriamiento: null es false');
  comprobar(db.enEnfriamiento(undefined) === false, 'enEnfriamiento: sin usuario es false');

  comprobar(db.accionSmsReciente({ enfriamiento_hasta: H }, '2030-01-07T23:59:59.999Z') === true, 'accionSmsReciente: dentro de los 7 días siguientes');
  comprobar(db.accionSmsReciente({ enfriamiento_hasta: H }, '2030-01-08T00:00:00.000Z') === false, 'accionSmsReciente: a los 7 días exactos ya no');
  comprobar(db.accionSmsReciente({ enfriamiento_hasta: null }, H) === false, 'accionSmsReciente: sin enfriamiento es false');
  comprobar(db.accionSmsReciente(null) === false, 'accionSmsReciente: sin usuario es false');
  comprobar(db.HORAS_ENFRIAMIENTO_SMS === 72 && db.DIAS_ACCION_SMS_RECIENTE === 7, 'constantes: 72 h y 7 días');

  const u = cuenta('enfria-6@ejemplo.test', 'Enfria');
  const hasta = db.ponerEnfriamiento(u, { desde: DESDE_FIJO });
  comprobar(hasta === '2026-01-04T00:00:00.000Z', 'ponerEnfriamiento devuelve desde + 72 h');
  comprobar(db.usuarioPorId(u).enfriamiento_hasta === '2026-01-04T00:00:00.000Z', 'ponerEnfriamiento lo guarda');
  db.abrir().prepare('UPDATE usuarios SET enfriamiento_hasta = ? WHERE id = ?').run(FUTURO, u);
  comprobar(db.ponerEnfriamiento(u, { desde: DESDE_FIJO }) === FUTURO && db.usuarioPorId(u).enfriamiento_hasta === FUTURO,
    'ponerEnfriamiento no acorta uno más largo');
  db.quitarEnfriamiento(u);
  comprobar(db.usuarioPorId(u).enfriamiento_hasta === null, 'quitarEnfriamiento lo deja en NULL');
}

/* ── 7. «No fui yo» ampliado y expediente ────────────────────── */
seccion('7. «No fui yo» ampliado y expediente');
{
  const probarVia = (via, correoCuenta, telefono, verificar) => {
    const u = cuenta(correoCuenta, `Via ${via}`, { telefono });
    if (verificar) db.verificarTelefonoCuenta({ idUsuario: u, numero: telefono, via: 'verificado' });
    db.ponerEnfriamiento(u, { desde: DESDE_FIJO });
    db.abrir().prepare('UPDATE usuarios SET enfriamiento_hasta = ? WHERE id = ?').run(FUTURO, u);
    const pend = db.crearCodigoTelefono({ idUsuario: u, numero: telefono, proposito: 'recuperar' });
    const cambio = db.cambiarCorreo({ idUsuario: u, nuevo: `nuevo-${via}-${correoCuenta}`, via, ip: '201.2.2.2',
      verificado: true, conReversion: true });
    const r = db.revertirCambioCorreo(cambio.testigoRevertir, '201.2.2.3');
    return { u, pend, r };
  };

  const s = probarVia('sms', 'noyo-7a@ejemplo.test', '8295550701', true);
  comprobar(s.r.ok === true && s.r.telefonoQuitado === true, 'via sms: revertir quita el celular verificado');
  comprobar(db.usuarioPorId(s.u).telefono_verificado === null, 'via sms: telefono_verificado NULL');
  comprobar(db.usuarioPorId(s.u).enfriamiento_hasta === null, 'via sms: el enfriamiento se borra');
  comprobar(fila('SELECT consumido FROM codigos_telefono WHERE id = ?', s.pend.id).consumido === 1, 'via sms: los códigos SMS pendientes quedan anulados');
  comprobar(db.usuarioPorId(s.u).correo === 'noyo-7a@ejemplo.test', 'via sms: el correo vuelve al anterior');
  comprobar(todas('SELECT 1 FROM cambios_telefono WHERE usuario_id = ? AND via = ?', s.u, 'reversion').length === 1,
    'via sms: la bitácora anota reversion');

  const w = probarVia('usuario', 'noyo-7b@ejemplo.test', '8295550702', true);
  comprobar(w.r.ok === true && w.r.telefonoQuitado === true && db.usuarioPorId(w.u).telefono_verificado === null,
    'via usuario: también quita el celular verificado');

  const n = probarVia('usuario', 'noyo-7c@ejemplo.test', '8295550703', false);
  comprobar(n.r.ok === true && n.r.telefonoQuitado === false, 'sin celular verificado: telefonoQuitado false');
  comprobar(db.usuarioPorId(n.u).enfriamiento_hasta === null && fila('SELECT consumido FROM codigos_telefono WHERE id = ?', n.pend.id).consumido === 1,
    'sin celular verificado: igual borra enfriamiento y anula códigos');

  /* Expediente. */
  const u = cuenta('expediente-7@ejemplo.test', 'Expediente', { telefono: '8295550704' });
  db.verificarTelefonoCuenta({ idUsuario: u, numero: '8295550704', via: 'verificado' });
  db.abrir().prepare('UPDATE usuarios SET enfriamiento_hasta = ? WHERE id = ?').run(FUTURO, u);
  const sol = db.crearSolicitudRecuperacion({ correoCuenta: 'expediente-7@ejemplo.test', correoContacto: 'contacto-7@ejemplo.test',
    nombre: 'Expediente', telefono: '8295550704', detalle: 'Perdí el acceso a mi correo', ip: '201.2.2.4' });
  const exp = db.expedienteRecuperacion(sol.id);
  comprobar(!!exp.cuenta.telefono_verificado, 'expediente: cuenta.telefono_verificado');
  comprobar(exp.cuenta.enfriamiento_hasta === FUTURO, 'expediente: cuenta.enfriamiento_hasta');
  comprobar(Array.isArray(exp.cambiosTelefono) && exp.cambiosTelefono.length >= 1
    && exp.cambiosTelefono[0].via === 'verificado', 'expediente: cambiosTelefono trae la bitácora');
  const sinCuenta = db.crearSolicitudRecuperacion({ correoCuenta: 'no-existe-7@ejemplo.test', correoContacto: 'otro-7@ejemplo.test',
    nombre: 'Nadie', detalle: 'Sin cuenta', ip: '201.2.2.5' });
  const expVacio = db.expedienteRecuperacion(sinCuenta.id);
  comprobar(expVacio.cuenta === null && Array.isArray(expVacio.cambiosTelefono) && expVacio.cambiosTelefono.length === 0,
    'expediente sin cuenta: cambiosTelefono es []');
}

/* ── 8. purgar ───────────────────────────────────────────────── */
seccion('8. purgar');
{
  const u = cuenta('purga-8@ejemplo.test', 'Purga', { telefono: '8295550801' });
  const ins = db.abrir().prepare(`INSERT INTO codigos_telefono
    (id, usuario_id, numero, proposito, codigo_hash, expira, creado) VALUES (?, ?, '8295550801', 'verificar', 'x', ?, ?)`);
  ins.run('purga-vieja', u, PASADO, PASADO);
  ins.run('purga-vigente', u, FUTURO, PASADO);
  db.purgar();
  comprobar(!fila("SELECT 1 FROM codigos_telefono WHERE id = 'purga-vieja'"), 'purgar borra el código vencido');
  comprobar(!!fila("SELECT 1 FROM codigos_telefono WHERE id = 'purga-vigente'"), 'purgar deja el código vigente');
}

/* ── Arnés de la API (plan 04) ───────────────────────────────── */

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Copia del arnés de probar-cuenta.js (cada prueba lleva el suyo, a
   propósito), guardando además las cabeceras de la respuesta. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-telefono', ...cabeceras };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      cabeceras: {},
      setHeader() {},
      writeHead(c, cab) { res.codigo = c; res.cabeceras = cab || {}; return res; },
      destroy() {},
      end(d) {
        let datos = null;
        try { datos = d ? JSON.parse(d) : null; } catch { datos = null; }
        resolver({ codigo: res.codigo, datos, cabeceras: res.cabeceras });
      },
    };

    const ruta = new URL(url, 'http://localhost').pathname;
    api.manejar(req, res, ruta);
    setImmediate(() => {
      if (cuerpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(cuerpo), 'utf8'));
      req.emit('end');
    });
  });
}

/* IP distinta por llamada salvo que se diga: los topes por IP no deben
   mezclarse entre bloques. */
let contadorIp = 0;
const nuevaIp = () => `201.9.${Math.floor(++contadorIp / 250)}.${contadorIp % 250 + 1}`;
const como = (testigo, ip) => ({
  ...(testigo ? { cookie: `te_sesion=${testigo}` } : {}),
  'cf-connecting-ip': ip || nuevaIp(),
});
const post = (url, cuerpo, cabeceras) => pedir({ metodo: 'POST', url, cuerpo, cabeceras });
const patch = (url, cuerpo, cabeceras) => pedir({ metodo: 'PATCH', url, cuerpo, cabeceras });
const put = (url, cuerpo, cabeceras) => pedir({ metodo: 'PUT', url, cuerpo, cabeceras });
const obtener = (url, cabeceras) => pedir({ url, cabeceras });
const acepta = () => Object.fromEntries(legales.OBLIGATORIOS.map((d) => [d.id, d.version]));
const sesionDe = (idUsuario) => como(db.abrirSesion(idUsuario));

const MENSAJE_CELULAR = 'Indique su celular: 10 dígitos que empiecen por 809, 829 o 849';
const datosRegistro = (correoCuenta, extra = {}) => ({
  correo: correoCuenta, clave: CLAVE, nombre: 'Persona de Prueba', acepta: acepta(), ...extra,
});

async function main() {
/* ── 10. Registro con celular ────────────────────────────────── */
seccion('10. Registro con celular');
{
  let r = await post('/api/cuenta/registro', datosRegistro('reg-10a@ejemplo.test'), como(null));
  comprobar(r.codigo === 400 && r.datos.error === MENSAJE_CELULAR, 'sin celular: 400 con el texto del contrato');
  r = await post('/api/cuenta/registro', datosRegistro('reg-10b@ejemplo.test', { telefono: '8005551234' }), como(null));
  comprobar(r.codigo === 400 && r.datos.error === MENSAJE_CELULAR, 'celular 800: 400 con el texto del contrato');
  comprobar(!db.usuarioPorCorreo('reg-10b@ejemplo.test'), 'el 400 no deja cuenta creada');

  r = await post('/api/cuenta/registro', datosRegistro('reg-10c@ejemplo.test', { telefono: '(829) 555-0101' }), como(null));
  comprobar(r.codigo === 201, 'celular válido con formato: 201');
  const u = db.usuarioPorCorreo('reg-10c@ejemplo.test');
  comprobar(u && u.telefono === '8295550101' && u.telefono_verificado === null, 'queda en 10 dígitos y sin verificar');

  const dealer = (correoCuenta, extra) => datosRegistro(correoCuenta, {
    tipo: 'dealer', empresa: 'Empresa de Prueba', rnc: String(133000000 + (++contador)),
    direccion: 'Calle Principal No. 10', provincia: 'santo-domingo', encargado: 'Encargado Uno',
    telefono: '8095550202', ...extra,
  });
  r = await post('/api/cuenta/registro', dealer('reg-10d@ejemplo.test', { telefonoEmpresa: '8095550303' }), como(null));
  comprobar(r.codigo === 201, 'dealer con celular y teléfono de empresa: 201');
  const ud = db.usuarioPorCorreo('reg-10d@ejemplo.test');
  const od = db.organizacionDe(ud.id);
  comprobar(ud.telefono === '8095550202', 'dealer: el usuario guarda su celular');
  comprobar(od.telefono === '8095550303' && db.sucursalPrincipal(od.id).telefono === '8095550303',
    'dealer: la organización y la sucursal principal guardan el teléfono de la empresa');

  r = await post('/api/cuenta/registro', dealer('reg-10e@ejemplo.test', { telefonoEmpresa: '123' }), como(null));
  comprobar(r.codigo === 400 && /empresa/.test(r.datos.error), 'dealer con teléfono de empresa de 3 dígitos: 400');
  r = await post('/api/cuenta/registro', dealer('reg-10f@ejemplo.test'), como(null));
  comprobar(r.codigo === 201, 'dealer sin teléfono de empresa: 201 (se usa el celular)');
}

/* ── 11. La sesión y telefono ────────────────────────────────── */
seccion('11. La sesión y telefono');
{
  let r = await obtener('/api/sesion', como(null));
  comprobar(r.codigo === 200 && JSON.stringify(r.datos) === '{"usuario":null,"sms":false}', 'sin sesión y SMS apagado: {"usuario":null,"sms":false}');
  process.env.MERCA_SMS = 'archivo';
  try {
    r = await obtener('/api/sesion', como(null));
    comprobar(JSON.stringify(r.datos) === '{"usuario":null,"sms":true}', 'sin sesión y SMS encendido: sms true');
  } finally { delete process.env.MERCA_SMS; }

  const u = cuenta('sesion-11@ejemplo.test', 'Sesion', { telefono: '8295550101' });
  const cab = sesionDe(u);
  r = await obtener('/api/sesion', cab);
  comprobar(r.codigo === 200 && JSON.stringify(Object.keys(r.datos.telefono).sort())
    === '["enfriamientoHasta","mascara","pedir","sms","verificado"]', 'con sesión: telefono tiene las cinco claves');
  comprobar(r.datos.telefono.mascara === '(829) •••-0101', 'la máscara es (829) •••-0101');
  comprobar(!JSON.stringify(r.datos).includes('8295550101') || r.datos.usuario.telefono === '8295550101',
    'el número entero solo viaja en usuario.telefono, que ya existía');
  comprobar(r.datos.telefono.sms === false && r.datos.telefono.verificado === false && r.datos.telefono.enfriamientoHasta === null,
    'apagado: sms false, verificado false, sin enfriamiento');
  comprobar(r.datos.telefono.pedir === false, 'SMS apagado y celular guardado: pedir false');

  db.abrir().prepare('UPDATE usuarios SET telefono = NULL WHERE id = ?').run(u);
  r = await obtener('/api/sesion', cab);
  comprobar(r.datos.telefono.pedir === true && r.datos.telefono.mascara === null, 'SMS apagado y sin celular: pedir true y máscara null');
  db.abrir().prepare('UPDATE usuarios SET telefono = ? WHERE id = ?').run('8295550101', u);

  process.env.MERCA_SMS = 'archivo';
  try {
    r = await obtener('/api/sesion', cab);
    comprobar(r.datos.telefono.sms === true && r.datos.telefono.pedir === true, 'SMS encendido y sin verificar: pedir true');

    db.abrir().prepare('UPDATE usuarios SET enfriamiento_hasta = ? WHERE id = ?').run(FUTURO, u);
    r = await obtener('/api/sesion', cab);
    comprobar(r.datos.telefono.pedir === false && r.datos.telefono.enfriamientoHasta === FUTURO,
      'encendido, sin verificar y en enfriamiento: pedir false con enfriamientoHasta');
    db.abrir().prepare('UPDATE usuarios SET enfriamiento_hasta = ? WHERE id = ?').run(PASADO, u);
    r = await obtener('/api/sesion', cab);
    comprobar(r.datos.telefono.pedir === true && r.datos.telefono.enfriamientoHasta === null,
      'enfriamiento ya pasado: pedir true y enfriamientoHasta null');
    db.quitarEnfriamiento(u);

    db.verificarTelefonoCuenta({ idUsuario: u, numero: '8295550101', via: 'verificado' });
    r = await obtener('/api/sesion', cab);
    comprobar(r.datos.telefono.verificado === true && r.datos.telefono.pedir === false, 'encendido y verificado: pedir false');
  } finally { delete process.env.MERCA_SMS; }
}

/* ── 12. SMS apagado ─────────────────────────────────────────── */
seccion('12. SMS apagado');
{
  nuevosSms();
  nuevos();
  const u = cuenta('apagado-12@ejemplo.test', 'Apagado', { telefono: '8295551201' });
  const tk = db.abrirSesion(u);

  let r = await post('/api/cuenta/telefono/verificar', {}, como(null));
  comprobar(r.codigo === 401, 'sin sesión: verificar 401');
  r = await post('/api/cuenta/telefono/confirmar', {}, como(null));
  comprobar(r.codigo === 401, 'sin sesión: confirmar 401');
  r = await post('/api/cuenta/telefono', {}, como(null));
  comprobar(r.codigo === 401, 'sin sesión: cambiar 401');

  r = await post('/api/cuenta/telefono/verificar', {}, como(tk));
  comprobar(r.codigo === 400 && /todavía no están disponibles/.test(r.datos.error), 'verificar con el SMS apagado: 400');
  r = await post('/api/cuenta/telefono/confirmar', { proposito: 'verificar', codigo: '123456' }, como(tk));
  comprobar(r.codigo === 400, 'confirmar con el SMS apagado: 400');
  comprobar(nuevosSms().length === 0, 'no salió ningún SMS');

  r = await post('/api/cuenta/telefono', { clave: CLAVE, telefono: '8495550111' }, como(tk));
  const uu = db.usuarioPorId(u);
  comprobar(r.codigo === 200 && uu.telefono === '8495550111' && uu.telefono_verificado === null,
    'cambiar sin SMS: 200, guardado y sin verificar');
  comprobar(todas('SELECT 1 FROM cambios_telefono WHERE usuario_id = ? AND via = ?', u, 'sin_verificar').length === 1,
    'la bitácora anota sin_verificar');
  comprobar(nuevos().some((m) => m.para === 'apagado-12@ejemplo.test' && /celular/.test(m.asunto || '')),
    'el titular recibe el aviso del cambio por correo');
  comprobar(nuevosSms().length === 0, 'cambiar sin SMS tampoco manda SMS');

  const v = cuenta('apagado-12b@ejemplo.test', 'Apagado B', { telefono: '8295551202' });
  db.verificarTelefonoCuenta({ idUsuario: v, numero: '8295551202', via: 'verificado' });
  r = await post('/api/cuenta/telefono', { clave: CLAVE, telefono: '8495550112' }, como(db.abrirSesion(v)));
  comprobar(r.codigo === 409 && db.usuarioPorId(v).telefono === '8295551202', 'con el celular verificado y sin SMS: 409 y no cambia');
}

/* ── 13. SMS encendido ───────────────────────────────────────── */
seccion('13. SMS encendido: verificar, confirmar, cambiar y liberar');
process.env.MERCA_SMS = 'archivo';
try {
  nuevosSms();
  nuevos();

  /* Verificar y confirmar. */
  const B = cuenta('enc-13b@ejemplo.test', 'Enc B', { telefono: '8295551301' });
  const tb = db.abrirSesion(B);
  let r = await post('/api/cuenta/telefono/verificar', {}, como(tb));
  comprobar(r.codigo === 202 && r.datos.destino === '(829) •••-1301' && r.datos.minutos === 15, 'verificar: 202 con destino y minutos');
  let sms = nuevosSms();
  comprobar(sms.length === 1 && sms[0].numero === '8295551301' && /^\d{6}$/.test(sms[0].codigo), 'sale un SMS con 6 dígitos al celular guardado');
  const codigoB = sms[0] && sms[0].codigo;

  r = await post('/api/cuenta/telefono/confirmar', { proposito: 'verificar', codigo: otroCodigo(codigoB) }, como(tb));
  comprobar(r.codigo === 400 && /Le quedan 4 intentos/.test(r.datos.error), 'código equivocado: 400 con 4 intentos');
  r = await post('/api/cuenta/telefono/confirmar', { proposito: 'verificar' }, como(tb));
  comprobar(r.codigo === 400, 'sin código: 400');
  r = await post('/api/cuenta/telefono/confirmar', { codigo: codigoB }, como(tb));
  comprobar(r.codigo === 400 && /propósito/.test(r.datos.error), 'sin propósito: 400');
  r = await post('/api/cuenta/telefono/confirmar', { proposito: 'verificar', codigo: codigoB }, como(tb));
  comprobar(r.codigo === 200 && r.datos.telefono.verificado === true && r.datos.telefono.pedir === false, 'código bueno: 200 y verificado');
  comprobar(!!db.usuarioPorId(B).telefono_verificado, 'queda telefono_verificado en la base');
  r = await post('/api/cuenta/telefono/verificar', {}, como(tb));
  comprobar(r.codigo === 400 && /ya está verificado/.test(r.datos.error), 'verificar otra vez: 400 ya verificado');

  /* Carrera: dos confirmaciones a la vez con el mismo código bueno. */
  const C = cuenta('enc-13c@ejemplo.test', 'Enc C', { telefono: '8295551302' });
  const tc = db.abrirSesion(C);
  await post('/api/cuenta/telefono/verificar', {}, como(tc));
  const codigoC = nuevosSms().find((s) => s.numero === '8295551302').codigo;
  const dos = await Promise.all([
    post('/api/cuenta/telefono/confirmar', { proposito: 'verificar', codigo: codigoC }, como(tc)),
    post('/api/cuenta/telefono/confirmar', { proposito: 'verificar', codigo: codigoC }, como(tc)),
  ]);
  comprobar(dos.map((x) => x.codigo).sort().join() === '200,400', 'dos confirmaciones simultáneas: exactamente una 200 y una 400');

  /* Cambio. */
  const D = cuenta('enc-13d@ejemplo.test', 'Enc D', { telefono: '8295551303' });
  db.verificarTelefonoCuenta({ idUsuario: D, numero: '8295551303', via: 'verificado' });
  const td = db.abrirSesion(D);
  r = await post('/api/cuenta/telefono', { telefono: '8295551304' }, como(td));
  comprobar(r.codigo === 401, 'cambio sin contraseña: 401');
  r = await post('/api/cuenta/telefono', { clave: 'otra-clave-equivocada', telefono: '8295551304' }, como(td));
  comprobar(r.codigo === 401, 'cambio con contraseña mala: 401');
  r = await post('/api/cuenta/telefono', { clave: CLAVE, telefono: '8005551234' }, como(td));
  comprobar(r.codigo === 400 && r.datos.error === MENSAJE_CELULAR, 'cambio a un número fuera de área: 400');
  r = await post('/api/cuenta/telefono', { clave: CLAVE, telefono: '(829) 555-1303' }, como(td));
  comprobar(r.codigo === 400 && /ya es su celular verificado/.test(r.datos.error), 'cambio al mismo número verificado: 400');
  comprobar(nuevosSms().length === 0, 'los rechazos no mandaron SMS');
  r = await post('/api/cuenta/telefono', { clave: CLAVE, telefono: '8295551304' }, como(td));
  comprobar(r.codigo === 202 && r.datos.destino === '(829) •••-1304', 'cambio a número nuevo: 202');
  sms = nuevosSms();
  comprobar(sms.length === 1 && sms[0].numero === '8295551304', 'el código va al número NUEVO');
  const codigoD = sms[0] && sms[0].codigo;
  r = await post('/api/cuenta/telefono/confirmar', { proposito: 'cambio', telefono: '8295551399', codigo: codigoD }, como(td));
  comprobar(r.codigo === 400, 'el código no vale para otro número');
  nuevos();
  r = await post('/api/cuenta/telefono/confirmar', { proposito: 'cambio', telefono: '8295551304', codigo: codigoD }, como(td));
  const ud = db.usuarioPorId(D);
  comprobar(r.codigo === 200 && ud.telefono === '8295551304' && !!ud.telefono_verificado, 'confirmar el cambio: 200 y número nuevo verificado');
  comprobar(todas('SELECT 1 FROM cambios_telefono WHERE usuario_id = ? AND via = ? AND nuevo = ?', D, 'cambio', '8295551304').length === 1,
    'la bitácora anota cambio');
  comprobar(nuevos().some((m) => m.para === 'enc-13d@ejemplo.test' && /1304/.test(m.texto)), 'el titular recibe el aviso con la máscara del nuevo');

  /* Unicidad por la API: B2 confirma el número que A tenía verificado. */
  const A = cuenta('enc-13a@ejemplo.test', 'Enc A', { telefono: '8295551305' });
  db.verificarTelefonoCuenta({ idUsuario: A, numero: '8295551305', via: 'verificado' });
  const B2 = cuenta('enc-13e@ejemplo.test', 'Enc B2', { telefono: '8295551306' });
  const tb2 = db.abrirSesion(B2);
  nuevosSms();
  r = await post('/api/cuenta/telefono', { clave: CLAVE, telefono: '8295551305' }, como(tb2));
  comprobar(r.codigo === 202, 'B2 pide el número que otra cuenta tiene verificado: 202');
  const codigoB2 = nuevosSms().find((s) => s.numero === '8295551305').codigo;
  nuevos();
  r = await post('/api/cuenta/telefono/confirmar', { proposito: 'cambio', telefono: '8295551305', codigo: codigoB2 }, como(tb2));
  comprobar(r.codigo === 200 && db.usuarioPorId(B2).telefono_verificado, 'B2 queda con el número verificado');
  comprobar(db.usuarioPorId(A).telefono_verificado === null, 'A pierde la verificación');
  comprobar(nuevos().some((m) => m.para === 'enc-13a@ejemplo.test' && /celular/.test(m.asunto || '')), 'A recibe un correo sobre su celular');

  /* Celular de otra área, de antes. */
  const F = cuenta('enc-13f@ejemplo.test', 'Enc F', { telefono: '8005550000' });
  r = await post('/api/cuenta/telefono/verificar', {}, como(db.abrirSesion(F)));
  comprobar(r.codigo === 400 && /809, 829 o 849/.test(r.datos.error), 'celular guardado de otra área: verificar da 400');
  comprobar(nuevosSms().length === 0, 'y no sale SMS');
} finally { delete process.env.MERCA_SMS; }

/* ── 14. Topes y tope diario ─────────────────────────────────── */
seccion('14. Topes y tope diario');
process.env.MERCA_SMS = 'archivo';
try {
  nuevosSms();
  nuevos();

  /* Por número, venga de la cuenta que venga. */
  const C = cuenta('tope-14c@ejemplo.test', 'Tope C', { telefono: '8295551401' });
  const tc = db.abrirSesion(C);
  const codigos = [];
  for (let i = 0; i < 3; i++) codigos.push((await post('/api/cuenta/telefono/verificar', {}, como(tc))).codigo);
  comprobar(codigos.join() === '202,202,202', 'tres SMS al mismo número en una hora: 202');
  let r = await post('/api/cuenta/telefono/verificar', {}, como(tc));
  comprobar(r.codigo === 429 && /última hora/.test(r.datos.error), 'el cuarto: 429 por número');
  const D = cuenta('tope-14d@ejemplo.test', 'Tope D', { telefono: '8295551401' });
  r = await post('/api/cuenta/telefono/verificar', {}, como(db.abrirSesion(D)));
  comprobar(r.codigo === 429 && /última hora/.test(r.datos.error), 'otra cuenta con el mismo número: 429 también');

  /* Por cuenta. */
  const E = cuenta('tope-14e@ejemplo.test', 'Tope E', { telefono: '8295551402' });
  const te = db.abrirSesion(E);
  const e1 = [];
  for (const n of ['8295551411', '8295551412', '8295551413']) {
    e1.push((await post('/api/cuenta/telefono', { clave: CLAVE, telefono: n }, como(te))).codigo);
  }
  for (let i = 0; i < 2; i++) e1.push((await post('/api/cuenta/telefono/verificar', {}, como(te))).codigo);
  comprobar(e1.join() === '202,202,202,202,202', 'cinco SMS de una cuenta en una hora: 202');
  r = await post('/api/cuenta/telefono/verificar', {}, como(te));
  comprobar(r.codigo === 429 && /Ha pedido demasiados códigos/.test(r.datos.error), 'el sexto de la cuenta: 429');

  /* Por IP. */
  const ipFija = '201.77.7.7';
  const f = [];
  for (let i = 1; i <= 11; i++) {
    const n = `82955520${String(i).padStart(2, '0')}`;
    const F = cuenta(`tope-14f${i}@ejemplo.test`, `Tope F${i}`, { telefono: n });
    f.push(await post('/api/cuenta/telefono/verificar', {}, como(db.abrirSesion(F), ipFija)));
  }
  comprobar(f.slice(0, 10).every((x) => x.codigo === 202), 'diez SMS desde la misma IP: 202');
  comprobar(f[10].codigo === 429 && /desde esta conexión/.test(f[10].datos.error), 'el undécimo desde la IP: 429');

  /* Tope diario global. */
  db.limpiarIntentos('sms-dia');
  db.limpiarIntentos('sms-dia-aviso');
  process.env.MERCA_SMS_TOPE_DIA = '2';
  try {
    nuevosSms();
    nuevos();
    const g = [];
    for (let i = 1; i <= 4; i++) {
      const n = `829555210${i}`;
      const G = cuenta(`tope-14g${i}@ejemplo.test`, `Tope G${i}`, { telefono: n });
      g.push(await post('/api/cuenta/telefono/verificar', {}, como(db.abrirSesion(G))));
      if (i === 3) {
        comprobar(nuevos().filter((m) => m.para === correo.BUZONES.soporte && /Tope diario de SMS/.test(m.asunto || '')).length === 1,
          'al agotarse, soporte recibe un aviso');
      }
    }
    comprobar(g[0].codigo === 202 && g[1].codigo === 202, 'con tope 2: los dos primeros salen');
    comprobar(g[2].codigo === 429 && /Hoy no podemos enviar más SMS/.test(g[2].datos.error), 'el tercero: 429 del tope diario');
    comprobar(g[3].codigo === 429, 'el cuarto: 429');
    comprobar(nuevos().filter((m) => m.para === correo.BUZONES.soporte && /Tope diario de SMS/.test(m.asunto || '')).length === 0,
      'el aviso a soporte no se repite');
    comprobar(nuevosSms().length === 2, 'solo salieron dos SMS');

    /* SMS de contactos de la fase 9 con el tope agotado. */
    const P = cuenta('tope-14p@ejemplo.test', 'Tope P', { telefono: '8095551501' });
    const tp = db.abrirSesion(P);
    r = await post('/api/contactos/codigo', { numero: '8095557001', via: 'sms' }, como(tp));
    comprobar(r.codigo === 429 && /Hoy no podemos enviar más SMS/.test(r.datos.error), 'contactos por SMS con el tope agotado: 429');
    comprobar(nuevosSms().length === 0, 'y no sale SMS');
  } finally {
    delete process.env.MERCA_SMS_TOPE_DIA;
    db.limpiarIntentos('sms-dia');
    db.limpiarIntentos('sms-dia-aviso');
  }

  /* Contactos de la fase 9 con el tope limpio. */
  const P2 = cuenta('tope-14q@ejemplo.test', 'Tope Q', { telefono: '8095551502' });
  const tq = db.abrirSesion(P2);
  r = await post('/api/contactos/codigo', { numero: '8005557002', via: 'sms' }, como(tq));
  comprobar(r.codigo === 400 && /809, 829 o 849/.test(r.datos.error), 'contactos por SMS a un número fuera de área: 400');
  comprobar(nuevosSms().length === 0, 'sin SMS');
  r = await post('/api/contactos/codigo', { numero: '8005557002', via: 'correo' }, como(tq));
  comprobar(r.codigo === 200, 'el mismo número por correo sigue funcionando');
  r = await post('/api/contactos/codigo', { numero: '8095557003', via: 'sms' }, como(tq));
  comprobar(r.codigo === 200 && nuevosSms().length === 1, 'un 809 por SMS sigue funcionando');
} finally {
  delete process.env.MERCA_SMS;
  delete process.env.MERCA_SMS_TOPE_DIA;
}

}

main().then(() => {
  console.log(`\n${bien} bien, ${mal} mal`);
  process.exit(mal ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
