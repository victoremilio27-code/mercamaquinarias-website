---
phase: 05-cobro-por-transferencia-bancaria
plan: 04
subsystem: consola
tags: [transferencia, pagos, consola, bitacora, admin]
requires:
  - "05-02: GET /api/admin/pagos, POST /api/admin/pagos/:id/recibido y /anular"
  - "fase 4: patrón de la bandeja (04-03) y cargarBitacora (04-04)"
provides:
  - "admin.html: sección t-pagos entre t-bandeja y t-facturas"
  - "assets/admin.js: avisarPagos, pagoHTML, cargarPagos, montarPagos, pedirRecibido, marcarRecibido, anularPago, refrescarTrasPago"
  - "pedirMotivo(fila, alConfirmar, opciones): textos, mínimo, máximo y zona de avisos configurables; sin opciones se comporta como antes"
affects: [05-05 (verificación en navegador en los dos temas)]
tech-stack:
  added: []
  patterns:
    - "confirmación en la propia fila (.sol__motivo), nunca prompt()"
    - "tras cada escritura: lista, bitácora y comprobantes; un 409 recarga la lista"
key-files:
  created: []
  modified:
    - admin.html
    - assets/admin.js
decisions:
  - "El nombre de la empresa sale de `organizacion`, que es el campo real de pagosParaConsola; la interfaz del plan decía `organizacion_nombre`"
  - "En Recibidos, un pago aprobado sin factura enseña «Emitir el comprobante»: es la recuperación que el aviso de 05-02 pide («vuelva a marcarlo como recibido») y sin el botón no había forma de hacerla desde la pantalla, porque el pago ya no está en Pendientes"
  - "Un recibo sin NCF (cliente sin RNC mientras no haya secuencia B02) se nombra como recibo con su número; no se trata como comprobante que falta"
  - "Importe con céntimos: el total lleva ITBIS y se coteja cifra a cifra contra el extracto"
  - "La zona de avisos usa role=status, como pide el plan (la bandeja usa role=alert)"
metrics:
  duration: 35 min
  completed: 2026-09-25
  tasks: 2
  files: 2
---

# Phase 5 Plan 04: la consola de las transferencias

El personal ve en `admin.html` las transferencias en espera, las marca
como recibidas (confirmando importe y referencia, con la referencia del
banco como nota) o las anula con motivo, y la bitácora de la fase 4
enseña la acción al momento. La ampliación cuya membresía ya no existe
sale marcada y solo se puede anular (D-07).

## Tareas

| # | Tarea | Commit |
|---|-------|--------|
| 1 | Sección «Pagos por transferencia» y su listado | 1681299 |
| 2 | Marcar recibido y anular, con la bitácora al día | c539b9b |

## Qué hace la pantalla

- Filtros Pendientes / Recibidos / Anulados (`data-pagos-estado`, para no engancharse a los
  `data-estado` de la cola). Cabecera con «N en espera».
- Cada fila: referencia destacada, empresa, fecha, concepto, importe `RD$0,000.00` y correo del
  comprador como texto (sin enlace ni teléfono). Todo por `esc()`; el id viaja con `encodeURIComponent`.
- Pendiente normal: «Marcar recibido» y «Anular». Ampliación huérfana: aviso literal de D-07 y
  solo «Anular».
- «Marcar recibido» abre en la fila «Confirmar que recibió RD$… con la referencia TE-…» y el campo
  opcional «Referencia del banco» (hasta 300), que viaja como `motivo`. En éxito: «Recibido. Se
  otorgaron los cupos y se emitió el comprobante B02…» (o «…el recibo MM-… (sin NCF)»); si el
  servidor manda `aviso`, se enseña ese aviso en su lugar.
- «Anular»: `pedirMotivo` con «Por qué se anula. Se le envía al cliente tal cual.», mínimo cinco
  caracteres, máximo 300. En éxito: «Anulado. No se otorgó nada ni se emitió comprobante.»
- Tras escribir: `cargarPagos()`, `cargarBitacora()` y, si está la sección, `cargarFacturasAdmin()`.
  Un error muestra el `error` del servidor; un 409 además recarga la lista.
- Botones de confirmación deshabilitados mientras dura la petición.
- Rótulos nuevos en `CLAVES_BITACORA`: Estado, Referencia, Importe, Ya estaba recibido, Membresía.

## Verificación

- `node --check assets/admin.js`, `npm run check:encoding` y la comprobación de la tarea 1: `ok`.
- `npm run transferencia:probar`: 173 comprobaciones, 0 fallos. `bitacora:probar`: 74 bien, 0 mal.
- Prueba de humo con puppeteer contra un servidor con base propia (no se deja en el repositorio):
  empresa con `<img onerror>` en el nombre sin inyectar nada; motivo corto no se envía; anular y
  marcar recibido (con referencia del banco) funcionan y la bitácora enseña las dos filas con su
  rótulo sin recargar; con B02 cargada sale «comprobante B0200000001»; sin B02, «recibo
  MM-2026-000001»; un pago rechazado por detrás da 409 con el mensaje del servidor y desaparece
  de la lista; la huérfana no tiene botón de recibido; ningún `dialog` ni error de página.
- `npm run auditar`, script por script en un espacio de red aislado con su propio servidor en
  el 8080 (el 8080 del anfitrión lo ocupaba la auditoría de 05-03) y una base `db:demo` como en CI:
  taxonomía sin incoherencias, `auditar-flujos` 0, `auditar-permisos` 0 fallos,
  **`check-contraste` 0 hallazgos en los dos temas**. `auditar-publico` y `check-links` solo dan
  la hoja de Google Fonts, inalcanzable sin internet dentro del espacio aislado; ninguno de los
  dos carga `admin.html`. En CI, con red, no aparece.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Nombre del campo de la empresa**
- **Found during:** Tarea 1
- **Issue:** la interfaz del plan decía `organizacion_nombre`; la API de 05-02 devuelve `organizacion`.
- **Fix:** `pagoHTML` usa `p.organizacion`.
- **Commit:** 1681299

**2. [Rule 1 - Bug] Recibo sin NCF tratado como comprobante que falta**
- **Found during:** Tarea 2, prueba de humo
- **Issue:** sin secuencia B02, al cliente sin RNC le toca un recibo no fiscal (`ncf: null`). La
  primera versión decía «sin comprobante emitido» y ofrecía emitirlo otra vez.
- **Fix:** se enseña «recibo MM-…»; el botón de recuperación solo sale si `factura` es `null`.
- **Commit:** c539b9b

**3. [Rule 2 - Funcionalidad crítica] Botón «Emitir el comprobante» en Recibidos**
- **Found during:** Tarea 1
- **Issue:** si la emisión falla, 05-02 pide volver a marcar el pago como recibido, pero el pago ya
  no está en Pendientes y la pantalla no ofrecía forma de hacerlo.
- **Fix:** en Recibidos, un aprobado sin factura enseña ese botón (misma ruta `/recibido`).
- **Commit:** 1681299, c539b9b

**4. [Rule 3 - Verificación] La comprobación automática de la tarea 2 mira hasta el final del archivo**
- **Issue:** `s.slice(s.indexOf('montarPagos'))` llega hasta el `prompt()` de la anulación de un
  comprobante fiscal en Facturas (línea 1426), que existe desde antes y que Victor decidió dejar
  como está. No hay `prompt()` en el código de pagos.
- **Fix:** ninguno en el código; la misma comprobación se corrió acotada al bloque de pagos y a
  `pedirMotivo`: sin `prompt()`. Se deja constancia aquí en vez de tocar la anulación fiscal.

## Pendiente

- **Revisión visual humana** (la del plan 05-05): la sección en los dos temas, en móvil y en
  escritorio. Lo automatizable ya está hecho (contraste 0 y prueba de humo).
- Fuera de alcance, sin tocar: en la tabla de comprobantes de Facturas, `assets/admin.js:1354`
  pinta `RD${Number(f.total)…}` y sale «RD4,130» sin el signo de pesos (falta un `$` delante de
  la interpolación). Existía antes de este plan.
- Lo de siempre: los cinco datos bancarios de Victor. Hasta entonces la transferencia está
  apagada y esta sección sale vacía («No hay transferencias pendientes.»).

## Known Stubs

Ninguno. Con la transferencia apagada la lista está vacía porque no hay pagos de ese procesador,
no porque falte conectar nada.

## Threat Flags

Ninguno fuera del `<threat_model>`: T-05-14 mitigado (todo por `esc()`, ids con
`encodeURIComponent`, comprobado con un nombre de empresa con HTML); T-05-15 aceptado, la
autorización está en el servidor.

## Self-Check: PASSED

- FOUND: admin.html (t-pagos entre t-bandeja y t-facturas), assets/admin.js
- FOUND: 1681299, c539b9b
