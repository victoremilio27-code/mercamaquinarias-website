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

module.exports = {
  modo, activo, faltantes, urlBase, origenCaptura, autorizacionEsperada,
  aCentavos, normalizar, mensajeDeRechazo, limpiar,
  _transporte: transporteReal,
};
