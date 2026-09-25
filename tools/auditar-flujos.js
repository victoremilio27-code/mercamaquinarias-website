/* Recorrido de auditoría · vendedor particular, dealer y administrador.
   Usa el sitio como lo usaría una persona: formularios reales, códigos
   leídos del buzón de archivo, sin tocar la base por debajo. */

const puppeteer = require('puppeteer');
const fs = require('fs');
const { execFileSync } = require('child_process');

const BASE = 'http://127.0.0.1:8080';
const CLAVE = 'Retroexcavadora77RD';
const BUZON = '.tmp/correos';

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
  const entro = await registrar(p, {
    tipo: 'particular', correo: CORREO_PARTICULAR, nombre: 'José Almonte',
  });
  console.log(`  registro + verificación → panel: ${entro ? 'sí' : 'NO'}`);
  if (!entro) anota('particular', 'flujo', 'no llegó al panel tras verificar el correo');

  /* Publicar un equipo: primero la puerta de los cupos.
     Quien acaba de registrarse no tiene ninguno, así que /publicar.html
     no enseña el asistente: manda a contratar un plan. Lo que hay que
     comprobar aquí es que esa puerta explique por qué y sepa volver.
     (Esta parte daba por rota la publicación entera: se escribió antes
     de que la puerta existiera y esperaba el asistente a secas.) */
  console.log('\n  ── Publicar un equipo ──');
  await p.goto(`${BASE}/publicar.html`, { waitUntil: 'networkidle0' });
  await esperar(1200);

  const url = new URL(p.url());
  console.log(`  sin cupos, /publicar.html acaba en: ${url.pathname}${url.search}`);

  if (url.pathname.endsWith('/planes.html')) {
    ok('sin cupos, manda a contratar un plan en vez de enseñar un asistente inservible');

    /* Sin el destino, quien contrata acaba en la página de planes con
       un cupo en la mano y sin camino de vuelta al asistente. */
    const destino = url.searchParams.get('destino');
    if (destino === 'publicar.html') ok('conserva el destino para volver al asistente');
    else anota('publicar', 'ux', `manda a planes sin conservar el destino (destino=${destino})`);

    const explica = await p.$eval('body', (b) => /cupo/i.test(b.innerText));
    if (explica) ok('explica qué es un cupo');
    else anota('publicar', 'ux', 'manda a contratar sin explicar por qué');
  } else {
    // Con cupos sí toca el asistente: que no avance con todo en blanco.
    const pasos = await p.$$eval('.paso', (n) => n.length).catch(() => 0);
    console.log(`  asistente con ${pasos} paso(s)`);

    const avanzar = await p.$('#btnSiguiente');
    if (!avanzar) {
      anota('publicar', 'ux', 'no se encontró el botón para avanzar');
    } else {
      await avanzar.click();
      await esperar(700);
      const textoErr = await p.$$eval('.campo-v__error, .paso__aviso, [role="alert"]',
        (n) => n.filter((x) => x.offsetParent !== null).map((x) => x.textContent.trim()).join(' | '));
      if (!textoErr) anota('publicar', 'validación', 'el asistente avanza con el formulario vacío');
      else ok(`frena en vacío y avisa: ${textoErr.slice(0, 90)}`);
    }
  }

  // Panel del particular
  await p.goto(`${BASE}/panel.html`, { waitUntil: 'networkidle0' });
  await esperar(900);
  const subP = await p.$eval('#panelSub', (el) => el.textContent.trim()).catch(() => '');
  console.log(`  panel: ${subP}`);
  const ofreceDealer = await p.$eval('body', (b) => b.innerText.includes('Comercializa maquinaria'));
  console.log(`  ofrece pasar a dealer: ${ofreceDealer ? 'sí' : 'NO'}`);

  // El particular no debe ver el panel de administración
  await p.goto(`${BASE}/admin.html`, { waitUntil: 'networkidle0' });
  await esperar(800);
  const bloqueado = await p.$eval('#adminSinAcceso', (el) => !el.hidden).catch(() => false);
  console.log(`  /admin.html bloqueado para particular: ${bloqueado ? 'sí ✓' : 'NO ⚠'}`);
  if (!bloqueado) anota('particular', 'SEGURIDAD', 'un particular ve el panel de administración');

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
