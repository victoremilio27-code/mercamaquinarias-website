/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Página pública del dealer

   La presencia de la empresa dentro de la plataforma: quién es, dónde
   está y todo lo que tiene publicado, en una sola dirección que puede
   compartir en su publicidad.

   LO QUE PINTA Y LO QUE NO

   El orden de los bloques lo decide el dealer desde mi-pagina.html, y
   aquí solo se recorre la lista que llega. Lo fijo —la cabecera con su
   logotipo, su lema y sus botones de contacto— va arriba siempre,
   porque es lo que un comprador mira antes de decidir si sigue
   leyendo.

   Un dealer que todavía no ha armado nada no ve un esqueleto vacío:
   sin bloques se pinta el inventario, que es lo que de verdad va a
   buscar quien entra.
   ═══════════════════════════════════════════════════════════ */

/* Las redes, con el nombre que se enseña y cómo se construye el
   enlace. WhatsApp es el raro: se guarda el número, no la dirección. */
const REDES_PERFIL = {
  instagram: { nombre: 'Instagram', enlace: (v) => v },
  facebook: { nombre: 'Facebook', enlace: (v) => v },
  youtube: { nombre: 'YouTube', enlace: (v) => v },
  tiktok: { nombre: 'TikTok', enlace: (v) => v },
  linkedin: { nombre: 'LinkedIn', enlace: (v) => v },
  web: { nombre: 'Sitio web', enlace: (v) => v },
  whatsapp: {
    nombre: 'WhatsApp',
    enlace: (v) => {
      const d = String(v).replace(/\D/g, '');
      return `https://wa.me/${d.length === 10 ? `1${d}` : d}`;
    },
  },
};

function sucursalHTML(s) {
  const donde = [s.municipio, s.provincia].filter(Boolean).join(', ');
  /* El horario y el WhatsApp llevaban meses guardándose y no se
     pintaban en ningún sitio: el dealer los rellenaba en su panel y no
     los veía nunca. Son justo los dos datos que alguien busca antes de
     acercarse a un taller. */
  return `<li class="sucursal">
    <span class="sucursal__ico">${icono('i-pin')}</span>
    <span>
      <b>${esc(s.nombre)}</b>${s.principal && !/principal/i.test(s.nombre)
        ? ' <span class="pastilla pastilla--azul">Principal</span>' : ''}
      <span class="sucursal__meta">${esc(donde || 'República Dominicana')}${s.direccion ? ` · ${esc(s.direccion)}` : ''}</span>
      ${s.horario ? `<span class="sucursal__meta">${esc(s.horario)}</span>` : ''}
    </span>
    ${s.telefono ? `<a class="sucursal__tel num" href="tel:${esc(String(s.telefono).replace(/\D/g, ''))}">${esc(s.telefono)}</a>` : ''}
    ${s.whatsapp ? `<a class="sucursal__tel num" href="https://wa.me/1${esc(String(s.whatsapp).replace(/\D/g, ''))}" rel="noopener">WhatsApp</a>` : ''}
  </li>`;
}

/* ── Los bloques que el dealer armó ────────────────────────
   Cada tipo sabe pintarse con lo que le corresponde. Un tipo que no
   se reconozca devuelve cadena vacía en vez de romper la página: el
   día que se añada uno nuevo, una versión vieja del script no puede
   dejar el perfil en blanco. */
function bloqueHTML(bloque, datos) {
  const titulo = bloque.titulo
    ? `<h2 class="perfil-seccion__titulo">${esc(bloque.titulo)}</h2>` : '';
  const envolver = (dentro) => (dentro
    ? `<section class="perfil-seccion">${titulo}${dentro}</section>` : '');

  const anuncios = datos.anuncios || [];
  const cuerpo = bloque.cuerpo || {};

  if (bloque.tipo === 'texto') {
    if (!cuerpo.texto) return '';
    /* Los saltos de línea del dealer se respetan, pero el texto se
       escapa antes: lo escribe él y acaba en una página pública. */
    const parrafos = String(cuerpo.texto).split(/\n{2,}/)
      .map((p) => `<p class="perfil-seccion__texto">${esc(p).replace(/\n/g, '<br>')}</p>`)
      .join('');
    return envolver(parrafos);
  }

  if (bloque.tipo === 'marcas' || bloque.tipo === 'servicios') {
    const lista = cuerpo.lista || [];
    if (!lista.length) return '';
    return envolver(`<ul class="perfil-lista">${lista.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`);
  }

  if (bloque.tipo === 'galeria') {
    const fotos = datos.galeria || [];
    if (!fotos.length) return '';
    return envolver(`<ul class="perfil-galeria">${fotos.map((f) => `
      <li><img src="${esc(f.url)}" alt="${esc(f.alt || '')}" loading="lazy"></li>`).join('')}</ul>`);
  }

  if (bloque.tipo === 'sucursales') {
    const sucursales = datos.sucursales || [];
    if (!sucursales.length) return '';
    return envolver(`<ul class="sucursales">${sucursales.map(sucursalHTML).join('')}</ul>`);
  }

  if (bloque.tipo === 'destacados') {
    const destacados = anuncios.filter((a) => a.destacado_hasta || a.destacado);
    const cuales = destacados.length ? destacados.slice(0, 8) : anuncios.slice(0, 4);
    if (!cuales.length) return '';
    return envolver(`<ul class="rejilla">${cuales.map((a) => avisoHTML(anuncioDeApi(a))).join('')}</ul>`);
  }

  if (bloque.tipo === 'inventario') {
    if (!anuncios.length) {
      return envolver('<p class="tabla-vacia">Este dealer no tiene equipos publicados en este momento.</p>');
    }
    return envolver(`<ul class="rejilla">${anuncios.map((a) => avisoHTML(anuncioDeApi(a))).join('')}</ul>`);
  }

  return '';
}

function pintarPerfil(datos) {
  const d = datos.dealer;
  const anuncios = datos.anuncios || [];
  const sucursales = datos.sucursales || [];
  const enlaces = datos.enlaces || [];
  const bloques = datos.secciones || [];

  document.title = `${d.nombre} · MercaMaquinarias`;

  // Lo que un comprador quiere saber de un vendedor antes de llamarlo:
  // desde cuándo opera, cuánto inventario tiene y de qué tipo.
  const desde = new Date(d.creada).getFullYear();
  const categorias = [...new Set(anuncios.map((a) => nombreCategoria(a.categoria)))];

  const redesHTML = enlaces.map((e) => {
    const red = REDES_PERFIL[e.tipo];
    if (!red) return '';
    return `<a class="perfil__red" href="${esc(red.enlace(e.valor))}" rel="noopener nofollow">${esc(red.nombre)}</a>`;
  }).join('');

  $('#perfilDealer').innerHTML = `
    <nav class="miga" aria-label="Ruta">
      <a href="index.html">Inicio</a> &rsaquo; <a href="dealers.html">Directorio</a> &rsaquo; <span>${esc(d.nombre)}</span>
    </nav>

    ${d.banner ? `<div class="perfil__banner"><img src="${esc(d.banner)}" alt=""></div>` : ''}

    <header class="perfil">
      <div class="${d.logo ? 'perfil__logo' : 'perfil__sello'}">
        ${d.logo ? `<img src="${esc(d.logo)}" alt="Logotipo de ${esc(d.nombre)}">` : icono('i-edificio')}
      </div>
      <div class="perfil__cuerpo">
        <h1 class="perfil__nombre">${esc(d.nombre)}</h1>
        ${d.lema ? `<p class="perfil__lema">${esc(d.lema)}</p>` : ''}
        <p class="perfil__meta">
          ${d.verificada ? `<span class="pastilla pastilla--verde">${icono('i-check')} Anunciante verificado</span>` : ''}
          <!-- Aquí se imprimía el RNC. Es un dato fiscal reservado: se
               comprueba al aprobar la empresa y no se enseña a nadie.
               Lo que el comprador necesita saber —que la empresa fue
               revisada— lo dice el sello de verificada. -->
          <span>En MercaMaquinarias desde ${desde}</span>
          <span><b class="num">${anuncios.length}</b> ${anuncios.length === 1 ? 'equipo publicado' : 'equipos publicados'}</span>
        </p>
        ${d.descripcion ? `<p class="perfil__texto">${esc(d.descripcion)}</p>` : ''}
        ${categorias.length ? `<p class="perfil__categorias">${categorias.map((c) => `<span>${esc(c)}</span>`).join('')}</p>` : ''}
        ${redesHTML ? `<div class="perfil__redes">${redesHTML}</div>` : ''}
      </div>
      <div class="perfil__acciones">
        ${d.telefono ? `<a class="btn btn--ambar" href="tel:${esc(String(d.telefono).replace(/\D/g, ''))}">${icono('i-telefono')} Llamar</a>` : ''}
        ${d.correo ? `<a class="btn btn--linea" href="mailto:${esc(d.correo)}">${icono('i-correo')} Escribir</a>` : ''}
        ${d.web ? `<a class="btn btn--linea" href="${esc(d.web)}" rel="noopener nofollow">Sitio web</a>` : ''}
      </div>
    </header>

    ${bloques.map((b) => bloqueHTML(b, datos)).join('')}`;

  /* El panel de inventario fijo solo se enseña cuando el dealer no ha
     puesto un bloque de inventario: si no, saldría el catálogo dos
     veces en la misma página. Y si no ha armado NADA, sale igual,
     porque es lo que viene a ver quien entra. */
  const tieneInventario = bloques.some((b) => b.tipo === 'inventario');
  const panel = $('#panelInventario');
  panel.hidden = tieneInventario;

  if (!tieneInventario) {
    $('#inventarioCuenta').textContent = anuncios.length;
    $('#inventarioDealer').innerHTML = anuncios.length
      ? anuncios.map((a) => avisoHTML(anuncioDeApi(a))).join('')
      : '<li class="tabla-vacia">Este dealer no tiene equipos publicados en este momento.</li>';
  }

  /* Las sucursales, cuando no las puso él como bloque: son el dato que
     más se busca de un taller y no puede depender de que se acuerde. */
  if (sucursales.length && !bloques.some((b) => b.tipo === 'sucursales')) {
    $('#perfilDealer').insertAdjacentHTML('beforeend', `
      <section class="panel" aria-labelledby="t-suc">
        <h2 class="panel__titulo" id="t-suc"><em>Sucursales</em></h2>
        <ul class="sucursales">${sucursales.map(sucursalHTML).join('')}</ul>
      </section>`);
  }
}

function noEncontrado() {
  $('#perfilDealer').innerHTML = `<div class="vacio">
    <h1 class="vacio__titulo">Ese perfil no existe</h1>
    <p class="vacio__texto">Puede que la empresa haya cerrado su cuenta o que la dirección esté mal escrita.</p>
    <div class="vacio__acciones">
      <a class="btn btn--ambar" href="dealers.html">Ver el directorio</a>
      <a class="btn btn--linea" href="equipos.html">Ver equipos publicados</a>
    </div>
  </div>`;
}

async function montarPerfil() {
  if (!$('#perfilDealer')) return;

  const slug = params().get('d');
  if (!slug) return noEncontrado();

  const datos = await api(`/dealers/${encodeURIComponent(slug)}`, { silencioso: true });
  if (!datos || !datos.dealer) return noEncontrado();
  pintarPerfil(datos);
}

document.addEventListener('DOMContentLoaded', montarPerfil);
