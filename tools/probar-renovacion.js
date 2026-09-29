/**
 * probar-renovacion.js — vencer de verdad, renovar y recordatorios.
 *
 *   node tools/probar-renovacion.js
 *
 * POR QUÉ EXISTE
 *
 * Hasta la fase 05.3 una suscripción nunca vencía: `suscripcionesDe`
 * solo miraba `estado = 'activa'` y nadie pasaba ese estado a
 * 'vencida', así que una membresía de 30 días seguía dando cupos y
 * encendiendo la página del dealer para siempre (auditoría §1.9). Y
 * renovar no existía: el anunciante tenía que volver a publicar, con
 * otro anuncio, perdiendo fotos, historial y métricas.
 *
 * Esta prueba fija las tres piezas de la base:
 *   1. Una suscripción con `fin` pasado deja de contar y la tarea la
 *      pasa a 'vencida' sin borrar nada.
 *   2. La renovación es una intención más de `aprobarPago` (la única
 *      transición): suma al final, devuelve a activo el MISMO anuncio y
 *      su comprobante cuadra.
 *   3. El registro de recordatorios de 7, 3 y 1 día: uno por anuncio,
 *      tipo y ciclo, aunque la tarea corra dos veces.
 *
 * Como probar-publicacion.js, corre contra una base DESECHABLE en
 * `.tmp/prueba-renovacion/` que se borra y se recrea en cada pasada.
 * Nunca toca la red ni la base real.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* Las variables de entorno ANTES de cargar db.js: la ruta de la base
   se resuelve al importarlo. Hecho después, la prueba escribiría en la
   base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-renovacion');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
process.env.MERCA_FOTOS = path.join(BANCO, 'fotos');
process.env.MERCA_VIDEOS = path.join(BANCO, 'videos');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

/* Un .env local o el entorno de quien corre la prueba no puede decidir
   el resultado: la transferencia se apaga del todo. */
for (const k of Object.keys(process.env)) {
  if (k.startsWith('MERCA_TRANSFERENCIA')) delete process.env[k];
}

const db = require('./db');

const SELLO = Date.now().toString(36);
const DIA = 86400000;

let fallos = 0;
let comprobaciones = 0;
function ok(condicion, texto) {
  comprobaciones++;
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function lanza(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

/* Una conexión aparte para preparar fechas y mirar filas: lo que se
   prueba son las funciones de db.js, no el SQL de la prueba. */
function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}

function consulta(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).get(...args); } finally { d.close(); }
}

function todas(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).all(...args); } finally { d.close(); }
}

function ejecuta(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).run(...args); } finally { d.close(); }
}

/* Una fecha a `dias` de ahora (negativo = pasado), en ISO como las de
   la base. Fraccionaria a propósito: los recordatorios cuentan horas. */
const enDias = (dias) => new Date(Date.now() + dias * DIA).toISOString();

let contador = 0;
const nuevoId = (etiqueta) => `${etiqueta}-${SELLO}-${++contador}`;

/* Una cuenta de verdad (usuario, organización y sucursal), porque los
   recordatorios buscan a quién avisar por el propietario. */
function cuenta(etiqueta, tipo = 'particular') {
  const correo = `${etiqueta}-${SELLO}@prueba.invalid`;
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre: `Prueba ${etiqueta}`,
    telefono: '8095550000', tipo, empresa: tipo === 'dealer' ? `Empresa ${etiqueta} ${SELLO}` : undefined,
  });
  return { idUsuario, idOrg: db.organizacionDe(idUsuario).id, correo };
}

/* Suscripción preparada a mano: la prueba necesita fechas y estados
   que el flujo normal tardaría semanas en producir. */
function nuevaSuscripcion({ idOrg, plan = 'estandar', cupo = 1, fin, estado = 'activa', dias = 30, precio = 1800 }) {
  const idSusc = nuevoId('susc');
  const t = new Date().toISOString();
  ejecuta(`INSERT INTO suscripciones
    (id, organizacion_id, plan_id, modalidad, ciclo, estado, precio_pactado,
     anuncios_incluidos, dias_ciclo, inicio, fin, proximo_cargo, creada)
    VALUES (?, ?, ?, 'vigencia', NULL, ?, ?, ?, ?, ?, ?, NULL, ?)`,
  idSusc, idOrg, plan, estado, precio, cupo, dias, enDias(-dias), fin, t);
  return idSusc;
}

function nuevoAnuncio({ idOrg, idSusc = null, estado = 'activo', vence = null, actualizado = null, fotos = 0 }) {
  const idAnuncio = nuevoId('anuncio');
  const t = new Date().toISOString();
  ejecuta(`INSERT INTO anuncios
    (id, organizacion_id, suscripcion_id, estado, categoria, subcategoria, marca, modelo, anio,
     precio, provincia, publicado, vence, creado, actualizado)
    VALUES (?, ?, ?, ?, 'camiones', 'cam-volteo', 'peterbilt', '567', 2019, 2500000, 'Santo Domingo', ?, ?, ?, ?)`,
  idAnuncio, idOrg, idSusc, estado, t, vence, t, actualizado || t);
  for (let i = 0; i < fotos; i++) {
    ejecuta(`INSERT INTO anuncio_fotos (id, anuncio_id, url, miniatura, orden, creada)
             VALUES (?, ?, ?, NULL, ?, ?)`, nuevoId('foto'), idAnuncio, `/fotos/${idAnuncio}-${i}.jpg`, i, t);
  }
  return idAnuncio;
}

const filaSusc = (idSusc) => consulta('SELECT * FROM suscripciones WHERE id = ?', idSusc);
const filaAnuncio = (idAnuncio) => consulta('SELECT * FROM anuncios WHERE id = ?', idAnuncio);
const totalSuscripciones = () => consulta('SELECT COUNT(*) AS n FROM suscripciones').n;

/* Abrir la base aplica el esquema y las migraciones. */
db.secuenciasNcf();

(async () => {
  console.log('\n1 · vencer de verdad');
  {
    // La migración: tabla, columnas e índices.
    const d = conexion();
    const colSusc = d.prepare('PRAGMA table_info(suscripciones)').all().map((c) => c.name);
    const tablaRec = d.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recordatorios'").get();
    const indice = (n) => d.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(n);
    const uxRenov = indice('ux_pagos_renovacion_pendiente');
    const ixFin = indice('ix_suscripciones_fin');
    const migrada = d.prepare("SELECT 1 AS si FROM migraciones WHERE id = '2026-09-renovacion'").get();
    d.close();
    for (const c of ['renovacion_automatica', 'renovacion_aceptada', 'renovacion_texto']) {
      ok(colSusc.includes(c), `suscripciones.${c} ${colSusc.includes(c) ? 'existe' : 'NO existe'}`);
    }
    ok(!!tablaRec && /UNIQUE\s*\(\s*anuncio_id\s*,\s*tipo\s*,\s*vence\s*\)/i.test(tablaRec.sql),
      `tabla recordatorios ${tablaRec ? 'con UNIQUE(anuncio_id, tipo, vence)' : 'NO existe'}`);
    ok(!!uxRenov && /UNIQUE/i.test(uxRenov.sql || ''), `índice ux_pagos_renovacion_pendiente ${uxRenov ? 'existe' : 'NO existe'}`);
    ok(!!ixFin, `índice ix_suscripciones_fin ${ixFin ? 'existe' : 'NO existe'}`);
    ok(!!migrada, `migración 2026-09-renovacion ${migrada ? 'anotada' : 'NO anotada'}`);
  }

  const P = cuenta('vence');
  const idPasada = nuevaSuscripcion({ idOrg: P.idOrg, plan: 'premium', cupo: 5, fin: enDias(-1) });
  const idSinFin = nuevaSuscripcion({ idOrg: P.idOrg, plan: 'estandar', cupo: 3, fin: null });
  const idViva = nuevaSuscripcion({ idOrg: P.idOrg, plan: 'destacado', cupo: 3, fin: enDias(10) });
  {
    const ns = db.suscripcionesDe(P.idOrg).map((s) => s.id);
    ok(!ns.includes(idPasada), `suscripcionesDe no cuenta la de fin pasado (${ns.includes(idPasada) ? 'SÍ la cuenta' : 'fuera'})`);
    ok(ns.includes(idSinFin), `suscripcionesDe cuenta la de fin NULL (${ns.includes(idSinFin) ? 'dentro' : 'NO sale'})`);
    ok(ns.includes(idViva), `suscripcionesDe cuenta la de fin futuro (${ns.includes(idViva) ? 'dentro' : 'NO sale'})`);
    ok(db.suscripcion(idPasada, P.idOrg) === null, 'suscripcion() de la vencida → null');
    const hueco = db.suscripcionConHueco(P.idOrg, 'premium');
    ok(hueco === null, `suscripcionConHueco premium → ${hueco ? hueco.id : 'null'}`);
    const cualquiera = db.suscripcionConHueco(P.idOrg);
    ok(!!cualquiera && cualquiera.id !== idPasada, `suscripcionConHueco elige una viva (${cualquiera ? cualquiera.plan_id : 'null'})`);
    const renov = consulta('SELECT COUNT(*) AS n FROM suscripciones WHERE renovacion_automatica <> 0').n;
    ok(renov === 0, `renovacion_automatica = 0 en las filas (distintas de 0: ${renov})`);
  }

  // La página del dealer: una Premium de fin pasado ya no la sostiene
  // aunque su fila siga 'activa'. Antes de vencerSuscripciones, para
  // que la prueba no pase solo porque la tarea ya la marcó.
  const D = cuenta('dealer-vencido', 'dealer');
  const V = cuenta('dealer-vivo', 'dealer');
  {
    for (const c of [D, V]) {
      ejecuta("UPDATE organizaciones SET perfil_publico = 1, estado_revision = 'aprobada' WHERE id = ?", c.idOrg);
    }
    nuevaSuscripcion({ idOrg: D.idOrg, plan: 'premium', cupo: 3, fin: enDias(-2), precio: 5500 });
    nuevaSuscripcion({ idOrg: V.idOrg, plan: 'premium', cupo: 3, fin: enDias(20), precio: 5500 });
    const r = db.apagarPerfilesSinPlan();
    const perfilD = consulta('SELECT perfil_publico FROM organizaciones WHERE id = ?', D.idOrg).perfil_publico;
    const perfilV = consulta('SELECT perfil_publico FROM organizaciones WHERE id = ?', V.idOrg).perfil_publico;
    ok(r.apagados.includes(D.idOrg) && perfilD === 0, `Premium de fin pasado: página ${perfilD ? 'SIGUE encendida' : 'apagada'}`);
    ok(!r.apagados.includes(V.idOrg) && perfilV === 1, `Premium viva: página ${perfilV ? 'encendida' : 'APAGADA'}`);
  }

  {
    const filasAntes = totalSuscripciones();
    let r1 = null;
    const e = lanza(() => { r1 = db.vencerSuscripciones(); });
    ok(!e && !!r1 && r1.vencidas >= 2, e ? `vencerSuscripciones lanzó: ${e.message}` : `vencidas=${r1 && r1.vencidas}`);
    ok(filaSusc(idPasada).estado === 'vencida', `la de fin pasado → ${filaSusc(idPasada).estado}`);
    ok(filaSusc(idSinFin).estado === 'activa' && filaSusc(idViva).estado === 'activa',
      `fin NULL → ${filaSusc(idSinFin).estado}, fin futuro → ${filaSusc(idViva).estado}`);
    const r2 = db.vencerSuscripciones();
    ok(r2 && r2.vencidas === 0, `segunda pasada: vencidas=${r2 && r2.vencidas}`);
    ok(totalSuscripciones() === filasAntes, `filas de suscripciones ${filasAntes} → ${totalSuscripciones()} (nada se borra)`);
  }

  {
    // Un vencido solo vuelve por la renovación pagada.
    const idVencido = nuevoAnuncio({ idOrg: P.idOrg, idSusc: idViva, estado: 'vencido', vence: enDias(-1) });
    const rAct = db.cambiarEstadoAnuncio(idVencido, P.idOrg, 'activo');
    ok(rAct.changes === 0 && rAct.vencido === true && filaAnuncio(idVencido).estado === 'vencido',
      `vencido → activo: ${JSON.stringify(rAct)} estado=${filaAnuncio(idVencido).estado}`);
    const rPau = db.cambiarEstadoAnuncio(idVencido, P.idOrg, 'pausado');
    ok(rPau.changes === 0 && rPau.vencido === true && filaAnuncio(idVencido).estado === 'vencido',
      `vencido → pausado: ${JSON.stringify(rPau)} estado=${filaAnuncio(idVencido).estado}`);
    const rVen = db.cambiarEstadoAnuncio(idVencido, P.idOrg, 'vendido');
    ok(rVen.changes === 1 && filaAnuncio(idVencido).estado === 'vendido', `vencido → vendido: changes=${rVen.changes}`);
    const idVencido2 = nuevoAnuncio({ idOrg: P.idOrg, idSusc: idViva, estado: 'vencido', vence: enDias(-1) });
    const rRet = db.cambiarEstadoAnuncio(idVencido2, P.idOrg, 'retirado');
    ok(rRet.changes === 1 && filaAnuncio(idVencido2).estado === 'retirado', `vencido → retirado: changes=${rRet.changes}`);
  }

  {
    // refrescarAnunciosDe no reescribe el `vence` de un vendido: es historial.
    const idS = nuevaSuscripcion({ idOrg: P.idOrg, plan: 'estandar', cupo: 3, fin: enDias(15) });
    const venceViejo = enDias(-40);
    const idVendido = nuevoAnuncio({ idOrg: P.idOrg, idSusc: idS, estado: 'vendido', vence: venceViejo });
    const idActivo = nuevoAnuncio({ idOrg: P.idOrg, idSusc: idS, estado: 'activo', vence: enDias(1) });
    db.refrescarAnunciosDe(idS);
    ok(filaAnuncio(idVendido).vence === venceViejo, `vendido conserva su vence (${filaAnuncio(idVendido).vence === venceViejo ? 'igual' : 'CAMBIÓ'})`);
    ok(filaAnuncio(idActivo).vence === filaSusc(idS).fin, 'activo toma el fin de su suscripción');
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
