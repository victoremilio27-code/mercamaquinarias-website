/* Recorrido de auditoría · celular verificado y códigos por SMS.

   Por qué existe aparte de auditar-flujos.js: el CI (y producción, hasta
   que se paguen los créditos) corren el sitio con el SMS APAGADO, y las
   pantallas del SMS según D-16 —«Confirme su celular», verificar el
   celular desde el panel, elegir el SMS al entrar desde un equipo nuevo y
   el «No fui yo» de un cambio de contraseña— solo existen con el
   interruptor encendido (la recuperación por SMS y las 72 h se quitaron,
   y aquí se comprueba que no queda rastro). Se prueban aquí, en un servidor propio con
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
// Tercera cuenta y tercer número: CELULAR_1 ya recibe 2 SMS (A y D) y el
// tope por número es de 3 por hora.
const CELULAR_3 = `8095${SELLO}`;
const CORREO_C = `telc-${SELLO}@auditoria.do`;

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

/* Texto del último correo .txt del buzón para ese fragmento (sin exigir «Código:»). */
function ultimoCorreo(fragmento) {
  const archivos = fs.existsSync(BUZON)
    ? fs.readdirSync(BUZON).filter((f) => f.endsWith('.txt') && f.includes(fragmento)).sort()
    : [];
  return archivos.length ? fs.readFileSync(`${BUZON}/${archivos[archivos.length - 1]}`, 'utf8') : null;
}
/* ¿Hay algún correo .txt a ese fragmento cuyo texto case con todas las expresiones? */
function textoAvisoCorreo(fragmento, ...expresiones) {
  const archivos = fs.existsSync(BUZON)
    ? fs.readdirSync(BUZON).filter((f) => f.endsWith('.txt') && f.includes(fragmento))
    : [];
  return archivos.some((f) => {
    const t = fs.readFileSync(`${BUZON}/${f}`, 'utf8');
    return expresiones.every((e) => e.test(t));
  });
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

  /* ── C. Verificar el celular desde el panel ── */
  console.log('\n  ── C. Verificar el celular desde el panel ──');
  await salir(p);
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
    else anota('C', 'flujo', `«Verificar celular» hizo ${verificarPost.length - antesPost} peticiones de SMS`);
    if (!codV) {
      anota('C', 'sms', `no llegó SMS de verificación al ${CELULAR_2}`);
    } else {
      await p.waitForSelector('#formTelefonoCodigo:not([hidden])', { timeout: 5000 }).catch(() => {});
      // Se envía solo al completar los 6 dígitos.
      await escribir(p, '#seg-tel-codigo', codV);
      await esperar(1800);
      const est = await textoDe(p, '#segTelefonoEstado');
      if (/verificado/i.test(est) && !/sin verificar/i.test(est)) ok(`el panel verifica el celular de B: «${est}»`);
      else anota('C', 'flujo', `el panel no pasó a verificado tras confirmar el SMS: «${est}»`);
    }
  } else {
    anota('C', 'flujo', 'B no tiene #btnVerificarTelefono en el panel');
  }

  /* ── D. Entrar desde un equipo nuevo eligiendo el SMS ── */
  console.log('\n  ── D. Entrar desde un equipo nuevo con el SMS ──');
  const ctxD = await nav.createBrowserContext();
  try {
    const q = await ctxD.newPage();
    await q.setViewport({ width: 1440, height: 950 });
    q.on('pageerror', (e) => anota('página D', 'excepción', String(e.message).slice(0, 140)));
    q.on('response', (r) => {
      if (r.status() >= 500) anota('página D', `HTTP ${r.status()}`, r.url().replace(BASE, ''));
    });
    await q.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
    await esperar(500);
    const smsAntesD = archivoSms(CELULAR_1);
    await escribir(q, '#ent-correo', CORREO_A);
    await escribir(q, '#ent-clave', CLAVE);
    await q.click('#formEntrar button[type="submit"]');
    await esperar(1500);
    if (await visible(q, '#formAccesoVia')) {
      ok('con el SMS encendido y el celular verificado, un equipo nuevo ve #formAccesoVia');
      const detalleSms = await textoDe(q, '#accesoViaSms');
      if (detalleSms.includes('•••-') && detalleSms.includes(CELULAR_1.slice(-4))) ok(`#accesoViaSms enseña el celular enmascarado: «${detalleSms}»`);
      else anota('D', 'flujo', `#accesoViaSms no trae «•••-» y los 4 últimos dígitos: «${detalleSms}»`);
      if (archivoSms(CELULAR_1) === smsAntesD) ok('antes de pulsar «Enviar código» no sale ningún SMS');
      else anota('D', 'SEGURIDAD', 'salió un SMS al mostrar #formAccesoVia sin pulsar nada');
      // El radio puede estar tapado por su etiqueta: se marca por su valor.
      await q.evaluate(() => {
        const r = document.querySelector('input[name="accesoVia"][value="sms"]');
        r.click();
      });
      await q.click('#formAccesoVia button[type="submit"]');
      const codD = await esperarSms(CELULAR_1, smsAntesD);
      if (!codD) {
        anota('D', 'sms', `no llegó SMS de acceso al ${CELULAR_1}: ${await textoDe(q, '#avisoAcceso')}`);
      } else {
        ok('al elegir el SMS llega el código al celular');
        await q.waitForSelector('#formCodigo:not([hidden])', { timeout: 5000 }).catch(() => {});
        const intro = await textoDe(q, '#codigoIntro');
        if (/SMS/.test(intro)) ok(`#codigoIntro habla del SMS: «${intro.slice(0, 80)}»`);
        else anota('D', 'flujo', `#codigoIntro no menciona el SMS: «${intro}»`);
        await q.type('#cod-codigo', codD);
        await q.waitForFunction(() => location.pathname.endsWith('panel.html'), { timeout: 8000 }).catch(() => {});
        await esperar(1000);
        if (q.url().includes('panel.html')) ok('el código del SMS entra al panel desde el equipo nuevo');
        else anota('D', 'flujo', `el código del SMS no llegó al panel (url=${q.url()}, aviso=«${await textoDe(q, '#avisoAcceso')}»)`);
      }
      const aviso = textoAvisoCorreo(CORREO_A.split('@')[0], /SMS/, /equipo nuevo/i);
      if (aviso) ok('a CORREO_A le llegó el aviso de acceso desde un equipo nuevo por SMS');
      else anota('D', 'correo', 'no llegó a CORREO_A un correo que mencione «SMS» y «equipo nuevo»');
    } else {
      anota('D', 'flujo', `un equipo nuevo con celular verificado no ve #formAccesoVia (url=${q.url()})`);
    }
  } finally {
    await ctxD.close().catch(() => {});
  }

  /* ── E. «No fui yo» de un cambio de contraseña ── */
  console.log('\n  ── E. «No fui yo» de un cambio de contraseña ──');
  await salir(p);
  const veTelC = await registrar(p, CORREO_C, CELULAR_3, 'Carla Telefónica');
  if (!veTelC) {
    anota('E', 'flujo', 'la tercera cuenta no ve #formTelefono');
  } else {
    await p.click('#btnTelPrincipal');
    const codC1 = await esperarSms(CELULAR_3, null);
    if (!codC1) {
      anota('E', 'sms', `no llegó SMS de confirmación al ${CELULAR_3}`);
    } else {
      await p.waitForSelector('#telPasoCodigo:not([hidden])', { timeout: 5000 }).catch(() => {});
      await escribir(p, '#tel-codigo', codC1);
      await p.waitForFunction(() => location.pathname.endsWith('panel.html'), { timeout: 8000 }).catch(() => {});
      await esperar(1000);
    }
  }
  if (!p.url().includes('panel.html')) {
    anota('E', 'flujo', `C no llegó al panel con el celular confirmado (url=${p.url()})`);
    return;
  }
  // Cambio de contraseña por SMS con fetch same-origin (2.º SMS al número).
  const antesSmsC = archivoSms(CELULAR_3);
  const pedido = await p.evaluate(() => fetch('/api/cuenta/clave/codigo', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ via: 'sms' }),
  }).then((r) => r.status)).catch(() => 0);
  const codC2 = await esperarSms(CELULAR_3, antesSmsC);
  // La API contesta 202 (aceptado: el código sale por SMS), no 200.
  if (pedido !== 202 || !codC2) {
    anota('E', 'sms', `el código por SMS para cambiar la contraseña no llegó (estado ${pedido})`);
    return;
  }
  const cambio = await p.evaluate((codigo, nueva) => fetch('/api/cuenta/clave', {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ via: 'sms', codigo, nueva }),
  }).then((r) => r.status), codC2, CLAVE_NUEVA).catch(() => 0);
  if (cambio === 200) ok('cambiar la contraseña con el código por SMS responde 200');
  else { anota('E', 'flujo', `cambiar la contraseña por SMS respondió ${cambio}`); return; }
  await esperar(800);

  const testigo = (/revertir-clave=([0-9a-f]{64})/.exec(ultimoCorreo(CORREO_C.split('@')[0]) || '') || [])[1];
  if (!testigo) {
    anota('E', 'correo', 'el aviso de contraseña cambiada no trae revertir-clave=<64 hex>');
    return;
  }
  ok('el aviso de contraseña cambiada trae el enlace «No fui yo»');

  const leerVerificado = () => {
    const bd = new (require('node:sqlite').DatabaseSync)(DB, { readOnly: true });
    try {
      const f = bd.prepare('SELECT telefono_verificado AS v FROM usuarios WHERE correo = ?').get(CORREO_C);
      return f ? f.v : undefined;
    } finally { bd.close(); }
  };
  const antesRev = leerVerificado();
  if (antesRev) ok('antes de abrir el enlace, el celular de C está verificado en la base');
  else anota('E', 'lógica', `C no tenía el celular verificado antes del enlace (valor=${antesRev})`);

  const ctxE = await nav.createBrowserContext();
  try {
    const q = await ctxE.newPage();
    await q.setViewport({ width: 1440, height: 950 });
    q.on('pageerror', (e) => anota('página E', 'excepción', String(e.message).slice(0, 140)));
    q.on('response', (r) => {
      if (r.status() >= 500) anota('página E', `HTTP ${r.status()}`, r.url().replace(BASE, ''));
    });
    await q.goto(`${BASE}/cuenta.html?revertir-clave=${testigo}`, { waitUntil: 'networkidle0' });
    await esperar(1500);
    if (await visible(q, '#formRevertir')) ok('el enlace muestra #formRevertir');
    else anota('E', 'flujo', '#formRevertir no se ve con ?revertir-clave=');
    const tit = await textoDe(q, '#revertirTitulo');
    if (/contraseña/i.test(tit)) ok(`#revertirTitulo habla de la contraseña: «${tit.slice(0, 70)}»`);
    else anota('E', 'flujo', `#revertirTitulo no menciona la contraseña: «${tit}»`);
    // T-10.2-60: abrir el enlace (un GET) no puede cambiar nada.
    if (leerVerificado() === antesRev) ok('abrir el enlace no cambia nada en la base hasta pulsar el botón');
    else anota('E', 'SEGURIDAD', 'la base cambió solo por abrir ?revertir-clave= (un GET no puede hacer nada)');

    await q.click('#btnRevertir');
    await q.waitForSelector('#formNuevaClave:not([hidden])', { timeout: 6000 }).catch(() => {});
    await esperar(500);
    if (await visible(q, '#formNuevaClave')) ok('pulsar «Recuperar mi cuenta» abre #formNuevaClave');
    else anota('E', 'flujo', '#formNuevaClave no se ve tras pulsar #btnRevertir');
    const nIntro = await textoDe(q, '#nuevaIntro');
    if (/celular/i.test(nIntro)) ok(`#nuevaIntro menciona el celular: «${nIntro.slice(0, 80)}»`);
    else anota('E', 'flujo', `#nuevaIntro no menciona el celular: «${nIntro}»`);
    if (leerVerificado() === null) ok('tras pulsar, el celular de C queda sin verificar en la base');
    else anota('E', 'lógica', `tras pulsar, telefono_verificado sigue valiendo ${leerVerificado()}`);
    if (!q.url().includes('revertir-clave')) ok('la URL ya no lleva el testigo');
    else anota('E', 'SEGURIDAD', `la URL conserva el testigo: ${q.url()}`);

    await esperar(800);
    const codR = codigoCorreo(CORREO_C.split('@')[0]);
    if (!codR) {
      anota('E', 'correo', 'no llegó el código de «restablecer» al correo de C');
    } else {
      await cambiarClaveConCodigo(q, codR, `${CLAVE_NUEVA}9`).catch((e) => anota('E', 'flujo', `#formNuevaClave: ${e.message}`));
      await esperar(500);
      // El celular de C ya no está verificado y el SMS está encendido:
      // seguir() enseña «Confirme su celular» en vez de ir al panel.
      if (await visible(q, '#formTelefono')) {
        ok('tras la contraseña nueva se ofrece «Confirme su celular» (ya no está verificado)');
        await q.click('#btnTelAhoraNo');
        await q.waitForFunction(() => location.pathname.endsWith('panel.html'), { timeout: 8000 }).catch(() => {});
        await esperar(1200);
        const est = await textoDe(q, '#segTelefonoEstado');
        if (q.url().includes('panel.html') && !(/verificado/i.test(est) && !/sin verificar/i.test(est))) ok(`el panel no da el celular por verificado: «${est}»`);
        else anota('E', 'flujo', `tras «Ahora no» el panel no quedó con el celular sin verificar (url=${q.url()}, estado=«${est}»)`);
      } else {
        anota('E', 'flujo', `tras la contraseña nueva no aparece #formTelefono (url=${q.url()})`);
      }
    }
  } finally {
    await ctxE.close().catch(() => {});
  }

  /* ── F. Sin SMS para recuperar ── */
  console.log('\n  ── F. Sin SMS para recuperar ──');
  await salir(p);
  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await esperar(500);
  await p.click('#irRecuperar');
  await esperar(500);
  const soloCorreo = await p.evaluate(() => document.getElementById('recVia') === null
    && !document.querySelector('#formRecuperar input[type=tel]'));
  if (soloCorreo) ok('«Olvidé mi contraseña» solo pide el correo, también con el SMS encendido');
  else anota('F', 'flujo', '«Olvidé mi contraseña» ofrece SMS o pide un celular');
  await p.click('#btnCancelarRec').catch(() => {});
  await esperar(300);
  await p.click('#irRecuperacion').catch(() => {});
  await esperar(500);
  const rcp = await visible(p, '#formRecuperacion');
  const rsExiste = await p.evaluate(() => document.getElementById('formRecuperacionSms') !== null);
  if (rcp && !rsExiste) ok('«¿Ya no tiene acceso a su correo?» abre la solicitud revisada y #formRecuperacionSms no existe');
  else anota('F', 'flujo', `la recuperación sin correo no abre solo #formRecuperacion (visible=${rcp}, #formRecuperacionSms existe=${rsExiste})`);
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
