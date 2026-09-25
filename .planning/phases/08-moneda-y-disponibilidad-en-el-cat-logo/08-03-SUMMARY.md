---
phase: 08-moneda-y-disponibilidad-en-el-cat-logo
plan: 03
subsystem: catálogo público
tags: [catalogo, filtros, permuta, itbis]
requires: [08-02]
provides: [filtros permuta/itbis/disponibilidad en API y equipos.html, VALOR_FILTRO, comprobaciones de fase 8 en auditar-publico]
affects: []
tech-stack:
  added: []
  patterns: [casillas GET con value="1" restauradas con checked]
key-files:
  created: []
  modified: [tools/db.js, tools/api.js, tools/probar-catalogo.js, equipos.html, assets/app.js, styles.css, tools/auditar-publico.js]
decisions:
  - "Solo el valor exacto '1' activa permuta/itbis; el cliente tampoco enseña como aplicado un valor que el servidor ignora."
  - "Rótulo «Venta» (no «Condición», que ya es el estado del equipo) para el grupo de casillas y sus chips."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 8 Plan 03: permuta, ITBIS y disponibilidad como filtros

`?permuta=1`, `?itbis=1` y `?disponibilidad=en-pais|bajo-pedido` filtran el catálogo,
solos o combinados con el precio en pesos. equipos.html los ofrece en el panel de
filtros, con chips para quitarlos.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | eaac38b | Condiciones en `filtrosCatalogo`, parámetros en `catalogo`, 9 comprobaciones nuevas |
| 2 | 652dc4c | Controles en equipos.html, chips y casillas en app.js, dos reglas de rejilla en styles.css, comprobaciones en auditar-publico |

## Verificación

- Batería hermética en verde: `catalogo:probar` 53/0, `seguridad:probar` 71/0,
  `dealer:probar` 49/0, `bitacora:probar` 73/0, `facturas:probar`, `pagos:probar` (75),
  `chat:probar` 40/0, `facturas:letras` 0 fallos, `taxonomia`, `check:encoding`.
- Sin navegador, contra el servidor sembrado (espacio de red propio): las tres páginas
  sirven sus controles nuevos, y la API con la siembra devuelve permuta (2), ITBIS (1),
  bajo pedido (1) y el anuncio en US$ dentro de «desde RD$6,000,000».
- **Pendiente: auditoría del navegador** (`npm run auditar`, `check`, `check:motion`).
  En este contenedor Chrome no arranca como root sin `--no-sandbox`, y no se tocó la
  configuración para forzarlo. La correrá el job `navegador` del CI en el Pull Request.

## Deviations from Plan

**1. [Rule 1 - UX] Rótulo «Venta» en vez de «Condición»**
- El UI-SPEC decía «Condiciones»/«Condición · Acepta permuta», que choca con el filtro
  existente «Condición» (estado del equipo). Commit 652dc4c.

**2. [Rule 2 - Crítico] Dos reglas de rejilla**
- `.campo` es una rejilla de dos columnas: la nota de la tasa (plan 01) caía en la
  columna del rótulo. Se añadieron `.campo > .campo__rotulo` y
  `.campo > .campo-v__ayuda { grid-column: 2 }`. Commit 652dc4c.

## Ejecución detenida por el orquestador

Tras este plan el orquestador cambió la instrucción: sin verificación de fase ni revisión
de código en esta sesión (las hará otro agente). Quedan pendientes: auditoría del
navegador, verificación de la fase contra el ROADMAP y revisión de código.

## Self-Check: PASSED (sin la auditoría del navegador)
