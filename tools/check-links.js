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

const PAGINAS = [
  'index.html', 'equipos.html', 'equipo.html', 'categorias.html',
  'publicar.html', 'financiamiento.html', 'alquiler.html',
  'transporte.html', 'importar.html', 'dealers.html',
  'contacto.html', 'legal.html', 'estafas.html', 'cuenta.html', 'panel.html', 'dealer.html',
  'planes.html',
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

function leerBase(argv) {
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : 'http://127.0.0.1:8080';
}

async function main() {
  const base = leerBase(process.argv.slice(2)).replace(/\/$/, '');
  const navegador = await puppeteer.launch({ headless: true });

  const problemas = [];
  const destinos = new Set();

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

    // Enlaces internos.
    const hrefs = await p.$$eval('a[href]', (as) => as.map((a) => a.getAttribute('href')));
    hrefs.forEach((h) => {
      // Las rutas de /api no son páginas: unas devuelven JSON y otras
      // redirigen fuera del sitio, como el contador de clics de la
      // publicidad. Comprobarlas aquí solo genera falsos positivos.
      if (!h || h.startsWith('#') || h.startsWith('/api/')
        || /^(https?:|mailto:|tel:)/.test(h)) return;
      destinos.add(h.split('#')[0].split('?')[0]);
    });

    await p.close();
    console.log(`ok   ${pagina}`);
  }

  await navegador.close();

  // ¿Existe el archivo de cada destino interno?
  [...destinos].sort().forEach((d) => {
    if (!d) return;
    if (!fs.existsSync(path.join(RAIZ, d))) problemas.push(`enlace roto: ${d} no existe`);
  });

  console.log(`\n${destinos.size} destinos internos distintos`);
  if (problemas.length) {
    console.log(`\n${problemas.length} problema(s):`);
    problemas.forEach((p) => console.log('  · ' + p));
    process.exit(1);
  }
  console.log('Sin problemas.');
}

main().catch((e) => { console.error('Falló la revisión:', e.message); process.exit(1); });
