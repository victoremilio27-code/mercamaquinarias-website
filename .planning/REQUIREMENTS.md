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

| Requisito | Origen |
|---|---|
| PAGO-01 … PAGO-08 | `.planning/research/cardnet.md`, verificado contra `tools/db.js` y `db/schema.sql:549` |
| PAGO-09, ADMIN-06 | Contingencia propuesta en `cardnet.md` para no depender de la afiliación |
| ADMIN-01, ADMIN-02 | `.planning/codebase/CONCERNS.md` — rutas sin pantalla |
| ADMIN-04, ADMIN-05 | Petición de Victor del 2026-09-25 y su decisión sobre el registro |
| CAT-01 | `.planning/research/mercado.md`, verificado en `tools/db.js` |
| CONF-01, MET-01 … MET-04, CAT-02 | `.planning/research/mercado.md`, huecos priorizados |
| UI-01 … UI-03 | Encargo directo de Victor y medición del contraste en `styles.css` |
| CI-01 | `.planning/codebase/CONCERNS.md` y la confirmación de que hay otra persona subiendo cambios |
| DEUDA-01 … DEUDA-05 | `.planning/codebase/CONCERNS.md` |

---
*Last updated: 2026-09-25*
