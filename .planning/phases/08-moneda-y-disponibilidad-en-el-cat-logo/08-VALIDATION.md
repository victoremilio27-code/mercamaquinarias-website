---
phase: 8
slug: moneda-y-disponibilidad-en-el-cat-logo
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-25
---

# Phase 8 — Validation Strategy

> Contrato de validación de la fase: qué se prueba, con qué y cuándo.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Arnés propio con contadores y `process.exit` (base/API) + puppeteer (navegador). Sin framework nuevo. |
| **Config file** | none — cada `tools/probar-*.js` fija `MERCA_DB` antes de `require('./db.js')` |
| **Quick run command** | `npm run catalogo:probar` |
| **Full suite command** | `npm run catalogo:probar && npm run seguridad:probar && npm run dealer:probar && npm run bitacora:probar && npm run facturas:probar && npm run pagos:probar && npm run chat:probar && npm run facturas:letras && npm run taxonomia && npm run check:encoding`, y con el servidor sembrado (`npm run db:demo`, `npm start`): `npm run auditar && npm run check && npm run check:motion` |
| **Estimated runtime** | ~2 s la rápida; ~2-3 min la completa con navegador |

---

## Sampling Rate

- **After every task commit:** `npm run catalogo:probar` (desde que existe, plan 08-01)
- **After every plan wave:** suite completa sin navegador
- **Before verificación de fase:** suite completa con navegador en verde
- **Max feedback latency:** 5 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | CAT-01 | T-08-01 | La tasa nunca se interpola en el SQL: va como parámetro | integración | `npm run catalogo:probar` | ❌ W0 (lo crea la tarea 2) | ⬜ pending |
| 08-01-02 | 01 | 1 | CAT-01 | T-08-02 | Solo admin cambia la tasa; rango 20-200 | integración | `npm run catalogo:probar && npm run bitacora:probar` | ✅ tras la tarea | ⬜ pending |
| 08-01-03 | 01 | 1 | CAT-01 | — | N/A | integración + navegador | `npm run catalogo:probar` | ✅ | ⬜ pending |
| 08-02-01 | 02 | 2 | CAT-02 | T-08-03 | Solo el dueño cambia la disponibilidad (404 al ajeno); lista blanca de valores | integración | `npm run catalogo:probar && npm run seguridad:probar` | ✅ | ⬜ pending |
| 08-02-02 | 02 | 2 | CAT-02 | T-08-04 | Texto escapado con `esc()` | navegador | `npm run auditar` | ✅ | ⬜ pending |
| 08-03-01 | 03 | 3 | CAT-03 | T-08-05 | Parámetros desconocidos ignorados | integración | `npm run catalogo:probar` | ✅ | ⬜ pending |
| 08-03-02 | 03 | 3 | CAT-02, CAT-03 | — | N/A | navegador | `npm run auditar` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tools/probar-catalogo.js` — lo crea el plan 08-01 (tarea 2) antes de que nada dependa de él; los planes 02 y 03 lo amplían.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Los filtros nuevos se leen bien en móvil y en tema oscuro | CAT-02, CAT-03 | Juicio visual | Abrir equipos.html a 390 px, abrir «Filtros», alternar tema; comprobar que «Condiciones» no se corta |
| La tasa por defecto (63) es la que Victor quiere | CAT-01 | Dato de negocio | En /admin.html, «Tasa de referencia del dólar»: fijar la tasa del BCRD del día |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 5s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-25 (por delegación)
