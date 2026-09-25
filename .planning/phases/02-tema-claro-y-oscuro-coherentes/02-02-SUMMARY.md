---
phase: 02-tema-claro-y-oscuro-coherentes
plan: 02
subsystem: ui
tags: [tema, theme-color, meta, movil, tema-oscuro, sin-dependencias]

# Grafo de dependencias
requires:
  - phase: "02-01 (paralelo, misma ola)"
    provides: "Los bloques de tema de `styles.css` con `--app-bg` en `#F4F4F1` y `#191A1A`, que son los dos valores que este plan copia al meta"
provides:
  - "`barra(t)` en `assets/tema.js`: escribe `meta[name=theme-color]` con el fondo del tema activo"
  - "La barra del navegador cambia al pulsar el botón del tema, en los dos sentidos"
  - "El color queda fijado mientras el navegador todavía analiza la página (`readyState=loading`): sin destello"
  - "18 páginas sin el `#071A2B` fijo del meta; `proximamente.html` conserva el suyo a propósito"
affects: ["02-05 literales de la hoja de estilos", "02-06 verificación de la fase", "cualquier página nueva que nazca con su propio meta"]

# Tecnología
tech-stack:
  added: []
  patterns:
    - "El fondo de la aplicación vive en dos sitios (`--app-bg` y `barra()`) porque un meta no entiende de variables CSS; queda escrito en el comentario de `barra()`"
    - "Lo que tiene que estar puesto antes de pintar se fija en el cuerpo del módulo, no en `DOMContentLoaded`"

key-files:
  created: []
  modified:
    - assets/tema.js
    - index.html
    - equipos.html
    - equipo.html
    - categorias.html
    - alquiler.html
    - transporte.html
    - importar.html
    - financiamiento.html
    - dealers.html
    - dealer.html
    - contacto.html
    - legal.html
    - cuenta.html
    - publicar.html
    - panel.html
    - admin.html
    - mi-pagina.html
    - planes.html
    - proximamente.html

key-decisions:
  - "D-A: `proximamente.html` se queda con `#071A2B`. No carga `tema.js` y ese color es su propio fondo; darle el hueso del tema claro sería una barra blanca sobre una página azul, y sin nada que lo corrigiera después"
  - "D-B: el meta conserva un valor escrito (`#F4F4F1`) en vez de vaciarse: es el punto de partida sin JavaScript, y un `content` vacío deja la barra en el gris del navegador, que no es ninguno de los dos temas"
  - "D-C: `barra()` se llama desde el arranque del módulo además de desde `aplicar()`; esperar a `DOMContentLoaded` deja la barra clara durante toda la carga a quien entra en oscuro"
  - "D-D: los tres `#071A2B` del degradado del héroe de `index.html` y los dos de `proximamente.html` no se tocan aquí; se anotan para `02-05`"

patterns-established:
  - "Cualquier color que el tema tenga que mover y no pueda ser una variable CSS se sincroniza desde `tema.js`, junto a los logotipos y el botón"

requirements-completed: []          # UI-01 no se marca aquí: es de toda la fase
requirements-partial: [UI-01]       # la barra del navegador deja de ser un color fijo; quedan los literales de `styles.css` (02-05)

# Métricas
duration: 7min
completed: 2026-09-25
---

# Fase 2 Plan 02: La barra del navegador sigue al tema — Resumen

**La barra del navegador del móvil deja de ser el azul noche de la marca vieja y pasa a tomar el fondo del tema activo: `#F4F4F1` en claro y `#191A1A` en oscuro, comprobado en un navegador de verdad cambiando de tema en los dos sentidos y recargando con el oscuro puesto sin que la barra pase un solo instante por el claro.**

## Rendimiento

- **Duración:** ~7 min
- **Empezado:** 2026-09-25T06:14Z
- **Terminado:** 2026-09-25T06:21Z
- **Tareas:** 2 de 2
- **Archivos modificados:** 20 (`assets/tema.js` + 19 páginas)

## Lo conseguido

- **`assets/tema.js` gana `barra(t)`**, hermana de `logos(t)` y `boton(t)`. Escribe el `content` del meta con `#191A1A` cuando el tema es `dark` y `#F4F4F1` en cualquier otro caso — los valores exactos de `--app-bg` de cada bloque de tema, dicho en el comentario para que quien cambie el fondo sepa que hay un segundo sitio que mover.
- **Se llama desde los dos puntos que hacían falta:** desde `aplicar(t)`, para que el botón mueva la barra en el momento, y desde el arranque del módulo, que corre en el `<head>` antes de pintar.
- **Se confirmó que no hay destello, y no de oídas.** Un `MutationObserver` puesto antes de que corra ningún script de la página anotó la línea de tiempo del meta al recargar con el tema oscuro guardado: `[{"valor":"#191A1A","estado":"loading"}, {"valor":"#191A1A","estado":"interactive"}]`. El primer valor escrito ya es el oscuro, se escribe con `readyState=loading` —es decir, mientras el navegador todavía analiza la página— y en ningún momento pasa por el claro.
- **18 páginas sin el color fijo.** Las que cargan `tema.js` pasaron de `content="#071A2B"` a `content="#F4F4F1"`. Un renglón cambiado por archivo.
- **`tema.js` no lanza en una página sin el meta.** Probado de verdad: un documento servido desde el mismo origen, con el script y sin meta; el `data-theme` se puso igual y no hubo ni una excepción ni un error en consola.

## Commits

1. **Tarea 1: `tema.js` sincroniza también la barra del navegador** — `69f25df` (feat)
2. **Tarea 2: fuera el azul marino fijo de las páginas** — `270a72a` (feat)

Los dos en la rama `gsd-inicializacion`, que es la del **PR #23**. Ni rama nueva, ni PR abierto, ni `main` tocado.

## La prueba en el navegador

El plan pedía comprobarlo en el sitio levantado, y se hizo con puppeteer —el que ya está en el repositorio, sin añadir nada— contra `http://127.0.0.1:8080`. Las dieciséis comprobaciones salieron en verde:

| # | Comprobación | Resultado |
|---|---|---|
| 1 | Al cargar en claro, el meta vale `#F4F4F1` | ok |
| 2 | Al pulsar el botón, pasa a `#191A1A` y el `data-theme` es `dark` | ok |
| 3 | Al volver a pulsar, vuelve a `#F4F4F1` | ok |
| 4 | Con el oscuro guardado, el primer valor escrito es el oscuro, con `readyState=loading` | ok |
| 5 | Y no pasa por el claro en ningún momento | ok |
| 6 | Sin elección guardada y el sistema en oscuro, `equipos.html` sale con la barra oscura | ok |
| 7 | Una página sin el meta no rompe el arranque ni lanza | ok |
| 8 | Las 16 páginas restantes con `tema.js` llevan `#F4F4F1` | ok |
| 9 | `proximamente.html` conserva `#071A2B`, el mismo `rgb(7, 26, 43)` de su fondo | ok |

El guion de la prueba es de usar y tirar; vive en el directorio temporal de la sesión, no en el repositorio (el plan no contemplaba añadir pruebas, y `02-03` trae el comprobador de contraste, que es el que se queda).

## Suites del repositorio

| Suite | Resultado |
|---|---|
| `npm run check` | **Sin problemas.** 15 destinos internos distintos |
| `npm run auditar:publico` | **0 hallazgos**, incluido el repaso responsive a 390/768/1440 px |
| `npm run check:encoding` | **0 archivos por reparar.** Importa aquí: ver la desviación 1 |
| `npm run auditar` (entero) | Sale 1, por hallazgos **ajenos a este plan**: ver abajo |

**Sobre `npm run auditar` entero:** falla en los flujos autenticados, no en nada que este plan toque. Se corrió dos veces seguidas y dio distinto —2 hallazgos la primera, 4 la segunda—, y en la segunda apareció *«Demasiadas cuentas creadas desde esta conexión. Inténtelo más tarde»*: es el limitador de altas del propio sitio respondiendo a las pasadas repetidas, con el agravante de que ahora mismo hay otro plan de esta misma ola trabajando contra el mismo servidor y la misma base. Un cambio de un atributo `content` y una función que escribe un meta no pueden vaciar la cola de revisión del administrador. **No se ha tocado nada de eso**, y la parte de `auditar` que sí cubre estos archivos —`auditar:publico`— sale en verde y en 0.

## Desviaciones del plan

### 1. [Regla 1 — Fallo] `proximamente.html` no lleva el meta al claro: se queda con su azul

- **Encontrado en:** tarea 2, comprobando qué páginas cargan `tema.js` antes de tocarlas.
- **Lo que decía el plan:** las 19 páginas a `content="#F4F4F1"`.
- **Lo que hay:** `proximamente.html` **no carga `assets/tema.js`** — es la única de las 19 que no lo hace. Es la página de espera, y `deploy/VERCEL.md` explica por qué es autónoma a propósito: `vercel.json` manda *todas* las rutas ahí con la forma antigua (`routes`), así que la página no puede depender de ningún archivo del sitio. Lleva sus estilos dentro, define su propio `--azul: #071A2B` y **su fondo es exactamente ese color** (comprobado en el navegador: `rgb(7, 26, 43)`).
- **Por qué no se siguió el plan al pie de la letra:** el plan razona el cambio diciendo que `#071A2B` «es un color que el sitio ya no usa». En esta página sí se usa: es el fondo. Ponerle `#F4F4F1` habría dejado la barra del teléfono **blanca sobre una página azul marino, de forma permanente**, porque ahí no hay ningún script que la corrija después. Y no es una página cualquiera: con `vercel.json` todavía en el repositorio y el dominio apuntando a Vercel, es **lo que ve hoy cualquiera que entre a mercamaquinarias.com**.
- **Qué se hizo en su lugar:** se dejó `content="#071A2B"` y se escribió encima un comentario que dice por qué, para que nadie lo «arregle» dentro de seis meses. Es el único cambio del archivo.
- **Consecuencia sobre el plan:** la verificación automática de la tarea 2 pedía cero `#071A2B` en las 19 páginas y no pasa tal cual. Se corrió la misma comprobación acotada a **las páginas que cargan `tema.js`**: 18 de 18 con el meta al claro y ninguna con `content="#071A2B"`.
- **Archivos:** `proximamente.html`
- **Commit:** `270a72a`

### 2. [Regla 3 — Bloqueante] `sed -i` convirtió las 18 páginas a LF

- **Encontrado en:** tarea 2, justo después de la sustitución.
- **Problema:** la sustitución se hizo con `sed -i`, y en el bash de Windows eso reescribe el archivo entero con saltos LF. Las 18 páginas se quedaron sin un solo `\r`, contra lo que pide el plan y el `CLAUDE.md` (el repositorio es CRLF salvo `styles.css`). No se vio en `git diff` —con `core.autocrlf=true` el índice normaliza y el diff seguía saliendo de un renglón—, pero `git add` lo cantó: *«LF will be replaced by CRLF the next time Git touches it»* en los 18.
- **Arreglo:** un guion de un solo uso devolvió los CRLF leyendo y escribiendo en `latin1`, byte a byte, para no tocar el UTF-8 del contenido. **Antes del commit.**
- **Verificación:** las 19 páginas con tantos `\r` como renglones (`index.html` 515/515, `publicar.html` 428/428, y así). `git diff --stat` da un renglón cambiado por página, no el archivo entero. `npm run check:encoding` sale 0 y sin caracteres sospechosos, que es lo que descarta que el rodeo por `latin1` estropeara ninguna tilde. En el diff se leen intactas «término» y «grúas».
- **Archivos:** las 18 páginas
- **Commit:** `270a72a` (el arreglo entró antes de commitear; en el historial no queda ni un commit en LF)

## Hallazgo para el plan 02-05: el `#071A2B` no estaba solo en el meta

El plan daba por comprobado que, fuera de los 19 metas, solo quedaban **3 apariciones y las tres en `styles.css`**. No es así. Quedan **8 en archivos que sirven al sitio**, y ninguna se ha tocado aquí, como el propio plan manda:

| Archivo | Renglón | Qué es |
|---|---|---|
| `index.html` | 95, 96, 97 | Las tres paradas del degradado `#desvanece`, en el SVG del plano del héroe (`stop-color`, con opacidades 1, .82 y 0) |
| `proximamente.html` | 39 | `--azul: #071A2B` en su hoja de estilos en línea — la página es autónoma, no hereda de `styles.css` |
| `proximamente.html` | 153 | El relleno del hexágono interior del isotipo, también en línea |
| `styles.css` | 13, 23, 863 | Las tres que el plan sí esperaba: la tabla de la cabecera, `--azul` y `--oferta-tinta` |

**Los tres de `index.html` son los que importan para la fase.** Son un degradado azul noche pintado sobre el héroe de la portada, con color escrito a mano dentro del SVG, y por tanto no se mueven cuando el tema cambia — exactamente lo que `UI-01` persigue. **No están en `styles.css`, así que `02-05` no los va a encontrar si solo mira la hoja de estilos.** Conviene ampliarle el alcance o darles un plan.

Los de `proximamente.html` son de la página autónoma y deben quedarse: ahí ese azul es la identidad de la página, no un descuido. Fuera del sitio servido, `#071A2B` sigue apareciendo en `tools/correo.js` (las plantillas de correo, donde tampoco hay variables CSS que valgan) y en `brand_assets/`, que es el paquete de marca. Ninguno de los dos es cosa de esta fase.

## Formato del meta en las páginas

El plan preguntaba si alguna lo llevaba distinto. **Ninguna.** Las 19 tenían el renglón idéntico, carácter por carácter: `<meta name="theme-color" content="#071A2B">`, sin variantes de espaciado ni de mayúsculas. Lo que sí cambia es dónde está: renglón 8 en quince páginas, 9 en `legal.html`, 11 en `index.html` y 12 en `financiamiento.html` y `transporte.html`. En las 18 que cargan `tema.js` el meta va **antes** que el `<script>` (que cae entre el 28 y el 32), que es lo que permite fijar la barra en el arranque sin esperar a nada. Comprobado archivo por archivo, no supuesto.

## Modelo de amenazas

- **T-02-03 (mitigada).** `barra()` sale con `if (!m) return;` cuando no hay meta. Probado en el navegador con un documento sin él: el arranque del tema siguió corriendo y no hubo excepción. Era lo que importaba, porque esto corre en el `<head>`: una excepción aquí se llevaría por delante el resto del arranque.
- **T-02-04 y T-02-05 (aceptadas).** No se tocó `preferido()` ni el `try/catch` del almacenamiento. El valor de `localStorage` se sigue comparando contra `'dark'` y `'light'` y nunca se interpola: lo que llega al meta es uno de dos literales escritos en el propio archivo, jamás algo que venga de fuera.
- **T-02-SC (mitigada).** **Cero dependencias nuevas.** No se ejecutó ningún instalador. `package.json` no se tocó.

## Lo que NO se ha tocado

- **`styles.css`**, por instrucción expresa: otro plan de esta misma ola lo está editando. Llegó a estar **preparado en el índice** por ese otro plan mientras yo trabajaba, así que el commit de la tarea 2 se hizo acotado a mis rutas (`git commit -- <archivos>`) para no arrastrarlo. Comprobado después: `styles.css` sigue preparado y sin commitear por mí, y `tools/check-contraste.js` sigue modificado en el árbol.
- **`STATE.md`, `ROADMAP.md` y `REQUIREMENTS.md`.** Hay tres planes corriendo a la vez sobre esta rama y escribir los tres en los mismos archivos de estado es pisarse. Queda para quien cierre la ola. `UI-01` **no está terminado** con esto: falta `02-05`.

---
*Fase: 02-tema-claro-y-oscuro-coherentes*
*Terminado: 2026-09-25*

## Self-Check: PASSED

Comprobado en disco y en el historial, no dado por hecho: `assets/tema.js` existe con `barra()` definida en el renglón 53, llamada desde `aplicar()` en el 66 y desde el arranque del módulo en el 100; los dos commits (`69f25df`, `270a72a`) están en la rama `gsd-inicializacion`; ninguno de los dos borra un solo archivo; los tres `stop-color` del héroe de `index.html` siguen intactos, como dice este resumen; y las 19 páginas conservan CRLF.
