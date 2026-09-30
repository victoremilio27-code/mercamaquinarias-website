---
phase: 6
slug: cardnet-construido-probado-y-apagado
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| **Full suite command** | `npm run check:encoding && npm run taxonomia && npm run facturas:letras && npm run precios:probar && npm run seguridad:probar && npm run dealer:probar && npm run bitacora:probar && npm run contactos:probar && npm run catalogo:probar && npm run facturas:probar && npm run pagos:probar && npm run metricas:probar && npm run transferencia:probar && npm run publicacion:probar && npm run renovacion:probar && npm run recordatorios:probar && npm run capacidad:probar && npm run cardnet:probar && npm run chat:probar`, y con el sitio arrancado sobre la semilla `npm run auditar && npm run check` |
| **Estimated runtime** | ~20 segundos la rápida (sin red); ~3 minutos la completa con navegador |

---

## Sampling Rate

- **After every task commit:** `npm run cardnet:probar` más la prueba de la fase que toque el archivo (`pagos:probar`, `transferencia:probar`, `facturas:probar`).
- **After every plan wave:** la batería del job `pruebas` completa.
- **Before `/gsd:verify-work`:** batería completa y auditorías con navegador en verde.
- **Max feedback latency:** 30 segundos.

---

## Per-Task Verification Map

*Replanificado el 2026-09-30 contra el modelo comercial (06-CONTEXT, revisión R-01 a R-08). El 06-01 ya está hecho.*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01..03 | 01 | — | PAGO-04, 05, 06, 08 | T-06-01..06 | apagado por defecto; `aCentavos(2000) = 200000`; barrera PCI | arnés | `npm run cardnet:probar` | ✅ | ✅ green |
| 06-02-01 | 02 | 1 | PAGO-07 | T-06-08, 09, 10 | eventos de solo añadir; referencia única en cardnet; sin columnas de la 05.3 repetidas | base desechable | `npm run cardnet:probar && npm run renovacion:probar` | ✅ | ⬜ pending |
| 06-02-02 | 02 | 1 | PAGO-05 | T-06-07, 11, 12 | tarjetas sin token; filtro por organización; `intencionAplicable` | base desechable | `npm run cardnet:probar && npm run capacidad:probar` | ✅ | ⬜ pending |
| 06-03-01 | 03 | 1 | PAGO-05, PAGO-08 | T-06-13, 15 | CSP apagada idéntica; `frame-src` solo encendida | arnés de seguridad | `npm run seguridad:probar` | ✅ | ⬜ pending |
| 06-03-02 | 03 | 1 | PAGO-08 | T-06-14 | cabecera servida idéntica | servidor en el 8091 | `npm run seguridad:probar` + `curl -sI` | ✅ | ⬜ pending |
| 06-04-01 | 04 | 2 | PAGO-04, 06, 07, 08 | T-06-19..22 | solo aprobado explícito; guarda 05.4 antes de cobrar; aprobado-sin-aplicar sin NCF; consentimiento al aprobar | integración con doble | `npm run cardnet:probar && npm run pagos:probar && npm run transferencia:probar` | ✅ | ⬜ pending |
| 06-04-02 | 04 | 2 | PAGO-05, PAGO-07 | T-06-16..18 | token del Customer; doble clic = un cobro; pendiente sin cobro liberable | integración con doble | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-05-01 | 05 | 3 | PAGO-04, PAGO-05, PAGO-08 | T-06-24..27 | cinco rutas de cobro con tarjeta; apagado idéntico; casilla solo con tarjeta | API con req/res falsos | `npm run cardnet:probar && npm run publicacion:probar && npm run capacidad:probar` | ✅ | ⬜ pending |
| 06-05-02 | 05 | 3 | PAGO-05, PAGO-07 | T-06-23, 28 | confirmar idempotente; tarjetas ajenas 404; renovación automática exige tarjeta | API con req/res falsos | `npm run cardnet:probar && npm run renovacion:probar` | ✅ | ⬜ pending |
| 06-06-01 | 06 | 4 | PAGO-07 | T-06-29..31 | Basic + timingSafeEqual; aviso doble = un NCF; sin 429 | API con req/res falsos | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-06-02 | 06 | 4 | PAGO-07 | T-06-32, 34 | aviso perdido recuperado una vez | integración con doble | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-06-03 | 06 | 4 | PAGO-08 | T-06-33, 35 | informe apagado idéntico; descuadre y cobrado sin aplicar visibles | arnés + tarea en seco | `npm run cardnet:probar && node tools/tareas.js reconciliar --seco` | ✅ | ⬜ pending |
| 06-07-01 | 07 | 4 | PAGO-05 | T-06-36..38, 40 | iframe de CardNet; origen exacto; sin campos de tarjeta | estático + barrera | `node --check assets/cardnet.js && npm run check:contraste && npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-07-02 | 07 | 4 | PAGO-04, PAGO-08 | T-06-39, 41 | publicar y planes con tarjeta; apagado = hoy | estático | `node --check assets/publicar.js assets/planes.js` | ✅ | ⬜ pending |
| 06-08-01 | 08 | 5 | PAGO-04, 06, 07 | T-06-42..44, 46 | sin casilla no se cobra; mismo importe que la renovación manual; renovar dos veces = un pago; 05.4 respetada | integración con doble | `npm run cardnet:probar && npm run renovacion:probar && npm run capacidad:probar` | ✅ | ⬜ pending |
| 06-08-02 | 08 | 5 | PAGO-08 | T-06-45, 47 | tres intentos máximo; correos sin token ni teléfono; 7/3/1 de hoy con CardNet apagado | integración (correo en archivo) | `npm run cardnet:probar && npm run recordatorios:probar` | ✅ | ⬜ pending |
| 06-08-03 | 08 | 5 | PAGO-08 | — | consola distingue automática/manual | estático | `node --check assets/admin.js && npm run capacidad:probar` | ✅ | ⬜ pending |
| 06-09-01 | 09 | 5 | PAGO-04, PAGO-05 | T-06-48, 49, 51 | renovar y ampliar con tarjeta; una sola confirmación | estático | `node --check assets/panel.js && npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-09-02 | 09 | 5 | PAGO-04, PAGO-08 | T-06-50 | tarjetas guardadas; interruptor con tarjeta | estático + contraste | `node --check assets/panel.js && npm run check:contraste` | ✅ | ⬜ pending |
| 06-10-01 | 10 | 6 | PAGO-04 a PAGO-08 | todos | los cinco criterios y el recurrente de extremo a extremo | extremo a extremo con doble | `npm run cardnet:probar` | ✅ | ⬜ pending |
| 06-10-02 | 10 | 6 | PAGO-08 | T-06-55 | batería completa y auditorías con navegador verdes, apagado | batería + navegador (puerto 8080, solo aquí) | full suite command | ✅ | ⬜ pending |
| 06-10-03 | 10 | 6 | PAGO-08 | T-06-52..54, 56 | README sin valores; encendido y apagado escritos | estático | comprobación del README | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

Las auditorías con navegador usan el puerto 8080 fijo: solo las corre el 06-10. Los planes que van
en paralelo (06-02/06-03, 06-06/06-07, 06-08/06-09) se verifican con arneses y comprobaciones
estáticas.

---

## Wave 0 Requirements

- [x] `tools/probar-cardnet.js` — lo crea la tarea 06-01-01 en rojo antes del código (arnés, doble de transporte que lanza por defecto, base desechable `.tmp/prueba-cardnet/`, entorno antes del `require` de `tools/db.js`, `MERCA_ENV` a un archivo inexistente).
- [x] Script `cardnet:probar` en `package.json` y paso «CardNet» en `.github/workflows/desplegar.yml` (06-01-03).

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
