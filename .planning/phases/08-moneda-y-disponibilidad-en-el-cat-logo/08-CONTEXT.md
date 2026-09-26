# Phase 8: Moneda y disponibilidad en el catálogo - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning
**Source:** Sin discusión con Victor, por delegación del orquestador: lo técnico y
reversible lo decide quien planifica (CLAUDE.md, «Cómo se trabaja con Victor»); lo que
solo Victor puede dar se construye configurable y queda anotado como pendiente.

<domain>
## Phase Boundary

El buscador deja de mentir con el precio y la ficha dice dónde está la máquina:

- CAT-01: filtrar y ordenar por precio compara en una sola moneda (pesos), convirtiendo
  los anuncios en US$ con una tasa de referencia configurable.
- CAT-02: cada anuncio declara si el equipo está ya en el país o es bajo pedido; la ficha
  lo dice, la tarjeta lo marca y el catálogo filtra por ello.
- CAT-03: permuta e ITBIS incluido pasan a ser filtros del catálogo.

Fuera: cambiar cómo se muestra el precio (se sigue mostrando en la moneda en que se
publicó), editar el anuncio completo, alertas y búsquedas guardadas (fase 16), filtro por
anunciante verificado (no está en CAT-0x).
</domain>

<decisions>
## Implementation Decisions

### D-01 · CAT-01: comparar en pesos con una expresión SQL, no con una columna guardada
- El filtro `precioMin`/`precioMax` y los órdenes `precio-asc`/`precio-desc` usan
  `(CASE WHEN a.moneda = 'USD' THEN a.precio * :tasa ELSE a.precio END)`.
- Se descartó guardar una columna `precio_dop` indexada: habría que recalcularla al
  cambiar la tasa y en CADA camino que inserte o edite un anuncio (siembra, importaciones,
  el «duplicar anuncio» de la fase 10 que corre en paralelo). Una sola vía que se olvide
  y el catálogo vuelve a mentir, esta vez en silencio.
- Coste medido (08-RESEARCH.md): 7-9 ms sobre 20.000 anuncios activos, del mismo orden
  que el orden «destacados» que ya se aceptó (8,9 ms). Hoy el catálogo tiene decenas.
  Queda anotado cuándo convendría pasar a columna guardada.
- El precio se sigue MOSTRANDO en su moneda original: la conversión es solo para
  comparar. Mostrar «≈ RD$» con una tasa de referencia sería inventar una cifra que el
  vendedor no publicó.

### D-02 · La tasa de referencia es un ajuste, con valor por defecto
- Orden de precedencia: ajuste `tasa_usd` en la tabla `ajustes` (lo fija un
  administrador desde /admin.html) → variable de entorno `MERCA_TASA_USD` → constante
  `TASA_USD_POR_DEFECTO` en `assets/precios.js`.
- Valor por defecto: **63** RD$ por US$. Es un marcador razonable, NO la tasa oficial.
  **Pendiente de Victor:** fijar la tasa de referencia (BCRD) desde /admin.html antes del
  lanzamiento, o decidir otra fuente. Para los criterios de éxito da igual el valor
  exacto: cualquier tasa por encima de 8,34 ya mete US$120.000 en «desde RD$1.000.000».
- Rango admitido: 20 a 200 RD$ por dólar, con hasta dos decimales. Fuera de eso es un
  error de tecleo (un cero de más o de menos) y se rechaza.
- No se consulta ninguna API externa (cero dependencias y sin clave): si Victor quiere
  la tasa diaria automática, es una fase aparte.
- La constante y la función `precioEnPesos(precio, moneda, tasa)` viven en
  `assets/precios.js` (compartido navegador/Node), como pide la nota del ROADMAP.
- El catálogo devuelve la tasa usada (`tasaUsd`) y equipos.html la escribe bajo el
  filtro de precio: «Los precios en US$ se comparan a RD$63 por dólar».
- Cambiar la tasa es escritura de la plataforma (no en nombre de otra organización):
  va a `ESCRITURAS_ADMIN_PROPIAS`, no a la bitácora.

### D-03 · CAT-02: columna `disponibilidad` con dos valores
- Migración nueva AL FINAL de `MIGRACIONES`:
  `ALTER TABLE anuncios ADD COLUMN disponibilidad TEXT NOT NULL DEFAULT 'en-pais'
   CHECK (disponibilidad IN ('en-pais', 'bajo-pedido'))`. No se toca `db/schema.sql`:
  las bases nuevas también pasan por todas las migraciones.
- Los anuncios existentes quedan en `'en-pais'`: todos se publicaron con «Provincia donde
  se encuentra» obligatoria, así que el sitio ya afirmaba que estaban en el país.
- Al publicar se elige en el paso 1, junto a la provincia: «Ya está en República
  Dominicana» (por defecto) o «Bajo pedido: se importa tras la venta».
- El anunciante lo cambia después desde su panel (un botón por fila), sin republicar:
  una máquina bajo pedido que llega al país no debe perder sus visitas.
- La ficha lo dice junto a la ubicación y, si es bajo pedido, avisa de confirmar plazo
  de entrega y si el precio incluye flete y aduana. No se añade campo de plazo: se
  pregunta por teléfono y cabe en la descripción.
- La tarjeta del catálogo marca «Bajo pedido»; «En el país» no se marca (es lo normal).

### D-04 · CAT-03: permuta, ITBIS y disponibilidad como filtros
- Parámetros de URL/API: `permuta=1`, `itbis=1`, `disponibilidad=en-pais|bajo-pedido`.
  La API solo acepta esos valores; cualquier otro se ignora.
- equipos.html: selector «Dónde está el equipo» y dos casillas bajo «Condiciones»
  («Acepta permuta», «Precio con ITBIS incluido»). Chips para quitar cada uno.
- Sin índices nuevos: son columnas de baja selectividad y el filtro principal
  (estado, publicado) ya está indexado.

### D-05 · Pruebas
- Arnés propio nuevo `tools/probar-catalogo.js` (`npm run catalogo:probar`), con base
  temporal en `.tmp/prueba-catalogo/`, colgado del job `pruebas` de CI. Cubre los cuatro
  criterios de éxito sobre la API real (req/res falsos), como probar-bitacora.
- La auditoría del navegador (`auditar-publico.js`) comprueba que los filtros nuevos
  existen, que `?permuta=1` se refleja en la casilla y que la ficha dice la
  disponibilidad. La siembra de demostración incluye anuncios en US$, bajo pedido, con
  permuta y con ITBIS incluido para que el CI tenga qué encontrar.

### Claude's Discretion
- Textos exactos de la interfaz (dentro del tono de usted del sitio).
- Nombre de la ruta de administración (`/api/admin/tasa-cambio`).
</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` — Phase 8: objetivo, 4 criterios de éxito y notas.
- `.planning/REQUIREMENTS.md` — CAT-01, CAT-02, CAT-03.
- `.planning/research/mercado.md` §2 (defecto de moneda) y §5 c-e (disponibilidad,
  moneda dual, permuta e ITBIS).
- `CLAUDE.md` — cero dependencias, migraciones al final, módulos compartidos, CRLF.
- `tools/db.js` — `filtrosCatalogo`, `ORDENES_SQL`, `buscarAnuncios`, `AJUSTES`,
  `crearAnuncio`, `MIGRACIONES`.
- `tools/api.js` — `catalogo`, `publicar`, `editarTrenMotriz` (patrón de PATCH del
  dueño), `editarPortada` (patrón de ajuste de admin), `ESCRITURAS_ADMIN_PROPIAS`.
</canonical_refs>

<specifics>
## Specific Ideas

Criterios de éxito del ROADMAP, literales, que las pruebas reproducen:
1. «desde RD$1.000.000» devuelve una máquina de US$120.000.
2. Orden por precio: US$120.000 por encima de RD$500.000.
3. La ficha dice en el país / bajo pedido y el catálogo filtra por ello.
4. Permuta e ITBIS incluido se usan como filtro.
</specifics>

<deferred>
## Deferred Ideas

- Tasa diaria automática desde el Banco Central (requiere fuente y decisión de Victor).
- Filtro por moneda del rango (buscar «hasta US$50.000»): hoy el rango es en RD$.
- Columna `precio_dop` indexada si el catálogo pasa de ~50.000 anuncios activos.
- Filtro «solo anunciantes verificados» (sugerido en mercado.md, no está en CAT-0x).
</deferred>

---

*Phase: 08-moneda-y-disponibilidad-en-el-cat-logo*
*Context gathered: 2026-09-25, decisiones por delegación*
