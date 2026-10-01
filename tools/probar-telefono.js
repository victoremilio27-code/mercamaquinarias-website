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

const db = require('./db.js');
const correo = require('./correo.js');

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
      codigo: (/(\d{6})/.exec(t) || [])[1] || null,
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

/* ── Aquí siguen los bloques de los planes 04 y 05 ── */

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
