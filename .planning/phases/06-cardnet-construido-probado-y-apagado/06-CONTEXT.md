# Phase 6: CardNet construido, probado y apagado - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning
**Source:** plan-phase --auto, sin discusión con Victor. Las decisiones técnicas y
reversibles las toma el planificador según `CLAUDE.md`, `.planning/PROJECT.md`,
`.planning/STATE.md` y `.planning/research/cardnet.md`; lo que solo Victor puede dar
va en «Preguntas abiertas».

<domain>
## Phase Boundary

Que el día de la afiliación sea encender y no construir. La fase entrega, apagada
tras `MERCA_CARDNET`:

- el cliente de la API de Tokenización de CardNet (`tools/cardnet.js`), a mano sobre
  `https` y sin paquetes;
- la tarjeta capturada en un iframe servido por CardNet: número, vencimiento y código
  de seguridad nunca pasan por nuestro servidor (PCI, frontera dura);
- el cobro con `POST /v1/api/purchase`, para el primer pago y para las renovaciones;
- la notificación de CardNet autenticada y la reconciliación periódica, que completan
  la transición única de la fase 3 cuando el navegador o el aviso se pierden;
- el cobro recurrente (renovación de membresías con tarjeta guardada) con reintentos
  acotados;
- el descuadre pasarela/base en el informe a gerencia.

Fuera: devoluciones con nota de crédito B04 desde pantalla, suscripciones nativas
de CardNet (`PlanID` está «Reservado»), Botón de Pago y Enlace de Pago, cualquier
modo «sin pantalla».

</domain>

<decisions>
## Implementation Decisions

### Interruptor y configuración
- **D-01 · Interruptor.** `MERCA_CARDNET` = `apagado` (por defecto, y también si está
  vacía o trae cualquier otro valor) | `lab` | `produccion`. Encendido solo si además
  `MERCA_CARDNET_LLAVE_PUB` y `MERCA_CARDNET_LLAVE_PRIV` están presentes. Se lee en
  cada llamada, no al cargar el módulo (mismo criterio que `tools/transferencia.js`),
  para que la prueba encienda y apague en la misma ejecución.
- **D-02 · URL base.** Constantes verificadas en `cardnet.md`:
  lab `https://labservicios.cardnet.com.do/servicios/tokens/`,
  producción `https://servicios.cardnet.com.do/servicios/tokens/`.
  `MERCA_CARDNET_URL` la sustituye solo si empieza por `https://`. No se añaden
  variables de Botón de Pago (`MerchantNumber`, `MerchantTerminal`, `MerchantName`):
  la API de Tokenización no las usa en ningún cuerpo documentado. Si CardNet las exige
  al certificar, se añaden entonces.
- **D-03 · Claves.** Ninguna clave en el repositorio, ni las de QA que CardNet publica
  en su documentación. `.env.example` lleva los nombres vacíos. En el VPS van en
  `/etc/mercamaquinarias.env` (600). La llave pública puede ir al navegador; la privada
  jamás sale del servidor ni de un registro.

### El módulo
- **D-04 · `tools/cardnet.js` solo habla con CardNet.** No abre la base, no sabe de
  cupos ni de NCF. Expone: `modo()`, `activo()`, `faltantes()`, `urlBase()`,
  `origenCaptura()`, `aCentavos()`, `normalizar()`, `limpiar()`, `crearCliente()`,
  `verCliente()`, `cobrar()`, `consultarCompra()`, `devolver()`, `activarPerfil()`,
  `borrarPerfil()`, `mensajeDeRechazo()` y la costura `_transporte` que las pruebas
  sustituyen. HTTP Basic con la llave privada como usuario y contraseña vacía,
  `timeout` de 20 s, JSON.
- **D-05 · Centavos en un solo sitio.** `aCentavos(pesos)` es la única multiplicación
  por 100 del proyecto hacia CardNet: exige entero ≥ 0 y lanza si no. `Amount` =
  `aCentavos(pago.total)`, `DataDo.Tax` = `aCentavos(pago.itbis)`, `Currency: 'DOP'`.
  RD$2.000 sale como `200000`. Una prueba falla si aparece otra multiplicación o
  división por 100 en `tools/cardnet.js` o `tools/pagos.js`.
- **D-06 · Qué va en `Order`, `UniqueID` y `DataDo.Invoice`.** Los tres llevan
  `pagos.referencia` (la referencia de orden `TE-AAAA-XXXXXX` que ya genera
  `referenciaCobro()`), nunca el NCF. Se arma en una sola función
  (`cuerpoCompra(pago, token)`), para que si CardNet respondiera que `Invoice` tiene que
  ser el NCF el cambio y su discusión estén en un punto. Esa respuesta cambiaría el
  diseño entero (reservar NCF antes de cobrar está prohibido), así que no se construye
  ninguna alternativa especulativa.
- **D-07 · Normalizar sin aprobar por duda.** `normalizar(respuesta)` devuelve
  `{ resultado: 'aprobado'|'rechazado'|'pendiente', codigo, autorizacion, procesadorId,
  referencia, motivo }`. Solo es `aprobado` con estado de aprobación explícito
  (`Status` aprobado o `ResponseCode` `'00'`); rechazado con estado de rechazo
  explícito; cualquier otra cosa, incluida una respuesta que no se entiende, es
  `pendiente`, que resolverá la reconciliación. `mensajeDeRechazo(codigo)` traduce los
  códigos tabulados (51 fondos insuficientes, 54 tarjeta vencida, etc.) a un texto que
  diga al anunciante qué hacer; un código desconocido da un texto genérico que dice lo
  que NO pasó (sin cupos, sin comprobante).

### PCI
- **D-08 · Frontera dura.** Ningún archivo de código nombra campos de tarjeta en claro.
  Una prueba recorre `tools/`, `assets/`, `db/`, `deploy/` y los `.html` de la raíz y
  falla si encuentra el nombre del código de seguridad, `card-number`,
  `expiration-date`, `numero_tarjeta` o `cardnumber` (sin distinguir mayúsculas). La
  propia prueba arma los patrones sin escribirlos literalmente. `.planning/` es
  documentación y queda fuera.
- **D-09 · Nada crudo a los registros.** `cardnet.limpiar(obj)` devuelve una copia sin
  las claves que parezcan de tarjeta ni los tokens (salvo marca y últimos cuatro) y enmascarando
  cualquier secuencia de 13 a 19 dígitos. Todo lo que se guarda en `pagos_eventos` y
  todo `console.error` que mencione CardNet pasa por ahí; nunca un `JSON.stringify` de
  una respuesta cruda.
- **D-10 · La tarjeta se captura en el iframe de CardNet, sin su script en nuestra
  página.** El navegador abre `{CaptureURL}?key={llave pública}&session_id={UniqueID}`
  en un `<iframe>` propio; no se carga `PWCheckout.js` en nuestro origen (así
  `script-src` sigue siendo `'self'`). El aviso de «terminé» llega por `postMessage`
  desde el origen de CardNet (se acepta cualquier mensaje de ese origen como señal) o
  por un botón «Ya ingresé mi tarjeta». En los dos casos el navegador solo avisa: el
  servidor lee el `Customer` en CardNet y toma de ahí el perfil y su token. Un token
  mandado por el navegador se ignora.
- **D-11 · CSP condicionada.** Con CardNet apagado la cabecera
  `Content-Security-Policy` es byte a byte la de hoy. Encendido, solo se añade
  `frame-src` con el origen de la URL base. Nada más cambia.

### Datos
- **D-12 · Una migración, al final.** `2026-10-cardnet`, AL FINAL de `MIGRACIONES`
  (detrás de lo que haya añadido la fase 5), y su reflejo en `db/schema.sql`:
  - `pagos`: `procesador_id`, `autorizacion`, `codigo_respuesta`, `motivo`,
    `intentos INTEGER NOT NULL DEFAULT 0`; índice único parcial
    `ux_pagos_cardnet_referencia ON pagos (referencia) WHERE procesador = 'cardnet'`
    (parcial para que no falle sobre referencias antiguas repetidas en producción);
  - `metodos_pago`: `procesador_cliente_id`, `procesador_perfil_id`,
    `activo INTEGER NOT NULL DEFAULT 1`, `fallos_seguidos INTEGER NOT NULL DEFAULT 0`,
    `borrado TEXT`, `aviso_vencimiento TEXT` (el mes `AAAA-MM` del último aviso de D-30);
  - `suscripciones`: `metodo_pago_id`, `renovacion_automatica INTEGER NOT NULL DEFAULT 0`,
    `renovacion_aceptada TEXT`, `renovacion_intentos INTEGER NOT NULL DEFAULT 0`,
    `renovacion_proxima TEXT`, `renovacion_avisada TEXT` (el `fin` del ciclo ya avisado);
  - tabla `clientes_procesador (organizacion_id, procesador, cliente_id, creado,
    PRIMARY KEY (organizacion_id, procesador))`;
  - tabla `pagos_eventos (id INTEGER PK AUTOINCREMENT, pago_id, procesador, origen,
    tipo, cuerpo, creado)` de solo añadir, con los dos disparadores de la bitácora
    (`RAISE(ABORT, ...)` en UPDATE y DELETE).
- **D-13 · Todo el SQL en `tools/db.js`.** Ninguna consulta en `pagos.js`, `api.js` ni
  `tareas.js`.

### El cobro
- **D-14 · Quién elige: el servidor.** `metodosDeCobro()` = `['cardnet']` si CardNet
  está activo, más `'transferencia'` si la fase 5 la tiene encendida; si ninguno,
  `['demo']` como hoy. `demo` nunca convive con un procesador real.
- **D-15 · Un procesador más en `PROCESADORES`.** `PROCESADORES.cardnet(pago)`: si el
  pago tiene `metodo_pago_id` de una tarjeta activa de su organización, cobra con
  `cardnet.cobrar` y devuelve lo normalizado; si no la tiene, responde `pendiente`
  (falta capturar la tarjeta). `cobrar` sigue siendo el único camino; su resolución se
  extrae a `pagos.resolver(pago, respuesta)`, que usan también la notificación y la
  reconciliación. `confirmarPago` sigue siendo la única transición a aprobado.
- **D-16 · El rechazo se guarda.** `rechazarPago(id, { motivo, codigo })` anota
  `codigo_respuesta` y `motivo` en la fila (cierra el pendiente anotado en la fase 3).
  Un rechazo no emite nada ni consume NCF.
- **D-17 · Compra con tarjeta nueva, en dos pasos, sin rutas de intención nuevas.**
  `POST /api/membresias` (y `/ampliar`) con el procesador `cardnet` anota el pago
  pendiente como hoy y, si no hay tarjeta elegida, responde 202 con
  `cardnet: { urlCaptura, origen }` (la URL ya lleva llave pública y `UniqueID`). Toda
  la validación de hoy (legales, RNC antes de cobrar, `CUPO_MAXIMO`, exención contra la
  base) no se toca. Paso 2: `POST /api/pagos/:id/confirmar` (sesión, pago de su
  organización, `cardnet`, `pendiente`): lee el `Customer`, registra el perfil nuevo en
  `metodos_pago` (token, marca, últimos cuatro, vencimiento; nunca otra cosa), lo
  enlaza al pago y llama `pagos.cobrar`. Si el pago ya no está pendiente, devuelve lo
  que tiene sin cobrar otra vez.
- **D-18 · Compra con tarjeta guardada.** `metodoPago: <id>` en el cuerpo de la compra
  o la ampliación enlaza la tarjeta (de su organización, activa, no borrada) y el cobro
  sale en la misma petición: 201, 402 o 202, como hoy.
- **D-19 · Doble clic.** Un `Set` en memoria de pagos en curso: una segunda
  confirmación del mismo pago mientras la primera espera a CardNet responde 409
  «Ese pago ya se está procesando». Si aun así se cruzan (dos procesos), el `UniqueID`
  igual hace que CardNet devuelva el mismo resultado y `confirmarPago` no duplica.
- **D-20 · Activación del perfil.** Si el perfil viene `Enabled=false` (o CardNet
  responde `CS012`), la tarjeta se guarda con `activo = 0` y la confirmación responde
  409 `{ activacion: true, metodoPago: id }`. `POST /api/metodos-pago/:id/activar`
  con `{ codigo }` llama `cardnet.activarPerfil`, marca `activo = 1` y el navegador
  repite la confirmación. Se construye aunque no se sepa si aplica siempre.
- **D-21 · Exentas y cero.** Una cuenta exenta o un cobro de importe cero no llaman a
  CardNet ni una vez: el camino de hoy se conserva tal cual (ya ocurre antes de elegir
  procesador).
- **D-34 · Redirección de CardNet.** Si una respuesta de `purchase` trae
  `CommerceAction` con `ActionType` 1 (Redirect) [VERIFICADO en `cardnet.md`], el pago
  queda `pendiente`, la respuesta al navegador lleva `redireccion` (solo si la URL es
  https del mismo origen que la URL base de CardNet) y el navegador va allí con
  `location.assign`. El resultado llega por la notificación o la reconciliación; al
  volver, el panel muestra el pago en espera. Nunca se confía en la vuelta del
  navegador como prueba de pago.
- **D-22 · Tope por organización.** `db.permitir('pago:' + org, 10, 10)` en la
  confirmación, la activación y el alta de tarjeta. La notificación no lleva tope.

### Notificación y reconciliación
- **D-23 · `POST /api/pagos/cardnet/notificacion`.** Va antes que cualquier
  `/api/pagos/([\w-]+)...` en `RUTAS`. Sin `conSesion`. Con CardNet apagado responde
  404 «Ruta inexistente», como si no existiera. Autenticación: cabecera
  `Authorization: Basic` comparada con la esperada (llave privada + `:`) con
  `crypto.timingSafeEqual` sobre los SHA-256 de ambas (misma longitud siempre); nunca
  `===`. Falla → 401 sin detalle. Sin limitador por IP: CardNet reintenta y un
  estrangulamiento convierte un fallo pasajero en un pago perdido.
- **D-24 · Qué hace con el aviso.** Guarda el evento limpio en `pagos_eventos`, lee el
  `PurchaseId` del objeto, vuelve a consultar la compra a CardNet
  (`consultarCompra`), busca nuestro pago por la referencia (`Order`) y llama
  `pagos.resolver`. Responde 200 solo cuando terminó; un fallo propio responde 500
  para que CardNet reintente; un recurso que no es nuestro (referencia desconocida o
  tipo que no es compra) responde 200 y queda en el evento, para no provocar
  reintentos infinitos.
- **D-25 · Reconciliación cada 10 minutos.** Tarea `reconciliar` en
  `tools/tareas.js` con su propio temporizador (`deploy/mercamaquinarias-pagos.timer`
  + `.service`). Con CardNet apagado termina sin hacer nada. Para cada pago
  `cardnet` pendiente de más de 10 minutos:
  - con `procesador_id` → `consultarCompra` → `pagos.resolver`;
  - sin `procesador_id` pero con un intento de cobro anotado en `pagos_eventos` →
    reenvía `cobrar` con el mismo `UniqueID` (CardNet devuelve el resultado ya
    obtenido sin duplicar [VERIFICADO en `cardnet.md`]) → `pagos.resolver`;
  - sin intento de cobro y con más de 24 horas → `rechazarPago` con motivo
    «abandonado: la tarjeta nunca se capturó» (sin cobro, sin NCF).
  Cuando la reconciliación aprueba un pago que la base tenía pendiente, anota un evento
  `origen = 'reconciliacion'`, `tipo = 'descuadre'`.
- **D-26 · El descuadre, ruidoso.** `db.informe` añade `pasarela: { recuperados,
  atascados }` (descuadres del periodo y pagos `cardnet` pendientes de más de una hora
  ahora mismo). `componerInforme` imprime la sección «Pasarela de pago» solo si
  CardNet está activo o alguna cifra es mayor que cero: con CardNet apagado y sin datos,
  el informe sale idéntico al de hoy.

### Cobro recurrente
- **D-27 · Solo con consentimiento explícito.** La renovación automática se activa por
  membresía con una casilla desmarcada por defecto («Renovar automáticamente con esta
  tarjeta; le avisaremos del importe por correo 7 días antes»), guarda
  `renovacion_aceptada` y se puede apagar desde el panel. Sin casilla marcada no se
  cobra nada nunca. No se toca ningún precio ni `planes.perfil_publico`: la renovación
  cobra exactamente lo que costaría comprar hoy el mismo nivel, cupo y días
  (`precios.precioCompra` con el precio vigente del plan, igual que
  `comprarMembresia`), es decir, una recompra automática, no una tarifa nueva. Si el
  nivel ya no está activo, no se renueva y se avisa.
- **D-28 · Calendario.** Aviso por correo 7 días antes de `fin` con el importe, la
  tarjeta (marca y últimos cuatro) y cómo apagarlo, una vez por ciclo (anotado en
  `renovacion_avisada`). Primer intento 3 días antes de `fin`; si se rechaza, otro al día
  siguiente, y otro el último día: tres intentos como máximo por ciclo, cada uno un pago
  nuevo con su propia referencia. Correo al anunciante en cada rechazo con el motivo. Si
  los tres fallan, la membresía vence en su fecha por el camino de siempre (`caducar`);
  no se usa el estado `impaga`. Una tarjeta con tres `fallos_seguidos` deja de
  intentarse hasta que el anunciante la cambie.
- **D-29 · La renovación en la transición única.** Intención nueva
  `{ tipo: 'renovacion', idSusc, dias, cupo, concepto, cliente, correoCliente }`;
  `db.aprobarPago` gana esa rama (alarga `fin` desde el `fin` actual, o desde ahora si
  ya venció) y el comprobante sale por `confirmarPago` como cualquier cobro.
- **D-30 · Aviso de tarjeta por vencer.** Correo 15 días antes del último día del mes
  de vencimiento de una tarjeta que renueve alguna membresía; una vez por tarjeta y mes
  (anotado en la base).

### Pruebas y documentación
- **D-31 · Arnés propio.** `tools/probar-cardnet.js` (estilo `probar-pagos.js`:
  `ok()`, contadores, `process.exit`), base desechable en `.tmp/prueba-cardnet/`,
  variables de entorno ANTES del `require` de `tools/db.js`, correo en modo `archivo`.
  La red no se toca: `cardnet._transporte` se sustituye por un doble al empezar y el
  transporte real lanza si alguien lo llama durante la prueba. `npm run cardnet:probar`
  y paso «CardNet» en el job `pruebas` después de «Transferencia».
- **D-32 · Las pruebas de otras fases siguen verdes sin tocarlas**, salvo borrar del
  entorno las `MERCA_CARDNET*` al principio de las que eligen procesador, si hiciera
  falta, para que un `.env` local no decida su resultado.
- **D-33 · Documentación de encendido.** `.env.example` con las variables vacías;
  `deploy/README.md` con: qué pedir a CardNet, cómo encender `lab`, registrar la URL
  de notificación, instalar el temporizador, pasar a `produccion` y apagar.

### Claude's Discretion
- Nombres internos de funciones de `db.js` y de las secciones del arnés.
- Maquetación del modal de captura, reutilizando los componentes de la fase 5
  (bloque de pago en espera) y los tokens de tema de la fase 2.
- Textos exactos de los mensajes de rechazo, siempre diciendo lo que NO pasó.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Diseño de la integración
- `.planning/research/cardnet.md` — plataformas de CardNet, rutas y campos literales,
  webhook, PCI, riesgos y lista de preguntas. Fuente principal.
- `.planning/REQUIREMENTS.md` — PAGO-04 a PAGO-08.

### Lo que ya existe y se reutiliza
- `.planning/phases/03-el-pago-deja-de-darse-por-cobrado/03-02-SUMMARY.md` —
  `pagos.confirmarPago`, `cobrar`, `PROCESADORES`.
- `.planning/phases/03-el-pago-deja-de-darse-por-cobrado/03-03-SUMMARY.md` —
  respuestas 201/202/402 de las rutas de cobro.
- `.planning/phases/05-cobro-por-transferencia-bancaria/05-01-PLAN.md` — D-01 a D-14
  de la fase 5: `metodosDeCobro`, `procesadorDeCobro`, `confirmarPago(id, { envolver })`,
  `aprobarPago` con SAVEPOINT.
- `.planning/phases/05-cobro-por-transferencia-bancaria/05-03-PLAN.md` — manejo del 202
  en `assets/planes.js` y `assets/panel.js`.
- `CLAUDE.md` — cero dependencias, migraciones al final, rutas específicas antes,
  CRLF, entorno antes del `require` de `db.js`, interruptores.

</canonical_refs>

<specifics>
## Specific Ideas

- Criterio 1 de la fase se comprueba con la búsqueda del nombre del código de
  seguridad en el código: cero resultados.
- Criterio 4: RD$2.000 → `200000` en el cuerpo que ve el doble de transporte.

</specifics>

<deferred>
## Deferred Ideas

- Devolución con nota de crédito B04 desde la consola (`cardnet.devolver` queda
  construido y probado, sin ruta ni pantalla): va con la deuda técnica o con el lote
  del contador, cuando se decida el flujo fiscal de la devolución.
- Lista de pagos de pasarela en la consola de administración: el informe cubre el
  descuadre; la pantalla puede venir después.
- Actualización automática de credenciales (Visa Account Updater / ABU): depende de
  CardNet.

</deferred>

## Preguntas abiertas (solo Victor, con CardNet)

1. **`DataDo.Invoice`: ¿número de orden del comercio o NCF de la DGII?** La de mayor
   impacto. El diseño asume número de orden (D-06). Si fuera el NCF, el diseño cambia
   entero y no se enciende hasta rehacerlo.
2. **Credenciales de certificación (QA):** `PublicAccountKey` y `PrivateAccountKey` de
   la plataforma de Tokenización, para probar en `lab`.
3. **Afiliación con `Ecommerce_COF` y `MOTO_Recurring`** pedidos por escrito; sin eso
   las renovaciones se rechazan.
4. **Registrar la URL de notificación** (`https://mercamaquinarias.com/api/pagos/cardnet/notificacion`)
   en los sistemas de CardNet.
5. **Activación del perfil:** ¿aplica siempre? ¿quién manda el código y por dónde?
6. **Campos obligatorios de `POST /v1/api/customer`** y si `purchase` exige algún dato
   de comercio además de las llaves.
7. **Renovación automática:** ¿hace falta una cláusula en los términos (`assets/legales.js`)?
   El plan la construye con consentimiento explícito por casilla y NO toca los textos
   legales; añadir la cláusula es decisión de Victor.
8. **Importe de la renovación:** el plan renueva al precio vigente de ese nivel, cupo
   y días (lo mismo que costaría comprarlo ese día), avisado 7 días antes. Si Victor
   prefiere congelar el precio del ciclo anterior (por ejemplo, para quien compró en
   promoción), es cambiar una línea de `pagos.renovar`; es decisión suya, no técnica.

---

*Phase: 06-cardnet-construido-probado-y-apagado*
*Context gathered: 2026-09-25 via plan-phase --auto*
