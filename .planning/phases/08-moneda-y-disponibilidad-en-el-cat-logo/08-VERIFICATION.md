---
phase: 08-moneda-y-disponibilidad-en-el-cat-logo
verified: 2026-09-25
status: passed
score: 4/4 criterios de éxito
requirements: [CAT-01, CAT-02, CAT-03]
base: a9184fa
head_verificado: f34b9bd
re_verification: false
---

# Fase 8 · Verificación: moneda y disponibilidad en el catálogo

**Objetivo (ROADMAP):** que el buscador deje de mentir: que el precio se compare en la
misma moneda y que la ficha diga si la máquina está en el país o viene bajo pedido.

**Veredicto: PASADA.** Los cuatro criterios de éxito se cumplen en el código y los
demuestran pruebas que corren en el CI: `catalogo:probar` contra la API y
`auditar-publico` en el navegador. La verificación se hizo sobre el código, no sobre lo
que dicen los SUMMARY. La revisión de código posterior encontró dos defectos, ya
corregidos (ver `08-REVIEW.md`), y ninguno de los dos invalidaba un criterio.

## Criterios de éxito

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | Filtrar «desde RD$1.000.000» devuelve una máquina de US$120.000 | ✓ | `tools/db.js` · `filtrosCatalogo` compara `PRECIO_EN_PESOS` (`CASE WHEN a.moneda = 'USD' THEN a.precio * :tasa ELSE a.precio END`) con `:precioMin` enlazado. `catalogo:probar` «Criterio 1»: la de US$120.000 sale y la de RD$500.000 no; el conteo cuadra con la página; el rango RD$5M-8M encuentra solo la de US$120.000 (≈ RD$7.560.000 a 63). En el navegador, `auditar-publico`: «desde RD$6,000,000 incluye un anuncio en US$: sí». |
| 2 | Ordenar por precio coloca la de US$120.000 por encima de una de RD$500.000 | ✓ | `ORDENES_SQL['precio-asc'/'precio-desc']` ordenan por `PRECIO_EN_PESOS`. `catalogo:probar` «Criterio 2»: en ascendente queda después de la de RD$500.000 y entre la de RD$2M y la de RD$9M; en descendente queda antes. El SUMMARY 08-01 anota la mutación: con `a.precio ASC` la prueba da 2 MAL. |
| 3 | La ficha dice si el equipo está en el país o es bajo pedido, y se puede filtrar por eso | ✓ | Migración `2026-09-anuncios-disponibilidad` (al final de `MIGRACIONES`, con `CHECK` de dos valores y los anuncios existentes en `en-pais`). Ficha: `disponibilidadHTML` bajo la ubicación y la fila «Disponibilidad» en la ficha técnica (`assets/app.js`). Tarjeta: pastilla «Bajo pedido». Filtro: `?disponibilidad=` con lista cerrada (`DISPONIBILIDADES.includes`) y el selector «Dónde está» en `equipos.html`. Se elige al publicar y el dueño la cambia desde el panel (`PATCH /api/anuncios/:id/disponibilidad`, 404 al ajeno). `catalogo:probar`: 15 comprobaciones de columna, ficha, filtro y panel. `auditar-publico`: «dice dónde está: En el país: el equipo ya está en Repúbli…» y «?disponibilidad=bajo-pedido: 1 resultado», todas las tarjetas marcadas. |
| 4 | Permuta e ITBIS incluido se usan como filtro, no solo como etiqueta | ✓ | `filtrosCatalogo`: `a.permuta = 1` / `a.itbis_incluido = 1`, activados solo por el valor exacto `'1'` (`tools/api.js`). `equipos.html`: casillas «Acepta permuta» y «Precio con ITBIS incluido» en el grupo «Venta», con chips. `catalogo:probar` «Criterio 4» y «Combinados»: solos, juntos y combinados con el precio en pesos y la disponibilidad; `permuta=si`, `itbis=true` y `permuta=0` no filtran. `auditar-publico`: `?permuta=1` da 2 resultados con la casilla marcada, `?itbis=1` da 1. |

## Requisitos

| Requisito | Criterios | Estado |
|-----------|-----------|--------|
| CAT-01 · el precio se compara en una sola moneda | 1, 2 | ✓ Cumplido |
| CAT-02 · en el país o bajo pedido | 3 | ✓ Cumplido |
| CAT-03 · permuta e ITBIS filtrables | 4 | ✓ Cumplido |

## Artefactos y conexiones

| Artefacto | Existe | Tiene contenido real | Está conectado |
|-----------|--------|----------------------|----------------|
| `assets/precios.js` · `tasaValida`, `precioEnPesos`, límites 20-200 | ✓ | ✓ | ✓ lo usan `db.tasaUsd` y `editarTasaCambio`; el final `module.exports` sigue intacto |
| `tools/db.js` · `tasaUsd`, `PRECIO_EN_PESOS`, `soloUsados`, migración, `guardarDisponibilidad` | ✓ | ✓ | ✓ `buscarAnuncios` pasa `:tasa` y devuelve `tasaUsd` |
| `tools/api.js` · `GET/PATCH /api/admin/tasa-cambio`, `PATCH …/disponibilidad`, parámetros del catálogo | ✓ | ✓ | ✓ en `RUTAS`, con la ruta específica antes de `PATCH /api/anuncios/:id` |
| `admin.html` + `assets/admin.js` · sección «Tasa de referencia del dólar» | ✓ | ✓ | ✓ `montarTasa()` desde `montarAdmin()` |
| `equipos.html` + `assets/app.js` · selector, casillas, chips y nota de la tasa | ✓ | ✓ | ✓ `CAMPOS_BUSQUEDA` los manda a `/api/anuncios` |
| `publicar.html` + `assets/publicar.js` · «¿Dónde está el equipo?» | ✓ | ✓ | ✓ `leerPaso` → estado → `anuncioParaApi` → `publicar` |
| `assets/panel.js` · botón «Es bajo pedido» / «Ya llegó al país» | ✓ | ✓ | ✓ PATCH y repintado de la tabla |
| `tools/probar-catalogo.js` + `catalogo:probar` en `package.json` y en el CI | ✓ | ✓ 56 comprobaciones | ✓ paso «Catalogo» del job `pruebas` |
| `tools/seed.js` · anuncio en US$ bajo pedido, permuta e ITBIS | ✓ | ✓ | ✓ lo usa `auditar-publico` en el job `navegador` |

## Pruebas corridas en esta verificación

Hermética, toda en verde: `catalogo:probar` 56/0, `seguridad:probar` 71/0,
`dealer:probar` 49/0, `bitacora:probar` 73/0, `pagos:probar` (75), `facturas:probar`,
`chat:probar` 40/0, `facturas:letras` 6/0, `taxonomia`, `check:encoding`.
`correo:probar` no es una prueba: manda un correo real a la dirección que se le pase, y
no se corrió.

Navegador, contra el sitio sembrado en el puerto 8765 con Chrome `--no-sandbox` desde
un envoltorio en /tmp:

- `auditar-flujos` 0 hallazgos, `auditar-permisos` 0 fallos, `check-contraste`
  0 hallazgos en 17 rutas y dos temas (después de corregir la pastilla),
  `check:motion` en verde.
- `auditar-publico` y `check-links` salen con 1 **solo** por las Google Fonts: Chrome no
  confía en la CA del proxy de salida del contenedor (`ERR_CERT_AUTHORITY_INVALID`).
  Todas las comprobaciones de la fase pasaron. Los 16 problemas de `check-links` son de
  esa causa; de la auditoría pública solo se imprimen 24 de los 64, pero únicamente
  hay categorías de red y de consola. El job `navegador` del CI tiene red directa y es
  el que da el veredicto final.

## Anti-patrones

Ninguno bloqueante. Sin TODO/FIXME nuevos, sin manejadores vacíos, sin datos inventados
en la interfaz: la nota de la tasa y la pastilla salen de la respuesta real de la API.

## Pendiente de Victor (no bloquea la fase)

1. **Fijar la tasa oficial** en /admin.html → «Tasa de referencia del dólar». Hasta
   entonces el catálogo compara a RD$63, el valor de partida de `assets/precios.js`, y la
   consola lo dice («Valor por defecto: todavía nadie ha fijado la tasa»).
2. **Mirar a ojo** la ficha de un anuncio bajo pedido y la pastilla de la tarjeta, en
   móvil y en tema oscuro. El contraste ya está medido; la composición no.
