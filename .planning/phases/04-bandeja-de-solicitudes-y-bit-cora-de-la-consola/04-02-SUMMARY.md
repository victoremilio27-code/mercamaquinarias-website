---
phase: 04-bandeja-de-solicitudes-y-bit-cora-de-la-consola
plan: 02
subsystem: API de administración
tags: [bitacora, api, permisos]
requires: [04-01]
provides: [conAdminEnNombreDe, ESCRITURAS_ADMIN_PROPIAS, "GET /api/admin/bitacora", "RUTAS exportado"]
affects: [assets/admin.js (04-04), fases 5 y 7]
tech-stack:
  added: []
  patterns: [envoltorio que inyecta ctx.enNombreDe y marca la ruta, guarda sobre RUTAS en la prueba]
key-files:
  created: []
  modified: [tools/api.js, tools/probar-bitacora.js, tools/auditar-permisos.js]
decisions:
  - "conAdminEnNombreDe fija admin, acción e IP; el manejador no puede falsearlos."
  - "Toda escritura bajo /api/admin/ está en la bitácora o en ESCRITURAS_ADMIN_PROPIAS; la guarda lo exige en CI."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 4 Plan 02: la API escribe en nombre de otro solo por la puerta

`verificarOrganizacion` y `resolverSolicitud` pasan por `conAdminEnNombreDe`; `GET /api/admin/bitacora` es la única ruta sobre la bitácora; `ESCRITURAS_ADMIN_PROPIAS` clasifica las otras 11 escrituras de admin, y una guarda en `probar-bitacora.js` rompe la barrera si aparece una sin clasificar.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 5a8876f | `conAdminEnNombreDe`, sello y alta por la puerta, `listarBitacora`, `ESCRITURAS_ADMIN_PROPIAS`, `atendida_por` y 404 en el PATCH, `servicios` en el listado, exportación de `RUTAS` |
| 2 | 5e9632d | Bloque «La API» y guarda en `probar-bitacora.js`; cuatro rutas más en `auditar-permisos.js` |

## Verificación

- `bitacora:probar` 72 bien, 0 mal (34 de la base + 38 de la API y la guarda, 13 escrituras clasificadas).
- Comprobado a mano: con `verificarOrganizacion` en `conAdmin` a secas, la prueba sale 1 (cinco MAL, incluida «SIN CLASIFICAR»). Deshecho.
- `seguridad:probar` 71/0, `dealer:probar` 49/0, `facturas:probar` «Todo correcto».
- `auditar-permisos` corrido en 04-04 contra un servidor propio en 8092 arrancado después de los cambios: 0 fallos, con las cinco comprobaciones nuevas en verde.

## Deviations from Plan

- **Puerto de la auditoría:** el plan hablaba de 8080; por encargo del coordinador se usó 8092 (8080 y 8091 son de otros agentes). Las auditorías tienen el puerto escrito en el código, así que se corrieron desde copias en `.tmp/fase-04/aud/` con 8080→8092, sin tocar los originales.
- **Saltos de línea de `tools/api.js`:** un `sed -i` de Git Bash dejó la copia de trabajo en LF. El contenido confirmado es idéntico (el índice guarda LF); después del commit se volvió a sacar el archivo del repositorio y la copia de trabajo quedó en CRLF otra vez. Sin efecto en el historial.

## Self-Check: PASSED
