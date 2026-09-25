---
phase: 09-contactos-verificados-y-se-ales-de-estafa
plan: 02
subsystem: API
tags: [contactos, api, permisos, semilla]
requires: [09-01]
provides: ["GET /api/contactos", "POST /api/contactos/codigo", "POST /api/contactos/confirmar", "verAnuncio filtrado"]
affects: [assets/contactos.js (09-03), assets/app.js (09-04)]
tech-stack:
  added: []
  patterns: [filtro de privacidad en el servidor según dueño, interruptor consultado por petición]
key-files:
  created: []
  modified: [tools/api.js, tools/seed.js, tools/auditar-permisos.js, tools/probar-contactos.js]
decisions:
  - "Quien no es el dueño recibe solo teléfonos verificados, con numero, tipo, nota y via."
  - "Topes: 5 códigos por número y 20 por organización cada hora; 20 confirmaciones por IP cada 15 minutos."
  - "Si el envío falla se responde 502 y, en SMS, se sugiere el correo."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 9 Plan 02: rutas de verificación y ficha pública filtrada

Tres rutas nuevas con sesión y `verAnuncio` que esconde a los demás los teléfonos sin verificar. La semilla marca como
verificados los números de la demostración para que las auditorías del navegador sigan viendo un `tel:` en la ficha.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 1eaf1aa | Rutas, filtro en `verAnuncio`, bloque «La API» de la prueba (criterios 1, 2 y 3) |
| 2 | d85d849 | Semilla verificada y las tres rutas sin sesión en `auditar-permisos.js` |

## Verificación

- `contactos:probar` 52 bien, 0 mal.
- `seguridad:probar` 71/0, `dealer:probar` 49/0, `bitacora:probar` 72/0, `pagos:probar` 75 correctas, `facturas:probar` «Todo correcto».
- Auditorías del navegador (taxonomía, pública, flujos, permisos, contraste, enlaces, movimiento) contra un servidor propio en 8097
  con base temporal: 0 hallazgos. «contacto visible: sí» en la ficha de la demo.

## Deviations from Plan

- **Entorno de las auditorías:** Chrome como root en el contenedor necesita `--no-sandbox` y la CA del proxy de salida rompe
  Google Fonts. Se corrió con un envoltorio local de Chrome (`PUPPETEER_EXECUTABLE_PATH`) que añade `--no-sandbox` e ignora el
  certificado del proxy. No se tocó ninguna auditoría; los puertos se cambiaron en copias temporales que se borran al terminar.

## Self-Check: PASSED
