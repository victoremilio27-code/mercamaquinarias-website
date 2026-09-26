---
phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer
plan: 03
subsystem: API de la página del dealer
tags: [pagina-dealer, soporte, bitacora, savepoint]
requires: [07-02]
provides: [vistaDePagina, "núcleos nucleo*", verPaginaEnNombre, "rutas /api/admin/organizaciones/:id/pagina…", editadaPorSoporte, organizacionPorId, ultimaAnotacion]
affects: [07-05 (editor en modo soporte)]
key-files:
  modified: [tools/db.js, tools/api.js, tools/probar-pagina-dealer.js, tools/auditar-permisos.js]
decisions:
  - "Un núcleo por escritura y dos envoltorios (dueño y personal): misma validación en los dos caminos."
  - "Sin publicar ni despublicar bajo /api/admin/: el estado de la página es decisión de la empresa."
  - "El dealer ve la fecha de la última edición del personal, no quién fue."
metrics:
  completed: 2026-09-25
  tasks: 3
---

# Phase 7 Plan 03: la página de un dealer, editada en su nombre

Los ocho manejadores de escritura de `mi-pagina` se partieron en núcleos `(org, cuerpo, idSub)` que
validan, escriben y devuelven `{ codigo, respuesta, antes, despues }`. Los usan `delDueno` (conPagina,
respuesta idéntica a la de antes) y `enNombreDelDealer` (`conAdminEnNombreDe('pagina.editar')` bajo
`/api/admin/organizaciones/:id/pagina…`). Un error de validación se lanza dentro del callback de
`enNombreDe`, así que no deja fila. `ordenarSecciones` y `guardarEnlaces` pasaron a `SAVEPOINT`.

## Commits

| Tarea | Qué |
|---|---|
| 1 | SAVEPOINT en dos funciones, `pagina.editar`, `ultimaAnotacion` |
| 2 | Núcleo compartido, envoltorios, nueve rutas de admin, `organizacionPorId`, `editadaPorSoporte`, comentario de `conAdminEnNombreDe` al día |
| 3 | Bloque de 33 comprobaciones en `probar-pagina-dealer.js`; dos rutas en `auditar-permisos.js` |

## Verificación

- `dealer:probar` 82 bien, 0 mal (49 de antes intactas tras el refactor + 33).
- `bitacora:probar` 116 bien, 0 mal: la guarda clasifica las ocho escrituras nuevas como bitácora.
- Mutación: con `BEGIN` en vez de `SAVEPOINT` en `ordenarSecciones`, `dealer:probar` falla. Deshecho.

## Deviations from Plan

- El `antes`/`despues` de secciones y orden se anota por **tipo de bloque**, no por id: los ids no le
  dicen nada a quien lee la bitácora. El id va en `objeto_id` salvo al crear (no existe todavía).
- Los errores 5xx de la vía del personal se registran con `console.error` y responden «Error del
  servidor», como `manejar`.

## Self-Check: PASSED
