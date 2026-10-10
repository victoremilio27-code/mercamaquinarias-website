/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Cliente de la API y estado de sesión
   Se carga antes que app.js en todas las páginas. Deja dos cosas
   globales: `api()` para hablar con el servidor y `SESION` con quién
   ha iniciado sesión.

   Todo el sitio sigue funcionando si la API no responde: `api()`
   devuelve null en vez de reventar, y cada pantalla decide qué
   enseñar cuando no hay datos.
   ═══════════════════════════════════════════════════════════ */

/* Estado de sesión. `cargando` distingue "todavía no sé" de "no hay
   nadie": sin eso, la cabecera parpadea mostrando «Entrar» a alguien
   que sí tiene la sesión abierta. */
let SESION = {
  cargando: true, usuario: null, organizacion: null, suscripcion: null,
  sucursales: [], verificado: false, telefono: null, sms: false,
};

function mensajePorEstado(codigo, reintentarDespues) {
  switch (codigo) {
    case 400:
      return 'Revise los datos del formulario e inténtelo de nuevo.';
    case 401:
      return 'Su sesión terminó. Inicie sesión de nuevo.';
    case 403:
    case 404:
      return 'No encontramos lo que busca o no tiene permiso para verlo.';
    case 409:
      return 'Esto cambió mientras tanto. Recargue la página e inténtelo de nuevo.';
    case 413:
      return 'El archivo o los datos son demasiado grandes.';
    case 429: {
      const segundos = Number(reintentarDespues);
      if (reintentarDespues !== null && reintentarDespues !== '' &&
          Number.isFinite(segundos) && segundos >= 0) {
        const minutos = Math.max(1, Math.ceil(segundos / 60));
        return `Demasiados intentos seguidos. Espere ${minutos} ${minutos === 1 ? 'minuto' : 'minutos'} y vuelva a intentarlo.`;
      }
      return 'Demasiados intentos seguidos. Espere unos minutos y vuelva a intentarlo.';
    }
    case 500:
      return 'Algo falló de nuestro lado. Inténtelo de nuevo en unos minutos.';
    case 502:
    case 503:
    case 504:
      return 'El sitio no responde en este momento. Inténtelo de nuevo en unos minutos.';
    default:
      return 'No se pudo completar la operación';
  }
}

/* Envoltura de fetch contra /api.
   · Lanza un Error con `.codigo` y el mensaje del servidor en 4xx.
   · Devuelve null si el servidor no está: quien llama decide.
   `credentials: same-origin` manda la cookie de sesión. */
async function api(ruta, { metodo = 'GET', cuerpo, silencioso = false } = {}) {
  let respuesta;
  try {
    respuesta = await fetch(`/api${ruta}`, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    });
  } catch (_) {
    return null;              // servidor apagado o sin red
  }

  let datos = null;
  try { datos = await respuesta.json(); } catch (_) { datos = null; }

  if (!respuesta.ok) {
    if (silencioso) return null;
    const mensaje = datos && datos.error
      ? datos.error
      : mensajePorEstado(respuesta.status, respuesta.headers.get('Retry-After'));
    const err = new Error(mensaje);
    err.codigo = respuesta.status;
    throw err;
  }
  return datos;
}

async function cargarSesion() {
  const datos = await api('/sesion', { silencioso: true });
  SESION = {
    cargando: false,
    usuario: (datos && datos.usuario) || null,
    organizacion: (datos && datos.organizacion) || null,
    suscripcion: (datos && datos.suscripcion) || null,
    // Las sucursales viajan con la sesión porque el asistente de
    // publicación las necesita para preguntar desde cuál se ofrece
    // el equipo, sin una segunda llamada.
    sucursales: (datos && datos.sucursales) || [],
    verificado: !!(datos && datos.verificado),
    // El estado del celular y si el SMS está encendido lo decide el
    // servidor en cada carga; el navegador solo oculta o enseña las
    // opciones de SMS.
    telefono: (datos && datos.telefono) || null,
    sms: !!(datos && (datos.sms || (datos.telefono && datos.telefono.sms))),
    // Qué condiciones tiene aceptadas y cuáles le faltan para publicar
    // o para pagar. Lo decide el servidor; aquí solo se enseña.
    legales: (datos && datos.legales) || { aceptado: {}, faltan: { publicar: [], pagar: [] } },
  };
  return SESION;
}

/* Qué documentos le faltan por aceptar para hacer algo. */
const faltanLegales = (para) => ((SESION.legales && SESION.legales.faltan) || {})[para] || [];

/* Aviso de condiciones nuevas, para quien ya tenía cuenta.
 *
 * Se enseña SOBRE el contenido, no en su lugar: quien entra a ver sus
 * anuncios sigue viéndolos. Lo que no puede es publicar ni pagar, y eso
 * lo impide el servidor pase lo que pase con esta pantalla.
 *
 * `para` es 'publicar' o 'pagar' según lo que se haga en esta página.
 */
async function montarAvisoLegal(para) {
  if (!haySesion()) return;
  const faltan = faltanLegales(para);
  if (!faltan.length) return;

  const donde = document.querySelector('#contenido .envoltura');
  if (!donde || donde.querySelector('.aviso-legal')) return;

  /* Escape propio y no el de app.js: sesion.js se carga ANTES, y
     depender de un global que todavía no existe es como se rompe algo
     el día que alguien cambie el orden de los <script>. */
  const limpio = (s) => String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const nombres = faltan.map((id) => {
    const d = typeof documento === 'function' ? documento(id) : null;
    const nombre = (d && d.nombre) || id;
    return `<a href="legal.html#${limpio(id)}" target="_blank" rel="noopener">${limpio(nombre)}</a>`;
  });

  const caja = document.createElement('section');
  caja.className = 'aviso-legal';
  caja.setAttribute('role', 'status');
  caja.innerHTML = `
    <p class="aviso-legal__titulo">${faltan.some((id) => !((SESION.legales.aceptado || {})[id])) ? 'Antes de continuar' : 'Hay condiciones nuevas'}</p>
    <p class="aviso-legal__texto">Para ${para === 'pagar' ? 'contratar un plan' : 'publicar un equipo'}
      hace falta aceptar ${nombres.join(' y ')}.</p>
    <div class="aviso-legal__acciones">
      <button type="button" class="btn btn--ambar" id="btnAceptarLegal">Aceptar y continuar</button>
    </div>`;
  donde.prepend(caja);

  caja.querySelector('#btnAceptarLegal').addEventListener('click', async (ev) => {
    const boton = ev.currentTarget;
    boton.disabled = true;
    boton.textContent = 'Guardando…';
    try {
      const nueva = await api('/legales/aceptar', { metodo: 'POST', cuerpo: { documentos: faltan } });
      if (nueva) {
        SESION.legales = nueva.legales || SESION.legales;
        document.dispatchEvent(new CustomEvent('legales-aceptadas'));
        caja.remove();
        return;
      }
      throw new Error('sin respuesta');
    } catch (_) {
      boton.disabled = false;
      boton.textContent = 'Aceptar y continuar';
      caja.querySelector('.aviso-legal__texto').textContent =
        'No se pudo guardar la aceptación. Inténtelo de nuevo.';
    }
  });
}

const haySesion = () => !!(SESION.usuario);
const esDealer = () => !!(SESION.organizacion && SESION.organizacion.tipo === 'dealer');

/* Cuentas internas: publican sin pagar. La exención la concede el
   servidor con tools/admin.js y viaja en la sesión solo para que la
   pantalla no pida una tarjeta que nadie va a cobrar. Quien manda es
   la base de datos: POST /api/anuncios vuelve a comprobarla ahí, así
   que trucar esto en el navegador no regala ninguna publicación. */
const cuentaExenta = () => !!(SESION.organizacion && SESION.organizacion.exentaPago);

/* Enlace de cuenta en la cabecera. Se inyecta por script en vez de
   escribirlo en las doce páginas: así el estado de sesión se pinta en
   un solo sitio y no hay doce copias que se desincronicen. */
function montarEnlaceCuenta() {
  const nav = document.querySelector('.cab__nav');
  if (!nav || nav.querySelector('.cab__cuenta')) return;

  const enlace = document.createElement('a');
  enlace.className = 'cab__cuenta';
  enlace.href = 'cuenta.html';
  enlace.innerHTML = '<svg class="ico" aria-hidden="true"><use href="#i-usuario"/></svg><span>Entrar</span>';
  nav.insertBefore(enlace, nav.querySelector('.cab__nav-cta'));

  cargarSesion().then(() => {
    if (!haySesion()) return;
    const nombre = SESION.organizacion ? SESION.organizacion.nombre : SESION.usuario.nombre;
    enlace.href = 'panel.html';
    enlace.classList.add('cab__cuenta--activa');
    enlace.querySelector('span').textContent = nombre.split(/[\s,]+/)[0];
    enlace.title = `Panel de ${nombre}`;
  });
}

document.addEventListener('DOMContentLoaded', montarEnlaceCuenta);
