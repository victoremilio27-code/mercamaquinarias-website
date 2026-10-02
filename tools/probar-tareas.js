/**
 * Arnés de la tanda diaria completa. La ejecuta como lo hace systemd:
 * en otro proceso, con todos sus directorios y su base desechables.
 *
 * Esta prueba mira el estado completo de la base, no el tamaño del archivo:
 * SQLite puede conservar páginas libres aunque una tarea haya escrito.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.join(__dirname, '..');
const CARPETA = path.join(RAIZ, '.tmp', 'prueba-tareas');
const BANDEJA = path.join(RAIZ, '.tmp', 'correos');
fs.rmSync(CARPETA, { recursive: true, force: true });
fs.rmSync(BANDEJA, { recursive: true, force: true });

const rutas = {
  fotos: path.join(CARPETA, 'fotos'),
  videos: path.join(CARPETA, 'videos'),
  documentos: path.join(CARPETA, 'documentos'),
  facturas: path.join(CARPETA, 'facturas'),
  respaldos: path.join(CARPETA, 'respaldos'),
};
Object.values(rutas).forEach((carpeta) => fs.mkdirSync(carpeta, { recursive: true }));

/* Deben fijarse antes de db.js: de otro modo el arnés podría abrir la base
   de desarrollo y la prueba destructiva dejaría de ser desechable. */
process.env.MERCA_DB = path.join(CARPETA, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-tareas-no-usar';
process.env.MERCA_FOTOS = rutas.fotos;
process.env.MERCA_VIDEOS = rutas.videos;
process.env.MERCA_DOCUMENTOS = rutas.documentos;
process.env.MERCA_FACTURAS = rutas.facturas;
process.env.MERCA_RESPALDOS = rutas.respaldos;
process.env.MERCA_ENV = path.join(CARPETA, 'no-existe.env');
delete process.env.MERCA_CARDNET;

const db = require('./db');
const documentos = require('./documentos');
const correo = require('./correo');

let comprobaciones = 0;
let fallos = 0;
function comprobar(condicion, texto) {
  comprobaciones++;
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}

function ejecutar(sql, ...valores) {
  const d = conexion();
  try { return d.prepare(sql).run(...valores); } finally { d.close(); }
}

function fila(sql, ...valores) {
  const d = conexion();
  try { return d.prepare(sql).get(...valores); } finally { d.close(); }
}

function instantanea() {
  const d = conexion();
  try {
    d.exec('PRAGMA wal_checkpoint(TRUNCATE)');
    const tablas = d.prepare(`SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
    return JSON.stringify(tablas.map(({ name }) => ({
      tabla: name,
      filas: d.prepare(`SELECT * FROM "${name.replace(/"/g, '""')}" ORDER BY rowid`).all(),
    })), (_, valor) => typeof valor === 'bigint' ? valor.toString() : valor);
  } finally { d.close(); }
}

function ejecutarTanda(...argumentos) {
  return spawnSync(process.execPath, [path.join(__dirname, 'tareas.js'), ...argumentos], {
    encoding: 'utf8', env: process.env,
  });
}

function mensajes() {
  if (!fs.existsSync(BANDEJA)) return [];
  return fs.readdirSync(BANDEJA).filter((nombre) => nombre.endsWith('.txt'))
    .map((nombre) => ({ nombre, texto: fs.readFileSync(path.join(BANDEJA, nombre), 'utf8') }));
}

const DIA = 86400000;
const fecha = (dias) => new Date(Date.now() + dias * DIA).toISOString();
let numero = 0;
const id = (prefijo) => `${prefijo}-prueba-tareas-${++numero}`;

function cuenta(etiqueta) {
  const creada = db.crearCuenta({
    correo: `${etiqueta}@prueba.invalid`, clave: 'UnaClaveLargaSegura123',
    nombre: `Prueba ${etiqueta}`, telefono: `809555${String(++numero).padStart(4, '0')}`,
    tipo: 'particular',
  });
  return { usuario: creada.idUsuario, organizacion: db.organizacionDe(creada.idUsuario).id };
}

function suscripcion(organizacion, fin, estado = 'activa') {
  const identificador = id('suscripcion');
  ejecutar(`INSERT INTO suscripciones
    (id, organizacion_id, plan_id, modalidad, estado, precio_pactado,
     anuncios_incluidos, dias_ciclo, inicio, fin, creada)
    VALUES (?, ?, 'estandar', 'vigencia', ?, 1800, 10, 30, ?, ?, ?)`,
  identificador, organizacion, estado, fecha(-30), fin, fecha(-30));
  return identificador;
}

function anuncio(organizacion, usuario, vence, modelo, suscripcionId = null, publicado = fecha(-1)) {
  const identificador = id('anuncio');
  ejecutar(`INSERT INTO anuncios
    (id, organizacion_id, usuario_id, suscripcion_id, estado, categoria, subcategoria,
     marca, modelo, anio, precio, moneda, provincia, publicado, vence, creado, actualizado)
    VALUES (?, ?, ?, ?, 'activo', 'construccion', 'exc-mediana', 'caterpillar', ?,
            2022, 2500000, 'DOP', 'Santiago', ?, ?, ?, ?)`,
  identificador, organizacion, usuario, suscripcionId, modelo, publicado, vence, publicado, publicado);
  return identificador;
}

function borrarBandeja() {
  fs.rmSync(BANDEJA, { recursive: true, force: true });
}

function sinContadorNiNcfAjeno(lista) {
  const internos = Object.values(correo.BUZONES).map((buzon) => buzon.toLowerCase());
  const contador = lista.some((m) => /^Para: .*contador/im.test(m.texto));
  const adjuntos = fs.existsSync(BANDEJA)
    ? fs.readdirSync(BANDEJA).filter((nombre) => /(?:B0[124]|NCF).*\.pdf/i.test(nombre)) : [];
  const ncfAjeno = adjuntos.some((nombre) => {
    const prefijo = /^(.*-\d{3})-/.exec(nombre);
    const mensaje = prefijo && lista.find((m) => m.nombre.startsWith(`${prefijo[1]}-`));
    const destinatario = mensaje && /^Para: (.+)$/m.exec(mensaje.texto);
    return !destinatario || !internos.includes(destinatario[1].trim().toLowerCase());
  });
  return !contador && !ncfAjeno;
}

(async () => {
  db.abrir();
  const propietario = cuenta('propietario');
  const vencida = suscripcion(propietario.organizacion, fecha(-1));
  const anuncioVencido = anuncio(propietario.organizacion, propietario.usuario, fecha(-1), 'Vencida', vencida);
  const vigente = suscripcion(propietario.organizacion, fecha(40));
  [7, 3, 1].forEach((dias) => anuncio(propietario.organizacion, propietario.usuario,
    fecha(dias), `Aviso ${dias}`, vigente));

  const busqueda = db.guardarBusqueda({
    idUsuario: propietario.usuario,
    filtros: { categoria: 'construccion', marca: 'caterpillar', provincia: 'Santiago' },
    resumen: 'Excavadoras Caterpillar en Santiago',
  });
  ejecutar('UPDATE busquedas_guardadas SET revisada_hasta = ? WHERE id = ?', fecha(-2), busqueda.id);
  anuncio(propietario.organizacion, propietario.usuario, fecha(20), 'Coincidencia', vigente, fecha(-1));

  const borrador = db.crearBorrador({ idOrg: propietario.organizacion, idUsuario: propietario.usuario,
    idPlan: 'estandar', dias: 30 });
  const rutaFoto = '/fotos/2026-08/borrador.jpg';
  const archivoFoto = path.join(rutas.fotos, '2026-08', 'borrador.jpg');
  fs.mkdirSync(path.dirname(archivoFoto), { recursive: true });
  fs.writeFileSync(archivoFoto, 'foto del borrador');
  ejecutar('INSERT INTO anuncio_fotos (id, anuncio_id, url, orden, creada) VALUES (?, ?, ?, 0, ?)',
    id('foto'), borrador, rutaFoto, fecha(-31));
  const guardado = documentos.guardar(Buffer.from('%PDF-1.4\nprueba'));
  db.agregarDocumento({ idAnuncio: borrador, idOrg: propietario.organizacion,
    idUsuario: propietario.usuario, nombre: 'manual.pdf', ...guardado });
  ejecutar('UPDATE anuncios SET creado = ?, actualizado = ? WHERE id = ?', fecha(-31), fecha(-31), borrador);

  const huerfano = path.join(rutas.fotos, '2026-08', 'huerfano.jpg');
  fs.writeFileSync(huerfano, 'archivo sin fila');
  const antiguo = new Date(Date.now() - 72 * 3600000);
  fs.utimesSync(huerfano, antiguo, antiguo);

  console.log('\n1 · simulación sin escrituras');
  const antesSeco = instantanea();
  const seco = ejecutarTanda('--seco');
  comprobar(seco.status === 0, `la tanda --seco termina en cero${seco.stderr ? `: ${seco.stderr.trim()}` : ''}`);
  comprobar(instantanea() === antesSeco, 'ninguna fila de ninguna tabla cambia con --seco');
  comprobar(mensajes().length === 0, 'la simulación no escribe correos');
  comprobar(fs.existsSync(archivoFoto) && fs.existsSync(documentos.archivoDe(guardado.ruta)) && fs.existsSync(huerfano),
    'la simulación no borra fotos, documentos ni huérfanos');
  comprobar(sinContadorNiNcfAjeno(mensajes()), 'la simulación no manda nada al contador ni adjuntos NCF a terceros');

  console.log('\n2 · selección de una sola tarea');
  const solo = ejecutarTanda('alertas');
  comprobar(solo.status === 0 && /1\/1 tarea\(s\) completada/.test(solo.stdout)
    && !/membresía|borrador|huérfano|respaldo/.test(solo.stdout), 'pedir alertas ejecuta únicamente alertas');
  comprobar(fila('SELECT estado FROM suscripciones WHERE id = ?', vencida).estado === 'activa'
    && !!fila('SELECT 1 FROM anuncios WHERE id = ?', borrador), 'las demás tareas no hicieron efectos');
  comprobar(mensajes().some((m) => /Nuevo equipo para su búsqueda/.test(m.texto)), 'la tarea aislada manda su alerta');
  comprobar(sinContadorNiNcfAjeno(mensajes()), 'la tarea aislada no manda nada al contador ni NCF a terceros');

  /* Se repone el caso consumido por la prueba de selección para que la
     primera tanda completa demuestre también su correo de alerta. */
  ejecutar('DELETE FROM alertas_enviadas WHERE busqueda_id = ?', busqueda.id);
  ejecutar('UPDATE busquedas_guardadas SET revisada_hasta = ? WHERE id = ?', fecha(-2), busqueda.id);
  borrarBandeja();

  console.log('\n3 · primera tanda completa');
  const primera = ejecutarTanda();
  const correosPrimera = mensajes();
  comprobar(primera.status === 0, `la primera tanda termina en cero${primera.stderr ? `: ${primera.stderr.trim()}` : ''}`);
  comprobar(fila('SELECT estado FROM suscripciones WHERE id = ?', vencida).estado === 'vencida', 'vence la membresía pasada');
  comprobar(fila('SELECT estado FROM anuncios WHERE id = ?', anuncioVencido).estado === 'vencido', 'caduca su anuncio');
  comprobar(correosPrimera.some((m) => /vence en|vence mañana/.test(m.texto)), 'sale al menos un recordatorio');
  comprobar(correosPrimera.some((m) => /Nuevo equipo para su búsqueda/.test(m.texto)), 'sale al menos una alerta');
  comprobar(!fila('SELECT 1 FROM anuncios WHERE id = ?', borrador)
    && !fs.existsSync(archivoFoto) && !documentos.archivoDe(guardado.ruta), 'borra el borrador, su foto y su documento');
  comprobar(!fs.existsSync(huerfano), 'recoge el archivo huérfano');
  comprobar(sinContadorNiNcfAjeno(correosPrimera), 'la primera tanda no manda nada al contador ni NCF a terceros');

  console.log('\n4 · segunda tanda inmediata');
  const estadoPrimera = instantanea();
  const cantidadPrimera = correosPrimera.length;
  const segunda = ejecutarTanda();
  comprobar(segunda.status === 0, `la segunda tanda termina en cero${segunda.stderr ? `: ${segunda.stderr.trim()}` : ''}`);
  comprobar(mensajes().length === cantidadPrimera, 'la segunda tanda no manda correos nuevos');
  comprobar(instantanea() === estadoPrimera, 'la segunda tanda no hace cambios adicionales en la base');
  comprobar(sinContadorNiNcfAjeno(mensajes()), 'la segunda tanda no manda nada al contador ni NCF a terceros');

  console.log(`\n${comprobaciones - fallos}/${comprobaciones} comprobaciones pasaron\n`);
  process.exit(fallos ? 1 : 0);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
