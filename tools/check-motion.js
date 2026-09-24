/**
 * check-motion.js — comprueba que las animaciones respetan
 * prefers-reduced-motion.
 *
 * Una captura no sirve para esto: una imagen fija no dice si algo se
 * está moviendo. Así que se consulta el estilo calculado y se observa
 * si el DOM cambia solo.
 *
 * Uso: node tools/check-motion.js [--base http://127.0.0.1:8080]
 */

const puppeteer = require('puppeteer');

/* Elementos que solo deben animar cuando NO hay preferencia de
   movimiento reducido, con la página donde viven. */
/* Vacío mientras el transporte esté suspendido: el mapa con GPS era
   lo único animado del sitio y su página ya no lo monta. Al volver el
   servicio, se vuelven a apuntar aquí sus selectores. */
const ANIMADOS = [];

function leerBase(argv) {
  const i = argv.indexOf('--base');
  return i >= 0 ? argv[i + 1] : 'http://127.0.0.1:8080';
}

/* Estilo calculado de un selector, con y sin movimiento reducido. */
async function estilo(navegador, url, sel, prop, reducido) {
  const p = await navegador.newPage();
  if (reducido) {
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });
  const valor = await p.$eval(sel, (el, k) => getComputedStyle(el)[k], prop).catch(() => null);
  await p.close();
  return valor;
}

/* ¿Se repinta el panel solo? Con movimiento reducido no debe hacerlo. */
async function refrescaSolo(navegador, url, reducido) {
  const p = await navegador.newPage();
  if (reducido) {
    await p.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  }
  await p.goto(url, { waitUntil: 'networkidle0', timeout: 45000 });

  const marcar = () => p.$eval('#seguimientoDatos', (el) => el.innerHTML.length);
  const antes = await marcar();
  const cambios = await p.evaluate(() => new Promise((listo) => {
    let n = 0;
    const obs = new MutationObserver(() => { n++; });
    obs.observe(document.getElementById('mapaEnvio'), { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); listo(n); }, 17000);   // > los 15 s del refresco
  }));
  await marcar().catch(() => antes);
  await p.close();
  return cambios;
}

async function main() {
  const base = leerBase(process.argv.slice(2)).replace(/\/$/, '');
  const navegador = await puppeteer.launch({ headless: true });
  const fallos = [];

  for (const a of ANIMADOS) {
    const url = `${base}/${a.pagina}`;
    const normal = await estilo(navegador, url, a.sel, a.prop, false);
    const quieto = await estilo(navegador, url, a.sel, a.prop, true);

    // 'none' para animaciones; para duraciones basta con que sea
    // imperceptible: la regla global de la hoja las deja en .01ms, que
    // getComputedStyle devuelve como '1e-05s'.
    const segundos = parseFloat(quieto);
    const apagado = quieto === 'none' || (Number.isFinite(segundos) && segundos < 0.02);
    console.log(`${a.sel} · ${a.prop}\n    normal: ${normal}\n    reducido: ${quieto}  ${apagado ? 'ok' : 'FALLA'}`);
    if (!apagado) fallos.push(`${a.sel} sigue animando con movimiento reducido (${quieto})`);
  }

  /* El mapa que se refrescaba solo vivía en transporte.html, que
     mientras el servicio esté suspendido solo anuncia la suspensión.
     Cuando vuelva, esta comprobación vuelve con él: `refrescaSolo`
     se queda para no tener que reescribirla. */
  if (ANIMADOS.length) {
    console.log('\nRefresco automático del mapa (17 s de observación):');
    const conMov = await refrescaSolo(navegador, `${base}/transporte.html`, false);
    const sinMov = await refrescaSolo(navegador, `${base}/transporte.html`, true);
    console.log(`    normal:   ${conMov} repintado(s)`);
    console.log(`    reducido: ${sinMov} repintado(s)  ${sinMov === 0 ? 'ok' : 'FALLA'}`);
    if (sinMov !== 0) fallos.push('el mapa se sigue refrescando solo con movimiento reducido');
  } else {
    console.log();
    console.log('Sin elementos animados que comprobar.');
  }

  await navegador.close();

  if (fallos.length) {
    console.log('\nProblemas:');
    fallos.forEach((f) => console.log('  · ' + f));
    process.exit(1);
  }
  console.log('\nMovimiento reducido respetado.');
}

main().catch((e) => { console.error('Falló:', e.message); process.exit(1); });
