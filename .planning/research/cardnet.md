# CardNet — pasarela de pago para MercaMaquinarias

**Investigado:** 2026-09-25
**Confianza global:** ALTA en lo técnico (CardNet publica documentación real y detallada),
BAJA en lo comercial (precios y plazos no los publica nadie con autoridad).

## Cómo se leyó esto

La documentación de CardNet **sí existe y es buena**: está en
<https://developers.cardnet.com.do/>. El problema es que el sitio va detrás de
Imperva/Incapsula y está renderizado en JavaScript, así que `curl` y las herramientas
de descarga normales devuelven una página de bloqueo vacía. Se leyó con puppeteer
(el que ya está como dependencia de desarrollo). Menciono esto porque el siguiente que
busque esta información va a creer que no hay documentación, y sí la hay.

Convención de este documento:

- **[VERIFICADO]** — leído de una URL que se cita. Los nombres de parámetros y las
  rutas marcadas así están copiados literalmente de la documentación de CardNet.
- **[INFERIDO]** — deducción razonada a partir de lo verificado, o práctica habitual.
  No está escrito en ningún sitio.
- **[PREGUNTAR]** — no se pudo verificar. Victor tiene que preguntárselo a CardNet.

Todo lo que se diga de precios, comisiones y plazos de afiliación viene de blogs de
terceros con interés comercial (venden plataformas de e-commerce). Sirve para saber el
orden de magnitud, no para presupuestar.

---

## Cómo funciona CardNet

CardNet no es un producto: son **dos plataformas distintas**, con credenciales
distintas, URL distintas y modelos mentales distintos. Confundirlas es el primer error
que se puede cometer aquí, porque la afiliación se pide por separado.

### Plataforma 1 — "Botón de Pago" (Ztrans)

Cobro de una tarjeta, una vez. Tres modos de integración
[VERIFICADO — <https://developers.cardnet.com.do/guias/boton-de-pago/>]:

| Modo | Dónde se teclea la tarjeta | Alcance PCI | Sirve aquí |
|------|---------------------------|-------------|------------|
| Web con Pantalla (POST) | En la página de CardNet | Fuera de alcance | Sí |
| Web sin Pantalla (REST) | En nuestro servidor | **SAQ D completo** | No |
| Web sin Pantalla (SOAP) | En nuestro servidor | **SAQ D completo** | No |

El modo **con pantalla** funciona en dos pasos
[VERIFICADO — <https://developers.cardnet.com.do/guias/boton-de-pago/web-con-pantalla-post-3ds.html>]:

1. Nuestro servidor hace `POST` a `/sessions` con JSON y recibe
   `{ "SESSION": "...", "session-key": "..." }`. Esta llamada sale **del servidor**,
   nunca del navegador — la propia documentación lo dice: *"La invocación de este
   servicio ocurre desde el servidor evitando enviar cualquier dato al navegador."*
2. El navegador hace un `POST` de formulario a `/authorize` con un único campo oculto,
   `SESSION`. CardNet pinta su propia pantalla, captura tarjeta, vencimiento, CVV y el
   reto 3-D Secure, y al terminar redirige a `ReturnUrl` o `CancelUrl`.
3. Nuestro servidor **consulta** el resultado:
   `GET /sessions/{SESSION}?sk={session-key}`.

URL reales [VERIFICADO, misma página]:

- Certificación (QA): `https://labservicios.cardnet.com.do/sessions` y
  `https://labservicios.cardnet.com.do/authorize`
- Producción: `https://ecommerce.cardnet.com.do/sessions` y
  `https://ecommerce.cardnet.com.do/authorize`

Parámetros obligatorios de `/sessions` [VERIFICADO, nombres literales]:
`TransactionType` (`0200` venta normal, `0100` preautorización, `2240` confirmación),
`Amount`, `CurrencyCode` (`214` = peso dominicano, `840` = dólar), `Tax`,
`MerchantNumber`, `MerchantTerminal`, `ReturnUrl`, `CancelUrl`, `PageLanguaje`,
`TransactionId`, `Ipclient`, `AcquiringInstitutionCode`, `OrdenID`, `MerchantName`.
Respuesta de la consulta: `ResponseCode` (`00` = aprobada), `AuthorizationCode`,
`RetrievalReferenceNumber`, `TxToken`, `CreditCardNumber` enmascarado, `OrdenID`.

**Lo importante de este modo: no hay webhook.** El resultado se obtiene consultando, y
la sesión **caduca a los 30 minutos** — pasado ese tiempo la consulta devuelve
`"Session not found"` con estatus `404` [VERIFICADO]. Eso no es un detalle: si el
proceso se reinicia en el momento malo y nadie consulta en media hora, hay un cobro
hecho del que no queda constancia del lado nuestro. Se resuelve con diseño (abajo), no
esperando que no pase.

### Plataforma 2 — "Tokenización & Autenticación" (Card on File)

Ésta es la que importa para un negocio de membresías
[VERIFICADO — <https://developers.cardnet.com.do/guias/tokenizacion-autenticacion/>].

Es una API REST + JSON con autenticación **HTTP Basic**, donde la clave va como
*username* y la contraseña se deja vacía. Dos claves por comercio:
`PublicAccountKey` (se manda desde el navegador, solo sirve para pedir la captura de
datos) y `PrivateAccountKey` (servidor a servidor, operaciones críticas).

Objetos y rutas [VERIFICADO, literales]:

- `POST {URLBASE}/v1/api/customer` — crea el cliente, devuelve `CustomerId`.
- `GET {URLBASE}/v1/api/customer/{CustomerId}` — devuelve el cliente **con un
  `CaptureURL` y un `UniqueID` nuevos cada vez**, y la lista de `PaymentProfiles`.
- `POST {URLBASE}/v1/api/customer/{CustomerId}/activate` — activa un perfil de pago con
  un código de activación.
- `POST {URLBASE}/v1/api/customer/{CustomerId}/PaymentProfileDelete` — borra un perfil.
- `POST {URLBASE}/v1/api/purchase` — **cobra**. Cuerpo: `TrxToken`, `Order`, `Amount`,
  `Currency`, `Capture`, y `DataDo` (obligatorio para RD).
- `GET {URLBASE}/v1/api/purchase/{PurchaseID}` — consulta una compra.
- `POST {URLBASE}/v1/api/purchase/{PurchaseID}/refund` — devuelve.

URL base [VERIFICADO]:

- Certificación: `https://labservicios.cardnet.com.do/servicios/tokens/`
- Producción: `https://servicios.cardnet.com.do/servicios/tokens/`

La captura de la tarjeta se hace con un **iframe servido por CardNet** (`PWCheckout.js`,
método `OpenIframeCustom`), cargando
`{CaptureURL}?key={PublicAccountKey}&session_id={UniqueID}`. Los datos van del navegador
del cliente directo a CardNet; nuestro servidor no los ve nunca. Al terminar, el
navegador recibe el evento `tokenCreated` y nosotros volvemos a pedir el `Customer` para
leer el perfil nuevo.

Dos tipos de testigo, y la diferencia es la que decide todo el diseño [VERIFICADO]:

- **One Time Token** (prefijo `OT_` en los ejemplos): *"tiene validez por una única vez
  y está vigente durante 10 minutos"*. Para el que paga y se va.
- **Card on File token** (prefijo `CT__` en los ejemplos): reutilizable.
  *"puede ser utilizada múltiples veces para realizar transacciones"*. Éste es el que va
  en `metodos_pago.token`.

Y **sí hay webhook** en esta plataforma [VERIFICADO, sección *Servicio WebHook del
Comercio*]: CardNet hace `POST` con un objeto `Notification` (`ResourceType`,
`ResourceUrl`, `ResourceObject`), autenticado con la misma `PrivateAccountKey` en
cabecera Basic. Si respondemos `200` la da por procesada; **cualquier otro código y la
reintenta**. La URL la configura CardNet a mano: hay que pedírselo.

### Plataforma 3 — "Enlace de Pago", sin código

CardNet vende también un producto donde uno genera facturas y manda un enlace por
correo, y el cliente teclea la tarjeta en el sistema de CardNet
[VERIFICADO — <https://www.cardnet.com.do/soluciones/online/enlace-de-pago>]. Cero
integración. No sirve como producto final —no renueva solo, no da cupos
automáticamente— pero **sirve como red de seguridad para lanzar**: si el día 30 la
integración no está certificada, se puede cobrar a mano con enlaces mientras se termina.

### Recomendación

**Plataforma de Tokenización (Card on File), con el formulario en iframe.** Razones, en
orden:

1. Es la única que resuelve el cobro recurrente, que es el modelo del producto.
2. El mismo `POST /v1/api/purchase` sirve para el primer cobro (con `OT_`) y para las
   renovaciones (con `CT__`). Un solo camino de código, una sola credencial, un solo
   juego de pruebas.
3. Tiene webhook y tiene `UniqueID` de idempotencia.
4. La tarjeta no pasa por nuestro servidor.
5. Es JSON sobre HTTPS con Basic Auth: `https.request` y `crypto` de Node bastan. **No
   hace falta ningún paquete**, ni hay SDK oficial de Node que nos estemos perdiendo.
   Lo que sí existe son plugins de WooCommerce, Magento y PrestaShop, que no aplican.

Si CardNet se niega a habilitar Card on File para este comercio —es una configuración
del afiliado, no un interruptor nuestro— el plan B es Botón de Pago con pantalla para el
primer cobro y renovación manual por Enlace de Pago. Peor producto, pero se lanza.

---

## Cobro recurrente

### La respuesta corta

**Sí se puede cobrar todos los meses sin volver a pedir la tarjeta. No, CardNet no
gestiona las suscripciones por nosotros.** El calendario, los reintentos, el prorrateo y
el "se le venció la tarjeta" son código nuestro.

### Por qué, con evidencia

Hay una trampa documental aquí y conviene verla. La sección de autenticación de la guía
de tokenización dice que con la clave privada se pueden hacer *"operaciones críticas,
como iniciar o confirmar una transacción, acceder a información de transacciones del
comercio, **crear o eliminar planes de suscripción**, etc."* [VERIFICADO]. Eso suena a
que CardNet tiene suscripciones nativas.

No las tiene, o no las tiene documentadas. En la definición de los objetos, los dos
campos que serían los de suscripción están marcados así [VERIFICADO, literal]:

- Objeto `Customer`: `Plans [Opcional] - Reservado.`
- Objeto `Purchase`: `PlanID (String[50]) - Reservado.`

"Reservado" significa reservado. No hay ninguna ruta `/v1/api/plan` en la guía, ningún
objeto `Plan` definido, ningún ejemplo. Y en el ejemplo de respuesta de `Customer` que
publican, `"Plans": null`.

**Conclusión: no se debe diseñar contra `PlanID`.** Lo que hay que usar es lo que sí está
documentado: guardar el testigo `CT__` y cobrarlo nosotros cuando toque. Eso es una
transacción iniciada por el comercio (MIT) contra una credencial archivada, que es
exactamente el mecanismo estándar de la industria y el que usa todo el mundo en RD.

Hay una confirmación indirecta y fuerte de que CardNet soporta esto a nivel de red: en la
guía REST del botón de pago, el campo `environment` acepta estos valores
[VERIFICADO — <https://developers.cardnet.com.do/guias/boton-de-pago/web-sin-pantalla-rest.html>]:

```
ASI:              Registro de tarjeta con monto cero.
Ecommerce:        Transacción de comercio electrónico.
Ecommerce_COF:    Transacción Ecommerce con credencial archivada.
MOTO:             Transacción de pedido por correo.
MOTO_Recurring:   Transacción de pago recurrente con credencial archivada.
QuasiCashMT:      Transacción para juegos de azar.
```

Existen `Ecommerce_COF` y `MOTO_Recurring`. Existe `ASI`, registro de tarjeta con monto
cero, que es como se valida una tarjeta sin cobrarla. La red lo soporta.

Pero justo debajo hay la frase que Victor tiene que llevarse a la reunión
[VERIFICADO, literal]:

> *"Algunos casos de uso son definidos en la configuración del afiliado una vez creado en
> el sistema de CardNET, se debe informar el caso de uso al momento de solicitar los
> datos de afiliación."*

Es decir: **el cobro recurrente hay que pedirlo al afiliarse.** Si nadie lo pide, el
afiliado queda configurado como comercio de venta única y las renovaciones se rechazan.
Esto no se arregla con código.

### El flujo que hay que implementar

Primer cobro, con tarjeta nueva:

1. El anunciante elige nivel, cupos y días. Nuestro servidor crea el `Customer` en
   CardNet (o recupera el `CustomerId` que ya guardamos) y pide el `Customer` para
   obtener `CaptureURL` y `UniqueID`.
2. El navegador abre el iframe de CardNet y el cliente teclea la tarjeta.
3. Vuelve un testigo por el evento `tokenCreated`. El navegador lo manda a nuestro
   servidor.
4. El servidor pide de nuevo el `Customer`, encuentra el `PaymentProfile` nuevo y guarda
   `PaymentProfileId`, `Token`, `Brand`, `Last4`, `Expiration` en `metodos_pago`.
5. El servidor hace `POST /v1/api/purchase` con el testigo, `Order` = nuestra referencia,
   `Amount` en centavos, `Currency: "DOP"`, `Capture: true`, `UniqueID` = nuestra
   referencia, y `DataDo`.
6. Si vuelve `Approved`: se marca el pago aprobado, se otorgan los cupos y **entonces** se
   emite el NCF.

Renovaciones: una tarea de systemd diaria busca las suscripciones cuyo `proximo_cargo`
llegó y repite solo el paso 5 con el testigo `CT__` guardado. Nada de iframe, nada de
navegador, nada de cliente presente.

### El obstáculo real: la activación del perfil

Esto es lo que va a doler, y no lo va a ver nadie hasta que se pruebe con una tarjeta de
verdad [VERIFICADO, sección *Proceso de Activación de Medio de Pago*]:

> *"deberá verificar que el objeto PaymentProfile (dentro del Customer recibido) podrá
> estar marcado como deshabilitado (Enabled=false) por lo que para que dicho perfil
> (Token) pueda ser utilizado, deberá ser activado."*

Y la activación exige que el cliente teclee un **código de activación** que recibió por
otro canal, y que *"el método de entrega de dicho código queda fuera de este alcance"*.
Después va un `POST /v1/api/customer/{CustomerId}/activate` con `Token` y
`ActivationCode`. Hay un código de error dedicado, `CS012 PROFILE_MUST_BE_ACTIVATED_FIRST`.

Traducido: **es posible que guardar una tarjeta requiera un paso extra de verificación
que el banco emisor manda al cliente**, y que hasta que ese código no se introduzca, el
testigo no cobre. Eso es un paso más en el embudo de pago, y en un embudo de pago cada
paso se come conversión.

Dos cosas que no sé y que hay que preguntar:

- **[PREGUNTAR]** ¿La activación aplica siempre, o solo en ciertos escenarios? El texto
  dice "podrá estar marcado", en condicional. Si aplica siempre, el flujo del primer cobro
  tiene un paso más del que se dibuja arriba.
- **[PREGUNTAR]** ¿Quién manda el código y por dónde? ¿Es el emisor por SMS, es CardNet,
  o lo tiene que mandar el comercio? Si es lo tercero, hay que saber de dónde se saca.

### Lo que hay que preguntar a CardNet sobre el recurrente

1. ¿Queda el afiliado habilitado para `Ecommerce_COF` y `MOTO_Recurring`? Pedirlo por
   escrito al afiliarse.
2. ¿Hay suscripciones nativas —los campos `Plans` y `PlanID`— o siguen reservados? Si
   existen, pedir la documentación; si no, confirmar que el camino es MIT con testigo
   guardado.
3. ¿Qué pasa cuando la tarjeta vence? ¿Hay actualización automática de credenciales
   (Visa Account Updater / Mastercard ABU)? Con ella, un porcentaje de las renovaciones se
   salva sin molestar al cliente. Sin ella, hay que avisar por correo antes.
4. ¿Cuántos reintentos permite el contrato antes de considerarlo abuso? Las redes
   penalizan reintentar la misma tarjeta rechazada muchas veces.
5. ¿Cómo se valida una tarjeta sin cobrarla? En Card on File no aparece; en la REST sí
   (`ASI`, monto cero). Preguntar si hay equivalente.
6. ¿Es `Purchase` con `Capture: false` usable con tarjeta? Ojo: la tabla de medios de pago
   de la guía de tokenización dice **preautorización = No** para Visa, MasterCard y
   American Express [VERIFICADO]. O sea, en Card on File probablemente **no se puede
   preautorizar**, solo cobrar de una. Confirmarlo.

---

## Qué hace falta para contratarlo

### Documentos — esto está confirmado por CardNet

Copia de los siguientes documentos
[VERIFICADO — <https://www.cardnet.com.do/afiliate/empresarial/>]:

- [ ] Registro Mercantil actualizado
- [ ] Última Asamblea
- [ ] Estatutos
- [ ] Cédula del gerente apoderado para firma, según acta de asamblea
- [ ] Estado de la cuenta o cheque donde desea recibir los depósitos

El formulario de afiliación pide además: tipo de negocio (persona física o empresa),
nombre comercial, razón social, cédula y RNC, teléfonos, correo electrónico, dirección
del establecimiento y provincia [VERIFICADO, mismo formulario].

Inversiones XZT, S.R.L. tiene RNC 1-31-27975-9 y RM 116099SD, así que la parte fiscal
está. **El punto que hay que revisar antes de ir es el acta de asamblea**: tiene que
nombrar al apoderado que va a firmar, y la cédula que se entrega tiene que ser la de esa
persona. Es el papel que más veces falta.

### Lo que hay que pedir en la misma reunión

No solo firmar: salir con estos datos o con la promesa escrita de ellos.

- [ ] Habilitación explícita de **e-commerce con credencial archivada** (`Ecommerce_COF`)
      y **recurrente** (`MOTO_Recurring`). Ver la sección anterior: es configuración del
      afiliado.
- [ ] Credenciales de **certificación (QA)** para poder construir y probar antes de
      producción.
- [ ] `MerchantNumber`, `MerchantTerminal`, `AcquiringInstitutionCode`, `MerchantType`
      (código de categoría del comercio) de producción.
- [ ] `PublicAccountKey` y `PrivateAccountKey` de la plataforma de tokenización. Son
      distintas de las del botón de pago.
- [ ] El `MerchantName` exacto, con el formato raro que exigen: 40 caracteres, todo en
      mayúsculas, 22 bytes de nombre + 13 de ciudad + 3 de estado + 2 de país
      [VERIFICADO]. Que lo dicten ellos; inventárselo es un rechazo.
- [ ] **Registrar la URL del webhook.** La documentación dice que la configura CardNet:
      *"El comercio deberá informar a CARDNET la URL en la que será publicado dicho
      servicio, de forma de que esta sea configurada en nuestros sistemas"*. Sin esto no
      llegan notificaciones.
- [ ] Qué exige el **proceso de certificación**: la documentación dice *"Una vez que su
      aplicación sea certificada por los técnicos de CARDNET, deberá solicitar los datos
      para procesar en el ambiente de producción"* [VERIFICADO]. Hay una certificación
      técnica obligatoria y hay que saber cuánto tarda.
- [ ] Confirmar la **hora del cierre**: *"El proceso de cierre de los comercios es
      ejecutado de forma automática en la plataforma a las 7:00 PM"*, y se puede cambiar
      pidiéndolo al ejecutivo de cuenta [VERIFICADO]. Afecta a cuándo se liquida lo que se
      cobró.
- [ ] La estructura de costos por escrito: comisión por transacción, cuota mensual fija,
      alta, mínimo mensual, costo de contracargo.
- [ ] Plazo de liquidación a la cuenta.
- [ ] Qué monedas queda habilitado a procesar. Los equipos se listan en pesos, pero
      importación podría requerir dólares.

### Costos y plazos — esto NO está confirmado

Ningún dato de esta tabla viene de CardNet. Viene de un blog de una empresa que vende una
plataforma de e-commerce competidora, o sea, con interés en el tema. Sirve para no ir a la
reunión a ciegas; **no sirve para presupuestar**.

| Concepto | Cifra que circula | Confianza |
|----------|-------------------|-----------|
| Comisión por transacción | ~3,75 % – 4,25 % | BAJA |
| Depósito de los fondos | 48–72 horas hábiles | BAJA |
| Plazo de afiliación | 7–15 días hábiles | BAJA |
| Cuota mensual fija | no se menciona | — |

Fuente: <https://vendabo.com/blog/pasarelas-de-pago-republica-dominicana-ecommerce>
(consultado 2026-09-25).

Dos avisos sobre esto:

**El plazo de afiliación es el riesgo real del lanzamiento.** Si de verdad son 7 a 15 días
hábiles y encima hay una certificación técnica después, y el lanzamiento es el 30 de
septiembre, **el trámite tenía que estar empezado ya**. La decisión de "CardNet se
contrata de última" es correcta para el gasto, pero el papeleo no es el gasto: se puede
meter el expediente y pedir credenciales de QA sin que empiece a correr ninguna cuota. Lo
que se contrata de última es el interruptor, no el trámite.

**El proyecto asume una cuota mensual recurrente de CardNet.** No encontré esa cuota
documentada en ninguna parte, y para Azul un blog dice explícitamente que no hay costo
mensual fijo. No digo que no exista —es muy posible que sí, y que Victor lo sepa de
primera mano— digo que **no la pude verificar** y que conviene confirmar el número antes
de darlo por hecho en ningún cálculo.

---

## Alternativas y por qué no

### Azul (Banco Popular) — la única alternativa seria

Azul documenta tokenización con el nombre **DataVault** y documenta **Pagos
Recurrentes** como producto propio, además de 3-D Secure 2.0, página de pago con
redirección y enlaces de pago
[VERIFICADO — <https://dev.azul.com.do/>].

Sobre el papel es tan capaz como CardNet, y tiene dos ventajas: el logo de Azul lo
reconoce el comprador dominicano, y su portal de desarrolladores no está detrás de un
muro anti-bots. La comisión que circula es algo más alta (4 %–6 % frente a 3,75 %–4,25 %)
pero son cifras de blog, no de tarifario.

**Por qué no:** porque Victor ya eligió CardNet y porque no hay ninguna razón técnica que
obligue a cambiar. Integrar dos pasarelas antes de tener el primer cliente es trabajo
duplicado. Lo que sí recomiendo es **dejar la puerta abierta en el código** — la columna
`metodos_pago.procesador` ya existe justo para esto, y el diseño de abajo la respeta. Si
CardNet sale carísima o tarda meses en certificar, cambiar a Azul debería ser escribir un
módulo hermano, no reescribir el flujo de pago.

### PortalDom

Tercera pasarela local, sobre CyberSource. Se le atribuyen depósitos en 24 horas y mejor
gestión de fraude, y un plazo de afiliación más largo (10–20 días hábiles) [BAJA
confianza, misma fuente de blog]. No la investigué a fondo porque no aporta nada que
resuelva un problema que CardNet no resuelva.

### Stripe — no es una opción, y conviene decirlo sin rodeos

**República Dominicana no está en la lista de países soportados de Stripe**
[VERIFICADO — <https://stripe.com/global>]. En toda América Latina Stripe solo soporta
Brasil y México. Una empresa dominicana con RNC dominicano y cuenta en pesos **no puede
abrir una cuenta de Stripe**. Punto.

Lo que se encuentra buscando son guías para montar una LLC en Estados Unidos y abrir
Stripe a través de ella. Eso es un camino real que usa gente, y también es un camino que:
choca con los términos de servicio de Stripe si la operación real está en RD, crea
obligaciones fiscales en dos países, y **no encaja con este negocio en absoluto**, porque
el producto emite NCF de la DGII contra el RNC de Inversiones XZT. No se puede facturar
con NCF dominicano un cobro que entró por una entidad estadounidense sin meterse en un
problema fiscal que no tiene ninguna necesidad de existir.

Ojo con el matiz que sí es cierto: la restricción es sobre **dónde está el comercio**, no
sobre quién paga. Una tarjeta dominicana funciona en cualquier cobro de Stripe. Eso no nos
sirve de nada aquí, pero explica por qué hay gente confundida al respecto.

### PayPal

Se pueden recibir pagos, pero **retirar a una cuenta bancaria dominicana es el problema**
[MEDIA confianza — fuente de blog, no verificado contra PayPal]. Además de eso: PayPal no
es cómo paga un dealer de maquinaria en Santiago, sus comisiones sobre montos altos son
malas, y no resuelve el NCF. Como método secundario para un comprador extranjero
—escenario plausible en importación— podría tener sentido algún día. Para membresías
mensuales de dealers locales, no.

### tPago, Qik, Toke y las billeteras

tPago existe y funciona; hay más billeteras (Qik, Toke, Billet, las de los bancos)
[MEDIA confianza]. Azul integra tPago en su documentación. Ninguna de éstas es una
pasarela de e-commerce con tokenización y cobro recurrente, que es lo que hace falta.
Como método adicional de conveniencia, después de tener el cobro con tarjeta funcionando,
puede valer la pena. Como base del cobro de membresías, no.

### Transferencia bancaria manual

No es broma y no hay que descartarla: en RD mucho B2B se paga por transferencia y el
vendedor manda el comprobante por WhatsApp. **Es el plan de contingencia más barato que
existe** si CardNet no llega para el 30. Se necesita una pantalla de administración donde
Victor marque un pago como recibido, y el resto del sistema —cupos, NCF, correo— ya
funciona igual. Mencionarlo porque cuesta un día de trabajo y elimina la dependencia de
CardNet para poder lanzar.

---

## Implicaciones de PCI-DSS

La regla que ordena todo: **cada byte de número de tarjeta que toca nuestro servidor
multiplica el coste de cumplimiento.** No es una cuestión de reputación, es una cuestión
de qué cuestionario hay que rellenar y auditar cada año.

### Qué nos deja fuera de alcance

| Método | ¿Dónde se teclea la tarjeta? | Alcance |
|--------|------------------------------|---------|
| Botón de Pago, con pantalla (POST) | Página de CardNet | **Fuera** — SAQ A |
| Tokenización, iframe `PWCheckout` | Iframe servido por CardNet | **Fuera** — SAQ A / A-EP |
| Enlace de Pago | Sistema de CardNet | **Fuera** — SAQ A |
| Botón de Pago, sin pantalla (REST) | **Nuestro servidor** | **Dentro** — SAQ D |
| Botón de Pago, sin pantalla (SOAP) | **Nuestro servidor** | **Dentro** — SAQ D |
| API de Tokenización Directa | **Nuestro servidor** | **Dentro** — SAQ D |

La asignación concreta de SAQ es [INFERIDO]: la clasificación exacta la determina el
adquirente, y en un iframe puede ser A o A-EP según cómo se sirva la página que lo
contiene. La columna "dentro/fuera" no es inferencia: es un hecho que se sigue de si el
PAN pasa por nuestro proceso o no.

CardNet confirma que sus pantallas están certificadas: *"el tarjetahabiente digita los
datos de su plástico directamente en nuestro sistema certificado bajo el Estándar de
Seguridad de Datos para la Industria de Tarjeta de Pago (PCI)"*
[VERIFICADO — <https://www.cardnet.com.do/soluciones/online/enlace-de-pago>].

### La decisión

**Nunca se implementa "sin pantalla" (REST/SOAP) ni Tokenización Directa.** Esas tres
existen para comercios que ya tienen certificación PCI-DSS nivel comercio con auditoría
anual. Nosotros somos dos personas y un droplet de 512 MB. Que la documentación de CardNet
las ofrezca en el mismo menú, con el mismo tono, sin advertir de la diferencia de alcance,
es la trampa más cara que tiene este proyecto por delante. Una integración REST es más
fácil de escribir que un iframe. Y es la decisión equivocada.

Lo que confirma que esas rutas están fuera de límites, con los nombres de campo a la
vista [VERIFICADO, guía REST]: `card-number` (*"Número de tarjeta utilizada para realizar
el pago"*), `expiration-date`, `cvv`. Si nuestro código nombra esas variables, estamos
dentro del alcance de PCI.

### Reglas concretas para este código

1. **Nunca** una columna que pueda contener un PAN. `metodos_pago` ya está bien diseñada:
   `token`, `marca`, `ultimos4`, `vence_mes`, `vence_anio`. Los últimos 4 y la marca se
   pueden guardar; el número completo no, y el CVV no se puede guardar **nunca**, ni
   cifrado.
2. **Nunca** un PAN en un log. Ni en un `console.error` de diagnóstico, ni en un volcado
   de la respuesta de CardNet. La respuesta del botón de pago trae
   `CreditCardNumber: "555555______5557"` enmascarado, pero si algún día llega sin
   enmascarar, un `JSON.stringify` de la respuesta lo mete en el journal de systemd, que
   se respalda. Filtrar explícitamente antes de registrar cualquier cosa.
3. El `PrivateAccountKey` **solo** en el servidor, en `/etc/mercamaquinarias.env` con
   permisos 600, referenciado por nombre de variable de entorno. El `PublicAccountKey`
   puede ir al navegador — para eso es.
4. Los comprobantes en PDF no llevan datos de tarjeta más allá de marca y últimos cuatro.

---

## Diseño propuesto para este código

### El problema que hay que arreglar primero

Hoy el flujo de compra **da por cobrado lo que no se ha cobrado**. En
`tools/db.js:2147`, `anotarPago` tiene el estado escrito a mano en el SQL:

```
INSERT INTO pagos (...) VALUES (?, ?, ?, ?, ?, ?, 'aprobado', ?, ?, ?)
```

Y en `tools/api.js:1983`, `comprarMembresia` compone el cobro con
`procesador: 'demo'`. La secuencia actual es, en una sola petición HTTP:

`comprarCupos()` → inserta suscripción activa + pago `'aprobado'` → `emitirComprobanteDeCobro()` → **consume un NCF**.

Con CardNet eso no puede seguir así, y la razón es fiscal, no técnica: **un NCF emitido no
se borra ni se reescribe**. Si se emite antes de que el cobro confirme y el cobro se cae,
hay un comprobante fiscal de un ingreso que no entró, y la única salida es una nota de
crédito B04 por un error que no tenía por qué ocurrir. Con rechazos del 5 % al 10 %, eso
no es un caso raro: es el día a día.

La tabla ya prevé esto: el `CHECK` de `pagos.estado` acepta
`'aprobado'`, `'rechazado'`, `'pendiente'`, `'devuelto'`. Solo que nadie escribe
`'pendiente'`. Hay que partir el flujo en dos.

### Base de datos

Todo en **una migración nueva al final del array `MIGRACIONES` de `tools/db.js`**. Nunca
se toca una anterior: ya corrió en producción. Las tablas `metodos_pago`, `pagos` y
`suscripciones` **ya existen** y sirven; solo hay que añadirles columnas.

En `pagos`:

| Columna | Para qué |
|---------|----------|
| `idempotencia` | Nuestra clave única de cobro. Es lo que va en `Order` y `UniqueID` de CardNet. **Con índice `UNIQUE`.** |
| `procesador_id` | El `PurchaseID` que devuelve CardNet. |
| `autorizacion` | `AuthorizationCode` del emisor. |
| `codigo_respuesta` | `ResponseCode` (`00` = aprobada). El resto de los códigos están tabulados en la documentación y conviene guardarlos crudos. |
| `actualizado` | Cuándo cambió de estado. Hoy solo hay `creado`. |
| `intentos` | Cuántas veces se reintentó esta renovación. |

En `metodos_pago`: `procesador_cliente_id` (el `CustomerId` de CardNet),
`procesador_perfil_id` (`PaymentProfileId`), `activo` (el `Enabled=false` de la
activación pendiente), `fallos_seguidos`.

En `suscripciones`: `metodo_pago_id`, para saber con qué tarjeta se renueva. `proximo_cargo`
ya existe y hoy se guarda `NULL`; pasa a usarse.

Tabla nueva, `pagos_eventos`: cada notificación y cada consulta a CardNet, con su cuerpo
crudo y el instante. Sirve para dos cosas que valen su peso en oro cuando hay una
discusión: reconstruir qué pasó, y detectar notificaciones repetidas. **El cuerpo crudo se
guarda con los campos de tarjeta filtrados** (ver reglas de PCI).

Una nota sobre las unidades, que es la trampa silenciosa de esta integración: los importes
de este proyecto están en **pesos enteros** (`planes.precio = 2000` es RD$2.000, un equipo
a `8750000` es RD$8,75 millones). CardNet espera **centavos**: *"siempre expresados con la
parte entera más 2 decimales sin signos de puntuación"*, con la tabla de ejemplos
`100 → 10000` [VERIFICADO]. Hay que multiplicar por 100 al salir y dividir al entrar, en
**una sola función** que haga la conversión y en ningún otro sitio. Si esa multiplicación
se escribe dos veces, un día se cobra cien veces de más o de menos.

### Módulo nuevo: `tools/cardnet.js`

Un solo módulo, al estilo de `tools/correo.js` y `tools/chat.js`: `https.request` a mano,
cero dependencias. Responsabilidad única: **hablar con CardNet**. No sabe de cupos, no
sabe de NCF, no abre la base de datos.

Lo que expone:

- `ACTIVO` — el interruptor. `false` mientras no haya credenciales.
- `crearCliente(datos)`, `verCliente(id)` — sobre `/v1/api/customer`.
- `cobrar({ testigo, referencia, subtotal, itbis, total, concepto })` — sobre
  `/v1/api/purchase`, con `UniqueID` = `referencia`.
- `consultarCompra(purchaseId)`.
- `devolver(purchaseId)`.
- `activarPerfil({ clienteId, testigo, codigo })`.
- `borrarPerfil({ clienteId, perfilId })`.
- `normalizar(respuesta)` — convierte la respuesta de CardNet en
  `{ estado, referencia, autorizacion, codigo, procesadorId }`. Que el resto del sistema
  no sepa nunca cómo se llaman los campos de CardNet es lo que permite meter Azul mañana
  escribiendo un módulo hermano.

Variables de entorno, siguiendo la convención `MERCA_` y documentadas en `.env.example`
sin un solo valor real:

```
MERCA_CARDNET            apagado | lab | produccion
MERCA_CARDNET_URL        url base
MERCA_CARDNET_LLAVE_PUB  PublicAccountKey  (va al navegador)
MERCA_CARDNET_LLAVE_PRIV PrivateAccountKey (solo servidor)
MERCA_CARDNET_COMERCIO   MerchantNumber
MERCA_CARDNET_TERMINAL   MerchantTerminal
MERCA_CARDNET_NOMBRE     MerchantName, con el formato de 40 caracteres que dicte CardNet
```

Con `MERCA_CARDNET=apagado`, `ACTIVO` es `false` y el sistema se comporta exactamente
como hoy, con `procesador: 'demo'`. Es el mismo patrón que ya funcionó dos veces con el
SMS de Brevo y la clave de Anthropic: **se entrega entero y apagado**.

**Aviso sobre las claves de QA:** la documentación pública de CardNet publica un
`PrivateAccountKey` y un `PublicAccountKey` del ambiente de certificación, a la vista de
cualquiera. No los reproduzco aquí y **no deben acabar en el repositorio ni en
`.env.example`**, aunque sean de pruebas y aunque estén publicados. Van en el `.env`
local, que está en `.gitignore`. Una clave escrita en un repositorio es una clave
filtrada, no importa de qué ambiente sea.

### Rutas

En el array plano `RUTAS` de `tools/api.js` (línea 2553), junto a las de membresías que ya
están en las líneas 2601–2603. La regla del proyecto es que **la ruta más específica va
antes que la genérica**, y aquí importa de verdad: `/api/pagos/cardnet/notificacion`
tiene que ir antes de cualquier patrón `\/api\/pagos\/([\w-]+)`, o el webhook acabará en
el manejador equivocado.

```
['POST',   /^\/api\/pagos\/cardnet\/notificacion$/, notificacionCardnet],
['POST',   /^\/api\/pagos\/intencion$/,             crearIntencion],
['POST',   /^\/api\/pagos\/([\w-]+)\/confirmar$/,   confirmarPago],
['GET',    /^\/api\/pagos\/([\w-]+)$/,              verPago],
['GET',    /^\/api\/metodos-pago$/,                 misMetodosPago],
['POST',   /^\/api\/metodos-pago$/,                 registrarMetodoPago],
['POST',   /^\/api\/metodos-pago\/([\w-]+)\/activar$/, activarMetodoPago],
['DELETE', /^\/api\/metodos-pago\/([\w-]+)$/,       borrarMetodoPago],
```

`notificacionCardnet` es la única que **no** va envuelta en `conSesion`: la llama CardNet,
no un navegador con sesión. Se autentica con la `PrivateAccountKey` que CardNet manda en
cabecera Basic, comparada con `crypto.timingSafeEqual` — nunca con `===`, que filtra por
tiempo. Y **no se le pone limitador por IP**: CardNet reintenta cuando algo falla, y
estrangular los reintentos convierte un fallo transitorio en un pago perdido.

Buena noticia para el webhook: no hay comprobación de origen ni de CSRF en `tools/api.js`,
así que nada lo va a bloquear. Mala noticia, aparte: que no haya comprobación de CSRF es
un problema propio que este trabajo no crea pero al que conviene no añadir superficie.

### Cómo cambia `comprarMembresia`

Se parte en dos peticiones. `comprarMembresia` (`tools/api.js:1963`) conserva **todo** lo
que ya hace bien y que costó escribir: la comprobación de aceptación de legales, el límite
de `CUPO_MAXIMO`, la exención comprobada contra la base y no contra `ctx`, y sobre todo
**la validación de RNC y razón social antes de cobrar**. Ese comentario del código ya dice
exactamente por qué —*"descubrir que el RNC está mal después de haber cobrado obliga a
emitir una nota de crédito por un error de tecleo"*— y con CardNet vale el doble.

Lo que cambia es el final:

**Paso 1 — `POST /api/pagos/intencion`.** Valida igual que hoy, calcula el cobro con
`precios.precioCompra`, y en lugar de otorgar la suscripción:

- inserta una fila en `pagos` con estado `'pendiente'`, `procesador: 'cardnet'` e
  `idempotencia` = la referencia que ya genera `referenciaCobro()`;
- guarda la intención (plan, cupo, días, datos fiscales) para poder ejecutarla cuando el
  pago confirme;
- devuelve al navegador lo necesario para abrir el iframe: `CaptureURL`, `UniqueID` y la
  clave pública.

Sin cupos, sin NCF. Nada irreversible ha ocurrido.

Si `esExenta(ctx.usuario.id)` o el total es cero, **no se llama a CardNet en absoluto**:
se ejecuta el camino de hoy tal cual. Una cuenta exenta no debe depender de que la pasarela
esté arriba.

**Paso 2 — `POST /api/pagos/:id/confirmar`.** Recibe el testigo del navegador y:

1. Vuelve a leer la fila de `pagos`. Si ya no está `'pendiente'`, devuelve el resultado
   que ya tiene y **no cobra otra vez**. Ésta es la primera barrera de idempotencia, y es
   la que salva el doble clic.
2. Llama a `cardnet.cobrar()` con `UniqueID` = `idempotencia`. Si la red se cae a mitad,
   reintentar con el mismo `UniqueID` es seguro: la propia documentación lo garantiza —
   *"se puede reintentar la operación con la tranquilidad de que en caso de que la
   plataforma ya la haya procesado, va a contestar el resultado que ya fue obtenido del
   medio de pago, sin duplicar la transacción"* [VERIFICADO].
3. Según lo que vuelva:
   - **`Approved`** → una única transacción SQLite que pasa el pago a `'aprobado'`, anota
     `autorizacion` y `procesador_id`, y otorga los cupos. Después, y solo después, se
     llama a `emitirComprobanteDeCobro()`.
   - **`Rejected`** → el pago pasa a `'rechazado'`, se guarda el `ResponseCode`, **no se
     emite nada**, y se le dice al anunciante qué pasó con el texto de la tabla de códigos
     de CardNet. `51` es "fondos insuficientes" y `54` "tarjeta vencida": son dos mensajes
     distintos y el cliente sabe qué hacer con cada uno. "Error al procesar el pago" no
     le sirve de nada.
   - **`Pending`** → se queda `'pendiente'`. El resultado llegará por webhook o por la
     tarea de reconciliación. Hay un objeto `CommerceAction` con `ActionType: 1
     (Redirect)` para los casos donde el cliente tiene que ir a otro sitio a terminar
     [VERIFICADO].

### Cómo cuadra con la facturación

Y aquí está la parte buena: **la facturación ya está bien hecha y casi no hay que
tocarla.** Las tres piezas que hacían falta ya existen.

`facturas.emitirPorPago()` (`tools/facturas.js:520`) abre con esto:

```
const yaEsta = db.facturaDePago(pago.id);
if (yaEsta) return yaEsta;                    // no se emite dos veces
```

Es idempotente por diseño. Si el webhook llega dos veces —y va a llegar dos veces, porque
CardNet reintenta todo lo que no responde `200`— **no se consume un segundo NCF**. Eso ya
está resuelto. No hay que añadir nada.

`emitirComprobanteDeCobro()` (`tools/api.js:1902`) ya localiza el pago por
`db.pagoPorReferencia(cobro.referencia)`, ya separa emitir de enviar por correo, y ya
tiene escrito en un comentario por qué nunca lanza: *"que no se pueda emitir NO revierte
un cobro que ya entró"*. Con una pasarela real eso pasa de ser prudente a ser
imprescindible.

Y el PDF ya va aparte a propósito, con `regenerarPdfsPendientes` recogiendo lo que quedó
sin papel, *"porque el NCF ya consumido se quedaría sin factura y la DGII vería un salto
en la secuencia que hay que justificar por escrito"*.

Así que la regla queda de una línea: **`emitirComprobanteDeCobro` se llama en un único
sitio nuevo — la transición de `'pendiente'` a `'aprobado'` — y en ningún otro.** Esa
transición ocurre en dos caminos (confirmación síncrona y webhook), y los dos tienen que
llamar a **la misma función**, no a dos copias. El comentario que ya está en el código
explica exactamente qué pasa cuando eso se duplica: comprar cupos emitía comprobante y
ampliarlos no, y era *"ingreso cobrado y no declarado, invisible hasta una inspección"*.
La misma clase de error, en el mismo sitio, otra vez.

**El detalle fiscal que hay que ver antes de escribirlo.** El objeto `DataDo` de CardNet
—obligatorio para República Dominicana— es así [VERIFICADO]:

```
Invoice (String) [Mandatorio] - Número de factura asociado a la venta.
Tax (Amount) [Opcional]      - Monto de impuestos pagados.
```

`Invoice` es **obligatorio y va en la petición de cobro**. Pero nuestro NCF no existe
todavía en ese momento: se emite después, cuando el pago confirma. Es una contradicción
aparente, y la salida es no confundir los dos números: en `Invoice` va **nuestra
referencia interna de cobro** (`pagos.idempotencia`), que es un identificador de la orden,
no un comprobante fiscal. El NCF se emite después y se guarda de nuestro lado.

- **[PREGUNTAR]** Confirmar con CardNet que `DataDo.Invoice` es un número de orden del
  comercio y **no** tiene que ser el NCF de la DGII. Si resultara que sí exigen el NCF ahí,
  todo este diseño cambia y habría que reservar el NCF antes de cobrar, que es justo lo que
  las reglas fiscales del proyecto prohíben. Es la pregunta de mayor impacto de toda la
  lista.

En `DataDo.Tax` va el ITBIS, que ya viene calculado en `cobro.itbis` por
`precios.desglose()`. Convertido a centavos.

### La tarea de reconciliación

En `tools/tareas.js`, junto a `caducar()`, `reenviarComprobantes()` y las demás. Diaria no
basta para los pagos: conviene un temporizador de systemd propio cada 10 o 15 minutos.

1. **Pagos pendientes con edad.** Cualquier fila `'pendiente'` de más de N minutos se
   consulta contra CardNet con `GET /v1/api/purchase/{PurchaseID}`. Si resulta aprobada, se
   ejecuta la misma transición que el webhook. Esto es lo que hace que un webhook perdido
   no sea un cliente que pagó y no recibió nada. **Ninguna integración de pago debe
   depender solo del webhook**, y menos una que corre en un droplet de 512 MB que se
   reinicia al desplegar.
2. **Renovaciones.** Suscripciones con `proximo_cargo` vencido y un `metodo_pago_id`
   activo: crear el pago `'pendiente'` con una `idempotencia` nueva y cobrar el testigo
   `CT__`. Igual que el paso 2, sin navegador.
3. **Reintentos escalonados.** Un rechazo no cancela la membresía. Reintentar al día
   siguiente, a los tres días, a los siete; avisar por correo cada vez, y solo entonces
   pasar la suscripción a `'impaga'` — estado que el `CHECK` de `suscripciones` ya
   contempla. Un número acotado de reintentos: las redes de tarjetas penalizan reintentar
   la misma tarjeta rechazada sin límite.
4. **Aviso de tarjeta por vencer.** `metodos_pago` ya tiene `vence_mes` y `vence_anio`.
   Un correo antes de que caduque salva la renovación. Ya existe `MERCA_DIAS_AVISO` y ya
   hay un patrón de avisos en `avisarPorVencer()`.

Y una regla operativa: **un pago aprobado en CardNet sin fila `'aprobado'` de nuestro lado
tiene que ser ruidoso**. El informe semanal a gerencia ya existe (`componerInforme`), y
ese descuadre es exactamente lo que tiene que aparecer en él.

### Pruebas

El proyecto tiene tres estilos de prueba a propósito y no se unifican. Esto va en el
segundo: arnés propio con contadores y `process.exit`, al estilo de
`tools/probar-facturas.js` y `tools/seguridad:probar`. Un `tools/probar-pagos.js` nuevo,
con `tools/cardnet.js` sustituido por un doble que devuelve respuestas fijas: **no se toca
la red en las pruebas.**

Lo que hay que demostrar, porque cada una de estas es un fallo que costaría dinero real:

- [ ] Un pago rechazado **no** consume NCF y **no** otorga cupos.
- [ ] La misma notificación entregada dos veces emite **un** comprobante y consume **un**
      NCF.
- [ ] Confirmar dos veces el mismo pago cobra **una** vez.
- [ ] Un pago aprobado cuya emisión de factura falla deja el pago aprobado, los cupos
      otorgados, y la factura en la lista de pendientes de regularizar.
- [ ] `pendientesDeRegularizar()` encuentra el pago aprobado sin comprobante.
- [ ] Una renovación rechazada no cancela la suscripción al primer intento.
- [ ] Una cuenta exenta compra sin que se llame a CardNet ni una vez.
- [ ] Con `MERCA_CARDNET=apagado`, el flujo se comporta igual que hoy.
- [ ] La conversión a centavos: RD$2.000 sale como `200000` y no como `2000`.

Recordatorio del `CLAUDE.md` que aplica aquí de lleno: en las pruebas con arnés, las
variables de entorno se fijan **antes** del `require` de `tools/db.js`. Si se hacen
después, la prueba corre contra la base equivocada — y una prueba de pagos corriendo
contra la base de desarrollo real es de las cosas peores que pueden pasar.

---

## Riesgos y trampas

Ordenados por lo que costaría arreglarlos tarde.

### 1. El NCF emitido antes de que el cobro confirme

**Irreversible.** Un comprobante emitido no se borra ni se reescribe; la única salida es
una nota de crédito B04. Con el flujo actual —pago `'aprobado'` escrito a mano en el SQL
de `anotarPago`, factura emitida en la misma petición— **cada rechazo de tarjeta produce un
NCF que hay que anular**. Con un 5 %–10 % de rechazos, eso es rutina, no excepción.
Partir el flujo en `'pendiente'` → `'aprobado'` no es una mejora opcional: es lo primero.

### 2. Elegir la integración REST porque es más fácil

Escribir un `POST` con `card-number`, `expiration-date` y `cvv` es más rápido que montar un
iframe con eventos y reconsultas. Y mete el proyecto **entero** dentro del alcance de
PCI-DSS SAQ D. La documentación de CardNet ofrece las seis integraciones en el mismo menú,
con el mismo tono, sin advertir de la diferencia. Es la trampa más cara del proyecto.
Regla dura: **si el código nombra una variable `cvv`, está mal.**

### 3. Confiar en la redirección a `ReturnUrl`

Aplica al Botón de Pago. `ReturnUrl` es la página a la que el navegador del cliente vuelve
si la transacción se aprobó. **Eso es el navegador diciéndonos que pagó, no CardNet.**
Cualquiera puede abrir esa URL a mano. El resultado se establece únicamente con la
consulta servidor a servidor `GET /sessions/{SESSION}?sk=...`. Y la sesión **caduca a los
30 minutos**: pasado ese rato la consulta devuelve `404 "Session not found"` y no hay forma
de saber qué pasó. Si se usa este camino, la consulta se hace inmediatamente y se persiste
el resultado antes de responderle al navegador.

### 4. El recurrente no habilitado en el afiliado

`Ecommerce_COF` y `MOTO_Recurring` son configuración del afiliado, y CardNet dice
explícitamente que *"se debe informar el caso de uso al momento de solicitar los datos de
afiliación"*. Si nadie lo pide, el código estará perfecto y las renovaciones se
rechazarán, con un código de error genérico y varios días perdidos averiguando por qué.
**Pedirlo por escrito el día de la afiliación.**

### 5. Diseñar contra los campos "Reservado"

`Customer.Plans` y `Purchase.PlanID` están marcados `Reservado` y no hay ninguna ruta de
suscripciones documentada, pero la sección de autenticación de la misma guía habla de
*"crear o eliminar planes de suscripción"*. Es fácil leer esa frase y asumir que CardNet
gestiona las suscripciones. **No se construye contra un campo reservado.** El calendario
de cobros es nuestro.

### 6. Las unidades del importe

Este proyecto guarda **pesos enteros**; CardNet espera **centavos**. Un factor de 100 en un
importe es el tipo de error que no rompe nada en desarrollo, donde todo cuesta RD$2.000,
y que en producción cobra RD$20 o RD$200.000. Una sola función de conversión, en un solo
sitio, con prueba propia.

### 7. La activación del perfil de pago

Un `PaymentProfile` recién capturado **puede venir `Enabled=false`** y necesitar un código
de activación que el cliente recibe por un canal que la documentación deja fuera de su
alcance. Hay un error dedicado, `CS012 PROFILE_MUST_BE_ACTIVATED_FIRST`. Si esto aplica
siempre, el primer cobro tiene un paso más que el que se dibujó, y hay que diseñar la
pantalla. **Hay que averiguarlo antes de maquetar el flujo, no después.**

### 8. Los límites de longitud que hay que respetar

Del Botón de Pago [VERIFICADO]: `TransactionId` es de **6 caracteres** y la documentación
insiste — *"Se debe respetar la longitud del campo"*. `OrdenID` admite **20** como máximo.
`MerchantName` son **40** con una estructura interna de bytes fija. Los identificadores de
este proyecto son mucho más largos que 6 caracteres. Hace falta un contador corto y
propio, no reutilizar un `id()`. Un truncamiento silencioso aquí produce dos transacciones
distintas con el mismo identificador, y descubrirlo en la conciliación del mes es tarde.

### 9. El webhook perdido

Un droplet de 512 MB que se reinicia en cada despliegue va a perder notificaciones. Si el
otorgamiento de cupos depende solo del webhook, habrá clientes que pagaron y no recibieron
nada. **La tarea de reconciliación no es un extra: es la red.** Consultar los pendientes
cada 10–15 minutos.

Y el corolario: el webhook tiene que responder `200` **solo** cuando el procesamiento
terminó. Si responde `200` y luego falla, CardNet no lo reintenta y se pierde
definitivamente. Si responde otra cosa, lo reintenta. Elegir bien de qué lado equivocarse.

### 10. El plazo de afiliación contra la fecha de lanzamiento

Lo que circula son 7–15 días hábiles de afiliación **más** una certificación técnica de
CardNet, con lanzamiento el 30 de septiembre. La estrategia de contratar de última es
correcta para el gasto, pero **el trámite no es el gasto**. Meter el expediente y pedir
credenciales de QA ahora permite construir y certificar mientras el contrato espera. Si el
trámite empieza cuando todo lo demás esté listo, la fecha se va sola.

### 11. Las claves de QA publicadas

La documentación de CardNet publica claves de certificación a la vista. Es tentador
pegarlas en un archivo del repositorio "porque son de pruebas". Una clave en un
repositorio es una clave filtrada. Van en el `.env` local, que está en `.gitignore`, y
`.env.example` lleva solo el nombre de la variable y su explicación, como todo lo demás en
este proyecto.

### 12. Fusionar a `main` despliega a producción

No hay barrera de pruebas en CI todavía y hay otra persona trabajando en el repositorio.
Esto vale para todo el proyecto, pero para el cobro vale el doble: un despliegue a medias
del flujo de pago es un cobro a medias. Rama y Pull Request siempre, el interruptor
`MERCA_CARDNET=apagado` hasta que esté certificado, y a ser posible la barrera de CI —que
ya está en la Fase 1— **antes** de que esto entre.

---

## Resumen de lo que hay que preguntarle a CardNet

Una sola lista, para llevarla a la reunión.

**De la afiliación:**

1. Comisión por transacción, cuota mensual fija, costo de alta, mínimo mensual y costo de
   contracargo. Por escrito.
2. Plazo real de afiliación y plazo de la certificación técnica.
3. Plazo de liquidación a la cuenta y hora del cierre (por defecto 7:00 PM).
4. Monedas habilitadas.

**De la habilitación técnica:**

5. Habilitar `Ecommerce_COF` y `MOTO_Recurring` para este afiliado.
6. Credenciales de certificación (QA) desde ya, para poder construir.
7. `PublicAccountKey` y `PrivateAccountKey` de la plataforma de tokenización.
8. `MerchantNumber`, `MerchantTerminal`, `AcquiringInstitutionCode`, `MerchantType`.
9. El `MerchantName` exacto con su formato de 40 caracteres.
10. Registrar la URL del webhook en sus sistemas.

**De cómo funciona, que la documentación no aclara:**

11. ¿`DataDo.Invoice` es el número de orden del comercio o tiene que ser el NCF de la
    DGII? **La más importante de la lista.**
12. ¿Los campos `Plans` y `PlanID` siguen reservados, o hay suscripciones nativas
    documentadas en algún sitio?
13. ¿La activación del `PaymentProfile` (`Enabled=false` + `ActivationCode`) aplica
    siempre? ¿Quién entrega el código y por dónde?
14. ¿Hay actualización automática de credenciales (Visa Account Updater / Mastercard ABU)
    cuando la tarjeta del cliente vence?
15. ¿Cuántos reintentos de una renovación rechazada permite el contrato?
16. ¿Se puede validar una tarjeta sin cobrarla en Card on File (el equivalente de `ASI`)?
17. ¿Se puede preautorizar con `Capture: false` en Card on File? La tabla de medios de
    pago dice preautorización = No para Visa, MasterCard y Amex.
18. ¿Cuál es el tiempo de vida de un token `CT__`? No aparece documentado. ¿Caduca por
    inactividad?

---

## Fuentes

Documentación técnica de CardNet, leída con puppeteer el 2026-09-25 (el sitio bloquea las
descargas normales):

- <https://developers.cardnet.com.do/> — portal de desarrolladores
- <https://developers.cardnet.com.do/guias/boton-de-pago/> — las tres opciones de
  integración
- <https://developers.cardnet.com.do/guias/boton-de-pago/web-con-pantalla-post-3ds.html> —
  flujo con pantalla, parámetros, URL de QA y producción, tabla de códigos de respuesta
- <https://developers.cardnet.com.do/guias/boton-de-pago/web-sin-pantalla-rest.html> —
  plataforma Ztrans, valores de `environment`, `idempotency-key`, campos de tarjeta en
  claro
- <https://developers.cardnet.com.do/guias/tokenizacion-autenticacion/> — Card on File,
  objetos `Customer` / `PaymentProfile` / `Purchase` / `Notification`, webhook, códigos de
  error, datos de ambientes

Páginas comerciales de CardNet:

- <https://www.cardnet.com.do/afiliate/empresarial/> — requisitos documentales de
  afiliación (**única fuente autorizada de esa lista**)
- <https://www.cardnet.com.do/soluciones/online/enlace-de-pago>
- <https://www.cardnet.com.do/soluciones/online/boton-de-pago>

Alternativas:

- <https://stripe.com/global> — lista oficial de países soportados; RD no está
- <https://dev.azul.com.do/> — DataVault y Pagos Recurrentes de Azul

Terceros, **confianza baja**, interés comercial en el tema:

- <https://vendabo.com/blog/pasarelas-de-pago-republica-dominicana-ecommerce> — comisiones,
  plazos de liquidación y plazos de afiliación

---

*Investigado el 2026-09-25. Lo marcado [PREGUNTAR] no se pudo verificar en ninguna fuente
pública y hay que resolverlo con CardNet antes de escribir el código que dependa de ello.*
