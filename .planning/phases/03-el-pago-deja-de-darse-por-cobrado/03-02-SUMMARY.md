---
phase: 03-el-pago-deja-de-darse-por-cobrado
plan: 02
subsystem: pagos
tags: [pagos, facturacion, ncf, idempotencia]
requires: ["03-01: db.registrarCobro / db.aprobarPago / db.rechazarPago"]
provides:
  - "tools/pagos.js: confirmarPago, rechazarPago, cobrar, PROCESADORES, lineaDeCupos"
affects: [tools/api.js (03-03), fase 5 (marcado manual), fase 6 (pasarela y reconciliación)]
tech-stack:
  added: []
  patterns: ["tabla de procesadores sustituible consultada en tiempo de llamada"]
key-files:
  created: [tools/pagos.js]
  modified: [tools/probar-pagos.js]
decisions:
  - "D-06..D-08 aplicadas tal cual."
  - "Sin membresía viva, el detalle se emite sin periodo en vez de «null al null»."
metrics:
  duration: "~20 min"
  completed: 2026-09-25
---

# Fase 3 Plan 02: la transición única — resumen

`tools/pagos.js` contiene la única transición `pendiente → aprobado` con cupos
y comprobante juntos, idempotente de punta a punta (misma factura, un NCF, un
correo) y que se recupera de una emisión fallida confirmando otra vez. `cobrar`
resuelve según la respuesta del procesador y, ante la duda, deja `pendiente`.

## Firmas y retornos

```js
pagos.confirmarPago(idPago)          // síncrona
  // → { pago, membresia, comprobante, yaEstaba }
  // pago no aprobado (rechazado/devuelto) → { pago, membresia: null, comprobante: null, yaEstaba: true }
  // comprobante: fila de facturas, o null si el importe es cero o la emisión falló (nunca lanza por eso)
  // si ya había factura, la devuelve y NO reenvía el correo

pagos.rechazarPago(idPago, { motivo } = {})
  // → { pago, cambiado, motivo }   (no emite; el motivo no se guarda: fase 6)

await pagos.cobrar(pago)
  // → { estado: 'aprobado'|'rechazado'|'pendiente', pago, membresia, comprobante, motivo }
  // sin procesador registrado, procesador que lanza o respuesta rara → 'pendiente'

pagos.PROCESADORES   // { demo: async (pago) => ({ resultado: 'aprobado' }) }
pagos.lineaDeCupos({ cupo, subtotal, inicio, fin }) // copia literal de api.js
```

## Nota para las fases 5 y 6

El marcado manual y la confirmación de la pasarela llaman a
`pagos.confirmarPago(idPago)`; un procesador nuevo se registra en
`pagos.PROCESADORES`.

## Pruebas

- `npm run pagos:probar`: **59 comprobaciones** (36 de 03-01 + 23 nuevas, secciones 10–16), todas OK.
- `facturas:probar` OK, `seguridad:probar` 71/71.
- Módulo: solo requiere `./db` y `./facturas`; `facturas.emitirPorPago` se llama por el objeto.

## Commits

- `3983f25` test(03-02): pruebas de la transición única en rojo
- `0f35983` feat(03-02): transición única pendiente → aprobado con cupos y comprobante

## Deviations from Plan

- El `require('./pagos')` va arriba con los demás, así que en rojo el script
  cae entero con «Cannot find module» (el plan lo admitía).
- La comprobación de «el detalle cuenta los añadidos» envuelve
  `facturas.emitirPorPago` para leer el `detalle` que recibe, porque la
  cantidad no se guarda en la tabla `facturas` (solo va al PDF).
- `tools/api.js` no se tocó.

## Self-Check: PASSED
