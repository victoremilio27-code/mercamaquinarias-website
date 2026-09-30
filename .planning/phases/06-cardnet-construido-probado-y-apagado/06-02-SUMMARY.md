---
phase: 06-cardnet-construido-probado-y-apagado
plan: 02
subsystem: base-de-datos
tags: [cardnet, migracion, sqlite, tokenizacion, pci, conciliacion]

requires:
  - phase: 06-cardnet-construido-probado-y-apagado
    provides: "06-01: tools/cardnet.js y el arnés probar-cardnet.js"
  - phase: 05.3
    provides: "renovacion_automatica, renovacion_aceptada, renovacion_texto y proximo_cargo sin escribir"
provides:
  - "Migración 2026-10-cardnet (última de MIGRACIONES) y su reflejo en db/schema.sql"
  - "Funciones de base de CardNet en tools/db.js (todo el SQL, D-13)"
  - "Secciones 13 y 14 del arnés probar-cardnet.js"
affects: [06-03, 06-04, 06-05, 06-06, 06-07, 06-08, 06-09]

tech-stack:
  added: []
  patterns:
    - "Tabla de solo añadir con disparadores RAISE(ABORT) (pagos_eventos), como bitacora_admin"
    - "Índice único parcial por procesador: clave de idempotencia sin tumbar datos antiguos"
    - "Borrado lógico de tarjetas para que los pagos sigan apuntándoles"

key-files:
  created: []
  modified:
    - tools/db.js
    - db/schema.sql
    - tools/probar-cardnet.js

key-decisions:
  - "proximo_cargo es la fecha del próximo intento de la renovación automática (fin - 3 días); no se creó ninguna columna nueva para ello"
  - "La migración no recrea renovacion_automatica, renovacion_aceptada ni renovacion_texto (los creó 2026-09-renovacion)"
  - "Los tres índices sobre columnas nuevas de tablas existentes van solo en la migración, no en schema.sql"
  - "Borrar una tarjeta es lógico y apaga las renovaciones automáticas que la usaban (renovacion_automatica = 0, proximo_cargo NULL), conservando metodo_pago_id"
  - "Volver a guardar un perfil borrado lo recupera (borrado = NULL): el índice único por perfil incluye las borradas"
  - "aprobarPago y guardarRenovacionAutomatica no se tocaron; intencionAplicable replica sus condiciones"

patterns-established:
  - "eventosDePago devuelve las filas con cuerpo ya analizado como JSON (si no es JSON queda el texto)"
  - "pagosCardnetPorReconciliar acepta ahora como Date, ISO o milisegundos y excluye los aprobado-sin-aplicar"

requirements-completed: [PAGO-04, PAGO-05, PAGO-07]

duration: ~25min
completed: 2026-09-30
---

# Phase 6 Plan 02: la base sabe guardar lo que CardNet devuelve

**Migración `2026-10-cardnet` al final de `MIGRACIONES` (sin duplicar el consentimiento de la 05.3) y 18 funciones nuevas en `tools/db.js`: tarjetas sin token hacia el navegador, rastro de solo añadir, referencia única por cobro de pasarela y la guarda de la 05.4 antes de cobrar.**

## Tareas

| Tarea | Nombre | Commit |
|-------|--------|--------|
| 1 | Migración 2026-10-cardnet y su reflejo en schema.sql | dd383d4 |
| 2 | Funciones de base para clientes, tarjetas, respuestas, eventos y consentimiento | f5c313b |

## Columnas y tablas añadidas (lista exacta)

- `pagos`: `procesador_id TEXT`, `autorizacion TEXT`, `codigo_respuesta TEXT`, `motivo TEXT`, `intentos INTEGER NOT NULL DEFAULT 0`.
- `metodos_pago`: `procesador_cliente_id TEXT`, `procesador_perfil_id TEXT`, `activo INTEGER NOT NULL DEFAULT 1`, `fallos_seguidos INTEGER NOT NULL DEFAULT 0`, `borrado TEXT`, `aviso_vencimiento TEXT` (mes `AAAA-MM`).
- `suscripciones`: `metodo_pago_id TEXT`, `renovacion_intentos INTEGER NOT NULL DEFAULT 0`, `renovacion_avisada TEXT`. Nada más.
- Tablas nuevas: `clientes_procesador (organizacion_id, procesador, cliente_id, creado; PK organizacion_id + procesador)` y `pagos_eventos (id AUTOINCREMENT, pago_id, procesador, origen, tipo, cuerpo, creado)` con `ix_pagos_eventos_pago` y los disparadores `tr_pagos_eventos_sin_cambios` / `tr_pagos_eventos_sin_borrado`.
- Índices (solo en la migración): `ux_pagos_cardnet_referencia` (único, parcial `WHERE procesador = 'cardnet'`), `ix_pagos_procesador_id`, `ux_metodos_perfil` (único parcial por organización, procesador y perfil).

**Confirmado:** `proximo_cargo` es la fecha del próximo intento de la renovación automática (`fin - 3 días`); existía desde el esquema original y ningún código lo escribía antes de `activarRenovacionConTarjeta` / `reprogramarRenovacion`.

## Firmas finales (exportadas por tools/db.js)

```js
clienteProcesador(idOrg, procesador)                          // -> clienteId | null
guardarClienteProcesador(idOrg, procesador, clienteId)        // INSERT OR IGNORE; -> clienteId guardado
guardarMetodoPago({ idOrg, procesador, clienteId, perfil })   // perfil = de cardnet.perfilesDe; copia solo campos conocidos; -> fila (con token, uso interno)
metodosPagoDe(idOrg)          // -> [{ id, marca, ultimos4, venceMes, venceAnio, activo, predeterminado }] SIN token, sin borradas
metodoPagoDe(idMetodo, idOrg) // -> fila con token | null (ajena o borrada)
activarMetodoPago(idMetodo, idOrg)                            // -> boolean; activo = 1, fallos_seguidos = 0
borrarMetodoPago(idMetodo, idOrg)                             // -> boolean; borrado lógico + apaga renovaciones que la usaban
enlazarMetodoPago(idPago, idMetodo)                           // -> boolean; solo pagos pendientes
anotarResultadoTarjeta(idMetodo, aprobado)                    // suma o pone a 0 fallos_seguidos
anotarRespuestaProcesador(idPago, { procesadorId, autorizacion, codigo, intento })  // -> pago; 409 si procesador_id distinto, 404 si no existe
anotarEventoPago({ pagoId, procesador, origen, tipo, cuerpo }) // cuerpo -> JSON (ya limpio)
eventosDePago(idPago)                                         // -> [{ ...fila, cuerpo (JSON analizado) }] por id
huboIntentoDeCobro(idPago)                                    // -> boolean (evento tipo 'cobro-enviado')
intencionAplicable(pago)      // -> { ok: true } | { ok: false, codigo: 'membresia-vencida' | 'publicacion-huerfana' | 'renovacion-huerfana' | 'plan-inexistente' | 'intencion-invalida' }
activarRenovacionConTarjeta({ idSusc, idOrg, idMetodo, texto, aceptada })  // -> boolean; aceptada por defecto = ahora()
desactivarRenovacion(idSusc, idOrg)                           // -> boolean; conserva aceptada y texto
reprogramarRenovacion(idSusc)                                 // -> boolean; intentos = 0, proximo_cargo = fin - 3 días si hay automática
pagosCardnetPorReconciliar({ minutos = 10, ahora })           // -> pendientes cardnet + { huboIntento, sinAplicar }, sin los sinAplicar
rechazarPago(idPago, { codigo, motivo } = {})                 // mismo retorno { pago, cambiado }
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Bloqueo] Comentarios de schema.sql que impedían simular la base vieja**
- **Found during:** Tarea 1 (sección 13 del arnés)
- **Issue:** `ALTER TABLE ... DROP COLUMN` de SQLite falla con «incomplete input» si el texto del `CREATE TABLE` acaba en un comentario de línea justo antes del `)` de cierre. Con mis comentarios sobre las columnas nuevas y el comentario de cola de `renovacion_texto`, no se podía reconstruir una base «anterior a la migración» para compararla con la nueva.
- **Fix:** los comentarios de las columnas nuevas van al final de cada línea y el de `renovacion_texto` se movió a la línea de `renovacion_aceptada`. Solo cambian comentarios de schema.sql, ninguna columna existente.
- **Files modified:** db/schema.sql
- **Commit:** dd383d4

Por lo demás, el plan se ejecutó tal como estaba escrito. `aprobarPago` y `guardarRenovacionAutomatica` no se tocaron; las únicas líneas borradas de `tools/db.js` son las del cuerpo antiguo de `rechazarPago`, que el plan pedía ampliar. `tools/facturas.js` sin cambios.

**Nota de entorno:** al empezar, el worktree estaba en `7edc796`, por detrás de la base indicada; se hizo `git reset --hard 6d66ba1` como pedía la comprobación de arranque.

## Verificación

- `npm run cardnet:probar`: 215 comprobaciones, 0 fallos (secciones nuevas 13: migración, y 14: funciones de base).
- Verdes sin tocar sus archivos: `pagos:probar` (112), `transferencia:probar` (213), `facturas:probar`, `renovacion:probar` (151), `capacidad:probar` (132), `bitacora:probar` (120), `seguridad:probar` (87).
- La sección 13 comprueba: migración última y anotada una vez, texto de la migración sin las columnas de la 05.3 ni `proximo_cargo`, misma estructura de `pagos`, `metodos_pago` y `suscripciones` entre una base nueva y otra vieja migrada (proceso hijo), filas antiguas intactas (dos pagos con la misma referencia, consentimiento conservado), UNIQUE solo en `cardnet`, disparadores de solo añadir, y reapertura sin reanotar.
- Finales de línea de `tools/db.js`, `db/schema.sql` y `tools/probar-cardnet.js`: LF como antes (`git ls-files --eol`).
- Auditorías de navegador: no aplican a este plan y no se corrieron (pendientes de la batería del orquestador en cualquier caso).

## Known Stubs

Ninguno. Ninguna de las funciones nuevas se usa aún desde rutas ni pagos.js: las conectan los planes 06-04 a 06-08.

## Threat Flags

Ninguno fuera del registro del plan (T-06-07 a T-06-12 mitigados: campos conocidos y sin token en la lista; disparadores; índice parcial; migración en transacción y sin recrear lo de la 05.3; filtros por organización; `intencionAplicable`).

## Antes de desplegar

Respaldo verificado de la base de producción (`VACUUM INTO` + `integrity_check`) antes de fusionar, como manda CLAUDE.md: la migración añade columnas y tablas, no reescribe filas.

## Self-Check: PASSED

- FOUND: tools/db.js (2026-10-cardnet en la última entrada; funciones exportadas)
- FOUND: db/schema.sql (pagos_eventos, clientes_procesador, tr_pagos_eventos_sin_cambios; sin ux_pagos_cardnet_referencia)
- FOUND: tools/probar-cardnet.js (secciones 13 y 14)
- FOUND: commits dd383d4 y f5c313b
