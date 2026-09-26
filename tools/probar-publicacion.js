/**
 * probar-publicacion.js — publicar un equipo: borrador, pago y activación.
 *
 *   node tools/probar-publicacion.js
 *
 * POR QUÉ EXISTE
 *
 * Hasta la fase 05.2, el borrador de un anuncio vivía solo en el
 * navegador (localStorage) y el anuncio nacía 'activo' ocupando un cupo
 * que ya se había pagado antes. El modelo comercial nuevo
 * (`research/modelo-comercial.md`) pide lo contrario para el
 * particular: el anuncio existe en el servidor como BORRADOR desde que
 * elige plan, nadie más lo ve, y solo pasa a activo cuando el pago de
 * ESE anuncio se confirma, por la misma transición de todos los cobros
 * (`pagos.confirmarPago`). Un pago nunca sostiene dos anuncios y un
 * anuncio nunca tiene dos pagos esperando.
 *
 * Como probar-pagos.js, corre contra una base DESECHABLE en
 * `.tmp/prueba-publicacion/` que se borra y se recrea en cada pasada.
 * Nunca toca la red ni la base real.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

/* Las variables de entorno ANTES de cargar db.js: la ruta de la base
   se resuelve al importarlo. Hecho después, la prueba escribiría en la
   base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-publicacion');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
process.env.MERCA_FOTOS = path.join(BANCO, 'fotos');
process.env.MERCA_VIDEOS = path.join(BANCO, 'videos');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

/* Un .env local o el entorno de quien corre la prueba no puede decidir
   el resultado: la transferencia se apaga del todo, como en
   probar-transferencia.js. */
for (const k of Object.keys(process.env)) {
  if (k.startsWith('MERCA_TRANSFERENCIA')) delete process.env[k];
}

const db = require('./db');
const pagos = require('./pagos');
const precios = require('../assets/precios.js');

const ID_ORG = 'org-publica';
const ID_OTRA = 'org-ajena';

/* La bandeja de correos se comparte entre pasadas y entre pruebas; el
   sello hace únicas las referencias de esta ejecución. */
const SELLO = Date.now().toString(36);

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

/* La organización y su sucursal principal: el borrador toma la
   sucursal de ahí cuando la ruta no la manda. */
function prepararOrganizacion(idOrg, nombre, tipo = 'particular') {
  const t = new Date().toISOString();
  ejecuta(`INSERT OR IGNORE INTO organizaciones (id, tipo, nombre, creada, actualizada)
           VALUES (?, ?, ?, ?, ?)`, idOrg, tipo, nombre, t, t);
  ejecuta(`INSERT OR IGNORE INTO sucursales (id, organizacion_id, nombre, principal, activa, creada)
           VALUES (?, ?, 'Principal', 1, 1, ?)`, `suc-${idOrg}`, idOrg, t);
}

let contadorRef = 0;
const referencia = (etiqueta) => `PRUEBA-${etiqueta}-${SELLO}-${++contadorRef}`;

const siguienteB02 = () => {
  const s = consulta("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B02' AND activa = 1");
  return s ? s.siguiente : null;
};

const filaAnuncio = (idAnuncio) => consulta('SELECT * FROM anuncios WHERE id = ?', idAnuncio);
const fotosDe = (idAnuncio) =>
  consulta('SELECT COUNT(*) AS n FROM anuncio_fotos WHERE anuncio_id = ?', idAnuncio).n;

const suscripcionesDe = (idOrg) =>
  consulta('SELECT COUNT(*) AS n FROM suscripciones WHERE organizacion_id = ?', idOrg).n;
const facturasTotales = () => consulta('SELECT COUNT(*) AS n FROM facturas').n;
const pagosTotales = () => consulta('SELECT COUNT(*) AS n FROM pagos').n;
const pagosDelAnuncio = (idAnuncio) =>
  consulta('SELECT COUNT(*) AS n FROM pagos WHERE anuncio_id = ?', idAnuncio).n;

/* El cobro sale de la fórmula única, como en las rutas: la prueba no
   puede inventarse el subtotal. El número es el precio vigente del
   plan, ANTES del ajuste. */
const cobroDe = (precioUnitario, etiqueta) => ({
  ...precios.precioCompra({ precioUnitario, cupo: 1, dias: 30 }),
  referencia: referencia(etiqueta), procesador: 'demo',
});

const CLIENTE = { razonSocial: 'Cliente de prueba', correo: 'cliente@prueba.invalid' };
const intencionPublicacion = (idAnuncio, idPlan, dias) => ({
  tipo: 'publicacion', idAnuncio, idPlan, cupo: 1, dias,
  concepto: `Publicación ${idPlan} · ${dias} días`,
  cliente: CLIENTE, correoCliente: CLIENTE.correo,
});

/* Un borrador listo para pedir el pago: los mismos datos que usa la
   prueba de transferencia, tres fotos y un teléfono. */
function borradorCompleto(idPlan, dias) {
  const idAnuncio = db.crearBorrador({ idOrg: ID_ORG, idPlan, dias });
  db.guardarBorrador(idAnuncio, ID_ORG, {
    categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt',
    modelo: '567', anio: 2019, precio: 2500000, provincia: 'Santo Domingo',
    fotos: ['/fotos/1.jpg', '/fotos/2.jpg', '/fotos/3.jpg'].map((url) => ({ url, miniatura: null })),
    telefonos: [{ numero: '8095551234', tipo: 'ambos' }],
  });
  return idAnuncio;
}

/* Abrir la base aplica el esquema y las migraciones. */
db.secuenciasNcf();
prepararOrganizacion(ID_ORG, 'Particular que publica');
prepararOrganizacion(ID_OTRA, 'Otra cuenta');
db.cargarSecuencia({
  tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 200,
  vence: '2027-12-31', usaSitio: true,
});

(async () => {
  console.log('\n1. La migración deja columnas e índices y queda anotada');
  {
    const d = conexion();
    const colAnuncios = d.prepare('PRAGMA table_info(anuncios)').all().map((c) => c.name);
    const colPagos = d.prepare('PRAGMA table_info(pagos)').all().map((c) => c.name);
    const indice = (n) => d.prepare("SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?").get(n);
    const ixAnuncio = indice('ix_pagos_anuncio');
    const uxPendiente = indice('ux_pagos_anuncio_pendiente');
    const migrada = d.prepare("SELECT 1 AS si FROM migraciones WHERE id = '2026-09-borradores'").get();
    d.close();
    for (const c of ['plan_elegido', 'dias_elegidos']) {
      ok(colAnuncios.includes(c), `anuncios.${c} ${colAnuncios.includes(c) ? 'existe' : 'NO existe'}`);
    }
    ok(colPagos.includes('anuncio_id'), `pagos.anuncio_id ${colPagos.includes('anuncio_id') ? 'existe' : 'NO existe'}`);
    ok(!!ixAnuncio, `índice ix_pagos_anuncio ${ixAnuncio ? 'existe' : 'NO existe'}`);
    ok(!!uxPendiente && /UNIQUE/i.test(uxPendiente.sql || ''),
      `índice ux_pagos_anuncio_pendiente ${uxPendiente ? (uxPendiente.sql || '').slice(0, 60) : 'NO existe'}`);
    ok(!!migrada, `migración 2026-09-borradores ${migrada ? 'anotada' : 'NO anotada'}`);
  }

  console.log('\n2. El borrador nace en el servidor, se guarda por partes y nadie más lo ve');
  let idBorrador = null;
  {
    const e = lanza(() => {
      idBorrador = db.crearBorrador({ idOrg: ID_ORG, idUsuario: null, idPlan: 'destacado', dias: 60 });
    });
    ok(!e && typeof idBorrador === 'string', e ? `crearBorrador lanzó: ${e.message}` : `id ${idBorrador}`);
    const a = idBorrador ? filaAnuncio(idBorrador) : null;
    ok(!!a && a.estado === 'borrador' && a.suscripcion_id === null && a.publicado === null,
      `estado=${a && a.estado} suscripcion=${a && a.suscripcion_id} publicado=${a && a.publicado}`);
    ok(!!a && a.plan_elegido === 'destacado' && a.dias_elegidos === 60,
      `plan=${a && a.plan_elegido} días=${a && a.dias_elegidos}`);
    ok(!!a && a.anio === db.ANIO_SIN_DEFINIR && db.ANIO_SIN_DEFINIR === 1900 && a.categoria === '',
      `año=${a && a.anio} centinela=${db.ANIO_SIN_DEFINIR} categoría='${a && a.categoria}'`);
    ok(!!a && a.sucursal_id === `suc-${ID_ORG}`, `sucursal=${a && a.sucursal_id}`);

    let id45 = null;
    lanza(() => { id45 = db.crearBorrador({ idOrg: ID_ORG, idPlan: 'estandar', dias: 45 }); });
    const a45 = id45 ? filaAnuncio(id45) : null;
    ok(!!a45 && a45.dias_elegidos === 30, `45 días se guarda como ${a45 && a45.dias_elegidos} (se esperaba 30)`);
    if (id45) ejecuta('DELETE FROM anuncios WHERE id = ?', id45);

    let r = null;
    const eg = lanza(() => {
      r = db.guardarBorrador(idBorrador, ID_ORG, {
        modelo: '320D', anio: 2018,
        fotos: [{ url: '/fotos/a.jpg', miniatura: '/fotos/a-m.jpg' }, { url: '/fotos/b.jpg', miniatura: '/fotos/b-m.jpg' }],
        telefonos: [{ numero: '8095550000', tipo: 'ambos' }],
      });
    });
    const g = filaAnuncio(idBorrador);
    ok(!eg && !!r && r.ok === true, eg ? `guardarBorrador lanzó: ${eg.message}` : `resultado ${JSON.stringify(r)}`);
    ok(g.modelo === '320D' && g.anio === 2018 && fotosDe(idBorrador) === 2,
      `modelo=${g.modelo} año=${g.anio} fotos=${fotosDe(idBorrador)}`);

    db.guardarBorrador(idBorrador, ID_ORG, { fotos: [{ url: '/fotos/c.jpg', miniatura: null }] });
    ok(fotosDe(idBorrador) === 1, `las fotos se reemplazan: ${fotosDe(idBorrador)} (se esperaba 1)`);
    db.guardarBorrador(idBorrador, ID_ORG, { descripcion: 'Buena' });
    ok(fotosDe(idBorrador) === 1, `sin «fotos» no se tocan: ${fotosDe(idBorrador)} (se esperaba 1)`);

    const en = lanza(() => db.guardarBorrador(idBorrador, ID_ORG, { modelo: null, anio: null }));
    const n = filaAnuncio(idBorrador);
    ok(!en && n.modelo === '' && n.anio === db.ANIO_SIN_DEFINIR,
      en ? `nulos lanzaron: ${en.message}` : `nulos: modelo='${n.modelo}' año=${n.anio}`);
    db.guardarBorrador(idBorrador, ID_ORG, { modelo: '320D', anio: 2018 });

    const ajeno = db.guardarBorrador(idBorrador, ID_OTRA, { modelo: 'ROBADO' });
    ok(ajeno && ajeno.ok === false && ajeno.motivo === 'no-existe' && filaAnuncio(idBorrador).modelo === '320D',
      `otra organización: ${JSON.stringify(ajeno)} modelo=${filaAnuncio(idBorrador).modelo}`);

    const idActivo = db.crearAnuncio({
      idOrg: ID_ORG, categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt',
      modelo: '567', anio: 2019, precio: 100000,
    });
    const activo = db.guardarBorrador(idActivo, ID_ORG, { modelo: 'OTRO' });
    ok(activo && activo.ok === false && activo.motivo === 'no-existe' && filaAnuncio(idActivo).modelo === '567',
      `sobre un activo: ${JSON.stringify(activo)} modelo=${filaAnuncio(idActivo).modelo}`);

    const b = db.borradorDe(idBorrador, ID_ORG);
    ok(!!b && Array.isArray(b.fotos) && Array.isArray(b.videos) && Array.isArray(b.telefonos)
      && b.plan_elegido === 'destacado' && b.dias_elegidos === 60 && b.pagoPendiente === null,
    `borradorDe: fotos=${b && b.fotos && b.fotos.length} tel=${b && b.telefonos && b.telefonos.length} pendiente=${b && b.pagoPendiente}`);
    ok(db.borradorDe(idBorrador, ID_OTRA) === null, 'borradorDe con otra organización: null');
    ok(db.borradorDe(idActivo, ID_ORG) === null, 'borradorDe sobre un activo: null');

    db.crearBorrador({ idOrg: ID_OTRA, idPlan: 'estandar', dias: 30 });
    ok(db.contarBorradores(ID_ORG) === 1 && db.contarBorradores(ID_OTRA) === 1,
      `contarBorradores: propia=${db.contarBorradores(ID_ORG)} ajena=${db.contarBorradores(ID_OTRA)}`);

    const enCatalogo = db.buscarAnuncios({}).anuncios.some((x) => x.id === idBorrador);
    const enPublicos = db.anunciosPublicos({ porPagina: 5000 }).some((x) => x.id === idBorrador);
    ok(!enCatalogo && !enPublicos, `borrador en catálogo=${enCatalogo} en públicos=${enPublicos}`);

    const enPanel = db.anunciosDeOrganizacion(ID_ORG).find((x) => x.id === idBorrador);
    ok(!!enPanel && enPanel.plan_elegido === 'destacado' && enPanel.dias_elegidos === 60
      && enPanel.plan_elegido_nombre === 'Destacado' && enPanel.pago_pendiente === null
      && enPanel.pendiente_pago === false,
    `panel: ${enPanel ? `${enPanel.plan_elegido_nombre} ${enPanel.dias_elegidos}d pendiente=${enPanel.pendiente_pago}` : 'NO aparece'}`);
  }

  console.log('\n3. Confirmar el pago de la publicación activa el borrador, una sola vez');
  let idPublicado = null;
  {
    const idAnuncio = borradorCompleto('destacado', 30);
    const pago = db.registrarCobro({
      idOrg: ID_ORG, idAnuncio, cobro: cobroDe(3200, 'PUBLICA'),
      intencion: intencionPublicacion(idAnuncio, 'destacado', 30),
    });
    ok(pago.anuncio_id === idAnuncio && pago.estado === 'pendiente',
      `pago anuncio_id=${pago.anuncio_id === idAnuncio ? 'el del borrador' : pago.anuncio_id} estado=${pago.estado}`);
    const pp = db.pagoPendienteDeAnuncio(idAnuncio);
    ok(!!pp && pp.id === pago.id, `pagoPendienteDeAnuncio: ${pp ? (pp.id === pago.id ? 'ese pago' : pp.id) : 'null'}`);
    const enPanel = db.anunciosDeOrganizacion(ID_ORG).find((x) => x.id === idAnuncio);
    ok(!!enPanel && enPanel.pendiente_pago === true, `panel pendiente_pago=${enPanel && enPanel.pendiente_pago}`);
    const cambiar = db.guardarBorrador(idAnuncio, ID_ORG, { modelo: 'OTRO' });
    ok(cambiar && cambiar.ok === false && cambiar.motivo === 'pago-pendiente',
      `guardar con pago pendiente: ${JSON.stringify(cambiar)}`);

    const pagosAntes = pagosDelAnuncio(idAnuncio);
    const e2 = lanza(() => db.registrarCobro({
      idOrg: ID_ORG, idAnuncio, cobro: cobroDe(3200, 'DOBLE'),
      intencion: intencionPublicacion(idAnuncio, 'destacado', 30),
    }));
    ok(!!e2 && e2.codigo === 409 && pagosDelAnuncio(idAnuncio) === pagosAntes,
      `segundo pendiente: ${e2 ? `${e2.codigo} ${e2.message}` : 'NO lanzó'} pagos=${pagosDelAnuncio(idAnuncio)}`);

    const suscAntes = suscripcionesDe(ID_ORG);
    const b02 = siguienteB02();
    let r = null;
    const ec = lanza(() => { r = pagos.confirmarPago(pago.id); });
    ok(!ec && !!r && r.pago.estado === 'aprobado', ec ? `confirmarPago lanzó: ${ec.message}` : `pago ${r && r.pago.estado}`);
    ok(suscripcionesDe(ID_ORG) === suscAntes + 1, `suscripciones ${suscAntes} → ${suscripcionesDe(ID_ORG)} (se esperaba +1)`);
    const pagoFila = db.pagoPorId(pago.id);
    const s = pagoFila.suscripcion_id ? consulta('SELECT * FROM suscripciones WHERE id = ?', pagoFila.suscripcion_id) : null;
    ok(!!s && s.plan_id === 'destacado' && s.anuncios_incluidos === 1 && s.dias_ciclo === 30 && s.precio_pactado === 3200,
      `suscripción: ${s ? `${s.plan_id} cupo=${s.anuncios_incluidos} días=${s.dias_ciclo} pactado=${s.precio_pactado}` : 'NO hay'}`);
    const a = filaAnuncio(idAnuncio);
    ok(!!s && a.estado === 'activo' && a.suscripcion_id === s.id && a.vence === s.fin
      && a.destacado_hasta === s.fin && !!a.publicado,
    `anuncio: ${a.estado} susc=${!!s && a.suscripcion_id === s.id} vence=${!!s && a.vence === s.fin} destacado=${!!s && a.destacado_hasta === s.fin} publicado=${a.publicado}`);
    const f = consulta("SELECT * FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", pago.id);
    ok(!!f && /^B02/.test(f.ncf || '') && f.subtotal + f.itbis === f.total && f.total === pagoFila.total,
      `factura: ${f ? `${f.ncf} ${f.subtotal}+${f.itbis}=${f.total} (pago ${pagoFila.total})` : 'NO hay'}`);
    ok(siguienteB02() === b02 + 1, `B02 avanzó ${siguienteB02() - b02} (se esperaba 1)`);

    const suscMedio = suscripcionesDe(ID_ORG);
    const factMedio = facturasTotales();
    let r2 = null;
    const e3 = lanza(() => { r2 = pagos.confirmarPago(pago.id); });
    const a2 = filaAnuncio(idAnuncio);
    ok(!e3 && !!r2 && r2.yaEstaba === true && suscripcionesDe(ID_ORG) === suscMedio
      && facturasTotales() === factMedio && a2.publicado === a.publicado && a2.estado === 'activo',
    e3 ? `repetir lanzó: ${e3.message}` : `repetir: yaEstaba=${r2 && r2.yaEstaba} susc=${suscripcionesDe(ID_ORG)} facturas=${facturasTotales()}`);
    idPublicado = idAnuncio;
  }

  console.log('\n4. Lo que no debe pasar: activar sin borrador, rechazo, importe cero');
  {
    // Un anuncio que dejó de ser borrador antes de aprobar: 409 y nada.
    const idRetirado = borradorCompleto('destacado', 30);
    const pRet = db.registrarCobro({
      idOrg: ID_ORG, idAnuncio: idRetirado, cobro: cobroDe(3200, 'RETIRADO'),
      intencion: intencionPublicacion(idRetirado, 'destacado', 30),
    });
    ejecuta("UPDATE anuncios SET estado = 'retirado' WHERE id = ?", idRetirado);
    const suscAntes = suscripcionesDe(ID_ORG);
    const e409 = lanza(() => db.aprobarPago(pRet.id));
    ok(!!e409 && e409.codigo === 409 && db.pagoPorId(pRet.id).estado === 'pendiente'
      && suscripcionesDe(ID_ORG) === suscAntes,
    `no borrador: ${e409 ? e409.codigo : 'NO lanzó'} pago=${db.pagoPorId(pRet.id).estado} susc=${suscripcionesDe(ID_ORG) - suscAntes}`);

    // El borrador desapareció: 404 y nada.
    const idBorrado = borradorCompleto('destacado', 30);
    const pBor = db.registrarCobro({
      idOrg: ID_ORG, idAnuncio: idBorrado, cobro: cobroDe(3200, 'BORRADO'),
      intencion: intencionPublicacion(idBorrado, 'destacado', 30),
    });
    ejecuta('DELETE FROM anuncios WHERE id = ?', idBorrado);
    const e404 = lanza(() => db.aprobarPago(pBor.id));
    ok(!!e404 && e404.codigo === 404 && db.pagoPorId(pBor.id).estado === 'pendiente'
      && suscripcionesDe(ID_ORG) === suscAntes,
    `borrado: ${e404 ? e404.codigo : 'NO lanzó'} pago=${db.pagoPorId(pBor.id).estado} susc=${suscripcionesDe(ID_ORG) - suscAntes}`);

    // Un rechazo deja el borrador recuperable.
    const idRech = borradorCompleto('destacado', 30);
    const pRech = db.registrarCobro({
      idOrg: ID_ORG, idAnuncio: idRech, cobro: cobroDe(3200, 'RECHAZA'),
      intencion: intencionPublicacion(idRech, 'destacado', 30),
    });
    const b02 = siguienteB02();
    const fact = facturasTotales();
    const rr = pagos.rechazarPago(pRech.id);
    const aR = filaAnuncio(idRech);
    ok(rr.cambiado && aR.estado === 'borrador' && aR.suscripcion_id === null
      && facturasTotales() === fact && siguienteB02() === b02,
    `rechazo: pago=${rr.pago.estado} anuncio=${aR.estado} susc=${aR.suscripcion_id} facturas=${facturasTotales() - fact} B02=${siguienteB02() - b02}`);
    const eOtra = lanza(() => db.registrarCobro({
      idOrg: ID_ORG, idAnuncio: idRech, cobro: cobroDe(3200, 'OTRA-VEZ'),
      intencion: intencionPublicacion(idRech, 'destacado', 30),
    }));
    ok(!eOtra, eOtra ? `otro pendiente tras el rechazo lanzó: ${eOtra.message}` : 'tras el rechazo se puede pedir otro pago');

    // Importe cero: activa al instante, sin comprobante.
    const idCero = borradorCompleto('estandar', 30);
    const suscCero = suscripcionesDe(ID_ORG);
    const factCero = facturasTotales();
    let rc = null;
    const eCero = lanza(() => {
      rc = db.publicarBorradorSinCosto({
        idAnuncio: idCero, idOrg: ID_ORG, idPlan: 'estandar', dias: 30,
        cobro: { ...precios.desglose(0), referencia: referencia('CERO') },
      });
    });
    const aC = filaAnuncio(idCero);
    const pC = consulta('SELECT * FROM pagos WHERE anuncio_id = ?', idCero);
    const sC = aC.suscripcion_id ? consulta('SELECT * FROM suscripciones WHERE id = ?', aC.suscripcion_id) : null;
    ok(!eCero && !!rc && aC.estado === 'activo' && !!sC && sC.plan_id === 'estandar' && sC.anuncios_incluidos === 1
      && suscripcionesDe(ID_ORG) === suscCero + 1,
    eCero ? `importe cero lanzó: ${eCero.message}` : `cero: ${aC.estado} ${sC && sC.plan_id} cupo=${sC && sC.anuncios_incluidos}`);
    ok(!!pC && pC.estado === 'aprobado' && pC.total === 0 && pC.procesador === 'sin-costo'
      && pC.suscripcion_id === aC.suscripcion_id && facturasTotales() === factCero,
    `pago cero: ${pC ? `${pC.estado} total=${pC.total} ${pC.procesador}` : 'NO hay'} facturas=${facturasTotales() - factCero}`);

    const idConImporte = borradorCompleto('estandar', 30);
    const suscImp = suscripcionesDe(ID_ORG);
    const pagosImp = pagosTotales();
    const eImp = lanza(() => db.publicarBorradorSinCosto({
      idAnuncio: idConImporte, idOrg: ID_ORG, idPlan: 'estandar', dias: 30,
      cobro: { ...precios.desglose(1800), referencia: referencia('COLADO') },
    }));
    ok(!!eImp && filaAnuncio(idConImporte).estado === 'borrador'
      && suscripcionesDe(ID_ORG) === suscImp && pagosTotales() === pagosImp,
    `importe colado: ${eImp ? 'rechazado' : 'NO lanzó'} anuncio=${filaAnuncio(idConImporte).estado}`);

    const suscYa = suscripcionesDe(ID_ORG);
    const pagosYa = pagosTotales();
    const eYa = lanza(() => db.publicarBorradorSinCosto({
      idAnuncio: idPublicado, idOrg: ID_ORG, idPlan: 'estandar', dias: 30,
      cobro: { ...precios.desglose(0), referencia: referencia('YA-ACTIVO') },
    }));
    ok(!!eYa && eYa.codigo === 409 && suscripcionesDe(ID_ORG) === suscYa && pagosTotales() === pagosYa,
      `sobre un activo: ${eYa ? eYa.codigo : 'NO lanzó'} susc=${suscripcionesDe(ID_ORG) - suscYa} pagos=${pagosTotales() - pagosYa}`);
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exitCode = fallos ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
