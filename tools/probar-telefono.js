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
  comprobar(colsUsuarios.includes('telefono_verificado') && !colsUsuarios.includes('enfriamiento_hasta'),
    'usuarios tiene telefono_verificado y NO enfriamiento_hasta');
  const colsCodigos = d.prepare('PRAGMA table_info(codigos_telefono)').all().map((c) => c.name);
  comprobar(!colsCodigos.some((c) => c.startsWith('autoriza_')), 'codigos_telefono no tiene columnas autoriza_*');
  const indice = fila("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = 'ux_usuarios_telefono_verificado'");
  comprobar(!!indice && /WHERE telefono_verificado IS NOT NULL/.test(indice.sql), 'el índice único de celular verificado es parcial');
  for (const t of ['codigos_telefono', 'cambios_telefono', 'cambios_clave']) {
    comprobar(!!fila("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", t), `existe la tabla ${t}`);
  }
  for (const i of ['ix_codigos_telefono_vigentes', 'ix_cambios_telefono_usuario', 'ix_cambios_clave_usuario', 'ux_cambios_clave_revertir']) {
    comprobar(!!fila("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?", i), `existe el índice ${i}`);
  }
  comprobar(!fila("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'ux_codigos_telefono_autoriza'"),
    'no existe ux_codigos_telefono_autoriza');

  const esquema = fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8');
  comprobar(!esquema.includes('telefono_verificado') && !esquema.includes('codigos_telefono') && !esquema.includes('cambios_clave'),
    'db/schema.sql no contiene nada de la migración (abrir() lo ejecuta antes que migrar())');

  /* La DDL de cambios_correo, idéntica a la de la 10.1: esta migración ya no la toca. */
  const fuente = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
  const desde = fuente.indexOf("['2026-10-cuenta-recuperacion'");
  const ini = fuente.indexOf('CREATE TABLE IF NOT EXISTS cambios_correo (', desde);
  const fin = fuente.indexOf(')`', ini);
  const ddl101 = desde > 0 && ini > desde && fin > ini ? fuente.slice(ini, fin + 1) : '';
  const actual = fila("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'cambios_correo'").sql;
  comprobar(ddl101.length > 100, 'se encontró la DDL de cambios_correo de la 10.1 en tools/db.js');
  comprobar(normalizarDdl(actual) === normalizarDdl(ddl101), 'cambios_correo: la DDL es exactamente la de la 10.1');
  comprobar(!/'sms'/.test(normalizarDdl(actual)), 'el CHECK de via de cambios_correo no admite sms');

  /* Base vieja: la copia con la migración deshecha, abierta en un hijo. */
  const copia = path.join(BANCO, 'vieja.db');
  d.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);
  const v = new DatabaseSync(copia);
  v.exec("DELETE FROM migraciones WHERE id = '2026-10-telefono-cuenta'");
  v.exec('DROP INDEX ux_usuarios_telefono_verificado');
  v.exec('DROP TABLE codigos_telefono');
  v.exec('DROP TABLE cambios_telefono');
  v.exec('DROP TABLE cambios_clave');
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
      cambios_clave: cols('cambios_clave'),
      veces, via: vieja && vieja.via, sms,
    }));
  `], { env: { ...process.env, MERCA_DB: copia }, encoding: 'utf8' });
  const vieja = JSON.parse(salida.trim().split('\n').pop());
  const cols = (t) => d.prepare(`PRAGMA table_info(${t})`).all().map((c) => `${c.name}:${c.type}:${c.notnull}:${c.dflt_value}`).sort();
  for (const t of ['usuarios', 'cambios_correo', 'codigos_telefono', 'cambios_telefono', 'cambios_clave']) {
    comprobar(JSON.stringify(vieja[t]) === JSON.stringify(cols(t)), `${t}: la base vieja migrada y la nueva tienen las mismas columnas`);
  }
  comprobar(vieja.veces === 1, 'la migración corrió una vez sobre la base vieja');
  comprobar(vieja.via === 'usuario', 'la fila vieja de cambios_correo se conservó');
  comprobar(typeof vieja.sms === 'string' && /CHECK/i.test(vieja.sms), 'la base vieja migrada sigue sin admitir via sms en cambios_correo (CHECK)');
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
  comprobar(up.telefono_verificado === null && !('enfriamiento_hasta' in up), 'particular: nace sin verificar y sin la columna de enfriamiento');

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
  comprobar(JSON.stringify(db.MINUTOS_SMS) === '{"verificar":15,"cambio":15,"clave":20,"acceso":10}' && Object.isFrozen(db.MINUTOS_SMS),
    'MINUTOS_SMS congelado y según el contrato');
  comprobar(JSON.stringify(db.PROPOSITOS_SMS) === '["verificar","cambio","clave","acceso"]'
    && Object.isFrozen(db.PROPOSITOS_SMS), 'PROPOSITOS_SMS congelada y completa');
  const ac = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'acceso' });
  const fa = fila('SELECT * FROM codigos_telefono WHERE id = ?', ac.id);
  comprobar(ac.minutos === 10 && Date.parse(fa.expira) - Date.parse(fa.creado) === 600000, 'un código acceso vence exactamente a los 10 minutos');

  const e1 = lanza(() => db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'otro' }));
  comprobar(e1 && e1.codigo === 400, 'un propósito fuera de la lista lanza 400');
  for (const p of ['restablecer', 'recuperar']) {
    const ep = lanza(() => db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: p }));
    comprobar(ep && ep.codigo === 400, `el propósito ${p} ya no existe: lanza 400`);
  }
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
  const v = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'acceso' });
  db.abrir().prepare('UPDATE codigos_telefono SET expira = ? WHERE id = ?').run(PASADO, v.id);
  const rv = db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'acceso', codigo: v.codigo });
  comprobar(!rv.ok && rv.motivo === 'vencido', 'un código con expira en el pasado da vencido');

  /* Propósito y número cuentan. */
  const x = db.crearCodigoTelefono({ idUsuario: u, numero: N, proposito: 'clave' });
  comprobar(db.verificarCodigoTelefono({ idUsuario: u, numero: N, proposito: 'cambio', codigo: x.codigo }).motivo === 'inexistente',
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
seccion('6. Cambios de contraseña y «No fui yo» (base)');
{
  comprobar(JSON.stringify(db.VIAS_CAMBIO_CLAVE) === '["actual","correo","sms","restablecer"]' && Object.isFrozen(db.VIAS_CAMBIO_CLAVE),
    'VIAS_CAMBIO_CLAVE congelada y completa');

  const u = cuenta('clave-6a@ejemplo.test', 'Clave A', { telefono: '8295550601' });
  const hashAntes = db.usuarioPorId(u).clave_hash;
  const e0 = lanza(() => db.anotarCambioClave({ idUsuario: u, via: 'otra' }));
  comprobar(e0 && e0.codigo === 400, 'anotarCambioClave con una vía fuera de la lista lanza 400');

  const c = db.anotarCambioClave({ idUsuario: u, via: 'sms', ip: '201.3.3.1' });
  comprobar(/^[0-9a-f]{64}$/.test(c.testigoRevertir) && !!c.id, 'devuelve id y un testigo de 64 hex');
  const f = fila('SELECT * FROM cambios_clave WHERE id = ?', c.id);
  comprobar(f.via === 'sms' && f.ip === '201.3.3.1' && f.revertido === null, 'la fila guarda vía e ip y no nace revertida');
  comprobar(f.revertir_hash !== c.testigoRevertir && !JSON.stringify(f).includes(c.testigoRevertir),
    'el testigo no está en la base, solo su HMAC');
  comprobar(f.revertir_expira === db.sumarDias(7, f.creado), 'vence a los 7 días exactos desde el mismo instante');

  db.verificarTelefonoCuenta({ idUsuario: u, numero: '8295550601', via: 'verificado' });
  const pend = db.crearCodigoTelefono({ idUsuario: u, numero: '8295550601', proposito: 'clave' });
  const r = db.revertirCambioClave(c.testigoRevertir, '201.3.3.2');
  comprobar(r.ok === true && r.idUsuario === u && r.telefonoQuitado === true, 'revertir devuelve ok, usuario y telefonoQuitado');
  comprobar(db.usuarioPorId(u).telefono_verificado === null, 'revertir quita la verificación del celular');
  comprobar(fila('SELECT consumido FROM codigos_telefono WHERE id = ?', pend.id).consumido === 1, 'revertir anula los códigos SMS pendientes');
  comprobar(todas('SELECT 1 FROM cambios_telefono WHERE usuario_id = ? AND via = ?', u, 'reversion').length === 1,
    'revertir anota reversion en la bitácora del celular');
  comprobar(fila('SELECT revertido FROM cambios_clave WHERE id = ?', c.id).revertido !== null, 'la fila queda marcada como revertida');
  comprobar(db.usuarioPorId(u).clave_hash === hashAntes, 'no toca la contraseña (lo hace la API)');
  comprobar(db.revertirCambioClave(c.testigoRevertir).motivo === 'usado', 'repetir el mismo testigo da usado');
  comprobar(db.revertirCambioClave('a'.repeat(64)).motivo === 'inexistente', 'un testigo inventado da inexistente');
  comprobar(db.revertirCambioClave(undefined).motivo === 'inexistente', 'sin testigo da inexistente');

  /* Vencido: la cuenta no cambia. */
  const v = cuenta('clave-6b@ejemplo.test', 'Clave B', { telefono: '8295550602' });
  db.verificarTelefonoCuenta({ idUsuario: v, numero: '8295550602', via: 'verificado' });
  const cv = db.anotarCambioClave({ idUsuario: v, via: 'actual' });
  db.abrir().prepare('UPDATE cambios_clave SET revertir_expira = ? WHERE id = ?').run(PASADO, cv.id);
  comprobar(db.revertirCambioClave(cv.testigoRevertir).motivo === 'vencido', 'un testigo con revertir_expira en el pasado da vencido');
  comprobar(!!db.usuarioPorId(v).telefono_verificado && fila('SELECT revertido FROM cambios_clave WHERE id = ?', cv.id).revertido === null,
    'vencido: la cuenta no cambia');

  /* Dos cambios seguidos: usar el segundo anula el primero. */
  const w = cuenta('clave-6c@ejemplo.test', 'Clave C', { telefono: '8295550603' });
  const t1 = db.anotarCambioClave({ idUsuario: w, via: 'correo' });
  const t2 = db.anotarCambioClave({ idUsuario: w, via: 'restablecer' });
  comprobar(db.revertirCambioClave(t2.testigoRevertir).ok === true, 'usar el segundo testigo funciona');
  comprobar(db.revertirCambioClave(t1.testigoRevertir).motivo === 'inexistente', 'el primero queda sin efecto (inexistente)');

  /* Sin celular verificado. */
  const n = cuenta('clave-6d@ejemplo.test', 'Clave D', { telefono: '8295550604' });
  const cn = db.anotarCambioClave({ idUsuario: n, via: 'actual' });
  const rn = db.revertirCambioClave(cn.testigoRevertir);
  comprobar(rn.ok === true && rn.telefonoQuitado === false, 'sin celular verificado: ok y telefonoQuitado false');
  comprobar(todas('SELECT 1 FROM cambios_telefono WHERE usuario_id = ? AND via = ?', n, 'reversion').length === 0,
    'sin celular verificado: no anota reversion');
}

/* ── 7. «No fui yo» ampliado y expediente ────────────────────── */
seccion('7. «No fui yo» del cambio de correo y expediente');
{
  const probarVia = (via, correoCuenta, telefono, verificar) => {
    const u = cuenta(correoCuenta, `Via ${via}`, { telefono });
    if (verificar) db.verificarTelefonoCuenta({ idUsuario: u, numero: telefono, via: 'verificado' });
    const pend = db.crearCodigoTelefono({ idUsuario: u, numero: telefono, proposito: 'clave' });
    const cambio = db.cambiarCorreo({ idUsuario: u, nuevo: `nuevo-${via}-${correoCuenta}`, via, ip: '201.2.2.2',
      verificado: true, conReversion: true });
    const r = db.revertirCambioCorreo(cambio.testigoRevertir, '201.2.2.3');
    return { u, pend, r };
  };

  const s = probarVia('usuario', 'noyo-7a@ejemplo.test', '8295550701', true);
  comprobar(s.r.ok === true && s.r.telefonoQuitado === true, 'via usuario: revertir quita el celular verificado');
  comprobar(db.usuarioPorId(s.u).telefono_verificado === null, 'via usuario: telefono_verificado NULL');
  comprobar(fila('SELECT consumido FROM codigos_telefono WHERE id = ?', s.pend.id).consumido === 1, 'via usuario: los códigos SMS pendientes quedan anulados');
  comprobar(db.usuarioPorId(s.u).correo === 'noyo-7a@ejemplo.test', 'via usuario: el correo vuelve al anterior');
  comprobar(todas('SELECT 1 FROM cambios_telefono WHERE usuario_id = ? AND via = ?', s.u, 'reversion').length === 1,
    'via usuario: la bitácora anota reversion');

  const w = probarVia('recuperacion', 'noyo-7b@ejemplo.test', '8295550702', true);
  comprobar(w.r.ok === true && w.r.telefonoQuitado === true && db.usuarioPorId(w.u).telefono_verificado === null,
    'via recuperacion: también quita el celular verificado');

  const n = probarVia('usuario', 'noyo-7c@ejemplo.test', '8295550703', false);
  comprobar(n.r.ok === true && n.r.telefonoQuitado === false, 'sin celular verificado: telefonoQuitado false');
  comprobar(fila('SELECT consumido FROM codigos_telefono WHERE id = ?', n.pend.id).consumido === 1,
    'sin celular verificado: igual anula los códigos pendientes');

  /* Expediente. */
  const u = cuenta('expediente-7@ejemplo.test', 'Expediente', { telefono: '8295550704' });
  db.verificarTelefonoCuenta({ idUsuario: u, numero: '8295550704', via: 'verificado' });
  const sol = db.crearSolicitudRecuperacion({ correoCuenta: 'expediente-7@ejemplo.test', correoContacto: 'contacto-7@ejemplo.test',
    nombre: 'Expediente', telefono: '8295550704', detalle: 'Perdí el acceso a mi correo', ip: '201.2.2.4' });
  const exp = db.expedienteRecuperacion(sol.id);
  comprobar(!!exp.cuenta.telefono_verificado, 'expediente: cuenta.telefono_verificado');
  comprobar(!('enfriamiento_hasta' in exp.cuenta), 'expediente: cuenta ya no trae enfriamiento_hasta');
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
    === '["mascara","pedir","sms","verificado"]', 'con sesión: telefono tiene exactamente cuatro claves (D-16: sin enfriamientoHasta)');
  comprobar(r.datos.telefono.mascara === '(829) •••-0101', 'la máscara es (829) •••-0101');
  comprobar(!JSON.stringify(r.datos).includes('8295550101') || r.datos.usuario.telefono === '8295550101',
    'el número entero solo viaja en usuario.telefono, que ya existía');
  comprobar(r.datos.telefono.sms === false && r.datos.telefono.verificado === false,
    'apagado: sms false, verificado false');
  comprobar(r.datos.telefono.pedir === false, 'SMS apagado y celular guardado: pedir false');

  db.abrir().prepare('UPDATE usuarios SET telefono = NULL WHERE id = ?').run(u);
  r = await obtener('/api/sesion', cab);
  comprobar(r.datos.telefono.pedir === true && r.datos.telefono.mascara === null, 'SMS apagado y sin celular: pedir true y máscara null');
  db.abrir().prepare('UPDATE usuarios SET telefono = ? WHERE id = ?').run('8295550101', u);

  process.env.MERCA_SMS = 'archivo';
  try {
    r = await obtener('/api/sesion', cab);
    comprobar(r.datos.telefono.sms === true && r.datos.telefono.pedir === true, 'SMS encendido y sin verificar: pedir true');

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

const tick = () => new Promise((resolver) => setImmediate(resolver));
const NUEVA = 'OtraClaveNuevaLarga7';
const limpiarNumero = (n) => { db.limpiarIntentos(`sms-num-h:${n}`); db.limpiarIntentos(`sms-num-d:${n}`); };
const avisosSoporte = (lista, patron) =>
  lista.filter((m) => m.para === correo.BUZONES.soporte && patron.test(m.asunto || ''));

/* ── 15. Sin bloqueo tras usar el SMS ────────────────────────── */
seccion('15. Sin bloqueo tras usar el SMS');
{
  const sinEnf = (r) => !(r.datos && r.datos.enfriamientoHasta !== undefined);
  const CLAVE_15 = 'ClaveNuevaDeLaQuince9';

  /* Particular: cambia su contraseña con sesión + código por SMS y en seguida
     puede cambiar el correo, el celular y pedir contactos. */
  const P = cuenta('guarda-15p@ejemplo.test', 'Guarda P', { telefono: '8295551501' });
  const tp = db.abrirSesion(P);
  let r;
  process.env.MERCA_SMS = 'archivo';
  try {
    db.verificarTelefonoCuenta({ idUsuario: P, numero: '8295551501', via: 'verificado' });
    limpiarNumero('8295551501');
    nuevosSms();
    r = await post('/api/cuenta/clave/codigo', { via: 'sms' }, como(tp));
    comprobar(r.codigo === 202, 'clave por SMS: se pide el código (202)');
    const sms = nuevosSms();
    r = await post('/api/cuenta/clave', { via: 'sms', codigo: sms[0].codigo, nueva: CLAVE_15 }, como(tp));
    comprobar(r.codigo === 200 && sinEnf(r), 'clave por SMS: se cambia (200) y sin enfriamientoHasta');

    r = await post('/api/cuenta/correo', { clave: CLAVE_15, correo: 'nuevo-15p@ejemplo.test' }, como(tp));
    comprobar(r.codigo === 202 && sinEnf(r), 'tras el SMS: cambiar el correo da 202, no 409');
    limpiarNumero('8295551599');
    r = await post('/api/cuenta/telefono', { clave: CLAVE_15, telefono: '8295551599' }, como(tp));
    comprobar(r.codigo === 202 && sinEnf(r), 'tras el SMS: cambiar el celular da 202, no 409');
  } finally { delete process.env.MERCA_SMS; }
  r = await post('/api/contactos/codigo', { numero: '8095558001', via: 'correo' }, como(tp));
  comprobar(r.codigo === 200 && sinEnf(r), 'tras el SMS: pedir un código de contacto da 200');

  /* Dealer: página, enlaces y sucursales. */
  const D = cuenta('guarda-15d@ejemplo.test', 'Guarda D', { telefono: '8295551502', telefonoEmpresa: '8095558100', dealer: 'Empresa Guarda' });
  for (const doc of legales.OBLIGATORIOS) db.registrarAceptacion({ usuarioId: D, documento: doc.id, version: doc.version, ip: '201.5.5.5' });
  const td = db.abrirSesion(D);
  const org = db.organizacionDe(D);
  const principal = db.sucursalPrincipal(org.id);
  r = await patch('/api/mi-pagina', { telefonoPublico: '8095558101', correoPublico: 'publico@empresa-guarda.test' }, como(td));
  comprobar(r.codigo === 200, 'dealer: guardar teléfono y correo públicos funciona');
  r = await put('/api/mi-pagina/enlaces', { enlaces: [{ tipo: 'whatsapp', valor: '8095558102' }, { tipo: 'instagram', valor: 'https://instagram.com/guarda' }] }, como(td));
  comprobar(r.codigo === 200, 'dealer: guardar el WhatsApp funciona');

  r = await patch('/api/mi-pagina', { telefonoPublico: '8095558199', correoPublico: 'otro@empresa-guarda.test' }, como(td));
  comprobar(r.codigo === 200 && sinEnf(r), 'dealer: otro teléfono y otro correo públicos (200)');
  // El hueco de 10.2-VERIFICATION.md: el WhatsApp de siempre más uno nuevo, ahora permitido.
  r = await put('/api/mi-pagina/enlaces', { enlaces: [{ tipo: 'whatsapp', valor: '8095558102' }, { tipo: 'whatsapp', valor: '8095558199' }] }, como(td));
  comprobar(r.codigo === 200 && sinEnf(r), 'dealer: el WhatsApp de siempre más uno nuevo (200)');
  const guardados = db.enlacesDe(org.id).filter((e) => e.tipo === 'whatsapp').map((e) => db.normalizarNumero(e.valor));
  comprobar(guardados.includes('8095558102') && guardados.includes('8095558199'), 'dealer: los dos WhatsApp quedaron guardados');

  r = await post('/api/sucursales', {
    nombre: 'Sucursal Dos', provincia: 'santiago', direccion: 'Avenida Central No. 20', telefono: '8095558200',
  }, como(td));
  comprobar(r.codigo === 201 && sinEnf(r), 'sucursales: crear una (201)');
  r = await patch(`/api/sucursales/${principal.id}`, {
    nombre: principal.nombre, provincia: principal.provincia || 'santo-domingo',
    direccion: principal.direccion || 'Calle Principal No. 10', municipio: principal.municipio || '',
    telefono: '8095558299', whatsapp: principal.whatsapp || '',
  }, como(td));
  comprobar(r.codigo === 200 && sinEnf(r), 'sucursales: cambiarle el teléfono (200)');
}

/* ── 16. Orden de rutas y sesión ─────────────────────────────── */
seccion('16. Orden de rutas y sesión');
{
  const primera = (ruta) => api.RUTAS.find(([m, re]) => m === 'POST' && re.test(ruta));
  const pv = primera('/api/cuenta/telefono/verificar');
  const pc = primera('/api/cuenta/telefono/confirmar');
  const pt = primera('/api/cuenta/telefono');
  comprobar(!!pv && pv[1].source.includes('verificar'),
    'la primera ruta que casa con /telefono/verificar es la de verificar');
  comprobar(!!pc && pc[1].source.includes('confirmar'), 'la primera ruta que casa con /telefono/confirmar es la de confirmar');
  comprobar(!!pt && pt[1].source === '^\\/api\\/cuenta\\/telefono$' && pt !== pv && pt !== pc, '/telefono a secas tiene su propia ruta');
  for (const u of ['/api/cuenta/telefono', '/api/cuenta/telefono/verificar', '/api/cuenta/telefono/confirmar']) {
    const r = await post(u, {}, como(null));
    comprobar(r.codigo === 401, `sin sesión: ${u} responde 401`);
  }
}

/* ── 19. Cambiar la contraseña sin la actual ─────────────────── */
seccion('19. Cambiar la contraseña sin la actual');
{
  nuevosSms();
  nuevos();
  const codigoDeCorreo = (para) => {
    const m = nuevos().filter((x) => x.para === para).pop();
    return m && (/\b(\d{6})\b/.exec(m.asunto || '') || [])[1];
  };

  const A = cuenta('clave-19a@ejemplo.test', 'Clave A', { telefono: '8495550940' });
  const ta = db.abrirSesion(A);
  const otra = db.abrirSesion(A);

  let r = await post('/api/cuenta/clave/codigo', { via: 'correo' }, como(null));
  comprobar(r.codigo === 401, 'sin sesión: clave/codigo 401');
  r = await post('/api/cuenta/clave/codigo', { via: 'sms' }, como(ta));
  comprobar(r.codigo === 400 && /todavía no están disponibles/.test(r.datos.error), 'SMS apagado: clave/codigo via sms da 400');
  r = await post('/api/cuenta/clave/codigo', { via: 'correo' }, como(ta));
  comprobar(r.codigo === 202 && r.datos.via === 'correo' && r.datos.destino === 'c•••@ejemplo.test' && r.datos.minutos === 20,
    'SMS apagado: via correo da 202 con destino y minutos');
  const cod = codigoDeCorreo('clave-19a@ejemplo.test');
  comprobar(/^\d{6}$/.test(cod || ''), 'llega un correo con código al titular');

  r = await post('/api/cuenta/clave', { via: 'correo', codigo: otroCodigo(cod), nueva: NUEVA }, como(ta));
  comprobar(r.codigo === 400, 'código equivocado: 400');
  const B = cuenta('clave-19b@ejemplo.test', 'Clave B', { telefono: '8495550941' });
  const { codigo: deOtra } = db.crearCodigo({ correo: 'clave-19b@ejemplo.test', tipo: 'restablecer', idUsuario: B });
  r = await post('/api/cuenta/clave', { via: 'correo', codigo: deOtra, nueva: NUEVA }, como(ta));
  comprobar(r.codigo === 400, 'un código restablecer de OTRA cuenta no vale');
  r = await post('/api/cuenta/clave', { via: 'correo', codigo: cod, nueva: 'corta' }, como(ta));
  comprobar(r.codigo === 400, 'contraseña débil: 400');
  nuevos();
  r = await post('/api/cuenta/clave', { via: 'correo', codigo: cod, nueva: NUEVA }, como(ta));
  const ua = db.usuarioPorId(A);
  comprobar(r.codigo === 200 && r.datos.ok === true && typeof r.datos.mensaje === 'string', 'código del correo: 200 { ok, mensaje }');
  comprobar(db.claveCorrecta(NUEVA, ua.clave_hash, ua.clave_sal) && !db.claveCorrecta(CLAVE, ua.clave_hash, ua.clave_sal),
    'la contraseña nueva vale y la vieja no');
  comprobar(!!db.sesion(ta) && db.sesion(otra) === null, 'la sesión actual sigue y la otra se cerró');
  comprobar(nuevos().some((m) => m.para === 'clave-19a@ejemplo.test' && /cambió/.test(m.asunto || '')), 'el titular recibe el aviso');

  /* La rama de siempre. */
  db.limpiarIntentos(`clave:${A}`); // el tope de 5 por hora ya se gastó arriba
  r = await post('/api/cuenta/clave', { actual: NUEVA, nueva: 'ClaveDeSiempre1234' }, como(ta));
  comprobar(r.codigo === 200, '{ actual, nueva } sigue funcionando');
  r = await post('/api/cuenta/clave', { actual: 'no-es-la-actual', nueva: 'ClaveDeSiempre5678' }, como(ta));
  comprobar(r.codigo === 401, '{ actual } equivocada sigue dando 401');

  /* SMS encendido. */
  process.env.MERCA_SMS = 'archivo';
  try {
    const S = cuenta('clave-19s@ejemplo.test', 'Clave S', { telefono: '8495550942' });
    const ts = db.abrirSesion(S);
    r = await post('/api/cuenta/clave/codigo', { via: 'sms' }, como(ts));
    comprobar(r.codigo === 400 && /no está verificado/.test(r.datos.error), 'celular sin verificar: 400 «no está verificado»');
    r = await post('/api/cuenta/clave', { via: 'sms', codigo: '123456', nueva: NUEVA }, como(ts));
    comprobar(r.codigo === 400, 'y clave por sms tampoco');
    comprobar(nuevosSms().length === 0, 'sin SMS');

    db.verificarTelefonoCuenta({ idUsuario: S, numero: '8495550942', via: 'verificado' });
    const otraS = db.abrirSesion(S);
    r = await post('/api/cuenta/clave/codigo', { via: 'sms' }, como(ts));
    comprobar(r.codigo === 202 && r.datos.via === 'sms' && r.datos.destino === '(849) •••-0942' && r.datos.minutos === 20,
      'celular verificado: 202 { via, destino, minutos }');
    const sms = nuevosSms();
    comprobar(sms.length === 1 && sms[0].numero === '8495550942', 'sale un SMS al celular');
    nuevos();
    r = await post('/api/cuenta/clave', { via: 'sms', codigo: otroCodigo(sms[0].codigo), nueva: NUEVA }, como(ts));
    comprobar(r.codigo === 400, 'código SMS equivocado: 400');
    r = await post('/api/cuenta/clave', { via: 'sms', codigo: sms[0].codigo, nueva: NUEVA }, como(ts));
    const us = db.usuarioPorId(S);
    comprobar(r.codigo === 200 && db.claveCorrecta(NUEVA, us.clave_hash, us.clave_sal), 'código SMS: 200 y contraseña cambiada');
    // D-16: ninguna ruta posterior responde 409 (no hay bloqueo tras usar el SMS).
    r = await post('/api/cuenta/correo', { clave: NUEVA, correo: 'clave-19s-nuevo@ejemplo.test' }, como(ts));
    comprobar(r.codigo === 202, 'por SMS: sin bloqueo, cambiar el correo en seguida da 202');
    comprobar(!!db.sesion(ts) && db.sesion(otraS) === null, 'por SMS: la otra sesión se cerró');
    comprobar(nuevos().some((m) => m.para === 'clave-19s@ejemplo.test' && /SMS/.test(m.texto) && /\(849\) •••-0942/.test(m.texto)),
      'por SMS: el aviso al correo menciona el SMS y la máscara');

    /* Con el SMS encendido, el correo sigue sirviendo. */
    const E = cuenta('clave-19e@ejemplo.test', 'Clave E', { telefono: '8495550943' });
    const te = db.abrirSesion(E);
    r = await post('/api/cuenta/clave/codigo', { via: 'correo' }, como(te));
    comprobar(r.codigo === 202 && r.datos.via === 'correo', 'encendido: via correo sigue dando 202');
  } finally { delete process.env.MERCA_SMS; }

  /* Tope: el sexto en una hora. */
  const T = cuenta('clave-19t@ejemplo.test', 'Clave T', { telefono: '8495550944' });
  const tt = db.abrirSesion(T);
  const codigos = [];
  db.limpiarIntentos(`codigo:clave-19t@ejemplo.test`);
  for (let i = 0; i < 6; i++) {
    db.limpiarIntentos('codigo:clave-19t@ejemplo.test');
    codigos.push((await post('/api/cuenta/clave/codigo', { via: 'correo' }, como(tt))).codigo);
  }
  comprobar(codigos.join() === '202,202,202,202,202,429', 'el sexto clave/codigo de una cuenta en una hora: 429');
}

/* ── 20. Lo que D-16 quitó ───────────────────────────────────── */
seccion('20. Lo que D-16 quitó');
{
  nuevosSms();
  nuevos();
  process.env.MERCA_SMS = 'archivo';
  try {
    /* «Olvidé mi contraseña» con via sms: responde como por correo y no manda SMS. */
    const A = cuenta('d16-a@ejemplo.test', 'D16 A', { telefono: '8495551001' });
    db.verificarTelefonoCuenta({ idUsuario: A, numero: '8495551001', via: 'verificado' });
    limpiarNumero('8495551001');
    nuevosSms();
    nuevos();
    let r = await post('/api/cuenta/recuperar', { correo: 'd16-a@ejemplo.test', via: 'sms', telefono: '8495551001' }, como(null));
    await tick();
    comprobar(r.codigo === 202 && r.datos.verificacion === 'restablecer' && !('via' in r.datos) && !('destino' in r.datos),
      'recuperar con via sms: 202 con el cuerpo de siempre por correo (sin via ni destino)');
    comprobar(nuevosSms().length === 0, 'recuperar con via sms: no sale ningún SMS');
    comprobar(nuevos().some((m) => m.para === 'd16-a@ejemplo.test'), 'recuperar con via sms: el código llega al correo del titular');

    /* Restablecer con un código SMS válido: 400 y la contraseña no cambia. */
    const { codigo } = db.crearCodigoTelefono({ idUsuario: A, numero: '8495551001', proposito: 'clave', ip: '201.7.7.7' });
    r = await post('/api/cuenta/restablecer', { correo: 'd16-a@ejemplo.test', via: 'sms', telefono: '8495551001', codigo, clave: NUEVA }, como(null));
    const ua = db.usuarioPorId(A);
    comprobar(r.codigo === 400 && db.claveCorrecta(CLAVE, ua.clave_hash, ua.clave_sal),
      'restablecer con via sms y un código SMS válido: 400 y la contraseña no cambia');

    /* Las cuatro rutas de recuperacion-sms ya no existen, con el SMS encendido y apagado. */
    const rutas = ['', '/codigo', '/correo', '/confirmar'].map((x) => `/api/cuenta/recuperacion-sms${x}`);
    for (const encendido of [true, false]) {
      if (!encendido) delete process.env.MERCA_SMS;
      for (const ruta of rutas) {
        r = await post(ruta, { correo: 'd16-a@ejemplo.test', telefono: '8495551001' }, como(null));
        comprobar(r.codigo === 404 && r.datos.error === 'Ruta inexistente',
          `${ruta} con el SMS ${encendido ? 'encendido' : 'apagado'}: 404 Ruta inexistente`);
      }
    }
    process.env.MERCA_SMS = 'archivo';

    /* Restablecer por correo ya no quita el celular verificado (sin ventana de 10 días). */
    const B = cuenta('d16-b@ejemplo.test', 'D16 B', { telefono: '8495551002' });
    db.verificarTelefonoCuenta({ idUsuario: B, numero: '8495551002', via: 'verificado' });
    const { codigo: porCorreo } = db.crearCodigo({ correo: 'd16-b@ejemplo.test', tipo: 'restablecer', idUsuario: B });
    r = await post('/api/cuenta/restablecer', { correo: 'd16-b@ejemplo.test', codigo: porCorreo, clave: NUEVA }, como(null));
    comprobar(r.codigo === 200 && db.usuarioPorId(B).telefono_verificado !== null,
      'restablecer por correo: 200 y el celular sigue verificado');

    /* «No fui yo» del cambio de correo quita el celular verificado. */
    const C = cuenta('d16-c@ejemplo.test', 'D16 C', { telefono: '8495551003' });
    db.verificarTelefonoCuenta({ idUsuario: C, numero: '8495551003', via: 'verificado' });
    const cambio = db.cambiarCorreo({ idUsuario: C, nuevo: 'd16-c-nuevo@ejemplo.test', via: 'usuario', ip: '201.7.7.8', verificado: true, conReversion: true });
    r = await post('/api/cuenta/correo/revertir', { testigo: cambio.testigoRevertir }, como(null));
    const uc = db.usuarioPorId(C);
    comprobar(r.codigo === 200 && /quitamos el celular verificado/.test(r.datos.mensaje), '«No fui yo»: 200 y el mensaje dice que quitamos el celular verificado');
    comprobar(uc.correo === 'd16-c@ejemplo.test' && uc.telefono_verificado === null, '«No fui yo»: el correo vuelve al anterior y el celular queda sin verificar');
  } finally { delete process.env.MERCA_SMS; }

  /* Aprobar una recuperación revisada quita el celular. */
  const admin = cuenta('admin-21@ejemplo.test', 'Admin 21');
  db.marcarAdmin('admin-21@ejemplo.test', true);
  const Y = cuenta('aprobar-21@ejemplo.test', 'Aprobar Y', { telefono: '8495550970' });
  db.verificarTelefonoCuenta({ idUsuario: Y, numero: '8495550970', via: 'verificado' });
  const sol = db.crearSolicitudRecuperacion({ correoCuenta: 'aprobar-21@ejemplo.test', correoContacto: 'aprobar-21-nuevo@ejemplo.test',
    nombre: 'Aprobar Y', telefono: '8495550970', detalle: 'Perdí el acceso a mi correo', ip: '201.4.4.5' });
  db.abrir().prepare('UPDATE solicitudes_recuperacion SET resolver_desde = ? WHERE id = ?').run(PASADO, sol.id);
  const rr = await post(`/api/admin/recuperaciones/${sol.id}/aprobar`, { motivo: 'Comprobé el RNC y el pago contra el registro' }, como(db.abrirSesion(admin)));
  comprobar(rr.codigo === 200 && db.usuarioPorId(Y).telefono_verificado === null && db.usuarioPorId(Y).correo === 'aprobar-21-nuevo@ejemplo.test',
    'aprobar una recuperación revisada: 200, correo nuevo y celular sin verificar');

  /* Orden de rutas y fuente. */
  const primera = (ruta) => api.RUTAS.find(([m, re]) => m === 'POST' && re.test(ruta));
  const pc = primera('/api/cuenta/clave/codigo');
  comprobar(!!pc && pc[1].source.includes('codigo$'), 'la primera ruta que casa con /api/cuenta/clave/codigo termina en codigo');
  const sinSesion = await post('/api/cuenta/clave/codigo', {}, como(null));
  comprobar(sinSesion.codigo === 401, 'sin sesión: /api/cuenta/clave/codigo responde 401');

  const fuente = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  const veces = (t) => fuente.split(t).length - 1;
  comprobar(veces('marcarContactoVerificado') === 0, 'api.js no llama marcarContactoVerificado');
  comprobar(veces('marcarCorreoVerificado') === 2,
    'api.js llama marcarCorreoVerificado exactamente 2 veces (verificar y la rama de correo de restablecer)');
  for (const t of ['recuperacion-sms', 'recuperarPorSms', 'restablecerPorSms', 'enviarSmsSinEsperar', 'autorizacionDe', 'MENSAJE_SMS_GENERICO']) {
    comprobar(veces(t) === 0, `api.js ya no contiene ${t}`);
  }
  comprobar(veces('avisarSolicitudesPendientes') === 2, 'api.js usa avisarSolicitudesPendientes (su definición y la rama de verificar por SMS)');
}

/* ── 23. Entrar desde un equipo nuevo por SMS ────────────────── */
seccion('23. Entrar desde un equipo nuevo por SMS');
{
  const codigoDeCorreo = (para) => {
    const m = nuevos().filter((x) => x.para === para).pop();
    return m && (/\b(\d{6})\b/.exec(m.asunto || '') || [])[1];
  };
  const entrar = (cuerpo, cab) => post('/api/cuenta/entrar', { clave: CLAVE, ...cuerpo }, cab || como(null));
  const verificar = (cuerpo) => post('/api/cuenta/verificar', cuerpo, como(null));
  const cuentaVerificada = (correoCuenta, telefono, { celular } = {}) => {
    const id = cuenta(correoCuenta, 'Acceso 23', { telefono });
    db.marcarCorreoVerificado(id);
    if (celular) db.verificarTelefonoCuenta({ idUsuario: id, numero: telefono, via: 'verificado' });
    limpiarNumero(telefono);
    return id;
  };
  const solicitud = (correoCuenta) => db.crearSolicitudRecuperacion({
    correoCuenta, correoContacto: correoCuenta.replace('@', '-nuevo@'), nombre: 'Acceso 23',
    telefono: '8495552399', detalle: 'Perdí el acceso a mi correo', ip: '201.4.4.23',
  });

  /* SMS apagado: como siempre. */
  cuentaVerificada('acceso-23a@ejemplo.test', '8495552301');
  nuevos();
  let r = await entrar({ correo: 'acceso-23a@ejemplo.test' });
  comprobar(r.codigo === 200 && r.datos.verificacion === 'acceso' && !('elegir' in r.datos),
    'SMS apagado: entrar da 200 acceso sin elegir');
  comprobar(/^\d{6}$/.test(codigoDeCorreo('acceso-23a@ejemplo.test') || ''), 'SMS apagado: llega un correo con código al titular');
  r = await entrar({ correo: 'acceso-23a@ejemplo.test', via: 'sms' });
  comprobar(r.codigo === 400 && /todavía no están disponibles/.test(r.datos.error), 'SMS apagado: via sms da 400');

  process.env.MERCA_SMS = 'archivo';
  try {
    /* Celular sin verificar: como apagado. */
    const B = cuentaVerificada('acceso-23b@ejemplo.test', '8495552302');
    nuevos();
    nuevosSms();
    r = await entrar({ correo: 'acceso-23b@ejemplo.test' });
    comprobar(r.codigo === 200 && r.datos.verificacion === 'acceso' && !('elegir' in r.datos), 'celular sin verificar: entrar no ofrece elegir');
    comprobar(/^\d{6}$/.test(codigoDeCorreo('acceso-23b@ejemplo.test') || ''), 'celular sin verificar: el código va al correo');
    r = await entrar({ correo: 'acceso-23b@ejemplo.test', via: 'sms' });
    comprobar(r.codigo === 400 && /no está verificado/.test(r.datos.error), 'celular sin verificar: via sms da 400 «no está verificado»');
    r = await verificar({ correo: 'acceso-23b@ejemplo.test', tipo: 'acceso', via: 'sms', codigo: '123456' });
    comprobar(r.codigo === 400, 'celular sin verificar: verificar por sms da 400');
    comprobar(nuevosSms().length === 0, 'celular sin verificar: ningún SMS');

    /* Celular verificado: elegir. */
    const C = cuentaVerificada('acceso-23c@ejemplo.test', '8495552303', { celular: true });
    const solC = solicitud('acceso-23c@ejemplo.test');
    nuevos();
    nuevosSms();
    r = await entrar({ correo: 'acceso-23c@ejemplo.test' });
    comprobar(r.codigo === 200 && r.datos.elegir === true && r.datos.verificacion === 'acceso' && r.datos.correo === 'acceso-23c@ejemplo.test',
      'verificado: entrar sin via responde elegir');
    comprobar(r.datos.opciones.sms === '(849) •••-2303' && r.datos.opciones.correo.includes('•••'),
      'verificado: las dos máscaras en opciones');
    await tick();
    comprobar(nuevos().length === 0 && nuevosSms().length === 0, 'verificado: elegir no envía ni correo ni SMS');

    r = await entrar({ correo: 'acceso-23c@ejemplo.test', via: 'correo' });
    comprobar(r.codigo === 200 && !('elegir' in r.datos) && /^\d{6}$/.test(codigoDeCorreo('acceso-23c@ejemplo.test') || ''),
      'via correo: código al correo y sin elegir');
    comprobar(nuevosSms().length === 0, 'via correo: ningún SMS');

    r = await entrar({ correo: 'acceso-23c@ejemplo.test', via: 'sms' });
    comprobar(r.codigo === 200 && r.datos.via === 'sms' && r.datos.destino === '(849) •••-2303' && r.datos.minutos === 10
      && r.datos.verificacion === 'acceso' && /por SMS/.test(r.datos.mensaje), 'via sms: 200 { via, destino, minutos: 10 }');
    const sms = nuevosSms();
    comprobar(sms.length === 1 && sms[0].numero === '8495552303' && /entrar a su cuenta/.test(sms[0].texto), 'via sms: un SMS al número con el texto de acceso');

    nuevos();
    r = await verificar({ correo: 'acceso-23c@ejemplo.test', tipo: 'acceso', via: 'sms', codigo: otroCodigo(sms[0].codigo) });
    comprobar(r.codigo === 400 && /Código incorrecto\. Le quedan 4 intentos\./.test(r.datos.error), 'verificar por sms con código malo: 400 con intentos');
    const verificadoAntes = db.usuarioPorId(C).correo_verificado;
    r = await verificar({ correo: 'acceso-23c@ejemplo.test', tipo: 'acceso', via: 'sms', codigo: sms[0].codigo, recordar: true });
    const cookies = [].concat(r.cabeceras['Set-Cookie'] || []).join(';');
    comprobar(r.codigo === 200 && !!r.datos.usuario && /te_sesion=/.test(cookies) && /te_equipo=/.test(cookies),
      'verificar por sms con el código bueno: 200, sesión y equipo recordado');
    comprobar(db.usuarioPorId(C).correo_verificado === verificadoAntes, 'verificar por sms no toca correo_verificado');
    await tick();
    const correos = nuevos();
    comprobar(fila('SELECT estado FROM solicitudes_recuperacion WHERE id = ?', solC.id).estado === 'pendiente',
      'la solicitud revisada pendiente SIGUE pendiente tras entrar con contraseña + SMS');
    comprobar(avisosSoporte(correos, new RegExp(solC.referencia)).length === 1, 'soporte recibe un aviso con la referencia de la solicitud');
    comprobar(correos.some((m) => m.para === 'acceso-23c@ejemplo.test' && /SMS/.test(m.asunto || '')), 'el titular recibe el aviso de acceso por SMS');
    r = await verificar({ correo: 'acceso-23c@ejemplo.test', tipo: 'acceso', via: 'sms', codigo: sms[0].codigo });
    comprobar(r.codigo === 400, 'el código por SMS sirve una sola vez');

    /* En contraste, con el código al correo SÍ se anula. */
    const D = cuentaVerificada('acceso-23d@ejemplo.test', '8495552304', { celular: true });
    const solD = solicitud('acceso-23d@ejemplo.test');
    nuevos();
    r = await entrar({ correo: 'acceso-23d@ejemplo.test', via: 'correo' });
    const cod = codigoDeCorreo('acceso-23d@ejemplo.test');
    r = await verificar({ correo: 'acceso-23d@ejemplo.test', tipo: 'acceso', codigo: cod });
    comprobar(r.codigo === 200 && !!r.datos.usuario, 'código al correo: entra');
    comprobar(fila('SELECT estado FROM solicitudes_recuperacion WHERE id = ?', solD.id).estado === 'anulada',
      'código al correo: la solicitud revisada pendiente se anula, como hoy');
    comprobar(D && !avisosSoporte(nuevos(), new RegExp(solD.referencia)).length, 'código al correo: soporte no recibe el aviso de SMS');

    /* Contraseña mala: nada sale. */
    const E = cuentaVerificada('acceso-23e@ejemplo.test', '8495552305', { celular: true });
    nuevosSms();
    nuevos();
    r = await entrar({ correo: 'acceso-23e@ejemplo.test', clave: 'ClaveEquivocada123', via: 'sms' });
    await tick();
    comprobar(r.codigo === 401 && /Correo o contraseña incorrectos/.test(r.datos.error), 'contraseña mala con via sms: 401 de siempre');
    comprobar(nuevosSms().length === 0 && nuevos().length === 0, 'contraseña mala con via sms: no sale nada');
    r = await entrar({ correo: 'acceso-23e@ejemplo.test', clave: 'ClaveEquivocada123' });
    comprobar(r.codigo === 401 && !('opciones' in r.datos), 'contraseña mala sin via: 401 y sin máscaras');

    /* Equipo de confianza: via se ignora. */
    r = await entrar({ correo: 'acceso-23e@ejemplo.test', via: 'sms' },
      { ...como(null), cookie: 'te_equipo=' + db.recordarDispositivo(E, 'prueba') });
    comprobar(r.codigo === 200 && !!r.datos.usuario, 'equipo de confianza: via sms se ignora y abre la sesión');
    comprobar(nuevosSms().length === 0, 'equipo de confianza: ningún SMS');

    /* Un código de otro propósito o un tipo distinto no sirven. */
    const { codigo: deClave } = db.crearCodigoTelefono({ idUsuario: E, numero: '8495552305', proposito: 'clave', ip: '201.7.7.23' });
    r = await verificar({ correo: 'acceso-23e@ejemplo.test', tipo: 'acceso', via: 'sms', codigo: deClave });
    comprobar(r.codigo === 400, 'un código SMS de propósito clave no sirve para verificar por SMS');
    r = await verificar({ correo: 'acceso-23e@ejemplo.test', tipo: 'verificacion', via: 'sms', codigo: deClave });
    comprobar(r.codigo === 400 && /Código incorrecto/.test(r.datos.error), 'verificar por SMS con tipo verificacion: 400');
    r = await verificar({ correo: 'no-existe-23@ejemplo.test', tipo: 'acceso', via: 'sms', codigo: '123456' });
    comprobar(r.codigo === 400, 'verificar por SMS sin cuenta: 400');

    /* Tope por número: la cuarta en la hora. */
    cuentaVerificada('acceso-23h@ejemplo.test', '8495552306', { celular: true });
    const codigos = [];
    for (let i = 0; i < 4; i++) codigos.push((await entrar({ correo: 'acceso-23h@ejemplo.test', via: 'sms' })).codigo);
    comprobar(codigos.join() === '200,200,200,429', 'la cuarta petición via sms al mismo número en la hora: 429');
  } finally { delete process.env.MERCA_SMS; }

  const fuente23 = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  comprobar(fuente23.split('marcarCorreoVerificado').length - 1 === 2, 'api.js sigue llamando marcarCorreoVerificado exactamente 2 veces');
  const iEntrar = fuente23.indexOf('async function entrar(');
  const iClave = fuente23.indexOf('db.verificarClave', iEntrar);
  const iSms = fuente23.indexOf("proposito: 'acceso'", iEntrar);
  comprobar(iClave > 0 && iSms > iClave, "en entrar, el SMS de acceso se emite después de db.verificarClave");
}

/* ── 24. «No fui yo» del cambio de contraseña ────────────────── */
seccion('24. «No fui yo» del cambio de contraseña');
{
  const codigoDeCorreo = (lista, para) => {
    const m = lista.filter((x) => x.para === para).pop();
    return m && (/\b(\d{6})\b/.exec(m.asunto || '') || [])[1];
  };
  const avisoDe = (lista, para) => lista.filter((m) => m.para === para && /cambió/.test(m.asunto || '')).pop();
  const testigoDe = (m) => (m && (/revertir-clave=([0-9a-f]{64})/.exec(m.texto) || [])[1]) || null;
  const viasDe = (id) => todas('SELECT via FROM cambios_clave WHERE usuario_id = ? ORDER BY rowid', id).map((f) => f.via);
  const enlace = (m) => m && m.texto.includes('No fui yo: ' + correo.SITIO + '/cuenta.html?revertir-clave=');

  /* con la actual, con código al correo, y «Olvidé mi contraseña» (SMS apagado) */
  const A = cuenta('noyo-24a@ejemplo.test', 'Noyo A', { telefono: '8495552401' });
  db.marcarCorreoVerificado(A);
  const ta = db.abrirSesion(A);
  nuevos();
  let r = await post('/api/cuenta/clave', { actual: CLAVE, nueva: 'NuevaClave24Uno' }, como(ta));
  let avisos = nuevos();
  const m1 = avisoDe(avisos, 'noyo-24a@ejemplo.test');
  comprobar(r.codigo === 200 && viasDe(A).join() === 'actual', 'con la actual: 200 y cambios_clave gana una fila actual');
  comprobar(enlace(m1) && !!testigoDe(m1), 'con la actual: el aviso lleva «No fui yo: » + enlace + 64 hex');

  r = await post('/api/cuenta/clave/codigo', { via: 'correo' }, como(ta));
  const cod = codigoDeCorreo(nuevos(), 'noyo-24a@ejemplo.test');
  r = await post('/api/cuenta/clave', { via: 'correo', codigo: cod, nueva: 'NuevaClave24Dos' }, como(ta));
  avisos = nuevos();
  const m2 = avisoDe(avisos, 'noyo-24a@ejemplo.test');
  comprobar(r.codigo === 200 && viasDe(A).join() === 'actual,correo' && enlace(m2), 'con código al correo: fila correo y enlace');

  db.limpiarIntentos('codigo:noyo-24a@ejemplo.test');
  await post('/api/cuenta/recuperar', { correo: 'noyo-24a@ejemplo.test' }, como(null));
  const codR = codigoDeCorreo(nuevos(), 'noyo-24a@ejemplo.test');
  r = await post('/api/cuenta/restablecer', { correo: 'noyo-24a@ejemplo.test', codigo: codR, clave: 'NuevaClave24Tres' }, como(null));
  avisos = nuevos();
  const m3 = avisoDe(avisos, 'noyo-24a@ejemplo.test');
  comprobar(r.codigo === 200 && viasDe(A).join() === 'actual,correo,restablecer' && enlace(m3), '«Olvidé mi contraseña»: fila restablecer y enlace');
  comprobar(new Set([testigoDe(m1), testigoDe(m2), testigoDe(m3)]).size === 3, 'cada aviso lleva un testigo distinto');

  /* con SMS encendido y celular verificado */
  process.env.MERCA_SMS = 'archivo';
  try {
    const S = cuenta('noyo-24s@ejemplo.test', 'Noyo S', { telefono: '8495552402' });
    db.marcarCorreoVerificado(S);
    db.verificarTelefonoCuenta({ idUsuario: S, numero: '8495552402', via: 'verificado' });
    limpiarNumero('8495552402');
    const t1 = db.abrirSesion(S);
    const t2 = db.abrirSesion(S);
    const sol = db.crearSolicitudRecuperacion({
      correoCuenta: 'noyo-24s@ejemplo.test', correoContacto: 'noyo-24s-nuevo@ejemplo.test', nombre: 'Noyo S',
      telefono: '8495552499', detalle: 'Perdí el acceso a mi correo', ip: '201.4.4.24',
    });
    nuevosSms();
    nuevos();
    await post('/api/cuenta/clave/codigo', { via: 'sms' }, como(t1));
    const smsS = nuevosSms();
    r = await post('/api/cuenta/clave', { via: 'sms', codigo: smsS[0].codigo, nueva: 'NuevaClave24Sms' }, como(t1));
    const mS = avisoDe(nuevos(), 'noyo-24s@ejemplo.test');
    comprobar(r.codigo === 200 && viasDe(S).join() === 'sms' && enlace(mS) && /SMS/.test(mS.texto),
      'con SMS: fila sms, aviso con «SMS» y enlace');
    const testigo = testigoDe(mS);
    comprobar(!!testigo && testigo !== testigoDe(m3), 'el testigo del aviso por SMS es otro');
    const t3 = db.abrirSesion(S); // una sesión más, abierta con la contraseña nueva
    db.recordarDispositivo(S, 'prueba');

    /* el testigo, sin sesión */
    nuevos();
    r = await post('/api/cuenta/clave/revertir', { testigo }, como(null));
    const us = db.usuarioPorId(S);
    comprobar(r.codigo === 200 && r.datos.verificacion === 'restablecer' && r.datos.correo === 'noyo-24s@ejemplo.test' && /celular/.test(r.datos.mensaje),
      'revertir: 200 { verificacion: restablecer, correo } y el mensaje menciona el celular');
    comprobar(db.sesion(t1) === null && db.sesion(t2) === null && db.sesion(t3) === null, 'revertir: no queda ninguna sesión');
    comprobar(!db.claveCorrecta('NuevaClave24Sms', us.clave_hash, us.clave_sal) && !db.claveCorrecta(CLAVE, us.clave_hash, us.clave_sal),
      'revertir: ni la contraseña vieja ni la nueva valen');
    comprobar(us.telefono_verificado === null, 'revertir: el celular queda sin verificar');
    comprobar(todas('SELECT 1 FROM dispositivos WHERE usuario_id = ?', S).length === 0, 'revertir: no queda ningún equipo recordado');
    comprobar(fila('SELECT estado FROM solicitudes_recuperacion WHERE id = ?', sol.id).estado === 'anulada', 'revertir: la solicitud revisada pendiente se anula');
    await tick();
    const codS = codigoDeCorreo(nuevos(), 'noyo-24s@ejemplo.test');
    comprobar(/^\d{6}$/.test(codS || ''), 'revertir: llega al titular un código restablecer');
    r = await post('/api/cuenta/restablecer', { correo: 'noyo-24s@ejemplo.test', codigo: codS, clave: 'ClaveElegida24Ok' }, como(null));
    const us2 = db.usuarioPorId(S);
    comprobar(r.codigo === 200 && db.claveCorrecta('ClaveElegida24Ok', us2.clave_hash, us2.clave_sal), 'con ese código se crea una contraseña y vale');

    /* un solo uso, inventado, vencido */
    r = await post('/api/cuenta/clave/revertir', { testigo }, como(null));
    comprobar(r.codigo === 400 && /no es válido o ya se usó/.test(r.datos.error), 'el mismo testigo otra vez: 400');
    r = await post('/api/cuenta/clave/revertir', { testigo: 'zz' }, como(null));
    comprobar(r.codigo === 400 && /no es válido o ya se usó/.test(r.datos.error), 'testigo «zz»: 400 igual');

    const V = cuenta('noyo-24v@ejemplo.test', 'Noyo V', { telefono: '8495552403' });
    db.verificarTelefonoCuenta({ idUsuario: V, numero: '8495552403', via: 'verificado' });
    const cv = db.anotarCambioClave({ idUsuario: V, via: 'actual', ip: '201.7.7.24' });
    db.abrir().prepare('UPDATE cambios_clave SET revertir_expira = ? WHERE id = ?').run(PASADO, cv.id);
    const vAntes = db.usuarioPorId(V);
    r = await post('/api/cuenta/clave/revertir', { testigo: cv.testigoRevertir }, como(null));
    const vDespues = db.usuarioPorId(V);
    comprobar(r.codigo === 400 && /venció/.test(r.datos.error), 'testigo vencido: 400 «venció»');
    comprobar(vDespues.clave_hash === vAntes.clave_hash && !!vDespues.telefono_verificado, 'testigo vencido: la cuenta queda intacta');
  } finally { delete process.env.MERCA_SMS; }

  /* tope por IP: el 11.º en 15 minutos */
  const ipTope = '201.8.8.24';
  const codigos = [];
  for (let i = 0; i < 11; i++) codigos.push((await post('/api/cuenta/clave/revertir', { testigo: 'zz' }, como(null, ipTope))).codigo);
  comprobar(codigos.slice(0, 10).every((x) => x === 400) && codigos[10] === 429, 'el undécimo intento desde la misma IP: 429');

  /* orden de rutas */
  const primera = (ruta) => api.RUTAS.find(([m, re]) => m === 'POST' && re.test(ruta));
  const pr = primera('/api/cuenta/clave/revertir');
  const pk = primera('/api/cuenta/clave');
  comprobar(!!pr && pr[1].source.includes('revertir$'), 'la primera ruta que casa con /clave/revertir termina en revertir$');
  comprobar(!!pk && pk[1].source === '^\\/api\\/cuenta\\/clave$' && pk !== pr, '/clave sigue con su propia ruta');
}
}

main().then(() => {
  console.log(`\n${bien} bien, ${mal} mal`);
  process.exit(mal ? 1 : 0);
}).catch((e) => {
  console.error(e);
  process.exit(1);
});
