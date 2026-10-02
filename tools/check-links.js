/**
 * check-links.js — abre cada página con Puppeteer y comprueba que
 * todo enlace interno apunta a algo que existe, que no hay errores de
 * consola y que los contenedores dinámicos quedaron con contenido.
 *
 * Uso: node tools/check-links.js [--base http://127.0.0.1:8080]
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const RAIZ = path.resolve(__dirname, '..');
const DOMINIO_PRODUCCION = 'mercamaquinarias.com';

const PAGINAS = [
  'index.html', 'equipos.html', 'equipo.html', 'categorias.html',
  'publicar.html', 'financiamiento.html', 'alquiler.html',
  'transporte.html', 'importar.html', 'dealers.html',
  'contacto.html', 'legal.html', 'estafas.html', 'cuenta.html', 'panel.html', 'dealer.html',
  'planes.html', 'guardados.html', 'alertas.html',
];

/* Contenedores que el render debe llenar, por página. */
const ESPERADO = {
  'index.html': ['#destacadosLista', '#mosaicoCategorias', '#marcasLista', '#rejillaRecientes', '#dealersLista'],
  'equipos.html': ['#resultados'],
  'categorias.html': ['#categoriasTodas'],
  // El asistente pinta los pasos y las tarjetas de plan al arrancar.
  'publicar.html': ['#pasosNav', '#vistaPrevia'],
  'planes.html': ['#nivelesLista', '#tablaPlanes'],
  'alquiler.html': ['#alquilerLista'],
  'dealers.html': ['#dealersLista'],
};

/* Empieza vacía: cada excepción futura debe explicar qué dato o sesión crea el ancla. */
const ANCLAS_PERMITIDAS = new Set([]);

function leerBase(argv) {
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : 'http://127.0.0.1:8080';
}

function rutaLocal(url) {
  let ruta;
  try {
    ruta = decodeURIComponent(new URL(url).pathname);
  } catch (_) {
    return null;
  }
  if (ruta === '/') ruta = '/index.html';
  const archivo = path.resolve(RAIZ, '.' + ruta);
  return archivo.startsWith(RAIZ + path.sep) ? archivo : null;
}

async function obtener(url) {
  try {
    const respuesta = await fetch(url);
    return { estado: respuesta.status, texto: await respuesta.text() };
  } catch (_) {
    return { estado: 'sin respuesta', texto: '' };
  }
}

async function main() {
  const base = leerBase(process.argv.slice(2)).replace(/\/$/, '');
  const origenBase = new URL(base).origin;
  const navegador = await puppeteer.launch({ headless: true });

  const problemas = [];
  const destinos = new Set();
  const anclas = [];
  const identificadores = new Map();
  let anclasComprobadas = 0;
  let recursosComprobados = 0;
  let paginasMapaComprobadas = 0;
  let hrefsComprobados = 0;

  for (const pagina of PAGINAS) {
    const p = await navegador.newPage();
    const errores = [];
    p.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()); });
    p.on('pageerror', (e) => errores.push(e.message));

    const resp = await p.goto(`${base}/${pagina}`, { waitUntil: 'networkidle0', timeout: 45000 });
    if (!resp || resp.status() !== 200) {
      problemas.push(`${pagina}: HTTP ${resp ? resp.status() : 'sin respuesta'}`);
      await p.close();
      continue;
    }

    errores.forEach((e) => problemas.push(`${pagina}: error de consola — ${e}`));

    // Contenedores dinámicos que quedaron vacíos.
    for (const sel of ESPERADO[pagina] || []) {
      const lleno = await p.$eval(sel, (el) => el.children.length > 0).catch(() => false);
      if (!lleno) problemas.push(`${pagina}: ${sel} quedó vacío`);
    }

    // Iconos que apuntan a un símbolo inexistente.
    const rotos = await p.$$eval('use', (us) =>
      us.map((u) => u.getAttribute('href'))
        .filter((h) => h && h.startsWith('#') && !document.getElementById(h.slice(1))));
    [...new Set(rotos)].forEach((h) => problemas.push(`${pagina}: icono sin símbolo ${h}`));

    const datos = await p.evaluate(() => ({
      url: location.href,
      identificadores: [...document.querySelectorAll('[id], [name]')]
        .flatMap((el) => [el.id, el.getAttribute('name')]).filter(Boolean),
      hrefs: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')),
      recursos: [...document.querySelectorAll(
        'link[rel~="icon"][href], link[rel="stylesheet"][href], script[src], meta[property="og:image"][content]',
      )].map((el) => ({
        valor: el.getAttribute('href') || el.getAttribute('src') || el.getAttribute('content'),
      })),
    }));
    identificadores.set(new URL(datos.url).href.split('#')[0], new Set(datos.identificadores));

    for (const h of datos.hrefs) {
      hrefsComprobados++;
      if (h && /^javascript:/i.test(h.trim())) {
        problemas.push(`${pagina}: enlace javascript: ${h}`);
        continue;
      }
      if (!h || h === '#' || h === '#top' || h.startsWith('/api/')
        || /^(https?:|mailto:|tel:)/i.test(h)) continue;
      destinos.add(h.split('#')[0].split('?')[0]);
    }

    for (const h of datos.hrefs) {
      if (!h || h === '#' || h === '#top' || /^javascript:/i.test(h.trim())) continue;
      let url;
      try { url = new URL(h, datos.url); } catch (_) { continue; }
      if (url.origin !== origenBase || !url.hash) continue;
      let fragmento;
      try { fragmento = decodeURIComponent(url.hash.slice(1)); } catch (_) { continue; }
      const clave = `${url.pathname}${url.search}#${fragmento}`;
      if (!fragmento || fragmento === 'top' || ANCLAS_PERMITIDAS.has(clave)) continue;
      anclas.push({ origen: pagina, destino: url.href.split('#')[0], fragmento });
    }

    for (const recurso of datos.recursos) {
      let url;
      try { url = new URL(recurso.valor, datos.url); } catch (_) { continue; }
      if (url.hostname === DOMINIO_PRODUCCION) url = new URL(url.pathname + url.search, base);
      if (url.origin !== origenBase) continue;
      recursosComprobados++;
      const archivo = rutaLocal(url.href);
      if (!archivo || !fs.existsSync(archivo)) {
        problemas.push(`${pagina}: recurso de cabecera no existe — ${url.pathname}`);
      }
      const respuesta = await obtener(url.href);
      if (respuesta.estado !== 200) {
        problemas.push(`${pagina}: recurso de cabecera ${url.pathname} — HTTP ${respuesta.estado}`);
      }
    }

    await p.close();
    console.log(`ok   ${pagina}`);
  }

  for (const ancla of anclas) {
    anclasComprobadas++;
    if (!identificadores.has(ancla.destino)) {
      const p = await navegador.newPage();
      const respuesta = await p.goto(ancla.destino, { waitUntil: 'networkidle0', timeout: 45000 }).catch(() => null);
      const ids = respuesta && respuesta.status() === 200
        ? await p.$$eval('[id], [name]', (els) => els
          .flatMap((el) => [el.id, el.getAttribute('name')]).filter(Boolean))
        : [];
      identificadores.set(ancla.destino, new Set(ids));
      await p.close();
    }
    if (!identificadores.get(ancla.destino).has(ancla.fragmento)) {
      problemas.push(`${ancla.origen}: ancla #${ancla.fragmento} no existe en ${new URL(ancla.destino).pathname}`);
    }
  }

  const mapa = await obtener(`${base}/sitemap.xml`);
  if (mapa.estado !== 200) {
    problemas.push(`mapa del sitio: HTTP ${mapa.estado}`);
  } else {
    const ubicaciones = [...mapa.texto.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/gi)]
      .map((coincidencia) => coincidencia[1].replace(/&amp;/g, '&'));
    for (const ubicacion of ubicaciones) {
      let url;
      try { url = new URL(ubicacion); } catch (_) {
        problemas.push(`mapa del sitio: dirección inválida — ${ubicacion}`);
        continue;
      }
      if (url.search) continue;
      paginasMapaComprobadas++;
      const local = new URL(url.pathname, base);
      const respuesta = await obtener(local.href);
      if (respuesta.estado !== 200) {
        problemas.push(`mapa del sitio: ${url.pathname} — HTTP ${respuesta.estado}`);
      }
    }
  }

  await navegador.close();

  // ¿Existe el archivo de cada destino interno?
  [...destinos].sort().forEach((d) => {
    if (!d) return;
    if (!fs.existsSync(path.join(RAIZ, d))) problemas.push(`enlace roto: ${d} no existe`);
  });

  console.log(`\n${destinos.size} destinos internos distintos`);
  console.log(`${anclasComprobadas} anclas internas comprobadas`);
  console.log(`${recursosComprobados} recursos de cabecera comprobados`);
  console.log(`${paginasMapaComprobadas} páginas del mapa del sitio comprobadas`);
  console.log(`${hrefsComprobados} href comprobados contra javascript:`);
  if (problemas.length) {
    console.log(`\n${problemas.length} problema(s):`);
    problemas.forEach((p) => console.log('  · ' + p));
    process.exit(1);
  }
  console.log('Sin problemas.');
}

main().catch((e) => { console.error('Falló la revisión:', e.message); process.exit(1); });
