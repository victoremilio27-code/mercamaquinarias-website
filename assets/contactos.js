/* contactos.js — el vendedor verifica los teléfonos de sus anuncios.

   Fase 9 (CONF-03): ningún teléfono sin verificar sale en un anuncio.
   Esto es lo que ve quien publica: el estado de cada número y, si falta,
   el código por correo —y por SMS el día que se enciendan— sin salir de
   la página. Lo usan el panel (sección «Teléfonos de contacto») y el
   paso 4 de publicar; va aparte para no escribir dos veces el mismo
   formulario y que un día los dos digan cosas distintas.

   Solo navegador. Depende de sesion.js (api) y app.js (esc, icono, $, $$),
   que se cargan antes.

   El código NO va dentro de un <form>: en publicar.html todo el asistente
   ya es un <form>, un formulario anidado no es HTML válido, y un Enter en
   el campo del código enviaba la publicación entera. Por eso es un grupo
   con botones de tipo «button» y el Enter se intercepta a mano. */

const VerificarContacto = (() => {
  let sms = false;

  const soloDigitos = (n) => {
    let d = String(n == null ? '' : n).replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) d = d.slice(1);
    return d;
  };
  const formato = (n) => {
    const d = soloDigitos(n);
    return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(n || '');
  };

  /* Lee la lista y si el SMS está encendido. `api()` lanza cuando la
     respuesta no es ok: aquí se envuelve para que un fallo deje la
     página usable en vez de romper el panel entero. */
  async function cargar() {
    try {
      const datos = await api('/contactos');
      sms = !!(datos && datos.sms);
      return (datos && datos.contactos) || [];
    } catch (_) {
      return null;
    }
  }

  const textoVia = (via) => (via === 'sms'
    ? 'Verificado por SMS'
    : 'Confirmado desde el correo de su cuenta');

  /* El bloque de un número. `c` es una fila de /api/contactos o, en
     publicar, { numero, verificado, via } armado a partir de ella. */
  function estadoHTML(c) {
    const d = soloDigitos(c.numero);
    if (c.verificado) {
      const subir = sms && c.via !== 'sms'
        ? `<button type="button" class="verif__enlace" data-verificar="sms">Verificar también por SMS</button>`
        : '';
      return `<div class="verif verif--ok" data-numero="${esc(d)}">
        <p class="verif__estado"><span class="pastilla pastilla--verde">${icono('i-check')} Verificado</span>
          <span class="verif__texto">${esc(textoVia(c.via))}. Se muestra en sus anuncios.</span> ${subir}</p>
        ${codigoHTML(d, c.pendiente)}
      </div>`;
    }
    return `<div class="verif" data-numero="${esc(d)}">
      <p class="verif__estado"><span class="pastilla pastilla--ambar">${icono('i-aviso')} Sin verificar</span>
        <span class="verif__texto">No se muestra en ningún anuncio hasta que lo verifique.</span></p>
      <div class="verif__acciones">
        <button type="button" class="btn btn--linea btn--chico" data-verificar="correo">${icono('i-correo')} Verificar por correo</button>
        ${sms ? `<button type="button" class="btn btn--linea btn--chico" data-verificar="sms">${icono('i-telefono')} Verificar por SMS</button>` : ''}
      </div>
      ${codigoHTML(d, c.pendiente)}
    </div>`;
  }

  function codigoHTML(d, pendiente) {
    return `<div class="verif__codigo" role="group" aria-label="Código de verificación del ${esc(formato(d))}"${pendiente ? '' : ' hidden'}>
      <p class="verif__destino">${pendiente ? 'Escriba el código que le enviamos.' : ''}</p>
      <div class="verif__fila">
        <label class="campo-v"><span>Código de 6 dígitos</span>
          <input type="text" class="verif__entrada" inputmode="numeric" autocomplete="one-time-code" maxlength="6">
        </label>
        <button type="button" class="btn btn--ambar btn--chico" data-confirmar>Confirmar</button>
      </div>
    </div>
    <p class="acceso__aviso verif__aviso" role="alert" hidden></p>`;
  }

  function avisar(caja, mensaje, bien) {
    const aviso = $('.verif__aviso', caja);
    if (!aviso) return;
    aviso.textContent = mensaje || '';
    aviso.classList.toggle('acceso__aviso--ok', !!bien);
    aviso.hidden = !mensaje;
  }

  async function pedirCodigo(caja, via, boton) {
    const numero = caja.dataset.numero;
    if (boton) boton.disabled = true;
    avisar(caja, '');
    try {
      const r = await api('/contactos/codigo', { metodo: 'POST', cuerpo: { numero, via } });
      if (r && r.yaVerificado) return true;
      const bloque = $('.verif__codigo', caja);
      $('.verif__destino', caja).textContent = via === 'sms'
        ? `Le enviamos un SMS con el código al ${r.destino}. Vence en ${r.minutos} minutos.`
        : `Le enviamos el código a ${r.destino}. Vence en ${r.minutos} minutos.`;
      bloque.hidden = false;
      $('.verif__entrada', caja).focus();
    } catch (e) {
      avisar(caja, e.message);
    } finally {
      if (boton) boton.disabled = false;
    }
    return false;
  }

  async function confirmar(caja, boton) {
    const entrada = $('.verif__entrada', caja);
    const codigo = String(entrada.value || '').replace(/\D/g, '');
    if (codigo.length !== 6) {
      avisar(caja, 'Escriba los seis dígitos del código.');
      entrada.focus();
      return false;
    }
    if (boton) boton.disabled = true;
    try {
      await api('/contactos/confirmar', { metodo: 'POST', cuerpo: { numero: caja.dataset.numero, codigo } });
      return true;
    } catch (e) {
      avisar(caja, e.message);
      entrada.select();
      return false;
    } finally {
      if (boton) boton.disabled = false;
    }
  }

  /* Delegación sobre el contenedor: los bloques se repintan enteros y
     los escuchadores no pueden ir en cada botón. `alVerificar(numero)`
     avisa a quien lo monta para que repinte con la lista nueva. */
  function montar(contenedor, { alVerificar } = {}) {
    if (!contenedor || contenedor.dataset.verifMontado) return;
    contenedor.dataset.verifMontado = '1';

    contenedor.addEventListener('click', async (ev) => {
      const pedir = ev.target.closest('[data-verificar]');
      const conf = ev.target.closest('[data-confirmar]');
      const caja = ev.target.closest('.verif');
      if (!caja || (!pedir && !conf)) return;
      ev.preventDefault();
      const listo = pedir
        ? await pedirCodigo(caja, pedir.dataset.verificar, pedir)
        : await confirmar(caja, conf);
      if (listo && alVerificar) alVerificar(caja.dataset.numero);
    });

    contenedor.addEventListener('keydown', async (ev) => {
      if (ev.key !== 'Enter' || !ev.target.classList.contains('verif__entrada')) return;
      ev.preventDefault();                  // no enviar el asistente de publicar
      const caja = ev.target.closest('.verif');
      if (caja && await confirmar(caja, null) && alVerificar) alVerificar(caja.dataset.numero);
    });
  }

  return { cargar, estadoHTML, montar, formato, soloDigitos, textoVia, smsActivo: () => sms };
})();
