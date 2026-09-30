---
phase: 06-cardnet-construido-probado-y-apagado
plan: 05
subsystem: api
tags: [cardnet, rutas, cobro-con-tarjeta, renovacion-automatica, pci, apagado]

requires:
  - phase: 06-cardnet-construido-probado-y-apagado
    provides: "06-01 cardnet.js, 06-02 funciones de base, 06-04 pagos.js (prepararCaptura, confirmarConTarjeta, activarTarjeta, pendienteSinCobro, anularPendienteSinCobro)"
provides:
  - "Las cinco rutas de cobro aceptan la tarjeta (nueva por iframe o guardada por id) y retoman el pendiente sin cobro"
  - "POST /api/pagos/:id/confirmar, GET /api/pagos/:id, GET /api/metodos-pago, POST /api/metodos-pago/:id/activar, DELETE /api/metodos-pago/:id"
  - "Renovación automática con tarjeta: activar exige tarjeta activa; la casilla viaja en la intención y se aplica al aprobarse"
  - "GET /api/membresias con tarjetas, renovacionTarjeta, renovacionIntentos, proximoIntento y sinCobro (solo con CardNet activo)"
  - "Aviso de arranque de CardNet en tools/api.js"
affects: [06-06, 06-07, 06-08, 06-09, 06-10]

key-decisions:
  - "Cinco rutas, una sola copia de la lógica de tarjeta: tarjetaPedida, extrasDeTarjeta, decidirPendienteSinCobro y retomarPendienteDeTarjeta; el final de cada ruta pasó a una función terminarX que sirve también para retomar un pendiente"
  - "El pendiente de tarjeta sin intento de cobro se retoma (misma id de pago, captura nueva o cobro con la tarjeta elegida) o se anula con codigo reemplazado si pide otro método válido; uno con intento se trata como antes"
  - "En ampliar, solo el pendiente de AMPLIACIÓN sin cobro se retoma; un pendiente de renovación sigue dando 409 (la ampliación no puede retomar una renovación)"
  - "Activar la renovación automática elige la tarjeta: la pedida (400 si es ajena o inactiva), la de la suscripción si sigue activa, o la única activa; con varias y sin elegir, 409 propio"
  - "GET /api/pagos/:id y confirmar solo devuelven pagos de la organización de la sesión: ajeno = inexistente = 404"

requirements-completed: [PAGO-04, PAGO-05, PAGO-07, PAGO-08]

duration: ~60min
completed: 2026-09-30
---

# Phase 6 Plan 05: las rutas del cobro con tarjeta

**`tools/api.js` cobra con tarjeta en las cinco rutas de cobro (202 con la URL de captura o cobro inmediato con una tarjeta guardada), confirma tras el iframe sin cobrar dos veces, gestiona las tarjetas guardadas y solo deja activar la renovación automática con una tarjeta activa; con CardNet apagado ninguna respuesta cambia.**

## Tareas

| Tarea | Nombre | Commit |
|-------|--------|--------|
| 1 | Las rutas de cobro aceptan la tarjeta, retoman el pendiente sin cobro y llevan la casilla en la intención | 08483d4 |
| 2 | Confirmar, estado del pago, tarjetas guardadas y renovación automática con tarjeta | 08453c2 |

## Respuestas de cada ruta

Las claves de «apagado» son exactamente las de la fase 5 (comprobado en la sección 17 del arnés con la lista literal de claves).

| Ruta | Apagado (demo/transferencia) | CardNet activo, sin tarjeta | CardNet activo, con `metodoPago` |
|------|------------------------------|-----------------------------|----------------------------------|
| `POST /api/borradores/:id/pago` | 201 `anuncio, cobro, comprobante, membresia, pago`; 202 transferencia como antes | 202 `+ cardnet { urlCaptura, origen }`, `aviso`; el borrador sigue borrador | 201 igual; 402 con `error` = motivo del banco; 202 (`redireccion`, `origen` si el banco pide 3DS) |
| `POST /api/membresias` | 201 `cobro, comprobante, membresia, pago, sesion` | 202 `membresia: null` `+ cardnet` | 201 / 402 / 202 |
| `POST /api/membresias/:id/ampliar` | 200 `cobro, comprobante, membresia, pago` | 202 `+ cardnet` (un pendiente de tarjeta sin cobro se retoma en vez de 409) | 200 / 402 / 202 |
| `POST /api/anuncios/:id/renovar` y `POST /api/membresias/:id/renovar` | 201 `anuncio, cobro, comprobante, membresia, pago` | 202 `+ cardnet` | 201 / 402 / 202 |
| `POST /api/pagos/:id/confirmar` (nueva) | 404 (no hay pagos de tarjeta) | 201 `pago, membresia, anuncio?, comprobante, sesion`; repetido 200 con el mismo comprobante; 402 `{ error, pago }`; 409 `{ error, activacion: true, metodoPago }`; 202 `{ aviso, pago, redireccion?, origen? }`; 404 ajeno/inexistente/no es de tarjeta; 401 sin sesión; 429 tope | igual (`metodoPago` opcional) |
| `GET /api/pagos/:id` (nueva) | 200 `id, estado, total, referencia, procesador, motivo, comprobante` (propio) | igual | 404 de otra organización, 401 sin sesión |
| `GET /api/metodos-pago` (nueva) | 200 `{ tarjetas }` sin token | igual | 401 sin sesión |
| `POST /api/metodos-pago/:id/activar` (nueva) | 404 si no es suya | 200 `{ metodo }`; 400 sin código; 409 si el banco no confirma; 429 tope | igual |
| `DELETE /api/metodos-pago/:id` (nueva) | 404 si no es suya | 200 `{ ok, tarjetas }` aunque el banco falle (queda en `console.error` sin token) | igual |
| `GET /api/membresias` | `pagosPendientes, membresias, renovables, metodosPago, renovacionAutomatica, exenta` (sin cambios) | `+ tarjetas`; cada renovable `+ renovacionTarjeta { marca, ultimos4 } \| null, renovacionIntentos, proximoIntento`; pagos de tarjeta `+ sinCobro` | igual |
| `PUT /api/membresias/:id/renovacion-automatica` | activar: 409 «todavía no está disponible»; desactivar: 200 siempre (`proximo_cargo` NULL) | activar: 403 → 404 → 409 disponible → 409 `faltan` → tarjeta (400 ajena, 409 sin tarjeta, 409 varias); 200 `+ tarjeta { marca, ultimos4 }` | igual |

## Cambios de comportamiento

- `renovacionAutomaticaDisponible()` es ahora `cardnet.activo()`: con `MERCA_CARDNET=lab` y sin llaves, apagada.
- `pedirRenovacion` ya no escribe la casilla antes de cobrar. La casilla viaja en la intención (`renovacionAutomatica: { texto, aceptada }`) solo con `cobro.procesador === 'cardnet'` y propietario, y la aplica `pagos.js` al aprobarse (06-04). Una renovación de importe cero (promoción) ya no guarda la casilla: no hay tarjeta con qué cobrarla.
- Aviso de arranque: con `MERCA_CARDNET` = `lab` o `produccion` y `cardnet.faltantes()` no vacío, `console.warn` con los NOMBRES que faltan y «CardNet queda apagado».

## Verificación

- `cardnet:probar` 395 comprobaciones, 0 fallos (secciones nuevas 17 y 18: 95 comprobaciones de API).
- Verdes sin tocar sus archivos: `pagos` (112), `transferencia` (213), `publicacion` (163), `capacidad` (132), `seguridad` (101), `bitacora` (120), `facturas`, `chat` (55).
- `renovacion:probar` 152, 0 fallos, con la preparación de la sección 5 adaptada (llaves falsas, tarjeta creada con `db.guardarMetodoPago`, y una comprobación nueva: activar con `lab` y sin tarjeta da 409 sin cambiar la casilla). Ninguna otra aserción cambió.
- `git diff` vacío sobre `tools/db.js`, `tools/pagos.js` y `tools/facturas.js`.
- Auditorías de navegador (`auditar`, `check`): no aplican a este plan; pendientes de la batería del orquestador.

## Deviations from Plan

### Ajustes

**1. [Ajuste del criterio de aceptación] `grep "c\.token\|c\.numero\|c\.tarjeta" tools/api.js` no está vacío**
- **Issue:** `c.numero` ya existía antes de este plan en dos sitios ajenos al cobro: `comprobantePublico` (`c` es una factura) y el teléfono de los contactos (`c.numero` del cuerpo, 4379 y 4448).
- **Fix:** la comprobación del arnés vigila `c.token` y `c.tarjeta` (vacío), y la sección 17 demuestra por comportamiento que un cuerpo con `token`, `numero` y `tarjeta.numero` no se guarda ni llega al banco.

**2. [Alcance] Ampliar solo retoma un pendiente de ampliación**
- Un pendiente de renovación sin cobro sigue dando 409 en `ampliar`, como hoy; no se anula desde una operación distinta. Se retoma o se anula desde la ruta de renovar.

Por lo demás, el plan se ejecutó como estaba escrito.

## Cobertura no probada en el arnés

- Rama «otro rol distinto de propietario» de `casillaDeRenovacion` (la condición `org.rol === 'propietario'` está, pero el arnés solo prueba propietario con y sin tarjeta y transferencia). La del `PUT` sí está probada (403 en `probar-renovacion.js`).

## Known Stubs

Ninguno. Falta la notificación de CardNet (06-06), la conciliación y la renovación automática que cobra (06-07/06-08) y el frontend (06-09).

## Threat Flags

Ninguno fuera del registro del plan (T-06-23 a T-06-28 mitigados y probados: pagos y tarjetas filtrados por organización, cuerpos que solo leen `metodo`/`metodoPago`/`renovacionAutomatica`, importe del servidor, pendientes sin cobro liberados, casilla solo con tarjeta y propietario, tope 10 en 10 minutos).

## Notas para 06-06

- La notificación de CardNet debe ir ANTES del bloque «Cobro con tarjeta (CardNet)» de `RUTAS`: `/api/pagos/([\w-]+)` casaría `cardnet` como id.

## Self-Check: PASSED

- FOUND: tools/api.js (`tarjetaPedida`, `extrasDeTarjeta`, `/^\/api\/pagos\/([\w-]+)\/confirmar$/`, `/^\/api\/metodos-pago$/`)
- FOUND: commits 08483d4 y 08453c2
