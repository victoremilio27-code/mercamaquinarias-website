---
phase: 04-bandeja-de-solicitudes-y-bit-cora-de-la-consola
plan: 01
subsystem: base de datos / consola de administración
tags: [bitacora, auditoria, sqlite, savepoint]
requires: []
provides: [bitacora_admin, enNombreDe, bitacora, organizacionesEnBitacora, ACCIONES_BITACORA, atendida_por]
affects: [tools/api.js (04-02), assets/admin.js (04-03, 04-04)]
tech-stack:
  added: []
  patterns: [escritura como callback dentro de SAVEPOINT, disparadores RAISE(ABORT) para solo añadir]
key-files:
  created: [tools/probar-bitacora.js]
  modified: [tools/db.js, package.json, .github/workflows/desplegar.yml]
decisions:
  - "La bitácora es de solo añadir en la propia base (disparadores BEFORE UPDATE/DELETE) y sin claves foráneas."
  - "enNombreDe es la única puerta; la escritura va como callback en el mismo SAVEPOINT que la anotación."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 4 Plan 01: bitácora de administración en la base

Tabla `bitacora_admin` de solo añadir (dos disparadores que abortan UPDATE y DELETE), una sola puerta transaccional `db.enNombreDe` con SAVEPOINT, `resolverSolicitud` anidable, y `atendida_por` en las solicitudes de servicio; todo cubierto por `npm run bitacora:probar` en el job `pruebas` de CI.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | a61a935 | Migración `2026-09-bitacora-admin`, `enNombreDe`, `bitacora`, `organizacionesEnBitacora`, SAVEPOINT en `resolverSolicitud`, `atendida_por` |
| 2 | 7177384 | `tools/probar-bitacora.js` (34 comprobaciones), script y paso de CI |

## Verificación

- `bitacora:probar` 34 bien, 0 mal; `seguridad:probar` 71/0; `dealer:probar` 49/0; `facturas:probar` «Todo correcto».
- Comprobado a mano: con el `RAISE` del disparador de UPDATE quitado, la prueba sale 1 (dos MAL). Deshecho.

## Deviations from Plan

**1. [Rule 1 - Bug] El comentario de `enNombreDe` citaba la sentencia literal**
- La comprobación 10 (una sola puerta) contaba dos apariciones en `db.js`: la sentencia y el comentario que la nombraba. Se reescribió el comentario sin la cadena literal. Commit 7177384.

Sin trozos ajenos que separar: el trabajo va en su propio worktree y rama.

## Pregunta abierta para Victor (D-01)

¿**Anular un comprobante** debe ir por la bitácora? Hoy queda como escritura propia de la plataforma: la nota de crédito la emite la plataforma sobre su propio documento fiscal, y meterla en `enNombreDe` exige anidar la transacción de NCF de `tools/facturas.js` (territorio de la fase 3).

## Self-Check: PASSED
