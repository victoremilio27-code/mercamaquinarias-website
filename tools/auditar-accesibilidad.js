/**
 * Auditoría de accesibilidad sobre el DOM que ve una persona visitante.
 *
 * Uso: node tools/auditar-accesibilidad.js [--base http://127.0.0.1:8080]
 */

const puppeteer = require('puppeteer');

const PAGINAS = [
  'index.html', 'equipos.html', 'equipo.html', 'categorias.html',
  'publicar.html', 'financiamiento.html', 'alquiler.html',
  'transporte.html', 'importar.html', 'dealers.html',
  'contacto.html', 'legal.html', 'estafas.html', 'cuenta.html', 'panel.html', 'dealer.html',
  'planes.html', 'guardados.html', 'alertas.html', '404.html',
];

const VISTAS = [
  { ancho: 390, alto: 844 },
  { ancho: 1280, alto: 800 },
];

/* Añadir aquí solo excepciones revisadas, como «pagina|ancho|regla|selector».
   Cada entrada debe explicar en un comentario por qué el caso es accesible. */
const PERMITIDOS = [];

function leerBase(argumentos) {
  const indice = argumentos.indexOf('--base');
  if (indice < 0) return 'http://127.0.0.1:8080';
  if (!argumentos[indice + 1]) throw new Error('Falta el valor de --base');
  return argumentos[indice + 1].replace(/\/$/, '');
}

function estaPermitido(hallazgo) {
  return PERMITIDOS.includes(
    `${hallazgo.pagina}|${hallazgo.ancho}|${hallazgo.regla}|${hallazgo.selector}`,
  );
}

async function revisarDom(pagina) {
  return pagina.evaluate(() => {
    const fallos = [];
    const avisos = [];

    const esVisible = (elemento) => {
      if (!(elemento instanceof Element) || elemento.closest('[aria-hidden="true"]')) return false;
      if (elemento.closest('[hidden]')) return false;
      const estilo = getComputedStyle(elemento);
      if (estilo.display === 'none' || estilo.visibility === 'hidden' || estilo.visibility === 'collapse') return false;
      return elemento.getClientRects().length > 0;
    };

    const selectorCorto = (elemento) => {
      if (elemento.id) return `#${CSS.escape(elemento.id)}`;
      const partes = [];
      let actual = elemento;
      while (actual && actual !== document.documentElement && partes.length < 3) {
        let parte = actual.localName;
        if (!parte) break;
        const padre = actual.parentElement;
        if (padre) {
          const iguales = [...padre.children].filter((hijo) => hijo.localName === actual.localName);
          if (iguales.length > 1) parte += `:nth-of-type(${iguales.indexOf(actual) + 1})`;
        }
        partes.unshift(parte);
        actual = padre;
      }
      return partes.join(' > ');
    };

    const falla = (regla, elemento) => fallos.push({ regla, selector: selectorCorto(elemento) });
    const texto = (elemento) => (elemento.textContent || '').trim();
    const referenciasValidas = (elemento) => {
      const ids = (elemento.getAttribute('aria-labelledby') || '').trim().split(/\s+/).filter(Boolean);
      const referencias = ids.map((id) => document.getElementById(id));
      return referencias.length > 0 && referencias.every(Boolean) && referencias.some((referencia) => texto(referencia));
    };
    const tieneNombre = (elemento) => texto(elemento)
      || (elemento.getAttribute('aria-label') || '').trim()
      || (elemento.getAttribute('title') || '').trim()
      || [...elemento.querySelectorAll('img[alt]')].some((imagen) => imagen.alt.trim());

    if (!document.documentElement.lang.toLowerCase().startsWith('es')) falla('html-lang', document.documentElement);
    if (!document.title.trim()) falla('titulo', document.head.querySelector('title') || document.documentElement);

    const h1 = [...document.querySelectorAll('h1')].filter(esVisible);
    if (h1.length !== 1) falla('un-h1-visible', h1[0] || document.body);

    [...document.querySelectorAll('img')].filter(esVisible).forEach((imagen) => {
      if (!imagen.hasAttribute('alt')) {
        falla('imagen-alt', imagen);
        return;
      }
      if (imagen.alt.trim()) return;
      /* Un <label> con texto también nombra su control: el render decorativo
         de cada equipo de alquiler (alt="" a propósito, assets/app.js) vive
         dentro del label de su casilla y salía como falso positivo. */
      const control = imagen.closest('a[href], button, label');
      const controlConTexto = control && texto(control).trim();
      if (imagen.getAttribute('role') !== 'presentation' && !controlConTexto) falla('imagen-alt-vacio', imagen);
    });

    const controles = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]), select, textarea';
    [...document.querySelectorAll(controles)].filter(esVisible).forEach((control) => {
      const etiquetaFor = control.id && [...document.querySelectorAll('label[for]')]
        .some((etiqueta) => etiqueta.htmlFor === control.id && texto(etiqueta));
      const etiquetaEnvolvente = control.closest('label') && texto(control.closest('label'));
      const ariaLabel = (control.getAttribute('aria-label') || '').trim();
      if (!etiquetaFor && !etiquetaEnvolvente && !ariaLabel && !referenciasValidas(control)) {
        falla('control-nombre', control);
      }
    });

    [...document.querySelectorAll('button, a[href]')].filter(esVisible).forEach((control) => {
      if (!tieneNombre(control)) falla('enlace-boton-nombre', control);
    });

    const ids = new Map();
    [...document.querySelectorAll('[id]')].filter(esVisible).forEach((elemento) => {
      if (ids.has(elemento.id)) {
        falla('id-duplicado', elemento);
      } else {
        ids.set(elemento.id, elemento);
      }
    });

    [...document.querySelectorAll('[tabindex]')].filter(esVisible).forEach((elemento) => {
      if (Number(elemento.getAttribute('tabindex')) > 0) falla('tabindex-positivo', elemento);
    });

    [...document.querySelectorAll('a[href^="#"]')].filter(esVisible).forEach((enlace) => {
      if (!/saltar\s+al\s+contenido/i.test(texto(enlace))) return;
      const destino = enlace.getAttribute('href').slice(1);
      if (!destino || !document.getElementById(destino)) falla('salto-sin-destino', enlace);
    });

    const encabezados = [...document.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter(esVisible);
    encabezados.forEach((encabezado, indice) => {
      if (!indice) return;
      const anterior = Number(encabezados[indice - 1].localName.slice(1));
      const actual = Number(encabezado.localName.slice(1));
      if (actual > anterior + 1) {
        avisos.push({ regla: 'orden-encabezados', selector: selectorCorto(encabezado) });
      }
    });

    return { fallos, avisos };
  });
}

async function main() {
  const base = leerBase(process.argv.slice(2));
  const navegador = await puppeteer.launch({ headless: true });
  const fallos = [];
  const avisos = [];

  try {
    for (const vista of VISTAS) {
      for (const nombre of PAGINAS) {
        const pagina = await navegador.newPage();
        await pagina.setViewport({ width: vista.ancho, height: vista.alto });
        try {
          await pagina.goto(`${base}/${nombre}`, {
            waitUntil: 'networkidle0',
            timeout: 45000,
          });
          // app.js pinta varias páginas después de cargar sus datos.
          await new Promise((resolver) => setTimeout(resolver, 700));
          const resultado = await revisarDom(pagina);
          resultado.fallos.forEach((hallazgo) => fallos.push({ pagina: nombre, ancho: vista.ancho, ...hallazgo }));
          resultado.avisos.forEach((hallazgo) => avisos.push({ pagina: nombre, ancho: vista.ancho, ...hallazgo }));
        } catch (error) {
          fallos.push({ pagina: nombre, ancho: vista.ancho, regla: 'carga', selector: error.name });
        } finally {
          await pagina.close();
        }
      }
    }
  } finally {
    await navegador.close();
  }

  const efectivos = fallos.filter((hallazgo) => !estaPermitido(hallazgo));
  efectivos.forEach((hallazgo) => {
    console.log(`${hallazgo.pagina} · ${hallazgo.ancho} · ${hallazgo.regla} · ${hallazgo.selector}`);
  });
  avisos.forEach((aviso) => {
    console.log(`${aviso.pagina} · ${aviso.ancho} · aviso:${aviso.regla} · ${aviso.selector}`);
  });

  console.log('\nResumen por regla:');
  const reglas = {};
  efectivos.forEach((hallazgo) => { reglas[hallazgo.regla] = (reglas[hallazgo.regla] || 0) + 1; });
  avisos.forEach((aviso) => { reglas[`aviso:${aviso.regla}`] = (reglas[`aviso:${aviso.regla}`] || 0) + 1; });
  if (!Object.keys(reglas).length) console.log('  sin hallazgos');
  Object.entries(reglas).sort().forEach(([regla, cantidad]) => console.log(`  ${regla}: ${cantidad}`));
  process.exit(efectivos.length ? 1 : 0);
}

main().catch((error) => {
  console.error(`Falló la auditoría de accesibilidad: ${error.message}`);
  process.exit(1);
});
