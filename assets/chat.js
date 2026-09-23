/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Asistente de soporte

   Widget flotante que responde preguntas sobre cómo funciona el
   sitio. Habla con /api/chat; la clave de Anthropic vive en el
   servidor y nunca pasa por aquí.

   SE MONTA SOLO. Este archivo se pinta su propio HTML, así que
   añadirlo a una página es una línea:

     <script src="assets/chat.js" defer></script>

   EL HISTORIAL NO SE GUARDA. Vive en el array `historial` de esta
   pestaña y muere con ella: no hay base de datos, ni cookie, ni
   localStorage. Recargar la página empieza de cero, y eso es lo
   correcto mientras no se le haya pedido permiso a nadie para
   guardar lo que escribe.
   ═══════════════════════════════════════════════════════════ */

(() => {
  'use strict';

  /* ayuda@ y no hola@: cuando el asistente se queda corto, la persona
     que escribe necesita soporte, no el buzón general. Hoy los dos
     acaban en la misma bandeja, pero el día que haya alguien atendiendo
     soporte el correo ya le llega sin tocar nada. */
  const CORREO = 'ayuda@mercamaquinarias.com';

  /* Las preguntas de arranque no son decoración: enseñan de un
     vistazo qué sabe el asistente, que es la forma más barata de
     evitar que la primera pregunta sea una que no puede responder. */
  const SUGERENCIAS = [
    '¿Cómo publico un equipo?',
    '¿Cuánto cuestan los planes?',
    '¿Cómo funciona el alquiler?',
    'Quiero importar una máquina',
  ];

  const BIENVENIDA = 'Buenas. Soy el asistente de MercaMaquinarias. '
    + 'Le puedo explicar cómo publicar un equipo, cómo funcionan los planes '
    + 'y los servicios de alquiler e importación. ¿En qué le ayudo?';

  /* ── Utilidades ─────────────────────────────────────────── */

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* Formato mínimo del texto del asistente.

     PRIMERO se escapa todo, DESPUÉS se aplican los patrones. Al revés
     —convertir y luego escapar— es como se cuela HTML ajeno.

     Solo se enlazan rutas del propio sitio (/algo.html) y correos: si
     el modelo se inventara un enlace externo, aquí se queda en texto
     plano y no en un enlace en el que alguien pueda pinchar. */
  function formatear(txt) {
    let h = esc(txt);
    h = h.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/(^|[\s(])(\/[a-z0-9-]+\.html)(?=[\s).,;:]|$)/gi,
      '$1<a href="$2">$2</a>');
    h = h.replace(/\b([a-z0-9._-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi,
      '<a href="mailto:$1">$1</a>');
    // Viñetas «- » al principio de línea, sin montar un parser de listas.
    h = h.replace(/^[-•]\s+/gm, '· ');
    return h.replace(/\n/g, '<br>');
  }

  /* ── Estructura ─────────────────────────────────────────── */

  const ICONO_CHAT = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M20.5 12.2c0 3.9-3.8 7-8.5 7-1 0-2-.15-2.9-.42L4 20.5l1.3-3.3'
    + 'A6.5 6.5 0 0 1 3.5 12.2c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z"/></svg>';

  const ICONO_CERRAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="m6 6 12 12"/><path d="m18 6-12 12"/></svg>';

  const ICONO_ENVIAR = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">'
    + '<path d="M4 12 20 4l-3.5 16-4.5-6z"/><path d="m12 13.5 8.5-9.5"/></svg>';

  const raiz = document.createElement('div');
  raiz.className = 'chat';
  raiz.innerHTML = `
    <button class="chat__lanzador" id="chatAbrir" type="button"
            aria-expanded="false" aria-controls="chatPanel">
      ${ICONO_CHAT}<span class="chat__lanzador-txt">¿Le ayudo?</span>
    </button>

    <section class="chat__panel" id="chatPanel" role="dialog" aria-modal="false"
             aria-labelledby="chatTitulo" hidden>
      <header class="chat__cab">
        <div>
          <h2 class="chat__titulo" id="chatTitulo">Asistente MercaMaquinarias</h2>
          <p class="chat__sub">Responde sobre el sitio y nuestros servicios</p>
        </div>
        <button class="chat__cerrar" id="chatCerrar" type="button" aria-label="Cerrar el asistente">
          ${ICONO_CERRAR}
        </button>
      </header>

      <div class="chat__log" id="chatLog" role="log" aria-live="polite" aria-atomic="false"></div>

      <form class="chat__pie" id="chatForm">
        <label class="chat__oculto" for="chatEntrada">Su pregunta</label>
        <textarea class="chat__entrada" id="chatEntrada" rows="1" maxlength="1000"
                  placeholder="Escriba su pregunta…" autocomplete="off"></textarea>
        <button class="chat__enviar" type="submit" aria-label="Enviar la pregunta">
          ${ICONO_ENVIAR}
        </button>
      </form>
    </section>`;

  document.body.appendChild(raiz);

  const $ = (id) => document.getElementById(id);
  const lanzador = $('chatAbrir');
  const panel = $('chatPanel');
  const log = $('chatLog');
  const form = $('chatForm');
  const entrada = $('chatEntrada');
  const enviar = form.querySelector('.chat__enviar');

  /* ── Estado ─────────────────────────────────────────────── */

  const historial = [];      // solo en memoria; ver cabecera
  let esperando = false;
  let abierto = false;

  /* ── Pintado ────────────────────────────────────────────── */

  function burbuja(rol, html, clase = '') {
    const div = document.createElement('div');
    div.className = `chat__msg chat__msg--${rol} ${clase}`.trim();
    div.innerHTML = html;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
    return div;
  }

  function sugerencias() {
    const cont = document.createElement('div');
    cont.className = 'chat__sug';
    cont.innerHTML = SUGERENCIAS
      .map((s) => `<button type="button" class="chat__sug-it">${esc(s)}</button>`).join('');
    cont.addEventListener('click', (ev) => {
      const b = ev.target.closest('.chat__sug-it');
      if (!b) return;
      cont.remove();
      preguntar(b.textContent);
    });
    log.appendChild(cont);
  }

  /* ── Conversación ───────────────────────────────────────── */

  async function preguntar(texto) {
    const pregunta = String(texto || '').trim();
    if (!pregunta || esperando) return;

    burbuja('usuario', esc(pregunta));
    historial.push({ rol: 'usuario', texto: pregunta });

    entrada.value = '';
    entrada.style.height = 'auto';
    esperando = true;
    enviar.disabled = true;
    entrada.disabled = true;

    const puntos = burbuja('bot', '<span class="chat__puntos"><i></i><i></i><i></i></span>',
      'chat__msg--cargando');

    try {
      const r = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mensajes: historial }),
      });
      const datos = await r.json().catch(() => ({}));
      puntos.remove();

      if (!r.ok) {
        /* El servidor ya manda un texto pensado para leerse, con los
           contactos dentro. Si ni eso llega —red caída— se pone uno
           aquí, porque dejar a la persona con un error en blanco es
           peor que cualquier otra cosa. */
        burbuja('bot', formatear(datos.error
          || `No pude conectar. Escríbanos a ${CORREO} y le respondemos por ahí.`), 'chat__msg--aviso');
      } else {
        burbuja('bot', formatear(datos.respuesta));
        historial.push({ rol: 'asistente', texto: datos.respuesta });
      }
    } catch {
      puntos.remove();
      burbuja('bot', formatear(`No pude conectar. Revise su conexión, o escríbanos a ${CORREO}.`), 'chat__msg--aviso');
    } finally {
      esperando = false;
      enviar.disabled = false;
      entrada.disabled = false;
      if (abierto) entrada.focus();
      log.scrollTop = log.scrollHeight;
    }
  }

  /* ── Abrir y cerrar ─────────────────────────────────────── */

  function abrir() {
    abierto = true;
    panel.hidden = false;
    lanzador.setAttribute('aria-expanded', 'true');
    // El panel se monta vacío y se llena la primera vez que se abre:
    // así una visita que nunca lo abre no paga ni un nodo de más.
    if (!log.children.length) {
      burbuja('bot', formatear(BIENVENIDA));
      sugerencias();
    }
    entrada.focus();
  }

  function cerrar() {
    abierto = false;
    panel.hidden = true;
    lanzador.setAttribute('aria-expanded', 'false');
    lanzador.focus();
  }

  lanzador.addEventListener('click', () => (abierto ? cerrar() : abrir()));
  $('chatCerrar').addEventListener('click', cerrar);

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && abierto) cerrar();
  });

  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    preguntar(entrada.value);
  });

  /* Enter envía, Mayús+Enter hace salto de línea. Es lo que espera
     cualquiera que haya usado un chat. */
  entrada.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      preguntar(entrada.value);
    }
  });

  /* El campo crece con el texto hasta un tope, para que se pueda
     releer lo escrito sin que el panel se coma la pantalla. */
  entrada.addEventListener('input', () => {
    entrada.style.height = 'auto';
    entrada.style.height = `${Math.min(entrada.scrollHeight, 120)}px`;
  });
})();
