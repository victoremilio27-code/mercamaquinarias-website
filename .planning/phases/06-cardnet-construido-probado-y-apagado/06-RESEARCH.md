# Phase 6: CardNet construido, probado y apagado - Research

**Researched:** 2026-09-25
**Domain:** pasarela de pago (CardNet, Tokenización / Card on File), PCI, idempotencia, conciliación
**Confidence:** ALTA en el código propio (leído línea a línea); ALTA en rutas y campos de
CardNet marcados [VERIFICADO] en `.planning/research/cardnet.md`; MEDIA en el detalle
del iframe y del cuerpo de la notificación, que no se pudo releer hoy.

## Resumen

La investigación de fondo ya está hecha y es buena: `.planning/research/cardnet.md`
(leída con puppeteer el 2026-09-25). Este documento no la repite: dice **dónde se
engancha en el código de hoy**, qué ha cambiado desde entonces (fases 3, 4 y 5) y qué
queda sin verificar.

Hoy (2026-09-25) el portal `developers.cardnet.com.do` **no es accesible desde la
sesión en la nube**: el proxy de salida de la organización rechaza el CONNECT. No se
pudo volver a leer la guía. Todo lo que dependa de un detalle no copiado en
`cardnet.md` va marcado [POR CONFIRMAR EN LAB] y queda aislado en una sola función,
para que la certificación lo ajuste en un punto.

**Recomendación principal:** construir sobre la transición única de la fase 3 sin
abrir ningún camino paralelo. CardNet es una entrada más de `pagos.PROCESADORES`; la
notificación y la reconciliación llaman a la misma resolución que `cobrar`.

## Lo que ya existe y no se reescribe

| Pieza | Dónde | Qué da |
|---|---|---|
| Transición única | `tools/pagos.js` `confirmarPago(idPago, { envolver })` | cupos + comprobante, idempotente; emisión fuera de la transacción |
| Resolución de un cobro | `tools/pagos.js` `cobrar(pago)` | procesador por nombre en tiempo de llamada; duda → `pendiente` |
| Selector de procesador | `tools/pagos.js` `metodosDeCobro()` / `procesadorDeCobro(pedido)` (fase 5, D-03) | «La fase 6 añade `cardnet` aquí» (comentario literal) |
| Alta del cobro | `tools/db.js` `registrarCobro({ idOrg, idSusc, cobro, intencion })` | fila `pendiente` con `procesador`, `referencia`, `intencion` |
| Aprobar / rechazar | `tools/db.js` `aprobarPago` (SAVEPOINT tras 05-01), `rechazarPago` | ramas `compra` y `ampliacion` |
| Rutas de cobro | `tools/api.js` `comprarMembresia` / `ampliarMembresia` (~l. 2019 y 2110) | legales, RNC antes de cobrar, exención contra la base, 201/202/402 |
| Referencia | `tools/api.js` `referenciaCobro()` (~l. 1957) | `TE-AAAA-XXXXXX`, 14 caracteres |
| Idempotencia fiscal | `tools/facturas.js` `emitirPorPago` | si el pago ya tiene factura, la devuelve |
| Límite por clave | `db.permitir(clave, tope, minutos)` | patrón de `emitirCodigo`, `entrar` |
| IP real | `tools/api.js` `origen(req)` | `CF-Connecting-IP` primero |
| Tareas | `tools/tareas.js` `TAREAS` + temporizadores de `deploy/` | idempotentes; `--seco`; informes con su propio timer |
| Informe | `tools/db.js` `informe({desde,hasta})` + `tools/tareas.js` `componerInforme` | a `gerencia` con copia aparte a `facturacion` |
| CSP | `tools/serve.js` `CABECERAS_SEGURIDAD` (objeto constante, l. 60) | `default-src 'self'`, sin `frame-src` |
| Cliente HTTP a mano | `tools/chat.js` `pedir()` (l. 209), `tools/correo.js` (l. 372) | `https.request`, `timeout`, resuelve siempre (nunca lanza) |

## Esquema actual que toca la fase

- `pagos` (`db/schema.sql:540`): `id, organizacion_id, suscripcion_id, metodo_pago_id,
  subtotal, itbis, total, moneda, estado, referencia, procesador, creado, intencion,
  confirmado, actualizado`. **`referencia` no es única**: un índice `UNIQUE` sobre toda
  la columna podría fallar en producción si hay repetidas antiguas y tumbar el arranque
  (`migrar()` lanza). Por eso el índice es parcial `WHERE procesador = 'cardnet'`.
- `metodos_pago` (`db/schema.sql:525`): `token, marca, ultimos4, vence_mes, vence_anio,
  predeterminado`. Ya está bien pensada para PCI: ninguna columna admite un PAN.
- `suscripciones` (`db/schema.sql:494`): `proximo_cargo` existe y hoy va `NULL`;
  `estado` admite `impaga` pero nada lo usa (D-28 no lo estrena).
- Migraciones: array `MIGRACIONES` de `tools/db.js` (l. 50); la última hoy es
  `2026-09-bitacora-admin` (l. 881). La fase 5 puede añadir otra detrás; la de esta fase
  va **al final de lo que haya** cuando se ejecute. Cada migración corre en una
  transacción; «duplicate column» se tolera.

## Patrones a copiar

- **Interruptor leído en cada llamada:** `tools/transferencia.js` (fase 5):
  `datosTransferencia()`, `transferenciaActiva()`, `faltantes()` (nombres, nunca
  valores). `tools/cardnet.js` sigue la misma forma.
- **Costura para pruebas:** `pagos.PROCESADORES` se consulta en el momento de la
  llamada; `facturas.emitirPorPago` se llama por el objeto del módulo «para que la
  prueba pueda sustituirla». `cardnet._transporte` sigue ese criterio.
- **Arnés:** `tools/probar-pagos.js` y `tools/probar-transferencia.js`: entorno antes
  del `require('./db')`, `.tmp/<nombre>/` borrado y recreado, `ok()`, secciones
  numeradas, `N comprobaciones, M fallos`, `process.exit`. Las pruebas de API llaman a
  `api.manejar(req, res, ruta)` con un `req` falso (ver `probar-pagos.js`, secciones de
  API de 03-03).
- **Tabla de solo añadir:** disparadores de `bitacora_admin` (migración
  `2026-09-bitacora-admin`).
- **Aviso de arranque:** la fase 5 añade en `serve.js` un aviso cuando la
  transferencia está a medio configurar (05-02); CardNet hace lo mismo con
  `cardnet.faltantes()`.

## Trampas propias de este código

1. **La ruta de notificación y el orden de `RUTAS`.** `manejar()` recorre el array y se
   queda con el primer patrón que casa. `/api/pagos/cardnet/notificacion` tiene que ir
   antes que `/api/pagos/([\w-]+)/confirmar` y `/api/pagos/([\w-]+)` (que casaría
   `cardnet` como id).
2. **`leerCuerpo` lanza 400 con JSON inválido.** Para la notificación eso está bien
   (CardNet reintentará y el evento no se pierde), pero el 400 tiene que salir DESPUÉS
   de autenticar, para no enseñar a un extraño cómo responde la ruta.
3. **`manejar()` convierte excepciones en 500 «Error del servidor»**. En la
   notificación es justo lo que se quiere (CardNet reintenta); en la confirmación del
   comprador hay que responder con texto útil, no con un 500.
4. **CRLF.** Todo el repositorio es CRLF salvo `.sh`, `deploy/` y
   `.github/workflows/` (LF por `.gitattributes`). Los `.timer`/`.service` nuevos van
   en LF.
5. **`probar-transferencia.js` afirma que `procesadorDeCobro('cardnet')` lanza.** Con
   CardNet apagado sigue lanzando; si un `.env` local lo encendiera, no. Por D-32 esa
   prueba borra `MERCA_CARDNET*` del entorno antes de empezar.
6. **La reconciliación corre fuera del servidor** (proceso `tareas.js`), así que el
   `Set` de pagos en curso de D-19 no la protege: su protección es el `UniqueID` igual
   y la idempotencia de `confirmarPago`. Por eso la reconciliación solo toca pagos con
   más de 10 minutos.
7. **Emitir dentro de una transacción está prohibido** (D-04 de la fase 5): la
   resolución de CardNet llama `confirmarPago` sin `envolver`.

## [POR CONFIRMAR EN LAB] — aislado en un punto cada uno

| Detalle | Supuesto del plan | Dónde queda aislado |
|---|---|---|
| Cuerpo de `POST /v1/api/customer` | `{ Email, FirstName, LastName, DocumentNumber? }` mínimo | `cardnet.cuerpoCliente(datos)` |
| Nombres de campos de la respuesta de `purchase` | `PurchaseId`, `Status`, `ResponseCode`, `AuthorizationCode`, `Order` | `cardnet.normalizar()` |
| Forma de `PaymentProfiles` | `PaymentProfileId`, `Token`, `Brand`, `Last4`, `Expiration`, `Enabled` | `cardnet.perfilesDe(cliente)` |
| Señal de fin del iframe | `postMessage` desde el origen de CardNet | `assets/cardnet.js` `escucharFin()` + botón |
| Objeto de la notificación | `Notification { ResourceType, ResourceUrl, ResourceObject }` [VERIFICADO] con `PurchaseId` dentro | `cardnet.compraDeNotificacion()` |

## Validation Architecture

**Framework:** arnés propio con contadores (`tools/probar-cardnet.js`, nuevo), el mismo
estilo que `probar-pagos.js`; `node:test` no se usa aquí porque casi todo toca base y
API. Auditorías de navegador (puppeteer) existentes con CardNet apagado.

**Comando rápido:** `npm run cardnet:probar` (segundos; sin red).
**Batería completa:** `npm run cardnet:probar && npm run pagos:probar && npm run transferencia:probar && npm run facturas:probar && npm run seguridad:probar && npm run bitacora:probar && npm run dealer:probar && npm run chat:probar && npm run facturas:letras`,
más `npm run auditar` con el sitio arrancado.

| Criterio de la fase | Cómo se demuestra | Tipo |
|---|---|---|
| 1. Ni número, ni vencimiento, ni código de seguridad por nuestro servidor | Barrido de nombres prohibidos en el código (D-08); la confirmación ignora un token del navegador y lo toma del `Customer` (doble); `limpiar()` enmascara 13-19 dígitos | automático |
| 2. Apagado = como antes | CSP idéntica byte a byte; `metodosDeCobro()` igual que la fase 5; notificación 404; `tareas reconciliar` no hace nada; informe idéntico sin datos; `auditar` y el resto de la batería verdes | automático |
| 3. En lab: aprobado da cupos y NCF; rechazado no deja nada | API con el doble en modo `lab`: 201 con NCF / 402 con B01/B02 sin avanzar y sin membresía | automático (doble) + manual en lab con credenciales |
| 4. Aviso doble = un NCF; RD$2.000 → `200000` | Notificación entregada dos veces → una factura, B02 +1; cuerpo capturado por el doble con `Amount: 200000` | automático |
| 5. Aviso perdido se recupera y sale en el informe | Pago aprobado en el doble, pendiente en la base → `reconciliar` lo aprueba, emite una vez, anota `descuadre`; `componerInforme` lo lista | automático |

**Manual (con credenciales de QA):** abrir el iframe real en `lab`, capturar una
tarjeta de prueba, ver aprobado y rechazado, recibir la notificación en el VPS.
No bloquea la fase: se hace el día que lleguen las credenciales.

## Sources

- `.planning/research/cardnet.md` (2026-09-25) y las URL que cita.
- Código leído: `tools/pagos.js`, `tools/db.js` (MIGRACIONES, `informe`), `tools/api.js`
  (RUTAS, `manejar`, `comprarMembresia`, `ampliarMembresia`, `origen`, `conSesion`),
  `tools/serve.js` (CSP), `tools/tareas.js`, `tools/chat.js`, `deploy/*.timer|service`,
  `db/schema.sql`, planes de la fase 5.
- Intento de relectura de `developers.cardnet.com.do` el 2026-09-25: bloqueado por el
  proxy de salida (CONNECT 403).

## RESEARCH COMPLETE
