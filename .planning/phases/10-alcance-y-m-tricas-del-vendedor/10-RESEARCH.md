# Fase 10: Alcance y métricas del vendedor — Investigación

**Investigado:** 2026-09-25
**Dominio:** métricas de anuncio, compartir por WhatsApp, favoritos sin cuenta, duplicar
**Confianza:** alta (todo sale de leer el código de este repositorio)

## Resumen

La infraestructura de eventos está hecha y probada; lo que falta son los emisores y las
pantallas. Hay tres trampas que no se ven a primera vista: los eventos crudos se purgan
a los 90 días, borrar un anuncio borra sus archivos del disco aunque otro los use, y
`rutasEnUso()` no conoce las imágenes de la página del dealer.

**Recomendación principal:** un plan de servidor con su arnés de pruebas primero, y
luego la ficha, el panel y un recorrido de navegador que demuestre los cuatro criterios.

## Lo que ya existe

| Pieza | Dónde | Estado |
|-------|-------|--------|
| Tipos `favorito` y `compartir` | `COLUMNA_EVENTO` en `tools/db.js`; `CHECK` de `eventos` en `db/schema.sql` | Sin emisor |
| Deduplicación por visitante, tipo y día | `anotarEvento` → `'invalido' \| 'contado' \| 'repetido'` | Cubierta por `probar-seguridad.js` |
| Ruta pública de eventos, tope 300/15 min por IP | `evento` en `tools/api.js`, `POST /api/eventos` | Hecha |
| Emisor del navegador | `anotar(idAnuncio, tipo)` en `assets/app.js` | Solo `vista`, `telefono`, `whatsapp` |
| Tarjeta «Guardados» | `pintarMetricas` en `assets/panel.js` | Siempre 0 |
| Metadatos de compartir | `tools/meta.js` (`delAnuncio`, `aplicar`), servidos por `tools/serve.js` | Título con precio y foto completa |
| Borrador de publicar | `assets/publicar.js`, `localStorage` `mercamaquinarias:borrador` | Restaura todo al recargar |

## Hallazgos que cambian el diseño

1. **`eventos` se purga a 90 días** (`purgar()` en `tools/db.js`). Una lista de contactos
   leída de ahí se vacía sola; hace falta una tabla permanente sin la huella del visitante.
2. **`borrarAnuncio` devuelve todas las rutas del anuncio y `eliminarAnuncio` las borra
   del disco.** Si la copia reutiliza fotos por ruta, borrar el original deja la copia
   sin fotos. Se filtran con `rutasEnUso()`.
3. **`rutasEnUso()` no incluye `organizaciones.logo`, `organizaciones.banner` ni
   `organizacion_galeria.url`.** `recogerHuerfanos` en `tools/tareas.js` borra lo que no
   esté en ese conjunto tras 48 h de gracia: hoy borraría el logotipo, la portada y la
   galería de la página del dealer. Se arregla aquí porque D-11 depende de ese conjunto.
4. **No hay edición completa de un anuncio publicado.** Duplicar solo puede ser precargar
   el asistente, y es lo correcto: así pasa por la comprobación de cupo.
5. **`db.anuncio()` devuelve las fotos como lista de URL, sin miniatura.** La copia y la
   vista previa necesitan la miniatura: consultas propias sobre `anuncio_fotos`.
6. **`GET /api/anuncios/:id` responde para cualquier estado**, no solo activos. No es de
   esta fase; los guardados van por el catálogo, que filtra `estado = 'activo'`.
7. **La foto completa mide hasta 1.600 px** (`ANCHO_MAXIMO_FOTO`) y la miniatura 900 px
   con calidad 0,78. WhatsApp no pinta la vista previa cuando la imagen pesa demasiado
   (el límite práctico citado es unos 300 KB): la miniatura es la apuesta segura.
8. **Las fotos de la demostración son `data:` URI**, no `/fotos/`: con la base de demo,
   `og:image` cae en la imagen de marca. El recorrido de navegador no puede exigir una
   foto; la prueba de la foto va en el arnés, con rutas `/fotos/` reales.

## Validation Architecture

| Propiedad | Valor |
|-----------|-------|
| Marco | Arnés propio con contadores (`probar-*.js`) + puppeteer (`auditar-*.js`) |
| Comando rápido | `npm run metricas:probar` |
| Suite completa | `npm run seguridad:probar && npm run dealer:probar && npm run bitacora:probar && npm run facturas:probar && npm run pagos:probar && npm run chat:probar && npm run facturas:letras && npm run metricas:probar`, y con el servidor de demo: `npm run auditar && npm run check` |
| Duración | ~10 s el arnés; ~3 min las auditorías |

Qué prueba cada requisito:

- **MET-01:** arnés — `?ids=` devuelve solo activos, ignora ids mal formados, tope 60;
  el evento `favorito` sube `favoritos` en `resumenOrganizacion`. Navegador — guardar en
  la ficha, aparece en `guardados.html`, quitar lo saca.
- **MET-02:** arnés — `meta.para` usa la miniatura `/fotos/…`, título con precio, sin
  `og:image:width` falso; `compartir` sube `compartidos`. Navegador — el botón existe y el
  enlace de WhatsApp lleva la URL de la ficha.
- **MET-03:** arnés — un `whatsapp` contado crea una fila; repetido no; `GET
  /api/mis-contactos` solo trae los de la organización, con anuncio y hora; 401 sin
  sesión; la migración rellena desde `eventos`. Navegador — el panel lista el contacto.
- **MET-04:** arnés — `GET /api/mis-anuncios/:id/copia` 200 al dueño sin `serie`, 404 a
  otro; borrar el original no borra fotos que usa otro anuncio; `rutasEnUso` incluye logo,
  banner y galería. Navegador — «Duplicar» abre el asistente con marca y modelo puestos.

## Riesgos

- **Conflicto de migraciones con fases paralelas:** todas añaden al final de
  `MIGRACIONES`. El orquestador conserva ambas al fusionar.
- **Contraste:** los botones nuevos deben pasar `check-contraste.js` en los dos temas.
  Usar clases existentes (`btn`, `btn--linea`, `btn-tabla`) y fichas de color del tema.
