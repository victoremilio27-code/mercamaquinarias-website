---
phase: 10-alcance-y-m-tricas-del-vendedor
plan: 02
subsystem: ficha del equipo y guardados
tags: [favoritos, compartir, whatsapp, localStorage]
requires: [10-01]
provides: [GUARDADOS, montarEnlaceGuardados, montarGuardados, "guardados.html", "i-compartir"]
affects: [tools/auditar-metricas.js (10-04)]
tech-stack:
  added: []
  patterns: [lista del comprador en localStorage con copia en memoria, botón fuera del enlace de la tarjeta]
key-files:
  created: [guardados.html]
  modified: [assets/app.js, styles.css, tools/check-links.js, tools/auditar-publico.js, tools/check-contraste.js]
decisions:
  - "Guardar anota favorito; quitar no resta."
  - "Compartir solo cuenta cuando se completa: navigator.share resuelto, o clic en WhatsApp o copia lograda."
  - "Los guardados que ya no están publicados no se borran solos; se ofrece quitarlos."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Fase 10 Plan 02: guardar y compartir desde la ficha

La ficha tiene «Guardar» (con `aria-pressed`, evento `favorito`) y «Compartir» (hoja
nativa o menú con WhatsApp y «Copiar enlace», evento `compartir`); `guardados.html`
lista lo guardado en este navegador, y la navegación enseña «Guardados (N)» cuando hay
alguno.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 1ac35d2 | `i-compartir`, módulo `GUARDADOS`, `montarEnlaceGuardados`, `accionesFichaHTML`, `montarAccionesFicha`, `copiarTexto`; los clics de contacto se escuchan por `data-canal` |
| 1 | ff20209 | Estilos de las acciones de la ficha (el primer commit salió sin ellos: el Edit no se aplicó) |
| 2 | 194f4e7 | `guardados.html`, `montarGuardados`, estilos de la lista, alta en `check-links`, `auditar-publico` y `check-contraste` |

## Verificación

- Sintaxis de `assets/app.js` comprobada con `vm.Script`.
- Por HTTP contra un servidor de demo propio (puerto 8110): `guardados.html` 200;
  `GET /api/anuncios?ids=<dos reales>,noexiste` devuelve los dos; la ficha servida lleva
  el `og:title` con equipo y precio.
- `seguridad:probar` 71/0 y `metricas:probar` 59/0.
- **No se pudo correr ningún navegador en esta sesión:** el contenedor corre como root,
  Chromium exige `--no-sandbox` y desactivar el sandbox fue denegado por la política de
  permisos. El comportamiento en navegador lo prueba `tools/auditar-metricas.js` (10-04)
  en el job `navegador` del CI.

## Desvíos del plan

- **[Regla 1 · error] Contactos contados como llamada al compartir.** Los listeners de
  contacto se colgaban de `.contactos__it`, y el menú de compartir reutiliza esa clase: un
  WhatsApp compartido se habría anotado como `telefono`. Ahora escuchan
  `.contactos [data-canal]`.

## Pendiente de Victor

- Mirar la ficha, el menú de compartir y `guardados.html` en claro y oscuro y en el
  teléfono (la hoja nativa de compartir solo existe allí).

## Self-Check: PASSED
