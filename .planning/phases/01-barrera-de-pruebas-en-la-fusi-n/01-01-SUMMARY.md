---
phase: 01-barrera-de-pruebas-en-la-fusi-n
plan: 01
subsystem: infra
tags: [github-actions, ci, puppeteer, node-sqlite, despliegue]

# Grafo de dependencias
requires: []
provides:
  - "Flujo `Verificar y desplegar` con tres jobs: pruebas, navegador y desplegar"
  - "El job de despliegue lleva `needs: [pruebas, navegador]`: no puede arrancar con las pruebas en rojo"
  - "`tools/esperar-servidor.js`: espera activa a que el sitio responda, sin dependencias"
  - "`npm run check:encoding` sale 0 sobre el repositorio limpio y por fin sirve de barrera"
  - "`package.json` declara `engines.node` en `>=22.5`"
affects: ["01-02 proteccion de rama", "01-03 CLAUDE.md al dia", "02 comprobador de contraste"]

# Tecnologia
tech-stack:
  added: []
  patterns:
    - "Un script por paso del job, para que el nombre del que falla se lea en el Pull Request"
    - "Base de datos desechable del runner por variable de entorno del JOB, para que los procesos hijos la hereden"
    - "Espera activa contra el puerto en vez de sleep fijo"

key-files:
  created:
    - tools/esperar-servidor.js
  modified:
    - .github/workflows/desplegar.yml
    - package.json
    - tools/fix-encoding.js

key-decisions:
  - "D-01: entran en la barrera solo los scripts que salen 1 cuando algo esta mal y pasan en verde hoy; `correo:probar` queda fuera porque manda correo de verdad"
  - "D-01-bis: se ensancha la lista blanca de `fix-encoding.js` con U+2026 y U+2550 en vez de dejar la comprobacion fuera de la barrera"
  - "D-02: un solo flujo con `needs`, no `workflow_run`; `concurrency: produccion` baja al job de despliegue"
  - "D-04: topes de 10 y 15 minutos; medidos, van holgadisimos"
  - "La ruta de la base desechable va literal en /tmp: el contexto `runner` no existe en el `env` de un job y tumba el flujo entero"
  - "El sandbox de Chrome se habilita en el runner con un sysctl, no metiendo --no-sandbox en las herramientas"

patterns-established:
  - "Barrera de CI: cualquier script nuevo que quiera bloquear la fusion tiene que salir 1 cuando falla y pasar en verde el dia que entra"
  - "Las trampas de GitHub Actions se anotan en el propio YAML, en el estilo del repositorio"

requirements-completed: []          # CI-01 NO se marca hecho aquí a propósito
requirements-partial: [CI-01]       # el despliegue ya no corre en rojo; fusionar en rojo sigue siendo posible hasta el 01-02

# Metricas
duration: 25min
completed: 2026-09-25
---

# Fase 1 Plan 01: Barrera de pruebas en la fusión — Resumen

**Las pruebas que ya existían cuelgan ahora de un flujo de GitHub Actions y el despliegue a producción es incapaz de arrancar sin ellas en verde: comprobado contra GitHub en el PR #23, con `pruebas` y `navegador` en verde y `desplegar` omitido.**

## Rendimiento

- **Duración:** ~25 min
- **Empezado:** 2026-09-25T05:04Z (aprox.)
- **Terminado:** 2026-09-25T05:29Z
- **Tareas:** 3 de 3
- **Archivos modificados:** 4 (3 modificados, 1 nuevo)

## Lo conseguido

- **El despliegue ya no puede ir a ciegas.** `.github/workflows/desplegar.yml` pasa de un job a tres, y `desplegar` lleva `needs: [pruebas, navegador]`. Con cualquiera de los dos en rojo, GitHub ni siquiera crea el job de despliegue.
- **La barrera no nace en rojo.** Los siete scripts del job hermético pasaron en verde en la primera pasada válida, y antes de eso se corrieron los siete a mano en local. `check:encoding`, que salía 1 sobre el repositorio limpio, ya sale 0.
- **En un Pull Request `VPS_SSH_KEY` no se expone.** Los jobs `pruebas` y `navegador` no referencian ningún `secrets.*` —hay exactamente dos apariciones de `secrets.` en todo el archivo, las dos dentro del paso de despliegue—, y ese job queda `skipped` en PR. Verificado en la pasada real, no leído del YAML.
- **La espera al servidor no es un `sleep`.** `tools/esperar-servidor.js` preguntó, falló el primer intento y entró al segundo: *«El sitio responde (HTTP 200) en http://127.0.0.1:8080/ tras 0.5 s y 2 intento(s)»*. Un `sleep 0` habría fallado; un `sleep 30` habría regalado 29 segundos en cada pasada.

## Commits

1. **Tarea 1: engines, el ayudante de espera y el comprobador de codificación** — `819b9c0` (feat)
2. **Tarea 2: los dos jobs de pruebas en el flujo** — `e16c2ba` (feat)
3. **Desviación 1: la base desechable fuera del contexto `runner`** — `b71ff3c` (fix)
4. **Desviación 2: el sandbox de Chrome en el runner** — `85cddf6` (fix)

Los cuatro están en la rama `gsd-inicializacion` y empujados al **PR #23**, que ya estaba abierto. `main` no recibió ningún empujón: sigue en `49696af`.

## Archivos creados y modificados

- `tools/esperar-servidor.js` *(nuevo)* — espera activa contra la URL con el módulo `http`. `--url`, `--intentos` (60) y `--espera` (500 ms). Cualquier respuesta por debajo de 500 cuenta como «ya escucha». Tope por intento para que un puerto que acepta pero no contesta no lo cuelgue. Sale 0 al lograrlo con el tiempo que tardó; sale 1 al agotarse, diciendo la URL y los intentos.
- `.github/workflows/desplegar.yml` — tres jobs, disparado por `pull_request`, `push` a `main` y `workflow_dispatch`. Conserva el bloque de cabecera sobre la orden forzada en `authorized_keys` y el auto-revertido del servidor.
- `package.json` — campo `engines` con `node` en `">=22.5"`, entre `scripts` y `devDependencies`. Cero dependencias nuevas.
- `tools/fix-encoding.js` — dos caracteres más en `PERMITIDO` y el porqué escrito al lado.

## La pasada del Pull Request (tarea 3)

PR: **#23** — <https://github.com/victoremilio27-code/mercamaquinarias-website/pull/23>
Pasada verde: `36098363970`, evento `pull_request`, commit `85cddf6`.

| Job | Resultado | Duración | Tope | Consumo del tope |
|---|---|---|---|---|
| `pruebas` | verde | **15 s** | 10 min | 2,5 % |
| `navegador` | verde | **1 min 49 s** | 15 min | 12 % |
| `desplegar` | **omitido** (`skipping`) | — | 5 min | — |

Ninguno se acerca al 70 % del tope, así que **los topes de 10 y 15 minutos se quedan como están**. El paso más lento con diferencia es `Auditorias` (1 min 14 s), seguido de `Enlaces` (19 s).

Los cuatro puntos que pedía la tarea 3:

1. **`pruebas` y `navegador` aparecen como comprobaciones del PR y las dos terminan en verde.** `gh pr checks 23` las lista con sus tiempos.
2. **`desplegar` sale omitido en la pasada del PR.** Es la prueba de que un PR no despliega y de que la llave no se entrega a ningún paso.
3. **Tiempos:** los de la tabla de arriba.
4. **El nombre del paso que falla se lee en el registro.** No hubo que provocarlo: la pasada `36098249191` cayó de verdad y se leyó `X Auditorias` con su salida completa, sin entrar al VPS. Además se subió el artefacto `registro-del-servidor` (308 bytes), que es el camino previsto para leer qué dijo el servidor.

## Hallazgos de las auditorías que no suspenden nada

`auditar-publico.js` y `auditar-flujos.js` no llaman a `process.exit`: imprimen sus hallazgos y salen 0 (hallazgo 1 del plan, confirmado). En la pasada verde quedaron escritos en el registro del PR:

| Script | Recuento | Detalle |
|---|---|---|
| `auditar-publico` | **1 hallazgo** | `[HTTP 404] Perfil de dealer: /api/dealers/maquinarias-del-caribe` → `perfil de dealer carga: NO` |
| `auditar-flujos` | 0 hallazgos | — |
| `auditar-permisos` | 0 fallos de autorización | — |
| `verificar-taxonomia` | Sin incoherencias | 16 categorías, 71 subcategorías, 146 marcas, 2391 modelos |

**Sobre el hallazgo del perfil de dealer:** no es un artefacto del runner. Se reprodujo **idéntico en local**, con una base desechable recién sembrada y el sitio levantado a mano: `/api/dealers/maquinarias-del-caribe` responde 404 y la página pública del dealer no carga, aunque `tools/seed.js:77` crea «Maquinarias del Caribe» y el propio seed dice «2 con perfil público». Es un fallo preexistente del sitio, no de esta fase, y **no se ha tocado**: el plan prohíbe expresamente código de aplicación aquí. Hoy no suspende nada porque `auditar-publico` sale 0.

### Recomendación pendiente (fase decimal, no bloquea la fusión)

**Darles código de salida a `auditar-publico.js` y `auditar-flujos.js`.** Mientras no lo tengan, la mitad de `npm run auditar` no puede suspender una fusión. No se hace aquí por lo que ya decía el plan —poner el CI en rojo desde el primer día bloquearía a las dos personas por hallazgos que no rompieron—, y ahora además se sabe el número exacto que habría que allanar antes: **1 hallazgo**, el 404 del perfil de dealer. Trabajo sugerido: arreglar ese 404 y, en el mismo paso, hacer que los dos scripts salgan 1 cuando `fallos` no esté vacío.

## Decisiones tomadas

Las cuatro del plan (D-01 a D-04) se mantienen sin cambios, incluida D-01-bis: `check:encoding` se arregló y entró en la barrera. Se añaden dos decisiones nuevas, las dos forzadas por lo que GitHub respondió de verdad:

- **La ruta de la base desechable va literal (`/tmp/ci-mercamaquinarias.db`) y no con una expresión sobre `runner`.** Ver desviación 1.
- **El sandbox de Chrome se habilita en el runner con `sysctl`, no con `--no-sandbox` en las herramientas.** El runner es desechable; la máquina de casa no, y ahí el sandbox tiene que seguir puesto. Además, tocar `tools/auditar-publico.js` y compañía estaba fuera de los archivos permitidos en esta fase.

## Desviaciones del plan

### Arreglos automáticos

**1. [Regla 3 — Bloqueante] `${{ runner.temp }}` en el `env` de un job invalida el flujo entero**

- **Encontrado en:** tarea 3, primera pasada contra GitHub.
- **Problema:** el contrato del plan fijaba `MERCA_DB: ${{ runner.temp }}/ci.db` en el `env` del job `navegador`. El contexto `runner` **no está disponible en `jobs.<id>.env`**, solo en el `env` de un paso. GitHub no señala el paso: rechaza el archivo completo con «Unrecognized named-value: runner». El síntoma fue una pasada fallida **sin un solo job**, con el nombre del archivo (`.github/workflows/desplegar.yml`) en lugar del nombre del flujo. Ningún `pull_request` llegó a dispararse.
- **Arreglo:** ruta literal `MERCA_DB: /tmp/ci-mercamaquinarias.db`, que en `ubuntu-latest` es del runner y se tira con él. El punto del contrato que sí importaba —que `MERCA_DB` esté en el `env` del **JOB** y no delante de un comando, para que el hijo que lanza `auditar-flujos.js` con `execFileSync` vea la misma base— se mantiene intacto. Queda comentado en el YAML por qué no se usa la expresión.
- **Archivos:** `.github/workflows/desplegar.yml`
- **Verificación:** la pasada siguiente ya parsea (`name: Verificar y desplegar`, evento `pull_request`) y en el registro se lee `MERCA_DB: /tmp/ci-mercamaquinarias.db`.
- **Commit:** `b71ff3c`

**2. [Regla 3 — Bloqueante] Chrome no arranca en `ubuntu-latest` sin bajar la restricción de AppArmor**

- **Encontrado en:** tarea 3, primera pasada válida.
- **Problema:** el paso `Auditorias` murió con `FATAL ... No usable sandbox!`. Desde Ubuntu 23.10, AppArmor prohíbe los espacios de nombres de usuario sin privilegios, y el sandbox de Chrome se apoya en ellos. Puppeteer no llegaba ni a abrir la primera página; no era un hallazgo de auditoría.
- **Arreglo:** un paso nuevo en `navegador`, antes de la siembra: `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`. Se descartó meter `--no-sandbox` en `tools/auditar-publico.js`, `auditar-flujos.js`, `check-links.js` y `check-motion.js` por dos razones: esos archivos están fuera de lo que esta fase puede tocar, y esas herramientas también se corren en la máquina de casa, donde el sandbox sí debe seguir activo.
- **Archivos:** `.github/workflows/desplegar.yml`
- **Verificación:** pasada `36098363970` en verde, con `Auditorias`, `Enlaces` y `Movimiento` los tres en verde.
- **Commit:** `85cddf6`

### Desviación de proceso, por instrucción de Victor

La tarea 3 del plan decía crear una rama nueva (`ci/barrera-de-pruebas`) y abrir un Pull Request. **Victor indicó trabajar sobre la rama actual `gsd-inicializacion`, cuyo PR #23 ya estaba abierto, para fusionar una sola vez.** Se hizo así: cuatro commits empujados a esa rama, ningún PR abierto ni fusionado, `main` sin tocar. El resto de la tarea 3 —comprobar la pasada contra GitHub— se cumplió igual y con los mismos criterios.

---

**Total de desviaciones:** 2 arregladas automáticamente (2 × Regla 3) + 1 de proceso por instrucción explícita.
**Impacto:** ninguna amplía el alcance. Las dos automáticas eran condición necesaria para que el flujo existiera; sin ellas el plan habría quedado «verde en el YAML y rojo en GitHub», que es justo lo que esta fase existe para impedir.

## Problemas encontrados

- **No hay ningún analizador de YAML en esta máquina** y no se puede añadir uno (cero dependencias nuevas, regla del repositorio). Se escribió una revisión estructural a mano —tabuladores, sangrías impares, llaves de expresión descuadradas, claves de primer nivel, jobs esperados y ausencia de `secrets.` fuera del despliegue— pero **esa revisión dio «sin fallos» sobre el archivo que GitHub rechazó**. Queda dicho sin adornos: la sintaxis de un flujo y la disponibilidad de los contextos **solo las valida GitHub**, y la única forma honesta de comprobarlo fue empujar y mirar la pasada. Así se hizo, y así se encontraron las dos desviaciones.
- La primera pasada fallida (`36097932573`) aparece como `push` sobre `gsd-inicializacion` aunque el flujo solo se dispara con `push` a `main`: es cómo GitHub avisa de un archivo de flujo inválido. Queda en el historial de Actions y no hace falta tocarla.

## Lo que NO se pudo comprobar desde aquí

Para que no se dé por hecho nada que no se haya visto:

- **Que fusionar a `main` despliega igual que hoy.** El job `desplegar` solo corre con `github.ref == 'refs/heads/main'`, así que la única forma de probarlo es fusionar, y esto no fusiona nada. Lo que sí está comprobado: el job existe, queda `skipped` en PR por el motivo correcto, conserva la misma acción `appleboy/ssh-action@v1`, el mismo `host`, el mismo `username: deploy` y **la misma orden** `sudo -n /usr/local/bin/desplegar-mercamaquinarias`. No se ha tocado ni un carácter de esa orden. Queda como verificación del plan `01-03`.
- **Que un PR de un fork corre sin secretos.** Es el comportamiento documentado de `on: pull_request` frente a `pull_request_target`, y el archivo no menciona `pull_request_target` en ningún sitio; pero no hay ningún fork de este repositorio con el que provocarlo.
- **La protección de rama.** No es de este plan: es el `01-02`, y es un ajuste del repositorio que solo Victor puede hacer. Hasta entonces, la barrera impide *desplegar* con las pruebas en rojo, pero **no impide *fusionar*** un PR en rojo.

## Avisos del runner que no rompen nada

Conviene tenerlos anotados antes de que sorprendan:

- `actions/checkout@v4`, `actions/setup-node@v4` y `actions/upload-artifact@v4` apuntan a Node.js 20, ya obsoleto, y el runner las fuerza a Node.js 24. Funcionan, pero tocará subirlas a `@v5` cuando GitHub las retire.
- «La etiqueta `ubuntu-latest` migrará a Ubuntu 26 a partir del 19 de octubre de 2026.» Merece una pasada de comprobación cuando llegue.

## Configuración manual pendiente

Ninguna en este plan. La del plan `01-02` (proteger `main` exigiendo las comprobaciones `pruebas` y `navegador`) sigue pendiente y es de Victor.

## Listo para lo siguiente

- **`01-02` puede empezar ya:** las comprobaciones `pruebas` y `navegador` existen con esos nombres exactos en el PR #23, que es lo que hay que marcar como obligatorio en Settings → Branches.
- **Para la Fase 2:** el comprobador de contraste se engancha añadiendo `&& node tools/check-contraste.js` al final de `npm run auditar` en `package.json`. No hay que tocar el flujo: el paso `Auditorias` lo recogerá solo.
- **Aviso:** `CLAUDE.md` todavía dice «No hay barrera de pruebas en CI todavía». Es el plan `01-03`, y hasta que se fusione esa frase seguirá siendo cierta a medias.

---
*Fase: 01-barrera-de-pruebas-en-la-fusi-n*
*Terminado: 2026-09-25*

## Self-Check: PASSED

Comprobado en disco y en el historial: los cuatro archivos existen y los cuatro commits (`819b9c0`, `e16c2ba`, `b71ff3c`, `85cddf6`) están en la rama. Nada de lo afirmado arriba se dio por hecho.
