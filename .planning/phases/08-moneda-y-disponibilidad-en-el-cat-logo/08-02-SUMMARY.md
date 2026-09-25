---
phase: 08-moneda-y-disponibilidad-en-el-cat-logo
plan: 02
subsystem: catálogo, publicación y panel del anunciante
tags: [catalogo, disponibilidad, migracion]
requires: [08-01]
provides: [anuncios.disponibilidad, DISPONIBILIDADES, guardarDisponibilidad, PATCH /api/anuncios/:id/disponibilidad, disponibilidadHTML]
affects: [08-03]
tech-stack:
  added: []
  patterns: [columna de dos valores con CHECK añadida por ALTER, PATCH del dueño con 404 al ajeno]
key-files:
  created: []
  modified: [tools/db.js, tools/api.js, tools/seed.js, tools/probar-catalogo.js, publicar.html, assets/publicar.js, assets/app.js, assets/panel.js, styles.css]
decisions:
  - "Migración 2026-09-anuncios-disponibilidad al final de MIGRACIONES; db/schema.sql no se toca (las bases nuevas pasan por las migraciones)."
  - "Los anuncios existentes quedan 'en-pais': se publicaron con «Provincia donde se encuentra» obligatoria."
  - "Sin campo de plazo de entrega: la ficha de un anuncio bajo pedido pide confirmarlo con el vendedor."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 8 Plan 02: en el país o bajo pedido

Cada anuncio declara si la máquina ya está en República Dominicana o es bajo pedido. Se
elige al publicar, se cambia desde el panel sin republicar, la ficha lo dice bajo la
ubicación y en la ficha técnica, la tarjeta marca «Bajo pedido» y la API filtra con
`?disponibilidad=en-pais|bajo-pedido`.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 9b27e3c | Migración, `crearAnuncio`, `guardarDisponibilidad`, filtro, SELECT de tarjeta y panel, API, siembra, 15 comprobaciones nuevas |
| 2 | 5d88195 | Selector en publicar, ficha, tarjeta, panel, regla `.detalle__disponibilidad` |

## Verificación

- `catalogo:probar` 44 bien, 0 mal; `seguridad:probar` 71/0; `dealer:probar` 49/0; `bitacora:probar` 73/0.
- Migración probada sobre una base creada y sembrada con el código de `origin/main`
  (18 anuncios): todos quedan «en-pais», `PRAGMA integrity_check` = ok, y la búsqueda
  por precio responde.

## Deviations from Plan

**1. [Rule 2 - Crítico] Regla de estilo para el párrafo de la ficha**
- El UI-SPEC decía «sin componentes nuevos», pero no había clase para un párrafo bajo la
  ubicación. Se añadió `.detalle__disponibilidad` (dos líneas, con variables de tema) en
  `styles.css`. Commit 5d88195.

La siembra ganó además `permuta`/`itbisIncluido` (lo que el plan 03 necesita para la
auditoría del navegador); estaba previsto en este plan.

## Pendiente de Victor (visual)

- Mirar a ojo la ficha de un anuncio bajo pedido y la marca en la tarjeta, en móvil y en
  tema oscuro.

## Self-Check: PASSED
