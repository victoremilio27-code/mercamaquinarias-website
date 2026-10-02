/**
 * probar-testigos.js — DEUDA-01 (#72): los testigos de sesión y de equipo
 * de confianza se guardan como HMAC, nunca en claro.
 *
 *   node tools/probar-testigos.js
 *
 * POR QUÉ EXISTE
 *
 * Fija el contrato antes de cambiar las funciones de sesión (tanda 5):
 * la cookie sigue llevando el testigo en claro, la base guarda solo
 * `huellaTestigo(clase, testigo)`, y presentar como cookie lo que hay en
 * la base no abre nada. Las firmas públicas de `abrirSesion`, `sesion`,
 * `cerrarSesion`, `cerrarOtrasDe`, `recordarDispositivo` y
 * `dispositivoDeConfianza` NO cambian: `tools/api.js` no se toca.
 *
 * Corre contra una base TEMPORAL en `.tmp/prueba-testigos/`.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* Antes de cargar db.js: la ruta de la base y el secreto se leen al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-testigos');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');

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
const lanza = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const fila = (sql, ...args) => db.abrir().prepare(sql).get(...args);
const todas = (sql, ...args) => db.abrir().prepare(sql).all(...args);

function cuenta(correoCuenta) {
  const { idUsuario } = db.crearCuenta({
    correo: correoCuenta, clave: 'UnaClaveLargaYSegura9', nombre: 'Prueba Testigos',
    telefono: '8095550000', tipo: 'particular',
  });
  return idUsuario;
}

console.log('\n1 · La huella');
{
  comprobar(!!fila("SELECT 1 FROM migraciones WHERE id = '2026-10-testigos-hmac'"), 'migración anotada');
  const t = 'a'.repeat(64);
  const esperada = crypto.createHmac('sha256', process.env.MERCA_SECRETO).update(`testigo-sesion|${t}`).digest('hex');
  comprobar(db.huellaTestigo('sesion', t) === esperada, 'HMAC-SHA256 de «testigo-sesion|<testigo>» con MERCA_SECRETO');
  comprobar(db.huellaTestigo('sesion', t) !== db.huellaTestigo('dispositivo', t), 'la clase cambia la huella');
  comprobar(!!lanza(() => db.huellaTestigo('otra', t)), 'una clase desconocida lanza');
}

console.log('\n2 · Sesiones');
{
  const u = cuenta('ana-testigo@ejemplo.test');
  const t = db.abrirSesion(u);
  comprobar(/^[0-9a-f]{64}$/.test(t), 'abrirSesion sigue devolviendo el testigo en claro (va a la cookie)');
  const guardadas = todas('SELECT testigo FROM sesiones WHERE usuario_id = ?', u).map((f) => f.testigo);
  comprobar(guardadas.length === 1 && guardadas[0] === db.huellaTestigo('sesion', t), 'en la base, solo la huella');
  comprobar(!guardadas.includes(t), 'el testigo en claro no está en la base');
  const s = db.sesion(t);
  comprobar(s && s.usuario_id === u, 'sesion(testigo) encuentra la sesión');
  comprobar(db.sesion(guardadas[0]) === null, 'presentar la huella copiada de la base no abre nada');

  const t2 = db.abrirSesion(u);
  const cerradas = db.cerrarOtrasDe(u, t2);
  comprobar(cerradas === 1 && db.sesion(t) === null && !!db.sesion(t2), 'cerrarOtrasDe conserva la actual por su testigo en claro');

  db.cerrarSesion(t2);
  comprobar(db.sesion(t2) === null && todas('SELECT 1 FROM sesiones WHERE usuario_id = ?', u).length === 0,
    'cerrarSesion(testigo) la borra');

  const t3 = db.abrirSesion(u);
  db.abrir().prepare('UPDATE sesiones SET expira = ? WHERE testigo = ?').run('2000-01-01T00:00:00.000Z', db.huellaTestigo('sesion', t3));
  comprobar(db.sesion(t3) === null && todas('SELECT 1 FROM sesiones WHERE usuario_id = ?', u).length === 0,
    'una sesión caducada se borra al usarla');
}

console.log('\n3 · Equipos de confianza');
{
  const u = cuenta('beto-testigo@ejemplo.test');
  const otro = cuenta('caro-testigo@ejemplo.test');
  const t = db.recordarDispositivo(u, 'Firefox en Linux');
  comprobar(/^[0-9a-f]{64}$/.test(t), 'recordarDispositivo sigue devolviendo el testigo en claro');
  const guardado = fila('SELECT testigo FROM dispositivos WHERE usuario_id = ?', u).testigo;
  comprobar(guardado === db.huellaTestigo('dispositivo', t) && guardado !== t, 'en la base, solo la huella');
  comprobar(db.dispositivoDeConfianza(t, u) === true, 'dispositivoDeConfianza(testigo) lo reconoce');
  comprobar(db.dispositivoDeConfianza(guardado, u) === false, 'la huella copiada de la base no vale');
  comprobar(db.dispositivoDeConfianza(t, otro) === false, 'ni para otra cuenta');
  comprobar(!!fila('SELECT ultimo_uso FROM dispositivos WHERE testigo = ?', guardado).ultimo_uso, 'anota el último uso');
  /* Una sesión no sirve como equipo de confianza aunque se copie la fila. */
  const ts = db.abrirSesion(u);
  comprobar(db.dispositivoDeConfianza(ts, u) === false, 'el testigo de una sesión no es un equipo');
}

console.log(`\n${bien} ok, ${mal} MAL`);
process.exit(mal ? 1 : 0);
