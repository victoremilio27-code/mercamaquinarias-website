---
phase: 05-cobro-por-transferencia-bancaria
plan: 05
subsystem: pagos (verificación de extremo a extremo)
tags: [transferencia, extremo-a-extremo, arnés, puppeteer, verificación]
requires:
  - "05-02: rutas del comprador y de la consola"
  - "05-03: pantallas del comprador"
  - "05-04: consola de las transferencias"
provides:
  - "Sección 32 de tools/probar-transferencia.js: el criterio 5 de extremo a extremo, en CI en cada fusión"
  - "Prueba de humo en navegador (no versionada) de los pasos 1-8 de la verificación humana, en los dos temas"
affects: [fase 6 (CardNet tiene que seguir apagado para que la sección 32 pase), lanzamiento]
tech-stack:
  added: []
  patterns:
    - "una organización NUEVA en la prueba de extremo a extremo, para contar una factura y una fila limpias"
    - "los correos de la bandeja compartida se buscan por la referencia de la pasada, nunca por el NCF (se repite en cada base nueva)"
key-files:
  created: []
  modified:
    - tools/probar-transferencia.js
key-decisions:
  - "La búsqueda de teléfonos en los correos quita antes los NCF: B02 y ocho cifras son diez dígitos seguidos y casaban como número"
  - "La verificación humana no bloquea el cierre: lo automatizable se hizo con puppeteer y la revisión a ojo queda en la lista de Victor"
requirements-completed: [PAGO-09, ADMIN-06]
metrics:
  duration: ~45 min
  completed: 2026-09-25
  tasks: 3
  files: 1
---

# Phase 5 Plan 05: el criterio 5 de principio a fin

**Una organización que no existía compra un cupo Destacado por
transferencia, recibe 402 al intentar publicar, el personal marca el
pago recibido desde la consola y entonces publica un anuncio que sale en
el catálogo público. Un solo comprobante B02, emitido en el marcado y no
antes; una sola fila de bitácora con la IP de `CF-Connecting-IP`; y el
procesador `demo` sin llamar ni una vez. Corre en CI en cada fusión.**

## Tareas

| # | Tarea | Commit |
|---|-------|--------|
| 1 | Sección 32 «Extremo a extremo» en el arnés | aff026d |
| 2 | Batería completa y arranque local | (sin archivos: solo ejecución) |
| 3 | Verificación humana en los dos temas | automatizable hecho; lo visual queda para Victor (abajo) |

## Qué comprueba la sección 32

1. Encendida, `metodosDeCobro()` es `['transferencia']`; ninguna pasarela
   distinta de `demo`/`transferencia` está al alcance del comprador (hoy
   no hay ninguna definida; si la fase 6 añade `cardnet` apagado, pasa).
   `PROCESADORES.demo` sustituido por un espía, restaurado en `finally`.
2. Cuenta nueva con legales, `GET /api/planes` con `metodosPago`,
   `POST /api/membresias` sin `metodo` → 202 con cuenta y referencia.
3. `POST /api/anuncios` → 402 «Todavía no tiene cupos…»; `pagosPendientes`
   con esa referencia; ninguna membresía; 0 facturas; B02 quieto; 0 filas.
4. La consola lista el pago con la empresa; `recibido` con
   `cf-connecting-ip: 190.5.5.5` → 200 con NCF `B02` y ocho cifras.
5. Una membresía de 1 cupo; una factura del pago con ese NCF; B02 +1;
   exactamente una fila de la organización, `pago.transferencia_recibida`,
   IP de la cabecera; `pagosPendientes` vacío; correo del comprobante al
   comprador en `.tmp/correos`, sin teléfono.
6. `POST /api/anuncios` → 201 y el anuncio aparece en `GET /api/anuncios`
   sin sesión.
7. Espía de `demo`: 0 llamadas.

## Batería (tarea 2)

Con `MERCA_CORREO=archivo` y `MERCA_SECRETO` de CI, como el job `pruebas`:

| Script | Resultado |
|--------|-----------|
| `check:encoding` | limpio |
| `taxonomia` | sin incoherencias |
| `facturas:letras` | 6 pass, 0 fail |
| `seguridad:probar` | 71 bien, 0 mal |
| `dealer:probar` | 49 bien, 0 mal |
| `bitacora:probar` | 74 bien, 0 mal |
| `facturas:probar` | «Todo correcto» |
| `pagos:probar` | 75 comprobaciones, «Todo correcto» |
| `transferencia:probar` | **196 comprobaciones, 0 fallos** (173 de antes y 23 de la sección 32) |
| `chat:probar` | 40 bien, 0 mal |
| `correo:probar` | herramienta manual de envío real, no prueba: sin destino sale 1 a propósito. Con `humo@prueba.invalid --todas` en modo archivo: 12/12 plantillas |

Como el job `navegador` (base desechable sembrada con `db:demo`, servidor
en el 8080, transferencia apagada), con Chrome por un envoltorio del
scratchpad con `--no-sandbox` vía `PUPPETEER_EXECUTABLE_PATH`, sin tocar `tools/`:

| Script | Resultado |
|--------|-----------|
| `verificar-taxonomia` | sin incoherencias |
| `auditar-publico` | 0 hallazgos |
| `auditar-flujos` | 0 hallazgos |
| `auditar-permisos` | 0 fallos |
| `check-contraste` | 0 hallazgos, los dos temas |
| `check` (enlaces) | sin problemas |
| `check:motion` | movimiento reducido respetado |

`auditar-publico` y `check` dieron primero 52 y 16 errores, todos de
`fonts.googleapis.com` con `ERR_CERT_AUTHORITY_INVALID`: el proxy TLS de la
nube no es de confianza para Chrome. Repetidos con el envoltorio aceptando
ese certificado (solo en el scratchpad): 0. No es del sitio.

## Verificación humana (tarea 3): lo automatizable

Servidor local con `MERCA_DB=.tmp/verificacion-05.db`, `db:demo`, una
administradora y las cinco `MERCA_TRANSFERENCIA_*` con «BANCO DE PRUEBA» /
«000-000000-0» **solo en el entorno del proceso**. Una prueba de humo con
puppeteer (en el scratchpad, no versionada) recorrió los pasos del plan en
**tema claro y oscuro**, cada uno con un anunciante nuevo:

- 1: `planes.html?nivel=destacado&cupos=1` dice «Forma de pago:
  transferencia bancaria», el botón «Pedir datos para transferir
  RD$4,130», y tras pulsarlo sale el bloque con banco, titular, RNC, tipo,
  cuenta, importe y referencia `TE-…`. Sin «Listo. Contrató».
- 2: el panel lista «Pagos en espera de confirmación» con la referencia;
  publicar da 402.
- 3: la consola lista el pago; «Marcar recibido» con «Ref. banco 123» da
  «…se emitió el comprobante B0200000003.»; sale de Pendientes y entra en
  Recibidos; la bitácora dice «Transferencia marcada como recibida».
- 4: el panel ya no lo tiene en espera, `/api/facturas` trae el B02 y
  publicar da 201.
- 5: un segundo pedido anulado con motivo queda en Anulados sin NCF.
- 7: ni el bloque, ni la fila de la consola, ni los 10 correos de cada
  pasada tienen teléfono ni WhatsApp.
- 8: con el servidor reiniciado sin las variables, `/api/planes` da
  `["demo"]` y `planes.html` no menciona la transferencia («Contratar por
  RD$4,130»); el panel no tiene la sección de pagos en espera.
- Sin errores de página, salvo el 402 que la propia prueba provoca.
- Capturas de página entera de cada paso en los dos temas revisadas a ojo:
  legibles, sin cajas que desaparezcan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug de la prueba] El NCF casaba como teléfono**
- **Found during:** Tarea 1
- **Issue:** la expresión de teléfono del arnés (diez dígitos) casaba con
  `B0200000006` en el correo del comprobante.
- **Fix:** `sinNcf()` quita los NCF (`B`/`E` y 10 a 12 cifras) antes de
  buscar; la regla del teléfono sigue igual de estricta con lo demás.
- **Commit:** aff026d

**2. [Rule 1 - Bug de la prueba] Correo de otra pasada**
- **Found during:** Tarea 1
- **Issue:** la bandeja `.tmp/correos` es compartida entre pasadas y el NCF
  se repite en cada base nueva; buscar por NCF encontraba el de la pasada
  anterior.
- **Fix:** se busca por la referencia (única de la pasada) y se exige el
  NCF dentro.
- **Commit:** aff026d

### Punto de control no bloqueante

El plan marca la tarea 3 como `checkpoint:human-verify` bloqueante. Por
instrucción de esta sesión no se espera: lo automatizable está hecho arriba
y la revisión a ojo queda en la lista de Victor.

**Total deviations:** 2 auto-fixed (las dos en la propia prueba). **Impact:** ninguno en el código del sitio.

## Deferred Issues

- **Desborde horizontal del panel a 390 px con un anuncio publicado**
  (anterior a la fase 5, de agosto): el `span.visualmente-oculto` de la
  cabecera «Acciones» de `.tabla-anuncios` es `position: absolute` y
  `.tabla-envoltura` no tiene `position: relative`, así que escapa del
  contenedor con scroll y la página mide 613 px. Con el panel sin
  anuncios no pasa. Propuesto como tarea aparte.

## Pendiente de Victor

1. **Los cinco datos bancarios** en `/etc/mercamaquinarias.env`
   (`deploy/README.md` §10b), en una cuenta en pesos:
   - `MERCA_TRANSFERENCIA_BANCO` — nombre del banco
   - `MERCA_TRANSFERENCIA_TITULAR` — titular exacto
   - `MERCA_TRANSFERENCIA_RNC` — RNC de 9 dígitos o cédula de 11
   - `MERCA_TRANSFERENCIA_TIPO` — `corriente` o `ahorros`
   - `MERCA_TRANSFERENCIA_CUENTA` — número de cuenta

   Luego `systemctl restart mercamaquinarias` y comprobar que el registro
   ya no nombra variables que faltan. Hasta entonces todo está apagado.
2. **Revisión visual** (los pasos 1-8 del plan, en claro y oscuro, en móvil
   y escritorio). Lo que la máquina no puede juzgar:
   - espaciado del título «Pagos en espera de confirmación» en el panel
     (va pegado al párrafo de arriba, sin CSS propio);
   - cómo cae el bloque de datos bajo los botones en un teléfono real;
   - el botón «Copiar» con HTTPS (en `http://` fuera de localhost el
     navegador no expone el portapapeles y el botón no se pinta).

   Para repetirla en local: base desechable, `npm run db:demo`,
   `node tools/admin.js crear <correo> "<Nombre>" --admin`, las cinco
   variables con valores de prueba solo en la línea de `npm start`.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno. T-05-16: los valores de prueba solo estuvieron en el entorno del
proceso; `git status` sin `.env` ni `.tmp/`. T-05-17: la sección 32 corre en
el paso «Transferencia» del job `pruebas`.

## Self-Check: PASSED

- FOUND: tools/probar-transferencia.js con «Extremo a extremo» y `/api/anuncios`
- FOUND: aff026d
- `npm run transferencia:probar`: 196 comprobaciones, 0 fallos
