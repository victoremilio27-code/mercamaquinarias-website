/**
 * probar-importacion-migracion.js — fase 14, base C2 (#148): la migración
 * `2026-10-importacion-asistida`.
 *
 *   node tools/probar-importacion-migracion.js
 *
 * POR QUÉ EXISTE
 *
 * Una migración se ejecuta una sola vez en producción y no se puede
 * reescribir. Esta prueba la pasa por los dos caminos que tendrá en la
 * vida real: una base nueva (schema.sql + todas las migraciones) y una
 * base que ya tenía todas las anteriores y PAGOS CON FILAS, que es la de
 * producción. Comprueba que entra una sola vez, que los CHECK rechazan
 * lo que no está en la lista, que el libro, los eventos y las
 * aceptaciones no se pueden reescribir y que `pagos` conserva sus filas.
 *
 * Cada apertura de la base corre en un proceso hijo: `abrir()` guarda la
 * conexión y aplica las migraciones al abrir, así que la única forma de
 * ver «otro arranque del servidor» es arrancar otro proceso. Las
 * variables de entorno se fijan en ese hijo ANTES del require de db.js.
 *
 * La base «con las anteriores» se fabrica deshaciendo a mano solo esta
 * migración sobre una base completa (borrar sus tablas, su índice y su
 * columna, y su fila en `migraciones`). Es lo mismo que tenía producción
 * justo antes, sin depender de una copia vieja de db.js.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.join(__dirname, '..');
const BANCO = path.join(RAIZ, '.tmp', 'prueba-importacion-migracion');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

const MIGRACION = '2026-10-importacion-asistida';
const TABLAS = [
  'importaciones', 'importacion_lotes', 'importacion_eventos', 'importacion_movimientos',
  'importacion_aceptaciones', 'importacion_documentos', 'importacion_revisiones_datos',
];

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) { bien++; console.log(`  ok  ${que}`); return; }
  mal++;
  console.log(`  MAL ${que}`);
}
const lanza = (fn) => { try { fn(); return null; } catch (e) { return e; } };

/* Arranca db.js en otro proceso contra `archivo` y corre `codigo` con
   `db` ya cargado. Devuelve la salida o lanza con el error del hijo. */
function enHijo(archivo, codigo = '') {
  const programa = `
    const db = require(${JSON.stringify(path.join(__dirname, 'db.js'))});
    db.abrir();
    ${codigo}
  `;
  const r = spawnSync(process.execPath, ['-e', programa], {
    env: Object.assign({}, process.env, {
      MERCA_DB: archivo,
      MERCA_CORREO: 'archivo',
      MERCA_CORREOS: path.join(BANCO, 'correos'),
      MERCA_SECRETO: 'secreto-de-prueba-no-usar-en-produccion',
    }),
    encoding: 'utf8',
  });
  if (r.status !== 0) throw new Error(`el hijo falló:\n${r.stderr || r.stdout}`);
  return r.stdout;
}

const abrirCruda = (archivo) => new DatabaseSync(archivo);
const tablasDe = (d) => new Set(d.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((f) => f.name));
const columnasDe = (d, tabla) => d.prepare(`PRAGMA table_info(${tabla})`).all().map((c) => c.name);
const vecesAnotada = (d) => d.prepare('SELECT COUNT(*) AS n FROM migraciones WHERE id = ?').get(MIGRACION).n;

function comprobarEsquema(d, donde) {
  const tablas = tablasDe(d);
  comprobar(TABLAS.every((t) => tablas.has(t)), `${donde}: están las ${TABLAS.length} tablas nuevas`);
  comprobar(columnasDe(d, 'pagos').includes('importacion_id'), `${donde}: pagos tiene importacion_id`);
  const indice = d.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'ix_pagos_importacion'").get();
  comprobar(!!indice, `${donde}: pagos tiene su índice por importacion_id`);
  comprobar(vecesAnotada(d) === 1, `${donde}: la migración está anotada una sola vez`);
  for (const t of TABLAS) {
    const n = d.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    if (n !== 0) comprobar(false, `${donde}: ${t} nace vacía (tiene ${n})`);
  }
  comprobar(true, `${donde}: ninguna tabla nueva trae datos`);
}

/* ── 1 · Base nueva ─────────────────────────────────────── */
console.log('\n1 · Base nueva');
const NUEVA = path.join(BANCO, 'nueva.db');
enHijo(NUEVA);
{
  const d = abrirCruda(NUEVA);
  comprobarEsquema(d, 'nueva');
  d.close();
}
enHijo(NUEVA);
{
  const d = abrirCruda(NUEVA);
  comprobar(vecesAnotada(d) === 1, 'nueva: un segundo arranque no la vuelve a aplicar');
  d.close();
}

/* ── 2 · Base con todas las anteriores y pagos con filas ── */
console.log('\n2 · Base con las migraciones anteriores y pagos con filas');
const VIEJA = path.join(BANCO, 'vieja.db');
const salida = enHijo(VIEJA, `
  const { idOrg } = db.crearCuenta({
    correo: 'migracion@prueba.do', clave: 'UnaClaveLargaYSegura9', nombre: 'Prueba Migración',
    telefono: '8095550000', tipo: 'particular',
  });
  const d = db.abrir();
  for (const [idPago, total] of [['pago-viejo-1', 118000], ['pago-viejo-2', 236000]]) {
    d.prepare(\`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, creado)
               VALUES (?, ?, ?, ?, ?, 'aprobado', ?)\`)
      .run(idPago, idOrg, total - total * 18 / 118, total * 18 / 118, total, new Date().toISOString());
  }
  process.stdout.write(idOrg);
`);
const ORG = salida.trim();
{
  // Se deshace solo esta migración: así estaba producción justo antes.
  const d = abrirCruda(VIEJA);
  d.exec('DROP INDEX IF EXISTS ix_pagos_importacion');
  d.exec('ALTER TABLE pagos DROP COLUMN importacion_id');
  for (const t of TABLAS.slice().reverse()) d.exec(`DROP TABLE IF EXISTS ${t}`);
  d.prepare('DELETE FROM migraciones WHERE id = ?').run(MIGRACION);
  const tablas = tablasDe(d);
  comprobar(TABLAS.every((t) => !tablas.has(t)) && !columnasDe(d, 'pagos').includes('importacion_id'),
    'vieja: preparada sin la migración nueva');
  const otras = d.prepare('SELECT COUNT(*) AS n FROM migraciones').get().n;
  comprobar(otras > 10, `vieja: conserva las ${otras} migraciones anteriores`);
  d.close();
}
enHijo(VIEJA);
{
  const d = abrirCruda(VIEJA);
  comprobarEsquema(d, 'vieja');
  const pagos = d.prepare('SELECT id, total, importacion_id FROM pagos ORDER BY id').all();
  comprobar(pagos.length === 2 && pagos[0].total === 118000 && pagos[1].total === 236000,
    'vieja: pagos conserva sus filas e importes');
  comprobar(pagos.every((p) => p.importacion_id === null), 'vieja: los pagos viejos quedan sin importación');
  d.close();
}
enHijo(VIEJA);
{
  const d = abrirCruda(VIEJA);
  comprobar(vecesAnotada(d) === 1, 'vieja: un segundo arranque no la vuelve a aplicar');
  d.close();
}

/* ── 3 · Los CHECK ──────────────────────────────────────── */
console.log('\n3 · Los CHECK rechazan lo que no está en la lista');
{
  const d = abrirCruda(VIEJA);
  const usuario = d.prepare('SELECT id FROM usuarios LIMIT 1').get().id;
  const ahora = new Date().toISOString();
  const expediente = (cambios = {}) => Object.assign({
    id: `imp-${Math.random().toString(36).slice(2)}`,
    referencia: `I2026-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
    estado: 'solicitada', presupuesto: 5000000, inspeccion: 'no_pedida',
  }, cambios);
  const insertar = (e) => d.prepare(`INSERT INTO importaciones
      (id, referencia, organizacion_id, usuario_id, estado, tipo_equipo, provincia_destino,
       presupuesto_declarado, inspeccion, creada, actualizada)
      VALUES (?, ?, ?, ?, ?, 'excavadora', 'Santo Domingo', ?, ?, ?, ?)`)
    .run(e.id, e.referencia, ORG, usuario, e.estado, e.presupuesto, e.inspeccion, ahora, ahora);

  const bueno = expediente();
  comprobar(!lanza(() => insertar(bueno)), 'un expediente válido entra');
  comprobar(!!lanza(() => insertar(expediente({ estado: 'aprobada' }))), 'estado fuera de lista: rechazado');
  comprobar(!!lanza(() => insertar(expediente({ referencia: 'X2026-AAAAA' }))), 'referencia sin la letra I: rechazada');
  comprobar(!!lanza(() => insertar(expediente({ referencia: bueno.referencia }))), 'referencia repetida: rechazada');
  comprobar(!!lanza(() => insertar(expediente({ presupuesto: 50000.5 }))), 'presupuesto con decimales: rechazado');
  comprobar(!!lanza(() => insertar(expediente({ inspeccion: 'garantizada' }))), 'estado de inspección fuera de lista: rechazado');

  const lote = (cambios = {}) => {
    const l = Object.assign({ subasta: 'ritchie_bros', excepcion: 0, motivo: null }, cambios);
    return d.prepare(`INSERT INTO importacion_lotes
        (id, importacion_id, subasta, zona, excepcion_zona, motivo_excepcion, fecha_subasta, creado)
        VALUES (?, ?, ?, 'TX', ?, ?, ?, ?)`)
      .run(`lote-${Math.random().toString(36).slice(2)}`, bueno.id, l.subasta, l.excepcion, l.motivo, ahora, ahora);
  };
  comprobar(!lanza(() => lote()), 'un lote válido entra');
  comprobar(!!lanza(() => lote({ subasta: 'otra_subasta' })), 'subasta fuera de lista: rechazada');
  comprobar(!!lanza(() => lote({ excepcion: 1 })), 'excepción de zona sin motivo: rechazada');
  comprobar(!lanza(() => lote({ excepcion: 1, motivo: 'Presupuesto alto, aprobado por Victor' })), 'excepción de zona con motivo: entra');

  const movimiento = (cambios = {}) => {
    const m = Object.assign({ sentido: 'cobro_cliente', concepto: 'deposito_puja', importe: 100000, moneda: 'USD', tasa: null, referencia: null }, cambios);
    return d.prepare(`INSERT INTO importacion_movimientos
        (importacion_id, sentido, concepto, importe, moneda, tasa, referencia, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(bueno.id, m.sentido, m.concepto, m.importe, m.moneda, m.tasa, m.referencia, ahora);
  };
  comprobar(!lanza(() => movimiento({ referencia: 'TRF-1' })), 'un cobro válido entra');
  comprobar(!!lanza(() => movimiento({ referencia: 'TRF-1' })), 'el mismo cobro con la misma referencia no entra dos veces');
  comprobar(!!lanza(() => movimiento({ concepto: 'propina' })), 'concepto fuera de lista: rechazado');
  comprobar(!!lanza(() => movimiento({ sentido: 'regalo' })), 'sentido fuera de lista: rechazado');
  comprobar(!!lanza(() => movimiento({ importe: 1000.5 })), 'importe con decimales: rechazado');
  comprobar(!!lanza(() => movimiento({ importe: -5 })), 'cobro negativo: rechazado');
  comprobar(!!lanza(() => movimiento({ sentido: 'ajuste', importe: 0 })), 'ajuste de cero: rechazado');
  comprobar(!lanza(() => movimiento({ sentido: 'ajuste', importe: -5 })), 'ajuste negativo (contramovimiento): entra');
  comprobar(!!lanza(() => movimiento({ moneda: 'EUR' })), 'moneda fuera de lista: rechazada');
  comprobar(!!lanza(() => movimiento({ moneda: 'DOP' })), 'cobro en RD$ sin tasa: rechazado');
  comprobar(!lanza(() => movimiento({ moneda: 'DOP', tasa: 60.5 })), 'cobro en RD$ con tasa: entra');

  const documento = (tipo) => d.prepare(`INSERT INTO importacion_documentos
      (id, importacion_id, tipo, nombre, formato, bytes, ruta, creado)
      VALUES (?, ?, ?, 'informe.pdf', 'application/pdf', 10, ?, ?)`)
    .run(`doc-${Math.random().toString(36).slice(2)}`, bueno.id, tipo, `imp/${Math.random().toString(36).slice(2)}.pdf`, ahora);
  comprobar(!lanza(() => documento('informe_inspeccion')), 'un documento válido entra');
  comprobar(!!lanza(() => documento('garantia')), 'tipo de documento fuera de lista: rechazado');

  /* ── 4 · Solo añadir ─────────────────────────────────── */
  console.log('\n4 · El libro, los eventos y las aceptaciones son de solo añadir');
  comprobar(!!lanza(() => d.prepare('UPDATE importacion_movimientos SET importe = 1').run()), 'UPDATE de un movimiento: abortado');
  comprobar(!!lanza(() => d.prepare('DELETE FROM importacion_movimientos').run()), 'DELETE de un movimiento: abortado');
  d.prepare(`INSERT INTO importacion_eventos (importacion_id, de_estado, a_estado, actor, fecha)
             VALUES (?, NULL, 'solicitada', 'cliente', ?)`).run(bueno.id, ahora);
  comprobar(!!lanza(() => d.prepare("UPDATE importacion_eventos SET a_estado = 'cerrada'").run()), 'UPDATE de un evento: abortado');
  comprobar(!!lanza(() => d.prepare('DELETE FROM importacion_eventos').run()), 'DELETE de un evento: abortado');
  comprobar(!!lanza(() => d.prepare(`INSERT INTO importacion_eventos (importacion_id, a_estado, actor, fecha)
             VALUES (?, 'solicitada', 'contador', ?)`).run(bueno.id, ahora)), 'evento con actor fuera de lista: rechazado');
  d.prepare(`INSERT INTO importacion_aceptaciones
             (importacion_id, condiciones_version, desglose_huella, limite_puja, usuario_id, ip, fecha)
             VALUES (?, '2026-10', ?, 5000000, ?, '127.0.0.1', ?)`).run(bueno.id, 'a'.repeat(64), usuario, ahora);
  comprobar(!!lanza(() => d.prepare('UPDATE importacion_aceptaciones SET limite_puja = 1').run()), 'UPDATE de una aceptación: abortado');
  comprobar(!!lanza(() => d.prepare('DELETE FROM importacion_aceptaciones').run()), 'DELETE de una aceptación: abortado');
  d.close();
}

console.log(`\n${bien} bien, ${mal} mal`);
process.exit(mal ? 1 : 0);
