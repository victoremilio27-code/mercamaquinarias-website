---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: executing
stopped_at: "Plan 02-04 terminado: cero hallazgos de tipo control (eran 271) y el ambar separado en sus dos papeles. El comprobador baja de 621 a 317; lo que queda es de 02-05."
last_updated: "2026-09-25T14:23:33.565Z"
last_activity: "2026-09-25 — Plan 01-01 ejecutado. El flujo `Verificar y desplegar` corre en cada Pull Request y el despliegue lleva `needs: [pruebas, navegador]`. Comprobado en la pasada real del PR #23: `pruebas` verde en 15 s, `navegador` verde en 1 m 49 s, `desplegar` omitido."
progress:
  total_phases: 16
  completed_phases: 0
  total_plans: 16
  completed_plans: 5
  percent: 0
---

# Project State

## Project Reference

Ver: `.planning/PROJECT.md` (actualizado 2026-09-25)

**Core value:** Ser el punto de referencia de República Dominicana para quien tenga, necesite o trabaje con maquinaria pesada — el vacío que hoy no ocupa nadie.
**Current focus:** Phase 1 — Barrera de pruebas en la fusión

## Current Position

Phase: 1 de 16 (Barrera de pruebas en la fusión) — las 10 primeras son v1
Plan: 1 de 3 en la fase actual
Status: In progress — 01-01 terminado; 01-02 es paso manual de Victor
Last activity: 2026-09-25 — Plan 01-01 ejecutado. El flujo `Verificar y desplegar` corre en cada Pull Request y el despliegue lleva `needs: [pruebas, navegador]`. Comprobado en la pasada real del PR #23: `pruebas` verde en 15 s, `navegador` verde en 1 m 49 s, `desplegar` omitido.

Progress: [███░░░░░░░] 31%

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
- **Ejecución 01-01: la base desechable de CI va literal en `/tmp`, no con el contexto `runner`.** Ese contexto no existe en el `env` de un job —solo en el de un paso— y GitHub rechaza el archivo de flujo entero sin señalar dónde. Costó una pasada muerta; queda comentado en el YAML.
- **Ejecución 01-01: el sandbox de Chrome se habilita en el runner con `sysctl`,** no metiendo `--no-sandbox` en las herramientas de `tools/`. Esas herramientas también se corren en la máquina de casa, donde el sandbox tiene que seguir puesto.
- **Ejecución 01-01: la sintaxis de un flujo solo la valida GitHub.** No hay analizador de YAML en la máquina y no se puede añadir uno. Una revisión estructural hecha a mano dio «sin fallos» sobre un archivo que GitHub rechazó: para dar por bueno un cambio en `.github/workflows/` hay que empujar y mirar la pasada.
- **Ejecución 02-03: el comprobador de contraste nace en rojo a propósito.** Sale 1 sobre el CSS de hoy y lista los mismos números que midió el diagnóstico. Uno que sale verde sobre un código que sabemos roto no comprueba nada, así que ése es su criterio de aceptación; lo dejan en verde los planes 02-04 y 02-05.

### Pending Todos

- **Darles código de salida a `tools/auditar-publico.js` y `tools/auditar-flujos.js`.** Hoy salen 0 aunque encuentren hallazgos, así que media `npm run auditar` no puede suspender nada. Antes hay que allanar el único hallazgo que queda: `/api/dealers/maquinarias-del-caribe` responde 404 y el perfil público del dealer no carga (reproducido en CI y en local con base recién sembrada). Va en una fase decimal; no bloquea ninguna fusión.

### Blockers/Concerns

- **Afiliación de CardNet sin iniciar.** Tarda 7-15 días hábiles más una certificación técnica obligatoria; desde el 2026-09-25 eso cae entre el 6 y el 16 de octubre. **El expediente tiene que entrar esta semana.** Es acción de Victor, no trabajo de una fase. Si no llega, se abre cobrando por transferencia (Fase 5).
- **Pregunta abierta de mayor impacto para CardNet:** confirmar que `DataDo.Invoice` es un número de orden del comercio y **no** el NCF de la DGII. Si exigieran el NCF ahí, el diseño de la Fase 6 cambia entero, porque reservar el NCF antes de cobrar es justo lo que las reglas fiscales del proyecto prohíben.
- **Créditos SMS de Brevo y clave de Anthropic pendientes de pago.** Afecta a la Fase 9 (verificación por SMS) y al asistente ya construido. Se entregan apagados.
- **Fechas de vencimiento de los NCF pendientes del contador.** Emitir desde una secuencia agotada o vencida es un error que el cliente no puede usar como crédito fiscal.
- **Droplet de 512 MB al 60 % de disco.** Techo real para fotos y video; ninguna fase debe empeorarlo.
- **Dos personas en el repositorio y `main` despliega solo.** Con el plan 01-01 ya no se despliega con las pruebas en rojo —el job `desplegar` lleva `needs: [pruebas, navegador]`—, pero **todavía se puede FUSIONAR un Pull Request en rojo**: la protección de rama es el plan `01-02` y solo Victor puede activarla en Settings → Branches, exigiendo las comprobaciones `pruebas` y `navegador`. Hasta entonces la red está a medio poner.
- **`CLAUDE.md` sigue diciendo «No hay barrera de pruebas en CI todavía».** Es cierto a medias desde 01-01 y lo arregla el plan `01-03`.

## Deferred Items

Todavía no hay hitos cerrados, así que no hay nada arrastrado.

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| *(ninguno)* | | | |

## Session Continuity

Last session: 2026-09-25T14:23:33.559Z
Stopped at: Plan 02-04 terminado: cero hallazgos de tipo control (eran 271) y el ambar separado en sus dos papeles. El comprobador baja de 621 a 317; lo que queda es de 02-05.
Resume file: None
