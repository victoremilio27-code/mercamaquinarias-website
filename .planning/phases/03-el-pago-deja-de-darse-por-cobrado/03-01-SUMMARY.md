---
phase: 03-el-pago-deja-de-darse-por-cobrado
plan: 01
subsystem: pagos
tags: [pagos, sqlite, migraciones, facturacion]
requires: []
provides:
  - "db.registrarCobro / db.aprobarPago / db.rechazarPago"
  - "Migración 2026-09-pagos-pendientes (intencion, confirmado, actualizado, ix_pagos_estado)"
  - "npm run pagos:probar"
affects: [tools/api.js (03-03), tools/seed.js (03-03), tools/pagos.js (03-02)]
tech-stack:
  added: []
  patterns: ["transición de estado con UPDATE ... WHERE estado = 'pendiente' y comprobación de changes dentro de BEGIN/COMMIT"]
key-files:
  created: [tools/probar-pagos.js]
  modified: [tools/db.js, db/schema.sql, tools/facturas.js, package.json]
decisions:
  - "D-01..D-05 aplicadas tal cual; ninguna reabierta."
  - "aprobarPago lanza con código 409 si el UPDATE final no cambia exactamente una fila (ROLLBACK de los cupos)."
metrics:
  duration: "~25 min"
  completed: 2026-09-25
---

# Fase 3 Plan 01: el pago puede nacer pendiente — resumen

Migración `2026-09-pagos-pendientes` y tres funciones en `tools/db.js` que
anotan un cobro con importe como `pendiente`, lo aprueban otorgando los cupos
de su `intencion` en una sola transacción idempotente, o lo rechazan sin dejar
nada. El sitio se comporta igual que antes: `comprarCupos`/`ampliarCupos` no
cambian de quien los llama.

## Firmas finales

```js
db.registrarCobro({ idOrg, idSusc = null, cobro, intencion })
  // → fila de pagos: estado 'pendiente', confirmado NULL, suscripcion_id = idSusc
  // lanza (codigo 500) si !(cobro.total > 0)
  // procesador = cobro.procesador || 'demo'; creado = actualizado = ahora

db.aprobarPago(idPago)
  // → { pago, membresia, yaEstaba }
  // 404 si no existe; si no está 'pendiente' → no toca nada, yaEstaba: true,
  //   membresia = suscripción enlazada si sigue activa, o null
  // compra → otorgarCompra + pagos.suscripcion_id; ampliación → suma `anadidos`
  // UPDATE final WHERE estado = 'pendiente'; changes !== 1 → 409 y ROLLBACK
  // no emite comprobante

db.rechazarPago(idPago)
  // → { pago, cambiado }   (solo cambia un 'pendiente')

otorgarCompra(d, { idOrg, plan, cupo, dias, precioPactado, t }) // interna → idSusc
```

## Forma exacta de `pagos.intencion`

```js
// compra
{ tipo: 'compra', idPlan, cupo, dias, concepto, cliente, correoCliente }
// ampliación
{ tipo: 'ampliacion', idSusc, cupoAnterior, cupoNuevo, anadidos, concepto, cliente, correoCliente }
// cliente = { razonSocial, rnc, direccion, correo } (lo que hoy recibe emitirComprobanteDeCobro)
```

## Pruebas

- `npm run pagos:probar`: **36 comprobaciones**, todas OK (9 secciones).
- `facturas:probar` OK, `seguridad:probar` 71/71, `dealer:probar` 49/49, sin tocarlos.

## Commits

- `eeae075` test(03-01): arnés de pagos pendientes en rojo
- `e6c36e9` feat(03-01): el pago puede nacer pendiente y aprobarse en un solo punto

## Deviations from Plan

- El arnés cuenta también el número de comprobaciones (`comprobaciones`) y lo
  imprime al final; `probar-facturas.js` solo cuenta fallos. Añadido para poder
  reportar la cifra que pide el `<output>`.
- `registrarCobro` guarda `referencia || null` (el plan decía `cobro.referencia`);
  equivalente para todos los llamadores reales.
- La herramienta de edición dejó `tools/db.js` en LF en la copia de trabajo; se
  devolvió a CRLF antes del commit. El contenido en el índice es el mismo (LF
  normalizado por `core.autocrlf`).

## Self-Check: PASSED

- tools/probar-pagos.js existe; commits eeae075 y e6c36e9 en la rama.
