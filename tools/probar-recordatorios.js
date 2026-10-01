/**
 * probar-recordatorios.js — la tanda diaria que vence membresías y avisa
 * 7, 3 y 1 día antes del corte.
 *
 *   node tools/probar-recordatorios.js
 *
 * POR QUÉ EXISTE
 *
 * Antes de la fase 05.3 la tanda diaria solo mandaba UN aviso de 5 días y
 * lo marcaba en `aviso_por_vencer`; y nada pasaba una suscripción a
 * 'vencida', así que un plan pagado una vez seguía activo para siempre.
 * Ahora `tools/tareas.js` vence las membresías primero (para que
 * `caducar` y `perfiles` vean el estado de hoy) y manda los avisos de 7,
 * 3 y 1 día con el registro `recordatorios`: reservar ANTES de enviar es
 * lo que impide dos correos si dos pasadas coinciden.
 *
 * Lo que se fija aquí, corriendo las tareas de verdad (dos veces, y en
 * paralelo):
 *   1. Vencer en la tanda: suscripción, anuncio y página del dealer.
 *   2. Cada aviso sale una sola vez por ciclo de `vence`.
 *   3. Vendido, pausado o vencido no reciben aviso; un fallo se reintenta
 *      una sola vez.
 *   4. Renovar cambia `vence` y el ciclo nuevo vuelve a tener sus avisos.
 *
 * Corre contra una base DESECHABLE en `.tmp/prueba-recordatorios/` que se
 * borra y se recrea en cada pasada. El correo es un doble: nunca toca la
 * red ni manda nada a nadie.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* Las variables de entorno ANTES de cargar db.js o tareas.js: la ruta de
   la base se resuelve al importarlos. Hecho después, la prueba escribiría
   en la base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-recordatorios');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
process.env.MERCA_FOTOS = path.join(BANCO, 'fotos');
process.env.MERCA_VIDEOS = path.join(BANCO, 'videos');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
// Un .env local no puede devolver lo que se borra abajo.
process.env.MERCA_ENV = path.join(BANCO, 'no-existe.env');

for (const k of Object.keys(process.env)) {
  if (k.startsWith('MERCA_TRANSFERENCIA') || k === 'MERCA_CARDNET') {
    delete process.env[k];
  }
}

const db = require('./db');
const correo = require('./correo');
const precios = require('../assets/precios.js');
// Requerirlo no debe ejecutar nada ni terminar el proceso: si lo hiciera,
// este arnés no pasaría de aquí.
const tareas = require('./tareas');

const SELLO = Date.now().toString(36);
const DIA = 86400000;

let fallos = 0;
let comprobaciones = 0;
function ok(condicion, texto) {
  comprobaciones++;
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

/* Una conexión aparte para preparar fechas y mirar filas: lo que se
   prueba son las tareas, no el SQL de la prueba. */
function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}
function consulta(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).get(...args); } finally { d.close(); }
}
function ejecuta(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).run(...args); } finally { d.close(); }
}

const enDias = (dias) => new Date(Date.now() + dias * DIA).toISOString();
let contador = 0;
const nuevoId = (etiqueta) => `${etiqueta}-${SELLO}-${++contador}`;

function cuenta(etiqueta, tipo = 'particular') {
  const c = `${etiqueta}-${SELLO}@prueba.invalid`;
  const { idUsuario } = db.crearCuenta({
    correo: c, clave: 'UnaClaveLargaYSegura9', nombre: `Prueba ${etiqueta}`,
    telefono: '8095550000', tipo, empresa: tipo === 'dealer' ? `Empresa ${etiqueta} ${SELLO}` : undefined,
  });
  return { idUsuario, idOrg: db.organizacionDe(idUsuario).id, correo: c };
}

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

function nuevoAnuncio({ idOrg, idSusc = null, estado = 'activo', vence = null }) {
  const idAnuncio = nuevoId('anuncio');
  const t = new Date().toISOString();
  ejecuta(`INSERT INTO anuncios
    (id, organizacion_id, suscripcion_id, estado, categoria, subcategoria, marca, modelo, anio,
     precio, provincia, publicado, vence, creado, actualizado)
    VALUES (?, ?, ?, ?, 'camiones', 'cam-volteo', 'peterbilt', '567', 2019, 2500000, 'Santo Domingo', ?, ?, ?, ?)`,
  idAnuncio, idOrg, idSusc, estado, t, vence, t, t);
  return idAnuncio;
}

const filaSusc = (id) => consulta('SELECT * FROM suscripciones WHERE id = ?', id);
const filaAnuncio = (id) => consulta('SELECT * FROM anuncios WHERE id = ?', id);
const filasRec = (idAnuncio) => {
  const d = conexion();
  try { return d.prepare('SELECT * FROM recordatorios WHERE anuncio_id = ? ORDER BY vence').all(idAnuncio); } finally { d.close(); }
};
const total = (tabla) => consulta(`SELECT COUNT(*) AS n FROM ${tabla}`).n;

/* El doble del correo. Se sustituye la propiedad del módulo: tareas.js
   llama `correo.enviarRecordatorioVencimiento(...)` sin desestructurar
   justamente para que esto funcione. */
const llamadas = [];
let modoCorreo = 'ok';
correo.enviarRecordatorioVencimiento = async (datos) => {
  llamadas.push(datos);
  return { entregado: modoCorreo === 'ok' };
};

/* Una pasada de avisos; devuelve solo las llamadas de estos anuncios. */
async function pasada(ids) {
  llamadas.length = 0;
  await tareas.avisarRecordatorios();
  return llamadas.filter((l) => ids.includes(l.idAnuncio));
}

(async () => {
  console.log('\n0 · días de calendario dominicanos');
  {
    const momento = '2026-10-10T05:00:00.000Z';
    ok(db.tipoRecordatorio('2026-10-11T03:59:59.000Z', momento) === null, '23:59 RD del mismo día: no se avisa');
    ok(db.tipoRecordatorio('2026-10-11T04:00:00.000Z', momento) === '1d', '00:00 RD del día siguiente: aviso de mañana');
    ok(db.tipoRecordatorio('2026-10-13T03:00:00.000Z', momento) === '3d', 'dos días de calendario: aviso de 3d');
    ok(db.tipoRecordatorio('2026-10-17T12:00:00.000Z', momento) === '7d', 'siete días de calendario: aviso de 7d');
    ok(db.tipoRecordatorio('2026-10-18T12:00:00.000Z', momento) === null, 'ocho días de calendario: no se avisa');
    ok(correo.asuntoRecordatorio('3d', 2) === 'Tu anuncio vence en 2 días', 'el asunto dice los dos días reales');
  }

  console.log('\n1 · la tanda diaria');
  {
    const claves = Object.keys(tareas.TAREAS);
    const diaria = claves.filter((t) => !t.startsWith('informe-'));
    ok(claves[0] === 'suscripciones', `primera clave de TAREAS: ${claves[0]}`);
    ok(diaria.indexOf('suscripciones') < diaria.indexOf('caducar') && diaria.indexOf('caducar') !== -1
      && diaria.indexOf('suscripciones') < diaria.indexOf('perfiles'),
    'suscripciones va antes que caducar y perfiles en la tanda diaria');
    ok(typeof tareas.TAREAS['por-vencer'] === 'function', "la clave 'por-vencer' se conserva");
    ok(typeof tareas.vencerMembresias === 'function' && typeof tareas.avisarRecordatorios === 'function',
      'require(./tareas) exporta las tareas sin ejecutarlas ni salir');
  }

  console.log('\n1 · vencer en la tanda');
  {
    const D = cuenta('dealer-vence', 'dealer');
    ejecuta("UPDATE organizaciones SET perfil_publico = 1, estado_revision = 'aprobada' WHERE id = ?", D.idOrg);
    const fin = enDias(-1);
    const idSusc = nuevaSuscripcion({ idOrg: D.idOrg, plan: 'premium', cupo: 3, fin, precio: 5500 });
    const idAnuncio = nuevoAnuncio({ idOrg: D.idOrg, idSusc, estado: 'activo', vence: fin });
    const viva = nuevaSuscripcion({ idOrg: cuenta('viva').idOrg, plan: 'estandar', cupo: 1, fin: enDias(20) });

    await tareas.TAREAS.suscripciones();
    await tareas.TAREAS.caducar();
    await tareas.TAREAS.perfiles();
    ok(filaSusc(idSusc).estado === 'vencida', `suscripción de fin pasado: ${filaSusc(idSusc).estado}`);
    ok(filaAnuncio(idAnuncio).estado === 'vencido', `su anuncio en la misma pasada: ${filaAnuncio(idAnuncio).estado}`);
    const perfil = consulta('SELECT perfil_publico FROM organizaciones WHERE id = ?', D.idOrg).perfil_publico;
    ok(perfil === 0, `página del dealer: ${perfil ? 'SIGUE encendida' : 'apagada'}`);
    ok(filaSusc(viva).estado === 'activa', `una membresía viva no se toca: ${filaSusc(viva).estado}`);

    const antes = JSON.stringify([filaSusc(idSusc), filaAnuncio(idAnuncio)]);
    const conteo = [total('suscripciones'), total('anuncios')];
    await tareas.TAREAS.suscripciones();
    await tareas.TAREAS.caducar();
    await tareas.TAREAS.perfiles();
    ok(JSON.stringify([filaSusc(idSusc), filaAnuncio(idAnuncio)]) === antes, 'la segunda pasada no cambia nada');
    ok(total('suscripciones') === conteo[0] && total('anuncios') === conteo[1], 'ninguna fila se borra');
  }

  console.log('\n2 · avisos una sola vez');
  {
    const Q = cuenta('avisos');
    const idSusc = nuevaSuscripcion({ idOrg: Q.idOrg, plan: 'estandar', cupo: 10, fin: enDias(30) });
    const a7 = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, vence: enDias(6.5) });
    const a3 = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, vence: enDias(2.5) });
    const a1 = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, vence: enDias(20 / 24) });
    const a9 = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, vence: enDias(9) });
    const ids = [a7, a3, a1, a9];

    const p1 = await pasada(ids);
    const tipoDe = (id) => (p1.find((l) => l.idAnuncio === id) || {}).tipo || null;
    ok(p1.length === 3, `primera pasada: ${p1.length} correo(s)`);
    ok(tipoDe(a7) === '7d' && tipoDe(a3) === '3d' && tipoDe(a1) === '1d', `tipos ${tipoDe(a7)}, ${tipoDe(a3)}, ${tipoDe(a1)}`);
    ok(tipoDe(a9) === null, 'a 9 días no se avisa todavía');
    const l7 = p1.find((l) => l.idAnuncio === a7);
    ok(!!l7 && l7.para === Q.correo && l7.vence === filaAnuncio(a7).vence && l7.plan === 'Estándar'
      && /Peterbilt/.test(l7.equipo) && /567/.test(l7.equipo),
    `datos del aviso: ${l7 ? `${l7.para === Q.correo ? 'el propietario' : l7.para} · ${l7.equipo} · ${l7.plan}` : 'NO hay'}`);
    ok([a7, a3, a1].every((id) => filasRec(id).length === 1 && filasRec(id)[0].resultado === 'enviado'),
      "tres filas 'enviado' en recordatorios");

    const p2 = await pasada(ids);
    ok(p2.length === 0, `segunda pasada: ${p2.length} correo(s)`);

    const N = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, vence: enDias(2.4) });
    llamadas.length = 0;
    await Promise.all([tareas.avisarRecordatorios(), tareas.avisarRecordatorios()]);
    const enParalelo = llamadas.filter((l) => l.idAnuncio === N);
    ok(enParalelo.length === 1, `dos pasadas a la vez sobre un anuncio nuevo: ${enParalelo.length} correo(s)`);
    ok(filasRec(N).length === 1, 'y una sola fila en recordatorios');

    const nulos = consulta('SELECT COUNT(*) AS n FROM anuncios WHERE aviso_por_vencer IS NOT NULL').n;
    ok(nulos === 0, `aviso_por_vencer sigue NULL (${nulos} con marca)`);
  }

  console.log('\n3 · anulados y reintentos');
  {
    const Q = cuenta('anulados');
    const idSusc = nuevaSuscripcion({ idOrg: Q.idOrg, plan: 'estandar', cupo: 10, fin: enDias(30) });
    const vendido = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'vendido', vence: enDias(2.5) });
    const pausado = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'pausado', vence: enDias(2.5) });
    const vencido = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'vencido', vence: enDias(2.5) });
    const p = await pasada([vendido, pausado, vencido]);
    ok(p.length === 0, `vendido, pausado o vencido en ventana: ${p.length} correo(s)`);
    ok([vendido, pausado, vencido].every((id) => filasRec(id).length === 0), 'y no dejan fila');

    const F = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'activo', vence: enDias(2.5) });
    modoCorreo = 'falla';
    const f1 = await pasada([F]);
    ok(f1.length === 1 && filasRec(F).length === 1 && filasRec(F)[0].resultado === 'fallido',
      `correo que falla: ${f1.length} intento, fila '${filasRec(F)[0] && filasRec(F)[0].resultado}'`);
    modoCorreo = 'ok';
    const f2 = await pasada([F]);
    ok(f2.length === 1 && filasRec(F).length === 1 && filasRec(F)[0].resultado === 'enviado',
      `pasada siguiente con el correo sano: ${f2.length} correo, fila '${filasRec(F)[0].resultado}'`);
    const f3 = await pasada([F]);
    ok(f3.length === 0, `tercera pasada: ${f3.length} correo(s)`);

    // Un doble que lanza no detiene al resto ni deja la fila 'enviando'.
    const G = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'activo', vence: enDias(2.6) });
    const H = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'activo', vence: enDias(6.6) });
    const original = correo.enviarRecordatorioVencimiento;
    correo.enviarRecordatorioVencimiento = async (datos) => {
      llamadas.push(datos);
      if (datos.idAnuncio === G) throw new Error('proveedor caído');
      return { entregado: true };
    };
    llamadas.length = 0;
    const silencio = console.error;
    console.error = () => {};
    try { await tareas.avisarRecordatorios(); } finally { console.error = silencio; }
    correo.enviarRecordatorioVencimiento = original;
    ok(filasRec(G)[0] && filasRec(G)[0].resultado === 'fallido', `proveedor que lanza: fila '${filasRec(G)[0] && filasRec(G)[0].resultado}'`);
    ok(filasRec(H)[0] && filasRec(H)[0].resultado === 'enviado', 'y el siguiente anuncio sí se avisa');
  }

  console.log('\n4 · ciclo nuevo tras renovar');
  {
    const Q = cuenta('renueva');
    const fin = enDias(2.5);
    const idSusc = nuevaSuscripcion({ idOrg: Q.idOrg, plan: 'estandar', cupo: 1, fin });
    const idAnuncio = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, vence: fin });
    const p1 = await pasada([idAnuncio]);
    ok(p1.length === 1 && p1[0].tipo === '3d', `aviso de 3 días: ${p1.length} correo(s)`);

    const r = db.renovarSinCosto({
      idOrg: Q.idOrg, idSusc, idAnuncio, dias: 30,
      cobro: { ...precios.desglose(0), referencia: `CERO-REC-${SELLO}` },
    });
    ok(!!r && filaAnuncio(idAnuncio).vence !== fin, 'renovado: el vence cambió');
    const p2 = await pasada([idAnuncio]);
    ok(p2.length === 0, `tras renovar, el aviso del ciclo viejo no sale: ${p2.length} correo(s)`);

    const venceNuevo = enDias(2.5);
    ejecuta('UPDATE anuncios SET vence = ? WHERE id = ?', venceNuevo, idAnuncio);
    const p3 = await pasada([idAnuncio]);
    ok(p3.length === 1 && p3[0].tipo === '3d' && p3[0].vence === venceNuevo, `ciclo siguiente: ${p3.length} aviso de ${p3[0] && p3[0].tipo}`);
    ok(filasRec(idAnuncio).length === 2, `la fila del ciclo viejo se conserva (${filasRec(idAnuncio).length} filas)`);
    const p4 = await pasada([idAnuncio]);
    ok(p4.length === 0, 'y el ciclo nuevo tampoco se repite');
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
