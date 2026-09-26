# Auditoría del sistema actual antes del cambio de modelo comercial

**Fecha:** 2026-09-25 · **Rama:** `claude/modelo-comercial` (basada en la fase 5, 05-03 incluido)
**Pedido:** sección 2 de `.planning/research/modelo-comercial.md`.
**Alcance:** solo lectura. No se cambió código; nada se ejecuta hasta el visto bueno de Victor.

Fuentes: `.planning/codebase/`, los SUMMARY de las fases 3, 4 y 5, el `06-01-SUMMARY.md` y el
commit `c6ccabb` (migración 06-02 a medias) de `origin/claude/fase-06-cardnet`, y búsquedas
dirigidas en `tools/db.js`, `tools/api.js`, `tools/pagos.js`, `tools/tareas.js`,
`tools/correo.js`, `assets/precios.js`, `assets/planes.js`, `assets/panel.js`,
`assets/publicar.js` y `db/schema.sql`. Los números de línea son los de esta rama.

---

## Resumen en cinco líneas

1. **Hoy todo el mundo compra cupos**, particular o dealer: nivel (Estándar, Destacado, Premium)
   × cantidad × 30/60 días. No existe un «plan de particular» distinto del de dealer.
2. **La cadena Plan → Suscripción → Anuncio ya existe**, y el pago cuelga de la suscripción.
   Lo que falta es que el pago nazca con el **anuncio** dentro: hoy el anuncio se crea
   *después* de pagar y el borrador vive solo en el navegador.
3. **La transición única de dinero (`pagos.confirmarPago`) sirve tal cual**: basta con que la
   `intencion` del pago admita un tipo nuevo («publicación de este anuncio», «renovación»).
4. **No existe renovación.** Ni ruta, ni botón: los correos la prometen y el código no la
   tiene (`precioRenovacion` y `refrescarAnunciosDe` no los llama nadie).
5. **Precios:** los base actuales son Estándar 2.000 (con promoción a RD$0 hasta el
   2026-11-30), Destacado 3.500 y Premium 5.500. **1.800 y 3.200 son una bajada**, no los
   precios de hoy. Y el 3 % no existe en ningún sitio todavía.

---

## 1. Los 17 puntos

### 1.1 Dónde se definen los planes

- **Tabla `planes`** (`db/schema.sql:462`), no una constante: el comentario explica que las
  suscripciones vendidas deben seguir apuntando a lo pactado. Siembra en `db/schema.sql:794`.
- **Precio vigente:** `tools/db.js:conPrecioVigente` (línea 2280) es el único sitio que decide
  cuánto vale un plan hoy: aplica `precio_promocional` si `hoy() <= promo_hasta`. Lo usan
  `db.planes()`, `db.planPorId()`, el cobro y las tarjetas de `planes.html`.
- **Promoción:** migración `2026-08-promociones` pone el Estándar a 0; `2026-09-promo-hasta-noviembre`
  (`tools/db.js:414`) fija `promo_hasta = '2026-11-30'`. `PROMO_LANZAMIENTO` (`tools/db.js:48`) solo
  vale para bases nuevas.
- **Tres niveles activos** y cuatro retirados (`activo = 0`, migración `2026-08-membresias-por-cupos`,
  `tools/db.js:205-245`): se conservan porque hay suscripciones viejas que apuntan a ellos.

| id | nombre | precio (30 días, por cupo) | fotos | videos | destacado | perfil_publico | activo |
|---|---|---|---|---|---|---|---|
| `estandar` | Estándar | 2.000 (promo 0 hasta 2026-11-30) | 8 | 1 | 0 | 0 | 1 |
| `destacado` | Destacado | 3.500 | 20 | 2 | 1 | 0 | 1 |
| `premium` | Premium | 5.500 | 30 | 3 | 1 | 1 | 1 |
| `multi-estandar` | Múltiple Estándar | 8.000 (5 anuncios) | 8 | – | 0 | 0 | 0 |
| `multi-destacado` | Múltiple Destacados | 14.000 (5 anuncios) | 20 | – | 1 | 0 | 0 |
| `dealer` | Dealer | 40.000 (membresía, 20) | 20 | – | 1 | 1 | 0 |
| `dealer-premium` | Dealer Premium | 60.000 (membresía, sin límite) | 30 | – | 1 | 1 | 0 |

- **Beneficios que ya tiene cada plan** (los que pinta `assets/planes.js:tarjetaNivel`, línea 134, y
  que la sección 4 del documento pide conservar sin inventar): fotos por equipo, videos de 30 s,
  «Distintivo Destacado y posición preferente» + «Aparece en la portada» (Destacado y Premium),
  «Página pública de su empresa en el directorio» (Premium), y en Estándar «Ficha técnica completa»
  y «Contacto directo por teléfono y WhatsApp» (el del vendedor, no un teléfono de soporte).
- `solo_dealer` existe en la tabla y vale 0 en los tres activos: **hoy ningún nivel está
  reservado a dealers ni a particulares.**

### 1.2 Dónde está la lógica de cupos

- **Cálculo:** `assets/precios.js` (compartido navegador/Node): `cuposGratis`, `cuposCobrados`,
  `precioCompra`, `precioAmpliacion`, `precioRenovacion`, `desglose`, `siguienteCupo`.
- **Capacidad:** la suscripción. `suscripciones.anuncios_incluidos` = cupos comprados
  (`db/schema.sql:494`); `tools/db.js:suscripcionesDe` (línea 2316) calcula `ocupados` y `libres`.
- **Qué ocupa:** `ESTADOS_QUE_OCUPAN = ('activo', 'pausado')` (`tools/db.js:2307`). Vendido y
  retirado liberan; pausar **no** libera, a propósito («pausar y publicar en bucle daría
  anuncios ilimitados»).
- **Elección:** `suscripcionConHueco` (nivel más alto con sitio libre), `moverAnuncioDeSuscripcion`
  (línea 2678, recalcula `vence` y `destacado_hasta`).
- **Cuentas internas** (`exenta_pago`): `membresiaInterna` (línea 2622), Premium sin límite ni fin.
- **Quién depende de los cupos** (no se puede borrar): publicar, mover de plan, ampliar, la
  aprobación de pagos (`aprobarPago` → `otorgarCompra`), el panel, `planes.html`, el asistente
  (`tools/chat.js:146` cuenta la regla del quinto gratis), el alta de la página del dealer
  (`encenderPerfilSiProcede`) y las pruebas `pagos`, `transferencia`, `seguridad`, `dealer`.

### 1.3 Cómo se crea una publicación

- `publicar.html` + `assets/publicar.js:montarPublicador`. El **borrador vive solo en el
  navegador** (`localStorage`, clave `mercamaquinarias:borrador`, `assets/publicar.js:104`); el
  comentario de la línea 149 dice que «ni plan ni pago viven ya en el borrador».
- Si la cuenta no tiene ninguna membresía, `publicar.js:1326` la manda a `planes.html` antes de
  rellenar nada. Si la tiene llena, ofrece «Añadir un cupo» (ampliación prorrateada).
- `POST /api/anuncios` → `tools/api.js:publicar` (línea 2549): exige aceptación legal
  (`PARA_PUBLICAR`), limita 20 por hora, **elige la membresía** (la pedida o `suscripcionConHueco`),
  402 si no hay ninguna, 409 si está llena; valida taxonomía, precio, fotos y videos; y llama a
  `db.crearAnuncio` (línea 2706) con `estado` activo, `vence = membresia.fin` y
  `destacado_hasta` si el plan es destacado. **Publicar no cobra nada.**
- El estado `borrador` existe en el CHECK de `anuncios` (`db/schema.sql:574`) pero **ningún
  código lo usa**.

### 1.4 Cómo se vincula una publicación con un plan

- **Indirecto, a través de la suscripción:** `anuncios.suscripcion_id → suscripciones.plan_id → planes`.
  El anuncio no guarda el plan; lo hereda de la membresía que ocupa.
- Se cambia con `PATCH /api/anuncios/:id/plan` → `tools/api.js:cambiarPlanDeAnuncio` (línea 2487):
  mueve el anuncio a otra membresía propia con cupo libre y comprueba el tope de fotos.
- **El pago no conoce el anuncio:** `pagos` tiene `suscripcion_id` pero no `anuncio_id`, y la
  `intencion` de compra es `{ tipo: 'compra', idPlan, cupo, dias, concepto, cliente, correoCliente }`.

### 1.5 Cómo se procesan los pagos

- **Fase 3:** un cobro con importe nace `pendiente` (`tools/db.js:registrarCobro`, línea 2447) con lo
  comprado en `pagos.intencion` (JSON). Solo `tools/pagos.js:confirmarPago` (línea 132) lo pasa a
  `aprobado`: llama a `db.aprobarPago` (línea 2483, SAVEPOINT, idempotente, 409 si el pago cambió)
  que otorga la compra o suma la ampliación, y **después** emite el comprobante con
  `facturas.emitirPorPago` (idempotente: mismo NCF, un solo correo).
- `pagos.cobrar` (línea 197) pregunta al procesador de `PROCESADORES` y ante la duda deja
  `pendiente`. `rechazarPago` solo cambia un pendiente.
- **Importe cero** (promoción, cuenta exenta): `comprarCupos`/`ampliarCupos` lo aprueban al
  instante sin comprobante; `soloCero` impide colar por ahí un cobro con importe.
- **Fase 5:** procesador `transferencia` (siempre `pendiente`), `metodosDeCobro()` (línea 177) y
  `procesadorDeCobro()` los decide el servidor; con la transferencia encendida `demo` desaparece.
  La consola marca recibido o anula por `/api/admin/pagos/*`, dentro de `db.enNombreDe` (bitácora).
- **Qué guarda un pago hoy:** `organizacion_id, suscripcion_id, metodo_pago_id, subtotal, itbis,
  total, moneda, estado, referencia, procesador, creado, intencion, confirmado, actualizado`.
  Falta, frente a la sección 13: `anuncio_id`, precio base, tasa e importe del ajuste, tasa de ITBIS
  (la factura la **deduce** de `itbis / subtotal`, `tools/facturas.js:543`).

### 1.6 Webhooks / avisos de pago

- **Hoy no hay ninguno.** La transferencia se confirma a mano desde la consola.
- **Planificado en la fase 6:** `06-04` (ruta de notificación de CardNet, autenticada con
  `crypto.timingSafeEqual`, idempotente, antes de cualquier patrón genérico `/api/pagos/...`) y
  `06-05` (conciliación cada 10 minutos). El 06-02 a medias crea `pagos_eventos` de solo añadir
  y un índice único parcial sobre `referencia` para `cardnet`.

### 1.7 Cómo se calculan precios e impuestos

- `assets/precios.js:desglose` (línea 106): `subtotal = round(subtotal)`, `itbis = round(subtotal × 0,18)`,
  `total = subtotal + itbis`. **Todo en pesos enteros.** `ITBIS = 0.18` en la línea 34.
- El servidor calcula con la misma función (`tools/api.js:2300` compra, `2412` ampliación) usando
  `precio_vigente` (`api.js:precioUnitario`, línea 2135). El navegador repite la cuenta para
  enseñarla, pero lo cobrado es lo del servidor.
- Columnas de dinero `INTEGER` en `pagos` y `facturas`. El 06-01 tiene `cardnet.aCentavos(pesos)`,
  que **exige un entero** y lanza con decimales. El PDF sí sabe escribir centavos
  (`tools/numero-a-letras.js`: «con 72/100»).
- **Lo que se ve hoy:** la tarjeta del plan enseña el precio **antes** de ITBIS
  (`planes.js:136`, «RD$2,000 por equipo · 30 días»), y el resumen del pedido enseña
  subtotal + «ITBIS (18 %)» + total (`planes.js:231`). El panel también desglosa
  (`panel.js:897`). La sección 10 del documento pide lo contrario: solo el final, «ITBIS incluido».
- **El 3 % no existe todavía** en ningún sitio.

### 1.8 Cómo se marca un equipo como vendido

- `PATCH /api/anuncios/:id` `{ estado: 'vendido' }` → `tools/api.js:cambiarEstado` (línea 2768) →
  `db.cambiarEstadoAnuncio` (línea 3075), un `UPDATE` a secas. **No borra nada:** fotos, precio,
  métricas y membresía se quedan; el cupo se libera porque `vendido` no está en `ESTADOS_QUE_OCUPAN`.
- Lo que ya cumple la sección 6: se conserva todo y el catálogo público solo lista `activo`.
- **Hallazgo de seguridad (sección 37, «reutilización simultánea»):** `cambiarEstado` acepta
  `activo | pausado | vendido | retirado` **sin mirar el estado de partida ni la capacidad**. El
  panel solo ofrece «Reactivar» sobre un pausado, pero la API deja volver un `vendido` o `retirado`
  a `activo` aunque su cupo ya lo ocupe otro equipo: marcar vendido → publicar otro → reactivar el
  primero da dos anuncios por un cupo, repetible. Ninguna prueba lo cubre (`probar-seguridad.js`
  no nombra `vendido`). Un `vencido` reactivado vuelve a caducar en la siguiente consulta porque
  su `vence` ya pasó, así que ese camino no se aprovecha.
- **Eliminar** (`DELETE /api/anuncios/:id`, `borrarAnuncio`, línea 3028) sí borra la fila y los
  archivos. El panel avisa de que «Marcar vendido conserva las visitas».
- `verAnuncio` (`api.js:2890`) devuelve **cualquier** anuncio a cualquiera, sea cual sea su estado
  (solo oculta campos privados). Hoy no pasa nada porque no hay borradores en el servidor; con
  borradores de servidor sería una fuga.

### 1.9 Cómo funcionan las expiraciones

- `anuncios.vence` = `fin` de la membresía (se fija al publicar o al mover). `caducarAnuncios`
  (`tools/db.js:3082`) pasa `activo → vencido` cuando `vence < ahora`; corre en `misAnuncios`,
  `catalogo`, la portada y la tarea diaria `caducar` (`tools/tareas.js:46`).
- **Las suscripciones no caducan nunca.** Ningún código de producción escribe
  `estado = 'vencida'` en `suscripciones` (solo lo hacen a mano `probar-pagina-dealer.js:394` y
  `probar-transferencia.js:469`), y `suscripcionesDe` filtra `estado = 'activa'` sin mirar `fin`.
  Consecuencias: (a) los cupos de una membresía pasada siguen contando como libres y el panel los
  ofrece; un anuncio publicado en ellos nace con `vence` en el pasado y caduca en la siguiente
  consulta, así que no regala exposición, pero confunde; (b) `apagarPerfilesSinPlan`
  (`db.js:2196`, tarea `perfiles`) también mira solo `estado = 'activa'`, así que **la página
  pública de un dealer no se apaga al vencer su Premium**.
- Estados de anuncio en el CHECK: `borrador, activo, pausado, vencido, vendido, retirado`.
  **No hay `pendiente de pago`,** y en SQLite un CHECK no se amplía con `ALTER`: habría que
  reconstruir la tabla `anuncios`, que tiene fotos, videos, contactos, eventos y métricas
  colgando. Lo barato es derivarlo: `borrador` + pago `pendiente` cuya `intencion` apunta a ese
  anuncio (ver §3).

### 1.10 Cómo funcionan los dealers

- `organizaciones.tipo IN ('particular', 'dealer')`. El alta de dealer (`POST /api/dealer/registro`)
  valida el RNC (`rncValido`, 9 dígitos, `api.js:270`) y queda `estado_revision = 'pendiente'` hasta
  que el personal la aprueba (fase 4, por la bitácora). El RNC se enseña enmascarado
  (`rncEnmascarado`, `api.js:279`) y **no** sale en la página pública (`dealerPorSlug`, `db.js:1970`).
- Comercialmente un dealer es igual que un particular: compra cupos de los mismos tres niveles. Lo
  único exclusivo es que **Premium** (`perfil_publico = 1`) enciende su página pública si la
  empresa está aprobada (`encenderPerfilSiProcede`, `db.js:2382`); la tarea `perfiles` la apaga
  cuando no le queda ninguna suscripción Premium en estado `activa`, que en la práctica es nunca
  (ver §1.9).
- El sello «verificada» se da desde la consola por la bitácora; la fase 7 lo amplía.

### 1.11 Página pública del dealer

- `GET /api/dealers/:slug` → `api.js:verDealer` (línea 1755): exige dealer **aprobado**, con
  `perfil_publico = 1` y página `publicada` (dos llaves separadas a propósito). Devuelve nombre,
  logo, portada, lema, descripción, web, correo y teléfono **que el dealer decide enseñar**
  (`correo_publico`, `telefono_publico`), sucursales, inventario activo (hasta 500), enlaces,
  galería, secciones y el sello. Sin RNC.
- Edición: `mi-pagina.html` + `/api/mi-pagina/*`. La fase 7 añade la edición en nombre del dealer.
- Nada del modelo nuevo obliga a tocarla; solo la condición «tiene Premium vivo» pasaría a ser
  «tiene plan profesional vivo» si Victor así lo decide.

### 1.12 Dashboard del usuario

- `panel.html` + `assets/panel.js`, datos de `GET /api/mis-anuncios` (anuncios, `resumenOrganizacion`,
  membresías, exenta) y `GET /api/membresias` (pagos en espera, transferencia).
- Enseña: membresías con «N de M cupos», barra de uso y «Un cupo más: RD$…» (`panel.js:71-113`);
  «Sin cupos contratados» (`panel.js:237`); tabla de anuncios con estado, vistas, contactos,
  selector de plan, vigencia y acciones Pausar/Reactivar/Marcar vendido/Motor/Eliminar
  (`panel.js:filaAnuncio`, línea 371); filtros activos/otros; pagos en espera (fase 5).
- **No hay:** «Renovar», renovación automática, aviso visual a 7/3/1 días, historial de vendidos
  separado de vencidos.

### 1.13 Dashboard / admin

- `admin.html` + `assets/admin.js`. Secciones: solicitudes de dealer, solicitudes de servicio,
  bitácora (fase 4), pagos por transferencia (fase 5), facturas y secuencias NCF, portada,
  publicidad, flota, aceptaciones legales, y un resumen global con anuncios activos, vencidos y
  vendidos y el dinero aprobado (`tools/db.js:3300-3320`).
- Toda escritura en nombre de otra organización va por `conAdminEnNombreDe` / `db.enNombreDe`
  (bitácora de solo añadir, con IP de `CF-Connecting-IP`).
- **No hay:** listado de publicaciones pendientes de pago, desglose base/ajuste/ITBIS por pago,
  renovaciones, ni vista de capacidad por dealer.

### 1.14 Tareas programadas

- `tools/tareas.js`, diccionario `TAREAS` (línea 481): `caducar`, `perfiles`, `por-vencer`,
  `vencidos`, `comprobantes`, `ncf`, `limpiar`, `huerfanos`, `respaldo`, `optimizar`,
  `informe-semanal`, `informe-mensual`. Idempotentes por norma («lo que ya se hizo queda anotado
  en la base»), con `--seco`.
- Temporizadores systemd en `deploy/`: diario a las **05:00**, semanal lunes 07:00, mensual día 1
  a las 07:30. Con una pasada diaria, «24 horas antes» se cumple con un margen de hasta un día:
  para las alertas basta; para una renovación automática al minuto no.

### 1.15 Correos y notificaciones

- `tools/correo.js` es el único punto de envío (Brevo en producción, archivo en desarrollo),
  `enviar` nunca lanza y devuelve `entregado`.
- Ya existen `enviarAnuncioPublicado` (759), `enviarAnuncioPorVencer` (792), `enviarAnuncioVencido`
  (818), `enviarComprobante` (846), `enviarDatosTransferencia` (935), `enviarTransferenciaAnulada`
  (998) y `avisarInternamente` (449).
- **Aviso de vencimiento hoy:** uno solo, `MERCA_DIAS_AVISO` = 5 días antes, marcado en
  `anuncios.aviso_por_vencer`, y otro al vencer (`aviso_vencido`). La marca se pone solo si el
  correo salió: es exactamente el patrón idempotente que piden las secciones 28-29, pero con una
  columna por aviso. Para 7/3/1 días hace falta un registro por anuncio + tipo + ciclo.
- Ambos correos ya dicen «puede renovarlo desde el panel» y enlazan a `panel.html`
  (`correo.js:799-836`), **y en el panel no hay nada que renovar.**
- **No hay notificaciones internas** (ninguna tabla de avisos dentro del sitio). El «aviso visual»
  de la sección 30 se puede calcular al pintar el panel sin tabla nueva.

### 1.16 Proveedor de pagos

- **En producción:** `demo` (aprueba siempre) mientras la transferencia esté apagada;
  `transferencia` en cuanto Victor dé las cinco variables (fase 5, falta 05-05).
- **CardNet (fase 6, en pausa):** 06-01 hecho en `origin/claude/fase-06-cardnet` —
  `tools/cardnet.js` con las siete llamadas de la API de Tokenización por una costura de pruebas,
  interruptor `MERCA_CARDNET`, `aCentavos`, `normalizar` (la duda nunca aprueba), `limpiar` y la
  barrera de PCI en CI (135 comprobaciones). 06-02 a medias en `c6ccabb`: migración
  `2026-10-cardnet` con columnas en `pagos` (`procesador_id`, `autorizacion`, `codigo_respuesta`,
  `motivo`, `intentos`), en `metodos_pago` y **renovación en `suscripciones`**
  (`renovacion_automatica`, `renovacion_aceptada`, …), más `clientes_procesador` y `pagos_eventos`.

### 1.17 ¿Permite cobros recurrentes / tokenizados de forma segura?

- **Sí, con condiciones** (`.planning/research/cardnet.md`, sección «Cobro recurrente»): la
  tarjeta se captura en el iframe de CardNet, que devuelve un testigo; la renovación es repetir
  `POST /v1/api/purchase` con el testigo guardado, sin navegador. **CardNet no programa nada:**
  el calendario, los reintentos y la tarjeta vencida son código nuestro (`tareas.js`).
- **Hay que pedirlo al afiliarse** (`Ecommerce_COF` / `MOTO_Recurring`); si no, el comercio queda
  de venta única y las renovaciones se rechazan. Eso es de Victor, no de código.
- PCI: nunca pasan por nuestro servidor número, vencimiento ni código de seguridad; la barrera
  de 06-01 lo comprueba en CI.
- La transferencia no permite cobro automático: con CardNet apagado, renovación manual + alertas.
- **Encaje con el modelo nuevo:** el 06-02 ata la renovación a la **suscripción**. Para el
  particular, la renovación es de **un anuncio** (sección 23: «extiende la existente»). Como el
  particular tendrá una suscripción de un cupo por anuncio (ver §3), atarla a la suscripción
  sigue sirviendo si se garantiza esa relación 1 a 1; si no, las columnas tienen que ir al anuncio.

---

## 2. La regla «uno de cada cinco», exactamente

Código (`assets/precios.js:57-63`):

```js
const CUPOS_POR_UNO_GRATIS = 5;
const cuposGratis = (cupo) =>
  Math.floor(Math.max(0, Math.trunc(cupo)) / CUPOS_POR_UNO_GRATIS);
const cuposCobrados = (cupo) => {
  const n = Math.max(0, Math.trunc(cupo));
  return n - cuposGratis(n);
};
```

**Qué es:** *un cupo gratis por cada cinco completos de la misma compra.* No es «la quinta
publicación gratis» ni un 20 % de descuento: con 4 no hay nada, con 5 se pagan 4, con 9 se
pagan 8, con 10 se pagan 8, con 14 se pagan 12. El descuento real va del 0 % al 20 % y solo toca
el 20 % en múltiplos de cinco.

**Dónde actúa:**
- `precioCompra`: se cobran `cuposCobrados(cupo)` × precio × factor de duración.
- `precioAmpliacion`: se cobra la **diferencia de cupos cobrables**, prorrateada. Pasar de 4 a 5
  cuesta RD$0 (el quinto es el gratis) y el panel lo anuncia: «El siguiente cupo no le cuesta nada».
- Vale para **cualquier nivel y cualquier cuenta**, particular o dealer. Se cuenta dentro de una
  misma membresía: cinco compras separadas de un cupo no suman.
- Se acumula con la de 60 días (`RECARGO_60 = 1.8`: sesenta días valen 1,8 veces treinta).
- Se explica en `planes.js:pintarRegla` (línea 261) y en el prompt del asistente (`chat.js:146`).

**Consecuencia para el modelo nuevo:** un particular que paga una publicación compra siempre
un cupo, así que **la regla nunca le toca**. Solo sigue viva para quien compra capacidad (el
dealer). Conservarla para dealers no exige cambiar nada del cálculo; con el 3 % encima, el
orden es: cupos cobrables → factor de duración → prorrateo → ×1,03 → ITBIS.

---

## 3. Precios base y precio final

Fórmula del documento: **subtotal gravado = base × 1,03; ITBIS = subtotal × 0,18; final = subtotal + ITBIS**.
Todas las bases son múltiplos de 100, así que base × 1,03 siempre da pesos enteros: los centavos
solo aparecen en el ITBIS.

| Plan | Base | Subtotal con 3 % | ITBIS 18 % | Final exacto | Final redondeado | Final de hoy (sin 3 %) |
|---|---|---|---|---|---|---|
| Estándar, precio de hoy | 2.000 | 2.060,00 | 370,80 | **2.430,80** | 2.431 | 2.360 |
| Estándar, propuesto | 1.800 | 1.854,00 | 333,72 | **2.187,72** | 2.188 | – |
| Estándar en promoción (hasta 2026-11-30) | 0 | 0 | 0 | **0** | 0 | 0 |
| Destacado, precio de hoy | 3.500 | 3.605,00 | 648,90 | **4.253,90** | 4.254 | 4.130 |
| Destacado, propuesto | 3.200 | 3.296,00 | 593,28 | **3.889,28** | 3.889 | – |
| Premium (se conserva) | 5.500 | 5.665,00 | 1.019,70 | **6.684,70** | 6.685 | 6.490 |

Los cuatro planes retirados (`activo = 0`) no se venden; solo por completar:
Múltiple Estándar 8.000 → 9.723,20; Múltiple Destacados 14.000 → 17.015,60; Dealer 40.000 → 48.616,00;
Dealer Premium 60.000 → 72.924,00.

**¿Coinciden 1.800 y 3.200 con los precios base actuales? No.** La base de hoy es 2.000 y 3.500
(`db/schema.sql:796-797`, sin ninguna migración que los cambie). Es una **bajada del 10 % y del
8,6 %** de la base, y el precio final queda por debajo del de hoy aunque se sume el 3 %
(Estándar 2.187,72 frente a 2.360; Destacado 3.889,28 frente a 4.130). Aplicarlo exige una
migración `UPDATE planes SET precio = …` al final de `MIGRACIONES`; las suscripciones ya
vendidas no cambian porque guardan `precio_pactado`.

**Redondeo, lo que implica cada opción:**
- *Pesos enteros* (como hoy): subtotal gravado redondeado + ITBIS redondeado = total. Cuadra en
  todos los casos de la tabla (2.060 + 371 = 2.431; 1.854 + 334 = 2.188; 3.605 + 649 = 4.254;
  3.296 + 593 = 3.889; 5.665 + 1.020 = 6.685). El ITBIS se desvía como mucho 0,50 del 18 % exacto,
  que es lo que ya hace `desglose` hoy. No toca columnas, ni `aCentavos`, ni facturas.
- *Centavos*: exacto a la fórmula, pero cambia el tipo de dinero en `pagos`, `facturas` y
  `suscripciones.precio_pactado`, el `Math.round` de `desglose`, `aCentavos` del 06-01 (que hoy
  lanza con decimales) y todas las pruebas que comparan importes.
- Con 60 días, cupos de regalo o prorrateo la base deja de ser múltiplo de 100 (p. ej. Premium 60
  días: 9.900 → 10.197,00 + 1.835,46 = 12.032,46), así que el redondeo hay que decidirlo también
  para el subtotal, no solo para el total.

**Dónde encaja el 3 % sin duplicar fórmulas:** en `assets/precios.js:desglose`, que es el paso
común a compra, ampliación y renovación. Recibe la base ya calculada y devuelve base, tasa e
importe del ajuste, subtotal gravado, tasa e importe de ITBIS y total. El navegador y el
servidor la comparten, así que no pueden discrepar. `pagos.subtotal` pasa a ser el gravado (el
3 % queda dentro y la factura, que ya usa `pago.subtotal`, cuadra ante la DGII sin línea aparte).

---

## 4. Hallazgos que el cambio tiene que resolver (además de lo que pide el documento)

1. **Reactivar un vendido o retirado sin capacidad** (§1.8). Es un agujero de hoy, no del
   cambio, y es justo la «reutilización simultánea» de la sección 37.
2. **La ampliación usa el precio de lista, no el vigente.** `suscripcionesDe` saca
   `p.precio AS precio_unitario` (`db.js:2318`) y `ampliarMembresia` lo usa: durante la promoción,
   un Estándar nuevo cuesta 0 pero añadir un cupo a un Estándar cuesta la tarifa completa
   prorrateada. Y si el precio del plan cambia (1.800), la ampliación de una membresía vendida a
   2.000 pasa a cobrarse a 1.800, no a lo pactado. Hay que decidir cuál es el correcto.
3. **Suscripciones que nunca vencen** (§1.9): cupos libres de membresías pasadas y páginas de
   dealer que no se apagan. Para el dealer «plan con fecha de vencimiento» (sección 31) esto es
   imprescindible: hoy la fecha no tiene efecto sobre la capacidad.
4. **`verAnuncio` sin filtro de estado** (§1.8): obligatorio filtrar antes de crear borradores
   en el servidor.
5. **No hay renovación** pese a que dos correos y `legal.html` (4.3) la describen.
6. **La tarjeta del plan enseña el precio sin ITBIS** y el resumen lo desglosa: contrario a la
   sección 10.
7. **El 06-02 ata la renovación automática a la suscripción**; vale para el particular solo si
   cada publicación tiene su propia suscripción de un cupo.

---

## 5. Qué se reutiliza, qué se modifica, qué se agrega y qué queda intacto

### Se reutiliza tal cual
- `pagos.confirmarPago` / `db.aprobarPago` / `rechazarPago` / `cobrar` como única transición,
  con su idempotencia y la emisión única del NCF.
- `facturas.emitirPorPago` (idempotente) y todo el circuito fiscal: secuencias, B04, reenvíos.
- Procesadores `transferencia` y `demo`, `metodosDeCobro`, `procesadorDeCobro`, la consola de
  transferencias y la bitácora (`enNombreDe`).
- Tablas `planes`, `suscripciones`, `anuncios`, `pagos`: **ninguna se borra**. La suscripción de un
  cupo es el vehículo de la publicación del particular; la de N cupos, la capacidad del dealer.
- `ESTADOS_QUE_OCUPAN`, `moverAnuncioDeSuscripcion`, `refrescarAnunciosDe` (por fin tendrá quien
  la llame), `caducarAnuncios`, `membresiaInterna`, cuentas exentas, promoción por fecha.
- `precioAmpliacion` (prorrateo) y la regla del quinto gratis, para dealers.
- Estado `vendido` tal como está (conserva todo y libera capacidad) y el estado `borrador`, ya
  admitido por el CHECK.
- `tools/tareas.js`, sus temporizadores y el patrón «marcar solo si el correo salió».
- `tools/correo.js` y sus plantillas de vencimiento (se ajustan textos, no el mecanismo).
- Página pública del dealer, validación de RNC, revisión de dealers, sello: intactos.
- De la fase 6: `tools/cardnet.js` y su arnés enteros (06-01).

### Se modifica
- `assets/precios.js`: el 3 % en `desglose` con tasa configurable en una sola constante, y el
  desglose ampliado (base, ajuste, gravado, ITBIS, final). Redondeo según decida Victor.
- `tools/api.js:publicar`: el particular crea un **borrador en el servidor** con el plan elegido
  en vez de ocupar un cupo ya pagado; el dealer sigue ocupando capacidad.
- `pagos.intencion`: tipos nuevos `publicacion` (con `idAnuncio`) y `renovacion`; `aprobarPago`
  aprende a activar el anuncio del borrador y a extender el de la renovación.
- `cambiarEstado`: transiciones permitidas por estado de partida y comprobación de capacidad al
  volver a `activo`.
- `verAnuncio`: los no dueños solo ven `activo` y `vendido` (lo que hoy se enseñe de un vendido).
- `ampliarMembresia`: precio pactado o vigente, según la respuesta de Victor.
- `suscripcionesDe` y `apagarPerfilesSinPlan`: una membresía con `fin` pasado no ofrece cupos ni sostiene la página; y una tarea que la pase a `vencida`.
- `assets/planes.js`, `assets/publicar.js`, `assets/panel.js`: flujo «Publicar equipo → plan →
  anuncio → pagar» para el particular; «capacidad de publicaciones activas» para el dealer;
  precio final «ITBIS incluido».
- `tools/tareas.js` `por-vencer`: de un aviso a cinco días a tres (7, 3 y 1 día), idempotentes.
- Textos con «cupo» en 17 páginas, 13 módulos y 8 pruebas (lista en §7), `tools/chat.js` (prompt del
  asistente, con su prueba `chat:probar`) y `legal.html` (condiciones de contratación, apartados
  1.1, 1.2 y 4), subiendo la versión de `contratacion` en `assets/legales.js` (hoy 2.x): eso obliga
  a todos a volver a aceptar antes de pagar (`exigirAceptacion`, `PARA_PAGAR`).
- `db` de precios: migración al final con los precios base nuevos si Victor confirma 1.800/3.200.
- Planes 06-02 en adelante de la fase 6 (renovación por anuncio, importe de la fuente única).

### Se agrega
- Relación directa pago → anuncio (columna `pagos.anuncio_id` por migración, o solo en `intencion`;
  lo primero permite índices y la consulta del admin).
- Registro de recordatorios enviados (anuncio + tipo + ciclo + resultado + hora), con clave única.
- Ruta de **renovación manual** de un anuncio (nuevo pago, misma fila, extiende `vence`).
- Opción opt-in de **renovación automática** por anuncio, con su texto de consentimiento guardado
  y la fecha, apagada tras el interruptor de CardNet.
- En el panel: «Vence», «Renovación automática», «Renovar ahora», avisos a 7/3/1 días, pestañas
  activos/vendidos/expirados y, para dealers, el resumen de capacidad.
- En el admin: publicaciones por estado (incluidas las pendientes de pago), el desglose de cada
  pago con el ajuste (solo visible allí), renovaciones y capacidad por dealer.
- Tarea de limpieza de borradores abandonados (sin pago en N días; sin borrar fotos pagadas).
- Pruebas de la sección 39 en un arnés nuevo (`probar-modelo.js` o dentro de `probar-pagos.js`).

### Queda intacto
- NCF, B01/B02/B04, `facturas`, la regla de no reescribir un comprobante, el lote del contador.
- Bitácora, bandeja de solicitudes, consola de transferencias.
- Catálogo público, búsqueda, taxonomía, fotos y videos, métricas, página del dealer.
- Interruptor de transporte y financiamiento.
- Migraciones anteriores (todo lo nuevo va al final de `MIGRACIONES`).

---

## 6. Datos reales en producción

**No se pudo comprobar sin tocar la base.** Las rutas públicas de solo lectura
(`/api/estadisticas`, `/api/planes`, `/api/dealers`) no son alcanzables desde la sesión en la
nube: el proxy de salida responde 403 a `mercamaquinarias.com`. No se intentó nada más.

Lo que sí se sabe: `PROJECT.md` y `INTEGRATIONS.md` dicen que el sitio está en vivo con datos
reales desde el 2026-09-25, y que el Estándar está en promoción a RD$0, así que es probable que
haya membresías Estándar de un cupo gratuitas y casi ningún pago con importe.

Hace falta que Victor dé una de estas dos cosas (pregunta P5 abajo):
- los recuentos, corriendo él en el VPS, en solo lectura:
  `SELECT tipo, COUNT(*) FROM organizaciones GROUP BY tipo;`
  `SELECT plan_id, estado, anuncios_incluidos, COUNT(*) FROM suscripciones GROUP BY 1,2,3;`
  `SELECT estado, COUNT(*) FROM anuncios GROUP BY estado;`
  `SELECT estado, procesador, COUNT(*), SUM(total) FROM pagos GROUP BY 1,2;`
  `SELECT COUNT(*) FROM facturas;`
- o permiso para que una sesión los saque sobre una **copia** hecha con `VACUUM INTO` e
  `integrity_check`, nunca sobre la base viva.

---

## 7. Contacto con el trabajo en curso en otras ramas

Solo lista de archivos; no se revisó el contenido salvo donde se indica.

- **Fase 6** (`claude/fase-06-cardnet`): `tools/cardnet.js` sirve entero. La migración
  `2026-10-cardnet` sin cerrar pone la renovación en `suscripciones`; hay que decidir antes de
  cerrarla si va ahí o en `anuncios` (§1.17). `aCentavos` exige pesos enteros (§3).
- **Fase 7** (`fase-07-verificacion-dealer`): toca `tools/api.js`, `tools/db.js` (migraciones),
  `assets/admin.js`, `admin.html`. Choca en `MIGRACIONES` (orden de fusión) y en la consola.
- **Fase 8** (`fase-08-moneda-disponibilidad`): **añade una sección a `assets/precios.js`**
  (tasa del dólar para comparar precios del catálogo; no toca precios de planes) y toca
  `publicar.js` y `panel.js`. Conflicto de texto en el `module.exports` final, no de lógica.
- **Fase 9** (`fase-09-contactos-verificados`): toca `publicar.js`, `panel.js`, `correo.js`,
  `db.js`, `api.js`. El paso de contactos del publicador convive con el nuevo orden plan →
  anuncio → pago.
- **Fase 10** (`fase-10-alcance-metricas`): toca `panel.js`, `db.js`, `api.js`. Su «duplicar
  anuncio» no crea nada en el servidor, devuelve los datos para rellenar el publicador: en el
  modelo nuevo el duplicado entra como borrador y pasa por el pago, sin atajo.

Textos con «cupo» hoy (para la etapa de textos): `admin.html, alquiler.html, categorias.html,
contacto.html, cuenta.html, dealer.html, dealers.html, equipo.html, equipos.html,
financiamiento.html, importar.html, index.html, legal.html, mi-pagina.html, panel.html,
planes.html, publicar.html`, `assets/admin.js, app.js, panel.js, planes.js, precios.js,
publicar.js`, `tools/api.js, chat.js, correo.js, db.js, facturas.js, pagos.js, seed.js` y las
pruebas `auditar-flujos, auditar-permisos, probar-facturas, probar-pagina-dealer, probar-pagos,
probar-seguridad, probar-transferencia, prueba-chat`.

---

## 8. Preguntas que solo Victor puede contestar

- **P1. Redondeo.** ¿Precio final en pesos enteros (Estándar 2.188, Destacado 3.889, Premium
  6.685), como hoy, o con centavos exactos (2.187,72 / 3.889,28 / 6.684,70)? Enteros no cambia
  columnas ni el cliente de CardNet; centavos sí.
- **P2. 1.800 y 3.200.** Son una bajada frente a los 2.000 y 3.500 de hoy. ¿Confirmas que son
  los nuevos precios base? ¿Premium se queda en 5.500?
- **P3. Promoción del Estándar a RD$0 hasta el 2026-11-30.** ¿Sigue con el modelo nuevo? Si sigue,
  el particular que elige Estándar no pasa por pago hasta diciembre.
- **P4. «Uno de cada cinco».** Es un cupo gratis por cada cinco completos de una misma compra
  (5 → paga 4, 10 → paga 8, 9 → paga 8; ampliar de 4 a 5 es gratis), para cualquier nivel y
  cuenta. Con el modelo nuevo solo afecta a quien compra capacidad. ¿Se conserva para dealers?
  ¿Y el descuento de 60 días (1,8 veces treinta)?
- **P5. Datos reales.** ¿Cuántas organizaciones, membresías, anuncios, pagos con importe y
  facturas hay en producción? (Consultas de solo lectura en §6.)
- **P6. Cupos ya comprados.** Un particular con una membresía de varios cupos todavía vigente:
  ¿la conserva hasta que venza tal cual (propuesta: sí, nada pagado se pierde), o se convierte
  en publicaciones sueltas? ¿Y un dealer con cupos: pasan a ser su «capacidad» sin más?
- **P7. Particular o dealer.** ¿Qué decide que alguien compre capacidad y no publicaciones
  sueltas? Opciones: (a) ser cuenta de empresa aprobada por RNC; (b) querer más de N
  publicaciones a la vez; (c) elegir el plan Premium. ¿Un particular puede tener varias
  publicaciones pagadas a la vez, cada una con su pago?
- **P8. Precio de la renovación.** ¿Renovar cuesta lo mismo que publicar ese plan hoy (con el 3 %
  e ITBIS), o hay precio de renovación distinto? ¿Renovar antes de vencer suma el periodo al final
  del actual o empieza hoy?
- **P9. Ampliación.** ¿Añadir capacidad se cobra al precio pactado de la membresía o al vigente del
  plan? Hoy se cobra al de lista, que ni siquiera respeta la promoción.
- **P10. Duración del particular.** ¿Se le siguen ofreciendo 30 y 60 días?
- **P11. Borradores abandonados.** ¿Cuántos días se guarda un borrador sin pagar antes de
  limpiarlo?
- **P12. Hallazgo §1.8.** ¿Autorizas cerrar ya el agujero de reactivar un vendido sin capacidad,
  aunque el resto del cambio espere?
