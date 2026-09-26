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
function pedir({ metodo = 'GET', url, cuerpo, trozos, cabeceras = {} }) {
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
      if (trozos) {
        /* Para probar el cuerpo partido: los trozos llegan tal cual,
           cortados por donde quiera quien llama. */
        trozos.forEach((t) => req.emit('data', t));
      } else if (cuerpo !== undefined) {
        req.emit('data', Buffer.from(JSON.stringify(cuerpo), 'utf8'));
      }
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
    subcategoria: 'cam-volteo',
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
    serie: 'PB567-19-XK4410',
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

  /* ── 1b · el numero de serie tampoco ────────────────────── */
  /* publicar.html promete que la serie solo la ve el personal, y esta
     ruta la entregaba a cualquiera: la consulta es un SELECT a.*. Con
     la serie se van la nota de su revision y quien la reviso. */
  console.log('\nEl numero de serie del vendedor');
  comprobar(llego && a.serie === undefined, 'el numero de serie NO sale sin sesion');
  comprobar(llego && a.serie_nota === undefined && a.serie_revisada_por === undefined
    && a.serie_revision === undefined, 'ni la nota, ni quien la reviso, ni el resultado en crudo');
  comprobar(llego && a.serie_cotejada === false, 'solo un booleano: serie_cotejada, hoy en falso');

  const { idUsuario: idCurioso } = db.crearCuenta({
    correo: 'curioso@ejemplo.test',
    clave: 'UnaClaveLargaYSegura9',
    nombre: 'Otra cuenta',
    telefono: '8095554321',
    tipo: 'particular',
  });
  const ajena = await pedir({ url: `/api/anuncios/${idAnuncio}`,
    cabeceras: { cookie: `te_sesion=${db.abrirSesion(idCurioso)}` } });
  comprobar(ajena.codigo === 200 && ajena.datos.anuncio.serie === undefined,
    'otra cuenta con sesion tampoco la ve');
  const suya = await pedir({ url: `/api/anuncios/${idAnuncio}`,
    cabeceras: { cookie: `te_sesion=${db.abrirSesion(idUsuario)}` } });
  comprobar(suya.codigo === 200 && suya.datos.anuncio.serie === 'PB567-19-XK4410',
    'el dueno si ve su serie');

  db.anotarRevisionSerie(idAnuncio, { resultado: 'conforme', nombreAdmin: 'Personal de prueba' });
  const cotejada = ((await pedir({ url: `/api/anuncios/${idAnuncio}` })).datos || {}).anuncio || {};
  comprobar(cotejada.serie_cotejada === true && cotejada.serie === undefined
    && cotejada.serie_revisada_por === undefined,
    'cotejada: la ficha dice serie_cotejada y sigue sin la serie ni el nombre del empleado');
  const suyaCotejada = ((await pedir({ url: `/api/anuncios/${idAnuncio}`,
    cabeceras: { cookie: `te_sesion=${db.abrirSesion(idUsuario)}` } })).datos || {}).anuncio || {};
  comprobar(suyaCotejada.serie_cotejada === true && suyaCotejada.serie_revisada_por === undefined,
    'ni siquiera al dueno le llega el nombre del empleado que la reviso');

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

  /* ── 4 · los acentos partidos entre dos trozos ───────────── */
  console.log('\nEl cuerpo de la peticion con acentos');

  /* El caso real: un anuncio con ocho fotos dentro del JSON llega en
     decenas de trozos, y el corte cae donde cae. Aquí se parte a
     propósito por la mitad de una «ó», que en UTF-8 son dos bytes.
     Antes se decodificaba cada trozo por separado y salían dos signos
     de interrogación, sin lanzar ninguna excepción: el JSON seguía
     siendo válido porque sus llaves y comillas son ASCII. */
  const textoConTilde = 'Excavación de orugas, año 2019, 1.200 horas. Niñera incluida.';
  const cuerpoCrudo = Buffer.from(JSON.stringify({ anuncio: idAnuncio, tipo: 'vista', nota: textoConTilde }), 'utf8');

  const dondeLaO = cuerpoCrudo.indexOf(Buffer.from('ó', 'utf8'));
  comprobar(dondeLaO > 0, 'la prueba encuentra la vocal acentuada para partirla');

  const partido = await pedir({
    metodo: 'POST',
    url: '/api/eventos',
    trozos: [cuerpoCrudo.subarray(0, dondeLaO + 1), cuerpoCrudo.subarray(dondeLaO + 1)],
    cabeceras: { 'cf-connecting-ip': '201.9.9.9' },
  });
  comprobar(partido.codigo === 202,
    'un cuerpo partido por la mitad de un caracter se sigue leyendo bien');

  /* Y la comprobación directa: que el texto llegue entero. Se hace
     contra la ruta de solicitudes, que sí guarda texto libre. */
  const conTilde = await pedir({
    metodo: 'POST',
    url: '/api/solicitudes',
    trozos: (() => {
      const b = Buffer.from(JSON.stringify({
        servicio: 'contacto',
        nombre: 'Señor Muñoz',
        telefono: '8095559876',
        detalle: { 'Qué necesita': textoConTilde },
      }), 'utf8');
      const corte = b.indexOf(Buffer.from('ó', 'utf8'));
      return [b.subarray(0, corte + 1), b.subarray(corte + 1)];
    })(),
    cabeceras: { 'cf-connecting-ip': '201.9.9.10' },
  });
  comprobar(conTilde.codigo === 201, 'la solicitud con el cuerpo partido se acepta');

  const guardada = db.solicitudesServicio ? db.solicitudesServicio({ limite: 1 })[0] : null;
  const detalleGuardado = guardada ? JSON.stringify(guardada) : '';
  comprobar(detalleGuardado.includes('Excavaci') && !detalleGuardado.includes('�'),
    'y el texto queda guardado SIN caracteres corrompidos');

  /* ── 5 · todo cobro deja su comprobante ──────────────────── */
  console.log('\nEl comprobante de cada cobro');

  const legales = require('../assets/legales.js');
  Object.values(legales.DOCUMENTOS || {}).forEach((doc) => {
    db.registrarAceptacion({
      usuarioId: idUsuario,
      documento: doc.id,
      version: doc.version,
      ip: '127.0.0.1',
      userAgent: 'prueba',
    });
  });

  const testigo = db.abrirSesion(idUsuario);
  const conSesion = { cookie: `te_sesion=${testigo}`, 'cf-connecting-ip': '201.7.7.7' };

  /* El Estándar está a cero por la promoción de lanzamiento, así que
     no sirve para esto: un cobro de cero no tiene nada que comprobar y
     es correcto que no emita documento. Se usa un nivel que sí cobra. */
  const gratis = await pedir({
    metodo: 'POST',
    url: '/api/membresias',
    cuerpo: { plan: 'estandar', cupo: 1, dias: 30 },
    cabeceras: conSesion,
  });
  comprobar(gratis.codigo === 201 && gratis.datos.cobro.total === 0,
    'el Estandar en promocion no cobra nada');
  comprobar(!gratis.datos.comprobante,
    'y un cobro de cero no emite comprobante, que es lo correcto');

  const compra = await pedir({
    metodo: 'POST',
    url: '/api/membresias',
    cuerpo: { plan: 'destacado', cupo: 1, dias: 30 },
    cabeceras: conSesion,
  });
  comprobar(compra.codigo === 201 && compra.datos.cobro.total > 0,
    `comprar un nivel de pago si cobra (fue ${compra.codigo})`);
  comprobar(!!(compra.datos && compra.datos.comprobante),
    'comprar cupos emite su comprobante');

  /* El que faltaba. Se cobraba la diferencia, el pago quedaba aprobado
     y no salía ningun documento: ingreso cobrado y no declarado que
     ninguna tarea recuperaba después. */
  const idSusc = compra.datos && compra.datos.membresia && compra.datos.membresia.id;
  const antes = db.facturas({ limite: 500 }).length;
  const ampliacion = await pedir({
    metodo: 'POST',
    url: `/api/membresias/${idSusc}/ampliar`,
    cuerpo: { cupo: 3 },
    cabeceras: conSesion,
  });
  const despues = db.facturas({ limite: 500 }).length;

  comprobar(ampliacion.codigo === 200, `ampliar cupos responde 200 (fue ${ampliacion.codigo})`);
  comprobar(!!(ampliacion.datos && ampliacion.datos.comprobante),
    'AMPLIAR cupos tambien emite su comprobante');
  comprobar(despues === antes + 1,
    `y queda una factura mas en la base (${antes} -> ${despues})`);

  /* ── 6 · las fotos del anuncio son del sitio ─────────────── */
  console.log('\nLas fotos de un anuncio');

  /* Un PNG de un pixel, válido de verdad: fotos.js comprueba el tipo
     por los bytes de cabecera, no por la extensión ni por lo que diga
     el cliente. */
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
    + 'AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  const subida = await pedir({
    metodo: 'POST',
    url: '/api/fotos',
    cuerpo: { completa: PNG },
    cabeceras: conSesion,
  });
  comprobar(subida.codigo === 201 && /^\/fotos\//.test(subida.datos.completa || ''),
    'una foto subida al sitio devuelve su ruta /fotos/...');
  const rutaBuena = subida.datos.completa;

  /* Lo que se colaba: las imágenes en base64 dentro del propio JSON del
     anuncio. Treinta de estas son veinticuatro megas guardados en la
     base, dentro de una fila. */
  const conDataUri = await pedir({
    metodo: 'POST',
    url: '/api/anuncios',
    cuerpo: {
      categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt', modelo: '567',
      anio: 2019, condicion: 'usado', usoValor: 1000, usoUnidad: 'km',
      descripcion: 'Prueba de fotos incrustadas en el cuerpo de la peticion.',
      provincia: 'santo-domingo', precio: 1000000, moneda: 'DOP',
      fotos: [PNG, PNG, PNG],
      telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }],
    },
    cabeceras: conSesion,
  });
  comprobar(conDataUri.codigo === 400,
    `las fotos en base64 dentro del anuncio se rechazan (fue ${conDataUri.codigo})`);

  const conUrlAjena = await pedir({
    metodo: 'POST',
    url: '/api/anuncios',
    cuerpo: {
      categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt', modelo: '567',
      anio: 2019, condicion: 'usado', usoValor: 1000, usoUnidad: 'km',
      descripcion: 'Prueba de fotos alojadas en otro sitio cualquiera.',
      provincia: 'santo-domingo', precio: 1000000, moneda: 'DOP',
      fotos: ['https://otro-sitio.example/foto.jpg', rutaBuena, rutaBuena],
      telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }],
    },
    cabeceras: conSesion,
  });
  comprobar(conUrlAjena.codigo === 400,
    `una foto alojada fuera tambien (quedaban 2 de 3, fue ${conUrlAjena.codigo})`);

  /* Y que con fotos de verdad sí se publique: una validación que lo
     rechaza todo no es una validación, es una avería. */
  const bienPublicado = await pedir({
    metodo: 'POST',
    url: '/api/anuncios',
    cuerpo: {
      categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt', modelo: '567',
      anio: 2019, condicion: 'usado', usoValor: 1000, usoUnidad: 'km',
      descripcion: 'Prueba de publicacion con fotos subidas al sitio como debe ser.',
      provincia: 'santo-domingo', precio: 1000000, moneda: 'DOP',
      fotos: [rutaBuena, rutaBuena, rutaBuena],
      telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }],
    },
    cabeceras: conSesion,
  });
  comprobar(bienPublicado.codigo === 201,
    `con fotos subidas al sitio si se publica (fue ${bienPublicado.codigo}: `
    + `${(bienPublicado.datos || {}).error || 'ok'})`);

  /* ── 6b · la vista previa al compartir ───────────────────── */
  console.log('\nLa tarjeta que ve quien comparte el enlace');

  const metadatos = require('./meta.js');
  const idPublicado = (bienPublicado.datos || {}).anuncio
    && (bienPublicado.datos.anuncio.id || bienPublicado.datos.anuncio);
  const ficha = metadatos.para('/equipo.html', new URLSearchParams({ id: String(idPublicado) }));

  comprobar(!!ficha, 'la ficha compone sus propios metadatos');
  comprobar(!!ficha && /peterbilt|Peterbilt/.test(ficha.titulo) && /567/.test(ficha.titulo),
    `el titulo nombra la maquina: ${ficha ? ficha.titulo : '(ninguno)'}`);
  comprobar(!!ficha && /1,000,000|RD\$/.test(ficha.titulo), 'y lleva el precio');
  comprobar(!!ficha && ficha.imagen.includes('/fotos/'),
    `la imagen es la foto del equipo, no el logotipo (${ficha ? ficha.imagen.split('/').pop() : ''})`);

  /* Y que el HTML servido lleve de verdad lo compuesto: una cosa es
     calcularlo y otra que llegue al rastreador. */
  const htmlFicha = metadatos.aplicar(
    fs.readFileSync(path.join(__dirname, '..', 'equipo.html'), 'utf8'), ficha);
  comprobar(!/<meta property="og:title" content="Equipo">/.test(htmlFicha),
    'el og:title generico "Equipo" ya no esta');
  comprobar((htmlFicha.match(/<meta property="og:title"/g) || []).length === 1,
    'y no se duplico la etiqueta: sigue habiendo una sola');
  comprobar(/<link rel="canonical"/.test(htmlFicha), 'la pagina gana su canonical');
  comprobar(/application\/ld\+json/.test(htmlFicha), 'y sus datos estructurados');

  /* Sin parámetro no se toca nada: esa página va por la caché normal. */
  comprobar(metadatos.para('/equipo.html', new URLSearchParams()) === null,
    'equipo.html sin id se sirve tal cual, sin pasar por aqui');
  comprobar(metadatos.para('/index.html', new URLSearchParams({ id: '1' })) === null,
    'y la portada tampoco entra por este camino');

  /* ── 7 · un comprobante sin papel se repone ──────────────── */
  console.log('\nEl PDF de un comprobante');

  const emitida = db.facturas({ limite: 1 })[0];

  /* `ruta_pdf` se guarda relativa a la carpeta de comprobantes: hay que
     resolverla para preguntarle al disco. */
  const pdfDe = (f) => (f && f.ruta_pdf ? facturas.rutaAbsoluta(f.ruta_pdf) : '');

  comprobar(!!(emitida && fs.existsSync(pdfDe(emitida))),
    'el comprobante emitido tiene su PDF en disco');

  /* Lo que pasaba: si dibujar fallaba, quedaba una factura con NCF y
     sin papel, el correo salía SIN adjunto diciendo «adjuntamos su
     comprobante», y al marcarse como enviada ninguna tarea volvía a
     mirarla. El documento existía en la base y en ningún otro sitio. */
  fs.rmSync(pdfDe(emitida), { force: true });
  comprobar(!fs.existsSync(pdfDe(emitida)), 'se borra el PDF a proposito para la prueba');

  const reparadas = facturas.regenerarPdfsPendientes({ limite: 50 });
  comprobar(reparadas.hechos.includes(emitida.numero),
    `el comprobante sin papel se vuelve a dibujar (${reparadas.hechos.join(', ') || 'ninguno'})`);

  const repuesta = db.facturaPorId(emitida.id);
  comprobar(!!(repuesta.ruta_pdf && fs.existsSync(pdfDe(repuesta))),
    'y el archivo vuelve a estar en disco');

  /* Y que NO haya tocado los demás: reponer lo que falta es una cosa,
     redibujar comprobantes ya entregados es otra que el propio archivo
     prohíbe en su cabecera. */
  const segundaPasada = facturas.regenerarPdfsPendientes({ limite: 50 });
  comprobar(segundaPasada.hechos.length === 0,
    'y en una segunda pasada no redibuja nada, porque ya no falta nada');
  comprobar(repuesta.numero === emitida.numero && repuesta.total === emitida.total
    && repuesta.ncf === emitida.ncf,
    'con el mismo numero, el mismo NCF y el mismo importe: se repone, no se reescribe');

  /* ── 7b · el tráfico y la huella del visitante ───────────── */
  console.log('\nEl trafico del sitio');

  /* La sal vivía en memoria y se estrenaba en cada arranque, pese a
     que el comentario la llamaba «diaria»: con Restart=always y cada
     despliegue, todo el mundo volvía a contar desde cero el mismo día
     y la deduplicación no deduplicaba nada. */
  const h1 = db.huella('190.1.1.1', 'navegador');
  const h2 = db.huella('190.1.1.1', 'navegador');
  comprobar(h1 === h2, 'la misma persona da la misma huella');
  comprobar(db.huella('190.1.1.2', 'navegador') !== h1, 'y otra IP da otra distinta');

  const salGuardada = db.abrir()
    .prepare('SELECT COUNT(*) AS n FROM sales_visitante').get().n;
  comprobar(salGuardada === 1, 'la sal del dia vive en la base, no en memoria del proceso');

  db.anotarVisita('/index.html', h1);
  db.anotarVisita('/index.html', h1);
  db.anotarVisita('/equipos.html', h1);
  const otroVisitante = db.huella('190.2.2.2', 'otro');
  db.anotarVisita('/index.html', otroVisitante);

  const hoyDia = new Date().toISOString().slice(0, 10);
  const t = db.trafico({ desde: hoyDia, hasta: hoyDia });

  comprobar(t.vistas === 4, `se cuentan las 4 vistas (fueron ${t.vistas})`);
  /* El error clásico: sumar la columna de visitantes de cada página
     cuenta dos veces a quien miró dos páginas. Aquí son DOS personas,
     no tres, por mucho que una viera dos páginas distintas. */
  comprobar(t.unicos === 2, `y DOS visitantes distintos, no tres (fueron ${t.unicos})`);
  comprobar(t.porDia[0] && t.porDia[0].visitantes === 2,
    'el resumen por dia tampoco los cuenta dos veces');

  /* ── 7c · el informe de negocio ──────────────────────────── */
  console.log('\nEl informe a gerencia');

  const inf = db.informe({ desde: hoyDia, hasta: hoyDia });
  comprobar(inf.dinero.cobros.total > 0,
    `el informe recoge lo cobrado (${inf.dinero.cobros.n} cobro(s))`);
  comprobar(inf.comprobantes.porTipo.length > 0, 'y los comprobantes emitidos');
  comprobar(inf.ncf.length === 2, 'y cuantos NCF quedan de las que el sitio emite');
  comprobar(inf.trafico.unicos === 2, 'y el trafico, con el mismo criterio');

  const correo = require('./correo.js');
  comprobar(correo.BUZONES.gerencia === 'gerencia@inversionesxzt.com',
    'el informe va a gerencia@inversionesxzt.com');
  comprobar(correo.BUZONES.facturacion === 'facturacion@mercamaquinarias.com',
    'con copia a facturacion@mercamaquinarias.com');

  /* ── 7d · los servicios que hoy no se ofrecen ───────────── */
  console.log('\nLos servicios apagados');

  const servicios = require('../assets/servicios.js');
  comprobar(!servicios.seOfrece('transporte') && !servicios.seOfrece('financiamiento'),
    'transporte y financiamiento estan apagados');
  comprobar(servicios.seOfrece('alquiler') && servicios.seOfrece('importacion'),
    'alquiler e importacion siguen encendidos');

  /* Por la API no se puede pedir un servicio que no se presta: antes
     se aceptaba, se mandaba el correo y se daba un numero de
     referencia, y alguien se quedaba esperando una cotizacion que no
     iba a llegar nunca. */
  const pideTransporte = await pedir({
    metodo: 'POST',
    url: '/api/solicitudes',
    cuerpo: {
      servicio: 'transporte',
      nombre: 'Alguien con un camion',
      telefono: '8095551111',
      correo: 'alguien@ejemplo.test',
    },
    cabeceras: { 'cf-connecting-ip': '201.3.3.3' },
  });
  comprobar(pideTransporte.codigo === 400,
    `no se admite una solicitud de transporte (fue ${pideTransporte.codigo})`);

  const pideAlquiler = await pedir({
    metodo: 'POST',
    url: '/api/solicitudes',
    cuerpo: {
      servicio: 'alquiler',
      nombre: 'Alguien con una obra',
      telefono: '8095552222',
      correo: 'otro@ejemplo.test',
    },
    cabeceras: { 'cf-connecting-ip': '201.3.3.4' },
  });
  comprobar(pideAlquiler.codigo === 201, 'y si una de alquiler, que si se ofrece');

  /* Que el codigo siga ahi, apagado y no borrado: es lo que hace que
     encenderlos mas adelante sea una linea y no un mes. */
  comprobar(fs.existsSync(path.join(__dirname, '..', 'transporte.html'))
    && fs.existsSync(path.join(__dirname, '..', 'financiamiento.html')),
    'las paginas siguen en el repositorio, listas para volver');
  comprobar(servicios.paginasApagadas().length === 2,
    'y el servidor sabe cuales no debe servir');

  /* ── 8 · las secuencias que se vigilan ───────────────────── */
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

  /* ── 9 · un cupo, un anuncio ─────────────────────────────── */
  /* Marcar vendido libera el cupo; publicar otro lo ocupa; reactivar el
     primero daba dos anuncios por un cupo, repetible. La API aceptaba
     cualquier estado de partida y ninguna prueba nombraba 'vendido'. */
  console.log('\nReactivar un anuncio vendido');
  const { idUsuario: idListo } = db.crearCuenta({
    correo: 'listo@ejemplo.test',
    clave: 'UnaClaveLargaYSegura9',
    nombre: 'Anunciante con un cupo',
    telefono: '8095559876',
    tipo: 'particular',
  });
  const orgListo = db.organizacionDe(idListo);
  const unCupo = db.comprarCupos({
    idOrg: orgListo.id, idPlan: 'estandar', cupo: 1, dias: 30,
    cobro: { subtotal: 0, itbis: 0, total: 0, referencia: 'PRUEBA-UN-CUPO' },
  });
  const equipo = (modelo) => {
    const r = db.crearAnuncio({
      idOrg: orgListo.id, usuarioId: idListo, idSuscripcion: unCupo.id,
      categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'mack', modelo, anio: 2018,
      condicion: 'usado', provincia: 'santo-domingo', precio: 3000000, moneda: 'DOP',
      vence: db.sumarDias(30), fotos: [], telefonos: [],
    });
    return r.idAnuncio || r.id || r;
  };
  const galletaListo = { cookie: `te_sesion=${db.abrirSesion(idListo)}` };
  const estado = (id, valor) => pedir({ metodo: 'PATCH', url: `/api/anuncios/${id}`,
    cuerpo: { estado: valor }, cabeceras: galletaListo });

  const primero = equipo('granite');
  const vendido = await estado(primero, 'vendido');
  comprobar(vendido.codigo === 200, `marcar vendido responde 200 (fue ${vendido.codigo})`);
  const segundo = equipo('anthem');
  const reactivar = await estado(primero, 'activo');
  comprobar(reactivar.codigo === 409, `reactivarlo con el cupo ocupado se niega (fue ${reactivar.codigo})`);
  comprobar(db.anuncio(primero).estado === 'vendido', 'y el anuncio sigue vendido en la base');
  const aPausa = await estado(primero, 'pausado');
  comprobar(aPausa.codigo === 409, `pausarlo tampoco cuela: pausado tambien ocupa (fue ${aPausa.codigo})`);

  await estado(segundo, 'retirado');
  const ahoraSi = await estado(primero, 'activo');
  comprobar(ahoraSi.codigo === 200 && db.anuncio(primero).estado === 'activo',
    `con el cupo libre, reactivarlo si se puede (fue ${ahoraSi.codigo})`);
  const retiradoVuelve = await estado(segundo, 'activo');
  comprobar(retiradoVuelve.codigo === 409, `un retirado tampoco vuelve sin cupo (fue ${retiradoVuelve.codigo})`);

  const pausa = await estado(primero, 'pausado');
  const vuelve = await estado(primero, 'activo');
  comprobar(pausa.codigo === 200 && vuelve.codigo === 200,
    'pausar y reactivar con el cupo lleno sigue funcionando: no cambia lo ocupado');
  const ocupados = db.suscripcionesDe(orgListo.id).find((s) => s.id === unCupo.id);
  comprobar(ocupados && ocupados.ocupados === 1, `al final, un cupo y un anuncio que lo ocupa (${ocupados && ocupados.ocupados})`);

  const ajenaPatch = await pedir({ metodo: 'PATCH', url: `/api/anuncios/${primero}`,
    cuerpo: { estado: 'vendido' }, cabeceras: { cookie: `te_sesion=${db.abrirSesion(idCurioso)}` } });
  comprobar(ajenaPatch.codigo === 404, `otra cuenta no puede cambiarle el estado (fue ${ajenaPatch.codigo})`);

  console.log(`\n${bien} bien, ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})();
