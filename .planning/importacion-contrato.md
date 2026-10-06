# Contrato de datos · Importación asistida (fase 14)

Base C1 de Claude (#148, #149). Es **la especificación** de #152 (K1) y de las oleadas
siguientes: se lee entera y manda sobre los issues si algo difiere. Resume el diseño del
comentario de Claude en #110; no hace falta abrir #110.

La fase va **después del lanzamiento del 2026-10-14**. Todo se construye entero y se entrega
**apagado**. `importar.html` y su formulario de hoy no se tocan hasta encender.

Fuente de verdad en código:

| Qué | Dónde |
|---|---|
| Estados, transiciones, actores, conceptos, etapas, parámetros, interruptores, aritmética pura | `assets/importacion.js` (global `Importacion` en el navegador; `require` en Node) |
| Tablas | migración `2026-10-importacion-asistida` al final de `MIGRACIONES` en `tools/db.js` |
| Pruebas puras (pasan ya) | `tools/importacion.prueba.js` → `npm run importacion:puro` |
| Pruebas del punto de transición (fallan hasta #152) | `tools/probar-importacion.js` → `npm run importacion:probar` |
| Prueba de la migración | `tools/probar-importacion-migracion.js` → `npm run importacion-migracion:probar` |

Vocabulario fijo en código, textos y correos: **inspección** (la hace una persona en la yarda;
opcional, se cobra aparte, no es garantía, no se reembolsa), **revisión de datos** (la IA; nunca
se llama inspección), **expediente** (una importación), **cargo por aplicar el depósito**
(`CARGO_APLICAR_DEPOSITO`, de la subasta; nada que ver con el 3 % de `assets/precios.js`, que
este módulo no carga).

---

## 1. Unidades y reglas de dinero

- Importes: **enteros en centavos** de la moneda de la línea. En K1 solo US$ (`moneda = 'USD'`).
  Un decimal se rechaza (lo hacen `entero()` del módulo y los `CHECK typeof(...) = 'integer'`).
- Porcentajes: **enteros en puntos básicos** (1 % = 100). Se calculan con
  `Importacion.porcentaje(importe, pb)` = `floor((importe × pb + 5000) / 10000)`: mitad hacia
  arriba, sin coma flotante. Ningún otro redondeo.
- **Todos los importes se calculan en el servidor.** Cualquier `importe`, `total` o línea que
  llegue en la entrada de una función o del cuerpo de una ruta se **ignora**. La única
  excepción es `registrarMovimiento` del personal (costes reales a terceros y contramovimientos).
- **Ningún compromiso de dinero sin cobro confirmado** (la regla que sostiene todo): ver §3.
- **El libro es de solo añadir.** No existe función que actualice o borre un movimiento; la base
  lo impide además con disparadores. Una corrección es un **contramovimiento**: un `ajuste` con
  el signo contrario y `corrige_id` apuntando al movimiento corregido.
- La inspección **nunca** se devuelve (`NO_REEMBOLSABLES = ['inspeccion']`).

## 2. Estados

`ESTADOS` en el módulo (28). Flujo normal:

`solicitada → en_busqueda → propuesta → confirmacion → [inspeccion_pendiente_pago →
inspeccion_en_curso → inspeccion_entregada →] deposito_pendiente → lista_para_pujar → pujando →
ganada → saldo_pendiente → pagada_subasta → retiro → transito_terrestre → puerto_origen →
transito_maritimo → en_aduana → endosada → transporte_rd → entregada → cerrada`

Ramas: `pujando → perdida → (propuesta | devolucion_pendiente)`; `entregada →
devolucion_pendiente` si queda dinero del cliente.

Salidas (`ESTADOS_SALIDA`): `desistida`, `sin_opciones`, `cancelada`, `incumplida`. Desde una
salida **solo** se va a `devolucion_pendiente` (si queda dinero reembolsable) o a `cerrada`.
`devolucion_pendiente → cerrada` cuando la devolución está registrada. `cerrada` no sale.

## 3. Transiciones

La tabla completa es `TRANSICIONES` en el módulo: `{ de, a, actor, cobro?, cobroPorEtapa?, exige? }`.
`transicionPermitida(de, a, actor)` es la única pregunta que se hace; un par fuera de la tabla
está prohibido para todos. Resumen:

| De | A | Actor | Condición |
|---|---|---|---|
| solicitada | en_busqueda | personal | — |
| en_busqueda | propuesta | personal | al menos un lote `propuesto` |
| en_busqueda | sin_opciones | personal | — |
| propuesta | confirmacion | cliente | `elegirLote` |
| propuesta | en_busqueda | sistema | el lote caducó sin elección |
| confirmacion | propuesta | cliente | cambiar de lote |
| confirmacion | deposito_pendiente | cliente | `confirmar` sin inspección pedida |
| confirmacion | inspeccion_pendiente_pago | cliente | `confirmar` con inspección pedida |
| inspeccion_pendiente_pago | inspeccion_en_curso | personal | **cobro `inspeccion` confirmado** |
| inspeccion_pendiente_pago | deposito_pendiente | sistema | venció el pago: sigue sin inspección |
| inspeccion_en_curso | inspeccion_entregada | personal | documento `informe_inspeccion` subido |
| inspeccion_entregada | deposito_pendiente | cliente | `decidirTrasInforme('seguir')` |
| inspeccion_entregada | desistida | sistema | venció `PLAZO_DECISION_TRAS_INFORME_H` (desistimiento tácito) |
| deposito_pendiente | lista_para_pujar | personal | **cobro `deposito` confirmado** |
| deposito_pendiente | en_busqueda | sistema | depósito no confirmado a tiempo: no se puja |
| lista_para_pujar | confirmacion | cliente | subir el límite: otra confirmación, otra huella |
| lista_para_pujar | pujando | personal | **cobro `deposito` confirmado** (para el límite vigente) |
| pujando | ganada | personal | `registrarResultado` con martillo ≤ límite |
| pujando | perdida | personal | `registrarResultado` |
| perdida | propuesta | cliente | otro lote con el mismo depósito |
| perdida | devolucion_pendiente | cliente | pide la devolución |
| ganada | saldo_pendiente | sistema | inmediata, en la misma transacción que `ganada` |
| saldo_pendiente | pagada_subasta | personal | **cobro `saldo` confirmado** |
| saldo_pendiente | incumplida | sistema / personal | venció `PLAZO_SALDO_CLIENTE_DIAS` / motivo |
| pagada_subasta | retiro | personal | con `por_etapa`: **cobro `flete_eeuu`** |
| retiro → transito_terrestre → puerto_origen | | personal | — |
| puerto_origen | transito_maritimo | personal | con `por_etapa`: **cobro `maritimo`** |
| transito_maritimo | en_aduana | personal | — |
| en_aduana | endosada | personal | con `por_etapa`: **cobro `aduana`**; y el `ajuste_liquidacion` a cobrar, si lo hay, cobrado |
| endosada | transporte_rd | personal | con `por_etapa`: **cobro `flete_rd`** |
| transporte_rd | entregada | personal | documento `acta_entrega` subido |
| entregada | cerrada / devolucion_pendiente | sistema | saldo reembolsable en cero / no |
| 8 estados antes de pujar | desistida | cliente | `desistir` |
| 9 estados antes de pujar | cancelada | personal | motivo obligatorio |
| salidas | devolucion_pendiente / cerrada | sistema | queda dinero reembolsable / no |
| devolucion_pendiente | cerrada | personal | `registrarDevolucion` |

### Etapa de cobro «confirmada»

`conceptosDeEtapa(etapa, POLITICA_COBRO)` da los conceptos de cada etapa (`ETAPAS`). Una etapa
está **confirmada** cuando, para el expediente, la suma con signo (`importeConSigno`) de los
movimientos **no estimados** (`es_estimado = 0`) de esos conceptos es **≥ lo exigido**:

| Etapa | Exigido |
|---|---|
| `inspeccion` | `PRECIO_INSPECCION_POR_ZONA[zona del lote]` (o `EXCEPCION` si el lote es excepción de zona) |
| `deposito` | `depositoPara(limite_puja)` del límite **vigente** |
| `saldo` | suma de `lineasSaldo({ martillo, cargosComprador, deposito, desglose, config })` |
| `flete_eeuu`, `maritimo`, `aduana`, `flete_rd` | suma de las líneas de esos conceptos en el desglose congelado (con `al_ganar` la etapa está vacía y se da por confirmada: ya entró en el saldo) |

Sin la etapa confirmada, la transición responde **409 `cobro_sin_confirmar`** y no escribe nada.

## 4. Conceptos y libro

`CONCEPTOS` (17) y `SENTIDOS` en el módulo; los mismos en los `CHECK` de la migración.

| Sentido | Signo en el saldo del cliente | Quién lo escribe |
|---|---|---|
| `cobro_cliente` | + | `registrarPago` |
| `pago_tercero` | − | `registrarMovimiento` (personal) |
| `devolucion_cliente` | − | `registrarDevolucion` |
| `ajuste` | su propio signo (≠ 0) | `registrarPago` (depósito aplicado), `registrarMovimiento` (contramovimientos, ajuste de liquidación) |

- **Depósito aplicado al saldo:** `aplicarDeposito(lineasSaldo(...), deposito)` devuelve
  `{ cobros, aplicaciones, sobrante }`. Por cada aplicación se escriben **dos ajustes** con la
  misma `referencia`: `−importe` en `deposito_puja` y `+importe` en el concepto. Por cada cobro, un
  `cobro_cliente`. El sobrante se queda en `deposito_puja` y se devuelve al cerrar.
- **Idempotencia:** índice único `(importacion_id, sentido, concepto, referencia)` cuando hay
  referencia. Registrar dos veces el mismo pago (misma `referencia`) no escribe nada la segunda
  vez y devuelve `{ duplicado: true }`.
- **Devolución:** `devolucionDe(movimientos, politica)`: suma con signo de los movimientos cuyo
  concepto no está en `NO_REEMBOLSABLES` ni en `politica.retiene`, menos `politica.descuento`,
  nunca negativa. La política sale de `politicaDevolucion(motivoDevolucion(estadoPrevio), config)`:

| Estado del que se sale | Motivo | Política |
|---|---|---|
| `perdida` | `perdida` | `DEVOLUCION_SI_PERDIDA` |
| `desistida`, `sin_opciones` | `sin_puja` | `DEVOLUCION_SIN_PUJA` |
| `incumplida` | `incumplida` | retiene `deposito_puja` y `multa_subasta` (diseño de #110) |
| `cancelada` | `cancelada` | sin retención **(pendiente de que Victor lo confirme)** |
| `entregada` | `cierre` | sin retención (sobrante) |

## 5. Huella del desglose

- Lo firmado (`contenidoFirmado`): `{ cifras_version, condiciones_version, limite_puja,
  lineas: [{ concepto, importe, moneda, es_estimado }] }`. Nada más (nombres, textos, `total`, no).
- JSON canónico (`canonico`): claves ordenadas, sin espacios, solo enteros (un decimal lanza),
  `es_estimado` como booleano, **las líneas en el orden en que vienen** (el servidor las da en el
  orden de `CONCEPTOS`).
- Huella: SHA-256 en hex de ese JSON (`huellaDesglose`, solo en el servidor).
- `confirmar` recalcula el desglose con el `limitePuja` recibido; si la huella no casa → **409
  `huella_distinta`** y nada cambia. Otro límite = otra huella = confirmación nueva.

## 6. Parámetros e interruptores

`PARAMETROS` en el módulo, **todos a `null`** salvo `UMBRAL_INSPECCION_DESTACADA = 4000000`
(US$40,000, confirmado por Victor) y `ZONAS_PERMITIDAS = ['TX', 'FL', 'PA']`. Ningún precio ni
comisión se fija aquí: lo decide quien dice la tabla del diseño (Victor, contador, abogado,
condiciones de la subasta). Formas:

- `PRECIO_INSPECCION_POR_ZONA`: `{ TX, FL, PA, EXCEPCION }` en centavos.
- `COMISION_SERVICIO`: `{ forma: 'fija', importe }` o `{ forma: 'porcentaje', pb, minimo?, maximo? }`.
- `PORCENTAJE_DEPOSITO_SUBASTA`, `CARGO_APLICAR_DEPOSITO`, `COLCHON_IMPREVISTOS`: pb.
- `COMISION_TRANSFERENCIA`, `PRESUPUESTO_MIN_EXCEPCION_ZONA`: centavos.
- `DEVOLUCION_SI_PERDIDA`, `DEVOLUCION_SIN_PUJA`: `{ retiene: [conceptos], descuento }`.
- `POLITICA_COBRO`: `'al_ganar' | 'por_etapa'`; `MONEDA_COBRO`: `'USD' | 'DOP'` (con `'DOP'`,
  `FUENTE_TASA` obligatoria; **K1 solo implementa USD**: con `'DOP'` las funciones de cobro lanzan
  501 `moneda_pendiente`); `FIRMA_CONTRATO`: `'en_linea' | 'documento'`.
- Plazos `_DIAS` / `_H` enteros; `RECORDATORIOS_SALDO_H` lista de enteros.

Interruptores (todos `false`): `IMPORTACION.asistida.activo`, `IMPORTACION.inspeccion.activa`,
`IMPORTACION.calculadora.activa`. Más `FISCAL_LISTO = false` (§7).
`puedeEncenderse(config, 'asistida' | 'inspeccion')` devuelve lo que falta; vacía = se puede
encender. `importacion:puro` comprueba que el módulo nunca se publica encendido con huecos.

`configuracion(sobrescribir)` da la configuración efectiva; **las pruebas la inyectan** así y
nunca tocan el módulo compartido.

## 7. Lo fiscal: PENDIENTE de la decisión del contador

Si la empresa actúa como **mandataria** (compra por cuenta del cliente) o como **revendedora**
(compra y revende) lo decide el contador de Victor. De eso depende qué conceptos emiten NCF, de
qué tipo (B01/B02), sobre qué base lleva ITBIS, cuándo (al cobrar, al endosar) y cómo se tratan
los anticipos. **No se implementa nada fiscal hasta esa decisión.** El diseño de #110 describe las
dos hipótesis (mandataria: NCF solo por el servicio propio; revendedora: el equipo entero al
endosar); son hipótesis para el contador, no comportamiento.

Mientras tanto:
- `registrarPago` **solo escribe el libro**. No crea filas en `pagos` ni llama a `confirmarPago`.
- `facturarCobro(id, movimientoId, ctx)` existe y lanza **501 `decision_fiscal_pendiente`** con
  cualquier `MODELO_FISCAL`.
- `FISCAL_LISTO = false` hace que `puedeEncenderse` no deje encender el servicio.
- `pagos.importacion_id` ya existe para cuando haga falta.
- Las pruebas fiscales están como `todo` en `importacion:puro` y como sección saltada en
  `importacion:probar`. El día de la decisión, Claude las escribe, se implementa hasta que pasen
  y `FISCAL_LISTO` pasa a `true` en el mismo PR. `tools/facturas.js` y `assets/precios.js` no se
  tocan en K1.

## 8. Tablas (migración `2026-10-importacion-asistida`)

Ver el bloque comentado en `tools/db.js`. Resumen de lo que no es obvio:

- `importaciones`: además de lo del diseño, `precio_martillo`, `cargos_comprador` (para
  recalcular el saldo) y `umbral_inspeccion` (el umbral que regía al guardar
  `inspeccion_destacada`). `referencia` UNIQUE empezando por `I` (`I2026-XXXXX`, como
  `referenciaServicio`). Nada cuelga con `ON DELETE CASCADE`: un expediente no se borra.
- `importacion_aceptaciones` (**nueva respecto al diseño**, solo añadir): una fila por cada
  aceptación (versión, huella, límite, usuario, IP de `CF-Connecting-IP`, fecha). Subir el límite
  añade otra fila; `importaciones` guarda la última.
- `importacion_eventos` (solo añadir): `de_estado` es `NULL` en la creación.
- `importacion_movimientos` (solo añadir): `importe ≠ 0` en `ajuste`, `> 0` en los demás;
  `tasa` obligatoria si `moneda = 'DOP'`; `referencia` y `corrige_id`.
- `importacion_documentos`: patrón de `documentos_anuncio`; `formato` = MIME, `tipo` = qué
  documento, `visible_cliente`.
- `pagos.importacion_id` sin clave foránea (como `anuncio_id`), con índice.

## 9. `tools/importacion.js` (lo implementa #152)

Único punto de transición del expediente, como `tools/pagos.js` lo es de un cobro. Síncrono
(`DatabaseSync`). Todo el SQL va en una sección nueva `── Importación ──` de `tools/db.js`.

**Contexto `ctx`** (último argumento de cada función):
`{ config, actor, usuarioId, ip, ahora, dependencias }`.
- `config`: `Importacion.configuracion(...)`; por defecto `configuracion()`.
- `actor`: `'cliente' | 'personal' | 'sistema'`. `usuarioId`: quien actúa (null en `sistema`).
- `ahora`: ISO; por defecto `new Date().toISOString()`. Todos los plazos se cuentan desde aquí.
- `dependencias.escribirEvento(fila)`: por defecto la función de `tools/db.js` que inserta en
  `importacion_eventos`. Las pruebas la sustituyen por una que lanza para comprobar que estado y
  evento se escriben juntos.
- `config.estimarCostos({ importacion, lote, limitePuja })` → `{ version, lineas }` con las líneas
  estimadas de `cargos_comprador`, fletes, `seguro`, `impuestos_aduana`, `agente_aduanal`,
  `gastos_puerto` y `flete_rd`. En producción lo conectará K3 con `assets/importacion-cifras.js`
  (K2); sin él, `desglose` lanza 503 `cifras_no_disponibles`.
- `config.CONDICIONES_VERSION`: versión del documento legal `importacion` (C4). Sin ella,
  `desglose` lanza 503 `condiciones_no_disponibles`.

**Errores:** `Error` con `codigo` (HTTP) y `motivo` (texto fijo, para las pruebas y la API):

| codigo | motivo | cuándo |
|---|---|---|
| 400 | `datos_invalidos` | falta o sobra algo, o no es entero; motivo obligatorio vacío |
| 400 | `zona_no_permitida` | lote fuera de `ZONAS_PERMITIDAS` sin presupuesto ≥ `PRESUPUESTO_MIN_EXCEPCION_ZONA` o sin motivo |
| 403 | `correo_sin_verificar` | `crearSolicitud` sin correo verificado |
| 403 | `ajeno` | el expediente es de otra organización (lo comprueba la ruta; las funciones reciben `organizacionId` en lo del cliente) |
| 404 | `no_existe` | expediente o lote inexistente |
| 409 | `transicion_no_permitida` | `transicionPermitida` dice que no |
| 409 | `cobro_sin_confirmar` | §3 |
| 409 | `huella_distinta` | §5 |
| 409 | `falta_documento` | informe o acta sin subir; contrato firmado con `FIRMA_CONTRATO = 'documento'` |
| 409 | `sin_tiempo_para_inspeccion` | faltan menos de `PLAZO_MIN_INSPECCION_DIAS` para la subasta |
| 409 | `martillo_sobre_limite` | martillo > `limite_puja` |
| 501 | `decision_fiscal_pendiente` | `facturarCobro` (§7) |
| 501 | `moneda_pendiente` | `MONEDA_COBRO = 'DOP'` en una función de cobro |
| 503 | `servicio_apagado` | `config.IMPORTACION.asistida.activo` es `false` (toda función, antes de escribir nada) |
| 503 | `inspeccion_apagada` | `pedirInspeccion` con `IMPORTACION.inspeccion.activa = false` |

**Cada transición:** valida con `transicionPermitida` y las condiciones de §3; escribe estado,
`actualizada`, `vence_accion` y el evento **en una sola transacción** (si algo lanza, nada queda
escrito); devuelve el expediente leído de nuevo.

**Funciones** (todas devuelven el expediente salvo que se diga):

| Función | Actor | Qué hace |
|---|---|---|
| `transicionPermitida(de, a, actor)` | — | reexporta la del módulo |
| `crearSolicitud(datos, ctx)` | cliente | `datos = { organizacionId, tipo_equipo, marca?, anio_min?, horas_max?, uso?, provincia_destino, zona_preferida?, presupuesto_declarado }`. Exige correo verificado de `ctx.usuarioId`. Guarda `inspeccion_destacada = destacarInspeccion(presupuesto)` y `umbral_inspeccion`. Estado `solicitada`, evento `NULL → solicitada`. |
| `proponerLotes(id, lotes, ctx)` | personal | Inserta lotes `propuesto` (`zona`, `fecha_subasta` obligatorias). Fuera de zona: §errores. Si está en `en_busqueda`, pasa a `propuesta`. `vence_accion` = la subasta más próxima. |
| `elegirLote(id, loteId, ctx)` | cliente | `propuesta → confirmacion`; el lote `elegido`, los demás `descartado`. `vence_accion` = su `fecha_subasta`. |
| `pedirInspeccion(id, ctx)` | cliente | En `confirmacion`: `inspeccion = 'pedida'` (sin cambio de estado: el desglose cambia y hay que volver a verlo). |
| `desglose(id, { limitePuja }, ctx)` | cliente | Solo lee. Devuelve `{ cifras_version, condiciones_version, limite_puja, deposito, lineas, total, huella }`. Líneas en orden de `CONCEPTOS`: `inspeccion` (si pedida), `comision_servicio` (`comisionServicio(limitePuja)`, estimada si es porcentaje), `cargo_aplicar_deposito`, `precio_equipo = limitePuja` (estimada: «hasta»), `cargos_comprador`, `comision_transferencia`, y las de `estimarCostos`. `deposito = depositoPara(limitePuja)` va aparte: es un anticipo del precio, no una línea más. |
| `confirmar(id, { huella, limitePuja, aceptaCondiciones }, ctx)` | cliente | Recalcula el desglose; huella distinta → 409. Exige `aceptaCondiciones === true` (400). Guarda desglose, huella, versiones, límite, `modelo_fiscal` y `moneda_cobro` congelados, añade una fila en `importacion_aceptaciones` (IP de `ctx.ip`) y pasa a `deposito_pendiente` (`vence_accion` = subasta − `PLAZO_DEPOSITO_ANTES_SUBASTA_H`) o a `inspeccion_pendiente_pago` (subasta − `PLAZO_MIN_INSPECCION_DIAS`). Ignora cualquier importe de la entrada. |
| `registrarPago(id, { etapa, referencia }, ctx)` | personal | Calcula **lo que falta** de lo exigido de la etapa (§3; tras subir el límite, solo la diferencia del depósito) y escribe los `cobro_cliente` (y los ajustes del depósito aplicado en `saldo`) con `es_estimado = 0` y esa `referencia`. No cambia estado ni escribe evento. Idempotente por `referencia`. Ignora cualquier importe de la entrada. Devuelve `{ movimientos, duplicado }`. |
| `registrarMovimiento(id, { sentido, concepto, importe, referencia?, corrige_id?, nota? }, ctx)` | personal | Solo `pago_tercero` y `ajuste`. Un ajuste con `corrige_id` es el contramovimiento de ese movimiento: si no se da importe, lleva `−importeConSigno(corregido)` (un `pago_tercero` de 7777 se corrige con un ajuste de +7777). `cobro_cliente` y `devolucion_cliente` no se apuntan a mano (400). Devuelve el movimiento. |
| `registrarResultado(id, { resultado, martillo?, cargosComprador? }, ctx)` | personal | `'ganada'`: martillo ≤ límite; guarda martillo y cargos; `pujando → ganada → saldo_pendiente` (dos eventos, una transacción); `vence_accion` = ahora + `PLAZO_SALDO_CLIENTE_DIAS`. `'perdida'`: `pujando → perdida`. |
| `avanzar(id, a, ctx)` | según tabla | Transición genérica para lo que no tiene función propia (logística, `cancelada` con `ctx.nota`, caducidades del sistema). Aplica §3 y los documentos exigidos. |
| `decidirTrasInforme(id, decision, ctx)` | cliente | `'seguir'` → `deposito_pendiente`; `'desistir'` → `desistida`. El movimiento de la inspección queda intacto. |
| `desistir(id, ctx)` | cliente | → `desistida` desde los estados de la tabla. |
| `marcarIncumplida(id, { motivo }, ctx)` | personal / sistema | `saldo_pendiente → incumplida`. |
| `calcularDevolucion(id, ctx)` | — | Solo lee: `{ importe, motivo, politica }` con §4 sobre el libro del expediente. El estado previo es el actual, o el `de_estado` del último evento si está en `devolucion_pendiente`. |
| `registrarDevolucion(id, { referencia }, ctx)` | personal | Escribe `devolucion_cliente` por cada concepto reembolsable con saldo positivo (suma = `calcularDevolucion`) y pasa a `cerrada`. |
| `facturarCobro(id, movimientoId, ctx)` | — | 501 `decision_fiscal_pendiente` (§7). |

**Correos:** K1 no envía ninguno (son K6). Nunca se envía nada a un contador; los únicos
destinatarios posibles son el cliente y los buzones de `tools/correo.js`.

## 10. Rutas (las implementa K3)

Array plano de `tools/api.js`; las `/:id/...` antes que `/:id`, y `/admin/...` antes que la
genérica. Con `asistida` apagado, todas responden **503**. Cuerpo y respuesta en JSON; los
importes de la respuesta en centavos.

| Método y ruta | Cuerpo | Llama a | Responde |
|---|---|---|---|
| `POST /api/importaciones` | datos de `crearSolicitud` | `crearSolicitud` | 201 expediente |
| `GET /api/importaciones` | — | listar de la organización | 200 lista |
| `GET /api/importaciones/:id` | — | leer (+ eventos, lotes, documentos visibles, libro) | 200 |
| `POST /api/importaciones/:id/lote` | `{ loteId }` | `elegirLote` | 200 |
| `POST /api/importaciones/:id/inspeccion` | — | `pedirInspeccion` | 200 |
| `GET /api/importaciones/:id/desglose?limite=` | — | `desglose` | 200 |
| `POST /api/importaciones/:id/confirmar` | `{ huella, limitePuja, aceptaCondiciones }` | `confirmar` | 200 / 409 |
| `POST /api/importaciones/:id/decision` | `{ decision }` | `decidirTrasInforme` | 200 |
| `POST /api/importaciones/:id/pago` | `{ etapa }` (sin importe) | instrucciones de pago de la etapa | 200 |
| `POST /api/importaciones/:id/desistir` | — | `desistir` | 200 |
| `POST /api/importaciones/:id/tras-perdida` | `{ eleccion: 'otro_lote' \| 'devolucion' }` | `avanzar` | 200 |
| `GET /api/importaciones/:id/documentos/:doc` | — | descarga si `visible_cliente` | 200 / 404 |
| `GET /api/admin/importaciones` | `?estado=` | bandeja por estado y `vence_accion` | 200 |
| `GET /api/admin/importaciones/:id` | — | leer todo | 200 |
| `POST /api/admin/importaciones/:id/lotes` | `{ lotes }` | `proponerLotes` | 200 |
| `POST /api/admin/importaciones/:id/revision-datos` | revisión | (K7) | 200 |
| `POST /api/admin/importaciones/:id/estado` | `{ a, nota }` | `avanzar` | 200 / 409 |
| `POST /api/admin/importaciones/:id/resultado` | `{ resultado, martillo, cargosComprador }` | `registrarResultado` | 200 |
| `POST /api/admin/importaciones/:id/movimientos` | movimiento | `registrarMovimiento` | 201 |
| `POST /api/admin/importaciones/:id/documentos` | archivo | (patrón de `tools/documentos.js`) | 201 |
| `POST /api/admin/importaciones/:id/pagos/:etapa/recibido` | `{ referencia }` | `registrarPago` | 200 |
| `POST /api/admin/importaciones/:id/incumplida` | `{ motivo }` | `marcarIncumplida` | 200 |
| `POST /api/admin/importaciones/:id/devolucion` | `{ referencia }` | `registrarDevolucion` | 200 |

401 sin sesión, 403 de otra organización (o sin rol de personal en `/admin`), 404, 409 y 503
como en §9. Una ruta cuyo contexto puede ser `null` comprueba `!!ctx`. Todo lo del personal
queda en `bitacora_admin`.

## 11. Pendiente de terceros (no frena construir, solo encender)

Contador: `MODELO_FISCAL` y todo §7. Victor: precio de inspección por zona, comisión, plazos,
política de cobro, moneda y tasa, colchón, qué se retiene si la empresa cancela. Abogado:
contrato `importacion`, cláusulas de #114, `FIRMA_CONTRATO`, devoluciones. Subasta (#115):
porcentaje del depósito, cargo por aplicarlo, comisión por transferencia, plazos y multas.
