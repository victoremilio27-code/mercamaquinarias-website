---
phase: 02-tema-claro-y-oscuro-coherentes
plan: 03
subsystem: testing
tags: [contraste, wcag, tema-oscuro, puppeteer, auditoria, sin-dependencias]

# Grafo de dependencias
requires:
  - phase: "01 (barrera de CI)"
    provides: "`npm run auditar` dentro del job `navegador`, con el sitio levantado, la base sembrada y el hábito de salir 1 cuando hay hallazgos"
provides:
  - "`tools/check-contraste.js`: recorre 17 rutas × 2 temas y mide texto, controles y dinamismo sobre el estilo calculado"
  - "Cuatro etiquetas de salida que son contrato para los planes 02-04 y 02-05: `texto`, `control`, `dinamismo` y `navegacion`"
  - "`npm run check:contraste`, y el mismo comprobador como último eslabón de `npm run auditar`"
  - "La foto del «antes»: 621 hallazgos sobre el código del 25 de septiembre"
  - "Seis excepciones declaradas, cada una con su razón escrita al lado"
affects: ["02-04 el ámbar y el borde de control", "02-05 los literales de la hoja", "02-06 verificación y cierre de la fase", "fases 4 a 10: toda pantalla nueva pasa por aquí"]

# Tecnología
tech-stack:
  added: []
  patterns:
    - "La aritmética WCAG (luminancia relativa y razón de contraste) escrita a mano en dos funciones puras, sin paquete"
    - "El fondo efectivo se compone capa a capa subiendo por los padres, como `ajustarContraste` en `assets/app.js`: un rgba tomado como opaco da un número que no es el que se ve"
    - "El tema se fija sembrando `mm-tema` con `evaluateOnNewDocument`, no con `emulateMediaFeatures`: una elección guardada manda sobre el sistema y es el camino que usa la gente"
    - "Clave estable por elemento (ruta de índices desde `body` + tagName + clases) para cruzar dos pasadas distintas; las claves que solo salen en una se ignoran"
    - "Las cegueras de la herramienta van escritas en su propia cabecera, no en un documento aparte"

key-files:
  created:
    - tools/check-contraste.js
  modified:
    - package.json

key-decisions:
  - "El comprobador nace en rojo y eso es la prueba de aceptación: sale 1 y confirma con sus propios números los tres que midió el diagnóstico"
  - "Va al final de la cadena `auditar`: es el más caro y el que menos aporta si los anteriores ya encontraron el sitio roto"
  - "No se tocó `.github/workflows/desplegar.yml`: el job `navegador` ya lo alcanza por `npm run auditar`, y un paso propio lo ejecutaría dos veces"
  - "Un control sin borde ni relleno propio no se reporta: se identifica por su texto, que ya mide la regla 1"
  - "El catálogo vacío no es un hallazgo: se avisa y se salta la ficha de equipo"

patterns-established:
  - "Las excepciones se declaran con su razón al lado y se comprueban con `closest`, para que una entrada exima también a los hijos"
  - "Una excepción nueva no se añade en el plan que la descubre: se anota y la decide quien tenga la hoja ya convertida delante"

requirements-completed: [UI-03]

# Métricas
duration: 30min
completed: 2026-09-25
---

# Fase 2 Plan 03: El comprobador de contraste y dinamismo

**Una orden recorre 17 rutas en los dos temas, mide el contraste real del estilo
calculado y señala los elementos cuyo color no se mueve mientras su fondo sí: 621
incumplimientos sobre el código de hoy, y sale 1.**

## Rendimiento

- **Duración:** 30 min
- **Empezado:** 2026-09-25T05:57Z
- **Terminado:** 2026-09-25T06:27Z
- **Tareas:** 3 de 3
- **Archivos tocados:** 2 (uno nuevo, uno modificado)

## Lo que quedó hecho

- `tools/check-contraste.js`, 530 líneas, sin más dependencia que `puppeteer`, que ya
  estaba. La aritmética WCAG va escrita a mano.
- Las tres reglas del contrato: texto a 4.5:1 (3:1 en fuente grande), contorno de
  control a 3:1 y dinamismo entre temas.
- `npm run check:contraste` existe y `npm run auditar` termina con él, así que el job
  `navegador` del flujo lo corre sin que el YAML se haya tocado.
- La foto del «antes» medida y anotada, que es lo que llevará la tabla del PR.

## Commits por tarea

1. **Tarea 1: el recorrido y las dos reglas de contraste** — `7e91e37` (feat)
2. **Tarea 2: la regla del dinamismo y las excepciones declaradas** — `f9abcc8` (feat)
3. **Tarea 3: colgarlo de la cadena auditar** — `3f1adba` (chore)

## Archivos

- `tools/check-contraste.js` — el recorrido completo, las tres reglas, las seis
  excepciones y las tres cegueras escritas en la cabecera.
- `package.json` — dos líneas: el guion `check:contraste` junto a `check:motion`, y
  `&& node tools/check-contraste.js` al final de la cadena `auditar`. Nada más.

## La foto del «antes»

Medido el 25 de septiembre contra el sitio levantado en local con `npm run db:demo`.
**Sale 1**, que es lo que el plan pedía (D-01).

### Por tipo

| tipo | hallazgos | qué es |
|---|---|---|
| `control` | 271 | contornos y rellenos de botón, `input`, `select` y `textarea` por debajo de 3:1 |
| `dinamismo` | 216 | elementos cuyo fondo efectivo cambia de tema y cuyos tres colores no se mueven |
| `texto` | 134 | texto por debajo de su umbral contra el fondo que de verdad tiene detrás |
| `navegacion` | 0 | las 17 rutas cargaron |
| **total** | **621** | |

### Por tema

| tema | hallazgos |
|---|---|
| claro | 201 |
| oscuro | 204 |
| ambos (dinamismo, que por definición es de los dos a la vez) | 216 |

### Los números del diagnóstico, confirmados uno a uno

La herramienta reproduce exactamente la tabla del plan aprobado, que es la señal de que
la aritmética está bien y no de que coincidan por casualidad:

| lo que midió el diagnóstico | lo que mide la herramienta |
|---|---|
| `--app-line` sobre `--app-card`, claro: **1.30** | `a.btn.btn--linea` — `border-color rgb(226, 226, 220)` sobre `rgb(255, 255, 255)` · **1.30:1** |
| `--app-line` sobre `--app-card`, oscuro: **1.66** | `border-color rgb(54, 56, 56)` sobre `rgb(11, 12, 12)` · **1.66:1**, en 47 elementos |
| `--app-line` sobre `--app-bg`, claro **1.18** / oscuro **1.48** | `button.carrusel__flecha` · **1.18:1**; y **1.48:1** en 55 elementos del oscuro |
| `--app-soft` sobre `--app-card`, claro: **1.16** | `input#h-q`, `select#h-cat`, `select#h-prov` — relleno `rgb(238, 238, 234)` · **1.16:1** |
| `--ambar-hondo` por debajo de 4.5 | `a.enlace-mas` — `rgb(154, 104, 0)` sobre `rgb(244, 244, 241)` · **4.38:1** |
| `.perfil__texto` en oscuro, «invisible» | `p.perfil__texto` en `dealer.html` — `rgb(213, 222, 229)` sobre `rgb(247, 245, 239)` · **1.25:1** |

Sobre ese último: el diagnóstico lo anotó como **1.31:1** y la herramienta mide
**1.25:1**. No es un desacuerdo, es que la herramienta compone el fondo real
(`#F7F5EF`, que es `--azul` en oscuro) y `#D5DEE5` sobre `#F7F5EF` da 1.25 exacto,
comprobado a mano aparte. El 1.31 del diagnóstico salió de un par de colores
ligeramente distinto. **La conclusión no cambia: es invisible.**

### Los cinco elementos que más se repiten

Casi todos los hallazgos son pocos defectos multiplicados por las tarjetas del catálogo:

| selector | veces | tipo |
|---|---|---|
| `svg` dentro de la tarjeta de equipo (icono blanco fijo) | 96 | dinamismo |
| `span.aviso__fotos` (velo `rgba(7, 26, 43, .78)` fijo) | 95 | dinamismo |
| `span.marca-esq` («Destacado», crema sobre ámbar, 1.84:1) | 47 | texto |
| `button#temaToggle` (borde a 1.29:1) | 17 | control |
| `a.skip` («Saltar al contenido», 1.84:1 sobre ámbar) | 17 | texto |

## Cuánto cuesta una pasada

- **Local, 17 rutas × 2 temas = 34 cargas:** **54-55 s** medidos tres veces seguidas.
- **El job `navegador` hoy, sin esto:** **108 s** (pasada `36100292243`, 05:51:04 →
  05:52:52), contra un tope de **15 minutos = 900 s**.
- **Estimación con el eslabón puesto:** ~165 s, **el 18 % del tope**. El plan pedía
  avisar si se acercaba al 70 % (630 s). No se acerca, y el tope no se toca.

Recordatorio de D-02 que conviene tener delante al leer el registro del CI: la cadena va
con `&&`. Si `auditar-publico` o `auditar-flujos` encuentran algo, **el contraste no
llega a correr** en esa pasada. «El contraste pasó» y «el contraste no corrió» se ven
igual desde fuera; hay que mirar si la salida imprimió la línea `── Contraste y
dinamismo ──`.

## Las seis excepciones declaradas

Cada una con su razón escrita al lado en el propio archivo, comprobadas con `closest`
para que eximan también a los hijos:

| selector | exime | razón |
|---|---|---|
| `.mosaico__pieza` | regla 3 | superficie oscura a propósito en los dos temas; son fotos |
| `.videos__pieza` | regla 3 | la banda del vídeo es `#000` fijo, convención de reproductor |
| `.foto__sello` | regla 3 | va sobre la fotografía, no sobre la página |
| `.perfil` | regla 3 | cabecera de marca fijada oscura desde el plan 02-05 |
| `.pub-muestra` | regla 3 | `ajustarContraste` le elige el color midiendo el fondo real |
| `.btn--ambar, .cab__nav-cta` | regla 3 | texto `#151515` sobre ámbar de marca, que no se invierte |

Ninguna exime de la regla 1. `.perfil` es el ejemplo de por qué: está exenta del
dinamismo y aun así su `.perfil__texto` sale en la lista, a 1.25:1.

## Para que lo decida el plan 02-06

Nada de esto se ha añadido a `EXCEPCIONES`. Se anota, como pide el contrato, porque una
lista que crece para poner el comprobador en verde es exactamente el fallo que este
comprobador existe para impedir.

**1. El velo de la tarjeta de equipo y su icono — 191 de los 216 hallazgos de
dinamismo.** `span.aviso__fotos` (el contador «4» sobre la foto) lleva
`rgba(7, 26, 43, .78)` fijo y su `svg` va en blanco fijo. Son **dos defectos
multiplicados por cada tarjeta del catálogo**, no 191 problemas. El argumento para
eximirlos es el mismo que ya se aceptó para `.foto__sello`: van sobre una fotografía,
no sobre la página, y su legibilidad no depende del tema. El argumento en contra es que
`#071A2B` es precisamente el azul marino que la fase entera está retirando. **Decidir
con la hoja ya convertida delante**, porque si 02-05 convierte ese literal el caso
desaparece solo y no hace falta excepción ninguna.

**2. `.btn--ambar` y la regla 2.** La excepción del contrato lo exime de la regla 3, no
de la 2, así que el relleno ámbar `rgb(242, 169, 0)` sobre blanco sale a **2.01:1** y se
reporta como control sin contorno suficiente. Es real según WCAG 1.4.11, pero el ámbar
es color de marca y no se puede oscurecer sin cambiar la identidad. La salida que suele
darse a esto es un borde propio, no un ámbar distinto. **No se ha tocado**: lo mira 02-04
al clasificar los 77 usos del ámbar.

**3. `span.marca-esq` y `a.skip`, 64 hallazgos de texto.** Crema `#F7F5EF` sobre ámbar,
1.84:1. Mismo origen que el punto 2 y probablemente el mismo arreglo: ese texto tendría
que ser el `#151515` que ya usa `.btn--ambar`, no crema. **Es un hallazgo de verdad, no
un candidato a excepción**; queda apuntado aquí porque es el más repetido de su tipo y
conviene que 02-04 lo vea junto a lo demás.

**4. `a.btn.btn--linea` en `dealer.html` en oscuro sale a 1.00:1 de texto.** Color
`rgb(11, 12, 12)` sobre `rgb(11, 12, 12)`: negro sobre negro, el botón «Sitio web» del
perfil. Es el caso más extremo que encontró el recorrido y no está en el inventario del
diagnóstico. **Sale de la combinación de `.perfil` con la piel app**, así que lo verá
02-05 al fijar `.perfil`; si no lo arregla, hay que sacarlo aparte.

## Desviaciones del plan

Ninguna en el alcance: los dos archivos tocados son los dos que el plan declaraba.

Dos precisiones que no cambian nada pero conviene que estén escritas:

**El servidor de pruebas se levantó en el puerto 8087, no en el 8080.** El 8080 estaba
ocupado por el servidor de otro ejecutor de esta misma fase. El comprobador se corrió
con `--base http://127.0.0.1:8087` y con su propia base sembrada en el directorio
temporal de la sesión, para no tocar `db/mercamaquinarias.db`. La opción `--base` existe
justo para esto.

**La hoja de estilos se movió entre dos pasadas.** El plan 02-01 fusionó
`el mismo juego de tokens en los dos bloques de tema` (`0407194`) mientras el recorrido
corría. Se nota en el recuento de `texto`, que bajó de 147 a 134 entre la primera pasada
y la definitiva. Los números de arriba son los de la pasada final, **posterior a 02-01 y
anterior a 02-04 y 02-05**, y son una foto de un momento, no una línea base estable. La
línea base la fija 02-06, cuando la ola 2 haya terminado.

## Lo que esta herramienta NO ve

Va escrito en la cabecera del propio archivo, y se repite aquí porque de esto depende que
la verificación humana del 02-06 exista:

- **`:hover`, `:focus` y `:active`.** El estilo calculado de puppeteer es el del reposo.
  El `#FCFBF7` de `.tabla-anuncios tbody tr:hover` —la fila que deslumbra en oscuro— **no
  lo caza este recorrido**.
- **Lo que hay detrás de una sesión.** `panel.html`, `admin.html` y `mi-pagina.html` se
  visitan sin sesión: se mide su muro de acceso, no su contenido.
- **Los avisos de error de formulario**, que solo aparecen al provocar el error.

## Verificación

| # | qué | resultado |
|---|---|---|
| 1 | `node -e "require('./package.json')"` no lanza y `auditar` termina en `check-contraste` | ✓ |
| 2 | Con el sitio levantado y sembrado, `check:contraste` **sale 1** y lista hallazgos reales | ✓ 621 |
| 3 | `--base http://127.0.0.1:59999` sale 1 en vez de colgarse o salir 0 | ✓ 32 hallazgos de `navegacion` (16 rutas × 2 temas; la ficha se salta al no poder descubrirla, que es lo correcto) |
| 4 | `--tema oscuro` recorre solo el oscuro | ✓ 204 hallazgos, dinamismo omitido por no haber con qué cruzar |
| 5 | `.perfil__texto` de `dealer.html` aparece entre los hallazgos | ✓ 1.25:1 |
| 6 | `git diff package.json` no añade ninguna dependencia | ✓ dos líneas, `devDependencies` sigue siendo solo `puppeteer` |
| 7 | `.github/workflows/desplegar.yml` no aparece en el diff | ✓ sin tocar |

Las dos comprobaciones automáticas del plan (piezas del comprobador y razones de las
excepciones) pasan.

## Registro de amenazas

| ID | disposición | cómo quedó |
|---|---|---|
| T-02-06 | mitigado | La comprobación de la tarea 3 falla si aparece cualquier dependencia; `devDependencies` sigue siendo exactamente `puppeteer` |
| T-02-07 | mitigado | 55 s medidos sobre un job de 108 s con tope de 900 s: 18 % del tope, y al ir al final de una cadena `&&` no corre si algo ya falló |
| T-02-08 | mitigado | Las tres cegueras van escritas en la cabecera del archivo y repetidas en este resumen |
| T-02-09 | mitigado | Las seis excepciones llevan su razón al lado; los cuatro casos nuevos quedan anotados arriba **sin** añadirlos |
| T-02-SC | mitigado | No se instaló ningún paquete |

## Self-Check: PASSED

- `tools/check-contraste.js`, `package.json` y este resumen existen en disco.
- Los tres commits `7e91e37`, `f9abcc8` y `3f1adba` están en el historial de
  `gsd-inicializacion`.
- Ninguno de los tres commits borra archivos.
