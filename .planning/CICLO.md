# Ciclo autónomo — protocolo de la rutina horaria

La rutina «MercaMaquinarias · ciclo horario» abre cada hora una sesión nueva en la nube que
lee este archivo y lo sigue. Acordado con Victor el 2026-10-01. Todo lo de `CLAUDE.md` sigue
valiendo; aquí solo va lo propio del ciclo.

Repositorio: `victoremilio27-code/mercamaquinarias-website`. Tablero de estado: **issue #82**.

## Etiquetas e hitos

- `codex`: especificación cerrada, se encarga a Codex. `claude`: diseño, migraciones, riesgo
  fiscal, producción. `victor`: solo él. `bloqueado`: espera a otro issue o a una respuesta; no
  se despacha. `en-curso`: encargado a Codex y pendiente de su parche.
- Hitos por fase: Lanzamiento, Fase 11, Fase 12, Fase 13, Fases 14-16.
- Lo permanente de Victor está en #78 (pasos manuales) y #79 (decisiones).

## 0. Salida rápida (siempre primero, sin leer nada más del repositorio)

1. Leer el issue #82 y el bloque `<!-- ciclo … -->` de su cuerpo.
2. Si `vuelta-abierta` es una fecha de hace menos de 50 minutos: otra vuelta está trabajando.
   **Terminar.**
3. Pedir `GET /repos/…/issues?state=all&since=<ultima-vuelta>&per_page=10` (trae issues y PR).
   Descartar el #82 y los comentarios hechos por la propia rutina (su firma, abajo).
4. Si no queda nada **y** la hora actual es anterior a `revisar-antes-de`: **terminar sin
   escribir nada.** (`ultima-vuelta` se fija al cerrar cada vuelta, así lo que la propia vuelta
   cambió queda antes de esa hora y no despierta a la siguiente.)
5. Si no, marcar `vuelta-abierta: <ahora>` en el #82 y seguir.

## 1. Lo que ya está en marcha

Por orden:

1. **Parches de Codex.** Para cada issue `en-curso` con una respuesta nueva de
   `chatgpt-codex-connector[bot]`: descargar el comentario **por la API**
   (`curl https://api.github.com/repos/<repo>/issues/comments/<id>`), sacar el bloque `diff`,
   crear la rama `codex/<número>-<tema>` desde `main` y aplicarlo con `git am --keep-cr`.
   - Si no aplica o falta el bloque: responder en el issue con `@codex` diciendo exactamente
     por qué y pidiendo el parche otra vez.
   - Si aplica: correr las pruebas que el issue pone en «Terminado cuando» (más
     `npm run seguridad:probar`), revisar el diff contra la especificación y contra `CLAUDE.md`
     (dependencias, migraciones, CRLF, `!!ctx`, nada fiscal fuera de lo pedido). Lo que Codex
     dice que hizo es una afirmación hasta verificarlo.
   - Pruebas o revisión en rojo: devolverlo con `@codex` en el issue, con la salida del fallo.
   - Todo bien: push de la rama, PR contra `main` con «Closes #N», en español.
2. **PR abiertos del ciclo.** CI en verde en el último commit y sin conflicto → fusionar
   (Victor lo autorizó) y comprobar el despliegue: el paso `desplegar` de Actions debe acabar
   con «Sitio arriba» (la nube no llega a `mercamaquinarias.com`). CI en rojo → diagnosticar;
   si es del parche, devolver con `@codex`; si es trivial, arreglarlo en la rama. Nunca
   silenciar ni saltar una prueba. Conflicto → fusionar `main` en la rama.
3. **Paradas.** Un issue `en-curso` sin respuesta de Codex en más de ~2 h: volver a encargarlo
   una vez con `@codex` («sigues con esto? responde con el parche o con lo que te bloquea»). Si
   a la segunda tampoco, quitar `en-curso`, anotarlo en el #82 y en «Para Victor».
4. **Desbloqueos.** Un issue `bloqueado` cuyas dependencias («Bloqueado por #…») ya están
   cerradas: quitarle `bloqueado`.

## 2. Despachar

- Máximo **3** issues `en-curso` a la vez, y nunca dos que toquen los mismos archivos (mirar
  la sección «Archivos» de cada uno; `package.json` y `.github/workflows/desplegar.yml`
  cuentan).
- Orden: primero el hito de Lanzamiento, luego Fase 12, luego Fase 13; dentro del hito, por
  número. Solo issues `codex` abiertos, sin `bloqueado` ni `en-curso`.
- Encargo: comentario en el **issue** que empiece con
  `@codex implementa este issue tal como está descrito, siguiendo AGENTS.md, y entrega el parche como dice «Entrega».`
  y poner la etiqueta `en-curso`. `@codex` solo se escribe para encargar algo.

## 3. Trabajo propio de Claude (si queda tiempo en la vuelta)

Issues `claude` sin `bloqueado`, por el mismo orden de hitos. Uno por vuelta, en su rama y PR,
siguiendo `CLAUDE.md`. Reglas que no cambian:
- **Lo fiscal se delega solo con red:** Claude sube primero las pruebas que fijan el
  comportamiento; luego se crea (o se reabre) un issue `codex` que diga «implementa hasta que
  pasen sin tocarlas», y Claude revisa ese diff línea a línea.
- **Migraciones y producción no se delegan nunca.** Una migración que va a producción necesita
  el respaldo verificado de Victor antes de fusionar: el PR se deja listo y se le pide en
  «Para Victor», sin fusionar.
- Un issue `claude` de diseño puede acabar en varios issues `codex` nuevos: escribirlos con la
  misma plantilla (Objetivo, Archivos, Requisitos, No tocar, Terminado cuando, Entrega).

## 4. Mantener la cola

Si quedan menos de **4** issues `codex` listos (abiertos, sin `bloqueado` ni `en-curso`),
convertir trabajo de los issues `claude` de diseño o de `.planning/ROADMAP.md` en issues
`codex` nuevos hasta tener 6-10. No se inventan planes ni precios: fuera de
`.planning/research/modelo-comercial.md` no se toca nada de precios.

## 5. Cerrar la vuelta

Editar el #82:
- `ultima-vuelta: <ahora>`; `vuelta-abierta: no`.
- `revisar-antes-de`: la hora más temprana entre (a) el encargo más viejo `en-curso` + 2 h y
  (b) **ahora**, si hay un PR del ciclo esperando el CI (así la próxima vuelta no sale por la
  vía rápida). Si no hay ninguno de los dos: ahora + 24 h.
- «Última vuelta»: 3-6 líneas de lo hecho.
- «Para Victor»: **todo lo que necesite de él en un solo bloque** (respaldos antes de fusionar
  una migración, preguntas nuevas). No se para lo demás por esperarle. Si hay algo nuevo ahí,
  mencionarlo al final de la sesión, que es lo que le llega como notificación.

Firma de los comentarios de la rutina: el pie de Claude Code. Al editar el #82 no se comenta:
se edita el cuerpo, para no despertarse a sí misma.

## Lo que la rutina no hace

- No fusiona un PR en rojo, no fuerza, no reescribe historial, no toca `main` directamente.
- No envía nada a un contador, no publica teléfonos, no cambia precios.
- No toca el PR #9 (video en anuncios, en pausa a propósito).
- No hace revisiones de código «grandes» si Victor no las pide; revisa solo el diff que entra.
- Si una vuelta encuentra algo que no entiende o que parece peligroso, lo anota en «Para
  Victor» y sigue con lo demás.
