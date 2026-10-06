/**
 * codex.js — recoge los parches que Codex deja en los issues, sin gastar
 * tokens de Claude en copiar, pegar ni mirar comentarios a ojo.
 *
 * Por qué existe: Codex no puede subir nada a GitHub (ver «Delegación a Codex»
 * en CLAUDE.md). Contesta con un `git format-patch` dentro de un bloque ```diff
 * en un comentario, y recogerlo era un ritual manual por issue: bajar el
 * comentario por la API, localizar el bloque correcto (a veces hay varios, a
 * veces la respuesta es «parte 1 de N», a veces solo trae el comando) y
 * aplicarlo con `git am --keep-cr`. Copiarlo a mano ya rompió un parche
 * (un U+FFFD en una línea de contexto, tanda 5). Aquí queda hecho una vez.
 *
 * Uso:
 *   node tools/codex.js estado 150 151 154
 *   node tools/codex.js bajar 154 155 --dir /tmp/parches
 *   node tools/codex.js aplicar 154 155 --dir /tmp/parches
 *
 *   estado   por issue: si Codex respondió después del último encargo y si
 *            la respuesta trae un parche completo, parcial o ninguno.
 *   bajar    guarda <n>.patch (último bloque diff completo de la última
 *            respuesta de Codex). No aplica nada.
 *   aplicar  `git am --keep-cr -3` de cada <n>.patch, en el orden dado. Si uno
 *            falla: `git am --abort`, lo informa y sigue con el siguiente.
 *            Si falta el .patch, lo baja antes.
 *
 * Solo módulos de node y la API pública de GitHub. `GITHUB_TOKEN` es opcional
 * (sin él, 60 peticiones por hora, de sobra para una tanda).
 *
 * Códigos de salida: 0 todo bien; 1 algún issue sin parche completo o algún
 * parche que no aplicó; 2 uso incorrecto.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const REPO = process.env.CODEX_REPO || 'victoremilio27-code/mercamaquinarias-website';
const BOT = 'chatgpt-codex-connector[bot]';

// ─────────────────────────────────────────────────────────────────────────
// Parte pura: extraer el parche de un comentario. Es lo que prueba
// tools/codex.prueba.js; no toca red ni disco.
// ─────────────────────────────────────────────────────────────────────────

/**
 * GitHub devuelve a veces el cuerpo de un comentario con \r\n en TODAS las
 * líneas, también en las del parche. Con eso `git am` ve un \r al final de
 * «From <sha> …» y de cada cabecera y falla. Pero un parche de un archivo CRLF
 * lleva \r legítimos dentro de sus líneas, así que no se puede quitar todos a
 * ciegas: se decide por la línea «From …» (siempre es de git, nunca contenido).
 * Si ella acaba en \r, el envoltorio es CRLF y se quita UN \r por línea; los
 * del contenido, que ahí quedan duplicados, sobreviven con uno.
 */
function desenvolverCrlf(lineas) {
  const primera = lineas.find((l) => l.trim() !== '');
  if (primera === undefined) return lineas;
  if (!/^From [0-9a-f]{7,40} /.test(primera.replace(/\r$/, ''))) return lineas;
  if (!primera.endsWith('\r')) return lineas;
  return lineas.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

/**
 * Bloques de código cercados con ``` (o más acentos). Un diff que parchea un
 * .md puede traer ``` dentro, pero siempre precedido de «+», «-» o espacio,
 * así que una línea que EMPIECE por ``` solo puede ser un cerco de verdad.
 * Devuelve [{ lang, lineas }].
 */
function bloquesDeCodigo(texto) {
  const lineas = String(texto || '').split('\n');
  const bloques = [];
  let abierto = null;
  for (const cruda of lineas) {
    const linea = cruda.replace(/\r$/, '');
    if (!abierto) {
      const m = /^ {0,3}(`{3,})\s*([\w+-]*)[^`]*$/.exec(linea);
      if (m) abierto = { cerco: m[1].length, lang: m[2].toLowerCase(), lineas: [] };
      continue;
    }
    const cierre = /^ {0,3}(`{3,})\s*$/.exec(linea);
    if (cierre && cierre[1].length >= abierto.cerco) {
      bloques.push({ lang: abierto.lang, lineas: abierto.lineas });
      abierto = null;
    } else {
      abierto.lineas.push(cruda);
    }
  }
  // Un cerco sin cerrar es una respuesta cortada a media entrega: se devuelve
  // marcado para que se clasifique como parcial en vez de perderse.
  if (abierto) bloques.push({ lang: abierto.lang, lineas: abierto.lineas, sinCerrar: true });
  return bloques;
}

/**
 * ¿Los contadores de cada hunk cuadran con las líneas que trae? Un parche
 * cortado a mitad (el límite de tamaño de un comentario) casi siempre acaba
 * con firma de git falsa o sin ella; esto atrapa el resto. Los parches
 * binarios no se cuentan.
 */
function huncksCuadran(lineas) {
  let i = 0;
  while (i < lineas.length) {
    const m = /^@@ -\d+(?:,(\d+))? \+\d+(?:,(\d+))? @@/.exec(lineas[i]);
    i++;
    if (!m) continue;
    let viejas = m[1] === undefined ? 1 : Number(m[1]);
    let nuevas = m[2] === undefined ? 1 : Number(m[2]);
    while ((viejas > 0 || nuevas > 0) && i < lineas.length) {
      const l = lineas[i];
      if (l.startsWith('\\')) { i++; continue; }
      if (l.startsWith('+')) nuevas--;
      else if (l.startsWith('-')) viejas--;
      else if (l.startsWith(' ') || l === '' || l === '\r') { viejas--; nuevas--; }
      else return false;
      i++;
    }
    if (viejas > 0 || nuevas > 0) return false;
  }
  return true;
}

/**
 * Evalúa un bloque: ¿es un parche de `git format-patch --stdout` entero?
 * Entero = empieza por «From <sha> …», acaba con la firma de git («-- » y la
 * versión) y sus hunks cuadran.
 */
function evaluarBloque(bloque) {
  const lineas = desenvolverCrlf(bloque.lineas);
  while (lineas.length && lineas[lineas.length - 1].trim() === '') lineas.pop();
  const texto = lineas.join('\n') + '\n';
  const primera = (lineas.find((l) => l.trim() !== '') || '').replace(/\r$/, '');
  const empiezaBien = /^From [0-9a-f]{7,40} /.test(primera);
  const n = lineas.length;
  // GitHub puede comerse el espacio final de «-- », de ahí `\s*`.
  const firma =
    n >= 2 &&
    /^\d+(\.\d+)+[^\n]*$/.test(lineas[n - 1].trim()) &&
    /^--\s*$/.test(lineas[n - 2].replace(/\r$/, ''));
  const hunks = huncksCuadran(lineas);
  const commits = lineas.filter((l) => /^From [0-9a-f]{40} /.test(l)).length;
  const roto = lineas.findIndex((l) => l.includes('�'));
  return {
    texto,
    completo: empiezaBien && firma && hunks && !bloque.sinCerrar,
    empiezaBien,
    firma,
    hunks,
    sinCerrar: !!bloque.sinCerrar,
    commits,
    // Línea (base 1) del primer carácter de reemplazo U+FFFD, o 0: un parche
    // con uno no aplica donde lo lleva una línea de contexto.
    lineaRota: roto + 1,
  };
}

/**
 * Bloques diff de un comentario, ya evaluados. Acepta ```diff y ```patch; un
 * bloque sin etiqueta solo cuenta si empieza por «From <sha>», que es a lo que
 * no se le puede confundir con un comando o una salida de pruebas.
 */
function bloquesDiff(texto) {
  const out = [];
  for (const b of bloquesDeCodigo(texto)) {
    const primera = (desenvolverCrlf(b.lineas).find((l) => l.trim() !== '') || '').replace(/\r$/, '');
    const esDiff = b.lang === 'diff' || b.lang === 'patch' || /^From [0-9a-f]{7,40} /.test(primera);
    if (!esDiff) continue;
    out.push(evaluarBloque(b));
  }
  return out;
}

/** El último bloque completo del comentario, o null. */
function ultimoParcheCompleto(texto) {
  const bloques = bloquesDiff(texto).filter((b) => b.completo);
  return bloques.length ? bloques[bloques.length - 1] : null;
}

/**
 * «parte 1 de 3» (con números): Codex avisa así de que el resto viene aparte.
 * Devuelve { k, n } solo si falta algo (k < n); «parte 1 de N» literal, que es
 * como lo cita el propio issue, no cuenta.
 */
function partesPendientes(texto) {
  const re = /parte\s+(\d+)\s+de\s+(\d+)/gi;
  let m;
  let resultado = null;
  while ((m = re.exec(String(texto || '')))) {
    const k = Number(m[1]);
    const n = Number(m[2]);
    if (k < n) resultado = { k, n };
  }
  return resultado;
}

/**
 * Clasifica UNA respuesta de Codex:
 *   completo  trae un parche entero y no dice que falten partes
 *   parcial   trae diff truncado, o dice «parte k de n» con k < n
 *   sin-diff  respuesta sin ningún bloque diff (solo el comando, o texto)
 */
function clasificarRespuesta(texto) {
  const bloques = bloquesDiff(texto);
  const completo = bloques.filter((b) => b.completo);
  const partes = partesPendientes(texto);
  if (partes) return { tipo: 'parcial', motivo: 'dice «parte ' + partes.k + ' de ' + partes.n + '»', bloques };
  if (completo.length) return { tipo: 'completo', motivo: '', bloques };
  if (bloques.length) {
    const b = bloques[bloques.length - 1];
    const falta = [];
    if (!b.empiezaBien) falta.push('no empieza por «From »');
    if (!b.firma) falta.push('sin la firma de git');
    if (!b.hunks) falta.push('hunks incompletos');
    if (b.sinCerrar) falta.push('bloque sin cerrar');
    return { tipo: 'parcial', motivo: falta.join(', ') || 'bloque incompleto', bloques };
  }
  return { tipo: 'sin-diff', motivo: 'ningún bloque diff', bloques };
}

/**
 * Dado el hilo de comentarios de un issue (en orden cronológico), decide qué
 * respuesta de Codex cuenta: la última, siempre que sea POSTERIOR al último
 * encargo. El encargo es el último comentario de otra persona que nombra a
 * Codex con arroba; así, tras devolver un parche con un nuevo encargo, la
 * respuesta vieja no se confunde con la nueva.
 */
function respuestaVigente(comentarios, bot = BOT) {
  const lista = comentarios.slice().sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  let encargo = null;
  for (const c of lista) {
    const autor = c.user && c.user.login;
    if (autor !== bot && /@codex\b/i.test(c.body || '')) encargo = c;
  }
  const despues = lista.filter(
    (c) => c.user && c.user.login === bot && (!encargo || new Date(c.created_at) > new Date(encargo.created_at))
  );
  return {
    encargo,
    respuestas: despues,
    ultima: despues.length ? despues[despues.length - 1] : null,
    // Respuestas del bot que NO cuentan porque son anteriores al último encargo.
    viejas: lista.filter((c) => c.user && c.user.login === bot).length - despues.length,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Parte con red y disco.
// ─────────────────────────────────────────────────────────────────────────

function cabecerasApi() {
  const h = { Accept: 'application/vnd.github+json', 'User-Agent': 'mercamaquinarias-codex-js' };
  const t = process.env.GITHUB_TOKEN;
  // En las sesiones en la nube la variable trae un marcador y el proxy pone
  // la credencial de verdad; mandarlo tal cual solo estorba.
  if (t && t !== 'proxy-injected') h.Authorization = 'Bearer ' + t;
  return h;
}

async function pedir(url) {
  const r = await fetch(url, { headers: cabecerasApi() });
  if (!r.ok) {
    const cuerpo = await r.text().catch(() => '');
    throw new Error('GitHub respondió ' + r.status + ' en ' + url + ' ' + cuerpo.slice(0, 160));
  }
  return r.json();
}

async function comentariosDe(n) {
  const todos = [];
  for (let pagina = 1; pagina < 20; pagina++) {
    const url = 'https://api.github.com/repos/' + REPO + '/issues/' + n + '/comments?per_page=100&page=' + pagina;
    const lote = await pedir(url);
    todos.push(...lote);
    if (lote.length < 100) break;
  }
  return todos;
}

async function analizar(n) {
  const comentarios = await comentariosDe(n);
  const vig = respuestaVigente(comentarios);
  if (!vig.ultima) {
    return {
      n, tipo: vig.encargo ? 'sin-respuesta' : 'sin-encargo', vig,
      motivo: vig.encargo ? 'Codex aún no contesta al encargo' : 'ningún comentario encarga la tarea',
      clasif: null,
    };
  }
  const clasif = clasificarRespuesta(vig.ultima.body);
  return { n, tipo: clasif.tipo, motivo: clasif.motivo, vig, clasif };
}

function fecha(c) {
  return c ? c.created_at.replace('T', ' ').replace(/:\d\dZ$/, 'Z') : '-';
}

function linea(a) {
  const marca = { completo: 'OK ', parcial: 'PARCIAL', 'sin-diff': 'SIN DIFF', 'sin-respuesta': 'ESPERA', 'sin-encargo': 'SIN ENCARGO' }[a.tipo];
  let s = '#' + a.n + '  ' + marca;
  if (a.vig.ultima) {
    s += '  respuesta ' + a.vig.ultima.id + ' (' + fecha(a.vig.ultima) + ')';
    if (a.vig.respuestas.length > 1) s += ', ' + a.vig.respuestas.length + ' respuestas desde el encargo';
    const ok = a.clasif.bloques.filter((b) => b.completo);
    if (ok.length) s += ', ' + ok.length + ' bloque(s) completo(s), ' + ok[ok.length - 1].commits + ' commit(s) en el último';
    const roto = ok.length ? ok[ok.length - 1].lineaRota : 0;
    if (roto) s += '  AVISO: U+FFFD en la línea ' + roto + ' del parche';
  }
  if (a.vig.encargo) s += '  [encargo ' + fecha(a.vig.encargo) + ']';
  if (a.motivo) s += '  — ' + a.motivo;
  if (a.vig.viejas) s += '  (' + a.vig.viejas + ' respuesta(s) anteriores al encargo, ignoradas)';
  return s;
}

function destino(dir, n) {
  return path.join(dir, n + '.patch');
}

/** Baja el parche de un issue. Devuelve { ok, archivo, motivo }. */
async function bajarUno(n, dir) {
  const a = await analizar(n);
  const bloque = a.vig.ultima && ultimoParcheCompleto(a.vig.ultima.body);
  if (!bloque || a.tipo !== 'completo') {
    return { ok: false, motivo: a.tipo === 'completo' ? 'sin bloque completo' : a.tipo + (a.motivo ? ' (' + a.motivo + ')' : ''), analisis: a };
  }
  fs.mkdirSync(dir, { recursive: true });
  const archivo = destino(dir, n);
  // Sin conversión de saltos de línea: --keep-cr necesita los bytes tal cual.
  fs.writeFileSync(archivo, bloque.texto, 'utf8');
  return { ok: true, archivo, analisis: a, bloque };
}

function git(args) {
  return spawnSync('git', args, { encoding: 'utf8' });
}

function aplicarUno(archivo) {
  const antes = (git(['rev-parse', 'HEAD']).stdout || '').trim();
  const r = git(['am', '--keep-cr', '-3', path.resolve(archivo)]);
  const despues = (git(['rev-parse', 'HEAD']).stdout || '').trim();
  // Con -3, un parche que ya está en la rama sale con 0 sin crear commit
  // («Patch already applied»). Darlo por aplicado haría creer que hay un
  // commit nuevo donde no lo hay, así que sin commit nuevo cuenta como fallo.
  if (r.status === 0 && antes !== despues) return { ok: true, salida: (r.stdout || '').trim() };
  const salida = r.status === 0
    ? 'no creó ningún commit: el parche ya estaba aplicado en esta rama, o viene vacío'
    : ((r.stdout || '') + (r.stderr || '')).trim();
  // Dejar el árbol limpio para que el siguiente parche pueda intentarse.
  git(['am', '--abort']);
  return { ok: false, salida };
}

// ─────────────────────────────────────────────────────────────────────────
// Línea de órdenes
// ─────────────────────────────────────────────────────────────────────────

function leerArgs(argv) {
  const out = { orden: argv[0], issues: [], dir: null, error: null };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir' || a === '-d') out.dir = argv[++i];
    else if (a.startsWith('--dir=')) out.dir = a.slice(6);
    else if (/^#?\d+$/.test(a)) out.issues.push(Number(a.replace('#', '')));
    else out.error = 'argumento desconocido: ' + a;
  }
  return out;
}

function uso() {
  console.error(
    'Uso:\n' +
      '  node tools/codex.js estado <n…>\n' +
      '  node tools/codex.js bajar <n…> --dir <carpeta>\n' +
      '  node tools/codex.js aplicar <n…> --dir <carpeta>'
  );
  return 2;
}

async function principal(argv) {
  const args = leerArgs(argv);
  if (!['estado', 'bajar', 'aplicar'].includes(args.orden) || args.error || !args.issues.length) {
    if (args.error) console.error(args.error);
    return uso();
  }
  const dir = args.dir || path.join(os.tmpdir(), 'codex-parches');
  let mal = 0;

  if (args.orden === 'estado') {
    for (const n of args.issues) {
      try {
        const a = await analizar(n);
        console.log(linea(a));
        if (a.tipo !== 'completo') mal++;
      } catch (e) {
        console.log('#' + n + '  ERROR  ' + e.message);
        mal++;
      }
    }
    return mal ? 1 : 0;
  }

  if (args.orden === 'bajar') {
    for (const n of args.issues) {
      try {
        const r = await bajarUno(n, dir);
        if (r.ok) console.log('#' + n + '  bajado -> ' + r.archivo + ' (' + r.bloque.commits + ' commit(s))');
        else { console.log('#' + n + '  NO se baja: ' + r.motivo); mal++; }
      } catch (e) {
        console.log('#' + n + '  ERROR  ' + e.message);
        mal++;
      }
    }
    return mal ? 1 : 0;
  }

  // aplicar
  const aplicados = [];
  const fallidos = [];
  for (const n of args.issues) {
    try {
      let archivo = destino(dir, n);
      if (!fs.existsSync(archivo)) {
        const r = await bajarUno(n, dir);
        if (!r.ok) { fallidos.push([n, 'no hay parche completo: ' + r.motivo]); console.log('#' + n + '  FALLO  ' + fallidos[fallidos.length - 1][1]); continue; }
        archivo = r.archivo;
      }
      const r = aplicarUno(archivo);
      if (r.ok) { aplicados.push(n); console.log('#' + n + '  aplicado'); }
      else {
        fallidos.push([n, r.salida]);
        console.log('#' + n + '  NO APLICA (am abortado, árbol limpio):\n' + r.salida.split('\n').map((l) => '    ' + l).join('\n'));
      }
    } catch (e) {
      fallidos.push([n, e.message]);
      console.log('#' + n + '  ERROR  ' + e.message);
    }
  }
  console.log('\nResumen: aplicados ' + (aplicados.map((n) => '#' + n).join(' ') || 'ninguno') +
    ' | fallidos ' + (fallidos.map(([n]) => '#' + n).join(' ') || 'ninguno'));
  return fallidos.length ? 1 : 0;
}

/**
 * `fetch` de node no usa el proxy del entorno salvo que se pida al arrancar
 * (NODE_USE_ENV_PROXY=1). En la nube, sin él, GitHub contesta 403. Si hay
 * proxy configurado y falta la variable, el script se relanza una vez a sí
 * mismo con ella, en vez de exigir que quien lo use la recuerde.
 */
function relanzarConProxy() {
  const hayProxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!hayProxy || process.env.NODE_USE_ENV_PROXY) return false;
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: 'inherit',
    env: { ...process.env, NODE_USE_ENV_PROXY: '1', NODE_NO_WARNINGS: '1' },
  });
  process.exit(r.status === null ? 1 : r.status);
}

if (require.main === module) {
  relanzarConProxy();
  principal(process.argv.slice(2)).then(
    (codigo) => process.exit(codigo),
    (e) => { console.error(e.message); process.exit(1); }
  );
}

module.exports = {
  bloquesDeCodigo,
  bloquesDiff,
  ultimoParcheCompleto,
  clasificarRespuesta,
  partesPendientes,
  respuestaVigente,
  desenvolverCrlf,
};
