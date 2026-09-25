/**
 * cardnet.js — la única pieza que habla con CardNet.
 *
 * QUÉ ES
 *
 * El cliente de la API de Tokenización (Card on File) de CardNet, a mano
 * sobre `https` y sin paquetes, como el correo y el asistente. Crea el
 * cliente en CardNet, pide la URL del formulario de captura, cobra con
 * `POST /v1/api/purchase`, consulta, devuelve y activa o borra perfiles.
 *
 * No abre la base, no sabe de cupos ni de NCF: devuelve lo que dijo
 * CardNet, normalizado a `aprobado | rechazado | pendiente`, y quien
 * llama (`tools/pagos.js`) decide. Que el resto del sistema no conozca
 * los nombres de campo de CardNet es lo que permite ajustarlos en la
 * certificación tocando un solo archivo.
 *
 * POR QUÉ VA APAGADO
 *
 * CardNet se contrata de última, justo antes de abrir. Como el SMS de
 * Brevo y la clave de Anthropic, esto se entrega entero y apagado: el
 * día de la afiliación es encender, no construir. Encendido exige
 * `MERCA_CARDNET` = `lab` o `produccion` Y las dos llaves; cualquier
 * otra cosa es apagado y el sitio se comporta como antes. Se lee
 * `process.env` en cada llamada, no al cargar el módulo, para que la
 * prueba pueda encender y apagar en la misma ejecución.
 *
 * POR QUÉ LAS LLAVES NO ESTÁN EN EL REPOSITORIO
 *
 * Ni siquiera las de certificación que CardNet publica en su propia
 * documentación: una clave escrita en un repositorio es una clave
 * filtrada, sea del ambiente que sea. Viven en `/etc/mercamaquinarias.env`
 * (600). La pública puede ir al navegador, para eso es; la privada no
 * sale nunca del servidor ni de un registro.
 *
 * POR QUÉ NUNCA «SIN PANTALLA»
 *
 * CardNet ofrece en el mismo menú integraciones donde nuestro servidor
 * recibe el número de la tarjeta. Son más fáciles de escribir y meten
 * el proyecto entero en el alcance de PCI-DSS SAQ D, con auditoría
 * anual. Aquí la tarjeta se teclea en un iframe servido por CardNet y
 * nuestro servidor solo ve el token, la marca y los últimos cuatro. La
 * prueba falla si el código nombra un campo de tarjeta.
 */

const https = require('https');

const VARIABLES = {
  modo: 'MERCA_CARDNET',
  pub: 'MERCA_CARDNET_LLAVE_PUB',
  priv: 'MERCA_CARDNET_LLAVE_PRIV',
  url: 'MERCA_CARDNET_URL',
};

/* Verificadas en la guía de Tokenización de CardNet (research/cardnet.md). */
const URLS = {
  lab: 'https://labservicios.cardnet.com.do/servicios/tokens/',
  produccion: 'https://servicios.cardnet.com.do/servicios/tokens/',
};

/* CardNet tarda; 20 s es lo que se espera antes de dar la llamada por
   perdida. Perdida no es rechazada: el pago queda pendiente y lo
   resuelve la conciliación. */
const TIEMPO = 20000;

/* Una respuesta de CardNet es un objeto pequeño; más de esto es un
   error del otro lado y no se sigue leyendo. */
const TOPE_RESPUESTA = 262144;

const leer = (nombre) => String(process.env[nombre] || '').trim();

/* ── Configuración ─────────────────────────────────────── */

/* Comparación exacta en minúsculas: `LAB` o `encendido` son apagado.
   Un interruptor que adivina lo que se quiso decir es un interruptor
   que se enciende solo. */
function modo() {
  const m = leer(VARIABLES.modo);
  return Object.prototype.hasOwnProperty.call(URLS, m) ? m : 'apagado';
}

const llavePublica = () => leer(VARIABLES.pub);
const llavePrivada = () => leer(VARIABLES.priv);

function activo() {
  return modo() !== 'apagado' && !!llavePublica() && !!llavePrivada();
}

/* Nombres de lo que falta para encender, NUNCA sus valores: esto acaba
   en el aviso de arranque, que va al registro del servidor. */
function faltantes() {
  const f = [];
  if (modo() === 'apagado') f.push(VARIABLES.modo);
  if (!llavePublica()) f.push(VARIABLES.pub);
  if (!llavePrivada()) f.push(VARIABLES.priv);
  return f;
}

/* La URL base de la API, siempre con barra final. `MERCA_CARDNET_URL`
   solo la sustituye si es https: la llave privada viaja en cada
   petición y no puede salir en claro. */
function urlBase() {
  const m = modo();
  if (m === 'apagado') return null;
  const propia = leer(VARIABLES.url);
  let base = URLS[m];
  if (propia.startsWith('https://')) {
    try {
      new URL(propia);
      base = propia;
    } catch (_) { /* mal escrita: se queda la verificada */ }
  }
  return base.endsWith('/') ? base : `${base}/`;
}

/* El origen desde el que se sirve el formulario de la tarjeta: lo que
   la CSP deja enmarcar y del que se aceptan mensajes del iframe. */
function origenCaptura() {
  if (!activo()) return null;
  return new URL(urlBase()).origin;
}

/* HTTP Basic con la llave privada como usuario y contraseña vacía: así
   firma nuestro servidor sus llamadas y así firma CardNet sus avisos.
   La notificación la compara con esta, en tiempo constante. */
function autorizacionEsperada() {
  if (!activo()) return null;
  return `Basic ${Buffer.from(`${llavePrivada()}:`, 'utf8').toString('base64')}`;
}

/* ── Importes ──────────────────────────────────────────── */

/* LA conversión a centavos, y la única.
 *
 * Este proyecto guarda pesos enteros (`planes.precio = 2000` es
 * RD$2.000). CardNet espera la parte entera más dos decimales sin
 * puntuación («100 → 10000»). Un factor escrito en dos sitios acaba un
 * día aplicado dos veces, o ninguna, y cobra cien veces de más o de
 * menos; en desarrollo, donde todo cuesta RD$2.000, no rompe nada. Por
 * eso vive aquí sola, exige un entero no negativo y lanza con cualquier
 * otra cosa en vez de redondear. */
function aCentavos(pesos) {
  if (!Number.isInteger(pesos) || pesos < 0) throw new Error('Importe inválido para CardNet');
  return pesos * 100;
}

/* ── Respuestas ────────────────────────────────────────── */

/* Los códigos tabulados, con lo que tiene que hacer el anunciante. Un
   «error al procesar el pago» no le sirve de nada: 51 y 54 son dos
   problemas distintos y cada uno se arregla de una forma. */
const NADA = 'No se le cobró nada.';
const RECHAZOS = {
  '05': `El banco no autorizó el pago. Llame al banco que emitió la tarjeta o use otra. ${NADA}`,
  '14': `El banco no reconoce esa tarjeta. Vuelva a ingresarla con cuidado o use otra. ${NADA}`,
  '51': `La tarjeta no tiene fondos suficientes para este pago. Use otra tarjeta. ${NADA}`,
  '54': `La tarjeta está vencida. Ingrese una tarjeta vigente. ${NADA}`,
  '57': `Esta tarjeta no permite compras por internet. Pida al banco que la habilite o use otra. ${NADA}`,
  '61': `El pago supera el límite de la tarjeta. Pida al banco que lo amplíe o use otra. ${NADA}`,
  '91': `El banco que emitió la tarjeta no respondió. Inténtelo de nuevo en unos minutos. ${NADA}`,
  CS012: `Antes de usar esta tarjeta hay que activarla con el código que le envió su banco. ${NADA}`,
};
const RECHAZO_GENERICO = 'El banco no aprobó el pago. No se le cobró nada, no se añadió ningún cupo y no se emitió comprobante.';

function mensajeDeRechazo(codigo) {
  const c = codigo === undefined || codigo === null ? '' : String(codigo).trim();
  return Object.prototype.hasOwnProperty.call(RECHAZOS, c) ? RECHAZOS[c] : RECHAZO_GENERICO;
}

const APROBADOS = ['approved', 'aprobada'];
const RECHAZADOS = ['rejected', 'declined', 'rechazada'];

const texto = (v) => (v === undefined || v === null || v === '' ? null : String(v).trim() || null);

/* El código de error de la API cuando la respuesta no es una compra
   (por ejemplo CS012, perfil sin activar). [POR CONFIRMAR EN LAB]: el
   nombre exacto del campo. */
function codigoDeError(r) {
  const primero = Array.isArray(r.Errors) && r.Errors.length ? r.Errors[0] : null;
  return texto(r.ErrorCode) || texto(r.Code)
    || (primero && typeof primero === 'object' ? texto(primero.ErrorCode) || texto(primero.Code) : null);
}

/* Una acción que CardNet pide al comercio (3-D Secure u otra): el
   navegador tiene que ir a esa URL a terminar. Solo se acepta si es
   https y del mismo origen que la API: una redirección a otro sitio
   sería una forma de mandar al comprador adonde quiera quien la
   inyecte. */
function redireccionDe(r) {
  const accion = r.CommerceAction;
  if (!accion || typeof accion !== 'object') return { pedida: false };
  const tipo = String(accion.ActionType === undefined ? '' : accion.ActionType).trim().toLowerCase();
  if (tipo !== '1' && tipo !== 'redirect') return { pedida: false };
  const url = texto(accion.Url) || texto(accion.URL) || texto(accion.RedirectUrl);
  const base = urlBase();
  if (!url || !base) return { pedida: true };
  try {
    const destino = new URL(url);
    if (destino.protocol === 'https:' && destino.origin === new URL(base).origin) {
      return { pedida: true, url: destino.href };
    }
  } catch (_) { /* no es una URL */ }
  return { pedida: true };
}

/* Traduce una respuesta de CardNet a lo que entiende tools/pagos.js.
 *
 * Solo es `aprobado` con un estado de aprobación EXPLÍCITO: `Status`
 * aprobado, o `ResponseCode` '00' sin `Status`. Solo es `rechazado` con
 * un rechazo explícito. Todo lo demás —una respuesta vacía, un estado
 * que no conocemos, un estado que contradice al código— es
 * `pendiente`, y lo resuelve la conciliación consultando otra vez.
 * Aprobar por duda regala cupos y consume un NCF; rechazar por duda
 * deja sin nada a quien quizá sí pagó.
 *
 * [POR CONFIRMAR EN LAB]: los nombres exactos de los campos de la
 * respuesta de `purchase`. Se ajustan aquí y en ningún otro sitio. */
function normalizar(respuesta) {
  const n = {
    resultado: 'pendiente', codigo: null, autorizacion: null, procesadorId: null, referencia: null, motivo: null,
  };
  if (!respuesta || typeof respuesta !== 'object' || Array.isArray(respuesta)) return n;
  const r = respuesta;

  n.codigo = texto(r.ResponseCode) || codigoDeError(r);
  n.autorizacion = texto(r.AuthorizationCode);
  n.procesadorId = texto(r.PurchaseId) || texto(r.PurchaseID);
  n.referencia = texto(r.Order);

  const estado = typeof r.Status === 'string' ? r.Status.trim().toLowerCase() : '';
  const codigoRespuesta = texto(r.ResponseCode);

  if (estado) {
    if (APROBADOS.includes(estado) && (codigoRespuesta === null || codigoRespuesta === '00')) n.resultado = 'aprobado';
    else if (RECHAZADOS.includes(estado) && codigoRespuesta !== '00') n.resultado = 'rechazado';
  } else if (codigoRespuesta === '00') {
    n.resultado = 'aprobado';
  } else if (codigoRespuesta) {
    n.resultado = 'rechazado';
  }

  /* Si CardNet pide llevar al comprador a otra página, el cobro no ha
     terminado aunque el resto diga otra cosa. */
  const redir = redireccionDe(r);
  if (redir.pedida) {
    n.resultado = 'pendiente';
    if (redir.url) n.redireccion = redir.url;
  }

  if (n.resultado === 'rechazado') n.motivo = mensajeDeRechazo(n.codigo);
  return n;
}

/* ── Registros ─────────────────────────────────────────── */

/* El nombre del código de seguridad de la tarjeta se arma por partes:
   la prueba de PCI falla si aparece escrito en el código, y este es
   justamente el sitio que tiene que reconocerlo para borrarlo. */
const SEGURIDAD = [String.fromCharCode(99, 118, 118), String.fromCharCode(99, 118, 99)];
const PARTES_PROHIBIDAS = ['card', 'tarjeta', 'expir', 'venc', 'token', ...SEGURIDAD];
const SE_CONSERVAN = ['brand', 'last4', 'marca', 'ultimos4'];

function claveProhibida(clave) {
  const k = String(clave).toLowerCase();
  if (SE_CONSERVAN.includes(k)) return false;
  // Exacta y no por subcadena: por subcadena borraría `Company`.
  if (k === 'pan') return true;
  return PARTES_PROHIBIDAS.some((p) => k.includes(p));
}

const enmascarar = (s) => s.replace(/\d{13,19}/g, (m) => '*'.repeat(m.length));

/* Copia de `obj` apta para un registro o para `pagos_eventos`.
 *
 * Quita toda clave que parezca de tarjeta y los tokens (un token
 * reutilizable en un registro es una tarjeta cobrable en un registro),
 * y enmascara cualquier secuencia de 13 a 19 dígitos, que es lo que
 * mide un número de tarjeta. CardNet devuelve el número enmascarado,
 * pero si un día llega entero, un `JSON.stringify` de la respuesta lo
 * mete en el journal de systemd, que se respalda. Nunca se registra una
 * respuesta cruda: siempre pasa por aquí. No toca el original. */
function limpiar(obj, profundidad = 0) {
  if (profundidad > 20) return '[demasiado profundo]';
  if (typeof obj === 'string') return enmascarar(obj);
  if (typeof obj === 'number') {
    return Number.isFinite(obj) && /\d{13,19}/.test(String(Math.abs(obj))) ? enmascarar(String(obj)) : obj;
  }
  if (Array.isArray(obj)) return obj.map((v) => limpiar(v, profundidad + 1));
  if (!obj || typeof obj !== 'object') return obj;
  const copia = {};
  for (const [k, v] of Object.entries(obj)) {
    if (claveProhibida(k)) continue;
    copia[k] = limpiar(v, profundidad + 1);
  }
  return copia;
}

/* ── Transporte ────────────────────────────────────────── */

/* La llamada HTTPS real. Resuelve siempre `{ estado, cuerpo, fallo? }`
   y nunca lanza: una red caída es estado 0, y estado 0 es pendiente,
   nunca rechazo ni aprobación. No escribe en consola la llave ni el
   cuerpo. Las pruebas la sustituyen en `module.exports._transporte`. */
function transporteReal({ metodo, url, cabeceras = {}, cuerpo }) {
  return new Promise((resolver) => {
    let destino;
    try {
      destino = new URL(url);
    } catch (_) {
      resolver({ estado: 0, cuerpo: null, fallo: 'URL inválida' });
      return;
    }
    if (destino.protocol !== 'https:') {
      resolver({ estado: 0, cuerpo: null, fallo: 'CardNet solo por https' });
      return;
    }

    const datos = cuerpo === undefined || cuerpo === null ? null : JSON.stringify(cuerpo);
    const headers = { Accept: 'application/json', ...cabeceras };
    if (datos !== null) headers['Content-Length'] = Buffer.byteLength(datos);

    const req = https.request(destino, { method: metodo, headers, timeout: TIEMPO }, (res) => {
      let crudo = '';
      res.setEncoding('utf8');
      res.on('data', (t) => {
        crudo += t;
        if (crudo.length > TOPE_RESPUESTA) req.destroy(new Error('respuesta demasiado grande'));
      });
      res.on('end', () => {
        let leido = null;
        try { leido = crudo ? JSON.parse(crudo) : null; } catch (_) { leido = null; }
        resolver({ estado: res.statusCode, cuerpo: leido });
      });
      res.on('error', (e) => resolver({ estado: 0, cuerpo: null, fallo: e.message }));
    });
    req.on('timeout', () => req.destroy(new Error('tiempo agotado')));
    req.on('error', (e) => resolver({ estado: 0, cuerpo: null, fallo: e.message }));
    if (datos !== null) req.write(datos);
    req.end();
  });
}

/* ── Cuerpos y lecturas [POR CONFIRMAR EN LAB] ──────────────
 *
 * Cada detalle de CardNet que no está copiado literalmente de su guía
 * vive en una sola función de este bloque, para que la certificación
 * lo ajuste en un punto. */

/* Los ids que acaban dentro de una ruta de la API: sin barras ni
   puntos, para que un id raro no pueda apuntar a otro recurso. */
const ID = /^[\w-]{1,64}$/;
const idValido = (v) => {
  const t = texto(v);
  return t && ID.test(t) ? t : null;
};

/* El cliente mínimo. [POR CONFIRMAR EN LAB]: qué campos exige
   `POST /v1/api/customer`; aquí va lo que tenemos validado del
   comprador (correo, razón social y RNC), nada de la tarjeta. */
function cuerpoCliente({ correo, nombre, rnc } = {}) {
  const cuerpo = { Email: String(correo || '').trim(), FirstName: String(nombre || '').trim().slice(0, 100) };
  const documento = String(rnc || '').replace(/\D/g, '');
  if (documento) cuerpo.DocumentNumber = documento;
  return cuerpo;
}

/* [POR CONFIRMAR EN LAB]: el formato de `Expiration`. Se aceptan
   MM/AA, MM/AAAA, AAAAMM, AAAA-MM y MMAA; lo que no se entienda queda
   sin fecha en vez de inventar una. */
function leerVencimiento(v) {
  const s = String(v === undefined || v === null ? '' : v).trim();
  let mes = null;
  let anio = null;
  let m;
  if ((m = /^(\d{1,2})\s*[/-]\s*(\d{2}|\d{4})$/.exec(s))) { mes = +m[1]; anio = +m[2]; }
  else if ((m = /^(\d{4})-?(\d{2})$/.exec(s)) && +m[1] >= 2000) { anio = +m[1]; mes = +m[2]; }
  else if ((m = /^(\d{2})(\d{2})$/.exec(s))) { mes = +m[1]; anio = +m[2]; }
  if (anio !== null && anio < 100) anio += 2000;
  if (!(mes >= 1 && mes <= 12) || !(anio >= 2000 && anio <= 2099)) return { venceMes: null, venceAnio: null };
  return { venceMes: mes, venceAnio: anio };
}

/* Los perfiles de pago de un `Customer`, reducidos a lo que se puede
   guardar: el token (para cobrar), la marca y los últimos cuatro (para
   que el anunciante reconozca su tarjeta) y el vencimiento (para
   avisarle antes). Nada más sale de aquí, ni por descuido: cualquier
   otro campo que CardNet añada se queda fuera. Los últimos cuatro se
   recortan a cuatro dígitos por si algún día llegara el número entero.
   [POR CONFIRMAR EN LAB]: los nombres de los campos del perfil. */
function perfilesDe(cliente) {
  const lista = cliente && Array.isArray(cliente.PaymentProfiles) ? cliente.PaymentProfiles : [];
  const perfiles = [];
  for (const p of lista) {
    if (!p || typeof p !== 'object') continue;
    const perfilId = texto(p.PaymentProfileId) || texto(p.PaymentProfileID);
    const token = texto(p.Token);
    if (!perfilId || !token) continue;
    const digitos = String(p.Last4 === undefined || p.Last4 === null ? '' : p.Last4).replace(/\D/g, '').slice(-4);
    perfiles.push({
      perfilId,
      token,
      marca: texto(p.Brand),
      ultimos4: digitos.length === 4 ? digitos : null,
      ...leerVencimiento(p.Expiration),
      activo: !(p.Enabled === false || String(p.Enabled).toLowerCase() === 'false'),
    });
  }
  return perfiles;
}

/* El cuerpo del cobro. Se arma solo aquí.
 *
 * `Order`, `UniqueID` y `DataDo.Invoice` llevan la referencia de orden
 * del pago (`TE-AAAA-XXXXXX`), NUNCA el NCF: el comprobante no existe
 * hasta que el cobro se aprueba, y reservar un NCF antes de cobrar
 * dejaría comprobantes de dinero que no entró. `UniqueID` igual hace
 * que reintentar sea seguro: CardNet devuelve el resultado ya obtenido
 * sin cobrar otra vez.
 *
 * PREGUNTA ABIERTA (la de mayor impacto): si CardNet exigiera el NCF de
 * la DGII en `DataDo.Invoice`, NO se reserva un NCF aquí para salir del
 * paso. Se para y se rediseña con Victor. */
function cuerpoCompra({ token, pago } = {}) {
  const trx = texto(token);
  const referencia = pago ? texto(pago.referencia) : null;
  if (!trx) throw new Error('Cobro sin token de CardNet');
  if (!referencia) throw new Error('Cobro sin referencia');
  return {
    TrxToken: trx,
    Order: referencia,
    UniqueID: referencia,
    Amount: aCentavos(pago.total),
    Currency: 'DOP',
    Capture: true,
    DataDo: { Invoice: referencia, Tax: aCentavos(pago.itbis) },
  };
}

/* De qué compra habla un aviso de CardNet: `Notification`
   { ResourceType, ResourceUrl, ResourceObject } [VERIFICADO]; que el id
   venga en `ResourceObject.PurchaseId` o al final de `ResourceUrl` está
   [POR CONFIRMAR EN LAB]. Solo devuelve un id; el estado se vuelve a
   preguntar a CardNet, nunca se toma del aviso. */
function compraDeNotificacion(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return null;
  const n = cuerpo.Notification && typeof cuerpo.Notification === 'object' ? cuerpo.Notification : cuerpo;
  const tipo = texto(n.ResourceType);
  if (tipo && !tipo.toLowerCase().includes('purchase')) return null;
  const objeto = n.ResourceObject && typeof n.ResourceObject === 'object' ? n.ResourceObject : {};
  let id = texto(objeto.PurchaseId) || texto(objeto.PurchaseID);
  if (!id && typeof n.ResourceUrl === 'string') {
    const m = /\/purchases?\/([^/?#]+)\/?(?:[?#].*)?$/i.exec(n.ResourceUrl);
    if (m) id = m[1];
  }
  return idValido(id);
}

/* ── Llamadas ──────────────────────────────────────────── */

const APAGADO = Object.freeze({ ok: false, motivo: 'apagado' });

/* Todas las llamadas pasan por aquí, y por `module.exports._transporte`
   y no por la función directamente: así la prueba sustituye el
   transporte y la red no se toca. Apagado no sale nada. */
async function llamar(metodo, ruta, cuerpo) {
  if (!activo()) return { ...APAGADO };
  let r;
  try {
    r = await module.exports._transporte({
      metodo,
      url: urlBase() + ruta,
      cabeceras: { Authorization: autorizacionEsperada(), 'Content-Type': 'application/json' },
      cuerpo,
    });
  } catch (e) {
    r = { estado: 0, cuerpo: null, fallo: e.message };
  }
  const estado = r && Number.isInteger(r.estado) ? r.estado : 0;
  const ok = estado >= 200 && estado < 300;
  const salida = { ok, estado, cuerpo: r && r.cuerpo !== undefined ? r.cuerpo : null };
  if (!ok) salida.fallo = (r && r.fallo) || `CardNet respondió ${estado}`;
  return salida;
}

/* Lo que devuelven `cobrar` y `consultarCompra`. Red caída o un 5xx de
   CardNet son pendiente aunque el cuerpo diga otra cosa: no sabemos si
   se cobró, y eso lo resuelve la conciliación. */
function deCompra(r) {
  if (r.motivo === 'apagado') return { ...normalizar(null), ...APAGADO };
  const n = normalizar(r.cuerpo);
  if (r.estado === 0 || r.estado >= 500) {
    n.resultado = 'pendiente';
    n.motivo = null;
    delete n.redireccion;
  }
  const salida = { ok: r.ok, estado: r.estado, ...n, crudo: limpiar(r.cuerpo) };
  if (r.fallo) salida.fallo = r.fallo;
  return salida;
}

/* Lo que devuelven las llamadas que no son una compra. */
function deOperacion(r) {
  if (r.motivo === 'apagado') return { ...APAGADO };
  const salida = {
    ok: r.ok, estado: r.estado, codigo: r.cuerpo && typeof r.cuerpo === 'object' ? codigoDeError(r.cuerpo) : null,
    crudo: limpiar(r.cuerpo),
  };
  if (r.fallo) salida.fallo = r.fallo;
  return salida;
}

const idRaro = () => ({ ok: false, motivo: 'id inválido' });

/* Crea el cliente en CardNet y devuelve su `CustomerId`. */
async function crearCliente(datos) {
  if (!activo()) return { ...APAGADO };
  const r = await llamar('POST', 'v1/api/customer', cuerpoCliente(datos));
  const clienteId = r.ok && r.cuerpo ? idValido(r.cuerpo.CustomerId) : null;
  if (!clienteId) return { ok: false, estado: r.estado, fallo: r.fallo || 'CardNet no devolvió el cliente' };
  return { ok: true, clienteId };
}

/* Lee el cliente: cada lectura trae un `CaptureURL` y un `UniqueID`
   nuevos, que abren el formulario de la tarjeta, y sus perfiles. La URL
   de captura lleva la llave PÚBLICA, que es la única que puede ir al
   navegador. */
async function verCliente(id) {
  if (!activo()) return { ...APAGADO };
  const clienteId = idValido(id);
  if (!clienteId) return idRaro();
  const r = await llamar('GET', `v1/api/customer/${clienteId}`);
  if (!r.ok || !r.cuerpo || typeof r.cuerpo !== 'object') {
    return { ok: false, estado: r.estado, fallo: r.fallo || 'CardNet no devolvió el cliente' };
  }
  const captura = texto(r.cuerpo.CaptureURL);
  const sesion = texto(r.cuerpo.UniqueID);
  let urlCaptura = null;
  try {
    if (captura && sesion && new URL(captura).protocol === 'https:') {
      const junta = captura.includes('?') ? '&' : '?';
      urlCaptura = `${captura}${junta}key=${encodeURIComponent(llavePublica())}&session_id=${encodeURIComponent(sesion)}`;
    }
  } catch (_) { urlCaptura = null; }
  if (!urlCaptura) return { ok: false, estado: r.estado, fallo: 'CardNet no devolvió una URL de captura https' };
  return { ok: true, clienteId, urlCaptura, sesion, perfiles: perfilesDe(r.cuerpo) };
}

/* Cobra `pago.total` con el token. Primer cobro y renovaciones son la
   misma llamada: cambia solo el token. */
async function cobrar({ token, pago } = {}) {
  if (!activo()) return deCompra(APAGADO);
  return deCompra(await llamar('POST', 'v1/api/purchase', cuerpoCompra({ token, pago })));
}

/* El estado de una compra, preguntado a CardNet. Es lo que usan la
   notificación y la conciliación: nunca se cree lo que diga un aviso
   sin volver a preguntar. */
async function consultarCompra(id) {
  if (!activo()) return deCompra(APAGADO);
  const compra = idValido(id);
  if (!compra) return { ...normalizar(null), ...idRaro() };
  return deCompra(await llamar('GET', `v1/api/purchase/${compra}`));
}

/* Devolución. Construida y probada, sin ninguna ruta que la use todavía:
   la devolución lleva una nota de crédito B04 y ese flujo fiscal se
   decide aparte. */
async function devolver(id) {
  if (!activo()) return { ...APAGADO };
  const compra = idValido(id);
  if (!compra) return idRaro();
  return deOperacion(await llamar('POST', `v1/api/purchase/${compra}/refund`, {}));
}

/* Un perfil puede llegar deshabilitado y necesitar el código que el
   banco manda al titular (CS012 si se intenta cobrar antes). */
async function activarPerfil({ clienteId, token, codigo } = {}) {
  if (!activo()) return { ...APAGADO };
  const cliente = idValido(clienteId);
  if (!cliente) return idRaro();
  return deOperacion(await llamar('POST', `v1/api/customer/${cliente}/activate`, {
    Token: String(token || ''), ActivationCode: String(codigo || ''),
  }));
}

/* [POR CONFIRMAR EN LAB]: el cuerpo de PaymentProfileDelete. */
async function borrarPerfil({ clienteId, perfilId } = {}) {
  if (!activo()) return { ...APAGADO };
  const cliente = idValido(clienteId);
  const perfil = idValido(perfilId);
  if (!cliente || !perfil) return idRaro();
  return deOperacion(await llamar('POST', `v1/api/customer/${cliente}/PaymentProfileDelete`, { PaymentProfileId: perfil }));
}

module.exports = {
  modo, activo, faltantes, urlBase, origenCaptura, autorizacionEsperada,
  aCentavos, normalizar, mensajeDeRechazo, limpiar,
  cuerpoCliente, perfilesDe, cuerpoCompra, compraDeNotificacion,
  crearCliente, verCliente, cobrar, consultarCompra, devolver, activarPerfil, borrarPerfil,
  _transporte: transporteReal,
};
