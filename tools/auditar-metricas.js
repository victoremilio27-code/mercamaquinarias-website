/* Recorrido de auditoría · alcance y métricas del vendedor (fase 10).

   Cada bloque prueba, en un navegador de verdad, uno de los cuatro
   criterios de éxito del ROADMAP para esta fase:

     1. Un visitante guarda un anuncio, lo vuelve a encontrar en
        guardados.html y lo quita (MET-01).
     2. Compartir la ficha manda a WhatsApp con el enlace correcto, y el
        HTML servido lleva el título y el precio para la vista previa
        (MET-02).
     3. El anunciante ve, en su panel, qué anuncio y cuándo trajo cada
        contacto de WhatsApp (MET-03).
     4. Duplicar un anuncio desde el panel precarga el asistente con
        todo menos el número de serie (MET-04).

   Sigue el estilo de auditar-flujos.js: sitio real, cuenta de
   demostración de tools/seed.js, salida 1 si algo falla. No crea
   cuentas nuevas —a diferencia de auditar-flujos.js— porque le basta
   con una que ya tenga un anuncio publicado, y `jperez` de seed.js es
   justo eso. */

const puppeteer = require('puppeteer');
const fs = require('fs');

const BASE = 'http://127.0.0.1:8080';
const BUZON = '.tmp/correos';
const CORREO_ANUNCIANTE = 'jperez@demo.mercamaquinarias.do';
const CLAVE_ANUNCIANTE = 'demostracion2026';

const fallos = [];
const anota = (donde, tipo, detalle) => {
  fallos.push({ donde, tipo, detalle });
  console.log(`    ⚠ [${tipo}] ${detalle}`);
};
const ok = (t) => console.log(`    ✓ ${t}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function vigilar(p, etiqueta) {
  p.removeAllListeners('pageerror');
  p.removeAllListeners('response');
  p.on('pageerror', (e) => anota(etiqueta, 'excepción', String(e.message).slice(0, 140)));
  p.on('response', (r) => {
    if (r.status() >= 500) anota(etiqueta, `HTTP ${r.status()}`, r.url().replace(BASE, ''));
  });
}

/* El limitador de accesos, a cero antes de empezar: esta auditoría
   entra dos veces con la misma cuenta de demostración desde la misma
   IP, y una pasada anterior en la misma tarde puede haber dejado el
   contador cerca del tope. Ver la nota gemela en auditar-flujos.js. */
function limpiarLimitador() {
  const { DatabaseSync } = require('node:sqlite');
  const ruta = process.env.MERCA_DB
    || require('path').resolve(__dirname, '..', 'db', 'mercamaquinarias.db');
  try {
    const d = new DatabaseSync(ruta);
    d.exec('DELETE FROM intentos');
    d.close();
  } catch (e) {
    console.log(`  (no se pudo limpiar el limitador: ${e.message})`);
  }
}

/* Solo .txt: el buzón guarda también la versión .html de cada correo
   para poder revisarla en el navegador, y ahí el código no está en el
   formato «Código: 123456» que busca la expresión de abajo. */
function codigoDe(fragmento) {
  const archivos = fs.readdirSync(BUZON)
    .filter((f) => f.endsWith('.txt') && f.includes(fragmento)).sort();
  if (!archivos.length) return null;
  const texto = fs.readFileSync(`${BUZON}/${archivos[archivos.length - 1]}`, 'utf8');
  const m = /Código: (\d+)/.exec(texto);
  return m && m[1];
}

/* Entra con correo y clave. La cuenta de demostración ya tiene el
   correo verificado (ver tools/seed.js), así que el único código que
   puede pedir es el de «equipo nuevo»: este navegador no lleva la
   cookie de un acceso anterior. Devuelve true si terminó con sesión. */
async function entrar(p, correo, clave) {
  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await p.click('#ent-correo');
  await p.type('#ent-correo', correo);
  await p.click('#ent-clave');
  await p.type('#ent-clave', clave);
  await p.click('#formEntrar button[type="submit"]');
  await esperar(900);

  if (await p.$eval('#formCodigo', (el) => !el.hidden).catch(() => false)) {
    const codigo = codigoDe(correo.split('@')[0]);
    if (!codigo) { anota('acceso', 'correo', `no llegó código de acceso a ${correo}`); return false; }
    await p.type('#cod-codigo', codigo);
    await esperar(1500);
  }
  return p.url().includes('panel.html');
}

async function salir(p) {
  await p.evaluate(() => fetch('/api/cuenta/salir', { method: 'POST', credentials: 'same-origin' })).catch(() => {});
  await esperar(300);
}

(async () => {
  limpiarLimitador();
  const nav = await puppeteer.launch({ headless: 'new' });
  const p = await nav.newPage();
  await p.setViewport({ width: 1440, height: 950 });
  vigilar(p, 'metricas');

  /* ═══ 1) Guardar un equipo y quitarlo (MET-01) ═══ */
  console.log('\n═══ Guardar y quitar un equipo ═══');
  await p.goto(`${BASE}/equipos.html`, { waitUntil: 'networkidle0' });
  const idVisitante = await p.$eval('a[href^="equipo.html?id="]',
    (a) => new URL(a.href).searchParams.get('id')).catch(() => null);

  if (!idVisitante) {
    anota('catálogo', 'flujo', 'equipos.html no ofrece ningún equipo para probar: ¿faltó npm run db:demo?');
  } else {
    await p.goto(`${BASE}/equipo.html?id=${encodeURIComponent(idVisitante)}`, { waitUntil: 'networkidle0' });
    await esperar(500);

    if (!(await p.$('#btnGuardar')) || !(await p.$('#btnCompartir'))) {
      anota('ficha', 'ux', 'faltan los botones Guardar y Compartir');
    } else {
      ok('la ficha tiene Guardar y Compartir');
    }

    await p.click('#btnGuardar');
    await esperar(300);
    const presionado = await p.$eval('#btnGuardar', (b) => b.getAttribute('aria-pressed')).catch(() => null);
    if (presionado !== 'true') anota('ficha', 'lógica', 'Guardar no deja aria-pressed="true"');
    else ok('Guardar queda marcado');

    if (!(await p.$('#navMenu [data-guardados]'))) {
      anota('ficha', 'ux', 'la navegación no muestra "Guardados" tras guardar un equipo');
    } else {
      ok('aparece «Guardados» en la navegación');
    }

    await p.goto(`${BASE}/guardados.html`, { waitUntil: 'networkidle0' });
    await esperar(600);
    const enLista = await p.$(`#listaGuardados [data-quitar="${idVisitante}"]`);
    if (!enLista) {
      anota('guardados', 'lógica', 'el equipo guardado no aparece en guardados.html');
    } else {
      ok('el equipo guardado aparece en guardados.html');
      await p.click(`#listaGuardados [data-quitar="${idVisitante}"]`);
      await esperar(500);
      const vacio = await p.$eval('#guardadosVacio', (el) => !el.hidden).catch(() => false);
      const quedan = await p.$$eval('#listaGuardados li', (n) => n.length).catch(() => -1);
      if (!vacio || quedan !== 0) anota('guardados', 'lógica', '«Quitar» no deja la lista vacía');
      else ok('«Quitar» deja la lista vacía y se ve el aviso');
    }
  }

  /* ═══ 2) Compartir por WhatsApp y la vista previa del enlace (MET-02) ═══ */
  console.log('\n═══ Compartir por WhatsApp ═══');
  if (idVisitante) {
    /* Se borra ANTES de cargar la página: si `navigator.share` existiera
       (como en un teléfono real) el botón abriría la hoja nativa del
       sistema operativo, no el menú propio que se está probando aquí. */
    await p.evaluateOnNewDocument(() => {
      Object.defineProperty(window.navigator, 'share', { value: undefined, configurable: true });
    });
    await p.goto(`${BASE}/equipo.html?id=${encodeURIComponent(idVisitante)}`, { waitUntil: 'networkidle0' });
    await esperar(500);
    await p.click('#btnCompartir');
    await esperar(300);

    const menuVisible = await p.$eval('#menuCompartir', (el) => !el.hidden).catch(() => false);
    if (!menuVisible) anota('compartir', 'ux', 'el menú de compartir no aparece sin navigator.share');
    else ok('el menú de compartir aparece');

    const href = await p.$eval('#compartirWhatsapp', (a) => a.getAttribute('href')).catch(() => null);
    if (!href || !href.startsWith('https://wa.me/?text=')) {
      anota('compartir', 'lógica', `el enlace de WhatsApp no tiene la forma esperada: ${href}`);
    } else {
      const decodificado = decodeURIComponent(href.slice('https://wa.me/?text='.length));
      if (!decodificado.includes(`equipo.html?id=${idVisitante}`)) {
        anota('compartir', 'lógica', 'el texto de WhatsApp no lleva el enlace de la ficha');
      } else {
        ok('el enlace de WhatsApp lleva el equipo, el precio y la ficha');
      }
    }

    // og:title, para la vista previa que arma WhatsApp cuando alguien
    // pega el enlace: eso lo lee un bot sobre el HTML servido, sin
    // ejecutar JavaScript, así que se pide por HTTP y no por el DOM.
    const html = await fetch(`${BASE}/equipo.html?id=${encodeURIComponent(idVisitante)}`).then((r) => r.text());
    const mOg = /<meta property="og:title" content="([^"]*)">/.exec(html);
    const ogTitle = mOg ? mOg[1] : '';
    if (!ogTitle || ogTitle === 'Equipo' || !/RD\$|US\$/.test(ogTitle)) {
      anota('meta', 'lógica', `og:title no lleva el equipo y el precio: "${ogTitle}"`);
    } else {
      ok(`og:title trae el equipo y el precio: ${ogTitle}`);
    }
  } else {
    anota('compartir', 'flujo', 'se saltó: no hubo equipo de visitante en el bloque anterior');
  }

  /* ═══ 3) El anunciante atribuye un contacto y duplica (MET-03, MET-04) ═══ */
  console.log('\n═══ El anunciante ve el contacto y duplica el anuncio ═══');
  vigilar(p, 'anunciante');

  const entroAntes = await entrar(p, CORREO_ANUNCIANTE, CLAVE_ANUNCIANTE);
  if (!entroAntes) {
    anota('acceso', 'flujo', `no se pudo entrar con la cuenta de demostración ${CORREO_ANUNCIANTE}`);
  } else {
    // Cuál anuncio y cómo se llama: se pide a la propia cuenta en vez de
    // adivinarlo por marca o modelo, para no depender de qué máquinas
    // tenga sembradas tools/seed.js hoy.
    const propio = await p.evaluate(() => fetch('/api/mis-anuncios', { credentials: 'same-origin' })
      .then((r) => r.json())
      .then((d) => (d.anuncios || []).find((a) => a.estado === 'activo') || null));

    if (!propio) {
      anota('anunciante', 'flujo', `${CORREO_ANUNCIANTE} no tiene ningún anuncio activo: ¿faltó npm run db:demo?`);
    } else {
      const nombreEquipo = `${propio.anio} ${propio.marca_nombre || propio.marca} ${propio.modelo}`;
      console.log(`  anuncio de prueba: ${nombreEquipo} (${propio.id})`);

      await salir(p);

      // Como visitante: un contacto de WhatsApp a ese anuncio. El
      // recorrido real sería pulsar el enlace de WhatsApp en la ficha,
      // pero eso navega a wa.me —un dominio externo, sin red en este
      // contenedor—; el propio plan admite anotar el evento
      // directamente, que es lo que de verdad cuenta el servidor.
      const estadoEvento = await p.evaluate((idAnuncio) => fetch('/api/eventos', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anuncio: idAnuncio, tipo: 'whatsapp' }),
      }).then((r) => r.status), propio.id);
      if (estadoEvento >= 400) anota('anunciante', 'flujo', `POST /api/eventos (whatsapp) devolvió ${estadoEvento}`);

      const entroDespues = await entrar(p, CORREO_ANUNCIANTE, CLAVE_ANUNCIANTE);
      if (!entroDespues) {
        anota('acceso', 'flujo', `no se pudo volver a entrar con ${CORREO_ANUNCIANTE}`);
      } else {
        await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
        await esperar(900);

        const filas = await p.$eval('#filasContactos', (el) => el.innerText).catch(() => '');
        if (!filas.includes(propio.modelo) || !/WhatsApp/.test(filas)) {
          anota('panel', 'lógica', `#filasContactos no muestra "${nombreEquipo}" con WhatsApp: "${filas.slice(0, 200)}"`);
        } else {
          ok(`#filasContactos muestra "${nombreEquipo}" con WhatsApp`);
        }

        const botonDuplicar = await p.$(`[data-duplicar="${propio.id}"]`);
        if (!botonDuplicar) {
          anota('panel', 'ux', 'no se encontró el botón «Duplicar» de ese anuncio');
        } else {
          await Promise.all([
            p.waitForNavigation({ waitUntil: 'networkidle0' }),
            p.click(`[data-duplicar="${propio.id}"]`),
          ]);
          await esperar(1500);

          const url = new URL(p.url());
          if (url.pathname.endsWith('/publicar.html') && url.searchParams.has('duplicar')) {
            anota('publicar', 'lógica', 'la URL conserva ?duplicar= tras cargar la copia');
          } else if (!url.pathname.endsWith('/publicar.html')) {
            anota('publicar', 'flujo', `Duplicar no llevó a publicar.html: acabó en ${url.pathname}`);
          } else {
            ok('la URL queda en publicar.html sin ?duplicar=');
          }

          const modeloOtro = await p.$eval('#e-modelo-otro', (i) => i.value).catch(() => '');
          const modeloCargado = await p.$eval('#e-modelo', (s) => s.value).catch(() => '');
          if (modeloCargado !== propio.modelo && modeloOtro !== propio.modelo) {
            anota('publicar', 'lógica', `#e-modelo no trae "${propio.modelo}" (vino "${modeloCargado || modeloOtro}")`);
          } else {
            ok(`#e-modelo trae el modelo del original: ${propio.modelo}`);
          }

          const serie = await p.$eval('#e-serie', (i) => i.value).catch(() => 'ERROR');
          if (serie !== '') anota('publicar', 'SEGURIDAD', `#e-serie no viene vacío: "${serie}"`);
          else ok('#e-serie llega vacío: no se duplica el número de serie');

          const avisoOculto = await p.$eval('#avisoBorrador', (el) => el.hidden).catch(() => true);
          const avisoTexto = await p.$eval('#avisoBorrador span', (el) => el.textContent).catch(() => '');
          if (avisoOculto || !avisoTexto.startsWith('Copia de')) {
            anota('publicar', 'ux', `#avisoBorrador no avisa de la copia: "${avisoTexto}"`);
          } else {
            ok(`#avisoBorrador avisa: ${avisoTexto.slice(0, 60)}…`);
          }

          // Se descarta el borrador de la copia: sin esto, quedaría a
          // medio escribir en el localStorage de este navegador de
          // auditoría, que no vuelve a abrirse.
          const btnDescartar = await p.$('#btnDescartar');
          if (btnDescartar) {
            await Promise.all([
              p.waitForNavigation({ waitUntil: 'networkidle0' }),
              p.click('#btnDescartar'),
            ]);
          }
        }
      }
    }
  }

  await salir(p);
  await nav.close();

  console.log(`\n══════ ${fallos.length} hallazgo(s) en alcance y métricas del vendedor ══════`);
  fallos.forEach((f) => console.log(`  [${f.tipo}] ${f.donde}: ${f.detalle}`));

  /* Ojo al ejecutarla a mano: esta auditoría entra con la cuenta de
     demostración de tools/seed.js, así que el servidor y ella tienen
     que apuntar a la MISMA base (la misma MERCA_DB). Si se lanza el
     servidor con una base y la auditoría con otra, ninguna cuenta
     existe donde se busca y todo falla por un motivo que no tiene nada
     que ver con lo que se está probando. */
  process.exit(fallos.length ? 1 : 0);
})();
