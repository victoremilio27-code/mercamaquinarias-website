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
  const cuando = fechaCorta(a.vence);
  if (dias < 0 || a.estado === 'vencido') {
    return `<span class="vigencia vigencia--fin">Venció el ${esc(cuando)}</span>`;
  }

  /* Las ventanas del aviso son las mismas de los correos de vencimiento
     (7, 3 y 1 día, D-07): el panel y el correo dicen lo mismo el mismo
     día. Antes había un margen suelto de cinco días que no coincidía con
     ninguno de los dos avisos. Se calcula al pintar, sin guardar nada. */
  let aviso = '';
  let clase = 'vigencia';
  if (dias <= 1) {
    aviso = dias <= 0 ? 'Vence hoy' : 'Vence mañana';
    clase = 'vigencia vigencia--urgente';
  } else if (dias <= 7) {
    aviso = `Vence en ${dias} días`;
    clase = 'vigencia vigencia--pronto';
  }
  return `<span class="${clase}">Vence el ${esc(cuando)}</span>`
    + (aviso ? `<span class="vigencia__aviso ${clase.replace('vigencia ', '')}">${aviso}</span>` : '');
}

/* Fecha corta de un ISO completo o de solo el día. */
function fechaCorta(iso) {
  if (!iso) return '';
  return fechaLarga(String(iso).slice(0, 10)) || '';
}

/* Botón de renovar de la columna de acciones (MOD-09). Un anuncio de una
   suscripción de un solo cupo se renueva solo; el de un plan de varios
   cupos remite al plan entero, porque el precio y la fecha son del plan
   (D-04). Con una renovación ya pedida se enseña su referencia: pedir
   otra no cobraría dos veces, pero el botón sobraría. */
function accionRenovar(a) {
  if (!['activo', 'pausado', 'vencido'].includes(a.estado)) return '';
  if (a.renovacion_pendiente) {
    return `<span class="celda-nota">Renovación en espera · ref. ${esc(a.renovacion_pendiente)}</span>`;
  }
  if (!a.suscripcion_id || !a.suscripcion_fin) return '';
  if (a.suscripcion_cupo === 1) {
    return a.estado === 'vencido'
      ? `<button type="button" class="btn-tabla btn-tabla--fuerte" data-renovar="${esc(a.id)}">Renovar anuncio</button>`
      : `<button type="button" class="btn-tabla" data-renovar="${esc(a.id)}">Renovar ahora</button>`;
  }
  return `<button type="button" class="btn-tabla" data-renovar-plan="${esc(a.suscripcion_id)}">Renovar plan</button>`;
}

/* Renovaciones que ofrece /api/membresias (vigentes y vencidas), el
   método de pago que acepta el servidor y si existe la renovación
   automática. Se rellenan en la misma carga que los pagos en espera. */
let RENOVABLES = [];
let METODOS_PAGO = [];
let RENOVACION_AUTO = { disponible: false };
let RENOVAR_OBJETIVO = null;  // { idAnuncio, r } de la renovación abierta

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

/* El particular no compra cupos: paga cada publicación por separado
   (D-01, D-15 de la fase 05.2). Se usa para todo lo que cambia solo en
   su panel; el dealer sigue viendo exactamente lo de hoy. Una cuenta
   exenta no cuenta como "particular" a estos efectos: publica gratis y
   sin las reglas del modelo comercial nuevo, igual que un dealer
   exento, así que sigue viendo el lenguaje de cupos (que para ella no
   cuesta nada). */
const esParticular = () => (SESION.organizacion || {}).tipo === 'particular' && !EXENTA;

/* Año (salvo el "sin año" 1900 con el que nace un borrador, D-03),
   marca y modelo. Antes de escribir ninguno de los tres, un borrador
   recién creado no tiene nada que enseñar en su fila. */
function nombreDe(a) {
  const partes = [];
  if (a.anio && a.anio !== 1900) partes.push(a.anio);
  if (a.marca_nombre || a.marca) partes.push(a.marca_nombre || a.marca);
  if (a.modelo) partes.push(a.modelo);
  return partes.length ? partes.join(' ') : 'Borrador sin terminar';
}

function guardarPagos(r) {
  if (!r) return;
  PAGOS_PENDIENTES = r.pagosPendientes || [];
  TRANSFERENCIA = r.transferencia || null;
  AVISO_TRANSFERENCIA = r.avisoTransferencia || '';
  RENOVABLES = r.renovables || [];
  METODOS_PAGO = Array.isArray(r.metodosPago) ? r.metodosPago : [];
  RENOVACION_AUTO = r.renovacionAutomatica || { disponible: false };
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

/* «Vence el [fecha]» en las tarjetas de plan, con la misma fecha que ve
   el anuncio en la tabla; antes decía «Quedan N días», que obligaba a
   sumar para saber el día. */
function vigenciaPlan(m) {
  if (!m.fin) return 'Sin caducidad';
  return diasHasta(m.fin) > 0 ? `Vence el ${fechaCorta(m.fin)}` : `Venció el ${fechaCorta(m.fin)}`;
}

const renovableDe = (id) => RENOVABLES.find((r) => r.id === id) || null;

/* Lo que va al pie de una tarjeta de plan: «Renovar» (o la referencia si
   ya hay una renovación en espera) y, solo si existe la renovación
   automática, su interruptor. Apagada no se pinta nada: ni desactivado
   ni «próximamente» (D-12). */
function pieRenovarPlan(m) {
  const r = renovableDe(m.id);
  if (!r) return '';
  const accion = r.renovacion_pendiente
    ? `<span class="celda-nota">Renovación en espera · ref. ${esc(r.renovacion_pendiente)}</span>`
    : `<button type="button" class="btn btn--linea btn--chico" data-renovar-plan="${esc(r.id)}">Renovar</button>`;
  const auto = RENOVACION_AUTO.disponible
    ? `<label class="renovar-auto"><input type="checkbox" data-renovacion-auto="${esc(r.id)}"${r.renovacion_automatica ? ' checked' : ''}> Renovación automática</label>`
    : '';
  return `<span class="membresia__renovar">${accion}${auto}</span>`;
}

/* Planes que ya vencieron y se pueden volver a contratar sin rehacer
   nada: no salen en la lista de vigentes, así que sin este bloque no
   habría dónde renovarlos. */
function planesVencidosHTML() {
  const vencidos = RENOVABLES.filter((r) => r.vencida);
  if (!vencidos.length) return '';
  return `<section class="planes-vencidos" aria-labelledby="t-planes-vencidos">
    <h3 class="transferencia__titulo" id="t-planes-vencidos">Planes vencidos</h3>
    <ul class="membresias">${vencidos.map((r) => `<li class="membresia" data-membresia="${esc(r.id)}">
      <span class="membresia__cabeza">
        <b class="membresia__nivel">${esc(r.plan_nombre)}</b>
        <span class="membresia__vigencia">Venció el ${esc(fechaCorta(r.fin))}</span>
      </span>
      ${r.renovacion_pendiente
    ? `<span class="celda-nota">Renovación en espera · ref. ${esc(r.renovacion_pendiente)}</span>`
    : `<button type="button" class="btn btn--linea btn--chico" data-renovar-plan="${esc(r.id)}">Renovar plan</button>`}
    </li>`).join('')}</ul>
  </section>`;
}

function tarjetaMembresia(m) {
  const vigencia = vigenciaPlan(m);

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
    ${pieRenovarPlan(m)}
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
    <p class="panel__texto">${esParticular()
      ? 'Su anuncio se publica cuando confirmemos el ingreso; le enviaremos el comprobante fiscal por correo.'
      : 'Sus cupos aparecerán aquí cuando confirmemos el ingreso; le enviaremos el comprobante fiscal por correo.'}</p>
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
    tarjetaMetrica('i-estrella', miles(t.favoritos || 0), 'Guardados',
      `Compradores que lo guardaron · ${miles(t.compartidos || 0)} ${t.compartidos === 1 ? 'compartido' : 'compartidos'}`),
  ].join('');
}

/* ── Estado del plan ────────────────────────────────────── */

/* Sin barra de cupos ni «Añadir cupos»: para el particular la capacidad
   que le sobra en un plan no se amplía, se usa publicando otro equipo
   en su lugar (D-15). Ampliar es cosa de quien reparte cupos entre
   varias máquinas, que es el dealer. */
function tarjetaPlanParticular(m) {
  const vigencia = vigenciaPlan(m);
  const capacidad = m.anuncios_incluidos == null
    ? `${m.ocupados} publicados · sin límite`
    : `Capacidad para ${m.anuncios_incluidos} ${m.anuncios_incluidos === 1 ? 'equipo' : 'equipos'}, ${m.libres} ${m.libres === 1 ? 'disponible' : 'disponibles'}`;

  return `<li class="membresia${m.libres === 0 ? ' membresia--llena' : ''}" data-membresia="${esc(m.id)}">
    <span class="membresia__cabeza">
      <b class="membresia__nivel">${esc(m.plan_nombre)}</b>
      <span class="membresia__vigencia">${esc(vigencia)}</span>
    </span>
    <span class="membresia__cupo num">${esc(capacidad)}</span>
    ${pieRenovarPlan(m)}
  </li>`;
}

/* El particular no reparte cupos entre equipos: cada publicación es su
   propio plan, pagado aparte (D-01, D-15). Antes esta caja hablaba de
   "cupos" para cualquier cuenta, y un particular sin ese vocabulario
   técnico terminaba preguntando qué es un cupo. */
function pintarPlanParticular(caja, org) {
  const activas = ANUNCIOS.filter((a) => a.estado === 'activo').length;
  const conCapacidad = MEMBRESIAS.some((m) => m.libres === null || m.libres > 0);

  if (!MEMBRESIAS.length) {
    caja.innerHTML = `
      <h2 class="panel__titulo" id="t-plan"><em>Sus</em> publicaciones</h2>
      <p class="panel__texto">Cada equipo se publica con su propio plan: elija Estándar, Destacada o Premium al publicarlo y pague solo esa publicación.</p>
      ${pagosEnEsperaHTML()}
      ${planesVencidosHTML()}
      <p class="acceso__aviso" id="avisoPlan" role="alert" hidden></p>
      <a class="btn btn--ambar" href="publicar.html">Publicar un equipo</a>`;
    return;
  }

  caja.innerHTML = `
    <div class="panel__cabeza">
      <h2 class="panel__titulo panel__titulo--limpio" id="t-plan"><em>Sus</em> publicaciones</h2>
      <p class="panel__meta">${activas} ${activas === 1 ? 'publicación activa' : 'publicaciones activas'}</p>
    </div>

    ${pagosEnEsperaHTML()}

    <ul class="membresias">${MEMBRESIAS.map(tarjetaPlanParticular).join('')}</ul>
    ${planesVencidosHTML()}

    <p class="acceso__aviso" id="avisoPlan" role="alert" hidden></p>

    <dl class="plan-estado">
      <div><dt>Página pública</dt>
        <dd>${org.tipo === 'dealer'
          ? `<a href="mi-pagina.html">Armar mi página de empresa</a>`
          : 'Solo para cuentas de empresa'}</dd></div>
      <div><dt>Sello de verificación</dt>
        <dd>${org.verificada ? 'Otorgado' : 'Pendiente de comprobar documentación'}</dd></div>
    </dl>

    ${conCapacidad
      ? `<p class="realce">${icono('i-check')} <span>Tiene capacidad disponible en su plan: puede publicar otro equipo sin pagar.</span></p>
         <div class="acciones acciones--pie">
           <a class="btn btn--ambar" href="publicar.html">Publicar otro equipo</a>
           <a class="btn btn--linea" href="planes.html">Ver planes</a>
         </div>`
      : `<div class="acciones acciones--pie">
           <a class="btn btn--linea" href="planes.html">Ver planes</a>
         </div>`}`;
}

function pintarPlan() {
  const caja = $('#panelPlan');
  const org = SESION.organizacion || {};

  if (esParticular()) { pintarPlanParticular(caja, org); return; }

  if (!MEMBRESIAS.length) {
    caja.innerHTML = `
      <h2 class="panel__titulo" id="t-plan"><em>Sin</em> cupos contratados</h2>
      <p class="panel__texto">Un cupo es el sitio que ocupa un equipo publicado. Elija el nivel y cuántos equipos quiere publicar; después reparte los cupos entre sus máquinas y los reutiliza cuando venda alguna.</p>
      ${pagosEnEsperaHTML()}
      ${planesVencidosHTML()}
      <p class="acceso__aviso" id="avisoPlan" role="alert" hidden></p>
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
    ${planesVencidosHTML()}

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
    const motivo = lleno ? (esParticular() ? ' · sin capacidad libre' : ' · sin cupos libres')
      : pocas ? ` · admite ${m.fotos_maximas} fotos` : '';
    return `<option value="${esc(m.id)}"${suya ? ' selected' : ''}${lleno || pocas ? ' disabled' : ''}>${esc(m.plan_nombre)}${motivo}</option>`;
  }).join('');

  return `<label class="plan-celda">
    <span class="visualmente-oculto">Plan de ${esc(nombreDe(a))}</span>
    <select class="plan-celda__sel" data-plan-de="${esc(a.id)}">${opciones}</select>
  </label>`;
}

/* En el país o bajo pedido, cambiado sin republicar: la máquina que se
   vendía bajo pedido llega un día al país y el anuncio no debe perder
   sus visitas por eso. El botón dice lo que hará, no lo que hay. */
function botonDisponibilidad(a) {
  const nombre = esc(nombreDe(a));
  return a.disponibilidad === 'bajo-pedido'
    ? `<button type="button" class="btn-tabla btn-tabla--avisa" data-disponibilidad="en-pais"
         aria-label="Marcar que ${nombre} ya está en el país">Ya llegó al país</button>`
    : `<button type="button" class="btn-tabla" data-disponibilidad="bajo-pedido"
         aria-label="Marcar ${nombre} como bajo pedido">Es bajo pedido</button>`;
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

/* Un borrador no es un anuncio publicado (MOD-06): no tiene visitas,
   ni plan que mover entre membresías, ni un botón de vender algo que
   nunca llegó al catálogo. Antes esta fila no existía y el borrador
   solo vivía en el `localStorage` del asistente: cambiar de navegador
   o borrar los datos del sitio se lo llevaba sin dejar rastro. Su
   nombre enlaza al asistente y no a `equipo.html`, que le daría un 404
   a cualquiera (D-14: un borrador no es público ni para su dueño). */
function filaBorrador(a) {
  const nombre = esc(nombreDe(a));
  const estadoTexto = a.pendiente_pago ? 'Esperando confirmación del pago' : ESTADOS.borrador.nombre;
  const plan = a.plan_elegido_nombre
    ? `Publicación ${esc(a.plan_elegido_nombre)} · ${esc(a.dias_elegidos)} días`
    : '—';
  // Con un pago pendiente el servidor rechaza eliminar el borrador
  // (409, D-12): no se ofrece un botón que solo daría un error.
  const acciones = a.pendiente_pago
    ? `<span class="celda-equipo__meta num">Ref. ${esc(a.pago_pendiente)}</span>`
    : `<a class="btn-tabla btn-tabla--fuerte" href="publicar.html?borrador=${encodeURIComponent(a.id)}">Continuar</a>
       <button type="button" class="btn-tabla btn-tabla--borrar" data-borrar="${esc(a.id)}"
         aria-label="Eliminar ${nombre}">Eliminar</button>`;

  return `<tr data-id="${esc(a.id)}">
    <th scope="row" class="celda-equipo">
      <span class="celda-equipo__foto">${a.foto
        ? `<img src="${esc(a.foto)}" alt="">`
        : icono('i-hex-doble', 'fantasma fantasma--sm')}</span>
      <span>
        <a class="celda-equipo__nombre" href="publicar.html?borrador=${encodeURIComponent(a.id)}">${nombre}</a>
      </span>
    </th>
    <td><span class="estado ${ESTADOS.borrador.clase}">${esc(estadoTexto)}</span></td>
    <td class="col-num num">—</td>
    <td class="col-num num">—</td>
    <td>${plan}</td>
    <td>—</td>
    <td class="col-acciones">${acciones}</td>
  </tr>`;
}

function filaAnuncio(a) {
  if (a.estado === 'borrador') return filaBorrador(a);

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
        <a class="celda-equipo__nombre" href="equipo.html?id=${encodeURIComponent(a.id)}">${esc(nombreDe(a))}</a>
        <span class="celda-equipo__meta num">${esc(precio)}${a.provincia ? ` · ${esc(a.provincia)}` : ''}${a.disponibilidad === 'bajo-pedido' ? ' · Bajo pedido' : ''}</span>
        ${estadoSerieHTML(a)}
      </span>
    </th>
    <td><span class="estado ${estado.clase}">${estado.nombre}</span></td>
    <td class="col-num num">${miles(a.vistas || 0)}</td>
    <td class="col-num num">${miles(contactos)}</td>
    <td>${selectorPlan(a)}</td>
    <td>${textoVigencia(a)}</td>
    <td class="col-acciones">
      ${accionRenovar(a)}
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
      <button type="button" class="btn-tabla" data-duplicar="${esc(a.id)}"
        aria-label="Duplicar ${esc(nombreDe(a))}">Duplicar</button>
      ${a.estado !== 'vendido' ? botonDisponibilidad(a) : ''}
      <button type="button" class="btn-tabla btn-tabla--borrar" data-borrar="${esc(a.id)}"
        aria-label="Eliminar ${esc(nombreDe(a))}">Eliminar</button>
    </td>
  </tr>`;
}

function pintarTabla() {
  const lista = FILTRO === 'todos'
    ? ANUNCIOS
    : FILTRO === 'activos'
      ? ANUNCIOS.filter((a) => a.estado === 'activo')
      // Un borrador no es un anuncio inactivo: nunca llegó a publicarse,
      // así que tiene su propio filtro y no infla el de "Inactivos".
      : FILTRO === 'borradores'
        ? ANUNCIOS.filter((a) => a.estado === 'borrador')
        : ANUNCIOS.filter((a) => a.estado !== 'activo' && a.estado !== 'borrador');

  // La fila del tren motriz se dibuja debajo de su anuncio y solo
  // cuando está abierta: la tabla no carga cuatro selectores por cada
  // camión que nadie ha pedido editar.
  $('#filasAnuncios').innerHTML = lista
    .map((a) => filaAnuncio(a) + (TREN_ABIERTO === a.id ? filaTrenHTML(a) : ''))
    .join('');

  const vacia = $('#tablaVacia');
  vacia.hidden = lista.length > 0;
  vacia.textContent = !ANUNCIOS.length
    ? 'Todavía no ha publicado ningún equipo.'
    : FILTRO === 'borradores'
      ? 'No tiene borradores sin terminar.'
      : 'Ningún anuncio en este estado.';
}

function pintarFiltros() {
  const activos = ANUNCIOS.filter((a) => a.estado === 'activo').length;
  const borradores = ANUNCIOS.filter((a) => a.estado === 'borrador').length;
  const inactivos = ANUNCIOS.length - activos - borradores;
  const opciones = [
    ['todos', `Todos (${ANUNCIOS.length})`],
    ['activos', `Activos (${activos})`],
    ['inactivos', `Inactivos (${inactivos})`],
  ];
  // Solo se enseña si hay alguno: quien nunca dejó un borrador a medias
  // no necesita un filtro vacío.
  if (borradores) opciones.push(['borradores', `Borradores (${borradores})`]);
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
  montarContactos();
  montarRecibidos();

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

  // `enlace` es un atajo opcional a la vista, junto al aviso: lo usa
  // «Marcar vendido» del particular para ofrecer «Publicar otro
  // equipo» sin obligarlo a ir a buscarlo (D-15). `mensaje` pasa por
  // esc() aquí porque el texto compuesto sale de datos del servidor
  // (el nombre del anuncio, entre otros); antes se ponía con
  // textContent, que ya era seguro por su cuenta.
  function avisoPlan(mensaje, error = true, enlace = null) {
    const el = $('#avisoPlan');
    if (!el) return;
    el.hidden = !mensaje;
    el.innerHTML = mensaje
      ? esc(mensaje) + (enlace ? ` <a href="${esc(enlace.href)}">${esc(enlace.texto)}</a>` : '')
      : '';
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

  /* Añadir publicaciones activas a una membresía viva (D-08/D-09). Antes
     esto eran tres copias con cuadros del navegador, una de ellas sin «ITBIS
     incluido». Ahora abre la sección «Agregar publicaciones activas»
     (abrirAmpliacion, más abajo), que enseña capacidad, días y precio. */
  $('#panelPlan').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-ampliar]');
    if (!btn) return;
    abrirAmpliacion(btn.dataset.ampliar);
  });

  /* Abrir y cerrar el editor de motor y transmisión. */
  $('#filasAnuncios').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-tren]');
    if (!btn) return;
    TREN_ABIERTO = TREN_ABIERTO === btn.dataset.tren ? null : btn.dataset.tren;
    pintarTabla();
  });

  /* Duplicar un anuncio (MET-04). No crea nada aquí: solo abre el
     asistente en publicar.html con `?duplicar=<id>`, que es quien pide
     la copia y la precarga. A partir de ahí decide el asistente
     (D-16): con capacidad libre el particular sigue el camino de
     siempre; sin ella, la copia entra como un borrador nuevo y pasa
     por su propio pago, sin ningún atajo por haber pagado ya el
     original. El dealer sigue pasando por el cupo, como siempre. */
  $('#filasAnuncios').addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-duplicar]');
    if (!btn) return;
    location.href = `publicar.html?duplicar=${encodeURIComponent(btn.dataset.duplicar)}`;
  });

  /* Eliminar un anuncio o un borrador.

     Sobre un anuncio publicado se avisa de las dos cosas que importan
     y que no se pueden deshacer: se van las fotos y se van las
     estadísticas. Quien solo quiere dejar de venderlo tiene «Marcar
     vendido», que conserva ambas, y se lo decimos aquí mismo para que
     no elija mal. Un borrador no tiene nada de eso publicado todavía,
     así que su aviso es más corto.

     Un borrador con un pago pendiente responde 409 (D-12): el mensaje
     del servidor ya trae a quién escribir para anularlo, y anteponerle
     "No se pudo eliminar" taparía justo la parte que importa. */
  $('#filasAnuncios').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-borrar]');
    if (!btn) return;

    const id = btn.dataset.borrar;
    const a = ANUNCIOS.find((x) => x.id === id);
    const esBorrador = !!a && a.estado === 'borrador';
    const nombre = a ? nombreDe(a) : 'este anuncio';

    const confirmacion = esBorrador
      ? '¿Eliminar este borrador?\n\nSe borran sus datos y fotografías, y no se puede deshacer.'
      : `¿Eliminar ${nombre}?\n\n`
        + 'Se borran el anuncio, sus fotografías y sus estadísticas, y no se puede deshacer. '
        + (esParticular()
          ? 'Si estaba publicado, su plan vuelve a tener capacidad para otro equipo mientras dure.\n\n'
          : 'Su cupo queda libre para publicar otro equipo.\n\n')
        + 'Si solo quiere dejar de venderlo, use «Marcar vendido»: conserva las visitas y los contactos.';
    if (!confirm(confirmacion)) return;

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
      avisoPlan(esBorrador
        ? 'Borrador eliminado.'
        : `${nombre} se eliminó.${esParticular() ? '' : ' Su cupo vuelve a estar libre.'}`, false);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = 'Eliminar';
      avisoPlan(e.codigo === 409 ? e.message : `No se pudo eliminar: ${e.message}`);
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

    // Vender libera capacidad, que es medio motivo para hacerlo. Se dice
    // aquí para que nadie descubra después que podía haber publicado
    // otro equipo sin pagar. El particular no tiene "cupo": el mismo
    // motivo se lo dice avisoPlan tras la respuesta, con el texto
    // exacto de D-15 y un atajo para publicar otro equipo.
    if (estado === 'vendido' && !confirm(esParticular()
      ? '¿Marcar este equipo como vendido?\n\n'
        + 'El anuncio deja de aparecer en el catálogo y queda en su historial con sus fotos, visitas y contactos.'
      : '¿Marcar este equipo como vendido?\n\n'
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

    if (estado === 'vendido' && esParticular()) {
      avisoPlan(
        `Este equipo fue vendido. Ahora puedes publicar otro equipo${r.capacidadLibre ? ' con la capacidad disponible de tu plan.' : '.'}`,
        false,
        { href: 'publicar.html', texto: 'Publicar otro equipo' },
      );
    }
  });

  // En el país o bajo pedido. Se refleja en memoria y se repinta la
  // tabla: el botón pasa a ofrecer lo contrario.
  $('#filasAnuncios').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-disponibilidad]');
    if (!btn) return;
    const idAnuncio = btn.closest('tr').dataset.id;

    btn.disabled = true;
    try {
      const r = await api(`/anuncios/${encodeURIComponent(idAnuncio)}/disponibilidad`, {
        metodo: 'PATCH', cuerpo: { disponibilidad: btn.dataset.disponibilidad },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');
      const anuncio = ANUNCIOS.find((a) => a.id === idAnuncio);
      if (anuncio) anuncio.disponibilidad = r.anuncio.disponibilidad;
      pintarTabla();
      avisoPlan(r.anuncio.disponibilidad === 'bajo-pedido'
        ? 'Marcado como bajo pedido. La ficha ya lo dice.'
        : 'Marcado como en el país. La ficha ya lo dice.', false);
    } catch (e) {
      btn.disabled = false;
      avisoPlan(`No se pudo cambiar: ${e.message}`);
    }
  });

  /* ── Renovar (MOD-09, MOD-12) ─────────────────────────────
     El panel solo pide renovar con el método y los datos fiscales: el
     importe, el plan, los días y la aprobación los pone el servidor
     (05.3-02). Lo que aquí se enseña —precio, fecha nueva— es
     informativo y sale de /api/membresias. */
  const ROTULO_METODO = {
    transferencia: 'Transferencia bancaria',
    tarjeta: 'Tarjeta de crédito o débito',
    demo: 'Pago inmediato',
  };

  const avisoRen = (mensaje, ok = false) => {
    const el = $('#avisoRenovar');
    el.hidden = !mensaje;
    el.textContent = mensaje || '';
    el.classList.toggle('acceso__aviso--ok', ok);
  };

  /* Recarga anuncios y membresías tras renovar: la fecha de la fila, la
     tarjeta del plan y «Pagos en espera» cambian todos a la vez. */
  async function recargarTodo() {
    const [d, c] = await Promise.all([
      api('/mis-anuncios', { silencioso: true }),
      api('/membresias', { silencioso: true }),
    ]);
    if (d) {
      ANUNCIOS = d.anuncios || ANUNCIOS;
      MEMBRESIAS = d.membresias || MEMBRESIAS;
      pintarMetricas(d.resumen || {});
    }
    if (c) {
      MEMBRESIAS = c.membresias || MEMBRESIAS;
      guardarPagos(c);
    }
    pintarFiltros();
    pintarPlan();
    pintarTabla();
  }

  function cerrarRenovacion() {
    RENOVAR_OBJETIVO = null;
    $('#panelRenovar').hidden = true;
    avisoRen('');
  }

  /* Fecha informativa de «tras renovar»: la real la pone el servidor
     (D-03), que suma los días del ciclo al vencimiento o a hoy si ya
     venció. */
  function fechaTrasRenovar(r) {
    const fin = r.fin ? new Date(String(r.fin).slice(0, 10) + 'T00:00:00') : new Date();
    const base = fin > new Date() ? fin : new Date();
    base.setDate(base.getDate() + (r.dias || 30));
    const p = (n) => String(n).padStart(2, '0');
    return fechaCorta(`${base.getFullYear()}-${p(base.getMonth() + 1)}-${p(base.getDate())}`);
  }

  function abrirRenovacion({ idAnuncio, idSusc }) {
    const a = idAnuncio ? ANUNCIOS.find((x) => x.id === idAnuncio) : null;
    if (idAnuncio && !a) return;
    const r = renovableDe(idSusc || (a && a.suscripcion_id));

    if (!r) { avisoPlan('Este anuncio no tiene un plan que se pueda renovar.'); return; }
    if (r.renovacion_pendiente) {
      avisoPlan(`Ya hay una renovación en espera de confirmación · ref. ${r.renovacion_pendiente}.`);
      return;
    }
    if (!r.precio) {
      avisoPlan('El plan de esta publicación ya no se ofrece. Escríbanos por correo o por el asistente del sitio.');
      return;
    }

    // Un anuncio de un solo cupo se renueva por su ruta; lo demás, por el plan.
    const porAnuncio = !!a && r.cupo === 1;
    RENOVAR_OBJETIVO = { idAnuncio: porAnuncio ? a.id : null, idSusc: r.id, r, vencido: !!r.vencida, nombre: a ? nombreDe(a) : r.plan_nombre };

    const que = porAnuncio
      ? esc(nombreDe(a))
      : `Plan ${esc(r.plan_nombre)} · capacidad para ${esc(r.cupo)} ${r.cupo === 1 ? 'equipo' : 'equipos'}`;
    const total = r.precio.total;
    $('#renovarResumen').innerHTML = `
      <p class="panel__texto"><b>${que}</b></p>
      <p class="panel__texto">${r.vencida ? 'Venció' : 'Hoy vence'} el ${esc(fechaCorta(r.fin))}.
        Tras renovar: hasta el ${esc(fechaTrasRenovar(r))}.</p>
      <p class="panel__texto"><b class="num">${total > 0 ? `RD$ ${esc(miles(total))} · ITBIS incluido` : 'Sin costo durante la promoción'}</b></p>`;

    // Con importe cero no hay nada que pagar ni facturar.
    const cobra = total > 0;
    const metodos = $('#renovarMetodos');
    metodos.hidden = !cobra || !METODOS_PAGO.length;
    metodos.innerHTML = cobra && METODOS_PAGO.length
      ? '<legend class="comprobante__titulo">Forma de pago</legend>' + METODOS_PAGO.map((m, i) => `
        <label class="opcion opcion--chica">
          <input type="radio" name="metodoRen" value="${esc(m)}"${i === 0 ? ' checked' : ''}>
          <span class="opcion__cuerpo"><b class="opcion__nombre">${esc(ROTULO_METODO[m] || m)}</b></span>
        </label>`).join('')
      : '';
    $('#bloqueComprobanteRen').hidden = !cobra;

    // Casilla (D-12): solo existe si el servidor la ofrece, y nunca marcada.
    const caja = $('#renovarAutomatica');
    if (RENOVACION_AUTO.disponible) {
      caja.innerHTML = `<label class="renovar-auto"><input type="checkbox" id="chkRenovacionAuto"> ${esc(RENOVACION_AUTO.texto || 'Renovar automáticamente')}</label>`;
      caja.hidden = false;
    } else {
      caja.innerHTML = '';
      caja.hidden = true;
    }

    cerrarAmpliacion();
    avisoRen('');
    if (faltanLegales('pagar').length) {
      montarAvisoLegal('pagar');
      avisoRen('Antes de pagar hace falta aceptar las condiciones nuevas (arriba).');
    }
    const sec = $('#panelRenovar');
    sec.hidden = false;
    $('#btnPagarRenovacion').disabled = false;
    $('#btnPagarRenovacion').classList.remove('btn--ocupado');
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#t-renovar').focus({ preventScroll: true });
  }

  /* Solo método, datos fiscales y la casilla: nunca importe, plan, cupo
     ni días (T-05.3-18). `api()` lanza, así que va con su try/catch. */
  async function pagarRenovacion() {
    const obj = RENOVAR_OBJETIVO;
    if (!obj) return;
    const btn = $('#btnPagarRenovacion');

    const cuerpo = {};
    const metodo = document.querySelector('input[name="metodoRen"]:checked');
    if (metodo) cuerpo.metodo = metodo.value;
    else if (METODOS_PAGO.length && obj.r.precio.total > 0) cuerpo.metodo = METODOS_PAGO[0];
    const rnc = document.querySelector('input[name="tipoComprobanteRen"]:checked');
    if (obj.r.precio.total > 0 && rnc && rnc.value === 'si') {
      cuerpo.conRnc = true;
      cuerpo.razonSocial = $('#ren-razon').value || '';
      cuerpo.rnc = $('#ren-rnc').value || '';
      cuerpo.direccionFiscal = $('#ren-direccion').value || '';
    }
    const chk = $('#chkRenovacionAuto');
    if (chk && chk.checked) cuerpo.renovacionAutomatica = true;

    const ruta = obj.idAnuncio
      ? `/anuncios/${encodeURIComponent(obj.idAnuncio)}/renovar`
      : `/membresias/${encodeURIComponent(obj.idSusc)}/renovar`;

    btn.disabled = true;
    btn.classList.add('btn--ocupado');
    avisoRen('');
    try {
      const r = await api(ruta, { metodo: 'POST', cuerpo });
      if (!r) throw new Error('No hay conexión con el servidor.');
      cerrarRenovacion();
      await recargarTodo();

      if (r.pago && r.pago.estado === 'pendiente' || !r.membresia) {
        avisoPlan(r.aviso || 'Su pago quedó en espera de confirmación.', false);
        return;
      }
      const fin = fechaCorta(r.membresia.fin);
      avisoPlan(obj.vencido
        ? `Listo: ${obj.nombre} vuelve a estar publicado hasta el ${fin}.`
        : `Listo: ${obj.nombre} sigue publicado hasta el ${fin}.`, false);
    } catch (e) {
      btn.disabled = false;
      btn.classList.remove('btn--ocupado');
      const msg = e.message || 'No se pudo renovar.';
      avisoRen(msg);
      if (/debe aceptar/i.test(msg)) montarAvisoLegal('pagar');
      // Un anuncio de un plan de varios cupos no se renueva solo.
      if (e.codigo === 409 && /renueve el plan completo/i.test(msg) && e.idSusc) {
        const el = $('#avisoRenovar');
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn-tabla btn-tabla--fuerte';
        b.textContent = 'Renovar plan';
        b.addEventListener('click', () => abrirRenovacion({ idSusc: e.idSusc }));
        el.append(' ', b);
      }
    }
  }

  /* ── Agregar publicaciones activas (MOD-13, 05.4) ──────────
     Sección a imagen de «Renovar». El precio que se enseña sale de
     precioAmpliacion (assets/precios.js), la misma función con la que
     cobra el servidor, y los días de diasRestantes, no de diasHasta: los
     dos redondean distinto y un día de diferencia es plata de diferencia.
     El navegador nunca manda un importe: solo `cupo` y, si se ofrece,
     `metodo`; el servidor lo recalcula. */
  let AMPLIAR_OBJETIVO = null;

  const avisoAmp = (mensaje, ok = false) => {
    const el = $('#avisoAmpliar');
    el.hidden = !mensaje;
    el.textContent = mensaje || '';
    el.classList.toggle('acceso__aviso--ok', ok);
  };

  function cerrarAmpliacion() {
    AMPLIAR_OBJETIVO = null;
    $('#panelAmpliar').hidden = true;
    avisoAmp('');
  }

  // Cuántas publicaciones quiere agregar, acotado a lo que cabe bajo el tope.
  function cantidadAmpliar() {
    if (!AMPLIAR_OBJETIVO) return 0;
    const cabe = Math.max(0, CUPO_MAXIMO - AMPLIAR_OBJETIVO.m.anuncios_incluidos);
    const n = Math.trunc(Number($('#ampliarCantidad').value));
    return Number.isFinite(n) && n >= 1 ? Math.min(n, cabe) : 0;
  }

  function pintarPrecioAmpliar() {
    if (!AMPLIAR_OBJETIVO) return;
    const { m, restantes } = AMPLIAR_OBJETIVO;
    const cantidad = cantidadAmpliar();
    const el = $('#ampliarPrecio');
    if (!cantidad) {
      el.textContent = 'Indique cuántas publicaciones activas quiere agregar.';
      $('#btnConfirmarAmpliar').disabled = true;
      return;
    }
    const previo = precioAmpliacion({
      precioUnitario: m.precio_unitario,
      cupoActual: m.anuncios_incluidos,
      cupoNuevo: m.anuncios_incluidos + cantidad,
      dias: m.dias_ciclo || 30,
      diasRestantes: restantes,
    });
    AMPLIAR_OBJETIVO.previo = previo;
    const gratisTxt = previo.gratis > 0
      ? ` La quinta no se cobra: ${previo.gratis} de las que agrega ${previo.gratis === 1 ? 'va' : 'van'} sin costo.`
      : '';
    el.textContent = (EXENTA || previo.total === 0
      ? 'Sin costo.'
      : `${pesos(previo.total)} ITBIS incluido, por los ${restantes} días que quedan hasta el vencimiento.`)
      + gratisTxt;
    $('#btnConfirmarAmpliar').disabled = faltanLegales('pagar').length > 0;
  }

  function abrirAmpliacion(idSusc) {
    const m = MEMBRESIAS.find((x) => x.id === idSusc && x.anuncios_incluidos != null);
    if (!m) return;

    const restantes = diasRestantes(m.fin) ?? (m.dias_ciclo || 30);
    AMPLIAR_OBJETIVO = { m, restantes, previo: null };

    $('#ampliarResumen').innerHTML = `
      <p class="panel__texto"><b>${esc(m.plan_nombre)}</b>: ${esc(m.anuncios_incluidos)} publicaciones activas permitidas · ${esc(m.ocupados)} en uso</p>
      <p class="panel__texto">Vence el ${esc(fechaCorta(m.fin))} · quedan ${esc(restantes)} días</p>`;

    const tope = Math.max(1, CUPO_MAXIMO - m.anuncios_incluidos);
    const campo = $('#ampliarCantidad');
    campo.max = String(tope);
    campo.value = '1';

    const metodos = $('#ampliarMetodos');
    metodos.hidden = METODOS_PAGO.length < 2;
    metodos.innerHTML = METODOS_PAGO.length > 1
      ? '<legend class="comprobante__titulo">Forma de pago</legend>' + METODOS_PAGO.map((mt, i) => `
        <label class="opcion opcion--chica">
          <input type="radio" name="metodoAmp" value="${esc(mt)}"${i === 0 ? ' checked' : ''}>
          <span class="opcion__cuerpo"><b class="opcion__nombre">${esc(ROTULO_METODO[mt] || mt)}</b></span>
        </label>`).join('')
      : '';

    avisoAmp('');
    if (faltanLegales('pagar').length) {
      montarAvisoLegal('pagar');
      avisoAmp('Antes de pagar hace falta aceptar las condiciones nuevas (arriba).');
    }

    cerrarRenovacion();
    const btn = $('#btnConfirmarAmpliar');
    btn.classList.remove('btn--ocupado');
    pintarPrecioAmpliar();
    const sec = $('#panelAmpliar');
    sec.hidden = false;
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#t-ampliar').focus({ preventScroll: true });
  }

  $('#ampliarCantidad').addEventListener('input', pintarPrecioAmpliar);
  $('#btnCancelarAmpliar').addEventListener('click', cerrarAmpliacion);

  $('#btnPagarRenovacion').addEventListener('click', pagarRenovacion);
  $('#btnCancelarRenovacion').addEventListener('click', cerrarRenovacion);
  document.querySelectorAll('input[name="tipoComprobanteRen"]').forEach((rad) => {
    rad.addEventListener('change', () => {
      $('#camposFiscalesRen').hidden = rad.value !== 'si' || !rad.checked;
      if (!$('#camposFiscalesRen').hidden) $('#ren-razon').focus();
    });
  });
  $('#ren-rnc').addEventListener('input', (ev) => {
    ev.target.value = ev.target.value.replace(/\D+/g, '');
  });

  $('#filasAnuncios').addEventListener('click', (ev) => {
    const uno = ev.target.closest('[data-renovar]');
    if (uno) { abrirRenovacion({ idAnuncio: uno.dataset.renovar }); return; }
    const plan = ev.target.closest('[data-renovar-plan]');
    if (plan) abrirRenovacion({ idSusc: plan.dataset.renovarPlan });
  });
  $('#panelPlan').addEventListener('click', (ev) => {
    const plan = ev.target.closest('[data-renovar-plan]');
    if (plan) abrirRenovacion({ idSusc: plan.dataset.renovarPlan });
  });

  /* Interruptor de la renovación automática de un plan. Solo existe si
     el servidor la ofrece; si el PUT falla, la casilla vuelve a como
     estaba y se dice por qué. */
  $('#panelPlan').addEventListener('change', async (ev) => {
    const chk = ev.target.closest('[data-renovacion-auto]');
    if (!chk || !RENOVACION_AUTO.disponible) return;
    const activar = chk.checked;
    chk.disabled = true;
    try {
      const r = await api(`/membresias/${encodeURIComponent(chk.dataset.renovacionAuto)}/renovacion-automatica`, {
        metodo: 'PUT', cuerpo: { activar },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');
      const ren = renovableDe(chk.dataset.renovacionAuto);
      if (ren) ren.renovacion_automatica = activar;
      avisoPlan(activar ? 'Renovación automática activada.' : 'Renovación automática desactivada.', false);
    } catch (e) {
      chk.checked = !activar;
      avisoPlan(e.message);
    } finally {
      chk.disabled = false;
    }
  });

  /* Enlace de los avisos por correo: panel.html?renovar=<id>. El valor
     sale de la URL, así que solo se usa si coincide EXACTAMENTE con un
     anuncio de esta cuenta y nunca se pinta (T-05.3-17). */
  const idRenovar = new URLSearchParams(location.search).get('renovar');
  if (idRenovar && ANUNCIOS.some((x) => x.id === idRenovar)) abrirRenovacion({ idAnuncio: idRenovar });

  /* Solo `cupo` y `metodo`: nunca importe (T-05.4-09). `api()` lanza, así
     que va con su try/catch. Un 202 no es una ampliación hecha: la
     membresía sigue con lo que tenía y el pago queda en «Pagos en
     espera» (T-05.4-11). */
  async function confirmarAmpliacion() {
    const obj = AMPLIAR_OBJETIVO;
    if (!obj) return;
    const cantidad = cantidadAmpliar();
    if (!cantidad) { pintarPrecioAmpliar(); return; }
    const { m } = obj;
    const btn = $('#btnConfirmarAmpliar');

    const metodo = document.querySelector('input[name="metodoAmp"]:checked');
    const cupo = m.anuncios_incluidos + cantidad;

    btn.disabled = true;
    btn.classList.add('btn--ocupado');
    avisoAmp('');
    try {
      const r = await api(`/membresias/${encodeURIComponent(m.id)}/ampliar`, {
        metodo: 'POST', cuerpo: { cupo, ...(metodo ? { metodo: metodo.value } : {}) },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');
      await refrescarCupos();
      cerrarAmpliacion();

      if (r.pago && r.pago.estado === 'pendiente') {
        avisoPlan(r.aviso || 'Su pago quedó en espera de confirmación.', false);
        return;
      }
      avisoPlan(`Su plan ${m.plan_nombre} pasó a ${cupo} publicaciones activas permitidas.`, false);
    } catch (e) {
      btn.disabled = false;
      btn.classList.remove('btn--ocupado');
      const msg = e.message || 'No se pudo agregar las publicaciones.';
      avisoAmp(msg);
      // 409 de condiciones sin aceptar: mismo enlace que la sección de renovar.
      // Cualquier otro 409 (operación en espera) ya trae su referencia en `msg`.
      if (/debe aceptar/i.test(msg)) montarAvisoLegal('pagar');
    }
  }
  $('#btnConfirmarAmpliar').addEventListener('click', confirmarAmpliacion);

  /* Enlace panel.html?ampliar=<id>. El valor sale de la URL: solo abre si
     coincide EXACTAMENTE con una membresía de esta cuenta con límite y
     nunca se pinta (T-05.4-08). */
  const idAmpliar = new URLSearchParams(location.search).get('ampliar');
  if (idAmpliar && MEMBRESIAS.some((x) => x.id === idAmpliar && x.anuncios_incluidos != null)) abrirAmpliacion(idAmpliar);

  $('#btnSalir').addEventListener('click', async () => {
    await api('/cuenta/salir', { metodo: 'POST', silencioso: true });
    location.href = 'index.html';
  });
}

/* ── Teléfonos de contacto ──────────────────────────────── */

/* Fase 9: un teléfono sin verificar no sale en ningún anuncio. Aquí el
   anunciante ve cada número que usan sus anuncios, si está verificado y
   por qué vía, y lo verifica sin salir del panel. Al verificar se
   repinta la lista entera: el número pasa a verificado en todos los
   anuncios a la vez, y la cuenta de «sin verificar» cambia con él. */
async function montarContactos() {
  const seccion = $('#panelContactos');
  const lista = $('#listaContactos');
  if (!seccion || !lista || typeof VerificarContacto === 'undefined') return;

  const contactos = await VerificarContacto.cargar();
  if (!contactos || !contactos.length) {
    seccion.hidden = true;
    return;
  }

  lista.innerHTML = contactos.map((c) => `<li class="contactos-panel__fila">
      <p class="contactos-panel__num"><b class="num">${esc(VerificarContacto.formato(c.numero))}</b>
        <span>${c.anuncios
    ? `En ${c.anuncios} ${c.anuncios === 1 ? 'anuncio' : 'anuncios'}`
    : 'Sin anuncios ahora mismo'}</span></p>
      ${VerificarContacto.estadoHTML(c)}
    </li>`).join('');
  seccion.hidden = false;

  VerificarContacto.montar(lista, { alVerificar: () => montarContactos() });
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

/* ── Contactos recibidos (MET-03) ───────────────────────── */

/* Qué anuncio y cuándo, para cada contacto. El total de la tarjeta
   «Contactos» dice cuántos; sin esta lista el dealer no puede atribuirle
   una venta al sitio, y es lo primero que pregunta al renovar.

   La hora va en la de Santo Domingo aunque el navegador esté en otra
   zona: el dealer la compara con la de su libreta de llamadas. */
const FECHA_CONTACTO = { timeZone: 'America/Santo_Domingo', dateStyle: 'medium', timeStyle: 'short' };

async function montarRecibidos() {
  const cuerpo = $('#filasContactos');
  if (!cuerpo || !haySesion()) return;
  const selAnuncio = $('#filtroContactoAnuncio');
  const selCanal = $('#filtroContactoCanal');
  const vacio = $('#contactosVacio');

  ANUNCIOS.forEach((a) => selAnuncio.add(new Option(`${a.anio} ${a.marca_nombre || a.marca} ${a.modelo}`, a.id)));

  async function pintar() {
    const consulta = new URLSearchParams({ limite: '100' });
    if (selAnuncio.value) consulta.set('anuncio', selAnuncio.value);
    if (selCanal.value) consulta.set('canal', selCanal.value);

    let contactos = [];
    try {
      const datos = await api(`/mis-contactos?${consulta}`);
      contactos = (datos && datos.contactos) || [];
    } catch (_) {
      cuerpo.innerHTML = '';
      vacio.hidden = false;
      vacio.textContent = 'No se pudieron cargar los contactos. Recargue la página para intentarlo de nuevo.';
      return;
    }

    cuerpo.innerHTML = contactos.map((c) => `<tr>
      <td class="num">${esc(new Date(c.creado).toLocaleString('es-DO', FECHA_CONTACTO))}</td>
      <td><a href="equipo.html?id=${encodeURIComponent(c.anuncio_id)}">${esc(`${c.anio} ${c.marca_nombre || c.marca} ${c.modelo}`)}</a></td>
      <td>${c.canal === 'whatsapp'
    ? '<span class="pastilla pastilla--verde">WhatsApp</span>'
    : '<span class="pastilla">Llamada</span>'}</td>
    </tr>`).join('');

    vacio.hidden = contactos.length > 0;
    vacio.textContent = selAnuncio.value || selCanal.value
      ? 'Ningún contacto con estos filtros.'
      : 'Todavía no ha recibido contactos por el sitio.';
  }

  selAnuncio.addEventListener('change', pintar);
  selCanal.addEventListener('change', pintar);
  await pintar();
}

document.addEventListener('DOMContentLoaded', montarPanel);
