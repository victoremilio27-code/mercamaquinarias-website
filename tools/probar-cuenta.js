/**
 * probar-cuenta.js — cambio de correo, «no fui yo», cambio de contraseña y
 * recuperación de cuenta (fase 10.1).
 *
 *   node tools/probar-cuenta.js
 *
 * POR QUÉ EXISTE
 *
 * Aquí se decide quién es dueño de una cuenta. Un fallo no da un error
 * visible: da una cuenta en manos equivocadas. Por eso se comprueba lo
 * que nadie ve leyendo el código: que la respuesta a la recuperación no
 * delata qué correos existen, que un testigo de reversión sirve una sola
 * vez y no sobrevive a la cadena del intruso, que aprobar espera las 72 h
 * y deja constancia, y que entrar el titular anula lo pedido a sus
 * espaldas.
 *
 * Corre contra una base TEMPORAL —`.tmp/prueba-cuenta/`— que se borra y se
 * rehace en cada ejecución, con los correos en archivo (la bandeja de
 * `.tmp/correos`). No toca la base real ni manda nada.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

/* Antes de cargar db.js: la ruta del archivo se resuelve al importarlo. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-cuenta');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
const api = require('./api.js');
const correo = require('./correo.js');

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

const CLAVE = 'UnaClaveLargaYSegura9';
const SOPORTE = correo.BUZONES.soporte;

/* Una petición de verdad contra el enrutador, con req y res fingidos.
   Copia del arnés de probar-bitacora.js: cada archivo de prueba lleva el
   suyo, a propósito. */
function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-cuenta', ...cabeceras };
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

/* IP distinta por llamada salvo que se diga: los topes por IP no deben
   mezclarse entre bloques. */
let contadorIp = 0;
const nuevaIp = () => `201.9.${Math.floor(++contadorIp / 250)}.${contadorIp % 250 + 1}`;
const como = (testigo, ip) => ({
  ...(testigo ? { cookie: `te_sesion=${testigo}` } : {}),
  'cf-connecting-ip': ip || nuevaIp(),
});
const post = (url, cuerpo, cabeceras) => pedir({ metodo: 'POST', url, cuerpo, cabeceras });

/* La bandeja de correos es compartida con otras pruebas: se leen solo los
   archivos que no estaban en la última lectura. */
const vistos = new Set(fs.existsSync(correo.BANDEJA) ? fs.readdirSync(correo.BANDEJA) : []);
function nuevos() {
  if (!fs.existsSync(correo.BANDEJA)) return [];
  const salida = [];
  for (const nombre of fs.readdirSync(correo.BANDEJA).sort()) {
    if (vistos.has(nombre)) continue;
    vistos.add(nombre);
    if (!nombre.endsWith('.txt')) continue;
    const t = fs.readFileSync(path.join(correo.BANDEJA, nombre), 'utf8');
    salida.push({
      para: (/^Para: (.*)$/m.exec(t) || [])[1],
      asunto: (/^Asunto: (.*)$/m.exec(t) || [])[1],
      texto: t,
    });
  }
  return salida;
}
const paraDe = (lista, destino) => lista.filter((m) => m.para === destino);
const codigoDe = (m) => (m && (/Código: (\d{6})/.exec(m.texto) || [])[1]) || null;

const fila = (sql, ...args) => db.abrir().prepare(sql).get(...args);
const todas = (sql, ...args) => db.abrir().prepare(sql).all(...args);
const correoDe = (idUsuario) => db.usuarioPorId(idUsuario).correo;

/* ── Siembra ─────────────────────────────────────────────── */
function cuenta(correoCuenta, nombre, dealer) {
  const datos = {
    correo: correoCuenta, clave: CLAVE, nombre, telefono: '8095550000',
    tipo: dealer ? 'dealer' : 'particular',
  };
  if (dealer) {
    Object.assign(datos, {
      empresa: dealer, rnc: String(131000000 + (++contadorIp)),
      direccion: 'Calle Principal No. 10', provincia: 'santo-domingo',
      solicitud: { encargado: nombre, aniosOperando: 5 },
    });
  }
  const { idUsuario } = db.crearCuenta(datos);
  db.marcarCorreoVerificado(idUsuario);
  return { idUsuario, org: db.organizacionDe(idUsuario), correo: correoCuenta };
}

/* ── 1. Cambio de correo con sesión ──────────────────────── */
async function bloqueCambioCorreo() {
  console.log('\nCambiar el correo desde el panel');
  const ana = cuenta('ana@ejemplo.test', 'Ana Prueba');
  const bruno = cuenta('bruno@ejemplo.test', 'Bruno Prueba');
  const sesionA = db.abrirSesion(ana.idUsuario);
  const otraA = db.abrirSesion(ana.idUsuario);
  db.recordarDispositivo(ana.idUsuario, 'equipo de Ana');
  bloqueCambioCorreo.ana = { ...ana, sesionA };

  let r = await post('/api/cuenta/correo', { clave: CLAVE, correo: 'ana2@ejemplo.test' }, como(null));
  comprobar(r.codigo === 401, 'sin sesión, 401');

  r = await post('/api/cuenta/correo', { clave: 'otra-clave-cualquiera', correo: 'ana2@ejemplo.test' }, como(sesionA));
  comprobar(r.codigo === 401 && /contraseña no es correcta/.test(r.datos.error), 'contraseña mala, 401');

  r = await post('/api/cuenta/correo', { clave: CLAVE, correo: 'bruno@ejemplo.test' }, como(sesionA));
  comprobar(r.codigo === 409 && /ya tiene una cuenta/.test(r.datos.error), 'correo ocupado, 409');

  r = await post('/api/cuenta/correo', { clave: CLAVE, correo: 'ANA@ejemplo.test' }, como(sesionA));
  comprobar(r.codigo === 400, 'igual al actual (sin importar mayúsculas), 400');

  r = await post('/api/cuenta/correo', { clave: CLAVE, correo: 'esto-no-es-un-correo' }, como(sesionA));
  comprobar(r.codigo === 400, 'correo mal escrito, 400');

  nuevos();
  r = await post('/api/cuenta/correo', { clave: CLAVE, correo: 'Ana2@Ejemplo.test' }, como(sesionA));
  comprobar(r.codigo === 202 && r.datos.correo === 'ana2@ejemplo.test' && r.datos.minutos === 15
    && typeof r.datos.mensaje === 'string', '202 con correo normalizado, minutos y mensaje');
  let mails = nuevos();
  const alNuevo = paraDe(mails, 'ana2@ejemplo.test')[0];
  const codigo = codigoDe(alNuevo);
  comprobar(!!codigo && /cambiar de correo/.test(alNuevo.asunto), 'el código llega al correo NUEVO');
  comprobar(correoDe(ana.idUsuario) === 'ana@ejemplo.test', 'mientras no se confirma, nada cambia');

  // Un código pedido por otra cuenta no vale para esta.
  const sesionB = db.abrirSesion(bruno.idUsuario);
  await post('/api/cuenta/correo', { clave: CLAVE, correo: 'bruno2@ejemplo.test' }, como(sesionB));
  const codigoB = codigoDe(paraDe(nuevos(), 'bruno2@ejemplo.test')[0]);
  r = await post('/api/cuenta/correo/confirmar', { correo: 'bruno2@ejemplo.test', codigo: codigoB }, como(sesionA));
  comprobar(r.codigo === 400 && /incorrecto/i.test(r.datos.error), 'el código de otro usuario no vale, 400');
  comprobar(correoDe(ana.idUsuario) === 'ana@ejemplo.test', 'y no cambia nada');

  r = await post('/api/cuenta/correo/confirmar', { correo: 'ana2@ejemplo.test', codigo: '000000' }, como(sesionA));
  comprobar(r.codigo === 400, 'un código equivocado, 400');
  r = await post('/api/cuenta/correo/confirmar', { correo: 'ana2@ejemplo.test', codigo }, como(null));
  comprobar(r.codigo === 401, 'confirmar sin sesión, 401');

  nuevos();
  r = await post('/api/cuenta/correo/confirmar', { correo: 'ana2@ejemplo.test', codigo }, como(sesionA));
  comprobar(r.codigo === 200 && r.datos.usuario.correo === 'ana2@ejemplo.test',
    'al confirmar, 200 con la sesión pública ya con el correo nuevo');
  comprobar(correoDe(ana.idUsuario) === 'ana2@ejemplo.test'
    && db.usuarioPorId(ana.idUsuario).correo_verificado === 1, 'cambia usuarios.correo y queda verificado');
  comprobar(db.organizacionDe(ana.idUsuario).correo === 'ana2@ejemplo.test',
    'en el particular cambia también organizaciones.correo');
  comprobar(!!db.sesion(sesionA) && !db.sesion(otraA), 'la otra sesión se cierra y la actual sigue');
  comprobar(fila('SELECT COUNT(*) AS n FROM dispositivos WHERE usuario_id = ?', ana.idUsuario).n === 0,
    'los equipos de confianza se olvidan');

  mails = nuevos();
  const alAnterior = paraDe(mails, 'ana@ejemplo.test')[0];
  const enlace = alAnterior && /\/cuenta\.html\?revertir=([0-9a-f]{64})/.exec(alAnterior.texto);
  comprobar(!!enlace, 'el aviso al correo ANTERIOR lleva el enlace ?revertir= con un testigo de 64 hex');
  comprobar(alAnterior && /a\*\*\*@ejemplo\.test/.test(alAnterior.texto) && !/ana2@/.test(alAnterior.texto),
    'y enseña el correo nuevo enmascarado, nunca entero');
  comprobar(paraDe(mails, 'ana2@ejemplo.test').length === 1, 'el correo nuevo recibe su confirmación');

  const cambio = fila('SELECT * FROM cambios_correo WHERE usuario_id = ?', ana.idUsuario);
  comprobar(cambio && cambio.anterior === 'ana@ejemplo.test' && cambio.nuevo === 'ana2@ejemplo.test'
    && cambio.via === 'usuario', 'queda la fila en cambios_correo');
  comprobar(enlace && cambio.revertir_hash && cambio.revertir_hash !== enlace[1]
    && !Object.values(cambio).includes(enlace[1]), 'la base guarda el HMAC del testigo, no el testigo');
  comprobar(cambio && cambio.revertir_expira > db.sumarDias(6) && cambio.revertir_expira < db.sumarDias(8),
    'que vale 7 días');

  r = await post('/api/cuenta/correo/confirmar', { correo: 'ana2@ejemplo.test', codigo }, como(sesionA));
  comprobar(r.codigo === 400, 'el código no se puede usar dos veces');

  bloqueCambioCorreo.testigo = enlace && enlace[1];
}

/* ── 2. Dealer con buzón de empresa ──────────────────────── */
async function bloqueDealer() {
  console.log('\nDealer con otro buzón en la organización');
  const dealer = cuenta('gerente@empresa.test', 'Encargado', 'Empresa de Prueba, S.R.L.');
  db.abrir().prepare('UPDATE organizaciones SET correo = ? WHERE id = ?').run('info@empresa.test', dealer.org.id);
  const sesion = db.abrirSesion(dealer.idUsuario);

  await post('/api/cuenta/correo', { clave: CLAVE, correo: 'gerente2@empresa.test' }, como(sesion));
  const codigo = codigoDe(paraDe(nuevos(), 'gerente2@empresa.test')[0]);
  const r = await post('/api/cuenta/correo/confirmar', { correo: 'gerente2@empresa.test', codigo }, como(sesion));
  comprobar(r.codigo === 200 && correoDe(dealer.idUsuario) === 'gerente2@empresa.test', 'el usuario cambia de correo');
  comprobar(db.organizacionDe(dealer.idUsuario).correo === 'info@empresa.test',
    'el buzón de la empresa, que era otro, no se toca');
}

/* ── 3. «No fui yo» ──────────────────────────────────────── */
async function bloqueRevertir() {
  console.log('\nRevertir un cambio («No fui yo»)');
  const ana = bloqueCambioCorreo.ana;
  const testigo = bloqueCambioCorreo.testigo;
  const IP = '201.50.0.1';

  let r = await post('/api/cuenta/correo/revertir', { testigo: 'no-es-hex' }, como(null, IP));
  comprobar(r.codigo === 400 && /no es válido/.test(r.datos.error), 'un testigo mal formado, 400 genérico');
  r = await post('/api/cuenta/correo/revertir', { testigo: 'a'.repeat(64) }, como(null, IP));
  comprobar(r.codigo === 400 && /no es válido/.test(r.datos.error), 'un testigo que no existe, el mismo 400');

  nuevos();
  r = await post('/api/cuenta/correo/revertir', { testigo }, como(null, IP));
  comprobar(r.codigo === 200 && r.datos.verificacion === 'restablecer' && r.datos.correo === 'ana@ejemplo.test'
    && !!r.datos.mensaje, 'un enlace válido devuelve el correo y pasa a «restablecer»');
  comprobar(correoDe(ana.idUsuario) === 'ana@ejemplo.test'
    && db.usuarioPorId(ana.idUsuario).correo_verificado === 1
    && db.organizacionDe(ana.idUsuario).correo === 'ana@ejemplo.test',
  'el correo vuelve (verificado) también en la organización');
  comprobar(!db.sesion(ana.sesionA), 'se cierran todas las sesiones, la de quien pulsa incluida');
  const alRecuperado = paraDe(nuevos(), 'ana@ejemplo.test').find((m) => /cambiar la contraseña/.test(m.asunto));
  const codigo = codigoDe(alRecuperado);
  comprobar(!!codigo, 'llega un código «restablecer» al correo recuperado');

  r = await post('/api/cuenta/entrar', { correo: 'ana@ejemplo.test', clave: CLAVE }, como(null));
  comprobar(r.codigo === 401, 'la contraseña vieja ya no entra');

  r = await post('/api/cuenta/correo/revertir', { testigo }, como(null, IP));
  comprobar(r.codigo === 400, 'un segundo uso del mismo enlace falla');

  const nueva = 'OtraClaveLargaYNueva77';
  r = await post('/api/cuenta/restablecer', { correo: 'ana@ejemplo.test', codigo, clave: nueva }, como(null));
  comprobar(r.codigo === 200 && !!db.usuarioPorId(ana.idUsuario), 'con ese código se crea la contraseña nueva');

  // Vencido.
  const hugo = cuenta('vence@ejemplo.test', 'Vence');
  const c1 = db.cambiarCorreo({ idUsuario: hugo.idUsuario, nuevo: 'vence2@ejemplo.test', via: 'usuario',
    verificado: true, conReversion: true });
  db.abrir().prepare('UPDATE cambios_correo SET revertir_expira = ? WHERE usuario_id = ?')
    .run(new Date(Date.now() - 1000).toISOString(), hugo.idUsuario);
  r = await post('/api/cuenta/correo/revertir', { testigo: c1.testigoRevertir }, como(null, IP));
  comprobar(r.codigo === 400 && /venció/.test(r.datos.error) && correoDe(hugo.idUsuario) === 'vence2@ejemplo.test',
    'un testigo vencido falla y no toca la cuenta');

  // Cadena A -> B -> C: revertir el primero inutiliza el segundo.
  const carla = cuenta('carla-a@ejemplo.test', 'Carla');
  const t1 = db.cambiarCorreo({ idUsuario: carla.idUsuario, nuevo: 'carla-b@ejemplo.test', via: 'usuario',
    verificado: true, conReversion: true });
  const t2 = db.cambiarCorreo({ idUsuario: carla.idUsuario, nuevo: 'carla-c@ejemplo.test', via: 'usuario',
    verificado: true, conReversion: true });
  r = await post('/api/cuenta/correo/revertir', { testigo: t1.testigoRevertir }, como(null, IP));
  comprobar(r.codigo === 200 && correoDe(carla.idUsuario) === 'carla-a@ejemplo.test',
    'cadena A→B→C: revertir el primero devuelve la cuenta a A');
  r = await post('/api/cuenta/correo/revertir', { testigo: t2.testigoRevertir }, como(null, IP));
  comprobar(r.codigo === 400 && correoDe(carla.idUsuario) === 'carla-a@ejemplo.test',
    'y el testigo del segundo cambio (el del intruso) ya no sirve');
  comprobar(fila(`SELECT COUNT(*) AS n FROM cambios_correo WHERE usuario_id = ? AND via = 'reversion'`,
    carla.idUsuario).n === 1, 'la reversión deja su propia fila en el historial');

  // Otra cuenta tomó el correo anterior.
  const dora = cuenta('dora-a@ejemplo.test', 'Dora');
  const t3 = db.cambiarCorreo({ idUsuario: dora.idUsuario, nuevo: 'dora-b@ejemplo.test', via: 'usuario',
    verificado: true, conReversion: true });
  cuenta('dora-a@ejemplo.test', 'Quien llegó después');
  r = await post('/api/cuenta/correo/revertir', { testigo: t3.testigoRevertir }, como(null, IP));
  comprobar(r.codigo === 409 && /otra cuenta/.test(r.datos.error) && correoDe(dora.idUsuario) === 'dora-b@ejemplo.test',
    'si otra cuenta ya tiene el correo anterior, 409 y no se toca nada');

  // Tope por IP: 10 cada 15 minutos.
  const IP2 = '201.50.0.2';
  let ultimo;
  for (let i = 0; i < 11; i++) ultimo = await post('/api/cuenta/correo/revertir', { testigo: 'b'.repeat(64) }, como(null, IP2));
  comprobar(ultimo.codigo === 429, 'al pasar de 10 intentos por IP, 429');
}

/* ── 4. Contraseña y otras sesiones ──────────────────────── */
async function bloqueClave() {
  console.log('\nCambiar la contraseña y cerrar las otras sesiones');
  const fran = cuenta('fran@ejemplo.test', 'Fran');
  const actual = db.abrirSesion(fran.idUsuario);
  const otra = db.abrirSesion(fran.idUsuario);

  let r = await post('/api/cuenta/clave', { actual: CLAVE, nueva: 'NuevaClaveLarga1234' }, como(null));
  comprobar(r.codigo === 401, 'sin sesión, 401');
  r = await post('/api/cuenta/clave', { actual: 'no-es-esta-clave', nueva: 'NuevaClaveLarga1234' }, como(actual));
  comprobar(r.codigo === 401, 'contraseña actual mala, 401');
  r = await post('/api/cuenta/clave', { actual: CLAVE, nueva: 'corta' }, como(actual));
  comprobar(r.codigo === 400, 'contraseña nueva débil, 400');
  r = await post('/api/cuenta/clave', { actual: CLAVE, nueva: 'fran-fran-fran-1234' }, como(actual));
  comprobar(r.codigo === 400, 'que contenga el correo, 400');

  nuevos();
  r = await post('/api/cuenta/clave', { actual: CLAVE, nueva: 'NuevaClaveLarga1234' }, como(actual));
  comprobar(r.codigo === 200 && r.datos.ok === true && !!r.datos.mensaje, 'bien: 200 con ok y mensaje');
  comprobar(!!db.sesion(actual) && !db.sesion(otra), 'las otras sesiones se cierran y la actual sigue');
  comprobar(paraDe(nuevos(), 'fran@ejemplo.test').some((m) => /contraseña/.test(m.asunto)), 'se envía el aviso de cambio');
  const u = db.usuarioPorId(fran.idUsuario);
  comprobar(db.claveCorrecta('NuevaClaveLarga1234', u.clave_hash, u.clave_sal)
    && !db.claveCorrecta(CLAVE, u.clave_hash, u.clave_sal), 'y la contraseña nueva es la que rige');

  db.abrirSesion(fran.idUsuario);
  db.recordarDispositivo(fran.idUsuario, 'otro equipo');
  r = await post('/api/cuenta/cerrar-otras', undefined, como(null));
  comprobar(r.codigo === 401, 'cerrar-otras sin sesión, 401');
  r = await post('/api/cuenta/cerrar-otras', undefined, como(actual));
  comprobar(r.codigo === 200 && r.datos.ok === true && r.datos.cerradas === 1, 'cerrar-otras dice cuántas cerró');
  comprobar(todas('SELECT testigo FROM sesiones WHERE usuario_id = ?', fran.idUsuario).length === 1
    && !!db.sesion(actual)
    && fila('SELECT COUNT(*) AS n FROM dispositivos WHERE usuario_id = ?', fran.idUsuario).n === 0,
  'deja solo la sesión actual y olvida los equipos');
}

/* ── 5. Solicitud de recuperación ────────────────────────── */
const solicitud = (correoCuenta, extra) => ({
  correoCuenta,
  correoContacto: 'contacto-nuevo@ejemplo.test',
  nombre: 'Persona de Prueba',
  telefono: '8095551234',
  rnc: '',
  detalle: 'Tengo tres anuncios publicados y el último pago fue la referencia PAG-123.',
  ...extra,
});

async function bloqueRecuperacion() {
  console.log('\nPedir la recuperación sin acceso al correo');
  const gina = cuenta('gina@ejemplo.test', 'Gina');
  bloqueRecuperacion.gina = gina;

  nuevos();
  const IP = '201.60.0.1';
  const existe = await post('/api/cuenta/recuperacion', solicitud('gina@ejemplo.test'), como(null, IP));
  const mails = nuevos();
  const inexiste = await post('/api/cuenta/recuperacion',
    solicitud('nadie@ejemplo.test', { correoContacto: 'contacto2@ejemplo.test' }), como(null, '201.60.0.2'));
  comprobar(existe.codigo === 202 && inexiste.codigo === 202
    && JSON.stringify(existe.datos) === JSON.stringify(inexiste.datos),
  'respuesta idéntica (código y cuerpo) con un correo que existe y uno que no');

  const acuse = paraDe(mails, 'contacto-nuevo@ejemplo.test')[0];
  const ref = acuse && (/REC-[A-Z2-9]{6}/.exec(acuse.texto) || [])[0];
  comprobar(!!ref && /72|de nuevo|antes del/.test(acuse.texto), 'el contacto recibe el acuse con la referencia');
  comprobar(/nunca por teléfono/.test(acuse.texto), 'que promete no pedir datos por teléfono');
  const alTitular = paraDe(mails, 'gina@ejemplo.test')[0];
  comprobar(!!alTitular && /c\*\*\*@ejemplo\.test/.test(alTitular.texto) && !/contacto-nuevo@/.test(alTitular.texto)
    && /entre a su cuenta/.test(alTitular.texto), 'el titular recibe el aviso con el contacto enmascarado');
  comprobar(paraDe(mails, SOPORTE).some((m) => /Recuperación de cuenta/.test(m.asunto)), 'soporte recibe el aviso interno');

  const s = fila('SELECT * FROM solicitudes_recuperacion WHERE correo_cuenta = ?', 'gina@ejemplo.test');
  comprobar(s && s.estado === 'pendiente' && s.usuario_id === gina.idUsuario
    && Math.abs(new Date(s.resolver_desde) - new Date(s.creada) - db.HORAS_ESPERA_RECUPERACION * 3600000) < 5000,
  'queda pendiente, ligada a la cuenta, para resolver 72 h después');
  const s2 = fila('SELECT * FROM solicitudes_recuperacion WHERE correo_cuenta = ?', 'nadie@ejemplo.test');
  comprobar(s2 && s2.usuario_id === null, 'sin cuenta detrás se guarda igual, con usuario NULL');

  nuevos();
  const repetida = await post('/api/cuenta/recuperacion', solicitud('gina@ejemplo.test'), como(null, '201.60.0.3'));
  comprobar(repetida.codigo === 202 && JSON.stringify(repetida.datos) === JSON.stringify(existe.datos)
    && fila('SELECT COUNT(*) AS n FROM solicitudes_recuperacion WHERE correo_cuenta = ?', 'gina@ejemplo.test').n === 1,
  'una segunda pendiente para el mismo correo no crea fila y responde igual');
  comprobar(nuevos().length === 0, 'ni manda correos de nuevo');

  let r = await post('/api/cuenta/recuperacion', solicitud('gina@ejemplo.test', { detalle: 'corto' }), como(null));
  comprobar(r.codigo === 400, 'un detalle de menos de 20 caracteres, 400');
  r = await post('/api/cuenta/recuperacion', solicitud('gina@ejemplo.test', { correoContacto: 'GINA@ejemplo.test' }), como(null));
  comprobar(r.codigo === 400, 'contacto igual al de la cuenta, 400');
  r = await post('/api/cuenta/recuperacion', solicitud('gina@ejemplo.test', { rnc: '123' }), como(null));
  comprobar(r.codigo === 400, 'un RNC que no tiene 9 dígitos, 400');
  r = await post('/api/cuenta/recuperacion', solicitud('gina@ejemplo.test', { telefono: '12345' }), como(null));
  comprobar(r.codigo === 400, 'un teléfono que no tiene 10 dígitos, 400');

  const IP4 = '201.60.0.9';
  let ultimo;
  for (let i = 0; i < 4; i++) {
    ultimo = await post('/api/cuenta/recuperacion',
      solicitud(`tope${i}@ejemplo.test`), como(null, IP4));
  }
  comprobar(ultimo.codigo === 429, 'a la cuarta desde la misma IP en una hora, 429');

  // El titular entra: la solicitud se anula sola.
  r = await post('/api/cuenta/entrar', { correo: 'gina@ejemplo.test', clave: CLAVE }, como(null));
  const cod = codigoDe(paraDe(nuevos(), 'gina@ejemplo.test').find((m) => /código de acceso/.test(m.asunto)));
  comprobar(r.codigo === 200 && r.datos.verificacion === 'acceso' && !!cod, 'Gina inicia sesión en un equipo nuevo');
  comprobar(fila('SELECT estado FROM solicitudes_recuperacion WHERE correo_cuenta = ?', 'gina@ejemplo.test').estado === 'pendiente',
    'y mientras no completa el código, la solicitud sigue viva');
  r = await post('/api/cuenta/verificar', { correo: 'gina@ejemplo.test', tipo: 'acceso', codigo: cod }, como(null));
  comprobar(r.codigo === 200 && fila('SELECT estado FROM solicitudes_recuperacion WHERE correo_cuenta = ?',
    'gina@ejemplo.test').estado === 'anulada', 'al entrar con el código, la solicitud queda anulada');
}

/* ── 6 y 7. Consola ──────────────────────────────────────── */
async function bloqueAdmin() {
  console.log('\nRevisión del personal');
  const admin = cuenta('admin@ejemplo.test', 'Administradora');
  db.marcarAdmin('admin@ejemplo.test', true);
  const normal = cuenta('normal@ejemplo.test', 'Usuario Normal');
  const hugo = cuenta('hugo@ejemplo.test', 'Hugo');
  const sesionAdmin = db.abrirSesion(admin.idUsuario);
  const sesionNormal = db.abrirSesion(normal.idUsuario);
  const sesionHugo = db.abrirSesion(hugo.idUsuario);
  const comoAdmin = () => como(sesionAdmin, '201.70.0.1');
  const MOTIVO = 'Comprobé el pago PAG-123 y el RNC contra el registro';
  const pasado = (idSol) => db.abrir()
    .prepare('UPDATE solicitudes_recuperacion SET resolver_desde = ? WHERE id = ?')
    .run(new Date(Date.now() - 60000).toISOString(), idSol);

  await post('/api/cuenta/recuperacion',
    solicitud('hugo@ejemplo.test', { correoContacto: 'hugo-nuevo@ejemplo.test' }), como(null));
  const s = fila('SELECT * FROM solicitudes_recuperacion WHERE correo_cuenta = ?', 'hugo@ejemplo.test');

  let r = await pedir({ url: '/api/admin/recuperaciones', cabeceras: como(sesionNormal) });
  comprobar(r.codigo === 404, 'quien no es admin recibe 404 al listar');
  r = await post(`/api/admin/recuperaciones/${s.id}/aprobar`, { motivo: MOTIVO }, como(sesionNormal));
  comprobar(r.codigo === 404, 'y 404 al aprobar');
  r = await post(`/api/admin/recuperaciones/${s.id}/rechazar`, { motivo: MOTIVO }, como(sesionNormal));
  comprobar(r.codigo === 404, 'y 404 al rechazar');
  r = await pedir({ url: '/api/admin/recuperaciones', cabeceras: como(null) });
  comprobar(r.codigo === 401, 'sin sesión, 401');

  r = await pedir({ url: '/api/admin/recuperaciones', cabeceras: comoAdmin() });
  comprobar(r.codigo === 200 && Array.isArray(r.datos.solicitudes)
    && r.datos.solicitudes.every((x) => x.estado === 'pendiente')
    && r.datos.solicitudes.some((x) => x.id === s.id), 'el admin lista por defecto las pendientes');
  r = await pedir({ url: '/api/admin/recuperaciones?estado=todas', cabeceras: comoAdmin() });
  comprobar(r.codigo === 200 && r.datos.solicitudes.some((x) => x.estado === 'anulada'), 'con estado=todas salen también las resueltas');
  r = await pedir({ url: `/api/admin/recuperaciones/${s.id}`, cabeceras: comoAdmin() });
  comprobar(r.codigo === 200 && r.datos.cuenta && r.datos.cuenta.correo === 'hugo@ejemplo.test'
    && r.datos.organizacion && Array.isArray(r.datos.pagos) && Array.isArray(r.datos.cambiosCorreo)
    && r.datos.anuncios && Array.isArray(r.datos.telefonosVerificados),
  'el expediente trae la cuenta y su organización al lado');
  r = await pedir({ url: '/api/admin/recuperaciones/no-existe', cabeceras: comoAdmin() });
  comprobar(r.codigo === 404, 'un expediente que no existe, 404');

  r = await post(`/api/admin/recuperaciones/${s.id}/aprobar`, { motivo: MOTIVO }, comoAdmin());
  comprobar(r.codigo === 409 && /a partir de/.test(r.datos.error), 'aprobar antes de las 72 h, 409');
  comprobar(correoDe(hugo.idUsuario) === 'hugo@ejemplo.test', 'y la cuenta no cambia');

  pasado(s.id);
  r = await post(`/api/admin/recuperaciones/${s.id}/aprobar`, { motivo: 'corto' }, comoAdmin());
  comprobar(r.codigo === 400, 'con motivo de menos de 15 caracteres, 400');
  r = await post('/api/admin/recuperaciones/no-existe/aprobar', { motivo: MOTIVO }, comoAdmin());
  comprobar(r.codigo === 404, 'una solicitud que no existe, 404');

  nuevos();
  r = await post(`/api/admin/recuperaciones/${s.id}/aprobar`, { motivo: MOTIVO }, comoAdmin());
  comprobar(r.codigo === 200 && r.datos.ok === true && r.datos.solicitud.estado === 'aprobada', 'pasadas las 72 h y con motivo, aprueba');
  const u = db.usuarioPorId(hugo.idUsuario);
  comprobar(u.correo === 'hugo-nuevo@ejemplo.test' && u.correo_verificado === 0
    && db.organizacionDe(hugo.idUsuario).correo === 'hugo-nuevo@ejemplo.test',
  'el correo pasa al de contacto, sin verificar');
  comprobar(!db.sesion(sesionHugo), 'se cierran todas las sesiones');
  const b = fila(`SELECT * FROM bitacora_admin WHERE accion = 'cuenta.recuperar'`);
  comprobar(b && b.admin_id === admin.idUsuario && b.objeto_id === s.id && /PAG-123/.test(b.motivo)
    && JSON.parse(b.antes).correo === 'hugo@ejemplo.test' && JSON.parse(b.despues).correo === 'hugo-nuevo@ejemplo.test',
  'queda la fila en bitacora_admin con acción, quién, motivo y antes/después');
  const sf = fila('SELECT * FROM solicitudes_recuperacion WHERE id = ?', s.id);
  comprobar(sf.estado === 'aprobada' && sf.resuelta_por === admin.idUsuario, 'la solicitud guarda quién la resolvió');
  const cc = fila(`SELECT * FROM cambios_correo WHERE usuario_id = ? AND via = 'recuperacion'`, hugo.idUsuario);
  comprobar(cc && cc.revertir_hash === null && cc.solicitud_id === s.id, 'el cambio queda registrado sin reversión');
  const mails = nuevos();
  comprobar(paraDe(mails, 'hugo-nuevo@ejemplo.test').some((m) => /Olvidé mi contraseña/.test(m.texto)),
    'el correo nuevo recibe cómo crear la contraseña');
  comprobar(paraDe(mails, 'hugo@ejemplo.test').some((m) => !/revertir=/.test(m.texto)),
    'el anterior recibe solo el aviso, sin enlace de reversión');

  r = await post(`/api/admin/recuperaciones/${s.id}/aprobar`, { motivo: MOTIVO }, comoAdmin());
  comprobar(r.codigo === 409, 'aprobar otra vez, 409');
  r = await post(`/api/admin/recuperaciones/${s.id}/rechazar`, { motivo: MOTIVO }, comoAdmin());
  comprobar(r.codigo === 409, 'y rechazarla ya resuelta, también');

  // 7. Tras aprobar, «Olvidé mi contraseña» con el correo nuevo deja entrar.
  console.log('\nDespués de aprobar: crear la contraseña');
  nuevos();
  r = await post('/api/cuenta/recuperar', { correo: 'hugo-nuevo@ejemplo.test' }, como(null));
  const cod = codigoDe(paraDe(nuevos(), 'hugo-nuevo@ejemplo.test')[0]);
  comprobar(r.codigo === 202 && !!cod, 'pedir «Olvidé mi contraseña» con el correo nuevo manda el código');
  r = await post('/api/cuenta/restablecer',
    { correo: 'hugo-nuevo@ejemplo.test', codigo: cod, clave: 'ClaveNuevaDeHugo2026' }, como(null));
  comprobar(r.codigo === 200 && db.usuarioPorId(hugo.idUsuario).correo_verificado === 1,
    'restablecer deja entrar y marca el correo verificado');

  console.log('\nRechazar y casos sin cuenta');
  // Sin cuenta detrás: no se puede aprobar, sí rechazar.
  const previa = fila('SELECT * FROM solicitudes_recuperacion WHERE correo_cuenta = ?', 'nadie@ejemplo.test');
  pasado(previa.id);
  r = await post(`/api/admin/recuperaciones/${previa.id}/aprobar`, { motivo: MOTIVO }, comoAdmin());
  comprobar(r.codigo === 409 && /solo se puede rechazar/.test(r.datos.error), 'sin cuenta detrás, aprobar da 409');
  nuevos();
  r = await post(`/api/admin/recuperaciones/${previa.id}/rechazar`, { motivo: MOTIVO }, comoAdmin());
  comprobar(r.codigo === 200 && r.datos.solicitud.estado === 'rechazada', 'y rechazar funciona');
  comprobar(paraDe(nuevos(), 'contacto2@ejemplo.test').length === 1, 'con su correo genérico al contacto');

  // Rechazar con cuenta: no la toca.
  const iris = cuenta('iris@ejemplo.test', 'Iris');
  const sesionIris = db.abrirSesion(iris.idUsuario);
  await post('/api/cuenta/recuperacion', solicitud('iris@ejemplo.test', { correoContacto: 'iris-otro@ejemplo.test' }), como(null));
  const si = fila('SELECT * FROM solicitudes_recuperacion WHERE correo_cuenta = ?', 'iris@ejemplo.test');
  r = await post(`/api/admin/recuperaciones/${si.id}/rechazar`, { motivo: 'no' }, comoAdmin());
  comprobar(r.codigo === 400, 'rechazar con motivo corto, 400');
  const antes = fila(`SELECT COUNT(*) AS n FROM bitacora_admin WHERE accion = 'cuenta.recuperar'`).n;
  r = await post(`/api/admin/recuperaciones/${si.id}/rechazar`, { motivo: MOTIVO }, comoAdmin());
  comprobar(r.codigo === 200 && correoDe(iris.idUsuario) === 'iris@ejemplo.test' && !!db.sesion(sesionIris),
    'rechazar no toca la cuenta ni sus sesiones');
  const sr = fila('SELECT * FROM solicitudes_recuperacion WHERE id = ?', si.id);
  comprobar(sr.estado === 'rechazada' && sr.resuelta_por === admin.idUsuario && sr.motivo === MOTIVO,
    'guarda estado, quién y motivo');
  comprobar(fila(`SELECT COUNT(*) AS n FROM bitacora_admin WHERE accion = 'cuenta.recuperar'`).n === antes,
    'y no escribe en la bitácora de acciones sobre organizaciones');
}

async function principal() {
  await bloqueCambioCorreo();
  await bloqueDealer();
  await bloqueRevertir();
  await bloqueClave();
  await bloqueRecuperacion();
  await bloqueAdmin();

  console.log(`\n${bien} ok, ${mal} MAL`);
  process.exit(mal ? 1 : 0);
}

principal().catch((e) => {
  console.error(e);
  process.exit(1);
});
