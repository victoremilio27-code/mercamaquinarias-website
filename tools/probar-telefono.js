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
   strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'), nunca con Date.now(). */
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

/* ── Aquí siguen los bloques de los planes 04 y 05 ── */

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
