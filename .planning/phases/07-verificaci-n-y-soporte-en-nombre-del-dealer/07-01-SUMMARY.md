---
phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer
plan: 01
subsystem: consola de administración / API
tags: [sello, verificada, bitacora, admin]
requires: []
provides: [organizacionesAdmin, listarOrganizacionesAdmin, "GET /api/admin/organizaciones"]
affects: [07-02 (series_pendientes), 07-04 (sección Empresas)]
key-files:
  modified: [tools/db.js, tools/api.js, tools/probar-bitacora.js, tools/auditar-permisos.js]
decisions:
  - "El sello solo se concede a un dealer con el alta aprobada (409); una cuenta particular tampoco lo recibe."
  - "Retirar el sello exige motivo (400); las dos reglas se comprueban dentro de enNombreDe para no dejar fila."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 7 Plan 01: directorio de empresas y sello con motivo

`GET /api/admin/organizaciones` (solo admin, sin RNC ni correo, filtros `estado` y `q` con `%`/`_`
escapados) y dos reglas nuevas en `verificarOrganizacion`: 409 si no es un dealer aprobado, 400 si
se retira sin motivo. Ninguna de las dos deja fila en la bitácora.

## Commits

| Tarea | Qué |
|---|---|
| 1 | `organizacionesAdmin`, ruta de lectura, reglas 409/400 |
| 2 | Bloque «Empresas y sello» en `probar-bitacora.js` (15 comprobaciones); ruta en `auditar-permisos.js` |

## Verificación

- `bitacora:probar` 87 bien, 0 mal (72 de la fase 4 + 15 nuevas).

## Deviations from Plan

- `series_pendientes` sale como `0` fijo en este plan en vez del `PRAGMA table_info` condicional:
  la columna nace en 07-02, que se ejecuta justo después en la misma rama, y allí se sustituye por
  la subconsulta real. Evita código de compatibilidad que viviría un commit.
- `LIKE` sin `COLLATE NOCASE`: LIKE ya ignora mayúsculas en ASCII y la cláusula junto a `ESCAPE` era ambigua.

## Self-Check: PASSED
