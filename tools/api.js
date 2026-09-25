/**
 * api.js — API HTTP de MercaMaquinarias. Sin dependencias.
 *
 * La monta serve.js bajo /api. Cada ruta valida su entrada, llama a
 * db.js y devuelve JSON. Aquí no hay SQL: solo reglas de negocio,
 * permisos y forma de la respuesta.
 *
 * Convenios:
 *  · Sesión por cookie httpOnly con un testigo aleatorio.
 *  · Los errores salen como { error: 'texto' } con su código HTTP.
 *  · El dinero viaja en pesos enteros, igual que se guarda.
 */

const db = require('./db');
const correo = require('./correo');
const fotos = require('./fotos');
const videos = require('./videos');
const chat = require('./chat');

/* El cálculo del importe es el MISMO módulo que carga el navegador.
   La cifra que se enseña y la que se cobra salen de la misma función:
   ya pasó una vez que el precio viviera solo en el JavaScript y la
   página anunciara un plan sin costo mientras el servidor cobraba. */
const precios = require('../assets/precios.js');
const servicios = require('../assets/servicios.js');

/* Las versiones de los documentos legales, también compartidas con el
   navegador. La casilla del formulario y la comprobación de aquí tienen
   que hablar de la misma versión, o se pediría aceptar una cosa y se
   guardaría constancia de otra. */
const legales = require('../assets/legales.js');
const facturas = require('./facturas');
const pagos = require('./pagos');
const transferencia = require('./transferencia');

/* La transferencia se apaga sola si falta un dato o uno no valida, y
   eso es lo correcto con la cuenta a medias. Pero un error de tecleo
   en el VPS la apagaría en silencio y el sitio seguiría cobrando con
   demo sin que nadie lo notara. Si hay alguna variable puesta y aun
   así no está encendida, se avisa una vez al arrancar, con los
   NOMBRES de lo que falta: los valores son datos bancarios y no van
   al registro del servidor.

   Una variable vacía cuenta como no puesta: es como quedan en el
   archivo de entorno mientras la cuenta no existe, y ahí apagada es
   lo que se quiere. */
if (Object.keys(process.env).some((k) => k.startsWith('MERCA_TRANSFERENCIA_') && String(process.env[k]).trim())
  && transferencia.faltantes().length) {
  console.warn(`transferencia: apagada; faltan o no validan ${transferencia.faltantes().join(', ')}`);
}

const { ITBIS } = precios;
const COOKIE = 'te_sesion';
const COOKIE_EQUIPO = 'te_equipo';

/* Topes de las operaciones sensibles. Son deliberadamente bajos: un
   humano no pide seis códigos en diez minutos, un guion sí. */
const LIMITES = {
  codigos:  { tope: 5,  minutos: 15 },   // códigos pedidos por correo
  acceso:   { tope: 10, minutos: 15 },   // contraseñas probadas por IP
  registro: { tope: 5,  minutos: 60 },   // cuentas creadas por IP

  /* Cada mensaje del asistente cuesta dinero de verdad, así que el
     tope es más generoso que los de arriba pero existe: una consulta
     normal se resuelve en cinco o seis preguntas, y treinta en un
     cuarto de hora ya no es una persona con una duda. */
  chat:     { tope: 30, minutos: 15 },

  /* La única ruta de escritura que va sin sesión. El tope es alto a
     propósito —quien recorre el catálogo genera una vista por ficha—
     pero existe: sin él, un guion infla las métricas de cualquier
     anuncio y llena la tabla de eventos en una tarde. */
  eventos:  { tope: 300, minutos: 15 },
};

/* ── Utilidades de transporte ───────────────────────────── */

function responder(res, codigo, cuerpo, cabeceras = {}) {
  const datos = JSON.stringify(cuerpo);
  res.writeHead(codigo, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...cabeceras,
  });
  res.end(datos);
}

/* `extra` sirve para que el sitio pueda hacer algo con el error además
   de enseñarlo: por ejemplo, saber QUÉ documentos faltan por aceptar y
   ofrecer aceptarlos ahí mismo en vez de dejar al usuario buscando. */
const fallo = (res, codigo, texto, extra) =>
  responder(res, codigo, { error: texto, ...(extra || {}) });

function leerCuerpo(req) {
  return new Promise((resolver, rechazar) => {
    /* Los trozos se guardan como Buffer y se unen AL FINAL.

       Antes se concatenaban a una cadena según llegaban, y eso
       convierte cada trozo a texto por separado: un carácter UTF-8 que
       caiga a caballo entre dos trozos se parte y se decodifica como
       dos signos de interrogación. En un sitio en español, con anuncios
       que viajan con ocho fotos dentro del JSON, «Excavación» se
       guardaba corrupta. Y no saltaba ninguna excepción, porque los
       bytes que dan estructura al JSON son todos ASCII: el anuncio se
       publicaba con la descripción rota y nadie sabía por qué. */
    const trozos = [];
    let tamano = 0;
    req.on('data', (trozo) => {
      tamano += trozo.length;
      // Las fotos viajan como data URL dentro del JSON; 25 MB cubre
      // veinte imágenes ya reducidas en el navegador y corta de raíz
      // un envío que quiera agotar la memoria del proceso.
      if (tamano > 25 * 1024 * 1024) {
        rechazar(Object.assign(new Error('Cuerpo demasiado grande'), { codigo: 413 }));
        req.destroy();
        return;
      }
      trozos.push(trozo);
    });
    req.on('end', () => {
      if (!trozos.length) return resolver({});
      const datos = Buffer.concat(trozos).toString('utf8');
      if (!datos) return resolver({});
      try { resolver(JSON.parse(datos)); } catch { rechazar(Object.assign(new Error('JSON inválido'), { codigo: 400 })); }
    });
    req.on('error', rechazar);
  });
}

function leerCookies(req) {
  const crudo = req.headers.cookie || '';
  const salida = {};
  crudo.split(';').forEach((par) => {
    const i = par.indexOf('=');
    if (i > 0) salida[par.slice(0, i).trim()] = decodeURIComponent(par.slice(i + 1).trim());
  });
  return salida;
}

/* `Secure` solo cuando el sitio corre sobre HTTPS: en desarrollo, por
   http://localhost, el navegador descartaría la cookie y no se podría
   iniciar sesión. */
const SEGURA = process.env.MERCA_HTTPS === '1' ? '; Secure' : '';

const cookieSesion = (testigo, dias = 30) =>
  `${COOKIE}=${testigo}; Path=/; HttpOnly; SameSite=Lax${SEGURA}; Max-Age=${dias * 24 * 3600}`;

const cookieEquipo = (testigo, dias = 60) =>
  `${COOKIE_EQUIPO}=${testigo}; Path=/; HttpOnly; SameSite=Lax${SEGURA}; Max-Age=${dias * 24 * 3600}`;

/* Quién pide, para los límites por origen.

   Delante del servidor hay dos intermediarios: Cloudflare y nginx.
   `CF-Connecting-IP` la escribe Cloudflare con la IP real del
   visitante y la sustituye siempre, así que el cliente no puede
   falsificarla mientras nadie llegue al VPS saltándose el proxy.

   De X-Forwarded-For se toma el ÚLTIMO elemento, nunca el primero.
   Esa cabecera se acumula por la izquierda: el primer valor es el
   que puso quien llama, de modo que bastaba con inventarse uno
   distinto en cada petición para anular TODOS los topes del sitio
   —contraseñas, altas de cuenta, códigos y el asistente, que cuesta
   dinero—. El último es el que añadió el proxy de casa. */
const origen = (req) => {
  const cf = String(req.headers['cf-connecting-ip'] || '').trim();
  if (cf) return cf;
  const cadena = String(req.headers['x-forwarded-for'] || '')
    .split(',').map((x) => x.trim()).filter(Boolean);
  return cadena[cadena.length - 1] || req.socket.remoteAddress || 'desconocido';
};

const equipoDescrito = (req) => String(req.headers['user-agent'] || '').slice(0, 200);

/* ── Sesión y permisos ──────────────────────────────────── */

function contexto(req) {
  const testigo = leerCookies(req)[COOKIE];
  const s = db.sesion(testigo);
  if (!s) return null;
  const org = db.organizacionDe(s.usuario_id);
  /* `esAdmin` viene de la propia consulta de sesión, que ya une con
     usuarios: no cuesta una consulta más. Faltaba, y dos comprobaciones
     de comprobantes lo leían igualmente —`ctx.usuario.esAdmin`— contra
     un campo que no existía. Siempre daba undefined, así que el
     administrador recibía un 404 al abrir el PDF de cualquier
     comprobante que no fuera de su propia organización. */
  return {
    testigo,
    usuario: { id: s.usuario_id, correo: s.correo, nombre: s.nombre, esAdmin: !!s.es_admin },
    organizacion: org,
  };
}

/* Envuelve las rutas que exigen sesión. Devuelve 401 en vez de
   redirigir: quien llama es JavaScript, no un navegador siguiendo
   enlaces. */
const conSesion = (manejador) => (req, res, ctx, ...resto) => {
  if (!ctx) return fallo(res, 401, 'Necesita iniciar sesión');
  return manejador(req, res, ctx, ...resto);
};

/* Solo el personal de MercaMaquinarias. La marca `es_admin` no se concede
   desde ninguna pantalla: se pone con tools/admin.js. Se comprueba
   contra la base en cada petición y no contra la cookie, para que
   quitar el permiso tenga efecto inmediato.

   Responde 404 y no 403: quien no es administrador no debe enterarse
   siquiera de que estas rutas existen. */
const conAdmin = (manejador) => conSesion((req, res, ctx, ...resto) => {
  const u = db.usuarioPorId(ctx.usuario.id);
  if (!u || !u.es_admin) return fallo(res, 404, 'No existe');
  return manejador(req, res, ctx, ...resto);
});

/* Escrituras de un administrador EN NOMBRE DE otra organización.
   Decisión de Victor del 2026-09-25 (ADMIN-05): toda escritura de admin
   sobre otra organización queda en la bitácora, con quién, cuándo, desde
   qué IP y qué cambió. Una ruta así va envuelta aquí o no se hace.

   Es conAdmin (sigue respondiendo 404 a quien no lo es) más un
   `ctx.enNombreDe(idOrganizacion, { objetoTipo, objetoId, motivo }, escribir)`
   que llama a db.enNombreDe con el administrador de la sesión, la acción
   fija de este envoltorio y la IP de origen(req). El manejador no recibe
   esos tres datos como parámetro, así que no puede falsearlos.

   La función devuelta lleva `bitacora = accion`: es lo que lee la guarda
   de tools/probar-bitacora.js al recorrer RUTAS, que falla si una ruta de
   escritura de /api/admin/ ni pasa por aquí ni está declarada en
   ESCRITURAS_ADMIN_PROPIAS. La fase 7 montó la edición de la página del
   dealer, la revisión de la serie y el directorio bajo /api/admin/, así
   que la guarda las cubre sin ensancharla; una ruta futura en nombre de
   otro que NO cuelgue de /api/admin/ tiene que ensanchar la guarda en el
   mismo cambio. */
function conAdminEnNombreDe(accion, manejador) {
  // Falla al arrancar, no en la primera petición de un administrador.
  if (!Object.prototype.hasOwnProperty.call(db.ACCIONES_BITACORA, accion)) {
    throw new Error(`conAdminEnNombreDe: acción «${accion}» fuera de ACCIONES_BITACORA`);
  }
  const envuelto = conAdmin((req, res, ctx, ...resto) => {
    const enNombreDe = (idOrganizacion, { objetoTipo, objetoId, motivo } = {}, escribir) =>
      db.enNombreDe({
        idAdmin: ctx.usuario.id,
        idOrganizacion,
        accion,
        objetoTipo,
        objetoId,
        motivo,
        ip: origen(req),
      }, escribir);
    return manejador(req, res, { ...ctx, enNombreDe }, ...resto);
  });
  envuelto.bitacora = accion;
  return envuelto;
}

/* ── Validación ─────────────────────────────────────────── */

const texto = (v, max = 500) => (v == null ? null : String(v).trim().slice(0, max) || null);
const entero = (v) => {
  const n = Number(String(v ?? '').replace(/[^\d-]/g, ''));
  return Number.isFinite(n) ? n : null;
};
const correoValido = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim());

/* El RNC dominicano tiene 9 dígitos. Se acepta escrito con guiones y
   se guarda solo con dígitos para que dos formatos del mismo número no
   burlen el control de duplicados.

   Antes también se admitían 11 dígitos, que es una cédula. Ya no: la
   cuenta de dealer es para empresas constituidas, y aceptar la cédula
   de una persona convertía la comprobación en un trámite sin valor. */
function rncValido(v) {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 9 ? d : null;
}

/* El RNC nunca sale entero hacia el navegador, ni siquiera al dueño de
   la cuenta: se enseñan los últimos cuatro dígitos, suficientes para
   que reconozca cuál tiene registrado. Entero solo se ve en las rutas
   de administración y en el correo de revisión. */
const rncEnmascarado = (rnc) => (rnc ? `•••••${String(rnc).slice(-4)}` : null);

const telefonoValido = (v) => String(v || '').replace(/\D/g, '').length === 10;

/* ── Rutas: cuenta ──────────────────────────────────────── */

/* Fuerza mínima de la contraseña. No se exigen símbolos raros —eso
   produce contraseñas cortas llenas de sustituciones previsibles—
   sino longitud, que es lo que de verdad cuesta romper. */
function claveDebil(clave, correoUsuario) {
  const v = String(clave || '');
  if (v.length < 10) return 'La contraseña debe tener al menos 10 caracteres';
  if (/^\d+$/.test(v)) return 'La contraseña no puede ser solo números';
  // Se compara con la parte local del correo, pero solo si es lo
  // bastante larga: con un correo tipo "a@…" cualquier contraseña que
  // lleve una "a" quedaría rechazada.
  const usuarioCorreo = String(correoUsuario || '').split('@')[0].toLowerCase();
  if (usuarioCorreo.length >= 4 && v.toLowerCase().includes(usuarioCorreo)) {
    return 'La contraseña no puede contener su correo';
  }
  const comunes = ['contrasena', 'password', '12345678', 'qwerty', 'mercamaquinarias', 'administrador'];
  if (comunes.some((p) => v.toLowerCase().includes(p))) return 'Esa contraseña es demasiado común';
  return null;
}

/* Emite un código y lo manda. La respuesta NUNCA dice si el correo
   existe: eso convertiría la pantalla en un detector de cuentas. */
function emitirCodigo({ correo: destino, tipo, idUsuario, nombre }) {
  if (!db.permitir(`codigo:${destino}`, LIMITES.codigos.tope, LIMITES.codigos.minutos)) {
    return { limitado: true };
  }
  const { codigo, minutos } = db.crearCodigo({ correo: destino, tipo, idUsuario });
  correo.enviarCodigo({ para: destino, codigo, tipo, nombre, minutos });
  return { limitado: false, minutos };
}

async function registro(req, res) {
  const c = await leerCuerpo(req);
  const ip = origen(req);

  if (!db.permitir(`registro:${ip}`, LIMITES.registro.tope, LIMITES.registro.minutos)) {
    return fallo(res, 429, 'Demasiadas cuentas creadas desde esta conexión. Inténtelo más tarde.');
  }

  if (!correoValido(c.correo)) return fallo(res, 400, 'Escriba un correo válido');
  const debil = claveDebil(c.clave, c.correo);
  if (debil) return fallo(res, 400, debil);
  if (!texto(c.nombre, 120)) return fallo(res, 400, 'Escriba su nombre');

  const esDealer = c.tipo === 'dealer';
  let rnc = null;
  let solicitud = null;
  if (esDealer) {
    // Una cuenta de empresa sin dirección ni teléfono no sirve: su
    // página pública quedaría sin forma de visitarla ni de llamar.
    if (!texto(c.empresa, 160)) return fallo(res, 400, 'Escriba la razón social de la empresa');
    rnc = rncValido(c.rnc);
    if (!rnc) return fallo(res, 400, 'El RNC de la empresa tiene 9 dígitos');
    if (!telefonoValido(c.telefono)) return fallo(res, 400, 'Indique el teléfono principal de la empresa, de 10 dígitos');
    if (!texto(c.direccion, 200) || String(c.direccion).trim().length < 8) {
      return fallo(res, 400, 'Indique la dirección de la oficina principal');
    }
    if (!texto(c.provincia, 60)) return fallo(res, 400, 'Indique la provincia de la oficina principal');

    // Quién responde por la empresa. Es la persona con la que el
    // administrador habla si algo del expediente no cuadra, así que se
    // pide aparte de quien abre la cuenta.
    if (!texto(c.encargado, 120)) return fallo(res, 400, 'Indique el nombre del encargado o representante');

    solicitud = {
      nombreComercial: texto(c.nombreComercial, 160),
      aniosOperando: entero(c.aniosOperando),
      encargado: texto(c.encargado, 120),
      cargo: texto(c.cargo, 80),
      equiposInventario: entero(c.equiposInventario),
      equiposPublicar: entero(c.equiposPublicar),
      tiposEquipo: texto(c.tiposEquipo, 300),
      origen: texto(c.origen, 120),
      comentario: texto(c.comentario, 1000),
    };
  }

  /* La aceptación de las condiciones se comprueba AQUÍ, no solo en el
     navegador. Una casilla marcada en el formulario no prueba nada:
     quien llame a esta ruta directamente se la salta, y entonces el
     sitio tendría cuentas sin constancia de haber aceptado nada, que es
     justo lo que la tabla existe para evitar.

     Se exige la versión vigente de cada documento obligatorio. Mandar
     una versión antigua no vale: sería constancia de haber aceptado un
     texto que ya no es el que rige. */
  const aceptado = (c.acepta && typeof c.acepta === 'object') ? c.acepta : {};
  const faltan = legales.OBLIGATORIOS.filter((d) => aceptado[d.id] !== d.version);
  if (faltan.length) {
    return fallo(res, 400,
      `Debe aceptar ${faltan.map((d) => d.nombre).join(' y ')} para crear la cuenta`);
  }

  if (db.usuarioPorCorreo(c.correo)) return fallo(res, 409, 'Ya existe una cuenta con ese correo');

  let idUsuario;
  let idOrg;
  try {
    ({ idUsuario, idOrg } = db.crearCuenta({
      correo: c.correo,
      clave: c.clave,
      nombre: texto(c.nombre, 120),
      telefono: texto(c.telefono, 40),
      tipo: esDealer ? 'dealer' : 'particular',
      empresa: texto(c.empresa, 160),
      rnc,
      direccion: texto(c.direccion, 200),
      provincia: texto(c.provincia, 60),
      municipio: texto(c.municipio, 60),
      solicitud,
    }));
  } catch (e) {
    if (String(e.message).includes('UNIQUE') && String(e.message).includes('rnc')) {
      return fallo(res, 409, 'Ese RNC ya está registrado por otra cuenta');
    }
    throw e;
  }

  /* Se anota la aceptación en cuanto la cuenta existe, antes de nada
     más: si algo fallara después, es preferible una cuenta con la
     constancia guardada que una cuenta sin ella. */
  for (const d of legales.OBLIGATORIOS) {
    db.registrarAceptacion({
      usuarioId: idUsuario,
      documento: d.id,
      version: d.version,
      ip,
      userAgent: req.headers['user-agent'],
    });
  }

  // El expediente completo va al equipo que revisa. Se manda aquí y no
  // al verificar el correo porque `enviar` no lanza nunca: si el correo
  // falla, la solicitud sigue en la base y se ve en el panel.
  if (esDealer) avisarSolicitudDealer(idOrg);

  // La cuenta existe pero todavía no hay sesión: primero el código.
  emitirCodigo({ correo: c.correo, tipo: 'verificacion', idUsuario, nombre: texto(c.nombre, 120) });

  return responder(res, 201, {
    verificacion: 'verificacion',
    correo: String(c.correo).trim().toLowerCase(),
    mensaje: esDealer
      ? 'Le enviamos un código de 6 dígitos para confirmar su correo. Después revisaremos los datos de la empresa.'
      : 'Le enviamos un código de 6 dígitos para confirmar su correo.',
  });
}

async function entrar(req, res) {
  const c = await leerCuerpo(req);
  const ip = origen(req);

  if (!db.permitir(`acceso:${ip}`, LIMITES.acceso.tope, LIMITES.acceso.minutos)) {
    return fallo(res, 429, 'Demasiados intentos desde esta conexión. Espere unos minutos.');
  }

  const u = db.usuarioPorCorreo(c.correo);

  // Mismo mensaje para correo inexistente y contraseña incorrecta: si
  // se distinguen, la pantalla se convierte en un detector de qué
  // correos tienen cuenta.
  if (!u || !db.claveCorrecta(String(c.clave || ''), u.clave_hash, u.clave_sal)) {
    return fallo(res, 401, 'Correo o contraseña incorrectos');
  }

  db.limpiarIntentos(`acceso:${ip}`);

  // Correo sin confirmar: se retoma la verificación pendiente.
  if (!u.correo_verificado) {
    emitirCodigo({ correo: u.correo, tipo: 'verificacion', idUsuario: u.id, nombre: u.nombre });
    return responder(res, 200, {
      verificacion: 'verificacion',
      correo: u.correo,
      mensaje: 'Su correo aún no está confirmado. Le enviamos un código nuevo.',
    });
  }

  // Equipo ya conocido: la contraseña basta. En uno nuevo, código.
  if (db.dispositivoDeConfianza(leerCookies(req)[COOKIE_EQUIPO], u.id)) {
    const testigo = db.abrirSesion(u.id);
    return responder(res, 200, sesionPublica(u.id), { 'Set-Cookie': cookieSesion(testigo) });
  }

  emitirCodigo({ correo: u.correo, tipo: 'acceso', idUsuario: u.id, nombre: u.nombre });
  return responder(res, 200, {
    verificacion: 'acceso',
    correo: u.correo,
    mensaje: 'Le enviamos un código de acceso porque no reconocemos este equipo.',
  });
}

/* Comprueba el código y abre la sesión. Es el único sitio por el que
   se entra tras un registro o desde un equipo nuevo. */
async function verificar(req, res) {
  const c = await leerCuerpo(req);
  const tipo = ['verificacion', 'acceso'].includes(c.tipo) ? c.tipo : 'verificacion';
  const destino = String(c.correo || '').trim().toLowerCase();

  if (!db.permitir(`verificar:${origen(req)}`, 20, 15)) {
    return fallo(res, 429, 'Demasiados intentos. Espere unos minutos.');
  }

  const r = db.verificarCodigo({ correo: destino, tipo, codigo: c.codigo });
  if (!r.ok) {
    const mensajes = {
      inexistente: 'No hay ningún código pendiente. Solicite uno nuevo.',
      vencido: 'El código venció. Solicite uno nuevo.',
      agotado: 'Demasiados intentos con ese código. Solicite uno nuevo.',
      usado: 'Ese código ya se utilizó.',
      incorrecto: r.restantes > 0
        ? `Código incorrecto. Le quedan ${r.restantes} ${r.restantes === 1 ? 'intento' : 'intentos'}.`
        : 'Código incorrecto. Solicite uno nuevo.',
    };
    return fallo(res, 400, mensajes[r.motivo] || 'Código incorrecto');
  }

  const u = db.usuarioPorId(r.usuario_id);
  if (!u) return fallo(res, 400, 'La cuenta ya no existe');

  if (tipo === 'verificacion') {
    db.marcarCorreoVerificado(u.id);
    // Bienvenida solo al confirmar la cuenta, no en cada acceso desde
    // un equipo nuevo. Orienta sobre el siguiente paso, que es distinto
    // según se haya registrado como particular o como empresa.
    const org = db.organizacionDe(u.id);
    correo.enviarBienvenida({
      para: u.correo,
      nombre: u.nombre,
      esDealer: !!(org && org.tipo === 'dealer'),
    });
  }

  const cookies = [cookieSesion(db.abrirSesion(u.id))];
  if (c.recordar !== false) {
    cookies.push(cookieEquipo(db.recordarDispositivo(u.id, equipoDescrito(req))));
  }
  return responder(res, 200, sesionPublica(u.id), { 'Set-Cookie': cookies });
}

/* Reenvío. Responde igual exista o no la cuenta. */
async function reenviar(req, res) {
  const c = await leerCuerpo(req);

  /* Tope por IP, que faltaba. El de `emitirCodigo` es por correo
     destino, así que no frena a quien recorre una lista de correos: con
     cinco por cuenta y cuarto de hora, un guion manda veinte avisos por
     hora a cada anunciante y de paso agota la cuota del proveedor, con
     lo que dejan de salir los códigos legítimos y los comprobantes. */
  if (!db.permitir(`reenviar:${origen(req)}`, 20, 15)) {
    return fallo(res, 429, 'Demasiadas peticiones. Espere unos minutos.');
  }

  const tipo = ['verificacion', 'acceso', 'restablecer'].includes(c.tipo) ? c.tipo : 'verificacion';
  const u = db.usuarioPorCorreo(c.correo);

  if (u) emitirCodigo({ correo: u.correo, tipo, idUsuario: u.id, nombre: u.nombre });

  return responder(res, 202, { mensaje: 'Si esa cuenta existe, le enviamos un código nuevo.' });
}

/* ── Recuperación de contraseña ─────────────────────────── */

async function recuperar(req, res) {
  const c = await leerCuerpo(req);

  /* El mismo tope por IP que su vecina, y por el mismo motivo: sin él,
     esta ruta sirve para mandarle a medio directorio un «alguien quiere
     cambiar su contraseña» cada quince minutos. */
  if (!db.permitir(`recuperar:${origen(req)}`, 20, 15)) {
    return fallo(res, 429, 'Demasiadas peticiones. Espere unos minutos.');
  }

  if (!correoValido(c.correo)) return fallo(res, 400, 'Escriba un correo válido');

  const u = db.usuarioPorCorreo(c.correo);
  // Se responde lo mismo haya cuenta o no: es lo que impide averiguar
  // qué correos están registrados probándolos aquí uno a uno.
  if (u) emitirCodigo({ correo: u.correo, tipo: 'restablecer', idUsuario: u.id, nombre: u.nombre });

  return responder(res, 202, {
    verificacion: 'restablecer',
    correo: String(c.correo).trim().toLowerCase(),
    mensaje: 'Si esa cuenta existe, le enviamos un código para cambiar la contraseña.',
  });
}

async function restablecer(req, res) {
  const c = await leerCuerpo(req);
  const destino = String(c.correo || '').trim().toLowerCase();

  if (!db.permitir(`restablecer:${origen(req)}`, 20, 15)) {
    return fallo(res, 429, 'Demasiados intentos. Espere unos minutos.');
  }

  const debil = claveDebil(c.clave, destino);
  if (debil) return fallo(res, 400, debil);

  const r = db.verificarCodigo({ correo: destino, tipo: 'restablecer', codigo: c.codigo });
  if (!r.ok) {
    return fallo(res, 400, r.motivo === 'vencido'
      ? 'El código venció. Solicite uno nuevo.'
      : 'Código incorrecto o vencido. Solicite uno nuevo.');
  }

  const u = db.usuarioPorId(r.usuario_id);
  if (!u) return fallo(res, 400, 'La cuenta ya no existe');

  db.cambiarClave(u.id, c.clave);
  // Cambiar la contraseña echa fuera a todo el mundo, incluido quien
  // hubiera entrado sin permiso. Es el sentido de recuperarla.
  db.cerrarTodoDe(u.id);
  db.marcarCorreoVerificado(u.id);
  correo.enviarAvisoCambioClave({ para: u.correo, nombre: u.nombre });

  const testigo = db.abrirSesion(u.id);
  return responder(res, 200, sesionPublica(u.id), { 'Set-Cookie': cookieSesion(testigo) });
}

function salir(req, res, ctx) {
  if (ctx) db.cerrarSesion(ctx.testigo);
  return responder(res, 200, { ok: true }, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` });
}

/* Retrato de la sesión que consume el navegador: quién es, en qué
   organización trabaja y qué tiene contratado. */
function sesionPublica(idUsuario) {
  const u = db.usuarioPorId(idUsuario);
  const org = db.organizacionDe(idUsuario);
  const susc = org ? db.suscripcionActiva(org.id) : null;

  return {
    usuario: { id: u.id, nombre: u.nombre, correo: u.correo, telefono: u.telefono, esAdmin: !!u.es_admin },
    organizacion: org && {
      id: org.id, tipo: org.tipo, nombre: org.nombre, rncMascara: rncEnmascarado(org.rnc), slug: org.slug,
      verificada: !!org.verificada, perfilPublico: !!org.perfil_publico, rol: org.rol,
      estadoRevision: org.estado_revision, descripcion: org.descripcion, web: org.web,
      exentaPago: !!org.exenta_pago,
    },
    suscripcion: susc && {
      id: susc.id, plan: susc.plan_id, planNombre: susc.plan_nombre, modalidad: susc.modalidad,
      ciclo: susc.ciclo, estado: susc.estado, fin: susc.fin, proximoCargo: susc.proximo_cargo,
      anunciosIncluidos: susc.anuncios_incluidos,
    },
    // El asistente de publicación necesita saber desde qué sucursal
    // se ofrece el equipo, así que viajan con la sesión.
    sucursales: org ? db.sucursalesDe(org.id) : [],
    verificado: !!u.correo_verificado,

    /* Qué condiciones tiene aceptadas y cuáles le faltan.
     *
     * Viaja con la sesión para que el sitio pueda avisar en cuanto
     * alguien entra, sin una petición aparte. `faltan` es lo que el
     * servidor va a exigir de todos modos al publicar o al pagar: el
     * aviso no es la regla, solo la manera de que nadie llegue al
     * final de un formulario para que entonces se le diga que no. */
    legales: (() => {
      const aceptado = db.aceptacionesDe(u.id);
      return {
        aceptado,
        faltan: {
          publicar: legales.faltanPorAceptar(aceptado, legales.PARA_PUBLICAR),
          pagar: legales.faltanPorAceptar(aceptado, legales.PARA_PAGAR),
        },
      };
    })(),
  };
}

/* Aceptar documentos desde el sitio, ya con sesión abierta.
 *
 * Hace falta para dos cosas: quien tenía cuenta antes de que existieran
 * estas condiciones, y quien las aceptó en una versión anterior a la
 * vigente. En los dos casos se le pide aceptar antes de publicar o
 * pagar, y esta ruta es por donde pasa esa aceptación.
 *
 * Solo se admite la versión VIGENTE. Aceptar una versión antigua sería
 * constancia de haber aceptado un texto que ya no rige, que es peor que
 * no tener constancia: parece que la hay. */
const aceptarLegales = conSesion(async (req, res, ctx) => {
  const c = await leerCuerpo(req);
  const pedidos = Array.isArray(c.documentos) ? c.documentos : [];
  if (!pedidos.length) return fallo(res, 400, 'No se indicó qué documento se acepta');

  const desconocidos = pedidos.filter((id) => !legales.documento(id));
  if (desconocidos.length) return fallo(res, 400, 'Documento desconocido');

  for (const id of pedidos) {
    db.registrarAceptacion({
      usuarioId: ctx.usuario.id,
      documento: id,
      version: legales.versionDe(id),
      ip: origen(req),
      userAgent: req.headers['user-agent'],
    });
  }

  return responder(res, 200, sesionPublica(ctx.usuario.id));
});

const verSesion = (req, res, ctx) =>
  ctx ? responder(res, 200, sesionPublica(ctx.usuario.id)) : responder(res, 200, { usuario: null });

/* ── Rutas: dealer ──────────────────────────────────────── */

/* Registrar el RNC es lo que convierte una cuenta en dealer. Se hace
   aquí y no en el formulario de publicación para que el dato quede
   asociado a la organización de forma permanente: se escribe una vez
   y todos los anuncios futuros lo heredan. */
const registrarDealer = conSesion(async (req, res, ctx) => {
  if (ctx.organizacion.rol !== 'propietario') {
    return fallo(res, 403, 'Solo el propietario de la cuenta puede registrar el RNC');
  }
  const c = await leerCuerpo(req);
  const rnc = rncValido(c.rnc);
  if (!rnc) return fallo(res, 400, 'El RNC de la empresa tiene 9 dígitos');
  if (!texto(c.empresa, 160)) return fallo(res, 400, 'Escriba la razón social de la empresa');
  if (!texto(c.encargado, 120)) return fallo(res, 400, 'Indique el nombre del encargado o representante');

  try {
    db.registrarDealer(ctx.organizacion.id, ctx.usuario.id, {
      rnc,
      empresa: texto(c.empresa, 160),
      web: texto(c.web, 200),
      descripcion: texto(c.descripcion, 2000),
      solicitud: {
        nombreComercial: texto(c.nombreComercial, 160),
        aniosOperando: entero(c.aniosOperando),
        encargado: texto(c.encargado, 120),
        cargo: texto(c.cargo, 80),
        equiposInventario: entero(c.equiposInventario),
        equiposPublicar: entero(c.equiposPublicar),
        tiposEquipo: texto(c.tiposEquipo, 300),
        origen: texto(c.origen, 120),
        comentario: texto(c.comentario, 1000),
      },
    });
  } catch (e) {
    return fallo(res, e.codigo || 500, e.message);
  }

  avisarSolicitudDealer(ctx.organizacion.id);
  return responder(res, 200, sesionPublica(ctx.usuario.id));
});

/* ── Rutas: fotografías ─────────────────────────────────── */

/* Sube un par de imágenes ya reducidas por el navegador y devuelve sus
   rutas. Se guardan en disco y la base solo se queda con la ruta: ver
   el porqué, con los números medidos, en la cabecera de fotos.js.
 *
 * Exige sesión. Subir archivos sin identificar a quien sube convierte
 * el servidor en alojamiento gratuito para cualquiera. */
const subirFoto = conSesion(async (req, res, ctx) => {
  if (!db.permitir(`fotos:${ctx.usuario.id}`, 120, 60)) {
    return fallo(res, 429, 'Demasiadas fotos seguidas. Espere unos minutos.');
  }

  const c = await leerCuerpo(req);
  try {
    // La miniatura es opcional: si el navegador no pudo generarla, la
    // completa sirve para las dos cosas y se ve igual, solo pesa más.
    const completa = fotos.guardar(c.completa);
    const miniatura = c.miniatura ? fotos.guardar(c.miniatura) : completa;
    return responder(res, 201, { completa, miniatura });
  } catch (e) {
    return fallo(res, e.codigo || 500, e.message);
  }
});

/* Dentro del manejador que crea un anuncio, la variable local con las
   fotos del anuncio tapa al módulo `fotos`. La comprobación de rutas
   vive aquí para poder usarla desde allí. */
const esRutaDeFoto = (ruta) => !!fotos.archivoDe(ruta || '');

/* ── Rutas: videos ──────────────────────────────────────────── */

/* Sube un video ya recortado y reducido a 720p por el navegador, y
   devuelve su ruta. El póster —el primer fotograma— viaja como una foto
   normal y se guarda con las demás.
 *
 * El límite es más estrecho que el de las fotos: 12 subidas por hora
 * frente a 120. Un video ocupa doce veces más, y a diferencia de las
 * fotos —que se suben en tandas de veinte— aquí tres son ya el máximo
 * que admite el mejor plan.
 *
 * NO se recodifica aquí. El VPS tiene 512 MB de RAM y un núcleo: pasarle
 * ffmpeg a un video dejaría el sitio sin responder durante minutos. Lo
 * que llega ya viene reducido desde el navegador. */
const subirVideo = conSesion(async (req, res, ctx) => {
  if (!db.permitir(`videos:${ctx.usuario.id}`, 12, 60)) {
    return fallo(res, 429, 'Demasiados videos seguidos. Espere unos minutos.');
  }

  const c = await leerCuerpo(req);
  try {
    const url = videos.guardar(c.video);
    // El póster es opcional: sin él, `<video>` enseña un rectángulo
    // negro hasta que alguien pulsa, pero el video funciona igual.
    let poster = null;
    if (c.poster) {
      try { poster = fotos.guardar(c.poster); } catch (_) { poster = null; }
    }
    return responder(res, 201, { url, poster, duracion: Number(c.duracion) || null });
  } catch (e) {
    return fallo(res, e.codigo || 500, e.message);
  }
});

/* ── Rutas: portada ─────────────────────────────────────────
   Lo que la portada y la página de categorías necesitan para enseñar
   máquinas de verdad: la fotografía del héroe y unas cuantas de cada
   categoría. Va aparte de /api/estadisticas porque las fotos pesan y
   solo hacen falta en esas dos pantallas. */
/* Fotografías del héroe de la portada.

   Son archivos del sitio, no anuncios del catálogo. Se probó con las
   últimas máquinas publicadas y el resultado dependía de quién hubiera
   subido algo esa mañana: una foto de móvil mal encuadrada acababa de
   portada. Estas están elegidas para eso y no cambian solas.

   La pantalla toma UNA al azar en cada visita. El equipo puede fijar
   otra desde /admin.html y entonces manda esa. */
const FONDOS_HEROE = [
  // La fotografía del paquete de marca, sin texto quemado: el titular
  // lo pone el HTML encima. Va primera por ser la imagen oficial.
  { imagen: '/brand_assets/img/hero-limpio.jpg', alt: 'Maquinaria pesada de MercaMaquinarias en obra' },
  { imagen: '/brand_assets/portada/heroe-1.jpg', alt: 'Maquinaria pesada de movimiento de tierra en obra' },
  { imagen: '/brand_assets/portada/heroe-2.jpg', alt: 'Excavadora trabajando sobre terreno abierto' },
  { imagen: '/brand_assets/portada/heroe-3.jpg', alt: 'Flota de equipo pesado alineada en un patio' },
  { imagen: '/brand_assets/portada/heroe-4.jpg', alt: 'Equipo de construcción en plena faena' },
  { imagen: '/brand_assets/portada/heroe-5.jpg', alt: 'Maquinaria de construcción al pie de obra' },
];

function verPortada(req, res) {
  const heroe = db.heroePortada(10);

  /* Se descarta lo que ya no está en disco. Un anuncio puede haber
     perdido su archivo —una restauración a medias, una limpieza— y
     entonces el navegador pide una imagen que da 404 y el héroe se
     queda sin fondo. Comprobarlo aquí cuesta unos stat y evita
     mandarle al visitante una foto rota.

     Las guardadas como data URI se dejan pasar: no son archivos. */
  const existe = (ruta) => !String(ruta).startsWith('/fotos/') || !!fotos.rutaExiste(ruta);

  return responder(res, 200, {
    heroe: {
      imagen: heroe.imagen && existe(heroe.imagen) ? heroe.imagen : null,
      alt: heroe.alt,
      opciones: FONDOS_HEROE,
      // Las del catálogo siguen ofreciéndose en /admin.html para poder
      // fijar una máquina concreta; ya no entran en la rotación.
      delCatalogo: heroe.opciones.filter((o) => existe(o.imagen)),
    },
    categorias: db.fotosPorCategoria(4),
  });
}

/* Fija —o quita— la fotografía del héroe. Solo administración.

   La ruta tiene que ser una de /fotos, que es lo que sirve el propio
   sitio. Aceptar una URL cualquiera dejaría la portada cargando una
   imagen de un tercero: se la saltaría la política de contenido, y
   quien la aloja podría cambiarla o retirarla cuando quisiera. */
const editarPortada = conAdmin(async (req, res) => {
  const c = await leerCuerpo(req);

  if (c.imagen !== undefined) {
    const ruta = String(c.imagen || '');
    if (ruta && !fotos.archivoDe(ruta)) {
      return fallo(res, 400, 'La imagen tiene que ser una que se haya subido al sitio');
    }
    db.guardarAjuste('heroe_imagen', ruta);
  }

  if (c.alt !== undefined) db.guardarAjuste('heroe_alt', texto(c.alt, 160) || '');

  return responder(res, 200, { heroe: db.heroePortada() });
});

/* Tasa de referencia del dólar. Solo administración.

   El catálogo la usa para COMPARAR precios en pesos y en dólares al
   filtrar y ordenar; ningún precio publicado cambia con ella. Sin
   fijar, vale la de MERCA_TASA_USD o la de partida de precios.js, que
   no es la oficial: Victor la fija aquí. */
const verTasaCambio = conAdmin((req, res) => responder(res, 200, {
  ...db.tasaUsd(),
  minimo: precios.TASA_USD_MIN,
  maximo: precios.TASA_USD_MAX,
  porDefecto: precios.TASA_USD_POR_DEFECTO,
}));

/* Vacío o null vuelve a la tasa de entorno o de partida. Fuera de rango
   es un error de tecleo (630 por 63) y se rechaza: aceptarlo reordenaría
   el catálogo entero sin que nadie lo notara. */
const editarTasaCambio = conAdmin(async (req, res) => {
  const c = await leerCuerpo(req);
  const crudo = c.tasa == null ? '' : String(c.tasa).trim();
  if (crudo === '') {
    db.guardarAjuste('tasa_usd', '');
  } else {
    const tasa = precios.tasaValida(crudo);
    if (!tasa) {
      return fallo(res, 400,
        `La tasa tiene que ser un número entre ${precios.TASA_USD_MIN} y ${precios.TASA_USD_MAX} pesos por dólar`);
    }
    db.guardarAjuste('tasa_usd', String(tasa));
  }
  return responder(res, 200, db.tasaUsd());
});

/* ── Rutas: solicitudes de servicio ─────────────────────────
   Alquiler, transporte e importación. Antes estos formularios no
   llegaban a ningún sitio: pintaban un resumen en pantalla y le pedían
   al cliente que lo copiara a WhatsApp. Quien no lo copiaba se perdía.

   Va sin sesión a propósito: pedir cotización no debe exigir cuenta.
   Lo que sí se exige es con qué responder. */
/* Los servicios por los que se puede pedir cotización.
 *
 * 'transporte' salió de aquí cuando el servicio se retiró. La página ya
 * decía «suspendido» y el asistente también, pero esta lista lo seguía
 * aceptando: por la API se podía pedir un servicio que la empresa no
 * presta, y la solicitud generaba su correo y su número de referencia
 * como cualquier otra. Alguien se habría quedado esperando una
 * cotización que no iba a llegar nunca.
 *
 * Las solicitudes de transporte YA GUARDADAS no se tocan: son
 * históricas y el filtro de administración las sigue listando. */
const SERVICIOS_SOLICITUD = servicios.serviciosQueAdmitenSolicitud();

/* Los que alguna vez se ofrecieron. El filtro de administración los
   sigue admitiendo para poder buscar lo que entró entonces; lo que no
   se admite es crear una solicitud nueva. */
const SERVICIOS_HISTORICOS = Object.keys(servicios.SERVICIOS)
  .filter((s) => !servicios.seOfrece(s));

async function crearSolicitudServicio(req, res) {
  const c = await leerCuerpo(req);
  const ip = origen(req);

  // El mismo tope que el registro: un humano no manda seis cotizaciones
  // en una hora, un guion sí.
  if (!db.permitir(`servicio:${ip}`, 6, 60)) {
    return fallo(res, 429, 'Demasiadas solicitudes desde esta conexión. Inténtelo más tarde.');
  }

  const servicio = String(c.servicio || '');
  if (!SERVICIOS_SOLICITUD.includes(servicio)) return fallo(res, 400, 'Servicio no reconocido');

  const nombre = texto(c.nombre, 120);
  if (!nombre || nombre.length < 3) return fallo(res, 400, 'Escriba su nombre o el de su empresa');

  const telefono = String(c.telefono || '').replace(/\D/g, '');
  if (telefono.length !== 10) return fallo(res, 400, 'Indique un teléfono de 10 dígitos');

  // El correo es opcional, pero si viene tiene que ser válido: uno mal
  // escrito es peor que ninguno, porque se cuenta como vía de respuesta.
  const correoCliente = texto(c.correo, 160);
  if (correoCliente && !correoValido(correoCliente)) return fallo(res, 400, 'Escriba un correo válido o déjelo vacío');

  /* El detalle llega como pares rótulo/valor de la propia pantalla. Se
     recorta y se limita: es texto libre que acaba en un correo. */
  const detalle = {};
  Object.entries(c.detalle || {}).slice(0, 25).forEach(([k, v]) => {
    // 60 caracteres cortaban rótulos legítimos a media palabra: «Qué
    // trabajo va a hacer y/u otras especificaciones importante».
    const rotulo = texto(k, 120);
    const valor = texto(v, 600);
    if (rotulo && valor) detalle[rotulo] = valor;
  });

  const solicitud = db.crearSolicitudServicio({
    servicio, nombre, telefono, correo: correoCliente, empresa: texto(c.empresa, 120), detalle,
  });

  correo.enviarSolicitudServicio(solicitud);
  return responder(res, 201, {
    referencia: solicitud.referencia,
    mensaje: correoCliente
      ? 'Recibimos su solicitud. Le enviamos copia por correo y le respondemos con precio y disponibilidad.'
      : 'Recibimos su solicitud. Le respondemos con precio y disponibilidad.',
  });
}

/* ── Ruta: asistente de soporte ─────────────────────────── */

/* Va sin sesión a propósito: quien tiene una duda sobre cómo funciona
   el sitio todavía no tiene cuenta, y obligarle a crearla para
   preguntar es justo lo contrario de lo que hace un soporte.
 *
 * La clave de Anthropic no sale de tools/chat.js. El navegador manda
 * texto y recibe texto; nunca ve el prompt del sistema ni la clave.
 *
 * El historial llega del cliente porque no se guarda en la base. Eso
 * significa que se puede falsificar: alguien puede inventarse turnos
 * del asistente y hacerle decir cosas. Es aceptable aquí —solo se
 * engañaría a sí mismo, no hay datos de nadie más de por medio— y lo
 * que de verdad manda, el prompt del sistema, se arma en el servidor
 * en cada petición. */
async function conversarConSoporte(req, res) {
  const ip = origen(req);
  if (!db.permitir(`chat:${ip}`, LIMITES.chat.tope, LIMITES.chat.minutos)) {
    return fallo(res, 429, 'Ha hecho muchas consultas seguidas. Espere unos minutos '
      + `o escríbanos a ${chat.CORREO_GENERAL}.`);
  }

  const c = await leerCuerpo(req);
  const { error, turnos } = chat.limpiarTurnos(c.mensajes);
  if (error) return fallo(res, 400, error);

  const r = await chat.conversar(turnos);
  if (!r.ok) {
    /* Un fallo del asistente no puede dejar a la persona en un
       callejón: el mensaje amable lleva siempre los dos contactos, que
       es lo mismo que haría el asistente si no supiera la respuesta.
       El motivo técnico queda en el registro del servidor, no en
       pantalla. */
    return fallo(res, 503, 'Ahora mismo no puedo responder. Escríbanos a '
      + `${chat.CORREO_GENERAL} y le atendemos por ahí.`);
  }

  return responder(res, 200, { respuesta: r.texto });
}

const listarSolicitudesServicio = conAdmin((req, res, ctx, consulta) => {
  const q = consulta || new URLSearchParams();
  return responder(res, 200, {
    solicitudes: db.solicitudesServicio({
      /* El filtro del panel sí admite los retirados: las solicitudes de
         transporte que entraron antes siguen ahí y hay que poder
         buscarlas. Lo que no se admite es crear una nueva. */
      servicio: [...SERVICIOS_SOLICITUD, ...SERVICIOS_HISTORICOS].includes(q.get('servicio'))
        ? q.get('servicio') : undefined,
      estado: ['nueva', 'atendida', 'cerrada'].includes(q.get('estado')) ? q.get('estado') : undefined,
    }),
    /* Para que la consola pinte los filtros desde aquí y sepa cuáles
       están apagados, en vez de tener su propia lista que se desfase. */
    servicios: { activos: SERVICIOS_SOLICITUD, historicos: SERVICIOS_HISTORICOS },
  });
});

/* Guarda quién la atendió. No va por la bitácora: la manda un
   visitante, no una organización, y el «quién» queda en su propia fila. */
const marcarSolicitudServicio = conAdmin(async (req, res, ctx, idSol) => {
  const c = await leerCuerpo(req);
  if (!['nueva', 'atendida', 'cerrada'].includes(c.estado)) {
    return fallo(res, 400, 'Estado inválido');
  }
  if (!db.marcarSolicitudServicio(idSol, c.estado, texto(c.nota, 500), ctx.usuario.id)) {
    return fallo(res, 404, 'Esa solicitud no existe');
  }
  const s = db.solicitudServicio(idSol);
  const quien = s.atendida_por ? db.usuarioPorId(s.atendida_por) : null;
  return responder(res, 200, {
    ok: true,
    estado: c.estado,
    solicitud: { ...s, atendida_por_nombre: quien ? quien.nombre : null },
  });
});

/* ── Rutas: taxonomía ───────────────────────────────────── */

/* La jerarquía completa, para que la pantalla de publicación arme sus
   selectores. Se sirve desde el servidor —en vez de que el navegador
   cargue assets/taxonomia.js directamente— para que haya una sola
   respuesta cacheable y para poder recortar en el futuro lo que no
   necesite el cliente sin tocar las pantallas. */
function verTaxonomia(req, res) {
  return responder(res, 200, {
    categorias: taxonomia.CATEGORIAS,
    marcas: taxonomia.MARCAS,
    marcasPorSub: taxonomia.MARCAS_POR_SUB,
    modelos: taxonomia.MODELOS,
    motores: taxonomia.MOTORES,
    transmisiones: taxonomia.TRANSMISIONES,
    subsConTrenMotriz: taxonomia.SUBS_CON_TREN_MOTRIZ,
  });
}

/* ── Rutas: publicidad ──────────────────────────────────── */

/* Los ocho formatos del tarifario, en el orden de las fichas de venta
   (A a la H). Los cuatro primeros nombres son los de siempre y no se
   renombran: hay campañas guardadas con ese valor en la base.

   A superior         1216×160  portada, bajo el héroe      escritorio
   B catalogo          970× 90  equipos.html, sobre la lista escritorio
   C bloque            600×500  portada, fila de «vende»     escritorio
   D ficha             300×250  equipo.html, columna lateral ambas
   E lateral-izq/der   160×600  rieles de la portada         escritorio
   F movil-superior    320×180  portada, bajo el buscador    móvil
   G movil-cuadro      336×336  portada, entre bloques       móvil
   H movil-lista       336×336  intercalado en las listas    móvil */
const ESPACIOS = [
  'superior', 'catalogo', 'bloque', 'ficha',
  'lateral-izq', 'lateral-der',
  'movil-superior', 'movil-cuadro', 'movil-lista',
];

/* Lo que ve el visitante, agrupado por espacio. La impresión se cuenta
   aquí y no en el navegador: un contador que depende de que el cliente
   avise se pierde con cualquier bloqueador. */
function listarPublicidad(req, res) {
  const vigentes = db.publicidadVigente();
  db.sumarImpresiones(vigentes.map((p) => p.id));

  const porEspacio = {};
  vigentes.forEach((p) => { (porEspacio[p.espacio] ||= []).push(p); });
  return responder(res, 200, { publicidad: porEspacio });
}

/* Registra el clic y redirige. Se pasa por aquí en vez de enlazar
   directo para poder decirle al anunciante cuántos clics recibió.

   Se redirige con 302 y no se devuelve JSON para que el enlace siga
   siendo un enlace: se abre en pestaña nueva, se copia y funciona sin
   JavaScript. */
function clicPublicidad(req, res, ctx, idPub) {
  const p = db.publicidadPorId(idPub);
  if (!p || !p.enlace) return fallo(res, 404, 'No existe');

  db.sumarClic(idPub);
  res.writeHead(302, { Location: p.enlace });
  res.end();
}

function datosPublicidad(c, { parcial = false } = {}) {
  const d = {};

  if (c.espacio !== undefined || !parcial) {
    if (!ESPACIOS.includes(String(c.espacio))) return { error: 'Espacio inválido' };
    d.espacio = String(c.espacio);
  }
  if (c.nombre !== undefined || !parcial) {
    if (!texto(c.nombre, 80)) return { error: 'Escriba un nombre para reconocer la campaña' };
    d.nombre = texto(c.nombre, 80);
  }
  if (c.imagen !== undefined || !parcial) {
    if (!texto(c.imagen, 300)) return { error: 'Cargue la imagen del anuncio' };
    d.imagen = texto(c.imagen, 300);
  }
  if (c.alt !== undefined || !parcial) {
    // Obligatorio: sin esto, quien usa lector de pantalla oye «imagen».
    if (!texto(c.alt, 160)) return { error: 'Escriba qué dice la imagen, para quien no puede verla' };
    d.alt = texto(c.alt, 160);
  }
  if (c.anunciante !== undefined) d.anunciante = texto(c.anunciante, 120);

  if (c.enlace !== undefined) {
    const url = texto(c.enlace, 300);
    // Solo http(s): un `javascript:` en el enlace de un banner es un
    // XSS servido desde la portada.
    if (url && !/^https?:\/\//i.test(url)) return { error: 'El enlace debe empezar por http:// o https://' };
    d.enlace = url;
  }

  const fecha = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);
  if (c.desde !== undefined) d.desde = fecha(c.desde);
  if (c.hasta !== undefined) d.hasta = fecha(c.hasta);
  if (d.desde && d.hasta && d.hasta < d.desde) return { error: 'La fecha de fin va después de la de inicio' };

  if (c.activo !== undefined) d.activo = c.activo ? 1 : 0;
  if (c.orden !== undefined) d.orden = entero(c.orden) ?? 0;

  return { datos: d };
}

const listarPublicidadAdmin = conAdmin((req, res) =>
  responder(res, 200, { publicidad: db.publicidadCompleta(), espacios: ESPACIOS }));

const crearPublicidad = conAdmin(async (req, res) => {
  const c = await leerCuerpo(req);
  const { error, datos } = datosPublicidad(c);
  if (error) return fallo(res, 400, error);
  return responder(res, 201, { anuncio: db.crearPublicidad(datos) });
});

const editarPublicidad = conAdmin(async (req, res, ctx, idPub) => {
  const c = await leerCuerpo(req);
  const { error, datos } = datosPublicidad(c, { parcial: true });
  if (error) return fallo(res, 400, error);
  try {
    return responder(res, 200, { anuncio: db.actualizarPublicidad(idPub, datos) });
  } catch (e) {
    return fallo(res, e.codigo || 500, e.message);
  }
});

const eliminarPublicidad = conAdmin((req, res, ctx, idPub) => {
  if (!db.publicidadPorId(idPub)) return fallo(res, 404, 'Ese anuncio no existe');
  db.borrarPublicidad(idPub);
  return responder(res, 200, { ok: true });
});

/* ── Rutas: flota propia ────────────────────────────────── */

const SERVICIOS = ['alquiler', 'transporte'];

/* Pública: la usan alquiler.html y transporte.html. Solo lo activo. */
function listarFlota(req, res, ctx, servicio) {
  if (!SERVICIOS.includes(servicio)) return fallo(res, 404, 'No existe');
  return responder(res, 200, { servicio, flota: db.flotaPublica(servicio) });
}

/* Valida lo que llega del formulario de administración. Devuelve el
   objeto ya limpio o el error, para no repetir esto en alta y edición. */
function datosFlota(c, servicio, { parcial = false } = {}) {
  const d = {};

  if (c.nombre !== undefined || !parcial) {
    if (!texto(c.nombre, 80)) return { error: 'Escriba el nombre del equipo' };
    d.nombre = texto(c.nombre, 80);
  }
  if (c.detalle !== undefined) d.detalle = texto(c.detalle, 240);
  if (c.icono !== undefined) d.icono = texto(c.icono, 40);
  if (c.foto !== undefined) d.foto = texto(c.foto, 300);
  if (c.capacidadTexto !== undefined) d.capacidad_texto = texto(c.capacidadTexto, 80);

  /* Galería del tipo de equipo. Cada ruta tiene que ser un archivo del
     propio sitio: si se aceptara una URL cualquiera, la ficha acabaría
     cargando la imagen de un tercero que puede cambiarla o retirarla. */
  if (Array.isArray(c.fotos)) {
    const fotos_ = [];
    for (const f of c.fotos.slice(0, 8)) {
      const url = texto(typeof f === 'string' ? f : f && f.url, 300);
      if (!url) continue;
      if (!fotos.archivoDe(url)) return { error: 'Las fotografías tienen que subirse al sitio' };
      fotos_.push({ url, alt: texto(f && f.alt, 160) });
    }
    d.fotos = fotos_;
  }

  if (servicio === 'alquiler') {
    if (c.unidad !== undefined || !parcial) {
      const u = String(c.unidad || 'día').toLowerCase();
      if (!['día', 'dia', 'semana', 'mes', 'viaje', 'hora'].includes(u)) {
        return { error: 'La unidad debe ser día, semana, mes, hora o viaje' };
      }
      d.unidad = u === 'dia' ? 'día' : u;
    }
  } else {
    // La capacidad es lo que decide qué cama se asigna a cada equipo,
    // así que en transporte no es opcional.
    if (c.capacidad !== undefined || !parcial) {
      const cap = entero(c.capacidad);
      if (!cap || cap <= 0) return { error: 'Indique la capacidad en toneladas' };
      d.capacidad = cap;
    }
  }

  if (c.activo !== undefined) d.activo = c.activo ? 1 : 0;
  if (c.orden !== undefined) d.orden = entero(c.orden) ?? 0;

  return { datos: d };
}

const listarFlotaAdmin = conAdmin((req, res, ctx, servicio) => {
  if (!SERVICIOS.includes(servicio)) return fallo(res, 404, 'No existe');
  return responder(res, 200, { servicio, flota: db.flotaCompleta(servicio) });
});

const crearFlota = conAdmin(async (req, res, ctx, servicio) => {
  if (!SERVICIOS.includes(servicio)) return fallo(res, 404, 'No existe');
  const c = await leerCuerpo(req);
  const { error, datos } = datosFlota(c, servicio);
  if (error) return fallo(res, 400, error);
  return responder(res, 201, { elemento: db.crearFlota({ ...datos, servicio }) });
});

const editarFlota = conAdmin(async (req, res, ctx, idFlota) => {
  const actual = db.flotaPorId(idFlota);
  if (!actual) return fallo(res, 404, 'Ese elemento no existe');

  const c = await leerCuerpo(req);
  const { error, datos } = datosFlota(c, actual.servicio, { parcial: true });
  if (error) return fallo(res, 400, error);

  try {
    return responder(res, 200, { elemento: db.actualizarFlota(idFlota, datos) });
  } catch (e) {
    return fallo(res, e.codigo || 500, e.message);
  }
});

/* Borra de verdad. Desactivar es lo habitual —y lo que hace el
   interruptor de la pantalla—, pero un elemento creado por error no
   tiene por qué quedarse ahí para siempre. */
const eliminarFlota = conAdmin((req, res, ctx, idFlota) => {
  const actual = db.flotaPorId(idFlota);
  if (!actual) return fallo(res, 404, 'Ese elemento no existe');
  db.borrarFlota(idFlota);
  return responder(res, 200, { ok: true });
});

/* ── Rutas: revisión de solicitudes ─────────────────────── */

/* Manda el expediente al equipo de revisión. No devuelve nada ni
   propaga errores: `correo.enviar` ya se traga los suyos, y un fallo
   de correo no puede tumbar un registro que sí quedó guardado. La
   solicitud está en la base y se ve igual en el panel. */
function avisarSolicitudDealer(idOrg) {
  const s = db.solicitudCompleta(idOrg, { porOrganizacion: true });
  if (s) correo.enviarSolicitudDealer(s);
}

const listarSolicitudes = conAdmin((req, res, ctx, consulta) => {
  const estado = ['pendiente', 'aprobada', 'rechazada'].includes(consulta?.get('estado'))
    ? consulta.get('estado') : 'pendiente';
  return responder(res, 200, {
    estado,
    pendientes: db.contarPendientes(),
    solicitudes: db.solicitudes(estado),
  });
});

/* ── Comprobantes ───────────────────────────────────────── */

/* Lo que ve el cliente: sus propios comprobantes. */
const misFacturas = conSesion((req, res, ctx) => {
  if (!ctx.organizacion) return responder(res, 200, { facturas: [] });
  return responder(res, 200, {
    facturas: db.facturasDe(ctx.organizacion.id).map((f) => ({
      id: f.id, numero: f.numero, tipo: f.tipo, ncf: f.ncf, fecha: f.fecha,
      concepto: f.concepto, subtotal: f.subtotal, itbis: f.itbis, total: f.total,
      anulada: !!f.anulado_por, hayPdf: !!f.ruta_pdf,
    })),
  });
});

/* Descarga del PDF.
 *
 * Se comprueba que el comprobante sea de quien lo pide —o que quien lo
 * pide sea administrador— antes de leer nada del disco. Un comprobante
 * lleva el RNC y la dirección de una empresa: no es un archivo público
 * aunque su nombre sea adivinable. */
const descargarFactura = conSesion((req, res, ctx, idFactura) => {
  const f = db.facturaPorId(idFactura);
  if (!f) return fallo(res, 404, 'Ese comprobante no existe');

  const esSuyo = ctx.organizacion && f.organizacion_id === ctx.organizacion.id;
  if (!esSuyo && !ctx.usuario.esAdmin) return fallo(res, 404, 'Ese comprobante no existe');

  const bytes = f.ruta_pdf && facturas.leerPdf(f.ruta_pdf);
  if (!bytes) return fallo(res, 404, 'El archivo del comprobante no está disponible');

  res.writeHead(200, {
    'Content-Type': 'application/pdf',
    'Content-Length': bytes.length,
    'Content-Disposition': `inline; filename="${f.numero}.pdf"`,
    // Privado y sin caché: lleva el RNC y la dirección de una empresa.
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return res.end(bytes);
});

/* El mismo comprobante, como página.
 *
 * Es la plantilla rellenada, no un resumen: quien no quiera abrir el
 * PDF —en un teléfono, con el correo desde el navegador— ve exactamente
 * el mismo documento y puede imprimirlo desde ahí. Se sirve con las
 * mismas comprobaciones de propiedad que el PDF. */
const verFactura = conSesion((req, res, ctx, idFactura) => {
  const f = db.facturaPorId(idFactura);
  if (!f) return fallo(res, 404, 'Ese comprobante no existe');

  const esSuyo = ctx.organizacion && f.organizacion_id === ctx.organizacion.id;
  if (!esSuyo && !ctx.usuario.esAdmin) return fallo(res, 404, 'Ese comprobante no existe');

  const html = Buffer.from(facturas.comoHtml(f), 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Content-Length': html.length,
    // Privado y sin caché: lleva el RNC y la dirección de una empresa.
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return res.end(html);
});

/* Administración: el listado, con filtro por mes. */
const listarFacturas = conAdmin((req, res, ctx, consulta) => {
  const mes = /^\d{4}-\d{2}$/.test(consulta?.get('mes') || '') ? consulta.get('mes') : null;
  return responder(res, 200, {
    mes,
    secuencias: db.secuenciasNcf(),
    bajas: facturas.secuenciasBajas().map((s) => ({ tipo: s.tipo, quedan: s.quedan })),
    /* Los pendientes NO se filtran por mes: son trabajo acumulado que
       hay que ver entero, no un corte del periodo que se esté mirando. */
    pendientes: facturas.pendientesDeRegularizar().map((f) => ({
      id: f.id, numero: f.numero, fecha: f.fecha,
      razon_social: f.razon_social, total: f.total,
    })),
    facturas: db.facturas({ mes }),
  });
});

/* Cargar un rango de NCF autorizado por la DGII.
 *
 * Es la puesta en marcha de la facturación fiscal, y por eso vive en
 * una pantalla y no en el código: cuando llegue la B02, se carga aquí
 * y el sistema empieza a emitir facturas de consumo sin que nadie
 * despliegue nada. */
const cargarSecuencia = conAdmin(async (req, res) => {
  const c = await leerCuerpo(req);
  try {
    const secuencia = db.cargarSecuencia({
      tipo: texto(c.tipo, 3),
      nombre: texto(c.nombre, 60),
      desde: c.desde,
      hasta: c.hasta,
      vence: texto(c.vence, 10) || null,
      usaSitio: !!c.usaSitio,
    });
    return responder(res, 201, {
      secuencia: { ...secuencia, quedan: secuencia.hasta - secuencia.siguiente + 1 },
    });
  } catch (e) {
    return fallo(res, e.codigo || 400, e.message);
  }
});

/* Exportación para el contador. Se entrega como CSV y no como JSON
   porque quien lo abre lo abre en una hoja de cálculo. */
const exportarFacturas = conAdmin((req, res, ctx, consulta) => {
  const mes = /^\d{4}-\d{2}$/.test(consulta?.get('mes') || '') ? consulta.get('mes') : null;
  const filas = db.facturas({ mes, limite: 5000 });

  /* Separador de PUNTO Y COMA, no coma: Excel en configuración regional
     española abre con coma como separador decimal y un CSV de comas le
     deja todo en una columna. */
  const escapar = (v) => {
    const s = String(v == null ? '' : v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lineas = [
    ['Fecha', 'Numero', 'Tipo', 'NCF', 'Cliente', 'RNC', 'Subtotal', 'ITBIS', 'Total', 'Moneda', 'Anulada']
      .join(';'),
    ...filas.map((f) => [
      String(f.fecha).slice(0, 10), f.numero, f.tipo, f.ncf || '',
      f.razon_social || 'Consumidor final', f.rnc || '',
      f.subtotal, f.itbis, f.total, f.moneda, f.anulado_por ? 'si' : 'no',
    ].map(escapar).join(';')),
  ];

  /* BOM al principio: sin él, Excel abre el archivo como ANSI y los
     acentos de las razones sociales salen rotos. */
  const cuerpo = Buffer.from(`﻿${lineas.join('\r\n')}\r\n`, 'utf8');
  res.writeHead(200, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Length': cuerpo.length,
    'Content-Disposition': `attachment; filename="comprobantes-${mes || 'todos'}.csv"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  return res.end(cuerpo);
});

/* Reenviar a mano un comprobante que no salió. */
const reenviarFactura = conAdmin(async (req, res, ctx, idFactura) => {
  const f = db.facturaPorId(idFactura);
  if (!f) return fallo(res, 404, 'Ese comprobante no existe');

  const dueno = f.organizacion_id && db.propietarioDe(f.organizacion_id);
  await facturas.enviar(f, { correoCliente: dueno && dueno.correo });
  return responder(res, 200, { factura: db.facturaPorId(idFactura) });
});

/* Nota de crédito. Es lo único que anula un comprobante: el original
   nunca se borra ni se reescribe. */
const anularFactura = conAdmin(async (req, res, ctx, idFactura) => {
  const c = await leerCuerpo(req);
  const f = db.facturaPorId(idFactura);
  if (!f) return fallo(res, 404, 'Ese comprobante no existe');
  if (f.tipo === 'nota_credito') return fallo(res, 400, 'Una nota de crédito no se anula');
  if (f.anulado_por) return fallo(res, 409, 'Ese comprobante ya está anulado');

  const nota = facturas.emitirNotaCredito(f, { motivo: texto(c.motivo, 200) });
  if (f.pago_id) db.marcarPagoDevuelto(f.pago_id);

  const dueno = f.organizacion_id && db.propietarioDe(f.organizacion_id);
  /* Sin esperarla, pero con catch: es una promesa suelta, y una que
     se rechace sin manejador tumba el proceso. */
  facturas.enviar(nota, { correoCliente: dueno && dueno.correo })
    .catch((e) => console.error(`facturas: no se pudo enviar la nota ${nota.numero} · ${e.message}`));

  return responder(res, 201, { nota, original: db.facturaPorId(idFactura) });
});

/* ── Administración: pagos por transferencia ────────────────
 *
 * La contingencia del lanzamiento (PAGO-09): sin pasarela, el cliente
 * transfiere, el personal ve el ingreso en el banco y lo marca aquí.
 * Una persona otorga cupos y consume un NCF en nombre de otra
 * organización, así que las dos escrituras van por la bitácora
 * (conAdminEnNombreDe) y la aprobación es la MISMA transición de
 * siempre, pagos.confirmarPago; nunca la función de base suelta, que
 * no emite el comprobante (probar-transferencia.js vigila que no
 * aparezca en este archivo).
 *
 * Solo pagos con procesador 'transferencia' (D-06): un cobro de
 * pasarela lo resuelve la pasarela o su reconciliación, nunca una
 * persona pulsando un botón. */

const ESTADOS_PAGO_CONSOLA = ['pendiente', 'aprobado', 'rechazado'];

const listarPagosAdmin = conAdmin((req, res, ctx, consulta) => {
  const pedido = consulta?.get('estado');
  const estado = ESTADOS_PAGO_CONSOLA.includes(pedido) ? pedido : 'pendiente';
  return responder(res, 200, { estado, pagos: db.pagosParaConsola({ estado }) });
});

/* D-07, el pendiente que dejó anotado la fase 3. Sumar los cupos a
   una membresía vencida los regalaría sin plazo, y convertir la
   ampliación en una compra nueva sería decidir por el cliente qué
   compra. La única salida es anular y devolver el dinero en el banco. */
const AMPLIACION_HUERFANA = 'La membresía que ampliaba este pago ya no existe. No se añadió ningún '
  + 'cupo ni se emitió comprobante. Anule el pago y devuelva la transferencia al cliente.';

const SOLO_TRANSFERENCIAS = 'Este pago no es por transferencia: lo resuelve su pasarela, no la consola.';

/* Lo que se comprueba ANTES de escribir, común a marcar y anular. Un
   409 aquí no deja fila de bitácora: no se intentó ninguna escritura. */
function pagoDeTransferencia(res, idPago) {
  const pago = db.pagoPorId(idPago);
  if (!pago) { fallo(res, 404, 'Ese pago no existe'); return null; }
  if (pago.procesador !== 'transferencia') { fallo(res, 409, SOLO_TRANSFERENCIAS); return null; }
  return pago;
}

const falloInterno = (res, e) => {
  if (!e.codigo || e.codigo >= 500) {
    console.error('pagos: fallo en la consola', e);
    return fallo(res, 500, 'Error del servidor');
  }
  return fallo(res, e.codigo, e.message);
};

const marcarTransferenciaRecibida = conAdminEnNombreDe('pago.transferencia_recibida', async (req, res, ctx, idPago) => {
  const c = await leerCuerpo(req);
  // Opcional: la referencia que da el banco, que es lo que contesta un reclamo.
  const motivo = texto(c.motivo, 300);

  const pago = pagoDeTransferencia(res, idPago);
  if (!pago) return undefined;
  if (pago.estado === 'rechazado' || pago.estado === 'devuelto') {
    return fallo(res, 409, `Ese pago está ${pago.estado}: no se puede marcar como recibido.`);
  }

  const intencion = intencionDePago(pago);
  const esAmpliacion = intencion.tipo === 'ampliacion';
  /* Solo con el pago pendiente: pulsar otra vez sobre uno ya aprobado
     no suma nada (aprobarPago devuelve yaEstaba) y es justo lo que
     completa un comprobante cuya emisión falló. */
  if (pago.estado === 'pendiente' && esAmpliacion
    && !(intencion.idSusc && db.suscripcion(intencion.idSusc, pago.organizacion_id))) {
    return fallo(res, 409, AMPLIACION_HUERFANA);
  }

  let r;
  try {
    r = pagos.confirmarPago(idPago, { envolver: (aprobar) => ctx.enNombreDe(pago.organizacion_id,
        { objetoTipo: 'pago', objetoId: idPago, motivo },
        () => {
          const hecho = aprobar();
          return {
            antes: { estado: pago.estado },
            despues: {
              estado: hecho.pago.estado,
              referencia: pago.referencia,
              total: pago.total,
              idSusc: (hecho.membresia && hecho.membresia.id) || null,
              yaEstaba: hecho.yaEstaba,
            },
            resultado: hecho,
          };
        }),
    });
  } catch (e) {
    /* La carrera: la membresía existía al comprobarlo y ya no al
       aprobar. aprobarPago lanza 404 dentro del SAVEPOINT, que se
       deshace entero (ni cupos ni fila), y al personal se le dice lo
       mismo que si se hubiera visto antes. */
    if (e.codigo === 404 && esAmpliacion) return fallo(res, 409, AMPLIACION_HUERFANA);
    return falloInterno(res, e);
  }

  const cuerpo = {
    pago: pagoPublico(r.pago),
    membresia: r.membresia,
    comprobante: comprobantePublico(r.comprobante),
    yaEstaba: r.yaEstaba,
  };
  /* El pago quedó aprobado aunque la emisión fallara: no se deshace un
     ingreso que entró. El comprobante sale en «pendientes» de Facturas
     y pulsar «recibido» otra vez lo emite (recuperación de la fase 3). */
  if (!r.comprobante && r.pago.estado === 'aprobado' && r.pago.total > 0) {
    cuerpo.aviso = 'El pago quedó aprobado y los cupos otorgados, pero el comprobante no se pudo '
      + 'emitir. Aparece en los pendientes de Facturas; vuelva a marcarlo como recibido para emitirlo.';
  }
  return responder(res, 200, cuerpo);
});

/* D-08. Queda 'rechazado', no 'devuelto': 'devuelto' es para un pago
   aprobado con su nota de crédito B04, y aquí no hubo ni cupos ni NCF.
   Si el cliente llegó a transferir, el dinero se devuelve en el banco. */
const anularTransferencia = conAdminEnNombreDe('pago.transferencia_anulada', async (req, res, ctx, idPago) => {
  const c = await leerCuerpo(req);
  const motivo = texto(c.motivo, 300);
  if (!motivo || motivo.length < 5) {
    return fallo(res, 400, 'Escriba el motivo de la anulación: se le envía al cliente.');
  }

  const pago = pagoDeTransferencia(res, idPago);
  if (!pago) return undefined;
  if (pago.estado !== 'pendiente') {
    return fallo(res, 409, pago.estado === 'aprobado'
      ? 'Ese pago ya está aprobado. Para devolverlo, anule su comprobante con una nota de crédito en Facturas.'
      : `Ese pago ya está ${pago.estado}.`);
  }

  let r;
  try {
    r = ctx.enNombreDe(pago.organizacion_id, { objetoTipo: 'pago', objetoId: idPago, motivo }, () => {
      const hecho = pagos.rechazarPago(idPago, { motivo });
      // Otro lo resolvió entre la lectura y aquí: sin cambio no hay fila.
      if (!hecho.cambiado) {
        throw Object.assign(new Error(`Ese pago ya está ${hecho.pago.estado}.`), { codigo: 409 });
      }
      return {
        antes: { estado: pago.estado },
        despues: { estado: hecho.pago.estado, referencia: pago.referencia, total: pago.total },
        resultado: hecho,
      };
    });
  } catch (e) {
    return falloInterno(res, e);
  }

  const intencion = intencionDePago(pago);
  if (intencion.correoCliente) {
    sinEsperar(`anulación de la transferencia ${pago.referencia}`, () => correo.enviarTransferenciaAnulada({
      para: intencion.correoCliente,
      nombre: (intencion.cliente && intencion.cliente.razonSocial) || null,
      referencia: pago.referencia,
      motivo,
    }));
  }

  return responder(res, 200, { pago: pagoPublico(r.pago), motivo });
});

/* Quién aceptó qué condiciones y cuándo.
 *
 * Es la respuesta a «demuestre que esta persona aceptó esto», y por eso
 * entrega también la versión y la fecha, no solo un sí. Lleva la IP,
 * que es dato personal, así que exige sesión de administrador como el
 * expediente de dealer. */
const verAceptaciones = conAdmin((req, res, ctx, consulta) => {
  const doc = consulta?.get('documento');
  return responder(res, 200, {
    documentos: legales.DOCUMENTOS.map((d) => ({
      id: d.id, nombre: d.nombre, version: d.version, vigenteDesde: d.vigenteDesde,
    })),
    documento: legales.documento(doc) ? doc : null,
    aceptaciones: db.historialAceptaciones({ documento: legales.documento(doc) ? doc : null }),
  });
});

/* Expediente completo, con el RNC. Es la única ruta que lo entrega, y
   exige sesión de administrador. */
const verSolicitud = conAdmin((req, res, ctx, idSolicitud) => {
  const s = db.solicitudCompleta(idSolicitud);
  if (!s) return fallo(res, 404, 'Esa solicitud no existe');
  return responder(res, 200, { solicitud: s });
});

/* Aprobar o rechazar el alta cambia `estado_revision` de otra
   organización: va por la bitácora. Un intento que falla (409 porque
   ya estaba resuelta) lanza dentro del SAVEPOINT y no deja fila. El
   correo al dealer va FUERA de la transacción, después. */
const resolverSolicitud = conAdminEnNombreDe('dealer.resolver', async (req, res, ctx, idSolicitud) => {
  const c = await leerCuerpo(req);
  const aprobar = c.decision === 'aprobar';
  if (!aprobar && c.decision !== 'rechazar') {
    return fallo(res, 400, 'La decisión debe ser aprobar o rechazar');
  }
  const motivo = texto(c.motivo, 500);
  if (!aprobar && !motivo) return fallo(res, 400, 'Escriba el motivo del rechazo');

  const previa = db.solicitudCompleta(idSolicitud);
  if (!previa) return fallo(res, 404, 'Esa solicitud no existe');

  let s;
  try {
    s = ctx.enNombreDe(previa.organizacion_id,
      { objetoTipo: 'solicitud_dealer', objetoId: idSolicitud, motivo },
      (org) => {
        const hecha = db.resolverSolicitud(idSolicitud, { aprobar, idRevisor: ctx.usuario.id, motivo });
        return {
          antes: { solicitud: previa.estado, estado_revision: org.estado_revision },
          despues: { solicitud: hecha.estado, estado_revision: aprobar ? 'aprobada' : 'rechazada' },
          resultado: hecha,
        };
      });
  } catch (e) {
    return fallo(res, e.codigo || 500, e.message);
  }

  correo.enviarResolucionDealer({
    para: s.correo_solicitante,
    nombre: s.solicitante,
    empresa: s.razon_social,
    aprobada: aprobar,
    motivo,
    slug: s.slug,
  });

  return responder(res, 200, { solicitud: s, pendientes: db.contarPendientes() });
});

/* ── Rutas: sucursales ──────────────────────────────────── */

/* Publicar y editar sucursales queda en manos de quien administra la
   organización: un vendedor puede publicar equipos, pero no cambiar
   dónde dice la empresa que está. */
const puedeAdministrar = (ctx) =>
  ['propietario', 'administrador'].includes(ctx.organizacion.rol);

function datosSucursal(c) {
  if (!texto(c.nombre, 80)) return { error: 'Escriba un nombre para la sucursal' };
  if (!texto(c.provincia, 60)) return { error: 'Indique la provincia' };
  if (!texto(c.direccion, 200) || String(c.direccion).trim().length < 8) {
    return { error: 'Indique la dirección de la sucursal' };
  }
  if (!telefonoValido(c.telefono)) return { error: 'Indique un teléfono de 10 dígitos' };
  if (c.whatsapp && !telefonoValido(c.whatsapp)) return { error: 'El WhatsApp debe tener 10 dígitos' };

  return {
    datos: {
      nombre: texto(c.nombre, 80),
      provincia: texto(c.provincia, 60),
      municipio: texto(c.municipio, 60),
      direccion: texto(c.direccion, 200),
      telefono: texto(c.telefono, 40),
      whatsapp: texto(c.whatsapp, 40),
      horario: texto(c.horario, 80),
    },
  };
}

const listarSucursales = conSesion((req, res, ctx) =>
  responder(res, 200, { sucursales: db.sucursalesDe(ctx.organizacion.id) }));

const crearSucursal = conSesion(async (req, res, ctx) => {
  if (!puedeAdministrar(ctx)) return fallo(res, 403, 'No tiene permiso para administrar sucursales');
  if (ctx.organizacion.tipo !== 'dealer') {
    return fallo(res, 403, 'Las sucursales son para cuentas de empresa. Registre el RNC primero.');
  }
  const v = datosSucursal(await leerCuerpo(req));
  if (v.error) return fallo(res, 400, v.error);

  // Tope defensivo: mil sucursales es un error de guion, no un dealer.
  if (db.sucursalesDe(ctx.organizacion.id).length >= 50) {
    return fallo(res, 409, 'Ha alcanzado el máximo de sucursales. Escríbanos si necesita más.');
  }

  const idSucursal = db.crearSucursal(ctx.organizacion.id, v.datos);
  return responder(res, 201, { sucursal: db.sucursal(idSucursal, ctx.organizacion.id) });
});

const editarSucursal = conSesion(async (req, res, ctx, idSucursal) => {
  if (!puedeAdministrar(ctx)) return fallo(res, 403, 'No tiene permiso para administrar sucursales');
  const c = await leerCuerpo(req);

  if (c.principal === true) {
    if (!db.marcarPrincipal(idSucursal, ctx.organizacion.id)) return fallo(res, 404, 'Esa sucursal no existe');
    return responder(res, 200, { sucursales: db.sucursalesDe(ctx.organizacion.id) });
  }

  const v = datosSucursal(c);
  if (v.error) return fallo(res, 400, v.error);
  const r = db.actualizarSucursal(idSucursal, ctx.organizacion.id, v.datos);
  if (!r.changes) return fallo(res, 404, 'Esa sucursal no existe');
  return responder(res, 200, { sucursal: db.sucursal(idSucursal, ctx.organizacion.id) });
});

const borrarSucursal = conSesion((req, res, ctx, idSucursal) => {
  if (!puedeAdministrar(ctx)) return fallo(res, 403, 'No tiene permiso para administrar sucursales');
  const r = db.desactivarSucursal(idSucursal, ctx.organizacion.id);
  if (!r.ok) {
    return fallo(res, r.motivo === 'principal' ? 409 : 404,
      r.motivo === 'principal'
        ? 'No se puede retirar la oficina principal. Marque otra como principal primero.'
        : 'Esa sucursal no existe');
  }
  return responder(res, 200, { sucursales: db.sucursalesDe(ctx.organizacion.id) });
});

const listarDealers = (req, res) => responder(res, 200, { dealers: db.dealersPublicos() });

function verDealer(req, res, ctx, slug) {
  const d = db.dealerPorSlug(slug);
  if (!d) return fallo(res, 404, 'Ese dealer no existe');

  const pagina = db.paginaDe(d.id, { soloVisibles: true });

  /* Sin límite: `anunciosPublicos` pagina de 24 en 24 por defecto y
     aquí no se le pasaba nada, así que un dealer con cuarenta equipos
     enseñaba veinticuatro y su propia página le decía que tenía
     veinticuatro. La página de un dealer es su escaparate entero. */
  return responder(res, 200, {
    dealer: { ...d, verificada: !!d.verificada },
    sucursales: db.sucursalesDe(d.id),
    anuncios: db.anunciosPublicos({ organizacion: d.id, porPagina: 500 }),
    enlaces: pagina.enlaces,
    galeria: pagina.galeria,
    secciones: pagina.secciones,
  });
}

/* El sello de verificado, desde la pantalla de administración.
 *
 * Solo se concedía con `node tools/admin.js`, en el alta por línea de
 * comandos: un dealer que se registraba por el sitio no podía
 * obtenerlo nunca. La pastilla verde se pinta en cinco pantallas para
 * una condición que era inalcanzable por la vía normal. */
/* Va por la bitácora (ADMIN-05): cambia el sello de otra organización.
   Se anota aunque el valor no cambie: alguien pulsó, y eso es lo que la
   bitácora cuenta. */
const verificarOrganizacion = conAdminEnNombreDe('organizacion.verificar', async (req, res, ctx, idOrg) => {
  const c = await leerCuerpo(req);
  const verificada = !!c.verificada;
  const motivo = texto(c.motivo, 300);
  try {
    ctx.enNombreDe(idOrg, { objetoTipo: 'organizacion', objetoId: idOrg, motivo }, (org) => {
      /* Las dos reglas van DENTRO: un error lanzado aquí deshace el
         SAVEPOINT y no deja fila, que es lo correcto para algo que no
         llegó a hacerse.

         El sello dice que se cotejó «la existencia registral del
         negocio»: no tiene sentido en una cuenta particular ni en una
         empresa cuya alta no se ha aprobado todavía (o se rechazó). */
      if (verificada && (org.tipo !== 'dealer' || org.estado_revision !== 'aprobada')) {
        throw Object.assign(new Error('Solo se verifica una empresa dealer con el alta aprobada'), { codigo: 409 });
      }
      /* Retirarlo es lo que genera el reclamo «¿por qué me lo
         quitaron?». Sin un motivo escrito, la bitácora dice quién y
         cuándo pero no contesta lo único que se va a preguntar. */
      if (!verificada && org.verificada && !motivo) {
        throw Object.assign(new Error('Escriba el motivo para retirar el sello'), { codigo: 400 });
      }
      db.marcarVerificada(idOrg, verificada);
      return { antes: { verificada: !!org.verificada }, despues: { verificada } };
    });
  } catch (e) {
    if (e.codigo === 404) return fallo(res, 404, 'Esa empresa no existe');
    return fallo(res, e.codigo || 500, e.message);
  }
  return responder(res, 200, { verificada });
});

/* El directorio de empresas para el personal. De solo lectura: el
   sello se cambia por verificarOrganizacion, que pasa por la bitácora. */
const listarOrganizacionesAdmin = conAdmin((req, res, ctx, consulta) => {
  const q = consulta || new URLSearchParams();
  return responder(res, 200, {
    empresas: db.organizacionesAdmin({
      estado: texto(q.get('estado'), 20),
      q: texto(q.get('q'), 80),
    }),
  });
});

/* ── Revisión del número de serie (ADMIN-03) ─────────────── */

const listarSeries = conAdmin((req, res, ctx, consulta) => {
  const q = consulta || new URLSearchParams();
  return responder(res, 200, { series: db.seriesParaRevisar({ estado: texto(q.get('estado'), 20) }) });
});

/* El resultado va por la bitácora sobre la organización dueña del
   anuncio: «yo no tengo ninguna observación en mi serie» se contesta
   con la fila. La fila guarda el resultado y la nota, NO la serie: la
   bitácora la lee todo el personal y la serie no le hace falta. */
const revisarSerie = conAdminEnNombreDe('anuncio.serie', async (req, res, ctx, idAnuncio) => {
  const c = await leerCuerpo(req);
  const resultado = String(c.resultado || '');
  if (!['conforme', 'observada', 'pendiente'].includes(resultado)) {
    return fallo(res, 400, 'El resultado es «conforme», «observada» o «pendiente»');
  }
  const nota = resultado === 'pendiente' ? null : texto(c.nota, 500);
  if (resultado === 'observada' && !nota) {
    return fallo(res, 400, 'Escriba qué no cuadra: es lo que lee el vendedor');
  }

  const a = db.anuncioSerie(idAnuncio);
  if (!a || !String(a.serie || '').trim()) return fallo(res, 404, 'Ese anuncio no existe o no declaró serie');

  try {
    ctx.enNombreDe(a.organizacion_id, { objetoTipo: 'anuncio', objetoId: idAnuncio, motivo: nota }, () => {
      db.anotarRevisionSerie(idAnuncio, {
        resultado, nota, nombreAdmin: ctx.usuario.nombre || ctx.usuario.correo,
      });
      return {
        antes: { revision: a.serie_revision || 'pendiente', nota: a.serie_nota || null },
        despues: { revision: resultado, nota },
      };
    });
  } catch (e) {
    return fallo(res, e.codigo || 500, e.message);
  }
  return responder(res, 200, { ok: true, resultado });
});

/* La bitácora se lee por aquí y por ningún otro sitio. No existe, ni
   debe existir, una ruta que la edite, la borre o le añada filas: las
   filas solo nacen dentro de db.enNombreDe. */
const listarBitacora = conAdmin((req, res, ctx, consulta) => {
  const q = consulta || new URLSearchParams();
  const organizacion = texto(q.get('organizacion'), 64);
  const pedido = parseInt(q.get('limite'), 10);
  const limite = Number.isFinite(pedido) ? Math.min(Math.max(pedido, 1), 500) : 200;
  return responder(res, 200, {
    entradas: db.bitacora({ organizacion, limite }),
    organizaciones: db.organizacionesEnBitacora(),
    acciones: db.ACCIONES_BITACORA,
    organizacion: organizacion || null,
  });
});

/* ── Rutas: la página propia del dealer ─────────────────── */

/* Las reglas para tener página, comprobadas en el servidor y
 * enseñadas en pantalla.
 *
 * Se devuelven SIEMPRE las seis, cumplidas o no, porque la lista es lo
 * que hace que armar la página sea intuitivo: el dealer ve en todo
 * momento qué le falta, en vez de descubrirlo al pulsar publicar.
 *
 * Las tres primeras son para PODER tener página; las tres últimas, para
 * publicarla. Todo lo demás —logotipo, banner, galería, redes,
 * secciones— es opcional y se puede ir añadiendo después, que es lo que
 * se pidió: que no haga falta tenerlo todo para empezar. */
const MINIMO_ANUNCIOS = 5;
const MINIMO_DESCRIPCION = 80;

function reglasDePagina(org, pagina) {
  const publicados = db.contarAnunciosPublicados(org.id);
  const descripcion = String((pagina && pagina.descripcion) || '').trim();
  const tieneContacto = !!(pagina && (pagina.correo_publico || pagina.telefono_publico));

  const reglas = [
    {
      id: 'aprobada',
      titulo: 'Su cuenta de dealer está aprobada',
      /* `ctx.organizacion` es la fila de la base tal cual, en
         snake_case: quien la mira en camelCase —como la respuesta de
         sesión— obtiene undefined y la regla queda siempre en falso. */
      cumple: org.estado_revision === 'aprobada',
      falta: 'Su solicitud todavía está en revisión. Le avisamos por correo en cuanto se resuelva.',
      paraCrear: true,
    },
    {
      id: 'plan',
      titulo: 'Tiene un plan que incluye página propia',
      cumple: !!org.perfil_publico,
      falta: 'La página propia va incluida en el nivel Premium. Se activa al contratar cupos de ese nivel.',
      paraCrear: true,
    },
    {
      id: 'anuncios',
      titulo: `Tiene ${MINIMO_ANUNCIOS} o más equipos publicados`,
      cumple: publicados >= MINIMO_ANUNCIOS,
      detalle: `${publicados} de ${MINIMO_ANUNCIOS}`,
      falta: `Le faltan ${Math.max(0, MINIMO_ANUNCIOS - publicados)} equipo(s). `
        + 'Una página con dos máquinas no convence a nadie, y por eso el mínimo. '
        + 'Cuentan los que están publicados; los pausados y los vendidos no.',
      paraCrear: true,
    },
    {
      id: 'nombre',
      titulo: 'La empresa tiene nombre',
      cumple: !!String((pagina && pagina.nombre) || '').trim(),
      falta: 'Escriba el nombre con el que quiere que se le conozca.',
      paraCrear: false,
    },
    {
      id: 'descripcion',
      titulo: 'Ha escrito una descripción',
      cumple: descripcion.length >= MINIMO_DESCRIPCION,
      /* Cumplida, el contador deja de comparar: «209 de 80 caracteres»
         se lee como un error, no como algo resuelto. */
      detalle: descripcion.length >= MINIMO_DESCRIPCION
        ? `${descripcion.length} caracteres`
        : `${descripcion.length} de ${MINIMO_DESCRIPCION} caracteres`,
      falta: `Cuente en pocas líneas a qué se dedica y qué le distingue. `
        + `Mínimo ${MINIMO_DESCRIPCION} caracteres.`,
      paraCrear: false,
    },
    {
      id: 'contacto',
      titulo: 'Hay una forma de contactarle',
      cumple: tieneContacto,
      falta: 'Añada al menos un correo o un teléfono públicos. '
        + 'No se usa el de su cuenta: ese es con el que usted entra.',
      paraCrear: false,
    },
  ];

  const paraCrear = reglas.filter((r) => r.paraCrear);
  return {
    reglas,
    publicados,
    minimoAnuncios: MINIMO_ANUNCIOS,
    puedeCrear: paraCrear.every((r) => r.cumple),
    puedePublicar: reglas.every((r) => r.cumple),
  };
}

/* Quien administra la organización y es dealer. Un vendedor publica
   equipos, pero la página de la empresa no es suya. */
const conPagina = (manejador) => conSesion((req, res, ctx, ...resto) => {
  const org = ctx.organizacion;
  if (!org || org.tipo !== 'dealer') {
    return fallo(res, 404, 'Su cuenta no tiene página de empresa');
  }
  if (!puedeAdministrar(ctx)) {
    return fallo(res, 403, 'Solo quien administra la empresa puede editar su página');
  }
  return manejador(req, res, ctx, ...resto);
});

/* ── Núcleo de la página, compartido por el dealer y el personal ──
 *
 * Fase 7 (ADMIN-04): el personal edita la página de un dealer en su
 * nombre. En vez de copiar los manejadores, cada escritura vive aquí UNA
 * vez —validación incluida— y la llaman dos envoltorios: el del dueño
 * (conPagina) y el del personal (conAdminEnNombreDe). Así la página que
 * arregla soporte pasa exactamente por las mismas comprobaciones que la
 * que arma el dealer, y un arreglo en una no se olvida en la otra.
 *
 * Cada núcleo recibe la fila de la organización, lo que mandó el
 * navegador y, si la ruta lo lleva, el id del bloque o de la foto.
 * Escribe y devuelve `{ codigo, respuesta, antes, despues }`: `respuesta`
 * es lo que ve el navegador (idéntica en los dos caminos) y `antes` /
 * `despues`, lo que anota la bitácora.
 *
 * Los errores se LANZAN con `codigo`. Dentro de enNombreDe eso deshace el
 * SAVEPOINT y no deja fila; fuera, `manejar` los convierte en la misma
 * respuesta que daba fallo() antes de partir los manejadores. */

const errorPagina = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

function vistaDePagina(org) {
  const pagina = db.paginaDe(org.id);
  return {
    pagina,
    ...reglasDePagina(org, pagina),
    /* La dirección donde se verá, para que pueda copiarla y
       comprobarla antes de publicar. */
    direccion: pagina.slug ? `/dealer.html?d=${pagina.slug}` : null,
  };
}

/* Campos básicos: la clave que manda el navegador → la columna. Sirve
   para leer el «antes» de la fila sin otra consulta. */
const COLUMNAS_PAGINA = {
  nombre: 'nombre',
  descripcion: 'descripcion',
  lema: 'lema',
  web: 'web',
  correoPublico: 'correo_publico',
  telefonoPublico: 'telefono_publico',
  logo: 'logo',
  banner: 'banner',
};

function nucleoEditarPagina(org, c) {
  const datos = {};

  if (c.nombre !== undefined) {
    const n = texto(c.nombre, 160);
    if (!n) throw errorPagina(400, 'El nombre de la empresa no puede quedar vacío');
    datos.nombre = n;
  }
  if (c.descripcion !== undefined) datos.descripcion = texto(c.descripcion, 2000) || '';
  if (c.lema !== undefined) datos.lema = texto(c.lema, 120) || '';
  if (c.web !== undefined) {
    const w = texto(c.web, 200) || '';
    if (w && !/^https?:\/\//i.test(w)) throw errorPagina(400, 'La web debe empezar por http:// o https://');
    datos.web = w;
  }
  if (c.correoPublico !== undefined) {
    const correoPub = texto(c.correoPublico, 160) || '';
    if (correoPub && !correoValido(correoPub)) throw errorPagina(400, 'Escriba un correo válido');
    datos.correoPublico = correoPub;
  }
  if (c.telefonoPublico !== undefined) {
    const tel = texto(c.telefonoPublico, 20) || '';
    if (tel && !telefonoValido(tel)) throw errorPagina(400, 'El teléfono debe tener 10 dígitos');
    datos.telefonoPublico = tel;
  }

  /* Logotipo y banner: SOLO rutas que devolvió la subida de este sitio.
     Es la misma comprobación que la portada, y por el mismo motivo: una
     URL de un tercero se salta la política de contenidos del navegador
     y además la puede cambiar o retirar su dueño cuando quiera. */
  for (const [clave, rotulo] of [['logo', 'El logotipo'], ['banner', 'La imagen de portada']]) {
    if (c[clave] === undefined) continue;
    const ruta = String(c[clave] || '');
    if (ruta && !esRutaDeFoto(ruta)) {
      throw errorPagina(400, `${rotulo} tiene que ser una imagen subida al sitio`);
    }
    datos[clave] = ruta;
  }

  const antes = {};
  const despues = {};
  Object.keys(datos).forEach((clave) => {
    const previo = org[COLUMNAS_PAGINA[clave]];
    antes[clave] = previo == null ? null : previo;
    // Cadena vacía es «quitar»; en la bitácora se lee mejor como nada.
    despues[clave] = datos[clave] === '' ? null : datos[clave];
  });

  const pagina = db.guardarPagina(org.id, datos);
  return { respuesta: { pagina, ...reglasDePagina(org, pagina) }, antes, despues };
}

/* ── Secciones de la página ─────────────────────────────── */

const TIPOS_SECCION = ['texto', 'galeria', 'marcas', 'servicios', 'destacados', 'sucursales', 'inventario'];

/* Lo que cada tipo de bloque guarda. Se valida aquí y no se confía en
   lo que mande el navegador: `cuerpo` acaba en la página pública. */
function cuerpoDeSeccion(tipo, crudo) {
  const c = crudo || {};
  if (tipo === 'texto') return { texto: texto(c.texto, 4000) || '' };
  if (tipo === 'marcas' || tipo === 'servicios') {
    return {
      lista: (Array.isArray(c.lista) ? c.lista : [])
        .map((x) => texto(x, 80)).filter(Boolean).slice(0, 40),
    };
  }
  if (tipo === 'destacados') {
    return {
      anuncios: (Array.isArray(c.anuncios) ? c.anuncios : [])
        .map((x) => texto(x, 80)).filter(Boolean).slice(0, 12),
    };
  }
  /* galeria, sucursales e inventario no guardan nada: se pintan con lo
     que ya hay en la base. */
  return {};
}

function nucleoCrearSeccion(org, c) {
  const tipo = String(c.tipo || '');
  if (!TIPOS_SECCION.includes(tipo)) throw errorPagina(400, 'Ese tipo de bloque no existe');

  /* Un tope, porque una página con cincuenta bloques no es una página.
     Con siete tipos disponibles, veinte da margen de sobra para
     repetir los de texto y destacados varias veces. */
  if (db.seccionesDe(org.id).length >= 20) {
    throw errorPagina(400, 'Su página ya tiene veinte bloques');
  }

  const titulo = texto(c.titulo, 120);
  const idSeccion = db.crearSeccion(org.id, { tipo, titulo, cuerpo: cuerpoDeSeccion(tipo, c.cuerpo) });
  return {
    codigo: 201,
    respuesta: { id: idSeccion, secciones: db.seccionesDe(org.id) },
    antes: null,
    despues: { bloque: tipo, titulo },
  };
}

function seccionDe(org, idSeccion) {
  const actual = db.seccionesDe(org.id).find((s) => s.id === idSeccion);
  if (!actual) throw errorPagina(404, 'Ese bloque no existe');
  return actual;
}

function nucleoEditarSeccion(org, c, idSeccion) {
  const actual = seccionDe(org, idSeccion);

  const cambios = {};
  if (c.titulo !== undefined) cambios.titulo = texto(c.titulo, 120);
  if (c.visible !== undefined) cambios.visible = !!c.visible;
  if (c.cuerpo !== undefined) cambios.cuerpo = cuerpoDeSeccion(actual.tipo, c.cuerpo);

  db.editarSeccion(idSeccion, org.id, cambios);

  const antes = { bloque: actual.tipo };
  Object.keys(cambios).forEach((k) => { antes[k] = actual[k] === undefined ? null : actual[k]; });
  return {
    respuesta: { secciones: db.seccionesDe(org.id) },
    antes,
    despues: { bloque: actual.tipo, ...cambios },
  };
}

function nucleoBorrarSeccion(org, c, idSeccion) {
  const actual = seccionDe(org, idSeccion);
  if (!db.borrarSeccion(idSeccion, org.id)) throw errorPagina(404, 'Ese bloque no existe');
  return {
    respuesta: { secciones: db.seccionesDe(org.id) },
    antes: { bloque: actual.tipo, titulo: actual.titulo },
    despues: { bloque: null },
  };
}

function nucleoOrdenarSecciones(org, c) {
  const ids = (Array.isArray(c.ids) ? c.ids : []).map((x) => String(x));
  if (!ids.length) throw errorPagina(400, 'Indique el orden de los bloques');
  // El orden se anota por tipo de bloque: los ids no le dicen nada a nadie.
  const antes = db.seccionesDe(org.id).map((s) => s.tipo);
  const secciones = db.ordenarSecciones(org.id, ids);
  return {
    respuesta: { secciones },
    antes: { orden: antes },
    despues: { orden: secciones.map((s) => s.tipo) },
  };
}

/* ── Galería y enlaces ──────────────────────────────────── */

function nucleoAnadirFoto(org, c) {
  const url = String(c.url || '');
  if (!esRutaDeFoto(url)) throw errorPagina(400, 'La fotografía tiene que subirse al sitio');
  if (db.galeriaDe(org.id).length >= 24) {
    throw errorPagina(400, 'Su galería ya tiene veinticuatro fotografías');
  }
  db.anadirAGaleria(org.id, { url, alt: texto(c.alt, 160) });
  return { codigo: 201, respuesta: { galeria: db.galeriaDe(org.id) }, antes: null, despues: { foto: url } };
}

function nucleoQuitarFoto(org, c, idFoto) {
  const foto = db.galeriaDe(org.id).find((f) => f.id === idFoto);
  if (!foto || !db.quitarDeGaleria(idFoto, org.id)) throw errorPagina(404, 'Esa fotografía no existe');
  return {
    respuesta: { galeria: db.galeriaDe(org.id) },
    antes: { foto: foto.url },
    despues: { foto: null },
  };
}

const TIPOS_ENLACE = ['instagram', 'facebook', 'youtube', 'tiktok', 'linkedin', 'web', 'whatsapp'];

function nucleoEnlaces(org, c) {
  const lista = [];

  for (const e of (Array.isArray(c.enlaces) ? c.enlaces : []).slice(0, 8)) {
    const tipo = String((e && e.tipo) || '');
    const valor = texto(e && e.valor, 200);
    if (!TIPOS_ENLACE.includes(tipo) || !valor) continue;

    /* El de WhatsApp es un número; los demás, direcciones. Un enlace
       roto en la página de un dealer es peor que no tenerlo. */
    if (tipo === 'whatsapp') {
      if (!telefonoValido(valor)) throw errorPagina(400, 'El WhatsApp debe tener 10 dígitos');
    } else if (!/^https?:\/\//i.test(valor)) {
      throw errorPagina(400, `El enlace de ${tipo} debe empezar por http:// o https://`);
    }
    lista.push({ tipo, valor });
  }

  const antes = db.enlacesDe(org.id).map((e) => ({ tipo: e.tipo, valor: e.valor }));
  const enlaces = db.guardarEnlaces(org.id, lista);
  return { respuesta: { enlaces }, antes: { enlaces: antes }, despues: { enlaces: lista } };
}

/* ── El dueño: su propia página ─────────────────────────── */

/* Los DELETE no leen cuerpo: no lo llevan, y así siguen como antes. */
const delDueno = (nucleo, { conCuerpo = true } = {}) => conPagina(async (req, res, ctx, ...resto) => {
  const c = conCuerpo ? await leerCuerpo(req) : {};
  // Tras las capturas del patrón llega la consulta (URLSearchParams).
  const sub = typeof resto[0] === 'string' ? resto[0] : undefined;
  const r = nucleo(ctx.organizacion, c, sub);
  return responder(res, r.codigo || 200, r.respuesta);
});

const verMiPagina = conPagina((req, res, ctx) => responder(res, 200, {
  ...vistaDePagina(ctx.organizacion),
  /* Solo la fecha: el dealer tiene derecho a saber que el personal tocó
     su página, pero no a quién de dentro fue (eso está en la bitácora). */
  editadaPorSoporte: db.ultimaAnotacion(ctx.organizacion.id, 'pagina.editar'),
}));

const editarMiPagina = delDueno(nucleoEditarPagina);

const publicarMiPagina = conPagina((req, res, ctx) => {
  const pagina = db.paginaDe(ctx.organizacion.id);
  const estado = reglasDePagina(ctx.organizacion, pagina);

  /* Se comprueba aquí y no solo en pantalla: la lista de la pantalla
     es para que el dealer sepa qué le falta, no la que decide. */
  if (!estado.puedePublicar) {
    const pendientes = estado.reglas.filter((r) => !r.cumple);
    return fallo(res, 400, `Falta ${pendientes.length === 1 ? 'una cosa' : `${pendientes.length} cosas`} por resolver`,
      { pendientes: pendientes.map((r) => ({ id: r.id, titulo: r.titulo, falta: r.falta })) });
  }

  db.publicarPagina(ctx.organizacion.id);
  return responder(res, 200, {
    pagina: db.paginaDe(ctx.organizacion.id),
    direccion: `/dealer.html?d=${pagina.slug}`,
  });
});

const despublicarMiPagina = conPagina((req, res, ctx) => {
  db.despublicarPagina(ctx.organizacion.id);
  return responder(res, 200, { pagina: db.paginaDe(ctx.organizacion.id) });
});

const crearMiSeccion = delDueno(nucleoCrearSeccion);
const editarMiSeccion = delDueno(nucleoEditarSeccion);
const borrarMiSeccion = delDueno(nucleoBorrarSeccion, { conCuerpo: false });
const ordenarMisSecciones = delDueno(nucleoOrdenarSecciones);
const anadirAMiGaleria = delDueno(nucleoAnadirFoto);
const quitarDeMiGaleria = delDueno(nucleoQuitarFoto, { conCuerpo: false });
const guardarMisEnlaces = delDueno(nucleoEnlaces);

/* ── El personal: la página de un dealer, en su nombre ─────
 *
 * ADMIN-04. Mismas escrituras que el dueño, por el mismo núcleo, bajo
 * /api/admin/organizaciones/:id/pagina… y cada una en la bitácora con el
 * trozo que cambió. `motivo` (opcional) viaja en el cuerpo.
 *
 * NO hay publicar ni despublicar aquí, a propósito: si la página está
 * publicada, el arreglo se ve al momento, igual que cuando la edita el
 * dealer; si está en borrador, sigue en borrador. Hacerla pública o
 * retirarla es decisión de la empresa. */

const verPaginaEnNombre = conAdmin((req, res, ctx, idOrg) => {
  const org = db.organizacionPorId(idOrg);
  if (!org || org.tipo !== 'dealer') return fallo(res, 404, 'Esa empresa no tiene página');
  // Solo id y nombre: la fila entera lleva el RNC.
  return responder(res, 200, { organizacion: { id: org.id, nombre: org.nombre }, ...vistaDePagina(org) });
});

const enNombreDelDealer = (objetoTipo, nucleo) =>
  conAdminEnNombreDe('pagina.editar', async (req, res, ctx, idOrg, ...resto) => {
    const c = await leerCuerpo(req);
    const sub = typeof resto[0] === 'string' ? resto[0] : undefined;
    let hecho;
    try {
      hecho = ctx.enNombreDe(idOrg, { objetoTipo, objetoId: sub || idOrg, motivo: texto(c.motivo, 300) }, (org) => {
        if (org.tipo !== 'dealer') throw errorPagina(404, 'Esa empresa no tiene página');
        const r = nucleo(org, c, sub);
        return { antes: r.antes, despues: r.despues, resultado: r };
      });
    } catch (e) {
      const codigo = e.codigo || 500;
      if (codigo >= 500) console.error('API página en nombre de', idOrg, e);
      return fallo(res, codigo, codigo >= 500 ? 'Error del servidor' : e.message);
    }
    return responder(res, hecho.codigo || 200, hecho.respuesta);
  });

const editarPaginaEnNombre = enNombreDelDealer('pagina', nucleoEditarPagina);
const crearSeccionEnNombre = enNombreDelDealer('seccion', nucleoCrearSeccion);
const editarSeccionEnNombre = enNombreDelDealer('seccion', nucleoEditarSeccion);
const borrarSeccionEnNombre = enNombreDelDealer('seccion', nucleoBorrarSeccion);
const ordenarSeccionesEnNombre = enNombreDelDealer('pagina', nucleoOrdenarSecciones);
const anadirFotoEnNombre = enNombreDelDealer('galeria', nucleoAnadirFoto);
const quitarFotoEnNombre = enNombreDelDealer('galeria', nucleoQuitarFoto);
const guardarEnlacesEnNombre = enNombreDelDealer('enlaces', nucleoEnlaces);

/* ── Rutas: planes y cobro ──────────────────────────────── */

/* `metodosPago` son solo los nombres de los métodos, para que la
   pantalla sepa qué ofrecer. Los datos de la cuenta NO van aquí: es una
   ruta pública, y la cuenta solo se enseña con sesión, a quien ya pidió
   pagar. */
const listarPlanes = (req, res) => responder(res, 200, {
  planes: db.planes(),
  itbis: precios.ITBIS,
  duraciones: precios.DURACIONES,
  cuposPorUnoGratis: precios.CUPOS_POR_UNO_GRATIS,
  cupoMaximo: precios.CUPO_MAXIMO,
  metodosPago: pagos.metodosDeCobro(),
});

/* Lo que cuesta un cupo de este nivel durante treinta días.
   `precio_vigente` ya trae aplicada la promoción que esté corriendo
   (ver conPrecioVigente en db.js). Nunca se toma `plan.precio` a
   secas: era la vía por la que la página anunciaba un nivel sin costo
   y el cobro salía por la tarifa completa. */
const precioUnitario = (plan) =>
  plan.precio_vigente != null ? plan.precio_vigente : plan.precio;

const esExenta = (idUsuario) => !!(db.organizacionDe(idUsuario) || {}).exenta_pago;

const SIN_COSTO = { subtotal: 0, itbis: 0, total: 0 };

const referenciaCobro = () =>
  `TE-${new Date().getFullYear()}-${db.id().slice(0, 6).toUpperCase()}`;

/* ── Rutas: membresías ──────────────────────────────────────
   Se compra capacidad y después se publica. Antes se publicaba y el
   cobro salía al final, con el plan pegado a ese anuncio para
   siempre: quien compraba cinco Destacados no podía mover a ellos un
   equipo que ya tenía publicado en Estándar. */

/* Los datos de la cuenta a la que se transfiere, con el buzón al que
   se manda el comprobante de la transferencia. Null si la transferencia
   está apagada: nunca se inventa una cuenta. Solo sale en respuestas
   con sesión (D-10). */
function datosDeCuenta() {
  const d = transferencia.datosTransferencia();
  return d ? { ...d, correo: correo.BUZONES.facturacion } : null;
}

/* Para un pendiente por transferencia que quedó sin cuenta que enseñar
   (se apagó después de pedirlo): se le dice a quién escribir en vez de
   dejarle un pago que no sabe cómo completar. */
const SIN_DATOS_TRANSFERENCIA = 'Para completar este pago, escríbanos a '
  + `${correo.BUZONES.facturacion} con la referencia y le indicamos cómo hacerlo.`;

const misPlanes = conSesion((req, res, ctx) => {
  const lista = db.suscripcionesDe(ctx.organizacion.id);
  /* Solo los de SU organización: la consulta filtra por el id de la
     sesión, nunca por uno que llegue en la petición. */
  const pagosPendientes = db.pagosPendientesDe(ctx.organizacion.id);
  const porTransferencia = pagosPendientes.some((p) => p.procesador === 'transferencia');
  const cuenta = porTransferencia ? datosDeCuenta() : null;
  return responder(res, 200, {
    pagosPendientes,
    ...(cuenta ? { transferencia: cuenta } : {}),
    ...(porTransferencia && !cuenta ? { avisoTransferencia: SIN_DATOS_TRANSFERENCIA } : {}),
    membresias: lista.map((s) => ({
      ...s,
      // Qué costaría el siguiente cupo, para poder decirlo en el panel
      // sin que haya que abrir el formulario. Cuando toca el gratis de
      // la regla, saberlo cambia la decisión.
      siguiente: s.anuncios_incluidos == null ? null : precios.siguienteCupo({
        precioUnitario: s.precio_unitario,
        cupoActual: s.anuncios_incluidos,
        dias: s.dias_ciclo || 30,
        diasRestantes: precios.diasRestantes(s.fin) ?? (s.dias_ciclo || 30),
      }),
    })),
    exenta: esExenta(ctx.usuario.id),
  });
});

/* El comprobante de un cobro se emite en UN solo sitio:
 * `pagos.confirmarPago`, la transición de pendiente a aprobado. Estuvo
 * escrito dos veces y comprar emitía mientras ampliar no, que era
 * ingreso cobrado y no declarado. Aquí no se emite nada: las rutas
 * anotan el cobro y se lo pasan a `pagos.cobrar`. */

/* A nombre de quién sale el comprobante de un cobro que no pregunta.
 *
 * Ampliar cupos no abre el formulario fiscal —es un botón, no un paso
 * de compra—, así que se heredan los datos del último comprobante con
 * RNC de esa organización. Quien facturó su membresía a nombre de su
 * empresa espera que la ampliación salga igual; emitirla como
 * consumidor final le obliga a pedir una nota de crédito por algo que
 * el sistema ya sabía. Si nunca facturó con RNC, va como consumidor
 * final, que es lo que estaba pidiendo. */
function datosFiscalesDe(ctx) {
  const previos = ctx.organizacion && db.ultimosDatosFiscales(ctx.organizacion.id);
  if (previos && previos.rnc) return { ...previos, correo: ctx.usuario.correo };
  return { razonSocial: ctx.usuario.nombre, correo: ctx.usuario.correo };
}

/* Lo que responde una ruta de cobro cuando el procesador no aprobó.
 *
 * Rechazado: 402 con un texto que diga lo que NO pasó, que es lo que
 * el anunciante necesita saber. Pendiente: 202, sin cupos ni
 * comprobante todavía; aparecerán cuando el pago se confirme. El
 * navegador de hoy nunca ve un 202 porque `demo` aprueba siempre. */
const NO_APROBADO = 'El pago no fue aprobado. No se le cobró nada, no se añadió ningún cupo '
  + 'y no se emitió comprobante.';
const EN_PROCESO = 'Su pago está en proceso. Los cupos y el comprobante aparecerán cuando se confirme.';

/* Sin plazo prometido: lo confirma una persona mirando el banco, y un
   «en 24 horas» que no se cumple un viernes por la tarde es un reclamo. */
const EN_ESPERA_TRANSFERENCIA = 'Transfiera el importe con la referencia indicada. Los cupos y el '
  + 'comprobante fiscal llegan cuando confirmemos el ingreso.';

const pagoPublico = (pago) => (pago ? { id: pago.id, estado: pago.estado } : null);
const comprobantePublico = (c) => c && { numero: c.numero, tipo: c.tipo, ncf: c.ncf };

/* Lo que se compró, leído de la intención guardada en el pago. Una
   intención ilegible (pagos de antes de la fase 3) no rompe nada: sale
   como «Membresía», igual que en pagos.js y db.js. */
function intencionDePago(pago) {
  let i = null;
  try { i = JSON.parse(pago.intencion); } catch (_) { /* se trata abajo */ }
  return i && typeof i === 'object' ? { ...i, concepto: i.concepto || 'Membresía' } : { concepto: 'Membresía' };
}

/* Un correo que no se espera. `enviar` devuelve una promesa con Brevo
   y un objeto con el transporte de archivo, y la plantilla puede lanzar
   antes de devolver nada: las dos cosas se cubren, porque una promesa
   rechazada sin manejador tumba el proceso. */
function sinEsperar(que, envio) {
  try {
    Promise.resolve(envio()).catch((e) => console.error(`correo: ${que} · ${e.message}`));
  } catch (e) {
    console.error(`correo: ${que} · ${e.message}`);
  }
}

/* Lo que sale al pedir pagar por transferencia: al comprador, los
   datos para transferir; al buzón de facturación, el aviso de que hay
   un ingreso por esperar (es un buzón propio, no el contador: nada se
   envía a un contador). Sin esperar a ninguno de los dos. */
function avisarTransferenciaPedida(ctx, { referencia, total, concepto }) {
  const cuenta = transferencia.datosTransferencia();
  const dinero = `RD$${Number(total).toLocaleString('en-US')}`;
  const empresa = (ctx.organizacion && ctx.organizacion.nombre) || ctx.usuario.nombre;
  if (cuenta) {
    sinEsperar(`datos de transferencia ${referencia}`, () => correo.enviarDatosTransferencia({
      para: ctx.usuario.correo, nombre: ctx.usuario.nombre, referencia, total, concepto, datos: cuenta,
    }));
  }
  sinEsperar(`aviso interno de la transferencia ${referencia}`, () => correo.avisarInternamente({
    buzon: 'facturacion',
    asunto: `Transferencia en espera ${referencia} · ${empresa} · ${dinero}`,
    texto: [
      'Un cliente pidió pagar por transferencia. Cuando el ingreso aparezca en el banco,',
      'márquelo como recibido en la consola (Pagos): eso otorga los cupos y emite el comprobante.',
      '',
      `Referencia: ${referencia}`,
      `Empresa:    ${empresa}`,
      `Cliente:    ${ctx.usuario.nombre || '(sin nombre)'} <${ctx.usuario.correo}>`,
      `Concepto:   ${concepto}`,
      `Importe:    ${dinero} (ITBIS incluido)`,
    ].join('\n'),
  }));
}

const comprarMembresia = conSesion(async (req, res, ctx) => {
  if (exigirAceptacion(res, ctx.usuario.id, legales.PARA_PAGAR)) return undefined;

  const c = await leerCuerpo(req);
  const org = ctx.organizacion;

  const plan = db.planPorId(String(c.plan || ''));
  if (!plan || !plan.activo) return fallo(res, 400, 'Seleccione un nivel válido');

  const cupo = Math.min(Math.max(entero(c.cupo) || 1, 1), precios.CUPO_MAXIMO);
  const dias = Number(c.dias) === 60 ? 60 : 30;

  /* La exención se comprueba contra la BASE y no contra `ctx`, para
     que retirarla tenga efecto en la compra siguiente sin esperar a
     que caduque ninguna sesión. */
  const cobro = esExenta(ctx.usuario.id)
    ? { ...SIN_COSTO, referencia: referenciaCobro(), procesador: 'interna' }
    : {
      ...precios.precioCompra({ precioUnitario: precioUnitario(plan), cupo, dias }),
      referencia: referenciaCobro(),
    };

  /* El procesador lo elige el SERVIDOR (D-03). Antes era el literal
     'demo', que aprueba siempre: con la transferencia encendida eso
     habría regalado cupos a quien comprara. Lo que pida el navegador se
     valida contra la lista del servidor y, si no está, 400 ANTES de
     anotar nada: un método no disponible no deja pago. El importe cero
     no pasa por ningún procesador y no se valida. */
  if (!cobro.procesador && cobro.total > 0) {
    try {
      cobro.procesador = pagos.procesadorDeCobro(c.metodo);
    } catch (e) {
      return fallo(res, e.codigo || 400, e.message);
    }
  }

  /* Datos fiscales, si los pidió.
   *
   * Se validan ANTES de cobrar: descubrir que el RNC está mal después
   * de haber cobrado obliga a emitir una nota de crédito por un error
   * de tecleo. El RNC se comprueba con la misma función que el alta de
   * dealer, que es la que sabe cuántos dígitos tiene. */
  let cliente = { razonSocial: ctx.usuario.nombre, correo: ctx.usuario.correo };
  if (c.conRnc) {
    const rnc = rncValido(c.rnc);
    if (!rnc) return fallo(res, 400, 'El RNC tiene 9 dígitos');
    if (!texto(c.razonSocial, 160)) return fallo(res, 400, 'Escriba la razón social para la factura');
    if (!texto(c.direccionFiscal, 200) || String(c.direccionFiscal).trim().length < 8) {
      return fallo(res, 400, 'Escriba la dirección fiscal para la factura');
    }
    cliente = {
      razonSocial: texto(c.razonSocial, 160),
      rnc,
      direccion: texto(c.direccionFiscal, 200),
      correo: ctx.usuario.correo,
    };
  }

  /* Sin importe no hay nada que esperar ni que declarar: se otorga al
     instante, como siempre, y no se emite comprobante. */
  if (!(cobro.total > 0)) {
    const membresia = db.comprarCupos({ idOrg: org.id, idPlan: plan.id, cupo, dias, cobro });
    return responder(res, 201, {
      membresia,
      cobro,
      comprobante: null,
      sesion: sesionPublica(ctx.usuario.id),
      pago: pagoPublico(db.pagoPorReferencia(cobro.referencia)),
    });
  }

  /* Con importe, el cobro nace pendiente y lo comprado espera en el
     pago. Los cupos y el comprobante los da `pagos.cobrar` solo si el
     procesador aprueba: el comprobante se emite SIEMPRE que haya cobro
     aprobado, lo pida el cliente o no, y nunca si no lo hubo. */
  const pago = db.registrarCobro({
    idOrg: org.id,
    cobro,
    intencion: {
      tipo: 'compra', idPlan: plan.id, cupo, dias,
      concepto: `${plan.nombre} · ${cupo} ${cupo === 1 ? 'cupo' : 'cupos'} · ${dias} días`,
      cliente,
      correoCliente: ctx.usuario.correo,
    },
  });
  const r = await pagos.cobrar(pago);

  if (r.estado === 'rechazado') {
    return fallo(res, 402, NO_APROBADO, { pago: pagoPublico(r.pago) });
  }
  if (r.estado !== 'aprobado') {
    if (pago.procesador === 'transferencia') {
      responder(res, 202, {
        membresia: null, cobro, comprobante: null, pago: pagoPublico(r.pago),
        aviso: EN_ESPERA_TRANSFERENCIA, transferencia: datosDeCuenta(),
      });
      return avisarTransferenciaPedida(ctx, { referencia: pago.referencia, total: pago.total, concepto: intencionDePago(pago).concepto });
    }
    return responder(res, 202, {
      membresia: null, cobro, comprobante: null, pago: pagoPublico(r.pago), aviso: EN_PROCESO,
    });
  }
  return responder(res, 201, {
    membresia: r.membresia,
    cobro,
    comprobante: comprobantePublico(r.comprobante),
    sesion: sesionPublica(ctx.usuario.id),
    pago: pagoPublico(r.pago),
  });
});

const ampliarMembresia = conSesion(async (req, res, ctx, idSusc) => {
  const c = await leerCuerpo(req);
  const org = ctx.organizacion;

  const s = db.suscripcion(idSusc, org.id);
  if (!s) return fallo(res, 404, 'Esa membresía no es suya o no existe');
  if (s.anuncios_incluidos == null) {
    return fallo(res, 400, 'Esa membresía ya no tiene límite de equipos');
  }

  const cupoNuevo = Math.min(Math.max(entero(c.cupo) || 0, 1), precios.CUPO_MAXIMO);
  if (cupoNuevo <= s.anuncios_incluidos) {
    return fallo(res, 400, 'Indique una cantidad mayor a la que ya tiene');
  }

  const dias = s.dias_ciclo || 30;
  const cobro = esExenta(ctx.usuario.id)
    ? { ...SIN_COSTO, referencia: referenciaCobro(), procesador: 'interna' }
    : {
      ...precios.precioAmpliacion({
        precioUnitario: s.precio_unitario,
        cupoActual: s.anuncios_incluidos,
        cupoNuevo,
        dias,
        diasRestantes: precios.diasRestantes(s.fin) ?? dias,
      }),
      referencia: referenciaCobro(),
    };

  // El procesador lo elige el servidor, igual que en la compra (D-03).
  if (!cobro.procesador && cobro.total > 0) {
    try {
      cobro.procesador = pagos.procesadorDeCobro(c.metodo);
    } catch (e) {
      return fallo(res, e.codigo || 400, e.message);
    }
  }

  if (!(cobro.total > 0)) {
    const membresia = db.ampliarCupos({ idSusc, idOrg: org.id, cupoNuevo, cobro });
    return responder(res, 200, {
      membresia, cobro, comprobante: null, pago: pagoPublico(db.pagoPorReferencia(cobro.referencia)),
    });
  }

  /* Ampliar cupos es un cobro como cualquier otro y lleva su
     comprobante. Faltaba: se cobraba la diferencia, el pago quedaba
     aprobado y no se emitía nada. Ahora pasa por la misma transición
     que la compra, y lo que se guarda son los cupos AÑADIDOS, que es
     lo que se cobró y lo que se suma al confirmarse. */
  const cuantos = cupoNuevo - s.anuncios_incluidos;
  const pago = db.registrarCobro({
    idOrg: org.id,
    idSusc,
    cobro,
    intencion: {
      tipo: 'ampliacion', idSusc, cupoAnterior: s.anuncios_incluidos, cupoNuevo, anadidos: cuantos,
      concepto: `Ampliación de ${s.plan_nombre || 'membresía'} · ${cuantos} `
        + `${cuantos === 1 ? 'cupo' : 'cupos'} más · hasta ${cupoNuevo}`,
      /* Los mismos datos fiscales de la compra original: quien facturó
         con RNC espera que la ampliación de esa misma membresía salga
         igual, no a nombre de otro. */
      cliente: datosFiscalesDe(ctx),
      correoCliente: ctx.usuario.correo,
    },
  });
  const r = await pagos.cobrar(pago);

  if (r.estado === 'rechazado') {
    return fallo(res, 402, NO_APROBADO, { pago: pagoPublico(r.pago) });
  }
  if (r.estado !== 'aprobado') {
    if (pago.procesador === 'transferencia') {
      responder(res, 202, {
        membresia: db.suscripcion(idSusc, org.id), cobro, comprobante: null,
        pago: pagoPublico(r.pago), aviso: EN_ESPERA_TRANSFERENCIA, transferencia: datosDeCuenta(),
      });
      return avisarTransferenciaPedida(ctx, { referencia: pago.referencia, total: pago.total, concepto: intencionDePago(pago).concepto });
    }
    return responder(res, 202, {
      membresia: db.suscripcion(idSusc, org.id), cobro, comprobante: null,
      pago: pagoPublico(r.pago), aviso: EN_PROCESO,
    });
  }
  return responder(res, 200, {
    membresia: r.membresia,
    cobro,
    comprobante: comprobantePublico(r.comprobante),
    pago: pagoPublico(r.pago),
  });
});

/* Mover un equipo de una membresía a otra: lo que el anunciante
   entiende como "pasar este camión a Destacado". */
const cambiarPlanDeAnuncio = conSesion(async (req, res, ctx, idAnuncio) => {
  const c = await leerCuerpo(req);
  const org = ctx.organizacion;

  const a = db.anuncio(idAnuncio);
  if (!a || a.organizacion_id !== org.id) {
    return fallo(res, 404, 'Ese anuncio no es suyo o no existe');
  }

  const destino = db.suscripcion(String(c.membresia || ''), org.id);
  if (!destino) return fallo(res, 404, 'Esa membresía no es suya o no existe');

  if (destino.id === a.suscripcion_id) {
    return responder(res, 200, { anuncio: a, sinCambio: true });
  }

  // El cupo tiene que estar libre. Cuenta solo lo que ocupa sitio, así
  // que un equipo vendido no bloquea el suyo.
  if (destino.libres !== null && destino.libres < 1) {
    return fallo(res, 409, `Su membresía ${destino.plan_nombre} no tiene cupos libres. Amplíela o libere uno marcando un equipo como vendido.`);
  }

  // Bajar de nivel puede dejar fuera fotografías ya publicadas. Se
  // dice antes y no se recorta nada por sorpresa.
  const fotos = (a.fotos || []).length;
  if (fotos > destino.fotos_maximas) {
    return fallo(res, 409, `Este anuncio tiene ${fotos} fotografías y ${destino.plan_nombre} admite ${destino.fotos_maximas}. Quite ${fotos - destino.fotos_maximas} antes de moverlo.`);
  }

  const movido = db.moverAnuncioDeSuscripcion({ idAnuncio, idOrg: org.id, idSusc: destino.id });
  return responder(res, 200, { anuncio: movido, membresia: db.suscripcion(destino.id, org.id) });
});

/* ── Rutas: anuncios ────────────────────────────────────── */

/* La taxonomía es la MISMA que carga el navegador. Antes había aquí
   una lista de ocho categorías escrita a mano que ya no coincidía con
   la de assets/data.js: el servidor aceptaba unas y la pantalla
   ofrecía otras. */
const taxonomia = require('../assets/taxonomia.js');

/* Publicar: valida el equipo y lo pone en un cupo ya comprado.
   Aquí NO se cobra. La capacidad se compra antes, en
   POST /api/membresias, y publicar solo la ocupa. Esa separación es
   la que permite mover después un equipo de un nivel a otro: el cupo
   es de la organización, no del anuncio. */
/* Nadie publica ni paga sin tener aceptadas las condiciones vigentes.
 *
 * Va en el servidor y no solo en la pantalla: el aviso del sitio evita
 * que alguien llegue al final de un formulario para que entonces se le
 * diga que no, pero lo que impide de verdad publicar sin aceptar es
 * esto. Devuelve 409 y no 403 porque no es una cuestión de permisos:
 * es un paso que falta y que quien lo recibe puede completar. */
function exigirAceptacion(res, idUsuario, ids) {
  const faltan = legales.faltanPorAceptar(db.aceptacionesDe(idUsuario), ids);
  if (!faltan.length) return false;

  const nombres = faltan.map((id) => legales.documento(id).nombre);
  fallo(res, 409, `Debe aceptar ${nombres.join(' y ')} antes de continuar`, { faltan });
  return true;
}

const publicar = conSesion(async (req, res, ctx) => {
  if (exigirAceptacion(res, ctx.usuario.id, legales.PARA_PUBLICAR)) return undefined;

  /* Publicar no tenía ningún tope. El cupo pagado limita cuántos
     anuncios quedan vivos, pero no cuántas peticiones se pueden lanzar:
     cada una lee un cuerpo de hasta veinticinco megas y escribe en la
     base. Veinte por hora es de sobra para cualquiera que esté
     publicando de verdad su flota. */
  if (!db.permitir(`publicar:${ctx.usuario.id}`, 20, 60)) {
    return fallo(res, 429, 'Ha publicado muchos equipos seguidos. Inténtelo en un rato.');
  }

  const c = await leerCuerpo(req);
  const org = ctx.organizacion;

  /* Qué membresía sostiene este anuncio. Si el anunciante eligió una
     se respeta; si no, la de nivel más alto con sitio libre, que es la
     que más hace por el equipo. */
  const exenta = esExenta(ctx.usuario.id);
  const membresia = exenta
    ? db.membresiaInterna(org.id)
    : (c.membresia
      ? db.suscripcion(String(c.membresia), org.id)
      : db.suscripcionConHueco(org.id));

  /* Sin sitio donde publicar. Se distingue no tener nada contratado de
     tenerlo lleno: son dos situaciones distintas y la salida de cada
     una también. Decirle "contrate un plan" a quien ya pagó cinco
     cupos y los tiene ocupados es mandarlo a comprar de nuevo cuando
     lo que necesita es ampliar o liberar uno. */
  if (!membresia) {
    const tiene = db.suscripcionesDe(org.id).length;
    return fallo(res, 402, tiene
      ? 'Sus cupos están ocupados. Añada cupos desde su panel —solo paga los días que le queden— o libere uno marcando un equipo como vendido.'
      : 'Todavía no tiene cupos. Contrate un plan para publicar este equipo.');
  }
  if (membresia.libres !== null && membresia.libres < 1) {
    return fallo(res, 409, `Su membresía ${membresia.plan_nombre} no tiene cupos libres. Amplíela o libere uno marcando un equipo como vendido.`);
  }

  const plan = db.planPorId(membresia.plan_id);
  if (!plan) return fallo(res, 400, 'La membresía apunta a un nivel que ya no existe');

  /* La cadena completa: categoría → subcategoría → marca. Se valida
     aquí y no solo en la pantalla porque el navegador puede mandar
     cualquier cosa, y una jerarquía que solo se respeta en el
     formulario no impide nada. */
  const errorCadena = taxonomia.validarCadena({
    categoria: String(c.categoria || ''),
    subcategoria: String(c.subcategoria || ''),
    marca: String(c.marca || ''),
  });
  if (errorCadena) return fallo(res, 400, errorCadena);

  if (!texto(c.modelo, 60)) return fallo(res, 400, 'Indique el modelo');

  const anio = entero(c.anio);
  const limite = new Date().getFullYear() + 1;
  if (!anio || anio < 1970 || anio > limite) return fallo(res, 400, `Año entre 1970 y ${limite}`);

  const modalidadPrecio = c.modalidadPrecio === 'ofertas' ? 'ofertas' : 'fijo';
  const precio = entero(c.precio);
  if (!precio || precio <= 0) return fallo(res, 400, 'Indique el precio solicitado');

  /* Tren motriz: solo se acepta en las subcategorías que lo piden, y
     solo de las listas. Guardarlo en una excavadora ensuciaría la
     ficha con campos que no significan nada ahí. */
  let tren = {};
  if (taxonomia.pideTrenMotriz(String(c.subcategoria))) {
    const motor = taxonomia.MOTORES[String(c.motorMarca || '')];
    const trans = taxonomia.TRANSMISIONES[String(c.transmisionMarca || '')];

    if (c.motorMarca && !motor) return fallo(res, 400, 'Marca de motor no reconocida');
    if (c.transmisionMarca && !trans) return fallo(res, 400, 'Marca de transmisión no reconocida');

    // El modelo es opcional, pero si viene tiene que ser de esa marca.
    if (c.motorModelo && motor && motor.modelos.length && !motor.modelos.includes(String(c.motorModelo))) {
      return fallo(res, 400, 'Ese modelo de motor no es de esa marca');
    }
    if (c.transmisionModelo && trans && trans.modelos.length
      && !trans.modelos.includes(String(c.transmisionModelo))) {
      return fallo(res, 400, 'Ese modelo de transmisión no es de esa marca');
    }

    tren = {
      motorMarca: motor ? String(c.motorMarca) : null,
      motorModelo: texto(c.motorModelo, 60),
      transmisionMarca: trans ? String(c.transmisionMarca) : null,
      transmisionModelo: texto(c.transmisionModelo, 60),
    };
  }

  /* Cada foto tiene que ser una que se subió aquí.
   *
   * Los videos de tres líneas más abajo sí lo comprobaban, y la portada
   * del sitio también; las fotos del anuncio no. Una petición fabricada
   * podía meter treinta imágenes en base64 dentro del JSON y quedarse
   * guardadas en la base: veinticuatro megas en un solo anuncio. Es
   * exactamente el problema que tools/fotos.js dice en su cabecera
   * haber venido a resolver, con la puerta de al lado abierta. Con una
   * URL de un tercero el resultado es otro y tampoco bueno: la política
   * de contenidos del navegador la bloquea y el catálogo se llena de
   * imágenes rotas. */
  const fotos = (Array.isArray(c.fotos) ? c.fotos : [])
    .map((f) => (typeof f === 'string' ? { url: f, miniatura: null } : {
      url: f && f.url,
      /* La miniatura se conserva —es lo que ve el catálogo mientras
         carga la grande— pero se valida igual, y si no pasa se deja en
         nulo en vez de descartar la foto entera. */
      miniatura: f && esRutaDeFoto(f.miniatura) ? f.miniatura : null,
    }))
    .filter((f) => f.url && esRutaDeFoto(f.url))
    .slice(0, plan.fotos_maximas);
  if (fotos.length < 3) {
    return fallo(res, 400, 'Cargue al menos 3 fotografías subidas al sitio');
  }

  /* Los videos se recortan al tope del plan igual que las fotos, y se
     comprueba que cada ruta sea de las que sirve este servidor: sin
     eso, quien manipule la petición podría incrustar en la ficha un
     video alojado en cualquier otro sitio. */
  const videosDelPlan = Array.isArray(c.videos)
    ? c.videos
      .filter((v) => v && videos.archivoDe(v.url))
      .map((v) => ({
        url: v.url,
        poster: esRutaDeFoto(v.poster) ? v.poster : null,
        duracion: Number(v.duracion) || null,
      }))
      .slice(0, plan.videos_maximos || 0)
    : [];

  const telefonos = (Array.isArray(c.telefonos) ? c.telefonos : [])
    .filter((t) => String(t.numero || '').replace(/\D/g, '').length === 10)
    .slice(0, 5);
  if (!telefonos.length) return fallo(res, 400, 'Registre al menos un teléfono de 10 dígitos');

  // El anuncio se ancla a una sucursal. Si se pide una concreta se
  // comprueba que sea de esta organización; si no, va a la principal.
  const sucursal = (c.sucursal && db.sucursal(String(c.sucursal), org.id))
    || db.sucursalPrincipal(org.id);

  const idAnuncio = db.crearAnuncio({
    idOrg: org.id,
    idSucursal: sucursal && sucursal.id,
    idUsuario: ctx.usuario.id,
    idSuscripcion: membresia.id,
    categoria: String(c.categoria),
    subcategoria: texto(c.subcategoria, 80),
    marca: texto(c.marca, 60),
    modelo: texto(c.modelo, 60),
    anio,
    condicion: texto(c.condicion, 40),
    usoValor: entero(c.usoValor),
    usoUnidad: c.usoUnidad === 'km' ? 'km' : 'h',
    serie: texto(c.serie, 60),
    potencia: texto(c.potencia, 40),
    peso: texto(c.peso, 40),
    implementos: texto(c.implementos, 500),
    descripcion: texto(c.descripcion, 4000),
    provincia: texto(c.provincia, 60),
    municipio: texto(c.municipio, 60),
    precio,
    moneda: c.moneda === 'USD' ? 'USD' : 'DOP',
    modalidadPrecio,
    precioMinimo: entero(c.precioMinimo),
    itbisIncluido: !!c.itbisIncluido,
    permuta: !!c.permuta,
    financiamiento: !!c.financiamiento,
    // En el país o bajo pedido. db.crearAnuncio normaliza: lo que no
    // sea exactamente «bajo-pedido» queda en el país.
    disponibilidad: c.disponibilidad === 'bajo-pedido' ? 'bajo-pedido' : 'en-pais',
    video: texto(c.video, 300),
    ...tren,
    /* Las dos fechas salen de la membresía, no de lo que pida el
       navegador. El anuncio se publica mientras el cupo esté pagado;
       si la membresía no tiene fin —una cuenta interna— el anuncio
       tampoco caduca. Al mover el equipo a otra membresía se
       recalculan las dos en db.moverAnuncioDeSuscripcion. */
    vence: membresia.fin,
    destacadoHasta: plan.destacado ? membresia.fin : null,
    fotos,
    videos: videosDelPlan,
    telefonos: telefonos.map((t) => ({ numero: t.numero, tipo: t.tipo, nota: t.nota })),
  });

  /* Confirmación al anunciante. Va después de responder
     conceptualmente —el anuncio ya existe— y no puede fallar de forma
     que afecte a la publicación: `enviar` nunca lanza.

     El comprobante ya no sale aquí: se emitió al comprar el cupo.
     Publicar no cobra nada. */
  const publicado = db.anuncio(idAnuncio);
  correo.enviarAnuncioPublicado({
    para: ctx.usuario.correo,
    nombre: ctx.usuario.nombre,
    equipo: `${publicado.anio} ${publicado.marca} ${publicado.modelo}`,
    idAnuncio,
    vence: publicado.vence,
    plan: plan.nombre,
  });

  return responder(res, 201, {
    anuncio: publicado,
    membresia: db.suscripcion(membresia.id, org.id),
    sesion: sesionPublica(ctx.usuario.id),
  });
});

const misAnuncios = conSesion((req, res, ctx) => {
  db.caducarAnuncios();
  return responder(res, 200, {
    anuncios: db.anunciosDeOrganizacion(ctx.organizacion.id),
    resumen: db.resumenOrganizacion(ctx.organizacion.id),
    // En plural: una cuenta puede tener varias membresías vivas, y
    // enseñar solo una era lo que dejaba cupos pagados fuera de la
    // vista del anunciante.
    membresias: db.suscripcionesDe(ctx.organizacion.id),
    exenta: esExenta(ctx.usuario.id),
  });
});

const cambiarEstado = conSesion(async (req, res, ctx, idAnuncio) => {
  const c = await leerCuerpo(req);
  const permitidos = ['activo', 'pausado', 'vendido', 'retirado'];
  if (!permitidos.includes(c.estado)) return fallo(res, 400, 'Estado inválido');

  const r = db.cambiarEstadoAnuncio(idAnuncio, ctx.organizacion.id, c.estado);
  if (!r.changes) return fallo(res, 404, 'Ese anuncio no es suyo o no existe');
  return responder(res, 200, { ok: true, estado: c.estado });
});

/* Eliminar un anuncio propio. Libera su cupo, que vuelve a estar
   disponible sin pagar de nuevo. */
const eliminarAnuncio = conSesion((req, res, ctx, idAnuncio) => {
  const rutas = db.borrarAnuncio(idAnuncio, ctx.organizacion.id);
  if (rutas === null) return fallo(res, 404, 'Ese anuncio no es suyo o no existe');

  /* Los archivos se borran DESPUÉS de que la fila se haya ido. Si se
     hiciera antes y la transacción fallara, el anuncio se quedaría
     publicado apuntando a fotos que ya no están. `borrar` no lanza si
     el archivo falta.

     Los videos pesan doce veces más que una foto: dejárselos olvidados
     en disco al borrar un anuncio llenaría el VPS sin que nadie lo
     relacionara con nada. */
  rutas.fotos.forEach((r) => { try { fotos.borrar(r); } catch (_) { /* ya no estaba */ } });
  rutas.videos.forEach((r) => { try { videos.borrar(r); } catch (_) { /* ya no estaba */ } });

  return responder(res, 200, {
    ok: true,
    membresias: db.suscripcionesDe(ctx.organizacion.id),
  });
});

/* Motor y transmisión de un anuncio ya publicado.

   Existe porque el asistente los preguntaba y no los mandaba: hay
   anuncios de camión publicados con el hueco en blanco. Obligar a
   republicarlos costaría sus visitas y su antigüedad por un fallo que
   no cometió el anunciante.

   Se valida igual que al publicar y contra las mismas listas: en un
   equipo que no lleva tren motriz no se acepta, y una marca inventada
   tampoco. */
const editarTrenMotriz = conSesion(async (req, res, ctx, idAnuncio) => {
  const c = await leerCuerpo(req);
  const a = db.anuncio(idAnuncio);
  if (!a || a.organizacion_id !== ctx.organizacion.id) {
    return fallo(res, 404, 'Ese anuncio no es suyo o no existe');
  }
  if (!taxonomia.pideTrenMotriz(String(a.subcategoria))) {
    return fallo(res, 400, 'Este tipo de equipo no lleva motor ni transmisión declarados');
  }

  const motor = taxonomia.MOTORES[String(c.motorMarca || '')];
  const trans = taxonomia.TRANSMISIONES[String(c.transmisionMarca || '')];
  if (c.motorMarca && !motor) return fallo(res, 400, 'Marca de motor no reconocida');
  if (c.transmisionMarca && !trans) return fallo(res, 400, 'Marca de transmisión no reconocida');

  if (c.motorModelo && motor && motor.modelos.length && !motor.modelos.includes(String(c.motorModelo))) {
    return fallo(res, 400, 'Ese modelo de motor no es de esa marca');
  }
  if (c.transmisionModelo && trans && trans.modelos.length
    && !trans.modelos.includes(String(c.transmisionModelo))) {
    return fallo(res, 400, 'Ese modelo de transmisión no es de esa marca');
  }

  db.guardarTrenMotriz(idAnuncio, ctx.organizacion.id, {
    motorMarca: motor ? String(c.motorMarca) : null,
    motorModelo: motor ? texto(c.motorModelo, 60) : null,
    transmisionMarca: trans ? String(c.transmisionMarca) : null,
    transmisionModelo: trans ? texto(c.transmisionModelo, 60) : null,
  });

  return responder(res, 200, { anuncio: db.anuncio(idAnuncio) });
});

/* En el país o bajo pedido, cambiado desde el panel por el dueño del
   anuncio. A cualquier otro se le responde 404, igual que en el tren
   motriz: no se confirma que el anuncio exista. */
const editarDisponibilidad = conSesion(async (req, res, ctx, idAnuncio) => {
  const c = await leerCuerpo(req);
  const a = db.anuncio(idAnuncio);
  if (!a || !ctx.organizacion || a.organizacion_id !== ctx.organizacion.id) {
    return fallo(res, 404, 'Ese anuncio no es suyo o no existe');
  }
  if (!db.DISPONIBILIDADES.includes(c.disponibilidad)) {
    return fallo(res, 400, 'Indique si el equipo está en el país o es bajo pedido');
  }
  db.guardarDisponibilidad(idAnuncio, ctx.organizacion.id, c.disponibilidad);
  return responder(res, 200, { anuncio: { id: idAnuncio, disponibilidad: c.disponibilidad } });
});

/* Catálogo. Busca, filtra, ordena y pagina en el servidor: el
   navegador ya no recibe el inventario entero para cribarlo, que era
   lo que iba a romperse al llegar a los miles de anuncios. */
function catalogo(req, res, ctx, consulta) {
  db.caducarAnuncios();
  const q = consulta || new URLSearchParams();
  const v = (clave) => q.get(clave) || undefined;

  const resultado = db.buscarAnuncios({
    q: texto(v('q'), 80),
    categoria: v('categoria'),
    subcategoria: v('subcategoria'),
    marca: v('marca'),
    provincia: v('provincia'),
    condicion: v('condicion'),
    disponibilidad: v('disponibilidad'),
    precioMin: v('precioMin'),
    precioMax: v('precioMax'),
    anioMin: v('anioMin'),
    anioMax: v('anioMax'),
    horasMax: v('horasMax'),
    soloDestacados: v('destacados') === '1',
    // Solo el valor exacto '1' activa: es lo que manda la casilla.
    permuta: v('permuta') === '1',
    itbis: v('itbis') === '1',
    orden: v('orden'),
    pagina: v('pagina'),
    porPagina: v('porPagina'),
  });

  return responder(res, 200, resultado);
}

/* Cifras públicas de la portada. Salen de la base en cada petición:
   ninguna cuenta del sitio está escrita a mano. */
const estadisticas = (req, res) => {
  db.caducarAnuncios();
  return responder(res, 200, db.estadisticas());
};

/* Campos que solo le importan al dueño. `precio_minimo` es el serio:
   el esquema lo marca como privado porque es el suelo por debajo del
   cual el vendedor no piensa bajar, y la ficha lo estaba entregando a
   cualquiera que abriera la consola del navegador. En una plataforma
   cuya modalidad de ofertas existe para negociar, publicarlo deja a
   todos los anunciantes sin posición. Los otros cuatro no filtran
   nada grave, pero tampoco pintan nada en una ficha pública. */
const PRIVADOS_DEL_ANUNCIO = ['precio_minimo', 'usuario_id', 'suscripcion_id',
  'aviso_por_vencer', 'aviso_vencido',
  /* El número de serie. publicar.html le promete al vendedor que solo lo
     ve el personal, y esta ruta lo entregaba a cualquiera (la consulta
     es un SELECT a.*). Es además el dato con el que se «legalizan»
     papeles de una máquina ajena. Con él se van los datos de su
     revisión: la nota de lo que no cuadró es para el vendedor, y quién
     la revisó, para la consola. Al público le llega `serie_cotejada`. */
  'serie', 'serie_revision', 'serie_revisada', 'serie_revisada_por', 'serie_nota'];

function verAnuncio(req, res, ctx, idAnuncio) {
  const a = db.anuncio(idAnuncio);
  if (!a) return fallo(res, 404, 'Ese anuncio no existe');
  // Antes de borrar los privados: es lo único de la revisión que es público.
  a.serie_cotejada = a.serie_revision === 'conforme';
  /* Quién de dentro revisó la serie no sale ni hacia el dueño: es el
     mismo criterio que la página editada en su nombre (el dealer sabe
     que el personal actuó, el nombre del empleado está en la bitácora).
     Su panel no lo usa. */
  delete a.serie_revisada_por;
  /* `ctx` es null cuando no hay sesión, que es el caso normal aquí:
     esta ruta la llama cualquier visitante del catálogo. */
  const esSuyo = !!ctx && !!ctx.organizacion && a.organizacion_id === ctx.organizacion.id;
  if (!esSuyo) PRIVADOS_DEL_ANUNCIO.forEach((campo) => { delete a[campo]; });
  return responder(res, 200, { anuncio: a });
}

/* Registro de una interacción. Va sin sesión a propósito: lo llama
   cualquier visitante del catálogo. */
async function evento(req, res, ctx) {
  const c = await leerCuerpo(req);

  /* Con origen() y no con socket.remoteAddress: detrás del proxy ese
     valor es siempre 127.0.0.1, así que la huella del visitante
     colapsaba y cincuenta personas distintas contaban como una. */
  const ip = origen(req);
  if (!db.permitir(`evento:${ip}`, LIMITES.eventos.tope, LIMITES.eventos.minutos)) {
    return fallo(res, 429, 'Demasiadas peticiones desde esta conexión');
  }

  const agente = req.headers['user-agent'] || '';
  const tipo = String(c.tipo || '');
  const idAnuncio = String(c.anuncio || '');
  const resultado = db.anotarEvento(idAnuncio, tipo, db.huella(ip, agente));
  if (resultado === 'invalido') return fallo(res, 400, 'Evento no reconocido');

  /* Un contacto es la señal de que el anuncio funciona, y la razón
     principal por la que alguien renueva. Solo avisa el primero de
     cada persona y día: 'repetido' llega en cuanto alguien vuelve a
     pulsar, y sin esa distinción trescientas pulsaciones eran
     trescientos correos y la cuota del proveedor agotada.

     Las vistas no avisan; serían decenas de correos diarios. */
  if (resultado === 'contado' && (tipo === 'telefono' || tipo === 'whatsapp')) {
    const dueno = db.duenoDeAnuncio(idAnuncio);
    if (dueno) {
      correo.enviarContactoRecibido({
        para: dueno.correo,
        nombre: dueno.nombre,
        equipo: `${dueno.anio} ${dueno.marca} ${dueno.modelo}`,
        idAnuncio,
        via: tipo,
      });
    }
  }

  /* Repetido no es un error: la visita es legítima y el evento se
     guardó. Responder 400 llenaba la consola del navegador de
     errores rojos en cada recarga de una ficha. */
  return responder(res, 202, { ok: true, contado: resultado === 'contado' });
}

/* ── Enrutador ──────────────────────────────────────────── */

/* Escrituras de administrador que NO son en nombre de otra organización
   y por eso no van a la bitácora. Cada una lleva su porqué: la guarda de
   tools/probar-bitacora.js exige que toda ruta de escritura bajo
   /api/admin/ esté aquí o pase por conAdminEnNombreDe, nunca las dos.
   Añadir una escritura de admin sin decidir dónde va rompe la barrera. */
const ESCRITURAS_ADMIN_PROPIAS = new Set([
  editarPortada,          // la portada es de la plataforma
  crearPublicidad,        // los espacios de publicidad son de la plataforma
  editarPublicidad,       // ídem
  eliminarPublicidad,     // ídem
  crearFlota,             // la flota propia es de MercaMaquinarias
  editarFlota,            // ídem
  eliminarFlota,          // ídem
  cargarSecuencia,        // las secuencias NCF son de la plataforma ante la DGII
  reenviarFactura,        // reenviar un comprobante no cambia datos de nadie
  /* La nota de crédito la emite la plataforma sobre su propio documento
     fiscal, y meterla en enNombreDe exige anidar la transacción de NCF
     de tools/facturas.js. Pregunta abierta para Victor (D-01 de 04-01). */
  anularFactura,
  marcarSolicitudServicio, // la manda un visitante, no una organización; guarda atendida_por
  editarTasaCambio,       // la tasa de referencia del catálogo es de la plataforma
]);

const RUTAS = [
  ['POST', /^\/api\/cuenta\/registro$/,     registro],
  ['POST', /^\/api\/cuenta\/entrar$/,       entrar],
  ['POST', /^\/api\/cuenta\/verificar$/,    verificar],
  ['POST', /^\/api\/cuenta\/reenviar$/,     reenviar],
  ['POST', /^\/api\/cuenta\/recuperar$/,    recuperar],
  ['POST', /^\/api\/cuenta\/restablecer$/,  restablecer],
  ['POST', /^\/api\/cuenta\/salir$/,        salir],
  ['GET',  /^\/api\/sesion$/,               verSesion],
  ['POST', /^\/api\/legales\/aceptar$/,     aceptarLegales],
  ['GET',  /^\/api\/facturas$/,             misFacturas],
  ['GET',  /^\/api\/facturas\/([\w-]+)\.pdf$/, descargarFactura],
  ['GET',  /^\/api\/facturas\/([\w-]+)\.html$/, verFactura],
  ['POST', /^\/api\/dealer\/registro$/,     registrarDealer],
  ['GET',  /^\/api\/sucursales$/,           listarSucursales],
  ['POST', /^\/api\/sucursales$/,           crearSucursal],
  ['PATCH', /^\/api\/sucursales\/([\w-]+)$/, editarSucursal],
  ['DELETE', /^\/api\/sucursales\/([\w-]+)$/, borrarSucursal],
  ['GET',  /^\/api\/dealers$/,           listarDealers],
  ['GET',  /^\/api\/dealers\/([\w-]+)$/, verDealer],

  /* La página propia del dealer. Las subrutas van ANTES que la genérica
     de secciones: el enrutador recorre esta lista en orden, y
     `/secciones/orden` tiene que ganarle a `/secciones/:id`. */
  ['GET',    /^\/api\/mi-pagina$/,                          verMiPagina],
  ['PATCH',  /^\/api\/mi-pagina$/,                          editarMiPagina],
  ['POST',   /^\/api\/mi-pagina\/publicar$/,                publicarMiPagina],
  ['POST',   /^\/api\/mi-pagina\/despublicar$/,             despublicarMiPagina],
  ['PATCH',  /^\/api\/mi-pagina\/secciones\/orden$/,        ordenarMisSecciones],
  ['POST',   /^\/api\/mi-pagina\/secciones$/,               crearMiSeccion],
  ['PATCH',  /^\/api\/mi-pagina\/secciones\/([\w-]+)$/,     editarMiSeccion],
  ['DELETE', /^\/api\/mi-pagina\/secciones\/([\w-]+)$/,     borrarMiSeccion],
  ['POST',   /^\/api\/mi-pagina\/galeria$/,                 anadirAMiGaleria],
  ['DELETE', /^\/api\/mi-pagina\/galeria\/([\w-]+)$/,       quitarDeMiGaleria],
  ['PUT',    /^\/api\/mi-pagina\/enlaces$/,                 guardarMisEnlaces],
  ['GET',    /^\/api\/admin\/organizaciones$/,               listarOrganizacionesAdmin],
  ['POST',   /^\/api\/admin\/organizaciones\/([\w-]+)\/verificar$/, verificarOrganizacion],

  /* La página de un dealer, editada por el personal en su nombre
     (ADMIN-04). Como las del dueño: `/secciones/orden` ANTES que
     `/secciones/:id`. Sin publicar ni despublicar, a propósito. */
  ['GET',    /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina$/,                    verPaginaEnNombre],
  ['PATCH',  /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina$/,                    editarPaginaEnNombre],
  ['PATCH',  /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina\/secciones\/orden$/,  ordenarSeccionesEnNombre],
  ['POST',   /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina\/secciones$/,         crearSeccionEnNombre],
  ['PATCH',  /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina\/secciones\/([\w-]+)$/, editarSeccionEnNombre],
  ['DELETE', /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina\/secciones\/([\w-]+)$/, borrarSeccionEnNombre],
  ['POST',   /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina\/galeria$/,           anadirFotoEnNombre],
  ['DELETE', /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina\/galeria\/([\w-]+)$/, quitarFotoEnNombre],
  ['PUT',    /^\/api\/admin\/organizaciones\/([\w-]+)\/pagina\/enlaces$/,           guardarEnlacesEnNombre],
  ['GET',    /^\/api\/admin\/bitacora$/,                     listarBitacora],
  ['GET',    /^\/api\/admin\/series$/,                       listarSeries],
  ['POST',   /^\/api\/admin\/anuncios\/([\w-]+)\/serie$/,    revisarSerie],
  ['GET',  /^\/api\/planes$/,            listarPlanes],
  ['GET',  /^\/api\/estadisticas$/,      estadisticas],
  ['POST', /^\/api\/anuncios$/,          publicar],
  ['GET',  /^\/api\/anuncios$/,          catalogo],
  ['GET',  /^\/api\/mis-anuncios$/,      misAnuncios],
  ['GET',  /^\/api\/anuncios\/([\w-]+)$/, verAnuncio],
  ['PATCH', /^\/api\/anuncios\/([\w-]+)\/plan$/, cambiarPlanDeAnuncio],
  ['PATCH', /^\/api\/anuncios\/([\w-]+)\/tren-motriz$/, editarTrenMotriz],
  ['PATCH', /^\/api\/anuncios\/([\w-]+)\/disponibilidad$/, editarDisponibilidad],
  ['PATCH', /^\/api\/anuncios\/([\w-]+)$/, cambiarEstado],
  ['DELETE', /^\/api\/anuncios\/([\w-]+)$/, eliminarAnuncio],

  // Capacidad: se compra antes de publicar y se amplía prorrateada.
  ['GET',  /^\/api\/membresias$/,                    misPlanes],
  ['POST', /^\/api\/membresias$/,                    comprarMembresia],
  ['POST', /^\/api\/membresias\/([\w-]+)\/ampliar$/, ampliarMembresia],
  ['POST', /^\/api\/eventos$/,           evento],
  ['POST', /^\/api\/fotos$/,             subirFoto],
  ['POST', /^\/api\/videos$/,            subirVideo],

  // Flota propia de alquiler y transporte. La lectura es pública;
  // todo lo que la modifica exige sesión con es_admin.
  ['GET',  /^\/api\/taxonomia$/,                        verTaxonomia],

  // Cotizaciones de alquiler, transporte e importación. Crearlas va sin
  // sesión —pedir precio no debe exigir cuenta—; leerlas, no.
  ['POST',  /^\/api\/solicitudes$/,                      crearSolicitudServicio],

  // Asistente de soporte. Público y sin sesión: quien pregunta cómo
  // funciona el sitio todavía no tiene cuenta.
  ['POST',  /^\/api\/chat$/,                             conversarConSoporte],
  ['GET',   /^\/api\/admin\/solicitudes-servicio$/,      listarSolicitudesServicio],
  ['PATCH', /^\/api\/admin\/solicitudes-servicio\/([\w-]+)$/, marcarSolicitudServicio],

  // Portada: fotografía del héroe y fotos por categoría.
  ['GET',   /^\/api\/portada$/,                         verPortada],
  ['PATCH', /^\/api\/admin\/portada$/,                  editarPortada],

  // Tasa de referencia del dólar con que el catálogo compara precios.
  ['GET',   /^\/api\/admin\/tasa-cambio$/,              verTasaCambio],
  ['PATCH', /^\/api\/admin\/tasa-cambio$/,              editarTasaCambio],

  // Publicidad. La lectura y el clic son públicos; la gestión, no.
  ['GET',  /^\/api\/publicidad$/,                       listarPublicidad],
  ['GET',  /^\/api\/publicidad\/([\w-]+)\/ir$/,         clicPublicidad],
  ['GET',  /^\/api\/admin\/publicidad$/,                listarPublicidadAdmin],
  ['POST', /^\/api\/admin\/publicidad$/,                crearPublicidad],
  ['PATCH', /^\/api\/admin\/publicidad\/([\w-]+)$/,     editarPublicidad],
  ['DELETE', /^\/api\/admin\/publicidad\/([\w-]+)$/,    eliminarPublicidad],
  ['GET',  /^\/api\/flota\/(\w+)$/,                     listarFlota],
  ['GET',  /^\/api\/admin\/flota\/(\w+)$/,              listarFlotaAdmin],
  ['POST', /^\/api\/admin\/flota\/(\w+)$/,              crearFlota],
  ['PATCH', /^\/api\/admin\/flota\/item\/([\w-]+)$/,    editarFlota],
  ['DELETE', /^\/api\/admin\/flota\/item\/([\w-]+)$/,   eliminarFlota],

  // Revisión de solicitudes. Todas exigen sesión con es_admin.
  ['GET',  /^\/api\/admin\/legales$/,                   verAceptaciones],
  ['GET',  /^\/api\/admin\/facturas$/,                  listarFacturas],
  ['GET',  /^\/api\/admin\/facturas\.csv$/,             exportarFacturas],
  ['POST', /^\/api\/admin\/secuencias$/,                cargarSecuencia],
  ['POST', /^\/api\/admin\/facturas\/([\w-]+)\/reenviar$/, reenviarFactura],
  ['POST', /^\/api\/admin\/facturas\/([\w-]+)\/anular$/,   anularFactura],
  /* Transferencias. Las dos escrituras van por la bitácora, no en
     ESCRITURAS_ADMIN_PROPIAS: son en nombre de otra organización. */
  ['GET',  /^\/api\/admin\/pagos$/,                     listarPagosAdmin],
  ['POST', /^\/api\/admin\/pagos\/([\w-]+)\/recibido$/, marcarTransferenciaRecibida],
  ['POST', /^\/api\/admin\/pagos\/([\w-]+)\/anular$/,   anularTransferencia],
  ['GET',  /^\/api\/admin\/solicitudes$/,               listarSolicitudes],
  ['GET',  /^\/api\/admin\/solicitudes\/([\w-]+)$/,     verSolicitud],
  ['POST', /^\/api\/admin\/solicitudes\/([\w-]+)$/,     resolverSolicitud],
];

async function manejar(req, res, ruta) {
  // Los parámetros de consulta llegan al manejador después de lo que
  // capture su patrón, así que una ruta sin capturas los recibe en el
  // cuarto argumento y una con una captura, en el quinto.
  let consulta;
  try {
    consulta = new URL(req.url, 'http://localhost').searchParams;
  } catch {
    consulta = new URLSearchParams();
  }

  for (const [metodo, patron, manejador] of RUTAS) {
    if (req.method !== metodo) continue;
    const m = patron.exec(ruta);
    if (!m) continue;
    try {
      return await manejador(req, res, contexto(req), ...m.slice(1), consulta);
    } catch (e) {
      const codigo = e.codigo || 500;
      if (codigo >= 500) console.error('API', ruta, e);
      return fallo(res, codigo, codigo >= 500 ? 'Error del servidor' : e.message);
    }
  }
  return fallo(res, 404, 'Ruta inexistente');
}

module.exports = { manejar, ITBIS, RUTAS, ESCRITURAS_ADMIN_PROPIAS };
