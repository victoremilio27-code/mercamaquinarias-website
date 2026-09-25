---
phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer
plan: 02
subsystem: API / base de datos
tags: [serie, bitacora, privacidad, admin]
requires: [07-01]
provides: [seriesParaRevisar, anotarRevisionSerie, anuncioSerie, normalizarSerie, "GET /api/admin/series", "POST /api/admin/anuncios/:id/serie", serie_cotejada]
affects: [07-04 (sección Números de serie), 07-06 (panel y ficha)]
key-files:
  modified: [tools/db.js, tools/api.js, tools/probar-bitacora.js, tools/probar-seguridad.js, tools/auditar-permisos.js]
decisions:
  - "Migración 2026-09-serie-revision al final de MIGRACIONES; lo que ya hay en producción queda pendiente, sin UPDATE."
  - "La bitácora guarda resultado y nota, nunca la serie."
  - "Los borradores no entran en la revisión; los vendidos y retirados sí cuentan para detectar repetidos."
metrics:
  completed: 2026-09-25
  tasks: 3
---

# Phase 7 Plan 02: revisión del número de serie

Cuatro columnas nuevas en `anuncios` (migración al final), `anuncio.serie` en el catálogo de la
bitácora, la lista de series con los repetidos detectados por la placa normalizada, y el resultado
(`conforme` / `observada` con nota obligatoria / `pendiente` para deshacer) por
`conAdminEnNombreDe`. El vendedor lo recibe en `/api/mis-anuncios` (`tiene_serie`, `serie_revision`,
`serie_nota`).

**Defecto de seguridad cerrado:** `GET /api/anuncios/:id` entregaba el número de serie a cualquier
visitante (`db.anuncio` hace `SELECT a.*` y `PRIVADOS_DEL_ANUNCIO` no lo incluía). La promesa de
`publicar.html` era falsa desde el primer día. Ahora la serie y los datos de su revisión son privados;
al público solo le llega `serie_cotejada`.

## Commits

| Tarea | Qué |
|---|---|
| 1 | Migración, catálogo, consultas y columnas en `anunciosDeOrganizacion`; `series_pendientes` real en el directorio |
| 2 | `listarSeries`, `revisarSerie`, rutas, privados ampliados y `serie_cotejada` |
| 3 | Bloque «Número de serie» en `probar-bitacora.js` (21), bloque 1b en `probar-seguridad.js` (6), dos rutas en `auditar-permisos.js` |

## Verificación

- `bitacora:probar` 108 bien, 0 mal; `seguridad:probar` 77 bien, 0 mal; `dealer:probar` 49 bien, 0 mal.
- La guarda sobre `RUTAS` clasifica `POST /api/admin/anuncios/:id/serie` como bitácora sin tocar `ESCRITURAS_ADMIN_PROPIAS`.

## Deviations from Plan

- La respuesta de `revisarSerie` es `{ ok, resultado }`: la consola recarga la lista entera tras escribir.

## Self-Check: PASSED
