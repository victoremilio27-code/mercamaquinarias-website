---
phase: 06-cardnet-construido-probado-y-apagado
plan: 03
subsystem: seguridad
tags: [csp, cardnet, cabeceras, pci]
requires: [06-01]
provides: [tools/cabeceras.js con politicaDeContenido(), cabecerasDe(extra, { produccion }), CABECERAS_SEGURIDAD]
affects: [tools/serve.js, tools/probar-seguridad.js]
key-files:
  created: [tools/cabeceras.js]
  modified: [tools/serve.js, tools/probar-seguridad.js]
requirements: [PAGO-05, PAGO-08]
metrics:
  tasks: 2
  completed: 2026-09-30
---

# Fase 06 Plan 03: CSP condicionada por CardNet Summary

La CSP se calcula en cada petición en `tools/cabeceras.js` y solo añade `frame-src` con el origen exacto de CardNet cuando está encendido; apagado es idéntica carácter a carácter a la de antes.

## Qué se hizo

- **Tarea 1** (commit 9ea9b36): `tools/cabeceras.js` nuevo. `politicaDeContenido()` arma la lista de siempre e inserta `frame-src <origen>` justo tras `media-src` solo si `cardnet.origenCaptura()` no es null. `CABECERAS_SEGURIDAD['Content-Security-Policy']` conserva siempre la cadena apagada. `cabecerasDe(extra, { produccion })` recalcula la política en cada llamada y añade HSTS con la misma condición de antes. Sección nueva «CSP y CardNet» en `probar-seguridad.js` (con la CSP de antes copiada literal): pasó de 87 a 101 comprobaciones, 0 mal.
- **Tarea 2** (commit 15c61d7): `tools/serve.js` hace `require('./cabeceras')` y llama `cabecerasDe({}, { produccion: PRODUCCION })`; se borran solo las definiciones movidas (+4 / -60 líneas).

## CSP resultante

- **Apagado** (sin variables, `apagado`, o `lab` sin llaves):
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'`
- **Lab con las dos llaves:** la misma con `frame-src https://labservicios.cardnet.com.do` tras `media-src 'self' blob:`.
- **Producción con las dos llaves:** la misma con `frame-src https://servicios.cardnet.com.do`.
- `script-src 'self'` y `frame-ancestors 'none'` no cambian en ningún caso.

## Verificación

- `npm run seguridad:probar`: 101 bien, 0 mal.
- `node --check` de serve.js y cabeceras.js: bien; serve.js ya no contiene `frame-ancestors 'none'`.
- Servidor levantado solo en el puerto 8091 con CardNet apagado y base desechable: `curl -sI /` devolvió una `Content-Security-Policy` idéntica a la cadena de referencia. Servidor cerrado por su PID al terminar.
- Auditorías de puppeteer: no corridas (pendiente de la batería del orquestador).

## Deviations from Plan

None - plan ejecutado tal cual. Un detalle menor: se añadió el ayudante interno `armarPolitica(origen)` para que la constante `CABECERAS_SEGURIDAD` sea siempre la política apagada aunque CardNet esté encendido al cargar el módulo.

## Self-Check: PASSED

Existen tools/cabeceras.js y este SUMMARY; commits 9ea9b36 y 15c61d7 presentes. STATE.md y ROADMAP.md sin tocar.
