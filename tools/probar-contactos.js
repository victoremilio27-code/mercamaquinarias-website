/**
 * probar-contactos.js — que ningún teléfono sin verificar salga en un anuncio.
 *
 *   node tools/probar-contactos.js
 *
 * POR QUÉ EXISTE
 *
 * La ficha pintaba cualquier número que alguien escribiera al publicar.
 * Un estafador copia las fotos de un anuncio bueno, pone su teléfono y
 * el comprador no tiene cómo distinguirlo. La fase 9 (CONF-03) exige que
 * un anuncio solo enseñe teléfonos verificados, por correo hoy y por SMS
 * el día que se paguen los créditos de Brevo.
 *
 * Lo que se comprueba aquí es lo que nadie ve leyendo la ficha: que el
 * filtro está en el SERVIDOR (no basta con que el navegador lo esconda),
 * que un código no sirve para otro número ni otra organización, que el
 * SMS apagado no envía nada y que encenderlo no pide tocar el flujo.
 *
 * Corre contra una base TEMPORAL —`.tmp/prueba-contactos/`— que se
 * borra y se rehace en cada ejecución. No toca la base real.
 */

const fs = require('fs');
const path = require('path');

/* Antes de cargar db.js y correo.js: las rutas se resuelven al importarlos. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-contactos');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
delete process.env.MERCA_SMS;               // el interruptor, apagado como en producción

const { EventEmitter } = require('events');
const db = require('./db.js');
const correo = require('./correo.js');
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

/* ── Siembra ─────────────────────────────────────────────── */
function cuenta(correoCuenta, nombre) {
  const { idUsuario } = db.crearCuenta({
    correo: correoCuenta,
    clave: 'UnaClaveLargaYSegura9',
    nombre,
    telefono: '8095550000',
    tipo: 'particular',
  });
  db.marcarCorreoVerificado(idUsuario);
  return { idUsuario, org: db.organizacionDe(idUsuario) };
}

function anuncio(idOrg, idUsuario, telefonos) {
  const creado = db.crearAnuncio({
    idOrg,
    usuarioId: idUsuario,
    categoria: 'camiones',
    subcategoria: 'cam-volteo',
    marca: 'peterbilt',
    modelo: '567',
    anio: 2019,
    condicion: 'usado',
    usoValor: 120000,
    usoUnidad: 'km',
    descripcion: 'Camion de volteo para la prueba de contactos.',
    provincia: 'santo-domingo',
    precio: 4500000,
    moneda: 'DOP',
    modalidadPrecio: 'fijo',
    vence: db.sumarDias(30),
    fotos: ['/fotos/2026-09/a.jpg', '/fotos/2026-09/b.jpg', '/fotos/2026-09/c.jpg'],
    telefonos,
  });
  return creado.idAnuncio || creado.id || creado;
}

const sembrado = {};
function sembrar() {
  sembrado.a = cuenta('vendedora-a@ejemplo.test', 'Vendedora A');
  sembrado.b = cuenta('vendedor-b@ejemplo.test', 'Vendedor B');
  sembrado.anuncioA = anuncio(sembrado.a.org.id, sembrado.a.idUsuario, [
    { numero: '(809) 555-1234', tipo: 'ambos', nota: 'Ventas' },
    { numero: '829-555-9876', tipo: 'whatsapp', nota: null },
  ]);
  sembrado.anuncioB = anuncio(sembrado.b.org.id, sembrado.b.idUsuario, [
    { numero: '(809) 555-1234', tipo: 'ambos', nota: null },
  ]);
}

/* ── Bloque «La base» ────────────────────────────────────── */
function bloqueBase() {
  const { a, b, anuncioA } = sembrado;
  const idA = a.org.id;

  console.log('\nLa migración va al final');
  const ultima = db.abrir().prepare('SELECT id FROM migraciones ORDER BY rowid DESC LIMIT 1').get();
  comprobar(ultima && ultima.id === '2026-09-contactos-verificados',
    'la última migración aplicada es la de contactos verificados');

  console.log('\nLos números se comparan en dígitos');
  comprobar(db.normalizarNumero('(809) 555-1234') === '8095551234', '«(809) 555-1234» → 8095551234');
  comprobar(db.normalizarNumero('+1 809 555 1234') === '8095551234', '«+1 809 555 1234» → 8095551234');
  comprobar(db.normalizarNumero('555-1234') === null, 'un número de siete dígitos no vale');

  console.log('\nUn anuncio recién publicado no tiene nada verificado');
  let fila = db.anuncio(anuncioA);
  comprobar(fila.telefonos.length === 2 && fila.telefonos.every((t) => t.verificado === false && t.via === null),
    'anuncio() devuelve los dos teléfonos marcados sin verificar');

  console.log('\nPedir y confirmar un código');
  const pedido = db.pedirCodigoContacto({ idOrg: idA, numero: '(809) 555-1234', via: 'correo' });
  comprobar(pedido && /^\d{6}$/.test(pedido.codigo) && pedido.minutos === 15, 'se emite un código de seis dígitos, 15 minutos');
  const guardado = db.abrir().prepare('SELECT codigo_hash FROM contactos_verificados WHERE organizacion_id = ?').get(idA);
  comprobar(guardado && guardado.codigo_hash !== pedido.codigo && !guardado.codigo_hash.includes(pedido.codigo),
    'en la base solo queda el hash, no el código');

  const otroCodigo = pedido.codigo === '000000' ? '111111' : '000000';
  let r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8095551234', codigo: otroCodigo, idUsuario: a.idUsuario });
  comprobar(!r.ok && r.motivo === 'incorrecto' && r.restantes === 4, 'un código equivocado resta un intento');

  r = db.confirmarCodigoContacto({ idOrg: b.org.id, numero: '8095551234', codigo: pedido.codigo, idUsuario: b.idUsuario });
  comprobar(!r.ok, 'el código de A no verifica el mismo número para la organización B');

  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8295559876', codigo: pedido.codigo, idUsuario: a.idUsuario });
  comprobar(!r.ok, 'ni otro número de la misma organización');

  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '809.555.1234', codigo: pedido.codigo, idUsuario: a.idUsuario });
  comprobar(r.ok && r.via === 'correo', 'el código correcto verifica el número, por correo');

  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8095551234', codigo: pedido.codigo, idUsuario: a.idUsuario });
  comprobar(!r.ok, 'y no sirve una segunda vez');

  fila = db.anuncio(anuncioA);
  const [primero, segundo] = fila.telefonos;
  comprobar(primero.verificado === true && primero.via === 'correo', 'anuncio() marca el número verificado y su vía');
  comprobar(segundo.verificado === false, 'y el otro sigue sin verificar');
  comprobar(db.anuncio(sembrado.anuncioB).telefonos[0].verificado === false,
    'el mismo número en el anuncio de B sigue sin verificar');

  const ya = db.pedirCodigoContacto({ idOrg: idA, numero: '8095551234', via: 'correo' });
  comprobar(ya && ya.yaVerificado === true, 'pedir otra vez por correo un número ya verificado no emite código');
  const subir = db.pedirCodigoContacto({ idOrg: idA, numero: '8095551234', via: 'sms' });
  comprobar(subir && /^\d{6}$/.test(subir.codigo), 'pero sí por SMS, para subir de correo a SMS');
  comprobar(db.anuncio(anuncioA).telefonos[0].verificado === true, 'y mientras tanto sigue verificado');

  console.log('\nEl tope de intentos');
  const p2 = db.pedirCodigoContacto({ idOrg: idA, numero: '8295559876', via: 'correo' });
  const malo = p2.codigo === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) db.confirmarCodigoContacto({ idOrg: idA, numero: '8295559876', codigo: malo });
  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8295559876', codigo: p2.codigo });
  comprobar(!r.ok && r.motivo === 'agotado', 'tras cinco fallos ni el código correcto pasa');

  console.log('\nUn código vencido no sirve');
  const p3 = db.pedirCodigoContacto({ idOrg: idA, numero: '8295559876', via: 'correo' });
  db.abrir().prepare('UPDATE contactos_verificados SET codigo_expira = ? WHERE organizacion_id = ? AND numero = ?')
    .run(new Date(Date.now() - 1000).toISOString(), idA, '8295559876');
  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8295559876', codigo: p3.codigo });
  comprobar(!r.ok && r.motivo === 'vencido', 'vencido se rechaza');

  console.log('\nEl panel del anunciante');
  const lista = db.contactosDe(idA);
  const n1 = lista.find((c) => c.numero === '8095551234');
  const n2 = lista.find((c) => c.numero === '8295559876');
  comprobar(lista.length === 2 && n1 && n2, 'contactosDe lista los dos números de sus anuncios');
  comprobar(n1.verificado && n1.via === 'correo' && n1.anuncios === 1, 'con estado, vía y en cuántos anuncios va');
  comprobar(lista[0].numero === '8295559876', 'los sin verificar primero');

  console.log('\nLa purga no toca lo verificado');
  db.abrir().prepare('UPDATE contactos_verificados SET codigo_expira = ? WHERE organizacion_id = ? AND numero = ?')
    .run(new Date(Date.now() - 3 * 86400000).toISOString(), idA, '8295559876');
  db.purgar();
  const quedan = db.abrir().prepare('SELECT numero FROM contactos_verificados WHERE organizacion_id = ?').all(idA)
    .map((f) => f.numero);
  comprobar(quedan.length === 1 && quedan[0] === '8095551234', 'borra el pendiente abandonado y conserva el verificado');
}

/* ── Bloque «El SMS» ─────────────────────────────────────── */
function bloqueSms() {
  const bandeja = correo.BANDEJA_SMS;
  const cuantos = () => (fs.existsSync(bandeja) ? fs.readdirSync(bandeja).length : 0);

  console.log('\nCon el interruptor apagado no sale ningún SMS');
  const antes = cuantos();
  comprobar(correo.smsActivo() === false, 'smsActivo() es falso sin MERCA_SMS');
  const r = correo.enviarSms({ numero: '8095551234', texto: 'prueba' });
  comprobar(r && r.entregado === false && cuantos() === antes, 'enviarSms no envía nada y lo dice');

  console.log('\nEncendido en modo archivo');
  process.env.MERCA_SMS = 'archivo';
  comprobar(correo.smsActivo() === true, 'smsActivo() se entera sin recargar el módulo');
  const texto = correo.textoSmsContacto({ codigo: '123456', minutos: 15 });
  const r2 = correo.enviarSms({ numero: '8095551234', texto });
  comprobar(r2 && r2.entregado === true && cuantos() === antes + 1, 'el SMS queda en .tmp/sms/');
  comprobar(texto.length <= 160 && !/[^\x20-\x7E]/.test(texto), 'el texto cabe en un SMS y va sin tildes');

  process.env.MERCA_SMS = 'algo-raro';
  comprobar(correo.smsActivo() === false && correo.enviarSms({ numero: '8095551234', texto }).entregado === false,
    'un modo desconocido cuenta como apagado');
  delete process.env.MERCA_SMS;

  console.log('\nEl código de teléfono por correo');
  const e = correo.enviarCodigoContacto({ para: 'x@ejemplo.test', nombre: 'X', numero: '8095551234', codigo: '654321', minutos: 15 });
  const contenido = e && e.archivo ? fs.readFileSync(e.archivo, 'utf8') : '';
  comprobar(e && e.entregado && contenido.includes('654321') && contenido.includes('(809) 555-1234'),
    'lleva el código y el número');
}

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Copia del arnés de probar-seguridad.js: cada archivo de prueba lleva
   el suyo, a propósito. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-contactos', ...cabeceras };
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

/* El último código que dejó el transporte de archivo, del correo o del SMS. */
function ultimoCodigo(carpeta) {
  if (!fs.existsSync(carpeta)) return null;
  const txt = fs.readdirSync(carpeta).filter((f) => f.endsWith('.txt')).sort().pop();
  if (!txt) return null;
  const m = /(\d{6})/.exec(fs.readFileSync(path.join(carpeta, txt), 'utf8').split('\n\n').slice(1).join('\n'));
  return m ? m[1] : null;
}

/* ── Bloque «La API» ─────────────────────────────────────── */
async function bloqueApi() {
  const { a, b } = sembrado;
  const IP = '201.9.9.9';
  const comoA = { cookie: `te_sesion=${db.abrirSesion(a.idUsuario)}`, 'cf-connecting-ip': IP };
  const comoB = { cookie: `te_sesion=${db.abrirSesion(b.idUsuario)}`, 'cf-connecting-ip': IP };

  // Un anuncio nuevo de A con dos números que nadie ha verificado.
  const idNuevo = anuncio(a.org.id, a.idUsuario, [
    { numero: '(849) 555-0001', tipo: 'ambos', nota: 'Taller' },
    { numero: '(849) 555-0002', tipo: 'llamadas', nota: null },
  ]);
  const telefonosDe = async (cabeceras) => {
    const r = await pedir({ url: `/api/anuncios/${idNuevo}`, cabeceras });
    return (r.datos && r.datos.anuncio && r.datos.anuncio.telefonos) || null;
  };

  console.log('\nCriterio 1 · ningún contacto sin verificar en la ficha');
  let tels = await telefonosDe();
  comprobar(Array.isArray(tels) && tels.length === 0, 'sin sesión, la ficha no trae ninguno de los dos números');
  tels = await telefonosDe(comoB);
  comprobar(Array.isArray(tels) && tels.length === 0, 'con la sesión de otra organización, tampoco');
  tels = await telefonosDe(comoA);
  comprobar(Array.isArray(tels) && tels.length === 2 && tels.every((t) => t.verificado === false),
    'el dueño ve los dos, marcados sin verificar');

  console.log('\nCriterio 2 · con el SMS apagado, el correo basta');
  let r = await pedir({ url: '/api/contactos', cabeceras: comoA });
  comprobar(r.codigo === 200 && r.datos.sms === false, 'GET /api/contactos dice que el SMS está apagado');
  comprobar(r.datos.contactos.some((c) => c.numero === '8495550001' && !c.verificado), 'y lista el número sin verificar');

  const antesSms = fs.existsSync(correo.BANDEJA_SMS) ? fs.readdirSync(correo.BANDEJA_SMS).length : 0;
  r = await pedir({ metodo: 'POST', url: '/api/contactos/codigo', cuerpo: { numero: '(849) 555-0001', via: 'sms' }, cabeceras: comoA });
  const despuesSms = fs.existsSync(correo.BANDEJA_SMS) ? fs.readdirSync(correo.BANDEJA_SMS).length : 0;
  comprobar(r.codigo === 400 && /correo/.test(r.datos.error) && despuesSms === antesSms,
    'pedir por SMS responde 400, manda al correo y no envía nada');

  r = await pedir({ metodo: 'POST', url: '/api/contactos/codigo', cuerpo: { numero: '555', via: 'correo' }, cabeceras: comoA });
  comprobar(r.codigo === 400, 'un número incompleto responde 400');

  r = await pedir({ metodo: 'POST', url: '/api/contactos/codigo', cuerpo: { numero: '(849) 555-0001', via: 'correo' } });
  comprobar(r.codigo === 401, 'sin sesión responde 401');

  r = await pedir({ metodo: 'POST', url: '/api/contactos/codigo', cuerpo: { numero: '(849) 555-0001', via: 'correo' }, cabeceras: comoA });
  comprobar(r.codigo === 200 && r.datos.enviado && r.datos.via === 'correo' && r.datos.destino.includes('•••'),
    'por correo responde 200 con el destino enmascarado');
  const codigoCorreo = ultimoCodigo(correo.BANDEJA);
  const archivoCorreo = fs.readdirSync(correo.BANDEJA).filter((f) => f.endsWith('.txt')).sort().pop();
  comprobar(codigoCorreo && archivoCorreo.includes('vendedora-a@ejemplo.test'), 'el código llega al correo de la cuenta');

  r = await pedir({ metodo: 'POST', url: '/api/contactos/confirmar', cuerpo: { numero: '8495550001', codigo: codigoCorreo }, cabeceras: comoB });
  comprobar(r.codigo === 400, 'B no puede confirmar con el código de A');

  r = await pedir({ metodo: 'POST', url: '/api/contactos/confirmar', cuerpo: { numero: '8495550001', codigo: codigoCorreo }, cabeceras: comoA });
  comprobar(r.codigo === 200 && r.datos.contacto && r.datos.contacto.verificado && r.datos.contacto.via === 'correo',
    'A confirma y el número queda verificado por correo');

  tels = await telefonosDe();
  comprobar(tels.length === 1 && tels[0].numero === '(849) 555-0001' && tels[0].via === 'correo',
    'la ficha pública trae ahora ese número, y solo ese');
  comprobar(tels[0].nota === 'Taller' && tels[0].tipo === 'ambos', 'con su uso y su nota');

  // Y en un anuncio que ya estaba publicado con el mismo número.
  const idOtro = anuncio(a.org.id, a.idUsuario, [{ numero: '849-555-0001', tipo: 'whatsapp' }]);
  r = await pedir({ url: `/api/anuncios/${idOtro}` });
  comprobar(r.datos.anuncio.telefonos.length === 1, 'y aparece también en otro anuncio de A que lo lleva');

  console.log('\nCriterio 3 · encender el SMS no pide tocar el flujo');
  process.env.MERCA_SMS = 'archivo';
  r = await pedir({ url: '/api/contactos', cabeceras: comoA });
  comprobar(r.datos.sms === true, 'GET /api/contactos dice que el SMS está encendido');
  r = await pedir({ metodo: 'POST', url: '/api/contactos/codigo', cuerpo: { numero: '(849) 555-0002', via: 'sms' }, cabeceras: comoA });
  comprobar(r.codigo === 200 && r.datos.via === 'sms' && r.datos.destino === '(849) •••-0002', 'la misma ruta envía por SMS');
  const codigoSms = ultimoCodigo(correo.BANDEJA_SMS);
  r = await pedir({ metodo: 'POST', url: '/api/contactos/confirmar', cuerpo: { numero: '(849) 555-0002', codigo: codigoSms }, cabeceras: comoA });
  comprobar(r.codigo === 200 && r.datos.contacto.via === 'sms', 'la misma ruta de confirmar lo verifica por SMS');
  tels = await telefonosDe();
  comprobar(tels.length === 2 && tels.some((t) => t.via === 'sms'), 'y la ficha pública trae los dos, uno por SMS');
  delete process.env.MERCA_SMS;

  console.log('\nLímites');
  let ultimo;
  for (let i = 0; i < 6; i++) {
    ultimo = await pedir({ metodo: 'POST', url: '/api/contactos/codigo', cuerpo: { numero: '(809) 555-7777', via: 'correo' }, cabeceras: comoB });
  }
  comprobar(ultimo.codigo === 429, 'el sexto código para el mismo número en una hora responde 429');

  /* El tope por organización no basta para el SMS: abriendo varias
     cuentas se podía acosar un teléfono ajeno, cinco mensajes por cuenta.
     Tres desde A y tres desde B al mismo número: el sexto ya no sale. */
  process.env.MERCA_SMS = 'archivo';
  const respuestas = [];
  for (const quien of [comoA, comoB, comoA, comoB, comoA, comoB]) {
    respuestas.push(await pedir({ metodo: 'POST', url: '/api/contactos/codigo',
      cuerpo: { numero: '(809) 555-6666', via: 'sms' }, cabeceras: { ...quien, 'cf-connecting-ip': '201.8.8.8' } }));
  }
  comprobar(respuestas.slice(0, 5).every((x) => x.codigo === 200) && respuestas[5].codigo === 429,
    'el sexto SMS al mismo número responde 429 aunque venga repartido entre dos cuentas');
  delete process.env.MERCA_SMS;

  console.log('\nNinguna ruta da un número por verificado sin código');
  const fuente = fs.readFileSync(path.join(__dirname, 'api.js'), 'utf8');
  comprobar(!fuente.includes('marcarContactoVerificado'), 'tools/api.js no llama a marcarContactoVerificado');
}

/* Un número dominicano escrito de cualquier forma habitual: con o sin
   paréntesis, con guion, punto o espacio entre los grupos. Sirve para
   comprobar que `estafas.html` y el aviso de la ficha no cuelan uno
   por accidente, que es justo lo que esta página existe para evitar. */
const PATRON_TELEFONO = /\(?8[024]\d\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

/* ── Bloque «Criterio 4: aviso → página de estafas» ─────────── */
function bloqueEstafas() {
  const raiz = path.join(__dirname, '..');

  console.log('\nCriterio 4 · el aviso lleva a la página de estafas, sin ningún teléfono');
  const rutaEstafas = path.join(raiz, 'estafas.html');
  comprobar(fs.existsSync(rutaEstafas), 'estafas.html existe');
  const htmlEstafas = fs.existsSync(rutaEstafas) ? fs.readFileSync(rutaEstafas, 'utf8') : '';
  comprobar(!PATRON_TELEFONO.test(htmlEstafas), 'estafas.html no lleva ningún patrón de teléfono');
  comprobar(/dominican/i.test(htmlEstafas) || /Rep(ú|u)blica Dominicana/.test(htmlEstafas),
    'estafas.html habla del mercado dominicano');
  comprobar(/DICAT/.test(htmlEstafas) && /PEDATEC/.test(htmlEstafas),
    'nombra a DICAT y PEDATEC para reportar, sin ningún teléfono de por medio');

  const appJs = fs.readFileSync(path.join(raiz, 'assets', 'app.js'), 'utf8');
  comprobar(!PATRON_TELEFONO.test(appJs.split('detalle__aviso')[1] || ''),
    'el bloque del aviso en app.js no lleva ningún patrón de teléfono');
  const bloqueAviso = appJs.slice(appJs.indexOf('detalle__aviso'), appJs.indexOf('detalle__aviso') + 400);
  comprobar(bloqueAviso.includes('estafas.html') && bloqueAviso.includes('Señales de estafa'),
    'el aviso de la ficha enlaza a estafas.html');
  comprobar(/t\.verificado/.test(appJs), 'contactosHTML filtra por t.verificado');

  console.log('\nAltas en sitemap, enlaces, auditoría pública y contraste');
  const metaJs = fs.readFileSync(path.join(raiz, 'tools', 'meta.js'), 'utf8');
  comprobar(metaJs.includes("'/estafas.html'"), 'tools/meta.js suma estafas.html al sitemap');
  const checkLinksJs = fs.readFileSync(path.join(raiz, 'tools', 'check-links.js'), 'utf8');
  comprobar(checkLinksJs.includes("'estafas.html'"), 'tools/check-links.js visita estafas.html');
  const auditarPublicoJs = fs.readFileSync(path.join(raiz, 'tools', 'auditar-publico.js'), 'utf8');
  comprobar(auditarPublicoJs.includes("'/estafas.html'"), 'tools/auditar-publico.js visita estafas.html');
  const checkContrasteJs = fs.readFileSync(path.join(raiz, 'tools', 'check-contraste.js'), 'utf8');
  comprobar(checkContrasteJs.includes("'/estafas.html'"), 'tools/check-contraste.js audita estafas.html');
}

(async () => {
  console.log('\nMercaMaquinarias · contactos verificados\n');
  sembrar();

  console.log('La base');
  bloqueBase();

  console.log('\nEl SMS');
  bloqueSms();

  console.log('\nLa API');
  await bloqueApi();

  console.log('\nLa página de estafas');
  bloqueEstafas();

  console.log(`\n${bien} bien, ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})();
