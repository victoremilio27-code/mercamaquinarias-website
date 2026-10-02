/**
 * probar-documentos.js — tanda 5, paso 2: la migración y la capa de base
 * de los documentos adjuntos a un anuncio (FICHA-01).
 *
 *   node tools/probar-documentos.js
 *
 * POR QUÉ EXISTE
 *
 * Es el contrato de las tareas de Codex que vienen detrás (rutas de la
 * API e interfaz): si esto cambia, cambian ellas. Fija lo que no se ve
 * leyendo una ruta: los topes por archivo, por anuncio y total; que la
 * base rechaza una ruta con «..»; que un borrador no enseña sus
 * documentos a nadie más que a su dueño; que la ruta en disco no sale en
 * la lista pública, y que borrar el anuncio o la cuenta devuelve las
 * rutas para limpiar el disco.
 *
 * Corre contra una base TEMPORAL en `.tmp/prueba-documentos/`.
 */

const fs = require('fs');
const path = require('path');

/* Antes de cargar db.js: la ruta de la base y los topes se leen al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-documentos');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
process.env.MERCA_DOCUMENTOS_TOPE_MB = '20';

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
const lanza = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const ejecuta = (sql, ...args) => db.abrir().prepare(sql).run(...args);
const fila = (sql, ...args) => db.abrir().prepare(sql).get(...args);

const MB = 1024 * 1024;
let serie = 0;
const ruta = (ext = 'pdf') => `2026-10/prueba-${++serie}.${ext}`;

function cuenta(correoCuenta) {
  const { idUsuario } = db.crearCuenta({
    correo: correoCuenta, clave: 'UnaClaveLargaYSegura9', nombre: 'Prueba Documentos',
    telefono: '8095550000', tipo: 'particular',
  });
  return { idUsuario, org: db.organizacionDe(idUsuario) };
}
const anuncioDe = (c, estado = 'activo') => {
  const idAnuncio = db.crearBorrador({ idOrg: c.org.id, idPlan: 'destacado', dias: 30 });
  if (estado !== 'borrador') ejecuta('UPDATE anuncios SET estado = ? WHERE id = ?', estado, idAnuncio);
  return idAnuncio;
};

console.log('\n1 · Migración y topes');
{
  comprobar(!!fila("SELECT 1 FROM migraciones WHERE id = '2026-10-documentos-anuncio'"), 'migración anotada');
  comprobar(!!fila("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'ix_documentos_anuncio'"), 'con su índice');
  const t = db.TOPES_DOCUMENTOS;
  comprobar(t.bytesPorArchivo === 4 * MB && t.porAnuncio === 4 && t.bytesPorAnuncio === 10 * MB,
    'topes: 4 MB por archivo, 4 documentos y 10 MB por anuncio');
  comprobar(t.bytesTotal === 20 * MB, 'el total se lee de MERCA_DOCUMENTOS_TOPE_MB');
  comprobar(Object.isFrozen(t), 'los topes no se pueden cambiar en caliente');
  comprobar(db.TIPOS_DOCUMENTO.join() === 'application/pdf,image/jpeg,image/png,image/webp', 'PDF e imágenes, nada más');
}

console.log('\n2 · Subir: tipo, tamaño y dueño');
{
  const ana = cuenta('ana-doc@ejemplo.test');
  const beto = cuenta('beto-doc@ejemplo.test');
  const idA = anuncioDe(ana);
  const base = { idAnuncio: idA, idOrg: ana.org.id, idUsuario: ana.idUsuario };

  comprobar(db.motivoSinDocumento({ ...base, tipo: 'application/pdf', bytes: 1000 }) === null, 'un PDF pequeño se admite');
  comprobar(db.motivoSinDocumento({ ...base, tipo: 'text/html', bytes: 1000 }) === 'tipo', 'HTML no');
  comprobar(db.motivoSinDocumento({ ...base, tipo: 'image/svg+xml', bytes: 1000 }) === 'tipo', 'SVG no (lleva script)');
  comprobar(db.motivoSinDocumento({ ...base, tipo: 'application/pdf', bytes: 0 }) === 'vacio', 'vacío no');
  comprobar(db.motivoSinDocumento({ ...base, tipo: 'application/pdf', bytes: 4 * MB + 1 }) === 'tope-archivo',
    'un byte por encima de 4 MB no');
  comprobar(db.motivoSinDocumento({ ...base, idOrg: beto.org.id, tipo: 'application/pdf', bytes: 1000 }) === 'no-existe',
    'en un anuncio ajeno: «no existe», sin confirmar que existe');
  comprobar(db.motivoSinDocumento({ ...base, idAnuncio: 'no-hay', tipo: 'application/pdf', bytes: 1000 }) === 'no-existe',
    'en un anuncio que no existe, lo mismo');

  const r = db.agregarDocumento({ ...base, nombre: '  Informe\nde ../inspección.pdf ', tipo: 'application/pdf', bytes: 1234, ruta: ruta() });
  comprobar(r.documento && r.documento.id && r.documento.bytes === 1234 && r.documento.tipo === 'application/pdf',
    'agregarDocumento devuelve el documento');
  comprobar(r.documento.nombre === 'Informe de .. inspección.pdf', 'el nombre se limpia de saltos y barras');
  comprobar(!('ruta' in r.documento) && !('subido_por' in r.documento), 'sin la ruta en disco ni quién lo subió');
  comprobar(fila('SELECT subido_por FROM documentos_anuncio WHERE id = ?', r.documento.id).subido_por === ana.idUsuario,
    'en la base sí queda quién lo subió');
  comprobar(db.agregarDocumento({ ...base, nombre: 'x', tipo: 'text/html', bytes: 10, ruta: ruta('html') }).error === 'tipo',
    'agregarDocumento también comprueba (no confía en la llamada previa)');
}

console.log('\n3 · Topes por anuncio y total');
{
  const caro = cuenta('caro-doc@ejemplo.test');
  const idA = anuncioDe(caro);
  const base = { idAnuncio: idA, idOrg: caro.org.id, idUsuario: caro.idUsuario, nombre: 'Manual', tipo: 'application/pdf' };
  for (let i = 0; i < 3; i++) db.agregarDocumento({ ...base, bytes: 3 * MB, ruta: ruta() });
  comprobar(db.motivoSinDocumento({ ...base, bytes: 1 * MB + 1 }) === 'tope-anuncio', 'pasarse de 10 MB en el anuncio no');
  comprobar(db.agregarDocumento({ ...base, bytes: 1 * MB, ruta: ruta() }).documento, 'justo 10 MB sí');
  comprobar(db.motivoSinDocumento({ ...base, bytes: 1 }) === 'tope-cantidad', 'el quinto documento no');

  const dora = cuenta('dora-doc@ejemplo.test');
  const idB = anuncioDe(dora);
  const baseB = { idAnuncio: idB, idOrg: dora.org.id, idUsuario: dora.idUsuario, nombre: 'Otro', tipo: 'image/png' };
  /* Ya hay 10 MB de caro y ~1 KB de ana: 20 MB de tope total. */
  db.agregarDocumento({ ...baseB, bytes: 4 * MB, ruta: ruta('png') });
  db.agregarDocumento({ ...baseB, bytes: 4 * MB, ruta: ruta('png') });
  comprobar(db.motivoSinDocumento({ ...baseB, bytes: 2 * MB }) === 'tope-total', 'el tope total corta para todos');
  const e = db.espacioDocumentos();
  comprobar(e.documentos === 7 && e.bytes === 18 * MB + 1234 && e.tope === 20 * MB, 'espacioDocumentos suma todo');
}

console.log('\n4 · La base rechaza rutas peligrosas aunque falle la API');
{
  const eva = cuenta('eva-doc@ejemplo.test');
  const idA = anuncioDe(eva);
  const base = { idAnuncio: idA, idOrg: eva.org.id, nombre: 'x', tipo: 'application/pdf', bytes: 10 };
  comprobar(!!lanza(() => db.agregarDocumento({ ...base, ruta: '../etc/passwd' })), 'con «..» no');
  comprobar(!!lanza(() => db.agregarDocumento({ ...base, ruta: '/etc/passwd' })), 'absoluta no');
  comprobar(!!lanza(() => db.agregarDocumento({ ...base, ruta: '2026-10\\a.pdf' })), 'con barra invertida no');
  comprobar(!!lanza(() => db.agregarDocumento({ ...base, ruta: '' })), 'vacía no');
  const r = ruta();
  db.agregarDocumento({ ...base, ruta: r });
  comprobar(!!lanza(() => db.agregarDocumento({ ...base, ruta: r })), 'la misma ruta dos veces no');
}

console.log('\n5 · Quién ve qué');
{
  const fran = cuenta('fran-doc@ejemplo.test');
  const gil = cuenta('gil-doc@ejemplo.test');
  const idBorrador = anuncioDe(fran, 'borrador');
  const idPublicado = anuncioDe(fran, 'activo');
  const idVendido = anuncioDe(fran, 'vendido');
  const subir = (idAnuncio) => db.agregarDocumento({
    idAnuncio, idOrg: fran.org.id, nombre: 'Informe', tipo: 'application/pdf', bytes: 100, ruta: ruta(),
  }).documento;
  const dBorrador = subir(idBorrador);
  const dPublicado = subir(idPublicado);
  subir(idVendido);

  comprobar(db.documentosDe(idBorrador, fran.org.id).length === 1, 'el dueño ve los de su borrador');
  comprobar(db.documentosDe(idBorrador, gil.org.id) === null && db.documentosDe(idBorrador) === null,
    'nadie más: un borrador no existe para otros');
  comprobar(db.documentosDe(idPublicado).length === 1 && db.documentosDe(idVendido).length === 1,
    'los de un anuncio publicado o vendido los ve cualquiera, sin sesión');
  comprobar(!('ruta' in db.documentosDe(idPublicado)[0]), 'la lista no lleva la ruta en disco');
  comprobar(db.documentosDe('no-hay') === null, 'un anuncio que no existe: null');

  const dl = db.documentoParaDescargar(idPublicado, dPublicado.id);
  comprobar(dl && dl.ruta && dl.tipo === 'application/pdf' && dl.nombre === 'Informe', 'descargar uno publicado sin sesión');
  comprobar(db.documentoParaDescargar(idBorrador, dBorrador.id) === null
    && db.documentoParaDescargar(idBorrador, dBorrador.id, gil.org.id) === null, 'el de un borrador, nadie más');
  comprobar(!!db.documentoParaDescargar(idBorrador, dBorrador.id, fran.org.id), 'el dueño sí');
  comprobar(db.documentoParaDescargar(idPublicado, dBorrador.id) === null,
    'un documento pedido por otro anuncio: null (no se cruzan ids)');

  comprobar(db.borrarDocumento(idPublicado, dPublicado.id, gil.org.id) === null, 'borrar uno ajeno no');
  comprobar(db.borrarDocumento(idPublicado, dPublicado.id, fran.org.id) === dl.ruta, 'el dueño sí, y recibe la ruta');
  comprobar(db.borrarDocumento(idPublicado, dPublicado.id, fran.org.id) === null, 'la segunda vez ya no hay nada');
}

console.log('\n6 · Borrar el anuncio o la cuenta devuelve las rutas');
{
  const hugo = cuenta('hugo-doc@ejemplo.test');
  db.marcarCorreoVerificado(hugo.idUsuario);
  const idA = anuncioDe(hugo);
  const r1 = ruta();
  db.agregarDocumento({ idAnuncio: idA, idOrg: hugo.org.id, nombre: 'a', tipo: 'application/pdf', bytes: 10, ruta: r1 });
  const b = db.borrarAnuncio(idA, hugo.org.id);
  comprobar(Array.isArray(b.documentos) && b.documentos.length === 1 && b.documentos[0] === r1, 'borrarAnuncio devuelve documentos');
  comprobar(fila('SELECT COUNT(*) AS n FROM documentos_anuncio WHERE anuncio_id = ?', idA).n === 0, 'y no quedan filas');

  const idB = anuncioDe(hugo);
  const r2 = ruta();
  db.agregarDocumento({ idAnuncio: idB, idOrg: hugo.org.id, nombre: 'b', tipo: 'application/pdf', bytes: 10, ruta: r2 });
  const c = db.eliminarCuenta(hugo.idUsuario);
  comprobar(!c.bloqueo && Array.isArray(c.documentos) && c.documentos.includes(r2), 'eliminarCuenta devuelve documentos');
  comprobar(fila('SELECT COUNT(*) AS n FROM documentos_anuncio WHERE anuncio_id = ?', idB).n === 0, 'y no quedan filas');
}

console.log(`\n${bien} ok, ${mal} MAL`);
process.exit(mal ? 1 : 0);
