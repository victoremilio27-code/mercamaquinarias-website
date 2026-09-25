---
phase: 06-cardnet-construido-probado-y-apagado
plan: 01
subsystem: pagos
tags: [cardnet, tokenizacion, pci, centavos, https, interruptor]

requires:
  - phase: 05-cobro-por-transferencia-bancaria
    provides: "patrón de interruptor leído en cada llamada (tools/transferencia.js) y pagos.metodosDeCobro"
provides:
  - "tools/cardnet.js: cliente completo de la API de Tokenización, apagado tras MERCA_CARDNET"
  - "aCentavos: la única conversión a centavos del proyecto"
  - "normalizar: aprobado/rechazado/pendiente sin aprobar por duda, con redirección (D-34) y código de error (CS012)"
  - "limpiar: copia apta para registros, sin campos de tarjeta ni tokens y con 13-19 dígitos enmascarados"
  - "tools/probar-cardnet.js: arnés con doble de transporte y barrera de PCI; paso CardNet en CI"
affects: [06-02, 06-03, 06-04, 06-05, 06-06, 06-07, 06-08]

tech-stack:
  added: []
  patterns:
    - "costura module.exports._transporte: toda llamada a CardNet pasa por el objeto del módulo"
    - "barrera de PCI: nombres prohibidos armados por partes, recorrido sin excepciones (incluido el propio arnés)"
    - "contador intentosDeRed: un catch de más no puede esconder que la prueba intentó salir a la red"

key-files:
  created:
    - tools/cardnet.js
    - tools/probar-cardnet.js
    - .planning/phases/06-cardnet-construido-probado-y-apagado/06-USER-SETUP.md
  modified:
    - package.json
    - .github/workflows/desplegar.yml
    - .env.example

key-decisions:
  - "Un estado que contradice al código (Approved con ResponseCode 51, Rejected con 00) es pendiente: la duda no aprueba ni rechaza"
  - "Red caída o 5xx son pendiente aunque el cuerpo diga aprobado o rechazado; un 4xx se normaliza por su cuerpo (solo estados explícitos)"
  - "El código de error de la API (Errors[0].Code, ErrorCode o Code) se expone como `codigo` sin cambiar el resultado: CS012 llega como pendiente con codigo 'CS012' para que 06-03 pida la activación"
  - "Todo id que acaba dentro de una ruta de la API (cliente, compra, perfil) se valida con /^[\\w-]{1,64}$/ y, si no pasa, no sale a la red"
  - "urlBase() devuelve null con CardNet apagado; origenCaptura() y autorizacionEsperada() también"
  - "La barrera de PCI recorre también tools/probar-cardnet.js (el plan lo excluía): los nombres se arman por partes y así no hace falta ninguna excepción"

patterns-established:
  - "Doble de CardNet: doble([...respuestas]) o doble(fn); cada llamada queda en `llamadas` como { metodo, url, cabeceras, cuerpo }"
  - "encender(modo, cambios) / apagar() en el arnés, con llaves falsas a la vista"

requirements-completed: [PAGO-04, PAGO-05, PAGO-06, PAGO-08]

duration: 7min
completed: 2026-09-25
---

# Phase 6 Plan 01: el cliente de CardNet, completo y apagado

**`tools/cardnet.js` habla con las siete rutas de la API de Tokenización por una costura
sustituible, convierte a centavos en un único punto, nunca aprueba por duda y limpia todo lo
que iría a un registro; la barrera de PCI y el arnés corren en CI.**

## Performance

- **Duration:** ~7 min de ejecución (20:33 → 20:40 UTC)
- **Started:** 2026-09-25T20:33:28Z
- **Completed:** 2026-09-25T20:40:00Z
- **Tasks:** 3
- **Files modified:** 6 (3 nuevos)

## Firmas finales de `tools/cardnet.js`

```js
// Configuración — process.env en cada llamada
modo()                  // 'apagado' | 'lab' | 'produccion' (comparación exacta; 'LAB' = apagado)
activo()                // modo !== 'apagado' && llave pública && llave privada
faltantes()             // ['MERCA_CARDNET', 'MERCA_CARDNET_LLAVE_PUB', 'MERCA_CARDNET_LLAVE_PRIV'] — nombres, nunca valores
urlBase()               // URL de lab o producción con barra final; MERCA_CARDNET_URL solo si https; null apagado
origenCaptura()         // new URL(urlBase()).origin; null si no está activo
autorizacionEsperada()  // 'Basic ' + base64(llavePrivada + ':'); null si no está activo

// Puras
aCentavos(pesos)        // entero ≥ 0 → pesos * 100; lanza 'Importe inválido para CardNet'
normalizar(respuesta)   // → { resultado: 'aprobado'|'rechazado'|'pendiente', codigo, autorizacion,
                        //     procesadorId, referencia, motivo, redireccion? }
mensajeDeRechazo(cod)   // 05, 14, 51, 54, 57, 61, 91, CS012; desconocido → «…No se le cobró nada, no se añadió
                        //   ningún cupo y no se emitió comprobante.»
limpiar(obj)            // copia sin claves de tarjeta/token (salvo brand, last4, marca, ultimos4) y 13-19 dígitos → *
cuerpoCliente({ correo, nombre, rnc })   // { Email, FirstName, DocumentNumber? }            [POR CONFIRMAR EN LAB]
perfilesDe(cliente)     // [{ perfilId, token, marca, ultimos4, venceMes, venceAnio, activo }]   [POR CONFIRMAR EN LAB]
cuerpoCompra({ token, pago })  // { TrxToken, Order, UniqueID, Amount, Currency:'DOP', Capture:true,
                               //   DataDo:{ Invoice, Tax } } — Order = UniqueID = Invoice = pago.referencia
compraDeNotificacion(cuerpo)   // id de compra (ResourceObject.PurchaseId o final de ResourceUrl) | null

// Llamadas — apagado: { ok: false, motivo: 'apagado' } sin tocar el transporte
crearCliente(datos)        // → { ok: true, clienteId } | { ok: false, estado, fallo }
verCliente(id)             // → { ok, clienteId, urlCaptura, sesion, perfiles }  (urlCaptura con key= pública y session_id=)
cobrar({ token, pago })    // → { ok, estado, resultado, codigo, autorizacion, procesadorId, referencia, motivo,
                           //     redireccion?, crudo (limpio), fallo? }
consultarCompra(id)        // misma forma que cobrar
devolver(id)               // → { ok, estado, codigo, crudo, fallo? }   (sin ruta que la use: diferido)
activarPerfil({ clienteId, token, codigo })   // → { ok, estado, codigo, crudo, fallo? }
borrarPerfil({ clienteId, perfilId })         // → { ok, estado, codigo, crudo, fallo? }

_transporte({ metodo, url, cabeceras, cuerpo })  // real: https, timeout 20 s → { estado, cuerpo, fallo? }; nunca lanza
```

Reglas de `cobrar`/`consultarCompra`: estado 0 o ≥ 500 → `pendiente` (aunque el cuerpo diga
otra cosa); 2xx y 4xx → lo que diga `normalizar`, que solo aprueba o rechaza con un estado
explícito.

## Forma del doble (para 06-02 en adelante)

```js
sinRed();                         // transporte que cuenta intentosDeRed y lanza (se pone al cargar)
encender('lab'); apagar();        // llaves 'llave-publica-de-prueba' / 'llave-privada-de-prueba'
doble([{ estado: 200, cuerpo: {...} }, ...]);   // cola de respuestas, en orden
doble((op) => ({ estado, cuerpo }));             // o una función por llamada
llamadas  // [{ metodo, url, cabeceras, cuerpo }] de la última instalación del doble
```

El arnés comprueba al final `intentosDeRed === 0`.

## Accomplishments

- Interruptor estricto (D-01) y URL base verificada (D-02), probados encendiendo y apagando en la misma ejecución.
- RD$2.000 viaja como `200000`; RD$2.360 con ITBIS 360 como `Amount: 236000`, `Tax: 36000`.
- `normalizar` con 15 casos de duda que salen `pendiente`; redirección solo a https del origen de CardNet.
- Barrera de PCI: 91 archivos recorridos, cero apariciones; comprobado que un archivo temporal con el nombre del código de seguridad la hace fallar.

## Task Commits

1. **Tarea 1: arnés en rojo y núcleo puro** — `1b3a8de` (test), `9e6bdca` (feat)
2. **Tarea 2: las llamadas a la API** — `1e6d21d` (test), `35d2480` (feat)
3. **Tarea 3: barrera de PCI, CI y variables** — `f8ef0ab` (feat)

## Files Created/Modified

- `tools/cardnet.js` — el cliente de CardNet (nuevo).
- `tools/probar-cardnet.js` — arnés de la fase 6, 12 secciones, 135 comprobaciones (nuevo).
- `package.json` — script `cardnet:probar` (solo `scripts`).
- `.github/workflows/desplegar.yml` — paso «CardNet» tras «Transferencia» (LF).
- `.env.example` — bloque «Cobro con tarjeta (CardNet)» con las tres variables vacías.

## Decisions Made

Las de `key-decisions`. La más importante: una contradicción entre `Status` y `ResponseCode`
es `pendiente`, no aprobado ni rechazado.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Validación de ids antes de meterlos en una ruta**
- **Found during:** Tarea 2
- **Issue:** `verCliente`, `consultarCompra`, `devolver`, `activarPerfil` y `borrarPerfil` meten un id en la ruta; un id con `../` (por ejemplo, llegado de una notificación) podría apuntar a otro recurso con la llave privada.
- **Fix:** `idValido` (`/^[\w-]{1,64}$/`); si no pasa, `{ ok: false, motivo: 'id inválido' }` sin salir a la red. `compraDeNotificacion` también lo aplica.
- **Verification:** secciones 7 y 11 del arnés.
- **Committed in:** `35d2480`

**2. [Rule 2 - Missing Critical] Código de error de la API para CS012**
- **Found during:** Tarea 2
- **Issue:** D-20 necesita reconocer CS012, que no llega como `ResponseCode`.
- **Fix:** `normalizar` lee `ErrorCode`, `Code` o `Errors[0].Code` como `codigo` si no hay `ResponseCode`, sin cambiar el resultado (pendiente).
- **Committed in:** `35d2480`

**3. [Ajuste del plan] La barrera también se recorre a sí misma**
- **Found during:** Tarea 3
- **Issue:** el plan excluía el arnés del barrido, pero el arnés escribía el nombre del campo de número de tarjeta literal en la sección de `limpiar`.
- **Fix:** ese nombre se arma por partes (`CAMPO_NUMERO`) y la barrera no excluye ningún archivo.
- **Committed in:** `f8ef0ab`

---

**Total deviations:** 3 (2 de seguridad, 1 que endurece la barrera). **Impact:** ninguno fuera del alcance; todo en `tools/cardnet.js` y el arnés.

## Issues Encountered

Ninguno.

## User Setup Required

Sí: ver [06-USER-SETUP.md](./06-USER-SETUP.md) (modo y dos llaves de Tokenización, afiliación con
`Ecommerce_COF`/`MOTO_Recurring`, URL de notificación). Hasta entonces, apagado.

## Verification

- `npm run cardnet:probar`: 135 comprobaciones, 0 fallos, sin red.
- `pagos:probar` (75) y `transferencia:probar` (173) verdes sin tocarlos.
- `grep -c "\* *100\|100 *\*\|/ *100" tools/cardnet.js` = 1.
- `git grep -n -i -E "c[v]v|card-number|expiration-date" -- tools assets db deploy '*.html'` vacío.
- `git grep MERCA_CARDNET_LLAVE` solo devuelve nombres de variable y las llaves falsas del arnés.
- `package.json` solo cambia en `scripts`.

## Next Phase Readiness

Listo para 06-02 (migración y funciones de base).

## Self-Check: PASSED

- FOUND: tools/cardnet.js, tools/probar-cardnet.js, 06-USER-SETUP.md
- FOUND: 1b3a8de, 9e6bdca, 1e6d21d, 35d2480, f8ef0ab

---
*Phase: 06-cardnet-construido-probado-y-apagado*
*Completed: 2026-09-25*
