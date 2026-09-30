---
phase: 06-cardnet-construido-probado-y-apagado
plan: 08
subsystem: pagos
tags: [cardnet, renovacion-automatica, tareas, correo, consola]

requires:
  - phase: 06-cardnet-construido-probado-y-apagado
    provides: "06-04 (PROCESADORES.cardnet con intencionAplicable, resolver, reprogramarRenovacion) y 06-06 (reconciliar y la tarea diaria)"
provides:
  - "pagos.referenciaCobro, pagos.cobroDeRenovacion y pagos.renovarAutomaticas"
  - "Consultas de db.js para renovar, avisar y vigilar tarjetas"
  - "Tareas renovar y avisar-tarjetas en la tanda diaria"
  - "Tres correos: enviarRenovacionProxima, enviarRenovacionRechazada, enviarTarjetaPorVencer"
  - "Marca Automática / Manual en la consola de solo lectura"
affects: [06-09, 06-10]

tech-stack:
  added: []
  patterns:
    - "Calendario por días: proximo_cargo se compara por su día (AAAA-MM-DD, UTC) con el día de ahora"
    - "El intento se anota ANTES de cobrar; la consulta ya no devuelve la suscripción hasta el día siguiente"
    - "Los avisos se anotan solo si el correo se entregó"

key-files:
  created: []
  modified:
    - tools/pagos.js
    - tools/db.js
    - tools/api.js
    - tools/tareas.js
    - tools/correo.js
    - tools/probar-cardnet.js
    - assets/admin.js

key-decisions:
  - "Renovar a mano y renovar solo salen de la misma pagos.cobroDeRenovacion; el importe es precios.precioRenovacion con el precio vigente, ningún precio nuevo"
  - "Los tres intentos se comparan por DÍA, no por horas: la tarea a las 00:03, 06:00 o 23:58 los deja en fin−3, fin−2 y fin−1 sin saltar ni repetir"
  - "Con importe cero (la promoción de lanzamiento) la renovación automática renueva por db.renovarSinCosto, sin llamar a CardNet ni emitir comprobante"
  - "Un solo anuncio se nombra en el concepto solo cuando la suscripción es de un cupo (anuncios_incluidos = 1); la capacidad del dealer nombra las publicaciones"
  - "Los avisos 7/3/1 de la 05.3 se omiten solo con CardNet activo y la renovación automática usable; apagado salen como hoy"

requirements-completed: [PAGO-04, PAGO-06, PAGO-07, PAGO-08]

duration: ~1h
completed: 2026-09-30
---

# Phase 6 Plan 08: renovación automática en el servidor

**Con la casilla de la 05.3 y una tarjeta usable, la suscripción (una publicación del particular o la capacidad del dealer) se renueva sola por el mismo `purchase` del primer cobro, al precio de la renovación manual, con aviso a 7 días, tres intentos a fin−3, fin−2 y fin−1 y un correo por rechazo.**

## Tareas

| Tarea | Nombre | Commit |
|-------|--------|--------|
| 1 | Una sola construcción del cobro de renovar y la renovación automática | ab27a13 |
| 2 | Tareas diarias, tres correos y los avisos 7/3/1 que se sustituyen | 61fc0e3 |
| 3 | La consola de solo lectura distingue la renovación automática | 9aa3e48 |

(La tarea 1 incluye todas las consultas de `db.js`, también las que usa la tarea 2, porque van en el mismo archivo. Un ajuste de redacción de los correos entró aparte en d96bfd5.)

## Calendario exacto

| Cuándo | Qué |
|--------|-----|
| Al aprobarse una renovación o activar la casilla | `proximo_cargo` = `fin` − 3 días, `renovacion_intentos` = 0 (06-02 y 06-04, sin tocar) |
| Cualquier pasada con `fin` a 7 días o menos | Aviso de 7 días, una vez por ciclo (`renovacion_avisada` = `fin` avisado); si la tarjeta ya no sirve o el plan ya no se ofrece, el aviso dice que NO se podrá renovar sola |
| Día de `proximo_cargo` (fin − 3), a cualquier hora | Intento 1 |
| Día siguiente (fin − 2) | Intento 2, si el 1 fue rechazado |
| Día siguiente (fin − 1) | Intento 3, si el 2 fue rechazado; queda `proximo_cargo` NULL |
| `fin` | Sin cuarto intento; `vencerSuscripciones` la vence como siempre |
| Aprobado cualquier intento | `confirmarPago` alarga `fin` desde el fin anterior, una factura, B02 +1, `reprogramarRenovacion` |

Todo por días: `suscripcionesPorRenovar` compara `substr(proximo_cargo, 1, 10)` con el día de `ahora`; `anotarIntentoRenovacion` deja el siguiente al comienzo del día que sigue (00:00 UTC) mientras sea anterior al día de `fin`. Probado con `fin` a las 23:50 y la tarea a las 00:03, 06:00 y 23:58 de cada día simulado.

## Firmas

```js
// tools/pagos.js
referenciaCobro()                                   // 'TE-AAAA-XXXXXX'; api.js ya no define la suya
cobroDeRenovacion(s, { idAnuncio = null, cliente, correoCliente, automatica = false, renovacionAutomatica = null })
  // -> { cobro, intencion }; misma fórmula, concepto e intención que armaba pedirRenovacion
  // automatica: true marca la intención; renovacionAutomatica ({ texto, aceptada }) es la casilla de una renovación manual
renovarAutomaticas({ ahora = new Date() } = {})
  // apagado -> { apagado: true }
  // -> { revisadas, cobradas: [{ idSusc, idPago, referencia, total }], gratuitas: [{ idSusc, referencia }],
  //      rechazadas: [{ idSusc, idAnuncio, correo, nombre, concepto, motivo, intento, quedan, fin }],
  //      pendientes: [{ idSusc, idPago, referencia }], omitidas: [{ idSusc, motivo }] }

// tools/db.js
suscripcionesPorRenovar(ahora), anotarIntentoRenovacion(idSusc, ahora) // -> { intentos, proximo, quedan } | null
clienteDeRenovacion(idSusc), anuncioUnicoDeSuscripcion(idSusc)
suscripcionesPorAvisar(ahora), anotarAvisoRenovacion(idSusc, fin)
tarjetasPorVencer(ahora), anotarAvisoVencimiento(idMetodo, 'AAAA-MM')
recordatoriosPendientes(momento, { omitirAutomaticas = false })
filasDeCobros: cada fila añade automatica (boolean)
```

## Guardas

- Sin la casilla activada nunca se cobra sola (la consulta exige `renovacion_automatica = 1`).
- Se omite, con motivo, si el plan ya no se ofrece, la tarjeta no existe, no está activa o tiene tres `fallos_seguidos`.
- 05.4: no se cobra si la suscripción tiene una renovación o una ampliación pendiente; y `intencionAplicable` sigue mirándose antes de cobrar dentro de `PROCESADORES.cardnet` (sin tocar).
- El intento se anota antes de cobrar; `registrarCobro` sigue con `ux_pagos_renovacion_pendiente` y `UniqueID` por intento.

## Un ejemplo de cada correo (modo archivo)

**Aviso de 7 días** — asunto «Tu renovación automática se cobrará pronto · MercaMaquinarias»
```
Hola, María:

El 30 de octubre de 2026 intentaremos renovar tu suscripción (Renovación Estándar · 2019 Peterbilt 567 · 30 días) con Visa terminada en 4242, por RD$2,188 (ITBIS incluido).
Si no quieres que se renueve solo, apágalo en tu panel antes de esa fecha, o cambia de tarjeta.
Si la tarjeta es rechazada, te avisaremos y podrás renovar a mano.

Tu panel: https://mercamaquinarias.com/panel.html?renovar=abc
```

**Rechazo** — asunto «Tu renovación automática fue rechazada · MercaMaquinarias» (en el último intento: «No pudimos renovar tu publicación», «no lo intentaremos de nuevo»)
```
No pudimos renovar tu suscripción (Renovación Estándar · 2019 Peterbilt 567 · 30 días): intento 1 de 3. Volveremos a intentarlo mañana; te quedan 2 intentos antes del 2 de noviembre de 2026. También puedes renovarlo a mano o cambiar de tarjeta desde el panel.

Motivo del banco: La tarjeta no tiene fondos suficientes para este pago. Use otra tarjeta. No se le cobró nada.
No se te cobró nada por este intento y no se emitió comprobante.
Renovar a mano: https://mercamaquinarias.com/panel.html?renovar=abc
```

**Tarjeta por vencer** — asunto «Tu tarjeta guardada está por vencer · MercaMaquinarias»
```
Visa terminada en 4242 vence en 09/2026. Agrega una tarjeta vigente en tu panel para que tu renovación automática siga funcionando.
```
Los tres van al propietario, con marca y últimos cuatro (nunca el token), sin teléfono, WhatsApp ni «cupo», y respondiendo a `facturacion@mercamaquinarias.com`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] La promoción de lanzamiento deja toda renovación en importe cero**
- **Found during:** Tarea 1 (la prueba salió con total 0)
- **Issue:** `registrarCobro` rechaza el importe cero, así que `renovarAutomaticas` habría lanzado cada día para toda suscripción durante la promoción.
- **Fix:** con `cobro.total` 0 renueva por `db.renovarSinCosto` (el mismo camino que la renovación manual de importe cero), sin llamar a CardNet ni emitir comprobante; el retorno los lista en `gratuitas`.
- **Files modified:** tools/pagos.js
- **Commit:** ab27a13

**2. [Rule 1 - Bug] La renovación manual de importe cero no reprogramaba el próximo intento**
- **Found during:** Tarea 1
- **Issue:** solo `confirmarPago` llamaba a `reprogramarRenovacion`; `renovarSinCosto` no. Con la promoción, tras renovar a mano quedaba el `proximo_cargo` del fin anterior y la tarea diaria habría cobrado una suscripción recién renovada.
- **Fix:** `renovarSinCosto` llama a `reprogramarRenovacion` tras el COMMIT (no hace nada sin renovación automática). No toca `aprobarPago` ni `aplicarRenovacion`.
- **Files modified:** tools/db.js
- **Commit:** ab27a13

**3. [Ajuste] Comentario sin la palabra «contador» en tareas.js**
- La prueba de 06-06 corta `tareas.js` entre `reconciliarPagos` y `TAREAS` y exige que no aparezca «contador»; mis funciones nuevas caen en ese tramo, así que el comentario dice «al propietario de la cuenta y a nadie más». La prueba de 06-06 no se tocó.

**4. [Ajuste] `proximo_cargo` no se normaliza en 06-02**
- El plan pedía normalizar a comienzo de día también el `fin − 3` de `activarRenovacionConTarjeta` y `reprogramarRenovacion`. En vez de reescribir esas funciones (y sus pruebas de 06-02), la consulta compara por el DÍA de `proximo_cargo`, que da el mismo resultado.

**Total deviations:** 4 (2 correcciones, 2 ajustes). Ninguno toca precios, `facturas.js`, `admin.html` ni `aprobarPago`.

## Verificación

- `npm run cardnet:probar`: 530 comprobaciones, 0 fallos (secciones 22 y 23 nuevas: 22 y 23 de este plan).
- Verdes sin tocarlos: `renovacion:probar` (152), `pagos:probar` (112), `transferencia:probar` (213), `capacidad:probar` (132), `facturas:probar`, `recordatorios:probar` (32), `seguridad:probar` (101), `bitacora:probar` (120), `check:encoding`.
- `MERCA_DB=.tmp/tareas-seco-06-08.db node tools/tareas.js renovar avisar-tarjetas --seco` sale 0 y dice «CardNet apagado» dos veces.
- `git diff` de `tools/facturas.js` y de `admin.html` vacío.
- Pendiente de la batería del orquestador: `npm run auditar` y `npm run check` (necesitan el puerto 8080); esta ola solo tocó una línea de `assets/admin.js`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: no hay endpoints, rutas de autenticación ni tablas nuevas. La renovación automática usa las columnas de 06-02 y solo cobra con el consentimiento de la 05.3.

## Self-Check: PASSED

- FOUND: ab27a13, 61fc0e3, 9aa3e48
- FOUND: tools/pagos.js exporta referenciaCobro, cobroDeRenovacion y renovarAutomaticas
- FOUND: tools/correo.js exporta enviarRenovacionProxima, enviarRenovacionRechazada y enviarTarjetaPorVencer
- FOUND: renovar y 'avisar-tarjetas' en TAREAS antes de 'por-vencer'
