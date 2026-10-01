/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Entrar, crear cuenta y recuperar la contraseña

   Cinco formularios en la misma pantalla y una sola vista visible a
   la vez. El servidor manda: aquí solo se evita el viaje de ida y
   vuelta cuando el error es evidente y se traduce lo que responde.

   El servidor nunca dice si un correo existe; estas pantallas
   tampoco, ni siquiera cambiando el texto entre un caso y otro.

   10.2: dos vistas más. #formTelefono («Confirme su celular», al
   entrar con el SMS encendido; se puede posponer) y
   #formRecuperacionSms (recuperar la cuenta sin correo, en cuatro
   pasos). La recuperación pide el celular COMPLETO y no enseña nunca
   «•••-1234» del número guardado: esa máscara diría qué correos
   tienen cuenta. Con el SMS apagado nada de esto se enseña y el
   acceso se comporta como antes, salvo el celular obligatorio al
   registrarse. Ningún SMS sale al mostrar una vista: cada uno cuesta
   créditos y solo sale al pulsar un botón.
   ═══════════════════════════════════════════════════════════ */

const VISTAS = ['formEntrar', 'formCrear', 'formCodigo', 'formTelefono', 'formRecuperar',
  'formNuevaClave', 'formRecuperacionSms', 'formRecuperacion', 'formRevertir'];

/* Correo y tipo de la verificación en curso. Vive en memoria: si se
   recarga la página hay que empezar de nuevo, que es lo correcto para
   algo que caduca en diez minutos. */
let pendiente = { correo: '', tipo: 'verificacion' };

const destinoTrasEntrar = () => {
  const pedido = new URLSearchParams(location.search).get('destino');
  return /^[\w-]+\.html$/.test(pedido || '') ? pedido : 'panel.html';
};

/* ── Ver la contraseña ──────────────────────────────────────
   Un botón por campo, puesto por código y no a mano en cada
   formulario: son cuatro repartidos por cinco vistas y basta olvidar
   uno para que la pantalla quede a medias.

   Empieza siempre oculta y vuelve a ocultarse al enviar: dejarla a la
   vista en un móvil que se pasa de mano en mano no es un favor.

   `aria-pressed` en vez de cambiar solo el icono: un lector de
   pantalla tiene que poder decir si ahora mismo se está mostrando. */
function montarVerClave(raiz = document) {
  raiz.querySelectorAll('input[type="password"]').forEach((campo) => {
    const caja = campo.closest('.campo-v');
    if (!caja || caja.querySelector('.ver-clave')) return;

    caja.classList.add('campo-v--clave');

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'ver-clave';
    boton.setAttribute('aria-pressed', 'false');
    boton.setAttribute('aria-label', 'Mostrar la contraseña');
    boton.innerHTML = `<svg class="ico" aria-hidden="true"><use href="#i-ojo"/></svg>`;

    boton.addEventListener('click', () => {
      const visible = campo.type === 'text';
      campo.type = visible ? 'password' : 'text';
      boton.setAttribute('aria-pressed', String(!visible));
      boton.setAttribute('aria-label', visible ? 'Mostrar la contraseña' : 'Ocultar la contraseña');
      boton.classList.toggle('ver-clave--activo', !visible);
      // El cursor vuelve al final: cambiar el tipo lo manda al inicio.
      const fin = campo.value.length;
      campo.focus();
      try { campo.setSelectionRange(fin, fin); } catch (_) { /* algunos tipos no lo admiten */ }
    });

    campo.insertAdjacentElement('afterend', boton);

    const form = campo.closest('form');
    if (form) {
      form.addEventListener('submit', () => {
        campo.type = 'password';
        boton.setAttribute('aria-pressed', 'false');
        boton.classList.remove('ver-clave--activo');
      });
    }
  });
}

function montarCuenta() {
  const el = (id) => document.getElementById(id);
  if (!el('formEntrar')) return;

  montarVerClave();

  const aviso = el('avisoAcceso');
  const pestanas = document.querySelector('.pestanas');

  const mostrarAviso = (texto, clase = '') => {
    aviso.hidden = !texto;
    aviso.className = `acceso__aviso ${clase}`.trim();
    aviso.textContent = texto || '';
  };

  /* Cambia de vista. Las pestañas solo tienen sentido en las dos
     primeras: en medio de una verificación estorban. */
  function vista(cual, { conservarAviso = false } = {}) {
    VISTAS.forEach((v) => { el(v).hidden = v !== cual; });
    pestanas.hidden = !['formEntrar', 'formCrear'].includes(cual);
    el('tabEntrar').classList.toggle('pestanas__op--activa', cual === 'formEntrar');
    el('tabCrear').classList.toggle('pestanas__op--activa', cual === 'formCrear');
    el('tabEntrar').setAttribute('aria-selected', String(cual === 'formEntrar'));
    el('tabCrear').setAttribute('aria-selected', String(cual === 'formCrear'));
    if (!conservarAviso) mostrarAviso('');

    const primero = el(cual).querySelector('input:not([type=hidden]):not([hidden])');
    if (primero && cual !== 'formEntrar') primero.focus();
  }

  el('tabEntrar').addEventListener('click', () => vista('formEntrar'));
  el('tabCrear').addEventListener('click', () => vista('formCrear'));
  el('irRecuperar').addEventListener('click', () => vista('formRecuperar'));
  el('btnCancelarRec').addEventListener('click', () => vista('formEntrar'));
  el('btnVolverAcceso').addEventListener('click', () => vista('formEntrar'));
  el('irRecuperacion').addEventListener('click', () => vista('formRecuperacion'));
  el('irRecuperacion2').addEventListener('click', () => vista('formRecuperacion'));
  el('btnCancelarRecuperacion').addEventListener('click', () => vista('formEntrar'));

  if (new URLSearchParams(location.search).get('crear') === '1') vista('formCrear');

  /* La solicitud de empresa solo existe para la cuenta de dealer. Se
     oculta el bloque entero en vez de campo por campo: así el
     formulario del particular queda en cuatro casillas y no en una
     lista larga con huecos. */
  const tipo = el('tipoCuenta');
  function pintarTipo() {
    const dealer = (tipo.querySelector('input:checked') || {}).value === 'dealer';
    el('bloqueEmpresa').hidden = !dealer;
    // El celular es de la persona en los dos tipos; el teléfono de la
    // empresa es otro campo, solo del dealer (D-14).
    // El dealer no crea la cuenta: pide que se la revisen. El botón lo
    // dice, para que nadie espere entrar publicando.
    el('btnCrear').textContent = dealer ? 'Enviar solicitud' : 'Crear cuenta';
  }
  tipo.addEventListener('change', pintarTipo);
  pintarTipo();

  // El RNC son 9 dígitos: se limpia lo que se pegue con guiones o
  // espacios para que el contador de abajo cuadre con lo que se envía.
  const rnc = el('new-rnc');
  rnc.addEventListener('input', () => {
    rnc.value = rnc.value.replace(/\D/g, '').slice(0, 9);
  });

  /* Formato del teléfono mientras se escribe: el mismo para todos los
     campos de celular de la página. */
  const formatearTelefono = (campo) => {
    const d = campo.value.replace(/\D/g, '').slice(0, 10);
    campo.value = d.length <= 3 ? d
      : d.length <= 6 ? `(${d.slice(0, 3)}) ${d.slice(3)}`
        : `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  };
  ['new-telefono', 'new-telefono-empresa', 'tel-nuevo', 'rec-telefono', 'rs-telefono'].forEach((idCampo) => {
    const campo = el(idCampo);
    if (campo) campo.addEventListener('input', () => formatearTelefono(campo));
  });

  /* Celular dominicano: 10 dígitos (un 1 delante de 11 se quita) que
     empiecen por 809, 829 o 849. Igual que el servidor; aquí solo
     ahorra el viaje cuando el error es evidente. */
  const celularValido = (valor) => {
    let d = String(valor || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '1') d = d.slice(1);
    return d.length === 10 && ['809', '829', '849'].includes(d.slice(0, 3));
  };
  const AVISO_CELULAR = 'Indique su celular: 10 dígitos que empiecen por 809, 829 o 849.';

  /* Seis dígitos y se envía solo (los códigos que se pegan desde el
     correo o el SMS). */
  const codigoSolo = (campo, enviarSolo) => {
    campo.addEventListener('input', () => {
      campo.value = campo.value.replace(/\D/g, '').slice(0, 6);
      if (enviarSolo && campo.value.length === 6) campo.form.requestSubmit();
    });
  };

  // Seis dígitos ya son un código completo: se envía solo, que es
  // lo que espera quien acaba de pegarlo desde el correo.
  ['cod-codigo', 'nue-codigo', 'tel-codigo'].forEach((idCampo) => codigoSolo(el(idCampo), true));

  /* Envío común: bloquea el botón mientras dura. Sin esto, una
     conexión lenta invita a pulsar tres veces y crear tres cuentas. */
  async function enviar(form, ruta, cuerpo, alTerminar) {
    const boton = form.querySelector('button[type="submit"]');
    const rotulo = boton.textContent;
    boton.disabled = true;
    boton.textContent = 'Un momento…';
    mostrarAviso('');
    try {
      const datos = await api(ruta, { metodo: 'POST', cuerpo });
      if (!datos) throw new Error('No hay conexión con el servidor. Inténtelo de nuevo.');
      alTerminar(datos);
    } catch (e) {
      mostrarAviso(e.message);
    } finally {
      boton.disabled = false;
      // Las vistas por pasos cambian el rótulo del botón al terminar
      // (alTerminar corre antes): solo se restaura el que puso «Un momento…».
      if (boton.textContent === 'Un momento…') boton.textContent = rotulo;
    }
  }

  /* «Ahora no» es comodidad, no regla (D-14): se recuerda siete días en
     este navegador y el panel sigue avisando. localStorage puede lanzar
     (modo privado, almacenamiento bloqueado): en ese caso se pregunta
     de nuevo y no pasa nada. */
  const SIETE_DIAS = 7 * 24 * 60 * 60 * 1000;
  const celularPospuesto = () => {
    try {
      const desde = Number(localStorage.getItem('merca.telefono.ahoraNo'));
      return Number.isFinite(desde) && desde > 0 && Date.now() - desde < SIETE_DIAS;
    } catch (_) { return false; }
  };
  const posponerCelular = () => {
    try { localStorage.setItem('merca.telefono.ahoraNo', String(Date.now())); } catch (_) { /* sin almacenamiento */ }
  };

  /* Una respuesta puede traer sesión abierta o pedir un código; es
     lo único que hay que distinguir. */
  function seguir(datos) {
    if (datos.usuario) {
      // Con el SMS encendido y el celular sin confirmar se ofrece
      // confirmarlo antes de entrar, salvo que lo haya pospuesto.
      if (datos.telefono && datos.telefono.sms && datos.telefono.pedir && !celularPospuesto()) {
        pedirCelular(datos.telefono);
        return;
      }
      location.href = destinoTrasEntrar();
      return;
    }

    if (datos.verificacion === 'restablecer') {
      pendiente = { correo: datos.correo, tipo: 'restablecer' };
      el('nuevaIntro').textContent = datos.mensaje;
      vista('formNuevaClave');
      return;
    }
    pendiente = { correo: datos.correo, tipo: datos.verificacion || 'verificacion' };
    el('codigoIntro').innerHTML = `${esc(datos.mensaje)} Lo enviamos a <b>${esc(datos.correo)}</b>.`;
    el('cod-codigo').value = '';
    vista('formCodigo');
  }

  // ── Confirmar el celular al entrar (10.2) ──
  /* Pasos: 'enviar' (confirmar el guardado), 'cambio' (otro número, con
     contraseña) y 'codigo' (el SMS ya salió). Nada sale al mostrar la
     vista; el SMS lo pide el botón. La sesión ya está abierta: si el
     servidor responde con error se enseña y se puede probar otra vez o
     pulsar «Ahora no». */
  let telPaso = 'enviar';
  let telProposito = 'verificar';
  let telNumeroNuevo = '';

  function pintarTelefono(texto) {
    const nombres = { enviar: 'Enviar código', cambio: 'Enviar código', codigo: 'Confirmar' };
    el('telPasoCambio').hidden = telPaso !== 'cambio';
    el('telPasoCodigo').hidden = telPaso !== 'codigo';
    el('btnTelCambiar').hidden = telPaso === 'cambio';
    el('btnTelPrincipal').textContent = nombres[telPaso];
    el('telIntro').textContent = texto;
  }

  function pedirCelular(t) {
    telProposito = 'verificar';
    telNumeroNuevo = '';
    el('tel-codigo').value = '';
    el('tel-clave').value = '';
    el('tel-nuevo').value = '';
    vista('formTelefono');
    if (t && t.mascara) {
      telPaso = 'enviar';
      pintarTelefono(`Confirme su celular ${t.mascara}. Le enviaremos un código por SMS.`);
    } else {
      telPaso = 'cambio';
      pintarTelefono('Indique su celular para proteger su cuenta.');
    }
  }

  const alEnviarCodigoSms = (datos) => {
    telPaso = 'codigo';
    el('tel-codigo').value = '';
    pintarTelefono(`Le enviamos un código a ${datos.destino}. Vence en ${datos.minutos} minutos.`);
    el('tel-codigo').focus();
  };

  el('btnTelCambiar').addEventListener('click', () => {
    telPaso = 'cambio';
    mostrarAviso('');
    pintarTelefono('Escriba el celular nuevo y su contraseña. Le enviaremos un código por SMS al número nuevo.');
    el('tel-nuevo').focus();
  });

  el('btnTelAhoraNo').addEventListener('click', () => {
    posponerCelular();
    location.href = destinoTrasEntrar();
  });

  el('formTelefono').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const form = el('formTelefono');

    if (telPaso === 'enviar') {
      // Único sitio que pide el código al celular ya guardado.
      return enviar(form, '/cuenta/telefono/verificar', {}, (datos) => {
        telProposito = 'verificar';
        alEnviarCodigoSms(datos);
      });
    }

    if (telPaso === 'cambio') {
      if (!celularValido(el('tel-nuevo').value)) {
        el('tel-nuevo').focus();
        return mostrarAviso(AVISO_CELULAR);
      }
      if (!el('tel-clave').value) {
        el('tel-clave').focus();
        return mostrarAviso('Escriba su contraseña para cambiar el número.');
      }
      return enviar(form, '/cuenta/telefono', {
        clave: el('tel-clave').value, telefono: el('tel-nuevo').value.trim(),
      }, (datos) => {
        // Con el SMS apagado entretanto, el número ya quedó guardado y
        // no hay código que pedir: se entra.
        if (datos.usuario) { location.href = destinoTrasEntrar(); return; }
        telProposito = 'cambio';
        telNumeroNuevo = el('tel-nuevo').value.trim();
        el('tel-clave').value = '';
        alEnviarCodigoSms(datos);
      });
    }

    const codigo = el('tel-codigo').value.trim();
    if (codigo.length !== 6) return mostrarAviso('El código tiene 6 dígitos.');
    const cuerpo = telProposito === 'cambio'
      ? { proposito: 'cambio', telefono: telNumeroNuevo, codigo }
      : { proposito: 'verificar', codigo };
    enviar(form, '/cuenta/telefono/confirmar', cuerpo, () => {
      location.href = destinoTrasEntrar();
    });
  });

  // ── Entrar ──
  el('formEntrar').addEventListener('submit', (ev) => {
    ev.preventDefault();
    enviar(el('formEntrar'), '/cuenta/entrar', {
      correo: el('ent-correo').value.trim(),
      clave: el('ent-clave').value,
    }, seguir);
  });

  // ── Crear cuenta ──
  el('formCrear').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const dealer = (tipo.querySelector('input:checked') || {}).value === 'dealer';
    const clave = el('new-clave').value;

    if (clave.length < 10) return mostrarAviso('La contraseña debe tener al menos 10 caracteres.');
    /* Una errata al teclear algo que no se ve deja la cuenta creada con
       una clave que su dueño no conoce, y la única salida es el correo
       de recuperación. */
    if (el('new-clave2').value !== clave) {
      el('new-clave2').focus();
      return mostrarAviso('Las dos contraseñas no coinciden.');
    }
    /* El celular es obligatorio para todos: el servidor responde 400
       sin él. Antes el formulario lo dejaba vacío y el registro caía
       en ese 400 sin explicación. */
    if (!celularValido(el('new-telefono').value)) {
      el('new-telefono').focus();
      return mostrarAviso(AVISO_CELULAR);
    }
    const telEmpresa = el('new-telefono-empresa').value.trim();
    if (dealer && telEmpresa && telEmpresa.replace(/\D/g, '').length !== 10) {
      el('new-telefono-empresa').focus();
      return mostrarAviso('El teléfono principal de la empresa debe tener 10 dígitos.');
    }
    if (dealer) {
      if (!el('new-empresa').value.trim()) return mostrarAviso('Escriba la razón social de la empresa.');
      if (el('new-rnc').value.replace(/\D/g, '').length !== 9) {
        return mostrarAviso('El RNC de la empresa tiene 9 dígitos.');
      }
      if (!el('new-encargado').value.trim()) {
        return mostrarAviso('Indique el nombre del encargado o representante.');
      }
      if (el('new-direccion').value.trim().length < 8) {
        return mostrarAviso('Indique la dirección de la oficina principal.');
      }
      if (!el('new-provincia').value) return mostrarAviso('Elija la provincia de la oficina principal.');
    }

    /* Sin aceptar, no se crea la cuenta. El servidor lo comprueba
       también —una casilla marcada en el navegador no prueba nada— pero
       decirlo aquí evita mandar el formulario entero para que vuelva
       rechazado. */
    if (!el('new-acepta').checked) {
      el('new-acepta').focus();
      return mostrarAviso('Debe aceptar los términos y condiciones y la política de privacidad.');
    }

    const cuerpo = {
      correo: el('new-correo').value.trim(),
      clave,
      nombre: el('new-nombre').value.trim(),
      telefono: el('new-telefono').value.trim(),
      tipo: dealer ? 'dealer' : 'particular',
      /* Qué versión se acepta, no un simple «sí». Lo que se guarda es
         el par documento+versión, y tiene que salir de la misma lista
         que lee el servidor. */
      acepta: OBLIGATORIOS.reduce((m, d) => { m[d.id] = d.version; return m; }, {}),
    };

    // Los datos de empresa solo viajan si son de una empresa. Mandarlos
    // vacíos en el alta de un particular no rompe nada, pero deja la
    // petición contando cosas que no existen.
    if (dealer) Object.assign(cuerpo, {
      empresa: el('new-empresa').value.trim(),
      rnc: el('new-rnc').value.trim(),
      direccion: el('new-direccion').value.trim(),
      provincia: el('new-provincia').value,
      municipio: el('new-municipio').value.trim(),
      telefonoEmpresa: telEmpresa,
      nombreComercial: el('new-comercial').value.trim(),
      aniosOperando: el('new-anios').value,
      encargado: el('new-encargado').value.trim(),
      cargo: el('new-cargo').value.trim(),
      equiposInventario: el('new-inventario').value,
      equiposPublicar: el('new-publicar').value,
      tiposEquipo: el('new-tipos').value.trim(),
      origen: el('new-origen').value,
      comentario: el('new-comentario').value.trim(),
    });

    enviar(el('formCrear'), '/cuenta/registro', cuerpo, seguir);
  });

  // ── Código de verificación o de acceso ──
  el('formCodigo').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const codigo = el('cod-codigo').value.trim();
    if (codigo.length !== 6) return mostrarAviso('El código tiene 6 dígitos.');

    enviar(el('formCodigo'), '/cuenta/verificar', {
      correo: pendiente.correo, tipo: pendiente.tipo, codigo,
    }, seguir);
  });

  el('btnReenviar').addEventListener('click', async () => {
    await api('/cuenta/reenviar', {
      metodo: 'POST', cuerpo: { correo: pendiente.correo, tipo: pendiente.tipo }, silencioso: true,
    });
    el('cod-codigo').value = '';
    mostrarAviso('Le enviamos un código nuevo. El anterior dejó de servir.', 'acceso__aviso--bien');
  });

  // ── Recuperar la contraseña ──
  el('formRecuperar').addEventListener('submit', (ev) => {
    ev.preventDefault();
    enviar(el('formRecuperar'), '/cuenta/recuperar', { correo: el('rec-correo').value.trim() }, seguir);
  });

  el('formNuevaClave').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const codigo = el('nue-codigo').value.trim();
    const clave = el('nue-clave').value;
    if (codigo.length !== 6) return mostrarAviso('El código tiene 6 dígitos.');
    if (clave.length < 10) return mostrarAviso('La contraseña debe tener al menos 10 caracteres.');

    enviar(el('formNuevaClave'), '/cuenta/restablecer', {
      correo: pendiente.correo, codigo, clave,
    }, seguir);
  });

  el('btnReenviarRec').addEventListener('click', async () => {
    await api('/cuenta/reenviar', {
      metodo: 'POST', cuerpo: { correo: pendiente.correo, tipo: 'restablecer' }, silencioso: true,
    });
    el('nue-codigo').value = '';
    mostrarAviso('Le enviamos un código nuevo. El anterior dejó de servir.', 'acceso__aviso--bien');
  });

  // ── Recuperación sin acceso al correo (revisión humana) ──
  el('rcp-rnc').addEventListener('input', () => {
    el('rcp-rnc').value = el('rcp-rnc').value.replace(/\D/g, '').slice(0, 9);
  });

  el('formRecuperacion').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const detalle = el('rcp-detalle').value.trim();
    if (!el('rcp-cuenta').value.trim()) return mostrarAviso('Escriba el correo de su cuenta.');
    if (!el('rcp-contacto').value.trim()) return mostrarAviso('Escriba un correo de contacto al que tenga acceso ahora.');
    if (!el('rcp-nombre').value.trim()) return mostrarAviso('Escriba su nombre completo.');
    if (el('rcp-rnc').value && el('rcp-rnc').value.length !== 9) return mostrarAviso('El RNC tiene 9 dígitos.');
    if (detalle.length < 20) {
      el('rcp-detalle').focus();
      return mostrarAviso('Cuéntenos qué puede probar de que la cuenta es suya (al menos 20 caracteres).');
    }

    enviar(el('formRecuperacion'), '/cuenta/recuperacion', {
      correoCuenta: el('rcp-cuenta').value.trim(),
      correoContacto: el('rcp-contacto').value.trim(),
      nombre: el('rcp-nombre').value.trim(),
      telefono: el('rcp-telefono').value.trim(),
      rnc: el('rcp-rnc').value.trim(),
      detalle,
    }, (datos) => {
      // El servidor responde lo mismo exista o no la cuenta; aquí se
      // enseña tal cual, sin añadir nada que lo delate.
      el('formRecuperacion').reset();
      vista('formEntrar', { conservarAviso: true });
      mostrarAviso(datos.mensaje, 'acceso__aviso--bien');
    });
  });

  // ── «No fui yo»: revertir un cambio de correo ──
  /* El testigo viaja en la URL, pero NADA se hace al cargar: solo el
     botón llama al servidor. Los antivirus de correo abren los enlaces
     por su cuenta y una reversión disparada por un GET anularía la
     contraseña de alguien que no la pidió. */
  const testigoRevertir = new URLSearchParams(location.search).get('revertir');
  if (testigoRevertir !== null) {
    vista('formRevertir');
    el('btnRevertir').addEventListener('click', async () => {
      const boton = el('btnRevertir');
      const rotulo = boton.textContent;
      boton.disabled = true;
      boton.textContent = 'Un momento…';
      mostrarAviso('');
      try {
        const datos = await api('/cuenta/correo/revertir', {
          metodo: 'POST', cuerpo: { testigo: testigoRevertir },
        });
        if (!datos) throw new Error('No hay conexión con el servidor. Inténtelo de nuevo.');
        // El testigo ya se gastó: fuera de la URL y del historial.
        history.replaceState(null, '', location.pathname);
        seguir(datos);   // pasa a «contraseña nueva» con el correo y el texto del servidor
      } catch (e) {
        mostrarAviso(e.message);
        el('revertirVolver').hidden = false;
      } finally {
        boton.disabled = false;
        boton.textContent = rotulo;
      }
    });
  }

  // Quien ya entró no tiene nada que hacer aquí (salvo revertir: puede
  // ser justo quien tomó la cuenta, o el dueño desde otro equipo).
  cargarSesion().then(() => {
    if (haySesion() && testigoRevertir === null) location.replace(destinoTrasEntrar());
  });
}

document.addEventListener('DOMContentLoaded', montarCuenta);
