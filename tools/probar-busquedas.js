/**
 * probar-busquedas.js — paso 2 de las fases 15 y 16: las dos migraciones
 * y la capa de base de las búsquedas guardadas.
 *
 *   node tools/probar-busquedas.js
 *
 * POR QUÉ EXISTE
 *
 * Es el contrato que usan las tareas de Codex que vienen detrás (rutas,
 * interfaz, correo y tarea diaria): si esto cambia, cambian ellas. Lo que
 * se fija aquí es lo que no se ve leyendo una ruta: que la base rechaza
 * JSON roto en las columnas que filtra el catálogo, que el enlace de baja
 * no se guarda en claro, que la misma búsqueda no se duplica y que un
 * anuncio no se avisa dos veces a la misma búsqueda.
 *
 * Corre contra una base TEMPORAL en `.tmp/prueba-busquedas/`.
 */

const fs = require('fs');
const path = require('path');

/* Antes de cargar db.js: la ruta del archivo se resuelve al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-busquedas');
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
const lanza = (fn) => { try { fn(); return null; } catch (e) { return e; } };
const ejecuta = (sql, ...args) => db.abrir().prepare(sql).run(...args);
const fila = (sql, ...args) => db.abrir().prepare(sql).get(...args);

function cuenta(correoCuenta) {
  const { idUsuario } = db.crearCuenta({
    correo: correoCuenta, clave: 'UnaClaveLargaYSegura9', nombre: 'Prueba Búsquedas',
    telefono: '8095550000', tipo: 'particular',
  });
  return { idUsuario, org: db.organizacionDe(idUsuario) };
}

console.log('\n1 · Fase 15: especificaciones e implementos en el anuncio');
{
  const ana = cuenta('ana-esp@ejemplo.test');
  const idAnuncio = db.crearBorrador({ idOrg: ana.org.id, idPlan: 'destacado', dias: 30 });
  const anuncio = db.anuncio(idAnuncio);
  comprobar(anuncio.especificaciones === null && anuncio.implementos_lista === null,
    'un anuncio nace sin especificaciones (los viejos siguen igual)');

  let e = lanza(() => ejecuta('UPDATE anuncios SET especificaciones = ? WHERE id = ?',
    JSON.stringify({ 'peso-operativo': 20.5, 'potencia-neta': 150 }), idAnuncio));
  comprobar(!e, 'acepta un objeto JSON');
  e = lanza(() => ejecuta('UPDATE anuncios SET implementos_lista = ? WHERE id = ?',
    JSON.stringify(['martillo-hidraulico', 'pulgar']), idAnuncio));
  comprobar(!e, 'acepta una lista JSON de implementos');
  e = lanza(() => ejecuta("UPDATE anuncios SET especificaciones = '{roto' WHERE id = ?", idAnuncio));
  comprobar(!!e, 'rechaza texto que no es JSON en especificaciones');
  e = lanza(() => ejecuta("UPDATE anuncios SET especificaciones = '[1,2]' WHERE id = ?", idAnuncio));
  comprobar(!!e, 'rechaza una lista donde va un objeto');
  e = lanza(() => ejecuta("UPDATE anuncios SET implementos_lista = '{\"a\":1}' WHERE id = ?", idAnuncio));
  comprobar(!!e, 'rechaza un objeto donde va una lista');
  e = lanza(() => ejecuta('UPDATE anuncios SET especificaciones = NULL, implementos_lista = NULL WHERE id = ?', idAnuncio));
  comprobar(!e, 'se pueden vaciar');

  ejecuta('UPDATE anuncios SET especificaciones = ?, implementos_lista = ? WHERE id = ?',
    JSON.stringify({ 'peso-operativo': 20.5 }), JSON.stringify(['martillo-hidraulico']), idAnuncio);
  const porPeso = fila(`SELECT COUNT(*) AS n FROM anuncios
    WHERE json_extract(especificaciones, '$."peso-operativo"') >= 20`).n;
  const porImplemento = fila(`SELECT COUNT(*) AS n FROM anuncios
    WHERE EXISTS (SELECT 1 FROM json_each(implementos_lista) WHERE value = 'martillo-hidraulico')`).n;
  comprobar(porPeso === 1 && porImplemento === 1, 'se filtran con json_extract y json_each');
}

console.log('\n2 · Fase 16: guardar, listar y borrar búsquedas');
const bea = cuenta('bea-busca@ejemplo.test');
const filtros = { categoria: 'excavadoras', anioMin: 2015 };
const g1 = db.guardarBusqueda({ idUsuario: bea.idUsuario, filtros, resumen: 'Excavadoras · desde 2015' });
{
  comprobar(!!g1.id && g1.repetida === false, 'guardar devuelve el id');
  const f = fila('SELECT * FROM busquedas_guardadas WHERE id = ?', g1.id);
  const testigo = db.testigoBajaBusqueda(g1.id);
  comprobar(testigo.startsWith(`${g1.id}.`) && testigo === db.testigoBajaBusqueda(g1.id)
    && !JSON.stringify(f).includes(testigo.split('.').pop()),
  'el testigo de baja se recalcula igual y no está en la base');
  comprobar(f.revisada_hasta === f.creada, 'revisada_hasta arranca al guardar: no avisa de lo que ya había');

  const g2 = db.guardarBusqueda({ idUsuario: bea.idUsuario, filtros: { anioMin: 2015, categoria: 'excavadoras' }, resumen: 'x' });
  comprobar(g2.id === g1.id && g2.repetida === true, 'la misma búsqueda (en otro orden) no se duplica');
  comprobar(db.busquedasDe(bea.idUsuario).length === 1, 'la cuenta tiene una sola');

  const lista = db.busquedasDe(bea.idUsuario);
  comprobar(lista[0].filtros.categoria === 'excavadoras' && lista[0].activa === true && !('baja_hash' in lista[0]),
    'busquedasDe devuelve los filtros como objeto y sin el hash');

  const e = lanza(() => db.guardarBusqueda({ idUsuario: bea.idUsuario, filtros: null, resumen: 'x' }));
  comprobar(!!e, 'sin filtros no se guarda');

  const otra = cuenta('otra-busca@ejemplo.test');
  comprobar(db.borrarBusqueda(g1.id, otra.idUsuario) === false && db.busquedasDe(bea.idUsuario).length === 1,
    'nadie borra la búsqueda de otra cuenta');

  for (let i = 0; i < db.TOPE_BUSQUEDAS; i++) {
    db.guardarBusqueda({ idUsuario: otra.idUsuario, filtros: { anioMin: 2000 + i }, resumen: `desde ${2000 + i}` });
  }
  const sobra = db.guardarBusqueda({ idUsuario: otra.idUsuario, filtros: { anioMin: 1990 }, resumen: 'x' });
  comprobar(sobra.error === 'tope' && db.busquedasDe(otra.idUsuario).length === db.TOPE_BUSQUEDAS,
    `tope de ${db.TOPE_BUSQUEDAS} por cuenta`);
}

console.log('\n3 · Baja desde el correo');
{
  const g = db.guardarBusqueda({ idUsuario: bea.idUsuario, filtros, resumen: 'Excavadoras · desde 2015' });
  const bueno = db.testigoBajaBusqueda(g.id);
  const otraFirma = `${g.id}.${'A'.repeat(bueno.length - g.id.length - 1)}`;
  comprobar(db.darDeBajaBusqueda('no-es-un-testigo') === null && db.darDeBajaBusqueda(undefined) === null
    && db.darDeBajaBusqueda(otraFirma) === null && db.darDeBajaBusqueda(g.id) === null,
  'un testigo inventado, sin firma o con la firma cambiada no da de baja nada');
  comprobar(db.busquedasActivas().some((x) => x.id === g.id), 'y la alerta sigue activa');
  const b = db.darDeBajaBusqueda(bueno);
  comprobar(b && b.id === g.id && b.activa === false, 'el testigo bueno apaga la alerta');
  comprobar(db.busquedasDe(bea.idUsuario).length === 1, 'pero no la borra: sigue en la cuenta');
  comprobar(!db.busquedasActivas().some((x) => x.id === g.id), 'y ya no sale en la tarea diaria');
  const r = db.guardarBusqueda({ idUsuario: bea.idUsuario, filtros, resumen: 'Excavadoras · desde 2015' });
  comprobar(r.id === g.id && db.busquedasActivas().some((x) => x.id === g.id), 'guardarla de nuevo la reactiva');
  comprobar(db.darDeBajaBusqueda(bueno) && db.darDeBajaBusqueda(bueno).activa === false,
    'el enlace de un correo viejo sigue sirviendo después');
  db.guardarBusqueda({ idUsuario: bea.idUsuario, filtros, resumen: 'Excavadoras · desde 2015' });
}

console.log('\n4 · Lo que usa la tarea diaria');
{
  const activas = db.busquedasActivas();
  const suya = activas.find((x) => x.usuario_id === bea.idUsuario);
  comprobar(suya && suya.correo === 'bea-busca@ejemplo.test' && suya.filtros.categoria === 'excavadoras',
    'busquedasActivas trae el correo del dueño y los filtros como objeto');

  const carla = cuenta('carla-vende@ejemplo.test');
  const idA = db.crearBorrador({ idOrg: carla.org.id, idPlan: 'destacado', dias: 30 });
  const despues = new Date(Date.now() + 1000).toISOString();
  ejecuta("UPDATE anuncios SET estado = 'activo', publicado = ?, categoria = 'excavadoras', anio = 2018 WHERE id = ?", despues, idA);
  const idViejo = db.crearBorrador({ idOrg: carla.org.id, idPlan: 'destacado', dias: 30 });
  ejecuta("UPDATE anuncios SET estado = 'activo', publicado = '2020-01-01T00:00:00.000Z' WHERE id = ?", idViejo);
  const nuevos = db.anunciosPublicadosDesde(suya.revisada_hasta);
  comprobar(nuevos.some((a) => a.id === idA) && !nuevos.some((a) => a.id === idViejo),
    'anunciosPublicadosDesde trae solo lo publicado después');
  comprobar('itbis_incluido' in nuevos[0] && 'especificaciones' in nuevos[0] && 'implementos_lista' in nuevos[0],
    'con las columnas que lee alertas.coincide y las de la fase 15');

  comprobar(db.anotarAlertaEnviada(suya.id, idA) === true, 'la primera vez se anota');
  comprobar(db.anotarAlertaEnviada(suya.id, idA) === false, 'la segunda no: el mismo anuncio no se avisa dos veces');
  comprobar(db.avanzarRevisionBusqueda(suya.id, despues) === true
    && db.avanzarRevisionBusqueda(suya.id, '2020-01-01T00:00:00.000Z') === false,
  'revisada_hasta solo avanza, nunca retrocede');
}

console.log('\n5 · Eliminar la cuenta borra sus búsquedas');
{
  const dani = cuenta('dani-busca@ejemplo.test');
  db.marcarCorreoVerificado(dani.idUsuario);
  db.guardarBusqueda({ idUsuario: dani.idUsuario, filtros, resumen: 'x' });
  const r = db.eliminarCuenta(dani.idUsuario);
  comprobar(!r.bloqueo && db.busquedasDe(dani.idUsuario).length === 0, 'no le quedan búsquedas ni alertas');
}

console.log(`\n${bien} ok, ${mal} MAL`);
process.exit(mal ? 1 : 0);
