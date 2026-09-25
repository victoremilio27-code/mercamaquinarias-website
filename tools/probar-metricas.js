/**
 * probar-metricas.js — alcance y métricas del vendedor (fase 10).
 *
 *   node tools/probar-metricas.js
 *
 * QUÉ SE COMPRUEBA
 *
 * Lo que el anunciante usa para decidir si renueva: que cada contacto
 * quede atribuido a su anuncio y a su hora, y que no se pierda cuando
 * los eventos crudos se purgan. Y lo que el comprador usa sin cuenta:
 * la lista de guardados, la tarjeta de WhatsApp al compartir y la copia
 * de un anuncio para publicar otro igual.
 *
 * La deduplicación de eventos ya la vigila `probar-seguridad.js` y aquí
 * no se repite: esto prueba lo que se construyó encima de ella.
 *
 * Corre contra una base TEMPORAL —`.tmp/prueba-metricas/`— que se borra
 * y se rehace en cada ejecución. No toca la base real.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { execFileSync } = require('child_process');

/* Antes de cargar db.js y fotos.js: las dos rutas se resuelven al
   importarlos. Si se fijan después, la prueba escribe en la base y en
   la carpeta de fotos de verdad. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-metricas');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FOTOS = path.join(BANCO, 'fotos');
process.env.MERCA_VIDEOS = path.join(BANCO, 'videos');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
const api = require('./api.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) { bien++; console.log(`  ok  ${que}`); return; }
  mal++;
  console.log(`  MAL ${que}`);
}

/* Una petición de verdad contra el enrutador, con req y res fingidos,
   igual que en probar-seguridad.js: lo que importa es lo que ve quien
   pregunta desde fuera, no lo que devuelve una función suelta. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-metricas', 'cf-connecting-ip': '201.3.3.3', ...cabeceras };
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

/* Una cuenta con su organización y su cookie de sesión. */
function cuenta(correo, nombre) {
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre, telefono: '8095551234', tipo: 'particular',
  });
  const org = db.organizacionDe(idUsuario);
  return {
    idUsuario,
    org,
    cabeceras: { cookie: `te_sesion=${db.abrirSesion(idUsuario)}` },
  };
}

function anuncio(dueno, extra = {}) {
  const creado = db.crearAnuncio({
    idOrg: dueno.org.id,
    idUsuario: dueno.idUsuario,
    categoria: 'camiones',
    subcategoria: 'cam-volteo',
    marca: 'peterbilt',
    modelo: '567',
    anio: 2019,
    condicion: 'usado',
    usoValor: 120000,
    usoUnidad: 'km',
    serie: '1NPCX4TX0KD000001',
    descripcion: 'Camion de volteo en buen estado para la prueba.',
    provincia: 'santo-domingo',
    municipio: 'Los Alcarrizos',
    precio: 4500000,
    precioMinimo: 3900000,
    moneda: 'DOP',
    modalidadPrecio: 'ofertas',
    vence: db.sumarDias(30),
    fotos: ['/fotos/2026-09/a.jpg', '/fotos/2026-09/b.jpg', '/fotos/2026-09/c.jpg'],
    telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos', nota: 'Pedro' }],
    ...extra,
  });
  return creado.idAnuncio || creado.id || creado;
}

const contactosDe = (idAnuncio) => db.abrir()
  .prepare('SELECT * FROM contactos_anuncio WHERE anuncio_id = ? ORDER BY id').all(idAnuncio);

(async () => {
  console.log('\nMercaMaquinarias · alcance y métricas del vendedor\n');

  const ana = cuenta('ana@ejemplo.test', 'Ana Vendedora');
  const beto = cuenta('beto@ejemplo.test', 'Beto Vendedor');
  const idAna = anuncio(ana);
  const idBeto = anuncio(beto, { marca: 'mack', modelo: 'Granite' });

  /* ── 1 · contactos atribuibles ───────────────────────────── */
  console.log('Contactos atribuibles (MET-03)');

  const v1 = db.huella('190.80.1.1', 'navegador-uno');
  const v2 = db.huella('190.80.2.2', 'navegador-dos');

  comprobar(db.anotarEvento(idAna, 'whatsapp', v1) === 'contado', 'el primer whatsapp del dia cuenta');
  comprobar(contactosDe(idAna).length === 1, 'y deja una fila en contactos_anuncio');

  db.anotarEvento(idAna, 'whatsapp', v1);
  db.anotarEvento(idAna, 'whatsapp', v1);
  comprobar(contactosDe(idAna).length === 1,
    'las pulsaciones repetidas de la misma persona el mismo dia no suman filas');

  db.anotarEvento(idAna, 'whatsapp', v2);
  comprobar(contactosDe(idAna).length === 2, 'otra persona si suma una fila');

  db.anotarEvento(idAna, 'telefono', v1);
  const filas = contactosDe(idAna);
  comprobar(filas.length === 3 && filas[2].canal === 'telefono',
    'una llamada queda con su canal: telefono');

  db.anotarEvento(idAna, 'vista', v1);
  db.anotarEvento(idAna, 'favorito', v1);
  comprobar(contactosDe(idAna).length === 3, 'una vista o un favorito no son contactos');

  const f = filas[0];
  comprobar(f.organizacion_id === ana.org.id && f.dia === db.hoy() && /T/.test(f.creado),
    'cada fila lleva la organizacion, el dia y la hora');

  const columnas = db.abrir().prepare('PRAGMA table_info(contactos_anuncio)').all().map((c) => c.name);
  comprobar(!columnas.includes('visitante') && !columnas.some((c) => /ip|huella/i.test(c)),
    `la tabla no guarda quien fue: ${columnas.join(', ')}`);

  /* La lista y el total del panel tienen que contar lo mismo. */
  const resumen = db.resumenOrganizacion(ana.org.id);
  comprobar(resumen.totales.whatsapp + resumen.totales.telefono === contactosDe(idAna).length,
    'la lista cuadra con el total de contactos del panel');

  db.anotarEvento(idBeto, 'whatsapp', v1);

  console.log('\nLa ruta /api/mis-contactos');
  const suyos = await pedir({ url: '/api/mis-contactos', cabeceras: ana.cabeceras });
  const lista = (suyos.datos || {}).contactos || [];
  comprobar(suyos.codigo === 200 && lista.length === 3, `la duena ve sus 3 contactos (vio ${lista.length})`);
  comprobar(lista.every((c) => c.anuncio_id === idAna),
    'y ninguno de otra organizacion');
  comprobar(lista[0] && lista[0].marca === 'peterbilt' && lista[0].modelo === '567' && lista[0].anio === 2019,
    'cada contacto dice que equipo fue');
  comprobar(lista[0] && lista[0].creado >= lista[lista.length - 1].creado,
    'del mas reciente al mas viejo');
  comprobar(lista.every((c) => c.visitante === undefined), 'la respuesta tampoco trae la huella');

  const soloWa = await pedir({ url: '/api/mis-contactos?canal=whatsapp', cabeceras: ana.cabeceras });
  comprobar(((soloWa.datos || {}).contactos || []).length === 2, 'se filtra por canal');

  const raro = await pedir({ url: "/api/mis-contactos?canal=x'--&anuncio=';DROP", cabeceras: ana.cabeceras });
  comprobar(raro.codigo === 200 && ((raro.datos || {}).contactos || []).length === 3,
    'un filtro inventado no filtra ni rompe nada');

  const porAnuncio = await pedir({ url: `/api/mis-contactos?anuncio=${idBeto}`, cabeceras: ana.cabeceras });
  comprobar(((porAnuncio.datos || {}).contactos || []).length === 0,
    'pedir los contactos de un anuncio ajeno devuelve cero');

  const deBeto = await pedir({ url: '/api/mis-contactos', cabeceras: beto.cabeceras });
  comprobar(((deBeto.datos || {}).contactos || []).length === 1, 'la otra organizacion solo ve el suyo');

  const anonimo = await pedir({ url: '/api/mis-contactos' });
  comprobar(anonimo.codigo === 401, 'sin sesion, 401');

  /* La migración rellena con lo que `eventos` aún conserva. Se prueba
     de verdad: se deshace la migración, se deja un rastro en `eventos`
     y otro proceso abre la base, que es cuando migra. */
  console.log('\nLa migracion rellena desde los eventos que quedan');
  const d = db.abrir();
  d.exec('DROP TABLE contactos_anuncio');
  d.prepare("DELETE FROM migraciones WHERE id = '2026-09-contactos-anuncio'").run();
  d.prepare('DELETE FROM eventos WHERE anuncio_id = ?').run(idBeto);
  const crudo = d.prepare('INSERT INTO eventos (anuncio_id, tipo, dia, visitante, creado) VALUES (?, ?, ?, ?, ?)');
  crudo.run(idBeto, 'whatsapp', '2026-07-01', 'h1', '2026-07-01T14:00:00.000Z');
  crudo.run(idBeto, 'whatsapp', '2026-07-01', 'h1', '2026-07-01T14:05:00.000Z');
  crudo.run(idBeto, 'whatsapp', '2026-07-01', 'h2', '2026-07-01T15:00:00.000Z');
  crudo.run(idBeto, 'telefono', '2026-07-02', null, '2026-07-02T10:00:00.000Z');
  crudo.run(idBeto, 'telefono', '2026-07-02', null, '2026-07-02T10:01:00.000Z');
  crudo.run(idBeto, 'vista', '2026-07-02', 'h1', '2026-07-02T10:02:00.000Z');

  execFileSync(process.execPath, ['-e', "require('./tools/db.js').abrir()"], {
    cwd: path.join(__dirname, '..'), env: process.env, stdio: 'pipe',
  });

  const rellenas = contactosDe(idBeto);
  comprobar(rellenas.length === 4,
    `h1 dos veces cuenta uno, h2 otro y las dos llamadas sin huella dos: 4 (hay ${rellenas.length})`);
  comprobar(rellenas.some((c) => c.creado === '2026-07-01T14:00:00.000Z'),
    'la hora rellenada es la del primer contacto de esa persona');
  comprobar(rellenas.every((c) => c.organizacion_id === beto.org.id), 'con su organizacion');

  /* Borrar el anuncio se lleva sus contactos: no quedan filas que
     apunten a un equipo que ya no existe. */
  db.borrarAnuncio(idBeto, beto.org.id);
  comprobar(contactosDe(idBeto).length === 0, 'borrar el anuncio borra sus contactos');

  /* ── 2 · guardados y compartir ───────────────────────────── */
  console.log('\nGuardados por ids (MET-01)');

  const idActivo = anuncio(ana, { modelo: '389' });
  const idPausado = anuncio(ana, { modelo: '379' });
  db.cambiarEstadoAnuncio(idPausado, ana.org.id, 'pausado');

  const porIds = await pedir({ url: `/api/anuncios?ids=${idActivo},${idPausado},no-existe,${idActivo}` });
  const vinieron = ((porIds.datos || {}).anuncios || []).map((a) => a.id);
  comprobar(porIds.codigo === 200 && vinieron.length === 1 && vinieron[0] === idActivo,
    `solo vuelve el activo; el pausado y el inventado no (${vinieron.length})`);

  const inyeccion = await pedir({ url: `/api/anuncios?ids=${encodeURIComponent("';DROP TABLE anuncios;--")}` });
  comprobar(inyeccion.codigo === 200 && ((inyeccion.datos || {}).anuncios || []).length === 0,
    'un id con comillas se descarta y la respuesta es vacia, no el catalogo entero');
  comprobar(!!db.anuncio(idActivo), 'y la tabla sigue ahi');

  const vacia = await pedir({ url: '/api/anuncios?ids=' });
  comprobar(((vacia.datos || {}).anuncios || []).length === 0 && (vacia.datos || {}).total === 0,
    'ids vacio no devuelve el catalogo entero');

  const muchos = Array.from({ length: 61 }, (_, i) => `x${i}`);
  muchos[60] = idActivo;
  const tope = await pedir({ url: `/api/anuncios?ids=${muchos.join(',')}` });
  comprobar(((tope.datos || {}).anuncios || []).length === 0,
    'mas de 60 ids se recortan: el 61 no se consulta');

  const catalogo = await pedir({ url: '/api/anuncios' });
  comprobar(((catalogo.datos || {}).anuncios || []).length >= 2,
    'sin ids el catalogo sigue como siempre');

  console.log('\nFavoritos y compartidos en el panel (MET-01, MET-02)');
  const carla = cuenta('carla@ejemplo.test', 'Carla Vendedora');
  const idCarla = anuncio(carla);
  const antes = db.resumenOrganizacion(carla.org.id).totales;
  comprobar(antes.favoritos === 0 && antes.compartidos === 0, 'sin eventos, cero y cero');

  const favorito = await pedir({ metodo: 'POST', url: '/api/eventos', cuerpo: { anuncio: idCarla, tipo: 'favorito' } });
  const compartir = await pedir({ metodo: 'POST', url: '/api/eventos', cuerpo: { anuncio: idCarla, tipo: 'compartir' } });
  comprobar(favorito.codigo === 202 && compartir.codigo === 202, 'la ruta publica acepta favorito y compartir');

  const despues = db.resumenOrganizacion(carla.org.id).totales;
  comprobar(despues.favoritos === 1, `la tarjeta Guardados deja de decir 0 (${despues.favoritos})`);
  comprobar(despues.compartidos === 1, `y el resumen cuenta lo compartido (${despues.compartidos})`);
  const fila = db.anunciosDeOrganizacion(carla.org.id)[0];
  comprobar(fila.favoritos === 1 && fila.compartidos === 1, 'tambien por anuncio');

  console.log('\nLa tarjeta al compartir por WhatsApp (MET-02)');
  const metadatos = require('./meta.js');
  const idConFotos = anuncio(carla, {
    fotos: [
      { url: '/fotos/2026-09/grande.jpg', miniatura: '/fotos/2026-09/chica.jpg' },
      { url: '/fotos/2026-09/otra.jpg', miniatura: '/fotos/2026-09/otra-chica.jpg' },
      { url: '/fotos/2026-09/mas.jpg', miniatura: null },
    ],
  });
  const tarjeta = metadatos.para('/equipo.html', new URLSearchParams({ id: idConFotos }));
  comprobar(!!tarjeta && tarjeta.imagen.endsWith('/fotos/2026-09/chica.jpg'),
    `la imagen es la miniatura de la primera foto (${tarjeta ? tarjeta.imagen : 'ninguna'})`);
  comprobar(!!tarjeta && /Peterbilt|peterbilt/.test(tarjeta.titulo) && /RD\$/.test(tarjeta.titulo),
    `el titulo lleva el equipo y el precio: ${tarjeta ? tarjeta.titulo : ''}`);
  comprobar(!!tarjeta && /grande\.jpg$/.test(tarjeta.jsonld.image),
    'los datos estructurados siguen con la foto completa');

  const html = metadatos.aplicar(
    fs.readFileSync(path.join(__dirname, '..', 'equipo.html'), 'utf8'), tarjeta);
  comprobar(/<meta property="og:image" content="[^"]*chica\.jpg">/.test(html),
    'el HTML servido lleva la miniatura en og:image');
  comprobar(!/og:image:width/.test(html) && !/og:image:height/.test(html),
    'y ya no declara 1200x630 para una foto que no mide eso');

  const sinFotos = anuncio(carla, { fotos: [] });
  const deMarca = metadatos.para('/equipo.html', new URLSearchParams({ id: sinFotos }));
  const htmlMarca = metadatos.aplicar(
    fs.readFileSync(path.join(__dirname, '..', 'equipo.html'), 'utf8'), deMarca);
  comprobar(deMarca.imagen === metadatos.IMAGEN_MARCA && /og:image:width/.test(htmlMarca),
    'sin fotos, la imagen de marca conserva sus medidas');

  console.log(`\n${bien} bien · ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
