# Fase 12 — Lote mensual de comprobantes

**Recogido:** 2026-09-29, sin discusión interactiva (Victor pidió no esperar entre fases).
Fuentes: `ROADMAP.md` (fase 12 y sus 3 criterios), `REQUIREMENTS.md` (CONTAB-01), `CLAUDE.md`
(reglas de negocio y fiscales), y el código de `tools/db.js` (`facturas`, `secuencias_ncf`,
`lotes_contador`), `tools/facturas.js`, `tools/pdf.js` y la ruta `exportarFacturas` de
`tools/api.js`. Valores por defecto marcados **(por defecto, reversible)**.

## Phase Boundary

Entra: que Victor, desde la consola de administración, elija un mes y **descargue un solo archivo**
con todos los comprobantes emitidos en ese mes (el PDF de cada uno tal como se emitió) y su resumen,
y que ese archivo **cuadre** con la base: los mismos NCF, los mismos importes, el mismo ITBIS.

No entra: enviar nada a nadie (ni al contador ni a Victor: **prohibido a propósito**, regla de
negocio de `CLAUDE.md`); tocar cómo se emite un comprobante, su PDF, los NCF o el ITBIS; el archivo
del Formato 607 de la DGII **salvo que Victor o su contador lo pidan** (pregunta 1); recordatorios de
fin de mes; facturación electrónica (e-CF); la fase 13 de deuda técnica.

## Implementation Decisions

### Qué es el paquete
- **D-01** **Es solo lectura.** Generar el paquete no escribe nada en `facturas` ni en ninguna otra
  tabla: ni `incluida_en_lote`, ni `lotes_contador`, ni migración nueva. Un comprobante emitido no se
  reescribe, y marcarlo «incluido» es reescribirlo. Las dos piezas de la migración
  `2026-09-comprobantes-plantilla` (`facturas.incluida_en_lote` y la tabla `lotes_contador`, con
  `enviado_en` y `destinatario`) son de cuando se pensó un envío automático: **se dejan como están,
  sin usar y sin borrar** (una migración anterior ya corrió en producción), y un comentario en el
  código nuevo dice por qué no se usan.
- **D-02** **El contenedor es un ZIP escrito a mano** con `node:zlib` (`crc32` y `deflateRawSync`) y
  `Buffer`, sin dependencias. Se arma en memoria (un mes son decenas o cientos de PDF de ~3 KB) y
  se sirve como descarga; **no se guarda en disco** (`lotes_contador.ruta_zip` queda en NULL). Nombre:
  `comprobantes-AAAA-MM.zip`. Con fechas de archivo fijas dentro del ZIP, para que descargar dos veces
  el mismo mes dé los mismos bytes. **(por defecto, reversible: la alternativa, un PDF único, se
  descartó en la investigación; ver `12-RESEARCH.md`.)**
- **D-03** **Contenido (por defecto, reversible; pregunta 2):**
  - `pdf/<numero>.pdf`: los bytes del PDF guardado de cada comprobante, sin volver a dibujarlos.
  - `resumen.csv`: una fila por comprobante, con `;` y BOM como el CSV que ya existe.
  - `resumen.pdf`: una página con la cabecera del emisor, el mes y los totales por tipo de comprobante
    (cantidad, subtotal, ITBIS, total) y el cuadre. Una página, porque `tools/pdf.js` no pagina.
  - `LEEME.txt`: qué contiene, la zona horaria y la advertencia de que lo genera el sitio a petición
    y que el envío lo hace Victor.
- **D-04** **El mes es el mes de Santo Domingo** (`America/Santo_Domingo`, UTC−4 fijo, sin horario de
  verano): el mes M va de `M-01T04:00:00.000Z` (incluido) a `M+1-01T04:00:00.000Z` (excluido). No se
  usa `substr(fecha, 1, 7)` (es mes UTC y manda a otro mes lo emitido entre las 20:00 y las 24:00 del
  último día). La fecha que cuenta es `facturas.fecha` (el día que entró el dinero, no el del pedido).
- **D-05** **Entra todo lo emitido en el mes, sin filtrar por estado (por defecto, reversible;
  pregunta 4):** facturas de crédito fiscal (B01), de consumo (B02, cuando exista), notas de crédito
  (B04, cada una en el mes en que se emitió, no en el del original) y los **recibos no fiscales**
  (sin NCF, marcados «sin valor fiscal» en el resumen). Los comprobantes anulados **siguen dentro**
  con su nota: el contador necesita ver los dos. En el resumen los totales fiscales y los recibos
  van en bloques separados, y las notas de crédito restan.
- **D-06** **El paquete se verifica a sí mismo antes de entregarse.** El total de comprobantes, la
  suma de subtotal, ITBIS y total del resumen se comparan con una consulta SUM independiente sobre el
  mismo rango; y cada fila comprueba `subtotal + ITBIS = total`. Si el resumen no coincide con la base
  no se entrega (500 con mensaje claro). Si una fila vieja no cuadra por sí sola, se entrega igual,
  marcada en una columna «Cuadra» y en el resumen: no se puede corregir un comprobante emitido.
- **D-07** **Un PDF que falta se repone; si no se puede, no se entrega el paquete.** Antes de armar se
  repone el papel de los comprobantes del mes cuyo archivo no está (mismo criterio que
  `regenerarPdfsPendientes`, pero **por mes y sin el tope de 200**) y el resumen los marca como
  «repuesto». Si alguno sigue sin PDF, respuesta 409 con la lista de números: un paquete incompleto que
  parece completo es peor que ninguno.
- **D-08** **Se puede pedir el mes en curso** (para ver cómo va), y entonces el nombre del ZIP lleva
  `-parcial` y el resumen lo dice arriba. La consola preselecciona el mes anterior. Un mes futuro
  devuelve 400.
  *Nota de planificación (2026-09-30, plan 12-04):* el selector `#mesFacturas` NO se preselecciona,
  porque también filtra la tabla, que hoy arranca en «todos». Si no hay mes elegido, el paquete usa el
  mes anterior de Santo Domingo como respaldo y la línea de la consola lo dice. Victor lo revisa; si
  prefiere la preselección, es un cambio de una línea.

### Cómo se pide
- **D-09** Rutas solo de administración (`conAdmin`, que responde 404 a quien no lo es), ambas GET y
  específicas antes de las genéricas: una **vista previa** en JSON
  (`/api/admin/lote-contador/AAAA-MM`: cantidad, totales, recibos, cuántos PDF faltan) y la
  **descarga** (`/api/admin/lote-contador/AAAA-MM.zip`). Cabeceras como las del CSV y el PDF:
  `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, `Content-Disposition:
  attachment`. Como son GET que no escriben, no pasan por la bitácora de escrituras.
- **D-10** En `admin.html`, dentro de «Comprobantes emitidos» y junto a «Exportar CSV», un botón
  **«Descargar paquete del mes»** que usa el mes ya elegido en el selector, con una línea que dice qué
  llevará (N comprobantes, total) y el texto fijo: «Descárgalo y envíalo tú: el sitio no lo envía a
  nadie». Sin navegador nuevo: un `<a download>` como el del CSV.
- **D-11** **Ningún camino automático (criterio 3), comprobado con una prueba:** no hay tarea en
  `TAREAS`, ni temporizador en `serve.js`, ni `correo.enviar` en el módulo nuevo, y generar el
  paquete no deja ningún correo en la bandeja de pruebas. La prueba vigila que no aparezca (como
  `probar-transferencia.js` vigila `db.aprobarPago` en `api.js`).

### Estructura del código
- **D-12** Un módulo nuevo `tools/lote.js` (sin dependencias, con `require.main` limpio) con: el
  cálculo del rango del mes, `armarPaquete(mes)`, el escritor ZIP y el CSV. Una consulta nueva en
  `tools/db.js` (todo el SQL vive allí), **solo lectura y sin LIMIT**: `comprobantesDelPeriodo(desde,
  hasta)`. Ninguna migración. `tools/facturas.js` solo aporta lo que ya exporta (`leerPdf`,
  `rutaAbsoluta`, `dibujar`) más, como mucho, un `reponerPdfsDe(filas)`; **no se cambia cómo se
  emite ni cómo se dibuja un comprobante** (un plan que toque `facturas.js` lo verifica Opus; la ejecución siempre es Sonnet 5.5).
- **D-13** `exportarFacturas` (CSV suelto) **no se toca** y sigue como está; el CSV del paquete puede
  compartir columnas con él pero es otro archivo, con su propia prueba.

### Claude's Discretion
- Nombres exactos de rutas, de archivos dentro del ZIP (`pdf/` frente a carpeta plana) y del script
  de prueba (`npm run lote:probar`, con su paso en `.github/workflows/`).
- Si el `LEEME.txt` y el `resumen.pdf` van los dos o solo uno, mientras el resumen legible por
  humanos exista.
- Cómo se repone un PDF (función nueva en `facturas.js` o reutilizar `regenerarPdfsPendientes` con un
  parámetro de mes), siempre sin cambiar lo que dice la fila.
- Detalle visual del botón y la línea de vista previa (fase con `UI hint`).
- *Sin `12-UI-SPEC.md`, a propósito:* la interfaz es un botón y una línea de texto en una sección que
  ya existe, con clases existentes y sin tocar `styles.css`; el plan 12-04 fija todo lo que un contrato
  de diseño diría.

## Canonical References

- `.planning/ROADMAP.md` fase 12 (goal, 3 criterios, notas); `.planning/REQUIREMENTS.md` CONTAB-01.
- `CLAUDE.md`: «Nunca se envía nada automáticamente a un contador», «Un comprobante emitido nunca se
  borra ni se reescribe», «Cero dependencias», «Los informes van a gerencia@… con copia aparte»
  (no aplica: esto no es un informe).
- `tools/db.js`: migración `2026-09-comprobantes` y `2026-09-comprobantes-plantilla` (esquema de
  `facturas`, `lotes_contador`, `incluida_en_lote`), `crearFactura`, `facturas()`, `tomarNcf`,
  `siguienteNumero`, `secuenciasNcf`.
- `tools/facturas.js`: `dibujar`, `guardarPdf`, `leerPdf`, `rutaAbsoluta`, `regenerarPdfsPendientes`,
  `emitirNotaCredito`, `decidirTipo`, `TITULOS`; `tools/pdf.js` (una sola página).
- `tools/api.js`: `conAdmin`, `exportarFacturas` (CSV con `;` y BOM), `listarFacturas`,
  `descargarFactura`, tabla `RUTAS` (`/api/admin/facturas…`).
- `admin.html` (sección `t-facturas`) y `assets/admin.js` (`cargarFacturasAdmin`, `MES_FACTURAS`,
  `#btnCsv`).
- `tools/probar-facturas.js` y `tools/probar-transferencia.js` (`pedir` con req/res falsos);
  `tools/probar-bitacora.js` (guarda de rutas de escritura de `/api/admin/`).
- Estado de los NCF y pendientes de Victor: `.planning/STATE.md` («Pendiente de Victor»).

## Deferred Ideas

- Aviso interno a Victor («ya puedes descargar el lote de septiembre») el día 1 o 2: no es enviar al
  contador, pero es un correo nuevo y Victor no lo pidió. Si lo quiere, fase aparte.
- Guardar un registro de qué meses se descargaron (la tabla `lotes_contador` serviría) y avisar si un
  mes ya descargado cambió: solo si Victor lo echa en falta.
- Corregir que la fecha impresa en el PDF (`fechaCorta` en UTC) pueda adelantarse un día en lo emitido
  entre las 20:00 y las 24:00 hora dominicana: toca `tools/facturas.js` (fiscal) y no reescribe lo ya
  emitido; va a la fase 13 (deuda técnica), junto a `db.facturas({ mes })`, que también cuenta por mes UTC.
- Firma del ZIP, sumas de control publicadas o cifrado con contraseña.
- Facturación electrónica (e-CF): pendiente de la respuesta del contador (ver STATE).
- Encender o borrar `incluida_en_lote` y `lotes_contador`: decisión para la fase 13.

## Preguntas para Victor

Solo lo que él o su contador pueden contestar. Cada una trae el valor por defecto con el que se
planifica y se construye; si contestan otra cosa, se cambia después sin rehacer la fase.

1. **¿El contador quiere además el archivo del Formato 607 (ventas del mes) y en qué formato?**
   La DGII pide el 607 cada mes; se envía como texto delimitado por `|` con una línea de encabezado
   (RNC del emisor, período AAAAMM, cantidad de registros) y una línea por comprobante con NCF, y
   admite la plantilla de Excel. Si el contador ya lo arma a mano a partir de los PDF, no hace falta.
   Si lo quiere, hay que saber: TXT de la DGII o Excel, quién lo sube, y cómo clasifica cada venta
   (tipo de ingreso, forma de pago; el sitio hoy cobra por transferencia y con la demo, y CardNet
   después). **Por defecto: NO se genera; el `resumen.csv` lleva RNC, NCF, NCF modificado, fecha,
   subtotal, ITBIS y total para que el contador lo arme.** Si dicen que sí, se añade
   `607-AAAAMM.txt` al ZIP como una tarea más, con su prueba.
2. **¿Qué debe llevar el paquete?** **Por defecto:** el PDF de cada comprobante, `resumen.csv`
   (separado por `;`, abre bien en Excel en español), `resumen.pdf` de una página con los totales y
   un `LEEME.txt`. El contador puede preferir otra cosa (solo PDF y CSV, o coma en vez de `;`).
3. **¿Le sirve al contador un ZIP, o prefiere un solo PDF con todos los comprobantes?**
   **Por defecto: ZIP**, porque conserva el PDF exacto que recibió el cliente y el que quedó
   guardado (un PDF único habría que volver a dibujarlo y podría no ser idéntico), y se puede abrir
   en cualquier computadora. Solo cambia si el contador no puede abrir un ZIP.
4. **¿Los recibos no fiscales (sin NCF) van en el paquete?** Hoy, mientras no exista la secuencia B02,
   quien compra sin RNC recibe un recibo sin NCF. **Por defecto: sí van, separados y rotulados «sin valor
   fiscal»**, y el resumen los suma aparte para que el contador no los mezcle con lo declarable. Si el
   contador no los quiere en el lote, se quitan del ZIP pero se siguen contando en el resumen.
5. **¿El corte es el mes calendario dominicano?** **Por defecto: sí**, del día 1 a las 00:00 al último
   día a las 24:00 hora de Santo Domingo, y la fecha que cuenta es la de cobro (la del comprobante),
   no la del pedido. Si el contador cierra el mes otro día, hay que decirlo.
