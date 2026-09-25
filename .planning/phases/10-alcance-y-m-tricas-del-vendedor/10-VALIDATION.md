---
phase: 10
slug: alcance-y-m-tricas-del-vendedor
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-25
---

# Fase 10 — Estrategia de validación

## Infraestructura

| Propiedad | Valor |
|-----------|-------|
| **Marco** | Arnés propio con contadores y `process.exit` (`tools/probar-*.js`) y puppeteer (`tools/auditar-*.js`) |
| **Configuración** | ninguna; el arnés fija `MERCA_DB` antes de `require('./db.js')` |
| **Comando rápido** | `npm run metricas:probar` |
| **Suite completa** | todos los `*:probar` + `npm run facturas:letras`; con servidor de demo, `npm run auditar` y `npm run check` |
| **Duración estimada** | ~10 s rápido, ~3 min completo |

## Muestreo

- **Tras cada tarea:** `npm run metricas:probar` (y `seguridad:probar` si se tocó `anotarEvento` o `evento`).
- **Tras cada plan:** la suite completa del arnés.
- **Antes de verificar la fase:** suite completa + auditorías de navegador en verde.

## Mapa por tarea

| Tarea | Plan | Ola | Requisito | Amenaza | Comportamiento seguro | Tipo | Comando | Existe | Estado |
|-------|------|-----|-----------|---------|-----------------------|------|---------|--------|--------|
| 10-01-01 | 01 | 1 | MET-03 | T-10-01 | contactos sin huella; solo la organización dueña | arnés | `npm run metricas:probar` | ❌ W0 | ⬜ |
| 10-01-02 | 01 | 1 | MET-01, MET-02 | T-10-02 | `ids` validados y parametrizados | arnés | `npm run metricas:probar` | ❌ W0 | ⬜ |
| 10-01-03 | 01 | 1 | MET-04 | T-10-03 | copia 404 a quien no es dueño; archivos en uso no se borran | arnés | `npm run metricas:probar` | ❌ W0 | ⬜ |
| 10-02-01 | 02 | 2 | MET-01, MET-02 | T-10-04 | texto del usuario escapado con `esc` | navegador | `node tools/auditar-metricas.js` | ❌ W0 | ⬜ |
| 10-02-02 | 02 | 2 | MET-01 | — | N/A | navegador | `npm run check` | ✅ | ⬜ |
| 10-03-01 | 03 | 2 | MET-03 | T-10-04 | nombres de equipo escapados | navegador | `node tools/auditar-metricas.js` | ❌ W0 | ⬜ |
| 10-03-02 | 03 | 2 | MET-04 | — | N/A | navegador | `node tools/auditar-metricas.js` | ❌ W0 | ⬜ |
| 10-04-01 | 04 | 3 | MET-01..04 | — | N/A | navegador | `npm run auditar` | ❌ W0 | ⬜ |

## Ola 0

- [ ] `tools/probar-metricas.js` y el script `metricas:probar` (plan 10-01).
- [ ] `tools/auditar-metricas.js` dentro de `npm run auditar` (plan 10-04).

## Solo manual

| Comportamiento | Requisito | Por qué manual | Instrucciones |
|----------------|-----------|----------------|---------------|
| La vista previa real en WhatsApp muestra foto, título y precio | MET-02 | El rastreador de WhatsApp solo llega a producción | Tras desplegar, enviar por WhatsApp el enlace de una ficha con fotos subidas y mirar la tarjeta |
| Aspecto de los botones y de la sección de contactos en claro y oscuro | MET-01..04 | Juicio visual | Abrir ficha, `guardados.html` y panel en los dos temas y en móvil |
| Hoja de compartir nativa del teléfono | MET-02 | `navigator.share` no existe en el navegador sin pantalla | Pulsar «Compartir» en un móvil |

## Firma

- [x] Toda tarea tiene verificación automática o depende de la ola 0
- [x] Nunca tres tareas seguidas sin verificación automática
- [x] Sin modos de vigilancia
- [x] `nyquist_compliant: true`

**Aprobación:** pendiente
