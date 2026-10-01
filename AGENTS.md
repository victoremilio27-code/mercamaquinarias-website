# Instrucciones para Codex

Las reglas de este repositorio están en `CLAUDE.md`. **Léelo entero antes de tocar nada:**
no son sugerencias, cada una ya costó caro una vez. Lo de abajo solo añade lo propio de
trabajar como Codex.

- Implementas una tarea concreta que dejó Claude (o Victor) en un issue o PR con `@codex`.
  No decides arquitectura ni amplías el alcance: si la tarea es ambigua o choca con
  `CLAUDE.md`, dilo en el PR en vez de adivinar.
- Todo en español: código, comentarios, commits y descripción del PR.
- Cero dependencias nuevas, sin TypeScript, sin paso de compilación.
- No toques migraciones de `tools/db.js` (ni existentes ni nuevas) ni nada que actúe
  sobre la base de producción: eso nunca se delega.
- Precios, ITBIS, NCF y notas de crédito solo si la tarea trae pruebas ya escritas por
  Claude: implementa hasta que pasen y **no modifiques esas pruebas**. Si la tarea no
  las trae, no lo hagas y dilo en el PR.
- Solo implementas cuando un comentario te pide una tarea concreta. Si te despierta un
  PR cuya descripción solo nombra `@codex` (como el que explica este flujo), no abras
  otro PR: como mucho, comenta lo que veas.
- Node tiene que ser ≥ 22.5. Si el entorno trae otro, dilo en el PR: las pruebas de base
  fallan sin `node:sqlite`.
- Antes de terminar, corre las pruebas que pida la tarea (`npm run ...`) y pega en el PR
  el resultado real. Si una falla, dilo; nunca la silencies ni la saltes.
- Preparación del entorno: `bash tools/preparar-nube.sh` (Node ≥ 22.5 y `npm ci`).
