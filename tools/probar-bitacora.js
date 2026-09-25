/**
 * probar-bitacora.js — que la bitácora de administración no se salte.
 *
 *   node tools/probar-bitacora.js
 *
 * POR QUÉ EXISTE
 *
 * La bitácora es la prueba ante el reclamo de un cliente empresa («yo
 * no quité ese sello») y el rastro que deja quien robe la cuenta de
 * administrador. Una bitácora que se salta en silencio es peor que no
 * tener ninguna, porque se confía en ella. Por eso aquí se comprueba lo
 * que la hace fiable y que nadie ve leyendo el código: que la escritura
 * y su anotación van juntas o no van, que la base rechaza editarla o
 * borrarla, y que solo hay una puerta por la que se escribe.
 *
 * Corre contra una base TEMPORAL —`.tmp/prueba-bitacora/`— que se
 * borra y se rehace en cada ejecución. No toca la base real.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/* Antes de cargar db.js: la ruta del archivo se resuelve al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-bitacora');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
const api = require('./api.js');

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

/* Ejecuta y devuelve el error lanzado, o null si no lanzó. */
function lanza(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

const filas = () => db.abrir().prepare('SELECT COUNT(*) AS n FROM bitacora_admin').get().n;
const verificada = (idOrg) =>
  !!db.abrir().prepare('SELECT verificada FROM organizaciones WHERE id = ?').get(idOrg).verificada;
const solicitudDe = (idOrg) => db.abrir()
  .prepare('SELECT * FROM solicitudes_dealer WHERE organizacion_id = ? ORDER BY creada DESC')
  .get(idOrg);

/* ── Siembra ─────────────────────────────────────────────── */
let rnc = 131000000;
function cuenta(correo, nombre, dealer) {
  const datos = {
    correo,
    clave: 'UnaClaveLargaYSegura9',
    nombre,
    telefono: '8095550000',
    tipo: dealer ? 'dealer' : 'particular',
  };
  if (dealer) {
    Object.assign(datos, {
      empresa: dealer,
      rnc: String(++rnc),
      direccion: 'Calle Principal No. 10',
      provincia: 'santo-domingo',
      solicitud: { encargado: nombre, aniosOperando: 5 },
    });
  }
  const { idUsuario } = db.crearCuenta(datos);
  return { idUsuario, org: db.organizacionDe(idUsuario) };
}

const sembrado = {};
function sembrar() {
  sembrado.admin = cuenta('admin@ejemplo.test', 'Administradora de Prueba');
  db.marcarAdmin('admin@ejemplo.test', true);
  sembrado.normal = cuenta('normal@ejemplo.test', 'Usuario Normal');
  sembrado.dealerA = cuenta('dealer-a@ejemplo.test', 'Encargada A', 'Maquinarias A, S.R.L.');
  sembrado.dealerB = cuenta('dealer-b@ejemplo.test', 'Encargado B', 'Equipos B, S.R.L.');
}

/* ── Bloque «La base» ────────────────────────────────────── */
function bloqueBase() {
  const { admin, normal, dealerA, dealerB } = sembrado;
  const idA = dealerA.org.id;
  const base = (extra) => ({
    idAdmin: admin.idUsuario,
    idOrganizacion: idA,
    accion: 'organizacion.verificar',
    objetoTipo: 'organizacion',
    objetoId: idA,
    ip: '201.4.4.4',
    ...extra,
  });

  console.log('\nUna escritura correcta queda anotada');
  let n = filas();
  const r = db.enNombreDe(base({ motivo: 'papeles revisados' }), (org) => {
    db.marcarVerificada(idA, true);
    return { antes: { verificada: !!org.verificada }, despues: { verificada: true }, resultado: 'hecho' };
  });
  comprobar(r === 'hecho', 'devuelve el resultado del callback');
  comprobar(verificada(idA), 'la organización queda verificada');
  comprobar(filas() === n + 1, 'y hay exactamente una fila nueva');
  const [fila] = db.bitacora({ limite: 1 });
  comprobar(fila.admin_id === admin.idUsuario && fila.admin_correo === 'admin@ejemplo.test',
    'la fila dice qué administrador fue, con su correo copiado');
  comprobar(fila.organizacion_id === idA && fila.organizacion_nombre === dealerA.org.nombre,
    'sobre qué organización, con su nombre copiado');
  comprobar(fila.accion === 'organizacion.verificar' && fila.ip === '201.4.4.4',
    'qué acción y desde qué IP');
  comprobar(fila.antes && fila.antes.verificada === false && fila.despues.verificada === true,
    'y qué cambió, con antes y después parseados');

  console.log('\nSin anotación no hay escritura, y al revés');
  db.marcarVerificada(idA, false);
  n = filas();
  let e = lanza(() => db.enNombreDe(base(), () => {
    db.marcarVerificada(idA, true);
    throw new Error('falla a mitad');
  }));
  comprobar(e && e.message === 'falla a mitad', 'la excepción del callback sale tal cual');
  comprobar(!verificada(idA) && filas() === n, 'la escritura se deshace y no queda fila');

  e = lanza(() => db.enNombreDe(base(), async () => {
    db.marcarVerificada(idA, true);
    return { despues: { verificada: true } };
  }));
  comprobar(!!e, 'un callback asíncrono se rechaza');
  comprobar(!verificada(idA) && filas() === n, 'y lo que escribió antes del await se deshace, sin fila');

  e = lanza(() => db.enNombreDe(base(), () => {
    db.marcarVerificada(idA, true);
    return { antes: { verificada: false } };
  }));
  comprobar(!!e, 'un resultado sin «despues» se rechaza');
  comprobar(!verificada(idA) && filas() === n, 'y la escritura se deshace, sin fila');

  console.log('\nLo que no debe pasar por la puerta, no pasa');
  const escribe = () => { db.marcarVerificada(idA, true); return { despues: {} }; };
  e = lanza(() => db.enNombreDe(base({ accion: 'organizacion.inventada' }), escribe));
  comprobar(e && e.codigo === 500, 'una acción fuera del catálogo lanza con 500');
  e = lanza(() => db.enNombreDe(base({ idAdmin: normal.idUsuario }), escribe));
  comprobar(e && e.codigo === 404, 'un usuario sin es_admin lanza con 404');
  e = lanza(() => db.enNombreDe(base({ idOrganizacion: 'no-existe' }), escribe));
  comprobar(e && e.codigo === 404, 'una organización inexistente lanza con 404');
  comprobar(!verificada(idA) && filas() === n, 'y en ninguno de los tres hay escritura ni fila');

  console.log('\nLa base no deja editar ni borrar la bitácora');
  n = filas();
  e = lanza(() => db.abrir().prepare("UPDATE bitacora_admin SET accion = 'x'").run());
  comprobar(!!e && /no se modifica/.test(e.message), 'un UPDATE a mano aborta');
  e = lanza(() => db.abrir().prepare('DELETE FROM bitacora_admin').run());
  comprobar(!!e && /no se borra/.test(e.message), 'un DELETE a mano aborta');
  comprobar(filas() === n, 'y el número de filas no cambia');

  console.log('\nresolverSolicitud, suelta y anidada');
  const solA = solicitudDe(idA);
  db.resolverSolicitud(solA.id, { aprobar: true, idRevisor: admin.idUsuario });
  comprobar(solicitudDe(idA).estado === 'aprobada', 'suelta, fuera de transacción, sigue funcionando');

  const idB = dealerB.org.id;
  const solB = solicitudDe(idB);
  n = filas();
  e = lanza(() => db.enNombreDe(base({ accion: 'dealer.resolver', idOrganizacion: idB,
    objetoTipo: 'solicitud_dealer', objetoId: solB.id }), () => {
    db.resolverSolicitud(solB.id, { aprobar: true, idRevisor: admin.idUsuario });
    throw new Error('falla después de resolver');
  }));
  comprobar(!!e && solicitudDe(idB).estado === 'pendiente',
    'anidada: si el de fuera se deshace, el SAVEPOINT de dentro también');
  comprobar(filas() === n, 'y no queda fila');

  const s = db.enNombreDe(base({ accion: 'dealer.resolver', idOrganizacion: idB,
    objetoTipo: 'solicitud_dealer', objetoId: solB.id }), (org) => {
    const hecha = db.resolverSolicitud(solB.id, { aprobar: true, idRevisor: admin.idUsuario });
    return {
      antes: { solicitud: 'pendiente', estado_revision: org.estado_revision },
      despues: { solicitud: hecha.estado, estado_revision: 'aprobada' },
      resultado: hecha,
    };
  });
  comprobar(s && s.estado === 'aprobada' && filas() === n + 1,
    'anidada y correcta: aprueba y deja su fila');

  console.log('\nConsultas de la consola');
  const deB = db.bitacora({ organizacion: idB });
  comprobar(deB.length === 1 && deB.every((f) => f.organizacion_id === idB),
    'bitacora({ organizacion }) solo trae las de esa organización');
  const todas = db.bitacora();
  comprobar(todas.every((f, i) => i === 0 || todas[i - 1].id > f.id), 'en orden de id descendente');
  comprobar(todas.every((f) => f.rotulo === db.ACCIONES_BITACORA[f.accion]), 'y con el rótulo de la acción');
  const orgs = db.organizacionesEnBitacora();
  comprobar(orgs.length === 2 && new Set(orgs.map((o) => o.id)).size === 2,
    'organizacionesEnBitacora trae cada organización una vez');
  const oA = orgs.find((o) => o.id === idA);
  comprobar(!!oA && oA.entradas === 1 && oA.nombre === dealerA.org.nombre,
    'con su nombre y su número de entradas');

  console.log('\nSolicitudes de servicio con quien las atendió');
  const sol = db.crearSolicitudServicio({
    servicio: 'alquiler', nombre: 'Cliente de Prueba', telefono: '8095551234',
    correo: 'cliente@ejemplo.test', detalle: { Equipo: 'Retroexcavadora' },
  });
  comprobar(db.marcarSolicitudServicio(sol.id, 'atendida', 'llamado', admin.idUsuario) === true,
    'marcarla devuelve true');
  const atendida = db.solicitudesServicio({ estado: 'atendida' }).find((x) => x.id === sol.id);
  comprobar(!!atendida && atendida.atendida_por_nombre === 'Administradora de Prueba' && !!atendida.atendida,
    'la lista la trae con quién y cuándo');
  db.marcarSolicitudServicio(sol.id, 'nueva', null, admin.idUsuario);
  const reabierta = db.solicitudServicio(sol.id);
  comprobar(reabierta.atendida_por === null && reabierta.atendida === null,
    'volver a «nueva» borra quién y cuándo');
  comprobar(db.marcarSolicitudServicio('no-existe', 'cerrada', null, admin.idUsuario) === false,
    'un id inexistente devuelve false');

  console.log('\nUna sola puerta');
  const carpeta = __dirname;
  const esta = path.basename(__filename);
  const apariciones = [];
  for (const archivo of fs.readdirSync(carpeta)) {
    if (!archivo.endsWith('.js') || archivo === esta) continue;
    const texto = fs.readFileSync(path.join(carpeta, archivo), 'utf8');
    const veces = texto.split('INSERT INTO bitacora_admin').length - 1;
    for (let i = 0; i < veces; i++) apariciones.push(archivo);
  }
  comprobar(apariciones.length === 1 && apariciones[0] === 'db.js',
    `exactamente un INSERT INTO bitacora_admin en tools/, y en db.js (hay: ${apariciones.join(', ') || 'ninguno'})`);
}

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Copia del arnés de probar-seguridad.js: cada archivo de prueba lleva
   el suyo, a propósito. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-bitacora', ...cabeceras };
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

/* ── Bloque «La API» ─────────────────────────────────────── */
async function bloqueApi() {
  const { admin, normal, dealerA } = sembrado;
  const idA = dealerA.org.id;
  const IP = '201.4.4.4';
  const comoAdmin = { cookie: `te_sesion=${db.abrirSesion(admin.idUsuario)}`, 'cf-connecting-ip': IP };
  const comoNormal = { cookie: `te_sesion=${db.abrirSesion(normal.idUsuario)}`, 'cf-connecting-ip': IP };

  console.log('\nEl sello de verificada pasa por la bitácora');
  db.marcarVerificada(idA, false);
  let n = filas();
  let r = await pedir({ metodo: 'POST', url: `/api/admin/organizaciones/${idA}/verificar`,
    cuerpo: { verificada: true }, cabeceras: comoAdmin });
  comprobar(r.codigo === 200 && r.datos.verificada === true, 'como administrador responde 200');
  const [fila] = db.bitacora({ limite: 1 });
  comprobar(filas() === n + 1 && fila.accion === 'organizacion.verificar', 'y deja una fila de «organizacion.verificar»');
  comprobar(fila.ip === IP, 'con la IP de CF-Connecting-IP');
  comprobar(fila.admin_id === admin.idUsuario, 'con el administrador de la sesión');
  comprobar(fila.antes.verificada === false && fila.despues.verificada === true, 'y el sello antes y después');

  n = filas();
  r = await pedir({ metodo: 'POST', url: `/api/admin/organizaciones/${idA}/verificar`,
    cuerpo: { verificada: false }, cabeceras: comoNormal });
  comprobar(r.codigo === 404 && filas() === n, 'un usuario normal recibe 404 (no 403) y no deja fila');
  r = await pedir({ metodo: 'POST', url: `/api/admin/organizaciones/${idA}/verificar`,
    cuerpo: { verificada: false } });
  comprobar((r.codigo === 401 || r.codigo === 404) && filas() === n, 'sin sesión se rechaza y no deja fila');
  r = await pedir({ metodo: 'POST', url: '/api/admin/organizaciones/no-existe/verificar',
    cuerpo: { verificada: true }, cabeceras: comoAdmin });
  comprobar(r.codigo === 404 && filas() === n, 'una organización inexistente da 404 sin fila');

  console.log('\nEl alta de dealer pasa por la bitácora');
  const dealerC = cuenta('dealer-c@ejemplo.test', 'Encargado C', 'Grúas C, S.R.L.');
  const dealerD = cuenta('dealer-d@ejemplo.test', 'Encargada D', 'Tractores D, S.R.L.');
  const solC = solicitudDe(dealerC.org.id);
  n = filas();
  r = await pedir({ metodo: 'POST', url: `/api/admin/solicitudes/${solC.id}`,
    cuerpo: { decision: 'aprobar' }, cabeceras: comoAdmin });
  const [filaC] = db.bitacora({ organizacion: dealerC.org.id });
  comprobar(r.codigo === 200 && filas() === n + 1, 'aprobar responde 200 y deja una fila');
  comprobar(!!filaC && filaC.accion === 'dealer.resolver' && filaC.antes.solicitud === 'pendiente'
    && filaC.despues.solicitud === 'aprobada', 'de «dealer.resolver», de pendiente a aprobada');
  r = await pedir({ metodo: 'POST', url: `/api/admin/solicitudes/${solC.id}`,
    cuerpo: { decision: 'aprobar' }, cabeceras: comoAdmin });
  comprobar(r.codigo === 409 && filas() === n + 1, 'repetirla da 409 y no deja otra fila');
  const solD = solicitudDe(dealerD.org.id);
  r = await pedir({ metodo: 'POST', url: `/api/admin/solicitudes/${solD.id}`,
    cuerpo: { decision: 'rechazar' }, cabeceras: comoAdmin });
  comprobar(r.codigo === 400 && filas() === n + 1, 'rechazar sin motivo da 400 y no deja fila');
  r = await pedir({ metodo: 'POST', url: '/api/admin/solicitudes/no-existe',
    cuerpo: { decision: 'aprobar' }, cabeceras: comoAdmin });
  comprobar(r.codigo === 404 && filas() === n + 1, 'una solicitud inexistente da 404 sin fila');

  console.log('\nLa bitácora se lee, y solo se lee');
  r = await pedir({ url: '/api/admin/bitacora', cabeceras: comoAdmin });
  comprobar(r.codigo === 200 && Array.isArray(r.datos.entradas) && Array.isArray(r.datos.organizaciones)
    && !!r.datos.acciones, 'GET como administrador trae entradas, organizaciones y acciones');
  r = await pedir({ url: `/api/admin/bitacora?organizacion=${encodeURIComponent(idA)}`, cabeceras: comoAdmin });
  comprobar(r.codigo === 200 && r.datos.entradas.length > 0
    && r.datos.entradas.every((f) => f.organizacion_id === idA), 'con ?organizacion= solo trae las suyas');
  r = await pedir({ url: '/api/admin/bitacora', cabeceras: comoNormal });
  comprobar(r.codigo === 404, 'como usuario normal da 404');

  n = filas();
  let alguna2xx = false;
  for (const metodo of ['POST', 'PATCH', 'PUT', 'DELETE']) {
    for (const url of ['/api/admin/bitacora', '/api/admin/bitacora/1']) {
      const x = await pedir({ metodo, url, cuerpo: { accion: 'x' }, cabeceras: comoAdmin });
      if (x.codigo >= 200 && x.codigo < 300) alguna2xx = true;
    }
  }
  comprobar(!alguna2xx && filas() === n, 'ningún POST, PATCH, PUT ni DELETE sobre la bitácora responde 2xx');

  console.log('\nSolicitudes de servicio');
  const sol = db.crearSolicitudServicio({
    servicio: 'importacion', nombre: 'Cliente API', telefono: '8095559876', detalle: { Marca: 'CAT' },
  });
  r = await pedir({ metodo: 'PATCH', url: `/api/admin/solicitudes-servicio/${sol.id}`,
    cuerpo: { estado: 'atendida', nota: 'llamado' }, cabeceras: comoAdmin });
  comprobar(r.codigo === 200 && r.datos.solicitud && r.datos.solicitud.atendida_por_nombre === 'Administradora de Prueba',
    'marcarla atendida devuelve la solicitud con quién la atendió');
  r = await pedir({ url: '/api/admin/solicitudes-servicio?estado=nueva', cabeceras: comoAdmin });
  comprobar(r.codigo === 200 && !r.datos.solicitudes.some((s) => s.id === sol.id), 'ya no sale entre las nuevas');
  r = await pedir({ url: '/api/admin/solicitudes-servicio?estado=atendida', cabeceras: comoAdmin });
  comprobar(r.datos.solicitudes.some((s) => s.id === sol.id), 'sí entre las atendidas');
  r = await pedir({ metodo: 'PATCH', url: '/api/admin/solicitudes-servicio/no-existe',
    cuerpo: { estado: 'cerrada' }, cabeceras: comoAdmin });
  comprobar(r.codigo === 404, 'un id inexistente da 404');
  r = await pedir({ metodo: 'PATCH', url: `/api/admin/solicitudes-servicio/${sol.id}`,
    cuerpo: { estado: 'cerrada' }, cabeceras: comoNormal });
  comprobar(r.codigo === 404, 'como usuario normal da 404');
  r = await pedir({ url: '/api/admin/solicitudes-servicio?servicio=transporte', cabeceras: comoAdmin });
  comprobar(r.codigo === 200, 'lo histórico (transporte) se sigue pudiendo buscar');
  comprobar(!!r.datos.servicios && Array.isArray(r.datos.servicios.activos)
    && !r.datos.servicios.activos.includes('transporte') && !r.datos.servicios.activos.includes('financiamiento'),
    'y servicios.activos no trae los apagados');

  console.log('\nLa guarda sobre RUTAS');
  const escrituras = api.RUTAS.filter(([metodo, patron]) =>
    metodo !== 'GET' && patron.source.includes('api\\/admin'));
  let malas = 0;
  for (const [metodo, patron, manejador] of escrituras) {
    const enBitacora = !!manejador.bitacora;
    const propia = api.ESCRITURAS_ADMIN_PROPIAS.has(manejador);
    const bien1 = enBitacora !== propia
      && (!enBitacora || Object.prototype.hasOwnProperty.call(db.ACCIONES_BITACORA, manejador.bitacora));
    if (!bien1) malas++;
    comprobar(bien1, `${metodo} ${patron.source} → ${enBitacora ? `bitácora (${manejador.bitacora})` : propia ? 'propia de la plataforma' : 'SIN CLASIFICAR: envuélvala en conAdminEnNombreDe o declárela en ESCRITURAS_ADMIN_PROPIAS con su motivo'}`);
  }
  comprobar(escrituras.length > 0 && malas === 0,
    `las ${escrituras.length} escrituras de /api/admin/ están clasificadas una sola vez`);
}

/* ── Bloque «Empresas y sello» (fase 7, ADMIN-02) ───────── */
async function bloqueEmpresas() {
  const { admin, normal } = sembrado;
  const comoAdmin = { cookie: `te_sesion=${db.abrirSesion(admin.idUsuario)}`, 'cf-connecting-ip': '201.7.7.7' };
  const comoNormal = { cookie: `te_sesion=${db.abrirSesion(normal.idUsuario)}` };
  const verificar = (idOrg, cuerpo, cabeceras = comoAdmin) => pedir({
    metodo: 'POST', url: `/api/admin/organizaciones/${idOrg}/verificar`, cuerpo, cabeceras,
  });

  console.log('\nEl directorio de empresas');
  let r = await pedir({ url: '/api/admin/organizaciones', cabeceras: comoAdmin });
  const empresas = (r.datos && r.datos.empresas) || [];
  comprobar(r.codigo === 200 && empresas.length >= 4, 'como administrador trae las empresas dealer');
  const a = empresas.find((e) => e.id === sembrado.dealerA.org.id);
  comprobar(!!a && typeof a.verificada === 'boolean' && 'estado_revision' in a && 'estado_pagina' in a
    && 'activos' in a && 'series_pendientes' in a, 'con sello, revisión, página, activos y series pendientes');
  comprobar(!JSON.stringify(r.datos).includes('"rnc"') && !JSON.stringify(r.datos).includes('"correo"'),
    'sin el RNC ni el correo de la cuenta');
  comprobar(!empresas.some((e) => e.id === normal.org.id), 'y sin cuentas particulares');
  r = await pedir({ url: '/api/admin/organizaciones?estado=aprobada', cabeceras: comoAdmin });
  comprobar(r.datos.empresas.length > 0 && r.datos.empresas.every((e) => e.estado_revision === 'aprobada'),
    '?estado=aprobada solo trae aprobadas');
  r = await pedir({ url: `/api/admin/organizaciones?q=${encodeURIComponent('tractores')}`, cabeceras: comoAdmin });
  comprobar(r.datos.empresas.length === 1 && /Tractores D/.test(r.datos.empresas[0].nombre),
    '?q= busca por nombre sin distinguir mayúsculas');
  r = await pedir({ url: `/api/admin/organizaciones?q=${encodeURIComponent('%')}`, cabeceras: comoAdmin });
  comprobar(r.codigo === 200 && r.datos.empresas.length === 0, 'un «%» se busca como letra, no como comodín');
  r = await pedir({ url: '/api/admin/organizaciones', cabeceras: comoNormal });
  comprobar(r.codigo === 404, 'como usuario normal da 404');

  console.log('\nEl sello solo a una empresa aprobada, y con motivo al retirarlo');
  const dealerP = cuenta('dealer-p@ejemplo.test', 'Encargado P', 'Palas P, S.R.L.');
  const idP = dealerP.org.id;
  let n = filas();
  r = await verificar(idP, { verificada: true });
  comprobar(r.codigo === 409 && filas() === n && !verificada(idP), 'a un dealer pendiente: 409, sin fila ni sello');
  r = await verificar(normal.org.id, { verificada: true });
  comprobar(r.codigo === 409 && filas() === n, 'a una cuenta particular: 409 sin fila');

  db.resolverSolicitud(solicitudDe(idP).id, { aprobar: true, idRevisor: admin.idUsuario });
  r = await verificar(idP, { verificada: true });
  comprobar(r.codigo === 200 && verificada(idP) && filas() === n + 1, 'aprobado: 200, sello y una fila');
  r = await verificar(idP, { verificada: false });
  comprobar(r.codigo === 400 && verificada(idP) && filas() === n + 1, 'retirarlo sin motivo: 400, sin fila, sigue el sello');
  r = await verificar(idP, { verificada: false, motivo: 'Documentación mercantil vencida' });
  const [fila] = db.bitacora({ organizacion: idP, limite: 1 });
  comprobar(r.codigo === 200 && !verificada(idP) && filas() === n + 2, 'con motivo: 200 y el sello retirado');
  comprobar(fila.motivo === 'Documentación mercantil vencida' && fila.antes.verificada === true
    && fila.despues.verificada === false, 'la fila lleva el motivo y el cambio');
  r = await verificar(idP, { verificada: true }, comoNormal);
  comprobar(r.codigo === 404 && filas() === n + 2, 'como usuario normal: 404 sin fila');
}

/* ── Bloque «Número de serie» (fase 7, ADMIN-03) ────────── */
async function bloqueSeries() {
  const { admin, normal, dealerA, dealerB } = sembrado;
  const comoAdmin = { cookie: `te_sesion=${db.abrirSesion(admin.idUsuario)}`, 'cf-connecting-ip': '201.8.8.8' };
  const comoNormal = { cookie: `te_sesion=${db.abrirSesion(normal.idUsuario)}` };
  const anuncio = (org, idUsuario, serie, modelo) => db.crearAnuncio({
    idOrg: org.id, usuarioId: idUsuario, categoria: 'excavadoras', marca: 'caterpillar',
    modelo, anio: 2018, provincia: 'santo-domingo', precio: 5000000, moneda: 'DOP',
    vence: db.sumarDias(30), serie, fotos: ['/fotos/2026-09/placa.jpg'], telefonos: [],
  });
  const id1 = anuncio(dealerA.org, dealerA.idUsuario, 'CAT-0320 X', '320');
  const id2 = anuncio(dealerB.org, dealerB.idUsuario, 'cat0320x', '320 GC');
  const id3 = anuncio(dealerB.org, dealerB.idUsuario, null, '336');
  const revisar = (idAnuncio, cuerpo, cabeceras = comoAdmin) => pedir({
    metodo: 'POST', url: `/api/admin/anuncios/${idAnuncio}/serie`, cuerpo, cabeceras,
  });

  console.log('\nLa lista de series');
  let r = await pedir({ url: '/api/admin/series?estado=pendiente', cabeceras: comoAdmin });
  const lista = (r.datos && r.datos.series) || [];
  const s1 = lista.find((s) => s.id === id1);
  const s2 = lista.find((s) => s.id === id2);
  comprobar(r.codigo === 200 && !!s1 && !!s2, 'como administrador trae las pendientes');
  comprobar(!lista.some((s) => s.id === id3), 'y no el anuncio que no declaró serie');
  comprobar(!!s1 && s1.repetidos === 1 && s2.repetidos === 1,
    'la misma placa escrita distinto cuenta como repetida en el otro anuncio');
  comprobar(!!s1 && s1.serie === 'CAT-0320 X' && s1.empresa === dealerA.org.nombre
    && Array.isArray(s1.fotos) && s1.fotos.length === 1, 'con la serie, la empresa y las fotos para leer la placa');
  r = await pedir({ url: '/api/admin/series', cabeceras: comoNormal });
  comprobar(r.codigo === 404, 'como usuario normal da 404');

  console.log('\nEl resultado de la revisión');
  let n = filas();
  r = await revisar(id1, { resultado: 'observada' });
  comprobar(r.codigo === 400 && filas() === n, '«observada» sin nota: 400 y sin fila');
  r = await revisar(id1, { resultado: 'inventado' });
  comprobar(r.codigo === 400 && filas() === n, 'un resultado inválido: 400 y sin fila');
  r = await revisar('no-existe', { resultado: 'conforme' });
  comprobar(r.codigo === 404 && filas() === n, 'un anuncio inexistente: 404 y sin fila');
  r = await revisar(id3, { resultado: 'conforme' });
  comprobar(r.codigo === 404 && filas() === n, 'un anuncio sin serie: 404 y sin fila');
  r = await revisar(id1, { resultado: 'conforme' }, comoNormal);
  comprobar(r.codigo === 404 && filas() === n, 'como usuario normal: 404 y sin fila');

  r = await revisar(id1, { resultado: 'conforme' });
  const [fila] = db.bitacora({ limite: 1 });
  comprobar(r.codigo === 200 && filas() === n + 1 && fila.accion === 'anuncio.serie',
    '«conforme»: 200 y una fila de «anuncio.serie»');
  comprobar(fila.organizacion_id === dealerA.org.id && fila.objeto_id === id1 && fila.ip === '201.8.8.8',
    'sobre la organización dueña del anuncio, con el anuncio y la IP');
  comprobar(fila.antes.revision === 'pendiente' && fila.despues.revision === 'conforme',
    'de pendiente a conforme');
  comprobar(!/0320/.test(JSON.stringify(fila)), 'y la fila no guarda el número de serie');
  r = await pedir({ url: '/api/admin/series?estado=conforme', cabeceras: comoAdmin });
  const hecha = r.datos.series.find((s) => s.id === id1);
  comprobar(!!hecha && hecha.serie_revisada_por === 'Administradora de Prueba' && !!hecha.serie_revisada,
    '?estado=conforme la trae, con quién y cuándo');

  r = await revisar(id2, { resultado: 'observada', nota: 'La placa de la foto dice 0321, no 0320' });
  comprobar(r.codigo === 200 && filas() === n + 2, '«observada» con nota: 200 y otra fila');
  const sesionB = { cookie: `te_sesion=${db.abrirSesion(dealerB.idUsuario)}` };
  r = await pedir({ url: '/api/mis-anuncios', cabeceras: sesionB });
  const suyo = ((r.datos && r.datos.anuncios) || []).find((x) => x.id === id2);
  comprobar(!!suyo && !!suyo.tiene_serie && suyo.serie_revision === 'observada'
    && suyo.serie_nota === 'La placa de la foto dice 0321, no 0320',
    'el vendedor ve en su panel el resultado y la nota');
  const sinSerie = ((r.datos && r.datos.anuncios) || []).find((x) => x.id === id3);
  comprobar(!!sinSerie && !sinSerie.tiene_serie, 'y el que no declaró serie sale sin ella');

  r = await revisar(id2, { resultado: 'pendiente' });
  const vuelta = db.anuncioSerie(id2);
  comprobar(r.codigo === 200 && filas() === n + 3 && vuelta.serie_revision === null && vuelta.serie_nota === null,
    '«pendiente» deshace: vuelve a NULL y deja su fila');
  r = await pedir({ url: '/api/admin/organizaciones', cabeceras: comoAdmin });
  const b = r.datos.empresas.find((e) => e.id === dealerB.org.id);
  comprobar(!!b && b.series_pendientes === 1, 'el directorio cuenta las series pendientes de la empresa');
}

(async () => {
  console.log('\nMercaMaquinarias · bitácora de administración\n');
  sembrar();

  console.log('La base');
  bloqueBase();

  console.log('\nLa API');
  await bloqueApi();

  console.log('\nEmpresas y sello');
  await bloqueEmpresas();

  console.log('\nNúmero de serie');
  await bloqueSeries();

  console.log(`\n${bien} bien, ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})();
