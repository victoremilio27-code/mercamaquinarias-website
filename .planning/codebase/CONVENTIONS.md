# Coding Conventions

**Analysis Date:** 2026-09-25

## Language of the Codebase

This is a **Spanish-language codebase**: variable names, function names, comments, console output, commit-facing strings, error messages, and even filenames are written in Spanish. This is not incidental — it is consistent across every file in `tools/` and `assets/`.

- Files: `tools/probar-seguridad.js`, `tools/auditar-publico.js`, `tools/numero-a-letras.js`, `tools/facturas.js`, `tools/correo.js`
- Function names: `crearAnuncio`, `anotarEvento`, `abrirSesion`, `paginaDe`, `regenerarPdfsPendientes`, `secuenciasBajas` (`tools/db.js`, `tools/facturas.js`)
- User-facing and log strings are Spanish: `'Necesita iniciar sesión'`, `'No existe'` (`tools/api.js`)
- English appears only for: npm/Node built-ins, third-party package names (`puppeteer`, `node:sqlite`, `node:test`), HTTP header names, and a few technical constants (`ECONNRESET`).

**Rule for new code:** name everything in Spanish (functions, variables, DB columns, route helpers, test descriptions). Do not mix in English identifiers except for standard library / npm API surface.

## Comment Style — Discursive and Deliberate

This is the single most distinctive convention in the codebase and must be preserved. Comments are not short annotations — they are **short essays that explain WHY, tell the story of a past bug, or justify a design decision that looks wrong at first glance.** A comment frequently:

1. States what used to happen (the bug/shortcut).
2. States the concrete, human consequence of that bug.
3. States what the code does now and why that fixes it.

Example (`tools/api.js`):
```js
/* De X-Forwarded-For se toma el ÚLTIMO elemento, nunca el primero.
   Esa cabecera se acumula por la izquierda: el primer valor es el
   que puso quien llama, de modo que bastaba con inventarse uno
   distinto en cada petición para anular TODOS los topes del sitio
   —contraseñas, altas de cuenta, códigos y el asistente, que cuesta
   dinero—. El último es el que añadió el proxy de casa. */
const origen = (req) => { ... }
```

Example (`tools/api.js`, body-reading buffer):
```js
/* Los trozos se guardan como Buffer y se unen AL FINAL.

   Antes se concatenaban a una cadena según llegaban, y eso
   convierte cada trozo a texto por separado: un carácter UTF-8 que
   caiga a caballo entre dos trozos se parte y se decodifica como
   dos signos de interrogación. ... */
```

Example (`tools/entorno.js`, justifying a fallback path):
```js
/* En el servidor, las variables que definen dónde vive la base y las
   fotos están en la unidad de systemd, no en ningún .env. Una
   herramienta lanzada a mano no las recibe, y como db.js cae a una
   ruta relativa por defecto, terminaba abriendo una base VACÍA en la
   carpeta del código: `admin.js listar` respondía "no hay cuentas"
   sobre un archivo que no era el del sitio. */
```

Test files use the same voice for *why a test exists*, not just what it asserts (`tools/probar-seguridad.js`):
```js
/* Lo que hacia el atacante: una IP inventada distinta en cada
   peticion. Antes estrenaba contador cada vez y no se limitaba
   nunca. Ahora se lee el ULTIMO elemento, que lo pone el proxy de
   casa, asi que todas caen en la misma cuenta. */
```

**Rules for new code:**
- When fixing a bug or closing a security hole, write the comment as a short narrative: what was wrong, what it let happen, what changed. Do not just describe the current line of code.
- Use comments to defend non-obvious decisions (e.g., "responds 404 not 403 so a non-admin doesn't even learn the route exists" — `tools/api.js` `conAdmin`).
- It is acceptable (expected) for a comment block to be longer than the code it documents.
- Section headers inside long files use a `/* ── Título ─────────── */` banner style to divide logical sections (seen throughout `tools/api.js`, `tools/db.js`).
- `TODO`/`FIXME`/`HACK`/`XXX` markers are **not used** as a task-tracking convention in this codebase — the string `TODO` that appears in a few comments is the Spanish word "all/every", not an English task marker. Do not introduce `// TODO:` style stub markers; if something is deliberately deferred, write a full prose comment explaining why (see `tools/check-motion.js`'s empty `ANIMADOS` array with its explanatory comment).

## Naming Patterns

**Files (`tools/`):**
- Verb-first, Spanish, kebab/plain-concatenated lowercase: `probar-seguridad.js`, `auditar-publico.js`, `verificar-taxonomia.js`, `check-links.js` (the few `check-*` files are the exception, in English, likely older).
- Manual test scripts are prefixed `probar-*.js` or `prueba-*.js`; audit/E2E scripts are prefixed `auditar-*.js`; a paired unit-test file uses `<módulo>.prueba.js` suffix (`tools/numero-a-letras.prueba.js` next to `tools/numero-a-letras.js`).

**Functions:**
- camelCase, Spanish verbs/nouns: `crearAnuncio`, `anotarEvento`, `leerCookies`, `cookieSesion`, `rncValido`.
- Short one-word helper predicates use plain adjectives: `correoValido`, `rncValido`.
- Higher-order route wrappers are prefixed `con`: `conSesion`, `conAdmin` (`tools/api.js`).

**Constants:**
- SCREAMING_SNAKE_CASE for fixed configuration/tables: `LIMITES`, `COOKIE`, `COOKIE_EQUIPO`, `METODOS`, `ITBIS`, `BASE`, `PAGINAS`.

**Variables:**
- camelCase Spanish nouns, often intentionally short and idiomatic to the domain: `testigo` (session token), `banco` (test DB dir), `bien`/`mal` (pass/fail counters in test harnesses).

**Database/domain naming:**
- snake_case for DB columns and SQLite-facing objects (`precio_minimo`, `usuario_id`, `es_admin`), camelCase for JS-side objects — the API layer explicitly renames at the boundary (see `contexto()` in `tools/api.js` building `{ id: s.usuario_id, esAdmin: !!s.es_admin }`).

## Code Style

**Formatting:**
- 2-space indentation, semicolons used consistently, single quotes for strings.
- No `.eslintrc*`, `.prettierrc*`, `eslint.config.*`, or `biome.json` found anywhere in the repository — **there is no automated linter or formatter configured.** Style consistency is maintained by convention/review only, not tooling. When adding code, match surrounding style exactly rather than relying on a formatter.
- `"type": "commonjs"` in `package.json:6` — use `require`/`module.exports`, not ESM `import`/`export`.

**Module pattern:**
- Every `tools/*.js` file opens with a `/** ... */` block comment naming the file and its one responsibility, e.g. `tools/api.js:1-10`, `tools/entorno.js:1-18`. New modules should do the same.
- Files export a plain object literal at the bottom or inline: `module.exports = { cargar, cargarUnidad, RUTA, UNIDAD };` (`tools/entorno.js`).
- No classes are used anywhere in `tools/`; the codebase is function + object literal based throughout.

## Error Handling

**HTTP layer (`tools/api.js`):**
- Errors returned as JSON: `{ error: 'texto' }` plus the appropriate HTTP status code — stated explicitly as a project convention in the file's header comment (`tools/api.js:1-10`).
- A shared `fallo(res, codigo, texto, extra)` helper standardizes error responses; `extra` optionally carries structured data the frontend can act on (e.g., which legal documents are missing) rather than making the client re-parse a message string.
- Errors thrown from body-parsing are custom `Error` objects annotated with a `codigo` property via `Object.assign(new Error(...), { codigo: 413 })`, then mapped to an HTTP status by the caller — not thrown as bare exceptions.
- Silent-catch is used deliberately where failure is expected and inconsequential, always with a comment explaining why: `try { crudo = fs.readFileSync(ruta, 'utf8'); } catch { return 0; // sin archivo, nada que hacer }` (`tools/entorno.js`).
- Rate limits (`LIMITES` in `tools/api.js`) are defined as named, commented constants — every limit has a comment justifying the chosen number in terms of real human behavior vs. abuse.

**Security-sensitive logic carries defensive comments,** not just code: e.g. `conAdmin` checks the DB on every request (not the cookie) specifically so that revoking admin takes effect immediately (`tools/api.js`).

## Money and Locale Handling

- Amounts are integers in Dominican pesos end-to-end (never floats/cents split), per the header convention comment in `tools/api.js`: "El dinero viaja en pesos enteros, igual que se guarda."
- Amount-to-words conversion for legal invoices lives in its own single-purpose module `tools/numero-a-letras.js`, deliberately not pulled from an npm package (see rationale comment in its test file).

## Test/Script Console Output Convention

Manual scripts (`probar-*`, `auditar-*`) print human-readable Spanish progress and a final tally, not structured logs:
```js
console.log(`\n${bien} bien, ${mal} mal\n`);
process.exit(mal ? 1 : 0);
```
New manual scripts should follow this same pass/fail-count-plus-exit-code pattern (see TESTING.md).

---

*Convention analysis: 2026-09-25*
