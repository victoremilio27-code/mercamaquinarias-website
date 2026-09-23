/**
 * probar-seguridad.js — que los agujeros cerrados sigan cerrados.
 *
 *   node tools/probar-seguridad.js
 *
 * POR QUÉ EXISTE
 *
 * Los fallos que comprueba este archivo no se veían leyendo el código:
 * todos parecían correctos y tres de ellos tenían encima un comentario
 * afirmando que hacían justo lo contrario de lo que hacían. Un aviso de
 * contacto que salía en cada pulsación en vez de una vez al día. Un
 * tope por IP que se saltaba cambiando una cabecera. El precio mínimo
 * del vendedor viajando en la ficha pública. Son la clase de cosa que
 * alguien "simplifica" dentro de seis meses sin saber qué sujetaba.
 *
 * Corre contra una base TEMPORAL —`.tmp/prueba-seguridad/`— que se
 * borra y se rehace en cada ejecución. No toca la base real.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/* Antes de cargar db.js: la ruta del archivo se resuelve al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-seguridad');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
const api = require('./api.js');
const facturas = require('./facturas.js');

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

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Se prueba por aquí y no llamando a las funciones sueltas porque lo
   que importa es exactamente lo que ve quien pregunta desde fuera. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-seguridad', ...cabeceras };
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

    /* `manejar` recibe la ruta ya resuelta como tercer argumento: es
       serve.js quien la decodifica antes de entregársela. */
    const ruta = new URL(url, 'http://localhost').pathname;
    api.manejar(req, res, ruta);
    setImmediate(() => {
      if (cuerpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(cuerpo), 'utf8'));
      req.emit('end');
    });
  });
}

(async () => {
  console.log('\nMercaMaquinarias · comprobaciones de seguridad\n');

  /* ── Preparación: un anunciante con un anuncio ───────────── */
  const { idUsuario } = db.crearCuenta({
    correo: 'vendedor@ejemplo.test',
    clave: 'UnaClaveLargaYSegura9',
    nombre: 'Vendedor de prueba',
    telefono: '8095551234',
    tipo: 'particular',
  });
  const org = db.organizacionDe(idUsuario);

  const creado = db.crearAnuncio({
    idOrg: org.id,
    usuarioId: idUsuario,
    categoria: 'camiones',
    subcategoria: 'volteo',
    marca: 'peterbilt',
    modelo: '567',
    anio: 2019,
    condicion: 'usado',
    usoValor: 120000,
    usoUnidad: 'km',
    descripcion: 'Camion de volteo en buen estado para la prueba.',
    provincia: 'santo-domingo',
    precio: 4500000,
    precioMinimo: 3900000,
    moneda: 'DOP',
    modalidadPrecio: 'ofertas',
    vence: db.sumarDias(30),
    fotos: ['/fotos/2026-09/a.jpg', '/fotos/2026-09/b.jpg', '/fotos/2026-09/c.jpg'],
    telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos', nota: null }],
  });
  const idAnuncio = creado.idAnuncio || creado.id || creado;

  /* ── 1 · el precio mínimo no sale en la ficha pública ────── */
  console.log('El precio minimo del vendedor');
  const publica = await pedir({ url: `/api/anuncios/${idAnuncio}` });
  const a = (publica.datos || {}).anuncio || {};
  comprobar(publica.codigo === 200, 'la ficha publica responde 200');

  /* Primero que el anuncio venga DE VERDAD. Sin esto, un 404 dejaría
     todos los campos en undefined y las tres comprobaciones de abajo
     pasarían en vacío: la prueba diría que el precio mínimo no sale
     cuando lo que no sale es el anuncio entero. */
  const llego = a.id === idAnuncio;
  comprobar(llego, 'el anuncio pedido es el que vuelve');
  comprobar(llego && a.precio === 4500000, 'el precio de venta si sale');
  comprobar(llego && a.precio_minimo === undefined, 'el precio MINIMO no sale sin sesion');
  comprobar(llego && a.usuario_id === undefined, 'tampoco sale el id del usuario dueno');
  comprobar(llego && a.suscripcion_id === undefined, 'tampoco el de la suscripcion');

  /* Que el dato siga existiendo para quien tiene derecho: si el filtro
     lo borrara de la base, el panel dejaria de funcionar y nadie se
     enteraria hasta que un dealer preguntara por su suelo de venta. */
  comprobar(db.anuncio(idAnuncio).precio_minimo === 3900000,
    'pero en la base sigue guardado, para el dueno');

  /* ── 2 · un aviso de contacto por persona y dia ──────────── */
  console.log('\nEl aviso de contacto al vendedor');
  const visitante = db.huella('190.80.1.1', 'navegador-de-prueba');
  comprobar(db.anotarEvento(idAnuncio, 'whatsapp', visitante) === 'contado',
    'el primer contacto del dia cuenta y avisa');
  comprobar(db.anotarEvento(idAnuncio, 'whatsapp', visitante) === 'repetido',
    'el segundo del MISMO visitante no vuelve a avisar');
  comprobar(db.anotarEvento(idAnuncio, 'whatsapp', visitante) === 'repetido',
    'ni el tercero');

  const otro = db.huella('190.80.9.9', 'otro-navegador');
  comprobar(db.anotarEvento(idAnuncio, 'whatsapp', otro) === 'contado',
    'otra persona distinta si avisa');

  /* Repetido NO es un error del cliente: la visita es legítima y el
     evento se guardó. Solo un tipo desconocido o un anuncio que no
     existe son entrada inválida. */
  comprobar(db.anotarEvento(idAnuncio, 'inventado', visitante) === 'invalido',
    'un tipo de evento desconocido si es entrada invalida');
  comprobar(db.anotarEvento('no-existe', 'vista', visitante) === 'invalido',
    'y un anuncio inexistente tambien');

  /* El evento crudo se sigue guardando siempre, que es lo que permite
     detectar el fraude de clics. Lo que no se repite es el aviso. */
  const crudos = db.abrir()
    .prepare("SELECT COUNT(*) AS n FROM eventos WHERE anuncio_id = ? AND tipo = 'whatsapp'")
    .get(idAnuncio).n;
  comprobar(crudos === 4, `los 4 eventos crudos si quedan guardados (hay ${crudos})`);

  /* ── 3 · el tope por origen no se salta con una cabecera ─── */
  console.log('\nEl tope de la ruta de eventos');
  const primera = await pedir({
    metodo: 'POST',
    url: '/api/eventos',
    cuerpo: { anuncio: idAnuncio, tipo: 'vista' },
    cabeceras: { 'x-forwarded-for': '190.80.2.2' },
  });
  comprobar(primera.codigo === 202, 'un evento normal se acepta');

  /* Una recarga de la misma ficha por la misma persona: sigue siendo
     202. Con un 400 aquí, cada visitante que volviera a una ficha veía
     un error rojo en la consola del navegador. */
  const repetida = await pedir({
    metodo: 'POST',
    url: '/api/eventos',
    cuerpo: { anuncio: idAnuncio, tipo: 'vista' },
    cabeceras: { 'x-forwarded-for': '190.80.2.2' },
  });
  comprobar(repetida.codigo === 202 && repetida.datos.contado === false,
    'repetir la visita se acepta (202) pero no se vuelve a contar');

  const rara = await pedir({
    metodo: 'POST',
    url: '/api/eventos',
    cuerpo: { anuncio: idAnuncio, tipo: 'inventado' },
    cabeceras: { 'x-forwarded-for': '190.80.2.2' },
  });
  comprobar(rara.codigo === 400, 'un evento inventado si se rechaza con 400');

  /* Lo que hacia el atacante: una IP inventada distinta en cada
     peticion. Antes estrenaba contador cada vez y no se limitaba
     nunca. Ahora se lee el ULTIMO elemento, que lo pone el proxy de
     casa, asi que todas caen en la misma cuenta. */
  let rechazadas = 0;
  for (let i = 0; i < 320; i++) {
    const r = await pedir({
      metodo: 'POST',
      url: '/api/eventos',
      cuerpo: { anuncio: idAnuncio, tipo: 'vista' },
      cabeceras: { 'x-forwarded-for': `10.0.0.${i % 250}, 190.80.2.2` },
    });
    if (r.codigo === 429) rechazadas++;
  }
  comprobar(rechazadas > 0,
    `cambiar X-Forwarded-For en cada peticion ya NO salta el tope (${rechazadas} rechazadas)`);

  /* Y que la cabecera de Cloudflare manda sobre la otra: una IP real
     distinta tiene derecho a su propia cuenta. */
  const conCf = await pedir({
    metodo: 'POST',
    url: '/api/eventos',
    cuerpo: { anuncio: idAnuncio, tipo: 'vista' },
    cabeceras: { 'cf-connecting-ip': '201.5.5.5', 'x-forwarded-for': '190.80.2.2' },
  });
  comprobar(conCf.codigo === 202,
    'una IP distinta segun CF-Connecting-IP estrena su propia cuenta');

  /* ── 4 · las secuencias que se vigilan ───────────────────── */
  console.log('\nEl aviso de comprobantes fiscales');
  const vigiladas = db.secuenciasNcf()
    .filter((s) => s.activa && s.usa_sitio)
    .map((s) => s.tipo);
  comprobar(vigiladas.includes('B01') && vigiladas.includes('B04'),
    `se vigilan las que el sitio emite: ${vigiladas.join(', ')}`);
  comprobar(!vigiladas.includes('B13') && !vigiladas.includes('B15'),
    'y no las que consume el contador por fuera');
  comprobar(facturas.secuenciasBajas().length === 0,
    'con las secuencias recien cargadas no avisa de nada');

  console.log(`\n${bien} bien, ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})();
