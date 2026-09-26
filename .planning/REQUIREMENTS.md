# Requirements: MercaMaquinarias

Alcance derivado de `.planning/PROJECT.md` y de la investigación en
`.planning/research/` (`cardnet.md`, `mercado.md`).

**v1 = lo que sale el 2026-10-14.** Todo lo demás es v2 o posterior.

Criterio de corte para v1, en este orden:
1. Corrige algo **roto** o **prometido en falso** que un cliente vería el primer día.
2. Permite **cobrar** y **dar soporte**, que es lo que hoy impide tener usuarios.
3. Es tan barato que lanzar sin ello no tiene excusa.

---

## v1 Requirements

### Cobro (PAGO)

- **PAGO-01**: Un pago se anota como `pendiente` y solo pasa a `aprobado` cuando el cobro se confirma. Hoy `anotarPago` escribe `'aprobado'` a mano (`tools/db.js`), de modo que un rechazo otorgaría cupos y emitiría un NCF de dinero que nunca entró.
- **PAGO-02**: Los cupos se otorgan y el comprobante se emite en un **único punto**: la transición `pendiente → aprobado`. Los dos caminos que la provocan (confirmación de la pasarela y marcado manual) comparten esa función.
- **PAGO-03**: Un cobro de importe cero sigue anotándose como aprobado sin emitir nada, como hoy.
- **PAGO-04**: Integración con CardNet por **tokenización**, con `POST /v1/api/purchase` tanto para el primer cobro como para las renovaciones.
- **PAGO-05**: El número de tarjeta, la fecha de vencimiento y el CVV **nunca** llegan a nuestro servidor. Queda prohibida cualquier integración que los reciba. Regla de revisión: si el código nombra una variable `cvv`, está mal.
- **PAGO-06**: Los importes se envían en **centavos**. El proyecto guarda pesos enteros; el factor 100 se aplica en un solo sitio y se prueba.
- **PAGO-07**: La confirmación de pago es **idempotente**: repetirla no otorga cupos dos veces ni consume un segundo NCF. `facturas.emitirPorPago` ya lo garantiza del lado de la factura.
- **PAGO-08**: Todo lo de CardNet se entrega **construido, probado y apagado** tras un interruptor de entorno, para encenderlo el día que la afiliación esté lista.
- **PAGO-09**: **Contingencia de lanzamiento**: cobro por transferencia bancaria, con el pago marcado como recibido desde la consola de administración. Permite abrir el 14 de octubre aunque CardNet no haya llegado.

### Consola de administración (ADMIN)

- **ADMIN-01**: Pantalla para las solicitudes de servicio (alquiler, importación, contacto). Las rutas `listarSolicitudesServicio` y `marcarSolicitudServicio` ya existen y ninguna pantalla las usa.
- **ADMIN-02**: Conceder el sello de **verificada** a una organización desde el sitio. Hoy solo se puede por línea de comandos, así que un dealer registrado por la web nunca puede obtenerlo.
- **ADMIN-03**: Revisar el **número de serie** de un anuncio, que hoy se guarda y nadie lee.
- **ADMIN-04**: **Editar la página de un dealer en su nombre**, para soporte.
- **ADMIN-05**: Toda escritura hecha en nombre de otro queda **registrada**: quién la hizo, cuándo y sobre qué organización. Decisión de Victor del 2026-09-25, para que un reclamo de un cliente empresa tenga prueba y un robo de la cuenta de admin deje rastro.
- **ADMIN-06**: Marcar un pago por transferencia como recibido (soporta PAGO-09).

### Catálogo y búsqueda (CAT)

- **CAT-01**: El filtro y el orden por precio **respetan la moneda**. Hoy comparan `a.precio` en crudo aunque `MONEDAS` admite DOP y USD: una máquina de US$120.000 se ordena por debajo de una de RD$500.000 y desaparece del filtro «desde RD$1.000.000».
- **CAT-02**: La ficha indica si el equipo está **ya en el país** o es **bajo pedido**.
- **CAT-03**: Permuta e ITBIS incluido pasan a ser **filtros**, no solo etiquetas.

### Confianza (CONF)

- **CONF-01**: La promesa de verificación del número de serie (`publicar.html:149`) se **cumple** mediante ADMIN-03, o el texto se retira. No se deja prometida sin diligencia detrás.
- **CONF-02**: Página de **señales de estafa**, dominicana, enlazada desde el aviso que ya existe en la ficha.
- **CONF-03**: Todo contacto que aparezca en un anuncio está verificado por correo o por SMS. Un contacto sin verificar no se muestra. Con los SMS apagados, el correo cumple la regla.

### Métricas y alcance del vendedor (MET)

- **MET-01**: **Favoritos**. La columna y el tipo de evento ya existen (`tools/db.js`) y nadie los emite; el panel promete una tarjeta «Guardados» que hoy siempre dirá 0.
- **MET-02**: **Botón de compartir** en la ficha, emitiendo el evento `compartir`. Los metadatos de WhatsApp ya están hechos en `tools/meta.js`.
- **MET-03**: El panel del anunciante lista **qué anuncio y cuándo** para cada contacto de WhatsApp, no solo el total. Sin esto el dealer no puede atribuir una venta al sitio, que es lo primero que preguntará al renovar.
- **MET-04**: **Duplicar un anuncio** desde el panel.

### Interfaz (UI)

- **UI-01**: Tema claro y oscuro coherentes en **todo** el sitio: ningún elemento se queda con un color fijo cuando el fondo cambia.
- **UI-02**: El borde de todo control interactivo alcanza 3:1 con la superficie de atrás, en los dos temas.
- **UI-03**: Una comprobación automática recorre cada página en los dos temas y falla si algo incumple UI-01 o UI-02.

### Entrega (CI)

- **CI-01**: Ninguna fusión a `main` se despliega sin que pasen las pruebas. Hoy despliega directo y hay una segunda persona subiendo cambios.
- **CI-02**: El repositorio tiene un `CLAUDE.md` propio con las reglas que no se pueden olvidar. *(Hecho el 2026-09-25.)*

---

## v2 Requirements

### Servicios suspendidos (SERV)

- **SERV-01**: Encender **transporte**, con el mapa provincia a provincia de `assets/mapa.js`, que está escrito y ninguna página carga.
- **SERV-02**: Encender **financiamiento** con instituciones dominicanas reales y calculadora de cuota. El financiamiento en RD no es escaso, está disperso.

### Contabilidad (CONTAB)

- **CONTAB-01**: Paquete mensual de comprobantes que Victor **descarga y envía él**. Nunca se envía nada automáticamente a un contador.

### Ficha y datos (FICHA)

- **FICHA-01**: **Adjuntar documentos** a un anuncio. Hoy solo admite fotos y video, y sin esto no hay informe de inspección.
- **FICHA-02**: Inspección propia con informe publicado. El informe describe lo observado; no certifica porcentajes ni promete pruebas de carga.
- **FICHA-03**: Especificaciones numéricas **filtrables** por tipo de máquina, colgadas de la jerarquía de `assets/taxonomia.js`.
- **FICHA-04**: Implementos como lista estructurada y filtrable, no la línea de texto actual.

### Fidelización (ALERT)

- **ALERT-01**: Búsquedas guardadas y alertas. Depende de los créditos SMS y del correo.

### Deuda técnica (DEUDA)

- **DEUDA-01**: Testigos de sesión guardados cifrados, no en claro.
- **DEUDA-02**: `scrypt` asíncrono, para que el acceso no bloquee el hilo único.
- **DEUDA-03**: Cerrar la enumeración de usuarios por tiempo de respuesta.
- **DEUDA-04**: Partir `tools/db.js` (3.353 líneas) y `tools/api.js` (2.677) para que dos personas no choquen.
- **DEUDA-05**: Respaldos fuera del VPS.

---

## Out of Scope

- **Escrow o retención de fondos** — es otro negocio y otra regulación. Truck1 tampoco lo hace.
- **Chat con traducción automática** — el mercado es monolingüe.
- **Aplicación nativa** — el sitio es adaptable; los grandes la tienen por escala, no por necesidad.
- **Integración de telemática** — exige acuerdos con fabricantes que un sitio nuevo no consigue.
- **Carga masiva o feed de inventario** — solo importa con dealers de inventario grande. Hasta entonces «lo subimos nosotros» es más efectivo y no cuesta código.
- **Modelo de negocio de los planes y sus precios** — se trabaja por otro lado.
- **Envío automático al contador** — prohibido por decisión de Victor.
- **Teléfono como canal de soporte** — solo correo y el asistente del sitio.
- **Stripe** — no opera en República Dominicana (fuente oficial), y la vía de una sociedad estadounidense choca con emitir NCF contra el RNC de Inversiones XZT.

---

## Traceability

Cada requisito de v1 está asignado a **exactamente una fase** de `.planning/ROADMAP.md`.
Cobertura verificada el 2026-09-25: **30 de 30 requisitos de v1** y **13 de 13 de v2**, sin
huérfanos y sin duplicados.

### v1 — Lanzamiento (2026-10-14)

| Requisito | Fase | Estado | Origen |
|---|---|---|---|
| PAGO-01 | Phase 3 — El pago deja de darse por cobrado | Pendiente | `research/cardnet.md`, verificado contra `tools/db.js` y `db/schema.sql:549` |
| PAGO-02 | Phase 3 — El pago deja de darse por cobrado | Pendiente | `research/cardnet.md`, verificado contra `tools/db.js` |
| PAGO-03 | Phase 3 — El pago deja de darse por cobrado | Pendiente | `research/cardnet.md`, comportamiento actual que se conserva |
| PAGO-04 | Phase 6 — CardNet construido y apagado | Pendiente | `research/cardnet.md` |
| PAGO-05 | Phase 6 — CardNet construido y apagado | Pendiente | `research/cardnet.md`, implicaciones de PCI-DSS |
| PAGO-06 | Phase 6 — CardNet construido y apagado | Pendiente | `research/cardnet.md`, unidades del importe |
| PAGO-07 | Phase 6 — CardNet construido y apagado | Pendiente | `research/cardnet.md`; `facturas.emitirPorPago` ya es idempotente |
| PAGO-08 | Phase 6 — CardNet construido y apagado | Pendiente | Patrón ya validado con Brevo y Anthropic |
| PAGO-09 | Phase 5 — Cobro por transferencia bancaria | Completo (2026-09-25) | Contingencia propuesta en `cardnet.md` para no depender de la afiliación |
| ADMIN-01 | Phase 4 — Bandeja de solicitudes y bitácora | Pendiente | `codebase/CONCERNS.md` — rutas sin pantalla |
| ADMIN-02 | Phase 7 — Verificación y soporte al dealer | Pendiente | `codebase/CONCERNS.md` — solo por línea de comandos hoy |
| ADMIN-03 | Phase 7 — Verificación y soporte al dealer | Pendiente | `research/mercado.md`, huecos priorizados; cumple CONF-01 |
| ADMIN-04 | Phase 7 — Verificación y soporte al dealer | Pendiente | Petición de Victor del 2026-09-25 |
| ADMIN-05 | Phase 4 — Bandeja de solicitudes y bitácora | Pendiente | Decisión de Victor del 2026-09-25 sobre el registro |
| ADMIN-06 | Phase 5 — Cobro por transferencia bancaria | Completo (2026-09-25) | Contingencia propuesta en `cardnet.md`; soporta PAGO-09 |
| CAT-01 | Phase 8 — Moneda y disponibilidad en el catálogo | Pendiente | `research/mercado.md`, verificado en `tools/db.js` |
| CAT-02 | Phase 8 — Moneda y disponibilidad en el catálogo | Pendiente | `research/mercado.md`, huecos priorizados |
| CAT-03 | Phase 8 — Moneda y disponibilidad en el catálogo | Pendiente | `research/mercado.md`, huecos priorizados |
| CONF-01 | Phase 7 — Verificación y soporte al dealer | Pendiente | `research/mercado.md`; se cumple vía ADMIN-03 o se retira el texto |
| CONF-02 | Phase 9 — Contactos verificados y estafas | Pendiente | `research/mercado.md`, huecos priorizados |
| CONF-03 | Phase 9 — Contactos verificados y estafas | Pendiente | `PROJECT.md` Fase 1; créditos SMS pendientes |
| MET-01 | Phase 10 — Alcance y métricas del vendedor | Hecho 2026-09-25 | `10-01` (evento y columna), `10-02` (guardar en la ficha) y `10-03` (compartidos y tarjeta del panel) |
| MET-02 | Phase 10 — Alcance y métricas del vendedor | Hecho 2026-09-25 | `10-02` (botón compartir y metadatos) verificado en `10-04` con un navegador real |
| MET-03 | Phase 10 — Alcance y métricas del vendedor | Hecho 2026-09-25 | `10-03`: `panel.html` lista cada contacto con su anuncio y su hora, filtrable por equipo y canal |
| MET-04 | Phase 10 — Alcance y métricas del vendedor | Hecho 2026-09-25 | `10-03`: «Duplicar» en el panel precarga `publicar.html` sin el número de serie |
| UI-01 | Phase 2 — Tema claro y oscuro coherentes | Hecho 2026-09-25 | `02-05` y `02-06`: los literales congelados pasan a sus tokens y la única pieza fija deliberada que quedaba, la cuenta de fotos sobre la imagen, entra en las excepciones con su razón. `check-contraste` en 0 en las 17 rutas y los dos temas |
| UI-02 | Phase 2 — Tema claro y oscuro coherentes | Hecho 2026-09-25 | `02-04`: los dieciséis controles de D-01 más seis que el inventario no tenía usan `--app-borde-control`. El comprobador pasa de 271 hallazgos de tipo `control` a **cero**, en las 17 rutas y en los dos temas |
| UI-03 | Phase 2 — Tema claro y oscuro coherentes | Hecho 2026-09-25 | `tools/check-contraste.js` recorre 17 rutas en los dos temas, mide texto, controles y dinamismo, y sale 1 con hallazgos; colgado del final de `npm run auditar`. Desde el `02-06` sale 0 y `npm run auditar` pasa entero con él dentro |
| CI-01 | Phase 1 — Barrera de pruebas en la fusión | En curso — 01-01 hecho 2026-09-25 | El despliegue ya lleva `needs: [pruebas, navegador]` y no puede correr en rojo; falta el `01-02` (protección de rama) para que tampoco se pueda **fusionar** en rojo |
| CI-02 | Phase 1 — Barrera de pruebas en la fusión | Hecho 2026-09-25 | Reglas que no se pueden olvidar; se verifica en la Fase 1 |

### v2 — Después del lanzamiento

| Requisito | Fase | Estado | Origen |
|---|---|---|---|
| SERV-01 | Phase 11 — Transporte y financiamiento | Pendiente | `assets/mapa.js` escrito y sin cargar; interruptor de `assets/servicios.js` |
| SERV-02 | Phase 11 — Transporte y financiamiento | Pendiente | `research/mercado.md`, patrón validado en RD |
| CONTAB-01 | Phase 12 — Lote mensual de comprobantes | Pendiente | Regla de Victor: los acumula y los manda él |
| DEUDA-01 | Phase 13 — Deuda técnica | Pendiente | `codebase/CONCERNS.md` |
| DEUDA-02 | Phase 13 — Deuda técnica | Pendiente | `codebase/CONCERNS.md` |
| DEUDA-03 | Phase 13 — Deuda técnica | Pendiente | `codebase/CONCERNS.md` |
| DEUDA-04 | Phase 13 — Deuda técnica | Pendiente | `codebase/CONCERNS.md` |
| DEUDA-05 | Phase 13 — Deuda técnica | Pendiente | `codebase/CONCERNS.md` |
| FICHA-01 | Phase 14 — Inspección con informe publicado | Pendiente | `research/mercado.md`; hoy un anuncio solo admite fotos y video |
| FICHA-02 | Phase 14 — Inspección con informe publicado | Pendiente | `research/mercado.md`, modelo IronClad acotado a describir lo observado |
| FICHA-03 | Phase 15 — Especificaciones e implementos filtrables | Pendiente | `research/mercado.md`; cuelga de la jerarquía de `assets/taxonomia.js` |
| FICHA-04 | Phase 15 — Especificaciones e implementos filtrables | Pendiente | `research/mercado.md`; hoy es la línea de texto de `publicar.html:164` |
| ALERT-01 | Phase 16 — Búsquedas guardadas y alertas | Pendiente | `research/mercado.md`; depende de los créditos SMS y del correo |

---
*Last updated: 2026-09-25 — trazabilidad completada con la fase de cada requisito*
