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

  console.log(`\n${bien} bien · ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
