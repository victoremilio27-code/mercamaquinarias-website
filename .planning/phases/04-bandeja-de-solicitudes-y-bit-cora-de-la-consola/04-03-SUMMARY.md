---
phase: 04-bandeja-de-solicitudes-y-bit-cora-de-la-consola
plan: 03
subsystem: consola de administración
tags: [admin, bandeja, solicitudes-servicio]
requires: []
provides: [montarBandeja, cargarBandeja, bandejaHTML, marcarBandeja]
affects: [04-04]
tech-stack:
  added: []
  patterns: [filtros de servicio desde servicios.js o desde el servidor, filtros que solo tocan a sus hermanos]
key-files:
  created: []
  modified: [admin.html, assets/admin.js]
decisions:
  - "No hizo falta tocar styles.css: las clases existentes cubren la bandeja."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 4 Plan 03: bandeja de solicitudes de servicio

Sección «Solicitudes de servicio» bajo la cola de revisión: lista alquiler, importación y contacto con referencia, fecha y hora, teléfono y correo del solicitante, detalle, nota y «Atendida el … por …»; filtros por estado (Nuevas por defecto) y por servicio (solo los que admiten solicitud), marcar, cerrar, reabrir y añadir nota sin recargar. Arreglado de paso el manejador de la cola que cambiaba el aspecto de todos los filtros de la página.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 y 2 | 2f105ae | Sección en `admin.html` y bloque de la bandeja en `assets/admin.js`, más el arreglo de D-12 |

## Verificación

- `node --check`, `check:encoding` en verde; sin `style=` ni colores literales (no se tocó `styles.css`).
- Recorrido automático con datos en 04-04 (`.tmp/fase-04/recorrido.js`): 3 nuevas, filtros correctos, transporte con «servicio apagado» en Todas, marcar/nota/reabrir, y los demás filtros de la página intactos.

## Deviations from Plan

- Las dos tareas se confirmaron en un solo commit (HTML y JS de la misma sección).
- El atributo de estado de cada tarjeta es `data-estado-sol`, para no chocar con el selector `[data-estado]` de la cola.

## Self-Check: PASSED
