/* Recorrido de auditoría · visitante y comprador.
   Registra errores de consola, peticiones fallidas y el estado real de
   cada página pública. No arregla nada: solo informa. */

const puppeteer = require('puppeteer');

const BASE = 'http://127.0.0.1:8080';

const PAGINAS = [
  ['/', 'Inicio'],
  ['/equipos.html', 'Catálogo'],
  ['/categorias.html', 'Categorías'],
  ['/alquiler.html', 'Alquiler'],
  ['/transporte.html', 'Transporte'],
  ['/importar.html', 'Importación'],
  ['/financiamiento.html', 'Financiamiento'],
  ['/dealers.html', 'Directorio'],
  ['/contacto.html', 'Contacto'],
  ['/legal.html', 'Legal'],
  ['/estafas.html', 'Señales de estafa'],
  ['/cuenta.html', 'Acceso'],
  ['/publicar.html', 'Publicar'],
  ['/panel.html', 'Panel (sin sesión)'],
  ['/admin.html', 'Admin (sin sesión)'],
];

const fallos = [];

/* Lo que esta auditoría provoca A PROPÓSITO y no es un fallo.
 *
 * Se visita /admin.html sin sesión para comprobar que está cerrado, y
 * un perfil de dealer inventado para comprobar que avisa. Que esas dos
 * devuelvan 401 y 404 es justo lo que se estaba comprobando, pero se
 * anotaban como hallazgos —con sus errores de consola de propina— y
 * salían cuatro avisos en cada ejecución. Un informe que nunca sale
 * limpio enseña a no leerlo, y entonces el día que aparece un aviso de
 * verdad tampoco se lee. */
const ESPERADOS = [
  ['Admin (sin sesión)', /\/api\/admin\//],
  ['Admin (sin sesión)', /401/],
  ['Perfil de dealer', /no-existe-este-dealer/],
  ['Perfil de dealer', /404/],
];

const esEsperado = (pagina, detalle) =>
  ESPERADOS.some(([p, patron]) => p === pagina && patron.test(String(detalle)));

const anota = (pagina, tipo, detalle) => {
  if (esEsperado(pagina, detalle)) return;
  fallos.push({ pagina, tipo, detalle });
};

async function vigilar(p, pagina) {
  p.removeAllListeners('console');
  p.removeAllListeners('pageerror');
  p.removeAllListeners('requestfailed');
  p.removeAllListeners('response');

  p.on('console', (m) => {
    if (m.type() === 'error') anota(pagina, 'consola', m.text().slice(0, 160));
  });
  p.on('pageerror', (e) => anota(pagina, 'excepción', String(e.message).slice(0, 160)));
  p.on('requestfailed', (r) => {
    const err = r.failure() && r.failure().errorText;
    if (err !== 'net::ERR_ABORTED') anota(pagina, 'petición', `${r.url().replace(BASE, '')} · ${err}`);
  });
  p.on('response', (r) => {
    if (r.status() >= 400) anota(pagina, `HTTP ${r.status()}`, r.url().replace(BASE, ''));
  });
}

(async () => {
  const nav = await puppeteer.launch({ headless: 'new' });
  const p = await nav.newPage();
  await p.setViewport({ width: 1440, height: 900 });

  console.log('── Páginas públicas ──');
  for (const [ruta, nombre] of PAGINAS) {
    await vigilar(p, nombre);
    await p.goto(BASE + ruta, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 500));

    const titulo = await p.title();
    const h1 = await p.$eval('h1', (el) => el.textContent.trim()).catch(() => '(sin h1)');
    const meta = await p.$eval('meta[name="description"]', (el) => el.content).catch(() => null);

    console.log(`  ${nombre.padEnd(22)} h1:"${h1.slice(0, 38)}"${meta ? '' : '  ⚠ SIN META DESCRIPTION'}`);
    if (!meta) anota(nombre, 'seo', 'falta meta description');
    if (h1 === '(sin h1)') anota(nombre, 'a11y', 'la página no tiene h1');
    if (!titulo || titulo.length > 65) anota(nombre, 'seo', `title de ${titulo.length} caracteres`);
  }

  // ── Comprador: búsqueda, filtros y orden ──
  console.log('\n── Comprador ──');
  await vigilar(p, 'Catálogo');
  await p.goto(`${BASE}/equipos.html`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));

  const total = await p.$$eval('.rejilla > li, .aviso', (n) => n.length);
  console.log(`  resultados iniciales: ${total}`);
  if (!total) anota('Catálogo', 'lógica', 'el catálogo no muestra ningún equipo');

  // Búsqueda por texto
  const busca = await p.$('#buscar, [type="search"], input[name="q"]');
  if (busca) {
    await busca.type('excavadora');
    await new Promise((r) => setTimeout(r, 900));
    const n = await p.$$eval('.rejilla > li', (x) => x.length);
    console.log(`  buscar "excavadora": ${n} resultados`);
    if (!n) anota('Catálogo', 'lógica', 'la búsqueda de "excavadora" no devuelve nada');
  } else {
    anota('Catálogo', 'ux', 'no se encontró el campo de búsqueda');
  }

  // Filtro que no debe devolver nada, para ver el estado vacío
  await p.goto(`${BASE}/equipos.html?q=zzzzinexistente`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const vacio = await p.$eval('body', (b) => b.innerText.includes('No encontramos') || b.innerText.includes('Sin resultados') || b.innerText.includes('no hay'));
  console.log(`  estado vacío con salida: ${vacio ? 'sí' : 'NO'}`);
  if (!vacio) anota('Catálogo', 'ux', 'la búsqueda sin resultados no ofrece salida');

  // Ficha de un equipo
  await p.goto(`${BASE}/equipos.html`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const primer = await p.$('.rejilla > li a[href*="equipo.html"]');
  if (primer) {
    const href = await p.evaluate((el) => el.getAttribute('href'), primer);
    await vigilar(p, 'Ficha de equipo');
    await p.goto(`${BASE}/${href.replace(/^\//, '')}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 700));
    const nombre = await p.$eval('h1', (el) => el.textContent.trim()).catch(() => '(sin h1)');
    console.log(`  ficha: ${nombre.slice(0, 50)}`);
    const tel = await p.$('a[href^="tel:"], [data-telefono], .contacto__tel');
    console.log(`  contacto visible: ${tel ? 'sí' : 'NO'}`);
    if (!tel) anota('Ficha de equipo', 'ux', 'no se ve forma de contactar al vendedor');
    // Fase 8 (CAT-02): la ficha dice si la máquina está en el país o es
    // bajo pedido, sin tener que preguntarlo por teléfono.
    const dispo = await p.$eval('.detalle__disponibilidad', (el) => el.textContent.trim()).catch(() => '');
    console.log(`  dice dónde está: ${dispo ? dispo.slice(0, 40) : 'NO'}`);
    if (!/República Dominicana|Bajo pedido/.test(dispo)) {
      anota('Ficha de equipo', 'lógica', 'la ficha no dice si el equipo está en el país o es bajo pedido');
    }
  } else {
    anota('Catálogo', 'lógica', 'ninguna tarjeta enlaza a la ficha del equipo');
  }

  // ── Fase 8: moneda, disponibilidad, permuta e ITBIS como filtros ──
  // La siembra de demostración trae un anuncio en US$ bajo pedido y
  // otros con permuta y con ITBIS incluido: sin ellos no habría qué
  // encontrar y estas comprobaciones darían falsos avisos.
  await vigilar(p, 'Catálogo');
  await p.goto(`${BASE}/equipos.html`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 500));
  for (const [sel, que] of [
    ['select[name="disponibilidad"]', 'el selector «Dónde está»'],
    ['input[type="checkbox"][name="permuta"]', 'la casilla «Acepta permuta»'],
    ['input[type="checkbox"][name="itbis"]', 'la casilla «Precio con ITBIS incluido»'],
  ]) {
    if (!(await p.$(sel))) anota('Catálogo', 'lógica', `falta ${que} en los filtros`);
  }
  const nota = await p.$eval('#notaTasa', (el) => (el.hidden ? '' : el.textContent)).catch(() => '');
  console.log(`  nota de la tasa: ${nota || 'NO'}`);
  if (!/US\$.*RD\$/.test(nota)) anota('Catálogo', 'ux', 'no se dice con qué tasa se comparan los precios en US$');

  const conFiltro = async (consulta) => {
    await p.goto(`${BASE}/equipos.html?${consulta}`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 600));
    return p.evaluate(() => ({
      tarjetas: [...document.querySelectorAll('.rejilla > li')].map((li) => li.innerText),
      chips: document.querySelector('#chipsFiltros') ? document.querySelector('#chipsFiltros').innerText : '',
      permuta: !!(document.querySelector('input[name="permuta"]') || {}).checked,
      itbis: !!(document.querySelector('input[name="itbis"]') || {}).checked,
      disponibilidad: (document.querySelector('select[name="disponibilidad"]') || {}).value,
    }));
  };

  let v = await conFiltro('permuta=1');
  console.log(`  ?permuta=1: ${v.tarjetas.length} resultados, casilla ${v.permuta ? 'marcada' : 'SIN MARCAR'}`);
  if (!v.permuta) anota('Catálogo', 'lógica', '?permuta=1 no deja marcada la casilla');
  if (!/Acepta permuta/.test(v.chips)) anota('Catálogo', 'lógica', '?permuta=1 no pinta su chip');
  if (!v.tarjetas.length) anota('Catálogo', 'lógica', 'el filtro de permuta no devuelve nada con la siembra de demostración');

  // Un valor que es nombre de Object no es un filtro: el servidor lo
  // ignora y el chip no debe enseñar la función heredada.
  v = await conFiltro('permuta=constructor&orden=toString');
  console.log(`  ?permuta=constructor: chips «${v.chips.replace(/\s+/g, ' ').trim()}»`);
  if (/function|native code/.test(v.chips) || v.permuta) {
    anota('Catálogo', 'lógica', '?permuta=constructor se da por filtro aplicado');
  }
  if (!v.tarjetas.length) anota('Catálogo', 'lógica', '?orden=toString deja el catálogo sin resultados');

  v = await conFiltro('itbis=1');
  console.log(`  ?itbis=1: ${v.tarjetas.length} resultados, casilla ${v.itbis ? 'marcada' : 'SIN MARCAR'}`);
  if (!v.itbis || !v.tarjetas.length) anota('Catálogo', 'lógica', 'el filtro de ITBIS incluido no funciona en pantalla');

  v = await conFiltro('disponibilidad=bajo-pedido');
  console.log(`  ?disponibilidad=bajo-pedido: ${v.tarjetas.length} resultados`);
  if (v.disponibilidad !== 'bajo-pedido') anota('Catálogo', 'lógica', 'el selector no refleja ?disponibilidad=bajo-pedido');
  if (!v.tarjetas.length || !v.tarjetas.every((t) => /Bajo pedido/.test(t))) {
    anota('Catálogo', 'lógica', 'el filtro bajo pedido no devuelve solo tarjetas marcadas «Bajo pedido»');
  }

  // CAT-01 en pantalla: el anuncio en dólares entra en un rango en pesos.
  v = await conFiltro('precioMin=6000000&orden=precio-desc');
  const enDolares = v.tarjetas.some((t) => /US\$/.test(t));
  console.log(`  «desde RD$6,000,000» incluye un anuncio en US$: ${enDolares ? 'sí' : 'NO'}`);
  if (!enDolares) anota('Catálogo', 'lógica', 'un anuncio en US$ no entra en el rango «desde RD$6,000,000»');

  // Perfil público de dealer
  await vigilar(p, 'Perfil de dealer');
  await p.goto(`${BASE}/dealer.html?d=maquinarias-del-caribe`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 700));
  const cuerpo = await p.$eval('body', (b) => b.innerText);
  console.log(`  perfil de dealer carga: ${cuerpo.includes('Maquinarias del Caribe') ? 'sí' : 'NO'}`);
  /* El pie de TODAS las páginas lleva el RNC de Inversiones XZT: es el
     aviso legal de quien opera el sitio y tiene que estar ahí. Lo que
     no puede verse es el RNC del DEALER, que es dato reservado de un
     tercero. Sin descontar el propio, esta comprobación daba un aviso
     de privacidad en cada ejecución, y un aviso que siempre salta
     enseña a no mirar ninguno. */
  const sinElPropio = cuerpo.replace(/RNC\s*1-31-27975-9/g, '');
  if (/RNC\s*[\d•]/.test(sinElPropio)) {
    anota('Perfil de dealer', 'PRIVACIDAD', 'se ve el RNC del dealer en la página pública');
  }

  // Dealer inexistente
  await p.goto(`${BASE}/dealer.html?d=no-existe-este-dealer`, { waitUntil: 'networkidle0' });
  await new Promise((r) => setTimeout(r, 600));
  const t404 = await p.$eval('body', (b) => b.innerText.toLowerCase());
  console.log(`  dealer inexistente avisa: ${t404.includes('no existe') || t404.includes('no encontr') ? 'sí' : 'NO'}`);

  // ── Responsive ──
  console.log('\n── Responsive ──');
  for (const [ancho, etiqueta] of [[390, 'móvil'], [768, 'tableta'], [1440, 'escritorio']]) {
    await p.setViewport({ width: ancho, height: 900 });
    await p.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 500));
    const desborde = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    console.log(`  ${etiqueta.padEnd(12)} ${ancho}px  desborde horizontal: ${desborde ? 'SÍ ⚠' : 'no'}`);
    if (desborde) anota('Inicio', 'responsive', `desborde horizontal a ${ancho}px`);

    await p.goto(`${BASE}/equipos.html`, { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 600));
    const d2 = await p.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    if (d2) anota('Catálogo', 'responsive', `desborde horizontal a ${ancho}px`);
  }

  await nav.close();

  console.log(`\n══ ${fallos.length} hallazgo(s) ══`);
  const porTipo = {};
  fallos.forEach((f) => { (porTipo[f.tipo] ||= []).push(f); });
  Object.entries(porTipo).forEach(([tipo, lista]) => {
    console.log(`\n[${tipo}] ${lista.length}`);
    lista.slice(0, 12).forEach((f) => console.log(`  ${f.pagina}: ${f.detalle}`));
    if (lista.length > 12) console.log(`  … y ${lista.length - 12} más`);
  });

  /* Salir con 1 cuando hay hallazgos.
     Hasta ahora esta auditoría imprimía lo que encontraba y salía 0
     SIEMPRE, igual que `auditar-flujos`. Mientras se leía a mano daba
     igual —el número está en pantalla—, pero al colgarla de la barrera
     de pruebas del CI convertía la comprobación en un adorno: un Pull
     Request con hallazgos se habría fusionado en verde, y justo en las
     dos auditorías más caras de ejecutar.
     Aviso: `npm run auditar` encadena con `&&`, así que el primero que
     falle corta la cadena y no se verán los siguientes. Es deliberado
     —fallar pronto— pero conviene saberlo al leer el registro. */
  process.exit(fallos.length ? 1 : 0);
})();
