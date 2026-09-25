# Technology Stack

**Analysis Date:** 2026-09-25

## Languages

**Primary:**
- JavaScript (CommonJS, Node.js) - Entire server (`tools/*.js`) and all client-side scripts (`assets/*.js`). No TypeScript, no transpilation step, no bundler.
- HTML - One static `.html` file per page at repo root (`index.html`, `equipos.html`, `equipo.html`, `panel.html`, `admin.html`, `dealer.html`, `dealers.html`, `publicar.html`, `cuenta.html`, `mi-pagina.html`, `planes.html`, `financiamiento.html`, `alquiler.html`, `importar.html`, `transporte.html`, `contacto.html`, `categorias.html`, `legal.html`, `proximamente.html`).
- CSS - Single hand-written stylesheet `styles.css` (no preprocessor, no CSS-in-JS, no Tailwind at runtime).
- SQL - All schema and migrations in `db/schema.sql` and inline migration arrays in `tools/db.js`.

**Comments/identifiers:** The entire codebase (variable names, function names, comments, commit-facing docs) is written in Spanish. Domain vocabulary to expect: `anuncios` (listings), `usuarios` (users), `organizaciones` (dealers/companies), `sesion` (session), `correo` (email), `facturas` (invoices), `tareas` (scheduled jobs), `respaldo` (backup).

## Runtime

**Environment:**
- Node.js — production/deploy requirement is **Node ≥ 22.5** (`deploy/README.md` states this explicitly because `node:sqlite` requires it); `package-lock.json`'s pinned `puppeteer` toolchain further requires `node >=22.12.0`. The VPS install script (`deploy/README.md` step 1) installs **Node 24 LTS**. Local dev sandbox observed running Node v24.19.0.
- No `.nvmrc` or `engines` field in `package.json` — Node version is enforced only by documentation and by the hard runtime dependency on `node:sqlite`.

**Package Manager:**
- npm (`package-lock.json` present, lockfileVersion-based).
- Lockfile: present, and it locks only `devDependencies` (puppeteer's dependency tree). There is no runtime `dependencies` block in `package.json` at all.

## Frameworks

**Core:**
- None. There is no web framework (no Express/Fastify/Next/etc.). The HTTP server is hand-written directly on Node's built-in `http` module: `tools/serve.js`. Routing, static file serving, security headers, caching/ETag logic, and range-request video streaming are all implemented manually in that one file.
- No frontend framework (no React/Vue/etc.). Pages are static HTML with vanilla JS modules loaded via `<script src>` from `assets/`.

**Testing:**
- Node's built-in test runner (`node --test`), used at least for `tools/numero-a-letras.prueba.js` (invoked via `npm run facturas:letras`). No Jest/Mocha/Vitest.
- Most "tests" in this repo are manual/scripted verification tools run against a live dev server rather than unit test suites — see `tools/auditar-*.js`, `tools/probar-*.js`, `tools/prueba-chat.js` (details in TESTING.md if `quality` focus is mapped).

**Build/Dev:**
- No build step, no bundler, no transpiler. `npm start` runs `node tools/serve.js` directly; deploying is `git pull` + service restart (see `deploy/README.md`: "No hace falta `npm install`: el servidor y la API no usan dependencias").
- `puppeteer` (`^25.4.0`, devDependency only) drives `tools/screenshot.js`, `tools/check-motion.js`, and the various `tools/auditar-*.js` / `tools/probar-*.js` scripts for local QA and screenshotting. It is never installed or run in production.

## Key Dependencies

**Critical (runtime): NONE.**
This is a deliberate, explicitly-documented architectural policy — the project ships with **zero npm runtime dependencies**. Evidence:
- `package.json` has no `dependencies` field, only `devDependencies: { puppeteer }`.
- `tools/pdf.js` (PDF invoice generator) header: "POR QUÉ NO pdfkit ... El proyecto entero corre sin una sola dependencia en producción... pdfkit son unos 30 paquetes para lo que aquí hace falta."
- `tools/chat.js` header: calls the Anthropic API with Node's native `https` module instead of the official SDK, explicitly to avoid adding a runtime dependency.
- `tools/correo.js` calls the Brevo transactional email API the same way, via native `https`.
- `deploy/README.md`: "No hace falta `npm install`: el servidor y la API no usan dependencias."

**When adding new server-side functionality, the default expectation is to implement it with Node built-ins (`http`, `https`, `crypto`, `fs`, `node:sqlite`, `node:test`) rather than reaching for an npm package.** Any new runtime dependency would be a significant deviation from established project policy and should be treated as a deliberate, justified exception.

**Infrastructure (dev-only):**
- `puppeteer` `^25.4.0` - headless Chrome automation for screenshots and scripted UI audits (`tools/screenshot.js`, `tools/check-motion.js`, `tools/auditar-*.js`, `tools/probar-*.js`, `tools/prueba-chat.js`, `tools/probar-pagina-dealer.js`). Never required in production.

## Configuration

**Environment:**
- Loaded by hand-rolled `tools/entorno.js` (no `dotenv` package). It parses `.env` (gitignored, dev only) into `process.env`, with the rule that pre-existing `process.env` values always win over the file.
- In production (VPS), env vars are **not** read from a `.env` file. Non-secret config lives in `deploy/mercamaquinarias.service` (systemd `Environment=` lines); secrets live in `/etc/mercamaquinarias.env` (permissions 600), referenced via `EnvironmentFile=`. `tools/entorno.js` also parses the systemd unit file directly (`cargarUnidad()`) so that CLI tools run by hand on the server see the same config the service does.
- `.env.example` is the canonical reference of every env var and what it does (in Spanish comments) — **never contains real secret values**, only variable names and explanations.
- Key env vars (names only): `MERCA_SECRETO` (session signing), `ANTHROPIC_API_KEY`, `MERCA_CHAT_MODELO`, `MERCA_CORREO` (`archivo`|`brevo`), `BREVO_API_KEY`, `MERCA_REMITENTE`, `MERCA_GENERAL`, `MERCA_SOPORTE`, `MERCA_VENTAS`, `MERCA_REVISION`, `MERCA_ANUNCIOS`, `MERCA_FACTURACION`, `MERCA_PUBLICIDAD`, `MERCA_LEGAL`, `MERCA_GERENCIA`, `MERCA_RAZON_SOCIAL`, `MERCA_RNC`, `MERCA_DOMICILIO_FISCAL`, `MERCA_REGISTRO_MERCANTIL`, `MERCA_SITIO`, `MERCA_DIAS_AVISO`, `MERCA_HTTPS`, `MERCA_DB`, `PORT`, `MERCA_PROMO_HASTA`, `MERCA_RESPALDOS`, `MERCA_RESPALDOS_MAX`, `MERCA_FOTOS`, `MERCA_VIDEOS`, `MERCA_FACTURAS`, `MERCA_AVISO_NCF`, `MERCA_HOST`, `MERCA_ENV` (override path to `.env`), `NODE_ENV`.

**Build:**
- No `tsconfig.json`, no bundler config, no `.babelrc`, no `webpack`/`vite`/`esbuild` config exists in this repo.
- `vercel.json` is **not** the production deployment target. It is a leftover from the pre-launch placeholder — see INTEGRATIONS.md and `deploy/VERCEL.md`.

## Platform Requirements

**Development:**
- Node ≥ 22.5 (practically, use the same major as production: Node 24).
- No database server to install — SQLite file is created automatically at `db/mercamaquinarias.db` on first run via `node:sqlite`'s `DatabaseSync`.
- `npm install` only needed for `puppeteer` (dev tooling); the site itself runs with zero installed packages.
- Local server: `npm start` → `node tools/serve.js --port 8080` (serves `http://127.0.0.1:8080`).

**Production:**
- Target: a single Ubuntu 24.04 VPS (documented in `deploy/README.md`), not a PaaS/serverless platform.
- Node process runs under systemd (`deploy/mercamaquinarias.service`), listening only on `127.0.0.1:8080`.
- Nginx (`deploy/nginx.conf`, `deploy/nginx-dominio-viejo.conf`) reverse-proxies ports 80/443 to the Node process and terminates TLS (Let's Encrypt via certbot).
- SQLite database file lives outside the repo in production (`/var/lib/mercamaquinarias/mercamaquinarias.db`) so `git pull` never touches it; likewise photos/videos/invoices live under `/var/lib/mercamaquinarias/{fotos,videos,facturas}`.
- Deployment is push-to-deploy: merging to `main` triggers `.github/workflows/desplegar.yml`, which SSHes in as a restricted `deploy` user and runs the single allowed command `/usr/local/bin/desplegar-mercamaquinarias` (`deploy/desplegar-mercamaquinarias`), which does `git fetch` + `git merge --ff-only`, restarts the systemd service, health-checks it, and auto-rolls-back on failure.
- Production is the VPS, fronted by Cloudflare (verified live 2026-09-25). The old Vercel placeholder project that routed everything to `proximamente.html` is no longer in the serving path; `vercel.json` and `proximamente.html` remain in the repo only as leftovers to delete — see `deploy/VERCEL.md`.
- Scheduled jobs run via systemd timers, not cron: `deploy/mercamaquinarias-tareas.timer` (daily maintenance at 05:00 — expire listings, send warnings, purge, backup), `deploy/mercamaquinarias-informe-semanal.timer` / `mercamaquinarias-informe-mensual.timer` (business reports to management).

---

*Stack analysis: 2026-09-25*
