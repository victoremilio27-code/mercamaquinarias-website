---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: paused
stopped_at: "Fases 5, 7, 8, 9 y 10 en producción. Modelo comercial auditado; esperando el visto bueno de Victor. Fase 6 en pausa."
last_updated: "2026-09-26T00:30:00.000Z"
last_activity: "2026-09-26 — Fusionados y desplegados los PR #29 (fase 5), #31 (7), #27 (8), #28 (9) y #30 (10). Auditoría del modelo comercial escrita."
progress:
  total_phases: 16
  completed_phases: 8
  total_plans: 45
  completed_plans: 40
  percent: 50
---

# Project State

## Project Reference

Ver: `.planning/PROJECT.md` (actualizado 2026-09-25)

**Core value:** Ser el punto de referencia de República Dominicana para quien tenga, necesite o trabaje con maquinaria pesada — el vacío que hoy no ocupa nadie.
**Current focus:** Cambio del modelo comercial (`.planning/research/modelo-comercial.md`), a la espera del visto bueno de Victor. **No se ejecuta nada hasta que él lo diga.**

## Current Position

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

## Accumulated Context

### Decisions

**Modelos, desde el 2026-09-26 (Victor, cerca del límite semanal):**
- Perfil de GSD `balanced` (`.planning/config.json`). Opus solo para planificar, revisar y verificar
  (el verificador y la revisión del cierre se lanzan con Opus explícito, porque `balanced` los pone en
  Sonnet); Sonnet para ejecutar planes.
- Excepción: un plan que toca el cálculo de ITBIS, el comprobante o los NCF lo ejecuta Opus, y se dice
  en una línea al lanzarlo. En la 05.1 eso es el 05.1-02; el 05.1-01 terminó con Opus porque ya corría.
- Investigación, estudios de mercado, resúmenes y mapeos: Sonnet.
- Máximo 2 agentes a la vez. Sin revisiones extra fuera de la del cierre de cada fase.

Las decisiones se registran en la tabla Key Decisions de `PROJECT.md`.
Decisiones que afectan al trabajo actual:

- **Regla de Victor, 2026-09-25 (modelos y ritmo):** fases 5 y 6 con perfil GSD «quality» (Opus en todo) y revisión completa al cerrar cada una. En cuanto se publique la fase 6: `model_profile` a «balanced» en `.planning/config.json` (Opus planifica, revisa y verifica; Sonnet ejecuta), commit, y avisar a Victor en una línea para que baje el chat principal de High a Medium. De la fase 7 en adelante, «balanced»; una fase que toque cobros, facturación o NCF vuelve a «quality» solo mientras dure. Nunca Haiku. Para ahorrar crédito: no releer ni reexplorar `.planning/` ya escrito, la revisión al cerrar una fase cubre solo lo que cambió esa fase, y nada de agentes para lo que se resuelve con unas pocas búsquedas.
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

Last session: 2026-09-26 (nube)
Stopped at: fases 5, 7, 8, 9 y 10 publicadas; esperando el visto bueno de Victor sobre el modelo comercial
Resume file: None
