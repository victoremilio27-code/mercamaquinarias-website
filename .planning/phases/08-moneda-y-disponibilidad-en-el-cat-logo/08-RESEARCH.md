# Phase 8: Moneda y disponibilidad en el catálogo - Research

**Researched:** 2026-09-25
**Domain:** Catálogo público (SQL de búsqueda, API, equipos.html/equipo.html), publicación y panel
**Confidence:** ALTA — todo verificado leyendo el código y midiendo sobre node:sqlite

## Summary

El defecto de CAT-01 está exactamente donde dice mercado.md, con los números de línea
movidos: `filtrosCatalogo` (`tools/db.js` ~2801) compara `a.precio` crudo con
`precioMin`/`precioMax`, y `ORDENES_SQL['precio-asc'|'precio-desc']` (~2755) ordena por
`a.precio`. La moneda está en `a.moneda` (`'DOP'` por defecto, `'USD'` opcional; la API
solo admite esas dos en `publicar`, `tools/api.js` ~2414). No existe ninguna tasa de
cambio en el código.

CAT-02 no tiene nada: no hay columna, ni campo en el formulario, ni texto en la ficha.
CAT-03 ya tiene los datos (`anuncios.permuta`, `anuncios.itbis_incluido`, enteros 0/1,
capturados en publicar.html paso 3 y pintados en `condicionesHTML`, `assets/app.js` ~921)
pero ni la API (`catalogo`, `tools/api.js` ~2551) ni `filtrosCatalogo` los leen.

**Recomendación principal:** expresión SQL con la tasa enlazada como parámetro para
comparar precios; columna `disponibilidad` por migración; tres filtros nuevos que
atraviesan equipos.html → app.js → API → db.js.

## Hallazgos verificados

### 1. Coste de ordenar por expresión (medido)

Base en memoria con 20.000 anuncios activos (30 % en USD), node v22.22, 50 repeticiones:

| Consulta | Tiempo |
|---|---|
| `ORDER BY precio` con índice `(estado, precio, publicado DESC)` | 0,01 ms |
| `ORDER BY CASE moneda … END` | 6,9 ms |
| filtro `>= 1.000.000` + orden por la expresión | 9,0 ms |
| `COUNT(*)` con el filtro por la expresión | 6,3 ms |

Del mismo orden que el orden por defecto «destacados» (8,9 ms, aceptado y documentado en
la migración `2026-08-indices-catalogo`). Hoy hay decenas de anuncios. Se acepta y se
documenta en el código; la columna guardada queda como idea diferida.

### 2. node:sqlite rechaza parámetros con nombre que la sentencia no usa

Comprobado: `prepare('… WHERE estado = :e').get({ e, tasa })` lanza
`Unknown named parameter 'tasa'`. `buscarAnuncios` usa los mismos `parametros` para la
consulta de conteo (solo WHERE) y la de página (WHERE + ORDER BY). Si `:tasa` aparece
solo en el ORDER BY, el conteo revienta. Por eso el código actual ata `:ahora` siempre
dentro del WHERE. Solución: filtrar los parámetros por los que la sentencia menciona
(`/:nombre\b/`) antes de ejecutar cada una. Es la trampa principal de CAT-01.

### 3. Migraciones y esquema

- `migrar()` ignora solo «duplicate column». Las bases nuevas pasan por todas las
  migraciones, así que no hace falta tocar `db/schema.sql` (y tocarlo añadiría un punto
  de conflicto con las fases paralelas).
- `ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT 'en-pais' CHECK (…)` es válido en SQLite
  ≥ 3.37 (node 22.5+ trae 3.46+): el CHECK se valida contra las filas existentes, que
  toman el valor por defecto.
- `db/schema.sql` se ejecuta en CADA `abrir()` antes de `migrar()`: un índice sobre una
  columna nueva escrito ahí rompería el arranque de producción. No se crea índice.

### 4. Ajustes

`AJUSTES = ['heroe_imagen', 'heroe_alt']` es una lista blanca en `tools/db.js` ~1568;
`guardarAjuste` borra la fila con valor vacío. Añadir `'tasa_usd'` basta. La ruta de
administración sigue el patrón de `editarPortada` (`conAdmin`) y debe declararse en
`ESCRITURAS_ADMIN_PROPIAS` o `tools/probar-bitacora.js` falla («SIN CLASIFICAR»).

### 5. Rutas del dueño

`PATCH /api/anuncios/:id/tren-motriz` (`editarTrenMotriz`) es el patrón: `conSesion`,
`db.anuncio(id)`, comprobar `organizacion_id === ctx.organizacion.id` (404 si no), UPDATE
con `WHERE id = ? AND organizacion_id = ?`. La ruta nueva `/disponibilidad` va ANTES de
la genérica `PATCH /api/anuncios/:id` (`cambiarEstado`).

### 6. Formulario de filtros

`montarResultados` devuelve los filtros de la URL al formulario con `campo.value = v`.
Para una casilla eso cambia el valor enviado, no la marca: hay que tratar `checkbox`
aparte (`checked = v === '1'`). Los chips usan `ROTULO_FILTRO` y una rama para el valor
visible; hay que darles rótulo a los tres nuevos.

### 7. Lo que ya existe y se reutiliza

- `anuncioDeApi` (app.js ~2105) ya mapea `permuta` e `itbisIncluido`; falta
  `disponibilidad`. El SELECT de `buscarAnuncios` no trae ni `permuta` ni
  `itbis_incluido` ni la columna nueva (el de `anuncio()` usa `a.*`).
- `leerBorrador` (publicar.js ~172) fusiona el borrador guardado con `estadoInicial()`,
  así que un campo nuevo en `equipo` no rompe borradores viejos.
- `anunciosDeOrganizacion` (db.js ~2920) necesita `a.disponibilidad` para el botón del
  panel.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El conteo revienta por `:tasa` sobrante | Parámetros filtrados por sentencia; la prueba ejecuta conteo y página con y sin filtro de precio |
| Una tasa tecleada mal (630 en vez de 63) reordena el catálogo | Rango 20-200 en la API y en `tasaUsd()`; fuera de rango se ignora el ajuste |
| Conflicto de merge en `MIGRACIONES` y `module.exports` con fases 5, 6, 7, 9, 10 | Migración al final, en una entrada propia; exportaciones en línea propia |
| Publicar un teléfono o datos sensibles | No se toca nada de contacto |

## Validation Architecture

| Criterio | Cómo se comprueba | Dónde |
|---|---|---|
| 1. «desde RD$1.000.000» incluye US$120.000 | `GET /api/anuncios?precioMin=1000000` contiene el anuncio USD | `tools/probar-catalogo.js` |
| 1b. Tope: «hasta RD$1.000.000» excluye US$120.000 | `precioMax=1000000` no lo contiene | idem |
| 2. Orden precio: US$120.000 por encima de RD$500.000 | `orden=precio-asc`: índice USD > índice DOP; `precio-desc` al revés | idem |
| 2b. La tasa manda | Tras `guardarAjuste('tasa_usd', '3')` el orden se invierte; al borrarla vuelve | idem |
| 3. Ficha y filtro de disponibilidad | `GET /api/anuncios/:id` trae `disponibilidad`; `?disponibilidad=bajo-pedido` filtra; valor inválido se ignora; el dueño cambia la suya por PATCH y un ajeno recibe 404 | idem |
| 4. Permuta e ITBIS filtran | `?permuta=1`, `?itbis=1`, combinados | idem |
| Admin tasa | PATCH sin admin 404; con admin fija; fuera de rango 400 | idem |
| Navegador | Filtros visibles, `?permuta=1` marca la casilla y pone chip, la ficha dice la disponibilidad | `tools/auditar-publico.js` (CI job `navegador`) |
| No regresión | seguridad, dealer, bitácora, facturas, pagos, chat, letras, auditar, check | scripts existentes |

Comando rápido: `npm run catalogo:probar` (~1 s). Suite completa: todos los `*:probar`,
`facturas:letras`, y `auditar` + `check` con el servidor sembrado (`db:demo`).

## Sources

- Código leído: `tools/db.js`, `tools/api.js`, `assets/app.js`, `assets/publicar.js`,
  `assets/panel.js`, `assets/precios.js`, `assets/data.js`, `equipos.html`,
  `publicar.html`, `admin.html`, `tools/seed.js`, `tools/auditar-publico.js`,
  `tools/probar-bitacora.js`.
- Medición propia (script en el scratchpad de la sesión).
- `.planning/research/mercado.md` §2 y §5.
