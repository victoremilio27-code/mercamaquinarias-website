/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Render y comportamiento
   Depende de assets/data.js. Sin librerías.
   ═══════════════════════════════════════════════════════════ */

/* ── Iconografía ────────────────────────────────────────── */

/* Trazo de 1.75 px con esquinas y remates redondeados, según la guía.
   Se inyecta una sola vez para no repetir el sprite en cada página. */
const SPRITE = `
<symbol id="i-hex" viewBox="0 0 24 26"><path d="M12 1 22.4 7v12L12 25 1.6 19V7z"/></symbol>
<symbol id="i-hex-doble" viewBox="0 0 24 26"><path d="M12 1 22.4 7v12L12 25 1.6 19V7z"/><path d="M12 8.2 17.2 11v6L12 19.8 6.8 17v-6z"/></symbol>
<symbol id="i-excavadora" viewBox="0 0 24 24"><path d="M3 19.5h11"/><path d="M4 13h6.5v3.8H4z"/><path d="m10.5 14 4.4-5.6 3.8 1.8"/><path d="M17.4 12.6 21 11.2l-.9 4.6h-3.4z"/></symbol>
<symbol id="i-retro" viewBox="0 0 24 24"><circle cx="7" cy="17.5" r="2.6"/><circle cx="17.5" cy="17.5" r="2.6"/><path d="M4.5 14V9.5h7V14"/><path d="m11.5 11 4-4.5 3.5 2"/><path d="M18.5 9.5 22 8.2v4.3"/></symbol>
<symbol id="i-cargador" viewBox="0 0 24 24"><circle cx="8" cy="17.5" r="2.6"/><circle cx="17" cy="17.5" r="2.6"/><path d="M6 14V9h8v5"/><path d="m6 11-3 1.5v3.2h1.6"/><path d="M2 12.5 1.5 16h3"/></symbol>
<symbol id="i-volteo" viewBox="0 0 24 24"><circle cx="7" cy="17.5" r="2.4"/><circle cx="16.5" cy="17.5" r="2.4"/><path d="M3.5 15V9.5h5V15"/><path d="m9 15 1.5-7.5h9L21 15z"/></symbol>
<symbol id="i-grua" viewBox="0 0 24 24"><path d="M6 20V4"/><path d="M6 4h13"/><path d="M16 4v5"/><path d="M14.2 9h3.6l-1 3h-1.6z"/><path d="M3.5 20h5"/><path d="M6 7.5 12 4"/></symbol>
<symbol id="i-rodillo" viewBox="0 0 24 24"><circle cx="7.5" cy="15" r="5"/><circle cx="18" cy="17" r="3"/><path d="M11 10.5h5.5V14"/><path d="M12.5 10.5V7.5h4"/></symbol>
<symbol id="i-montacargas" viewBox="0 0 24 24"><circle cx="7" cy="18" r="2.2"/><path d="M4 15.5V9h6.5v6.5"/><path d="M14 4v13"/><path d="M14 17h6.5"/><path d="M17 17V9"/></symbol>
<symbol id="i-generador" viewBox="0 0 24 24"><rect x="3" y="7.5" width="18" height="10.5" rx="2"/><path d="M12.8 10.2 10 13.8h3.2L11.8 16.5"/><path d="M6.5 5.5v2"/><path d="M17.5 5.5v2"/></symbol>
<symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></symbol>
<symbol id="i-filtro" viewBox="0 0 24 24"><path d="M3 6h13M19 6h2M3 12h5M11 12h10M3 18h9M15 18h6"/><circle cx="17.5" cy="6" r="2"/><circle cx="9.5" cy="12" r="2"/><circle cx="13.5" cy="18" r="2"/></symbol>
<symbol id="i-buscar" viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></symbol>
<symbol id="i-reloj" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.2l3.2 2"/></symbol>
<symbol id="i-pin" viewBox="0 0 24 24"><path d="M12 21.5s6.5-6.1 6.5-11a6.5 6.5 0 1 0-13 0c0 4.9 6.5 11 6.5 11z"/><circle cx="12" cy="10.5" r="2.4"/></symbol>
<symbol id="i-etiqueta" viewBox="0 0 24 24"><path d="M3 11.5V4h7.5l10 10-7.5 7.5z"/><circle cx="7.5" cy="8" r="1.4"/></symbol>
<symbol id="i-calc" viewBox="0 0 24 24"><rect x="4.5" y="2.5" width="15" height="19" rx="2.5"/><path d="M8 7h8"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16.5h.01M12 16.5h.01M15.5 16.5h.01"/></symbol>
<symbol id="i-barco" viewBox="0 0 24 24"><path d="M3 15.5 4.5 10h15L21 15.5"/><path d="M7.5 10V6.5h9V10"/><path d="M12 4v2.5"/><path d="M2.5 18.5c1.6 0 1.6 1.5 3.2 1.5s1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5 1.6-1.5 3.2-1.5 1.6 1.5 3.2 1.5"/></symbol>
<symbol id="i-llave" viewBox="0 0 24 24"><path d="M15.5 3.2a5.5 5.5 0 0 0-4.9 8l-7 7L5 20.5l1.5-1.5.9.9 1.6-1.6-.9-.9 1.4-1.4a5.5 5.5 0 1 0 6-12.8z"/><circle cx="16.4" cy="7.6" r="1.5"/></symbol>
<symbol id="i-flecha" viewBox="0 0 24 24"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></symbol>
<symbol id="i-lowboy" viewBox="0 0 24 24"><path d="M2 15.5h1.5"/><path d="M2 12.5h5.5V15.5"/><path d="M7.5 10.5h3l1.5 2v3"/><circle cx="6" cy="17.5" r="2"/><circle cx="15" cy="17.5" r="2"/><circle cx="19.5" cy="17.5" r="2"/><path d="M8 15.5h5"/><path d="M17 15.5h.5"/><path d="M12 15.5V13h10v2.5"/></symbol>
<symbol id="i-satelite" viewBox="0 0 24 24"><circle cx="12" cy="17" r="2.5"/><path d="M12 12.5a4.5 4.5 0 0 1 4.5 4.5"/><path d="M12 8a9 9 0 0 1 9 9"/><path d="M12 12.5A4.5 4.5 0 0 0 7.5 17"/><path d="M12 8a9 9 0 0 0-9 9"/></symbol>
<symbol id="i-ruta" viewBox="0 0 24 24"><circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="M6 8.5v4a3.5 3.5 0 0 0 3.5 3.5h5"/><path d="M12.5 13.5 15.5 16l-3 2.5"/></symbol>
<symbol id="i-peso" viewBox="0 0 24 24"><path d="M5.5 8.5h13l1.5 11H4z"/><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0"/><path d="M12 3.5v2.5"/></symbol>
<symbol id="i-regla" viewBox="0 0 24 24"><rect x="2.5" y="8" width="19" height="8" rx="1.5"/><path d="M7 8v3"/><path d="M12 8v4"/><path d="M17 8v3"/></symbol>
<symbol id="i-camara" viewBox="0 0 24 24"><path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v10.5H3z"/><circle cx="12" cy="13" r="3.6"/></symbol>
<symbol id="i-subir" viewBox="0 0 24 24"><path d="M12 16.5V4"/><path d="m7 9 5-5 5 5"/><path d="M3.5 15v5.5h17V15"/></symbol>
<symbol id="i-tarjeta" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 9.5h19"/><path d="M6 15h4"/></symbol>
<symbol id="i-candado" viewBox="0 0 24 24"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></symbol>
<symbol id="i-telefono" viewBox="0 0 24 24"><path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7a2 2 0 0 1 2-2.2z"/></symbol>
<symbol id="i-correo" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="m3.5 7 8.5 6 8.5-6"/></symbol>
<symbol id="i-mas" viewBox="0 0 24 24"><path d="M12 5v14"/><path d="M5 12h14"/></symbol>
<symbol id="i-equis" viewBox="0 0 24 24"><path d="m6 6 12 12"/><path d="m18 6-12 12"/></symbol>
<symbol id="i-estrella" viewBox="0 0 24 24"><path d="m12 3.5 2.7 5.6 6 .9-4.4 4.3 1.1 6.2L12 17.6l-5.4 2.9 1.1-6.2L3.3 10l6-.9z"/></symbol>
<symbol id="i-aviso" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5"/><path d="M12 16.3h.01"/></symbol>
<symbol id="i-usuario" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></symbol>
<symbol id="i-grafico" viewBox="0 0 24 24"><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 20v-6"/><path d="M13 20V8"/><path d="M18 20v-9"/></symbol>
<symbol id="i-ojo" viewBox="0 0 24 24"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/></symbol>
<symbol id="i-pausa" viewBox="0 0 24 24"><path d="M9 5v14"/><path d="M15 5v14"/></symbol>
<symbol id="i-edificio" viewBox="0 0 24 24"><path d="M4 21V5.5L13 3v18"/><path d="M13 9h7v12"/><path d="M7.5 8h2M7.5 12h2M7.5 16h2M16 13h1.5M16 17h1.5"/></symbol>
<symbol id="i-whatsapp" viewBox="0 0 24 24"><path d="M3.5 20.5l1.3-4.4A8.2 8.2 0 1 1 8 19.3z"/><path d="M9 8.4c.3-.1.6 0 .8.4l.7 1.3c.1.3.1.5-.1.8l-.4.5a5.6 5.6 0 0 0 2.6 2.6l.5-.4c.3-.2.5-.2.8-.1l1.3.7c.4.2.5.5.4.8-.2.8-1 1.4-1.9 1.4-2.8 0-5.9-3.1-5.9-5.9 0-.9.5-1.7 1.2-2.1z"/></symbol>
<symbol id="i-compartir" viewBox="0 0 24 24"><circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.7 6.6-3.9"/><path d="m8.7 13.3 6.6 3.9"/></symbol>
`;

function inyectarSprite() {
  if (document.getElementById('sprite-mercamaquinarias')) return;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'sprite-mercamaquinarias';
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.style.display = 'none';
  svg.innerHTML = SPRITE;
  document.body.prepend(svg);
}

/* Se llama de una vez: app.js va al final del <body>, así el sprite
   existe antes de que el navegador pinte los <use> del HTML estático. */
if (document.body) inyectarSprite();

/* ── Utilidades ─────────────────────────────────────────── */

/* Número de WhatsApp del negocio, en formato internacional y sin
   signos, que es como lo quiere wa.me. Está aquí y no repartido por
   las páginas para que cambiarlo sea tocar una línea.
   PENDIENTE: sigue siendo el número de relleno. */

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const miles = (n) => Number(n).toLocaleString('en-US');
const pesos = (n) => 'RD$' + miles(Math.round(n));

const fmtUso = (uso) => `${miles(uso.valor)} ${uso.unidad}`;

/* Un anuncio puede publicarse sin cifra (precio a consultar) o en
   dólares. Toda la interfaz rotula el precio por aquí para que los
   tres casos se lean igual. */
function precioTexto(e) {
  if (e.precio == null) return 'Precio a consultar';
  const simbolo = e.moneda === 'USD' ? 'US$' : 'RD$';
  return simbolo + miles(Math.round(e.precio));
}

/* El anuncio guarda el id de la marca; el servidor añade el nombre
   visible en `marca_nombre`. Se cae al id por si llega un anuncio
   antiguo sin decorar. */
const nombreEquipo = (e) => `${e.anio} ${e.marca_nombre || e.marca} ${e.modelo}`;

const nombreCategoria = (id) =>
  (CATEGORIAS.find((c) => c.id === id) || {}).nombre || id;

const iconoCategoria = (id) =>
  (CATEGORIAS.find((c) => c.id === id) || {}).icono || 'i-hex';

const fechaLarga = (iso) => {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'long', year: 'numeric' });
};

const params = () => new URLSearchParams(location.search);

/* ── Catálogo ───────────────────────────────────────────────
   TODO lo que se muestra sale de la base de datos a través de /api.
   No hay inventario de ejemplo en el cliente: si no hay nada
   publicado, cada bloque lo dice y ofrece publicar. Un marketplace no
   puede anunciar equipos que no existen ni contar en la portada
   anuncios que nadie puso.
   ────────────────────────────────────────────────────────── */

/* Cifras vivas del catálogo: total de anuncios, cuántos van
   destacados, cuántos anunciantes y el conteo por categoría, marca y
   provincia. Se piden una vez por carga y las comparten todos los
   bloques de la página. */
let ESTADISTICAS = {
  anuncios: 0, anunciantes: 0, destacados: 0, dealers: 0,
  categorias: [], marcas: [], provincias: [],
};

async function cargarEstadisticas() {
  const datos = await api('/estadisticas', { silencioso: true });
  if (datos) ESTADISTICAS = datos;
  return ESTADISTICAS;
}

/* Quien compra solo ve marcas con al menos un equipo publicado: una
   marca sin inventario que devuelve cero resultados es una vía muerta.
   Quien vende ve, en cambio, las que fabrican el tipo de equipo que
   está publicando; de eso se encarga publicar.js con la taxonomía. */
const marcasConEquipos = () => ESTADISTICAS.marcas;

/* Nombre visible de una marca que el catálogo conoce, o null si no
   hay ningún equipo publicado de ella. */
const nombreMarcaCatalogo = (id) => {
  const m = ESTADISTICAS.marcas.find((x) => x.marca === id);
  return m ? (m.marca_nombre || m.marca) : null;
};

function conteoCategorias() {
  const cuenta = new Map(ESTADISTICAS.categorias.map((c) => [c.categoria, c.total]));
  return CATEGORIAS
    .map((c) => ({ ...c, total: cuenta.get(c.id) || 0 }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre));
}

/* ── Orden de los resultados ────────────────────────────────
   Los identificadores son los mismos que entiende el servidor
   (ORDENES_SQL en tools/db.js). Aquí solo vive el rótulo: ordenar es
   trabajo de la base, que es la única que ve el catálogo entero. */
const ORDENES = [
  { id: 'destacados',  etiqueta: 'Destacados primero' },
  { id: 'recientes',   etiqueta: 'Publicación más reciente' },
  { id: 'precio-asc',  etiqueta: 'Precio: de menor a mayor' },
  { id: 'precio-desc', etiqueta: 'Precio: de mayor a menor' },
  { id: 'anio-desc',   etiqueta: 'Año: del más reciente al más antiguo' },
  { id: 'anio-asc',    etiqueta: 'Año: del más antiguo al más reciente' },
  { id: 'uso-asc',     etiqueta: 'Horas de uso: de menor a mayor' },
  { id: 'uso-desc',    etiqueta: 'Horas de uso: de mayor a menor' },
];

const ORDEN_POR_DEFECTO = 'destacados';

/* Pide una página del catálogo. Devuelve siempre la misma forma, de
   modo que quien pinta no tiene que distinguir "sin resultados" de
   "servidor caído": ambos casos traen la lista vacía. */
async function buscarEquipos(parametros = {}) {
  const q = new URLSearchParams();
  Object.entries(parametros).forEach(([k, v]) => { if (v) q.set(k, v); });
  const datos = await api(`/anuncios${q.toString() ? '?' + q : ''}`, { silencioso: true });
  if (!datos) return { anuncios: [], total: 0, pagina: 1, paginas: 1, caido: true };
  return { ...datos, anuncios: datos.anuncios.map(anuncioDeApi) };
}

/* ── Plantillas ─────────────────────────────────────────── */

const icono = (id, clase = 'ico') =>
  `<svg class="${clase}" aria-hidden="true"><use href="#${id}"/></svg>`;

const foto = (e, claseFantasma = 'fantasma') => e.foto
  ? `<img src="${esc(e.foto)}" alt="${esc(nombreEquipo(e))}" loading="lazy">`
  : icono('i-hex-doble', claseFantasma);

/* Tarjeta del catálogo. Lleva lo que decide un clic en este mercado:
   qué máquina es, cuánto ha trabajado, en qué estado está, dónde se
   encuentra y a cuánto. El número de fotos y el sello de verificado
   van en la imagen porque son las dos señales de confianza que separan
   un anuncio serio de uno improvisado. */
function avisoHTML(e) {
  const ubicacion = [e.municipio, e.provincia].filter(Boolean).join(', ') || 'República Dominicana';
  return `<li class="aviso"><a href="equipo.html?id=${encodeURIComponent(e.id)}">
    <span class="aviso__foto">
      ${e.destacado ? '<span class="marca-esq">Destacado</span>' : ''}
      ${foto(e)}
      ${e.fotosTotal > 1 ? `<span class="aviso__fotos">${icono('i-camara')} ${e.fotosTotal}</span>` : ''}
    </span>
    <span class="aviso__nombre">${esc(nombreEquipo(e))}</span>
    <span class="aviso__specs num">${esc(fmtUso(e.uso))}${e.condicion ? ` · ${esc(e.condicion)}` : ''}</span>
    <span class="aviso__sitio">${icono('i-pin')} ${esc(ubicacion)}</span>
    <span class="aviso__pie">
      <span class="aviso__precio num">${precioTexto(e)}</span>
      ${e.ofertas ? '<span class="aviso__ofertas">Acepta ofertas</span>' : ''}
    </span>
    ${e.dealer && e.esEmpresa
      ? `<span class="aviso__vendedor">${esc(e.dealer)}${e.verificado ? ` ${icono('i-check', 'ico ico--sello')}` : ''}</span>`
      : '<span class="aviso__vendedor aviso__vendedor--particular">Vendedor particular</span>'}
  </a></li>`;
}

/* Fila compacta del panel Destacados: crece sin límite, la lista scrollea. */
function destacadoHTML(e) {
  return `<li><a class="dest" href="equipo.html?id=${encodeURIComponent(e.id)}">
    <span class="dest__foto">${foto(e, 'fantasma fantasma--sm')}</span>
    <span class="dest__cuerpo">
      <span class="dest__nombre">${esc(nombreEquipo(e))}</span>
      <span class="dest__meta num">${esc(fmtUso(e.uso))} · ${esc(e.condicion)} · ${esc(e.provincia)}</span>
      <span class="dest__fila">
        <span class="dest__precio num">${precioTexto(e)}</span>
        ${e.verificado ? `<span class="pastilla pastilla--verde">${icono('i-check')} Verificado</span>` : ''}
      </span>
    </span>
  </a></li>`;
}

/* Una empresa del directorio. Todas vienen de la base con su `slug`,
   su conteo real de equipos activos y su sello, así que la tarjeta
   siempre lleva a una página que existe. */
function dealerHTML(d) {
  const total = d.equipos || 0;
  /* El logotipo cuando lo hay, y el icono genérico cuando no. Un
     directorio en el que todas las fichas llevan el mismo dibujo no
     distingue a nadie, que es justo lo contrario de para lo que se
     paga una página propia. */
  return `<li><a class="dealer" href="dealer.html?d=${encodeURIComponent(d.slug)}">
    <span class="${d.logo ? 'perfil__logo dealer__logo' : 'dealer__sello'}">
      ${d.logo ? `<img src="${esc(d.logo)}" alt="" loading="lazy">` : icono('i-edificio')}
    </span>
    <span class="dealer__nombre">${esc(d.nombre)}</span>
    ${d.lema ? `<span class="dealer__lema">${esc(d.lema)}</span>` : ''}
    <span class="dealer__meta">${esc(d.provincia || 'República Dominicana')} · <span class="num">${total}</span> ${total === 1 ? 'equipo publicado' : 'equipos publicados'}</span>
    ${d.verificada ? `<span class="pastilla pastilla--verde">${icono('i-check')} Verificado</span>` : ''}
  </a></li>`;
}

/* ── Montaje por página ─────────────────────────────────── */

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

/* Bloque vacío con salida: nunca se deja un hueco mudo. Quien llega y
   no encuentra nada tiene que saber qué hacer a continuación. */
const vacioHTML = (texto, accion) =>
  `<li class="vacio-min">${esc(texto)}${accion ? ` <a href="${accion.href}">${esc(accion.texto)}</a>` : ''}</li>`;

async function montarDestacados() {
  const cont = $('#destacadosLista');
  if (!cont) return;

  /* Tarjeta de catálogo, no la fila estrecha de antes: ahora viven en
     un carrusel a ancho completo y la foto se ve. Doce en vez de ocho
     porque en horizontal el alto ya no crece. */
  const { anuncios } = await buscarEquipos({ destacados: '1', porPagina: 12 });
  cont.innerHTML = anuncios.length
    ? anuncios.map(avisoHTML).join('')
    : vacioHTML('Todavía no hay equipos destacados.',
      { href: 'planes.html', texto: 'Destaque el suyo' });

  /* Cuenta lo que se está viendo, no cuántos hay contratados. El
     título ya dice «destacados»; repetirlo aquí gasta la línea en algo
     que el lector acaba de leer, y el plan es asunto del anunciante,
     no de quien viene a comprar. */
  const rotulo = $('#destacadosRotulo');
  if (rotulo) {
    const n = anuncios.length;
    rotulo.innerHTML = `<span class="num">${miles(n)}</span> ${n === 1 ? 'equipo listado' : 'equipos listados'}`;
  }
}

/* Cifras del héroe. Se dibujan solo si hay algo que contar: anunciar
   "0 equipos publicados" en la primera pantalla es peor que no decir
   nada, y en apertura se sustituye por la invitación a publicar. */
function montarCifrasPortada() {
  const cont = $('#heroeCifras');
  if (!cont) return;

  const e = ESTADISTICAS;
  if (!e.anuncios) {
    cont.innerHTML = `<li class="heroe__apertura">Catálogo en apertura ·
      <a href="publicar.html">publique el primer equipo</a></li>`;
    return;
  }

  const cifras = [
    [e.anuncios, e.anuncios === 1 ? 'equipo publicado' : 'equipos publicados'],
    [e.anunciantes, e.anunciantes === 1 ? 'anunciante activo' : 'anunciantes activos'],
    [e.categorias.length, e.categorias.length === 1 ? 'categoría con inventario' : 'categorías con inventario'],
    [e.provincias.length, e.provincias.length === 1 ? 'provincia' : 'provincias del país'],
  ];
  cont.innerHTML = cifras
    .filter(([n]) => n > 0)
    .map(([n, rotulo]) => `<li><b class="num">${miles(n)}</b> ${esc(rotulo)}</li>`)
    .join('');
}

/* Mosaico de categorías de la portada.

   Sustituye a una lista de seis renglones de texto gris. Cada pieza
   enseña una máquina publicada de esa categoría —las trae
   /api/portada— y la primera va a doble tamaño: una rejilla de piezas
   iguales no dice cuál importa más, y aquí la que más inventario tiene
   sí importa más.

   Las categorías sin equipos no entran. Enseñar diez casillas vacías
   con «0» hace parecer que el catálogo está desierto. */
function montarMosaicoCategorias() {
  const cont = $('#mosaicoCategorias');
  if (!cont) return;

  const tope = Number(cont.dataset.top) || 7;

  /* Entran también las categorías sin inventario, detrás de las que sí
     lo tienen. `conteoCategorias` ya ordena por cantidad.

     Filtrarlas dejaba el mosaico en una sola pieza mientras el
     catálogo fuera joven —hoy en producción solo hay camiones— y una
     casilla suelta en una rejilla de cuatro columnas se lee como algo
     que no cargó. Enseñar el abanico dice de qué va el sitio; la
     cifra dice dónde hay algo hoy. */
  const conteo = conteoCategorias().slice(0, tope);
  if (!conteo.length) return;

  cont.innerHTML = conteo.map((c, i) => {
    const hay = c.total > 0;
    // La foto solo si de verdad hay inventario: una pieza con
    // fotografía y el rótulo «Sin equipos» se contradice a sí misma.
    const fotos = hay ? (FOTOS_CATEGORIA[c.id] || []) : [];
    const foto = fotos.length ? alAzar(fotos) : null;
    const fotosEditoriales = {
      excavadoras: 'brand_assets/generated/categoria-excavadoras-v2.webp',
      retroexcavadoras: 'brand_assets/generated/categoria-excavadoras-v2.webp',
      bulldozers: 'brand_assets/generated/categoria-bulldozers-v2.webp',
      compactadoras: 'brand_assets/generated/categoria-compactadoras-v2.webp',
      camiones: 'brand_assets/generated/categoria-camiones-v2.webp',
      autobuses: 'brand_assets/generated/categoria-autobuses-v2.webp',
      remolques: 'brand_assets/generated/categoria-camiones-v2.webp',
      cargadores: 'brand_assets/generated/categoria-cargadores-v2.webp',
      montacargas: 'brand_assets/generated/categoria-cargadores-v2.webp',
      elevacion: 'brand_assets/generated/categoria-cargadores-v2.webp',
      generadores: 'brand_assets/generated/categoria-generadores-v2.webp',
    };
    // Fotos de estudio en todos los tamaños: el escritorio usa ya la
    // misma estética que el móvil.
    const esMovil = matchMedia('(max-width: 700px)').matches;
    const fotoVisible = fotosEditoriales[c.id] || (foto && foto.foto)
      || 'brand_assets/generated/categoria-cargadores-v2.webp';

    return `<li>
      <a class="mosaico__pieza${hay ? '' : ' mosaico__pieza--vacia'}" href="equipos.html?categoria=${encodeURIComponent(c.id)}">
        ${fotoVisible
          ? `<img src="${esc(fotoVisible)}" alt="${esc(c.nombre)}" loading="${esMovil && i < 4 ? 'eager' : 'lazy'}" decoding="async">`
          : `<span class="mosaico__ico">${icono(c.icono)}</span>`}
        <span class="mosaico__cuerpo">
          <span class="mosaico__nombre">${esc(c.nombre)}</span>
          <span class="mosaico__total num">${hay ? c.total : 'Sin equipos'}</span>
        </span>
      </a>
    </li>`;
  }).join('');

  const pie = $('#tiposResto');
  if (pie) {
    const restantes = CATEGORIAS.length - conteo.length;
    pie.textContent = restantes > 0
      ? `Ver las otras ${restantes} categorías →`
      : 'Ver todas las categorías →';
  }
}

/* ── Carrusel ───────────────────────────────────────────────
   El desplazamiento lo hace el navegador: `overflow-x` con
   scroll-snap. Esto solo cablea las flechas para el ratón y las apaga
   al llegar a los extremos, porque una flecha que no hace nada se
   siente como un fallo.

   En táctil las flechas ni se dibujan: ahí se arrastra. */
function montarCarruseles() {
  $$('.carrusel__mandos').forEach((mandos) => {
    const pista = document.getElementById(mandos.dataset.mandos);
    if (!pista) return;

    const flechas = $$('[data-ir]', mandos);
    const refrescar = () => {
      const max = pista.scrollWidth - pista.clientWidth - 2;
      flechas.forEach((f) => {
        f.disabled = Number(f.dataset.ir) < 0 ? pista.scrollLeft <= 2 : pista.scrollLeft >= max;
      });
      // Sin nada que desplazar, los mandos sobran.
      mandos.hidden = pista.scrollWidth <= pista.clientWidth + 2;
    };

    flechas.forEach((f) => f.addEventListener('click', () => {
      // Se avanza algo menos de una pantalla: así queda a la vista un
      // resto de la tarjeta siguiente y se entiende que hay más.
      pista.scrollBy({ left: Number(f.dataset.ir) * pista.clientWidth * 0.85, behavior: 'smooth' });
    }));

    pista.addEventListener('scroll', refrescar, { passive: true });
    window.addEventListener('resize', refrescar);

    /* Hay que mirar el CONTENIDO, no la caja. El contenedor mide lo
       mismo con dos tarjetas que con dieciocho —lo que crece es
       scrollWidth—, así que un ResizeObserver sobre la pista no se
       entera de nada y los mandos se quedaban ocultos para siempre.
       Con las tarjetas ya puestas y las fotos aún por cargar, la
       medida tampoco es la definitiva. */
    if ('MutationObserver' in window) {
      new MutationObserver(refrescar).observe(pista, { childList: true });
    }
    pista.addEventListener('load', refrescar, { capture: true });   // fotos
    refrescar();
  });
}

function montarMarcas() {
  const cont = $('#marcasLista');
  if (!cont) return;
  const activas = marcasConEquipos();
  const bloque = cont.closest('.panel');

  // Sin marcas con inventario la tira no aporta nada y ocupa una
  // franja entera: se retira en vez de dejarla vacía.
  if (!activas.length) {
    if (bloque) bloque.hidden = true;
    return;
  }
  if (bloque) bloque.hidden = false;

  cont.innerHTML = activas
    .map(({ marca, total }) =>
      `<li><a href="equipos.html?marca=${encodeURIComponent(marca)}" title="${total} ${total === 1 ? 'equipo' : 'equipos'}">${esc(marca)}</a></li>`)
    .join('');
  const nota = $('#marcasNota');
  if (nota) {
    nota.textContent = `${activas.length} ${activas.length === 1 ? 'marca' : 'marcas'} con equipos publicados hoy`;
  }
}

async function montarRecientes() {
  const cont = $('#rejillaRecientes');
  if (!cont) return;
  const tope = Number(cont.dataset.tope) || 12;

  const { anuncios, caido } = await buscarEquipos({ orden: 'recientes', porPagina: tope });
  cont.innerHTML = anuncios.length
    ? anuncios.map(avisoHTML).join('')
    : `<li class="vacio-min vacio-min--ancho">${caido
      ? 'No pudimos cargar el catálogo. Actualice la página en un momento.'
      : 'Sea el primero en publicar. Su equipo aparecerá aquí y en los resultados de búsqueda.'}
      ${caido ? '' : '<a href="publicar.html">Publicar un equipo</a>'}</li>`;

  montarPubEnLista(cont);

  /* El rótulo se escribe en SU span, no en el `.panel__meta` entero.
     Ahí dentro viven ahora las flechas del carrusel, y reemplazar el
     innerHTML del contenedor se las llevaba por delante: los mandos
     desaparecían del DOM en cuanto se pintaban los anuncios. */
  const total = $('#totalEquipos');
  if (!total) return;

  const rotulo = total.parentElement;
  rotulo.innerHTML = ESTADISTICAS.anuncios
    ? `<span class="num" id="totalEquipos">${miles(ESTADISTICAS.anuncios)}</span> ${ESTADISTICAS.anuncios === 1 ? 'equipo publicado' : 'equipos publicados'} de <span class="num">${ESTADISTICAS.anunciantes}</span> ${ESTADISTICAS.anunciantes === 1 ? 'anunciante' : 'anunciantes'}`
    : 'Catálogo en apertura';
}

/* Directorio de dealers. Solo empresas reales con perfil habilitado:
   inventar fichas de empresas para que el directorio se vea lleno le
   haría perder el tiempo a quien las contacte. */
async function montarDealers() {
  const cont = $('#dealersLista');
  if (!cont) return;

  const datos = await api('/dealers', { silencioso: true });
  const lista = (datos && datos.dealers) || [];

  cont.innerHTML = lista.length
    ? lista.map(dealerHTML).join('')
    : `<li class="vacio-min vacio-min--ancho">Todavía no hay empresas con perfil publicado.
        <a href="planes.html?nivel=premium">Conozca el nivel Premium</a></li>`;

  const cuenta = $('#dealersCuenta');
  if (cuenta) cuenta.textContent = lista.length;

  // El enlace "Ver los N dealers" no lleva a ningún sitio útil con el
  // directorio vacío, así que se apaga entero.
  const enlace = cont.parentElement && cont.parentElement.querySelector('.panel__meta');
  if (enlace && !lista.length) enlace.hidden = true;
}

/* Rellena los <select> de marca, categoría y provincia.
   El selector de marca de quien PUBLICA no se arma aquí: lo encadena
   publicar.js a la subcategoría elegida. */
function montarSelects() {
  /* El filtro del catálogo solo ofrece marcas CON equipos publicados:
     una lista con las 146 del registro haría que casi toda elección
     devolviera cero resultados. */
  $$('select[data-marcas]').forEach((sel) => {
    marcasConEquipos().forEach((m) => sel.add(new Option(m.marca_nombre || m.marca, m.marca)));
  });
  $$('select[data-categorias]').forEach((sel) => {
    CATEGORIAS.forEach((c) => sel.add(new Option(c.nombre, c.id)));
  });
  $$('select[data-provincias]').forEach((sel) => {
    PROVINCIAS.forEach((p) => sel.add(new Option(p, p)));
  });
  montarTiposEquipo();
  montarNoAplica();
}

/* ── Tipo de equipo al detalle (importación) ────────────────

   El selector de categorías ofrece los 17 grandes grupos, y para
   importar eso se queda corto: quien quiere una planta eléctrica busca
   «planta eléctrica» y encuentra «Generadores y compresores», que
   parece otra cosa. Aquí se ofrece el último nivel de la taxonomía,
   agrupado por su categoría, que es donde están los nombres que la
   gente usa.

   El valor que viaja es el nombre legible, porque acaba en un correo
   que lee una persona; el id queda en `data-sub` para encadenar las
   marcas. */
function montarTiposEquipo() {
  $$('select[data-tipos-equipo]').forEach((sel) => {
    CATEGORIAS.forEach((c) => {
      const grupo = document.createElement('optgroup');
      grupo.label = c.nombre;
      c.subcategorias.forEach((s) => {
        const op = new Option(s.nombre, s.nombre);
        op.dataset.sub = s.id;
        grupo.appendChild(op);
      });
      sel.appendChild(grupo);
    });
  });

  /* Marcas encadenadas. Se ofrecen TODAS las que fabrican ese equipo,
     no solo las que hoy tienen inventario publicado: en importación no
     se busca en el catálogo, se encarga una máquina que no está aquí.
     «Otra marca» se descarta porque como preferencia no dice nada. */
  $$('select[data-marcas-del-tipo]').forEach((sel) => {
    const tipo = document.getElementById(sel.dataset.marcasDelTipo);
    if (!tipo) return;

    tipo.addEventListener('change', () => {
      const op = tipo.selectedOptions[0];
      const idSub = op && op.dataset.sub;
      sel.length = 0;

      if (!idSub) {
        sel.add(new Option('Elija primero el tipo de equipo', ''));
        sel.disabled = true;
        return;
      }
      sel.add(new Option('Sin preferencia', ''));
      marcasDe(idSub)
        .filter((m) => m.id !== 'otra')
        .forEach((m) => sel.add(new Option(m.nombre, m.nombre)));
      sel.disabled = false;
    });
  });
}

/* ── Campos que a veces no aplican ──────────────────────────

   «Año mínimo» y «horas máximas» no siempre tienen respuesta: en un
   equipo nuevo no hay horas que limitar. Dejarlos en blanco era la
   única salida, y en blanco no se distingue de un descuido.

   La casilla apaga el campo visible y enciende uno oculto con el mismo
   `name` y el valor «No aplica». Solo uno de los dos está activo, así
   que el formulario manda siempre una respuesta y nunca dos. */
function montarNoAplica() {
  $$('input[type="checkbox"][data-no-aplica]').forEach((casilla) => {
    const campo = document.getElementById(casilla.dataset.noAplica);
    if (!campo) return;
    const oculto = campo.parentElement.querySelector('input[type="hidden"]');

    const aplicar = () => {
      const apagado = casilla.checked;
      if (apagado) campo.value = '';
      campo.disabled = apagado;
      if (oculto) oculto.disabled = !apagado;
      const contenedor = campo.closest('.campo-v');
      if (contenedor) contenedor.classList.toggle('campo-v--inactivo', apagado);
    };

    casilla.addEventListener('change', aplicar);
    aplicar();
  });
}

/* ── Buscador (index → equipos.html) ────────────────────── */

function montarBuscador() {
  const form = $('#buscador');
  if (!form) return;
  form.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const q = new URLSearchParams();
    new FormData(form).forEach((valor, clave) => { if (valor) q.set(clave, valor); });
    location.href = 'equipos.html' + (q.toString() ? '?' + q : '');
  });
}

/* ── Resultados (equipos.html) ──────────────────────────── */

/* Campos que viajan en la URL. La URL es el estado de la búsqueda:
   se puede compartir, marcar y volver atrás con el botón del
   navegador, que es lo que se espera de un catálogo. */
const CAMPOS_BUSQUEDA = ['q', 'categoria', 'subcategoria', 'marca', 'provincia',
  'condicion', 'anioMin', 'anioMax', 'precioMin', 'precioMax', 'horasMax'];

const ROTULO_FILTRO = {
  q: 'Búsqueda', categoria: 'Categoría', subcategoria: 'Tipo', marca: 'Marca',
  provincia: 'Provincia', condicion: 'Condición', anioMin: 'Desde', anioMax: 'Hasta',
  precioMin: 'Desde', precioMax: 'Hasta', horasMax: 'Hasta',
};

/* Enlaces de paginación. Se muestran ventanas de cinco páginas para
   que la tira no crezca sin fin cuando haya cientos. */
function paginacionHTML({ pagina, paginas }) {
  if (paginas < 2) return '';

  const enlace = (n, texto, clase = '') => {
    const q = new URLSearchParams(location.search);
    if (n === 1) q.delete('pagina'); else q.set('pagina', n);
    return `<a class="paginacion__it ${clase}" href="equipos.html${q.toString() ? '?' + q : ''}"
      ${n === pagina ? 'aria-current="page"' : ''}>${texto}</a>`;
  };

  const desde = Math.max(1, Math.min(pagina - 2, paginas - 4));
  const hasta = Math.min(paginas, desde + 4);
  const numeros = [];
  for (let n = desde; n <= hasta; n++) numeros.push(enlace(n, String(n), 'paginacion__it--num'));

  return `
    ${pagina > 1 ? enlace(pagina - 1, '‹ Anterior') : '<span class="paginacion__it paginacion__it--inerte">‹ Anterior</span>'}
    ${desde > 1 ? '<span class="paginacion__it paginacion__it--puntos">…</span>' : ''}
    ${numeros.join('')}
    ${hasta < paginas ? '<span class="paginacion__it paginacion__it--puntos">…</span>' : ''}
    ${pagina < paginas ? enlace(pagina + 1, 'Siguiente ›') : '<span class="paginacion__it paginacion__it--inerte">Siguiente ›</span>'}`;
}

async function montarResultados() {
  const cont = $('#resultados');
  if (!cont) return;

  const p = params();
  const filtros = {};
  CAMPOS_BUSQUEDA.forEach((k) => { filtros[k] = p.get(k) || ''; });

  const form = $('#filtros');
  const mando = $('#ordenResultados');
  const vacio = $('#sinResultados');
  const resumen = $('#resumenBusqueda');

  // Devuelve los filtros al formulario para que se vean aplicados. Un
  // valor puede no estar entre las opciones (una marca sin inventario
  // hoy): se añade para que el campo no aparezca en blanco mintiendo
  // sobre lo que se está filtrando.
  if (form) {
    Object.entries(filtros).forEach(([k, v]) => {
      const campo = form.elements[k];
      if (!campo || !v) return;
      if (campo.tagName === 'SELECT' && ![...campo.options].some((o) => o.value === v)) {
        campo.add(new Option(v, v));
      }
      campo.value = v;
    });
    // La subcategoría depende de la categoría elegida.
    sincronizarSubcategorias(form, filtros.subcategoria);
    form.addEventListener('change', (ev) => {
      if (ev.target.name === 'categoria') sincronizarSubcategorias(form, '');
    });
  }

  if (mando) {
    ORDENES.forEach((o) => mando.add(new Option(o.etiqueta, o.id)));
    const pedido = p.get('orden');
    mando.value = ORDENES.some((o) => o.id === pedido) ? pedido : ORDEN_POR_DEFECTO;

    // El formulario de filtros arrastra el orden vigente al enviarse,
    // para no perderlo al refinar la búsqueda.
    const oculto = form && form.elements.orden;
    if (oculto) oculto.value = mando.value;

    mando.addEventListener('change', () => {
      const q = new URLSearchParams(location.search);
      if (mando.value === ORDEN_POR_DEFECTO) q.delete('orden');
      else q.set('orden', mando.value);
      q.delete('pagina');            // otro orden es otra primera página
      location.href = 'equipos.html' + (q.toString() ? '?' + q : '');
    });
  }

  const activos = Object.entries(filtros).filter(([, v]) => v);
  montarPanelFiltros(activos.length);

  // Los chips quitan un filtro conservando los demás y el orden.
  const chips = $('#chipsFiltros');
  if (chips) {
    chips.innerHTML = activos.map(([k, v]) => {
      const q = new URLSearchParams(location.search);
      q.delete(k);
      q.delete('pagina');
      const valor = k === 'categoria' ? nombreCategoria(v)
        : /precio/i.test(k) ? pesos(v)
        : k === 'horasMax' ? `${miles(v)} h`
        : v;
      return `<a class="chip" href="equipos.html${q.toString() ? '?' + q : ''}"
        title="Quitar este filtro"><span class="chip__clave">${esc(ROTULO_FILTRO[k] || k)}</span>
        ${esc(valor)} <span aria-hidden="true">&times;</span>
        <span class="visualmente-oculto">Quitar filtro</span></a>`;
    }).join('');
    if (activos.length > 1) {
      chips.innerHTML += '<a class="chip chip--limpiar" href="equipos.html">Limpiar todo</a>';
    }
  }

  cont.setAttribute('aria-busy', 'true');
  const r = await buscarEquipos({ ...filtros, orden: p.get('orden'), pagina: p.get('pagina') });
  cont.setAttribute('aria-busy', 'false');

  if (resumen) {
    resumen.innerHTML = r.total
      ? `<b class="num">${miles(r.total)}</b> ${r.total === 1 ? 'equipo' : 'equipos'}${
        r.paginas > 1 ? ` <span class="resumen__pagina">· página ${r.pagina} de ${r.paginas}</span>` : ''}`
      : '<b class="num">0</b> equipos';
  }

  const paginacion = $('#paginacion');
  if (paginacion) paginacion.innerHTML = paginacionHTML(r);

  if (r.anuncios.length) {
    if (vacio) vacio.hidden = true;
    if (mando) mando.disabled = false;
    cont.innerHTML = r.anuncios.map(avisoHTML).join('');
    montarPubEnLista(cont);
    return;
  }

  cont.innerHTML = '';
  if (mando) mando.disabled = true;
  if (!vacio) return;
  vacio.hidden = false;

  const titulo = $('#sinResultadosTitulo');
  const texto = $('#sinResultadosTexto');
  if (r.caido) {
    titulo.textContent = 'No pudimos cargar el catálogo';
    texto.textContent = 'Hubo un problema de conexión con el servidor. Actualice la página en unos segundos.';
    return;
  }
  // Sin filtros aplicados no hay "criterios" que aflojar: el catálogo
  // está vacío, y decir lo contrario haría que el visitante buscara un
  // error suyo que no existe.
  if (!activos.length) {
    titulo.textContent = 'Todavía no hay equipos publicados';
    texto.textContent = 'El catálogo está en apertura. Si tiene maquinaria en venta, publicarla ahora la deja de primera ante los compradores que ya nos visitan.';
    return;
  }

  // Caso explícito: la marca existe en el registro pero nadie tiene
  // equipos de ella. Decirlo evita que se lea como un fallo del sitio.
  const registrada = filtros.marca && !!nombreMarcaCatalogo(filtros.marca);
  titulo.textContent = registrada
    ? `No hay equipos ${filtros.marca} publicados ahora mismo`
    : 'No encontramos equipos con esos criterios';
  texto.textContent = registrada
    ? `${filtros.marca} figura en nuestro registro de marcas, pero hoy no hay ninguna unidad publicada. Si dispone de una, puede publicarla y aparecerá en esta misma búsqueda.`
    : 'Quite algún filtro, amplíe el rango de años o de precio, o pruebe con menos palabras en la búsqueda.';
}

/* Rellena el desplegable de subcategorías con las de la categoría
   elegida. Sin categoría no se ofrece: listar los cuarenta tipos de
   las ocho familias juntas no ayuda a nadie a filtrar. */
function sincronizarSubcategorias(form, elegida) {
  const sel = form.elements.subcategoria;
  if (!sel) return;
  const categoria = form.elements.categoria ? form.elements.categoria.value : '';
  const cat = CATEGORIAS.find((c) => c.id === categoria);
  const lista = cat ? cat.subcategorias : [];

  sel.length = 1;
  lista.forEach((s) => sel.add(new Option(s.nombre, s.id)));
  sel.disabled = !lista.length;
  sel.value = elegida && lista.includes(elegida) ? elegida : '';

  const campo = sel.closest('.campo');
  if (campo) campo.hidden = !lista.length;
}

/* ── Detalle (equipo.html) ──────────────────────────────── */

/* Galería secundaria: solo la traen los anuncios publicados desde el
   asistente, que guardan todas sus fotos. Al pulsar una se intercambia
   con la principal. */
function galeriaHTML(e) {
  if (!Array.isArray(e.fotos) || e.fotos.length < 2) return '';
  return `<ul class="galeria" id="galeria">
    ${e.fotos.map((f, i) => `<li>
      <button type="button" class="galeria__it${i === 0 ? ' galeria__it--activa' : ''}" data-foto="${esc(f)}">
        <img src="${esc(f)}" alt="Fotografía ${i + 1} del equipo" loading="lazy">
      </button></li>`).join('')}
  </ul>`;
}

/* Videos del equipo, si el anunciante subió alguno.
 *
 * `preload="metadata"` y no `auto`: son unos 6 MB cada uno, y quien
 * abre una ficha desde el teléfono con datos móviles no tiene por qué
 * descargarlos sin haberlos pedido. Con el póster puesto, la ficha se
 * ve completa sin haber bajado un solo byte del video.
 *
 * `controls` sin autoplay: un video que arranca solo con sonido en una
 * ficha que alguien abrió para ver un precio es una forma rápida de que
 * cierre la pestaña. */
function videosHTML(e) {
  const lista = (e.videos || []).filter((v) => v && v.url);
  if (!lista.length) return '';

  return `<div class="detalle__bloque">
    <h2 class="panel__titulo"><em>Video</em> del equipo</h2>
    <ul class="videos">
      ${lista.map((v, i) => `<li class="videos__it">
        <video class="videos__pieza" src="${esc(v.url)}"
               ${v.poster ? `poster="${esc(v.poster)}"` : ''}
               controls preload="metadata" playsinline
               aria-label="Video ${i + 1} del equipo"></video>
      </li>`).join('')}
    </ul>
  </div>`;
}

/* Medios de contacto declarados al publicar.

   Cada número se ofrece por los canales que el anunciante habilitó, y
   WhatsApp va como enlace propio con el mensaje ya redactado: en este
   mercado la mayoría de los contactos entran por ahí, y obligar a
   copiar el número a mano pierde la mitad de esas conversaciones. */
function contactosHTML(e) {
  const validos = (e.telefonos || []).filter((t) => t && t.numero);
  if (!validos.length) return '';

  // Los números dominicanos viajan a diez dígitos; WhatsApp los quiere
  // en formato internacional.
  const soloDigitos = (n) => String(n).replace(/\D/g, '');
  const internacional = (n) => {
    const d = soloDigitos(n);
    return d.length === 10 ? '1' + d : d;
  };
  const mensaje = encodeURIComponent(
    `Hola, le escribo por el ${nombreEquipo(e)} publicado en MercaMaquinarias (${precioTexto(e)}).`);

  return `<div class="contactos">
    <p class="etiqueta etiqueta--bloque">Contacto directo con el anunciante</p>
    ${validos.map((t) => {
      const tipo = t.tipo || 'ambos';
      const llamada = tipo === 'llamadas' || tipo === 'ambos';
      const whats = tipo === 'whatsapp' || tipo === 'ambos';
      return `<div class="contactos__fila">
        <span class="contactos__num">
          <b class="num">${esc(t.numero)}</b>
          ${t.nota ? `<span class="contactos__nota">${esc(t.nota)}</span>` : ''}
        </span>
        <span class="contactos__acciones">
          ${llamada ? `<a class="contactos__it" data-canal="telefono" href="tel:+1${esc(soloDigitos(t.numero))}">
            ${icono('i-telefono')} Llamar</a>` : ''}
          ${whats ? `<a class="contactos__it contactos__it--whatsapp" data-canal="whatsapp" rel="noopener"
            href="https://wa.me/${esc(internacional(t.numero))}?text=${mensaje}">
            ${icono('i-telefono')} WhatsApp</a>` : ''}
        </span>
      </div>`;
    }).join('')}
  </div>`;
}

/* Ficha técnica. Solo se dibuja la fila que tiene dato: una tabla con
   la mitad de los campos en blanco parece una publicación incompleta
   aunque el anunciante haya puesto todo lo que aplica a su máquina. */
function fichaTecnicaHTML(e) {
  const filas = [
    ['Año', e.anio, 'num'],
    [e.uso.unidad === 'h' ? 'Horas de uso' : 'Kilometraje', e.uso.valor ? fmtUso(e.uso) : null, 'num'],
    ['Condición', e.condicion],
    ['Marca', `<a href="equipos.html?marca=${encodeURIComponent(e.marca)}">${esc(e.marca_nombre || e.marca)}</a>`, '', true],
    ['Modelo', e.modelo],
    ['Tipo', e.subcategoria_nombre || e.subcategoria],
    ['Motor', e.motor_marca ? `${e.motor_marca_nombre || e.motor_marca}${e.motor_modelo ? ` ${e.motor_modelo}` : ''}` : ''],
    ['Transmisión', e.transmision_marca ? `${e.transmision_marca_nombre || e.transmision_marca}${e.transmision_modelo ? ` ${e.transmision_modelo}` : ''}` : ''],
    ['Potencia', e.potencia, 'num'],
    ['Peso operativo', e.peso, 'num'],
    ['Ubicación', [e.municipio, e.provincia].filter(Boolean).join(', ')],
  ];
  return `<dl class="ficha-tecnica">
    ${filas.filter(([, valor]) => valor).map(([rotulo, valor, clase, crudo]) =>
      `<div><dt>${esc(rotulo)}</dt><dd class="${clase || ''}">${crudo ? valor : esc(valor)}</dd></div>`).join('')}
  </dl>`;
}

/* Condiciones comerciales que el anunciante marcó al publicar. Son las
   que responden las preguntas que si no se hacen por teléfono. */
function condicionesHTML(e) {
  const puntos = [
    e.ofertas && 'Evalúa ofertas sobre el precio publicado',
    e.permuta && 'Acepta permuta por otro equipo',
    e.financiamiento && 'El anunciante ofrece o gestiona financiamiento',
    e.itbisIncluido && 'Precio con ITBIS incluido',
  ].filter(Boolean);
  if (!puntos.length) return '';
  return `<ul class="detalle__condiciones">
    ${puntos.map((p) => `<li>${icono('i-check')} ${esc(p)}</li>`).join('')}
  </ul>`;
}

/* ── Guardados del comprador (MET-01) ───────────────────── */

/* Los equipos guardados viven en ESTE navegador, sin cuenta.

   Quien guarda es un comprador, y un comprador casi nunca tiene cuenta:
   pedírsela para marcar una excavadora es perderlo en ese mismo clic.
   El precio es que no viajan entre el teléfono y la computadora; eso
   llega el día que exista cuenta de comprador.

   Todo acceso al almacenamiento va en try/catch: en una ventana privada
   o con los datos del sitio bloqueados, `localStorage` lanza. Entonces
   la lista vive en memoria y el botón sigue funcionando mientras la
   página esté abierta, que es mejor que un botón muerto. */
const GUARDADOS = (() => {
  const CLAVE = 'mercamaquinarias:guardados';
  const TOPE = 100;
  const ID_VALIDO = /^[\w-]{1,64}$/;
  let enMemoria = [];

  function leer() {
    let crudo = null;
    try { crudo = localStorage.getItem(CLAVE); } catch (_) { return enMemoria.slice(); }
    if (!crudo) return [];
    try {
      const lista = JSON.parse(crudo);
      // Lo que venga de fuera se valida: la clave la puede editar
      // cualquiera desde la consola, y estos ids acaban en una URL.
      return Array.isArray(lista)
        ? lista.filter((g) => g && typeof g.id === 'string' && ID_VALIDO.test(g.id))
        : [];
    } catch (_) {
      return [];
    }
  }

  function escribir(lista) {
    enMemoria = lista.slice(0, TOPE);
    try { localStorage.setItem(CLAVE, JSON.stringify(enMemoria)); } catch (_) { /* queda en memoria */ }
  }

  const esta = (id) => leer().some((g) => g.id === id);

  // Devuelve true si el equipo quedó guardado y false si se quitó.
  function alternar(id) {
    if (!ID_VALIDO.test(String(id))) return false;
    const lista = leer();
    if (lista.some((g) => g.id === id)) {
      escribir(lista.filter((g) => g.id !== id));
      return false;
    }
    escribir([{ id, guardado: new Date().toISOString() }, ...lista]);
    return true;
  }

  const quitar = (ids) => escribir(leer().filter((g) => !ids.includes(g.id)));
  const cuantos = () => leer().length;

  return { leer, esta, alternar, quitar, cuantos };
})();

/* «Guardados (N)» en la navegación principal, y solo si hay alguno.
   Se inyecta desde aquí para no tocar la cabecera escrita a mano en
   las veinte páginas; un enlace a una lista vacía en todas ellas
   ocuparía sitio sin servir de nada. */
function montarEnlaceGuardados() {
  const menu = $('#navMenu');
  if (!menu) return;
  const n = GUARDADOS.cuantos();
  let enlace = $('[data-guardados]', menu);

  if (!n) {
    if (enlace) enlace.remove();
    return;
  }
  if (!enlace) {
    enlace = document.createElement('a');
    enlace.href = 'guardados.html';
    enlace.dataset.guardados = '';
    menu.insertBefore(enlace, $('.cab__nav-cta', menu));
  }
  enlace.textContent = `Guardados (${n})`;
  if ((location.pathname.split('/').pop() || '') === 'guardados.html') enlace.setAttribute('aria-current', 'page');
}

/* Guardar y compartir, bajo el precio. Son las dos cosas que un
   comprador dominicano espera poder hacer con una ficha: marcarla para
   volver luego y mandársela a alguien por WhatsApp. */
function accionesFichaHTML(e) {
  const guardado = GUARDADOS.esta(e.id);
  const n = GUARDADOS.cuantos();
  const url = `${location.origin}/equipo.html?id=${encodeURIComponent(e.id)}`;
  const texto = encodeURIComponent(`${nombreEquipo(e)} · ${precioTexto(e)} en MercaMaquinarias: ${url}`);

  return `<div class="detalle__acciones">
    <button type="button" class="btn btn--linea btn--accion${guardado ? ' is-activo' : ''}" id="btnGuardar" aria-pressed="${guardado}">
      ${icono('i-estrella')} <span>${guardado ? 'Guardado' : 'Guardar'}</span></button>
    <button type="button" class="btn btn--linea btn--accion" id="btnCompartir" aria-expanded="false" aria-controls="menuCompartir">
      ${icono('i-compartir')} <span>Compartir</span></button>
    <a class="detalle__enlace-guardados" id="enlaceGuardados" href="guardados.html"${n ? '' : ' hidden'}>Ver guardados (${n})</a>
  </div>
  <div class="detalle__compartir" id="menuCompartir" hidden>
    <a class="contactos__it contactos__it--whatsapp" id="compartirWhatsapp" target="_blank" rel="noopener"
      href="https://wa.me/?text=${texto}">${icono('i-whatsapp')} WhatsApp</a>
    <button type="button" class="contactos__it" id="btnCopiarEnlace">Copiar enlace</button>
  </div>
  <p class="detalle__estado" id="estadoAcciones" role="status"></p>`;
}

/* Copia al portapapeles. `navigator.clipboard` solo existe en contexto
   seguro; en otro caso se usa el método viejo sobre un campo temporal. */
async function copiarTexto(texto) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch (_) { /* se intenta a la antigua */ }
  const campo = document.createElement('textarea');
  campo.value = texto;
  campo.setAttribute('readonly', '');
  campo.style.position = 'fixed';
  campo.style.opacity = '0';
  document.body.appendChild(campo);
  campo.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
  campo.remove();
  return ok;
}

function montarAccionesFicha(e, cont) {
  const btnGuardar = $('#btnGuardar', cont);
  const btnCompartir = $('#btnCompartir', cont);
  const menu = $('#menuCompartir', cont);
  const estado = $('#estadoAcciones', cont);
  if (!btnGuardar || !btnCompartir) return;

  let reloj = null;
  const avisar = (texto) => {
    estado.textContent = texto;
    clearTimeout(reloj);
    reloj = setTimeout(() => { estado.textContent = ''; }, 2500);
  };

  // Solo guardar cuenta como favorito; quitarlo no resta. Una cifra
  // del panel que baja sola no hay anunciante que sepa explicarla.
  btnGuardar.addEventListener('click', () => {
    const guardado = GUARDADOS.alternar(e.id);
    if (guardado) anotar(e.id, 'favorito');
    btnGuardar.setAttribute('aria-pressed', String(guardado));
    btnGuardar.classList.toggle('is-activo', guardado);
    $('span', btnGuardar).textContent = guardado ? 'Guardado' : 'Guardar';
    const n = GUARDADOS.cuantos();
    const enlace = $('#enlaceGuardados', cont);
    enlace.textContent = `Ver guardados (${n})`;
    enlace.hidden = !n;
    avisar(guardado ? 'Guardado en este navegador.' : 'Quitado de sus guardados.');
    montarEnlaceGuardados();
  });

  const url = `${location.origin}/equipo.html?id=${encodeURIComponent(e.id)}`;

  /* La hoja nativa del teléfono cuando existe: ahí ya están WhatsApp y
     todo lo demás que la persona use. Se anota cuando se completa;
     cerrar la hoja sin elegir nada rechaza la promesa y no cuenta. */
  btnCompartir.addEventListener('click', async () => {
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: nombreEquipo(e), text: `${nombreEquipo(e)} · ${precioTexto(e)}`, url });
        anotar(e.id, 'compartir');
      } catch (_) { /* cancelado: no se compartió nada */ }
      return;
    }
    const abrir = menu.hidden;
    menu.hidden = !abrir;
    btnCompartir.setAttribute('aria-expanded', String(abrir));
  });

  $('#compartirWhatsapp', cont).addEventListener('click', () => anotar(e.id, 'compartir'));

  $('#btnCopiarEnlace', cont).addEventListener('click', async (ev) => {
    const boton = ev.currentTarget;
    if (await copiarTexto(url)) {
      anotar(e.id, 'compartir');
      boton.textContent = 'Enlace copiado';
      avisar('Enlace copiado. Péguelo donde quiera compartirlo.');
      setTimeout(() => { boton.textContent = 'Copiar enlace'; }, 2000);
    } else {
      avisar('No se pudo copiar. Copie la dirección de la barra del navegador.');
    }
  });
}

/* La página de guardados (guardados.html).

   Pide al catálogo solo esos ids, que vuelven únicamente si siguen
   activos. Los que no vuelven NO se borran solos: uno pausado puede
   reactivarse mañana, y quien lo guardó lo perdería sin enterarse. Se
   dice cuántos son y se ofrece quitarlos. */
async function montarGuardados() {
  const lista = $('#listaGuardados');
  if (!lista) return;
  const vacio = $('#guardadosVacio');
  const retirados = $('#guardadosRetirados');

  async function pintar() {
    const guardados = GUARDADOS.leer();
    retirados.hidden = true;
    if (!guardados.length) {
      lista.innerHTML = '';
      vacio.hidden = false;
      return;
    }
    vacio.hidden = true;
    lista.setAttribute('aria-busy', 'true');

    let datos = null;
    try {
      const ids = guardados.map((g) => g.id).join(',');
      datos = await api(`/anuncios?ids=${encodeURIComponent(ids)}`);
    } catch (_) {
      datos = null;
    }
    lista.removeAttribute('aria-busy');
    if (!datos) {
      lista.innerHTML = vacioHTML('No se pudo cargar la lista. Vuelva a intentarlo en un momento.');
      return;
    }

    // En el orden en que se guardaron, el último primero: el catálogo
    // los devuelve en su propio orden, que aquí no significa nada.
    const porId = new Map((datos.anuncios || []).map((a) => [a.id, anuncioDeApi(a)]));
    const vigentes = guardados.filter((g) => porId.has(g.id)).map((g) => porId.get(g.id));
    const idsRetirados = guardados.filter((g) => !porId.has(g.id)).map((g) => g.id);

    /* La tarjeta del catálogo es un enlace entero; el botón de quitar va
       FUERA de él, porque un botón dentro de un enlace es un control
       anidado que ni el teclado ni un lector de pantalla manejan bien. */
    lista.innerHTML = vigentes.map((e) => `<li class="guardado">
      ${avisoHTML(e).replace(/^<li class="aviso">/, '<div class="aviso">').replace(/<\/li>$/, '</div>')}
      <button type="button" class="btn-tabla guardado__quitar" data-quitar="${esc(e.id)}"
        aria-label="Quitar ${esc(nombreEquipo(e))} de guardados">Quitar</button>
    </li>`).join('');

    if (idsRetirados.length) {
      const n = idsRetirados.length;
      $('#guardadosRetiradosTexto').textContent = n === 1
        ? '1 equipo guardado ya no está publicado.'
        : `${n} equipos guardados ya no están publicados.`;
      retirados.hidden = false;
      retirados.dataset.ids = idsRetirados.join(',');
    }
    vacio.hidden = vigentes.length > 0 || idsRetirados.length > 0;
  }

  lista.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-quitar]');
    if (!btn) return;
    GUARDADOS.quitar([btn.dataset.quitar]);
    montarEnlaceGuardados();
    pintar();
  });

  $('#btnQuitarRetirados').addEventListener('click', () => {
    GUARDADOS.quitar((retirados.dataset.ids || '').split(',').filter(Boolean));
    montarEnlaceGuardados();
    pintar();
  });

  await pintar();
}

async function montarDetalle() {
  const cont = $('#detalle');
  if (!cont) return;

  const idPedido = params().get('id');

  // La ficha pide su anuncio entero —descripción, galería, teléfonos y
  // ficha técnica—, que es información que el listado no trae para no
  // cargar la rejilla con datos que allí no se ven.
  const datos = idPedido
    ? await api(`/anuncios/${encodeURIComponent(idPedido)}`, { silencioso: true })
    : null;
  const e = datos && datos.anuncio ? anuncioDeApi(datos.anuncio) : null;

  if (!e) {
    cont.innerHTML = `<div class="vacio">
      <h1 class="vacio__titulo">El anuncio ya no está disponible</h1>
      <p class="vacio__texto">Es posible que el equipo se haya vendido o que el anunciante retirara la publicación.</p>
      <a class="btn btn--ambar" href="equipos.html">Ver equipos publicados</a>
    </div>`;
    return;
  }

  document.title = `${nombreEquipo(e)} · MercaMaquinarias`;

  cont.innerHTML = `
    <nav class="miga" aria-label="Ruta"><a href="index.html">Inicio</a> › <a href="equipos.html?categoria=${e.categoria}">${esc(nombreCategoria(e.categoria))}</a> › <span>${esc(nombreEquipo(e))}</span></nav>

    <div class="detalle">
      <div>
        <div class="detalle__foto">
          ${e.destacado ? '<span class="marca-esq">Destacado</span>' : ''}
          ${foto(e, 'fantasma fantasma--xl')}
        </div>
        ${galeriaHTML(e)}
        ${videosHTML(e)}
        ${e.descripcion ? `<div class="detalle__bloque">
            <h2 class="panel__titulo"><em>Descripción</em> del anunciante</h2>
            <p class="panel__texto">${esc(e.descripcion)}</p>
          </div>` : ''}
      </div>

      <aside class="detalle__panel">
        <p class="detalle__cat">${esc(nombreCategoria(e.categoria))}${e.subcategoria ? ` · ${esc(e.subcategoria_nombre || e.subcategoria)}` : ''}</p>
        <h1 class="detalle__titulo">${esc(nombreEquipo(e))}</h1>
        <p class="detalle__sitio">${icono('i-pin')} ${esc([e.municipio, e.provincia].filter(Boolean).join(', ') || 'República Dominicana')}</p>

        <p class="etiqueta">Precio</p>
        <p class="detalle__precio num">${precioTexto(e)}</p>
        ${condicionesHTML(e)}
        ${accionesFichaHTML(e)}

        ${fichaTecnicaHTML(e)}

        ${e.verificado ? `<p class="nota-verificado"><span class="pastilla pastilla--verde">${icono('i-check')} Anunciante verificado</span> MercaMaquinarias cotejó la existencia registral del negocio y sus datos de contacto. No certifica la calidad del equipo ni garantiza la operación.</p>` : ''}

        <!-- Espacio D del tarifario. Va entre los datos del equipo y el
             contacto del vendedor: en el teléfono la columna se apila y
             queda justo donde el comprador acaba de leer el precio y
             todavía no ha llamado. Sin campaña no se dibuja. -->
        <aside class="pub pub--ficha" id="pubFicha" aria-label="Publicidad" hidden></aside>

        ${contactosHTML(e)}

        <p class="detalle__dealer">${e.dealerSlug
          ? `Publicado por <a href="dealer.html?d=${encodeURIComponent(e.dealerSlug)}">${esc(e.dealer)}</a>`
          : 'Publicado por un anunciante particular.'}</p>

        <p class="detalle__aviso">MercaMaquinarias publica este anuncio pero no interviene en la transacción
          ni retiene fondos. Verifique el equipo y su documentación antes de pagar.
          <a href="contacto.html?equipo=${encodeURIComponent(e.id)}&amp;motivo=reporte">Reportar este anuncio</a>.</p>
      </aside>
    </div>`;

  // El recuadro de la ficha existe recién ahora: montarPublicidad() ya
  // había pasado cuando este panel todavía estaba vacío.
  campanasVigentes().then((c) => pintarEspacio('ficha', $('#pubFicha'), c.ficha));

  // Métricas de la ficha: una vista al abrirla y un clic cada vez que
  // alguien va a llamar o a escribir. Se anota justo donde ocurre, que
  // es lo que el anunciante ve después en su panel. El canal se lee de
  // data-canal para que "llamar" y "WhatsApp" no se cuenten iguales.
  anotar(e.id, 'vista');
  montarAccionesFicha(e, cont);
  $$('.contactos [data-canal]', cont).forEach((a) => {
    a.addEventListener('click', () => anotar(e.id, a.dataset.canal || 'telefono'));
  });

  const galeria = $('#galeria');
  if (galeria) {
    galeria.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-foto]');
      if (!btn) return;
      const principal = $('.detalle__foto img');
      if (principal) principal.src = btn.dataset.foto;
      $$('.galeria__it', galeria).forEach((b) => b.classList.toggle('galeria__it--activa', b === btn));
    });
  }

  // Equipos parecidos: misma categoría, sin repetir el que se está
  // viendo. Es la vía por la que un comprador que no cierra con esta
  // máquina se queda dentro del catálogo en vez de irse.
  const similares = $('#similares');
  if (similares) {
    const { anuncios } = await buscarEquipos({ categoria: e.categoria, porPagina: 7 });
    const otros = anuncios.filter((x) => x.id !== e.id).slice(0, 6);
    similares.innerHTML = otros.map(avisoHTML).join('');
    if (!otros.length) $('#similaresPanel')?.remove();
  }
}

/* ── Categorías (categorias.html) ───────────────────────── */

function montarCategoriasPagina() {
  const cont = $('#categoriasTodas');
  if (!cont) return;
  const imagenes = {
    camiones: '01-camiones-y-cabezotes.webp',
    autobuses: '02-autobuses-y-minibuses.webp',
    bulldozers: '03-bulldozers-y-topadoras.webp',
    cargadores: '04-cargadores.webp',
    compactadoras: '05-compactadoras.webp',
    excavadoras: '06-excavadoras.webp',
    generadores: '07-generadores-y-compresores.webp',
    gruas: '08-gruas.webp',
    agricola: '09-maquinaria-agricola.webp',
    montacargas: '10-montacargas.webp',
    motoniveladoras: '11-motoniveladoras.webp',
    pavimentacion: '12-pavimentacion-y-asfalto.webp',
    perforacion: '13-perforacion-y-pilotaje.webp',
    elevacion: '14-plataformas-de-elevacion.webp',
    remolques: '15-remolques-y-patanas.webp',
    retroexcavadoras: '16-retroexcavadoras.webp',
  };

  // El número se cuenta, no se escribe: la página decía 'las ocho'
  // cuando la taxonomía ya tenía dieciséis.
  const total = $('#totalCategorias');
  if (total) total.textContent = `las ${CATEGORIAS.length}`;
  cont.innerHTML = conteoCategorias().map((c) => {
    const hay = c.total > 0;

    const imagen = imagenes[c.id];

    return `<li><a class="cat-tarjeta${hay ? '' : ' cat-tarjeta--vacia'}" href="equipos.html?categoria=${encodeURIComponent(c.id)}">
      <span class="cat-tarjeta__foto">
        ${imagen
          ? `<img src="brand_assets/categorias/${esc(imagen)}" alt="${esc(c.nombre)}" width="1280" height="720" loading="lazy" decoding="async">`
          : icono('i-hex-doble', 'fantasma')}
      </span>
      <span class="cat-tarjeta__cuerpo">
        <span class="cat-tarjeta__nombre">${esc(c.nombre)}</span>
        <span class="cat-tarjeta__meta num">${hay ? `${c.total} ${c.total === 1 ? 'equipo publicado' : 'equipos publicados'}` : 'Sin equipos publicados'}</span>
      </span>
    </a></li>`;
  }).join('');
}

/* ── Filtros en móvil ───────────────────────────────────────
   En una pantalla de teléfono los filtros ocupaban dos pantallas
   entre la búsqueda y los resultados: para ver el primer equipo había
   que desplazarse por seis desplegables que casi nadie iba a tocar.

   Ahora se retiran detrás de un botón que además dice cuántos hay
   puestos, porque ese número es lo que responde «¿por qué salen tan
   pocos resultados?».

   El panel es un cajón lateral y no un acordeón: el acordeón sigue
   empujando la página hacia abajo al abrirse, que es el problema que
   se quería resolver. */
function montarPanelFiltros(cuantos) {
  const panel = $('#panelFiltros');
  const abrir = $('#abrirFiltros');
  const cerrar = $('#cerrarFiltros');
  const velo = $('#veloFiltros');
  if (!panel || !abrir) return;

  const cuenta = $('#cuentaFiltros');
  if (cuenta) {
    cuenta.hidden = !cuantos;
    cuenta.textContent = cuantos || '';
    abrir.setAttribute('aria-label', cuantos
      ? `Filtros de búsqueda, ${cuantos} ${cuantos === 1 ? 'puesto' : 'puestos'}`
      : 'Filtros de búsqueda');
  }

  const mostrar = (abierto) => {
    panel.classList.toggle('abierto', abierto);
    velo.hidden = !abierto;
    abrir.setAttribute('aria-expanded', String(abierto));
    // Se bloquea el fondo para que el dedo no arrastre el catálogo por
    // debajo del panel, que se siente como un fallo.
    document.body.classList.toggle('sin-scroll', abierto);
    if (abierto) {
      const primero = panel.querySelector('input, select, button');
      if (primero) primero.focus({ preventScroll: true });
    } else {
      abrir.focus({ preventScroll: true });
    }
  };

  abrir.addEventListener('click', () => mostrar(true));
  cerrar.addEventListener('click', () => mostrar(false));
  velo.addEventListener('click', () => mostrar(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('abierto')) mostrar(false);
  });

  /* Al volver a escritorio se deshace todo: si la ventana se ensancha
     con el panel abierto, el velo se quedaría tapando la página. */
  const ancho = window.matchMedia('(min-width: 861px)');
  ancho.addEventListener('change', (e) => { if (e.matches) mostrar(false); });
}

/* ── Portada: fotografías del catálogo ──────────────────────
   El héroe y las tarjetas de categoría enseñan máquinas de verdad,
   publicadas en el sitio. Antes eran un plano técnico y un hexágono
   gris repetido dieciséis veces. */

let FOTOS_CATEGORIA = {};

const alAzar = (lista) => lista[Math.floor(Math.random() * lista.length)];

/* Solo la portada y la página de categorías usan estas fotos, y la
   respuesta pesa. En el resto de las páginas la petición no se hace:
   app.js es el mismo archivo para las quince, así que el ahorro hay
   que pedirlo aquí. */
async function cargarPortada() {
  if (!$('#heroeFoto') && !$('#categoriasTodas')) return null;
  const datos = await api('/portada', { silencioso: true });
  if (!datos) return null;
  FOTOS_CATEGORIA = datos.categorias || {};
  return datos;
}

/* La fotografía del héroe.

   Manda la que haya fijado el equipo. Si no hay ninguna se toma una de
   las últimas publicadas, y como se elige en cada carga, la portada va
   rotando entre el inventario real en vez de quedarse con una imagen
   fija que envejece.

   El plano técnico solo se retira cuando la imagen ha CARGADO. Si se
   quitara antes, un archivo que falta dejaría el héroe en azul pelado
   durante toda la visita. */
function montarHeroeFoto(portada) {
  const caja = $('#heroeFoto');
  if (!caja || !portada || !portada.heroe) return;

  const h = portada.heroe;

  /* Orden de intento: primero la fijada, después el resto barajado.
     Se prueban en cadena porque una fotografía puede haber
     desaparecido del disco —un anuncio retirado, un archivo movido— y
     entonces el héroe se quedaba en azul pelado para siempre en vez de
     pasar a la siguiente. */
  const cola = [];
  if (h.imagen) cola.push({ imagen: h.imagen, alt: h.alt || '' });
  (h.opciones || [])
    .map((o) => ({ o, orden: Math.random() }))
    .sort((a, b) => a.orden - b.orden)
    .forEach(({ o }) => { if (o.imagen !== h.imagen) cola.push(o); });

  const intentar = () => {
    const siguiente = cola.shift();
    if (!siguiente) return;               // ninguna cargó: se queda el plano

    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = 'high';
    /* El texto alternativo viene en los datos y se estaba tirando: hay
       un campo para él en administración, viaja por la API, llega hasta
       aquí y se sobrescribía con cadena vacía. La imagen más grande de
       la portada quedaba sin nombre accesible y quien lo rellenaba lo
       hacía para nada. */
    img.alt = siguiente.alt || '';
    img.addEventListener('error', intentar);
    img.addEventListener('load', () => {
      caja.replaceChildren(img);
      caja.hidden = false;
      /* `hidden` es una propiedad de HTMLElement, no de SVGElement:
         asignarla a un <svg> crea un campo suelto en el objeto y no
         toca el atributo, así que el plano seguía dibujado detrás de
         la fotografía. Con setAttribute sí, y la regla de styles.css
         lo remata. */
      const plano = $('.heroe__plano');
      if (plano) plano.setAttribute('hidden', '');
    });
    img.src = siguiente.imagen;
  };

  intentar();
}

/* ── Publicidad ─────────────────────────────────────────── */

/* Los ocho formatos del tarifario que se le enseña al anunciante. La
   letra y la medida son las de las fichas de venta: si allí cambian,
   cambian aquí, porque es lo que el cliente vio antes de firmar.

   `sel` es el recuadro fijo de la página. `movil-lista` no tiene: se
   intercala entre los anuncios ya pintados, así que lo crea el propio
   JavaScript cuando la lista existe. */
const ESPACIOS_PUB = {
  superior:         { letra: 'A', ancho: 1216, alto: 160, sel: '#pubSuperior' },
  catalogo:         { letra: 'B', ancho: 970,  alto: 90,  sel: '#pubCatalogo' },
  bloque:           { letra: 'C', ancho: 600,  alto: 500, sel: '#pubBloque' },
  ficha:            { letra: 'D', ancho: 300,  alto: 250, sel: '#pubFicha' },
  'lateral-izq':    { letra: 'E', ancho: 160,  alto: 600, sel: '#pubIzq' },
  'lateral-der':    { letra: 'E', ancho: 160,  alto: 600, sel: '#pubDer' },
  'movil-superior': { letra: 'F', ancho: 320,  alto: 180, sel: '#pubMovilSuperior' },
  'movil-cuadro':   { letra: 'G', ancho: 336,  alto: 336, sel: '#pubMovilCuadro' },
  'movil-lista':    { letra: 'H', ancho: 336,  alto: 336, sel: null },
};

/* Quien pregunta por un espacio publicitario escribe a publicidad@.
 *
 * El buzón va escrito, pero el DOMINIO no: se deduce. Escrito entero a
 * mano, el día que el sitio cambiara de dominio habría que acordarse de
 * este renglón, y el recuadro seguiría invitando a escribir a una
 * dirección muerta. Ya pasó una vez —la mudanza de dominio— y este
 * renglón fue de los pocos que no hubo que tocar.
 *
 * SE MIRA EN TRES SITIOS, en este orden:
 *
 *   1. El correo del pie. Es el más fiable cuando está.
 *
 *   2. El dominio del propio sitio. Hace falta porque Cloudflare
 *      reescribe los `mailto:` —los cambia por /cdn-cgi/l/email-protection
 *      y un <span> que descifra su script, para que los robots de spam
 *      no cosechen direcciones—. Mientras eso no se ha ejecutado, en el
 *      pie NO HAY ningún enlace que empiece por mailto:, y el paso 1 se
 *      queda sin nada. En producción pasa siempre.
 *
 *   3. Y si el dominio no sirve —en desarrollo es 127.0.0.1— el de
 *      siempre. Un `publicidad@127.0.0.1` en la pantalla de alguien
 *      sería peor que no enseñar nada. */
const BUZON_PUBLICIDAD = 'publicidad';

function dominioDelPie() {
  const enlace = document.querySelector('.pie a[href^="mailto:"]');
  const correo = enlace && enlace.getAttribute('href').replace(/^mailto:/i, '').trim();
  return correo && correo.includes('@') ? correo.split('@')[1] : null;
}

/* El nombre se puede pasar: `location.hostname` no se deja sustituir
   en una prueba, y esta regla merece comprobarse con varios. */
function dominioDelSitio(nombre) {
  const h = nombre === undefined ? (location.hostname || '') : String(nombre || '');
  // Un nombre con punto y que no sea una IP ni «localhost».
  if (!h.includes('.') || /^[\d.]+$/.test(h)) return null;
  return h.replace(/^www\./, '');
}

function correoPublicidad() {
  return `${BUZON_PUBLICIDAD}@${dominioDelPie() || dominioDelSitio() || 'mercamaquinarias.com'}`;
}

/* LOS ESPACIOS VACÍOS SE VEN.
 *
 * Antes no: la idea era que un sitio con marcos de «espacio disponible»
 * parece a medio hacer. Victor decidió lo contrario, y tiene su lógica
 * —un hueco que dice «anúnciese aquí» es la única forma de que un
 * anunciante sepa que puede comprarlo—, así que el recuadro se rediseña
 * para ese trabajo: sin jerga y con el correo a un clic.
 *
 * Se puede apagar sin desplegar nada, con `?muestra=no`.
 *
 * MODO TARIFARIO (`?muestra=publicidad`) es otra cosa: añade la letra y
 * la medida exacta de cada formato, que es lo que se le enseña a un
 * anunciante con las fichas de venta delante. Al visitante normal esos
 * datos no le dicen nada. */
const CLAVE_MUESTRA = 'mm-muestra-pub';
const CLAVE_APAGADO = 'mm-pub-apagada';

const modoPublicidad = (() => {
  let tarifario = false;
  let apagado = false;

  const leer = (clave) => { try { return sessionStorage.getItem(clave) === '1'; } catch { return false; } };
  const fijar = (clave, v) => {
    try { if (v) sessionStorage.setItem(clave, '1'); else sessionStorage.removeItem(clave); } catch { /* sin memoria */ }
  };

  const pedido = params().get('muestra');
  if (pedido === 'publicidad') { fijar(CLAVE_MUESTRA, true); fijar(CLAVE_APAGADO, false); }
  else if (pedido === 'no') { fijar(CLAVE_APAGADO, true); fijar(CLAVE_MUESTRA, false); }

  tarifario = leer(CLAVE_MUESTRA) || pedido === 'publicidad';
  apagado = leer(CLAVE_APAGADO) || pedido === 'no';

  // Se marca en <html> al cargar el script y no al terminar el DOM, para
  // que el hueco de la barra ya esté reservado en el primer pintado.
  if (tarifario) document.documentElement.classList.add('muestra-pub');

  return { tarifario: () => tarifario, visibles: () => !apagado };
})();

const enTarifario = () => modoPublicidad.tarifario();
const espaciosVisibles = () => modoPublicidad.visibles();

/* Las campañas se piden una sola vez por página aunque las reclamen la
   portada, la ficha y las listas: cada petición cuenta impresiones, y
   pedirlas tres veces inflaría los números que se le facturan al
   anunciante. */
let PUB_PENDIENTE = null;
const campanasVigentes = () => {
  PUB_PENDIENTE ||= api('/publicidad', { silencioso: true })
    .then((d) => (d && d.publicidad) || {})
    .catch(() => ({}));
  return PUB_PENDIENTE;
};

/* El recuadro del espacio libre.
 *
 * Es un ENLACE, no una caja muerta. Si se le enseña a todo el mundo un
 * hueco que dice «anúnciese aquí», lo menos que puede hacer es abrir el
 * correo cuando alguien lo pulsa; si no, se queda en decoración y hay
 * que copiar la dirección a mano.
 *
 * La letra y la medida solo salen en modo tarifario: al anunciante le
 * sirven para cotejar con las fichas de venta, pero a quien vino a
 * comprar una excavadora «B · 970 × 90 px» no le dice nada.
 *
 * La proporción es la exacta del formato en los dos casos: lo que se ve
 * en pantalla es lo que se compra. */
function muestraHTML(id) {
  const e = ESPACIOS_PUB[id];
  const correo = correoPublicidad();
  const asunto = encodeURIComponent('Publicidad en MercaMaquinarias');
  const detalle = enTarifario()
    ? `<span class="pub-muestra__letra" aria-hidden="true">${e.letra}</span>`
    : '';
  const medida = enTarifario()
    ? `<span class="pub-muestra__medida num">${e.ancho} &times; ${e.alto} px</span>`
    : '';

  return `<a class="pub-muestra" style="--pub-ancho: ${e.ancho}; --pub-alto: ${e.alto}"
     href="mailto:${esc(correo)}?subject=${asunto}">
    ${detalle}
    <span class="pub-muestra__nombre">Espacio publicitario</span>
    ${medida}
    <span class="pub-muestra__pie">Anúnciese aquí · ${esc(correo)}</span>
  </a>`;
}

/* Un recuadro de muestra puede caer sobre el fondo oscuro del teléfono
   o sobre un panel blanco —la ficha del equipo sigue siendo clara en
   móvil—, así que el color del texto no se puede fijar de antemano:
   con el token del tema a secas, «Espacio publicitario» salía hueso
   sobre blanco en la ficha, con 1.09 de contraste.

   Se mira el fondo que de verdad hay detrás y se elige. Medirlo en vez
   de escribir una excepción para la ficha significa que esto seguirá
   valiendo cuando el resto del sitio cambie de tema. */
function ajustarContraste(caja) {
  const muestra = $('.pub-muestra', caja);
  if (!muestra) return;

  let nodo = caja;
  let fondo = 'rgba(0, 0, 0, 0)';
  while (nodo && /rgba\(0, 0, 0, 0\)|transparent/.test(fondo)) {
    fondo = getComputedStyle(nodo).backgroundColor;
    nodo = nodo.parentElement;
  }

  const canales = (fondo.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
  if (canales.length < 3) return;

  const lineal = (v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luz = 0.2126 * lineal(canales[0]) + 0.7152 * lineal(canales[1]) + 0.0722 * lineal(canales[2]);
  muestra.classList.toggle('pub-muestra--claro', luz > 0.4);
}

/* Pinta un espacio. Hay tres desenlaces y solo tres:
     con campaña      → el anuncio, en cualquier caso;
     sin campaña      → nada, y el hueco no existe;
     sin campaña pero en modo muestra → el recuadro de muestra.

   El enlace pasa por /api/publicidad/:id/ir para contar el clic. Sigue
   siendo un enlace de verdad: se abre en pestaña nueva, se copia y
   funciona sin JavaScript.

   `rel="sponsored"` porque es publicidad pagada: decírselo a Google es
   lo correcto y evita que el enlace se lea como una recomendación
   editorial del sitio. */
function pintarEspacio(id, caja, lista) {
  if (!caja) return;
  const campanas = lista || [];

  if (campanas.length) {
    // Con varias campañas en el mismo espacio se muestra una al azar:
    // así todas reciben impresiones sin necesidad de un rotador.
    const p = campanas[Math.floor(Math.random() * campanas.length)];
    const img = `<img src="${esc(p.imagen)}" alt="${esc(p.alt)}" loading="lazy" decoding="async">`;
    caja.innerHTML = p.enlace
      ? `<a class="pub__enlace" href="/api/publicidad/${esc(p.id)}/ir"
             target="_blank" rel="sponsored noopener">${img}</a>`
      : img;
    caja.classList.remove('pub--muestra');
    caja.hidden = false;
    return;
  }

  // Sin campaña se enseña el hueco libre, salvo que se haya apagado con
  // `?muestra=no`. Cuando no se dibuja, el bloque comparte fila con otro
  // panel y su fila se encoge sola a una columna: ver
  // `.fila--dos:has(> .pub[hidden])` en styles.css.
  if (!espaciosVisibles()) return;

  caja.innerHTML = muestraHTML(id);
  caja.classList.add('pub--muestra');
  caja.hidden = false;
  ajustarContraste(caja);
}

/* Barra del modo tarifario. NO sale en el sitio público: allí los
   espacios libres ya son parte de la página, y anunciarlos como «vista
   de muestra» sería mentir sobre lo que se está viendo. */
function montarBarraMuestra() {
  if (!enTarifario() || $('.muestra-barra')) return;

  const salir = new URLSearchParams(location.search);
  salir.set('muestra', 'no');

  const barra = document.createElement('div');
  barra.className = 'muestra-barra';
  barra.innerHTML = `<span class="muestra-barra__texto">Vista con las medidas del tarifario</span>
    <a class="muestra-barra__salir" href="${esc(location.pathname)}?${esc(salir.toString())}">Salir</a>`;
  document.body.prepend(barra);

  /* El alto se mide, no se fija: según el ancho el rótulo cabe en una
     línea o en dos, y la cabecera —que es `sticky top: 0`— tiene que
     quedar justo debajo en ambos casos. */
  const medir = () => document.documentElement.style.setProperty(
    '--muestra-alto', `${Math.ceil(barra.getBoundingClientRect().height)}px`);
  medir();
  if ('ResizeObserver' in window) new ResizeObserver(medir).observe(barra);
}

/* Intercala el cuadro móvil (H) tras el tercer anuncio de una lista.
   Tras el tercero y no al principio: en el teléfono la lista es lo que
   se vino a ver, y un anuncio antes del primer equipo es el que se
   salta con el dedo sin leerlo. */
async function montarPubEnLista(lista) {
  if (!lista) return;
  const campanas = await campanasVigentes();
  const suyas = campanas['movil-lista'] || [];
  if (!suyas.length && !espaciosVisibles()) return;

  const avisos = $$(':scope > li.aviso', lista);
  if (avisos.length < 3) return;          // con menos de tres no hay dónde intercalar

  const li = document.createElement('li');
  li.className = 'pub pub--movil-lista';
  li.setAttribute('aria-label', 'Publicidad');
  li.hidden = true;
  avisos[2].after(li);
  pintarEspacio('movil-lista', li, suyas);
}

/* Rellena los espacios fijos de la página. La ficha y las listas se
   pintan aparte, cuando su contenido existe. */
async function montarPublicidad() {
  montarBarraMuestra();

  const fijos = Object.entries(ESPACIOS_PUB)
    .filter(([, e]) => e.sel)
    .map(([id, e]) => [id, $(e.sel)])
    .filter(([, caja]) => caja);

  if (fijos.length) {
    const campanas = await campanasVigentes();
    fijos.forEach(([id, caja]) => pintarEspacio(id, caja, campanas[id]));
  }

  /* Los rieles arrancan justo debajo del héroe. Se mide en vez de
     fijarlo: el alto del héroe cambia con el ancho de la ventana, con
     cuántas líneas ocupe el titular y con las cifras del catálogo, que
     llegan de la API después de que esto se ejecute.

     Por eso un ResizeObserver y no una medida única: al principio el
     héroe todavía no tiene las cifras y sale más bajo de lo que
     acabará siendo, y el riel se montaba encima. */
  const heroe = document.querySelector('.heroe');
  if (heroe && 'ResizeObserver' in window) {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty(
        '--pub-arranque', `${Math.round(heroe.offsetHeight + 28)}px`);
    }).observe(heroe);
  }
}

/* ── Alquiler, financiamiento, planes ───────────────────── */

/* La flota de alquiler viene de la base, no del código: el equipo la
   administra desde /admin.html sin tocar un archivo ni desplegar.
   EQUIPOS_ALQUILER queda como reserva por si la API no responde, para
   que la página no salga vacía. */
async function montarAlquiler() {
  const cont = $('#alquilerLista');
  if (!cont) return;

  const datos = await api('/flota/alquiler', { silencioso: true });
  const flota = (datos && datos.flota && datos.flota.length)
    ? datos.flota
    : (typeof EQUIPOS_ALQUILER !== 'undefined' ? EQUIPOS_ALQUILER : []);

  /* Se elige una FUNCIÓN, no una máquina y ni siquiera un tamaño.

     Antes cada ficha decía «Clase CAT 320», y después «Excavadora · 18
     a 22 toneladas». Las dos cosas prometían algo que nadie se
     comprometió a entregar: quien alquila necesita excavar, no
     necesita veinte toneladas. Del tamaño decidimos nosotros al
     recibir la solicitud, con la accesibilidad y el trabajo delante.

     Por eso tampoco se anuncia la capacidad aunque la ficha la tenga
     guardada, y por eso las fotos son varias y de marcas distintas:
     enseñar una sola vuelve a prometer esa misma máquina. */
  cont.innerHTML = flota.map((a) => {
    const fotos = (a.fotos || []).slice(0, 4);

    return `<li>
      <label class="alq">
        <input type="checkbox" name="equipo" value="${esc(a.nombre)}" data-rotulo="Equipos requeridos">
        <span class="alq__galeria">
          ${fotos.length
            ? fotos.map((f) => `<img src="${esc(f.url)}" alt="${esc(f.alt || a.nombre)}" loading="lazy" decoding="async">`).join('')
            : `<span class="alq__ico">${icono(a.icono || 'i-hex')}</span>`}
        </span>
        <span class="alq__cuerpo">
          <span class="alq__nombre">${esc(a.nombre)}</span>
          <span class="alq__detalle">${esc(a.detalle || '')}</span>
          <span class="alq__nota">Asignamos el tamaño y la unidad disponibles según su trabajo.</span>
        </span>
      </label>
    </li>`;
  }).join('');
}

function montarFinanciadoras() {
  const cont = $('#financiadoras');
  if (!cont) return;
  cont.innerHTML = FINANCIADORAS.map((f) => `<li class="fin">
    <div class="fin__cabeza">
      <span class="fin__tipo etiqueta">${esc(f.tipo)}</span>
      <h3 class="fin__nombre">${esc(f.nombre)}</h3>
    </div>
    <p class="fin__enfoque">${esc(f.enfoque)}</p>
    <p class="etiqueta">Piden</p>
    <ul class="fin__req">${f.requisitos.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>
    <dl class="fin__contacto">
      <div><dt>Teléfono</dt><dd>${f.telefono ? `<a href="tel:${esc(f.telefono)}" class="num">${esc(f.telefono)}</a>` : '<span class="pendiente">por confirmar</span>'}</dd></div>
      <div><dt>Correo</dt><dd>${f.correo ? `<a href="mailto:${esc(f.correo)}">${esc(f.correo)}</a>` : '<span class="pendiente">por confirmar</span>'}</dd></div>
      <div><dt>Web</dt><dd>${f.web ? `<a href="${esc(f.web)}" rel="noopener">${esc(f.web)}</a>` : '<span class="pendiente">por confirmar</span>'}</dd></div>
    </dl>
  </li>`).join('');
}

/* ── Niveles ────────────────────────────────────────────── */

/* EL PRECIO LO MANDA EL SERVIDOR, SIEMPRE.

   Los tres niveles —Estándar, Destacado y Premium— y lo que cuesta un
   cupo de cada uno salen de la tabla `planes`, que es la misma fila
   que después se cobra. Antes había además una copia en data.js, y por
   ahí la página llegó a ofrecer el nivel Estándar sin costo mientras
   el servidor cobraba RD$2,000 más ITBIS.

   El cálculo del importe —descuento por cantidad, recargo de 60 días,
   prorrateo— vive en assets/precios.js, que cargan las dos partes. */
let NIVELES_SITIO = [];

async function cargarPlanes() {
  const datos = await api('/planes', { silencioso: true });
  NIVELES_SITIO = (datos && datos.planes) || [];
  return NIVELES_SITIO;
}

const nivelPorId = (id) => NIVELES_SITIO.find((p) => p.id === id) || null;

/* Hay promoción mientras algún nivel la tenga viva. No se calcula
   contra una fecha escrita en el cliente: se lee de lo que respondió
   el servidor. */
const promoActiva = () => NIVELES_SITIO.some((p) => p.en_promo);

const finPromo = () => (NIVELES_SITIO.find((p) => p.en_promo) || {}).promo_hasta || null;

/* Rótulos de la promoción de lanzamiento. Si no hay promoción viva, el
   aviso entero se retira en vez de quedarse anunciando algo que ya no
   rige. */
/* Días que faltan para una fecha AAAA-MM-DD, contando días de
   calendario y no horas: a las 11 de la noche del día 29 faltaba «0
   días» para el 30 porque quedaban menos de 24 horas.

   Se compara en UTC contra la medianoche local de hoy para que el
   resultado no cambie con la zona horaria del visitante. */
function diasHasta(iso) {
  const [a, m, d] = String(iso).split('-').map(Number);
  if (!a || !m || !d) return null;
  const hoy = new Date();
  return Math.round(
    (Date.UTC(a, m - 1, d) - Date.UTC(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()))
    / 86400000);
}

function montarPromo() {
  const fin = finPromo();

  $$('[data-promo-hasta]').forEach((el) => {
    // El bloque entero, no solo la fecha: un anuncio de oferta al que
    // se le quita la fecha sigue anunciando una oferta.
    const aviso = el.closest('[data-promo-aviso]') || el.closest('.realce') || el;
    if (!fin) { aviso.hidden = true; return; }
    aviso.hidden = false;
    el.textContent = fechaLarga(fin);
  });

  /* Cuánto queda. Es lo que convierte «hay una oferta» en «conviene
     hacerlo esta semana», y sale de la misma fecha que se cobra, así
     que no puede desmentir a la caja. */
  const quedan = fin === null ? null : diasHasta(fin);
  $$('[data-promo-quedan]').forEach((el) => {
    if (quedan === null || quedan < 0) { el.hidden = true; return; }
    el.hidden = false;
    el.textContent = quedan === 0 ? 'Último día'
      : quedan === 1 ? 'Queda 1 día'
      : `Quedan ${quedan} días`;
  });
}

/* La portada anuncia el ahorro de contratar 60 días; sale del mismo
   cálculo que se aplica al cobrar. */
function montarAhorroPortada() {
  const el = $('#ahorroPortada');
  if (el) el.textContent = `ahorras ${ahorro60()} %`;
}

/* ── Transporte y seguimiento GPS ───────────────────────── */

/**
 * Posición actual de un envío. ESTE ES EL ÚNICO PUNTO DEL SITIO QUE
 * TOCA EL GPS: cuando se contrate el proveedor, se escribe aquí la
 * llamada a su API y todo lo demás sigue funcionando igual.
 *
 * Debe devolver una promesa con:
 *   { lat, lon, rumbo, velocidad, estado, actualizado, avance }
 *   estado: 'cargando' | 'en-ruta' | 'entregado' | 'desconocido'
 *   avance: 0 a 1 sobre la ruta
 *
 * Con PROVEEDOR_GPS en null no hay rastreo real: se devuelve una
 * posición simulada sobre la ruta de ENVIO_DEMO, y la interfaz la
 * rotula como demostración.
 */
async function posicionEnvio(codigo) {
  if (PROVEEDOR_GPS) {
    // Aquí va la llamada real. Ejemplo de la forma esperada:
    //   const r = await fetch(`${PROVEEDOR_GPS.url}/posicion/${codigo}`,
    //     { headers: { Authorization: `Bearer ${PROVEEDOR_GPS.token}` } });
    //   return normalizar(await r.json());
    throw new Error('Proveedor de GPS configurado pero sin implementar');
  }

  if (codigo.trim().toUpperCase() !== ENVIO_DEMO.codigo) {
    return { estado: 'desconocido' };
  }

  // Simulación: el avance se deriva de la hora, para que el camión
  // esté en un punto distinto cada vez que se abre la página.
  const puntos = puntosDeRuta(ENVIO_DEMO);
  const ciclo = 6 * 60 * 1000;                       // una vuelta cada 6 min
  const avance = (Date.now() % ciclo) / ciclo;
  const p = posicionEnRuta(puntos, avance);

  return {
    lat: p.lat,
    lon: p.lon,
    rumbo: p.rumbo,
    velocidad: 62,
    estado: avance < 0.02 ? 'cargando' : avance > 0.98 ? 'entregado' : 'en-ruta',
    actualizado: new Date(),
    avance,
  };
}

const ESTADOS_ENVIO = {
  'cargando':    { texto: 'Cargando en origen', clase: 'estado--cargando' },
  'en-ruta':     { texto: 'En ruta',            clase: 'estado--ruta' },
  'entregado':   { texto: 'Entregado',          clase: 'estado--entregado' },
  'desconocido': { texto: 'Sin señal',          clase: 'estado--sin' },
};

/* 24 horas, para que todas las horas del panel se lean igual. */
const hhmm = (d) => d.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: false });

/* Suma minutos a un "HH:MM" y devuelve otro "HH:MM". */
function sumarMinutos(hora, minutos) {
  const [h, m] = hora.split(':').map(Number);
  const t = new Date(2000, 0, 1, h, m + Math.round(minutos));
  return hhmm(t);
}

function montarSeguimiento() {
  const panel = $('#panelSeguimiento');
  if (!panel) return;

  const lienzo = $('#mapaEnvio');
  const datos = $('#seguimientoDatos');
  const forma = $('#formSeguimiento');
  const campo = $('#codigoEnvio');
  if (!lienzo || !datos) return;

  const quieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let temporizador = null;

  async function refrescar(codigo) {
    const pos = await posicionEnvio(codigo);

    if (pos.estado === 'desconocido') {
      lienzo.innerHTML = '';
      datos.innerHTML = `<p class="seguimiento__vacio">
        No encontramos el envío <b>${esc(codigo)}</b>. Revisa el código o escríbenos
        y lo localizamos: el código figura en el correo de confirmación de la reserva.</p>`;
      return;
    }

    const puntos = puntosDeRuta(ENVIO_DEMO);
    const total = largoRutaKm(puntos);
    const faltan = Math.max(0, Math.round(total * (1 - pos.avance)));
    const minutosFaltan = pos.velocidad ? (faltan / pos.velocidad) * 60 : 0;
    const est = ESTADOS_ENVIO[pos.estado];

    const viajeMin = pos.velocidad ? (total / pos.velocidad) * 60 : 0;
    /* En la demo las horas salen del horario del envío, no del reloj de
       quien mira: mezclar ambos daría una señal de las 3 a.m. en un viaje
       que salió a las 8:10. Con proveedor real manda su marca de tiempo. */
    const ultimaSenal = PROVEEDOR_GPS
      ? hhmm(pos.actualizado)
      : sumarMinutos(ENVIO_DEMO.salida, viajeMin * pos.avance);

    const origen = puntos[0].nombre;
    const destino = puntos[puntos.length - 1].nombre;
    const descripcion = `Mapa de República Dominicana. El equipo va de ${origen} a ${destino}; ` +
      `ha recorrido el ${Math.round(pos.avance * 100)} % de la ruta y le faltan ${faltan} kilómetros.`;

    dibujarMapa(lienzo, { puntos, posicion: pos, avance: pos.avance, descripcion });

    datos.innerHTML = `
      <div class="seguimiento__campo seguimiento__campo--estado">
        <span class="etiqueta">Estado</span>
        <b class="estado ${est.clase}">${est.texto}</b>
      </div>
      <div class="seguimiento__campo">
        <span class="etiqueta">Equipo</span>
        <b>${esc(ENVIO_DEMO.equipo)}</b>
      </div>
      <div class="seguimiento__campo">
        <span class="etiqueta">Unidad</span>
        <b>${esc(ENVIO_DEMO.unidad)} · ${esc(ENVIO_DEMO.cama)}</b>
      </div>
      <div class="seguimiento__campo">
        <span class="etiqueta">Salió</span>
        <b class="num">${esc(ENVIO_DEMO.salida)}</b>
      </div>
      <div class="seguimiento__campo">
        <span class="etiqueta">Llegada estimada</span>
        <b class="num">${sumarMinutos(ENVIO_DEMO.salida, viajeMin)}</b>
      </div>
      <div class="seguimiento__campo">
        <span class="etiqueta">Faltan</span>
        <b class="num">${miles(faltan)} km · ${Math.round(minutosFaltan)} min</b>
      </div>
      <div class="seguimiento__campo">
        <span class="etiqueta">Velocidad</span>
        <b class="num">${pos.velocidad} km/h</b>
      </div>
      <div class="seguimiento__campo">
        <span class="etiqueta">Última señal</span>
        <b class="num">${ultimaSenal}</b>
      </div>`;
  }

  function seguir(codigo) {
    clearInterval(temporizador);
    refrescar(codigo);
    // Con movimiento reducido no se refresca solo: se ve la posición y ya.
    if (!quieto) temporizador = setInterval(() => refrescar(codigo), 15000);
  }

  if (forma) {
    forma.addEventListener('submit', (ev) => {
      ev.preventDefault();
      seguir(campo.value || ENVIO_DEMO.codigo);
    });
  }

  if (campo && !campo.value) campo.value = ENVIO_DEMO.codigo;
  seguir(ENVIO_DEMO.codigo);
}

/* Formulario de reserva: llena los select propios de transporte y
   precarga el equipo cuando se llega desde una ficha. */
async function montarTransporte() {
  const forma = $('#formTransporte');
  if (!forma) return;

  /* Las camas vienen de la base. Se piden una sola vez y alimentan el
     selector del formulario y la lista de la flota, que son la misma
     información en dos sitios. */
  const datosFlota = await api('/flota/transporte', { silencioso: true });
  const camas = (datosFlota && datosFlota.flota && datosFlota.flota.length)
    ? datosFlota.flota
    : (typeof FLOTA_TRANSPORTE !== 'undefined' ? FLOTA_TRANSPORTE : []);

  const cama = forma.querySelector('select[name="Tipo de cama"]');
  if (cama) {
    camas.forEach((f) =>
      cama.add(new Option(`${f.nombre} — ${f.detalle || ''}`.trim(), f.nombre)));
  }

  const lista = $('#flotaLista');
  if (lista) {
    lista.innerHTML = camas.map((f) => `<li class="cama">
      <span class="cama__ico">${icono(f.icono || 'i-lowboy')}</span>
      <span class="cama__cuerpo">
        <span class="cama__nombre">${esc(f.nombre)}</span>
        <span class="cama__detalle">${esc(f.detalle || '')}</span>
      </span>
      <span class="cama__cap num">hasta ${Number(f.capacidad) || '—'} t</span>
    </li>`).join('');
  }

  // Llegada desde una ficha de equipo: se precarga lo que ya sabemos
  // para que no haya que volver a escribirlo.
  const idEquipo = params().get('equipo');
  if (!idEquipo) return;
  const datos = await api(`/anuncios/${encodeURIComponent(idEquipo)}`, { silencioso: true });
  if (!datos || !datos.anuncio) return;
  const e = anuncioDeApi(datos.anuncio);

  const poner = (nombre, valor) => {
    const campo = forma.elements[nombre];
    if (campo && valor) campo.value = valor;
  };
  poner('Equipo', nombreEquipo(e));
  poner('Tipo de equipo', nombreCategoria(e.categoria));
  poner('Origen', e.provincia);

  const aviso = $('#transporteDesdeFicha');
  if (aviso) {
    aviso.hidden = false;
    aviso.innerHTML = `${icono('i-lowboy')} <span>Cotizando el transporte de
      <b>${esc(nombreEquipo(e))}</b>, publicado en ${esc(e.provincia)}.
      <a href="equipo.html?id=${encodeURIComponent(e.id)}">Ver la ficha</a></span>`;
  }
}

/* Llegada al formulario de contacto desde una ficha: se rellena el
   motivo y se identifica el anuncio. Sin esto, quien pulsa "reportar
   este anuncio" tiene que explicar de memoria cuál era. */
async function montarContactoDesdeFicha() {
  const form = $('form[data-cotizacion="resumenContacto"]');
  if (!form) return;

  const p = params();
  const idEquipo = p.get('equipo');
  const motivo = form.elements.Motivo;

  if (p.get('motivo') === 'reporte' && motivo) motivo.value = 'Reportar un anuncio';
  if (!idEquipo) return;

  const datos = await api(`/anuncios/${encodeURIComponent(idEquipo)}`, { silencioso: true });
  if (!datos || !datos.anuncio) return;
  const e = anuncioDeApi(datos.anuncio);

  const mensaje = form.elements.Mensaje;
  if (mensaje && !mensaje.value) {
    mensaje.value = `Sobre el anuncio "${nombreEquipo(e)}" (${precioTexto(e)}), publicado en ${e.provincia || 'República Dominicana'}.\nReferencia: ${e.id}\n\n`;
    mensaje.focus();
    mensaje.setSelectionRange(mensaje.value.length, mensaje.value.length);
  }

  const aviso = $('#contactoDesdeFicha');
  if (aviso) {
    aviso.hidden = false;
    aviso.innerHTML = `${icono('i-etiqueta')} <span>Su mensaje hace referencia a
      <b>${esc(nombreEquipo(e))}</b>. <a href="equipo.html?id=${encodeURIComponent(e.id)}">Ver la ficha</a></span>`;
  }
}

/* ── Calculadora de cuota ───────────────────────────────── */

const TASA_ANUAL = 0.14;

function montarCalculadora() {
  const form = $('#calc');
  if (!form) return;
  const valor = $('#c-valor');
  const plazo = $('#c-plazo');
  const salida = $('#calcCuota');

  const aNumero = (s) => Number(String(s).replace(/[^\d]/g, '')) || 0;

  function calcular() {
    const p = aNumero(valor.value);
    const n = Number(plazo.value);
    if (p <= 0) { salida.textContent = '—'; return; }
    const i = TASA_ANUAL / 12;
    salida.textContent = pesos((p * i) / (1 - Math.pow(1 + i, -n)));
  }

  valor.addEventListener('blur', () => {
    const n = aNumero(valor.value);
    valor.value = n ? miles(n) : '';
    calcular();
  });
  plazo.addEventListener('change', calcular);
  form.addEventListener('submit', (ev) => { ev.preventDefault(); calcular(); });

  // El monto puede venir de un anuncio: equipo.html → financiamiento
  const monto = params().get('monto');
  if (monto) valor.value = miles(Number(monto));
  calcular();
}

/* ── Cabecera ───────────────────────────────────────────── */

function montarNav() {
  const toggle = $('#navToggle');
  const menu = $('#navMenu');
  if (toggle && menu) {
    toggle.addEventListener('click', () => {
      const abierto = menu.classList.toggle('is-abierto');
      toggle.setAttribute('aria-expanded', String(abierto));
      toggle.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
    });
  }
  // Marca el enlace de la página actual.
  const aqui = location.pathname.split('/').pop() || 'index.html';
  $$('.cab__nav a').forEach((a) => {
    if (a.getAttribute('href') === aqui) a.setAttribute('aria-current', 'page');
  });
}

/* ── Formularios de cotización ──────────────────────────── */

/* Cotizaciones de alquiler, transporte e importación.

   ESTO NO MANDABA NADA. Pintaba un resumen en pantalla y le pedía al
   cliente que lo copiara a WhatsApp. Quien no lo copiaba —que es casi
   todo el mundo— se perdía, y encima sin dejar rastro de cuántos se
   perdían. Ahora la solicitud llega al equipo por correo, queda
   guardada y el cliente recibe una referencia.

   El botón de WhatsApp hace el mismo recorrido por otro canal: exige
   el formulario completo y abre el chat con la solicitud ya escrita.
   Antes era un enlace suelto a un chat en blanco, y quien lo pulsaba
   perdía todo lo que acababa de rellenar. */
const ROTULO_SERVICIO = {
  alquiler: 'alquiler de equipo',
  transporte: 'transporte de equipo',
  importacion: 'importación de maquinaria',
  contacto: 'contacto',
};

function montarCotizaciones() {
  $$('form[data-cotizacion]').forEach((form) => {
    const servicio = form.dataset.servicio || 'alquiler';

    /* El rótulo sale de `data-rotulo` si el campo lo trae, y si no de
       su propia etiqueta: así el correo dice «Provincia de la obra» y
       no «Provincia», sin mantener una segunda lista de nombres que se
       desincroniza con el formulario.

       El `data-rotulo` existe por las casillas de equipo: cada una
       vive dentro de una etiqueta que envuelve la ficha entera, y sin
       esto el correo llegaba con el nombre, el detalle y la nota de la
       ficha metidos como si fueran el rótulo del campo. */
    const etiquetaDe = (clave) => {
      const campo = form.querySelector(`[name="${clave}"]`);
      if (campo && campo.dataset.rotulo) return campo.dataset.rotulo;
      const lab = campo && (campo.closest('label') || form.querySelector(`label[for="${campo.id}"]`));
      if (!lab) return clave;

      /* El campo va DENTRO de su etiqueta, así que su texto cuenta como
         texto del rótulo. En un <select> eso son todas las opciones: el
         correo llegaba diciendo «Provincia de la obra Seleccione
         unaDistrito NacionalSanto Domingo…: Santiago». Se copia la
         etiqueta, se le quitan los campos y se lee lo que queda. */
      const copia = lab.cloneNode(true);
      copia.querySelectorAll('input, select, textarea').forEach((c) => c.remove());
      return copia.textContent.trim().replace(/\s+/g, ' ').replace(/\s*\*$/, '') || clave;
    };

    /* Lee el formulario una vez y lo parte en contacto y detalle. Lo
       usan el envío al servidor y el envío por WhatsApp, que tienen
       que mandar exactamente lo mismo. */
    const leer = () => {
      const valores = {};
      new FormData(form).forEach((valor, clave) => {
        if (!valor) return;
        valores[clave] = valores[clave] ? `${valores[clave]}, ${valor}` : valor;
      });

      // Los datos de contacto viajan aparte: son los que deciden si la
      // solicitud sirve de algo, y el servidor los exige.
      const detalle = {};
      Object.entries(valores).forEach(([k, v]) => {
        if (['Nombre', 'Teléfono', 'Correo', 'Empresa'].includes(k)) return;
        detalle[etiquetaDe(k)] = v;
      });
      return { valores, detalle };
    };
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const destino = $('#' + form.dataset.cotizacion);
      const boton = form.querySelector('button[type="submit"]');
      if (!destino) return;

      const { valores, detalle } = leer();
      const antes = boton ? boton.innerHTML : '';
      if (boton) { boton.disabled = true; boton.textContent = 'Enviando…'; }

      const fallar = (mensaje) => {
        if (boton) { boton.disabled = false; boton.innerHTML = antes; }
        destino.hidden = false;
        destino.innerHTML = `<p class="resumen__error">${icono('i-aviso')} ${esc(mensaje)}</p>`;
        destino.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };

      try {
        const r = await api('/solicitudes', {
          metodo: 'POST',
          cuerpo: {
            servicio,
            nombre: valores.Nombre || '',
            telefono: valores['Teléfono'] || '',
            correo: valores.Correo || '',
            empresa: valores.Empresa || '',
            detalle,
          },
        });
        if (!r) throw new Error('No hay conexión con el servidor. Inténtelo de nuevo en un momento.');

        form.hidden = true;
        destino.hidden = false;
        destino.innerHTML = `
          <h3 class="resumen__titulo">${icono('i-check')} Solicitud enviada</h3>
          <p class="resumen__texto">${esc(r.mensaje)}</p>
          <dl class="resumen__lista">
            <div><dt>Referencia</dt><dd class="num">${esc(r.referencia)}</dd></div>
            ${Object.entries(detalle).map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}
          </dl>
          <p class="resumen__nota">Guarde la referencia. Si quiere añadir algo, escríbanos a
            <a href="mailto:ventas@mercamaquinarias.com">ventas@mercamaquinarias.com</a> citándola.</p>`;
        destino.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        fallar(e.message);
      }
    });
  });
}

/* ── Catálogo desde la API ──────────────────────────────── */

/* Traduce un anuncio de la base al objeto que usan las plantillas.
   Existe para que el resto del código no dependa de los nombres de las
   columnas: si mañana cambia una, se ajusta esta función y nada más. */
function anuncioDeApi(a) {
  return {
    id: a.id,
    anio: a.anio,
    // `marca` guarda el id, que es lo que va en el enlace del filtro;
    // `marca_nombre` es lo que se muestra. Los dos, o la tarjeta
    // acabaría rotulando «2017 jcb 3CX».
    marca: a.marca,
    marca_nombre: a.marca_nombre,
    modelo: a.modelo,
    categoria: a.categoria,
    subcategoria: a.subcategoria,
    subcategoria_nombre: a.subcategoria_nombre,
    motor_marca: a.motor_marca,
    motor_marca_nombre: a.motor_marca_nombre,
    motor_modelo: a.motor_modelo,
    transmision_marca: a.transmision_marca,
    transmision_marca_nombre: a.transmision_marca_nombre,
    transmision_modelo: a.transmision_modelo,
    uso: { valor: a.uso_valor || 0, unidad: a.uso_unidad || 'h' },
    condicion: a.condicion,
    precio: a.precio,
    moneda: a.moneda,
    provincia: a.provincia,
    municipio: a.municipio,
    potencia: a.potencia,
    peso: a.peso,
    implementos: a.implementos,
    destacado: !!a.destacado_hasta && a.destacado_hasta > new Date().toISOString(),
    verificado: !!a.verificada,
    ofertas: a.modalidad_precio === 'ofertas',
    permuta: !!a.permuta,
    financiamiento: !!a.financiamiento,
    itbisIncluido: !!a.itbis_incluido,
    esEmpresa: a.org_tipo === 'dealer',
    dealer: a.dealer,
    dealerSlug: a.dealer_slug,
    // El listado resuelve la portada en SQL (`foto`); la ficha trae la
    // galería entera y ninguna portada aparte. Se toma la primera para
    // que las dos vistas usen el mismo campo.
    foto: a.foto || (Array.isArray(a.fotos) ? a.fotos[0] : null),
    fotosTotal: a.fotos_total != null ? a.fotos_total : (a.fotos || []).length,
    descripcion: a.descripcion,
    fotos: a.fotos,
    videos: a.videos || [],
    telefonos: a.telefonos,
    publicado: a.publicado,
  };
}

/* Las marcas que se ofrecen a quien busca son las que hoy tienen
   inventario. Se rellenan cuando llegan las estadísticas, no antes:
   ofrecer una marca sin equipos manda al comprador a una lista vacía. */
function refrescarMarcasActivas() {
  $$('select[data-marcas="activas"]').forEach((sel) => {
    const elegida = sel.value;
    sel.length = 1;                       // conserva «Todas las marcas»
    marcasConEquipos().forEach((m) => sel.add(new Option(m.marca, m.marca)));
    if (elegida) {
      if (![...sel.options].some((o) => o.value === elegida)) sel.add(new Option(elegida, elegida));
      sel.value = elegida;
    }
  });
}

/* Registro de interacciones. No bloquea nada ni interrumpe al usuario:
   si falla, se pierde una métrica y ya. */
const anotar = (idAnuncio, tipo) =>
  api('/eventos', { metodo: 'POST', cuerpo: { anuncio: idAnuncio, tipo }, silencioso: true });

function montarNavMovil() {
  if (document.querySelector('.nav-movil')) return;
  const pagina = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const items = [
    ['index.html', 'Inicio', '<path d="M3 11.5 12 4l9 7.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19.5z"/><path d="M8.5 21v-6h7v6"/>'],
    ['equipos.html', 'Equipos', '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'],
    ['publicar.html', 'Publicar', '<path d="M12 3v18M3 12h18"/>'],
    ['cuenta.html', 'Cuenta', '<circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/>'],
  ];
  const activo = ['categorias.html', 'equipo.html'].includes(pagina) ? 'equipos.html' : pagina;
  const nav = document.createElement('nav');
  nav.className = 'nav-movil';
  nav.setAttribute('aria-label', 'Navegación móvil');
  nav.innerHTML = items.map(([href, nombre, trazos]) =>
    `<a href="${href}"${activo === href ? ' class="is-activo" aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${trazos}</svg><span>${nombre}</span></a>`
  ).join('');
  document.body.appendChild(nav);
}

async function montarSaludoUsuario() {
  const saludo = document.querySelector('#saludoUsuario');
  if (!saludo) return;
  if (SESION.cargando) await cargarSesion();
  if (!haySesion()) return;
  const nombreCompleto = SESION.usuario && SESION.usuario.nombre;
  const nombre = (nombreCompleto || '').trim().split(/\s+/)[0];
  if (!nombre) return;
  saludo.textContent = `Hola, ${nombre}`;
  saludo.hidden = false;
}

/* ── Arranque ───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  // Primero lo que no depende del catálogo, para que la página sea
  // utilizable desde el primer instante y el asistente de publicación
  // encuentre los <select> ya poblados al arrancar.
  inyectarSprite();
  montarNav();
  montarEnlaceGuardados();
  montarNavMovil();
  montarSaludoUsuario();
  montarSelects();
  montarAlquiler();
  /* Los servicios apagados. El código se queda entero y sin correr: el
     transporte y el directorio de financiamiento vienen después del
     lanzamiento, y borrar mil líneas que ya funcionan para tener que
     reescribirlas dentro de unos meses no sale a cuenta. El
     interruptor está en assets/servicios.js y es una línea. */
  if (seOfrece('financiamiento')) {
    montarFinanciadoras();
    montarCalculadora();
  }
  if (seOfrece('transporte')) montarSeguimiento();

  montarAhorroPortada();
  montarCotizaciones();
  montarBuscador();
  montarPublicidad();

  /* Las tarifas, las cifras del catálogo y las fotografías de la
     portada las comparten varios bloques, así que se piden una vez, en
     paralelo, antes de pintar nada que las use.

     La del héroe se monta en cuanto llega y sin esperar al resto: es
     lo primero que se ve de la página. */
  const [, , portada] = await Promise.all([
    cargarPlanes(), cargarEstadisticas(), cargarPortada(),
  ]);
  montarHeroeFoto(portada);
  montarPromo();
  refrescarMarcasActivas();
  montarCifrasPortada();
  montarMosaicoCategorias();
  montarMarcas();
  montarCategoriasPagina();

  await Promise.all([
    montarDestacados(),
    montarRecientes(),
    montarDealers(),
    montarResultados(),
    montarDetalle(),
    montarGuardados(),
    seOfrece('transporte') ? montarTransporte() : null,
    montarContactoDesdeFicha(),
  ]);

  /* Los carruseles van al final: hasta aquí las pistas estaban vacías,
     y midiendo un contenedor sin contenido las flechas habrían salido
     apagadas para siempre. */
  montarCarruseles();
});
