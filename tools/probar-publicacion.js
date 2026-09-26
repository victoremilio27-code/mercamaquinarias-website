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

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exitCode = fallos ? 1 : 0;
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
