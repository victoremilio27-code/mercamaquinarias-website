# Fase 12: Lote mensual de comprobantes - Investigación

**Investigado:** 2026-09-29
**Dominio:** exportación fiscal de solo lectura (SQLite → ZIP con PDF y CSV) en Node sin dependencias
**Confianza:** ALTA en el código existente y en el ZIP (probado aquí); MEDIA-BAJA en el Formato 607 (no se pudo abrir la DGII: el proxy bloquea `dgii.gov.do`)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
Fase recogida sin discusión interactiva: no hay decisiones bloqueadas por Victor en esta fase. Las
reglas que valen como bloqueadas vienen de `CLAUDE.md` (ver «Restricciones del proyecto») y de
`ROADMAP.md`: descarga manual como único camino, comprobante emitido nunca se reescribe, un solo archivo,
cuadre con la base, PDF con `tools/pdf.js` sin dependencias nuevas.

Decisiones D-01 a D-13 de `12-CONTEXT.md`, todas **(por defecto, reversible)** salvo la regla de
negocio: D-01 solo lectura (sin `incluida_en_lote`, sin `lotes_contador`, sin migración); D-02 ZIP a
mano con `node:zlib`, en memoria, reproducible; D-03 contenido `pdf/`, `resumen.csv`, `resumen.pdf`,
`LEEME.txt`; D-04 mes de Santo Domingo con límites UTC−4; D-05 entra todo (B01, B02, B04, recibos,
anulados); D-06 auto-verificación de cuadre; D-07 PDF faltante se repone o 409; D-08 mes en curso
«parcial»; D-09 dos rutas GET `conAdmin`; D-10 botón junto a «Exportar CSV»; D-11 sin camino
automático y con prueba; D-12 `tools/lote.js` + consulta nueva en `tools/db.js`; D-13 el CSV suelto
no se toca.

### Claude's Discretion
Nombres de rutas, de archivos dentro del ZIP y del script de prueba; si van `LEEME.txt` y
`resumen.pdf` los dos o uno; cómo se repone un PDF; detalle visual del botón y la vista previa.

### Deferred Ideas (OUT OF SCOPE)
Aviso interno a Victor de fin de mes; registro de meses descargados; corregir la fecha UTC de
`fechaCorta` y `db.facturas({ mes })` (fase 13); firma/cifrado del ZIP; e-CF; encender o borrar
`incluida_en_lote` y `lotes_contador` (fase 13).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Descripción | Apoyo de la investigación |
|----|-------------|---------------------------|
| CONTAB-01 | Paquete mensual de comprobantes que Victor **descarga y envía él**. Nunca se envía nada automáticamente a un contador. | ZIP a mano (sección «Comparación»); consulta por rango de mes de Santo Domingo; auto-verificación de cuadre; rutas GET `conAdmin`; prueba de ausencia de camino automático. |

Criterios de éxito del ROADMAP → dónde se cubren: (1) un solo archivo con todos los comprobantes y su
resumen → ZIP + `resumen.*`; (2) cuadra con la base → D-06 y sección de validación; (3) ningún camino
automático → D-11 y prueba de guarda.
</phase_requirements>

## Restricciones del proyecto (de CLAUDE.md)

- **Nunca se envía nada automáticamente a un contador.** Sin tarea, sin temporizador, sin `correo.enviar` en el código nuevo.
- **Comprobante emitido nunca se borra ni se reescribe** (importe, NCF, fecha). El paquete solo lee. Tampoco se marca `incluida_en_lote`.
- **Cero dependencias en tiempo de ejecución; sin TypeScript ni compilación.** Solo `node:*`. La única dependencia de desarrollo es puppeteer.
- **Migraciones solo al final de `MIGRACIONES`**; aquí no hace falta ninguna. Todo el SQL vive en `tools/db.js`.
- **Rutas: array plano `[metodo, regexp, manejador]` en `tools/api.js`; la específica antes que la genérica.**
- **Tres estilos de prueba, no unificar**: esta fase usa el arnés propio (contadores + `process.exit`) y, si acaso, `node:test` para una función pura. Las variables de entorno se fijan **antes** de `require('./db')`.
- **El shell se come las comillas invertidas**: nada de heredocs con backticks, `${}` ni regex con `\s`/`\d`; solo herramientas de escritura de archivos.
- **CRLF en el repositorio** (no en `.sh`, `deploy/` ni `.github/workflows/`); editar con las herramientas de edición, no comparando cadenas con `\n`.
- **Fusionar a `main` despliega a producción**: rama y PR; un PR por fase; CI en verde (`pruebas` y `navegador`).
- Todo en español (identificadores, comentarios que explican qué falló antes y por qué el código es así, textos, commits).
- Plan que toque el comprobante, ITBIS o NCF (`tools/facturas.js`) lo ejecuta Sonnet 5.5 como todo y lo verifica Opus; hoy la fase no debería tocarlo (ver D-12).
- No se publica teléfono ni dirección de la empresa; para facturas el domicilio registrado está en `tools/correo.js` (`EMPRESA`).

## Resumen

Los comprobantes ya están completos en la base: la tabla `facturas` guarda todo lo que el PDF imprime
(razón social, RNC, subtotal, ITBIS, total, tasa, NCF, NCF modificado, `ruta_pdf`, `anulado_por`), y el
PDF de cada uno está en disco (`MERCA_FACTURAS`, `/var/lib/mercamaquinarias/facturas` en producción)
y se sirve con `facturas.leerPdf(ruta_pdf)`. Ya existe un CSV de comprobantes para administración
(`exportarFacturas`, `;` con BOM) y un selector de mes en la consola. Lo que falta es empaquetar el
mes: elegir bien las filas (mes dominicano, sin tope, sin duplicados), reunir los PDF ya emitidos,
generar el resumen y entregar todo como un archivo.

La migración `2026-09-comprobantes-plantilla` ya dejó `facturas.incluida_en_lote` y la tabla
`lotes_contador` (con `enviado_en` y `destinatario`) preparadas para un envío automático que Victor
después prohibió. No hay ninguna referencia a ellas en el código (comprobado con grep). **No se usan**:
marcar un comprobante como «incluido» es reescribirlo y el ROADMAP dice que el paquete solo lee.

**Recomendación principal:** un ZIP escrito a mano (`node:zlib` `crc32` + `deflateRawSync`, ~60
líneas, verificado aquí con `unzip -t` y Python `zipfile`) con los PDF exactos que ya existen, un
`resumen.csv`, un `resumen.pdf` de una página y un `LEEME.txt`, servido desde una ruta GET
`conAdmin`; el mes se corta a las 04:00Z (UTC−4, sin horario de verano) y el paquete se niega a salir
si su resumen no coincide con un SUM independiente de la base o si falta un PDF.

## Mapa de responsabilidad por capa

| Capacidad | Capa principal | Capa secundaria | Razón |
|-----------|----------------|-----------------|-------|
| Elegir filas del mes (rango de Santo Domingo) | Base de datos (`tools/db.js`) | API | Todo el SQL vive en `db.js`; el rango se calcula en `lote.js` y se pasa como parámetros. |
| Reunir PDF, armar ZIP, CSV y resumen | API / Backend (`tools/lote.js`) | — | Es lógica de negocio y bytes; el navegador no debe ensamblar comprobantes. |
| Verificación de cuadre | API / Backend | Base de datos (SUM independiente) | La cifra de control sale de otra consulta, no del mismo arreglo. |
| Control de acceso | API / Backend (`conAdmin`) | — | 404 a quien no es administrador; se comprueba contra la base en cada petición. |
| Elegir mes, ver qué llevará, descargar | Navegador (`admin.html`, `assets/admin.js`) | — | Selector y `<a download>`; sin lógica fiscal. |
| Almacén del PDF emitido | Disco (`MERCA_FACTURAS`) | Base (`ruta_pdf`) | Ya existe; se lee, no se toca. |

## Stack estándar

### Núcleo
| Pieza | Versión | Propósito | Por qué |
|-------|---------|-----------|---------|
| `node:zlib` (`crc32`, `deflateRawSync`) | Node ≥ 22.5 del `engines`; probado en 22.22.2; el VPS corre 24 | Suma de control y compresión del ZIP | Ya viene en Node. `zlib.crc32` existe desde Node 22.2 y 20.15 [CITED: nodejs.org/api/zlib.html#zlibcrc32data-value] y aquí devuelve `cbf43926` para `"123456789"` (el valor de control estándar) [VERIFIED: ejecución local]. |
| `node:sqlite` `DatabaseSync` | el del proyecto | Consulta del mes | Ya es la base del proyecto. |
| `tools/pdf.js` | propio | `resumen.pdf` de una página | Regla del ROADMAP: PDF con `tools/pdf.js`. |

### Alternativas descartadas
| En vez de | Podría usarse | Compensación |
|-----------|---------------|--------------|
| ZIP a mano | Paquete npm (`archiver`, `jszip`, `adm-zip`) | Prohibido por «cero dependencias»; el ZIP mínimo son ~60 líneas. |
| ZIP a mano | Un PDF único | Ver «Comparación»; obliga a volver a dibujar y a paginar `pdf.js`. |
| ZIP a mano | `.tar.gz` con `zlib.gzipSync` | El contador en Windows no lo abre de fábrica. |
| ZIP a mano | Ejecutar `zip` del sistema con `child_process` | No es portable ni está garantizado en el VPS de 512 MB; añade dependencia de sistema. |

**Instalación:** ninguna. No se instala ningún paquete.

## Auditoría de legitimidad de paquetes

No se instala ningún paquete externo en esta fase (solo módulos `node:*`), así que no aplica el
control de slopcheck ni el de `npm view`.

| Paquete | Registro | Edad | Descargas | Repositorio | slopcheck | Disposición |
|---------|----------|------|-----------|-------------|-----------|-------------|
| — | — | — | — | — | — | Ninguno |

**Paquetes eliminados por [SLOP]:** ninguno. **Marcados [SUS]:** ninguno.

## Cómo se guardan hoy los comprobantes [VERIFIED: lectura de tools/db.js y tools/facturas.js]

**Tabla `facturas`** (migraciones `2026-09-comprobantes` y `2026-09-comprobantes-plantilla`):
`id`, `pago_id`, `organizacion_id`, `numero` (UNIQUE, `MM-AAAA-NNNNNN`, correlativo por año, todos los
comprobantes), `tipo` (`recibo` | `factura_consumo` | `factura_credito_fiscal` | `nota_credito`),
`ncf` (UNIQUE, solo fiscales), `ncf_vencimiento`, `ncf_modificado` (NCF del original en una nota; si el
original era recibo, su número interno), `razon_social`, `rnc`, `direccion`, `telefono`, `correo`,
`concepto`, `subtotal`, `descuento`, `itbis_tasa` (REAL, se guarda con el comprobante), `itbis`, `total`
(enteros en pesos), `moneda` (por defecto `DOP`), `condicion_pago`, `metodo_pago`, `referencia_pago`,
`periodo_servicio`, `notas`, `fecha` (ISO UTC de `pago.confirmado || pago.creado`), `ruta_pdf`
(relativa a `MERCA_FACTURAS`), `enviada_cliente`, `enviada_interna`, `intentos_envio`, `anula_a`,
`anulado_por`, `creada`, `incluida_en_lote` (sin uso), y `lotes_contador` (sin uso).

- **`subtotal` es el gravado** (base + ajuste del 3 %, desde la 05.1) y el total sale de
  `subtotal + itbis` por construcción [CITED: STATE.md, decisión 05.1-01]. El resumen debe llamarlo
  «Subtotal gravado», y para los pagos anteriores a la 05.1 el desglose puede diferir: por eso la
  columna «Cuadra» de D-06.
- **Recibo no fiscal**: `tipo = 'recibo'`, `ncf` NULL. Hoy salen así todos los que compran sin RNC (no hay
  B02 cargada) o con B01 agotada.
- **Nota de crédito B04**: fila nueva con `tipo = 'nota_credito'`, mismos importes que el original en
  positivo, `anula_a` = id del original, `ncf_modificado` = NCF del original; el original solo recibe
  `anulado_por`. Cada una lleva su propia `fecha` (la de emisión de la nota) y, por tanto, puede caer en un
  mes distinto del original.
- **PDF**: se dibuja con `tools/pdf.js` (Helvetica estándar, una página, carta) al emitir; se guarda en
  `MERCA_FACTURAS/AAAA/MM/<numero>.pdf`, con la carpeta por año/mes **UTC** de `fecha`, y la ruta
  relativa en `ruta_pdf`. Es el mismo archivo que se adjunta al cliente. Puede faltar (`ruta_pdf` NULL o
  el archivo perdido): emitir no depende del PDF y `regenerarPdfsPendientes` lo repone.
- **Lectura segura del PDF**: `facturas.leerPdf(relativa)` resuelve la ruta y comprueba que quede dentro
  de `CARPETA`; devuelve `null` si no está.
- **Numeración**: `db.siguienteNumero` cuenta sobre la propia tabla; `db.tomarNcf` toma de
  `secuencias_ncf` con SAVEPOINT y UPDATE condicionado. Estas dos no se tocan.
- **Cifras de control ya existentes**: `db.facturas({ mes, pendientes, limite })` (para administración) y
  `db.informeMensual` (`comprobantes.porTipo`, por `fecha` en rango).

### Lo que **no** sirve tal cual para el lote

1. `db.facturas({ mes })` filtra con `substr(f.fecha, 1, 7) = ?` = **mes UTC**, tiene `LIMIT 500` por
   defecto y hace `LEFT JOIN miembros ... rol = 'propietario'` sin `LIMIT 1`: una organización con dos
   propietarios duplicaría filas (inferido del SQL, no reproducido). Para el lote se escribe una
   consulta nueva, sin join y sin tope.
2. `facturas.regenerarPdfsPendientes({ limite })` recorre `db.facturas({ limite })` = las 200 más
   recientes: un mes viejo con PDF perdido **no entraría**. Hay que reponer por mes.
3. `regenerarPdfsPendientes` dibuja con `dibujar(f, ...)` sin el `detalle` (`cantidad`,
   `precio_unitario`, `periodo`) que sí se pasó al emitir. Un PDF repuesto puede diferir del original en
   esas líneas. Los importes y el NCF salen de la fila y no cambian. Por eso D-07 lo marca «repuesto».
4. `fechaCorta` del PDF usa `getUTC*`: la fecha impresa puede adelantarse un día en lo emitido entre las
   20:00 y las 24:00 hora dominicana. No se puede reescribir lo emitido; va a la fase 13 (CONTEXT, diferido).

## Consola de administración [VERIFIED: lectura de admin.html, assets/admin.js, tools/api.js]

- `admin.html`, sección `t-facturas` («Comprobantes emitidos»): selector `<input type="month" id="mesFacturas">`,
  enlace `<a id="btnCsv" href="/api/admin/facturas.csv" download>`, tabla, «Pendientes de regularizar»,
  secuencias NCF.
- `assets/admin.js`: `MES_FACTURAS`, `cargarFacturasAdmin()` (pinta y reasigna `#btnCsv.href` con `?mes=`),
  `montarFacturasAdmin()` (evento `change` del selector).
- `tools/api.js` (`RUTAS`, ~4411-4415): `GET /api/admin/facturas`, `GET /api/admin/facturas.csv`,
  `POST /api/admin/facturas/:id/reenviar`, `POST /api/admin/facturas/:id/anular`. Pendiente del plan:
  comprobar el lugar exacto y añadir las dos rutas nuevas **antes** de `/api/admin/facturas/([\w-]+)/…`
  no es necesario porque no chocan, pero sí ir junto a ellas.
- `conAdmin` (línea ~209): requiere sesión, relee `es_admin` en la base en cada petición, responde 404 a
  quien no lo es. Las rutas GET no pasan por la bitácora de escrituras
  (`tools/probar-bitacora.js` solo vigila POST/PUT/PATCH/DELETE).
- Descargas existentes como modelo de cabeceras: CSV (`text/csv`, `attachment`, `private, no-store`,
  `nosniff`, BOM) y PDF (`descargarFactura`).
- `tools/auditar-permisos.js` (~línea 176) lista rutas admin que un usuario normal no debe ver: la
  ruta nueva se añade ahí.

## Comparación: cómo entregar «un solo archivo» sin dependencias

| Criterio | ZIP escrito a mano | Un solo PDF con `tools/pdf.js` |
|----------|--------------------|-------------------------------|
| Fidelidad con lo emitido | **Exacta**: mete los bytes del PDF guardado, el mismo que recibió el cliente. Respeta «su PDF tampoco se reescribe». | Hay que **volver a dibujar** cada comprobante (no se pueden concatenar PDF completos sin un analizador de PDF). Puede diferir del guardado (cantidad, periodo, fecha UTC). |
| Cambios en código existente | Ninguno en `pdf.js`. | `pdf.js` es de **una página** y su cabecera lo dice: hay que multi-página (`/Kids`, un flujo por página), y refactorizar `dibujar()` (fiscal) para dibujar sobre un documento común. |
| Resumen | `resumen.csv` (cualquier volumen) + `resumen.pdf` de una página con totales. | Un resumen por filas necesita paginado, que `pdf.js` no tiene. |
| Tamaño de código | ~60 líneas, probado (abajo). | Cientos de líneas y riesgo de PDF que «no abre» (xref con desplazamientos exactos). |
| Verificación | `unzip -t`, Python `zipfile` y lector propio con `inflateRawSync` + CRC. | Solo abrirlo a ojo. |
| Uso para el contador | Abre en Windows/macOS sin instalar nada; separa PDF y datos; el CSV va a Excel. | Un solo documento para imprimir, pero sin datos legibles por máquina. |
| Límites | ≤ 65 535 entradas y < 4 GB (sin ZIP64): sobrados; se comprueba y se falla claro. | Sin límite práctico, pero pesado en RAM. |

**Recomendación: ZIP.** Se conserva el PDF exacto, no se toca código fiscal y `pdf.js` sigue como está.
Un PDF único solo se justifica si el contador no puede abrir un ZIP (pregunta 3 de CONTEXT).

### El ZIP mínimo, verificado

Escrito y probado en esta sesión (`unzip -t`: sin errores; Python `zipfile.testzip()`: `None`; dos
llamadas con la misma entrada dan bytes idénticos). Formato según la especificación PKWARE APPNOTE
[CITED: pkware.com/documents/casestudies/APPNOTE.TXT]: cabecera local `0x04034b50`, directorio central
`0x02014b50`, fin de directorio `0x06054b50`, versión 20, método 8 (deflate) o 0 (almacenado), bit 11
(`0x0800`) para nombres UTF-8, fecha DOS fija.

```js
// Fuente: probado en el entorno (unzip -t y Python zipfile); formato APPNOTE de PKWARE.
const zlib = require('node:zlib');

// Fecha DOS fija (1980-01-01) para que el mismo mes dé siempre los mismos bytes.
const FECHA_DOS = 0x0021;
const HORA_DOS = 0;

function zip(entradas) {                       // [{ nombre, datos: Buffer }]
  if (entradas.length > 0xFFFF) throw new Error('demasiadas entradas para un ZIP sin ZIP64');
  const locales = [];
  const centrales = [];
  let desp = 0;
  for (const { nombre, datos } of entradas) {
    const n = Buffer.from(nombre, 'utf8');
    const crc = zlib.crc32(datos);
    const comp = zlib.deflateRawSync(datos, { level: 9 });
    const usar = comp.length < datos.length;   // un PDF ya pequeño puede no ganar nada
    const cuerpo = usar ? comp : datos;
    const metodo = usar ? 8 : 0;

    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0); l.writeUInt16LE(20, 4); l.writeUInt16LE(0x0800, 6);
    l.writeUInt16LE(metodo, 8); l.writeUInt16LE(HORA_DOS, 10); l.writeUInt16LE(FECHA_DOS, 12);
    l.writeUInt32LE(crc, 14); l.writeUInt32LE(cuerpo.length, 18); l.writeUInt32LE(datos.length, 22);
    l.writeUInt16LE(n.length, 26);

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(metodo, 10); c.writeUInt16LE(HORA_DOS, 12); c.writeUInt16LE(FECHA_DOS, 14);
    c.writeUInt32LE(crc, 16); c.writeUInt32LE(cuerpo.length, 20); c.writeUInt32LE(datos.length, 24);
    c.writeUInt16LE(n.length, 28); c.writeUInt32LE(desp, 42);

    locales.push(l, n, cuerpo);
    centrales.push(c, n);
    desp += 30 + n.length + cuerpo.length;
  }
  const cd = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(cd.length, 12); fin.writeUInt32LE(desp, 16);
  return Buffer.concat([...locales, cd, fin]);
}
```

Añadir en el módulo real: un tope de tamaño total (4 GB no se alcanzaría nunca, pero un tope de p. ej.
100 MB protege la RAM del droplet de 512 MB) y nombres generados solo desde `numero` (formato
`MM-\d{4}-\d{6}`), nunca desde texto libre.

## Zona horaria del mes [VERIFIED: ejecución local de Intl y Date.UTC]

- `facturas.fecha` es ISO UTC con `Z`. República Dominicana usa UTC−4 todo el año (sin horario de verano)
  [ASSUMED: no se abrió una fuente oficial en esta sesión; `Intl` con `America/Santo_Domingo` dio
  `2026-09-30` para `2026-10-01T02:30:00Z` y `2026-10-01` para `2026-10-01T04:00:00Z`, lo que confirma UTC−4 en esa fecha].
- Rango del mes M: `desde = Date.UTC(a, m-1, 1, 4)`, `hasta = Date.UTC(a, m, 1, 4)` (`Date.UTC` con mes 12
  pasa al año siguiente). Consulta: `fecha >= ? AND fecha < ?` con ISO completos. Un comprobante emitido a
  las 23:59 del 30/09 hora local (03:59Z del 01/10) cae en septiembre; a las 04:00Z ya es octubre.
- El **servidor puede correr en cualquier TZ** (no hay `TZ` en `deploy/*.service`): no usar `getMonth()`,
  `getDate()` ni `toLocaleDateString()` sin `timeZone` para decidir el mes. Aritmética en UTC, o
  `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santo_Domingo', ... })` para pintar la fecha local.
- Para el CSV: la columna «Fecha» sale en hora dominicana (`AAAA-MM-DD`); una segunda columna con el ISO
  UTC permite auditar el corte.
- «Mes en curso» y «mes futuro»: el mes actual de Santo Domingo se saca de `Date.now() - 4 h` en UTC.
- `fecha` con formato distinto de ISO completo (p. ej. `2026-09-30` a secas) rompería la comparación de cadenas: el plan
  debe comprobar en la base de demostración/seed que todas las `facturas.fecha` son `AAAA-MM-DDTHH:MM:SS.sssZ`
  (`crearFactura` usa `ahora()` o `pago.confirmado || pago.creado`, todas ISO).

## Patrones de arquitectura

### Diagrama de flujo

```
Victor (sesión admin) ──► admin.html: elige mes ──► GET /api/admin/lote-contador/AAAA-MM  (vista previa JSON)
                                   │                          │
                                   │                          ▼
                                   │              lote.previa(mes): rango 04:00Z + SUM + PDF que faltan
                                   ▼
                    «Descargar paquete» ──► GET /api/admin/lote-contador/AAAA-MM.zip
                                                     │ conAdmin (404 si no es admin)
                                                     │ valida ^\d{4}-(0[1-9]|1[0-2])$ y mes ≤ actual (400)
                                                     ▼
                                          lote.armarPaquete(mes)
                          ┌───────────────┬───────────┴────────────┬──────────────────┐
                          ▼               ▼                        ▼                  ▼
            db.comprobantesDelPeriodo   facturas.leerPdf     (si falta) reponer   pdf.documento()
            (solo lectura, sin LIMIT)   bytes guardados      → marca «repuesto»   → resumen.pdf (1 pág.)
                          │               │                        │                  │
                          └──────► resumen.csv (`;`, BOM) ◄────────┘                  │
                                          │                                            │
                                          ▼                                            ▼
                     verificación: SUM independiente == resumen; falta PDF → 409; no cuadra → 500
                                          │
                                          ▼
                     zip([...pdf/, resumen.csv, resumen.pdf, LEEME.txt]) ──► res.end(Buffer)
                                                                     (private, no-store, attachment)

           (nada más: no correo.enviar, no TAREAS, no temporizador, no escritura en la base)
```

### Estructura recomendada
```
tools/
├── lote.js            # rango del mes, armarPaquete, zip, csv, resumen (sin dependencias, sin efectos al requerirse)
├── db.js              # + comprobantesDelPeriodo(desde, hasta), sumaDelPeriodo(desde, hasta)  (solo lectura)
├── api.js             # + vistaPreviaLote, descargarLote (conAdmin) y dos filas en RUTAS
├── probar-lote.js     # arnés propio (+ "lote:probar" en package.json y un paso en el CI)
assets/admin.js        # botón y línea de vista previa; admin.html: enlace junto a #btnCsv
```

### Patrón 1: consulta del periodo, solo lectura y sin join
**Qué:** una consulta sobre `facturas` únicamente, con rango semiabierto y orden estable (`fecha, numero`), y otra de
control con `COUNT`, `SUM(subtotal)`, `SUM(itbis)`, `SUM(total)` agrupadas por `tipo` y `moneda`.
**Cuándo:** siempre que el paquete calcule. La cifra de control sale de la consulta B y se compara con el resumen armado
desde la consulta A; que coincidan solo prueba algo si son dos consultas distintas.

### Patrón 2: entregar Buffer
Como `exportarFacturas`: `res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Length': cuerpo.length,
'Content-Disposition': 'attachment; filename="comprobantes-2026-09.zip"', 'Cache-Control': 'private, no-store',
'X-Content-Type-Options': 'nosniff' }); res.end(cuerpo);`

### Antipatrones
- **`db.facturas({ mes })` para el lote**: mes UTC, tope de 500 y posible duplicado por el join.
- **Marcar `incluida_en_lote` o escribir `lotes_contador.enviado_en`**: reescribe un comprobante y sugiere envío.
- **Volver a dibujar los PDF del mes** para armar el paquete: el archivo del cliente y el guardado son el mismo.
- **Derivar la ruta del PDF del mes** (`AAAA/MM/`): la carpeta es por mes UTC; usar siempre `ruta_pdf`.
- **Redondear o recalcular importes** en el resumen: se copian los enteros de la fila; solo se suman.
- **Meter texto libre en nombres de archivo del ZIP** (razón social): solo `numero`.

## No reinventar (y lo que sí se escribe a mano)

| Problema | No construir | Usar | Por qué |
|----------|--------------|------|---------|
| CRC32 | tabla y bucle propios | `zlib.crc32` | Ya está en Node ≥ 22.2. |
| Deflate | compresor propio | `zlib.deflateRawSync` | Estándar. |
| Fecha/mes de Santo Domingo | reglas de zona en el código | UTC−4 fijo con `Date.UTC`, `Intl` con `timeZone` solo para pintar | Sin horario de verano; el TZ del servidor es desconocido. |
| Lectura de PDF guardado | ruta armada a mano | `facturas.leerPdf` | Ya valida que la ruta esté dentro de la carpeta. |
| Escape CSV | otro escapador distinto | el mismo criterio que `exportarFacturas` (`;`, comillas dobles, BOM, CRLF) | Excel en español; un solo estilo. |
| Numeración/NCF | cualquier cosa | no se toca | Fiscal. |

**Sí se escribe a mano** (por la regla de cero dependencias): el escritor ZIP de arriba y el resumen de una página con `tools/pdf.js`.

## Trampas comunes

### Trampa 1: el mes UTC
**Qué falla:** lo emitido entre las 20:00 y las 24:00 del último día cae en el mes siguiente y el lote de septiembre
«pierde» un comprobante que el cliente ve con fecha 30/09.
**Cómo evitarlo:** límites a las 04:00Z (D-04); prueba con `03:59:59.999Z` y `04:00:00.000Z`.
**Señal:** el conteo del lote difiere del de `informe-mensual` (que también usa UTC, `T23:59:59Z`).

### Trampa 2: fecha impresa en el PDF distinta de la del resumen
**Qué falla:** el PDF imprime la fecha en UTC (`fechaCorta`) y el resumen en hora dominicana: un comprobante de las
21:00 del 30/09 sale «01/10/2026» en el PDF y «2026-09-30» en el CSV. **No se corrige** aquí (es fiscal y no se
reescribe lo emitido). **Cómo evitarlo:** el `LEEME.txt` y el CSV llevan la columna ISO UTC y avisan de la regla; se anota
para la fase 13. Es una **pregunta de riesgo**, no de Victor.

### Trampa 3: PDF ausente o repuesto distinto
Ver «Lo que no sirve» 2 y 3. Reponer por mes, marcar «repuesto», y si sigue faltando, 409 con la lista.

### Trampa 4: `ruta_pdf` en carpeta UTC
Un comprobante de septiembre (hora dominicana) puede estar en `2026/10/`. Se usa siempre la ruta guardada.

### Trampa 5: inyección de fórmulas en Excel (CSV)
`razon_social` la escribe el cliente. Un valor que empiece por `=`, `+`, `-` o `@` se ejecuta como fórmula al abrir el CSV.
Mitigación: anteponer `'` en esos casos (solo en campos de texto libre; nunca en NCF ni importes) y documentarlo en el
`LEEME.txt`. El CSV existente (`exportarFacturas`) no lo hace; no se toca (D-13), pero se anota.

### Trampa 6: el arnés falso de req/res descarta binarios
`pedir()` de `probar-transferencia.js` hace `JSON.parse(d)` en `res.end`. Para un ZIP hay que guardar el `Buffer` tal cual
y capturar `writeHead(c, cabeceras)`. Copiar el arnés y cambiar `end`, no reutilizarlo tal cual.

### Trampa 7: entorno de la prueba
Fijar `MERCA_DB`, `MERCA_FACTURAS` (y `MERCA_CORREO=archivo` si aplica) **antes** de `require('./db')`; si no, la prueba
corre contra la base equivocada y hace daño. No `require('./tareas')` sin la guarda (`require.main`) que ya tiene.

### Trampa 8: cuadre con datos históricos
Un pago anterior a la 05.1 o con descuento puede no cumplir `subtotal + itbis = total` de forma exacta. No bloquear; marcar en
«Cuadra» y contar en el resumen (D-06).

### Trampa 9: nota de crédito en otro mes
La nota de septiembre de un comprobante de agosto entra en septiembre, con su `ncf_modificado` de agosto; el original
de agosto sigue anulado en el lote de agosto. El resumen debe explicar el efecto sobre el neto.

### Trampa 10: memoria del droplet
512 MB. Un mes de cientos de PDF de ~3 KB es trivial; aun así, sin `Promise.all` sobre lecturas y con tope de tamaño.

### Trampa 11: el shell y las comillas invertidas
Ningún heredoc con backticks, `${}` ni regex con `\d`/`\s` al escribir estos archivos; usar Write/Edit (`CLAUDE.md`).

## Ejemplos de código

### Rango del mes de Santo Domingo
```js
// Fuente: verificado con Intl (America/Santo_Domingo) y Date.UTC en Node 22.22.2. UTC-4 fijo.
const DESFASE_HORAS = 4;
function rangoDelMes(mes) {                      // 'AAAA-MM'
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(mes || '');
  if (!m) throw Object.assign(new Error('El mes va como AAAA-MM'), { codigo: 400 });
  const a = Number(m[1]); const n = Number(m[2]);
  return {
    desde: new Date(Date.UTC(a, n - 1, 1, DESFASE_HORAS)).toISOString(),   // incluido
    hasta: new Date(Date.UTC(a, n, 1, DESFASE_HORAS)).toISOString(),       // excluido
  };
}
const fechaLocal = (iso) => new Date(Date.parse(iso) - DESFASE_HORAS * 3600e3).toISOString().slice(0, 10);
```

### Consulta (va en `tools/db.js`; solo lectura)
```js
// Sin join, sin LIMIT y con rango semiabierto: db.facturas() cuenta por mes UTC y con tope.
const comprobantesDelPeriodo = (desde, hasta) => abrir().prepare(
  'SELECT * FROM facturas WHERE fecha >= ? AND fecha < ? ORDER BY fecha, numero').all(desde, hasta);
const sumaDelPeriodo = (desde, hasta) => abrir().prepare(
  `SELECT tipo, moneda, COUNT(*) AS n, COALESCE(SUM(subtotal),0) AS subtotal,
          COALESCE(SUM(itbis),0) AS itbis, COALESCE(SUM(total),0) AS total
     FROM facturas WHERE fecha >= ? AND fecha < ? GROUP BY tipo, moneda`).all(desde, hasta);
```

### Lector de ZIP para la prueba (independiente del escritor)
```js
// Recorre el directorio central, infla, y comprueba CRC y tamaño: no depende de unzip.
function leerZip(buf) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const total = buf.readUInt16LE(fin + 10);
  let p = buf.readUInt32LE(fin + 16);
  const salida = {};
  for (let i = 0; i < total; i++) {
    const metodo = buf.readUInt16LE(p + 10); const crc = buf.readUInt32LE(p + 16);
    const tam = buf.readUInt32LE(p + 20); const largo = buf.readUInt32LE(p + 24);
    const ln = buf.readUInt16LE(p + 28); const desp = buf.readUInt32LE(p + 42);
    const nombre = buf.toString('utf8', p + 46, p + 46 + ln);
    const lnl = buf.readUInt16LE(desp + 26); const lel = buf.readUInt16LE(desp + 28);
    const crudo = buf.subarray(desp + 30 + lnl + lel, desp + 30 + lnl + lel + tam);
    const datos = metodo === 8 ? require('node:zlib').inflateRawSync(crudo) : crudo;
    if (datos.length !== largo || require('node:zlib').crc32(datos) !== crc) throw new Error(`corrupto: ${nombre}`);
    salida[nombre] = datos;
    p += 46 + ln;
  }
  return salida;
}
```
(Este lector asume que el central no lleva campos extra ni comentarios, cierto para el escritor de arriba.)

## Estado del arte

| Antes | Ahora | Cuándo | Impacto |
|-------|-------|--------|---------|
| Tabla CRC32 escrita a mano | `zlib.crc32` incorporado | Node 22.2 / 20.15 | Sin código propio para el CRC; `engines` ya exige ≥ 22.5. |
| `lotes_contador` + `incluida_en_lote` pensados para envío automático | Descarga manual y solo lectura | decisión de Victor (CLAUDE.md) | Se dejan sin uso; no se borran. |

**Obsoleto/no usar:** el envío mensual automático (`enviado_en`, `destinatario`).

## Formato 607 de la DGII (solo por si Victor o su contador lo piden)

No se pudo abrir la DGII ni los blogs contables desde aquí (el proxy bloquea el dominio). Lo siguiente viene de conocimiento previo y
de un resumen de búsqueda (ver Fuentes) y **debe confirmarse con el contador o con la Norma General 07-18 antes de construir**:

- El 607 es el formato de envío de ventas de bienes y servicios; se presenta cada mes, en texto o con la plantilla de Excel
  de la DGII [CITED: resultados de búsqueda que remiten a dgii.gov.do/…/formatoEnvioDatos, sin abrir el documento].
- Estructura recordada: primera línea de encabezado `607|RNC del emisor|AAAAMM|cantidad de registros` y una línea por
  comprobante con ~23 campos separados por `|` (RNC o cédula del cliente, tipo de identificación, NCF, NCF modificado, tipo de
  ingreso, fecha del comprobante, montos facturado e ITBIS, retenciones, forma de pago…) [ASSUMED].
- Plazo: hasta el día 15 del mes siguiente [ASSUMED].
- Los recibos sin NCF no se reportan; las notas de crédito B04 van como líneas con su NCF modificado [ASSUMED].
- Datos que **faltan hoy** en `facturas` para generarlo: tipo de identificación (RNC/cédula/pasaporte) —se puede inferir por
  longitud: 9 dígitos RNC, 11 cédula— y tipo de ingreso y forma de pago (la tabla guarda `metodo_pago`: `transferencia`, `demo`,
  `tarjeta`, `efectivo`, `interna`; habría que mapear a efectivo/cheque-transferencia/tarjeta/crédito/permuta).
- Por eso el `resumen.csv` lleva ya `RNC`, `NCF`, `NCF modificado`, fecha, subtotal, ITBIS, total, `metodo_pago`.

## Registro de suposiciones

| # | Afirmación | Sección | Riesgo si es falsa |
|---|-----------|---------|--------------------|
| A1 | República Dominicana no tiene horario de verano y está en UTC−4 todo el año | Zona horaria | Un corte de mes desplazado 1 h; se arreglaría con `Intl` en vez del desfase fijo. |
| A2 | Estructura del 607 (encabezado, ~23 campos, `|`), plazo día 15, tratamiento de recibos y notas | Formato 607 | Solo afecta si Victor pide el 607; se confirma con el contador antes de construirlo. |
| A3 | El contador puede abrir un ZIP | Comparación | Habría que pasar a PDF único (más trabajo en `pdf.js` y en `facturas.js`); pregunta 3. |
| A4 | Un mes real cabe holgadamente en memoria (cientos de PDF de ~3 KB) | Trampas | Habría que transmitir por trozos; no es el caso con el volumen de un lanzamiento. |
| A5 | Todas las `facturas.fecha` son ISO completo con `Z` (por `ahora()`/`pago.confirmado`/`pago.creado`) | Zona horaria | La comparación de cadenas sacaría o metería filas mal; el plan debe comprobarlo con la base de demostración. |
| A6 | `db.facturas` puede duplicar filas si una organización tiene dos propietarios | Lo que no sirve | Si no ocurre, no cambia nada; la consulta nueva sin join es igual de correcta. |

## Preguntas abiertas

1. **¿Hace falta el 607?** (pregunta 1 de CONTEXT). Sin respuesta al empezar, no se construye; el resto de la fase no depende de ello.
2. **¿Reponer un PDF que falta o avisar solamente?**
   - Se sabe: `regenerarPdfsPendientes` lo repone sin cambiar importes ni NCF, pero sin las líneas de `detalle`.
   - Falta: si el contador acepta un PDF repuesto o quiere saberlo siempre.
   - Recomendación: reponer y marcar «repuesto» en el resumen (D-07); revisar el uso real tras el primer cierre.
3. **¿`resumen.pdf` además del CSV?** Recomendación: sí, una página con totales (Victor lo lee mejor que un CSV); si el plan
   se ajusta de tiempo, es lo primero que se puede recortar.
4. **¿Dónde comprobar la fecha de los datos existentes?** El plan debe incluir una comprobación de A5 sobre la base de
   demostración (`npm run db:demo`) y sobre una copia de la de producción, si Victor la facilita.

## Disponibilidad del entorno

| Dependencia | Requerida por | Disponible | Versión | Alternativa |
|-------------|---------------|-----------|---------|-------------|
| Node | todo | ✓ | v22.22.2 (local); VPS 24 | — |
| `zlib.crc32` | ZIP | ✓ | Node ≥ 22.2 | tabla CRC propia si Node fuera < 22.2 (no ocurre: `engines` ≥ 22.5) |
| `unzip` | comprobación opcional | ✓ | presente aquí | el lector de ZIP propio de la prueba (no depende de ello) |
| Python 3 `zipfile` | comprobación de desarrollo | ✓ | presente aquí | solo para verificar a mano |
| Puppeteer / Chrome | auditoría de la consola | ✓ en la nube con `--no-sandbox` y `PUPPETEER_EXECUTABLE_PATH` | — | ver STATE («Nube») |
| Acceso a `dgii.gov.do` | confirmar el 607 | ✗ (bloqueado por el proxy) | — | preguntar al contador |

**Sin dependencias que bloqueen la ejecución.**

## Arquitectura de validación

### Marco de pruebas
| Propiedad | Valor |
|-----------|-------|
| Marco | Arnés propio (`ok()` con contadores y `process.exitCode`), como `tools/probar-facturas.js`; `node:test` solo si se aísla `zip()` como función pura |
| Archivo de configuración | ninguno; base temporal `.tmp/prueba-lote/` y variables de entorno fijadas antes de `require('./db')` |
| Comando rápido | `node tools/probar-lote.js` |
| Suite completa | `npm run lote:probar` (nuevo, en `package.json` y como paso del job `pruebas` de `.github/workflows/`, junto a `facturas:probar`); además `npm run facturas:probar`, `npm run auditar`, `npm run check` |

### Requisito → prueba
| Criterio | Comportamiento | Tipo | Comando | ¿Existe? |
|----------|----------------|------|---------|----------|
| CONTAB-01 / C1 | La descarga devuelve un solo `application/zip` con `pdf/`, `resumen.csv`, `resumen.pdf`, `LEEME.txt` | integración (req/res falsos) | `node tools/probar-lote.js` | ❌ Wave 0 |
| C1 | El ZIP se lee con el lector propio (CRC y tamaños) y, si existe, con `unzip -t` | integración | ídem | ❌ Wave 0 |
| C2 | Cada NCF, importe e ITBIS del CSV coincide con la fila de la base; N filas = `COUNT(*)` del rango | integración | ídem | ❌ Wave 0 |
| C2 | Suma por tipo del resumen = SUM independiente; los bytes de cada PDF del ZIP = los del disco (hash) | integración | ídem | ❌ Wave 0 |
| C2 | Borde de mes: `03:59:59.999Z` cae en septiembre, `04:00:00.000Z` en octubre; nota B04 en el mes de su emisión | unidad/integración | ídem | ❌ Wave 0 |
| C2 | El original queda intacto: hash de todas las filas de `facturas` antes y después de generar | integración | ídem | ❌ Wave 0 |
| C2 | PDF faltante: se repone y se marca; si no se puede, 409 con la lista y sin ZIP | integración | ídem | ❌ Wave 0 |
| C3 | No sale ningún correo (la bandeja `.tmp/correos` no crece), `TAREAS` no tiene ninguna clave de lote/contador, `lote.js` no requiere `./correo` y `serve.js` no lo llama | integración + guarda de texto | ídem | ❌ Wave 0 |
| Seguridad | Sin sesión 401; sesión de usuario normal 404; mes mal formado 400; mes futuro 400 | integración | ídem y `tools/auditar-permisos.js` (ruta añadida) | ❌ Wave 0 |
| Determinismo | Dos descargas del mismo mes = mismos bytes | integración | ídem | ❌ Wave 0 |
| UI | El botón existe junto a `#btnCsv`, usa el mes elegido y enseña el aviso «el sitio no lo envía» | navegador | `npm run auditar` (ampliar `auditar-flujos.js`) | parcial |

### Muestreo
- **Por commit de tarea:** `node tools/probar-lote.js`
- **Por fusión de ola:** `npm run lote:probar && npm run facturas:probar && npm run transferencia:probar && npm run bitacora:probar`
- **Puerta de fase:** batería completa verde (incluidos `auditar` y `check`) antes de `/gsd:verify-work`.

### Huecos de la Ola 0
- [ ] `tools/probar-lote.js`: arnés con `pedir()` que conserve `Buffer` y cabeceras, sesión de administrador, base con comprobantes de septiembre y octubre (bordes), un recibo, una B01, una nota B04, un PDF borrado.
- [ ] `package.json`: script `lote:probar`; `.github/workflows/`: paso nuevo (LF obligatorio en ese archivo; solo GitHub valida su sintaxis: empujar y mirar).
- [ ] Ampliar `tools/auditar-permisos.js` con la ruta nueva.
- [ ] Sin instalación de framework.

## Dominio de seguridad

### Categorías ASVS aplicables

| Categoría ASVS | Aplica | Control estándar |
|----------------|--------|------------------|
| V2 Autenticación | no | (sesión ya existente) |
| V3 Gestión de sesión | sí (la existente) | `conSesion` + `conAdmin` con relectura de `es_admin` |
| V4 Control de acceso | **sí** | `conAdmin` → 404; el ZIP lleva RNC y razón social de empresas |
| V5 Validación de entrada | **sí** | `^\d{4}-(0[1-9]|1[0-2])$` y mes ≤ actual; nombres de archivo solo desde `numero`; escape de CSV y prefijo `'` contra fórmulas |
| V6 Criptografía | no | (CRC32 no es control de seguridad, solo integridad del archivo) |
| V8 Protección de datos | sí | `Cache-Control: private, no-store`, no se persiste el ZIP en disco, no se registra el contenido |

### Amenazas conocidas

| Patrón | STRIDE | Mitigación |
|--------|--------|------------|
| Descargar comprobantes de todas las empresas sin ser admin | Divulgación de información | `conAdmin`, 404 y prueba en `auditar-permisos.js` |
| Inyección de fórmulas en CSV desde `razon_social` | Manipulación | prefijo `'` en texto libre que empiece por `= + - @` |
| Ruta manipulada hacia otro archivo | Manipulación / Divulgación | `leerPdf` ya confina a `CARPETA`; nombres del ZIP desde `numero` |
| Agotar memoria pidiendo meses enormes | Denegación de servicio | solo admin; tope de tamaño; un mes por petición |
| Envío automático por descuido futuro | Divulgación | prueba de guarda (D-11) que falla si aparece `correo` en `lote.js`, una tarea de lote o una llamada en `serve.js` |
| Reescritura de comprobantes al «marcar incluidos» | Manipulación | no se escribe; la prueba compara un hash de `facturas` antes y después |

## Fuentes

### Primarias (confianza ALTA)
- Código del repositorio leído en esta sesión: `tools/db.js` (migraciones de comprobantes, `crearFactura`, `tomarNcf`,
  `siguienteNumero`, `facturas`, `informeMensual`), `tools/facturas.js`, `tools/pdf.js`, `tools/api.js` (`conAdmin`,
  `exportarFacturas`, `descargarFactura`, `RUTAS`), `tools/tareas.js`, `tools/probar-facturas.js`,
  `tools/probar-transferencia.js`, `admin.html`, `assets/admin.js`, `.planning/{ROADMAP,REQUIREMENTS,STATE,PROJECT}.md`,
  `.planning/phases/05.3-…/05.3-CONTEXT.md`.
- Ejecuciones locales: `zlib.crc32('123456789')` = `cbf43926`; ZIP mínimo verificado con `unzip -t` y `zipfile.testzip()`;
  `Intl` con `America/Santo_Domingo` para el corte de las 04:00Z.

### Secundarias (confianza MEDIA)
- Documentación de Node `zlib.crc32` (nodejs.org/api/zlib.html) [CITED, no abierta en esta sesión: la versión mínima 22.2 procede
  de conocimiento previo; la disponibilidad se comprobó ejecutándolo en 22.22.2].
- Especificación PKWARE APPNOTE del formato ZIP [CITED por conocimiento previo; el resultado se comprobó con dos lectores independientes].

### Terciarias (confianza BAJA, validar)
- Resultados de búsqueda que remiten al instructivo del Formato 607 de la DGII
  (dgii.gov.do/publicacionesOficiales/bibliotecaVirtual/contribuyentes/formatoEnvioDatos/…, blog.alegra.com/republica-dominicana/reportes-contables-606-607-608/):
  **no se pudieron abrir** (proxy); la estructura del 607 es conocimiento previo.

## Metadatos

**Desglose de confianza:**
- Stack estándar: ALTA — solo módulos de Node, probados aquí.
- Arquitectura: ALTA — lectura directa del código y del esquema.
- Trampas: ALTA en las derivadas del código; MEDIA en la del `LEFT JOIN` (inferida sin reproducir).
- Formato 607: BAJA — sin acceso a la fuente.

**Fecha de la investigación:** 2026-09-29
**Válida hasta:** 30 días (el código de `facturas` cambia poco; revisar si otra fase toca `tools/facturas.js` o `tools/db.js`).
