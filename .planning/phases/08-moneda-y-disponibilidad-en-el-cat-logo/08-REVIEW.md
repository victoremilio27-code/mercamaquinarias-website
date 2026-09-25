---
phase: 08-moneda-y-disponibilidad-en-el-cat-logo
reviewed: 2026-09-25
depth: standard
alcance: "git diff a9184fa..HEAD -- . ':!.planning'"
files_reviewed: 16
findings:
  critical: 0
  warning: 3
  info: 5
  total: 8
status: issues_fixed
corregido_en: [6c3973d, f34b9bd]
---

# Fase 8 · Revisión de código

**Alcance:** solo lo que cambió la fase, `a9184fa..00aee26` sin `.planning/`: 16 archivos,
+846 −23. `tools/db.js`, `tools/api.js`, `assets/precios.js`, `assets/app.js`,
`assets/admin.js`, `assets/panel.js`, `assets/publicar.js`, `admin.html`, `equipos.html`,
`publicar.html`, `styles.css`, `tools/seed.js`, `tools/probar-catalogo.js`,
`tools/auditar-publico.js`, `package.json` y `.github/workflows/desplegar.yml`.

**Resultado:** ningún defecto crítico. Hay tres advertencias y las tres quedan corregidas
con commits propios. Una es anterior a la fase, pero está dentro de `buscarAnuncios`,
que la fase reescribió. Las cinco observaciones informativas no se tocan y se explica
por qué en cada una.

## Seguridad: lo que se comprobó expresamente

- **Inyección SQL en los filtros nuevos: no hay.** `permuta` e `itbis` solo añaden texto
  fijo (`a.permuta = 1`, `a.itbis_incluido = 1`) y se activan con el valor exacto `'1'`.
  `disponibilidad` pasa por la lista cerrada `DISPONIBILIDADES` y va como parámetro
  enlazado. `precioMin` y `precioMax` pasan por `Number()` y van enlazados. La
  expresión `PRECIO_EN_PESOS` es una constante del archivo y `rango()` solo la recibe
  desde el propio código. `:tasa` es un parámetro enlazado. `soloUsados` construye su
  `RegExp` con los nombres internos de los parámetros, nunca con texto de la petición.
- **Validación de la tasa: correcta.** `tasaValida` exige un número finito entre 20 y
  200 y lo redondea a dos decimales. Admite la coma decimal y rechaza texto, 0, 630 y
  NaN. Se vuelve a validar **al leer** (`tasaUsd`), así que un valor corrupto en
  `ajustes` o en `MERCA_TASA_USD` se ignora en vez de reordenar el catálogo. Escribirla
  exige administrador (`conAdmin`): sin sesión da 401 y un anunciante recibe 404, como
  prueba `catalogo:probar`. Queda declarada en `ESCRITURAS_ADMIN_PROPIAS` y
  `bitacora:probar` la reconoce.
- **Autorización de `PATCH /api/anuncios/:id/disponibilidad`:** el dueño se comprueba
  en la API (404 al ajeno, sin confirmar que el anuncio existe) y otra vez en el
  `UPDATE … AND organizacion_id = ?`.
- **XSS:** los chips, la nota de la tasa y el origen de la tasa se pintan con `esc()` o
  `textContent`. Los textos de disponibilidad son fijos y no salen del anuncio.

## Reglas de CLAUDE.md

| Regla | Estado |
|-------|--------|
| Sin teléfono publicado | ✓ El único número del diff es `8095550000`, el dato ficticio de la cuenta que crea el arnés `probar-catalogo.js`; no sale en ninguna página. |
| Cero dependencias | ✓ `package.json` solo gana el script `catalogo:probar`. |
| Migraciones solo al final | ✓ `2026-09-anuncios-disponibilidad` va la última de `MIGRACIONES`; ninguna anterior se toca. `db/schema.sql` no cambia. |
| Final `module.exports` de los módulos compartidos | ✓ `assets/precios.js` sigue terminando en `if (typeof module !== 'undefined' && module.exports)`, con las exportaciones nuevas dentro. `servicios.js`, `taxonomia.js` y `legales.js` no se tocan. |
| Rutas específicas antes que genéricas | ✓ `PATCH /api/anuncios/:id/disponibilidad` va antes de `PATCH /api/anuncios/:id`, y `GET /api/anuncios/:id` no la atrapa (`[\w-]+` no cruza `/`). |
| `!!ctx` en ruta pública | ✓ `catalogo` no lee `ctx.organizacion`; `editarDisponibilidad` va tras `conSesion` y aun así comprueba `ctx.organizacion`. |
| Interruptor de servicios, planes, precios | ✓ No se tocan. |
| Tres estilos de prueba | ✓ `probar-catalogo.js` usa el arnés propio con contadores y `process.exit`, y fija las variables de entorno antes del `require` de `db.js`. |

## Advertencias (corregidas)

### WR-01 · `?orden=toString` tumbaba el catálogo público con un 500

**Archivo:** `tools/db.js`, `buscarAnuncios` · **Corregido en:** `6c3973d`

`ORDENES_SQL[f.orden] || ORDENES_SQL[ORDEN_POR_DEFECTO]` con `constructor`, `toString` o
`__proto__` devolvía lo heredado de `Object`. Eso es truthy, así que se interpolaba en
el `ORDER BY` (`ORDER BY function Object() { [native code] }`) y SQLite respondía con un
error de sintaxis: 500 para cualquier visitante. **No era inyección**, porque el texto
interpolado es código de JavaScript y no de la petición, pero sí un 500 que cualquiera
podía provocar. La línea es anterior a la fase y la fase reescribió la función de
alrededor.

**Arreglo:** solo cuentan las claves propias (`Object.hasOwn(ORDENES_SQL, f.orden || '')`).
Tres comprobaciones nuevas en `catalogo:probar` (vistas en MAL antes del arreglo y en
«ok» después), y en `auditar-publico` la visita a `?orden=toString` tiene que dar
resultados.

### WR-02 · El chip de `?permuta=constructor` decía «function Object() { [native code] }»

**Archivo:** `assets/app.js`, `VALOR_FILTRO` · **Corregido en:** `6c3973d`

Es la misma trampa en el cliente, introducida por la fase. La limpieza
`!VALOR_FILTRO[k][filtros[k]]` daba el valor por bueno porque encontraba la función
heredada, y el chip pintaba su texto. El servidor, en cambio, lo ignoraba: la pantalla
enseñaba un filtro que no estaba aplicado.

**Arreglo:** `textoValorFiltro(k, v)`, que usa `hasOwnProperty`, para la limpieza y para
el chip. `auditar-publico` comprueba ahora que `?permuta=constructor` no deja chip ni
casilla marcada (salida: `chips «»`).

### WR-03 · La pastilla «Bajo pedido» de la tarjeta quedaba a 4,45:1 en tema claro

**Archivo:** `styles.css` · **Corregido en:** `f34b9bd`

No la encontró la lectura sino `check-contraste`, al correr la auditoría del navegador
de esta revisión. La daba en Inicio, Transporte, Financiamiento y el perfil de dealer,
y el job `navegador` del CI habría parado la fusión. El tinte ámbar al 16 % sobre el
fondo gris de la tarjeta oscurecía el fondo de la letra `--ambar-texto`.

**Arreglo:** dentro de la tarjeta (`.aviso__pie .pastilla--ambar`) el tinte baja al 10 %,
el mismo que ya usa `.pastilla--verde` por la misma razón. La clase sigue siendo la que
pide el UI-SPEC y las demás pastillas ámbar no cambian. Después del arreglo, 0 hallazgos
en 17 rutas y los dos temas.

## Observaciones informativas (sin cambio)

- **IN-01 · Un cuerpo JSON `null` da 500.** `leerCuerpo` devuelve `null` para el cuerpo
  `null`, y `c.tasa` o `c.disponibilidad` lanzan. Es el patrón de todos los manejadores
  del archivo, anterior a la fase, y solo lo alcanzan un administrador o el dueño con
  sesión. Si se arregla, que sea en `leerCuerpo` para todos, en la fase de deuda técnica.
- **IN-02 · La API deja cambiar la disponibilidad de un anuncio vendido.** El panel
  esconde el botón, pero la ruta no lo impide. Solo puede hacerlo el dueño y no cambia
  nada que vea un comprador, así que no se añade la restricción.
- **IN-03 · El filtro y el orden por precio no usan índice.** Es una decisión documentada
  en el comentario de `PRECIO_EN_PESOS`: 7 a 9 ms medidos sobre 20.000 anuncios. Con
  decenas de miles compensará una columna.
- **IN-04 · Con «precio de menor a mayor», «Precio a consultar» sale primero.** `CASE`
  devuelve NULL para `precio` NULL y SQLite ordena NULL primero en ASC. Era igual antes
  de la fase con `a.precio ASC`. Si se quiere al final, se decide en otra fase porque
  cambia el comportamiento visible.
- **IN-05 · `tasaValida([63])` acepta el valor**, porque pasa por `String()`. Es inocuo:
  el resultado es el número 63, válido y dentro de rango.
