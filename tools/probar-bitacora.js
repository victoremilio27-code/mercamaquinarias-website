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

/* Antes de cargar db.js: la ruta del archivo se resuelve al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-bitacora');
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

(async () => {
  console.log('\nMercaMaquinarias · bitácora de administración\n');
  sembrar();

  console.log('La base');
  bloqueBase();

  console.log(`\n${bien} bien, ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})();
