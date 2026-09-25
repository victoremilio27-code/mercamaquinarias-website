---
phase: 6
slug: cardnet-construido-probado-y-apagado
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-25
---

# Phase 6 — Validation Strategy

> Contrato de validación de la fase: qué comprueba cada tarea y con qué orden.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Arnés propio con contadores y `process.exit` (`tools/probar-cardnet.js`, nuevo en 06-01), como `probar-pagos.js`; auditorías de navegador existentes (puppeteer) con CardNet apagado |
| **Config file** | ninguno — `package.json` script `cardnet:probar`; paso «CardNet» del job `pruebas` |
| **Quick run command** | `npm run cardnet:probar` |
| **Full suite command** | `npm run check:encoding && npm run taxonomia && npm run facturas:letras && npm run seguridad:probar && npm run dealer:probar && npm run bitacora:probar && npm run facturas:probar && npm run pagos:probar && npm run transferencia:probar && npm run cardnet:probar && npm run chat:probar`, y con el sitio arrancado sobre la semilla `npm run auditar && npm run check` |
| **Estimated runtime** | ~20 segundos la rápida (sin red); ~3 minutos la completa con navegador |

---

## Sampling Rate

- **After every task commit:** `npm run cardnet:probar` más la prueba de la fase que toque el archivo (`pagos:probar`, `transferencia:probar`, `facturas:probar`).
- **After every plan wave:** la batería del job `pruebas` completa.
- **Before `/gsd:verify-work`:** batería completa y auditorías con navegador en verde.
- **Max feedback latency:** 30 segundos.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | PAGO-06, PAGO-08 | T-06-01, T-06-04 | apagado por defecto; `aCentavos(2000) = 200000` | unidad (arnés) | `npm run cardnet:probar` | ❌ W0 (lo crea la tarea) | ⬜ pending |
| 06-01-02 | 01 | 1 | PAGO-04 | T-06-06 | red caída = pendiente; Basic con llave privada | unidad con doble | `npm run cardnet:probar` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | PAGO-05 | T-06-03 | ningún campo de tarjeta en el código | barrido de fuente | `npm run cardnet:probar` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | PAGO-07 | T-06-08, T-06-09, T-06-10 | eventos de solo añadir; referencia única en cardnet | base desechable | `npm run cardnet:probar && npm run pagos:probar` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 2 | PAGO-05 | T-06-07, T-06-11 | tarjetas sin token hacia fuera; filtro por organización | base desechable | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-03-01 | 03 | 3 | PAGO-04, PAGO-07, PAGO-08 | T-06-15, T-06-16 | solo aprobado explícito; rechazo sin NCF; selector apagado = fase 5 | integración con doble | `npm run cardnet:probar && npm run pagos:probar && npm run transferencia:probar` | ✅ | ⬜ pending |
| 06-03-02 | 03 | 3 | PAGO-05, PAGO-07 | T-06-12, T-06-13, T-06-14 | token del Customer, no del navegador; doble clic = un cobro | integración con doble | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-04-01 | 04 | 4 | PAGO-04, PAGO-05 | T-06-20, T-06-21 | 202 con captura sin NCF; cuerpo solo `metodoPago` | API con req/res falsos | `npm run cardnet:probar && npm run seguridad:probar` | ✅ | ⬜ pending |
| 06-04-02 | 04 | 4 | PAGO-07 | T-06-17, T-06-18, T-06-19, T-06-23 | Basic + timingSafeEqual; aviso doble = un NCF; sin 429 | API con req/res falsos | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-04-03 | 04 | 4 | PAGO-08 | T-06-22 | CSP apagada idéntica; `frame-src` solo encendido | unidad + auditoría | `npm run cardnet:probar` y `npm run auditar:permisos` con el sitio arrancado | ✅ | ⬜ pending |
| 06-05-01 | 05 | 5 | PAGO-07 | T-06-24, T-06-26 | aviso perdido recuperado una vez | integración con doble | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-05-02 | 05 | 5 | PAGO-08 | T-06-25 | informe apagado idéntico; descuadre visible | unidad | `npm run cardnet:probar && node tools/tareas.js reconciliar --seco` | ✅ | ⬜ pending |
| 06-06-01 | 06 | 5 | PAGO-05 | T-06-28, T-06-29, T-06-30 | iframe de CardNet; origen exacto; sin campos de tarjeta | estático + barrera | `node --check assets/cardnet.js && npm run check:contraste && npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-06-02 | 06 | 5 | PAGO-04, PAGO-08 | T-06-31 | apagado = fase 5 | estático + auditoría | `node --check assets/planes.js` y `npm run auditar:flujos` con el sitio arrancado | ✅ | ⬜ pending |
| 06-06-03 | 06 | 5 | PAGO-04 | T-06-30 | tarjetas sin token; una sola confirmación | estático + auditoría | `node --check assets/panel.js && npm run check:contraste` y `npm run auditar` | ✅ | ⬜ pending |
| 06-07-01 | 07 | 6 | PAGO-04, PAGO-07 | T-06-33, T-06-34, T-06-36 | sin casilla no se cobra; renovar dos veces = un pago | integración con doble | `npm run cardnet:probar && npm run pagos:probar` | ✅ | ⬜ pending |
| 06-07-02 | 07 | 6 | PAGO-08 | T-06-35, T-06-37 | tres intentos máximo; correos sin token ni teléfono | integración (correo en archivo) | `npm run cardnet:probar && npm run correo:probar` | ✅ | ⬜ pending |
| 06-07-03 | 07 | 6 | PAGO-04 | T-06-33 | casilla desmarcada por defecto | estático + auditoría | `node --check assets/planes.js assets/panel.js && npm run check:contraste` | ✅ | ⬜ pending |
| 06-08-01 | 08 | 7 | PAGO-04 a PAGO-08 | todos | los cinco criterios de extremo a extremo | extremo a extremo con doble | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-08-02 | 08 | 7 | PAGO-08 | T-06-38, T-06-39 | README sin valores; batería completa verde | batería | full suite command | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tools/probar-cardnet.js` — lo crea la tarea 06-01-01 en rojo antes del código (arnés, doble de transporte que lanza por defecto, base desechable `.tmp/prueba-cardnet/`, entorno antes del `require` de `tools/db.js`, `MERCA_ENV` a un archivo inexistente).
- [ ] Script `cardnet:probar` en `package.json` y paso «CardNet» en `.github/workflows/desplegar.yml` (06-01-03).

El resto de la infraestructura (arnés de pagos y de transferencia, auditorías con navegador, comprobador de contraste) ya existe.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| El iframe real de CardNet carga, captura una tarjeta de prueba y avisa del fin | PAGO-04, PAGO-05 | Necesita las credenciales de QA de CardNet, que aún no existen; el formato de la señal de fin está [POR CONFIRMAR EN LAB] | `deploy/README.md`, sección CardNet, punto 6 |
| Compra aprobada y rechazada contra el ambiente de certificación | PAGO-04, PAGO-07 | Idem | Idem; comprobar NCF emitido solo en la aprobada |
| La notificación real llega al VPS y se autentica | PAGO-07 | CardNet tiene que registrar la URL | Idem; ver la fila en `pagos_eventos` |
| El modal y el selector se ven bien en claro y oscuro con el iframe dentro | PAGO-04 | El iframe no carga sin credenciales | Idem, en los dos temas y a 360 px |

Ninguna bloquea el cierre de la fase: la condición de la fase es «construido, probado y apagado»; la certificación es trabajo del día de la afiliación.

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
