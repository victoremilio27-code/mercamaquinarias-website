---
phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer
plan: 06
subsystem: catálogo público / panel del vendedor (frontend)
tags: [serie, confianza, panel, ficha]
requires: [07-02]
provides: ["texto real de publicar.html sobre la serie", "nota de serie cotejada en la ficha (assets/app.js)", "estado de la serie en el panel (assets/panel.js)"]
affects: []
key-files:
  modified: [publicar.html, assets/app.js, assets/panel.js]
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 7 Plan 06: texto de publicar, estado de la serie en el panel y en la ficha

Cierra CONF-01: lo que `publicar.html` promete sobre el número de serie ahora es exactamente lo
que el personal hace desde 07-02/07-04 (cotejar con la placa de las fotos y contra los demás
anuncios, sin consultar ningún registro de robo, sin publicarse). El resultado se ve en el panel
del vendedor y, si cuadró, en la ficha pública.

## Commits

| Tarea | Qué |
|---|---|
| 1 | Placeholder y ayuda de `publicar.html`; nota «Serie cotejada» en la ficha (`assets/app.js`) |
| 2 | Estado de la serie en la tarjeta del panel (`assets/panel.js`) |

## Qué cambió

- **`publicar.html`** (`#e-serie`): el placeholder pasó de «Opcional, solo visible para el equipo
  de verificación» (falso: la serie salía por la API a cualquiera hasta que 07-02 lo cerró) a
  «Opcional. No se publica: solo lo ve el personal de MercaMaquinarias», con una ayuda
  (`small.campo-v__ayuda`) que explica la diligencia real y dice explícitamente que no se
  consultan registros de robo.
- **`assets/app.js`**: `anuncioDeApi` añade `serieCotejada: !!a.serie_cotejada` (el único campo de
  serie que `GET /api/anuncios/:id` entrega al público, ver 07-02). La ficha pinta, junto a la
  nota de «Anunciante verificado», la de «Serie cotejada» con el texto de límites de
  07-UI-SPEC.md §6, solo si `serieCotejada`.
- **`assets/panel.js`**: nueva función `estadoSerieHTML(a)`, llamada desde `filaAnuncio`, que
  añade una línea (`span.celda-equipo__meta`, la misma clase que ya usa la fila para precio y
  provincia) bajo el nombre del equipo: «Serie cotejada por MercaMaquinarias» si `conforme»,
  «Serie con observaciones: <nota>» si `observada` (nota escapada por `esc()`), «Serie: pendiente
  de revisión» si declaró serie y nadie la ha revisado. Nada si el anuncio no declaró serie.

## Verificación

- `node --check assets/app.js` y `node --check assets/panel.js`: sin errores.
- `npm run check:encoding`: sin caracteres sospechosos.
- `npm run check` (`check-links.js`), contra un servidor y una base de demostración propios en el
  puerto 8093 (no 8080, en uso por otro árbol de trabajo en el momento de correrlo), con
  `PUPPETEER_EXECUTABLE_PATH` apuntando a un envoltorio que añade `--no-sandbox` (Chrome corre
  como root en este contenedor): 16/16 páginas cargan, 0 enlaces internos rotos. Los 16 «problemas»
  que reporta son el mismo error en cada página — `ERR_CERT_AUTHORITY_INVALID` al pedir la
  tipografía de Google Fonts, confirmado con un `requestfailed` suelto apuntando a
  `fonts.googleapis.com` — y no cuentan: es la falta de red de este entorno, no algo que el
  código de esta fase haya roto.
- Verificación visual con Puppeteer (script de un solo uso, fuera del repo): con tres anuncios en
  tres estados de serie (`conforme`, `observada` con nota, sin revisar) se comprobó que el panel
  del vendedor pinta las tres frases exactas, que la ficha de un equipo `conforme` muestra «Serie
  cotejada» y que la de uno sin revisar no la muestra, y que `publicar.html` ya trae el
  placeholder y la ayuda nuevos. Capturas en `/tmp/fase07-nav/capturas-0706/` (fuera del repo).

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check: PASSED
