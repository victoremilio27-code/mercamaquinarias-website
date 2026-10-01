/* Recorrido de auditoría · celular verificado y códigos por SMS.

   Por qué existe aparte de auditar-flujos.js: el CI (y producción, hasta
   que se paguen los créditos) corren el sitio con el SMS APAGADO, y las
   pantallas del SMS —«Confirme su celular», el selector de «Olvidé mi
   contraseña», la recuperación sin correo— solo existen con el
   interruptor encendido. Esas se prueban aquí, en un servidor propio con
   MERCA_SMS=archivo, que escribe cada SMS en .tmp/sms/ en vez de enviarlo.

   Puerto propio (8091) para no chocar con el sitio del 8080 que el CI
   tiene arrancado, y base propia (.tmp/auditar-telefono/sitio.db) para no
   ensuciar la del 8080 ni depender de ella. El servidor se apaga siempre,
   también cuando el recorrido falla. */

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { spawn, execFileSync } = require('child_process');

const PUERTO = 8091;
const BASE = `http://127.0.0.1:${PUERTO}`;
const BANCO = path.join('.tmp', 'auditar-telefono');
const DB = path.join(BANCO, 'sitio.db');
const SELLO = Date.now().toString().slice(-6);
const CLAVE = 'Retroexcavadora77RD';
const CLAVE_NUEVA = 'OtraClaveLarga2026RD';
const BUZON = '.tmp/correos';
const BANDEJA_SMS = '.tmp/sms';
const INICIO = Date.now();

const CELULAR_1 = `8295${SELLO}`;
const CELULAR_2 = `8495${SELLO}`;
const CORREO_A = `tela-${SELLO}@auditoria.do`;
const CORREO_B = `telb-${SELLO}@auditoria.do`;
const CORREO_NUEVO = `nuevo-${SELLO}@auditoria.do`;

const fallos = [];
const anota = (donde, tipo, detalle) => {
  fallos.push({ donde, tipo, detalle });
  console.log(`    ⚠ [${tipo}] ${detalle}`);
};
const ok = (t) => console.log(`    ✓ ${t}`);
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function escribir(p, sel, valor) {
  await p.click(sel, { clickCount: 3 });
  await p.type(sel, valor);
}

/* Último código del buzón de correo cuyo archivo contiene el fragmento.
   Solo .txt: el .html de cada correo no tiene el formato «Código: 123456». */
function codigoCorreo(fragmento) {
  const archivos = fs.existsSync(BUZON)
    ? fs.readdirSync(BUZON).filter((f) => f.endsWith('.txt') && f.includes(fragmento)).sort()
    : [];
  if (!archivos.length) return null;
  const texto = fs.readFileSync(`${BUZON}/${archivos[archivos.length - 1]}`, 'utf8');
  const m = /Código: (\d+)/.exec(texto);
  return m && m[1];
}

/* Último SMS enviado a ese número en ESTA pasada: la bandeja guarda los
   de las anteriores y un código viejo daría un fallo que no es del sitio. */
function archivoSms(numero) {
  if (!fs.existsSync(BANDEJA_SMS)) return null;
  const candidatos = fs.readdirSync(BANDEJA_SMS)
    .filter((f) => f.endsWith(`-${numero}.txt`))
    .map((f) => ({ f, t: fs.statSync(`${BANDEJA_SMS}/${f}`).mtimeMs }))
    .filter((x) => x.t >= INICIO - 1000)
    .sort((a, b) => a.t - b.t || (a.f < b.f ? -1 : 1));
  return candidatos.length ? candidatos[candidatos.length - 1].f : null;
}
function codigoSms(numero) {
  const f = archivoSms(numero);
  if (!f) return null;
  const m = /\b(\d{6})\b/.exec(fs.readFileSync(`${BANDEJA_SMS}/${f}`, 'utf8'));
  return m && m[1];
}
async function esperarSms(numero, anterior) {
  for (let i = 0; i < 20; i++) {
    const f = archivoSms(numero);
    if (f && f !== anterior) return codigoSms(numero);
    await esperar(300);
  }
  return null;
}

const visible = (p, sel) => p.$eval(sel, (el) => !el.hidden && el.offsetParent !== null).catch(() => false);
const textoDe = (p, sel) => p.$eval(sel, (el) => (el.hidden ? '' : el.textContent.trim())).catch(() => '');

async function salir(p) {
  await p.evaluate(() => {
    try { localStorage.removeItem('merca.telefono.ahoraNo'); } catch (_) { /* sin almacenamiento */ }
    return fetch('/api/cuenta/salir', { method: 'POST', credentials: 'same-origin' });
  }).catch(() => {});
  await esperar(300);
}

/* Registro de un particular hasta el código del correo. Devuelve true si
   acabó mostrando «Confirme su celular». */
async function registrar(p, correo, celular, nombre) {
  await p.goto(`${BASE}/cuenta.html?crear=1`, { waitUntil: 'networkidle0' });
  await esperar(400);
  await escribir(p, '#new-nombre', nombre);
  await escribir(p, '#new-telefono', celular);
  await escribir(p, '#new-correo', correo);
  await escribir(p, '#new-clave', CLAVE);
  await escribir(p, '#new-clave2', CLAVE);
  await p.click('#new-acepta');
  await p.click('#btnCrear');
  await esperar(1200);
  const aviso = await textoDe(p, '#avisoAcceso');
  if (aviso) { anota('registro', 'lógica', `${correo}: ${aviso}`); return false; }
  const codigo = codigoCorreo(correo.split('@')[0]);
  if (!codigo) { anota('registro', 'correo', `no llegó código a ${correo}`); return false; }
  await p.type('#cod-codigo', codigo);
  await esperar(1800);
  return visible(p, '#formTelefono');
}

/* Contraseña nueva con el código recibido en «Olvidé mi contraseña». */
async function cambiarClaveConCodigo(p, codigo, clave) {
  await p.waitForSelector('#formNuevaClave:not([hidden])', { timeout: 5000 });
  // La contraseña primero: al completar los 6 dígitos el código se envía
  // solo, y con la contraseña vacía el servidor no tendría qué cambiar.
  await escribir(p, '#nue-clave', clave);
  await escribir(p, '#nue-codigo', codigo);
  await p.waitForFunction(() => location.pathname.endsWith('panel.html'), { timeout: 8000 }).catch(() => {});
  await esperar(1500);
}

async function recorrido(nav) {
  const p = await nav.newPage();
  await p.setViewport({ width: 1440, height: 950 });
  p.on('pageerror', (e) => anota('página', 'excepción', String(e.message).slice(0, 140)));
  p.on('response', (r) => {
    if (r.status() >= 500) anota('página', `HTTP ${r.status()}`, r.url().replace(BASE, ''));
  });

  /* E. Ningún SMS sale al mostrar la vista (T-10.2-24): los POST a
     /telefono/verificar se anotan con su hora y se comparan con el momento
     en que se pulsa el botón. */
  const verificarPost = [];
  p.on('request', (rq) => {
    if (rq.method() === 'POST' && rq.url().includes('/api/cuenta/telefono/verificar')) verificarPost.push(Date.now());
  });

  /* ── A. Particular que confirma su celular al registrarse ── */
  console.log('\n  ── A. Registro y celular confirmado ──');
  const verA = verificarPost.length;
  const veTel = await registrar(p, CORREO_A, CELULAR_1, 'Ana Telefónica');
  if (veTel) ok('tras el código del correo se ofrece «Confirme su celular» (no redirige)');
  else anota('A', 'flujo', `tras el código del correo no aparece #formTelefono (url=${p.url()})`);
  if (verificarPost.length === verA) ok('al mostrar #formTelefono no sale ninguna petición de SMS');
  else anota('A', 'SEGURIDAD', 'se pidió un SMS al mostrar #formTelefono sin pulsar nada');

  if (veTel) {
    await p.click('#btnTelPrincipal');
    const codSms = await esperarSms(CELULAR_1, null);
    if (!codSms) {
      anota('A', 'sms', `no llegó SMS al ${CELULAR_1}: ${await textoDe(p, '#avisoAcceso')}`);
    } else {
      await p.waitForSelector('#telPasoCodigo:not([hidden])', { timeout: 5000 }).catch(() => {});
      // Seis dígitos se envían solos (codigoSolo): pulsar además el botón
      // chocaría con la navegación al panel.
      await escribir(p, '#tel-codigo', codSms);
      await p.waitForFunction(() => location.pathname.endsWith('panel.html'), { timeout: 8000 }).catch(() => {});
      await esperar(1200);
      if (p.url().includes('panel.html')) ok('el código del SMS lleva al panel');
      else anota('A', 'flujo', `confirmar el SMS no llegó al panel (url=${p.url()}, aviso=«${await textoDe(p, '#avisoAcceso')}»)`);
      const estado = await textoDe(p, '#segTelefonoEstado');
      if (/verificado/i.test(estado) && !/sin verificar/i.test(estado)) ok(`el panel dice: «${estado}»`);
      else anota('A', 'flujo', `#segTelefonoEstado no dice «verificado»: «${estado}»`);
    }
  }

  /* ── B. «Ahora no» ── */
  console.log('\n  ── B. «Ahora no» ──');
  await salir(p);
  const verB = verificarPost.length;
  const veTelB = await registrar(p, CORREO_B, CELULAR_2, 'Beto Telefónico');
  if (veTelB) ok('el segundo particular también ve «Confirme su celular»');
  else anota('B', 'flujo', 'el segundo particular no ve #formTelefono');
  if (verificarPost.length === verB) ok('sin pulsar nada no sale ningún SMS');
  else anota('B', 'SEGURIDAD', 'se pidió un SMS al mostrar #formTelefono sin pulsar nada');
  if (veTelB) {
    await p.click('#btnTelAhoraNo');
    await p.waitForFunction(() => location.pathname.endsWith('panel.html'), { timeout: 8000 }).catch(() => {});
    await esperar(1200);
    if (p.url().includes('panel.html')) ok('«Ahora no» entra al panel');
    else anota('B', 'flujo', `«Ahora no» no llegó al panel (url=${p.url()})`);
    if (await visible(p, '#avisoCelular')) ok(`el panel avisa del celular pendiente: «${(await textoDe(p, '#avisoCelular')).slice(0, 70)}»`);
    else anota('B', 'flujo', '#avisoCelular no se ve tras «Ahora no»');
    if (await visible(p, '#btnVerificarTelefono')) ok('#btnVerificarTelefono visible con el celular sin verificar');
    else anota('B', 'flujo', '#btnVerificarTelefono no se ve con el celular sin verificar');
    if (verificarPost.length === verB) ok('cargar el panel no pide ningún SMS');
    else anota('B', 'SEGURIDAD', 'cargar el panel pidió un SMS sin pulsar «Verificar celular»');
  }

  /* ── C. «Olvidé mi contraseña» por SMS ── */
  console.log('\n  ── C. Olvidé mi contraseña por SMS ──');
  await salir(p);
  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await esperar(500);
  await p.click('#irRecuperar');
  await esperar(500);
  if (await visible(p, '#recVia')) ok('#recVia visible con el SMS encendido');
  else anota('C', 'flujo', '#recVia no se ve con el SMS encendido');
  await escribir(p, '#rec-correo', CORREO_A);
  await p.click('input[name="recVia"][value="sms"]');
  await esperar(300);
  await escribir(p, '#rec-telefono', CELULAR_1);
  const smsAntesC = archivoSms(CELULAR_1);
  await p.click('#formRecuperar button[type="submit"]');
  const codC = await esperarSms(CELULAR_1, smsAntesC);
  if (!codC) {
    anota('C', 'sms', `no llegó SMS de recuperación al ${CELULAR_1}: ${await textoDe(p, '#avisoAcceso')}`);
  } else {
    ok('llegó un SMS con el código de recuperación');
    await cambiarClaveConCodigo(p, codC, CLAVE_NUEVA).catch((e) => anota('C', 'flujo', `#formNuevaClave: ${e.message}`));
    if (p.url().includes('panel.html')) ok('el código del SMS y la contraseña nueva entran al panel');
    else anota('C', 'flujo', `no se entró al panel tras restablecer por SMS (url=${p.url()}, aviso=«${await textoDe(p, '#avisoAcceso')}»)`);
    await esperar(800);
    if (await visible(p, '#avisoEnfriamiento')) ok('el panel avisa del enfriamiento de 72 h tras restablecer por SMS');
    else anota('C', 'flujo', '#avisoEnfriamiento no se ve tras restablecer la contraseña por SMS');
  }

  /* ── D. Recuperación sin correo por SMS ── */
  console.log('\n  ── D. Recuperación sin acceso al correo ──');
  // D1. La cuenta A está en enfriamiento por C: el paso 1 responde igual
  // pero no sale ningún SMS.
  await salir(p);
  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await esperar(500);
  await p.click('#irRecuperacion');
  await esperar(500);
  if (await visible(p, '#formRecuperacionSms')) ok('«¿Ya no tiene acceso a su correo?» abre #formRecuperacionSms con el SMS encendido');
  else anota('D', 'flujo', '#formRecuperacionSms no se ve con el SMS encendido');
  await escribir(p, '#rs-correo', CORREO_A);
  await escribir(p, '#rs-telefono', CELULAR_1);
  const smsAntesD1 = archivoSms(CELULAR_1);
  await p.click('#btnRs');
  await esperar(3000);
  if (archivoSms(CELULAR_1) === smsAntesD1) ok('la recuperación por SMS no envía nada durante las 72 h');
  else anota('D', 'lógica', 'la cuenta en enfriamiento recibió un SMS de recuperación');
  if (await visible(p, '#rsPaso2')) ok('el paso 1 responde igual (pasa al paso del código) aunque no envíe nada');
  else anota('D', 'flujo', 'el paso 1 no pasó al paso del código en una cuenta en enfriamiento');

  // D2. Los cuatro pasos de verdad con B, tras verificar su celular.
  await salir(p);
  await escribir(p, '#ent-correo', '').catch(() => {});
  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await esperar(500);
  await escribir(p, '#ent-correo', CORREO_B);
  await escribir(p, '#ent-clave', CLAVE);
  await p.click('#formEntrar button[type="submit"]');
  await esperar(1500);
  if (await visible(p, '#formCodigo')) {
    const c = codigoCorreo(CORREO_B.split('@')[0]);
    if (c) { await p.type('#cod-codigo', c); await esperar(1800); }
  }
  if (await visible(p, '#formTelefono')) {
    await p.click('#btnTelAhoraNo');
    await p.waitForFunction(() => location.pathname.endsWith('panel.html'), { timeout: 8000 }).catch(() => {});
  }
  await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
  await esperar(800);
  if (await visible(p, '#btnVerificarTelefono')) {
    const smsAntesV = archivoSms(CELULAR_2);
    const antesPost = verificarPost.length;
    await p.click('#btnVerificarTelefono');
    const codV = await esperarSms(CELULAR_2, smsAntesV);
    if (verificarPost.length === antesPost + 1) ok('«Verificar celular» pide exactamente un SMS');
    else anota('B', 'flujo', `«Verificar celular» hizo ${verificarPost.length - antesPost} peticiones de SMS`);
    if (!codV) {
      anota('D', 'sms', `no llegó SMS de verificación al ${CELULAR_2}`);
    } else {
      await p.waitForSelector('#formTelefonoCodigo:not([hidden])', { timeout: 5000 }).catch(() => {});
      // Se envía solo al completar los 6 dígitos.
      await escribir(p, '#seg-tel-codigo', codV);
      await esperar(1800);
      const est = await textoDe(p, '#segTelefonoEstado');
      if (/verificado/i.test(est) && !/sin verificar/i.test(est)) ok(`el panel verifica el celular de B: «${est}»`);
      else anota('D', 'flujo', `el panel no pasó a verificado tras confirmar el SMS: «${est}»`);
    }
  } else {
    anota('D', 'flujo', 'B no tiene #btnVerificarTelefono en el panel');
  }

  await salir(p);
  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await esperar(500);
  await p.click('#irRecuperacion');
  await esperar(500);
  await escribir(p, '#rs-correo', CORREO_B);
  await escribir(p, '#rs-telefono', CELULAR_2);
  const smsAntesRs = archivoSms(CELULAR_2);
  await p.click('#btnRs');
  const codRs = await esperarSms(CELULAR_2, smsAntesRs);
  if (!codRs) {
    anota('D', 'sms', `no llegó SMS de recuperación al ${CELULAR_2}: ${await textoDe(p, '#avisoAcceso')}`);
    return;
  }
  ok('paso 1: llegó el SMS de recuperación');
  await p.waitForSelector('#rsPaso2:not([hidden])', { timeout: 5000 }).catch(() => {});
  await escribir(p, '#rs-codigo', codRs);
  // El código del paso 2 se envía solo al completar los 6 dígitos.
  await p.waitForSelector('#rsPaso3:not([hidden])', { timeout: 6000 })
    .then(() => ok('paso 2: el código del SMS abre el paso del correo nuevo'))
    .catch(async () => {
      // Por si no se envía solo: se pulsa el botón y se anota.
      await p.click('#btnRs');
      await esperar(1500);
      anota('D', 'flujo', 'el código del paso 2 no se envió solo al escribir los 6 dígitos');
    });
  await escribir(p, '#rs-correo-nuevo', CORREO_NUEVO);
  await p.click('#btnRs');
  await p.waitForSelector('#rsPaso4:not([hidden])', { timeout: 6000 }).catch(() => {});
  const codCorreo = codigoCorreo(CORREO_NUEVO.split('@')[0]);
  if (!codCorreo) {
    anota('D', 'correo', `no llegó el código al correo nuevo ${CORREO_NUEVO}: ${await textoDe(p, '#avisoAcceso')}`);
    return;
  }
  ok('paso 3: llegó el código al correo nuevo');
  await escribir(p, '#rs-codigo-correo', codCorreo);
  await escribir(p, '#rs-clave', CLAVE_NUEVA);
  await escribir(p, '#rs-clave2', CLAVE_NUEVA);
  await p.click('#btnRs');
  await p.waitForFunction(() => location.pathname.endsWith('panel.html'), { timeout: 8000 }).catch(() => {});
  await esperar(1200);
  if (p.url().includes('panel.html')) ok('paso 4: entra al panel con el correo nuevo');
  else anota('D', 'flujo', `la recuperación por SMS no llegó al panel (url=${p.url()}, aviso=«${await textoDe(p, '#avisoAcceso')}»)`);
  const sub = await p.$eval('#panelSub', (el) => el.textContent).catch(() => '');
  const sesion = await p.evaluate(() => fetch('/api/sesion', { credentials: 'same-origin' }).then((r) => r.json())).catch(() => null);
  const correoSesion = sesion && sesion.usuario && sesion.usuario.correo;
  if (sub.includes(CORREO_NUEVO)) ok('#panelSub muestra el correo nuevo');
  else if (correoSesion === CORREO_NUEVO) {
    anota('D', 'ux', `la sesión es del correo nuevo pero #panelSub no lo nombra (dice «${sub.trim().slice(0, 60)}»)`);
  } else anota('D', 'flujo', `la sesión no es del correo nuevo (sesión=${correoSesion}, #panelSub=«${sub.trim().slice(0, 60)}»)`);
}

(async () => {
  fs.rmSync(BANCO, { recursive: true, force: true });
  fs.mkdirSync(BANCO, { recursive: true });

  const log = fs.openSync(path.join(BANCO, 'servidor.log'), 'a');
  const servidor = spawn(process.execPath, ['tools/serve.js', '--port', String(PUERTO)], {
    env: {
      ...process.env,
      MERCA_DB: DB,
      MERCA_SMS: 'archivo',
      MERCA_CORREO: 'archivo',
      MERCA_HTTPS: '0',
      MERCA_SECRETO: 'secreto-de-auditoria-telefono',
      PORT: String(PUERTO),
    },
    stdio: ['ignore', log, log],
  });
  const apagar = () => { try { servidor.kill(); } catch (_) { /* ya muerto */ } };
  process.on('exit', apagar);

  let navegador = null;
  try {
    console.log(`\n═══ Celular y SMS encendido (puerto ${PUERTO}) ═══`);
    execFileSync(process.execPath, ['tools/esperar-servidor.js', '--url', `${BASE}/`], { stdio: 'inherit' });
    navegador = await puppeteer.launch({ headless: 'new' });
    await recorrido(navegador);
  } catch (e) {
    anota('auditoría', 'excepción', String((e && e.stack) || e).slice(0, 1500));
  } finally {
    if (navegador) await navegador.close().catch(() => {});
    apagar();
  }

  console.log(`\n══════ ${fallos.length} hallazgo(s) en celular y SMS ══════`);
  fallos.forEach((f) => console.log(`  [${f.tipo}] ${f.donde}: ${f.detalle}`));
  process.exitCode = fallos.length ? 1 : 0;
})();
