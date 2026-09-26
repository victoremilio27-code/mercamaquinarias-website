---
phase: 05-cobro-por-transferencia-bancaria
plan: 03
subsystem: pagos (pantalla del comprador)
tags: [transferencia, planes, panel, 202, tema]
requires:
  - "05-02: 202 con transferencia y cobro.referencia; GET /api/membresias con pagosPendientes, transferencia | avisoTransferencia; GET /api/planes con metodosPago"
  - "fase 2: tokens --app-* y comprobador de contraste"
provides:
  - "planes.html: forma de pago en el pedido, bloque .transferencia tras pedir, recordatorio de pagos en espera"
  - "panel.html: «Pagos en espera de confirmación» con referencia, importe, fecha y cuenta"
  - "un 202 ya no se anuncia como compra hecha, ni en compra ni en ampliación (pendiente de la fase 3)"
  - "clase .transferencia en styles.css, compartida por las dos páginas"
affects: [05-05 (verificación en navegador en los dos temas), fase 6 (una pasarela en proceso usa el mismo camino sin cuenta)]
tech-stack:
  added: []
  patterns:
    - "enEspera(r) = r.pago.estado === 'pendiente' se mira ANTES de redirigir o decir «Listo»"
    - "metodo solo viaja en el cuerpo si /api/planes lo ofrece: apagada, la petición es idéntica a la de antes"
    - "mailto con encodeURIComponent y la arroba devuelta a su sitio"
key-files:
  created: []
  modified:
    - assets/planes.js
    - assets/panel.js
    - styles.css
decisions:
  - "Solo se ofrece transferencia si el pedido cuesta algo y la cuenta no es exenta: un Estándar a RD$0 o una cuenta exenta salen 201 al instante, como antes"
  - "El enlace «Volver a mi borrador» solo se pinta si destino es una página .html del sitio (destinoPropio); un destino=javascript: no se convierte en enlace"
  - "Tras un 202 por transferencia sin cuenta (se apagó entre medias), el bloque enseña avisoTransferencia de /api/membresias y la referencia, no el aviso genérico «transfiera con la referencia indicada»"
  - "El botón «Copiar» solo aparece si existe navigator.clipboard; si el navegador niega el permiso, caída silenciosa"
  - "Las funciones de pintado del bloque están repetidas en planes.js y panel.js en vez de ir a app.js: cada página carga solo su script y 05-04 trabaja en paralelo"
  - "El panel pide /membresias en paralelo con /mis-anuncios (Promise.all): los pagos en espera solo vienen ahí"
  - "La ampliación desde el panel no manda metodo: el servidor usa el primero de metodosDeCobro, que es el mismo"
requirements-completed: [PAGO-09]
metrics:
  duration: ~35 min
  completed: 2026-09-25
  tasks: 2
  files: 3
---

# Phase 5 Plan 03: lo que ve el comprador de la transferencia

**Con la transferencia encendida, planes.html dice «Forma de pago:
transferencia bancaria», el botón pasa a «Pedir datos para transferir
RD$…» y, tras pedirlo, queda a la vista un bloque con banco, titular, RNC,
tipo y número de cuenta, importe y la referencia copiable. El panel lista
los pagos en espera sin cupos nuevos. Un 202 ya no se presenta nunca como
compra hecha.**

## Tareas

| # | Tarea | Commit |
|---|-------|--------|
| 1 | planes.js ofrece la transferencia y no da por hecha una compra pendiente (+ `.transferencia` en styles.css) | eb31c7d |
| 2 | El panel muestra los pagos en espera | 06fc2ab |

## Qué hace cada pantalla

**planes.html** (sin tocar el HTML)

- `METODOS_PAGO` sale de `/api/planes`. Si incluye `transferencia` y el pedido
  cuesta algo: línea `.pedido__metodo` dentro del resumen, botón «Pedir datos
  para transferir {total}», `metodo: 'transferencia'` en el cuerpo.
- `contratar()` con `r.pago.estado === 'pendiente'`: ni `destino()`, ni «Listo.
  Contrató», ni cupos repintados como nuevos. Pinta `#datosTransferencia`
  (`.transferencia`, `role="status"`) después de los botones. Se queda puesto;
  solo lo sustituye otro pedido.
- `ampliar()` con 202: `avisar(r.aviso)` sin «pasó a N cupos» y el mismo bloque
  bajo el aviso si viene `transferencia`.
- `#pagosEnEspera`: «Tiene N pagos en espera de confirmación» encima del
  pedido, con enlace a panel.html. Se repinta tras cada 202.

**panel.html**

- `PAGOS_PENDIENTES`, `TRANSFERENCIA` y `AVISO_TRANSFERENCIA` se guardan en la
  carga y en cada `refrescarCupos()`.
- `pintarPlan()`: sección «Pagos en espera de confirmación» antes de
  `<ul class="membresias">`, y también en la rama «Sin cupos contratados» (el
  primer pedido de una cuenta nueva). Una tarjeta `.transferencia` por pago.
- Ampliar con 202: aviso del servidor y recarga; la membresía conserva sus cupos.

## Verificación

- `node --check` de los dos archivos, `check:encoding`: bien.
- `npm run auditar` entero (taxonomía, público, flujos, permisos y contraste)
  con base sembrada en el scratchpad: 0 hallazgos. `check:contraste`: 0 en las
  17 rutas y los dos temas. `npm run check` y `check:motion`: sin problemas.
- `transferencia:probar` 173/0, `pagos:probar`, `seguridad:probar`,
  `dealer:probar`: en verde.
- Prueba de humo con puppeteer (en el scratchpad, no se versiona), con un segundo
  servidor con las cinco variables de prueba y el de siempre apagado:
  - encendida: línea de forma de pago, texto del botón, sin redirección con
    `?destino=`, bloque con los seis datos, `role="status"`, banco con `<…>`
    escapado, `mailto:` con asunto codificado, sin «Listo», recordatorio 1 y
    luego 2, el bloque sigue ahí a los 2 s, `destino=javascript:` no se pinta;
  - panel: título, las referencias, cuenta y texto; ampliar da el aviso sin
    «pasó a», tres tarjetas en espera y la membresía sigue en «2 de 2 cupos»;
  - ampliar desde planes.html: sin «pasó a»;
  - apagada: sin línea de forma de pago, «Contratar por RD$…», «Listo.
    Contrató…» como antes, sin bloque ni recordatorio, panel sin la sección;
  - contraste medido en el bloque, el recordatorio y el resumen (planes) y en la
    sección del panel, en claro y oscuro: 0 textos bajo 4.5:1 / 3:1;
  - sin errores de página.
- Regla del teléfono: ninguna línea añadida contiene `whatsapp`, `tel:` ni un
  número (comprobado sobre el diff; ver desviaciones).

Para correr puppeteer como root en la nube se usó un envoltorio de Chrome con
`--no-sandbox` en el scratchpad vía `PUPPETEER_EXECUTABLE_PATH`, sin tocar las
herramientas de `tools/` (decisión de 01-01).

## Deviations from Plan

### Verificación ajustada

**1. La comprobación de teléfono del plan se aplicó a lo añadido, no al archivo entero**
- **Encontrado en:** tarea 1
- **Problema:** la expresión `/whatsapp|tel:|…/i` del `<verify>` casa con el texto
  ya existente «Contacto directo por teléfono y WhatsApp», que describe una
  prestación del nivel (el comprador contacta al vendedor), no un canal de
  soporte. Cambiarlo sería tocar lo que se promete en los planes.
- **Arreglo:** la misma expresión sobre las líneas añadidas del diff: ninguna
  coincidencia. El texto viejo no se tocó.

### Auto-fixed Issues

**1. [Rule 2 - Seguridad] El enlace «Volver a mi borrador» no acepta cualquier destino**
- **Encontrado en:** tarea 1
- **Problema:** `destino` sale de la URL; pintado como `href` permitiría un
  `destino=javascript:…` en el bloque nuevo.
- **Arreglo:** `destinoPropio()` solo deja pasar `página.html` del sitio. Probado.
- **Archivos:** assets/planes.js · **Commit:** eb31c7d

## Deferred Issues

- **`destino` sin validar en código anterior a la fase** (`assets/planes.js`,
  `atajo.href = destino()` y `location.href = destino()`): mismo problema que el
  arreglado arriba, fuera del alcance de este plan. Hoy lo frena la CSP
  (`script-src 'self'` bloquea las URL `javascript:`), así que no es explotable,
  pero conviene pasar esos dos usos por `destinoPropio()` en la fase de deuda
  técnica.

## Pendiente de verificación humana (05-05)

- Mirar en navegador real, en los dos temas, el bloque de datos en planes.html y
  la sección del panel: espaciado del título de «Pagos en espera» (va sin CSS
  propio, con las clases existentes) y cómo cae el bloque bajo los botones en
  móvil.
- Comprobar el botón «Copiar» con HTTPS (en `http://` sin localhost el
  navegador no expone el portapapeles y el botón no se pinta).

## Pendiente de Victor

- Lo mismo que en 05-01 y 05-02: los cinco datos bancarios. Hasta entonces la
  transferencia está apagada y estas pantallas se comportan como antes.

## Known Stubs

Ninguno. Todo lo que se pinta sale del servidor; con la transferencia apagada no
se pinta nada nuevo.

## Threat Flags

Ninguno fuera del `<threat_model>`: T-05-12 (todo por `esc()`, `mailto:` con
`encodeURIComponent`) y T-05-13 (la cuenta solo sale de la respuesta; el
navegador no tiene valores por defecto) están aplicadas.

## Self-Check: PASSED

- FOUND: assets/planes.js, assets/panel.js, styles.css
- FOUND: eb31c7d, 06fc2ab
