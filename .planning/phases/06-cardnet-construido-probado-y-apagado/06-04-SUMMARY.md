---
phase: 06-cardnet-construido-probado-y-apagado
plan: 04
subsystem: pagos
tags: [cardnet, transicion-unica, ncf, resolver, aprobado-sin-aplicar, tokenizacion]

requires:
  - phase: 06-cardnet-construido-probado-y-apagado
    provides: "06-01 tools/cardnet.js y 06-02 funciones de base (tarjetas, eventos, intencionAplicable, consentimiento)"
provides:
  - "PROCESADORES.cardnet con la guarda de la 05.4 solo en el primer intento"
  - "resolver(pago, respuesta): la resolución única para cobro, notificación, conciliación y renovación"
  - "metodosDeCobro con cardnet; apagado idéntico a la fase 5"
  - "Consentimiento de renovación automática aplicado al aprobarse el pago con tarjeta"
  - "prepararCaptura, registrarTarjeta, confirmarConTarjeta, activarTarjeta, pendienteSinCobro, anularPendienteSinCobro"
affects: [06-05, 06-06, 06-07, 06-08]

key-decisions:
  - "Con intento previo anotado (cobro-enviado) la guarda intencionAplicable NO se mira: se reenvía con el mismo UniqueID y resolver decide; rechazar un cobro que pudo entrar lo haría invisible (R-05)"
  - "Aprobado que no se puede aplicar (aprobarPago lanza 404/409, o confirmarPago vuelve con el pago en estado distinto de aprobado) = UN evento aprobado-sin-aplicar, sin comprobante ni NCF, resolver devuelve sinAplicar: true; nunca rechaza"
  - "PROCESADORES.cardnet relee la fila y comprueba estado === 'pendiente' sin ningún await antes del evento cobro-enviado"
  - "registrarTarjeta devuelve la tarjeta pública (sin token) leyendo metodosPagoDe; el token solo vive dentro de PROCESADORES.cardnet"

requirements-completed: [PAGO-04, PAGO-05, PAGO-06, PAGO-07, PAGO-08]

completed: 2026-09-30
---

# Phase 6 Plan 04: CardNet en la transición única de pagos.js

**CardNet es una entrada más de `PROCESADORES`: relee el pago, aplica la guarda de la 05.4 solo antes del primer intento, anota `cobro-enviado` antes de llamar, y todo aprobado/rechazado/pendiente se resuelve en `resolver`, con el aprobado que no se puede aplicar convertido en evento `aprobado-sin-aplicar` y nunca en rechazo.**

## Tareas

| Tarea | Nombre | Commit |
|-------|--------|--------|
| 1 | resolver, procesador cardnet con la guarda, selector y consentimiento al aprobar | 49d06cc |
| 2 | preparar captura, registrar tarjeta, confirmar sin doble cobro, liberar pendiente sin cobro | 9e82ee5 |

## Firmas y retornos (exportadas por tools/pagos.js)

```js
resolver(pago, respuesta)
// síncrona. respuesta = { resultado, motivo?, codigo?, procesadorId?, autorizacion?, redireccion?, origen? }
// -> { estado, pago, membresia, comprobante, motivo }            (+ sinAplicar: true | redireccion)
// aprobado aplicado  -> estado 'aprobado'
// aprobado sin aplicar -> { estado: 'pendiente', sinAplicar: true, pago, membresia: null, comprobante: null, motivo: SIN_APLICAR }
// rechazado -> rechazarPago con { motivo: respuesta.motivo || cardnet.mensajeDeRechazo(codigo), codigo }
// redireccion -> pendiente con `redireccion`; lo demás -> pendiente
// otro error de confirmarPago (no 404/409) se relanza.

prepararCaptura(pago, { correo, nombre, rnc })   // async -> { urlCaptura, origen }; 409 apagado; 502 CardNet caído
registrarTarjeta(pago)                            // async -> { metodo (sin token), activacion: boolean }; 409 sin cliente/perfiles; 502
confirmarConTarjeta(idPago, idOrg, { metodoPago } = {})
  // async -> resultado de cobrar | { estado: <ya resuelto>, pago, ... } | { estado: 'activacion', metodoPago }
  // 404 pago ajeno o no cardnet; 409 «Ese pago ya se está procesando.»; 400 tarjeta ajena/inactiva
activarTarjeta(idMetodo, idOrg, codigo)           // async -> { metodo }; 400 código vacío o > 12; 404; 409 si CardNet no confirma
pendienteSinCobro(pago)                           // boolean: cardnet + pendiente + sin cobro-enviado
anularPendienteSinCobro(idPago)                   // -> { pago, cambiado, motivo }; rechazado con codigo 'reemplazado'; 409 si hubo intento
```

Texto exacto de `SIN_APLICAR`:

> El banco aprobó su pago, pero no pudimos activar lo que compró y no se emitió comprobante. Le devolveremos el dinero: escríbanos por correo electrónico o por el asistente del sitio y lo resolvemos.

`metodosDeCobro()`: apagado `['demo']` / `['transferencia']`; activo `['cardnet']` / `['cardnet', 'transferencia']`.

## Cambios fuera de pagos.js

- `tools/cardnet.js`: solo `RECHAZO_GENERICO` («... No se le cobró nada, no se activó nada y no se emitió comprobante.»).
- `tools/probar-pagos.js`, `probar-publicacion.js`, `probar-transferencia.js`: un bloque que borra `MERCA_CARDNET*` del entorno (D-32). Nada más.
- `tools/probar-cardnet.js`: sección 4 ajustada (`no se activó nada`, sin «cupo»), secciones 15 y 16 nuevas (ahora 300 comprobaciones).
- `tools/facturas.js` y `tools/db.js`: sin cambios (`git diff` vacío).

## Deviations from Plan

Ninguna en el fondo; el plan se ejecutó tal como estaba escrito, con las correcciones de la revisión.

Detalles menores de implementación (no desviaciones):
- `registrarTarjeta` decide «el perfil que aún no está guardado» leyendo `metodosPagoDe` + `metodoPagoDe` porque `db.js` no se toca y no expone los ids de perfil en lote. Una tarjeta borrada lógicamente no cuenta como guardada, así que, si aún existe en CardNet, competiría con la nueva; se elige la última de la lista de CardNet (se asume orden de creación; POR CONFIRMAR EN LAB).
- `PROCESADORES.cardnet` y `resolver` anotan ambos la respuesta (`anotarRespuestaProcesador`); la segunda es idempotente y solo la primera cuenta el intento.
- Con `anotarRespuestaProcesador` un `procesadorId` distinto del ya guardado lanza 409 desde `resolver`; se deja subir (la notificación responderá 500 y CardNet reintentará) porque aprobar con otro id de compra sería dudoso.

## Verificación

- `cardnet:probar` 300/0 (secciones 15 y 16 cubren todo el `<behavior>` de ambas tareas, incluido el intento previo + membresía vencida, el aviso tardío sobre un `reemplazado`, el pago que deja de estar pendiente, el token inventado ignorado y la doble confirmación simultánea con una sola llamada a purchase).
- Verdes: `pagos` (112), `transferencia` (213), `publicacion` (163), `renovacion` (151), `capacidad` (132), `facturas`, `bitacora` (120), `seguridad` (101), `chat`.
- `grep -c "confirmarPago(" tools/pagos.js` = 2 como antes (la llamada de `cobrar` se mudó a `resolver`); sin `*100` en pagos.js; sin nombres de campos de tarjeta en pagos.js.
- Auditorías de navegador: no aplican a este plan; pendientes de la batería del orquestador.

## Known Stubs

Ninguno. Las rutas que llaman a estas funciones (y a `resolver` desde la notificación y la conciliación) son de 06-05 a 06-08.

## Threat Flags

Ninguno fuera del registro del plan (T-06-16 a T-06-22 mitigados y probados).

## Self-Check: PASSED

- FOUND: tools/pagos.js (resolver, cardnet: async, intencionAplicable, 'aprobado-sin-aplicar', EN_CURSO con finally)
- FOUND: commits 49d06cc y 9e82ee5
