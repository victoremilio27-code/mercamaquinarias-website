/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Planes y precios

   EL ÚNICO SITIO DONDE SE COMPRA CAPACIDAD. Antes el cobro vivía
   dentro del asistente de publicación: el anunciante montaba la ficha
   entera y al final se encontraba un formulario de tarjeta. Quien ya
   tenía cupos pagados veía ese mismo paso otra vez y parecía que se le
   cobraba dos veces por lo mismo.

   Ahora el asistente no cobra nunca. Publicar ocupa un cupo; comprar
   cupos se hace aquí, y solo cuando hacen falta.

   ── Lo que se le enseña a cada quien ────────────────────────
   · Sin cuenta        → los niveles y sus precios.
   · Con cupos libres  → primero cuántos le quedan, y un atajo a
                         publicar. Nada de empujarle a comprar lo que
                         ya tiene.
   · Sin cupos libres  → ampliar los que ya tiene, prorrateado, o
                         contratar otro nivel. Nunca empezar de cero.
   ═══════════════════════════════════════════════════════════ */

let NIVELES_PLAN = [];
let MIS_CUPOS = [];
let EXENTA_PLAN = false;
let NIVEL_ELEGIDO = '';
let DIAS_PLAN = 30;
let CUPOS_PEDIDOS = 1;

/* Cómo se cobra, según el servidor (`metodosPago` de /api/planes).
   Lo decide él y no esta página: con la transferencia encendida `demo`
   deja de existir para el comprador, y un navegador que mandara otro
   método recibiría un 400. Vacío hasta que responde. */
let METODOS_PAGO = [];

/* Pagos pedidos que todavía no se han confirmado (`pagosPendientes` de
   /api/membresias). Un pago en espera NO es un cupo: por eso se cuentan
   aparte y nunca se suman a MIS_CUPOS. */
let PAGOS_PENDIENTES = [];

/* A dónde vuelve después de contratar. Lo pone quien lo mandó aquí
   —el asistente, casi siempre— para poder devolverlo a su borrador. */
const destino = () => params().get('destino') || '';

/* El mismo destino, pero solo si es una página de este sitio. Sale de
   la URL, así que cualquiera puede fabricar un enlace con
   `destino=javascript:…`; pintado como href de un enlace, ese texto
   se ejecutaría al pulsarlo. */
const destinoPropio = () => (/^[a-z0-9-]+\.html(?:[?#]|$)/i.test(destino()) ? destino() : '');

const porTransferencia = () => METODOS_PAGO.includes('transferencia');

/* Solo se paga por transferencia lo que cuesta algo. Una cuenta exenta
   o un pedido a RD$0 (la promoción del Estándar) sale aprobado al
   instante, igual que antes de la fase: prometerle unos datos
   bancarios que no van a llegar sería mentirle. */
const pagaPorTransferencia = (ped) => porTransferencia() && !EXENTA_PLAN && !!ped && ped.total > 0;

/* Un 202 de las rutas de cobro. Durante la fase 3 el navegador lo
   trataba como una compra hecha —«Listo. Contrató…», vuelta al
   borrador y cupos que no existían— porque `demo` aprobaba siempre y
   nadie veía nunca uno. Con la transferencia es lo normal. */
const enEspera = (r) => !!(r && r.pago && r.pago.estado === 'pendiente');

const unitario = (n) => (n.precio_vigente != null ? n.precio_vigente : n.precio);

const nivel = (id) => NIVELES_PLAN.find((n) => n.id === id) || null;

function avisar(mensaje, ok = false) {
  const el = $('#avisoPlanes');
  if (!el) return;
  const caja = $('#estadoCuenta');
  if (mensaje) caja.hidden = false;
  el.hidden = !mensaje;
  el.textContent = mensaje || '';
  el.classList.toggle('acceso__aviso--ok', ok);
}

/* ── Lo que ya tiene ─────────────────────────────────────── */

function pintarMisCupos() {
  const caja = $('#estadoCuenta');
  if (!haySesion() || !MIS_CUPOS.length) { caja.hidden = true; return; }

  caja.hidden = false;
  const libres = MIS_CUPOS.reduce((n, m) => (m.libres === null ? n : n + m.libres), 0);
  const sinLimite = MIS_CUPOS.some((m) => m.libres === null);

  $('#misCupos').innerHTML = MIS_CUPOS.map((m) => {
    const dias = m.fin ? diasRestantes(m.fin) : null;
    const sig = m.anuncios_incluidos == null ? null : precioAmpliacion({
      precioUnitario: m.precio_unitario,
      cupoActual: m.anuncios_incluidos,
      cupoNuevo: m.anuncios_incluidos + 1,
      dias: m.dias_ciclo || 30,
      diasRestantes: dias ?? (m.dias_ciclo || 30),
    });

    return `<li class="membresia${m.libres === 0 ? ' membresia--llena' : ''}">
      <span class="membresia__cabeza">
        <b class="membresia__nivel">${esc(m.plan_nombre)}</b>
        <span class="membresia__vigencia">${m.fin ? `Quedan ${dias} ${dias === 1 ? 'día' : 'días'}` : 'Sin caducidad'}</span>
      </span>
      <span class="membresia__cupo num">${m.anuncios_incluidos == null
        ? `${m.ocupados} publicados · sin límite`
        : `${m.libres} ${m.libres === 1 ? 'cupo libre' : 'cupos libres'} de ${m.anuncios_incluidos}`}</span>
      ${sig ? (sig.total === 0
        ? '<span class="membresia__gratis">El siguiente cupo no le cuesta nada</span>'
        : `<span class="membresia__siguiente">Un cupo más: ${pesos(sig.total)} hasta su renovación</span>`) : ''}
      ${m.anuncios_incluidos == null ? '' : `
        <button type="button" class="btn btn--linea btn--chico" data-ampliar="${esc(m.id)}">
          Añadir cupos a ${esc(m.plan_nombre)}
        </button>`}
    </li>`;
  }).join('');

  /* Si le sobran cupos, lo primero que ve es el atajo para usarlos.
     Enseñarle precios a quien ya pagó es justo lo que hacía pensar que
     se le cobraba dos veces. */
  const atajo = $('#btnVolverPublicar');
  if (libres > 0 || sinLimite) {
    atajo.hidden = false;
    atajo.textContent = destino() ? 'Volver a mi anuncio' : 'Publicar un equipo';
    atajo.href = destino() || 'publicar.html';
    avisar(sinLimite
      ? 'Su cuenta publica sin límite. No necesita contratar nada.'
      : `Le ${libres === 1 ? 'queda' : 'quedan'} ${libres} ${libres === 1 ? 'cupo libre' : 'cupos libres'}: puede publicar sin pagar nada más.`, true);
  } else {
    atajo.hidden = true;
  }
}

/* ── Niveles ─────────────────────────────────────────────── */

function tarjetaNivel(n) {
  const elegido = n.id === NIVEL_ELEGIDO;
  const porCupo = Math.round(unitario(n) * duracion(DIAS_PLAN).factor);

  const rasgos = [
    `Hasta ${n.fotos_maximas} fotografías por equipo`,
    n.videos_maximos
      ? `${n.videos_maximos} ${n.videos_maximos === 1 ? 'video' : 'videos'} de 30 segundos por equipo`
      : null,
    n.destacado ? 'Distintivo Destacado y posición preferente' : 'Ficha técnica completa con horas y condición',
    n.destacado ? 'Aparece en la portada' : 'Contacto directo por teléfono y WhatsApp',
    n.perfil_publico ? 'Página pública de su empresa en el directorio' : null,
  ].filter(Boolean);

  return `<li>
    <label class="plan-op${elegido ? ' plan-op--elegido' : ''}${n.destacado && !n.perfil_publico ? ' plan-op--sugerido' : ''}">
      <input type="radio" name="nivel" value="${esc(n.id)}"${elegido ? ' checked' : ''}>
      <span class="plan-op__cabeza">
        ${n.perfil_publico
          ? '<span class="plan-op__cinta plan-op__cinta--membresia">Con página propia</span>'
          : n.destacado
            ? '<span class="plan-op__cinta">Más contratado</span>'
            : '<span class="plan-op__hueco" aria-hidden="true"></span>'}
        <span class="plan-op__nombre">${esc(n.nombre)}</span>
      </span>
      <span class="plan-op__precio num">${EXENTA_PLAN ? 'Sin costo' : pesos(porCupo)}</span>
      <span class="plan-op__periodo">por equipo · ${DIAS_PLAN} días</span>
      <ul class="plan-op__incluye">
        ${rasgos.map((i) => `<li>${icono('i-check')} ${esc(i)}</li>`).join('')}
      </ul>
    </label>
  </li>`;
}

function pintarTablaComparativa() {
  const filas = [
    ['Fotografías por equipo', (n) => `${n.fotos_maximas}`],
    // Antes esta fila decía «Sí» para todo plan destacado, cuando el
    // video no existía en el sitio: prometía algo que no se entregaba.
    ['Videos de 30 s por equipo', (n) => (n.videos_maximos ? `${n.videos_maximos}` : '—')],
    ['Distintivo Destacado', (n) => (n.destacado ? 'Sí' : '—')],
    ['Posición preferente en resultados', (n) => (n.destacado ? 'Sí' : '—')],
    ['Aparece en la portada', (n) => (n.destacado ? 'Sí' : '—')],
    ['Página pública de la empresa', (n) => (n.perfil_publico ? 'Sí' : '—')],
    ['Estadísticas de visitas y contactos', () => 'Sí'],
    ['Cupo reutilizable al vender', () => 'Sí'],
  ];

  $('#tablaPlanes').innerHTML = `
    <thead>
      <tr>
        <th scope="col">Prestación</th>
        ${NIVELES_PLAN.map((n) => `<th scope="col">${esc(n.nombre)}</th>`).join('')}
      </tr>
    </thead>
    <tbody>
      ${filas.map(([rotulo, valor]) => `<tr>
        <th scope="row">${esc(rotulo)}</th>
        ${NIVELES_PLAN.map((n) => {
    const v = valor(n);
    return `<td class="${v === 'Sí' ? 'tabla-planes__si' : v === '—' ? 'tabla-planes__no' : 'num'}">${esc(v)}</td>`;
  }).join('')}
      </tr>`).join('')}
    </tbody>`;
}

/* ── Pedido ──────────────────────────────────────────────── */

function pedidoPlan() {
  const n = nivel(NIVEL_ELEGIDO);
  if (!n) return null;
  return {
    nivel: n,
    ...precioCompra({ precioUnitario: unitario(n), cupo: CUPOS_PEDIDOS, dias: DIAS_PLAN }),
  };
}

function pintarPedido() {
  const caja = $('#resumenPlan');
  const ped = pedidoPlan();
  if (!caja || !ped) return;

  /* `fechaLarga` de app.js recibe una fecha en formato AAAA-MM-DD y le
     añade la hora; pasarle un objeto Date daba «Invalid Date». */
  const vence = new Date();
  vence.setDate(vence.getDate() + DIAS_PLAN);
  const venceIso = vence.toISOString().slice(0, 10);

  caja.innerHTML = EXENTA_PLAN
    ? `<h3 class="pedido__titulo">Sin costo</h3>
       <p class="pedido__vacio">${icono('i-check')} Su cuenta publica sin pagar y sin límite de equipos.</p>`
    : `<h3 class="pedido__titulo">Resumen</h3>
       <dl class="pedido__lista">
         <div><dt>${esc(ped.nivel.nombre)} · ${ped.cupo} ${ped.cupo === 1 ? 'equipo' : 'equipos'}</dt>
           <dd class="num">${pesos(ped.subtotal)}</dd></div>
         <div><dt>Vigencia</dt><dd class="num">${DIAS_PLAN} días · hasta el ${fechaLarga(venceIso)}</dd></div>
         ${ped.gratis ? `<div><dt>Cupos de regalo</dt><dd class="num">${ped.gratis}</dd></div>` : ''}
         <div><dt>ITBIS (${Math.round(ITBIS * 100)} %)</dt><dd class="num">${pesos(ped.itbis)}</dd></div>
         <div class="pedido__total"><dt>Total</dt><dd class="num">${pesos(ped.total)}</dd></div>
       </dl>
       ${pagaPorTransferencia(ped)
    ? `<p class="pedido__metodo"><b>Forma de pago: transferencia bancaria.</b> Le damos los datos y la referencia al confirmar; los cupos y el comprobante fiscal llegan cuando recibamos el ingreso.</p>`
    : ''}`;

  $('#btnContratar').textContent = EXENTA_PLAN
    ? 'Activar sin costo'
    : pagaPorTransferencia(ped)
      ? `Pedir datos para transferir ${pesos(ped.total)}`
      : `Contratar por ${pesos(ped.total)}`;

  /* Qué se acepta al pulsar, junto al botón que lo acepta.
     Escondido en el pie no serviría: la advertencia tiene que estar
     donde se toma la decisión. */
  const boton = $('#btnContratar');
  if (boton && !document.querySelector('.pedido__legal')) {
    const aviso = document.createElement('p');
    aviso.className = 'pedido__legal';
    aviso.innerHTML = 'Al confirmar el pago acepta las '
      + '<a href="legal.html#contratacion" target="_blank" rel="noopener">Condiciones de contratación y pagos</a>, '
      + 'incluida la política de reembolso.';
    boton.insertAdjacentElement('afterend', aviso);
  }
}

/* La regla del uno gratis por cada cinco, contada sobre lo que acaba
   de teclear: decirle cuánto le falta para el siguiente es lo que la
   hace útil y no un adorno. */
function pintarRegla() {
  const el = $('#reglaCupos');
  if (EXENTA_PLAN) { el.hidden = true; return; }
  el.hidden = false;

  const gratis = cuposGratis(CUPOS_PEDIDOS);
  const faltan = CUPOS_POR_UNO_GRATIS - (CUPOS_PEDIDOS % CUPOS_POR_UNO_GRATIS);

  el.innerHTML = gratis > 0
    ? `${icono('i-check')} <span>${gratis === 1 ? 'Se le regala' : 'Se le regalan'} <b>${gratis} ${gratis === 1 ? 'cupo' : 'cupos'}</b>: paga ${cuposCobrados(CUPOS_PEDIDOS)} de ${CUPOS_PEDIDOS}.${faltan < CUPOS_POR_UNO_GRATIS ? ` Con ${faltan} más, otro gratis.` : ''}</span>`
    : `${icono('i-etiqueta')} <span>Uno gratis por cada ${CUPOS_POR_UNO_GRATIS}. Le ${faltan === 1 ? 'falta' : 'faltan'} <b>${faltan}</b> para que el siguiente no se cobre.</span>`;
}

function pintarTodo() {
  $('#nivelesLista').innerHTML = NIVELES_PLAN.map(tarjetaNivel).join('');
  $('#notaPremium').hidden = !(nivel(NIVEL_ELEGIDO) || {}).perfil_publico || esDealer();
  pintarRegla();
  pintarPedido();
}

/* ── Pago en espera ──────────────────────────────────────── */

const TIPOS_CUENTA = { corriente: 'Corriente', ahorros: 'De ahorros' };

/* El `mailto:` se arma con encodeURIComponent: el correo y la
   referencia vienen del servidor y no pueden colar nada en el enlace.
   La arroba se devuelve a su sitio porque algún cliente de correo no
   entiende «%40» en la dirección. */
function enlaceComprobante(correo, referencia) {
  const asunto = `Comprobante de transferencia ${referencia}`;
  return `mailto:${encodeURIComponent(correo).replace('%40', '@')}?subject=${encodeURIComponent(asunto)}`;
}

/* Sin portapapeles (página servida sin HTTPS, navegador viejo) no se
   ofrece un botón que no haría nada: la referencia está a la vista y se
   puede seleccionar a mano. */
const botonCopiar = (texto) => (navigator.clipboard
  ? `<button type="button" class="btn btn--linea btn--chico" data-copiar="${esc(texto)}">Copiar</button>`
  : '');

/* Los datos para transferir. Todo sale de la respuesta del servidor y
   pasa por esc(): esta página no tiene ninguna cuenta escrita, así que
   con la transferencia apagada no hay nada que enseñar por error. */
function htmlTransferencia(t, cobro) {
  const ref = cobro.referencia || '';
  const volver = destinoPropio();
  return `
    <h3 class="transferencia__titulo">Datos para transferir</h3>
    <p class="transferencia__ref">
      <span class="transferencia__rotulo">Referencia</span>
      <b class="transferencia__codigo">${esc(ref)}</b>
      ${botonCopiar(ref)}
    </p>
    <dl class="transferencia__cuenta">
      <div><dt>Banco</dt><dd>${esc(t.banco)}</dd></div>
      <div><dt>Titular</dt><dd>${esc(t.titular)}</dd></div>
      <div><dt>RNC</dt><dd class="num">${esc(t.rnc)}</dd></div>
      <div><dt>Tipo de cuenta</dt><dd>${esc(TIPOS_CUENTA[t.tipoCuenta] || t.tipoCuenta)}</dd></div>
      <div><dt>Número de cuenta</dt><dd class="num">${esc(t.cuenta)}</dd></div>
      <div><dt>Importe</dt><dd class="num">${pesos(Number(cobro.total) || 0)}</dd></div>
    </dl>
    <ul class="transferencia__pasos">
      <li>Ponga la referencia en el concepto de la transferencia.</li>
      <li>Envíe el comprobante de la transferencia a <a href="${esc(enlaceComprobante(t.correo, ref))}">${esc(t.correo)}</a>.</li>
      <li>Los días de su membresía empiezan a contar cuando confirmemos el ingreso, no antes.</li>
    </ul>
    <p class="transferencia__nota">Esto no es un comprobante fiscal. Se lo enviamos por correo cuando confirmemos el pago; le mandamos también estos datos a su correo.</p>
    ${volver ? `<p class="transferencia__volver">
      <a class="btn btn--linea btn--chico" href="${esc(volver)}">Volver a mi borrador</a>
      <span>Se publicará cuando lleguen los cupos.</span>
    </p>` : ''}`;
}

/* Lo que se enseña tras un 202. Con datos de cuenta, el bloque entero;
   sin ellos (otra pasarela en proceso, o la transferencia se apagó
   entre medias) solo el aviso y la referencia, sin inventar una cuenta.
   El bloque se queda puesto: quien va a transferir lo necesita a la
   vista mientras abre su banco, y no desaparece hasta que pida otro. */
function pintarEspera(r, ancla, aviso) {
  const previo = $('#datosTransferencia');
  if (previo) previo.remove();
  if (!ancla) return;

  const caja = document.createElement('div');
  caja.id = 'datosTransferencia';
  caja.className = 'transferencia';
  caja.setAttribute('role', 'status');
  const cobro = r.cobro || {};
  caja.innerHTML = r.transferencia
    ? htmlTransferencia(r.transferencia, cobro)
    : `<p class="transferencia__aviso">${esc(aviso || r.aviso || '')}</p>
       ${cobro.referencia ? `<p class="transferencia__ref">
         <span class="transferencia__rotulo">Referencia</span>
         <b class="transferencia__codigo">${esc(cobro.referencia)}</b>
         ${botonCopiar(cobro.referencia)}
       </p>` : ''}`;
  ancla.insertAdjacentElement('afterend', caja);
  caja.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Qué aviso acompaña a un 202 que no trae cuenta. Si el pago es por
   transferencia pero la cuenta ya no está, el aviso genérico («transfiera
   con la referencia indicada») mandaría a transferir sin datos; el de
   /api/membresias dice a quién escribir. */
const avisoSinCuenta = (r, mios) => ((r.cobro || {}).procesador === 'transferencia' && mios && mios.avisoTransferencia)
  || r.aviso || '';

/* «Tiene N pagos en espera», encima del pedido. Sin él, quien vuelve a
   esta página tras pedir los datos no ve rastro de su pedido y es fácil
   que pida otro. */
function pintarRecordatorio() {
  let el = $('#pagosEnEspera');
  const n = PAGOS_PENDIENTES.length;
  if (!n) { if (el) el.remove(); return; }

  if (!el) {
    const compra = $('.compra-cupos');
    if (!compra) return;
    el = document.createElement('p');
    el.id = 'pagosEnEspera';
    el.className = 'realce realce--espera';
    compra.insertAdjacentElement('beforebegin', el);
  }
  el.innerHTML = `${icono('i-aviso')} <span>Tiene <b>${n} ${n === 1 ? 'pago' : 'pagos'} en espera de confirmación</b>. `
    + `<a href="panel.html">${n === 1 ? 'Ver el pago' : 'Ver los pagos'} en su panel</a>.</span>`;
}

/* Vuelve a pedir lo que tiene: cupos y pagos en espera. Devuelve la
   respuesta entera porque el aviso de una transferencia sin cuenta
   viene en ella. */
async function recargarCuenta() {
  const mios = await api('/membresias', { silencioso: true });
  if (mios) {
    MIS_CUPOS = mios.membresias || MIS_CUPOS;
    PAGOS_PENDIENTES = mios.pagosPendientes || [];
  }
  pintarMisCupos();
  pintarRecordatorio();
  return mios;
}

/* ── Contratar ───────────────────────────────────────────── */

async function contratar() {
  const btn = $('#btnContratar');
  const ped = pedidoPlan();
  if (!ped) return;

  if (!haySesion()) {
    location.href = `cuenta.html?destino=${encodeURIComponent(`planes.html${location.search}`)}&crear=1`;
    return;
  }

  btn.disabled = true;
  btn.classList.add('btn--ocupado');
  const antes = btn.textContent;
  btn.textContent = pagaPorTransferencia(ped) ? 'Pidiendo los datos…' : 'Contratando…';

  try {
    /* El método solo se manda si el servidor lo ofrece. Con la
       transferencia apagada el cuerpo es el de siempre. */
    const cuerpo = {
      plan: ped.nivel.id, cupo: CUPOS_PEDIDOS, dias: DIAS_PLAN,
      ...(porTransferencia() ? { metodo: 'transferencia' } : {}),
      ...datosFiscales(),
    };

    const r = await api('/membresias', { metodo: 'POST', cuerpo });
    if (!r) throw new Error('No hay conexión con el servidor.');

    /* Pedido anotado pero sin cobrar: ni vuelta al borrador (no tiene
       cupo con qué publicarlo) ni «Listo». Los datos se quedan aquí. */
    if (enEspera(r)) {
      const mios = await recargarCuenta();
      pintarEspera(r, btn.closest('.acciones') || btn, avisoSinCuenta(r, mios));
      return;
    }

    /* Con destino se vuelve solo: el anunciante venía de su borrador y
       devolverlo ahí es la mitad de la mejora. */
    if (destino()) { location.href = destino(); return; }

    MIS_CUPOS = (await api('/membresias', { silencioso: true }) || {}).membresias || MIS_CUPOS;
    pintarMisCupos();
    avisar(`Listo. Contrató ${CUPOS_PEDIDOS} ${CUPOS_PEDIDOS === 1 ? 'cupo' : 'cupos'} de ${ped.nivel.nombre}.`, true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (e) {
    avisar(e.message);
  } finally {
    btn.disabled = false;
    btn.classList.remove('btn--ocupado');
    btn.textContent = antes;
  }
}

/* ── Comprobante fiscal ─────────────────────────────────── */

/* Lo que se manda al servidor sobre el comprobante.
 *
 * Si no pide RNC no se manda nada: el servidor emite a nombre del
 * titular como consumidor final. Mandar campos vacíos haría que la
 * petición contara cosas que no existen. */
function datosFiscales() {
  const elegido = document.querySelector('input[name="tipoComprobante"]:checked');
  if (!elegido || elegido.value !== 'si') return {};
  return {
    conRnc: true,
    razonSocial: ($('#fac-razon') || {}).value || '',
    rnc: ($('#fac-rnc') || {}).value || '',
    direccionFiscal: ($('#fac-direccion') || {}).value || '',
  };
}

/* Enseña el bloque y, si la cuenta es de empresa, rellena lo que ya
   sabemos. Quien más necesita la factura es justo quien ya nos dio
   estos datos al darse de alta: volvérselos a pedir es hacerle
   teclear lo que tenemos. */
function montarComprobante() {
  const bloque = $('#bloqueComprobante');
  if (!bloque) return;

  // Sin sesión no hay a quién facturar todavía.
  if (!haySesion()) return;
  bloque.hidden = false;

  const org = SESION.organizacion;
  if (org && org.tipo === 'dealer') {
    if ($('#fac-razon')) $('#fac-razon').value = org.nombre || '';
    /* El RNC NO se rellena: la sesión solo trae la versión
       enmascarada, y poner «1-31-***75-9» en un campo que se envía
       sería mandar asteriscos al servidor. Lo escribe quien factura,
       que lo tiene a mano. */
  }

  const campos = $('#camposFiscales');
  bloque.querySelectorAll('input[name="tipoComprobante"]').forEach((r) => {
    r.addEventListener('change', () => {
      campos.hidden = r.value !== 'si' || !r.checked;
      if (!campos.hidden && $('#fac-razon')) $('#fac-razon').focus();
    });
  });
}

/* Ampliar lo que ya tiene, prorrateado. Es el caso de quien se quedó
   sin cupos: no se le hace pasar otra vez por la compra entera. */
async function ampliar(id) {
  const m = MIS_CUPOS.find((x) => x.id === id);
  if (!m) return;

  const cuantos = prompt(
    `¿Cuántos equipos quiere poder publicar en total con ${m.plan_nombre}?\n\n`
    + `Ahora tiene ${m.anuncios_incluidos}. Solo paga los días que le queden, y cada quinto cupo no se cobra.`,
    String(m.anuncios_incluidos + 1));
  if (cuantos === null) return;

  const cupo = Number(String(cuantos).replace(/\D+/g, ''));
  if (!cupo || cupo <= m.anuncios_incluidos) {
    avisar(`Indique una cantidad mayor que ${m.anuncios_incluidos}.`);
    return;
  }

  const previo = precioAmpliacion({
    precioUnitario: m.precio_unitario,
    cupoActual: m.anuncios_incluidos,
    cupoNuevo: cupo,
    dias: m.dias_ciclo || 30,
    diasRestantes: diasRestantes(m.fin) ?? (m.dias_ciclo || 30),
  });

  const nuevos = cupo - m.anuncios_incluidos;
  const texto = EXENTA_PLAN || previo.total === 0
    ? `Añadir ${nuevos} ${nuevos === 1 ? 'cupo' : 'cupos'} sin costo. ¿Confirma?`
    : `Añadir ${nuevos} ${nuevos === 1 ? 'cupo' : 'cupos'} cuesta ${pesos(previo.total)} por los días que le quedan.\n\n¿Confirma?`;
  if (!confirm(texto)) return;

  try {
    const r = await api(`/membresias/${encodeURIComponent(id)}/ampliar`, {
      metodo: 'POST',
      cuerpo: { cupo, ...(porTransferencia() ? { metodo: 'transferencia' } : {}) },
    });
    if (!r) throw new Error('No hay conexión con el servidor.');

    /* En espera la membresía sigue con los cupos que tenía: decir que
       «pasó a N cupos» era anunciar algo que todavía no ha pasado. */
    if (enEspera(r)) {
      const mios = await recargarCuenta();
      avisar(avisoSinCuenta(r, mios), true);
      if (r.transferencia) pintarEspera(r, $('#avisoPlanes'));
      return;
    }

    MIS_CUPOS = (await api('/membresias', { silencioso: true }) || {}).membresias || MIS_CUPOS;
    pintarMisCupos();
    avisar(`${m.plan_nombre} pasó a ${cupo} cupos.`, true);
  } catch (e) { avisar(e.message); }
}

/* ── Arranque ────────────────────────────────────────────── */

async function montarPlanes() {
  if (!$('#nivelesLista')) return;

  await cargarSesion();
  montarAvisoLegal('pagar');
  montarComprobante();

  const catalogo = await api('/planes', { silencioso: true });
  NIVELES_PLAN = (catalogo && catalogo.planes) || [];
  METODOS_PAGO = (catalogo && Array.isArray(catalogo.metodosPago)) ? catalogo.metodosPago : [];

  if (haySesion()) {
    const mios = await api('/membresias', { silencioso: true });
    MIS_CUPOS = (mios && mios.membresias) || [];
    PAGOS_PENDIENTES = (mios && mios.pagosPendientes) || [];
    EXENTA_PLAN = !!(mios && mios.exenta);
  }

  // Por defecto el nivel intermedio, que es el que contrata casi todo
  // el mundo, salvo que la URL pida otro.
  const pedido = params().get('nivel');
  const destacado = NIVELES_PLAN.find((n) => n.destacado && !n.perfil_publico);
  NIVEL_ELEGIDO = (nivel(pedido) || destacado || NIVELES_PLAN[0] || {}).id || '';

  const cupos = Number(params().get('cupos'));
  if (cupos > 0) CUPOS_PEDIDOS = Math.min(cupos, CUPO_MAXIMO);
  $('#cuantosCupos').value = String(CUPOS_PEDIDOS);
  $('#ahorro60Planes').textContent = `Ahorra ${ahorro60()} %`;

  pintarMisCupos();
  pintarRecordatorio();
  pintarTablaComparativa();
  pintarTodo();

  $('#nivelesLista').addEventListener('change', (e) => {
    if (e.target.name !== 'nivel') return;
    NIVEL_ELEGIDO = e.target.value;
    pintarTodo();
  });

  $('#duracionPlan').addEventListener('change', (e) => {
    DIAS_PLAN = Number(e.target.value) === 60 ? 60 : 30;
    pintarTodo();
  });

  const cuantos = $('#cuantosCupos');
  cuantos.addEventListener('input', () => {
    CUPOS_PEDIDOS = Math.max(1, Math.min(Number(String(cuantos.value).replace(/\D+/g, '')) || 1, CUPO_MAXIMO));
    pintarRegla();
    pintarPedido();
  });
  cuantos.addEventListener('blur', () => { cuantos.value = String(CUPOS_PEDIDOS); });

  $('#btnContratar').addEventListener('click', contratar);

  $('#misCupos').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ampliar]');
    if (btn) ampliar(btn.dataset.ampliar);
  });

  /* «Copiar» la referencia. En el documento y no en el bloque, porque el
     bloque se crea después, con cada pedido. Si el navegador niega el
     portapapeles no se dice nada: la referencia sigue a la vista. */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copiar]');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copiar);
      btn.textContent = 'Copiada';
    } catch (_) { /* sin portapapeles: caída silenciosa */ }
  });
}

/* La máscara del RNC, la misma que la pantalla de la cuenta.
 *
 * Aquí faltaba, y era el único de los tres campos de RNC del sitio que
 * no la tenía: quien pegara el número en su formato oficial, con
 * guiones, veía cómo el navegador se lo cortaba y el servidor se lo
 * rechazaba después sin decirle qué había pasado. Ahora se quedan los
 * nueve dígitos y da igual cómo lo escriba. */
function montarMascaraRnc() {
  const campo = document.getElementById('fac-rnc');
  if (!campo) return;
  campo.addEventListener('input', () => {
    campo.value = campo.value.replace(/\D/g, '').slice(0, 9);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  montarPlanes();
  montarMascaraRnc();
});
