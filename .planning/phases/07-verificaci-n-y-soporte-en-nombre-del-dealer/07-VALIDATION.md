---
phase: 7
slug: verificaci-n-y-soporte-en-nombre-del-dealer
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-25
---

# Phase 7 — Validation Strategy

> Contrato de validación de la fase: qué se comprueba tras cada tarea y antes de cerrar.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Arnés propio de Node (contadores + `process.exit`), `node:test`, puppeteer |
| **Config file** | none — scripts de `package.json` |
| **Quick run command** | `npm run bitacora:probar && npm run dealer:probar && npm run seguridad:probar` |
| **Full suite command** | quick + `npm run facturas:probar && npm run pagos:probar && npm run chat:probar && npm run facturas:letras && npm run taxonomia && npm run check:encoding`, y con el servidor de demo en 8080: `npm run auditar && npm run check` |
| **Estimated runtime** | ~10 s (quick), ~3 min (full con auditorías) |

---

## Sampling Rate

- **After every task commit:** quick run
- **After every plan wave:** full suite sin auditorías de navegador
- **Before verify:** full suite en verde
- **Max feedback latency:** 15 s

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | ADMIN-02 | T-07-01 | directorio y sello solo para admin; 404 al resto | integración | `npm run bitacora:probar` | ✅ | ⬜ pending |
| 07-01-02 | 01 | 1 | ADMIN-02 | T-07-02 | retirar sin motivo = 400 sin fila | integración | `npm run bitacora:probar` | ✅ | ⬜ pending |
| 07-02-01 | 02 | 1 | ADMIN-03 | T-07-03 | resultado de serie por la bitácora | integración | `npm run bitacora:probar` | ✅ | ⬜ pending |
| 07-02-02 | 02 | 1 | CONF-01 | T-07-04 | la ficha no filtra la serie | integración | `npm run seguridad:probar` | ✅ | ⬜ pending |
| 07-03-01 | 03 | 1 | ADMIN-04 | T-07-05 | edición en nombre con fila `pagina.editar` | integración | `npm run dealer:probar` | ✅ | ⬜ pending |
| 07-03-02 | 03 | 1 | ADMIN-04 | T-07-06 | sin publicar/despublicar de admin | integración | `npm run dealer:probar` | ✅ | ⬜ pending |
| 07-04-01 | 04 | 2 | ADMIN-02, ADMIN-03 | — | consola sin `style=` ni colores literales | estático | `node --check assets/admin.js && npm run check:encoding` | ✅ | ⬜ pending |
| 07-05-01 | 05 | 2 | ADMIN-04 | — | modo soporte no publica | estático | `node --check assets/mi-pagina.js` | ✅ | ⬜ pending |
| 07-06-01 | 06 | 2 | ADMIN-03, CONF-01 | T-07-04 | ficha y panel con el resultado | estático | `node --check assets/app.js assets/panel.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Secciones «Empresas» y «Números de serie» en claro y oscuro | ADMIN-02, ADMIN-03 | El comprobador de contraste no entra con sesión | Entrar como admin en `admin.html`, alternar tema |
| Editor en modo soporte | ADMIN-04 | Idem | Desde «Empresas» → «Editar su página» |
| Ficha con «Número de serie cotejado» | ADMIN-03 | Idem visual | Marcar conforme una serie y abrir la ficha |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-09-25
