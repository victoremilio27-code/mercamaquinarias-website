---
phase: 08-moneda-y-disponibilidad-en-el-cat-logo
plan: 01
subsystem: catálogo público / consola de administración
tags: [catalogo, moneda, tasa, sqlite]
requires: []
provides: [PRECIO_EN_PESOS, tasaUsd, precioEnPesos, tasaValida, TASA_USD_POR_DEFECTO, /api/admin/tasa-cambio, tools/probar-catalogo.js]
affects: [08-02, 08-03]
tech-stack:
  added: []
  patterns: [expresión SQL con parámetro enlazado en vez de columna derivada, parámetros filtrados por sentencia (soloUsados)]
key-files:
  created: [tools/probar-catalogo.js]
  modified: [assets/precios.js, tools/db.js, tools/api.js, admin.html, assets/admin.js, equipos.html, assets/app.js, package.json, .github/workflows/desplegar.yml]
decisions:
  - "Se compara en pesos con una expresión CASE y la tasa como parámetro; se descartó una columna precio_dop porque cada vía de inserción tendría que mantenerla."
  - "Tasa: ajuste tasa_usd → MERCA_TASA_USD → 63 (valor de partida, no oficial). Rango admitido 20-200."
  - "Cambiar la tasa es escritura propia de la plataforma (ESCRITURAS_ADMIN_PROPIAS), no va a la bitácora."
metrics:
  completed: 2026-09-25
  tasks: 3
---

# Phase 8 Plan 01: el precio se compara en pesos

El filtro `precioMin`/`precioMax` y los órdenes `precio-asc`/`precio-desc` comparan en
pesos: los anuncios en US$ se convierten con una tasa de referencia que fija un
administrador en /admin.html. Lo que se muestra no cambia: cada anuncio sigue en su
moneda.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | a1d7c38 | `TASA_USD_POR_DEFECTO`, `tasaValida`, `precioEnPesos` en precios.js; `tasaUsd()`, `PRECIO_EN_PESOS`, `soloUsados` y `tasa_usd` en db.js |
| 2 | 19666f4 | `tools/probar-catalogo.js`, script `catalogo:probar`, paso «Catalogo» en CI |
| 3 | b333f5a | `GET/PATCH /api/admin/tasa-cambio`, sección en admin.html, nota en equipos.html |

## Verificación

- `catalogo:probar` 29 bien, 0 mal (criterios 1 y 2 del ROADMAP literales).
- Mutación comprobada: con `'precio-asc'` devuelto a `a.precio ASC` la prueba sale con 2 MAL.
- `bitacora:probar` 73/0 (la guarda sobre RUTAS reconoce la ruta nueva), `seguridad:probar` 71/0, `dealer:probar` 49/0.

## Deviations from Plan

**1. [Rule 1 - Bug en la prueba] La búsqueda de texto de control no encontraba nada**
- Buscaba «prueba», que no está en ningún campo buscable. Cambiada a «caterpillar». Mismo commit 19666f4.

## Pendiente de Victor

- **Fijar la tasa de referencia del dólar** en /admin.html → «Tasa de referencia del
  dólar». Hasta entonces el catálogo compara a RD$63 por US$, que es un valor de partida
  razonable pero no la tasa oficial del día.
- Si quiere la tasa del Banco Central automática cada día, es trabajo aparte (fuente
  externa); quedó como idea diferida.

## Self-Check: PASSED
