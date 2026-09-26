---
phase: 10-alcance-y-m-tricas-del-vendedor
plan: 01
subsystem: base y API de métricas
tags: [metricas, contactos, guardados, compartir, duplicar, archivos]
requires: []
provides: [contactos_anuncio, "GET /api/mis-contactos", "GET /api/anuncios?ids=", "GET /api/mis-anuncios/:id/copia", fotoParaCompartir, "compartidos en resumenOrganizacion", "rutasEnUso completo", "metricas:probar"]
affects: [assets/app.js (10-02), assets/panel.js y assets/publicar.js (10-03), tools/tareas.js (huérfanos)]
tech-stack:
  added: []
  patterns: [tabla permanente derivada del evento contado, borrado de archivos filtrado por rutasEnUso]
key-files:
  created: [tools/probar-metricas.js]
  modified: [tools/db.js, tools/api.js, tools/meta.js, package.json, .github/workflows/desplegar.yml]
decisions:
  - "contactos_anuncio es permanente y sin huella del visitante; una fila por contacto contado, igual que el agregado."
  - "El registro va dentro de anotarEvento, no en la ruta, para que nadie que escriba en la base se lo salte."
  - "?ids= vacío o todo inválido devuelve una lista vacía, nunca el catálogo entero."
  - "La copia no crea nada en el servidor: devuelve el borrador y el anuncio nuevo pasa por el cupo."
metrics:
  completed: 2026-09-25
  tasks: 3
---

# Fase 10 Plan 01: el servidor sabe atribuir, guardar, compartir y copiar

Cada contacto contado queda para siempre en `contactos_anuncio` (sin identificar al
visitante) y el dueño lo lee en `GET /api/mis-contactos`; el catálogo acepta `?ids=`
para los guardados; el resumen del panel cuenta lo compartido; la tarjeta de WhatsApp
lleva la miniatura; `GET /api/mis-anuncios/:id/copia` alimenta el duplicado, y borrar
un anuncio ya no se lleva archivos que otro usa.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 4efa7f4 | Migración `2026-09-contactos-anuncio` al final de `MIGRACIONES` con relleno desde `eventos`; `registrarContacto` desde `anotarEvento`; `contactosDeOrganizacion`; ruta `mis-contactos`; `tools/probar-metricas.js`; `metricas:probar` en `package.json` y en el job `pruebas` del CI |
| 2 | 100494e | Filtro `ids` en `filtrosCatalogo` y validación en `catalogo` (patrón, sin repetidos, tope 60); `compartidos` en `resumenOrganizacion` y `anunciosDeOrganizacion`; `fotoParaCompartir`; `meta.js` con miniatura y sin `og:image:width/height` falsos |
| 3 | 02d7b07 | `copiaDeAnuncio` y ruta `copia` antes de la genérica; `borrarAnuncio` filtra por `rutasEnUso()`; `rutasEnUso()` con logo, banner y galería del dealer |

## Verificación

- `metricas:probar` 59 bien, 0 mal.
- Mutación a mano: sin el filtro de `rutasEnUso` en `borrarAnuncio`, sale «MAL las fotos que usa la copia siguen en disco». Deshecho.
- La migración se prueba de verdad: se deshace, se dejan eventos crudos y otro proceso abre la base.
- `seguridad:probar` 71/0, `dealer:probar` 49/0, `bitacora:probar` 72/0, `pagos:probar` y `facturas:probar` «Todo correcto».

## Desvíos del plan

- **[Regla 2 · falta crítica] `rutasEnUso()` no conocía la página del dealer.** El plan ya lo
  preveía como dependencia de D-11, pero conviene subrayarlo para Victor: en producción,
  la tarea diaria `huerfanos` borra lo que no esté en ese conjunto tras 48 h, así que el
  logotipo, la portada y la galería de cualquier página de dealer subidos hasta hoy
  pueden haber desaparecido ya del disco. Arreglado aquí; **no recupera lo ya borrado**.
- Nada más.

## Pendiente de Victor

- Mirar en el VPS si a alguna página de dealer publicada le faltan el logotipo, la portada
  o fotos de galería (efecto del punto anterior antes de esta fase).

## Self-Check: PASSED
