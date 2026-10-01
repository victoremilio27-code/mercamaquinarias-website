/**
 * Arnés de la tarea diaria de alertas. Usa una base y una bandeja
 * desechables; el transporte `archivo` permite revisar el mensaje real.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const CARPETA = path.join(__dirname, '..', '.tmp', 'prueba-alertas-tarea');
fs.rmSync(CARPETA, { recursive: true, force: true });
fs.rmSync(path.join(__dirname, '..', '.tmp', 'correos'), { recursive: true, force: true });
fs.mkdirSync(CARPETA, { recursive: true });

process.env.MERCA_DB = path.join(CARPETA, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-alertas-prueba';
process.env.MERCA_ENV = path.join(CARPETA, 'no-existe.env');
process.env.MERCA_SITIO = 'https://prueba.mercamaquinarias.invalid';

const db = require('./db');
const correo = require('./correo');
const tareas = require('./tareas');

let comprobaciones = 0;
let fallos = 0;
function ok(condicion, texto) {
  comprobaciones++;
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function conexion() {
  const d = new DatabaseSync(process.env.MERCA_DB);
  d.exec('PRAGMA foreign_keys = ON');
  return d;
}

function ejecuta(sql, ...valores) {
  const d = conexion();
  try { return d.prepare(sql).run(...valores); } finally { d.close(); }
}

function consulta(sql, ...valores) {
  const d = conexion();
  try { return d.prepare(sql).get(...valores); } finally { d.close(); }
}

let numero = 0;
function anuncio({ organizacion, publicado, modelo, marca = 'caterpillar', provincia = 'Santiago', precio = 2500000 }) {
  const id = `alerta-anuncio-${++numero}`;
  ejecuta(`INSERT INTO anuncios
    (id, organizacion_id, estado, categoria, subcategoria, marca, modelo, anio,
     precio, moneda, provincia, publicado, creado, actualizado)
    VALUES (?, ?, 'activo', 'construccion', 'excavadoras', ?, ?, 2022,
            ?, 'DOP', ?, ?, ?, ?)`,
  id, organizacion, marca, modelo, precio, provincia, publicado, publicado, publicado);
  return id;
}

function correos() {
  if (!fs.existsSync(correo.BANDEJA)) return [];
  return fs.readdirSync(correo.BANDEJA)
    .filter((nombre) => nombre.endsWith('.txt'))
    .map((nombre) => fs.readFileSync(path.join(correo.BANDEJA, nombre), 'utf8'));
}

(async () => {
  db.abrir();
  const cuenta = db.crearCuenta({
    correo: 'alertas@prueba.invalid', clave: 'ClaveLargaSegura123', nombre: 'Ada',
    telefono: '8095550101', tipo: 'particular',
  });
  const org = db.organizacionDe(cuenta.idUsuario).id;

  const vieja = anuncio({ organizacion: org, publicado: '2026-09-30T23:59:59.000Z', modelo: 'Vieja' });
  const primera = db.guardarBusqueda({
    idUsuario: cuenta.idUsuario,
    filtros: { categoria: 'construccion', marca: 'caterpillar', provincia: 'Santiago' },
    resumen: 'Excavadoras Caterpillar',
  });
  ejecuta('UPDATE busquedas_guardadas SET revisada_hasta = ? WHERE id = ?', '2026-10-01T00:00:00.000Z', primera.id);
  const nuevas = [
    anuncio({ organizacion: org, publicado: '2026-10-01T01:00:00.000Z', modelo: '320' }),
    anuncio({ organizacion: org, publicado: '2026-10-01T02:00:00.000Z', modelo: '336' }),
  ];
  anuncio({ organizacion: org, publicado: '2026-10-01T03:00:00.000Z', modelo: 'No coincide', marca: 'komatsu' });

  const baja = db.guardarBusqueda({
    idUsuario: cuenta.idUsuario, filtros: { marca: 'komatsu' }, resumen: 'Komatsu',
  });
  ejecuta('UPDATE busquedas_guardadas SET activa = 0, revisada_hasta = ? WHERE id = ?', '2026-10-01T00:00:00.000Z', baja.id);

  const doce = db.guardarBusqueda({
    idUsuario: cuenta.idUsuario, filtros: { provincia: 'La Vega' }, resumen: 'Equipos en La Vega',
  });
  ejecuta('UPDATE busquedas_guardadas SET revisada_hasta = ? WHERE id = ?', '2026-10-02T00:00:00.000Z', doce.id);
  for (let i = 0; i < 12; i++) {
    anuncio({ organizacion: org, publicado: `2026-10-02T${String(i + 1).padStart(2, '0')}:00:00.000Z`, modelo: `Serie ${i + 1}`, provincia: 'La Vega' });
  }

  console.log('\n1 · primera pasada');
  await tareas.TAREAS.alertas();
  const primeraPasada = correos();
  ok(primeraPasada.length === 2, `dos búsquedas activas con resultados: ${primeraPasada.length} correos`);
  const correoDos = primeraPasada.find((mensaje) => mensaje.includes('Excavadoras Caterpillar')) || '';
  ok(nuevas.every((id) => correoDos.includes(`equipo.html?id=${id}`)), 'el primer correo incluye los dos anuncios nuevos');
  ok(!correoDos.includes(`equipo.html?id=${vieja}\n`), 'el anuncio anterior a guardar la búsqueda no se avisa');
  ok(correoDos.includes(`alertas.html?baja=${encodeURIComponent(db.testigoBajaBusqueda(primera.id))}`), 'incluye el enlace firmado de baja');
  ok(correoDos.includes('Responder a: ayuda@mercamaquinarias.com'), 'las respuestas van al buzón de soporte');
  ok(!/\b(?:809|829|849)[ -]?\d{3}[ -]?\d{4}\b/.test(correoDos), 'el correo no publica teléfonos');
  const correoDoce = primeraPasada.find((mensaje) => mensaje.includes('Equipos en La Vega')) || '';
  ok((correoDoce.match(/equipo\.html\?id=/g) || []).length === 10, 'el correo largo muestra un máximo de diez anuncios');
  ok(correoDoce.includes('Y 2 más:') && correoDoce.includes('/equipos.html?provincia=La+Vega'), 'los dos restantes llevan al catálogo filtrado');
  ok(!primeraPasada.some((mensaje) => mensaje.includes('Asunto: Nuevo equipo para su búsqueda: Komatsu')), 'la búsqueda dada de baja no recibe correo');
  ok(consulta('SELECT COUNT(*) AS n FROM alertas_enviadas').n === 14, 'se anotan las catorce coincidencias una sola vez');

  console.log('\n2 · segunda pasada');
  await tareas.TAREAS.alertas();
  ok(correos().length === 2, 'una segunda pasada no manda ningún correo');

  console.log(`\n${comprobaciones - fallos}/${comprobaciones} comprobaciones pasaron\n`);
  process.exitCode = fallos ? 1 : 0;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
