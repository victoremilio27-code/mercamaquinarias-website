---
phase: 06-cardnet-construido-probado-y-apagado
verified: 2026-09-30T00:00:00Z
status: human_needed
score: 5/5 criterios de la hoja de ruta verificados (más 8/8 decisiones R-01 a R-08)
overrides_applied: 0
human_verification:
  - test: "Certificación en lab con las credenciales de QA de CardNet (deploy/README.md §10c.6): tarjeta de prueba aprobada, rechazada (51, 54), activación de perfil y redirección 3DS"
    expected: "Aprobada activa la publicación o la capacidad y emite un NCF; rechazada no deja nada; los nombres de campo marcados [POR CONFIRMAR EN LAB] en tools/cardnet.js coinciden con lo que devuelve CardNet"
    why_human: "Las pruebas usan un doble del transporte; la red real y el formato exacto de las respuestas solo se ven contra labservicios.cardnet.com.do"
  - test: "Confirmar con CardNet que DataDo.Invoice es un número de orden del comercio y no el NCF (pregunta abierta 1 de 06-CONTEXT.md)"
    expected: "Respuesta escrita de CardNet; si fuese el NCF, no se enciende y se rediseña"
    why_human: "Depende de CardNet; cambia el diseño entero si la respuesta es la contraria"
  - test: "En lab: reenviar purchase con el mismo UniqueID y OTRO TrxToken (tarjeta distinta) sobre un pago que ya tuvo intento"
    expected: "CardNet devuelve el resultado ya obtenido y no cobra la segunda tarjeta ni responde un error que normalizar() lea como rechazo"
    why_human: "Ver la advertencia W-01: el código permite enlazar otra tarjeta a un pago con intento previo; solo el comportamiento real de CardNet dice si es inocuo"
  - test: "Modal del iframe de captura en publicar.html, planes.html y panel.html con CardNet en lab, en tema claro y oscuro"
    expected: "El formulario de CardNet se ve dentro del modal, el aviso por postMessage o el botón «Ya ingresé mi tarjeta» confirman, y la CSP no bloquea el marco"
    why_human: "Apariencia y flujo real en un navegador con pantalla contra el origen de CardNet"
---

# Fase 6: CardNet construido, probado y apagado. Informe de verificación

**Objetivo de la fase:** que la integración de cobro con CardNet esté escrita, probada y lista para certificar, entregada apagada tras un interruptor, para que el día de la afiliación sea encender y no construir.
**Verificado:** 2026-09-30, rama `claude/fervent-keller-fwbp80`, HEAD `ead620a`
**Estado:** human_needed
**Reverificación:** no, es la verificación inicial

## Cumplimiento del objetivo

### Verdades observables (criterios de la hoja de ruta)

| # | Verdad | Estado | Evidencia |
|---|--------|--------|-----------|
| 1 | Un comprador guarda una tarjeta y paga sin que número, vencimiento ni CVV pasen por el servidor; buscar `cvv` no devuelve nada | ✓ VERIFICADO | `git grep -I -i cvv` fuera de `.planning/` da 0 resultados. Las únicas coincidencias sin `-I` son bytes al azar dentro de imágenes `.webp` y `.png` de `brand_assets/`. `tools/cardnet.js` arma el nombre con `String.fromCharCode`. Captura en el iframe de CardNet (`assets/cardnet.js`); `confirmarConTarjeta` solo lee `metodoPago` (un id validado contra la organización) y el token sale de `verCliente` en CardNet, nunca del cuerpo. En el arnés, «Criterio 1» (10 OK): cuerpo con propiedades inventadas ignorado, importe tomado del pago, ninguna cadena de 13 a 19 dígitos en la base |
| 2 | Con el interruptor en `apagado`, el sitio se comporta como antes de la fase, con la transferencia intacta | ✓ VERIFICADO | `cardnet.activo()` exige modo `lab` o `produccion` más las dos llaves y se lee en cada llamada. Apagado: `metodosDeCobro()` devuelve lo mismo que en la fase 5, la notificación responde 404, la CSP es `armarPolitica(null)` sin `frame-src`, las tareas `reconciliar`, `renovar` y `avisar-tarjetas` terminan sin trabajo, los avisos 7/3/1 salen como antes (`omitirAutomaticas: false`) y el informe no tiene la sección «Pasarela de pago». En el arnés, «Criterio 2» (12 OK) cubre publicar, comprar, ampliar, renovar y la transferencia de punta a punta. Las auditorías del navegador con CardNet apagado las corrió el orquestador en verde |
| 3 | En lab, un cobro aprobado activa la publicación o la capacidad comprada y emite comprobante; uno rechazado no deja nada activado ni NCF consumido (lectura R-07) | ✓ VERIFICADO | `resolver` → `confirmarPago` es la única transición a aprobado; en el rechazo, `rechazarPago` no emite. En el arnés, «Criterio 3»: publicación aprobada con anuncio activo y B02 +1; capacidad de 5 y ampliación a 8 con NCF; publicación y capacidad rechazadas con 402, borrador intacto, sin factura y B02 igual |
| 4 | La misma notificación entregada dos veces emite un solo comprobante y un solo NCF; RD$2.000 llega como `200000` | ✓ VERIFICADO | `aCentavos` es la única multiplicación por 100 (`tools/cardnet.js:143`; el grep en `pagos.js` y `cardnet.js` no encuentra otra). `cuerpoCompra` usa `aCentavos(pago.total)` y `aCentavos(pago.itbis)`. La idempotencia sale de `aprobarPago` con `yaEstaba` y de `facturaDePago` en `emitir`. En el arnés: «primera entrega 200, B02 +1 / segunda entrega 200, la misma factura, B02 sin avanzar» y «RD$2.000 viajó como 200000» |
| 5 | Un aviso perdido se recupera solo: la conciliación encuentra el aprobado en la pasarela sin fila aprobada nuestra, completa la transición y el descuadre sale en el informe a gerencia | ✓ VERIFICADO | `pagos.reconciliar` usa `consultarCompra` si hay `procesador_id` o reenvía con el mismo `UniqueID` si hay `cobro-enviado`. Pasa por `resolver` y anota el evento `descuadre`. `db.informe().pasarela.recuperados` sale de `descuadresEntre` y `componerInforme` lo imprime. Temporizador `deploy/mercamaquinarias-pagos.timer` cada 10 minutos, y `reconciliar` también va en la tanda diaria. En el arnés, «Criterio 5» y la sección del informe real |

**Puntuación:** 5/5

### Los dos casos de dinero que pidió revisar el orquestador

| Caso | Estado | Evidencia |
|------|--------|-----------|
| Un cobro que CardNet pudo hacer nunca se da por rechazado (reenvío con intento previo) | ✓ VERIFICADO (con la advertencia W-01) | `PROCESADORES.cardnet` solo aplica la guarda `intencionAplicable` si `!db.huboIntentoDeCobro`, y el evento `cobro-enviado` se anota antes del `await`. Con un intento previo se reenvía siempre con el mismo `UniqueID`. `anularPendienteSinCobro` lanza 409 si hubo intento. La conciliación solo abandona (24 h) los pagos sin intento. La anulación de la consola se limita a transferencias (`pagoDeTransferencia`). Una red caída o un 5xx cuentan como `pendiente` (`deCompra`). `limpiarBorradores` excluye los borradores con pagos. Arnés: «con intento previo: se reenvía con el mismo UniqueID» y «aprobado-sin-aplicar y el pago nunca pasa a rechazado», tanto en `cobrar` como en `reconciliar` |
| Un aprobado sobre un pago no pendiente deja aprobado-sin-aplicar visible en el informe | ✓ VERIFICADO | `resolver`: si `confirmarPago` lanza 404/409 o devuelve un estado distinto de `aprobado`, anota un solo evento `aprobado-sin-aplicar`, sin NCF, y el pago no se rechaza. La notificación llama a `resolver` sea cual sea el estado del pago. `cobrosSinAplicar` busca por el EVENTO, no por el estado, así que sale también un pago `rechazado` (reemplazado o abandonado). `componerInforme` imprime «Cobrados sin aplicar (devolver)» con la referencia y el importe. `pagosCardnetPorReconciliar` y `pagosCardnetAtascados` lo excluyen para no contarlo dos veces. Arnés: «aviso aprobado sobre un pago reemplazado…» y «…salen en «Pasarela de pago» del informe real» |

### Decisiones de la revisión (R-01 a R-08) y de 06-CONTEXT.md

| Decisión | Estado | Evidencia |
|----------|--------|-----------|
| R-01 Migración al final, sin recrear las columnas de la 05.3 | ✓ | `2026-10-cardnet` es la última entrada de `MIGRACIONES` (va detrás de `2026-09-renovacion`). En `suscripciones` solo añade `metodo_pago_id`, `renovacion_intentos` y `renovacion_avisada`, y reutiliza `proximo_cargo`. `git diff f63bddb HEAD -- tools/db.js` no quita ninguna línea de migraciones anteriores. Los índices sobre columnas nuevas van solo en la migración. `pagos_eventos` lleva los dos disparadores RAISE(ABORT) |
| R-02 Tarjeta en todas las rutas de cobro, y un pendiente sin cobro se retoma o se anula | ✓ | `tarjetaPedida`, `extrasDeTarjeta`, `decidirPendienteSinCobro` y `retomarPendienteDeTarjeta` en `tools/api.js`. El arnés cubre borrador, plan, ampliar y renovar |
| R-03 Consentimiento de la 05.3, solo con cardnet y solo del propietario, aplicado al aprobarse | ✓ | `api.js:2806` (`c.renovacionAutomatica === true && cobro.procesador === 'cardnet' && org.rol === 'propietario'`). `confirmarPago` aplica `activarRenovacionConTarjeta` solo si `!yaEstaba`. `renovacionAutomaticaDisponible = () => cardnet.activo()` |
| R-04 Una sola construcción para la renovación manual y la automática, sin rama nueva en aprobarPago | ✓ | `pagos.cobroDeRenovacion` con `precios.precioRenovacion`; `automatica: true` solo como marca |
| R-05 Guardas de la 05.4 y aprobado-sin-aplicar | ✓ | Ver la tabla anterior. `renovarAutomaticas` omite si hay una renovación o una ampliación pendiente |
| R-06 Calendario de 7 días y fin −3/−2/−1; los avisos 7/3/1 se suprimen solo con CardNet activo | ✓ | `renovarSuscripciones` y `recordatoriosPendientes(…, { omitirAutomaticas: cardnet.activo() })` |
| R-07 Rechazo genérico sin «cupo» | ✓ | `RECHAZO_GENERICO` = «…no se activó nada y no se emitió comprobante» |
| R-08 `assets/cardnet.js` con su propio fetch; `sesion.js` sin tocar | ✓ | `assets/cardnet.js:54-59`; `sesion.js` no aparece en el diff de la fase |
| D-23 Notificación antes de la ruta genérica, timingSafeEqual y sin limitador | ✓ | `api.js:4869`; SHA-256 de las dos cabeceras más `timingSafeEqual`; sin `db.permitir` |
| D-09 Nada crudo a los registros | ✓ | `anotarEventoPago` recibe `r.crudo`, que ya pasó por `limpiar`; los `console.error` usan `cardnet.limpiar` |
| D-13 Todo el SQL en db.js | ✓ | `pagos.js`, `tareas.js` y las rutas nuevas solo llaman a funciones de `db` |

### Reglas de ./CLAUDE.md

| Regla | Estado | Evidencia |
|-------|--------|-----------|
| PCI: ningún dato de tarjeta pasa por el servidor | ✓ | Criterio 1; `guardarMetodoPago` copia solo perfil, token, marca, últimos cuatro y vencimiento |
| Con MERCA_CARDNET apagado, el sitio como antes | ✓ | Criterio 2 |
| Un comprobante emitido no se reescribe | ✓ | Ninguna ruta nueva toca `facturas`; el aprobado sin aplicar no emite; `emitir` devuelve la factura existente |
| Un aviso repetido emite un solo NCF | ✓ | Criterio 4 |
| Migración solo al final y sin recrear columnas | ✓ | R-01 |
| Nunca se envía nada automáticamente al contador | ✓ | Los correos nuevos van al propietario (`correo.js:1281`); el informe sale solo por `mandarInforme` |
| Informes a gerencia con la copia aparte | ✓ | `mandarInforme` no cambió en la fase; la sección «Pasarela de pago» va dentro del mismo informe |
| Cero dependencias | ✓ | `tools/cardnet.js` usa solo `https`; `package.json` sin dependencias nuevas |
| Sin teléfono | ✓ | `SIN_APLICAR` remite al correo y al asistente; el arnés comprueba que no hay número |

### Artefactos requeridos

| Artefacto | Estado | Detalle |
|-----------|--------|---------|
| `tools/cardnet.js` | ✓ VERIFICADO | 600 líneas, ocho llamadas y la costura `_transporte` |
| `tools/pagos.js` | ✓ VERIFICADO | `PROCESADORES.cardnet`, `resolver`, `reconciliar`, `renovarAutomaticas`, `confirmarConTarjeta` |
| `tools/db.js`, migración `2026-10-cardnet` y `db/schema.sql` | ✓ VERIFICADO | |
| `tools/cabeceras.js` | ✓ VERIFICADO | `frame-src` solo encendido |
| `tools/api.js` (rutas de cobro, confirmar, tarjetas, notificación) | ✓ VERIFICADO | |
| `tools/tareas.js` (`reconciliar`, `renovar`, `avisar-tarjetas`, «Pasarela de pago») | ✓ VERIFICADO | |
| `assets/cardnet.js` y su carga en `publicar.html`, `planes.html` y `panel.html` | ✓ VERIFICADO | |
| `deploy/mercamaquinarias-pagos.{service,timer}` y `deploy/README.md` §10c | ✓ VERIFICADO | |
| `.env.example` con las variables vacías | ✓ VERIFICADO | |
| `tools/probar-cardnet.js` y el paso «CardNet» en CI | ✓ VERIFICADO | `.github/workflows` línea 107 |

### Comprobaciones de comportamiento (arneses, sin servidor, con MERCA_DB propio y MERCA_CARDNET* borradas)

| Arnés | Resultado | Estado |
|-------|-----------|--------|
| `npm run cardnet:probar` | 579 comprobaciones, 0 fallos | ✓ PASS |
| `pagos:probar` | 112, todo correcto | ✓ PASS |
| `transferencia:probar` | 213, 0 fallos | ✓ PASS |
| `publicacion:probar` | 163, 0 fallos | ✓ PASS |
| `renovacion:probar` | 152, 0 fallos | ✓ PASS |
| `recordatorios:probar` | 32, 0 fallos | ✓ PASS |
| `capacidad:probar` | 132, 0 fallos | ✓ PASS |
| `facturas:probar` | todo correcto | ✓ PASS |
| `seguridad:probar` | 101 bien, 0 mal | ✓ PASS |
| `bitacora:probar` | 120 bien, 0 mal | ✓ PASS |
| `precios:probar` (node:test) | 0 fallos | ✓ PASS |
| `correo:probar` | pide una dirección real: es una prueba manual, no un fallo | ? SKIP |

### Cobertura de requisitos

| Requisito | Descripción | Estado | Evidencia |
|-----------|-------------|--------|-----------|
| PAGO-04 | Tokenización, y `POST /v1/api/purchase` para el primer cobro y las renovaciones | ✓ SATISFECHO | `cardnet.cobrar` es la única llamada de compra; `renovarAutomaticas` pasa por `cobrar` → `PROCESADORES.cardnet` |
| PAGO-05 | Los datos de tarjeta nunca llegan al servidor | ✓ SATISFECHO | Criterio 1 y la barrera de PCI del arnés |
| PAGO-06 | Centavos en un solo sitio, con prueba | ✓ SATISFECHO | `aCentavos`, con prueba de que no hay otro factor 100 |
| PAGO-07 | Confirmación idempotente | ✓ SATISFECHO | Criterio 4; `EN_CURSO`; índice `ux_pagos_cardnet_referencia` |
| PAGO-08 | Construido, probado y apagado tras un interruptor | ✓ SATISFECHO | Criterio 2 |

No hay requisitos huérfanos: REQUIREMENTS.md asigna a la fase 6 solo del PAGO-04 al PAGO-08. Las casillas de la tabla de REQUIREMENTS.md siguen en «Pendiente» y le toca actualizarlas al orquestador.

### Antipatrones y advertencias

| Archivo | Línea | Patrón | Gravedad | Impacto |
|---------|-------|--------|----------|---------|
| `tools/pagos.js` | 565-573 (`confirmarConTarjeta`) | **W-01.** Sobre un pago que ya tuvo intento (`cobro-enviado`), `POST /api/pagos/:id/confirmar` puede enlazar OTRA tarjeta (con `metodoPago` o capturando una nueva en `registrarTarjeta`) y después `PROCESADORES.cardnet` reenvía con el mismo `UniqueID` y otro `TrxToken`. `enlazarMetodoPago` solo mira que el pago siga `pendiente` | ⚠️ Advertencia | Si CardNet ata el `UniqueID` a la tarjeta, puede cobrar la segunda sin que se vea el primer cobro, o contestar con un error que `normalizar` lea como rechazo de un pago cuyo primer intento sí entró. La pantalla no ofrece ese camino (el panel lo muestra «confirmando con su banco»), pero la API sí lo admite. Arreglo sugerido: en `confirmarConTarjeta`, si `db.huboIntentoDeCobro(idPago)`, no enlazar ni registrar otra tarjeta; reenviar con la ya enlazada o responder 202 en espera |
| `tools/db.js` | `cobrosSinAplicar` | La lista no depende del periodo y no hay forma de marcar como devuelto un cobro sin aplicar | ⚠️ Advertencia | Cada informe repetirá para siempre los cobros ya devueltos a mano, y la cifra dejará de servir de alarma. Conviene una marca (un evento `devuelto-a-mano`) antes de encender |
| `tools/db.js` | `anotarRespuestaProcesador` (409 si el `procesadorId` es otro) | Una notificación con otro `PurchaseId` para la misma referencia hace responder 500 a la ruta, y CardNet reintentará | ℹ️ Informativo | No se pierde dinero de forma invisible: el pago sigue pendiente y sale en «atascados». Hay que revisarlo en lab |
| `tools/pagos.js` | `PROCESADORES.cardnet` (tarjeta borrada) | Si hubo intento sin `procesador_id` y el dueño borró la tarjeta, la conciliación deja el pago `pendiente` para siempre | ℹ️ Informativo | Nunca se rechaza, que es lo correcto, y sale en «Pagos con tarjeta atascados» del informe |

No hay marcadores TBD, FIXME ni XXX de deuda: las coincidencias son `TE-AAAA-XXXXXX` y `METODOS_PAGO`, falsos positivos.

### Verificación humana necesaria

1. **Certificación en lab.** Tarjetas de prueba de CardNet, aprobada y rechazada (51, 54), activación y 3DS, según `deploy/README.md` §10c.6. Se espera que coincidan los campos marcados [POR CONFIRMAR EN LAB]. Hace falta una persona porque las pruebas usan un doble y no la red.
2. **DataDo.Invoice.** CardNet tiene que confirmar por escrito que es un número de orden y no el NCF.
3. **UniqueID con otro token (W-01).** Hay que comprobar en lab que CardNet devuelve el resultado anterior sin cobrar la segunda tarjeta. Si no lo hace, se aplica el arreglo de W-01 antes de encender.
4. **Modal del iframe** en publicar, planes y panel, con tema claro y oscuro.

### Resumen

El objetivo de la fase se cumple en el código: el cliente de CardNet, la transición única, las rutas, la notificación, la conciliación, la renovación automática, las pantallas y la documentación de encendido están escritos, conectados y probados (579 comprobaciones del arnés de CardNet y todos los arneses de las fases anteriores en verde), y todo queda apagado tras `MERCA_CARDNET`. Los cinco criterios de la hoja de ruta y los dos casos de dinero de la revisión se cumplen con evidencia en el código y en el arnés. No hay bloqueos. Queda lo que por definición no se puede probar sin CardNet (la certificación en lab y la pregunta de `Invoice`) y una advertencia, W-01, que conviene cerrar o descartar en lab antes de encender.

---

_Verificado: 2026-09-30_
_Verificador: Claude (gsd-verifier)_
