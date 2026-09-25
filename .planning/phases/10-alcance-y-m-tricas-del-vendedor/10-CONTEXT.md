# Fase 10: Alcance y métricas del vendedor — Contexto

**Reunido:** 2026-09-25
**Estado:** Listo para planificar
**Modo:** sin discusión con Victor. Todo lo de aquí es técnico y reversible, y lo decidió
el agente según `CLAUDE.md`, `PROJECT.md`, `STATE.md` y `ROADMAP.md`. Nada de esta fase
depende de un pago ni de un dato que solo tenga Victor, así que no hay interruptor apagado.

<domain>
## Límite de la fase

Cuatro cosas, las de MET-01 a MET-04 y nada más:

1. **Guardar** un anuncio (favorito) y volver a encontrarlo; el panel deja de decir
   «Guardados: 0».
2. **Compartir** la ficha; el enlace llega a WhatsApp con foto, título y precio.
3. El anunciante ve **qué anuncio y cuándo** para cada contacto, no solo el total.
4. **Duplicar** un anuncio desde el panel y editar solo lo que cambia.

Fuera: cuentas de comprador, sincronizar favoritos entre dispositivos, alertas (fase 16),
buzón de mensajes, edición completa de un anuncio publicado, planes y precios.
</domain>

<decisions>
## Decisiones de implementación

### Guardados (MET-01)
- **D-01 · Los guardados viven en el navegador.** `localStorage` con la clave
  `mercamaquinarias:guardados` (lista de `{ id, guardado }`, tope 100). No hace falta
  cuenta: quien guarda es un comprador que casi nunca la tiene. Todo acceso va en
  `try/catch`; sin almacenamiento el botón sigue funcionando en memoria.
  Sincronizar entre dispositivos queda para cuando exista cuenta de comprador (fase 16).
- **D-02 · El evento `favorito` se emite al guardar, no al quitar.** La deduplicación de
  `anotarEvento` (una vez por visitante, tipo y día) ya lo convierte en «personas que lo
  guardaron». La tarjeta del panel cuenta los últimos 30 días, como las demás. Quitar no
  resta: sería publicar una cifra que baja sola y que el anunciante no sabe explicar.
- **D-03 · Una página propia, `guardados.html`.** Lista las tarjetas con `avisoHTML` y
  un botón «Quitar» por equipo. Los datos salen de `GET /api/anuncios?ids=a,b,c`
  (máximo 60 ids, validados con `^[\w-]+$`, solo anuncios activos). Los que ya no están
  publicados no se borran solos —uno pausado vuelve—: se avisa «N equipos guardados ya
  no están publicados» con un botón para quitarlos.
- **D-04 · Cómo se vuelve a encontrar.** Botón «Guardar» en la ficha (`aria-pressed`) con
  enlace «Ver guardados» al lado; y un enlace «Guardados (N)» que `app.js` inyecta en la
  navegación principal solo cuando N > 0. No se toca el HTML de la cabecera de las veinte
  páginas.

### Compartir (MET-02)
- **D-05 · `navigator.share` primero, y si no existe, un desplegable** con «WhatsApp»
  (`https://wa.me/?text=` con título, precio y enlace) y «Copiar enlace». El evento
  `compartir` se anota cuando `navigator.share` se resuelve o al pulsar una de las dos
  opciones; cancelar el diálogo no cuenta.
- **D-06 · La vista previa usa la miniatura.** `tools/meta.js` ya compone título con precio
  y foto. Dos arreglos: `og:image` pasa a la **miniatura** (900 px) de la primera foto,
  porque WhatsApp descarta la vista previa cuando la imagen pesa demasiado y la foto
  completa llega a 1.600 px; y las etiquetas `og:image:width`/`height` fijas en 1200×630
  se quitan cuando la imagen no es la de marca, porque mienten sobre la foto.

### Contactos atribuibles (MET-03)
- **D-07 · Tabla propia y permanente `contactos_anuncio`.** Los eventos crudos se purgan a
  90 días (`purgar()`), y el dealer pregunta al renovar, que puede ser al año. Una fila por
  contacto **contado** (el primero de cada visitante, canal y día, el mismo criterio del
  agregado), con anuncio, organización, canal (`whatsapp`/`telefono`), día y hora. **Sin
  huella del visitante:** no hace falta y no se guarda. La migración va al final de
  `MIGRACIONES` y rellena desde `eventos` lo que aún haya. Se borra con el anuncio.
- **D-08 · El panel lista WhatsApp y llamadas, con el canal a la vista.** El criterio pide
  WhatsApp; incluir las llamadas cuesta nada y es la misma pregunta del dealer. Sección
  «Contactos recibidos» con fecha y hora de Santo Domingo, equipo (enlace) y canal;
  filtro por anuncio y por canal; los 100 más recientes. Ruta `GET /api/mis-contactos`.

### Duplicar (MET-04)
- **D-09 · Duplicar precarga el asistente de publicar; no crea nada en el servidor.**
  Botón «Duplicar» en cada fila del panel → `publicar.html?duplicar=<id>`. Así la copia
  pasa por el flujo normal: cupos, condiciones legales y validación. Crear el anuncio
  directamente saltaría la comprobación de cupo.
- **D-10 · `GET /api/mis-anuncios/:id/copia`** (solo el dueño; 404 en otro caso)
  devuelve el borrador con la forma de `estadoInicial()` de `assets/publicar.js`. **Sin
  número de serie** (identifica una máquina concreta) y con fotos y videos reutilizados
  por ruta. Si hay un borrador a medias con contenido, se pregunta antes de reemplazarlo.
- **D-11 · Borrar un anuncio no borra archivos que otro sigue usando.** `borrarAnuncio`
  filtra sus rutas con `rutasEnUso()`. De paso `rutasEnUso()` gana el logotipo, el banner
  y la galería de la página del dealer, que hoy no estaban: la tarea diaria de huérfanos
  los habría borrado 48 horas después de subirlos.

### Pruebas
- **D-12 · Un arnés nuevo, `tools/probar-metricas.js`** (`npm run metricas:probar`,
  añadido al job `pruebas` del CI), con el estilo de contadores de `probar-seguridad.js`.
  Las comprobaciones de deduplicación de `probar-seguridad.js` no se tocan.
- **D-13 · Un recorrido de navegador, `tools/auditar-metricas.js`,** dentro de
  `npm run auditar`: guarda desde la ficha, lo encuentra en `guardados.html`, comparte,
  y como anunciante ve el contacto listado y duplica.

### A discreción del agente
- Textos de la interfaz, iconos (se añade `i-compartir` al sprite), orden de los botones.
</decisions>

<canonical_refs>
## Referencias canónicas

- `.planning/ROADMAP.md` § Phase 10 — objetivo y criterios de éxito.
- `.planning/REQUIREMENTS.md` — MET-01 a MET-04.
- `.planning/research/mercado.md` § huecos priorizados, puntos 3, 4, 5 y 7.
- `CLAUDE.md` — cero dependencias, migraciones al final, CRLF, `!!ctx`, `api()` lanza.
- `tools/db.js` — `COLUMNA_EVENTO`, `anotarEvento`, `resumenOrganizacion`,
  `anunciosDeOrganizacion`, `borrarAnuncio`, `rutasEnUso`, `filtrosCatalogo`, `purgar`.
- `tools/api.js` — `evento`, `catalogo`, `misAnuncios`, `eliminarAnuncio`, `RUTAS`.
- `tools/meta.js` — `delAnuncio`, `imagenDe`, `aplicar`.
- `assets/app.js` — `montarDetalle`, `contactosHTML`, `anotar`, `avisoHTML`.
- `assets/panel.js` — `pintarMetricas`, `filaAnuncio`, `montarPanel`.
- `assets/publicar.js` — `estadoInicial`, `leerBorrador`, `montarPublicador`.
</canonical_refs>

<deferred>
## Ideas diferidas

- Favoritos sincronizados con la cuenta (cuando haya cuenta de comprador; fase 16).
- Botón de guardar en la tarjeta del catálogo (un botón dentro del enlace de la tarjeta
  es un control anidado; hay que rehacer la tarjeta).
- Exportar la lista de contactos a CSV para el dealer.
</deferred>

---

*Fase: 10-alcance-y-m-tricas-del-vendedor*
