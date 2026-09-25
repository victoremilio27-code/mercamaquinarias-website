---
phase: 05-cobro-por-transferencia-bancaria
plan: 02
subsystem: pagos
tags: [transferencia, pagos, bitacora, consola, correo, api]
requires:
  - "05-01: transferencia.js, metodosDeCobro/procesadorDeCobro, confirmarPago({ envolver }), pagosPendientesDe, pagosParaConsola"
  - "fase 4: conAdminEnNombreDe y la guarda de probar-bitacora.js"
provides:
  - "POST /api/membresias y /ampliar con el procesador elegido por el servidor; 202 con los datos de la cuenta"
  - "GET /api/membresias con pagosPendientes y transferencia | avisoTransferencia"
  - "GET /api/planes con metodosPago"
  - "GET /api/admin/pagos, POST /api/admin/pagos/:id/recibido, POST /api/admin/pagos/:id/anular"
  - "correo.enviarDatosTransferencia, correo.enviarTransferenciaAnulada"
affects: [05-03 (pantalla del comprador), 05-04 (consola), 05-05, fase 6 (cardnet en metodosDeCobro)]
tech-stack:
  added: []
  patterns:
    - "el procesador de un cobro lo elige el servidor y se valida ANTES de anotar el pago"
    - "comprobaciones previas fuera de enNombreDe: un 409 no deja fila de bitácora"
    - "sinEsperar(): correo suelto con catch que cubre promesa, objeto y excepción síncrona"
key-files:
  created: []
  modified:
    - tools/api.js
    - tools/correo.js
    - tools/probar-transferencia.js
    - tools/auditar-permisos.js
decisions:
  - "El importe cero no pasa por procesadorDeCobro: un Estándar en promoción con un `metodo` raro sigue saliendo 201 como hoy"
  - "El aviso de arranque solo cuenta variables MERCA_TRANSFERENCIA_* no vacías: vacías es como quedan mientras Victor no da la cuenta, y ahí apagada es lo correcto"
  - "La comprobación de ampliación huérfana solo se hace con el pago pendiente: pulsar «recibido» sobre uno ya aprobado es la recuperación de una emisión fallida y no debe bloquearse"
  - "Los errores de 500 de la consola de pagos responden «Error del servidor» y se registran, en vez de devolver el mensaje interno"
  - "El aviso interno a facturación va solo en texto (avisarInternamente sin html)"
metrics:
  duration: 7 min
  completed: 2026-09-25
  tasks: 2
  files: 4
---

# Phase 5 Plan 02: las rutas de la transferencia

El comprador pide pagar por transferencia y recibe en la respuesta y por
correo la cuenta, el importe y la referencia; el personal lista, marca como
recibida o anula desde `/api/admin/pagos`, siempre por la bitácora y siempre
con `pagos.confirmarPago`. La ampliación cuya membresía desapareció responde
409 y solo se puede anular.

## Forma exacta de las respuestas (para 05-03 y 05-04)

### Comprador

`POST /api/membresias` `{ plan, cupo, dias, metodo?, conRnc?, … }`

- `metodo` es opcional. Si falta, el servidor usa el primero de `metodosDeCobro()`.
  Si no está en la lista → **400** `{ error: 'Ese método de pago no está disponible.' }`
  y no se anota ningún pago.
- Transferencia encendida, con importe → **202**:

```js
{
  membresia: null,
  cobro: { subtotal, itbis, total, referencia: 'TE-AAAA-XXXXXX', procesador: 'transferencia', … },
  comprobante: null,
  pago: { id, estado: 'pendiente' },
  aviso: 'Transfiera el importe con la referencia indicada. Los cupos y el comprobante fiscal llegan cuando confirmemos el ingreso.',
  transferencia: { banco, titular, rnc, tipoCuenta: 'corriente' | 'ahorros', cuenta, moneda: 'DOP',
                   correo: 'facturacion@mercamaquinarias.com' }   // null si se apagó entre medias
}
```

- Apagada: igual que en la fase 3 (201 con `demo`). Importe cero: 201 al instante, sin `transferencia`.

`POST /api/membresias/:id/ampliar` `{ cupo, metodo? }` → **202** con la misma forma, salvo que
`membresia` es la membresía actual **sin** los cupos nuevos.

En los dos 202 por transferencia salen, sin esperar: `enviarDatosTransferencia` al correo de la
sesión y un aviso a `facturacion` («Transferencia en espera {ref} · {empresa} · RD$…»).

`GET /api/membresias` → **200**:

```js
{
  pagosPendientes: [{ id, referencia, total, subtotal, itbis, creado, procesador, concepto, tipo }],
  transferencia?: { …los mismos siete campos… },   // solo si hay un pendiente por transferencia y está encendida
  avisoTransferencia?: 'Para completar este pago, escríbanos a facturacion@… con la referencia y le indicamos cómo hacerlo.',
                                                   // solo si hay pendiente por transferencia y está APAGADA
  membresias: [...], exenta
}
```

`GET /api/planes` añade `metodosPago: ['transferencia']` (encendida) o `['demo']` (apagada). Nunca la cuenta.

### Consola (todas 404 a quien no es administrador)

`GET /api/admin/pagos?estado=pendiente|aprobado|rechazado` (otro valor → `pendiente`) → **200**
`{ estado, pagos: db.pagosParaConsola({ estado }) }`: cada fila con `id, organizacion_id, organizacion,
referencia, subtotal, itbis, total, estado, procesador, creado, confirmado, actualizado, concepto, tipo,
idSusc, correoCliente, membresiaViva` y, en aprobados, `factura: { numero, ncf } | null`.

`POST /api/admin/pagos/:id/recibido` `{ motivo? }` (referencia del banco, hasta 300) →

- **200** `{ pago: { id, estado: 'aprobado' }, membresia, comprobante: { numero, tipo, ncf } | null, yaEstaba }`
  y, si la emisión falló, `aviso` («…vuelva a marcarlo como recibido para emitirlo»).
  Repetir: 200 con `yaEstaba: true` y el mismo comprobante; otra fila de bitácora.
- **404** `Ese pago no existe` · **409** si no es de `transferencia`, si está `rechazado`/`devuelto`,
  o ampliación con `membresiaViva: false` (texto literal de D-07). Ninguno deja fila.

`POST /api/admin/pagos/:id/anular` `{ motivo }` (5 a 300 caracteres) →

- **200** `{ pago: { id, estado: 'rechazado' }, motivo }`, fila `pago.transferencia_anulada`, correo al
  `correoCliente` de la intención con el motivo.
- **400** sin motivo o corto · **404** · **409** si no es de transferencia o no está pendiente
  (aprobado: «…anule su comprobante con una nota de crédito en Facturas»). Sin fila.

Fila de bitácora (las dos acciones): `objeto_tipo: 'pago'`, `objeto_id`, organización del pago,
IP de `CF-Connecting-IP`, `antes: { estado }`, `despues: { estado, referencia, total[, idSusc, yaEstaba] }`.

## Tareas

| # | Tarea | Commits |
|---|-------|---------|
| 1 | El comprador pide pagar por transferencia | 31e821e (rojo), a57f729 (verde) |
| 2 | La consola marca la transferencia como recibida o la anula | 38c968a (rojo), effdbef (verde) |

## Verificación

- `npm run transferencia:probar`: 173 comprobaciones, 0 fallos (79 de 05-01 y 94 nuevas, secciones 15 a 31).
- `bitacora:probar` (la guarda lista las dos rutas POST nuevas con su acción), `pagos:probar`,
  `seguridad:probar`, `facturas:probar`, `dealer:probar`, `chat:probar`: en verde.
- `auditar-permisos.js` contra el servidor con `db:demo`, como en CI: 0 fallos, con las tres
  comprobaciones nuevas.
- `grep "db.aprobarPago" tools/api.js` y `grep "procesador: 'demo'" tools/api.js`: vacíos. La prueba
  vigila lo primero.
- La carrera de D-07 (la membresía desaparece entre la comprobación y la aprobación) se prueba
  sustituyendo `db.suscripcion`: 409 con el texto de D-07, pago pendiente, sin factura y sin fila.

## Deviations from Plan

None - plan executed exactly as written. Los detalles que el plan no fijaba están en `decisions`.

## Pendiente de Victor

- Lo mismo que en 05-01: los cinco datos bancarios. Hasta entonces todo esto está apagado y
  el sitio compra con `demo` como antes.

## Known Stubs

Ninguno. La transferencia se entrega apagada tras su interruptor, por diseño (D-01).

## Threat Flags

Ninguno fuera del `<threat_model>` del plan: las tres rutas nuevas son las de T-05-07/08, y la cuenta
solo sale en respuestas con sesión (T-05-09).

## Self-Check: PASSED

- FOUND: tools/api.js, tools/correo.js, tools/probar-transferencia.js, tools/auditar-permisos.js
- FOUND: 31e821e, a57f729, 38c968a, effdbef
