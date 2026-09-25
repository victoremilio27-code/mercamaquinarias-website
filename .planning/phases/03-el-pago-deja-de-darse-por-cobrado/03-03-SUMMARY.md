---
phase: 03-el-pago-deja-de-darse-por-cobrado
plan: 03
subsystem: pagos
tags: [pagos, api, ci, facturacion]
requires: ["03-01", "03-02"]
provides:
  - "POST /api/membresias y /api/membresias/:id/ampliar pasan por pagos.cobrar"
  - "Guardas de solo-cero en comprarCupos, ampliarCupos y anotarPago"
  - "Paso «Pagos» en el job pruebas del CI"
affects: [assets/planes.js y assets/panel.js (fases 5 y 6: mostrar el 202)]
tech-stack:
  added: []
  patterns: []
key-files:
  created: []
  modified: [tools/api.js, tools/db.js, tools/seed.js, tools/probar-pagos.js, .github/workflows/desplegar.yml]
decisions:
  - "D-09..D-11 aplicadas tal cual. D-12 (sin rama) no aplica: se trabajó en el worktree de la rama fase-03-pagos-pendientes que preparó Victor; sin PR."
  - "En importe cero la respuesta también lleva `pago: { id, estado }`, buscado por referencia."
metrics:
  duration: "~30 min"
  completed: 2026-09-25
---

# Fase 3 Plan 03: la compra y la ampliación pasan por la transición — resumen

Con importe, las dos rutas de cobro anotan el pago `pendiente` con su
`intencion` y lo resuelven con `pagos.cobrar`; solo un aprobado da cupos y
comprobante. El importe cero sigue al instante y sin comprobante.
`comprarCupos`/`ampliarCupos`/`anotarPago` lanzan con importe, y la prueba de
pagos corre en el CI.

## Respuestas de las rutas (D-09, tal como quedó)

| Desenlace | Compra `POST /api/membresias` | Ampliación `POST /api/membresias/:id/ampliar` |
|---|---|---|
| aprobado (`demo`) | 201 `{ membresia, cobro, comprobante: { numero, tipo, ncf } \| null, sesion, pago: { id, estado } }` | 200 `{ membresia, cobro, comprobante, pago }` |
| rechazado | 402 `{ error: 'El pago no fue aprobado. No se le cobró nada, no se añadió ningún cupo y no se emitió comprobante.', pago }` | 402, mismo texto y `pago` |
| pendiente | 202 `{ membresia: null, cobro, comprobante: null, pago, aviso: 'Su pago está en proceso. Los cupos y el comprobante aparecerán cuando se confirme.' }` | 202, igual con `membresia` = la actual sin cambios |
| importe cero | 201 como hoy, `comprobante: null`, más `pago` | 200 como hoy, `comprobante: null`, más `pago` |

## Los cinco criterios de la fase y dónde se prueban (`tools/probar-pagos.js`)

1. **El pago nace `pendiente` y no da nada hasta confirmarse** — secciones 2, 21 (API con el procesador en pendiente: 202, sin factura).
2. **Cupos y comprobante salen juntos de `pagos.confirmarPago`** — secciones 10, 15, 17, 21; y la comprobación de la verificación del plan (`api.js` sin emisión, `aprobarPago` solo en `pagos.js`/`seed.js`), sección 22 (las otras puertas lanzan).
3. **Confirmar dos veces no duplica** — secciones 4, 5, 11 (misma factura, B02 +1, un correo al cliente).
4. **Un rechazo deja `rechazado` sin cupos ni NCF** — secciones 6, 12, 13, 16, 18, 20.
5. **El cero sigue aprobado al instante sin emitir** — secciones 7, 19; y `seguridad:probar` (Estándar a cero sin comprobante).

## Batería local (job `pruebas` del CI, en su orden)

| Script | Resultado |
|---|---|
| `check:encoding` | OK — «Sin caracteres sospechosos» |
| `taxonomia` | OK — «Sin incoherencias», 567 de 567 pares |
| `facturas:letras` | OK — 6/6 pruebas `node:test` |
| `seguridad:probar` | OK — 71 bien, 0 mal (sin tocar el archivo) |
| `dealer:probar` | OK — 49 bien, 0 mal |
| `facturas:probar` | OK — 17 comprobaciones |
| `pagos:probar` | OK — 75 comprobaciones (22 secciones) |
| `chat:probar` | OK — 40 bien, 0 mal (los ECONNRESET y «falta ANTHROPIC_API_KEY» son casos simulados de la propia prueba) |

Semilla sobre base desechable (`MERCA_DB=.tmp/prueba-semilla.db`): termina sin
error; 4 pagos `demo` aprobados con `confirmado`, 1 `sin-costo`, 5 membresías,
0 facturas. Archivo borrado después.

Ningún commit de la fase toca `styles.css`, `index.html`,
`tools/check-contraste.js`, `assets/`, `tools/probar-seguridad.js` ni precios.

## Commits

- `f2f8602` feat(03-03): la compra y la ampliación pasan por la transición única
- `9217e8e` ci(03-03): la prueba de pagos bloquea la fusión

## Pendientes conocidos para las fases 5 y 6

- El navegador aún no distingue un 202 «pendiente»: `api()` lo trata como éxito
  y la pantalla esperaría una membresía que viene `null`. Hoy no ocurre porque
  `demo` aprueba siempre.
- Una ampliación confirmada sobre una membresía que ya no existe lanza en
  `db.aprobarPago` (404) y deja el pago `pendiente`; la reconciliación tendrá
  que decidir qué hacer con él (devolver el dinero).

## Deviations from Plan

- Las pruebas de API y el código van en el mismo commit, como pedía el plan;
  el rojo se comprobó antes (13 de 75 fallidas) pero no quedó commit propio.
- D-12 no aplica en esta ejecución: el trabajo va en la rama
  `fase-03-pagos-pendientes` (worktree), que se empuja sin PR.
- STATE.md y ROADMAP.md no se actualizaron desde este worktree para no chocar
  con la fase 2, que los edita en paralelo en la copia principal.

## Self-Check: PASSED
