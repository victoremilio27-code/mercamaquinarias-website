---
phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer
plan: 05
subsystem: editor de página del dealer (frontend)
tags: [pagina-dealer, soporte, bitacora]
requires: [07-03]
provides: ["modo soporte en mi-pagina.js", "franja de aviso y nota al dealer en mi-pagina.html"]
affects: [07-04 (enlace «Editar su página» abre este editor)]
key-files:
  modified: [mi-pagina.html, assets/mi-pagina.js]
decisions:
  - "Guardar un campo ya no esconde «Verla como la ven»: el estado que llega del servidor se mezcla con el que ya había en pantalla, no lo sustituye entero (deviation de la tarea 1, ver abajo)."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 7 Plan 05: el editor de la página en modo soporte

`mi-pagina.html?org=<id>` abre el mismo editor que usa el dealer, contra
`/api/admin/organizaciones/<id>/pagina…` en vez de `/api/mi-pagina…`. En modo soporte se ve la
franja «Está editando la página de <nombre> en su nombre», un campo de motivo opcional que viaja
como `motivo` en cada escritura, y ni «Publicar página» ni «Despublicar» (el estado de la página
sigue siendo decisión de la empresa). Un no-admin que abre `?org=` ve «Página no encontrada». En
modo normal, si el personal editó, el dealer ve «El equipo de MercaMaquinarias editó su página el
<fecha>».

## Commits

| Tarea | Qué |
|---|---|
| 1 | Modo soporte del editor (`767e8cb`) |
| 2 | Recorrido en navegador; ver más abajo |

La tarea 1 llegó ya hecha al recibir este plan (commit `767e8cb`); esta sesión hizo la tarea 2.

## Verificación

- `node --check assets/mi-pagina.js`: sin errores.
- `npm run check:encoding`: sin caracteres sospechosos.
- `npm run dealer:probar`: 82 bien, 0 mal (igual que al cierre de 07-03: el modo soporte reutiliza
  las rutas y núcleos ya probados; esta sesión no le añadió comprobaciones propias al arnés).
- Recorrido de navegador (tarea 2, ver abajo): 0 fallos.

## Recorrido de navegador (tarea 2)

Mismo servidor, base y sesión de administrador que el recorrido de 07-04 (ver ese SUMMARY para el
detalle de la puesta en marcha: puerto 8093, base temporal en `/tmp/fase07-nav/demo.db`,
`chrome-no-sandbox.sh` fuera del repo, script en `/tmp/fase07-nav/recorrido.js`).

**Pasos probados y resultado:**
- El administrador abre `mi-pagina.html?org=<id de Maquinarias del Caribe>`: aparece la franja de
  soporte, ni «Publicar» ni «Despublicar» son visibles.
- Escribe un motivo («Corrección de prueba del recorrido de fase 7») y cambia la descripción; al
  perder el foco el campo se guarda (el campo `descripcion` se guarda con el `blur()`).
- La bitácora recoge `pagina.editar` con `antes`/`despues` de la descripción y el motivo escrito.
- El dealer (`caribe@demo.mercamaquinarias.do`) entra a su propio `mi-pagina.html` y ve la
  descripción ya cambiada, la nota «El equipo de MercaMaquinarias editó su página el 25 de
  septiembre de 2026», y sí ve «Publicar»/«Despublicar» (uno de los dos, según si la página ya
  está publicada — la página de Maquinarias del Caribe lo estaba, así que ve «Despublicar»).
- Un dealer sin permisos de administrador que abre `?org=<id>` ve «Página no encontrada», nunca el
  editor de otra empresa.

**Pendiente de Victor:** la mirada humana en claro y oscuro. Capturas en
`/tmp/fase07-nav/capturas/08-soporte-editor.png`, `09-soporte-editado.png`, `10-dealer-editor-normal.png`,
`11-no-admin-org-no-encontrada.png` — fuera del repositorio; falta la vuelta en modo oscuro sobre
la misma sesión.

## Deviations from Plan

None - el recorrido confirmó lo que la tarea 1 ya había dejado hecho (commit `767e8cb`), sin
encontrar comportamiento distinto al descrito en el plan.

## Self-Check: PASSED
