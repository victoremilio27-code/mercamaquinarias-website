/**
 * meta.js — los metadatos que ve quien comparte un enlace.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * El sitio pinta la ficha de un equipo con JavaScript, y los
 * rastreadores de WhatsApp, Facebook y X NO ejecutan JavaScript: leen
 * el HTML que llega y nada más. Así que todos los anuncios del catálogo
 * compartían la misma tarjeta: el título literal «Equipo», la
 * descripción genérica y el logotipo de la marca. Daba igual que fuera
 * una excavadora de cuatro millones o un camión de seiscientos mil.
 *
 * En un marketplace dominicano ese es EL canal: el anuncio se comparte
 * por WhatsApp, no se encuentra en Google. Una tarjeta que no enseña la
 * máquina ni el precio es un enlace que nadie abre.
 *
 * Como el servidor es propio, se resuelve sin framework ni prerender:
 * se lee el HTML, se sustituyen las etiquetas que ya están ahí por las
 * de este anuncio, y se sirve. El JavaScript sigue pintando la página
 * igual que antes; esto solo cambia lo que ve el rastreador.
 *
 * SOLO SE TOCAN LAS PÁGINAS CON PARÁMETRO. `equipo.html` a secas se
 * sirve tal cual, desde la caché y con su ETag: quien entra sin id no
 * está compartiendo nada.
 */

const db = require('./db');

const SITIO = (process.env.MERCA_SITIO || 'https://mercamaquinarias.com').replace(/\/+$/, '');

/* La imagen de respaldo, la del paquete de marca. Es la que había antes
   en todas las páginas y sigue siendo lo correcto cuando no hay foto. */
const IMAGEN_MARCA = `${SITIO}/brand_assets/img/og-1200x630.jpg`;

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

/* Recorta sin partir palabras: una descripción cortada a mitad de
   palabra se lee como un error del sitio. */
function recortar(texto, maximo) {
  const limpio = String(texto || '').replace(/\s+/g, ' ').trim();
  if (limpio.length <= maximo) return limpio;
  const corte = limpio.slice(0, maximo - 1);
  const ultimo = corte.lastIndexOf(' ');
  return `${(ultimo > maximo * 0.6 ? corte.slice(0, ultimo) : corte).trim()}…`;
}

const pesos = (n, moneda) => {
  const simbolo = moneda === 'USD' ? 'US$' : 'RD$';
  return `${simbolo} ${Number(n || 0).toLocaleString('en-US')}`;
};

/* Una foto que un rastreador pueda descargar.
 *
 * Las de demostración son data: URI y las externas están bloqueadas por
 * la política de contenidos, así que solo vale una ruta del propio
 * sitio; en cualquier otro caso, la imagen de marca. Y absoluta: las
 * redes no resuelven rutas relativas. */
function imagenDe(fotos) {
  const primera = (fotos || []).find((f) => typeof f === 'string' && f.startsWith('/fotos/'));
  return primera ? `${SITIO}${primera}` : IMAGEN_MARCA;
}

function delAnuncio(id) {
  const a = db.anuncio(id);
  if (!a || a.estado !== 'activo') return null;

  const nombre = [a.anio, a.marca_nombre || a.marca, a.modelo].filter(Boolean).join(' ');
  const precio = a.modalidad_precio === 'ofertas' && !a.precio
    ? 'Recibe ofertas'
    : pesos(a.precio, a.moneda);

  const donde = [a.municipio, a.provincia_nombre || a.provincia].filter(Boolean).join(', ');
  const uso = a.uso_valor ? `${Number(a.uso_valor).toLocaleString('en-US')} ${a.uso_unidad || 'h'}` : null;

  return {
    titulo: `${nombre} · ${precio} · MercaMaquinarias`,
    descripcion: recortar([
      [a.condicion === 'nuevo' ? 'Nuevo' : 'Usado', uso && `${uso} de uso`, donde]
        .filter(Boolean).join(' · '),
      a.descripcion,
    ].filter(Boolean).join('. '), 200),
    imagen: imagenDe(a.fotos),
    url: `${SITIO}/equipo.html?id=${encodeURIComponent(id)}`,
    tipo: 'product',
    /* Datos estructurados, para que el buscador entienda que esto es un
       producto con su precio y no un artículo cualquiera. */
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: nombre,
      description: recortar(a.descripcion, 400),
      image: imagenDe(a.fotos),
      brand: { '@type': 'Brand', name: a.marca_nombre || a.marca },
      ...(a.precio ? {
        offers: {
          '@type': 'Offer',
          price: a.precio,
          priceCurrency: a.moneda || 'DOP',
          availability: 'https://schema.org/InStock',
          url: `${SITIO}/equipo.html?id=${encodeURIComponent(id)}`,
        },
      } : {}),
    },
  };
}

function delDealer(slug) {
  const d = db.dealerPorSlug(slug);
  if (!d) return null;

  return {
    titulo: `${d.nombre} · MercaMaquinarias`,
    descripcion: recortar(d.descripcion
      || `Equipos en venta de ${d.nombre} en MercaMaquinarias.`, 200),
    imagen: d.logo ? `${SITIO}${d.logo}` : IMAGEN_MARCA,
    url: `${SITIO}/dealer.html?d=${encodeURIComponent(slug)}`,
    tipo: 'profile',
    jsonld: {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: d.nombre,
      description: recortar(d.descripcion, 400),
      url: `${SITIO}/dealer.html?d=${encodeURIComponent(slug)}`,
      ...(d.web ? { sameAs: [d.web] } : {}),
    },
  };
}

/* Qué metadatos le tocan a esta ruta, si es que le toca alguno. */
function para(ruta, consulta) {
  try {
    if (ruta === '/equipo.html' && consulta.get('id')) return delAnuncio(consulta.get('id'));
    if (ruta === '/dealer.html' && consulta.get('d')) return delDealer(consulta.get('d'));
  } catch (e) {
    /* Nunca puede tumbar la página: si la base falla, se sirve el HTML
       tal cual y el visitante ni se entera. Lo único que pierde es la
       vista previa al compartir. */
    console.error(`meta: no se pudieron componer los metadatos de ${ruta} · ${e.message}`);
  }
  return null;
}

/* Sustituye en el HTML lo que ya está escrito, sin añadir etiquetas
   nuevas: así la página sigue teniendo exactamente una de cada. */
function aplicar(html, meta) {
  if (!meta) return html;

  const reemplazos = [
    [/<title>[\s\S]*?<\/title>/i, `<title>${esc(meta.titulo)}</title>`],
    [/<meta name="description" content="[^"]*">/i,
      `<meta name="description" content="${esc(meta.descripcion)}">`],
    [/<meta property="og:title" content="[^"]*">/i,
      `<meta property="og:title" content="${esc(meta.titulo)}">`],
    [/<meta property="og:description" content="[^"]*">/i,
      `<meta property="og:description" content="${esc(meta.descripcion)}">`],
    [/<meta property="og:url" content="[^"]*">/i,
      `<meta property="og:url" content="${esc(meta.url)}">`],
    [/<meta property="og:image" content="[^"]*">/i,
      `<meta property="og:image" content="${esc(meta.imagen)}">`],
    [/<meta property="og:type" content="[^"]*">/i,
      `<meta property="og:type" content="${esc(meta.tipo)}">`],
  ];

  let salida = html;
  for (const [patron, con] of reemplazos) salida = salida.replace(patron, con);

  /* El canonical y los datos estructurados se insertan antes de cerrar
     la cabecera, porque no existen en el archivo. */
  const extra = [
    `<link rel="canonical" href="${esc(meta.url)}">`,
    `<script type="application/ld+json">${JSON.stringify(meta.jsonld)}</script>`,
  ].join('\n');

  return salida.replace('</head>', `${extra}\n</head>`);
}

/* El mapa del sitio, compuesto en el momento.
 *
 * Se genera y no se guarda como archivo porque cambia cada vez que
 * alguien publica o le vence un anuncio: un sitemap.xml estático
 * envejece en horas y acaba mandando al buscador a fichas que ya no
 * existen, que es peor que no tener sitemap.
 *
 * Solo entra lo que un visitante puede ver: anuncios activos y perfiles
 * de dealer publicados. Nada con sesión. */
function sitemap() {
  const paginas = [
    ['/', '1.0', 'daily'],
    ['/equipos.html', '0.9', 'daily'],
    ['/categorias.html', '0.7', 'weekly'],
    ['/dealers.html', '0.7', 'weekly'],
    ['/alquiler.html', '0.6', 'monthly'],
    ['/importar.html', '0.6', 'monthly'],
    ['/planes.html', '0.6', 'monthly'],
    ['/contacto.html', '0.4', 'monthly'],
    ['/estafas.html', '0.4', 'monthly'],
    ['/legal.html', '0.3', 'yearly'],
  ];

  const urls = paginas.map(([ruta, prioridad, frecuencia]) => ({
    loc: `${SITIO}${ruta}`, prioridad, frecuencia, fecha: null,
  }));

  try {
    const { anuncios } = db.buscarAnuncios
      ? { anuncios: db.anunciosPublicos({ porPagina: 5000 }) }
      : { anuncios: [] };
    (anuncios || []).forEach((a) => urls.push({
      loc: `${SITIO}/equipo.html?id=${encodeURIComponent(a.id)}`,
      prioridad: '0.8',
      frecuencia: 'weekly',
      fecha: a.actualizado || a.publicado || null,
    }));

    (db.dealersPublicos() || []).forEach((d) => urls.push({
      loc: `${SITIO}/dealer.html?d=${encodeURIComponent(d.slug)}`,
      prioridad: '0.6',
      frecuencia: 'weekly',
      fecha: null,
    }));
  } catch (e) {
    /* Si la base falla, sale el mapa con las páginas fijas en vez de un
       error: medio sitemap vale más que ninguno. */
    console.error(`meta: el sitemap sale sin fichas · ${e.message}`);
  }

  const cuerpo = urls.map((u) => [
    '  <url>',
    `    <loc>${esc(u.loc)}</loc>`,
    u.fecha ? `    <lastmod>${String(u.fecha).slice(0, 10)}</lastmod>` : null,
    `    <changefreq>${u.frecuencia}</changefreq>`,
    `    <priority>${u.prioridad}</priority>`,
    '  </url>',
  ].filter(Boolean).join('\n')).join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${cuerpo}
</urlset>
`;
}

module.exports = { para, aplicar, sitemap, SITIO, IMAGEN_MARCA, recortar };
