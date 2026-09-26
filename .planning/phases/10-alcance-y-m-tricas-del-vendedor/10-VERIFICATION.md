---
phase: 10-alcance-y-m-tricas-del-vendedor
verified: 2026-09-25
status: human_needed
score: 4/4 criterios alcanzados en código y pruebas; 3 comprobaciones solo manuales
---

# Fase 10 — Verificación

Verificación hacia atrás desde el objetivo: que el vendedor pueda atribuir al sitio lo
que vende y que el comprador pueda guardar y compartir. Se comprobó el código, no los
SUMMARY: cada afirmación de abajo apunta a dónde está y a qué prueba la sostiene.

## Criterios de éxito del ROADMAP

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | Un visitante guarda un anuncio, lo vuelve a encontrar, y el panel deja de decir «Guardados: 0» | ✓ | `#btnGuardar` en `accionesFichaHTML`/`montarAccionesFicha` (`assets/app.js`) anota `favorito`; `GUARDADOS` en `localStorage`; `guardados.html` + `montarGuardados` leen `GET /api/anuncios?ids=`; enlace «Guardados (N)» en la navegación. `metricas:probar`: el evento `favorito` sube `resumenOrganizacion().totales.favoritos` a 1 y `?ids=` devuelve solo activos. `auditar-metricas.js` bloque 1: guardar → aparece en `guardados.html` → quitar → vacío |
| 2 | Un visitante comparte la ficha y el enlace llega a WhatsApp con foto, título y precio | ✓ + manual | `#btnCompartir`: `navigator.share` o menú con `https://wa.me/?text=` (nombre, precio, URL) y «Copiar enlace»; evento `compartir`. `tools/meta.js` sirve `og:title` con equipo y precio y `og:image` con la miniatura `/fotos/` de la primera foto, sin medidas falsas. `metricas:probar` (bloque «La tarjeta al compartir») y `auditar-metricas.js` bloque 2. **La tarjeta real de WhatsApp solo se ve en producción** |
| 3 | El anunciante ve, por cada contacto de WhatsApp, qué anuncio fue y cuándo | ✓ | Tabla permanente `contactos_anuncio` (migración `2026-09-contactos-anuncio`, última de `MIGRACIONES`), registrada desde `anotarEvento` con el mismo criterio que el agregado; `GET /api/mis-contactos`; sección «Contactos recibidos» en `panel.html` con hora de Santo Domingo, equipo enlazado, canal y filtros. `metricas:probar` (23 comprobaciones de contactos, incluida la migración real sobre eventos crudos) y `auditar-metricas.js` bloque 3 |
| 4 | El anunciante duplica un anuncio desde el panel y solo edita lo que cambia | ✓ | «Duplicar» en `filaAnuncio` → `publicar.html?duplicar=<id>` → `cargarCopia` sobre `GET /api/mis-anuncios/:id/copia` (solo el dueño, sin serie). Precarga equipo, precio, condiciones, contacto, fotos y videos; desde la revisión (1b538c8), también motor y transmisión. Borrar el original ya no borra las fotos de la copia. `metricas:probar` (bloques «Duplicar» y «Archivos compartidos») y `auditar-metricas.js` bloque 4 |

## Requisitos

| Requisito | Plan | Estado |
|-----------|------|--------|
| MET-01 | 10-01, 10-02, 10-03 | ✓ |
| MET-02 | 10-01, 10-02 | ✓ (tarjeta real: manual) |
| MET-03 | 10-01, 10-03 | ✓ |
| MET-04 | 10-01, 10-03 | ✓ |

## Pruebas corridas en esta verificación

- `check:encoding`, `taxonomia`, `facturas:letras` (fail 0), `seguridad:probar` 71/0,
  `dealer:probar` 49/0, `bitacora:probar` 72/0, `facturas:probar` y `pagos:probar`
  «Todo correcto», `metricas:probar` 60/0, `chat:probar` 40/0.
- **Navegador (`npm run auditar`, con `auditar-metricas.js`, y `npm run check`): no se
  corrieron en esta sesión.** El contenedor corre como root, Chromium exige desactivar su
  sandbox y la política de permisos lo deniega; una instrucción del orquestador no
  sustituye el permiso de Victor. Los corrió el agente de 10-03/10-04 antes de la
  revisión, con 0 hallazgos salvo Google Fonts (sin red de salida). Las tres correcciones
  de la revisión son posteriores: dos tocan el navegador (`assets/publicar.js`,
  `assets/app.js`), así que las valida el job `navegador` del CI al abrir el PR.

## Solo manual (para Victor)

1. Tras desplegar, mandar por WhatsApp el enlace de una ficha con fotos subidas y ver
   foto, título y precio en la tarjeta.
2. Ficha, `guardados.html` y panel en claro y oscuro y en el teléfono (la hoja nativa de
   compartir solo existe allí).
3. Duplicar un camión con motor declarado y comprobar que el asistente trae motor y
   transmisión (corrección de la revisión, sin recorrido de navegador todavía).

## Anti-patrones buscados

Sin `TODO`, marcadores de relleno ni manejadores vacíos en lo añadido. Los `catch (_)`
vacíos llevan su comentario y son deliberados (almacenamiento no disponible, compartir
cancelado).
