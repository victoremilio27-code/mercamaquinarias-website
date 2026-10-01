/* Recorrido de auditoría · vendedor particular, dealer y administrador.
   Usa el sitio como lo usaría una persona: formularios reales, códigos
   leídos del buzón de archivo, sin tocar la base por debajo. */

const puppeteer = require('puppeteer');
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE = 'http://127.0.0.1:8080';
const CLAVE = 'Retroexcavadora77RD';
const BUZON = '.tmp/correos';
/* La cuenta de dealer de demostración de tools/seed.js (`caribe`, con
   membresía y anuncios sembrados). En CI se siembra con `npm run db:demo`
   antes de esta auditoría; sin siembra, el bloque lo avisa y sigue. */
const CORREO_DEMO = 'caribe@demo.mercamaquinarias.do';
const CLAVE_DEMO = 'demostracion2026';
const TEXTO_VENDIDO_D07 = 'Este equipo fue vendido. Ahora puede publicar otro equipo con la capacidad disponible de su plan.';
const contexto = (texto, patron) => {
  const i = texto.search(patron);
  return texto.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ');
};

/* Cada pasada estrena correos y RNC.
   Antes eran fijos, y la segunda vez que se corría la auditoría el
   registro moría con «Ya existe una cuenta con ese correo». A partir de
   ahí todo lo que venía después fallaba por esa causa y no por la que
   se estaba probando: cinco hallazgos de un solo motivo, ninguno real.
   Se podrían borrar las cuentas de la pasada anterior, pero eso obliga
   a tocar la base por debajo, que es justo lo que esta auditoría evita
   para que el recorrido sea el de una persona de verdad. */
const SELLO = Date.now().toString().slice(-6);

/* El limitador de altas, a cero antes de empezar.
   Esta auditoría crea tres cuentas seguidas desde la misma conexión y
   el servidor corta a la tercera, con razón: así se frena a quien crea
   cuentas en masa. Una persona real nunca lo toca; una auditoría que se
   corre diez veces en una tarde, sí. Sin esto la pasada mide el
   limitador en vez de los flujos. */
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
const CORREO_PARTICULAR = `vendedor-${SELLO}@auditoria.do`;
const CORREO_DEALER = `dealer-${SELLO}@auditoria.do`;
const CORREO_ADMIN = `admin-${SELLO}@auditoria.do`;
const EMPRESA_DEALER = `Auditoría Equipos ${SELLO} SRL`;
const RNC_DEALER = `1${SELLO}909`.slice(0, 9).padEnd(9, '0');

/* El administrador NO se crea desde el sitio: conceder ese permiso por
   la API es justamente lo que la auditoría de permisos comprueba que es
   imposible. Así que se crea por la herramienta de consola, igual que
   se haría en el servidor, y a partir de ahí se entra por la pantalla
   de acceso como cualquiera.

   Hasta ahora esta parte entraba con una cuenta de dealer de
   demostración y la llamaba «administrador». El sitio le negaba la cola
   de revisión —correctamente— y la auditoría lo apuntaba como fallo del
   sitio. El recorrido del administrador no se había probado nunca. */
function crearAdministrador() {
  execFileSync(process.execPath, [
    'tools/admin.js', 'crear', CORREO_ADMIN, 'Auditoría Administración',
    '--admin', '--clave', CLAVE,
  ], { stdio: 'pipe' });
}

const fallos = [];
const anota = (donde, tipo, detalle) => {
  fallos.push({ donde, tipo, detalle });
  console.log(`    ⚠ [${tipo}] ${detalle}`);
};
const ok = (t) => console.log(`    ✓ ${t}`);

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/* 06-10: con CardNet apagado (el CI no enciende MERCA_CARDNET) ninguna
   pantalla enseña el selector de tarjeta, el modal de captura ni la
   lista de tarjetas guardadas. Si aparecen, el interruptor no manda. */
const SELECTOR_TARJETA = '.captura, .metodo-pago, .tarjetas, .tarjetas-guardadas, [data-metodo-pago]';
const sinTarjeta = async (pagina, donde) => {
  const n = await pagina.$$eval(SELECTOR_TARJETA, (x) => x.length).catch(() => -1);
  if (n === 0) ok(`${donde}: sin selector de tarjeta ni tarjetas guardadas con CardNet apagado`);
  else anota(donde, 'flujo', `${donde} enseña elementos de tarjeta con CardNet apagado (${n})`);
};

function codigoDe(fragmento) {
  // Solo .txt: el buzón guarda también la versión .html de cada correo
  // para poder revisarla en el navegador, y ahí el código no está en
  // el formato «Código: 123456» que busca la expresión de abajo.
  const archivos = fs.readdirSync(BUZON)
    .filter((f) => f.endsWith('.txt') && f.includes(fragmento)).sort();
  if (!archivos.length) return null;
  const texto = fs.readFileSync(`${BUZON}/${archivos[archivos.length - 1]}`, 'utf8');
  const m = /Código: (\d+)/.exec(texto);
  return m && m[1];
}

function vigilar(p, etiqueta) {
  p.removeAllListeners('pageerror');
  p.removeAllListeners('response');
  p.on('pageerror', (e) => anota(etiqueta, 'excepción', String(e.message).slice(0, 140)));
  p.on('response', (r) => {
    if (r.status() >= 500) anota(etiqueta, `HTTP ${r.status()}`, r.url().replace(BASE, ''));
  });
}

async function escribir(p, sel, valor) {
  await p.click(sel);
  await p.type(sel, valor);
}

/* Registro + verificación del correo. Devuelve true si acabó con sesión. */
async function registrar(p, { tipo, correo, nombre, extra = {} }) {
  await p.goto(`${BASE}/cuenta.html?crear=1`, { waitUntil: 'networkidle0' });
  await esperar(400);
  if (tipo === 'dealer') {
    await p.click('input[name="tipoCuenta"][value="dealer"]');
    await esperar(300);
  }
  await escribir(p, '#new-nombre', nombre);
  await escribir(p, '#new-telefono', extra.telefono || '8095551234');
  await escribir(p, '#new-correo', correo);
  await escribir(p, '#new-clave', CLAVE);
  /* La confirmación de contraseña. Sin rellenarla, el registro se
     detiene con «Las dos contraseñas no coinciden» y TODO lo que viene
     después —verificar el correo, entrar al panel, publicar, la cola de
     revisión del administrador— falla en cascada por un motivo que no
     tiene nada que ver con lo que se estaba probando.
     Pasó: cinco hallazgos de una sola causa. */
  await escribir(p, '#new-clave2', CLAVE);

  if (tipo === 'dealer') {
    await escribir(p, '#new-empresa', extra.empresa);
    await escribir(p, '#new-rnc', extra.rnc);
    await escribir(p, '#new-encargado', nombre);
    await escribir(p, '#new-direccion', extra.direccion || 'Av. Principal 45, nave 2');
    await p.select('#new-provincia', extra.provincia || 'Santo Domingo');
  }

  /* La casilla de las condiciones. Se marca pulsándola, no poniéndole
     `checked` por código: lo que se audita es el formulario que usa una
     persona, y una casilla que solo se puede marcar desde la consola no
     serviría de nada. */
  await p.click('#new-acepta');

  await p.click('#btnCrear');
  await esperar(1200);

  const aviso = await p.$eval('#avisoAcceso', (el) => (el.hidden ? '' : el.textContent.trim())).catch(() => '');
  if (aviso) { anota('registro', 'lógica', `${correo}: ${aviso}`); return false; }

  const codigo = codigoDe(correo.split('@')[0]);
  if (!codigo) { anota('registro', 'correo', `no llegó código a ${correo}`); return false; }

  await p.type('#cod-codigo', codigo);
  await esperar(1800);
  return p.url().includes('panel.html');
}

(async () => {
  limpiarLimitador();
  const nav = await puppeteer.launch({ headless: 'new' });
  const p = await nav.newPage();
  await p.setViewport({ width: 1440, height: 950 });

  /* ═══ VENDEDOR PARTICULAR ═══ */
  console.log('\n═══ Vendedor particular ═══');
  vigilar(p, 'particular');

  /* Fase 10.2 con el SMS apagado: así corre el CI y así está producción
     hasta que se paguen los créditos. Aquí se comprueba lo que SÍ se ve
     (el celular obligatorio, el acceso por correo de siempre) y lo que NO
     debe verse (el selector de SMS). Las pantallas del SMS encendido las
     recorre auditar-telefono.js en su propio servidor. */
  console.log('\n  ── Celular y SMS con el SMS apagado ──');
  for (const [telefono, esperado, etiqueta] of [
    ['', /celular/i, 'sin celular'],
    ['8005551234', /809, 829 o 849/, 'con 8005551234'],
  ]) {
    await p.goto(`${BASE}/cuenta.html?crear=1`, { waitUntil: 'networkidle0' });
    await esperar(400);
    await escribir(p, '#new-nombre', 'José Almonte');
    if (telefono) await escribir(p, '#new-telefono', telefono);
    await escribir(p, '#new-correo', `sintel-${SELLO}@auditoria.do`);
    await escribir(p, '#new-clave', CLAVE);
    await escribir(p, '#new-clave2', CLAVE);
    await p.click('#new-acepta');
    await p.click('#btnCrear');
    await esperar(900);
    const avisoTel = await p.$eval('#avisoAcceso', (el) => (el.hidden ? '' : el.textContent.trim())).catch(() => '');
    const sigueAqui = new URL(p.url()).pathname.endsWith('/cuenta.html');
    if (esperado.test(avisoTel) && sigueAqui) ok(`el registro ${etiqueta} se queda en el formulario: «${avisoTel.slice(0, 70)}»`);
    else anota('registro', 'flujo', `el registro ${etiqueta} no avisa del celular o salió del formulario (aviso=«${avisoTel}», url=${p.url()})`);
  }

  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await esperar(500);
  await p.click('#irRecuperar');
  await esperar(400);
  const recViaVisible = await p.$eval('#recVia', (el) => !el.hidden && el.offsetParent !== null).catch(() => false);
  if (!recViaVisible) ok('«Olvidé mi contraseña» no ofrece SMS con el SMS apagado (#recVia oculto)');
  else anota('recuperar', 'flujo', '#recVia visible con el SMS apagado');
  await p.click('#btnCancelarRec').catch(() => {});
  await esperar(300);
  await p.click('#irRecuperacion').catch(() => {});
  await esperar(400);
  const rcpVisible = await p.$eval('#formRecuperacion', (el) => !el.hidden).catch(() => false);
  const rsVisible = await p.$eval('#formRecuperacionSms', (el) => !el.hidden).catch(() => true);
  if (rcpVisible && !rsVisible) ok('«¿Ya no tiene acceso a su correo?» abre la revisión por persona (#formRecuperacion), no la de SMS');
  else anota('recuperar', 'flujo', `la recuperación sin correo no abre #formRecuperacion con el SMS apagado (rcp=${rcpVisible}, sms=${rsVisible})`);

  const entro = await registrar(p, {
    tipo: 'particular', correo: CORREO_PARTICULAR, nombre: 'José Almonte',
  });
  console.log(`  registro + verificación → panel: ${entro ? 'sí' : 'NO'}`);
  if (!entro) anota('particular', 'flujo', 'no llegó al panel tras verificar el correo');

  /* Publicar un equipo (fase 05.2, MOD-05, MOD-06, MOD-07).

     Esta parte esperaba el flujo VIEJO: que un particular recién
     registrado, sin cupos, fuera mandado a planes.html y que esa página
     «explicara qué es un cupo». Con el modelo nuevo no hay a dónde
     mandarlo ni cupo que explicar: /publicar.html empieza por el paso
     «Elige cómo publicar este equipo», el borrador nace en el servidor
     al elegir plan, y el particular no lee la palabra «cupo». Las dos
     comprobaciones viejas se sustituyen por su equivalente, no se
     quitan: que el asistente se abra para quien no tiene capacidad, y
     que no le hable de lo que no contrató. */
  console.log('\n  ── Publicar un equipo ──');
  await p.goto(`${BASE}/publicar.html`, { waitUntil: 'networkidle0' });
  await esperar(1200);

  const url = new URL(p.url());
  console.log(`  sin capacidad, /publicar.html acaba en: ${url.pathname}${url.search}`);

  if (url.pathname.endsWith('/publicar.html')) {
    ok('el particular sin capacidad se queda en el asistente de publicar');
  } else {
    anota('publicar', 'flujo', `el particular nuevo acaba en ${url.pathname}${url.search} en vez de en publicar.html`);
  }

  const pasoPlan = await p.$eval('.paso[data-paso="plan"]',
    (el) => ({ visible: !el.hidden, texto: el.innerText })).catch(() => null);
  if (pasoPlan && pasoPlan.visible && /Elige cómo publicar este equipo/.test(pasoPlan.texto)) {
    ok('empieza por «Elige cómo publicar este equipo»');
  } else {
    anota('publicar', 'flujo', 'el paso del plan no es lo primero que ve el particular sin capacidad');
  }

  const nPlanes = await p.$$eval('input[name="planPublicar"]', (n) => n.length).catch(() => 0);
  if (nPlanes >= 3) ok(`ofrece ${nPlanes} planes (Estándar, Destacada, Premium)`);
  else anota('publicar', 'flujo', `el paso del plan ofrece ${nPlanes} plan(es), se esperaban al menos 3`);

  const cuerpoPlan = await p.$eval('main#contenido', (m) => m.innerText).catch(() => '');
  if (/ITBIS incluido/.test(cuerpoPlan)) ok('el precio dice «ITBIS incluido»');
  else anota('publicar', 'ux', 'el paso del plan no dice «ITBIS incluido» junto al precio');

  // MOD-07: el particular no lee «cupo» en el asistente.
  const cupoPlan = /cupo/i.exec(cuerpoPlan);
  if (cupoPlan) {
    const i = cuerpoPlan.search(/cupo/i);
    anota('publicar', 'ux', `publicar.html dice «cupo» al particular: …${cuerpoPlan.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ')}…`);
  } else {
    ok('publicar.html no dice «cupo» al particular');
  }

  /* Quien acaba de registrarse aún no aceptó la política de publicación
     de anuncios: la página lo dice arriba con un botón, y el servidor no
     crea el borrador hasta que se acepta. Se pulsa como lo haría una
     persona. Si la cuenta ya lo tenía aceptado, no hay aviso y no pasa
     nada. */
  const avisoLegal = await p.$('#btnAceptarLegal');
  if (avisoLegal) {
    await avisoLegal.click();
    await p.waitForSelector('.aviso-legal', { hidden: true, timeout: 5000 })
      .then(() => ok('acepta las condiciones de publicación desde el aviso de la página'))
      .catch(() => anota('publicar', 'flujo', 'el aviso de condiciones no desaparece al aceptarlo'));
  }

  // Elegir el primer plan y seguir: el borrador se crea en el servidor.
  // Se pulsa la etiqueta: el círculo de radio de las tarjetas no se ve.
  let idBorrador = null;
  await p.click('#planesPublicar li label').catch(() => {});
  await p.click('#btnSiguiente').catch(() => {});
  await p.waitForFunction(() => location.search.includes('borrador='), { timeout: 8000 }).catch(() => {});
  idBorrador = new URL(p.url()).searchParams.get('borrador');

  if (idBorrador) {
    ok('al elegir plan la URL pasa a publicar.html?borrador=<id>');
    await sinTarjeta(p, 'publicar.html');

    const mios = await p.evaluate(async () => {
      const r = await fetch('/api/mis-anuncios', { credentials: 'same-origin' });
      return r.ok ? (await r.json()).anuncios : null;
    });
    const suyo = (mios || []).find((a) => a.id === idBorrador);
    if (suyo && suyo.estado === 'borrador') ok('el borrador existe en el servidor con estado «borrador»');
    else anota('publicar', 'flujo', `el borrador ${idBorrador} no aparece como «borrador» en /api/mis-anuncios`);

    /* T-05.2-07 / D-14: un borrador no es público. Se pide SIN la
       cookie de sesión, como lo haría un visitante cualquiera. */
    const visitante = await p.evaluate(async (id) => {
      const r = await fetch(`/api/anuncios/${encodeURIComponent(id)}`, { credentials: 'omit' });
      return r.status;
    }, idBorrador);
    if (visitante === 404) ok('un visitante sin sesión recibe 404 al pedir el borrador');
    else anota('publicar', 'SEGURIDAD', `un visitante ve el borrador ${idBorrador} (HTTP ${visitante})`);

    // El paso del equipo, vacío, sigue frenando el avance (la comprobación de siempre).
    await esperar(400);
    await p.click('#btnSiguiente').catch(() => {});
    await esperar(700);
    const textoErr = await p.$$eval('.campo-v__error, .paso__aviso, [role="alert"]',
      (n) => n.filter((x) => x.offsetParent !== null).map((x) => x.textContent.trim()).join(' | '));
    if (!textoErr) anota('publicar', 'validación', 'el asistente avanza con el formulario vacío');
    else ok(`frena en vacío y avisa: ${textoErr.slice(0, 90)}`);
  } else {
    anota('publicar', 'flujo', 'al elegir plan y pulsar Continuar no se creó el borrador (la URL no lleva ?borrador=)');
  }

  // Panel del particular
  await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
  await esperar(900);
  const subP = await p.$eval('#panelSub', (el) => el.textContent.trim()).catch(() => '');
  console.log(`  panel: ${subP}`);
  const ofreceDealer = await p.$eval('body', (b) => b.innerText.includes('Comercializa maquinaria'));
  console.log(`  ofrece pasar a dealer: ${ofreceDealer ? 'sí' : 'NO'}`);

  /* El borrador de arriba vive ahora en el servidor, así que el panel lo
     ofrece con «Continuar» hacia publicar.html?borrador=<id> (MOD-06),
     y el panel del particular no le habla de cupos (MOD-07). */
  if (idBorrador) {
    const fila = await p.$$eval('#panelAnuncios tr, #cuerpoAnuncios tr, main tr', (filas, id) => {
      const f = filas.find((tr) => tr.dataset.id === id);
      if (!f) return null;
      const enlace = [...f.querySelectorAll('a')].find((a) => /Continuar/.test(a.textContent));
      return {
        borrador: /Borrador/.test(f.innerText),
        continuar: enlace ? enlace.getAttribute('href') : null,
      };
    }, idBorrador).catch(() => null);

    if (fila && fila.borrador) ok('el panel lista el borrador como «Borrador»');
    else anota('panel', 'flujo', 'el panel no lista el borrador recién creado como «Borrador»');

    if (fila && fila.continuar === `publicar.html?borrador=${encodeURIComponent(idBorrador)}`) {
      ok('el panel ofrece «Continuar» hacia el borrador');
    } else {
      anota('panel', 'flujo', `el borrador no tiene un «Continuar» hacia publicar.html?borrador=<id> (href: ${fila && fila.continuar})`);
    }
  }

  const planPanel = await p.$eval('#panelPlan', (el) => el.innerText).catch(() => '');
  if (/cupo/i.test(planPanel)) anota('panel', 'ux', 'el panel del particular dice «cupo» en su plan');
  else ok('el panel del particular no dice «cupo»');

  // planes.html, con esta sesión de particular: sin «cupo» y con enlaces
  // que llevan al asistente con el plan ya elegido.
  await p.goto(`${BASE}/planes.html`, { waitUntil: 'networkidle0' });
  await esperar(900);
  const cuerpoPlanes = await p.$eval('main#contenido', (m) => m.innerText).catch(() => '');
  if (!cuerpoPlanes) {
    anota('planes', 'flujo', 'planes.html no pinta contenido para el particular');
  } else if (/cupo/i.test(cuerpoPlanes)) {
    const i = cuerpoPlanes.search(/cupo/i);
    anota('planes', 'ux', `planes.html dice «cupo» al particular: …${cuerpoPlanes.slice(Math.max(0, i - 40), i + 40).replace(/\s+/g, ' ')}…`);
  } else {
    ok('planes.html no dice «cupo» al particular');
  }
  const nEnlacesPlan = await p.$$eval('a[href^="publicar.html?plan="]', (n) => n.length).catch(() => 0);
  if (nEnlacesPlan) ok(`planes.html lleva a publicar.html con el plan elegido (${nEnlacesPlan} enlaces)`);
  else anota('planes', 'flujo', 'planes.html no tiene enlaces a publicar.html?plan=<id> para el particular');
  await sinTarjeta(p, 'planes.html (particular)');
  await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
  await esperar(500);

  /* ── Renovar desde el panel (05.3-04) ──────────────────────
     Comprueba en un navegador real lo que el particular ve: cuándo vence
     su anuncio, el botón «Renovar ahora», el precio final sin «cupo» ni
     «3 %», la casilla de renovación automática AUSENTE (el CI no enciende
     MERCA_CARDNET, D-12) y el enlace ?renovar= de los avisos por correo.
     No se paga nada. Chrome no arranca en la nube de Victor: esto corre
     en el trabajo `navegador` del CI.

     El anuncio se publica por dentro de la página con las mismas rutas
     del borrador que usa el asistente; el Estándar sale a importe cero
     (promoción) y se publica al instante, sin ingreso que confirmar. */
  console.log('\n  Renovación desde el panel');
  const idRenovable = await p.evaluate(async () => {
    const pedir = async (ruta, metodo, cuerpo) => {
      const r = await fetch(`/api${ruta}`, {
        method: metodo, credentials: 'same-origin',
        headers: cuerpo ? { 'Content-Type': 'application/json' } : undefined,
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      let d = null;
      try { d = await r.json(); } catch (_) { /* sin cuerpo */ }
      return { ok: r.ok, estado: r.status, d };
    };
    const ses = await pedir('/sesion', 'GET');
    const faltan = (((ses.d || {}).legales || {}).faltan || {});
    const docs = [...new Set([...(faltan.publicar || []), ...(faltan.pagar || [])])];
    if (docs.length) await pedir('/legales/aceptar', 'POST', { documentos: docs });

    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ'
      + 'AAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const fotos = [];
    for (let i = 0; i < 3; i++) {
      const f = await pedir('/fotos', 'POST', { completa: PNG });
      if (!f.ok) return { error: `foto ${f.estado}: ${JSON.stringify(f.d)}` };
      fotos.push({ url: f.d.completa, miniatura: f.d.miniatura || null });
    }
    const nuevo = await pedir('/borradores', 'POST', { plan: 'estandar', dias: 30 });
    if (!nuevo.ok) return { error: `borrador ${nuevo.estado}: ${JSON.stringify(nuevo.d)}` };
    const id = nuevo.d.borrador.id;
    const guardado = await pedir(`/borradores/${id}`, 'PUT', {
      categoria: 'camiones', subcategoria: 'cam-volteo', marca: 'peterbilt',
      modelo: '567', anio: 2019, precio: 2500000, provincia: 'Santo Domingo',
      fotos, telefonos: [{ numero: '8095551234', tipo: 'ambos' }],
    });
    if (!guardado.ok) return { error: `guardar ${guardado.estado}: ${JSON.stringify(guardado.d)}` };
    const pago = await pedir(`/borradores/${id}/pago`, 'POST', {});
    if (pago.estado !== 201) return { error: `pago ${pago.estado}: ${JSON.stringify(pago.d)}` };
    return { id };
  });

  if (!idRenovable || idRenovable.error) {
    anota('renovar', 'flujo', `no se pudo dejar un anuncio publicado: ${idRenovable && idRenovable.error}`);
  } else {
    const id = idRenovable.id;
    await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
    await esperar(900);

    const fila = await p.$$eval('#filasAnuncios tr', (filas, ident) => {
      const f = filas.find((tr) => tr.dataset.id === ident);
      if (!f) return null;
      return {
        texto: f.innerText,
        renovar: [...f.querySelectorAll('button')].some((b) => /Renovar ahora/.test(b.textContent)),
      };
    }, id);
    if (fila && /Vence el/.test(fila.texto) && fila.renovar) ok('la fila enseña «Vence el…» y el botón «Renovar ahora»');
    else anota('renovar', 'flujo', `la fila del anuncio publicado no tiene «Vence el» y «Renovar ahora» (${fila ? fila.texto.replace(/\s+/g, ' ').slice(0, 120) : 'sin fila'})`);

    // Pulsar «Renovar ahora» abre la sección con el precio final.
    await p.evaluate((ident) => {
      const f = [...document.querySelectorAll('#filasAnuncios tr')].find((tr) => tr.dataset.id === ident);
      const b = f && [...f.querySelectorAll('button')].find((x) => /Renovar ahora/.test(x.textContent));
      if (b) b.click();
    }, id);
    await esperar(500);
    const seccion = await p.$eval('#panelRenovar', (el) => ({ visible: !el.hidden, texto: el.innerText })).catch(() => null);
    if (!seccion || !seccion.visible) {
      anota('renovar', 'flujo', '«Renovar ahora» no abre #panelRenovar');
    } else {
      if (/ITBIS incluido|Sin costo durante la promoción/.test(seccion.texto)) ok('la renovación enseña el precio final «ITBIS incluido»');
      else anota('renovar', 'ux', 'la sección de renovar no dice «ITBIS incluido» ni «Sin costo durante la promoción»');
      if (/cupo|3 ?%/i.test(seccion.texto)) anota('renovar', 'ux', 'la sección de renovar dice «cupo» o «3 %» al particular');
      else ok('la renovación no dice «cupo» ni «3 %»');
    }

    // D-12: sin CardNet no existe la casilla, ni desactivada.
    const auto = await p.$eval('#renovarAutomatica', (el) => ({ oculto: el.hidden, vacio: el.innerHTML.trim() === '' })).catch(() => null);
    if (auto && auto.oculto && auto.vacio) ok('la casilla de renovación automática no aparece con CardNet apagado');
    else anota('renovar', 'flujo', 'la casilla de renovación automática aparece con CardNet apagado');
    await sinTarjeta(p, 'panel.html (renovar)');

    // «Cancelar» la oculta. No se paga nada.
    await p.click('#btnCancelarRenovacion').catch(() => {});
    await esperar(200);
    const cerrada = await p.$eval('#panelRenovar', (el) => el.hidden).catch(() => false);
    if (cerrada) ok('«Cancelar» oculta la sección de renovar');
    else anota('renovar', 'flujo', '«Cancelar» no oculta la sección de renovar');

    // El enlace del correo abre la renovación de ese anuncio, y solo de ese.
    await p.goto(`${BASE}/panel.html?renovar=${encodeURIComponent(id)}`, { waitUntil: 'networkidle0' });
    await esperar(900);
    const abre = await p.$eval('#panelRenovar', (el) => !el.hidden).catch(() => false);
    if (abre) ok('panel.html?renovar=<id> abre la renovación de ese anuncio');
    else anota('renovar', 'flujo', 'panel.html?renovar=<id> no abre la renovación');

    const antesErrores = fallos.length;
    await p.goto(`${BASE}/panel.html?renovar=${encodeURIComponent('<script>alert(1)</script>')}`, { waitUntil: 'networkidle0' });
    await esperar(900);
    const abreMalo = await p.$eval('#panelRenovar', (el) => !el.hidden).catch(() => false);
    const pintado = await p.evaluate(() => document.body.innerHTML.includes('<script>alert(1)'));
    if (!abreMalo && !pintado && fallos.length === antesErrores) ok('panel.html?renovar=<script> no abre nada ni lanza errores');
    else anota('renovar', 'SEGURIDAD', 'panel.html?renovar=<script> abre la renovación, se pinta o lanza errores');

    await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
    await esperar(500);
  }

  /* D-06: el particular conserva sus filtros de siempre. «Pausados» y
     «Vencidos» son del dealer; si aparecieran aquí, el particular leería
     estados que no maneja. Un particular recién registrado no tiene
     inventario y el panel puede no pintar filtros: entonces no hay nada
     que comparar y se dice. */
  await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
  await esperar(700);
  const filtrosParticular = await p.$$eval('#filtrosPanel .filtro-panel', (n) => n.map((b) => b.textContent.trim())).catch(() => []);
  if (!filtrosParticular.length) {
    ok('el particular nuevo no tiene inventario: sin filtros que comparar');
  } else if (filtrosParticular.some((t) => /Pausados|Vencidos|Vendidos|Retirados/.test(t))) {
    anota('particular', 'ux', `el particular ve filtros del dealer: ${filtrosParticular.join(' / ')}`);
  } else if (!/^Todos/.test(filtrosParticular[0]) || !filtrosParticular.some((t) => /^Activos/.test(t)) || !filtrosParticular.some((t) => /^Inactivos/.test(t))) {
    anota('particular', 'ux', `los filtros del particular no son Todos / Activos / Inactivos: ${filtrosParticular.join(' / ')}`);
  } else {
    ok(`el particular conserva sus filtros (${filtrosParticular.join(' / ')}) y no ve «Pausados» ni «Vencidos»`);
  }
  const panelJs = await p.evaluate(() => fetch('/assets/panel.js').then((r) => r.text())).catch(() => '');
  if (panelJs.includes(TEXTO_VENDIDO_D07)) ok('assets/panel.js trae el aviso de vendido de D-07 para el dealer');
  else anota('dealer', 'ux', 'assets/panel.js no trae el texto exacto de D-07 al marcar vendido');

  // El particular no debe ver el panel de administración
  await p.goto(`${BASE}/admin.html`, { waitUntil: 'networkidle0' });
  await esperar(800);
  const bloqueado = await p.$eval('#adminSinAcceso', (el) => !el.hidden).catch(() => false);
  console.log(`  /admin.html bloqueado para particular: ${bloqueado ? 'sí ✓' : 'NO ⚠'}`);
  if (!bloqueado) anota('particular', 'SEGURIDAD', 'un particular ve el panel de administración');

  /* Contraseña con un código al correo (10.2, D-05): con el SMS apagado
     la vía del celular no existe, pero la del correo sí, y es lo que usa
     quien no recuerda la actual. Se hace con la sesión del particular
     recién registrado y se cambia a la MISMA contraseña, para que el
     resto de la auditoría siga entrando con ella. */
  console.log('\n  ── Contraseña con código al correo ──');
  if (entro) {
    await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
    await esperar(800);
    if (await p.$('#btnClaveSinActual')) {
      await p.click('#btnClaveSinActual');
      await esperar(300);
      const viaSmsOculta = await p.$eval('#segClaveViaSms', (el) => el.hidden).catch(() => false);
      if (viaSmsOculta) ok('«Por SMS a mi celular» está oculto con el SMS apagado');
      else anota('seguridad', 'flujo', '#segClaveViaSms visible con el SMS apagado');
      await p.click('#btnClavePedirCodigo');
      await esperar(1200);
      const codigoClave = codigoDe('vendedor-' + SELLO);
      if (!codigoClave) {
        anota('seguridad', 'correo', 'no llegó el código para cambiar la contraseña al correo del particular');
      } else {
        await escribir(p, '#seg-clave-codigo', codigoClave);
        await escribir(p, '#seg-clave-codigo-nueva', CLAVE);
        await escribir(p, '#seg-clave-codigo-nueva2', CLAVE);
        await p.click('#formClaveCodigo button[type="submit"]');
        await esperar(1500);
        const avClave = await p.$eval('#avisoSegClave', (el) => (el.hidden ? '' : el.textContent.trim())).catch(() => '');
        if (avClave) ok(`la contraseña se cambia con un código al correo: «${avClave.slice(0, 70)}»`);
        else anota('seguridad', 'flujo', 'cambiar la contraseña con el código del correo no dejó aviso de éxito');
      }
    } else {
      anota('seguridad', 'flujo', 'el panel no tiene #btnClaveSinActual');
    }
  } else {
    anota('seguridad', 'flujo', 'sin sesión del particular: no se probó la contraseña con código');
  }

  /* ═══ DEALER ═══ */
  console.log('\n═══ Dealer ═══');
  await p.goto(`${BASE}/api/cuenta/salir`, { waitUntil: 'networkidle0' }).catch(() => {});
  await p.evaluate(() => fetch('/api/cuenta/salir', { method: 'POST', credentials: 'same-origin' })).catch(() => {});
  await esperar(500);

  vigilar(p, 'dealer');
  const entroD = await registrar(p, {
    tipo: 'dealer', correo: CORREO_DEALER, nombre: 'Carmen Objio',
    extra: { empresa: EMPRESA_DEALER, rnc: RNC_DEALER, provincia: 'La Vega' },
  });
  console.log(`  alta de dealer → panel: ${entroD ? 'sí' : 'NO'}`);

  await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
  await esperar(900);
  const cuerpoD = await p.$eval('body', (b) => b.innerText);
  console.log(`  estado mostrado: ${/En revisión/.test(cuerpoD) ? 'En revisión ✓' : 'NO aparece ⚠'}`);
  if (!/En revisión/.test(cuerpoD)) anota('dealer', 'ux', 'el panel no indica que está en revisión');
  if (/RNC\s*1319/.test(cuerpoD)) anota('dealer', 'PRIVACIDAD', 'el RNC completo se ve en el panel');
  else ok('el RNC aparece enmascarado');

  // Sucursales
  const btnSuc = await p.$('#btnNuevaSucursal, [data-nueva-sucursal]');
  console.log(`  puede añadir sucursales: ${btnSuc ? 'sí' : 'NO'}`);

  // Un dealer pendiente no debe salir en el directorio
  await p.goto(`${BASE}/dealers.html`, { waitUntil: 'networkidle0' });
  await esperar(800);
  const dir = await p.$eval('body', (b) => b.innerText);
  if (dir.includes(EMPRESA_DEALER)) anota('dealer', 'LÓGICA', 'un dealer pendiente aparece en el directorio');
  else ok('el dealer pendiente no sale en el directorio');

  /* ═══ DEALER CON CAPACIDAD (DEMOSTRACIÓN) ═══
     Un dealer con membresía y anuncios de verdad, el de tools/seed.js.
     No se confirma ninguna ampliación: la auditoría no cobra ni altera
     el inventario sembrado. */
  console.log('\n═══ Dealer con capacidad (demostración) ═══');
  await p.evaluate(() => fetch('/api/cuenta/salir', { method: 'POST', credentials: 'same-origin' })).catch(() => {});
  await esperar(400);
  vigilar(p, 'dealer-demo');
  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await escribir(p, '#ent-correo', CORREO_DEMO);
  await escribir(p, '#ent-clave', CLAVE_DEMO);
  await p.click('#formEntrar button[type="submit"]');
  await esperar(1500);
  if (await p.$eval('#formCodigo', (el) => !el.hidden).catch(() => false)) {
    const c = codigoDe(CORREO_DEMO.split('@')[0]);
    if (c) { await p.type('#cod-codigo', c); await esperar(1800); }
  }
  if (!p.url().includes('panel')) {
    console.log('  (la cuenta de demostración no existe: ¿se corrió db:demo?)');
    anota('dealer-demo', 'aviso', 'no se pudo entrar con el dealer de demostración; sin siembra no hay recorrido');
  } else {
    const sinCupo = async (pagina, etiqueta) => {
      await p.goto(`${BASE}/${pagina}`, { waitUntil: 'networkidle0' });
      await esperar(1000);
      const t = await p.$eval('main', (m) => m.innerText).catch(() => '');
      if (/cupo/i.test(t)) anota('dealer', 'ux', `${etiqueta} dice «cupo» al dealer: …${contexto(t, /cupo/i)}…`);
      else ok(`${etiqueta} no dice «cupo» al dealer`);
      await sinTarjeta(p, `${etiqueta} (dealer)`);
    };
    await sinCupo('panel.html', 'panel.html');
    if (await p.$('.resumen-dealer')) {
      /* textContent y sin distinguir mayúsculas: el CSS pone los rótulos
         en versales y innerText devuelve lo que se pinta, no lo escrito. */
      const t = await p.$eval('.resumen-dealer', (e) => e.textContent);
      if (/Capacidad disponible/i.test(t) && /Vence el/i.test(t)) ok('el resumen del dealer se ve con «Capacidad disponible» y «Vence el»');
      else anota('dealer', 'ux', 'el resumen del dealer no trae «Capacidad disponible» y «Vence el»');
    } else {
      anota('dealer', 'ux', 'el panel del dealer no muestra .resumen-dealer');
    }
    const filtros = await p.$$eval('#filtrosPanel .filtro-panel', (n) => n.map((b) => b.textContent.trim())).catch(() => []);
    if (filtros.some((t) => /^Vendidos/.test(t)) && filtros.some((t) => /^Vencidos/.test(t))) ok(`los filtros del dealer incluyen Vendidos y Vencidos (${filtros.join(' / ')})`);
    else anota('dealer', 'ux', `los filtros del dealer no incluyen Vendidos y Vencidos: ${filtros.join(' / ')}`);

    if (await p.$('[data-ampliar]')) {
      await p.click('[data-ampliar]');
      await esperar(800);
      const abierta = await p.$eval('#panelAmpliar', (el) => !el.hidden).catch(() => false);
      const precio = await p.$eval('#ampliarPrecio', (el) => el.textContent).catch(() => '');
      if (abierta && /ITBIS incluido|Sin costo/.test(precio)) ok(`ampliar abre la sección con el precio: «${precio.trim().slice(0, 70)}»`);
      else anota('dealer', 'flujo', `ampliar no abre la sección con precio (abierta=${abierta}, precio=«${precio.trim().slice(0, 60)}»)`);
    } else {
      anota('dealer', 'flujo', 'el dealer de demostración no tiene botón de ampliar en su membresía');
    }
    await p.goto(`${BASE}/panel.html?ampliar=no-existe`, { waitUntil: 'networkidle0' });
    await esperar(900);
    const abreAjeno = await p.$eval('#panelAmpliar', (el) => !el.hidden).catch(() => false);
    if (!abreAjeno) ok('una ampliación con id inexistente no abre nada');
    else anota('dealer', 'SEGURIDAD', 'panel.html?ampliar= con un id ajeno abre la sección de ampliar');

    await sinCupo('planes.html', 'planes.html');
    await sinCupo('publicar.html', 'publicar.html');

    /* Seguridad de la cuenta (10.1): el panel trae los tres bloques y una
       contraseña equivocada al cambiar el correo se queda en un aviso,
       sin recargar y sin cambiar nada. */
    await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
    await esperar(800);
    const bloques = await p.$$eval('#panelSeguridad #segCorreo, #panelSeguridad #segTelefono, #panelSeguridad #segClave, #panelSeguridad #segSesiones', (n) => n.length).catch(() => 0);
    if (bloques === 4) ok('panel.html trae «Seguridad de la cuenta» con correo, celular, contraseña y sesiones');
    else anota('seguridad', 'flujo', `#panelSeguridad no trae los cuatro bloques (hay ${bloques})`);
    const estadoTel = await p.$eval('#segTelefonoEstado', (el) => el.textContent.trim()).catch(() => '');
    if (estadoTel) ok(`#segTelefonoEstado dice: «${estadoTel.slice(0, 70)}»`);
    else anota('seguridad', 'flujo', '#segTelefonoEstado está vacío');
    const verifOculto = await p.$eval('#btnVerificarTelefono', (el) => el.hidden || el.offsetParent === null).catch(() => true);
    if (verifOculto) ok('#btnVerificarTelefono oculto con el SMS apagado');
    else anota('seguridad', 'flujo', '#btnVerificarTelefono visible con el SMS apagado');

    if (await p.$('#btnCambiarCorreo')) {
      await p.evaluate(() => { window.__sinRecarga = true; });
      await p.click('#btnCambiarCorreo');
      await escribir(p, '#seg-correo-nuevo', `nuevo-${SELLO}@auditoria.do`);
      await escribir(p, '#seg-correo-clave', 'una-clave-equivocada-99');
      await p.click('#formCorreoNuevo button[type="submit"]');
      await esperar(1200);
      const av = await p.$eval('#avisoSegCorreo', (el) => (el.hidden ? '' : el.textContent.trim())).catch(() => '');
      const sigue = await p.evaluate(() => window.__sinRecarga === true);
      if (av && sigue) ok(`cambiar el correo con contraseña equivocada avisa sin recargar: «${av.slice(0, 60)}»`);
      else anota('seguridad', 'flujo', `la contraseña equivocada no dejó aviso o recargó la página (aviso=«${av}», sinRecarga=${sigue})`);
    } else {
      anota('seguridad', 'flujo', 'el panel no tiene el botón «Cambiar correo»');
    }
  }

  /* Visitante sin sesión: ni el cuerpo ni el pie dicen «cupo». */
  console.log('\n═══ Visitante ═══');
  await p.evaluate(() => fetch('/api/cuenta/salir', { method: 'POST', credentials: 'same-origin' })).catch(() => {});
  await esperar(400);
  vigilar(p, 'visitante');
  for (const pagina of ['index.html', 'dealers.html', 'planes.html']) {
    await p.goto(`${BASE}/${pagina}`, { waitUntil: 'networkidle0' });
    await esperar(800);
    const t = await p.$$eval('main, footer', (n) => n.map((e) => e.innerText).join('\n')).catch(() => '');
    if (/cupo/i.test(t)) anota('visitante', 'ux', `${pagina} dice «cupo» al visitante: …${contexto(t, /cupo/i)}…`);
    else ok(`${pagina} no dice «cupo» al visitante (cuerpo y pie)`);
  }

  /* «No fui yo» (10.1): con un testigo falso solo se muestra el bloque.
     Ninguna petición POST sale antes de pulsar el botón: los antivirus de
     correo abren los enlaces solos y una reversión por GET anularía la
     contraseña de quien no la pidió. */
  const posts = [];
  const escuchar = (rq) => { if (rq.method() === 'POST' && rq.url().includes('/api/')) posts.push(rq.url()); };
  p.on('request', escuchar);
  await p.goto(`${BASE}/cuenta.html?revertir=${'ab'.repeat(32)}`, { waitUntil: 'networkidle0' });
  await esperar(800);
  const veRevertir = await p.$eval('#formRevertir', (el) => !el.hidden).catch(() => false);
  const veEntrar = await p.$eval('#formEntrar', (el) => !el.hidden).catch(() => true);
  if (veRevertir && !veEntrar) ok('cuenta.html?revertir= muestra el bloque de revertir en vez de los formularios');
  else anota('revertir', 'flujo', `cuenta.html?revertir= no muestra solo el bloque de revertir (revertir=${veRevertir}, entrar=${veEntrar})`);
  if (!posts.length) ok('cuenta.html?revertir= no hace ninguna petición POST antes de pulsar');
  else anota('revertir', 'SEGURIDAD', `cuenta.html?revertir= hizo POST al cargar: ${posts.join(', ')}`);
  p.off('request', escuchar);

  /* ═══ ADMINISTRADOR ═══ */
  console.log('\n═══ Administrador ═══');
  await p.evaluate(() => fetch('/api/cuenta/salir', { method: 'POST', credentials: 'same-origin' })).catch(() => {});
  await esperar(400);

  vigilar(p, 'admin');
  crearAdministrador();

  await p.goto(`${BASE}/cuenta.html`, { waitUntil: 'networkidle0' });
  await escribir(p, '#ent-correo', CORREO_ADMIN);
  await escribir(p, '#ent-clave', CLAVE);
  await p.click('#formEntrar button[type="submit"]');
  await esperar(1200);

  if (await p.$eval('#formCodigo', (el) => !el.hidden).catch(() => false)) {
    const c = codigoDe(CORREO_ADMIN.split('@')[0]);
    if (c) { await p.type('#cod-codigo', c); await esperar(1800); }
  }
  console.log(`  sesión de administrador: ${p.url().includes('panel') ? 'sí' : 'NO'}`);

  await p.goto(`${BASE}/admin.html`, { waitUntil: 'networkidle0' });
  await esperar(1000);
  const verCola = await p.$eval('#adminContenido', (el) => !el.hidden).catch(() => false);
  console.log(`  ve la cola de revisión: ${verCola ? 'sí ✓' : 'NO ⚠'}`);
  if (!verCola) anota('admin', 'flujo', 'el administrador no ve la cola');

  // Consola nueva (05.4): Publicaciones, Pagos de todos los métodos y Renovaciones.
  const hayPublicaciones = await p.$('#filtrosPublicaciones');
  const hayCobros = await p.$('#filtrosCobros');
  if (hayPublicaciones && hayCobros) ok('la consola enseña Publicaciones y Pagos con sus filtros');
  else anota('admin', 'flujo', `a la consola le faltan secciones (#filtrosPublicaciones=${!!hayPublicaciones}, #filtrosCobros=${!!hayCobros})`);
  const textoAdmin = await p.$eval('body', (b) => b.innerText).catch(() => '');
  if (/Renovaciones/.test(textoAdmin)) ok('la consola enseña Renovaciones');
  else anota('admin', 'flujo', 'la consola no enseña «Renovaciones»');
  if (/se otorgan los cupos/i.test(textoAdmin)) anota('admin', 'ux', 'admin.html todavía dice «se otorgan los cupos»');
  else ok('admin.html no dice «se otorgan los cupos»');

  /* Acotado a #listaSolicitudes. La clase `.sol` la usan DOS listas de
     esta página: la cola de revisión y la flota propia. Sin acotar, se
     contaban los equipos de alquiler como si fueran solicitudes: con la
     cola vacía decía «6 pendientes» y luego reventaba buscando un botón
     de expediente que no existe en un equipo de la flota. */
  const enCola = '#listaSolicitudes .sol';
  const nSol = await p.$$eval(enCola, (n) => n.length).catch(() => 0);
  console.log(`  solicitudes pendientes: ${nSol}`);

  if (!nSol) {
    anota('admin', 'flujo', 'la cola está vacía: el alta de dealer de esta pasada no llegó');
  } else {
    await p.click(`${enCola} button[data-accion="ver"]`);
    await esperar(800);
    const exp = await p.$eval(`${enCola} .sol__detalle`, (el) => el.innerText).catch(() => '');
    const veRnc = exp.includes(RNC_DEALER);
    console.log(`  expediente muestra RNC: ${veRnc ? 'sí ✓' : 'NO ⚠'}`);
    if (!veRnc) anota('admin', 'flujo', 'el expediente no muestra el RNC');

    await p.click(`${enCola} button[data-accion="aprobar"]`);
    await esperar(1500);
    const restantes = await p.$$eval(enCola, (n) => n.length).catch(() => 0);
    console.log(`  tras aprobar: ${nSol} → ${restantes} pendientes`);
    if (restantes >= nSol) anota('admin', 'flujo', 'aprobar no saca la solicitud de la cola');
  }

  // Tras aprobar, ¿aparece en el directorio? Sin plan NO debe salir.
  await p.goto(`${BASE}/dealers.html`, { waitUntil: 'networkidle0' });
  await esperar(800);
  const dir2 = await p.$eval('body', (b) => b.innerText);
  console.log(`  aprobado sin plan en el directorio: ${dir2.includes(EMPRESA_DEALER) ? 'SÍ ⚠' : 'no ✓'}`);
  if (dir2.includes(EMPRESA_DEALER)) anota('admin', 'lógica', 'sale en el directorio sin plan contratado');

  await nav.close();

  console.log(`\n══════ ${fallos.length} hallazgo(s) en flujos autenticados ══════`);
  fallos.forEach((f) => console.log(`  [${f.tipo}] ${f.donde}: ${f.detalle}`));

  /* Salir con 1 cuando hay hallazgos. Ver la nota de `auditar-publico.js`:
     las dos salían 0 pasara lo que pasara, lo que las volvía decorativas
     dentro de la barrera del CI.

     Ojo al ejecutarla a mano: esta auditoría crea su propio administrador
     escribiendo DIRECTO en la base, así que el servidor y ella tienen que
     apuntar a la MISMA. Si se lanza el servidor con `MERCA_DB=...` y la
     auditoría sin esa variable, cada uno mira una base distinta y salen
     dos hallazgos fantasma sobre la cola de revisión. */
  process.exit(fallos.length ? 1 : 0);
})();
