---
phase: 02-tema-claro-y-oscuro-coherentes
plan: 04
subsystem: controles y ámbar de la hoja de estilos
tags: [css, tema, contraste, accesibilidad, wcag, controles, ambar]

requires:
  - phase: "02-01"
    provides: "--app-borde-control y --ambar-texto declarados en los dos bloques de tema"
  - phase: "02-03"
    provides: "tools/check-contraste.js y las cuatro etiquetas de salida"
provides:
  - "Los dieciséis controles de D-01 delimitados con --app-borde-control en los dos temas"
  - "Seis controles más, fuera del inventario, encontrados por el comprobador y arreglados"
  - "--ambar-hondo separado en sus dos papeles: superficie se queda, texto pasa a --ambar-texto"
  - "Cero hallazgos de tipo control en las 17 rutas y en los dos temas"
affects: ["02-05 los literales de la hoja", "02-06 verificación y cierre de la fase"]

tech-stack:
  added: []
  patterns:
    - "Un control se delimita, un filete decora: --app-borde-control para lo pulsable, --app-line y --linea para lo que separa contenido"
    - "El ámbar que rellena o realza sigue siendo el de marca; el ámbar que pinta sobre superficie clara se llama --ambar-texto"
    - "Un adorno que el navegador toma por borde deja de ser borde: el filo del lanzador del chat pasa a sombra interior"

key-files:
  created:
    - .planning/phases/02-tema-claro-y-oscuro-coherentes/02-04-SUMMARY.md
  modified:
    - styles.css

key-decisions:
  - "Los iconos ámbar van con el texto: en superficie clara estaban a 2.96:1 y separarlos habría puesto dos ámbares distintos en la misma fila"
  - "El botón ámbar no se apaga, se le pone filo: el borde es --ambar-texto, no el gris neutro, porque un aro gris alrededor del único elemento ámbar de la página se lee como un fallo"
  - "El filo ámbar del lanzador del chat pasa a sombra interior: era adorno y el comprobador lo medía como si delimitara"
  - "Ninguno de los 64 usos de color se queda en --ambar-hondo: en las superficies oscuras fijas ese token nunca pintó texto"

requirements-completed: [UI-01, UI-02]

metrics:
  duration: ~75 min
  tasks: 2
  files: 1
  completed: 2026-09-25
---

# Fase 02 Plan 04: los controles delimitados y el ámbar partido en dos

**Los 271 incumplimientos de tipo `control` que medía el comprobador quedan
en cero, y el ámbar que pintaba letras sobre papel claro deja de ser el
mismo token que pinta el relleno de los botones.**

## Los dos números que pedía el encargo

Medidos con el sitio levantado en el puerto 8091 y la base sembrada en el
directorio temporal de la sesión, la misma `MERCA_DB` para el servidor y
para el comprobador.

| | antes | después |
|---|---|---|
| **total** | **621** | **317** |
| `control` | 271 | **0** |
| `texto` | 134 | 101 |
| `dinamismo` | 216 | 216 |
| `navegacion` | 0 | 0 |
| por tema: claro | 201 | 12 |
| por tema: oscuro | 204 | 89 |

`dinamismo` no se mueve porque no es de este plan: son los literales que
convierte el 02-05. La orden sigue saliendo 1, como debe hasta que la ola
2 termine.

**No se añadió ni una excepción al comprobador.** `tools/check-contraste.js`
no se ha tocado: el diff de los dos commits es solo `styles.css`.

## Qué se hizo

| Tarea | Commit | Diff |
|---|---|---|
| 1 · el borde de control en los dieciséis selectores | `2a715a2` | +53 −39 |
| 2 · los usos de ámbar clasificados uno a uno | `ebf1be5` | +72 −64 |

Rama `gsd-inicializacion`, se suman al PR #23. Nada tocó `main`. Los dos
commits indexaron solo `styles.css`, con `git add styles.css` y `--only`;
nunca `git add .`. El diff acumulado del plan es de **125 inserciones y
103 borrados**, no de 4.700: los saltos de línea no se tocaron.

## Tarea 1 · los controles

Los dieciséis de D-01 más lo que se encontró. `--app-line` conserva sus
**9** usos y `--linea` sus **52**, todos en filetes: borde inferior de la
cabecera, separadores de tabla, marcos de panel y de tarjeta, pie. A
1.30:1 están bien porque no delimitan nada pulsable, que es exactamente lo
que decía D-01.

### El inventario del plan se quedó corto en seis

El plan mandaba anotarlos, porque significa que el diagnóstico no los vio.

**1. El relleno ámbar del botón de marca — 24 hallazgos.**
`.btn--ambar` queda a 2.01:1 de la tarjeta blanca y a 1.82 del fondo: el
botón no se recorta contra el papel. No se apaga el ámbar —es la
identidad y el plan lo prohíbe expresamente— sino que se le pone el filo
que le faltaba. El filo es `--ambar-texto`: 5.42 sobre tarjeta en claro, y
en oscuro vale lo mismo que el relleno, donde quien delimita es el propio
relleno a 8.68. El 02-03 ya había apuntado este caso y había dicho que la
salida es «un borde propio, no un ámbar distinto»; esto es ese borde.

**2 y 3. La miniatura marcada de la ficha y el paso activo de publicar.**
`.galeria__it--activa` y `.pasos__it--activo .pasos__btn` llevaban
`border-color: var(--ambar)` a 2.01:1. Mismo caso y mismo arreglo. La
miniatura conserva su halo ámbar de 2 px, que es lo que de verdad la
señala.

**4. La pestaña activa de `cuenta.html` — 2 hallazgos.** Se distinguía por
un relleno a 1.10:1 de su carril y una sombra de un píxel. El borde va en
**las dos** pestañas —transparente en la apagada— para que al cambiar de
pestaña no salte ningún píxel.

**5. El lanzador del chat — 16 hallazgos, uno por ruta.** Éste no era lo
que parecía. Su relleno se recorta a unos 15:1 contra la página en los dos
temas: el botón se ve perfectamente. Pero su filo ámbar de 3 px era el
borde **más ancho** de los cuatro lados y, por eso, el único que el
comprobador medía, a 1.82:1. El filo es adorno, no delimitación, así que
pasa a `box-shadow: inset 0 -3px 0 var(--ambar)` y quien delimita vuelve a
ser el relleno. Los 3 px que ocupaba el borde se devuelven al relleno
inferior para que el botón mida lo mismo que medía: comprobado, 48 px
antes y 48 px después, en los dos temas.

**6. Dos casillas de `importar.html` — 4 hallazgos.** Salían como cajas
blancas a 1.10:1 del fondo. Heredaban de `.campo-v input` un relleno de
campo de texto que Chrome **ignora** al dibujarlas con su apariencia
nativa: no se veía en pantalla, pero seguía en el estilo calculado. Nadie
habría encontrado esto mirando. Se les quita el relleno heredado; el color
del marcado sigue saliendo de `accent-color`, que no se toca.

### Controles tras el muro de sesión

El comprobador visita `panel.html`, `admin.html` y `mi-pagina.html` sin
sesión, así que mide su muro de acceso y no su contenido. Estos controles
**no salen en la cuenta de 271** y se cambiaron igual, leyendo la hoja:
`.btn-tabla`, `.chip`, `.paginacion__it`, `.perfil__red`, `.telefono__quitar`,
`.plan-celda__sel`, `.bloque__orden button`, `.bloque__texto`,
`.bloque__lista`, `.sol__motivo textarea`, `.rastreo input`,
`.filtros__cerrar`, `.chat__sug-it` y `.chat__entrada`. Si alguien siembra
una sesión en el comprobador algún día, esa pasada no debería encontrar
nada nuevo por aquí.

### Lo que sí se dejó como estaba

`.dealer` y `.cab__nav a` son pulsables pero no son controles: son una
tarjeta de directorio y los renglones del menú del teléfono. Ni el
comprobador los señala ni WCAG 1.4.11 pide contorno para ellos. Quedan con
`--app-line`.

## Tarea 2 · el reparto del ámbar

Las **78** apariciones de `--ambar-hondo` se miraron una a una. Cuatro no
son usos (el comentario de la guía de marca y las tres declaraciones del
token), así que quedan 74 declaraciones repartidas así:

| propiedad | veces | qué se hizo |
|---|---|---|
| `color` | 64 | **las 64 pasan a `--ambar-texto`** |
| `accent-color` | 5 | se quedan |
| `background` | 3 | se quedan |
| `border-color` | 1 | se queda |
| `border-left-color` | 1 | se queda |
| `text-decoration-color` | 1 | se queda |

Comprobado después del cambio: quedan **0** usos de `color` en
`--ambar-hondo` y **11** usos del token en total, que son exactamente los
5 + 3 + 1 + 1 + 1 de arriba.

### La lista de los que se quedan sale vacía, y eso es el hallazgo

El plan pedía «la lista de los que se quedan y su razón». **Ninguno de los
64 se queda**, y la razón merece escribirse porque no era lo que el plan
esperaba: en las superficies que son oscuras en los dos temas
—`.mosaico__pieza`, la banda del vídeo, `.foto__sello`, la burbuja del
usuario en el chat— el texto **nunca se pintó con `--ambar-hondo`**. Se
pinta con `#FFFFFF` o con `--ambar` a secas, que es el ámbar claro. El
token oscuro solo aparecía donde el fondo es claro, que es justo donde no
llegaba al mínimo.

Dicho de otro modo: el riesgo que el plan quería evitar con el «no hay
atajo, se miran los 64 uno a uno» **no existía en la hoja**. Pero solo se
puede saber después de mirarlos.

### Los cinco de calibración

| selector | resultado |
|---|---|
| `.form__enlaces a` | → `--ambar-texto` |
| `.celda-equipo__nombre:hover` | → `--ambar-texto` |
| `.invitacion-dealer a` | → `--ambar-texto` |
| `.estado--pausado` | → `--ambar-texto` |
| `.pie__lista a:hover` | **ya estaba hecho** |

El quinto usa `var(--ambar)` en la piel vieja y la piel app lo pisa con
`--app-accent-texto`, que el 02-01 dejó en `#8F6100`. No aparecía entre
las 78 porque nunca fue `--ambar-hondo`.

### Los iconos van con el texto

Decisión propia, y conviene que esté a la vista por si alguien la quiere
al revés. Entre los 64 hay unos veinte que pintan un icono, no letras:
`.tipos__ico`, `.alq__ico`, `.cama__ico`, `.datos-linea .ico`,
`.realce .ico`, `.metrica__ico`, `.sucursal__ico` y compañía. Se convierten
también, por dos razones:

- Sobre superficie clara estaban a **2.96:1**, por debajo del 3:1 que pide
  WCAG 1.4.11 para una imagen con significado. No es un incumplimiento que
  el comprobador cace —la regla 1 solo mide elementos con texto— pero es
  un incumplimiento.
- Dejarlos atrás habría puesto **dos ámbares distintos en la misma fila**:
  el icono de la sucursal en `#C98A00` pegado a su teléfono en `#8F6100`.
  Eso se lee como un fallo, no como una decisión.

En el tema oscuro no cambia nada: allí los dos tokens valen `#F2A900`.

### El subrayado del chat se queda

`.chat__msg a:hover { text-decoration-color: var(--ambar-hondo) }` es el
único `text-decoration-color` y D-02 decía que va con el `color` de su
regla. Su color **no** se movió: el texto de ese enlace va en azul a
propósito, y el comentario que tiene al lado lo explica desde antes de
este plan —«el ámbar sobre blanco da 2.95:1 […] el texto va en azul y el
ámbar se queda en el subrayado, que es decoración». Así que el subrayado
se queda ámbar.

## Ámbar sobre `--app-bg` o `--app-soft`: no hay nada que anotar

El plan avisaba de que, si el comprobador señalaba ámbar por debajo de 4.5
sobre esas dos superficies, no se tocara el valor aquí y se dejara el
número para el 02-06. **No hace falta:** el 02-01 ya adelantó ese cambio y
`--ambar-texto` vale `#8F6100`, no el `#9A6800` que se quedaba en 4.38 y
4.15. Tras el cambio el comprobador no reporta ni un solo hallazgo de
texto con ámbar de letra. El 02-06 no tiene nada pendiente por este lado.

## Lo que queda para otros planes

**1. Crema sobre ámbar: 66 de los 101 hallazgos de texto que quedan.**
`span.marca-esq` («Destacado», 47 veces), `a.skip` («Saltar al contenido»,
17), `span.plan-op__cinta` y `span.pasos__num`. Todos son `#F7F5EF` sobre
el relleno ámbar, a **1.84:1**. Es el caso contrario al de este plan: no
es ámbar que pinta letras, es una letra clara sobre ámbar. El arreglo
probable es el `#151515` que ya usa `.btn--ambar`, y el color de partida es
un literal, así que **es del 02-05**. El 02-03 pidió que este plan lo
viera junto a lo demás: visto, medido y no tocado, porque tocarlo sería
meterse en el alcance del siguiente.

**2. Las declaraciones inertes con `var(--texto-claro)` siguen inertes.**
`.heroe__sub`, `.heroe__cifras li`, `.pie`, `.cab__cuenta`, `.banda__sub` y
`.banda__texto`, tal como avisó el 02-01. **Este plan no ha quitado ninguno
de los overrides de la piel app que las tapan**: `.cab__cuenta` se tocó
solo en su `border-color`, y `.heroe__sub`, `.pie`, `.banda__sub` y
`.banda__texto` no se tocaron en absoluto. El 3.47:1 sigue dormido y el
aviso sigue vigente para el 02-05.

**3. `.perfil__acciones .btn--linea` ya no sale a 1.00:1.** Era el caso más
extremo que encontró el 02-03 —negro sobre negro en `dealer.html` en
oscuro— y venía de `--linea-dark`, que es un blanco al 13 %. Ahora usa
`--app-borde-control` y pasa en los dos temas. **El 02-05 sigue teniendo
que fijar `.perfil`**, pero ya no arrastra este botón.

**4. `.pub-muestra__pie` convertido, con una salvedad.** Su ámbar salía a
2.79 y 2.55 sobre las cremas del recuadro publicitario y ahora pasa. Pero
ese recuadro puede acabar sobre una superficie que elija un anunciante:
`ajustarContraste` en `assets/app.js` solo enciende o apaga
`.pub-muestra--claro` midiendo el fondo real, y la regla del sitio público
tiene más especificidad que esa clase, así que gana igual. No es de este
plan, pero si algún día el recuadro cae sobre fondo oscuro, el ámbar de
texto será demasiado apagado allí.

## Verificación

| # | Criterio del plan | Resultado |
|---|---|---|
| 1 | Ningún `[control]` con el sitio levantado y sembrado | OK · 0 de 271 |
| 2 | Ningún hallazgo de texto con ámbar de letra | OK · los 66 que quedan son crema **sobre** ámbar, del 02-05 |
| 3 | `--ambar-hondo` conserva 5 `accent-color`, 3 `background` y 2 bordes | OK · 11 usos en total, ni uno de `color` |
| 4 | `--app-line` sigue en los filetes | OK · 9 usos de `--app-line` y 52 de `--linea` |
| 5 | `git diff --stat` en decenas, no 4.600 | OK · +53−39 y +72−64 |
| 6 | A ojo en `equipos.html` claro: «Limpiar», los `select` y el buscador con borde | OK · foto tomada en tema claro, los tres se ven como cajas |
| 7 | Cero dependencias nuevas | OK · no se instaló ni se importó nada |

Las dos comprobaciones automáticas del plan pasan tal como están escritas.
La 1 se corrió contra la salida real del comprobador en el puerto 8091,
porque su orden apunta al 8080 por omisión y ahí no había nada escuchando.

### Lo que no se ha comprobado

El comprobador no ve `:hover`, `:focus` ni `:active`, y este plan movió
bordes que tienen estado de hover (`.chip:hover`, `.btn-tabla:hover`,
`.carrusel__flecha:hover`, `.paginacion__it:hover` siguen poniendo
`--ambar` al pasar por encima). Nada de eso se tocó, así que el riesgo es
bajo, pero **merece un vistazo humano** al pasar el ratón por los filtros
del catálogo y por la paginación, en los dos temas.

## Registro de amenazas

| ID | disposición | cómo quedó |
|---|---|---|
| T-02-10 | mitigado | El criterio de cierre fue el comprobador, no el diff: `control` en cero en las 17 rutas y los dos temas |
| T-02-11 | mitigado | La comprobación de la tarea 2 pasa: `accent-color` sigue en 5 y `background` en 3. El parche filtró por propiedad exacta, así que un `border-color` no pudo colarse como `color` |
| T-02-12 | aceptado, y con una corrección | El aviso del plan («styles.css es LF, no conviertas») es **falso como descripción del repositorio**: `CLAUDE.md` se corrigió en `c6559cc`, el repositorio es CRLF entero. Lo que sí es cierto es la consecuencia: no se convirtió nada, se conservó el estado del archivo en la copia de trabajo y el diff salió en decenas de líneas |
| T-02-SC | mitigado | No se instaló ningún paquete. `package.json` no aparece en el diff |

## Self-Check: PASSED

- `styles.css` — FOUND
- `.planning/phases/02-tema-claro-y-oscuro-coherentes/02-04-SUMMARY.md` — FOUND
- commit `2a715a2` — FOUND
- commit `ebf1be5` — FOUND
- Ninguno de los dos commits borra archivos
