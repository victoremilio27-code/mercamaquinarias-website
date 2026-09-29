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
const pagos = require('./pagos');
const precios = require('../assets/precios.js');

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

const anunciosDeOrg = (idOrg) =>
  consulta('SELECT COUNT(*) AS n FROM anuncios WHERE organizacion_id = ?', idOrg).n;
const fotosDe = (idAnuncio) =>
  consulta('SELECT COUNT(*) AS n FROM anuncio_fotos WHERE anuncio_id = ?', idAnuncio).n;
const facturasTotales = () => consulta('SELECT COUNT(*) AS n FROM facturas').n;
const facturaDe = (idPago) =>
  consulta("SELECT * FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", idPago);
const siguienteB02 = () => {
  const s = consulta("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B02' AND activa = 1");
  return s ? s.siguiente : null;
};

/* El cobro sale de la fórmula única, como en las rutas: la prueba no
   puede inventarse el subtotal. */
const cobroRenovacion = ({ precioUnitario = 1800, cupo = 1, dias = 30, etiqueta }) => ({
  ...precios.precioRenovacion({ precioUnitario, cupo, dias }),
  referencia: `RENOV-${etiqueta}-${SELLO}-${++contador}`, procesador: 'demo',
});
const cobroCero = (etiqueta) => ({ ...precios.desglose(0), referencia: `CERO-${etiqueta}-${SELLO}-${++contador}` });

const CLIENTE = { razonSocial: 'Cliente de prueba', correo: 'cliente@prueba.invalid' };
const intencionRenovacion = ({ idSusc, idAnuncio = null, idPlan = 'estandar', cupo = 1, dias = 30 }) => ({
  tipo: 'renovacion', idSusc, idAnuncio, idPlan, cupo, dias,
  concepto: `Renovación ${idPlan} · ${dias} días`,
  cliente: CLIENTE, correoCliente: CLIENTE.correo,
});

/* Pide y confirma una renovación, como hará la ruta de la 05.3-02. */
function renovarPagando({ idOrg, idSusc, idAnuncio = null, idPlan = 'estandar', cupo = 1, dias = 30, precioUnitario = 1800, etiqueta }) {
  const pago = db.registrarCobro({
    idOrg, idSusc, idAnuncio,
    cobro: cobroRenovacion({ precioUnitario, cupo, dias, etiqueta }),
    intencion: intencionRenovacion({ idSusc, idAnuncio, idPlan, cupo, dias }),
  });
  return { pago, r: pagos.confirmarPago(pago.id) };
}

/* El periodo tal como lo imprime la línea del comprobante. */
const periodoImpreso = (inicio, fin) => pagos.lineaDeCupos({ cupo: 1, subtotal: 1, inicio, fin }).periodo;

/* Abrir la base aplica el esquema y las migraciones. */
db.secuenciasNcf();
db.cargarSecuencia({
  tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 200,
  vence: '2027-12-31', usaSitio: true,
});

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

  console.log('\n2 · renovar en la base');
  const R = cuenta('renueva');
  const OTRA = cuenta('ajena');

  // 2a. Activa a 5 días de vencer: suma al final, mismo anuncio.
  const finActiva = enDias(5);
  const idSuscA = nuevaSuscripcion({ idOrg: R.idOrg, plan: 'estandar', cupo: 1, fin: finActiva });
  const idAnuncioA = nuevoAnuncio({ idOrg: R.idOrg, idSusc: idSuscA, estado: 'activo', vence: finActiva, fotos: 3 });
  let pagoA = null;
  {
    pagoA = db.registrarCobro({
      idOrg: R.idOrg, idSusc: idSuscA, idAnuncio: idAnuncioA,
      cobro: cobroRenovacion({ etiqueta: 'A' }),
      intencion: intencionRenovacion({ idSusc: idSuscA, idAnuncio: idAnuncioA }),
    });
    ok(pagoA.estado === 'pendiente' && pagoA.suscripcion_id === idSuscA && pagoA.anuncio_id === idAnuncioA,
      `pago pendiente de la suscripción y el anuncio (${pagoA.estado})`);
    const pp = db.pagoPendienteDeRenovacion(idSuscA);
    ok(!!pp && pp.id === pagoA.id, `pagoPendienteDeRenovacion: ${pp ? (pp.id === pagoA.id ? 'ese pago' : pp.id) : 'null'}`);

    const enPanel = db.anunciosDeOrganizacion(R.idOrg).find((x) => x.id === idAnuncioA);
    ok(!!enPanel && enPanel.renovacion_pendiente === pagoA.referencia && enPanel.pendiente_pago === false
      && !enPanel.pago_pendiente,
    `panel: renovacion_pendiente=${enPanel && enPanel.renovacion_pendiente === pagoA.referencia ? 'la referencia' : enPanel && enPanel.renovacion_pendiente} pendiente_pago=${enPanel && enPanel.pendiente_pago} pago_pendiente=${enPanel && enPanel.pago_pendiente}`);
    ok(!!enPanel && enPanel.suscripcion_cupo === 1 && enPanel.suscripcion_fin === finActiva && enPanel.suscripcion_plan === 'Estándar',
      `panel: cupo=${enPanel && enPanel.suscripcion_cupo} fin=${enPanel && enPanel.suscripcion_fin === finActiva ? 'el de la suscripción' : enPanel && enPanel.suscripcion_fin} plan=${enPanel && enPanel.suscripcion_plan}`);

    // Un segundo pendiente para la misma suscripción, con y sin anuncio.
    const conAnuncio = lanza(() => db.registrarCobro({
      idOrg: R.idOrg, idSusc: idSuscA, idAnuncio: idAnuncioA, cobro: cobroRenovacion({ etiqueta: 'A2' }),
      intencion: intencionRenovacion({ idSusc: idSuscA, idAnuncio: idAnuncioA }),
    }));
    ok(!!conAnuncio && conAnuncio.codigo === 409 && /renovación en espera/.test(conAnuncio.message),
      `segundo pendiente con anuncio: ${conAnuncio ? `${conAnuncio.codigo} ${conAnuncio.message}` : 'NO lanzó'}`);
    const sinAnuncio = lanza(() => db.registrarCobro({
      idOrg: R.idOrg, idSusc: idSuscA, cobro: cobroRenovacion({ etiqueta: 'A3' }),
      intencion: intencionRenovacion({ idSusc: idSuscA }),
    }));
    ok(!!sinAnuncio && sinAnuncio.codigo === 409 && /renovación en espera/.test(sinAnuncio.message),
      `segundo pendiente sin anuncio: ${sinAnuncio ? `${sinAnuncio.codigo} ${sinAnuncio.message}` : 'NO lanzó'}`);

    const b02 = siguienteB02();
    let r = null;
    const e = lanza(() => { r = pagos.confirmarPago(pagoA.id); });
    ok(!e && !!r && r.pago.estado === 'aprobado', e ? `confirmarPago lanzó: ${e.message}` : `pago ${r && r.pago.estado}`);
    const s = filaSusc(idSuscA);
    const esperado = new Date(new Date(finActiva).getTime()).toISOString();
    const finEsperado = (() => { const d = new Date(esperado); d.setDate(d.getDate() + 30); return d.toISOString(); })();
    ok(s.fin === finEsperado && s.estado === 'activa', `fin = fin anterior + 30 (${s.fin === finEsperado ? 'sí' : `${s.fin} ≠ ${finEsperado}`}) estado=${s.estado}`);
    ok(s.precio_pactado === 1800, `precio_pactado no se toca (${s.precio_pactado})`);
    const a = filaAnuncio(idAnuncioA);
    ok(a.estado === 'activo' && a.vence === s.fin && fotosDe(idAnuncioA) === 3,
      `mismo anuncio: ${a.estado} vence=${a.vence === s.fin ? 'el fin nuevo' : a.vence} fotos=${fotosDe(idAnuncioA)}`);
    ok(!!r && !!r.membresia && r.membresia.fin === s.fin, `confirmarPago devuelve la membresía renovada (${r && r.membresia && r.membresia.fin})`);
    const f = facturaDe(pagoA.id);
    ok(!!f && /^B02/.test(f.ncf || '') && f.subtotal + f.itbis === f.total && f.total === pagoA.total,
      `factura: ${f ? `${f.ncf} ${f.subtotal}+${f.itbis}=${f.total} (pago ${pagoA.total})` : 'NO hay'}`);
    const periodo = periodoImpreso(finActiva, s.fin);
    ok(!!f && f.periodo_servicio === periodo, `periodo del comprobante: ${f && f.periodo_servicio} (se esperaba ${periodo})`);
    ok(siguienteB02() === b02 + 1, `B02 avanzó ${siguienteB02() - b02} (se esperaba 1)`);

    // Confirmar otra vez: nada se mueve.
    const factAntes = facturasTotales();
    const b02b = siguienteB02();
    let r2 = null;
    const e2 = lanza(() => { r2 = pagos.confirmarPago(pagoA.id); });
    ok(!e2 && !!r2 && r2.yaEstaba === true && filaSusc(idSuscA).fin === s.fin
      && facturasTotales() === factAntes && siguienteB02() === b02b,
    e2 ? `repetir lanzó: ${e2.message}` : `repetir: yaEstaba=${r2 && r2.yaEstaba} fin ${filaSusc(idSuscA).fin === s.fin ? 'igual' : 'CAMBIÓ'} facturas +${facturasTotales() - factAntes} B02 +${siguienteB02() - b02b}`);

    // Un segundo pago aprobado distinto suma otro periodo (60 días).
    const finAntes = filaSusc(idSuscA).fin;
    const { r: r3 } = renovarPagando({ idOrg: R.idOrg, idSusc: idSuscA, idAnuncio: idAnuncioA, dias: 60, etiqueta: 'A60' });
    const fin60 = (() => { const d = new Date(finAntes); d.setDate(d.getDate() + 60); return d.toISOString(); })();
    ok(r3.pago.estado === 'aprobado' && filaSusc(idSuscA).fin === fin60,
      `segundo pago: +60 (${filaSusc(idSuscA).fin === fin60 ? 'sí' : filaSusc(idSuscA).fin})`);
  }

  // 2b. Vencida hace 3 días con su anuncio vencido: vuelve el MISMO.
  {
    const idSusc = nuevaSuscripcion({ idOrg: R.idOrg, plan: 'destacado', cupo: 1, fin: enDias(-3), estado: 'vencida', precio: 3200 });
    const idAnuncio = nuevoAnuncio({ idOrg: R.idOrg, idSusc, estado: 'vencido', vence: enDias(-3), fotos: 2 });
    ejecuta('UPDATE anuncios SET aviso_vencido = ? WHERE id = ?', enDias(-2), idAnuncio);
    const totalAntes = anunciosDeOrg(R.idOrg);
    const antes = Date.now();
    const { pago, r } = renovarPagando({
      idOrg: R.idOrg, idSusc, idAnuncio, idPlan: 'destacado', precioUnitario: 3200, etiqueta: 'VENCIDA',
    });
    const s = filaSusc(idSusc);
    const objetivo = antes + 30 * DIA;
    ok(r.pago.estado === 'aprobado' && s.estado === 'activa' && Math.abs(new Date(s.fin).getTime() - objetivo) < 60000,
      `vencida → ${s.estado}, fin ≈ ahora + 30 (desvío ${Math.round((new Date(s.fin).getTime() - objetivo) / 1000)} s)`);
    const a = filaAnuncio(idAnuncio);
    ok(a.estado === 'activo' && a.aviso_vencido === null && a.vence === s.fin && a.destacado_hasta === s.fin && fotosDe(idAnuncio) === 2,
      `anuncio: ${a.estado} aviso_vencido=${a.aviso_vencido} vence=${a.vence === s.fin ? 'fin nuevo' : a.vence} destacado=${a.destacado_hasta === s.fin} fotos=${fotosDe(idAnuncio)}`);
    ok(anunciosDeOrg(R.idOrg) === totalAntes, `anuncios de la organización ${totalAntes} → ${anunciosDeOrg(R.idOrg)} (ninguno nuevo)`);
    const f = facturaDe(pago.id);
    const inicio = f && f.periodo_servicio ? f.periodo_servicio.split(' al ')[0] : null;
    const hoyImpreso = periodoImpreso(new Date().toISOString(), s.fin).split(' al ')[0];
    ok(!!f && f.subtotal + f.itbis === f.total && inicio === hoyImpreso,
      `comprobante de la vencida: ${f ? `${f.subtotal}+${f.itbis}=${f.total}, periodo ${f.periodo_servicio}` : 'NO hay'} (empieza hoy: ${hoyImpreso})`);
  }

  // 2c. Rechazo: nada cambia, no hay factura; después se puede volver a pedir.
  {
    const fin = enDias(4);
    const idSusc = nuevaSuscripcion({ idOrg: R.idOrg, plan: 'estandar', cupo: 1, fin });
    const idAnuncio = nuevoAnuncio({ idOrg: R.idOrg, idSusc, estado: 'activo', vence: fin });
    const pago = db.registrarCobro({
      idOrg: R.idOrg, idSusc, idAnuncio, cobro: cobroRenovacion({ etiqueta: 'RECH' }),
      intencion: intencionRenovacion({ idSusc, idAnuncio }),
    });
    const b02 = siguienteB02();
    const r = pagos.rechazarPago(pago.id, { motivo: 'fondos' });
    ok(r.cambiado && r.pago.estado === 'rechazado' && filaSusc(idSusc).fin === fin && filaAnuncio(idAnuncio).vence === fin,
      `rechazo: ${r.pago.estado}, fin ${filaSusc(idSusc).fin === fin ? 'igual' : 'CAMBIÓ'}`);
    ok(!facturaDe(pago.id) && siguienteB02() === b02, `rechazo sin factura ni NCF (B02 +${siguienteB02() - b02})`);
    const rep = pagos.confirmarPago(pago.id);
    ok(rep.pago.estado === 'rechazado' && filaSusc(idSusc).fin === fin && !facturaDe(pago.id),
      `confirmar un rechazado no renueva (${rep.pago.estado})`);
    const otro = lanza(() => db.registrarCobro({
      idOrg: R.idOrg, idSusc, idAnuncio, cobro: cobroRenovacion({ etiqueta: 'RECH2' }),
      intencion: intencionRenovacion({ idSusc, idAnuncio }),
    }));
    ok(!otro, `tras el rechazo se puede pedir otra (${otro ? otro.message : 'sí'})`);
  }

  // 2d. Importe cero: renueva sin factura, pago 'sin-costo'.
  {
    const fin = enDias(2);
    const idSusc = nuevaSuscripcion({ idOrg: R.idOrg, plan: 'estandar', cupo: 1, fin });
    const idAnuncio = nuevoAnuncio({ idOrg: R.idOrg, idSusc, estado: 'activo', vence: fin });
    const factAntes = facturasTotales();
    let r = null;
    const e = lanza(() => { r = db.renovarSinCosto({ idOrg: R.idOrg, idSusc, idAnuncio, dias: 30, cobro: cobroCero('CERO') }); });
    const esperado = (() => { const d = new Date(fin); d.setDate(d.getDate() + 30); return d.toISOString(); })();
    ok(!e && !!r && !!r.membresia && r.membresia.fin === esperado && filaAnuncio(idAnuncio).vence === esperado,
      e ? `renovarSinCosto lanzó: ${e.message}` : `sin costo: fin ${r.membresia && r.membresia.fin === esperado ? '+30' : r.membresia && r.membresia.fin}`);
    ok(!!r && !!r.periodo && r.periodo.inicio === fin && r.periodo.fin === esperado, `periodo devuelto ${r && JSON.stringify(r.periodo)}`);
    const p = consulta("SELECT * FROM pagos WHERE suscripcion_id = ? AND procesador = 'sin-costo'", idSusc);
    ok(!!p && p.estado === 'aprobado' && p.total === 0 && p.anuncio_id === idAnuncio && facturasTotales() === factAntes,
      `pago ${p ? `${p.estado} ${p.procesador} total=${p.total}` : 'NO hay'} facturas +${facturasTotales() - factAntes}`);
    const conImporte = lanza(() => db.renovarSinCosto({ idOrg: R.idOrg, idSusc, dias: 30, cobro: cobroRenovacion({ etiqueta: 'COLADO' }) }));
    ok(!!conImporte && conImporte.codigo === 500, `un importe por renovarSinCosto: ${conImporte ? conImporte.codigo : 'NO lanzó'}`);
  }

  // 2e. Dos cupos y tres vencidos: vuelven dos, el de la intención primero.
  {
    const idSusc = nuevaSuscripcion({ idOrg: R.idOrg, plan: 'estandar', cupo: 2, fin: enDias(-1), estado: 'vencida' });
    const idViejo = nuevoAnuncio({ idOrg: R.idOrg, idSusc, estado: 'vencido', vence: enDias(-1), actualizado: enDias(-10) });
    const idMedio = nuevoAnuncio({ idOrg: R.idOrg, idSusc, estado: 'vencido', vence: enDias(-1), actualizado: enDias(-5) });
    const idNuevo = nuevoAnuncio({ idOrg: R.idOrg, idSusc, estado: 'vencido', vence: enDias(-1), actualizado: enDias(-2) });
    let res = null;
    const e = lanza(() => { res = renovarPagando({ idOrg: R.idOrg, idSusc, idAnuncio: idViejo, cupo: 2, etiqueta: 'CUPO' }); });
    const est = [idViejo, idMedio, idNuevo].map((x) => filaAnuncio(x).estado);
    ok(!e && res.r.pago.estado === 'aprobado', e ? `lanzó por capacidad: ${e.message}` : 'la aprobación no lanza');
    ok(est[0] === 'activo' && est[1] === 'vencido' && est[2] === 'activo',
      `intención + el más reciente activos, el otro sigue vencido (${est.join(', ')})`);
    ok(filaAnuncio(idMedio).vence === filaSusc(idSusc).fin, 'el que no cupo toma igual el fin nuevo');
  }

  // 2f. La Premium de un dealer aprobado, vencida y con la página apagada.
  {
    const P2 = cuenta('premium-renueva', 'dealer');
    ejecuta("UPDATE organizaciones SET estado_revision = 'aprobada', perfil_publico = 0 WHERE id = ?", P2.idOrg);
    const idSusc = nuevaSuscripcion({ idOrg: P2.idOrg, plan: 'premium', cupo: 3, fin: enDias(-4), estado: 'vencida', precio: 5500 });
    renovarPagando({ idOrg: P2.idOrg, idSusc, idPlan: 'premium', cupo: 3, precioUnitario: 5500, etiqueta: 'PREMIUM' });
    const perfil = consulta('SELECT perfil_publico FROM organizaciones WHERE id = ?', P2.idOrg).perfil_publico;
    ok(perfil === 1 && filaSusc(idSusc).estado === 'activa', `página del dealer ${perfil ? 'encendida' : 'SIGUE apagada'}`);
  }

  // 2g. Lo que no se renueva: ajena, pago que apunta a otra, sin fecha.
  {
    const idSuscOtra = nuevaSuscripcion({ idOrg: OTRA.idOrg, plan: 'estandar', cupo: 1, fin: enDias(3) });
    const finOtra = filaSusc(idSuscOtra).fin;
    const pAjeno = db.registrarCobro({
      idOrg: R.idOrg, idSusc: idSuscOtra, cobro: cobroRenovacion({ etiqueta: 'AJENA' }),
      intencion: intencionRenovacion({ idSusc: idSuscOtra }),
    });
    const e404 = lanza(() => db.aprobarPago(pAjeno.id));
    ok(!!e404 && e404.codigo === 404 && db.pagoPorId(pAjeno.id).estado === 'pendiente' && filaSusc(idSuscOtra).fin === finOtra,
      `suscripción ajena: ${e404 ? e404.codigo : 'NO lanzó'} pago=${db.pagoPorId(pAjeno.id).estado}`);
    db.rechazarPago(pAjeno.id);

    const idS1 = nuevaSuscripcion({ idOrg: R.idOrg, plan: 'estandar', cupo: 1, fin: enDias(3) });
    const idS2 = nuevaSuscripcion({ idOrg: R.idOrg, plan: 'estandar', cupo: 1, fin: enDias(3) });
    const pCruzado = db.registrarCobro({
      idOrg: R.idOrg, idSusc: idS1, cobro: cobroRenovacion({ etiqueta: 'CRUZADO' }),
      intencion: intencionRenovacion({ idSusc: idS2 }),
    });
    const e500 = lanza(() => db.aprobarPago(pCruzado.id));
    ok(!!e500 && e500.codigo === 500 && db.pagoPorId(pCruzado.id).estado === 'pendiente',
      `pago que apunta a otra membresía: ${e500 ? `${e500.codigo} ${e500.message}` : 'NO lanzó'}`);
    db.rechazarPago(pCruzado.id);

    const idSinFin = nuevaSuscripcion({ idOrg: R.idOrg, plan: 'estandar', cupo: 1, fin: null });
    const pSinFin = db.registrarCobro({
      idOrg: R.idOrg, idSusc: idSinFin, cobro: cobroRenovacion({ etiqueta: 'SINFIN' }),
      intencion: intencionRenovacion({ idSusc: idSinFin }),
    });
    const e409 = lanza(() => db.aprobarPago(pSinFin.id));
    ok(!!e409 && e409.codigo === 409 && db.pagoPorId(pSinFin.id).estado === 'pendiente',
      `membresía sin fecha: ${e409 ? `${e409.codigo} ${e409.message}` : 'NO lanzó'}`);
    db.rechazarPago(pSinFin.id);
  }

  // 2h. Lo que el panel necesita para ofrecer renovar.
  {
    const L = cuenta('lista');
    const idViva = nuevaSuscripcion({ idOrg: L.idOrg, plan: 'destacado', cupo: 2, fin: enDias(6), precio: 3200 });
    const idVencida = nuevaSuscripcion({ idOrg: L.idOrg, plan: 'estandar', cupo: 1, fin: enDias(-6), estado: 'vencida' });
    const idInterna = nuevaSuscripcion({ idOrg: L.idOrg, plan: 'premium', cupo: 1, fin: null });
    nuevoAnuncio({ idOrg: L.idOrg, idSusc: idViva, estado: 'activo', vence: enDias(6) });
    const pend = db.registrarCobro({
      idOrg: L.idOrg, idSusc: idVencida, cobro: cobroRenovacion({ etiqueta: 'LISTA' }),
      intencion: intencionRenovacion({ idSusc: idVencida }),
    });
    const lista = db.suscripcionesRenovablesDe(L.idOrg);
    const ids = lista.map((s) => s.id);
    ok(ids.includes(idViva) && ids.includes(idVencida) && !ids.includes(idInterna),
      `renovables: viva ${ids.includes(idViva)}, vencida ${ids.includes(idVencida)}, sin fin ${ids.includes(idInterna)}`);
    const viva = lista.find((s) => s.id === idViva);
    const vencida = lista.find((s) => s.id === idVencida);
    ok(!!viva && viva.plan_nombre === 'Destacado' && viva.ocupados === 1 && viva.destacado === 1
      && viva.precio_vigente === 3200 && viva.dias_ciclo === 30 && viva.renovacion_automatica === 0 && viva.renovacion_pendiente === null,
    `viva: ${viva ? `${viva.plan_nombre} ocupados=${viva.ocupados} vigente=${viva.precio_vigente} días=${viva.dias_ciclo} auto=${viva.renovacion_automatica} pendiente=${viva.renovacion_pendiente}` : 'NO sale'}`);
    ok(!!vencida && vencida.renovacion_pendiente === pend.referencia && vencida.plan_activo === 1,
      `vencida: pendiente=${vencida && vencida.renovacion_pendiente === pend.referencia ? 'la referencia' : vencida && vencida.renovacion_pendiente} plan_activo=${vencida && vencida.plan_activo}`);
    ok(!!db.suscripcionRenovable(idVencida, L.idOrg) && db.suscripcionRenovable(idVencida, R.idOrg) === null
      && db.suscripcionRenovable(idInterna, L.idOrg) === null,
    'suscripcionRenovable: la suya sí, ajena o sin fin → null');

    // Renovación automática: guardada, nunca marcada por defecto.
    const texto = 'Al activar esta opción, autorizas la renovación de este anuncio al finalizar su período.';
    ok(db.guardarRenovacionAutomatica({ idSusc: idViva, idOrg: L.idOrg, activar: true, texto }) === true, 'activar devuelve true');
    const on = filaSusc(idViva);
    ok(on.renovacion_automatica === 1 && !!on.renovacion_aceptada && on.renovacion_texto === texto,
      `activada: ${on.renovacion_automatica} aceptada=${!!on.renovacion_aceptada} texto ${on.renovacion_texto === texto ? 'tal cual' : on.renovacion_texto}`);
    db.guardarRenovacionAutomatica({ idSusc: idViva, idOrg: L.idOrg, activar: false });
    const off = filaSusc(idViva);
    ok(off.renovacion_automatica === 0 && off.renovacion_aceptada === on.renovacion_aceptada && off.renovacion_texto === texto,
      `desactivada: ${off.renovacion_automatica}, conserva fecha y texto (${off.renovacion_texto === texto})`);
    ok(db.guardarRenovacionAutomatica({ idSusc: idViva, idOrg: R.idOrg, activar: true, texto }) === false
      && filaSusc(idViva).renovacion_automatica === 0, 'otra organización no la toca');
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
