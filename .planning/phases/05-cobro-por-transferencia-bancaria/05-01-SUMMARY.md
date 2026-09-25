---
phase: 05-cobro-por-transferencia-bancaria
plan: 01
subsystem: pagos
tags: [transferencia, pagos, bitacora, sqlite, savepoint]
requires:
  - "fase 3: pagos.confirmarPago y db.aprobarPago"
  - "fase 4: db.enNombreDe y ACCIONES_BITACORA"
provides:
  - "tools/transferencia.js: datosTransferencia, transferenciaActiva, faltantes"
  - "PROCESADORES.transferencia, metodosDeCobro, procesadorDeCobro"
  - "confirmarPago(idPago, { envolver })"
  - "db.pagosPendientesDe, db.pagosParaConsola"
  - "acciones pago.transferencia_recibida y pago.transferencia_anulada"
affects: [05-02, 05-03, 05-04, 05-05, fase 6 (cardnet en metodosDeCobro)]
tech-stack:
  added: []
  patterns:
    - "configuración leída de process.env en cada llamada, sin valores por defecto"
    - "SAVEPOINT en vez de BEGIN para funciones que tienen que anidarse en enNombreDe"
key-files:
  created:
    - tools/transferencia.js
    - tools/probar-transferencia.js
  modified:
    - tools/pagos.js
    - tools/db.js
    - package.json
    - .github/workflows/desplegar.yml
    - .env.example
    - deploy/README.md
decisions:
  - "En pagosParaConsola, membresiaViva es true para las compras (crean su membresía al confirmarse); solo una ampliación puede tenerla en false"
  - "procesadorDeCobro solo acepta cadenas de la lista del servidor: un nombre heredado de Object («constructor») responde 400"
  - "El tipo de cuenta se acepta sin distinguir mayúsculas y se devuelve en minúsculas"
metrics:
  duration: 30 min
  completed: 2026-09-25
  tasks: 3
  files: 8
---

# Phase 5 Plan 01: el núcleo de la transferencia bancaria

La transferencia existe como procesador que responde siempre `pendiente`,
apagada salvo con cinco variables de entorno válidas; al encenderla, `demo`
sale del alcance del comprador; y `confirmarPago` puede correr dentro de
`db.enNombreDe` porque `aprobarPago` pasó de BEGIN a SAVEPOINT.

## Firmas finales

```js
// tools/transferencia.js — lee process.env en cada llamada
datosTransferencia()   // → { banco, titular, rnc, tipoCuenta, cuenta, moneda: 'DOP' } | null
transferenciaActiva()  // → boolean
faltantes()            // → ['MERCA_TRANSFERENCIA_…', …]  nombres, nunca valores

// tools/pagos.js
PROCESADORES.transferencia  // async () => ({ resultado: 'pendiente' })
metodosDeCobro()            // → ['transferencia'] encendida | ['demo'] apagada
procesadorDeCobro(pedido)   // → metodos[0] sin pedido; pedido si está en la lista;
                            //   si no, lanza { codigo: 400, message: 'Ese método de pago no está disponible.' }
confirmarPago(idPago, { envolver } = {})
  // envolver(aprobar) recibe () => db.aprobarPago(idPago) y devuelve lo que ella devuelva.
  // La emisión del comprobante va DESPUÉS, fuera del envoltorio.

// tools/db.js
pagosPendientesDe(idOrg)
  // → [{ id, referencia, total, subtotal, itbis, creado, procesador, concepto, tipo }]
  //   solo pendientes de esa organización, más recientes primero, sin la intención entera
pagosParaConsola({ estado = 'pendiente', limite = 200 } = {})
  // estado ∈ pendiente | aprobado | rechazado (otro → pendiente); solo procesador = 'transferencia'
  // → [{ id, organizacion_id, organizacion, referencia, subtotal, itbis, total, estado, procesador,
  //      creado, confirmado, actualizado, concepto, tipo, idSusc, correoCliente, membresiaViva,
  //      factura?: { numero, ncf } | null  (solo en aprobados) }]
ACCIONES_BITACORA['pago.transferencia_recibida'] // 'Transferencia marcada como recibida'
ACCIONES_BITACORA['pago.transferencia_anulada']  // 'Transferencia anulada sin cobro'
```

Uso previsto desde la consola (05-02):

```js
pagos.confirmarPago(id, { envolver: (aprobar) => db.enNombreDe({ ..., accion: 'pago.transferencia_recibida' },
  () => { const r = aprobar(); return { antes, despues: { estado: r.pago.estado, yaEstaba: r.yaEstaba }, resultado: r }; }) });
```

## Tareas

| # | Tarea | Commits |
|---|-------|---------|
| 1 | `tools/transferencia.js` y el procesador en `pagos.js` | cf12af6 (rojo), 97b880d (verde) |
| 2 | La transición dentro de la bitácora y las consultas | 2cc8901 (rojo), 70b0525 (verde) |
| 3 | Paso de CI, `.env.example` y `deploy/README.md` | 8ae1a34 |

## Verificación

- `npm run transferencia:probar`: 79 comprobaciones, 0 fallos.
- `pagos:probar`, `bitacora:probar`, `facturas:probar`, `seguridad:probar`, `dealer:probar`: en verde.
- La verificación automática de la tarea 3 da `ok` (yml sin CRLF, paso tras Pagos, cinco variables vacías).
- `git grep MERCA_TRANSFERENCIA_` fuera de la prueba solo devuelve nombres de variable y marcadores `<…>`.
- `package.json` solo cambia en `scripts`: ninguna dependencia nueva.
- Nada de lo que `aprobarPago` llama dentro (`otorgarCompra`, `encenderPerfilSiProcede`, `planPorId`) abre su propio BEGIN.
- No existe en el repositorio una comprobación literal de «aprobarPago solo se llama desde pagos.js/seed.js»; los únicos llamadores siguen siendo `pagos.js`, `seed.js` y `probar-pagos.js`.

## Deviations from Plan

None - plan executed exactly as written. Solo tres detalles que el plan no fijaba, anotados en `decisions`.

## Pendiente de Victor

- Los cinco datos bancarios (`MERCA_TRANSFERENCIA_BANCO`, `_TITULAR`, `_RNC`, `_TIPO`, `_CUENTA`) en `/etc/mercamaquinarias.env`, según `deploy/README.md` §10b. Hasta entonces la transferencia está apagada y el sitio se comporta como hoy.

## Known Stubs

Ninguno. La transferencia se entrega apagada tras su interruptor, por diseño (D-01).

## Self-Check: PASSED

- FOUND: tools/transferencia.js, tools/probar-transferencia.js
- FOUND: cf12af6, 97b880d, 2cc8901, 70b0525, 8ae1a34
