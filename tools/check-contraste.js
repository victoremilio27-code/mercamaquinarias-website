/* check-contraste.js — recorre cada página del sitio en los dos temas y
   mide, con números, lo que no se lee.

   Por qué existe: el tema funciona redefiniendo tokens, así que todo lo
   que se sale de ese mecanismo —un color literal, un token que solo se
   redefinió en un bloque— se queda congelado mientras el fondo de
   debajo se da la vuelta. Eso no se ve leyendo el diff: se ve cuando
   alguien abre la página en oscuro tres semanas después. El encargo de
   Victor es que todos los elementos sean dinámicos entre sí al cambiar
   de modo, y esta orden es la única forma de comprobarlo sin abrir
   diecisiete pestañas a mano dos veces.

   Mide el estilo CALCULADO, no la hoja: lo que se mide es lo que se ve,
   con la cascada ya resuelta y el fondo real de detrás compuesto capa a
   capa.

   Uso:
     node tools/check-contraste.js [--base http://127.0.0.1:8080]
                                   [--tema claro|oscuro] [--verboso]

   Sale 1 si encuentra incumplimientos o si no puede recorrer el sitio, y
   0 si todo pasa. Va colgado del final de `npm run auditar`, que encadena
   con `&&`: si una auditoría anterior falla, ésta no llega a correr. No
   se puede confundir «el contraste pasó» con «el contraste no corrió».
*/

const puppeteer = require('puppeteer');

const BASE_POR_DEFECTO = 'http://127.0.0.1:8080';

/* El recorrido: las catorce rutas públicas de `tools/auditar-publico.js`
   más tres que el plan aprobado nombra como pruebas de su propio
   arreglo. La ficha de equipo es la decimoséptima y no está aquí: se
   descubre abriendo el catálogo, porque su URL depende de lo que haya
   sembrado `npm run db:demo`. */
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
  ['/cuenta.html', 'Acceso'],
  ['/publicar.html', 'Publicar'],
  ['/panel.html', 'Panel (sin sesión)'],
  ['/admin.html', 'Admin (sin sesión)'],
  // Aquí vive `.perfil`, el caso peor del diagnóstico. El dealer existe
  // porque lo siembra `npm run db:demo`.
  ['/dealer.html?d=maquinarias-del-caribe', 'Perfil de dealer'],
  // `.plan__cinta`: ámbar usado como FONDO, que no debe convertirse en
  // ámbar de texto al arreglar la hoja.
  ['/planes.html', 'Planes'],
];

/* Los dos temas, con el valor que `assets/tema.js` guarda en
   `localStorage` bajo la clave `mm-tema`. */
const TEMAS = [
  ['claro', 'light'],
  ['oscuro', 'dark'],
];

/* Lo que WCAG 1.4.11 llama «componente de interfaz»: lo que se pulsa o
   se escribe, y por tanto tiene que tener un contorno visible. */
const SEL_CONTROL = 'button, .btn, input, select, textarea, [role="button"]';

/* ── Aritmética WCAG, escrita a mano ──────────────────────────────────
   Quince líneas de cuentas no justifican una dependencia: el proyecto
   tiene cero en tiempo de ejecución y solo puppeteer en desarrollo, y
   esto se comprueba contra la propia norma, no contra un paquete. */

/* Canal a canal, dividido entre 255, con el tramo lineal de abajo. */
function lineal(v) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminancia(c) {
  return 0.2126 * lineal(c[0]) + 0.7152 * lineal(c[1]) + 0.0722 * lineal(c[2]);
}

/* Razón de contraste entre dos colores ya opacos. */
function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  const arriba = Math.max(la, lb);
  const abajo = Math.min(la, lb);
  return (arriba + 0.05) / (abajo + 0.05);
}

const dos = (n) => n.toFixed(2);
const rgb = (c) => 'rgb(' + c[0] + ', ' + c[1] + ', ' + c[2] + ')';

/* ── Argumentos, al estilo de check-motion.js ── */
function leerValor(argv, nombre, porDefecto) {
  const i = argv.indexOf(nombre);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : porDefecto;
}

/* ── Lo que se ejecuta DENTRO de la página ────────────────────────────
   Se devuelve una medida por elemento visible. Todo el cálculo de
   colores compuestos se hace aquí, donde está el DOM; las razones de
   contraste se calculan fuera, en Node, para poder leerlas y probarlas
   sin navegador. */
function medirEnPagina(selControl) {
  const BLANCO = [255, 255, 255, 1];

  /* `getComputedStyle` devuelve 'rgb(r, g, b)' o 'rgba(r, g, b, a)', y
     'transparent' sale como 'rgba(0, 0, 0, 0)'. */
  function canales(css) {
    const n = String(css || '').match(/[0-9.]+/g);
    if (!n || n.length < 3) return null;
    return [Number(n[0]), Number(n[1]), Number(n[2]), n.length > 3 ? Number(n[3]) : 1];
  }

  /* Composición alfa. Un rgba(...) tomado como opaco da un número que no
     es el que se ve: esto es lo que evita medir un velo del 10 % como si
     fuera el color de debajo. */
  function sobre(encima, debajo) {
    const a = encima[3];
    return [
      Math.round(encima[0] * a + debajo[0] * (1 - a)),
      Math.round(encima[1] * a + debajo[1] * (1 - a)),
      Math.round(encima[2] * a + debajo[2] * (1 - a)),
      1,
    ];
  }

  /* El fondo que de verdad hay detrás: subir por los padres hasta dar
     con uno opaco, componiendo por el camino los que tengan alfa. Misma
     idea y mismo criterio que `ajustarContraste` en `assets/app.js`. */
  function fondoEfectivo(desde) {
    const capas = [];
    let nodo = desde;
    while (nodo) {
      const c = canales(getComputedStyle(nodo).backgroundColor);
      if (c && c[3] > 0) {
        capas.push(c);
        if (c[3] >= 1) break;
      }
      nodo = nodo.parentElement;
    }
    let base = BLANCO;
    for (let i = capas.length - 1; i >= 0; i--) base = sobre(capas[i], base);
    return base;
  }

  /* Un menú móvil plegado no es un incumplimiento. */
  function visible(el, est) {
    if (est.display === 'none' || est.visibility === 'hidden') return false;
    if (parseFloat(est.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /* Texto PROPIO: solo los nodos de texto directos. Un div que envuelve
     un p no tiene texto, tiene un hijo que lo tiene; sin esta distinción
     el mismo párrafo se reportaba siete veces subiendo por el árbol. */
  function textoPropio(el) {
    let t = '';
    for (let i = 0; i < el.childNodes.length; i++) {
      const n = el.childNodes[i];
      if (n.nodeType === 3) t += n.textContent;
    }
    return t.trim();
  }

  function clases(el) {
    const c = typeof el.className === 'string' ? el.className : '';
    return c.trim().split(/\s+/).filter(Boolean);
  }

  /* Un hallazgo que obligue a abrir las herramientas de desarrollo para
     saber de qué habla no se va a arreglar. */
  function legible(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cl = clases(el).slice(0, 3);
    if (cl.length) s += '.' + cl.join('.');
    return s;
  }

  /* El borde más marcado de los cuatro lados. Basta con que uno delimite
     para que la caja se lea como caja. */
  function bordeVisible(el, est) {
    const lados = ['Top', 'Right', 'Bottom', 'Left'];
    let mejor = null;
    for (const lado of lados) {
      const estilo = est['border' + lado + 'Style'];
      const ancho = parseFloat(est['border' + lado + 'Width']) || 0;
      if (!estilo || estilo === 'none' || estilo === 'hidden' || ancho <= 0) continue;
      const c = canales(est['border' + lado + 'Color']);
      if (!c || c[3] <= 0) continue;
      if (!mejor || ancho > mejor.ancho) mejor = { ancho, color: c, lado };
    }
    return mejor;
  }

  const medidas = [];
  const todos = document.body ? document.body.querySelectorAll('*') : [];

  for (const el of todos) {
    const etiqueta = el.tagName.toLowerCase();
    // Ni se pintan, ni tienen color propio que valga la pena medir.
    if (/^(script|style|link|meta|title|br|noscript|template|option|source|track)$/.test(etiqueta)) continue;
    // El interior de un icono SVG no es un elemento del tema: el icono
    // entero sí, y ése se mide por su `color`.
    if (el.closest('svg') && el !== el.closest('svg')) continue;

    const est = getComputedStyle(el);
    if (!visible(el, est)) continue;

    const fondoPropio = fondoEfectivo(el);
    const padre = el.parentElement;
    const fondoDetras = padre ? fondoEfectivo(padre) : BLANCO;

    const colorCrudo = canales(est.color) || [0, 0, 0, 1];
    const borde = bordeVisible(el, est);
    const relleno = canales(est.backgroundColor);

    medidas.push({
      sel: legible(el),
      texto: textoPropio(el).replace(/\s+/g, ' ').slice(0, 48),
      tam: parseFloat(est.fontSize) || 16,
      peso: parseInt(est.fontWeight, 10) || 400,
      esControl: el.matches(selControl),
      // Un color de texto con alfa se ve compuesto sobre su propio fondo.
      color: sobre(colorCrudo, fondoPropio),
      fondo: fondoPropio,
      fondoDetras,
      borde: borde ? sobre(borde.color, fondoDetras) : null,
      relleno: relleno && relleno[3] > 0 ? sobre(relleno, fondoDetras) : null,
    });
  }

  return medidas;
}

/* ── Recorrido ── */

/* Siembra la elección de tema ANTES de que corra ningún script de la
   página. No vale `emulateMediaFeatures('prefers-color-scheme')`: una
   elección guardada manda sobre el sistema en `assets/tema.js`, y es
   precisamente el camino que usa la gente. Sembrarla con
   `evaluateOnNewDocument` la deja puesta antes del primer pintado, así
   que no hay destello ni carrera. */
async function abrirConTema(nav, valorTema) {
  const p = await nav.newPage();
  await p.setViewport({ width: 1440, height: 900 });
  await p.evaluateOnNewDocument((t) => {
    try { localStorage.setItem('mm-tema', t); } catch (e) { /* almacenamiento bloqueado: se mide el claro */ }
  }, valorTema);
  return p;
}

/* La ficha de equipo no se escribe a mano: se llega como ya hace
   `auditar-publico.js`, abriendo el catálogo y siguiendo el primer
   enlace. Si el catálogo viene vacío —la base sin sembrar— NO es un
   hallazgo: quien corriera la herramienta sin `npm run db:demo` vería un
   rojo que no es suyo. */
async function descubrirFicha(nav, base) {
  const p = await abrirConTema(nav, 'light');
  try {
    await p.goto(base + '/equipos.html', { waitUntil: 'networkidle0', timeout: 45000 });
    await new Promise((r) => setTimeout(r, 700));
    const href = await p.$eval('a[href*="equipo.html"]', (el) => el.getAttribute('href'));
    return href ? '/' + String(href).replace(/^\//, '') : null;
  } catch (e) {
    return null;
  } finally {
    await p.close().catch(() => {});
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const base = leerValor(argv, '--base', BASE_POR_DEFECTO).replace(/\/$/, '');
  const soloTema = leerValor(argv, '--tema', null);
  const verboso = argv.includes('--verboso');

  const temas = soloTema ? TEMAS.filter(([nombre]) => nombre === soloTema) : TEMAS;
  if (!temas.length) {
    console.error('Tema desconocido: ' + soloTema + '. Use claro u oscuro.');
    process.exit(1);
  }

  const nav = await puppeteer.launch({ headless: 'new' });
  const fallos = [];
  const anota = (tipo, ruta, tema, sel, detalle) => fallos.push({ tipo, ruta, tema, sel, detalle });

  const rutas = PAGINAS.slice();
  const ficha = await descubrirFicha(nav, base);
  if (ficha) {
    rutas.push([ficha, 'Ficha de equipo']);
  } else {
    console.log('  (catálogo vacío o inalcanzable: la ficha de equipo se salta, no es un hallazgo)');
  }

  console.log('── Contraste y dinamismo · ' + rutas.length + ' rutas × ' + temas.length + ' tema(s) ──');

  for (const [ruta, nombre] of rutas) {
    for (const [tema, valor] of temas) {
      const p = await abrirConTema(nav, valor);
      let medidas = null;
      try {
        const resp = await p.goto(base + ruta, { waitUntil: 'networkidle0', timeout: 45000 });
        if (resp && resp.status() >= 400) throw new Error('HTTP ' + resp.status());
        await new Promise((r) => setTimeout(r, 600));
        medidas = await p.evaluate(medirEnPagina, SEL_CONTROL);
      } catch (e) {
        // Un fallo de navegación no se traga: es un hallazgo de su
        // propio tipo. Si no, un sitio caído sale en verde.
        anota('navegacion', nombre, tema, ruta, 'la ruta no cargó: ' + String(e.message).slice(0, 120));
      } finally {
        await p.close().catch(() => {});
      }
      if (!medidas) continue;

      let delTema = 0;

      for (const m of medidas) {
        /* Regla 1 · texto contra su fondo efectivo.
           4.5:1, o 3:1 en fuente grande, que el plan aprobado fija en
           ≥ 18.66 px o ≥ 14 px en negrita. */
        if (m.texto) {
          const grande = m.tam >= 18.66 || (m.tam >= 14 && m.peso >= 700);
          const minimo = grande ? 3 : 4.5;
          const r = contraste(m.color, m.fondo);
          if (r < minimo) {
            anota('texto', nombre, tema, m.sel,
              'color ' + rgb(m.color) + ' sobre ' + rgb(m.fondo) + ' · ' + dos(r) + ':1 (mínimo ' + minimo + ') · "' + m.texto + '"');
            delTema++;
          }
        }

        /* Regla 2 · el contorno de un control, a 3:1 del fondo de detrás.
           Un control sin borde y sin relleno propio se identifica por su
           texto, que ya mide la regla 1; marcarlo aquí sería contar dos
           veces el mismo elemento. */
        if (m.esControl) {
          const capa = m.borde || m.relleno;
          const prop = m.borde ? 'border-color' : 'background-color';
          if (capa) {
            const r = contraste(capa, m.fondoDetras);
            if (r < 3) {
              anota('control', nombre, tema, m.sel,
                prop + ' ' + rgb(capa) + ' sobre ' + rgb(m.fondoDetras) + ' · ' + dos(r) + ':1 (mínimo 3)');
              delTema++;
            }
          }
        }
      }

      if (verboso) {
        console.log('  ' + nombre.padEnd(22) + tema.padEnd(8) + medidas.length + ' elementos visibles · ' + delTema + ' hallazgo(s)');
      } else if (delTema) {
        console.log('  ' + nombre.padEnd(22) + tema.padEnd(8) + delTema + ' hallazgo(s)');
      }
    }
  }

  await nav.close();

  console.log('\n══ ' + fallos.length + ' hallazgo(s) ══');
  const porTipo = {};
  fallos.forEach((f) => { (porTipo[f.tipo] ||= []).push(f); });
  Object.entries(porTipo).forEach(([tipo, lista]) => {
    console.log('\n[' + tipo + '] ' + lista.length);
    lista.slice(0, 12).forEach((f) => console.log('  ' + f.ruta + ' · ' + f.tema + ' · ' + f.sel + ' — ' + f.detalle));
    if (lista.length > 12) console.log('  … y ' + (lista.length - 12) + ' más');
  });

  const porTema = {};
  fallos.forEach((f) => { porTema[f.tema] = (porTema[f.tema] || 0) + 1; });
  if (fallos.length) {
    console.log('\nPor tema: ' + Object.entries(porTema).map(([t, n]) => t + ' ' + n).join(' · '));
  } else {
    console.log('\nLos dos temas se comportan igual de bien.');
  }

  process.exit(fallos.length ? 1 : 0);
}

main().catch((e) => { console.error('Falló:', e.message); process.exit(1); });
