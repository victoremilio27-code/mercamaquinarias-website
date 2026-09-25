# Project State

## Project Reference

Ver: `.planning/PROJECT.md` (actualizado 2026-09-25)

**Core value:** Ser el punto de referencia de República Dominicana para quien tenga, necesite o trabaje con maquinaria pesada — el vacío que hoy no ocupa nadie.
**Current focus:** Phase 1 — Barrera de pruebas en la fusión

## Current Position

Phase: 1 de 16 (Barrera de pruebas en la fusión) — las 10 primeras son v1
Plan: 0 de TBD en la fase actual
Status: Ready to plan
Last activity: 2026-09-25 — ROADMAP.md creado a partir de PROJECT.md, REQUIREMENTS.md y la investigación de `cardnet.md` y `mercado.md`. Cobertura verificada: 30/30 requisitos de v1 y 13/13 de v2, cada uno en exactamente una fase.

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: —
- Trend: —

*Se actualiza al completar cada plan*

## Accumulated Context

### Decisions

Las decisiones se registran en la tabla Key Decisions de `PROJECT.md`.
Decisiones que afectan al trabajo actual:

- **Regla de Victor, 2026-09-25:** el 14 de octubre todo lo que depende de nosotros está terminado. Si algo retrasa el lanzamiento, que sea la afiliación de CardNet, nunca nuestro trabajo. Consecuencia: el código de CardNet se escribe, prueba y certifica dentro de v1 (Fase 6), aunque la afiliación no esté aprobada.
- **Orden de fases fijado por Victor:** lanzamiento → transporte/financiamiento → lote del contador → deuda técnica. El roadmap lo respeta: fases 1-10 son v1, 11 es transporte/financiamiento, 12 el lote, 13 la deuda. Las fases 14-16 (inspección con informe, especificaciones e implementos filtrables, alertas) son v2 que no entraba en esos cuatro grupos y va detrás; su orden relativo puede cambiar cuando llegue el momento.
- **`auto_advance` en `false`:** Victor da luz verde a cada fase por separado, así que cada fase se cortó para entregar valor sin esperar a la siguiente.
- **Roadmap, Fase 1 primero:** hoy fusionar a `main` despliega a producción sin barrera de pruebas y hay una segunda persona empujando cambios. Cada día sin la barrera es un despliegue a ciegas.
- **Roadmap, Fase 2 antes de las pantallas nuevas:** el comprobador de contraste se cuelga de `npm run auditar`, que la Fase 1 mete en CI; así vigila las pantallas de las fases 4-10 desde el primer día en vez de tener que retocarlas después.
- **Roadmap, Fase 5 antes que la 6:** el cobro por transferencia es barato y quita la dependencia externa de la fecha firme. Tiene que estar antes de CardNet, no después.
- **Roadmap, ADMIN-05 en la Fase 4:** la bitácora de escrituras en nombre de otro se cimenta antes de cualquier acción en nombre de otro (fases 5 y 7), para no retro-instrumentar escrituras ya sueltas.
- **Lo que depende de un pago se entrega construido y apagado** tras un interruptor: ya funcionó con los SMS de Brevo y la clave de Anthropic, y aplica a CardNet y a la verificación por SMS.

### Pending Todos

Ninguno todavía.

### Blockers/Concerns

- **Afiliación de CardNet sin iniciar.** Tarda 7-15 días hábiles más una certificación técnica obligatoria; desde el 2026-09-25 eso cae entre el 6 y el 16 de octubre. **El expediente tiene que entrar esta semana.** Es acción de Victor, no trabajo de una fase. Si no llega, se abre cobrando por transferencia (Fase 5).
- **Pregunta abierta de mayor impacto para CardNet:** confirmar que `DataDo.Invoice` es un número de orden del comercio y **no** el NCF de la DGII. Si exigieran el NCF ahí, el diseño de la Fase 6 cambia entero, porque reservar el NCF antes de cobrar es justo lo que las reglas fiscales del proyecto prohíben.
- **Créditos SMS de Brevo y clave de Anthropic pendientes de pago.** Afecta a la Fase 9 (verificación por SMS) y al asistente ya construido. Se entregan apagados.
- **Fechas de vencimiento de los NCF pendientes del contador.** Emitir desde una secuencia agotada o vencida es un error que el cliente no puede usar como crédito fiscal.
- **Droplet de 512 MB al 60 % de disco.** Techo real para fotos y video; ninguna fase debe empeorarlo.
- **Dos personas en el repositorio y `main` despliega solo.** Hasta que cierre la Fase 1, cada fusión es un despliegue sin red.

## Deferred Items

Todavía no hay hitos cerrados, así que no hay nada arrastrado.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(ninguno)* | | | |

## Session Continuity

Last session: 2026-09-25
Stopped at: ROADMAP.md y STATE.md escritos; tabla de trazabilidad de `REQUIREMENTS.md` actualizada con la fase de cada requisito. Siguiente paso: `/gsd:plan-phase 1`.
Resume file: None
