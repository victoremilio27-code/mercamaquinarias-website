/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Pago con tarjeta (modal de captura y selector)
   Se carga inmediatamente antes de publicar.js, planes.js y panel.js.
   Deja una sola cosa global: `window.CardnetCaptura`.

   POR QUÉ LA TARJETA SE TECLEA EN UN IFRAME DE CARDNET Y NO EN UN
   FORMULARIO NUESTRO
   Si un número de tarjeta pasa por nuestra página o por nuestro
   servidor, el sitio entero entra en el alcance de la auditoría PCI-DSS
   más pesada. Aquí no existe ningún campo de tarjeta: el servidor nos da
   la dirección del formulario seguro de CardNet (`urlCaptura`) y este
   archivo solo la enseña dentro de un iframe. Lo que se escribe allí no
   lo puede leer nuestro JavaScript (otro origen) ni llega a nuestro
   servidor. La barrera de tools/probar-cardnet.js recorre `assets/` y
   los .html buscando nombres de campos de tarjeta: este archivo pasa por
   ella como todos.

   POR QUÉ NO SE CARGA EL SCRIPT DE CARDNET EN NUESTRA PÁGINA
   La política de contenido del sitio es `script-src 'self'` (D-10): un
   script ajeno cargado desde aquí correría con nuestros permisos. El
   iframe lo aísla.

   LA SEÑAL DE «TERMINÉ» ES SOLO UN AVISO
   El mensaje del iframe (o el botón «Ya ingresé mi tarjeta») únicamente
   dispara la confirmación. Quien decide si hubo tarjeta y si se cobró es
   el SERVIDOR, leyendo el Customer en CardNet. Un mensaje falso, aunque
   viniera del origen exacto, no puede aprobar nada.

   POR QUÉ LLEVA SU PROPIO fetch Y NO api()
   `api()` (sesion.js) lanza en cualquier respuesta que no sea 2xx y
   DESCARTA el cuerpo salvo `error`. Aquí el cuerpo de un 402, un 202 o
   un 409 trae lo que hay que enseñar (`pago`, `redireccion`,
   `activacion`), así que se necesita el estado y el JSON completos
   (R-08).
   ═══════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const TEXTO_CANCELADO = 'No se le cobró nada. Puede intentarlo de nuevo cuando quiera.';
  const TEXTO_SIN_CONFIRMAR = 'No pudimos confirmar el pago. Si se le cobró, se confirmará solo en unos minutos; no lo pague otra vez.';
  const TEXTO_REDIRECCION = 'Su banco necesita confirmar el pago; le llevamos a su página.';

  const esc = (s) => (typeof window.esc === 'function'
    ? window.esc(s)
    : String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c])));

  /* Lo que hay abierto ahora: como mucho un diálogo a la vez. */
  let ACTIVO = null;
  let contador = 0;

  /* fetch que NUNCA lanza y devuelve el estado y el JSON completos. Sin
     red, `estado` es 0. */
  async function pedir(ruta, cuerpo) {
    let respuesta;
    try {
      respuesta = await fetch('/api' + ruta, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cuerpo || {}),
      });
    } catch (_) {
      return { estado: 0, datos: null };
    }
    let datos = null;
    try { datos = await respuesta.json(); } catch (_) { datos = null; }
    return { estado: respuesta.status, datos };
  }

  const llamar = (fn, ...args) => { if (typeof fn === 'function') fn(...args); };

  /* ── El diálogo ──────────────────────────────────────────── */

  function enfocables(caja) {
    return Array.from(caja.querySelectorAll('button:not([disabled]), input:not([disabled]), iframe, select:not([disabled])'));
  }

  function alTeclear(evento) {
    if (!ACTIVO) return;
    if (evento.key === 'Escape') {
      if (ACTIVO.confirmando) return;
      evento.preventDefault();
      cancelar();
      return;
    }
    if (evento.key !== 'Tab') return;
    // El foco se queda dentro del diálogo mientras está abierto.
    const lista = enfocables(ACTIVO.caja);
    if (!lista.length) return;
    const primero = lista[0];
    const ultimo = lista[lista.length - 1];
    const dentro = ACTIVO.caja.contains(document.activeElement);
    if (evento.shiftKey && (document.activeElement === primero || !dentro)) {
      evento.preventDefault(); ultimo.focus();
    } else if (!evento.shiftKey && (document.activeElement === ultimo || !dentro)) {
      evento.preventDefault(); primero.focus();
    }
  }

  /* Crea el diálogo vacío con su título, su texto y su hueco de
     contenido. Devuelve el estado activo. */
  function montarDialogo(manejadores, contexto) {
    cerrar();
    contador += 1;
    const idTitulo = 'capturaTitulo' + contador;
    const caja = document.createElement('div');
    caja.className = 'captura';
    caja.setAttribute('role', 'dialog');
    caja.setAttribute('aria-modal', 'true');
    caja.setAttribute('aria-labelledby', idTitulo);
    caja.innerHTML = `
      <div class="captura__panel">
        <h2 class="captura__titulo" id="${idTitulo}">Pague con su tarjeta</h2>
        <p class="captura__nota">Sus datos se escriben en el formulario seguro de CardNet; MercaMaquinarias no los ve ni los guarda.</p>
        <div class="captura__cuerpo" data-captura-cuerpo></div>
        <p class="captura__estado" data-captura-estado role="status" aria-live="polite" hidden></p>
        <div class="captura__acciones" data-captura-acciones></div>
      </div>`;
    document.body.appendChild(caja);

    ACTIVO = {
      caja,
      cuerpo: caja.querySelector('[data-captura-cuerpo]'),
      estadoEl: caja.querySelector('[data-captura-estado]'),
      acciones: caja.querySelector('[data-captura-acciones]'),
      manejadores: manejadores || {},
      contexto: contexto || {},
      origen: '',
      confirmando: false,
      oyente: null,
    };
    document.addEventListener('keydown', alTeclear, true);
    return ACTIVO;
  }

  function decir(texto, error) {
    if (!ACTIVO) return;
    ACTIVO.estadoEl.hidden = !texto;
    ACTIVO.estadoEl.textContent = texto || '';
    ACTIVO.estadoEl.classList.toggle('captura__estado--error', !!error);
  }

  function cerrar() {
    document.removeEventListener('keydown', alTeclear, true);
    if (!ACTIVO) return;
    if (ACTIVO.oyente) window.removeEventListener('message', ACTIVO.oyente);
    if (ACTIVO.caja.parentNode) ACTIVO.caja.parentNode.removeChild(ACTIVO.caja);
    ACTIVO = null;
  }

  /* «Cancelar» y Escape. Antes de confirmar no se ha cobrado nada. */
  function cancelar() {
    if (!ACTIVO || ACTIVO.confirmando) return;
    const m = ACTIVO.manejadores;
    cerrar();
    llamar(m.alCancelar || m.alRechazar, TEXTO_CANCELADO);
  }

  /* ── Captura ─────────────────────────────────────────────── */

  /* Abre el formulario seguro de CardNet. `captura` es lo que dio el
     servidor: `{ urlCaptura, origen }`. */
  function abrir({ pago, captura, alAprobar, alRechazar, alEsperar, alCancelar } = {}) {
    if (!pago || !pago.id || !captura || !captura.urlCaptura || !captura.origen) {
      llamar(alRechazar, 'No pudimos abrir el formulario de pago. No se le cobró nada.');
      return;
    }
    const manejadores = { alAprobar, alRechazar, alEsperar, alCancelar };
    const a = montarDialogo(manejadores, { idPago: pago.id });
    a.origen = captura.origen;

    const marco = document.createElement('iframe');
    marco.className = 'captura__marco';
    marco.title = 'Formulario seguro de CardNet';
    // La dirección va por propiedad, nunca dentro de un texto HTML.
    marco.src = captura.urlCaptura;
    a.cuerpo.appendChild(marco);

    const btnListo = document.createElement('button');
    btnListo.type = 'button';
    btnListo.className = 'btn btn--ambar';
    btnListo.textContent = 'Ya ingresé mi tarjeta';
    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'btn btn--linea';
    btnCancelar.textContent = 'Cancelar';
    a.acciones.append(btnListo, btnCancelar);
    a.btnListo = btnListo;
    a.btnCancelar = btnCancelar;

    /* Una sola confirmación por captura (D-19 en el navegador): el
       mensaje del iframe y el botón pueden llegar los dos. */
    const terminar = () => {
      if (!ACTIVO || ACTIVO !== a || a.confirmando) return;
      a.confirmando = true;
      btnListo.disabled = true;
      btnCancelar.disabled = true;
      decir('Confirmando su pago…');
      confirmar(a.contexto.idPago, '', manejadores);
    };

    /* Solo cuenta un mensaje del origen EXACTO que dio el servidor.
       [POR CONFIRMAR EN LAB: la forma del mensaje que manda CardNet al
       terminar; mientras tanto vale cualquiera de ese origen, porque es
       solo una señal y el servidor verifica]. */
    a.oyente = (evento) => {
      if (evento.origin === a.origen) terminar();
    };
    window.addEventListener('message', a.oyente);

    btnListo.addEventListener('click', terminar);
    btnCancelar.addEventListener('click', cancelar);
    marco.focus();
  }

  /* La ÚNICA llamada del navegador a /api/pagos/:id/confirmar. */
  async function confirmar(idPago, metodoPago, manejadores) {
    const cuerpo = metodoPago ? { metodoPago } : {};
    const r = await pedir('/pagos/' + encodeURIComponent(idPago) + '/confirmar', cuerpo);
    tratar(r, manejadores, { idPago, metodoPago });
  }

  /* Reparte la respuesta de una confirmación (o de una ruta de cobro con
     tarjeta guardada) entre los manejadores de quien llama. */
  function tratar(resp, manejadores, contexto) {
    const m = manejadores || (ACTIVO && ACTIVO.manejadores) || {};
    const estado = (resp && resp.estado) || 0;
    const datos = (resp && resp.datos) || {};
    const ctx = contexto || (ACTIVO && ACTIVO.contexto) || {};

    if (estado === 200 || estado === 201) {
      cerrar();
      llamar(m.alAprobar, datos);
      return;
    }

    if (estado === 402) {
      cerrar();
      llamar(m.alRechazar, datos.error, datos);
      return;
    }

    if (estado === 202) {
      let destino = '';
      try {
        if (datos.redireccion && datos.origen && new URL(datos.redireccion).origin === datos.origen) {
          destino = datos.redireccion;
        }
      } catch (_) { destino = ''; }

      if (destino) {
        // Solo se sale hacia el origen exacto que dio el servidor (T-06-40).
        if (!ACTIVO) montarDialogo(m, ctx);
        if (ACTIVO.cuerpo) ACTIVO.cuerpo.textContent = '';
        if (ACTIVO.acciones) ACTIVO.acciones.textContent = '';
        ACTIVO.confirmando = true;
        decir(TEXTO_REDIRECCION);
        window.location.assign(destino);
        return;
      }
      cerrar();
      llamar(m.alEsperar, datos.aviso, datos);
      return;
    }

    if (estado === 409 && datos.activacion) {
      pedirActivacion(m, {
        idPago: ctx.idPago || (datos.pago && datos.pago.id) || '',
        metodoPago: datos.metodoPago || ctx.metodoPago || '',
      }, datos.error);
      return;
    }

    if (estado === 409) {
      // Otra confirmación de este mismo pago está en curso: no se hace
      // nada visible, el botón sigue deshabilitado.
      return;
    }

    if (ACTIVO) {
      ACTIVO.confirmando = false;
      if (ACTIVO.btnListo) ACTIVO.btnListo.disabled = false;
      if (ACTIVO.btnCancelar) ACTIVO.btnCancelar.disabled = false;
      decir(TEXTO_SIN_CONFIRMAR, true);
    } else {
      llamar(m.alRechazar, TEXTO_SIN_CONFIRMAR);
    }
  }

  /* El banco pide un código antes de guardar la tarjeta: el iframe se
     sustituye por el campo del código. Es el código de activación que
     el banco manda al comprador, no un dato de la tarjeta. */
  function pedirActivacion(manejadores, ctx, motivo) {
    const a = ACTIVO || montarDialogo(manejadores, ctx);
    if (a.oyente) { window.removeEventListener('message', a.oyente); a.oyente = null; }
    a.contexto = ctx;
    a.confirmando = true;
    a.cuerpo.innerHTML = `
      <label class="campo-v">
        <span>Código de activación que le envió su banco</span>
        <input type="text" data-captura-codigo inputmode="numeric" autocomplete="one-time-code" maxlength="12">
      </label>`;
    a.acciones.textContent = '';
    const btnActivar = document.createElement('button');
    btnActivar.type = 'button';
    btnActivar.className = 'btn btn--ambar';
    btnActivar.textContent = 'Activar';
    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'btn btn--linea';
    btnCancelar.textContent = 'Cancelar';
    a.acciones.append(btnActivar, btnCancelar);
    a.btnListo = btnActivar;
    a.btnCancelar = btnCancelar;
    a.confirmando = false;
    decir(motivo || '', !!motivo);

    const campo = a.cuerpo.querySelector('[data-captura-codigo]');
    campo.addEventListener('input', () => { campo.value = campo.value.replace(/\D/g, '').slice(0, 12); });
    campo.focus();

    btnCancelar.addEventListener('click', cancelar);
    btnActivar.addEventListener('click', async () => {
      const codigo = campo.value.trim();
      if (!codigo) { decir('Escriba el código que le envió su banco.', true); campo.focus(); return; }
      if (a.confirmando) return;
      a.confirmando = true;
      btnActivar.disabled = true;
      btnCancelar.disabled = true;
      decir('Activando su tarjeta…');
      const r = await pedir('/metodos-pago/' + encodeURIComponent(ctx.metodoPago) + '/activar', { codigo });
      if (ACTIVO !== a) return;
      if (r.estado === 200) {
        confirmar(ctx.idPago, ctx.metodoPago, manejadores);
        return;
      }
      // Un 400 (código equivocado) o cualquier otro fallo: se queda el
      // campo para intentarlo otra vez, sin cerrar.
      a.confirmando = false;
      btnActivar.disabled = false;
      btnCancelar.disabled = false;
      decir((r.datos && r.datos.error) || 'No pudimos activar la tarjeta. Revise el código e inténtelo otra vez.', true);
      campo.focus();
    });
  }

  /* ── Selector de método de pago (compartido) ─────────────── */

  const textoTarjeta = (t) => {
    const mes = String(t.venceMes == null ? '' : t.venceMes).padStart(2, '0');
    const anio = String(t.venceAnio == null ? '' : t.venceAnio).slice(-2);
    return `${t.marca} terminada en ${t.ultimos4}, vence ${mes}/${anio}`;
  };

  /* El HTML del grupo de método de pago. Sin `cardnet` entre los métodos
     devuelve cadena vacía: la pantalla se queda como estaba. `previo` es
     lo que devolvió `leerMetodo` antes de volver a pintar, para no perder
     lo que ya eligió quien paga. Lo relativo a la tarjeta se oculta con
     CSS cuando el radio de tarjeta no está elegido. */
  function selectorDeMetodo({ metodos, tarjetas, renovacion, prefijo, previo } = {}) {
    if (!Array.isArray(metodos) || !metodos.includes('cardnet')) return '';
    const p = String(prefijo || 'pago');
    const antes = previo || {};
    const conTransferencia = metodos.includes('transferencia');
    const elegido = antes.metodo === 'transferencia' && conTransferencia ? 'transferencia' : 'cardnet';
    const activas = (Array.isArray(tarjetas) ? tarjetas : []).filter((t) => t && t.activo);
    // Por defecto, la primera guardada; si ya eligió «Otra tarjeta» (''),
    // se respeta al volver a pintar.
    const guardada = typeof antes.metodoPago === 'string'
      ? antes.metodoPago
      : ((activas[0] && activas[0].id) || '');

    const opciones = activas.map((t) => `<option value="${esc(t.id)}"${t.id === guardada ? ' selected' : ''}>${esc(textoTarjeta(t))}</option>`).join('');
    const lista = activas.length ? `
      <label class="tarjetas">
        <span>Pagar con</span>
        <select data-tarjeta-guardada>
          ${opciones}
          <option value=""${guardada === '' ? ' selected' : ''}>Otra tarjeta</option>
        </select>
      </label>` : '';

    const casilla = renovacion && renovacion.disponible ? `
      <label class="renovar-auto metodo-pago__renovar">
        <input type="checkbox" data-renovacion-auto${antes.renovacionAutomatica ? ' checked' : ''}>
        <span>${esc(renovacion.texto || 'Renovar automáticamente')}</span>
      </label>` : '';

    return `
      <fieldset class="metodo-pago" data-metodo-pago>
        <legend class="metodo-pago__titulo">Forma de pago</legend>
        <label class="metodo-pago__op">
          <input type="radio" name="${esc(p)}-metodo" value="cardnet"${elegido === 'cardnet' ? ' checked' : ''}>
          <span>Tarjeta de crédito o débito</span>
        </label>
        ${conTransferencia ? `
        <label class="metodo-pago__op">
          <input type="radio" name="${esc(p)}-metodo" value="transferencia"${elegido === 'transferencia' ? ' checked' : ''}>
          <span>Transferencia bancaria</span>
        </label>` : ''}
        <div class="metodo-pago__tarjeta">${lista}${casilla}</div>
      </fieldset>`;
  }

  /* Lo que el selector aporta al cuerpo del pago. Cada clave solo si
     procede: sin selector, `{}` y el cuerpo es el de siempre. */
  function leerMetodo(raiz) {
    const base = raiz || document;
    const grupo = base.querySelector ? base.querySelector('[data-metodo-pago]') : null;
    if (!grupo) return {};
    const radio = grupo.querySelector('input[type="radio"]:checked');
    if (!radio) return {};
    if (radio.value !== 'cardnet') return { metodo: radio.value };
    const salida = { metodo: 'cardnet' };
    const lista = grupo.querySelector('[data-tarjeta-guardada]');
    if (lista && lista.value) salida.metodoPago = lista.value;
    const casilla = grupo.querySelector('[data-renovacion-auto]');
    if (casilla && casilla.checked) salida.renovacionAutomatica = true;
    return salida;
  }

  /* Lo mismo que `leerMetodo` pero completo (incluye «Otra tarjeta» y la
     casilla desmarcada): sirve para volver a pintar el selector sin
     perder lo elegido. No se manda al servidor. */
  function leerEstado(raiz) {
    const base = raiz || document;
    const grupo = base.querySelector ? base.querySelector('[data-metodo-pago]') : null;
    if (!grupo) return {};
    const radio = grupo.querySelector('input[type="radio"]:checked');
    const lista = grupo.querySelector('[data-tarjeta-guardada]');
    const casilla = grupo.querySelector('[data-renovacion-auto]');
    return {
      metodo: radio ? radio.value : '',
      ...(lista ? { metodoPago: lista.value } : {}),
      renovacionAutomatica: !!(casilla && casilla.checked),
    };
  }

  window.CardnetCaptura = {
    pedir, abrir, confirmar, tratar, cerrar, selectorDeMetodo, leerMetodo, leerEstado,
  };
})();
