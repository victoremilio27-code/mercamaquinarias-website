---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "05.3 en producción. 05.4 y 12 con CONTEXT y RESEARCH listos; siguiente: planificar la 05.4."
last_updated: "2026-09-29T22:00:00.000Z"
last_activity: "2026-09-29 — 05.2-05: asistente de publicar con paso del plan, borrador en el servidor, pago y espera de la transferencia; auditar y check en verde en local con Chrome. Antes, 05.2-03: POST /api/borradores/:id/pago con el importe del servidor, activación solo por confirmarPago (al instante, transferencia desde la consola o importe cero), correo «ya está publicado» una sola vez, PUBLICACION_HUERFANA; npm run publicacion:probar en verde con las secciones 9-12 (rama claude/fase-05.2-publicar-equipo)."
progress:
  total_phases: 16
  completed_phases: 10
  total_plans: 45
  completed_plans: 49
  percent: 50
---

# Project State

## Para retomar (actualizado 2026-09-30, noche) — EMPIEZA AQUÍ

Prompt para abrir el próximo chat: *«Retoma MercaMaquinarias: lee CLAUDE.md y "Para retomar" de
.planning/STATE.md y sigue.»*

**Forma de trabajar:** una rama y un PR por fase; se fusiona y despliega al cerrar la fase (verificación
passed + CI en verde, sin volver a preguntar). Opus planifica con GSD y verifica; **toda ejecución la hace
Sonnet 5.5, sin excepciones** (también ITBIS, comprobante o NCF; regla de Victor del 2026-09-29). Hasta 2-3 agentes si no tocan los mismos archivos (el
segundo en un worktree aparte). Lanzamiento: 2026-10-14. Detalle en «Decisions».

### Dónde estamos

- **Fase 10.1 (recuperar la cuenta y cambiar el correo) EN PRODUCCIÓN** desde el 2026-09-30 22:30 UTC
  («Sitio arriba: 0d05858», PR #48). Victor hizo antes el respaldo verificado
  (`/var/backups/mercamaquinarias/antes-recuperar-cuenta.db`, `integrity_check` = ok): conservarlo unos días.
  Verificación `human_needed`: su revisión visual del panel, `cuenta.html` y la consola (`10.1-VERIFICATION.md`).

- **Todo en producción** (último despliegue «Sitio arriba: d86d47a», PR #46, 2026-09-30 15:56 UTC): fases 2,
  3, 4, 5, 05.1, 05.2, 05.3, 05.4, 6, 7, 8, 9 y 10 (la 3, 4, 8 y 9 sin su casilla en el ROADMAP, ver «Papeleo»).
- **05.4 (dealer con capacidad y consola de solo lectura):** entera (PR #44 y #45). Ni una cadena visible dice
  «cupo» salvo `legal.html` (ver «Preguntas»). Contratación en la **2.3**: quien aceptó la 2.2 vuelve a
  aceptar antes de su próximo pago. Verificación `human_needed` (revisión visual de Victor).
- **Fase 6 (CardNet) en producción y APAGADA** (`MERCA_CARDNET` sin fijar): 10 planes, verificación 5/5
  `human_needed`, W-01 arreglado. La migración `2026-10-cardnet` ya se aplicó en producción; Victor hizo el
  respaldo verificado antes (`/var/backups/mercamaquinarias/antes-cardnet.db`, `integrity_check` = ok) —
  conservarlo unos días. Encender: `deploy/README.md` §10c y `06-USER-SETUP.md`; el temporizador
  `mercamaquinarias-pagos` NO lo instala el despliegue (§10c).
- **Servidor:** Ubuntu 24.04 en el droplet `137.184.111.241` (acceso `ssh root@…`); pedía reinicio por kernel y
  se le dijo a Victor que reiniciara tras el despliegue. El repositorio del VPS es del usuario
  `mercamaquinarias` (git como root da «dubious ownership»: usar `sudo -u mercamaquinarias git …`). **No
  actualizar a Ubuntu 26.04 antes del lanzamiento.** `sqlite3` ya está instalado allí.
- **Preparado sin planificar todavía:** la 12 tiene `CONTEXT.md` y `RESEARCH.md`; la facturación
  electrónica tiene `research/facturacion-electronica.md`.
- **En la nube:** puppeteer como root necesita un envoltorio de Chrome en el scratchpad con `--no-sandbox`,
  `--disable-dev-shm-usage --no-zygote --disable-gpu --ignore-certificate-errors`, vía
  `PUPPETEER_EXECUTABLE_PATH` (ver «Decisions»); nunca se toca `tools/` por eso. Las auditorías tienen el
  puerto 8080 fijo: con agentes en paralelo, solo el orquestador corre el navegador tras fusionar cada ola,
  y hay que matar el servidor con `lsof -t -i :8080 | xargs -r kill` (un servidor viejo apuntando a una base
  borrada ya hizo fallar la auditoría del administrador una vez). La red de la nube NO alcanza
  `mercamaquinarias.com`: el sitio en vivo se confirma con el «Sitio arriba» del registro del paso
  `desplegar` en GitHub Actions.

### Lo que falta, en orden

1. **Cuenta de dealer de prueba para Victor (pedida el 2026-09-30). Comprobado en local el 2026-09-30:** no hace
   falta tocar código. Una empresa `--exenta` recibe al publicar su primer equipo una membresía Premium interna
   (`membresiaInterna`, sin fin) que enciende `perfil_publico`, y `apagarPerfilesSinPlan` no la apaga; luego
   publica la página en «Mi página». **Espera la respuesta de Victor** (correo, empresa y RNC únicos). Una cuenta de empresa (dealer) con
   página de dealer publicada y **exenta de pagos**, para su uso personal y de pruebas, y darle las
   credenciales. Hay que hacerla **en producción**, así que la corre Victor por SSH en el VPS con los comandos
   exactos que le prepare la sesión: `tools/admin.js crear <correo> "<Nombre>" --empresa "<Razón social>"
   --rnc <RNC> --exenta [--clave "…"]` (como el usuario `mercamaquinarias`, con las variables de
   `/etc/mercamaquinarias.env` y `MERCA_DB`), y la contraseña se le entrega en el chat. Antes, comprobar en
   el código qué necesita la página pública del dealer para estar visible (P14: hoy solo con Premium,
   `encenderPerfilSiProcede`/`perfil_publico` en `tools/db.js`) y si una cuenta `exenta_pago` la obtiene sin
   membresía; si no, añadir al procedimiento lo que falte (sin tocar precios). Probar el procedimiento entero
   antes en local con `db:demo`. Preguntar a Victor el correo y el nombre de empresa que quiere (datos
   reales: una sola pregunta agrupada).
2. **Fase 12 — lote mensual de comprobantes. PLANIFICADA el 2026-09-30** en la rama
   `claude/fase-12-lote-comprobantes` (sin PR): 4 planes en 4 olas y `12-VALIDATION.md`, revisados por el
   comprobador (3 bloqueantes y 11 advertencias corregidos). **Espera a Victor:** si se ejecuta ya, adelantándola
   a la 11 (bloqueada por contenido), y las preguntas del contador (607, formato, recibos, corte, PDF repuesto,
   selector de mes sin preseleccionar). Se planificó con `12-CONTEXT.md` y `12-RESEARCH.md` (ZIP escrito a
   mano con `node:zlib`, solo lectura, sin migración; no usar `facturas.incluida_en_lote` ni `lotes_contador`,
   restos del envío automático prohibido). Se ejecuta en su turno, tras la 11. Cuando exista la e-CF, el lote
   incluye también el XML y la representación impresa.
3. **Antes de encender CardNet (no bloquea el lanzamiento, que va con transferencia):** **que dos procesos no puedan consumir dos NCF para el mismo pago**
   (hallazgo de `03-VERIFICATION.md`: `facturas` no tiene índice único sobre `pago_id` y la comprobación de
   `pagos.js:126` y el `INSERT` de `crearFactura` no van en la misma transacción, con `tomarNcf` en medio; hoy no
   ocurre porque con CardNet apagado `reconciliar` y `renovarAutomaticas` no hacen nada); que los cobros
   `aprobado-sin-aplicar` se puedan marcar como devueltos (hoy «Pasarela de pago» los repite en cada informe);
   certificar en lab lo marcado «POR CONFIRMAR EN LAB» (forma del `message` del iframe, que admita ser
   embebido, alto para 3-D Secure, orden de perfiles nuevos, W-01 con otra tarjeta y mismo `UniqueID`, si el
   cobro recurrente exige un indicador) e instalar el temporizador `mercamaquinarias-pagos`.
4. **Papeleo del ROADMAP (hecho el 2026-09-30 salvo la fase 1).** La 3 (`passed`), la 4 (`human_needed`: revisión
   visual de bandeja y bitácora), la 8 y la 9 ya tienen VERIFICATION y casilla. Queda la **fase 1**, que espera la
   protección de rama de `main` (paso manual de Victor, plan 01-02) antes de verificarla.
5. **Facturación electrónica (e-CF) — en espera.** Victor la solicita en **octubre de 2026**. Cuando diga que
   está presentada: insertar la fase «6.1 e-CF» con `gsd-phase` (propuesta en §7 de la investigación: FE-01 a
   FE-13, construida y apagada tras `MERCA_ECF`, ejecutada con Sonnet 5.5) y planificarla. Recomendación:
   proveedor autorizado (PSFE) por API detrás de un adaptador.
6. **Sin planificar a propósito:** 11 (falta el contenido real de transporte y financiamiento) y 14 (faltan
   personas y protocolo de inspección); 13, 15 y 16 se planifican cuando se acerquen.
7. **Deuda anotada para la 13 (no bloquea):** `fechaCorta` de `assets/panel.js` y de los PDF pinta la fecha en
   UTC; `tipoRecordatorio` redondea hacia arriba («vence mañana» el mismo día del corte); desborde de
   `panel.html` a 390 px; `destino` sin validar en `assets/planes.js`; `tools/admin.js` cambia el sello sin
   bitácora; borrar `proximamente.html` y `vercel.json` (con el visto bueno de Victor); el script de despliegue
   no respalda la base antes de una migración (cada migración nueva exige el respaldo manual de Victor antes
   de fusionar); el temporizador de pagos no lo instala el despliegue.

### Preguntas para Victor (se trabaja con el valor por defecto si no contesta)

- 05.4 P9: precio de «Agregar publicaciones activas»: lista (**por defecto**) / vigente con promoción /
  pactado (exige migración).
- 05.4 P13: ampliar tras renovar por adelantado cobra todos los días que quedan (**por defecto**) o máximo un
  ciclo.
- 05.4 P14: página pública del dealer solo con Premium (**por defecto**) o con cualquier nivel con capacidad
  viva.
- 05.4: la contratación 2.3 obliga a todos a aceptar de nuevo antes de su próximo pago, a dos semanas del
  lanzamiento. **Ya subida y en producción** (PR #44); revisar la redacción de 1.1, 1.2 y 4.2.
- 05.4: `legal.html` aún dice «cupos» en el preámbulo (l. 90), la tabla de privacidad (l. 225) y la política
  de publicación §3 (l. 288). Cambiarlo sube versión de esos documentos y pide nueva aceptación: decide él.
- 05.4 revisión visual (lo único que dejó `human_needed` la verificación): panel del dealer (resumen,
  membresías, «Agregar publicaciones activas» con «ITBIS incluido»/«Sin costo» y «La quinta no se cobra») en
  móvil y escritorio, claro y oscuro; y la consola con datos reales (Publicaciones, Pagos, Renovaciones con
  «llega con CardNet», capacidad en Empresas sin RNC). Detalle en `05.4-08-SUMMARY.md` («Lista para Victor»).
- 06-08: durante la promoción de lanzamiento (renovación a RD$0) la renovación automática renueva gratis,
  sin cobrar ni emitir comprobante, igual que el botón manual (**por defecto**, reversible); la alternativa es
  dejar vencer esas suscripciones.
- 06-09: «Tu anuncio vence el {fecha}.» va de tú (texto literal de `modelo-comercial.md`) y el resto del panel
  trata de usted: ¿se pasa a usted?
- 12 (con el contador): ¿Formato 607 de la DGII y en qué formato? (**por defecto no se genera**; el CSV trae
  los campos); ¿ZIP (**por defecto**) o un solo PDF?; ¿contenido del paquete (PDF de cada comprobante,
  `resumen.csv` con `;`, `resumen.pdf`, `LEEME.txt`)?; ¿recibos no fiscales dentro, aparte (**por defecto**)?;
  ¿corte por mes calendario dominicano y fecha de cobro (**por defecto**)?

### Lo que solo puede hacer Victor

- **CardNet:** meter el expediente de afiliación (es lo único que puede retrasar el lanzamiento) y contestar
  las 8 preguntas de `06-CONTEXT.md` («Preguntas abiertas»), sobre todo si `DataDo.Invoice` es número de orden
  o NCF; llaves de lab, afiliación con `Ecommerce_COF` y `MOTO_Recurring`, registrar la URL de notificación.
- **NCF hasta el corte:** se usan las secuencias B que hay (quedan 15 B01, 10 B04, ninguna B02); cuando
  queden pocas se piden más (según Victor, la DGII las da al instante; la investigación no lo confirma). El
  aviso diario ya existe (tarea `ncf` de `tools/tareas.js`, correo a gerencia). Pedir la **B02** si el
  contador lo ve útil antes del corte, y cargar las fechas de vencimiento con `tools/facturas.js`.
- **e-CF:** preguntar al contador en qué grupo cae Inversiones XZT (pequeño/micro: corte 15-nov-2026;
  mediano/grande: e-CF exclusivo desde el 1-nov-2026) y de dónde sale el 30-nov que dijo Victor. Calendario
  (§6 de la investigación): clave de la OFV y dispositivo de seguridad; pedir el certificado digital (Avansi,
  Viafirma o Digifirma; 3-10 días hábiles); elegir proveedor PSFE; bajar al repositorio los PDF y XSD oficiales
  de la DGII (el proxy de la nube bloquea `dgii.gov.do`); solicitud de emisor electrónico en la OFV (octubre);
  pruebas en el portal; declaración jurada; secuencias E31/E32/E34; pruebas en producción; corte.
- **Configuración:** los cinco datos bancarios (`deploy/README.md` §10b), la tasa del dólar en la consola,
  créditos SMS de Brevo y `MERCA_SMS=brevo`, clave de Anthropic.
- **Protección de la rama `main`** (plan 01-02, Settings → Branches, exigiendo `pruebas` y `navegador`): hoy
  todavía se puede fusionar un PR en rojo.
- **Revisiones:** redacción de las Condiciones 2.2 (cláusula 2.1 y las nuevas 4.4-4.6); revisión visual de la
  05.1, 05.2 y 05.3 (listas en sus VERIFICATION; en la 05.3, decidir si vale «vence mañana» el mismo día del
  corte); precios del estudio contra supercarros.com/vender; revisión visual en claro y oscuro de las fases 2,
  4, 5, 7, 8, 9 y 10.
- **Para planificar la 11 y la 14:** con quién y en qué condiciones van transporte y financiamiento; quién
  inspecciona las máquinas y con qué protocolo.

## Project Reference

Ver: `.planning/PROJECT.md` (actualizado 2026-09-25)

**Core value:** Ser el punto de referencia de República Dominicana para quien tenga, necesite o trabaje con maquinaria pesada — el vacío que hoy no ocupa nadie.
**Current focus:** Cambio del modelo comercial (`.planning/research/modelo-comercial.md`, autorizado 2026-09-25): 05.1, 05.2 y 05.3 hechas; falta la 05.4.

## Current Position

**Fase 05.2 (publicar este equipo) en ejecución** en la rama `claude/fase-05.2-publicar-equipo`: 05.2-01
hecho (borrador en la base, `pagos.anuncio_id` con un solo pendiente por anuncio, activación dentro de
`aprobarPago` con una suscripción de un cupo, importe cero por `publicarBorradorSinCosto`,
`npm run publicacion:probar` en CI); 05.2-02 hecho (`validarCamposAnuncio` compartida con `publicar`;
`POST/GET/PUT /api/borradores`; `verAnuncio`, `cambiarEstado`, `cambiarPlanDeAnuncio` y `eliminarAnuncio`
niegan un borrador ajeno o su activación por otra puerta; `capacidadLibre` al marcar vendido; el
particular no exento deja de leer «cupo» en el 402/409 de `publicar`); 05.2-03 hecho
(`POST /api/borradores/:id/pago` con el importe del servidor; activa solo `confirmarPago` o el importe
cero; pendiente devuelto sin duplicar; la consola rechaza la transferencia huérfana con
`PUBLICACION_HUERFANA`; secciones 9-12 del arnés). 05.2-04 hecho (panel y planes sin «cupo»); 05.2-05 hecho (asistente en el orden nuevo, auditorías de navegador al día); 05.2-06 hecho (tarea diaria `borradores`: borra a los 30 días los borradores sin pago pendiente ni aprobado, con sus archivos). Falta re-verificar la fase.

**Fase 05.1 (precio único) terminada** en la rama `claude/fase-05.1-precio-unico`: 05.1-01 hecho
(fórmula única en `desglose`, `AJUSTE = 0.03`, `npm run precios:probar` en CI), 05.1-02 hecho (desglose
guardado en `pagos`, precios base 1.800/3.200, ajuste fuera de las respuestas al comprador), 05.1-03
hecho (planes, panel, asistente y condiciones enseñan un solo precio final «ITBIS incluido»; contratación
sube a v2.1; la consola de pagos enseña base/ajuste/ITBIS/total) y 05.1-04 hecho (sección 33 de
`tools/probar-transferencia.js`: el precio único por transferencia de punta a punta, con los cuatro
criterios de éxito de la fase comprobados juntos; batería de 14 scripts en verde; lista para Victor en
el SUMMARY). Los cuatro planes de la fase están ejecutados; queda la verificación de cierre de fase,
que hace el orquestador.
Lo de abajo es el estado anterior al visto bueno de Victor, que ya llegó el 2026-09-26.

**Parado a propósito, por orden de Victor (2026-09-25):** terminar solo lo que estaba en marcha, sin
integrar el modelo comercial en el ROADMAP, sin replanificar la fase 6 y sin lanzar agentes nuevos.

En producción (despliegue verde; el VPS responde «Sitio arriba»):
- Fase 1: plan 01-01. Quedan 01-02 (protección de rama, manual de Victor) y 01-03.
- Fases 2, 3 y 4 (PR #23 y #25).
- Fase 5, transferencia bancaria (PR #29), **apagada** hasta los cinco datos bancarios.
- Fase 7, verificación y soporte en nombre del dealer (PR #31).
- Fase 8, moneda y disponibilidad (PR #27). Tasa del dólar de partida RD$63.
- Fase 9, contactos verificados y `estafas.html` (PR #28). SMS apagado; se verifica por correo.
  **Los teléfonos de anuncios ya publicados no se ven hasta que su anunciante los verifique.**
- Fase 10, guardar, compartir, contactos atribuidos y duplicar (PR #30).

A medias, empujado y sin PR:
- **Fase 6 (CardNet), en pausa** por el cambio de modelo: `claude/fase-06-cardnet`. 06-01 hecho;
  06-02 a medias (commit «wip», con la prueba en rojo de su migración). Hay que replanificarla desde
  06-02 según el modelo comercial antes de seguir.
- **Planes de las fases 11-16:** `claude/planes-11-16`. Solo la investigación y el contexto de la 11
  («wip»); parado por Victor. Revisar contra el modelo comercial antes de seguir.
- **Modelo comercial:** `claude/modelo-comercial`, con `.planning/research/modelo-comercial.md`
  (el mensaje de Victor tal cual), `auditoria-modelo-comercial.md`, la regla de precios nueva en
  `CLAUDE.md` y este STATE.

Siguiente paso cuando Victor dé el visto bueno: integrar el modelo en el ROADMAP como fases
decimales antes de la 6 (con GSD), actualizar REQUIREMENTS y replanificar la 6. Las preguntas que
solo él contesta están al final de la auditoría (redondeo, 1.800/3.200 frente a 2.000/3.500 de hoy,
promoción del Estándar a RD$0, regla del quinto cupo, cupos ya comprados, paso de particular a
dealer, precio de la renovación, ampliación, duraciones y días de borrador).

Hallazgos de la auditoría que conviene cerrar pronto, aunque el resto espere:
- La API deja reactivar un anuncio `vendido`/`retirado` sin mirar la capacidad (dos anuncios por un cupo).
- Ninguna suscripción pasa nunca a `vencida`.

Pendiente de Victor:
- Visto bueno y respuestas del modelo comercial.
- Los cinco datos bancarios (`deploy/README.md` §10b).
- Fijar la tasa oficial del dólar en la consola.
- Créditos SMS de Brevo y `MERCA_SMS=brevo`; validar el remitente.
- Las 8 preguntas de CardNet en `06-CONTEXT.md` (sobre todo `DataDo.Invoice`: número de orden o NCF).
- Revisión visual en claro y oscuro de las fases 2, 4, 5, 7, 8, 9 y 10 (listas en cada SUMMARY/VERIFICATION).
- Probar en producción la tarjeta de WhatsApp de una ficha y duplicar un camión con motor.
- Mirar en el VPS si a alguna página de dealer le faltan logotipo, portada o galería (la limpieza
  de huérfanos los borraba antes de la fase 10).
- Protección de la rama `main` (plan 01-02).
- Decidir si la Política de publicación menciona la verificación de teléfonos y si se extiende a la página del dealer.

Progress: [█████░░░░░] 50%

## Performance Metrics

**Velocity:**

- Total plans completed: 1
- Average duration: 25 min
- Total execution time: 25 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1 — Barrera de pruebas en la fusión | 1 de 3 | 25 min | 25 min |
| 2 — Tema claro y oscuro coherentes | 1 de 6 | 55 min | 55 min |

**Recent Trend:**

- Last 5 plans: 01-01 (25 min, 3 tareas, 4 archivos), 02-01 (55 min, 2 tareas, 1 archivo)
- Trend: —

*Se actualiza al completar cada plan*

| Plan | Duración | Tareas | Archivos |
|---|---|---|---|
| Phase 02 P03 | 30 | 3 tasks | 2 files |
| Phase 02 P04 | 75 | 2 tasks | 1 files |
| Phase 05 P01 | 30 | 3 tasks | 8 files |
| Phase 05 P02 | 7 | 2 tasks | 4 files |
| Phase 05 P03 | 35 | 2 tasks | 3 files |
| Phase 05 P04 | 35 | 2 tasks | 2 files |
| Phase 05 P05 | 45 | 3 tasks | 1 files |
| Phase 05.1 P01 | 3 | 2 tasks | 4 files |
| Phase 05.1 P03 | 20 | 3 tasks | 7 files |
| Phase 05.1 P04 | 20 | 2 tasks | 1 files |

## Accumulated Context

### Decisions

- **05.2-05:** el guardado del borrador en el servidor cuelga de `guardarBorrador()` (un temporizador de 1,5 s); Chrome se lanza en la nube con `chrome-headless-shell` y `--no-sandbox --disable-dev-shm-usage --no-zygote --disable-gpu` (`PUPPETEER_EXECUTABLE_PATH`), así que las auditorías sí corren aquí. Los anuncios del seed con la subcategoría escrita como nombre (no id) no pasan `validarCadena`: el asistente la manda vacía al duplicar.

**Modelos, desde el 2026-09-26 (Victor, cerca del límite semanal):**
- Perfil de GSD `balanced` (`.planning/config.json`). Opus solo para planificar, revisar y verificar
  (el verificador y la revisión del cierre se lanzan con Opus explícito, porque `balanced` los pone en
  Sonnet); Sonnet para ejecutar planes.
- ~~Excepción: un plan que toca ITBIS, el comprobante o los NCF lo ejecuta Opus.~~ **Retirada por Victor el
  2026-09-29:** Opus ya no ejecuta nada. Toda ejecución (`gsd-executor`, `gsd-code-fixer`, `gsd-debugger`,
  `gsd-doc-writer`) va con Sonnet 5.5, fijado en `.planning/config.json` (`models.execution` y
  `model_overrides` con `claude-sonnet-5-5`). Un plan fiscal se compensa con más pruebas y con la
  verificación de Opus, no cambiando de ejecutor. Lo que digan en contra los CONTEXT/RESEARCH ya escritos
  queda sustituido por esta regla.
- Investigación, estudios de mercado, resúmenes y mapeos: Sonnet.
- **Forma de trabajar habitual, restaurada por Victor el 2026-09-29:** una rama y **un PR por fase**, y se
  fusiona y despliega **al cerrar la fase** (verificación en verde + CI en verde), no plan a plan. Hasta 2 o
  3 agentes a la vez si no tocan los mismos archivos (regla de `CLAUDE.md`). Se retiran el «desplegar por
  plan» y el tope de 2 agentes que se pusieron el 2026-09-26. Se mantiene el reparto de modelos de arriba.
  (Los PR #36 y #37 salieron por tramos antes de este cambio; el resto de la 05.2 sale ya junto.)

Las decisiones se registran en la tabla Key Decisions de `PROJECT.md`.
Decisiones que afectan al trabajo actual:
- 05.2-01: «pendiente de pago» se deriva (borrador + pago pendiente con `anuncio_id`); el índice único
  parcial `ux_pagos_anuncio_pendiente` garantiza en la base un solo pendiente por anuncio.
- 05.2-02: una sola `validarCamposAnuncio(c, plan, { completo })` para publicar y el borrador (completa
  exigirá lo mismo al pedir el pago en 05.2-03); un borrador responde el mismo 404 a quien no es su
  dueño y a un id inexistente, y ninguna ruta existente lo activa sin pasar por el pago.
- 05.2-03: el correo «ya está publicado» sale de `confirmarPago` (y de la ruta del importe cero con la
  misma función), no de la ruta que pide el pago: así lo reciben igual la transferencia y CardNet.

- **Regla de Victor, 2026-09-25 (modelos y ritmo):** fases 5 y 6 con perfil GSD «quality» (Opus en todo) y revisión completa al cerrar cada una. En cuanto se publique la fase 6: `model_profile` a «balanced» en `.planning/config.json` (Opus planifica, revisa y verifica; Sonnet ejecuta), commit, y avisar a Victor en una línea para que baje el chat principal de High a Medium. De la fase 7 en adelante, «balanced»; una fase que toque cobros, facturación o NCF vuelve a «quality» solo mientras dure *(sustituido el 2026-09-29: la ejecución es siempre Sonnet 5.5, también en esas fases)*. Nunca Haiku. Para ahorrar crédito: no releer ni reexplorar `.planning/` ya escrito, la revisión al cerrar una fase cubre solo lo que cambió esa fase, y nada de agentes para lo que se resuelve con unas pocas búsquedas.
- **Regla de Victor, 2026-09-25 (paralelismo):** ejecución automática sin luz verde entre tareas, planes ni fases. Se planifica por adelantado todo lo que se pueda contra las interfaces de las fases previas; dos fases independientes se ejecutan a la vez, cada una en su git worktree y su rama; nunca dos agentes ejecutores en la misma copia de trabajo. Se fusiona en orden del ROADMAP. Cada fase, antes de su PR: verificación GSD, revisión de código de lo que cambió, correcciones y todas las pruebas. Un PR por fase, fusión a `main` solo con CI en verde y comprobación del sitio en vivo.
- **Regla de Victor, 2026-09-25:** el 14 de octubre todo lo que depende de nosotros está terminado. Si algo retrasa el lanzamiento, que sea la afiliación de CardNet, nunca nuestro trabajo. Consecuencia: el código de CardNet se escribe, prueba y certifica dentro de v1 (Fase 6), aunque la afiliación no esté aprobada.
- **[05-01]** Con la transferencia encendida, `pagos.metodosDeCobro()` retira `demo`: toda compra con importe queda pendiente hasta que el personal la marque recibida. `db.aprobarPago` va con SAVEPOINT para poder ir dentro de `enNombreDe`; la emisión del comprobante queda fuera del envoltorio.
- **[05-02]** La ampliación cuya membresía ya no está viva responde 409 al marcarla recibida y solo se anula (D-07); la comprobación solo aplica a pagos pendientes, para no bloquear la re-emisión de un comprobante fallido. El importe cero no pasa por `procesadorDeCobro`. El aviso de arranque de la transferencia solo cuenta variables no vacías.
- **[05-03]** Un 202 (`pago.estado === 'pendiente'`) nunca se presenta como compra hecha: ni «Listo», ni vuelta al borrador, ni cupos repintados. `metodo` solo viaja si `/api/planes` lo ofrece; un pedido a RD$0 o una cuenta exenta siguen saliendo al instante. `destinoPropio()` impide pintar un `destino=javascript:`.
- **[05-04]** La consola confirma el importe y la referencia en la propia fila, nunca con `prompt()`. En Recibidos, un aprobado sin factura enseña «Emitir el comprobante» (la recuperación que pide el aviso de 05-02). Un recibo sin NCF se nombra como recibo, no como comprobante que falta.
- **[05-05]** El criterio 5 se prueba en CI con una organización nueva, para contar una factura y una fila de bitácora limpias. En las pruebas, los correos de la bandeja compartida se buscan por la referencia de la pasada (el NCF se repite en cada base nueva), y la búsqueda de teléfonos quita antes los NCF. La verificación humana ya no bloquea el cierre: lo automatizable se hace con puppeteer y lo visual pasa a la lista de Victor.
- **[05-REVIEW]** Revisión de la fase 5: 0 críticos, 4 bajos, todos corregidos («RD4,130» sin `$` en los recibos pendientes de Facturas, separación de «Pagos en espera» en el panel, dos comentarios fuera de sitio). Se cumplen todas las reglas fiscales y de CLAUDE.md.
- **Nube, Chrome como root:** las auditorías de puppeteer se corren con un envoltorio de Chrome en el scratchpad (`--no-sandbox`, y `--ignore-certificate-errors` para que la hoja de Google Fonts cruce el proxy TLS de la nube) vía `PUPPETEER_EXECUTABLE_PATH`, sin tocar `tools/`. Sin el segundo indicador, `auditar-publico` y `check` salen en rojo solo por Google Fonts.
- **Orden de fases fijado por Victor:** lanzamiento → transporte/financiamiento → lote del contador → deuda técnica. El roadmap lo respeta: fases 1-10 son v1, 11 es transporte/financiamiento, 12 el lote, 13 la deuda. Las fases 14-16 (inspección con informe, especificaciones e implementos filtrables, alertas) son v2 que no entraba en esos cuatro grupos y va detrás; su orden relativo puede cambiar cuando llegue el momento.
- **`auto_advance` en `false`:** Victor da luz verde a cada fase por separado, así que cada fase se cortó para entregar valor sin esperar a la siguiente.
- **Roadmap, Fase 1 primero:** hoy fusionar a `main` despliega a producción sin barrera de pruebas y hay una segunda persona empujando cambios. Cada día sin la barrera es un despliegue a ciegas.
- **Roadmap, Fase 2 antes de las pantallas nuevas:** el comprobador de contraste se cuelga de `npm run auditar`, que la Fase 1 mete en CI; así vigila las pantallas de las fases 4-10 desde el primer día en vez de tener que retocarlas después.
- **Roadmap, Fase 5 antes que la 6:** el cobro por transferencia es barato y quita la dependencia externa de la fecha firme. Tiene que estar antes de CardNet, no después.
- **Roadmap, ADMIN-05 en la Fase 4:** la bitácora de escrituras en nombre de otro se cimenta antes de cualquier acción en nombre de otro (fases 5 y 7), para no retro-instrumentar escrituras ya sueltas.
- **Lo que depende de un pago se entrega construido y apagado** tras un interruptor: ya funcionó con los SMS de Brevo y la clave de Anthropic, y aplica a CardNet y a la verificación por SMS.
- **Ejecución 01-01: la base desechable de CI va literal en `/tmp`, no con el contexto `runner`.** Ese contexto no existe en el `env` de un job —solo en el de un paso— y GitHub rechaza el archivo de flujo entero sin señalar dónde. Costó una pasada muerta; queda comentado en el YAML.
- **Ejecución 01-01: el sandbox de Chrome se habilita en el runner con `sysctl`,** no metiendo `--no-sandbox` en las herramientas de `tools/`. Esas herramientas también se corren en la máquina de casa, donde el sandbox tiene que seguir puesto.
- **Ejecución 01-01: la sintaxis de un flujo solo la valida GitHub.** No hay analizador de YAML en la máquina y no se puede añadir uno. Una revisión estructural hecha a mano dio «sin fallos» sobre un archivo que GitHub rechazó: para dar por bueno un cambio en `.github/workflows/` hay que empujar y mirar la pasada.
- **Ejecución 02-03: el comprobador de contraste nace en rojo a propósito.** Sale 1 sobre el CSS de hoy y lista los mismos números que midió el diagnóstico. Uno que sale verde sobre un código que sabemos roto no comprueba nada, así que ése es su criterio de aceptación; lo dejan en verde los planes 02-04 y 02-05.
- **[05.1-01]** `desglose(base)` devuelve `subtotal` = GRAVADO (base + ajuste); se conserva el nombre para que `pagos.subtotal`, `facturas.subtotal` y la tasa que deduce `emitirPorPago` cuadren sin tocarlos. Pesos enteros: ajuste e ITBIS se redondean una vez y total = subtotal + ITBIS por construcción. La tasa `0.03` solo se escribe en `assets/precios.js` (y su prueba).
- **[05.1-02]** `precio_pactado` es la BASE antes del ajuste (en pagos viejos, con `base` NULL, el subtotal): así renovar o ampliar al pactado no cobra el 3 % dos veces. `registrarCobro` lanza 500 si el cobro no sale entero de `precios.desglose`. El seed de planes se queda en 2000/3500; lo baja la migración `2026-09-precios-base`.
- **[05.1-04]** La sección 33 de `tools/probar-transferencia.js` demuestra los cuatro criterios de éxito de la fase 05.1 juntos en el camino de cobro real (transferencia): 1 Destacado de 30 días deja un pendiente de 3.889 con el desglose guardado, el correo dice el final sin nombrar base ni ajuste, marcar recibido emite un B02 que cuadra y anular un Premium (6.685) no gasta NCF. Solo se añadieron pruebas: no se tocó `tools/facturas.js` ni el cálculo de ITBIS/NCF.
- **[05.1-03]** Planes, panel, asistente y condiciones enseñan un único precio final «ITBIS incluido», sacado de `precioCompra`/`precios.desglose` (nunca una multiplicación aparte); el 3 % no se nombra en esas pantallas. La contratación sube a v2.1 (vigente 2026-09-26) para que se acepte de nuevo antes de pagar. La consola de pagos sí enseña base, ajuste, ITBIS y total; un pago anterior al desglose guardado sale «sin ajuste».
- **[05.2-06]** La tarea diaria `borradores` borra a los 30 días (valor por defecto, reversible: `DIAS_BORRADOR_ABANDONADO` en `tools/tareas.js`) los borradores sin pago `pendiente` ni `aprobado`, contando desde `COALESCE(actualizado, creado)`; la fila primero y los archivos después, y va antes de `huerfanos`. La prueba corre la tarea real en un proceso aparte porque `tareas.js` se ejecuta al requerirlo.
- [Phase 02]: .aviso__fotos entra en EXCEPCIONES de check-contraste (va sobre la foto, 9.01:1 a 18.91:1); .foto__sello sale por razón falsa

### Pending Todos

- Borrar `proximamente.html` y `vercel.json` (restos de Vercel; necesita el visto bueno de Victor).
- Retirar los worktrees locales ya fusionados (`TuEquipoRD-fase03`, `mercamaquinarias-fase04`).
- `tools/admin.js` (terminal) cambia el sello sin pasar por la bitácora: a la fase de deuda técnica.
- Nube: el proxy bloquea `mercamaquinarias.com`, así que el sitio en vivo solo se comprueba por el
  registro del job `desplegar` («Sitio arriba: <commit>»). Las auditorías tienen el puerto 8080 fijo;
  con varios worktrees se corren desde copias temporales con otro puerto.
- Desborde horizontal de `panel.html` a 390 px con un anuncio publicado (anterior a la fase 5): el
  `span.visualmente-oculto` de `.tabla-anuncios` escapa de `.tabla-envoltura`, que no tiene
  `position: relative`. Propuesto como tarea aparte; si no se hace antes, va a la fase de deuda técnica.
- `destino` sin validar en `assets/planes.js` (`atajo.href` y `location.href`), anterior a la fase 5:
  pasarlo por `destinoPropio()` en la fase de deuda técnica (hoy lo frena la CSP).

### Blockers/Concerns

- **Afiliación de CardNet sin iniciar.** Tarda 7-15 días hábiles más una certificación técnica obligatoria; desde el 2026-09-25 eso cae entre el 6 y el 16 de octubre. **El expediente tiene que entrar esta semana.** Es acción de Victor, no trabajo de una fase. Si no llega, se abre cobrando por transferencia (Fase 5).
- **Pregunta abierta de mayor impacto para CardNet:** confirmar que `DataDo.Invoice` es un número de orden del comercio y **no** el NCF de la DGII. Si exigieran el NCF ahí, el diseño de la Fase 6 cambia entero, porque reservar el NCF antes de cobrar es justo lo que las reglas fiscales del proyecto prohíben.
- **Créditos SMS de Brevo y clave de Anthropic pendientes de pago.** Afecta a la Fase 9 (verificación por SMS) y al asistente ya construido. Se entregan apagados.
- **Fechas de vencimiento de los NCF pendientes del contador.** Emitir desde una secuencia agotada o vencida es un error que el cliente no puede usar como crédito fiscal.
- **Droplet de 512 MB al 60 % de disco.** Techo real para fotos y video; ninguna fase debe empeorarlo.
- **Dos personas en el repositorio y `main` despliega solo.** Con el plan 01-01 ya no se despliega con las pruebas en rojo —el job `desplegar` lleva `needs: [pruebas, navegador]`—, pero **todavía se puede FUSIONAR un Pull Request en rojo**: la protección de rama es el plan `01-02` y solo Victor puede activarla en Settings → Branches, exigiendo las comprobaciones `pruebas` y `navegador`. Hasta entonces la red está a medio poner.

## Deferred Items

Todavía no hay hitos cerrados, así que no hay nada arrastrado.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(ninguno)* | | | |

## Session Continuity

Last session: 2026-09-29 (nube)
Stopped at: 05.3 en producción; 05.4 y 12 con CONTEXT y RESEARCH; siguiente, planificar la 05.4
Resume file: .planning/STATE.md, sección «Para retomar»
