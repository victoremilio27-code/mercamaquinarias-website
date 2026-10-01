# Instrucciones para Codex

Las reglas de este repositorio están en `CLAUDE.md`. **Léelo entero antes de tocar nada:**
no son sugerencias, cada una ya costó caro una vez. Lo de abajo solo añade lo propio de
trabajar como Codex.

- Implementas una tarea concreta que dejó Claude (o Victor) en un issue o PR con `@codex`.
  No decides arquitectura ni amplías el alcance: si la tarea es ambigua o choca con
  `CLAUDE.md`, dilo en el PR en vez de adivinar.
- Todo en español: código, comentarios, commits y descripción del PR.
- Cero dependencias nuevas, sin TypeScript, sin paso de compilación.
- No toques precios, comprobantes fiscales (NCF) ni migraciones ya existentes de
  `tools/db.js`. Una migración nueva solo se añade al final de `MIGRACIONES`.
- Antes de terminar, corre las pruebas que pida la tarea (`npm run ...`) y pega en el PR
  el resultado real. Si una falla, dilo; nunca la silencies ni la saltes.
- Preparación del entorno: `bash tools/preparar-nube.sh` (Node ≥ 22.5 y `npm ci`).
