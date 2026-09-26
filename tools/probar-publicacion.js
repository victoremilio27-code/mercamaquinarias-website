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
const api = require('./api');
const legales = require('../assets/legales.js');
const fotosModulo = require('./fotos');
const correo = require('./correo');
const { EventEmitter } = require('events');

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

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Copiada de probar-transferencia.js: lo que importa es lo que ve quien
   llama, no lo que devuelven las funciones de dentro. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-publicacion', ...cabeceras };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      setHeader() {},
      writeHead(c) { res.codigo = c; return res; },
      destroy() {},
      end(d) {
        let datos = null;
        try { datos = d ? JSON.parse(d) : null; } catch { datos = null; }
        resolver({ codigo: res.codigo, datos });
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

/* Una cuenta con sesión y, salvo que se pida lo contrario, con todas
   las condiciones legales aceptadas: es lo que hace falta para llegar a
   /api/borradores sin que la propia comprobación de legales estorbe la
   prueba de otra cosa. */
function cuentaCon({ correo: correoCuenta, tipo = 'particular', exenta = false, sinLegales = false }) {
  const { idUsuario } = db.crearCuenta({
    correo: correoCuenta, clave: 'UnaClaveLargaYSegura9', nombre: correoCuenta,
    telefono: '8095550000', tipo, empresa: tipo === 'dealer' ? correoCuenta : undefined,
  });
  if (!sinLegales) {
    Object.values(legales.DOCUMENTOS || {}).forEach((doc) => {
      db.registrarAceptacion({
        usuarioId: idUsuario, documento: doc.id, version: doc.version, ip: '127.0.0.1', userAgent: 'prueba',
      });
    });
  }
  if (exenta) ejecuta('UPDATE organizaciones SET exenta_pago = 1 WHERE id = ?', db.organizacionDe(idUsuario).id);
  return {
    idUsuario,
    org: db.organizacionDe(idUsuario),
    cabeceras: { cookie: `te_sesion=${db.abrirSesion(idUsuario)}`, 'cf-connecting-ip': '201.8.8.8' },
  };
}

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
  + 'AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
async function subirFoto(cabeceras) {
  const r = await pedir({ metodo: 'POST', url: '/api/fotos', cuerpo: { completa: PNG }, cabeceras });
  return (r.datos || {}).completa;
}

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

  console.log('\n5. Crear el borrador por la API: mismas validaciones que publicar, sin los mínimos');
  let idBorradorApi = null;
  let particular = null;
  {
    particular = cuentaCon({ correo: `particular-${SELLO}@prueba.invalid` });
    const dealer = cuentaCon({ correo: `dealer-${SELLO}@prueba.invalid`, tipo: 'dealer' });
    const exento = cuentaCon({ correo: `exento-${SELLO}@prueba.invalid`, exenta: true });
    const sinLegales = cuentaCon({ correo: `sinlegales-${SELLO}@prueba.invalid`, sinLegales: true });

    const crear = (cuerpo, quien) => pedir({ metodo: 'POST', url: '/api/borradores', cuerpo, cabeceras: quien && quien.cabeceras });

    const sinSesion = await crear({ plan: 'destacado', dias: 60 });
    ok(sinSesion.codigo === 401, `sin sesión: ${sinSesion.codigo}`);

    const rSinLegales = await crear({ plan: 'destacado', dias: 60 }, sinLegales);
    ok(rSinLegales.codigo === 409 && Array.isArray((rSinLegales.datos || {}).faltan) && rSinLegales.datos.faltan.length > 0,
      `sin aceptar condiciones: ${rSinLegales.codigo} faltan=${JSON.stringify(rSinLegales.datos && rSinLegales.datos.faltan)}`);

    const rDealer = await crear({ plan: 'destacado', dias: 60 }, dealer);
    ok(rDealer.codigo === 409, `cuenta dealer: ${rDealer.codigo}`);

    const rExento = await crear({ plan: 'destacado', dias: 60 }, exento);
    ok(rExento.codigo === 409, `cuenta exenta: ${rExento.codigo}`);

    const rPlanMalo = await crear({ plan: 'no-existe', dias: 30 }, particular);
    ok(rPlanMalo.codigo === 400, `plan inexistente: ${rPlanMalo.codigo}`);

    const planDestacado = db.planPorId('destacado');
    const precioUnitarioDestacado = planDestacado.precio_vigente != null ? planDestacado.precio_vigente : planDestacado.precio;
    const r = await crear({ plan: 'destacado', dias: 60 }, particular);
    const d = (r.datos || {}).borrador || {};
    idBorradorApi = d.id;
    ok(r.codigo === 201 && typeof d.id === 'string', `crear: ${r.codigo} id=${d.id}`);
    ok(!!d.plan && d.plan.id === 'destacado' && d.dias === 60, `plan=${d.plan && d.plan.id} días=${d.dias}`);
    ok(d.pendientePago === false, `pendientePago=${d.pendientePago}`);
    const esperado = precios.precioCompra({ precioUnitario: precioUnitarioDestacado, cupo: 1, dias: 60 }).total;
    ok(!!d.precio && d.precio.total === esperado, `precio.total=${d.precio && d.precio.total} (se esperaba ${esperado})`);
    ok(!!d.precio && d.precio.base === undefined && d.precio.ajuste === undefined && d.precio.subtotal === undefined,
      `precio sin base/ajuste/subtotal: ${JSON.stringify(d.precio)}`);
    const fila = filaAnuncio(idBorradorApi);
    ok(!!fila && fila.estado === 'borrador' && fila.plan_elegido === 'destacado',
      `en la base: estado=${fila && fila.estado} plan=${fila && fila.plan_elegido}`);

    // Lo que manda «Duplicar»: el borrador nace ya con los campos guardados.
    const fotoDup = await subirFoto(particular.cabeceras);
    const rDup = await crear({
      plan: 'estandar', dias: 30, modelo: 'D6', anio: 2015, fotos: [{ url: fotoDup, miniatura: null }],
    }, particular);
    const dDup = (rDup.datos || {}).borrador || {};
    ok(rDup.codigo === 201, `crear con campos (duplicar): ${rDup.codigo}`);
    const filaDup = filaAnuncio(dDup.id);
    ok(!!filaDup && filaDup.modelo === 'D6' && filaDup.anio === 2015 && fotosDe(dDup.id) === 1,
      `campos guardados en la creación: modelo=${filaDup && filaDup.modelo} año=${filaDup && filaDup.anio} fotos=${fotosDe(dDup.id)}`);
  }

  console.log('\n6. Guardar el borrador por partes y leerlo con la forma del formulario');
  {
    const inicial = await pedir({ url: `/api/borradores/${idBorradorApi}`, cabeceras: particular.cabeceras });
    ok(inicial.codigo === 200 && inicial.datos.borrador.datos.equipo.anio === '',
      `recién creado: año='${inicial.datos && inicial.datos.borrador && inicial.datos.borrador.datos.equipo.anio}'`);
    ok(inicial.datos.borrador.completo === false && !!inicial.datos.borrador.falta,
      `incompleto: completo=${inicial.datos.borrador.completo} falta=${inicial.datos.borrador.falta}`);

    const guardar = (cuerpo) => pedir({ metodo: 'PUT', url: `/api/borradores/${idBorradorApi}`, cuerpo, cabeceras: particular.cabeceras });

    const rAnioMalo = await guardar({ anio: 1965 });
    ok(rAnioMalo.codigo === 400 && /Año entre 1970/.test((rAnioMalo.datos || {}).error || ''),
      `año inválido: ${rAnioMalo.codigo} ${rAnioMalo.datos && rAnioMalo.datos.error}`);

    const rPrecioMalo = await guardar({ precio: -5 });
    ok(rPrecioMalo.codigo === 400, `precio inválido: ${rPrecioMalo.codigo}`);

    const f1 = await subirFoto(particular.cabeceras);
    const f2 = await subirFoto(particular.cabeceras);
    const f3 = await subirFoto(particular.cabeceras);

    const rGuardar = await guardar({
      modelo: '320D', anio: 2018, precio: 4500000,
      fotos: [f1, f2, f3].map((url) => ({ url, miniatura: null })),
      telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }],
    });
    ok(rGuardar.codigo === 200, `guardar: ${rGuardar.codigo} ${JSON.stringify(rGuardar.datos)}`);
    const filaGuardada = filaAnuncio(idBorradorApi);
    ok(filaGuardada.modelo === '320D' && filaGuardada.anio === 2018 && filaGuardada.precio === 4500000
      && fotosDe(idBorradorApi) === 3,
    `en la base: modelo=${filaGuardada.modelo} año=${filaGuardada.anio} precio=${filaGuardada.precio} fotos=${fotosDe(idBorradorApi)}`);

    const rFotoAjena = await guardar({
      fotos: [{ url: 'https://otro-sitio.example/f.jpg', miniatura: null }, { url: f1, miniatura: null }],
    });
    ok(rFotoAjena.codigo === 200 && fotosDe(idBorradorApi) === 1,
      `foto de otro sitio descartada: ${rFotoAjena.codigo} quedan ${fotosDe(idBorradorApi)} (se esperaba 1)`);

    const rDataUri = await guardar({
      fotos: [{ url: 'data:image/png;base64,AAAA', miniatura: null }, { url: f2, miniatura: null }],
    });
    ok(rDataUri.codigo === 200 && fotosDe(idBorradorApi) === 1,
      `data: descartado: quedan ${fotosDe(idBorradorApi)} (se esperaba 1)`);

    const rPlan = await guardar({ plan: 'estandar', dias: 30 });
    ok(rPlan.codigo === 200, `cambiar plan: ${rPlan.codigo}`);
    const filaPlan = filaAnuncio(idBorradorApi);
    ok(filaPlan.plan_elegido === 'estandar' && filaPlan.dias_elegidos === 30,
      `plan=${filaPlan.plan_elegido} días=${filaPlan.dias_elegidos}`);

    await guardar({ plan: 'destacado', dias: 30 });
    const muchasFotos = [];
    for (let i = 0; i < 25; i++) muchasFotos.push({ url: f1, miniatura: null });
    const rMuchas = await guardar({ fotos: muchasFotos });
    const planDestacadoRecorte = db.planPorId('destacado');
    ok(rMuchas.codigo === 200 && fotosDe(idBorradorApi) === planDestacadoRecorte.fotos_maximas,
      `recorte al tope del plan: ${fotosDe(idBorradorApi)} (se esperaba ${planDestacadoRecorte.fotos_maximas})`);

    // Ahora con todo: cadena completa, modelo, año, precio, fotos y teléfono.
    const rCompleto = await guardar({
      categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt',
      fotos: [f1, f2, f3].map((url) => ({ url, miniatura: null })),
      telefonos: [{ numero: '8095551234', tipo: 'ambos' }],
    });
    ok(rCompleto.codigo === 200, `completar la cadena: ${rCompleto.codigo} ${JSON.stringify(rCompleto.datos)}`);

    const completo = await pedir({ url: `/api/borradores/${idBorradorApi}`, cabeceras: particular.cabeceras });
    const dc = completo.datos.borrador;
    ok(dc.completo === true && dc.falta === null, `completo con todo: completo=${dc.completo} falta=${dc.falta}`);
    ok(dc.datos.equipo.modelo === '320D' && dc.datos.equipo.anio === '2018',
      `modelo=${dc.datos.equipo.modelo} año=${dc.datos.equipo.anio}`);
    ok(Array.isArray(dc.datos.fotos) && dc.datos.fotos.length === 3 && dc.datos.fotos.every((f) => f.url && f.miniatura),
      `fotos con url y miniatura: ${JSON.stringify(dc.datos.fotos[0])}`);
  }

  console.log('\n6b. copiarAnuncio sigue sin serie; el borrador sí devuelve la suya');
  {
    await pedir({ metodo: 'PUT', url: `/api/borradores/${idBorradorApi}`, cuerpo: { serie: 'XK-4410' }, cabeceras: particular.cabeceras });
    const b = await pedir({ url: `/api/borradores/${idBorradorApi}`, cabeceras: particular.cabeceras });
    ok(b.datos.borrador.datos.equipo.serie === 'XK-4410', `borrador con su serie: '${b.datos.borrador.datos.equipo.serie}'`);

    const copia = await pedir({ url: `/api/mis-anuncios/${idBorradorApi}/copia`, cabeceras: particular.cabeceras });
    ok(copia.codigo === 200 && copia.datos.copia.equipo.serie === '', `copiarAnuncio sin serie: '${copia.datos.copia.equipo.serie}'`);
  }

  console.log('\n7. Nadie más ve un borrador ajeno ni lo activa por otra puerta');
  {
    const orgA = cuentaCon({ correo: `orga-${SELLO}@prueba.invalid` });
    const orgB = cuentaCon({ correo: `orgb-${SELLO}@prueba.invalid` });

    const crear = await pedir({ metodo: 'POST', url: '/api/borradores', cuerpo: { plan: 'destacado', dias: 30 }, cabeceras: orgA.cabeceras });
    const idAjeno = crear.datos.borrador.id;

    const verSinSesion = await pedir({ url: `/api/anuncios/${idAjeno}` });
    ok(verSinSesion.codigo === 404, `GET /api/anuncios sin sesión: ${verSinSesion.codigo}`);
    const verOtra = await pedir({ url: `/api/anuncios/${idAjeno}`, cabeceras: orgB.cabeceras });
    ok(verOtra.codigo === 404, `GET /api/anuncios con B: ${verOtra.codigo}`);
    const verPropia = await pedir({ url: `/api/anuncios/${idAjeno}`, cabeceras: orgA.cabeceras });
    ok(verPropia.codigo === 200, `GET /api/anuncios con A: ${verPropia.codigo}`);

    const filaAntes = filaAnuncio(idAjeno);

    const getBorradorB = await pedir({ url: `/api/borradores/${idAjeno}`, cabeceras: orgB.cabeceras });
    ok(getBorradorB.codigo === 404, `GET /api/borradores con B: ${getBorradorB.codigo}`);
    const putBorradorB = await pedir({ metodo: 'PUT', url: `/api/borradores/${idAjeno}`, cuerpo: { modelo: 'X' }, cabeceras: orgB.cabeceras });
    ok(putBorradorB.codigo === 404, `PUT /api/borradores con B: ${putBorradorB.codigo}`);
    const deleteB = await pedir({ metodo: 'DELETE', url: `/api/anuncios/${idAjeno}`, cabeceras: orgB.cabeceras });
    ok(deleteB.codigo === 404, `DELETE con B: ${deleteB.codigo}`);
    const patchEstadoB = await pedir({ metodo: 'PATCH', url: `/api/anuncios/${idAjeno}`, cuerpo: { estado: 'activo' }, cabeceras: orgB.cabeceras });
    ok(patchEstadoB.codigo === 404, `PATCH estado con B: ${patchEstadoB.codigo}`);
    const patchPlanB = await pedir({ metodo: 'PATCH', url: `/api/anuncios/${idAjeno}/plan`, cuerpo: { membresia: 'x' }, cabeceras: orgB.cabeceras });
    ok(patchPlanB.codigo === 404, `PATCH plan con B: ${patchPlanB.codigo}`);

    const filaDespues = filaAnuncio(idAjeno);
    ok(filaAntes.modelo === filaDespues.modelo && filaAntes.estado === filaDespues.estado
      && filaAntes.actualizado === filaDespues.actualizado, 'la fila de A no cambió con los intentos de B');

    const catalogo = await pedir({ url: '/api/anuncios' });
    ok(!(catalogo.datos.anuncios || []).some((x) => x.id === idAjeno), `catálogo sin el borrador: ${catalogo.codigo}`);

    const misA = await pedir({ url: '/api/mis-anuncios', cabeceras: orgA.cabeceras });
    const enA = (misA.datos.anuncios || []).find((x) => x.id === idAjeno);
    ok(!!enA && enA.estado === 'borrador' && enA.pendiente_pago === false,
      `mis-anuncios de A: ${enA && enA.estado} pendiente=${enA && enA.pendiente_pago}`);
    const misB = await pedir({ url: '/api/mis-anuncios', cabeceras: orgB.cabeceras });
    ok(!(misB.datos.anuncios || []).some((x) => x.id === idAjeno), 'mis-anuncios de B no lo trae');

    // Sin puerta de atrás (MOD-08): ni el propio dueño activa su borrador por PATCH.
    for (const estado of ['activo', 'pausado', 'vendido', 'retirado']) {
      const r = await pedir({ metodo: 'PATCH', url: `/api/anuncios/${idAjeno}`, cuerpo: { estado }, cabeceras: orgA.cabeceras });
      ok(r.codigo === 409, `PATCH estado=${estado} sobre el propio borrador: ${r.codigo}`);
    }
    ok(filaAnuncio(idAjeno).estado === 'borrador', 'sigue borrador tras los cuatro intentos');

    const membresiaLibre = db.comprarCupos({
      idOrg: orgA.org.id, idPlan: 'estandar', cupo: 1, dias: 30,
      cobro: { subtotal: 0, itbis: 0, total: 0, referencia: referencia('MEMBRESIA-A') },
    });
    const patchPlanPropio = await pedir({
      metodo: 'PATCH', url: `/api/anuncios/${idAjeno}/plan`, cuerpo: { membresia: membresiaLibre.id }, cabeceras: orgA.cabeceras,
    });
    ok(patchPlanPropio.codigo === 409, `PATCH plan sobre el propio borrador: ${patchPlanPropio.codigo}`);
    ok(filaAnuncio(idAjeno).suscripcion_id === null, 'suscripcion_id sigue NULL');

    const pagoBorrador = db.registrarCobro({
      idOrg: orgA.org.id, idAnuncio: idAjeno, cobro: cobroDe(3200, 'BORRADOR-A'),
      intencion: intencionPublicacion(idAjeno, 'destacado', 30),
    });
    const putConPago = await pedir({ metodo: 'PUT', url: `/api/borradores/${idAjeno}`, cuerpo: { modelo: 'OTRO' }, cabeceras: orgA.cabeceras });
    ok(putConPago.codigo === 409, `PUT con pago pendiente: ${putConPago.codigo}`);
    const deleteConPago = await pedir({ metodo: 'DELETE', url: `/api/anuncios/${idAjeno}`, cabeceras: orgA.cabeceras });
    ok(deleteConPago.codigo === 409 && (deleteConPago.datos.error || '').includes('facturacion@mercamaquinarias.com'),
      `DELETE con pago pendiente: ${deleteConPago.codigo} ${deleteConPago.datos && deleteConPago.datos.error}`);

    pagos.rechazarPago(pagoBorrador.id);
    const fotoAntesDeBorrar = await subirFoto(orgA.cabeceras);
    await pedir({
      metodo: 'PUT', url: `/api/borradores/${idAjeno}`,
      cuerpo: { fotos: [{ url: fotoAntesDeBorrar, miniatura: null }] }, cabeceras: orgA.cabeceras,
    });
    const deleteOk = await pedir({ metodo: 'DELETE', url: `/api/anuncios/${idAjeno}`, cabeceras: orgA.cabeceras });
    ok(deleteOk.codigo === 200, `DELETE tras rechazar el pago: ${deleteOk.codigo}`);
    ok(filaAnuncio(idAjeno) === undefined, 'la fila ya no existe');
    ok(!fotosModulo.rutaExiste(fotoAntesDeBorrar), 'el archivo de la foto ya no está en disco');
  }

  console.log('\n8. Límites de creación, el camino de hoy para quien ya tiene cupo, y capacidadLibre al vender');
  {
    const orgLimites = cuentaCon({ correo: `limites-${SELLO}@prueba.invalid` });
    let ultimoCodigo = 0;
    for (let i = 0; i < 10; i++) {
      const r = await pedir({ metodo: 'POST', url: '/api/borradores', cuerpo: { plan: 'estandar', dias: 30 }, cabeceras: orgLimites.cabeceras });
      ultimoCodigo = r.codigo;
    }
    ok(ultimoCodigo === 201, `los primeros 10 borradores se crean: último código ${ultimoCodigo}`);
    const r11 = await pedir({ metodo: 'POST', url: '/api/borradores', cuerpo: { plan: 'estandar', dias: 30 }, cabeceras: orgLimites.cabeceras });
    ok(r11.codigo === 409, `el 11.º borrador: ${r11.codigo}`);

    // Llenar el contador compartido publicar:<usuario>.
    const orgTope = cuentaCon({ correo: `tope-${SELLO}@prueba.invalid` });
    for (let i = 0; i < 20; i++) db.permitir(`publicar:${orgTope.idUsuario}`, 20, 60);
    const rBorradorTope = await pedir({ metodo: 'POST', url: '/api/borradores', cuerpo: { plan: 'estandar', dias: 30 }, cabeceras: orgTope.cabeceras });
    ok(rBorradorTope.codigo === 429, `POST /api/borradores con el tope lleno: ${rBorradorTope.codigo}`);
    const rAnuncioTope = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: {}, cabeceras: orgTope.cabeceras });
    ok(rAnuncioTope.codigo === 429, `POST /api/anuncios con el mismo contador: ${rAnuncioTope.codigo}`);

    const ANUNCIO_COMPLETO = (fotosUrls) => ({
      categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt', modelo: '567',
      anio: 2019, condicion: 'usado', usoValor: 1000, usoUnidad: 'km',
      descripcion: 'Prueba de publicar sin membresía.',
      provincia: 'santo-domingo', precio: 1000000, moneda: 'DOP',
      fotos: fotosUrls, telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }],
    });

    // D-02: el camino de hoy sigue intacto para quien ya tiene un cupo libre.
    const sinMembresia = cuentaCon({ correo: `sinmembresia-${SELLO}@prueba.invalid` });
    const f1 = await subirFoto(sinMembresia.cabeceras);
    const r402 = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: ANUNCIO_COMPLETO([f1, f1, f1]), cabeceras: sinMembresia.cabeceras });
    ok(r402.codigo === 402 && !/cupo/i.test((r402.datos || {}).error || ''),
      `particular sin membresía, sin «cupo»: ${r402.codigo} «${r402.datos && r402.datos.error}»`);

    const conMembresia = cuentaCon({ correo: `conmembresia-${SELLO}@prueba.invalid` });
    db.comprarCupos({
      idOrg: conMembresia.org.id, idPlan: 'destacado', cupo: 1, dias: 30,
      cobro: { subtotal: 0, itbis: 0, total: 0, referencia: referencia('CUPO-LIBRE') },
    });
    const f2 = await subirFoto(conMembresia.cabeceras);
    const r201 = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: ANUNCIO_COMPLETO([f2, f2, f2]), cabeceras: conMembresia.cabeceras });
    ok(r201.codigo === 201, `particular con cupo libre publica igual que hoy: ${r201.codigo}`);
    const idPublicadoLibre = ((r201.datos || {}).anuncio || {}).id;

    const dealerSinMembresia = cuentaCon({ correo: `dealersin-${SELLO}@prueba.invalid`, tipo: 'dealer' });
    const f3 = await subirFoto(dealerSinMembresia.cabeceras);
    const rDealer402 = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: ANUNCIO_COMPLETO([f3, f3, f3]), cabeceras: dealerSinMembresia.cabeceras });
    ok(rDealer402.codigo === 402 && /cupo/i.test((rDealer402.datos || {}).error || ''),
      `dealer sin membresía sigue con el 402 de siempre: ${rDealer402.codigo} «${rDealer402.datos && rDealer402.datos.error}»`);

    // MOD-07: capacidadLibre al marcar vendido.
    const rVendido = await pedir({ metodo: 'PATCH', url: `/api/anuncios/${idPublicadoLibre}`, cuerpo: { estado: 'vendido' }, cabeceras: conMembresia.cabeceras });
    ok(rVendido.codigo === 200 && rVendido.datos.capacidadLibre === true,
      `vender libera el cupo: capacidadLibre=${rVendido.datos && rVendido.datos.capacidadLibre}`);

    // Sin ninguna membresía VIVA con hueco tras vender (la única que
    // tenía ya venció): capacidadLibre en falso, no en verdad por
    // descuido. Vender SIEMPRE libera el cupo de su propia membresía;
    // lo que aquí se prueba es que no hay OTRA membresía viva a la que
    // acudir.
    const soloUnCupo = cuentaCon({ correo: `uncupo-${SELLO}@prueba.invalid` });
    const membresiaUnica = db.comprarCupos({
      idOrg: soloUnCupo.org.id, idPlan: 'estandar', cupo: 1, dias: 30,
      cobro: { subtotal: 0, itbis: 0, total: 0, referencia: referencia('UN-CUPO') },
    });
    const f4 = await subirFoto(soloUnCupo.cabeceras);
    const rPub2 = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: ANUNCIO_COMPLETO([f4, f4, f4]), cabeceras: soloUnCupo.cabeceras });
    const idUnico = ((rPub2.datos || {}).anuncio || {}).id;
    ejecuta("UPDATE suscripciones SET estado = 'vencida' WHERE id = ?", membresiaUnica.id);
    const rVendido2 = await pedir({ metodo: 'PATCH', url: `/api/anuncios/${idUnico}`, cuerpo: { estado: 'vendido' }, cabeceras: soloUnCupo.cabeceras });
    ok(rVendido2.codigo === 200 && rVendido2.datos.capacidadLibre === false,
      `sin capacidad libre tras vender el único: capacidadLibre=${rVendido2.datos && rVendido2.datos.capacidadLibre}`);
  }

  /* ── 05.2-03: pedir el pago del borrador por la ruta ─────────
     Desde aquí el cobro va por `POST /api/borradores/:id/pago`, como
     lo hará el navegador. Cada borrador lleva un modelo con el sello de
     la pasada: así se encuentra su correo «ya está publicado» en la
     bandeja compartida sin confundirlo con el de otra ejecución. */
  const correosCon = (cadena) => {
    if (!fs.existsSync(correo.BANDEJA)) return [];
    return fs.readdirSync(correo.BANDEJA).filter((f) => f.endsWith('.txt'))
      .map((f) => fs.readFileSync(path.join(correo.BANDEJA, f), 'utf8'))
      .filter((t) => t.includes(cadena));
  };
  const publicados = (modelo) => correosCon(modelo).filter((t) => /ya está publicado/.test(t)).length;

  let contadorModelo = 0;
  async function borradorPorApi(cuenta, { plan = 'destacado', dias = 30, fotos = 3 } = {}) {
    const r = await pedir({ metodo: 'POST', url: '/api/borradores', cuerpo: { plan, dias }, cabeceras: cuenta.cabeceras });
    const id = ((r.datos || {}).borrador || {}).id;
    const modelo = `M${SELLO}${++contadorModelo}`.toUpperCase();
    const foto = fotos ? await subirFoto(cuenta.cabeceras) : null;
    const lista = [];
    for (let i = 0; i < fotos; i++) lista.push({ url: foto, miniatura: null });
    const g = await pedir({
      metodo: 'PUT', url: `/api/borradores/${id}`, cabeceras: cuenta.cabeceras,
      cuerpo: {
        categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt', modelo,
        anio: 2019, condicion: 'usado', usoValor: 1000, usoUnidad: 'km',
        descripcion: 'Borrador de prueba del pago.', provincia: 'santo-domingo',
        precio: 2500000, moneda: 'DOP', fotos: lista,
        telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }],
      },
    });
    if (r.codigo !== 201 || g.codigo !== 200) {
      console.log(`  (aviso) borradorPorApi: crear=${r.codigo} guardar=${g.codigo} ${JSON.stringify(g.datos)}`);
    }
    return { id, modelo };
  }
  const pedirPago = (id, cuenta, cuerpo = {}) =>
    pedir({ metodo: 'POST', url: `/api/borradores/${id}/pago`, cuerpo, cabeceras: cuenta.cabeceras });
  const errorDe = (r) => ((r && r.datos) || {}).error || '';
  const pendientesDelAnuncio = (idAnuncio) =>
    consulta("SELECT COUNT(*) AS n FROM pagos WHERE anuncio_id = ? AND estado = 'pendiente'", idAnuncio).n;
  const unitario = (idPlan) => {
    const p = db.planPorId(idPlan);
    return p.precio_vigente != null ? p.precio_vigente : p.precio;
  };

  console.log('\n9. Pedir el pago del borrador: el importe lo pone el servidor y solo el pago confirmado activa');
  {
    const pagador = cuentaCon({ correo: `pagador-${SELLO}@prueba.invalid` });

    const sinFotos = await borradorPorApi(pagador, { plan: 'destacado', fotos: 0 });
    const rSinFotos = await pedirPago(sinFotos.id, pagador);
    ok(rSinFotos.codigo === 400 && !!errorDe(rSinFotos) && pagosDelAnuncio(sinFotos.id) === 0,
      `incompleto (sin fotos): ${rSinFotos.codigo} «${errorDe(rSinFotos)}» pagos=${pagosDelAnuncio(sinFotos.id)}`);

    // Veinticinco fotos guardadas bajo Premium y el plan cambiado después a Estándar (8).
    const muchas = await borradorPorApi(pagador, { plan: 'premium', fotos: 25 });
    await pedir({ metodo: 'PUT', url: `/api/borradores/${muchas.id}`, cuerpo: { plan: 'estandar' }, cabeceras: pagador.cabeceras });
    const rMuchas = await pedirPago(muchas.id, pagador);
    ok(rMuchas.codigo === 409 && /admite 8 fotografías/.test(errorDe(rMuchas)) && pagosDelAnuncio(muchas.id) === 0,
      `más fotos que el plan: ${rMuchas.codigo} «${errorDe(rMuchas)}» pagos=${pagosDelAnuncio(muchas.id)}`);

    const retirado = await borradorPorApi(pagador, { plan: 'premium' });
    ejecuta("UPDATE planes SET activo = 0 WHERE id = 'premium'");
    let rRetirado = null;
    try {
      rRetirado = await pedirPago(retirado.id, pagador);
    } finally {
      ejecuta("UPDATE planes SET activo = 1 WHERE id = 'premium'");
    }
    ok(rRetirado.codigo === 409 && pagosDelAnuncio(retirado.id) === 0,
      `plan retirado: ${rRetirado.codigo} «${errorDe(rRetirado)}» pagos=${pagosDelAnuncio(retirado.id)}`);

    // Precio manipulado: nada de lo que manda el navegador cambia el cobro.
    const esperado = precios.precioCompra({ precioUnitario: unitario('destacado'), cupo: 1, dias: 30 });
    const bueno = await borradorPorApi(pagador, { plan: 'destacado', dias: 30 });
    const suscAntes = suscripcionesDe(pagador.org.id);
    const factAntes = facturasTotales();
    const b02 = siguienteB02();
    const correosAntes = publicados(bueno.modelo);
    const r = await pedirPago(bueno.id, pagador, {
      total: 1, subtotal: 1, precio: 1, base: 1, cupo: 5, plan: 'estandar', dias: 60,
    });
    const d = r.datos || {};
    ok(r.codigo === 201, `pagar con importes falsos en el cuerpo: ${r.codigo} «${errorDe(r)}»`);
    const pago = d.pago && d.pago.id ? db.pagoPorId(d.pago.id) : null;
    ok(!!pago && pago.total === esperado.total && pago.anuncio_id === bueno.id && pago.estado === 'aprobado',
      `el pago: ${pago ? `total=${pago.total} (se esperaba ${esperado.total}) anuncio=${pago.anuncio_id === bueno.id} ${pago.estado}` : 'NO hay'}`);
    let intencion = null;
    try { intencion = JSON.parse(pago.intencion); } catch (_) { /* queda null */ }
    ok(!!intencion && intencion.tipo === 'publicacion' && intencion.cupo === 1 && intencion.idPlan === 'destacado'
      && intencion.dias === 30 && intencion.idAnuncio === bueno.id,
    `intención: ${intencion ? `${intencion.tipo} plan=${intencion.idPlan} cupo=${intencion.cupo} días=${intencion.dias}` : 'ilegible'}`);
    ok(!!d.cobro && d.cobro.base === undefined && d.cobro.ajuste === undefined && d.cobro.total === esperado.total,
      `cobro sin base ni ajuste: ${JSON.stringify(d.cobro)}`);
    ok(!!d.anuncio && d.anuncio.estado === 'activo', `anuncio en la respuesta: ${d.anuncio && d.anuncio.estado}`);
    const s = pago && pago.suscripcion_id ? consulta('SELECT * FROM suscripciones WHERE id = ?', pago.suscripcion_id) : null;
    ok(suscripcionesDe(pagador.org.id) === suscAntes + 1 && !!s && s.plan_id === 'destacado'
      && s.anuncios_incluidos === 1 && s.dias_ciclo === 30,
    `suscripción nueva: ${s ? `${s.plan_id} cupo=${s.anuncios_incluidos} días=${s.dias_ciclo}` : 'NO hay'} (+${suscripcionesDe(pagador.org.id) - suscAntes})`);
    const f = pago ? consulta("SELECT * FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", pago.id) : null;
    ok(!!f && /^B02/.test(f.ncf || '') && f.subtotal + f.itbis === f.total && f.total === pago.total
      && facturasTotales() === factAntes + 1 && siguienteB02() === b02 + 1,
    `factura: ${f ? `${f.ncf} ${f.subtotal}+${f.itbis}=${f.total}` : 'NO hay'} B02 +${siguienteB02() - b02}`);
    ok(!!d.comprobante && /^B02/.test(d.comprobante.ncf || ''), `comprobante en la respuesta: ${JSON.stringify(d.comprobante)}`);
    ok(publicados(bueno.modelo) === correosAntes + 1,
      `correo «ya está publicado»: ${publicados(bueno.modelo) - correosAntes} (se esperaba 1)`);

    // Doble aviso: la confirmación repetida no otorga, no emite y no escribe otra vez.
    let rep = null;
    const eRep = lanza(() => { rep = pagos.confirmarPago(pago.id); });
    ok(!eRep && !!rep && rep.yaEstaba === true && suscripcionesDe(pagador.org.id) === suscAntes + 1
      && facturasTotales() === factAntes + 1 && publicados(bueno.modelo) === correosAntes + 1,
    eRep ? `repetir lanzó: ${eRep.message}` : `doble aviso: yaEstaba=${rep && rep.yaEstaba} susc=+${suscripcionesDe(pagador.org.id) - suscAntes} facturas=+${facturasTotales() - factAntes} correos=${publicados(bueno.modelo) - correosAntes}`);
  }

  console.log('\n10. Pendiente, rechazado, importe cero, ajeno y no borrador');
  {
    const cliente = cuentaCon({ correo: `pendiente-${SELLO}@prueba.invalid` });
    const demoOriginal = pagos.PROCESADORES.demo;

    // Pendiente: el anuncio espera como borrador y pedir otra vez devuelve el MISMO pago.
    const bp = await borradorPorApi(cliente, { plan: 'destacado' });
    let r1 = null;
    let r2 = null;
    pagos.PROCESADORES.demo = async () => ({ resultado: 'pendiente' });
    try {
      r1 = await pedirPago(bp.id, cliente);
      r2 = await pedirPago(bp.id, cliente);
    } finally {
      pagos.PROCESADORES.demo = demoOriginal;
    }
    const p1 = ((r1.datos || {}).pago) || {};
    ok(r1.codigo === 202 && p1.estado === 'pendiente' && filaAnuncio(bp.id).estado === 'borrador',
      `pendiente: ${r1.codigo} pago=${p1.estado} anuncio=${filaAnuncio(bp.id).estado}`);
    const mis = await pedir({ url: '/api/mis-anuncios', cabeceras: cliente.cabeceras });
    const enPanel = ((mis.datos || {}).anuncios || []).find((x) => x.id === bp.id);
    ok(!!enPanel && enPanel.pendiente_pago === true, `mis-anuncios pendiente_pago=${enPanel && enPanel.pendiente_pago}`);
    ok(r2.codigo === 202 && ((r2.datos || {}).pago || {}).id === p1.id && pendientesDelAnuncio(bp.id) === 1,
      `pedir otra vez: ${r2.codigo} mismo pago=${((r2.datos || {}).pago || {}).id === p1.id} pendientes=${pendientesDelAnuncio(bp.id)}`);
    const putPendiente = await pedir({ metodo: 'PUT', url: `/api/borradores/${bp.id}`, cuerpo: { modelo: 'OTRO' }, cabeceras: cliente.cabeceras });
    ok(putPendiente.codigo === 409, `guardar con el pago en espera: ${putPendiente.codigo}`);
    const eConf = lanza(() => pagos.confirmarPago(p1.id));
    ok(!eConf && filaAnuncio(bp.id).estado === 'activo' && publicados(bp.modelo) === 1,
      eConf ? `confirmar lanzó: ${eConf.message}` : `al confirmarse: ${filaAnuncio(bp.id).estado} correos=${publicados(bp.modelo)}`);

    // Rechazado: nada otorgado, nada emitido, y se puede volver a pedir.
    const br = await borradorPorApi(cliente, { plan: 'destacado' });
    const b02 = siguienteB02();
    const fact = facturasTotales();
    let rr = null;
    pagos.PROCESADORES.demo = async () => ({ resultado: 'rechazado', motivo: 'Fondos insuficientes' });
    try {
      rr = await pedirPago(br.id, cliente);
    } finally {
      pagos.PROCESADORES.demo = demoOriginal;
    }
    const aR = filaAnuncio(br.id);
    ok(rr.codigo === 402 && /sigue guardado como borrador/.test(errorDe(rr)),
      `rechazado: ${rr.codigo} «${errorDe(rr)}»`);
    ok(aR.estado === 'borrador' && aR.suscripcion_id === null && siguienteB02() === b02 && facturasTotales() === fact,
      `tras el rechazo: ${aR.estado} susc=${aR.suscripcion_id} B02 +${siguienteB02() - b02} facturas +${facturasTotales() - fact}`);
    const rOtra = await pedirPago(br.id, cliente);
    ok(rOtra.codigo === 201 && filaAnuncio(br.id).estado === 'activo',
      `pedir otra vez tras el rechazo: ${rOtra.codigo} anuncio=${filaAnuncio(br.id).estado}`);

    /* Importe cero: la promoción del Estándar se fija aquí con un fin
       lejano para que la prueba no dependa del día en que corre (la de
       verdad termina el 2026-11-30). */
    ejecuta("UPDATE planes SET precio_promocional = 0, promo_hasta = '2099-12-31' WHERE id = 'estandar'");
    const bc = await borradorPorApi(cliente, { plan: 'estandar' });
    const factCero = facturasTotales();
    const rc = await pedirPago(bc.id, cliente);
    const pc = consulta('SELECT * FROM pagos WHERE anuncio_id = ?', bc.id);
    ok(rc.codigo === 201 && (rc.datos || {}).comprobante === null,
      `importe cero: ${rc.codigo} comprobante=${JSON.stringify((rc.datos || {}).comprobante)} «${errorDe(rc)}»`);
    ok(!!pc && pc.estado === 'aprobado' && pc.total === 0 && pc.procesador === 'sin-costo'
      && filaAnuncio(bc.id).estado === 'activo' && facturasTotales() === factCero,
    `pago cero: ${pc ? `${pc.estado} total=${pc.total} ${pc.procesador}` : 'NO hay'} anuncio=${filaAnuncio(bc.id).estado} facturas +${facturasTotales() - factCero}`);
    ok(publicados(bc.modelo) === 1, `correo «ya está publicado» del importe cero: ${publicados(bc.modelo)}`);

    // Ajeno, ya publicado y sin aceptar la contratación.
    const otro = cuentaCon({ correo: `ajeno-pago-${SELLO}@prueba.invalid` });
    const bAjeno = await borradorPorApi(cliente, { plan: 'destacado' });
    const rAjeno = await pedirPago(bAjeno.id, otro);
    ok(rAjeno.codigo === 404 && pagosDelAnuncio(bAjeno.id) === 0 && filaAnuncio(bAjeno.id).estado === 'borrador',
      `borrador ajeno: ${rAjeno.codigo} pagos=${pagosDelAnuncio(bAjeno.id)}`);
    const rActivo = await pedirPago(br.id, cliente);
    ok(rActivo.codigo === 404, `sobre un anuncio ya activo: ${rActivo.codigo}`);

    const sinContratacion = cuentaCon({ correo: `sincontrato-${SELLO}@prueba.invalid`, sinLegales: true });
    for (const idDoc of legales.PARA_PUBLICAR) {
      const doc = legales.documento(idDoc);
      db.registrarAceptacion({
        usuarioId: sinContratacion.idUsuario, documento: doc.id, version: doc.version, ip: '127.0.0.1', userAgent: 'prueba',
      });
    }
    const bSin = await borradorPorApi(sinContratacion, { plan: 'destacado' });
    const rSin = await pedirPago(bSin.id, sinContratacion);
    const faltan = (rSin.datos || {}).faltan || [];
    ok(rSin.codigo === 409 && faltan.includes('contratacion') && pagosDelAnuncio(bSin.id) === 0,
      `sin aceptar la contratación: ${rSin.codigo} faltan=${JSON.stringify(faltan)}`);
  }

  /* La transferencia, con los mismos datos falsos que
     probar-transferencia.js (se leen en cada llamada, así que basta con
     fijar el entorno), y la administradora que marca el ingreso. La IP
     llega por CF-Connecting-IP, la fiable detrás de Cloudflare. */
  const PRUEBA_TRANSFERENCIA = {
    MERCA_TRANSFERENCIA_BANCO: '  BANCO DE PRUEBA ',
    MERCA_TRANSFERENCIA_TITULAR: ' TITULAR DE PRUEBA, S.R.L. ',
    MERCA_TRANSFERENCIA_RNC: ' 000000000 ',
    MERCA_TRANSFERENCIA_TIPO: ' corriente ',
    MERCA_TRANSFERENCIA_CUENTA: ' 000-000000-0 ',
  };
  const encender = () => {
    delete process.env.MERCA_TRANSFERENCIA;
    Object.assign(process.env, PRUEBA_TRANSFERENCIA);
  };
  const apagar = () => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('MERCA_TRANSFERENCIA')) delete process.env[k];
    }
  };
  const correoAdmin = `admin-publicacion-${SELLO}@prueba.invalid`;
  const { idUsuario: idAdmin } = db.crearCuenta({
    correo: correoAdmin, clave: 'UnaClaveLargaYSegura9',
    nombre: 'Administradora de Prueba', telefono: '8095550000', tipo: 'particular',
  });
  db.marcarAdmin(correoAdmin, true);
  const comoAdmin = { cookie: `te_sesion=${db.abrirSesion(idAdmin)}`, 'cf-connecting-ip': '190.1.2.3' };
  const recibido = (idPago, cuerpo = {}) =>
    pedir({ metodo: 'POST', url: `/api/admin/pagos/${idPago}/recibido`, cuerpo, cabeceras: comoAdmin });
  const anular = (idPago, cuerpo = {}) =>
    pedir({ metodo: 'POST', url: `/api/admin/pagos/${idPago}/anular`, cuerpo, cabeceras: comoAdmin });
  const filasBitacora = (accion) =>
    consulta('SELECT COUNT(*) AS n FROM bitacora_admin WHERE accion = ?', accion).n;
  const todasLasFilas = () => consulta('SELECT COUNT(*) AS n FROM bitacora_admin').n;

  console.log('\n11. Transferencia: la consola publica el anuncio por la misma transición, con bitácora');
  encender();
  try {
    const cliente = cuentaCon({ correo: `transfiere-${SELLO}@prueba.invalid` });

    const bt = await borradorPorApi(cliente, { plan: 'destacado' });
    const rt = await pedirPago(bt.id, cliente);
    const dt = rt.datos || {};
    ok(rt.codigo === 202 && !!dt.transferencia && !!dt.transferencia.cuenta && !!dt.pago && dt.pago.estado === 'pendiente'
      && filaAnuncio(bt.id).estado === 'borrador',
    `pedir por transferencia: ${rt.codigo} cuenta=${dt.transferencia && dt.transferencia.cuenta} pago=${dt.pago && dt.pago.estado} anuncio=${filaAnuncio(bt.id).estado}`);
    const idPago = dt.pago && dt.pago.id;

    const suscAntes = suscripcionesDe(cliente.org.id);
    const factAntes = facturasTotales();
    const filasAntes = filasBitacora('pago.transferencia_recibida');
    const rr = await recibido(idPago);
    const aT = filaAnuncio(bt.id);
    const pT = db.pagoPorId(idPago);
    const sT = pT && pT.suscripcion_id ? consulta('SELECT * FROM suscripciones WHERE id = ?', pT.suscripcion_id) : null;
    ok(rr.codigo === 200 && aT.estado === 'activo' && !!sT && sT.anuncios_incluidos === 1 && aT.suscripcion_id === sT.id
      && suscripcionesDe(cliente.org.id) === suscAntes + 1,
    `marcar recibido: ${rr.codigo} «${errorDe(rr)}» anuncio=${aT.estado} cupo=${sT && sT.anuncios_incluidos}`);
    const fT = consulta("SELECT * FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'", idPago);
    ok(!!fT && /^B02/.test(fT.ncf || '') && fT.subtotal + fT.itbis === fT.total && fT.total === pT.total
      && facturasTotales() === factAntes + 1,
    `factura de la transferencia: ${fT ? `${fT.ncf} ${fT.subtotal}+${fT.itbis}=${fT.total}` : 'NO hay'}`);
    ok(filasBitacora('pago.transferencia_recibida') === filasAntes + 1,
      `bitácora: +${filasBitacora('pago.transferencia_recibida') - filasAntes} (se esperaba 1)`);
    ok(publicados(bt.modelo) === 1, `correo «ya está publicado» tras la consola: ${publicados(bt.modelo)}`);

    const rr2 = await recibido(idPago);
    ok(rr2.codigo === 200 && (rr2.datos || {}).yaEstaba === true && suscripcionesDe(cliente.org.id) === suscAntes + 1
      && facturasTotales() === factAntes + 1 && publicados(bt.modelo) === 1,
    `marcar otra vez: ${rr2.codigo} yaEstaba=${(rr2.datos || {}).yaEstaba} susc=+${suscripcionesDe(cliente.org.id) - suscAntes} facturas=+${facturasTotales() - factAntes}`);

    // Huérfana: el anuncio dejó de ser borrador mientras la transferencia esperaba.
    const bh = await borradorPorApi(cliente, { plan: 'destacado' });
    const rh = await pedirPago(bh.id, cliente);
    const idPagoH = ((rh.datos || {}).pago || {}).id;
    ejecuta("UPDATE anuncios SET estado = 'retirado' WHERE id = ?", bh.id);
    const suscH = suscripcionesDe(cliente.org.id);
    const filasH = todasLasFilas();
    const rhr = await recibido(idPagoH);
    ok(rhr.codigo === 409 && /Anule el pago/.test(errorDe(rhr)) && db.pagoPorId(idPagoH).estado === 'pendiente'
      && suscripcionesDe(cliente.org.id) === suscH && todasLasFilas() === filasH,
    `huérfana: ${rhr.codigo} «${errorDe(rhr)}» pago=${db.pagoPorId(idPagoH).estado} susc=+${suscripcionesDe(cliente.org.id) - suscH} filas=+${todasLasFilas() - filasH}`);
    const ra = await anular(idPagoH, { motivo: 'El anuncio ya no estaba en borrador' });
    ok(ra.codigo === 200 && db.pagoPorId(idPagoH).estado === 'rechazado' && filaAnuncio(bh.id).estado === 'retirado',
      `anular la huérfana: ${ra.codigo} pago=${db.pagoPorId(idPagoH).estado} anuncio=${filaAnuncio(bh.id).estado}`);

    // Huérfana por borrado: el borrador ya no existe.
    const bb = await borradorPorApi(cliente, { plan: 'destacado' });
    const rb = await pedirPago(bb.id, cliente);
    const idPagoB = ((rb.datos || {}).pago || {}).id;
    ejecuta('DELETE FROM anuncios WHERE id = ?', bb.id);
    const suscB = suscripcionesDe(cliente.org.id);
    const filasB = todasLasFilas();
    const rbr = await recibido(idPagoB);
    ok(rbr.codigo === 409 && /Anule el pago/.test(errorDe(rbr)) && db.pagoPorId(idPagoB).estado === 'pendiente'
      && suscripcionesDe(cliente.org.id) === suscB && todasLasFilas() === filasB,
    `borrador borrado: ${rbr.codigo} «${errorDe(rbr)}» pago=${db.pagoPorId(idPagoB).estado}`);
  } finally {
    apagar();
  }

  console.log('\n12. Seguridad y ciclo del particular: un pago sostiene un anuncio');
  {
    const p = cuentaCon({ correo: `ciclo-${SELLO}@prueba.invalid` });
    const A = await borradorPorApi(p, { plan: 'destacado' });
    const rA = await pedirPago(A.id, p);
    const idPagoA = ((rA.datos || {}).pago || {}).id;
    const susA = filaAnuncio(A.id).suscripcion_id;
    ok(rA.codigo === 201 && filaAnuncio(A.id).estado === 'activo' && !!susA,
      `publicar A pagando: ${rA.codigo} ${filaAnuncio(A.id).estado}`);

    const foto = await subirFoto(p.cabeceras);
    const otroEquipo = (modelo, extra = {}) => ({
      categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt', modelo,
      anio: 2020, condicion: 'usado', usoValor: 500, usoUnidad: 'km',
      descripcion: 'Otro equipo del mismo particular.', provincia: 'santo-domingo',
      precio: 1500000, moneda: 'DOP', fotos: [foto, foto, foto],
      telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }], ...extra,
    });
    const anunciosDe = () => consulta('SELECT COUNT(*) AS n FROM anuncios WHERE organizacion_id = ?', p.org.id).n;

    // Dos anuncios con un pago: la suscripción de A es de un cupo y está ocupada.
    const antes = anunciosDe();
    const rDos = await pedir({
      metodo: 'POST', url: '/api/anuncios', cuerpo: otroEquipo(`B${SELLO}`, { membresia: susA }), cabeceras: p.cabeceras,
    });
    ok(rDos.codigo === 409 && anunciosDe() === antes, `segundo anuncio en la suscripción de A: ${rDos.codigo} anuncios=+${anunciosDe() - antes}`);
    const rOtraVez = await pedirPago(A.id, p);
    ok(rOtraVez.codigo === 404, `pedir el pago de A ya publicado: ${rOtraVez.codigo}`);
    const rep = pagos.confirmarPago(idPagoA);
    ok(rep.yaEstaba === true, `el pago de A confirmado otra vez: yaEstaba=${rep.yaEstaba}`);

    // Editar tras publicar.
    const rDisp = await pedir({
      metodo: 'PATCH', url: `/api/anuncios/${A.id}/disponibilidad`, cuerpo: { disponibilidad: 'bajo-pedido' }, cabeceras: p.cabeceras,
    });
    ok(rDisp.codigo === 200 && filaAnuncio(A.id).disponibilidad === 'bajo-pedido',
      `editar la disponibilidad: ${rDisp.codigo} ${filaAnuncio(A.id).disponibilidad}`);

    // Marcar vendido libera la capacidad.
    const rV = await pedir({ metodo: 'PATCH', url: `/api/anuncios/${A.id}`, cuerpo: { estado: 'vendido' }, cabeceras: p.cabeceras });
    ok(rV.codigo === 200 && (rV.datos || {}).capacidadLibre === true,
      `marcar vendido: ${rV.codigo} capacidadLibre=${(rV.datos || {}).capacidadLibre}`);

    // Historial: sigue en su panel, vendido, con su foto y su plan.
    const mis = await pedir({ url: '/api/mis-anuncios', cabeceras: p.cabeceras });
    const enPanel = ((mis.datos || {}).anuncios || []).find((x) => x.id === A.id);
    ok(!!enPanel && enPanel.estado === 'vendido' && !!enPanel.foto && enPanel.plan_elegido === 'destacado',
      `historial: ${enPanel ? `${enPanel.estado} foto=${!!enPanel.foto} plan=${enPanel.plan_elegido}` : 'NO aparece'}`);

    // Publicar otro en la capacidad que dejó A, y ni uno más.
    const rOtro = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: otroEquipo(`C${SELLO}`), cabeceras: p.cabeceras });
    const idOtro = ((rOtro.datos || {}).anuncio || {}).id;
    ok(rOtro.codigo === 201 && !!idOtro && filaAnuncio(idOtro).suscripcion_id === susA,
      `publicar otro con la capacidad liberada: ${rOtro.codigo} «${errorDe(rOtro)}» misma suscripción=${!!idOtro && filaAnuncio(idOtro).suscripcion_id === susA}`);
    const antesTercero = anunciosDe();
    const rTercero = await pedir({ metodo: 'POST', url: '/api/anuncios', cuerpo: otroEquipo(`D${SELLO}`), cabeceras: p.cabeceras });
    ok((rTercero.codigo === 402 || rTercero.codigo === 409) && anunciosDe() === antesTercero,
      `un tercero en una suscripción de un cupo: ${rTercero.codigo} anuncios=+${anunciosDe() - antesTercero}`);

    // Reutilización simultánea: reactivar el vendido con la capacidad ocupada (PR #33).
    const rReact = await pedir({ metodo: 'PATCH', url: `/api/anuncios/${A.id}`, cuerpo: { estado: 'activo' }, cabeceras: p.cabeceras });
    ok(rReact.codigo === 409 && filaAnuncio(A.id).estado === 'vendido',
      `reactivar el vendido sin capacidad: ${rReact.codigo} A=${filaAnuncio(A.id).estado}`);
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exitCode = fallos ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
