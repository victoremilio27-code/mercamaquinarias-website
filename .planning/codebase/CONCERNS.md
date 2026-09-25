# Codebase Concerns

**Analysis Date:** 2026-09-25

**Context:** This site is live in production behind Cloudflare. A large security/correctness audit was completed and deployed just before this analysis. The following are already FIXED and are intentionally NOT listed below: the X-Forwarded-For rate-limit bypass (`tools/api.js` `origen()` now takes the last hop), `precio_minimo` leaking on the public anuncio route, missing `PRAGMA busy_timeout`, non-transactional migrations, `leerCuerpo` multibyte UTF-8 corruption, NCF emitted from expired sequences, silent B04 exhaustion, and the per-process visitor salt. Transporte and financiamiento being switched off in `assets/servicios.js` is a deliberate feature flag, not dead code, and is not listed as debt.

## Tech Debt

**Session and device tokens stored in cleartext:**
- Issue: `db/schema.sql` defines `sesiones.testigo` and `dispositivos.testigo` as the bare 32-byte random hex token, and both are looked up with a direct equality match (`tools/db.js:1069-1078` `sesion()`, and the `dispositivos` table). Anyone who can read the SQLite file (`db/mercamaquinarias.db`) — a backup, a leaked snapshot, a misconfigured restore — gets live, reusable session cookies with no extra step. This is inconsistent with the rest of the codebase: `codigos.codigo_hash` (`db/schema.sql:415-425`) deliberately stores an HMAC instead of the raw code, with a comment explaining why ("Quien lea la base no puede entrar con lo que ve").
- Files: `db/schema.sql` (`sesiones`, `dispositivos` tables), `tools/db.js:1060-1081` (`abrirSesion`, `sesion`, `cerrarSesion`).
- Impact: DB read access (backup leak, misconfigured `respaldo`, SSRF into the file, etc.) is equivalent to session hijacking for every logged-in user for up to 30 days (60 for the device cookie).
- Fix approach: Store `crypto.createHash('sha256').update(testigo)` (or an HMAC with the existing `MERCA_SECRETO`) in the `testigo` column instead of the raw value, and look sessions up by the hash. Mirrors the pattern already used for `codigos.codigo_hash`.

**Synchronous scrypt blocks the single Node thread:**
- Issue: `cifrarClave` and `claveCorrecta` (`tools/db.js:895-907`) call `crypto.scryptSync(clave, sal, 64)` directly on the request-handling thread. The server is a single Node process (no `cluster`/`worker_threads` found anywhere under `tools/`) using `node:sqlite`'s `DatabaseSync` (`tools/db.js:12`), which is also synchronous. Every login, registration, and password-change request therefore blocks ALL other requests — catalog browsing, chat, webhook-style callbacks — for the duration of the scrypt computation.
- Files: `tools/db.js:893-907` (`cifrarClave`, `claveCorrecta`), `tools/api.js:375-416` (`entrar`).
- Impact: Under concurrent traffic, a burst of login attempts (legitimate or a slow brute-force that stays under the per-IP rate limit) causes visible latency spikes site-wide, not just for the caller. This gets worse, not better, as traffic grows.
- Fix approach: Move to `crypto.scrypt` (async) with a `promisify` wrapper, or offload to a `worker_threads` pool. Because `DatabaseSync` is also synchronous, this is a partial fix — the deeper fix is accepting that a single Node process on synchronous SQLite has a hard concurrency ceiling and planning a worker-thread pool or a move to an async SQLite driver before traffic outgrows it.

**No `engines` pin for a Node-core-only stack:**
- Issue: `package.json` declares no `engines.node`, yet `tools/db.js:12` depends on `node:sqlite`'s `DatabaseSync`, a relatively recent, still-evolving core API. The project's whole pitch (per comments in `tools/chat.js` and `tools/fotos.js`) is "zero runtime dependencies, `git pull` to deploy" — but that means there is no `package-lock.json`-style guardrail against running on an incompatible Node version on a fresh VPS provisioning.
- Files: `package.json`, `tools/db.js:12`.
- Impact: A new VPS, a Node upgrade/downgrade, or a CI runner with a different default Node version can fail to boot the whole site with a cryptic "DatabaseSync is not a constructor" style error, or silently change SQLite behavior across a Node minor version bump.
- Fix approach: Add `"engines": { "node": ">=22.x" }` (whatever version was validated) to `package.json`, and document the required Node version in `deploy/README.md`.

**Stray, unrelated files committed at the repository root:**
- Issue: `git ls-files` shows `CLAUDE (1).md`, `WhatsApp Image 2026-08-05 at 6.41.25 PM (1).jpeg`, and a malformed filename `.panel:` (stored with a private-use Unicode codepoint standing in for `:`, likely from a Windows path/redirection accident) are tracked in version control at the project root, alongside the real site files.
- Files: `CLAUDE (1).md`, `WhatsApp Image 2026-08-05 at 6.41.25 PM (1).jpeg`, `.panel:` (repo root).
- Impact: Cosmetic/hygiene only, but clutters the root of a production repo and the odd filename can break tooling (`git`, some shells, some CI file-globbing) that doesn't expect non-ASCII bytes in a filename.
- Fix approach: `git rm` the stray files (confirm they aren't referenced anywhere first) or move `CLAUDE (1).md` into a docs folder with a normal name.

**Half-built theming system: ~40 hardcoded colors don't respond to dark mode:**
- Issue: `styles.css` defines a proper theme-token layer (`--app-bg`, `--app-card`, `--app-text`, etc., set per `:root[data-theme="light"]` / `:root[data-theme="dark"]` at `styles.css:4098-4151`), but most of the ~4,000 lines of component styles above that block were written against the old fixed palette (`--azul`, `--hueso`, `--gris-acero`, ...) or raw hex literals, not the `--app-*` tokens. Concretely, dozens of rules hardcode hex colors directly: `styles.css:163` (`color: #D5DEE5`), `:280` (`border-color: #C9C6BC`), `:527-534` (upload dropzone), `:602` (placeholder color), `:1860-1999` (error/validation states, `#B3261E` repeated ~8 times), `:2472` / `:2515` / `:2590` / `:2610` (table rows, hover states). None of these repaint when `data-theme` toggles.
- Files: `styles.css` (throughout; theme tokens defined at `styles.css:4098-4151`, hardcoded outliers scattered from `styles.css:163` through at least `:2610`), `assets/tema.js` (the toggle itself, which works correctly — it's the CSS coverage that's incomplete).
- Impact: Toggling dark mode leaves visible light-mode fragments — error borders, table hovers, dropzone backgrounds, placeholder text — that read as a bug (wrong contrast, sometimes illegible text) rather than a design choice.
- Fix approach: Audit `styles.css` for any hex literal or use of the pre-theme variables (`--azul`, `--hueso`, `--gris-neutro`, `--gris-acero`, `--linea`, `--linea-suave`) outside the `:root[data-theme=...]` blocks themselves, and replace with the matching `--app-*` token (or add a new token if the color has no themed equivalent yet).

## Known Bugs

Not applicable — no reproducible open bugs were identified beyond the items already listed under Tech Debt/Security that manifest as behavioral gaps rather than crashes.

## Security Considerations

**User enumeration via login timing:**
- Risk: `entrar` (`tools/api.js:375-390`) returns the identical "Correo o contraseña incorrectos" message for both a nonexistent account and a wrong password — the message itself does not leak anything. However, the code path differs in cost: `db.claveCorrecta` (which runs a full `scryptSync`, deliberately slow) is only invoked when `db.usuarioPorCorreo(c.correo)` finds a user (`!u || !db.claveCorrecta(...)` short-circuits on `!u`). A request for a registered email measurably takes longer (one scrypt computation, tens of milliseconds) than a request for an unregistered one, which is a classic timing side channel for enumerating which emails have accounts.
- Files: `tools/api.js:375-390` (`entrar`), `tools/db.js:895-907` (`cifrarClave`, `claveCorrecta`).
- Current mitigation: The rate limiter (`db.permitir('acceso:${ip}', ...)`, `LIMITES.acceso`) slows down bulk probing from a single IP, and the response body/status are already identical for both cases.
- Recommendations: When `u` is missing, run a dummy `crypto.scryptSync` call (or `claveCorrecta` against a fixed dummy hash/salt) before returning the 401, so the response time is statistically indistinguishable regardless of whether the email exists.

**No admin UI for `/api/admin/solicitudes-servicio`:**
- Risk: This is primarily an operational gap rather than a vulnerability, but it is worth tracking as a concern: `listarSolicitudesServicio` / `marcarSolicitudServicio` (`tools/api.js:2619-2620`, backed by `tools/db.js:1353` `solicitudesServicio`) are fully implemented and reachable by any `es_admin` session, yet neither `admin.html` nor `assets/admin.js` render any list, table, or action for them, and `tools/admin.js` (the CLI) has commands for `solicitudes_dealer` but none for `solicitudes_servicio`. Alquiler, transporte, importación, and contact-form submissions are captured (per `db/schema.sql:257-287`, replacing the old "copy this to WhatsApp" flow) but staff currently have no way to see or act on them short of a raw `curl` against the admin API with a valid session cookie, or a manual SQLite query.
- Files: `tools/api.js:2619-2620`, `tools/db.js:1353` (`solicitudesServicio`), `admin.html`, `assets/admin.js`, `tools/admin.js`.
- Current mitigation: None — the data is safely stored and access-controlled (`conAdmin`), it simply has no consumer-facing surface yet.
- Recommendations: Add a "Solicitudes de servicio" tab to `admin.html` wired through `assets/admin.js`, mirroring the existing `solicitudes_dealer` review screen, so alquiler/transporte/importación leads don't silently pile up unseen.

## Performance Bottlenecks

**Synchronous SQLite (`DatabaseSync`) + synchronous scrypt share one thread:**
- Problem: See the Tech Debt entry above. `tools/db.js:12` uses `node:sqlite`'s `DatabaseSync`, and every query anywhere in `tools/db.js` (3,353 lines, the sole place all SQL lives per its own header comment) executes synchronously on the event loop. Combined with synchronous `scryptSync` on login/register, the process has no ability to interleave a slow request with fast ones.
- Files: `tools/db.js` (entire file — `DatabaseSync` at line 12), `tools/api.js:375-416`.
- Cause: Deliberate simplicity trade-off (no native `better-sqlite3` build step, "sin dependencias" philosophy) that was fine at low traffic but doesn't parallelize.
- Improvement path: Acceptable for current traffic; revisit before a marketing push or paid-ad campaign that could spike concurrent logins. A worker-thread pool for `scryptSync` is the cheapest first step; moving off `DatabaseSync` is a bigger, later change.

## Fragile Areas

**`tools/db.js` and `tools/api.js` are large, single-file modules:**
- Files: `tools/db.js` (3,353 lines — "Aquí vive TODO el SQL del proyecto" per its own header), `tools/api.js` (2,677 lines — the entire HTTP router and all handlers).
- Why fragile: Every domain (auth, anuncios, planes, pagos, facturas, publicidad, métricas, admin) lives in the same two files. There's no folder-level boundary stopping an unrelated change (e.g., editing the `publicidad` handlers) from touching code near session or payment logic in a merge conflict, and a single syntax error anywhere in either file takes down the entire API surface, not just one feature.
- Safe modification: Grep for the specific Spanish-named function (e.g., `function listarSolicitudesServicio`) before editing rather than scrolling; the files are internally well-commented and organized by `── section ──` banners, which makes navigation tractable but doesn't reduce blast radius.
- Test coverage: Covered by the custom `tools/auditar-*.js` and `tools/probar-*.js` scripts (run via `npm run auditar`, `npm run seguridad:probar`, etc.), not a conventional test framework — see Test Coverage Gaps below.

## Scaling Limits

**Single VPS process, local-disk file storage, single SQLite file:**
- Current capacity: Photos and videos are written to local disk under `.tmp/fotos` / `.tmp/videos` (configurable via `MERCA_FOTOS`/equivalent env vars, per `tools/fotos.js` header) and the entire dataset lives in one SQLite file (`db/mercamaquinarias.db`). Invoices land in `.tmp/facturas`. There is a `respaldo` (backup) task (`npm run respaldo`, `tools/tareas.js`) but no evidence of off-box replication, a CDN, or object storage.
- Limit: This ties uptime and durability to a single VPS disk. It also means horizontal scaling (a second app server) is not possible without first moving media to shared/object storage and the database off `DatabaseSync`-on-local-file.
- Scaling path: Fine for current single-VPS traffic. Before adding a second app server or region, move `fotos`/`videos`/`facturas` to object storage (S3-compatible) and evaluate a networked database (PostgreSQL — the schema comments in `db/schema.sql` explicitly call out that types were chosen to be Postgres-compatible for exactly this future move).

## Dependencies at Risk

**`node:sqlite` (`DatabaseSync`) is a young core API:**
- Risk: Unlike a versioned npm dependency, a Node core module's behavior can shift between Node versions with no `package-lock.json` protection and no deprecation warning surfaced through the project's own tooling.
- Impact: A Node upgrade on the VPS (security patch, base image bump) could change SQLite pragma defaults, error shapes, or API surface underneath the entire `tools/db.js` module without any local signal until something breaks in production.
- Migration plan: Pin and document the validated Node version (see `engines` recommendation above); re-run `npm run auditar` and `npm run db:demo` after any Node upgrade before deploying.

## Missing Critical Features

**No front-end for service-request triage:** See "No admin UI for `/api/admin/solicitudes-servicio`" above — this is a workflow gap, not just a security note. Alquiler/transporte/importación/contact leads are captured but not visibly actionable by staff.

## Test Coverage Gaps

**No conventional test runner; nothing gates deploys:**
- What's not tested: There is no `*.test.js`/`*.spec.js` suite beyond `tools/numero-a-letras.prueba.js` (run via `node --test`). Everything else — `tools/auditar-flujos.js`, `tools/auditar-permisos.js`, `tools/auditar-publico.js`, `tools/probar-seguridad.js`, `tools/probar-correo.js`, `tools/probar-facturas.js`, `tools/probar-pagina-dealer.js`, `tools/prueba-chat.js` — are hand-rolled Node scripts invoked via `npm run auditar`/`seguridad:probar`/etc. Confirmed in `.github/workflows/desplegar.yml`: the only workflow triggers on every push to `main` and its single step SSHes into the VPS and runs the deploy script directly (`sudo -n /usr/local/bin/desplegar-mercamaquinarias`) — it does not run `npm run auditar`, `node --test`, or any of the `probar-*` scripts before deploying.
- Files: `.github/workflows/desplegar.yml`, `tools/probar-seguridad.js` (597 lines — closest thing to a security regression suite; covers metric-event dedup, buzón addresses, and permission checks, but not the timing-based enumeration issue above), `tools/auditar-permisos.js`.
- Risk: A merge to `main` deploys straight to production with zero automated test/audit gate. These scripts only catch regressions when a developer remembers to run them locally before merging. A regression in, say, session-cookie flags, rate-limit keys, or NCF sequencing could ship silently and be live immediately.
- Priority: High — add a step (or a separate job gating the deploy job) to `.github/workflows/desplegar.yml` that runs `npm run auditar` and the relevant `probar-*` scripts, and fails before the SSH deploy step on non-zero exit, since the scripts already exist and just aren't gating anything automatically.

---

*Concerns audit: 2026-09-25*
