# Testing Patterns

**Analysis Date:** 2026-09-25

## Overview

There is no single test framework used throughout this project. Instead there are **three distinct testing styles**, chosen deliberately per the kind of thing being verified, all invoked as npm scripts from `package.json`:

| Style | Runner | Files | What it verifies |
|---|---|---|---|
| Unit tests | `node:test` (built-in) | `tools/numero-a-letras.prueba.js` | Pure functions, no I/O |
| Hand-rolled script harness | Plain Node script with a `comprobar()`/`ok()` counter, `process.exit(code)` | `tools/probar-seguridad.js`, `tools/probar-pagina-dealer.js`, `tools/probar-facturas.js`, `tools/probar-correo.js`, `tools/prueba-chat.js`, `tools/auditar-permisos.js` | End-to-end business logic against a real (temporary) SQLite DB and a fake HTTP req/res, or against a real running server via `http`/`https` |
| Puppeteer browser audits | `puppeteer` | `tools/auditar-publico.js`, `tools/auditar-flujos.js`, `tools/check-links.js`, `tools/check-motion.js` | Real rendered pages: console errors, broken links, SEO tags, responsive layout, animation/reduced-motion behavior, full user journeys (signup, dealer approval, admin) |

**Only one file uses `node:test`.** The project's own comment explains why it doesn't use `node:test` (or any test framework) everywhere else — see `tools/numero-a-letras.prueba.js:6-9`:

> "Se usa `node:test`, que viene en Node: el proyecto no añade un corredor de pruebas por una función, igual que no añade un generador de PDF por un comprobante."

(Translation: Node's built-in `node:test` is used because the project won't add a test-runner dependency just for one function — same philosophy as not adding a PDF library just for one document type.) The implication for new code: **default to `node:test` only for small, pure, dependency-free functions.** For anything that touches the DB, the HTTP layer, or the DOM, follow the hand-rolled harness or Puppeteer pattern instead — do not introduce Jest/Vitest/Mocha etc.

## Run Commands

From `package.json` (`scripts`):

```bash
npm run check                # tools/check-links.js — broken links / console errors (puppeteer)
npm run check:motion         # tools/check-motion.js — prefers-reduced-motion (puppeteer)
npm run auditar              # runs 4 audits in sequence: taxonomia, publico, flujos, permisos
npm run auditar:publico      # tools/auditar-publico.js — anonymous visitor journey (puppeteer)
npm run auditar:flujos       # tools/auditar-flujos.js — seller/dealer/admin journeys (puppeteer)
npm run auditar:permisos     # tools/auditar-permisos.js — authorization/cross-tenant checks (plain http)
npm run correo:probar        # tools/probar-correo.js — sends real template emails
npm run seguridad:probar     # tools/probar-seguridad.js — security regression checks (fake req/res)
npm run chat:probar          # tools/prueba-chat.js — Anthropic client, https.request stubbed
npm run facturas:probar      # tools/probar-facturas.js — invoice/NCF emission end-to-end
npm run facturas:letras      # node --test tools/numero-a-letras.prueba.js — the one node:test suite
npm run dealer:probar        # tools/probar-pagina-dealer.js — dealer's own page end-to-end
npm run taxonomia            # tools/verificar-taxonomia.js — category/brand data integrity
```

There is **no single "run all tests" command** that covers everything — `npm run auditar` covers the four `auditar-*` scripts only. The other `probar-*`/`prueba-*` scripts and the `node:test` suite must be run individually. When adding a new manual test script, add its own npm script entry following the `<área>:probar` naming convention (e.g. `dealer:probar`, `facturas:probar`).

Several `auditar-*`/`check-*` scripts require the site to actually be running first:
```bash
npm start                    # node tools/serve.js --port 8080 (must be running for puppeteer/http-based scripts)
```

## Pattern 1 — `node:test` unit suite (`tools/numero-a-letras.prueba.js`)

Standard built-in API, no custom harness:
```js
const test = require('node:test');
const assert = require('node:assert');
const { enLetras, enPalabras } = require('./numero-a-letras.js');

test('los casos de la especificación', () => {
  assert.equal(enLetras(0), 'Cero pesos dominicanos con 00/100');
  ...
});
```
- Test names are full Spanish sentences describing the scenario, not `it('should ...')` phrasing.
- Grouped by scenario category (`'decimales'`, `'apócope delante del sustantivo'`, `'importes reales de la plataforma'`) rather than by function.
- Assertions include inline comments explaining a tricky edge case, e.g. rounding: `/* El redondeo de los centavos no puede perder un peso. */`.

Run with: `node --test tools/numero-a-letras.prueba.js`.

## Pattern 2 — Hand-rolled script harness (`probar-*.js`)

No assertion library. Every script defines its own tiny counter and check function near the top:
```js
let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) { bien++; console.log(`  ok  ${que}`); return; }
  mal++;
  console.log(`  MAL ${que}`);
}
...
console.log(`\n${bien} bien, ${mal} mal\n`);
process.exit(mal ? 1 : 0);
```
(`tools/probar-seguridad.js`, `tools/probar-pagina-dealer.js`; `tools/probar-facturas.js` uses the same idea with `ok()`/`fallos`; `tools/prueba-chat.js` uses `ok`/`fallos` arrays printed at the end.)

Conventions for this pattern:
- Non-zero exit code (`process.exit(mal ? 1 : 0)`) signals failure to CI/manual runs — always end a script this way.
- Every `comprobar(...)` call's second argument is a **human-readable Spanish sentence describing the expected behavior**, often including the actual observed value for debugging: `` `ampliar cupos responde 200 (fue ${ampliacion.codigo})` ``.
- Scripts are organized into numbered/titled sections printed to the console as they run, e.g. `console.log('\n── 1 · el precio mínimo no sale en la ficha pública ────── ');` style banners — makes failures traceable to a narrative step, not just a line number.
- Each check is preceded, where non-obvious, by a comment explaining **why this specific scenario is dangerous** (mirrors the CONVENTIONS.md comment style) — e.g. why testing "repeated visit" must return 202 and not 400.

### Isolated database per test run

Scripts that touch the DB (`probar-seguridad.js`, `probar-pagina-dealer.js`, `probar-facturas.js`) never touch the real database. They resolve `MERCA_DB` to a path under `.tmp/` **before requiring `db.js`**, and wipe/recreate that directory first:
```js
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-seguridad');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
```
The comment convention explicitly flags the ordering hazard: `/* Antes de cargar db.js: la ruta del archivo se resuelve al importarlo. */` — **environment variables that configure a module must be set before that module is `require`d**, since the path is resolved at import time. This is a load-bearing pattern to preserve in any new test script that touches `db.js`.

`MERCA_CORREO = 'archivo'` also redirects the mail transport to write to a local mailbox folder instead of sending real email during tests.

### Fake req/res HTTP harness — `probar-seguridad.js` and `probar-pagina-dealer.js`

Both scripts test the real router (`tools/api.js`'s `manejar()`) directly in-process, without opening a socket, by building a fake Node request/response pair. This is the canonical pattern for testing `api.js` routes without running the HTTP server:

```js
const { EventEmitter } = require('events');

function pedir({ metodo = 'GET', url, cuerpo, trozos, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-seguridad', ...cabeceras };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      setHeader() {},
      writeHead(c) { res.codigo = c; return res; },
      destroy() {},
      end(d) {
        let datos = null;
        try { datos = d ? JSON.parse(d) : null; } catch { datos = null; }
        resolver({ codigo: res.codigo, datos });
      },
    };

    /* `manejar` recibe la ruta ya resuelta como tercer argumento: es
       serve.js quien la decodifica antes de entregársela. */
    const ruta = new URL(url, 'http://localhost').pathname;
    api.manejar(req, res, ruta);
    setImmediate(() => {
      if (trozos) {
        trozos.forEach((t) => req.emit('data', t));
      } else if (cuerpo !== undefined) {
        req.emit('data', Buffer.from(JSON.stringify(cuerpo), 'utf8'));
      }
      req.emit('end');
    });
  });
}
```

Key details of this harness (both files implement it near-identically; `probar-pagina-dealer.js`'s version hardcodes a default `cf-connecting-ip` header):
- `req` is a plain `EventEmitter` with `.method`, `.url`, `.headers`, `.socket.remoteAddress`, and a no-op `.destroy()` bolted on — just enough surface for `api.js` to function, nothing more.
- `res` is a plain object exposing `setHeader`, `writeHead` (captures the status code), `destroy`, and `end` (parses the JSON body and resolves the promise). No real socket/stream is involved.
- The body is **not written synchronously** — it's emitted as `'data'`/`'end'` events inside `setImmediate(...)`, matching how a real request body streams in, which matters because `api.js`'s body reader (`leerCuerpo`) accumulates chunks asynchronously.
- `trozos` (chunks) lets a test **split the raw body at an arbitrary byte offset** — used specifically to test that multi-byte UTF-8 characters (e.g. an accented `ó`) split across two chunks are still decoded correctly (see the "acentos partidos entre dos trozos" section of `probar-seguridad.js`).
- The route path passed to `api.manejar(req, res, ruta)` is the **already-parsed pathname** (`new URL(url, 'http://localhost').pathname`), because in production `serve.js` does that decoding before calling into `api.js` — the harness must replicate that division of responsibility exactly.
- Session-authenticated requests are simulated by setting a `Cookie` header directly: `{ cookie: `te_sesion=${db.abrirSesion(idUsuario)}` }`, using the real `db.abrirSesion()` to mint a valid session token rather than mocking auth.

`tools/auditar-permisos.js` instead makes **real** HTTP requests with Node's `http` module against a running server (`127.0.0.1:8080`), used specifically for cross-tenant authorization checks where a true network round-trip (including real cookies from `Set-Cookie`) matters more than in-process speed.

### Stubbing outbound network calls — `tools/prueba-chat.js`

For the Anthropic chat client, the test monkey-patches `https.request` itself rather than mocking at a higher level, to assert on the exact wire-level request shape (headers, model name, absence of forbidden params) and to script canned responses/errors:
```js
https.request = (opciones, alLlegar) => {
  const req = new EventEmitter();
  let cuerpo = '';
  req.write = (t) => { cuerpo += t; };
  req.end = () => {
    capturado = { opciones, cuerpo: JSON.parse(cuerpo) };
    const paso = guion.shift() || { estado: 200, datos: {} };
    setImmediate(() => {
      if (paso.red) { req.emit('error', new Error(paso.red)); return; }
      const res = new EventEmitter();
      res.statusCode = paso.estado;
      alLlegar(res);
      res.emit('data', JSON.stringify(paso.datos));
      res.emit('end');
    });
  };
  return req;
};
```
A `guion` (script) array of canned responses is shifted on each call, enabling tests for retry-on-429/500, no-retry-on-400, and network failure (`{ red: 'ECONNRESET' }`) paths. `process.env.ANTHROPIC_API_KEY` is set to a fake value before requiring `tools/chat.js`.

## Pattern 3 — Puppeteer browser audits (`auditar-*`, `check-*`)

Used for anything that can only be verified in a real rendered page: console errors, broken navigation, SEO meta tags, responsive overflow, and animation/`prefers-reduced-motion` behavior.

Common shape:
```js
const puppeteer = require('puppeteer');
const BASE = 'http://127.0.0.1:8080';
...
const nav = await puppeteer.launch({ headless: 'new' });
const p = await nav.newPage();
await p.setViewport({ width: 1440, height: 900 });
```

Conventions:
- Requires the site already running at `http://127.0.0.1:8080` (via `npm start`) — these are not self-contained; they hit a live local server, not an in-process fake.
- Listeners are attached/detached per page visit (`p.removeAllListeners('console')` etc. then re-added) via a `vigilar(p, nombreDePagina)` helper, so failures are attributed to the specific page being visited at the time (`tools/auditar-publico.js`).
- An explicit **"expected failures" allowlist** pattern is used to avoid noisy false positives: certain 401/404s are intentional (testing that admin is locked, that a nonexistent dealer 404s) and must not be reported as findings — `tools/auditar-publico.js`'s `ESPERADOS` array plus `esEsperado()`/`anota()` gate. The rationale comment explicitly warns that a report that's never clean trains people to stop reading it. **Any new Puppeteer audit that deliberately triggers an error state must add an entry to this kind of allowlist**, not just let it show up as a finding.
- Similarly, `tools/auditar-flujos.js` resets rate-limiter state (`DELETE FROM intentos` via `node:sqlite`) and mints a fresh timestamp-based email/RNC suffix (`SELLO`) before running, specifically so that re-running the audit repeatedly doesn't fail on rate limits or duplicate-account errors that have nothing to do with what's being tested.
- Findings are accumulated into a `fallos` array of `{ pagina, tipo, detalle }` objects and grouped/printed by `tipo` at the end, rather than failing fast on the first issue — the whole page/flow set is always audited to completion in one run.
- `tools/check-motion.js` inspects **computed style** and DOM mutation over time (not screenshots) to detect motion, since "a static screenshot can't tell you if something is moving" (its own header comment).

## Fixtures / Test Data

No fixture files or factory library. Test data is constructed inline, directly via the real domain functions (`db.crearCuenta(...)`, `db.crearAnuncio(...)`), using realistic-looking but obviously fake values (`'Vendedor de prueba'`, `RNC '131111111'`, phone `'8095551234'`) — comments call out when a value must look real for validation to pass (e.g. RNC must be a valid-format 9-digit sequence) versus when it's arbitrary.

A small local helper function is defined per-script when repeated setup is needed, e.g. `publicarEquipos(idOrg, idUsuario, cuantos)` in `tools/probar-pagina-dealer.js`, or `aceptarTodo(idUsuario)` to pre-accept all legal documents so the test isn't blocked by an unrelated onboarding wall.

## What Gets Mocked vs. What Doesn't

**Mocked/stubbed:**
- Outbound network calls to third-party APIs: `https.request` for Anthropic (`prueba-chat.js`).
- Nothing in the DB layer is mocked — tests run against a real (but temporary/throwaway) SQLite file via `db.js`.

**Not mocked (deliberately real):**
- The SQLite database (temporary file per run, real schema, real queries).
- The HTTP router (`api.js`'s `manejar()`) — called directly, not stubbed, because "lo que importa es exactamente lo que ve quien pregunta desde fuera" (`probar-seguridad.js`) — what matters is exactly what an external caller sees.
- Email transport is swapped to a local "archivo" (file/mailbox) transport via `MERCA_CORREO=archivo`, not mocked at the function level — it still goes through the real templating/formatting code, just doesn't hit the network.
- PDF generation for invoices is exercised for real (`probar-facturas.js`, and `probar-seguridad.js`'s section 7 which deletes a generated PDF and asserts it gets regenerated).

## Coverage

No coverage tool or threshold is configured. No `nyc`, `c8`, `--coverage` flag, or similar appears in `package.json`. Coverage is judged qualitatively: the hand-rolled scripts are written specifically to reproduce previously-real bugs (each has a "why this exists" header explaining a bug that shipped and wasn't visible by reading the code) rather than to hit a percentage target.

## Adding a New Test

- **Pure function, no I/O** → add a `node:test` file named `<módulo>.prueba.js` next to the module, and an npm script `"<área>:algo": "node --test tools/<módulo>.prueba.js"`.
- **API route / DB behavior** → add a `probar-<área>.js` script following the `.tmp/prueba-<área>/` isolated-DB pattern and the fake req/res harness shown above; give it an npm script named `<área>:probar`.
- **Full page / user journey / visual regression** → add to or extend one of the `auditar-*.js` Puppeteer scripts (or add a new one following the same `vigilar()`/`fallos` accumulation pattern), and remember to allowlist any intentionally-triggered error states.
- Always end scripts with a printed tally and `process.exit(mal ? 1 : 0)` so failures are CI-detectable.

---

*Testing analysis: 2026-09-25*
