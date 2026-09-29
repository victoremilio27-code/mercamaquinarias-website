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
   el resultado: la transferencia se apaga del todo, y CardNet también
   (la sección 5 enciende MERCA_CARDNET solo donde lo necesita). */
for (const k of Object.keys(process.env)) {
  if (k.startsWith('MERCA_TRANSFERENCIA') || k.startsWith('MERCA_CARDNET')) delete process.env[k];
}

const db = require('./db');
const pagos = require('./pagos');
const precios = require('../assets/precios.js');
const api = require('./api');
const legales = require('../assets/legales.js');
const correo = require('./correo');
const { EventEmitter } = require('events');

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

/* ── Para las secciones 4 y 5: la API de verdad ─────────────
   Una petición contra el enrutador con req y res fingidos, copiada de
   probar-publicacion.js: lo que importa es lo que ve quien llama, no lo
   que devuelven las funciones de dentro. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-renovacion', ...cabeceras };
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
   las condiciones aceptadas: la comprobación de legales no debe
   estorbar la prueba de otra cosa. */
function cuentaConSesion(etiqueta, { sinLegales = false } = {}) {
  const c = cuenta(etiqueta);
  if (!sinLegales) {
    Object.values(legales.DOCUMENTOS || {}).forEach((doc) => {
      db.registrarAceptacion({
        usuarioId: c.idUsuario, documento: doc.id, version: doc.version, ip: '127.0.0.1', userAgent: 'prueba',
      });
    });
  }
  return { ...c, cabeceras: { cookie: `te_sesion=${db.abrirSesion(c.idUsuario)}`, 'cf-connecting-ip': '201.8.8.8' } };
}

const errorDe = (r) => ((r && r.datos) || {}).error || '';
const pagosDeSusc = (idSusc) => consulta('SELECT COUNT(*) AS n FROM pagos WHERE suscripcion_id = ?', idSusc).n;
const unitario = (idPlan) => {
  const p = db.planPorId(idPlan);
  return p.precio_vigente != null ? p.precio_vigente : p.precio;
};
const masDias = (iso, dias) => { const d = new Date(iso); d.setDate(d.getDate() + dias); return d.toISOString(); };
const renovarAnuncioApi = (idAnuncio, quien, cuerpo = {}) =>
  pedir({ metodo: 'POST', url: `/api/anuncios/${idAnuncio}/renovar`, cuerpo, cabeceras: quien.cabeceras });
const renovarMembresiaApi = (idSusc, quien, cuerpo = {}) =>
  pedir({ metodo: 'POST', url: `/api/membresias/${idSusc}/renovar`, cuerpo, cabeceras: quien.cabeceras });

/* La bandeja del transporte de archivo es compartida entre pruebas y
   pasadas: el aviso a facturación se busca por la referencia del cobro,
   que es única. */
const avisosDe = (referencia) => {
  if (!referencia || !fs.existsSync(correo.BANDEJA)) return 0;
  return fs.readdirSync(correo.BANDEJA).filter((f) => f.endsWith('.txt'))
    .map((f) => fs.readFileSync(path.join(correo.BANDEJA, f), 'utf8'))
    .filter((t) => t.includes(`Transferencia en espera ${referencia}`)).length;
};
const respiro = () => new Promise((r) => setTimeout(r, 30));

/* La sección 21 del modelo comercial, copiada aquí a propósito y no
   leída de api.js: si alguien cambia el texto del servidor, la prueba
   tiene que enterarse. */
const TEXTO_ESPERADO = 'Al activar esta opción, autorizas la renovación de este anuncio al finalizar su '
  + 'período con el método de pago autorizado, según las condiciones y el precio vigente de renovación.';

/* La transferencia, con los datos falsos de probar-transferencia.js (se
   leen en cada llamada, así que basta con fijar el entorno). */
const PRUEBA_TRANSFERENCIA = {
  MERCA_TRANSFERENCIA_BANCO: 'BANCO DE PRUEBA',
  MERCA_TRANSFERENCIA_TITULAR: 'TITULAR DE PRUEBA, S.R.L.',
  MERCA_TRANSFERENCIA_RNC: '000000000',
  MERCA_TRANSFERENCIA_TIPO: 'corriente',
  MERCA_TRANSFERENCIA_CUENTA: '000-000000-0',
};
const encenderTransferencia = () => {
  delete process.env.MERCA_TRANSFERENCIA;
  Object.assign(process.env, PRUEBA_TRANSFERENCIA);
};
const apagarTransferencia = () => {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('MERCA_TRANSFERENCIA')) delete process.env[k];
  }
};

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
    // Una intención rota (hay pagos viejos así) no tumba el panel ni la
    // lista: json_extract lanza ante JSON roto si no va json_valid delante.
    ejecuta(`INSERT INTO pagos (id, organizacion_id, suscripcion_id, subtotal, itbis, total, estado, creado, intencion)
             VALUES (?, ?, ?, 100, 18, 118, 'pendiente', ?, '{roto')`, nuevoId('pago-roto'), L.idOrg, idViva, new Date().toISOString());
    const eRoto = lanza(() => { db.anunciosDeOrganizacion(L.idOrg); db.suscripcionesRenovablesDe(L.idOrg); });
    ok(!eRoto, `intención rota: ${eRoto ? `lanzó ${eRoto.message}` : 'el panel y la lista siguen'}`);
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

  console.log('\n3 · registro de recordatorios');
  {
    const Q = cuenta('recuerda');
    const idSusc = nuevaSuscripcion({ idOrg: Q.idOrg, plan: 'estandar', cupo: 10, fin: enDias(30) });
    const a7 = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'activo', vence: enDias(6.5) });
    const a3 = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'activo', vence: enDias(2.5) });
    const a1 = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'activo', vence: enDias(20 / 24) });
    const a9 = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'activo', vence: enDias(9) });
    const aVendido = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'vendido', vence: enDias(2.5) });
    const aPausado = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'pausado', vence: enDias(2.5) });
    const aVencido = nuevoAnuncio({ idOrg: Q.idOrg, idSusc, estado: 'vencido', vence: enDias(-1) });
    const deEsta = [a7, a3, a1, a9, aVendido, aPausado, aVencido];

    const pendientes = () => db.recordatoriosPendientes().filter((x) => deEsta.includes(x.id));
    const lista = pendientes();
    const tipoDe = (idA) => (lista.find((x) => x.id === idA) || {}).tipo || null;
    ok(tipoDe(a7) === '7d', `a 6,5 días → ${tipoDe(a7)}`);
    ok(tipoDe(a3) === '3d', `a 2,5 días → ${tipoDe(a3)}`);
    ok(tipoDe(a1) === '1d', `a 20 horas → ${tipoDe(a1)}`);
    ok(tipoDe(a9) === null, `a 9 días → ${tipoDe(a9) || 'no sale'}`);
    ok(![aVendido, aPausado, aVencido].some((x) => tipoDe(x)),
      `vendido, pausado y vencido no salen (${[aVendido, aPausado, aVencido].map(tipoDe).join(', ')})`);
    const fila7 = lista.find((x) => x.id === a7);
    ok(!!fila7 && fila7.correo === Q.correo && fila7.vence === filaAnuncio(a7).vence && fila7.plan_nombre === 'Estándar'
      && fila7.marca_nombre === 'Peterbilt',
    `destinatario y datos: ${fila7 ? `${fila7.correo === Q.correo ? 'el propietario' : fila7.correo} plan=${fila7.plan_nombre} marca=${fila7.marca_nombre}` : 'NO sale'}`);

    // Reservar dos veces: la segunda no.
    const vence3 = filaAnuncio(a3).vence;
    const r1 = db.reservarRecordatorio({ idAnuncio: a3, tipo: '3d', vence: vence3 });
    const r2 = db.reservarRecordatorio({ idAnuncio: a3, tipo: '3d', vence: vence3 });
    ok(typeof r1 === 'string' && r2 === null, `reservar dos veces: ${r1 ? 'id' : r1}, luego ${r2}`);
    const fila = consulta('SELECT * FROM recordatorios WHERE id = ?', r1);
    ok(!!fila && fila.resultado === 'enviando' && !!fila.enviado, `reservado: ${fila && fila.resultado}`);
    ok(!pendientes().some((x) => x.id === a3), 'reservado: deja de salir en pendientes');

    // Un envío fallido se puede reservar otra vez, y solo una.
    db.anotarRecordatorio(r1, 'fallido');
    ok(pendientes().some((x) => x.id === a3), 'fallido: vuelve a salir en pendientes');
    const r3 = db.reservarRecordatorio({ idAnuncio: a3, tipo: '3d', vence: vence3 });
    const r4 = db.reservarRecordatorio({ idAnuncio: a3, tipo: '3d', vence: vence3 });
    ok(r3 === r1 && r4 === null, `tras fallido: reserva ${r3 === r1 ? 'la misma fila' : r3}, la siguiente ${r4}`);
    db.anotarRecordatorio(r3, 'enviado');
    ok(consulta('SELECT resultado FROM recordatorios WHERE id = ?', r3).resultado === 'enviado', 'anotado como enviado');
    ok(consulta('SELECT COUNT(*) AS n FROM recordatorios WHERE anuncio_id = ?', a3).n === 1, 'una sola fila para ese ciclo');

    // Renovar cambia `vence`: el mismo tipo vuelve a salir para el ciclo nuevo.
    const venceNuevo = enDias(2.2);
    ejecuta('UPDATE anuncios SET vence = ? WHERE id = ?', venceNuevo, a3);
    const nuevo = pendientes().find((x) => x.id === a3);
    ok(!!nuevo && nuevo.tipo === '3d' && nuevo.vence === venceNuevo, `ciclo nuevo: ${nuevo ? nuevo.tipo : 'NO sale'}`);
    const r5 = db.reservarRecordatorio({ idAnuncio: a3, tipo: '3d', vence: venceNuevo });
    ok(typeof r5 === 'string' && r5 !== r1, 'ciclo nuevo: reserva una fila nueva');
    ok(consulta('SELECT COUNT(*) AS n FROM recordatorios WHERE anuncio_id = ?', a3).n === 2, 'la fila del ciclo viejo se queda');

    // Si el anuncio cambió entre listar y reservar, no se reserva.
    const vence1 = filaAnuncio(a1).vence;
    ok(db.reservarRecordatorio({ idAnuncio: a1, tipo: '1d', vence: enDias(40) }) === null, 'vence que no es el del ciclo → null');
    ejecuta("UPDATE anuncios SET estado = 'pausado' WHERE id = ?", a1);
    ok(db.reservarRecordatorio({ idAnuncio: a1, tipo: '1d', vence: vence1 }) === null, 'anuncio que dejó de estar activo → null');
    ok(consulta('SELECT COUNT(*) AS n FROM recordatorios WHERE anuncio_id = ?', a1).n === 0, 'y no deja fila');
  }

  console.log('\n4 · renovar por la API');
  {
    /* Las promociones se fijan aquí para que la prueba no dependa del
       día en que corre (la del Estándar de verdad termina el 2026-11-30):
       Destacado a precio lleno y Estándar a cero. */
    ejecuta("UPDATE planes SET precio_promocional = NULL, promo_hasta = NULL WHERE id = 'destacado'");
    ejecuta("UPDATE planes SET precio_promocional = 0, promo_hasta = '2099-12-31' WHERE id = 'estandar'");
    const demoOriginal = pagos.PROCESADORES.demo;
    const dueno = cuentaConSesion('renueva-api');

    // Un anuncio activo de un Destacado de un cupo, con el cuerpo manipulado.
    const finA = enDias(10);
    const sA = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'destacado', cupo: 1, fin: finA, precio: 3200 });
    const aA = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sA, vence: finA, fotos: 2 });
    const esperado = precios.precioRenovacion({ precioUnitario: unitario('destacado'), cupo: 1, dias: 30 });
    const b02 = siguienteB02();
    const fact = facturasTotales();
    const rA = await renovarAnuncioApi(aA, dueno, {
      total: 1, subtotal: 1, precio: 1, base: 1, cupo: 5, dias: 7, plan: 'estandar',
    });
    const dA = rA.datos || {};
    ok(rA.codigo === 201, `renovar un anuncio de un cupo: ${rA.codigo} «${errorDe(rA)}»`);
    const pA = dA.pago && dA.pago.id ? db.pagoPorId(dA.pago.id) : null;
    ok(!!pA && pA.total === esperado.total && pA.estado === 'aprobado' && pA.suscripcion_id === sA && pA.anuncio_id === aA,
      `el pago: ${pA ? `total=${pA.total} (se esperaba ${esperado.total}) ${pA.estado} susc=${pA.suscripcion_id === sA} anuncio=${pA.anuncio_id === aA}` : 'NO hay'}`);
    let iA = null;
    try { iA = JSON.parse(pA.intencion); } catch (_) { /* queda null */ }
    ok(!!iA && iA.tipo === 'renovacion' && iA.idSusc === sA && iA.idAnuncio === aA && iA.cupo === 1 && iA.dias === 30,
      `intención: ${iA ? `${iA.tipo} cupo=${iA.cupo} días=${iA.dias}` : 'ilegible'}`);
    ok(!!dA.cobro && dA.cobro.base === undefined && dA.cobro.ajuste === undefined && dA.cobro.total === esperado.total,
      `cobro sin base ni ajuste: ${JSON.stringify(dA.cobro)}`);
    const fA = pA ? facturaDe(pA.id) : null;
    ok(!!fA && /^B02/.test(fA.ncf || '') && fA.subtotal + fA.itbis === fA.total && fA.total === pA.total
      && facturasTotales() === fact + 1 && siguienteB02() === b02 + 1,
    `comprobante: ${fA ? `${fA.ncf} ${fA.subtotal}+${fA.itbis}=${fA.total}` : 'NO hay'}`);
    ok(!!dA.comprobante && /^B02/.test(dA.comprobante.ncf || ''), `comprobante en la respuesta: ${JSON.stringify(dA.comprobante)}`);
    ok(filaSusc(sA).fin === masDias(finA, 30), `fin = anterior + 30: ${filaSusc(sA).fin}`);
    ok(!!dA.anuncio && dA.anuncio.id === aA && filaAnuncio(aA).estado === 'activo' && fotosDe(aA) === 2,
      `mismo anuncio con sus fotos: ${dA.anuncio && dA.anuncio.id === aA} fotos=${fotosDe(aA)}`);

    // Vencido: vuelve el MISMO anuncio y no nace otro.
    const sV = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'destacado', cupo: 1, fin: enDias(-2), estado: 'vencida' });
    const aV = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sV, estado: 'vencido', vence: enDias(-2) });
    const nAntes = anunciosDeOrg(dueno.idOrg);
    const rV = await renovarAnuncioApi(aV, dueno);
    const svF = filaSusc(sV);
    ok(rV.codigo === 201 && filaAnuncio(aV).estado === 'activo' && anunciosDeOrg(dueno.idOrg) === nAntes,
      `renovar un vencido: ${rV.codigo} «${errorDe(rV)}» anuncio=${filaAnuncio(aV).estado} anuncios +${anunciosDeOrg(dueno.idOrg) - nAntes}`);
    ok(svF.estado === 'activa' && Math.abs(new Date(svF.fin).getTime() - (Date.now() + 30 * DIA)) < 2 * 3600000,
      `suscripción vencida → ${svF.estado}, fin ≈ ahora + 30`);

    // Importe cero: la promoción del Estándar.
    const finC = enDias(5);
    const sC = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'estandar', cupo: 1, fin: finC });
    const aC = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sC, vence: finC });
    const factC = facturasTotales();
    const rC = await renovarAnuncioApi(aC, dueno);
    const pC = consulta('SELECT * FROM pagos WHERE suscripcion_id = ?', sC);
    ok(rC.codigo === 201 && (rC.datos || {}).comprobante === null,
      `importe cero: ${rC.codigo} comprobante=${JSON.stringify((rC.datos || {}).comprobante)} «${errorDe(rC)}»`);
    ok(!!pC && pC.estado === 'aprobado' && pC.total === 0 && pC.procesador === 'sin-costo'
      && facturasTotales() === factC && filaSusc(sC).fin === masDias(finC, 30),
    `pago cero: ${pC ? `${pC.estado} total=${pC.total} ${pC.procesador}` : 'NO hay'} facturas +${facturasTotales() - factC}`);

    // Rechazado: la suscripción no cambia.
    const finR = enDias(4);
    const sR = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'destacado', cupo: 1, fin: finR });
    const aR = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sR, vence: finR });
    const factR = facturasTotales();
    let rR = null;
    pagos.PROCESADORES.demo = async () => ({ resultado: 'rechazado', motivo: 'Fondos insuficientes' });
    try {
      rR = await renovarAnuncioApi(aR, dueno);
    } finally {
      pagos.PROCESADORES.demo = demoOriginal;
    }
    ok(rR.codigo === 402 && !/cupo/i.test(errorDe(rR)) && filaSusc(sR).fin === finR && facturasTotales() === factR,
      `rechazado: ${rR.codigo} «${errorDe(rR)}» fin intacto=${filaSusc(sR).fin === finR}`);

    // Dos cupos: el anuncio no se renueva suelto; el plan, entero.
    const finM = enDias(3);
    const sM = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'destacado', cupo: 2, fin: finM });
    const m1 = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sM, vence: finM });
    const m2 = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sM, vence: finM });
    const rM1 = await renovarAnuncioApi(m1, dueno);
    ok(rM1.codigo === 409 && (rM1.datos || {}).idSusc === sM && pagosDeSusc(sM) === 0,
      `anuncio de un plan de 2: ${rM1.codigo} idSusc=${(rM1.datos || {}).idSusc === sM} «${errorDe(rM1)}»`);
    const rM2 = await renovarMembresiaApi(sM, dueno, { cupo: 1, total: 1 });
    const pM = consulta('SELECT * FROM pagos WHERE suscripcion_id = ?', sM);
    const esperadoM = precios.precioRenovacion({ precioUnitario: unitario('destacado'), cupo: 2, dias: 30 });
    const finM2 = masDias(finM, 30);
    ok(rM2.codigo === 201 && !!pM && pM.total === esperadoM.total && filaSusc(sM).fin === finM2,
      `renovar el plan: ${rM2.codigo} «${errorDe(rM2)}» total=${pM && pM.total} (se esperaba ${esperadoM.total})`);
    ok(filaAnuncio(m1).vence === finM2 && filaAnuncio(m2).vence === finM2,
      `los dos anuncios extendidos: ${filaAnuncio(m1).vence === finM2} ${filaAnuncio(m2).vence === finM2}`);

    // Ajeno, inexistente, borrador, vendido y del sistema anterior.
    const otro = cuentaConSesion('renueva-ajeno');
    const rAjeno = await renovarAnuncioApi(aA, otro);
    const rNada = await renovarAnuncioApi('no-existe', otro);
    ok(rAjeno.codigo === 404 && rNada.codigo === 404 && errorDe(rAjeno) === errorDe(rNada),
      `ajeno ${rAjeno.codigo} e inexistente ${rNada.codigo}, mismo texto: ${errorDe(rAjeno) === errorDe(rNada)}`);
    const rMAjena = await renovarMembresiaApi(sM, otro);
    ok(rMAjena.codigo === 404, `membresía ajena: ${rMAjena.codigo}`);
    const aB = nuevoAnuncio({ idOrg: dueno.idOrg, estado: 'borrador' });
    const rB = await renovarAnuncioApi(aB, dueno);
    ok(rB.codigo === 409 && consulta('SELECT COUNT(*) AS n FROM pagos WHERE anuncio_id = ?', aB).n === 0,
      `borrador: ${rB.codigo} «${errorDe(rB)}»`);
    const sVe = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'destacado', cupo: 1, fin: enDias(8) });
    const aVe = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sVe, estado: 'vendido', vence: enDias(8) });
    const rVe = await renovarAnuncioApi(aVe, dueno);
    ok(rVe.codigo === 409 && pagosDeSusc(sVe) === 0, `vendido: ${rVe.codigo} «${errorDe(rVe)}»`);
    const aViejo = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: null, vence: enDias(8) });
    const rViejo = await renovarAnuncioApi(aViejo, dueno);
    ok(rViejo.codigo === 409, `sin suscripción (modelo viejo): ${rViejo.codigo} «${errorDe(rViejo)}»`);
    const sSinFin = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'destacado', cupo: 1, fin: null });
    const rSinFin = await renovarMembresiaApi(sSinFin, dueno);
    ok(rSinFin.codigo === 404 && pagosDeSusc(sSinFin) === 0, `membresía sin fin: ${rSinFin.codigo}`);

    // Plan que ya no se ofrece: 409 sin teléfono.
    const sP = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'premium', cupo: 1, fin: enDias(6) });
    const aP = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sP, vence: enDias(6) });
    ejecuta("UPDATE planes SET activo = 0 WHERE id = 'premium'");
    let rP = null;
    try {
      rP = await renovarAnuncioApi(aP, dueno);
    } finally {
      ejecuta("UPDATE planes SET activo = 1 WHERE id = 'premium'");
    }
    ok(rP.codigo === 409 && /correo/.test(errorDe(rP)) && !/\d{3}.?\d{3}.?\d{4}/.test(errorDe(rP)) && pagosDeSusc(sP) === 0,
      `plan retirado: ${rP.codigo} «${errorDe(rP)}»`);

    // Sin aceptar las condiciones de pago: 409 con `faltan` y nada anotado.
    const sinLegales = cuentaConSesion('renueva-sin-legales', { sinLegales: true });
    const sL = nuevaSuscripcion({ idOrg: sinLegales.idOrg, plan: 'destacado', cupo: 1, fin: enDias(6) });
    const aL = nuevoAnuncio({ idOrg: sinLegales.idOrg, idSusc: sL, vence: enDias(6) });
    const rL = await renovarAnuncioApi(aL, sinLegales);
    const faltan = (rL.datos || {}).faltan || [];
    ok(rL.codigo === 409 && faltan.length > 0 && pagosDeSusc(sL) === 0,
      `sin aceptar condiciones: ${rL.codigo} faltan=${JSON.stringify(faltan)}`);

    // Sin sesión: 401.
    const rSin = await pedir({ metodo: 'POST', url: `/api/anuncios/${aA}/renovar`, cuerpo: {} });
    ok(rSin.codigo === 401, `sin sesión: ${rSin.codigo}`);

    // Transferencia: un solo pendiente y un solo aviso a facturación (D-05).
    encenderTransferencia();
    try {
      const cliente = cuentaConSesion('renueva-transfiere');
      const finT = enDias(2);
      const sT = nuevaSuscripcion({ idOrg: cliente.idOrg, plan: 'destacado', cupo: 1, fin: finT });
      const aT = nuevoAnuncio({ idOrg: cliente.idOrg, idSusc: sT, vence: finT });
      const r1 = await renovarAnuncioApi(aT, cliente, { metodo: 'transferencia' });
      await respiro();
      const d1 = r1.datos || {};
      const ref = d1.cobro && d1.cobro.referencia;
      ok(r1.codigo === 202 && !!d1.transferencia && !!d1.pago && d1.pago.estado === 'pendiente'
        && !/cupo/i.test(d1.aviso || '') && filaSusc(sT).fin === finT,
      `por transferencia: ${r1.codigo} cuenta=${!!d1.transferencia} pago=${d1.pago && d1.pago.estado} «${d1.aviso}»`);
      ok(avisosDe(ref) === 1, `aviso a facturación: ${avisosDe(ref)}`);
      const r2 = await renovarAnuncioApi(aT, cliente, { metodo: 'transferencia' });
      await respiro();
      const d2 = r2.datos || {};
      ok(r2.codigo === 202 && d2.cobro && d2.cobro.referencia === ref && (d2.pago || {}).id === d1.pago.id
        && pagosDeSusc(sT) === 1 && avisosDe(ref) === 1,
      `pedir otra vez: ${r2.codigo} misma referencia=${d2.cobro && d2.cobro.referencia === ref} pagos=${pagosDeSusc(sT)} avisos=${avisosDe(ref)}`);
      const r3 = await renovarMembresiaApi(sT, cliente, { metodo: 'transferencia' });
      ok(r3.codigo === 202 && ((r3.datos || {}).pago || {}).id === d1.pago.id && pagosDeSusc(sT) === 1,
        `por la ruta del plan, el mismo pendiente: ${r3.codigo} pagos=${pagosDeSusc(sT)}`);
    } finally {
      apagarTransferencia();
    }

    // GET /api/membresias: las renovables, vencidas incluidas, con su precio final.
    const panel = cuentaConSesion('renueva-panel');
    const sPV = nuevaSuscripcion({ idOrg: panel.idOrg, plan: 'destacado', cupo: 1, fin: enDias(-3), estado: 'vencida' });
    const sPA = nuevaSuscripcion({ idOrg: panel.idOrg, plan: 'destacado', cupo: 2, fin: enDias(12) });
    const rG = await pedir({ url: '/api/membresias', cabeceras: panel.cabeceras });
    const g = rG.datos || {};
    const renovables = g.renovables || [];
    const vencida = renovables.find((x) => x.id === sPV);
    const viva = renovables.find((x) => x.id === sPA);
    ok(rG.codigo === 200 && !!vencida && vencida.vencida === true && !!viva && viva.vencida === false,
      `renovables: ${renovables.length} vencida=${vencida && vencida.vencida} viva=${viva && viva.vencida}`);
    ok(!!vencida && !!vencida.precio && vencida.precio.total === esperado.total
      && vencida.precio.base === undefined && vencida.precio.ajuste === undefined,
    `precio de la vencida sin base ni ajuste: ${JSON.stringify(vencida && vencida.precio)}`);
    ok(!!viva && viva.cupo === 2 && viva.dias === 30 && viva.precio.total === esperadoM.total && viva.renovacion_automatica === false,
      `la viva: cupo=${viva && viva.cupo} días=${viva && viva.dias} total=${viva && viva.precio && viva.precio.total}`);
    ok(Array.isArray(g.metodosPago) && g.metodosPago.length > 0, `metodosPago: ${JSON.stringify(g.metodosPago)}`);
    ok(!!g.renovacionAutomatica && g.renovacionAutomatica.disponible === false && g.renovacionAutomatica.texto === undefined,
      `renovacionAutomatica apagada: ${JSON.stringify(g.renovacionAutomatica)}`);
    ok(!(g.membresias || []).some((x) => x.id === sPV), 'membresias sigue sin traer la vencida');
  }

  console.log('\n5 · consola, renovación automática y seguridad');
  {
    const correoAdmin = `admin-renovacion-${SELLO}@prueba.invalid`;
    const { idUsuario: idAdmin } = db.crearCuenta({
      correo: correoAdmin, clave: 'UnaClaveLargaYSegura9',
      nombre: 'Administradora de Prueba', telefono: '8095550000', tipo: 'particular',
    });
    db.marcarAdmin(correoAdmin, true);
    const comoAdmin = { cookie: `te_sesion=${db.abrirSesion(idAdmin)}`, 'cf-connecting-ip': '190.1.2.3' };
    const recibido = (idPago, cuerpo = {}) =>
      pedir({ metodo: 'POST', url: `/api/admin/pagos/${idPago}/recibido`, cuerpo, cabeceras: comoAdmin });
    const filasBitacora = (accion) =>
      consulta('SELECT COUNT(*) AS n FROM bitacora_admin WHERE accion = ?', accion).n;
    const todasLasFilas = () => consulta('SELECT COUNT(*) AS n FROM bitacora_admin').n;
    const periodos = (idSusc) =>
      consulta("SELECT COUNT(*) AS n FROM pagos WHERE suscripcion_id = ? AND estado = 'aprobado'", idSusc).n;

    // La consola renueva por la misma transición, una sola vez.
    encenderTransferencia();
    try {
      const cliente = cuentaConSesion('consola-renueva');
      const finT = enDias(3);
      const sT = nuevaSuscripcion({ idOrg: cliente.idOrg, plan: 'destacado', cupo: 1, fin: finT });
      const aT = nuevoAnuncio({ idOrg: cliente.idOrg, idSusc: sT, vence: finT, fotos: 1 });
      const rT = await renovarAnuncioApi(aT, cliente, { metodo: 'transferencia' });
      const idPago = ((rT.datos || {}).pago || {}).id;
      ok(rT.codigo === 202 && !!idPago, `pedir por transferencia: ${rT.codigo}`);

      const fact = facturasTotales();
      const filas = filasBitacora('pago.transferencia_recibida');
      const nAnuncios = anunciosDeOrg(cliente.idOrg);
      const rr = await recibido(idPago);
      const pT = db.pagoPorId(idPago);
      ok(rr.codigo === 200 && pT.estado === 'aprobado' && filaSusc(sT).fin === masDias(finT, 30),
        `marcar recibido: ${rr.codigo} «${errorDe(rr)}» pago=${pT.estado} fin extendido=${filaSusc(sT).fin === masDias(finT, 30)}`);
      ok(filaAnuncio(aT).estado === 'activo' && anunciosDeOrg(cliente.idOrg) === nAnuncios && fotosDe(aT) === 1,
        `el mismo anuncio: ${filaAnuncio(aT).estado} anuncios +${anunciosDeOrg(cliente.idOrg) - nAnuncios}`);
      const fT = facturaDe(idPago);
      ok(!!fT && /^B02/.test(fT.ncf || '') && fT.subtotal + fT.itbis === fT.total && fT.total === pT.total
        && facturasTotales() === fact + 1,
      `comprobante: ${fT ? `${fT.ncf} ${fT.subtotal}+${fT.itbis}=${fT.total}` : 'NO hay'}`);
      ok(filasBitacora('pago.transferencia_recibida') === filas + 1,
        `bitácora: +${filasBitacora('pago.transferencia_recibida') - filas}`);

      const rr2 = await recibido(idPago);
      ok(rr2.codigo === 200 && (rr2.datos || {}).yaEstaba === true && facturasTotales() === fact + 1
        && filaSusc(sT).fin === masDias(finT, 30) && periodos(sT) === 1,
      `marcar otra vez: ${rr2.codigo} yaEstaba=${(rr2.datos || {}).yaEstaba} facturas +${facturasTotales() - fact}`);

      // Huérfana: la membresía se canceló mientras la transferencia esperaba.
      const finH = enDias(5);
      const sH = nuevaSuscripcion({ idOrg: cliente.idOrg, plan: 'destacado', cupo: 1, fin: finH });
      const aH = nuevoAnuncio({ idOrg: cliente.idOrg, idSusc: sH, vence: finH });
      const rH = await renovarAnuncioApi(aH, cliente, { metodo: 'transferencia' });
      const idPagoH = ((rH.datos || {}).pago || {}).id;
      ejecuta("UPDATE suscripciones SET estado = 'cancelada' WHERE id = ?", sH);
      const factH = facturasTotales();
      const filasH = todasLasFilas();
      const rhr = await recibido(idPagoH);
      ok(rhr.codigo === 409 && /Anule el pago/.test(errorDe(rhr)) && /renovaba/.test(errorDe(rhr))
        && db.pagoPorId(idPagoH).estado === 'pendiente' && facturasTotales() === factH && todasLasFilas() === filasH
        && filaSusc(sH).fin === finH && filaSusc(sH).estado === 'cancelada',
      `huérfana: ${rhr.codigo} «${errorDe(rhr)}» pago=${db.pagoPorId(idPagoH).estado} filas +${todasLasFilas() - filasH}`);

      /* La misma carrera, pero cancelada DESPUÉS de la comprobación: la
         primera consulta ve la membresía viva y aprobarPago lanza dentro
         del SAVEPOINT. Se le dice lo mismo al personal. */
      const finH2 = enDias(5);
      const sH2 = nuevaSuscripcion({ idOrg: cliente.idOrg, plan: 'destacado', cupo: 1, fin: finH2 });
      const aH2 = nuevoAnuncio({ idOrg: cliente.idOrg, idSusc: sH2, vence: finH2 });
      const rH2 = await renovarAnuncioApi(aH2, cliente, { metodo: 'transferencia' });
      const idPagoH2 = ((rH2.datos || {}).pago || {}).id;
      const viva = db.suscripcionRenovable(sH2, cliente.idOrg);
      ejecuta("UPDATE suscripciones SET estado = 'cancelada' WHERE id = ?", sH2);
      const original = db.suscripcionRenovable;
      let primera = true;
      db.suscripcionRenovable = (...args) => {
        if (primera) { primera = false; return viva; }
        return original(...args);
      };
      const factH2 = facturasTotales();
      const filasH2 = todasLasFilas();
      let rhr2 = null;
      try {
        rhr2 = await recibido(idPagoH2);
      } finally {
        db.suscripcionRenovable = original;
      }
      ok(rhr2.codigo === 409 && /Anule el pago/.test(errorDe(rhr2)) && /renovaba/.test(errorDe(rhr2))
        && db.pagoPorId(idPagoH2).estado === 'pendiente' && facturasTotales() === factH2 && todasLasFilas() === filasH2
        && filaSusc(sH2).fin === finH2,
      `huérfana a mitad: ${rhr2.codigo} «${errorDe(rhr2)}» filas +${todasLasFilas() - filasH2}`);
    } finally {
      apagarTransferencia();
    }

    // La casilla de renovación automática.
    const dueno = cuentaConSesion('automatica');
    const sA = nuevaSuscripcion({ idOrg: dueno.idOrg, plan: 'destacado', cupo: 1, fin: enDias(9) });
    const casilla = (idSusc, quien, cuerpo) =>
      pedir({ metodo: 'PUT', url: `/api/membresias/${idSusc}/renovacion-automatica`, cuerpo, cabeceras: quien && quien.cabeceras });

    delete process.env.MERCA_CARDNET;
    const rApagada = await casilla(sA, dueno, { activar: true, texto: 'otro' });
    ok(rApagada.codigo === 409 && filaSusc(sA).renovacion_automatica === 0 && filaSusc(sA).renovacion_aceptada === null,
      `sin MERCA_CARDNET, activar: ${rApagada.codigo} «${errorDe(rApagada)}» casilla=${filaSusc(sA).renovacion_automatica}`);
    process.env.MERCA_CARDNET = 'apagado';
    const rApagado = await casilla(sA, dueno, { activar: true });
    const gApagado = await pedir({ url: '/api/membresias', cabeceras: dueno.cabeceras });
    ok(rApagado.codigo === 409 && filaSusc(sA).renovacion_automatica === 0
      && ((gApagado.datos || {}).renovacionAutomatica || {}).disponible === false,
    `MERCA_CARDNET=apagado: ${rApagado.codigo} disponible=${((gApagado.datos || {}).renovacionAutomatica || {}).disponible}`);

    // Renovar con la casilla marcada y CardNet apagado: renueva y la casilla sigue en 0.
    const aA = nuevoAnuncio({ idOrg: dueno.idOrg, idSusc: sA, vence: filaSusc(sA).fin });
    const rRen = await renovarAnuncioApi(aA, dueno, { renovacionAutomatica: true });
    ok(rRen.codigo === 201 && filaSusc(sA).renovacion_automatica === 0,
      `renovar con la casilla y CardNet apagado: ${rRen.codigo} casilla=${filaSusc(sA).renovacion_automatica}`);

    process.env.MERCA_CARDNET = 'lab';
    try {
      const rOn = await casilla(sA, dueno, { activar: true, texto: 'otro' });
      const fOn = filaSusc(sA);
      ok(rOn.codigo === 200 && (rOn.datos || {}).renovacionAutomatica === true && fOn.renovacion_automatica === 1
        && !!fOn.renovacion_aceptada && fOn.renovacion_texto === TEXTO_ESPERADO,
      `con lab, activar: ${rOn.codigo} casilla=${fOn.renovacion_automatica} fecha=${!!fOn.renovacion_aceptada} texto del servidor=${fOn.renovacion_texto === TEXTO_ESPERADO}`);
      const gOn = await pedir({ url: '/api/membresias', cabeceras: dueno.cabeceras });
      const ra = (gOn.datos || {}).renovacionAutomatica || {};
      const enLista = ((gOn.datos || {}).renovables || []).find((x) => x.id === sA);
      ok(ra.disponible === true && ra.texto === TEXTO_ESPERADO && !!enLista && enLista.renovacion_automatica === true,
        `GET /api/membresias con lab: disponible=${ra.disponible} texto=${ra.texto === TEXTO_ESPERADO} en la lista=${enLista && enLista.renovacion_automatica}`);

      const rOff = await casilla(sA, dueno, { activar: false });
      const fOff = filaSusc(sA);
      ok(rOff.codigo === 200 && fOff.renovacion_automatica === 0 && fOff.renovacion_aceptada === fOn.renovacion_aceptada
        && fOff.renovacion_texto === TEXTO_ESPERADO,
      `desactivar: ${rOff.codigo} casilla=${fOff.renovacion_automatica} fecha y texto conservados=${fOff.renovacion_aceptada === fOn.renovacion_aceptada && fOff.renovacion_texto === TEXTO_ESPERADO}`);

      // Solo el propietario; ajena, 404; sin sesión, 401.
      const miembro = cuentaConSesion('automatica-miembro');
      ejecuta("UPDATE miembros SET organizacion_id = ?, rol = 'administrador' WHERE usuario_id = ?", dueno.idOrg, miembro.idUsuario);
      const rMiembro = await casilla(sA, miembro, { activar: true });
      ok(rMiembro.codigo === 403 && filaSusc(sA).renovacion_automatica === 0, `un administrador que no es propietario: ${rMiembro.codigo}`);
      const ajeno = cuentaConSesion('automatica-ajeno');
      const rAjena = await casilla(sA, ajeno, { activar: true });
      ok(rAjena.codigo === 404 && filaSusc(sA).renovacion_automatica === 0, `membresía ajena: ${rAjena.codigo}`);
      const rSinSesion = await casilla(sA, null, { activar: true });
      ok(rSinSesion.codigo === 401, `sin sesión: ${rSinSesion.codigo}`);

      // Activar exige las condiciones de pago.
      const sinLegales = cuentaConSesion('automatica-sin-legales', { sinLegales: true });
      const sSL = nuevaSuscripcion({ idOrg: sinLegales.idOrg, plan: 'destacado', cupo: 1, fin: enDias(9) });
      const rSL = await casilla(sSL, sinLegales, { activar: true });
      ok(rSL.codigo === 409 && ((rSL.datos || {}).faltan || []).length > 0 && filaSusc(sSL).renovacion_automatica === 0,
        `activar sin aceptar condiciones: ${rSL.codigo}`);
    } finally {
      delete process.env.MERCA_CARDNET;
    }

    // Desactivar funciona siempre, también con CardNet apagado.
    ejecuta('UPDATE suscripciones SET renovacion_automatica = 1 WHERE id = ?', sA);
    const rOffApagado = await casilla(sA, dueno, { activar: false });
    ok(rOffApagado.codigo === 200 && filaSusc(sA).renovacion_automatica === 0,
      `desactivar con CardNet apagado: ${rOffApagado.codigo} casilla=${filaSusc(sA).renovacion_automatica}`);

    // Nunca marcada por defecto: una compra recién hecha nace en 0.
    const comprador = cuentaConSesion('automatica-compra');
    const rCompra = await pedir({
      metodo: 'POST', url: '/api/membresias', cuerpo: { plan: 'destacado', cupo: 1, dias: 30 }, cabeceras: comprador.cabeceras,
    });
    const idNueva = ((rCompra.datos || {}).membresia || {}).id;
    ok(rCompra.codigo === 201 && !!idNueva && filaSusc(idNueva).renovacion_automatica === 0,
      `compra recién hecha: ${rCompra.codigo} casilla=${idNueva && filaSusc(idNueva).renovacion_automatica}`);
  }

  console.log('\n6 · condiciones nuevas antes de renovar');
  {
    /* La 2.1 de contratacion decía que la vigencia empieza al aprobarse el
       pago; la 2.2 explica que renovar suma al final del período, los avisos
       de 7/3/1 día y la renovación automática. Quien aceptó la 2.1 tiene que
       aceptar la 2.2 ANTES de pagar una renovación (PARA_PAGAR). */
    ejecuta("UPDATE planes SET precio_promocional = 0, promo_hasta = '2099-12-31' WHERE id = 'estandar'");
    /* La 05.4 sube la contratación a 2.3 (cláusulas de «cupos» pasan a
       capacidad de publicaciones activas). Esta prueba vigila que la
       versión no baje de la 2.2 y que la página enseñe la vigente, no un
       número fijo. Términos, privacidad y política de publicación NO se
       tocan en la 05.4: subirlos obligaría a reaceptar antes de publicar. */
    ok(Number(legales.versionDe('contratacion')) >= 2.2, `versionDe('contratacion') = ${legales.versionDe('contratacion')}`);
    ok(legales.versionDe('anuncios') === '2.0' && legales.versionDe('privacidad') === '2.1'
      && legales.versionDe('terminos') === '2.1',
    `anuncios/privacidad/términos intactos: ${legales.versionDe('anuncios')}/${legales.versionDe('privacidad')}/${legales.versionDe('terminos')}`);

    const html = fs.readFileSync(path.join(__dirname, '..', 'legal.html'), 'utf8');
    const seccion = html.slice(html.indexOf('id="contratacion"'), html.indexOf('id="t-contratacion"') + 400);
    ok(seccion.includes(`v${legales.versionDe('contratacion')} · vigente desde`) && !/v2\.1 · vigente desde 2026-09-26/.test(seccion),
      'legal.html enseña la versión vigente en la sección de contratación');

    const cli = cuentaConSesion('legales-22', { sinLegales: true });
    // La versión vieja se anota como '2.1' literal a propósito: es lo que aceptó quien ya tenía cuenta.
    ['terminos', 'privacidad', 'contratacion'].forEach((documento) => {
      db.registrarAceptacion({
        usuarioId: cli.idUsuario, documento, version: documento === 'contratacion' ? '2.1' : legales.versionDe(documento),
        ip: '127.0.0.1', userAgent: 'prueba',
      });
    });
    const finL = enDias(10);
    const sL = nuevaSuscripcion({ idOrg: cli.idOrg, plan: 'estandar', cupo: 1, fin: finL });
    const aL = nuevoAnuncio({ idOrg: cli.idOrg, idSusc: sL, vence: finL });
    const pagosAntes = pagosDeSusc(sL);

    const r1 = await renovarAnuncioApi(aL, cli, {});
    ok(r1.codigo === 409 && ((r1.datos || {}).faltan || []).length > 0
      && JSON.stringify((r1.datos || {}).faltan).includes('contratacion')
      && pagosDeSusc(sL) === pagosAntes && filaSusc(sL).fin === finL,
    `con la 2.1 aceptada: ${r1.codigo} «${errorDe(r1)}» pagos +${pagosDeSusc(sL) - pagosAntes}`);

    const rAc = await pedir({
      metodo: 'POST', url: '/api/legales/aceptar', cuerpo: { documentos: ['contratacion'] }, cabeceras: cli.cabeceras,
    });
    ok(rAc.codigo === 200, `aceptar la 2.2: ${rAc.codigo}`);

    const r2 = await renovarAnuncioApi(aL, cli, {});
    ok([201, 202].includes(r2.codigo), `tras aceptar la 2.2 renueva: ${r2.codigo} «${errorDe(r2)}»`);
  }

  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
