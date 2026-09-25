/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Panel del anunciante
   Lo que un vendedor necesita saber sin llamar a nadie: cuántas
   visitas tiene cada equipo, cuántos contactos generó, cuánto le
   queda de vigencia y qué está publicado y qué no.

   Todo sale de /api/mis-anuncios: una sola llamada con las métricas
   ya agregadas por la base.
   ═══════════════════════════════════════════════════════════ */

let ANUNCIOS = [];
let FILTRO = 'todos';

const ESTADOS = {
  activo:   { nombre: 'Activo',    clase: 'estado--activo' },
  pausado:  { nombre: 'Pausado',   clase: 'estado--pausado' },
  vencido:  { nombre: 'Vencido',   clase: 'estado--vencido' },
  vendido:  { nombre: 'Vendido',   clase: 'estado--vendido' },
  retirado: { nombre: 'Retirado',  clase: 'estado--vencido' },
  borrador: { nombre: 'Borrador',  clase: 'estado--pausado' },
};

/* Días que faltan para una fecha ISO. Negativo si ya pasó. */
function diasHasta(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso) - new Date()) / 86400000);
}

function textoVigencia(a) {
  if (a.estado === 'vendido' || a.estado === 'retirado') return '—';
  // Sin fecha de fin: lo sostiene una membresía sin caducidad, que hoy
  // solo tienen las cuentas internas. Antes decía "membresía" para
  // cualquier anuncio sin `vence`, que era adivinar el motivo.
  if (!a.vence) return '<span class="vigencia vigencia--membresia">Sin caducidad</span>';

  const dias = diasHasta(a.vence);
  if (dias < 0) return '<span class="vigencia vigencia--fin">Vencido</span>';
  // Cinco días es el margen con el que da tiempo a renovar sin que el
  // anuncio llegue a caerse del catálogo.
  const clase = dias <= 5 ? 'vigencia vigencia--pronto' : 'vigencia';
  return `<span class="${clase}">${dias} ${dias === 1 ? 'día' : 'días'}</span>`;
}

/* ── Membresías ─────────────────────────────────────────────
   Lo que la cuenta tiene comprado. En plural: quien contrató cinco
   Destacados y antes tenía un Estándar suelto tiene dos, y enseñar
   solo una dejaba cupos pagados fuera de su vista. */
let MEMBRESIAS = [];
let EXENTA = false;
let TREN_ABIERTO = null;      // id del anuncio con el editor desplegado

/* Pagos pedidos y todavía sin confirmar, de /api/membresias. Van aparte
   de MEMBRESIAS a propósito: un pago en espera no es un cupo, y sumarlo
   haría que el panel ofreciera publicar con algo que aún no se cobró.
   TRANSFERENCIA son los datos de la cuenta (solo si hay alguno por
   transferencia y sigue encendida); AVISO_TRANSFERENCIA, a quién
   escribir si se apagó después de pedirlo. */
let PAGOS_PENDIENTES = [];
let TRANSFERENCIA = null;
let AVISO_TRANSFERENCIA = '';

function guardarPagos(r) {
  if (!r) return;
  PAGOS_PENDIENTES = r.pagosPendientes || [];
  TRANSFERENCIA = r.transferencia || null;
  AVISO_TRANSFERENCIA = r.avisoTransferencia || '';
}

const membresiaDe = (a) => MEMBRESIAS.find((m) => m.id === a.suscripcion_id) || null;

const cupoTexto = (m) => (m.anuncios_incluidos == null
  ? `${m.ocupados} publicados · sin límite`
  : `${m.ocupados} de ${m.anuncios_incluidos} ${m.anuncios_incluidos === 1 ? 'cupo' : 'cupos'}`);

/* Una barra que se lee de un vistazo: cuánto de lo pagado está en uso.
   Sin límite no tiene barra, porque no hay nada que llenar. */
function barraCupos(m) {
  if (m.anuncios_incluidos == null) return '';
  const pct = Math.min(100, Math.round((m.ocupados / m.anuncios_incluidos) * 100));
  const lleno = m.libres === 0;
  return `<span class="cupos" role="img" aria-label="${m.ocupados} de ${m.anuncios_incluidos} cupos en uso">
    <span class="cupos__barra${lleno ? ' cupos__barra--lleno' : ''}" style="--uso:${pct}%"></span>
  </span>`;
}

function tarjetaMembresia(m) {
  const dias = diasHasta(m.fin);
  const vigencia = !m.fin
    ? 'Sin caducidad'
    : dias > 0
      ? `Quedan ${dias} ${dias === 1 ? 'día' : 'días'}`
      : 'Vencida';

  /* Lo que costaría el siguiente cupo. Cuando toca el gratis de la
     regla se dice, porque es justo el dato que cambia la decisión de
     ampliar hoy o esperar. */
  const sig = m.siguiente;
  const nota = !sig ? ''
    : sig.gratuito
      ? '<span class="membresia__gratis">El siguiente cupo no le cuesta nada</span>'
      : `<span class="membresia__siguiente">Un cupo más: ${pesos(sig.total)} hasta su renovación</span>`;

  return `<li class="membresia${m.libres === 0 ? ' membresia--llena' : ''}" data-membresia="${esc(m.id)}">
    <span class="membresia__cabeza">
      <b class="membresia__nivel">${esc(m.plan_nombre)}</b>
      <span class="membresia__vigencia">${esc(vigencia)}</span>
    </span>
    <span class="membresia__cupo num">${esc(cupoTexto(m))}</span>
    ${barraCupos(m)}
    ${nota}
    ${m.anuncios_incluidos == null ? '' : `
      <button type="button" class="btn btn--linea btn--chico" data-ampliar="${esc(m.id)}">
        Añadir cupos
      </button>`}
  </li>`;
}

/* ── Pagos en espera ────────────────────────────────────────
   Lo mismo que planes.js enseña al pedir los datos, con la misma clase
   `.transferencia`. Está repetido y no compartido porque cada página
   carga solo su script, y app.js no tiene por qué saber de cobros.
   Todo lo que viene del servidor pasa por esc(); la cuenta solo se
   pinta si el servidor la manda, sin ningún valor escrito aquí. */

const TIPOS_CUENTA = { corriente: 'Corriente', ahorros: 'De ahorros' };

// encodeURIComponent para que nada del servidor se cuele en el enlace;
// la arroba vuelve a su sitio porque hay clientes que no leen «%40».
const enlaceComprobante = (correo, referencia) => `mailto:${encodeURIComponent(correo).replace('%40', '@')}`
  + `?subject=${encodeURIComponent(`Comprobante de transferencia ${referencia}`)}`;

const botonCopiar = (texto) => (navigator.clipboard
  ? `<button type="button" class="btn btn--linea btn--chico" data-copiar="${esc(texto)}">Copiar</button>`
  : '');

function tarjetaPagoEnEspera(p) {
  const porTransferencia = p.procesador === 'transferencia';
  const t = porTransferencia ? TRANSFERENCIA : null;
  const pedido = fechaLarga(String(p.creado || '').slice(0, 10));

  /* Por transferencia y sin cuenta que enseñar (se apagó después de
     pedirlo): a quién escribir, nunca una cuenta inventada. */
  const como = !porTransferencia
    ? '<p class="transferencia__nota">El pago está en proceso con la pasarela.</p>'
    : t
      ? `<ul class="transferencia__pasos">
          <li>Ponga la referencia en el concepto de la transferencia.</li>
          <li>Envíe el comprobante de la transferencia a <a href="${esc(enlaceComprobante(t.correo, p.referencia))}">${esc(t.correo)}</a>.</li>
          <li>Los días de su membresía empiezan a contar cuando confirmemos el ingreso.</li>
        </ul>`
      : `<p class="transferencia__aviso">${esc(AVISO_TRANSFERENCIA
        || 'Escríbanos al correo de facturación con la referencia para completar este pago.')}</p>`;

  return `<div class="transferencia" data-pago="${esc(p.id)}">
    <h4 class="transferencia__titulo">${esc(p.concepto || 'Membresía')}</h4>
    <p class="transferencia__ref">
      <span class="transferencia__rotulo">Referencia</span>
      <b class="transferencia__codigo">${esc(p.referencia)}</b>
      ${botonCopiar(p.referencia)}
    </p>
    <dl class="transferencia__cuenta">
      <div><dt>Importe</dt><dd class="num">${pesos(Number(p.total) || 0)}</dd></div>
      ${pedido ? `<div><dt>Pedido el</dt><dd>${esc(pedido)}</dd></div>` : ''}
      ${t ? `
      <div><dt>Banco</dt><dd>${esc(t.banco)}</dd></div>
      <div><dt>Titular</dt><dd>${esc(t.titular)}</dd></div>
      <div><dt>RNC</dt><dd class="num">${esc(t.rnc)}</dd></div>
      <div><dt>Tipo de cuenta</dt><dd>${esc(TIPOS_CUENTA[t.tipoCuenta] || t.tipoCuenta)}</dd></div>
      <div><dt>Número de cuenta</dt><dd class="num">${esc(t.cuenta)}</dd></div>` : ''}
    </dl>
    ${como}
  </div>`;
}

/* Encima de las membresías y también cuando todavía no hay ninguna: el
   primer pedido de una cuenta nueva es justo el caso de «pagué y no veo
   nada». Sin pendientes no se pinta nada y el panel queda como antes. */
function pagosEnEsperaHTML() {
  if (!PAGOS_PENDIENTES.length) return '';
  return `<section class="pagos-espera" aria-labelledby="t-pagos-espera">
    <h3 class="transferencia__titulo" id="t-pagos-espera">Pagos en espera de confirmación</h3>
    <p class="panel__texto">Sus cupos aparecerán aquí cuando confirmemos el ingreso; le enviaremos el comprobante fiscal por correo.</p>
    ${PAGOS_PENDIENTES.map(tarjetaPagoEnEspera).join('')}
  </section>`;
}

/* ── Métricas de cabecera ───────────────────────────────── */

function tarjetaMetrica(icono_, valor, rotulo, detalle) {
  return `<li class="metrica">
    <span class="metrica__ico">${icono(icono_)}</span>
    <span class="metrica__cuerpo">
      <b class="metrica__num num">${valor}</b>
      <span class="metrica__rotulo">${esc(rotulo)}</span>
      ${detalle ? `<span class="metrica__detalle">${esc(detalle)}</span>` : ''}
    </span>
  </li>`;
}

function pintarMetricas(resumen) {
  const t = resumen.totales || {};
  const activos = ANUNCIOS.filter((a) => a.estado === 'activo').length;
  const inactivos = ANUNCIOS.length - activos;
  const contactos = (t.telefono || 0) + (t.whatsapp || 0);

  /* La tasa de contacto es el dato que de verdad dice si un anuncio
     funciona: mil visitas sin una llamada es un problema de precio o
     de fotos, no de tráfico.

     Con muy pocas visitas no se publica el porcentaje. Sobre cuatro
     visitas, un solo contacto da "25 %", una cifra que parece precisa
     y no lo es; y cualquier variación la mueve de golpe. Por debajo
     del mínimo se dice el número en bruto, que no engaña a nadie. */
  const MINIMO_TASA = 20;
  const tasa = !t.vistas
    ? 'Aún sin visitas'
    : t.vistas < MINIMO_TASA
      ? `Sobre ${miles(t.vistas)} ${t.vistas === 1 ? 'visita' : 'visitas'}`
      : `${Math.round((contactos / t.vistas) * 100)} % de quienes vieron sus anuncios`;

  $('#metricas').innerHTML = [
    tarjetaMetrica('i-ojo', miles(t.vistas || 0), 'Visualizaciones', 'Últimos 30 días'),
    tarjetaMetrica('i-telefono', miles(contactos), 'Contactos', tasa),
    tarjetaMetrica('i-grafico', miles(activos), 'Anuncios activos', `${inactivos} inactivo${inactivos === 1 ? '' : 's'}`),
    tarjetaMetrica('i-estrella', miles(t.favoritos || 0), 'Guardados', 'Compradores que lo marcaron'),
  ].join('');
}

/* ── Estado del plan ────────────────────────────────────── */

function pintarPlan() {
  const caja = $('#panelPlan');
  const org = SESION.organizacion || {};

  if (!MEMBRESIAS.length) {
    caja.innerHTML = `
      <h2 class="panel__titulo" id="t-plan"><em>Sin</em> cupos contratados</h2>
      <p class="panel__texto">Un cupo es el sitio que ocupa un equipo publicado. Elija el nivel y cuántos equipos quiere publicar; después reparte los cupos entre sus máquinas y los reutiliza cuando venda alguna.</p>
      ${pagosEnEsperaHTML()}
      <a class="btn btn--ambar" href="planes.html">Ver los planes</a>`;
    return;
  }

  const totalLibres = MEMBRESIAS.reduce((n, m) => (m.libres === null ? n : n + m.libres), 0);
  const sinLimite = MEMBRESIAS.some((m) => m.libres === null);

  caja.innerHTML = `
    <div class="panel__cabeza">
      <h2 class="panel__titulo panel__titulo--limpio" id="t-plan">
        <em>Sus</em> cupos
      </h2>
      <p class="panel__meta">
        ${sinLimite ? 'Puede publicar sin límite'
          : totalLibres > 0
            ? `${totalLibres} ${totalLibres === 1 ? 'cupo libre' : 'cupos libres'} para publicar`
            : 'Sin cupos libres'}
      </p>
    </div>

    ${pagosEnEsperaHTML()}

    <ul class="membresias">${MEMBRESIAS.map(tarjetaMembresia).join('')}</ul>

    <p class="acceso__aviso" id="avisoPlan" role="alert" hidden></p>

    <dl class="plan-estado">
      <div><dt>Página pública</dt>
        <dd>${org.tipo === 'dealer'
          ? `<a href="mi-pagina.html">Armar mi página de empresa</a>`
          : 'Solo para cuentas de empresa'}</dd></div>
      <div><dt>Sello de verificación</dt>
        <dd>${org.verificada ? 'Otorgado' : 'Pendiente de comprobar documentación'}</dd></div>
    </dl>

    ${totalLibres === 0 && !sinLimite
      ? `<p class="realce">${icono('i-aviso')} <span>No le quedan cupos libres. Añada cupos a una membresía —solo paga los días que le quedan— o marque un equipo como vendido para liberar el suyo.</span></p>`
      : ''}

    <div class="acciones acciones--pie">
      <a class="btn btn--linea" href="planes.html">Ver planes y contratar</a>
    </div>`;
}

/* ── Motor y transmisión ────────────────────────────────────
   El asistente los preguntaba y no los mandaba, así que hay camiones
   publicados con el hueco en blanco. Republicarlos costaría sus
   visitas y su antigüedad por un fallo que no cometió el anunciante,
   de modo que se editan aquí, en la misma fila.

   Solo aparece en los equipos que lo llevan: en una excavadora no
   significa nada. Y si falta el dato, el botón lo dice — en un
   cabezote es lo primero que pregunta el comprador. */
function filaTrenHTML(a) {
  const opciones = (mapa, sel) => Object.entries(mapa)
    .map(([id, m]) => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(m.nombre)}</option>`)
    .join('');

  const modelos = (mapa, marca, sel) => {
    const lista = (mapa[marca] || {}).modelos || [];
    return lista.map((m) => `<option value="${esc(m)}"${m === sel ? ' selected' : ''}>${esc(m)}</option>`).join('');
  };

  return `<tr class="tren-fila" data-tren-de="${esc(a.id)}">
    <td colspan="7">
      <div class="tren-edita">
        <label class="campo-v"><span>Marca del motor</span>
          <select data-campo="motorMarca">
            <option value="">Sin especificar</option>
            ${opciones(MOTORES, a.motor_marca)}
          </select>
        </label>
        <label class="campo-v"><span>Modelo del motor</span>
          <select data-campo="motorModelo"${a.motor_marca ? '' : ' disabled'}>
            <option value="">Sin especificar</option>
            ${a.motor_marca ? modelos(MOTORES, a.motor_marca, a.motor_modelo) : ''}
          </select>
        </label>
        <label class="campo-v"><span>Marca de la transmisión</span>
          <select data-campo="transmisionMarca">
            <option value="">Sin especificar</option>
            ${opciones(TRANSMISIONES, a.transmision_marca)}
          </select>
        </label>
        <label class="campo-v"><span>Modelo de la transmisión</span>
          <select data-campo="transmisionModelo"${a.transmision_marca ? '' : ' disabled'}>
            <option value="">Sin especificar</option>
            ${a.transmision_marca ? modelos(TRANSMISIONES, a.transmision_marca, a.transmision_modelo) : ''}
          </select>
        </label>
        <div class="tren-edita__pie">
          <button type="button" class="btn btn--ambar btn--chico" data-guardar-tren="${esc(a.id)}">Guardar</button>
          <span class="tren-edita__aviso" data-aviso-tren="${esc(a.id)}"></span>
        </div>
      </div>
    </td>
  </tr>`;
}

/* ── Tabla de anuncios ──────────────────────────────────── */

/* El plan de un equipo, y cómo cambiarlo. Es lo que faltaba: el plan
   se pegaba al anuncio al publicarlo y ahí se quedaba, así que quien
   compraba cinco Destacados no podía llevarse a ellos un camión que
   ya tenía publicado en Estándar. El cupo estaba pagado, libre y
   fuera de su alcance.

   Una membresía llena sigue apareciendo, deshabilitada y diciendo por
   qué. Esconderla haría pensar que no existe. */
function selectorPlan(a) {
  const actual = membresiaDe(a);

  // Vendido o retirado ya no ocupa cupo: no hay nada que mover.
  if (a.estado === 'vendido' || a.estado === 'retirado') {
    return `<span class="plan-celda__fijo">${esc(actual ? actual.plan_nombre : '—')}</span>`;
  }
  if (MEMBRESIAS.length < 2) {
    return `<span class="plan-celda__fijo">${esc(actual ? actual.plan_nombre : '—')}</span>`;
  }

  const opciones = MEMBRESIAS.map((m) => {
    const suya = actual && m.id === actual.id;
    const lleno = m.libres === 0 && !suya;
    const pocas = (a.fotos || a.total_fotos || 0) > m.fotos_maximas;
    const motivo = lleno ? ' · sin cupos libres'
      : pocas ? ` · admite ${m.fotos_maximas} fotos` : '';
    return `<option value="${esc(m.id)}"${suya ? ' selected' : ''}${lleno || pocas ? ' disabled' : ''}>${esc(m.plan_nombre)}${motivo}</option>`;
  }).join('');

  return `<label class="plan-celda">
    <span class="visualmente-oculto">Plan de ${esc(`${a.anio} ${a.marca} ${a.modelo}`)}</span>
    <select class="plan-celda__sel" data-plan-de="${esc(a.id)}">${opciones}</select>
  </label>`;
}

/* Fase 7 (CONF-01): lo que publicar.html le promete al vendedor sobre
   su número de serie, aquí a la vista. Antes esa diligencia no existía
   y el campo era decorativo; ahora sí se revisa, y el vendedor tiene
   que enterarse del resultado sin ir a buscarlo. */
function estadoSerieHTML(a) {
  if (!a.tiene_serie) return '';
  if (a.serie_revision === 'conforme') return '<span class="celda-equipo__meta">Serie cotejada por MercaMaquinarias</span>';
  if (a.serie_revision === 'observada') return `<span class="celda-equipo__meta">Serie con observaciones: ${esc(a.serie_nota || '')}</span>`;
  return '<span class="celda-equipo__meta">Serie: pendiente de revisión</span>';
}

function filaAnuncio(a) {
  const estado = ESTADOS[a.estado] || ESTADOS.borrador;
  const contactos = (a.telefono || 0) + (a.whatsapp || 0);
  const precio = a.precio != null
    ? (a.moneda === 'USD' ? 'US$' : 'RD$') + miles(a.precio)
    : 'Sin precio';

  return `<tr data-id="${esc(a.id)}">
    <th scope="row" class="celda-equipo">
      <span class="celda-equipo__foto">${a.foto
        ? `<img src="${esc(a.foto)}" alt="">`
        : icono('i-hex-doble', 'fantasma fantasma--sm')}</span>
      <span>
        <a class="celda-equipo__nombre" href="equipo.html?id=${encodeURIComponent(a.id)}">${esc(`${a.anio} ${a.marca} ${a.modelo}`)}</a>
        <span class="celda-equipo__meta num">${esc(precio)}${a.provincia ? ` · ${esc(a.provincia)}` : ''}</span>
        ${estadoSerieHTML(a)}
      </span>
    </th>
    <td><span class="estado ${estado.clase}">${estado.nombre}</span></td>
    <td class="col-num num">${miles(a.vistas || 0)}</td>
    <td class="col-num num">${miles(contactos)}</td>
    <td>${selectorPlan(a)}</td>
    <td>${textoVigencia(a)}</td>
    <td class="col-acciones">
      ${a.estado === 'activo'
        ? '<button type="button" class="btn-tabla" data-accion="pausado">Pausar</button>'
        : a.estado === 'pausado'
          ? '<button type="button" class="btn-tabla" data-accion="activo">Reactivar</button>'
          : ''}
      ${a.estado !== 'vendido'
        ? '<button type="button" class="btn-tabla btn-tabla--fuerte" data-accion="vendido">Marcar vendido</button>'
        : ''}
      ${pideTrenMotriz(a.subcategoria)
        ? `<button type="button" class="btn-tabla${a.motor_marca ? '' : ' btn-tabla--avisa'}" data-tren="${esc(a.id)}">
             ${a.motor_marca ? 'Motor' : 'Falta el motor'}
           </button>`
        : ''}
      <button type="button" class="btn-tabla btn-tabla--borrar" data-borrar="${esc(a.id)}"
        aria-label="Eliminar ${esc(`${a.anio} ${a.marca} ${a.modelo}`)}">Eliminar</button>
    </td>
  </tr>`;
}

function pintarTabla() {
  const lista = FILTRO === 'todos'
    ? ANUNCIOS
    : FILTRO === 'activos'
      ? ANUNCIOS.filter((a) => a.estado === 'activo')
      : ANUNCIOS.filter((a) => a.estado !== 'activo');

  // La fila del tren motriz se dibuja debajo de su anuncio y solo
  // cuando está abierta: la tabla no carga cuatro selectores por cada
  // camión que nadie ha pedido editar.
  $('#filasAnuncios').innerHTML = lista
    .map((a) => filaAnuncio(a) + (TREN_ABIERTO === a.id ? filaTrenHTML(a) : ''))
    .join('');

  const vacia = $('#tablaVacia');
  vacia.hidden = lista.length > 0;
  vacia.textContent = ANUNCIOS.length
    ? 'Ningún anuncio en este estado.'
    : 'Todavía no ha publicado ningún equipo.';
}

function pintarFiltros() {
  const activos = ANUNCIOS.filter((a) => a.estado === 'activo').length;
  const opciones = [
    ['todos', `Todos (${ANUNCIOS.length})`],
    ['activos', `Activos (${activos})`],
    ['inactivos', `Inactivos (${ANUNCIOS.length - activos})`],
  ];
  $('#filtrosPanel').innerHTML = opciones.map(([id, rotulo]) =>
    `<button type="button" class="filtro-panel${FILTRO === id ? ' filtro-panel--activo' : ''}" data-filtro="${id}">${esc(rotulo)}</button>`).join('');
}

/* ── Perfil de empresa ──────────────────────────────────── */

/* Un particular puede registrar su RNC desde aquí y convertirse en
   dealer sin abrir otra cuenta ni volver a publicar sus equipos: la
   organización ya existe, solo cambia de tipo. */
function pintarEmpresa() {
  const caja = $('#panelEmpresa');
  const org = SESION.organizacion;
  if (!org) return;
  caja.hidden = false;

  if (org.tipo === 'dealer') {
    // Publicar exige las dos llaves: revisión aprobada y plan que
    // incluya perfil. Se dicen por separado para que quien espera sepa
    // cuál le falta en vez de ver un "no" sin explicación.
    const revision = {
      pendiente: {
        clase: 'pastilla--ambar',
        rotulo: 'En revisión',
        nota: 'Estamos comprobando los datos de la empresa. Le escribiremos al correo de la cuenta en cuanto terminemos, normalmente en menos de 24 horas hábiles. Mientras tanto puede preparar sus equipos: se publicarán al aprobarse la cuenta.',
      },
      aprobada: {
        clase: 'pastilla--verde',
        rotulo: 'Aprobada',
        nota: 'Su empresa está aprobada. La página pública aparece en el directorio mientras tenga cupos Premium activos.',
      },
      rechazada: {
        clase: 'pastilla--roja',
        rotulo: 'No aprobada',
        nota: 'No pudimos confirmar los datos de la empresa. Escríbanos desde <a href="contacto.html">contacto</a> con la documentación corregida y la revisamos de nuevo.',
      },
    }[org.estadoRevision] || { clase: '', rotulo: '—', nota: '' };

    const aprobada = org.estadoRevision === 'aprobada';

    caja.innerHTML = `
      <h2 class="panel__titulo" id="t-empresa"><em>Perfil</em> de la empresa</h2>
      <dl class="plan-estado">
        <div><dt>Razón social</dt><dd>${esc(org.nombre)}</dd></div>
        <div><dt>RNC registrado</dt><dd class="num">${esc(org.rncMascara || '—')}</dd></div>
        <div><dt>Estado de la solicitud</dt>
          <dd><span class="pastilla ${revision.clase}">${esc(revision.rotulo)}</span></dd></div>
        <div><dt>Dirección pública</dt><dd>${aprobada && org.slug
          ? `<a href="dealer.html?d=${encodeURIComponent(org.slug)}">/dealer.html?d=${esc(org.slug)}</a>`
          : 'Al aprobarse la cuenta'}</dd></div>
        <div><dt>Visible en el directorio</dt><dd>${aprobada
          ? (org.perfilPublico ? 'Sí' : 'Al contratar cupos Premium')
          : 'No, hasta que se apruebe'}</dd></div>
      </dl>
      <p class="panel__nota">${revision.nota}</p>
      <p class="panel__nota">Mostramos solo los últimos dígitos del RNC. Es un dato reservado: lo usamos para comprobar que la empresa existe y nunca aparece en su página pública ni en el directorio.</p>
      <p class="panel__nota">El nombre, la descripción, el logotipo y los contactos que se enseñan al público se cambian desde <a href="mi-pagina.html">su página de empresa</a>.</p>`;
    return;
  }

  caja.innerHTML = `
    <h2 class="panel__titulo" id="t-empresa"><em>¿Comercializa</em> maquinaria de forma habitual?</h2>
    <p class="panel__texto">Solicite la cuenta de empresa: revisamos los datos y, una vez aprobada, se genera su página pública con todo el inventario y aparece en el directorio al contratar cupos del nivel Premium. Los equipos que ya publicó se mantienen.</p>
    <form class="form-rnc solicitud" id="formRnc" novalidate>
      <fieldset class="solicitud__bloque">
        <legend class="solicitud__titulo">La empresa</legend>
        <div class="campos">
          <label class="campo-v"><span>Razón social *</span>
            <input type="text" id="rnc-empresa" placeholder="Ej. Sur Maquinarias, SRL" autocomplete="organization">
          </label>
          <label class="campo-v"><span>RNC *</span>
            <input type="text" id="rnc-numero" inputmode="numeric" maxlength="11" placeholder="9 dígitos">
            <small class="campo-v__ayuda">Uso interno. No aparece en su página pública.</small>
          </label>
          <label class="campo-v"><span>Nombre comercial</span>
            <input type="text" id="rnc-comercial" placeholder="Si opera con otro nombre">
          </label>
          <label class="campo-v"><span>Años operando</span>
            <input type="number" id="rnc-anios" inputmode="numeric" min="0" max="120" placeholder="Ej. 8">
          </label>
        </div>
      </fieldset>

      <fieldset class="solicitud__bloque">
        <legend class="solicitud__titulo">Quién responde por la empresa</legend>
        <div class="campos">
          <label class="campo-v"><span>Encargado o representante *</span>
            <input type="text" id="rnc-encargado" placeholder="Nombre y apellido">
          </label>
          <label class="campo-v"><span>Cargo</span>
            <input type="text" id="rnc-cargo" placeholder="Ej. Gerente de ventas">
          </label>
        </div>
      </fieldset>

      <fieldset class="solicitud__bloque">
        <legend class="solicitud__titulo">Su operación</legend>
        <div class="campos">
          <label class="campo-v"><span>Equipos en inventario</span>
            <input type="number" id="rnc-inventario" inputmode="numeric" min="0" placeholder="Ej. 24">
          </label>
          <label class="campo-v"><span>Equipos que desea publicar</span>
            <input type="number" id="rnc-publicar" inputmode="numeric" min="0" placeholder="Ej. 12">
          </label>
          <label class="campo-v campo-v--ancho"><span>Tipos de equipo</span>
            <input type="text" id="rnc-tipos" placeholder="Ej. excavadoras, retroexcavadoras, plantas eléctricas">
          </label>
          <label class="campo-v campo-v--ancho"><span>Descripción de la empresa</span>
            <textarea id="rnc-descripcion" placeholder="A qué se dedica, desde cuándo opera y qué marcas maneja. Se muestra en su página pública."></textarea>
          </label>
        </div>
      </fieldset>

      <p class="acceso__aviso" id="avisoRnc" role="alert" hidden></p>
      <button class="btn btn--ambar btn--grande" type="submit">Enviar la solicitud</button>
      <p class="panel__nota">Al enviarla, su cuenta queda en revisión. Le escribimos al correo de la cuenta con el resultado.</p>
    </form>`;

  $('#formRnc').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const aviso = $('#avisoRnc');
    aviso.hidden = true;

    const fallar = (mensaje) => {
      aviso.hidden = false;
      aviso.textContent = mensaje;
    };

    if ($('#rnc-numero').value.replace(/\D/g, '').length !== 9) {
      return fallar('El RNC de la empresa tiene 9 dígitos.');
    }
    if (!$('#rnc-encargado').value.trim()) {
      return fallar('Indique quién responde por la empresa.');
    }

    try {
      const datos = await api('/dealer/registro', {
        metodo: 'POST',
        cuerpo: {
          empresa: $('#rnc-empresa').value.trim(),
          rnc: $('#rnc-numero').value.trim(),
          descripcion: $('#rnc-descripcion').value.trim(),
          nombreComercial: $('#rnc-comercial').value.trim(),
          aniosOperando: $('#rnc-anios').value,
          encargado: $('#rnc-encargado').value.trim(),
          cargo: $('#rnc-cargo').value.trim(),
          equiposInventario: $('#rnc-inventario').value,
          equiposPublicar: $('#rnc-publicar').value,
          tiposEquipo: $('#rnc-tipos').value.trim(),
        },
      });
      if (!datos) throw new Error('No hay conexión con el servidor.');
      SESION.organizacion = datos.organizacion;
      pintarEmpresa();
      location.reload();
    } catch (e) {
      fallar(e.message);
    }
  });
}

/* ── Sucursales ─────────────────────────────────────────── */

let SUCURSALES = [];
let editando = null;      // id de la sucursal en edición, o null si es nueva

const telefonoDominicano = (v) => {
  const d = String(v || '').replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
};

function sucursalAdminHTML(s) {
  const donde = [s.municipio, s.provincia].filter(Boolean).join(', ');
  return `<li class="suc-admin${s.principal ? ' suc-admin--principal' : ''}" data-id="${esc(s.id)}">
    <span class="suc-admin__ico">${icono('i-pin')}</span>
    <span class="suc-admin__cuerpo">
      <b class="suc-admin__nombre">${esc(s.nombre)}
        ${s.principal && !/principal/i.test(s.nombre)
          ? '<span class="pastilla pastilla--azul">Oficina principal</span>' : ''}</b>
      <span class="suc-admin__meta">${esc(s.direccion || 'Sin dirección')}${donde ? ` · ${esc(donde)}` : ''}</span>
      <span class="suc-admin__meta num">${esc(s.telefono || 'Sin teléfono')}${s.whatsapp ? ` · WhatsApp ${esc(s.whatsapp)}` : ''}${s.horario ? ` · ${esc(s.horario)}` : ''}</span>
    </span>
    <span class="suc-admin__acciones">
      <button type="button" class="btn-tabla" data-editar>Editar</button>
      ${s.principal
        ? ''
        : `<button type="button" class="btn-tabla" data-principal>Hacer principal</button>
           <button type="button" class="btn-tabla btn-tabla--quitar" data-quitar>Retirar</button>`}
    </span>
  </li>`;
}

function pintarSucursales() {
  const caja = $('#panelSucursales');
  const org = SESION.organizacion || {};
  // Las sucursales son de las cuentas de empresa: un particular no
  // tiene nada que administrar aquí.
  caja.hidden = org.tipo !== 'dealer';
  if (caja.hidden) return;

  $('#listaSucursalesAdmin').innerHTML = SUCURSALES.map(sucursalAdminHTML).join('');
}

function abrirFormularioSucursal(s) {
  editando = s ? s.id : null;
  $('#tituloSucursal').textContent = s ? `Editar ${s.nombre}` : 'Nueva sucursal';
  $('#suc-nombre').value = s ? s.nombre : '';
  $('#suc-telefono').value = s ? (s.telefono || '') : '';
  $('#suc-direccion').value = s ? (s.direccion || '') : '';
  $('#suc-provincia').value = s ? (s.provincia || '') : '';
  $('#suc-municipio').value = s ? (s.municipio || '') : '';
  $('#suc-whatsapp').value = s ? (s.whatsapp || '') : '';
  $('#suc-horario').value = s ? (s.horario || '') : '';
  $('#avisoSucursal').hidden = true;
  $('#formSucursal').hidden = false;
  $('#suc-nombre').focus();
}

const cerrarFormularioSucursal = () => {
  $('#formSucursal').hidden = true;
  editando = null;
};

async function montarSucursales() {
  const caja = $('#panelSucursales');
  if (!caja || (SESION.organizacion || {}).tipo !== 'dealer') return;

  const datos = await api('/sucursales', { silencioso: true });
  SUCURSALES = (datos && datos.sucursales) || [];
  pintarSucursales();

  ['#suc-telefono', '#suc-whatsapp'].forEach((sel) => {
    const campo = $(sel);
    campo.addEventListener('input', () => { campo.value = telefonoDominicano(campo.value); });
  });

  $('#btnNuevaSucursal').addEventListener('click', () => abrirFormularioSucursal(null));
  $('#btnCancelarSucursal').addEventListener('click', cerrarFormularioSucursal);

  $('#listaSucursalesAdmin').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const idSucursal = btn.closest('.suc-admin').dataset.id;
    const s = SUCURSALES.find((x) => x.id === idSucursal);

    if (btn.hasAttribute('data-editar')) return abrirFormularioSucursal(s);

    if (btn.hasAttribute('data-principal')) {
      const r = await api(`/sucursales/${encodeURIComponent(idSucursal)}`, {
        metodo: 'PATCH', cuerpo: { principal: true }, silencioso: true,
      });
      if (r) { SUCURSALES = r.sucursales; pintarSucursales(); }
      return;
    }

    if (btn.hasAttribute('data-quitar')) {
      if (!confirm(`¿Retirar la sucursal ${s.nombre}? Sus anuncios publicados no se borran.`)) return;
      const r = await api(`/sucursales/${encodeURIComponent(idSucursal)}`, { metodo: 'DELETE', silencioso: true });
      if (r) { SUCURSALES = r.sucursales; pintarSucursales(); }
    }
  });

  $('#formSucursal').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const aviso = $('#avisoSucursal');
    aviso.hidden = true;

    const cuerpo = {
      nombre: $('#suc-nombre').value.trim(),
      telefono: $('#suc-telefono').value.trim(),
      direccion: $('#suc-direccion').value.trim(),
      provincia: $('#suc-provincia').value,
      municipio: $('#suc-municipio').value.trim(),
      whatsapp: $('#suc-whatsapp').value.trim(),
      horario: $('#suc-horario').value,
    };

    try {
      const r = editando
        ? await api(`/sucursales/${encodeURIComponent(editando)}`, { metodo: 'PATCH', cuerpo })
        : await api('/sucursales', { metodo: 'POST', cuerpo });
      if (!r) throw new Error('No hay conexión con el servidor.');

      const lista = await api('/sucursales', { silencioso: true });
      SUCURSALES = (lista && lista.sucursales) || SUCURSALES;
      pintarSucursales();
      cerrarFormularioSucursal();
    } catch (e) {
      aviso.hidden = false;
      aviso.textContent = e.message;
    }
  });
}

/* ── Arranque ───────────────────────────────────────────── */

async function montarPanel() {
  if (!$('#panelContenido')) return;

  await cargarSesion();
  $('#panelCargando').hidden = true;

  if (!haySesion()) {
    $('#panelSinSesion').hidden = false;
    return;
  }

  /* Los pagos en espera solo vienen en /membresias; /mis-anuncios no los
     trae. Se piden a la vez para no alargar la carga del panel. */
  const [datos, cuenta] = await Promise.all([
    api('/mis-anuncios', { silencioso: true }),
    api('/membresias', { silencioso: true }),
  ]);
  if (!datos) {
    $('#panelSinSesion').hidden = false;
    return;
  }

  ANUNCIOS = datos.anuncios || [];
  MEMBRESIAS = datos.membresias || [];
  EXENTA = !!datos.exenta;
  guardarPagos(cuenta);
  $('#panelContenido').hidden = false;

  /* Sin esperarlo: los comprobantes son una sección más del panel y no
     tienen por qué retrasar lo que el anunciante viene a ver, que son
     sus anuncios. */
  montarFacturas();

  const org = SESION.organizacion || {};
  $('#panelTitulo').innerHTML = `<em>${esc((org.nombre || SESION.usuario.nombre).split(/[\s,]+/)[0])}</em> ${esc((org.nombre || '').replace(/^\S+\s*/, ''))}`;
  // Atajo a la cola de revisión para quien la atiende. El permiso lo
  // comprueba la API en cada llamada; esto solo evita teclear la URL.
  if (SESION.usuario.esAdmin) $('#enlaceAdmin').hidden = false;

  const estadoEmpresa = { pendiente: 'en revisión', rechazada: 'no aprobada' }[org.estadoRevision];
  $('#panelSub').textContent = org.tipo === 'dealer'
    ? `Cuenta de empresa${estadoEmpresa ? ` (${estadoEmpresa})` : ''} · ${SESION.usuario.correo}`
    : `Cuenta particular · ${SESION.usuario.correo}`;

  pintarMetricas(datos.resumen || {});
  pintarPlan();
  pintarFiltros();
  pintarTabla();
  pintarEmpresa();
  await montarSucursales();

  /* Vuelve a pedir las membresías y repinta. Se llama después de todo
     lo que mueve un cupo —publicar no, que eso recarga la página, pero
     sí vender, mover o ampliar—, porque los cupos libres cambian y la
     tabla tiene que reflejarlo al momento. */
  async function refrescarCupos() {
    const r = await api('/membresias', { silencioso: true });
    if (r) MEMBRESIAS = r.membresias || MEMBRESIAS;
    guardarPagos(r);
    pintarPlan();
    pintarTabla();
  }

  function avisoPlan(mensaje, error = true) {
    const el = $('#avisoPlan');
    if (!el) return;
    el.hidden = !mensaje;
    el.textContent = mensaje || '';
    el.classList.toggle('acceso__aviso--ok', !error);
  }

  /* Mover un equipo de una membresía a otra. El <select> se deja
     deshabilitado mientras dura la llamada y, si el servidor la
     rechaza, vuelve a marcar el plan que tenía: no se queda enseñando
     un cambio que no ocurrió. */
  $('#filasAnuncios').addEventListener('change', async (ev) => {
    const sel = ev.target.closest('[data-plan-de]');
    if (!sel) return;

    const idAnuncio = sel.dataset.planDe;
    const anuncio = ANUNCIOS.find((a) => a.id === idAnuncio);
    const antes = anuncio && anuncio.suscripcion_id;

    sel.disabled = true;
    avisoPlan('');
    try {
      const r = await api(`/anuncios/${encodeURIComponent(idAnuncio)}/plan`, {
        metodo: 'PATCH', cuerpo: { membresia: sel.value },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');

      if (anuncio) {
        anuncio.suscripcion_id = sel.value;
        anuncio.vence = r.anuncio ? r.anuncio.vence : anuncio.vence;
      }
      const nombre = (MEMBRESIAS.find((m) => m.id === sel.value) || {}).plan_nombre || '';
      await refrescarCupos();
      avisoPlan(`${anuncio ? `${anuncio.anio} ${anuncio.marca} ${anuncio.modelo}` : 'El anuncio'} pasó a ${nombre}.`, false);
    } catch (e) {
      sel.value = antes || sel.value;
      avisoPlan(e.message);
    } finally {
      sel.disabled = false;
    }
  });

  /* «Copiar» la referencia de un pago en espera. Si el navegador niega
     el portapapeles no se dice nada: la referencia sigue a la vista. */
  $('#panelPlan').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-copiar]');
    if (!btn) return;
    try {
      await navigator.clipboard.writeText(btn.dataset.copiar);
      btn.textContent = 'Copiada';
    } catch (_) { /* sin portapapeles: caída silenciosa */ }
  });

  /* Añadir cupos a una membresía viva. Se pregunta cuántos y se dice
     lo que cuesta ANTES de cobrarlo: prorrateado por los días que
     queden, que casi siempre es bastante menos de lo que la gente
     espera. */
  $('#panelPlan').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-ampliar]');
    if (!btn) return;

    const m = MEMBRESIAS.find((x) => x.id === btn.dataset.ampliar);
    if (!m) return;

    const cuantos = prompt(
      `¿Cuántos equipos quiere poder publicar en total con su membresía ${m.plan_nombre}?\n\n`
      + `Ahora tiene ${m.anuncios_incluidos}. Solo paga los días que le quedan, `
      + `y cada quinto cupo no se cobra.`,
      String(m.anuncios_incluidos + 1));
    if (cuantos === null) return;

    const cupo = Number(String(cuantos).replace(/\D+/g, ''));
    if (!cupo || cupo <= m.anuncios_incluidos) {
      avisoPlan(`Indique una cantidad mayor que ${m.anuncios_incluidos}.`);
      return;
    }

    // La cifra se calcula aquí con el mismo módulo que usa el
    // servidor, así que lo que se confirma es lo que se cobra.
    const previo = precioAmpliacion({
      precioUnitario: m.precio_unitario,
      cupoActual: m.anuncios_incluidos,
      cupoNuevo: cupo,
      dias: m.dias_ciclo || 30,
      diasRestantes: diasHasta(m.fin) ?? (m.dias_ciclo || 30),
    });

    const cuantoMas = cupo - m.anuncios_incluidos;
    const texto = EXENTA || previo.total === 0
      ? `Añadir ${cuantoMas} ${cuantoMas === 1 ? 'cupo' : 'cupos'} sin costo. ¿Confirma?`
      : `Añadir ${cuantoMas} ${cuantoMas === 1 ? 'cupo' : 'cupos'} cuesta ${pesos(previo.total)} `
        + `(${pesos(previo.subtotal)} + ITBIS ${pesos(previo.itbis)}) por los días que le quedan.\n\n¿Confirma?`;
    if (!confirm(texto)) return;

    btn.disabled = true;
    try {
      const r = await api(`/membresias/${encodeURIComponent(m.id)}/ampliar`, {
        metodo: 'POST', cuerpo: { cupo },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');
      await refrescarCupos();

      /* 202: la ampliación quedó pedida, no hecha. La membresía sigue
         con los cupos que tenía y el pago aparece arriba, en «Pagos en
         espera», con la referencia y los datos. Decir aquí que «pasó a
         N cupos» era lo que hacía la fase 3 con un pago sin cobrar. */
      if (r.pago && r.pago.estado === 'pendiente') {
        avisoPlan(r.aviso || 'Su pago quedó en espera de confirmación.', false);
        return;
      }
      avisoPlan(`Su membresía ${m.plan_nombre} pasó a ${cupo} cupos.`, false);
    } catch (e) {
      avisoPlan(e.message);
      btn.disabled = false;
    }
  });

  /* Abrir y cerrar el editor de motor y transmisión. */
  $('#filasAnuncios').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-tren]');
    if (!btn) return;
    TREN_ABIERTO = TREN_ABIERTO === btn.dataset.tren ? null : btn.dataset.tren;
    pintarTabla();
  });

  /* Eliminar un anuncio.

     Se avisa de las dos cosas que importan y que no se pueden
     deshacer: se van las fotos y se van las estadísticas. Quien solo
     quiere dejar de venderlo tiene «Marcar vendido», que conserva
     ambas, y se lo decimos aquí mismo para que no elija mal. */
  $('#filasAnuncios').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-borrar]');
    if (!btn) return;

    const id = btn.dataset.borrar;
    const a = ANUNCIOS.find((x) => x.id === id);
    const nombre = a ? `${a.anio} ${a.marca_nombre || a.marca} ${a.modelo}` : 'este anuncio';

    if (!confirm(
      `¿Eliminar ${nombre}?\n\n`
      + 'Se borran el anuncio, sus fotografías y sus estadísticas, y no se puede deshacer. '
      + 'Su cupo queda libre para publicar otro equipo.\n\n'
      + 'Si solo quiere dejar de venderlo, use «Marcar vendido»: conserva las visitas y los contactos.')) return;

    btn.disabled = true;
    btn.textContent = 'Eliminando…';
    try {
      const r = await api(`/anuncios/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
      if (!r) throw new Error('No hay conexión con el servidor.');

      ANUNCIOS = ANUNCIOS.filter((x) => x.id !== id);
      if (TREN_ABIERTO === id) TREN_ABIERTO = null;
      MEMBRESIAS = r.membresias || MEMBRESIAS;

      pintarFiltros();
      pintarPlan();
      pintarTabla();
      avisoPlan(`${nombre} se eliminó. Su cupo vuelve a estar libre.`, false);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Eliminar';
      avisoPlan(`No se pudo eliminar: ${e.message}`);
    }
  });

  /* Los modelos dependen de la marca, igual que al publicar: una lista
     con todos los modelos de todos los fabricantes deja meter un motor
     Cummins con un modelo Detroit. */
  $('#filasAnuncios').addEventListener('change', (ev) => {
    const sel = ev.target.closest('[data-campo]');
    if (!sel) return;
    const campo = sel.dataset.campo;
    if (campo !== 'motorMarca' && campo !== 'transmisionMarca') return;

    const fila = sel.closest('.tren-fila');
    const esMotor = campo === 'motorMarca';
    const mapa = esMotor ? MOTORES : TRANSMISIONES;
    const destino = fila.querySelector(`[data-campo="${esMotor ? 'motorModelo' : 'transmisionModelo'}"]`);

    const modelos = (mapa[sel.value] || {}).modelos || [];
    destino.innerHTML = '<option value="">Sin especificar</option>'
      + modelos.map((m) => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
    destino.disabled = !sel.value;
  });

  $('#filasAnuncios').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-guardar-tren]');
    if (!btn) return;

    const id = btn.dataset.guardarTren;
    const fila = btn.closest('.tren-fila');
    const aviso = fila.querySelector('[data-aviso-tren]');
    const valor = (campo) => (fila.querySelector(`[data-campo="${campo}"]`) || {}).value || '';

    btn.disabled = true;
    aviso.textContent = '';
    aviso.classList.remove('tren-edita__aviso--error');
    try {
      const r = await api(`/anuncios/${encodeURIComponent(id)}/tren-motriz`, {
        metodo: 'PATCH',
        cuerpo: {
          motorMarca: valor('motorMarca'),
          motorModelo: valor('motorModelo'),
          transmisionMarca: valor('transmisionMarca'),
          transmisionModelo: valor('transmisionModelo'),
        },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');

      // Se refleja en memoria para que el botón de la fila deje de
      // avisar sin tener que recargar la página.
      const a = ANUNCIOS.find((x) => x.id === id);
      if (a) Object.assign(a, {
        motor_marca: r.anuncio.motor_marca,
        motor_modelo: r.anuncio.motor_modelo,
        transmision_marca: r.anuncio.transmision_marca,
        transmision_modelo: r.anuncio.transmision_modelo,
      });
      aviso.textContent = 'Guardado. Ya se ve en el anuncio.';
      setTimeout(() => { TREN_ABIERTO = null; pintarTabla(); }, 1200);
    } catch (e) {
      aviso.textContent = e.message;
      aviso.classList.add('tren-edita__aviso--error');
      btn.disabled = false;
    }
  });

  $('#filtrosPanel').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-filtro]');
    if (!btn) return;
    FILTRO = btn.dataset.filtro;
    pintarFiltros();
    pintarTabla();
  });

  // Cambiar el estado de un anuncio: se pide al servidor y se refleja
  // en memoria, sin recargar toda la página.
  $('#filasAnuncios').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-accion]');
    if (!btn) return;
    const fila = btn.closest('tr');
    const idAnuncio = fila.dataset.id;
    const estado = btn.dataset.accion;

    // Vender libera el cupo, que es medio motivo para hacerlo. Se dice
    // aquí para que nadie descubra después que podía haber publicado
    // otro equipo sin pagar.
    if (estado === 'vendido' && !confirm(
      '¿Marcar este equipo como vendido?\n\n'
      + 'El anuncio deja de aparecer en el catálogo y su cupo queda libre '
      + 'para publicar otra máquina sin volver a pagar.')) return;

    btn.disabled = true;
    const r = await api(`/anuncios/${encodeURIComponent(idAnuncio)}`, {
      metodo: 'PATCH', cuerpo: { estado }, silencioso: true,
    });
    if (!r) { btn.disabled = false; return; }

    const anuncio = ANUNCIOS.find((a) => a.id === idAnuncio);
    if (anuncio) anuncio.estado = estado;
    pintarFiltros();
    pintarMetricas(datos.resumen || {});
    await refrescarCupos();
  });

  $('#btnSalir').addEventListener('click', async () => {
    await api('/cuenta/salir', { metodo: 'POST', silencioso: true });
    location.href = 'index.html';
  });
}

/* ── Comprobantes ───────────────────────────────────────── */

/* Los comprobantes del cliente, con su PDF.
 *
 * La sección se esconde si no hay ninguno: quien nunca ha pagado no
 * necesita ver una tabla vacía explicándole que está vacía.
 *
 * Un comprobante anulado NO desaparece de la lista. Se marca. Quien
 * pagó y le devolvieron tiene derecho a ver las dos cosas, y una
 * factura que se esfuma del historial es exactamente lo que hace
 * desconfiar de un cobro. */
async function montarFacturas() {
  const cuerpo = $('#listaFacturas');
  if (!cuerpo || !haySesion()) return;

  const datos = await api('/facturas', { silencioso: true });
  const lista = (datos && datos.facturas) || [];
  if (!lista.length) return;

  $('#panelFacturas').hidden = false;
  cuerpo.innerHTML = lista.map((f) => {
    const cuando = new Date(f.fecha);
    return `<tr>
      <td class="num">${cuando.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
      <td class="num">${esc(f.numero)}
        ${f.ncf ? `<span class="tabla-legales__sub">NCF ${esc(f.ncf)}</span>` : ''}
        ${f.anulada ? '<span class="pastilla pastilla--ambar">anulada</span>' : ''}</td>
      <td>${esc(f.concepto || '')}</td>
      <td class="num">RD$${Number(f.total).toLocaleString('en-US')}</td>
      <td>
        <a class="btn btn--linea btn--chico" href="/api/facturas/${esc(f.id)}.html" target="_blank" rel="noopener">Ver</a>
        ${f.hayPdf
    ? `<a class="btn btn--linea btn--chico" href="/api/facturas/${esc(f.id)}.pdf" target="_blank" rel="noopener">PDF</a>`
    : ''}</td>
    </tr>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', montarPanel);
