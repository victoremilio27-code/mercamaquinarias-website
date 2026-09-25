---
phase: 02-tema-claro-y-oscuro-coherentes
plan: 01
subsystem: capa de tokens del sistema de temas
tags: [css, tokens, tema, contraste, accesibilidad]
requires: []
provides:
  - "--app-borde-control en los dos temas (3.58 claro / 4.27 oscuro sobre tarjeta)"
  - "--sobre-oscuro y --sobre-oscuro-2 para texto sobre superficies oscuras en ambos temas"
  - "--ambar-texto, --texto-claro, --texto-peligro, --borde-error, --borde-ok en los dos bloques"
  - "los cinco semánticos (--sup-calida, --sup-error, --sup-ok, --texto-error, --texto-ok) también en claro"
  - "hoja sin colores de reserva en línea: una definición que falte ahora se ve"
affects: [02-03, 02-04, 02-05, 02-06]
tech-stack:
  added: []
  patterns:
    - "los dos bloques de tema declaran el mismo juego de nombres: la asimetría es el fallo"
    - "var() sin color de reserva; las nueve excepciones son valores que pone el JS o cadenas token a token"
key-files:
  created: []
  modified: [styles.css]
decisions:
  - "D-02 revisada: --ambar-texto y --texto-claro bajan a #8F6100 y #686D70, medidos contra las tres superficies claras y no solo contra la tarjeta blanca"
  - "--app-accent-texto se mueve con su alias --ambar-texto: es el que de verdad pinta títulos y enlaces"
  - "Opción A: el repunte de las seis declaraciones sobre panel oscuro se adelanta a este plan para que ningún commit intermedio deje el sitio incumpliendo"
  - "Las nueve var() con segundo argumento que no son colores se quedan y quedan explicadas en la hoja"
metrics:
  duration: ~55 min
  tasks: 2
  files: 1
  completed: 2026-09-25
---

# Fase 02 Plan 01: la capa de tokens del sistema de temas, completa

Los bloques claro y oscuro de `styles.css` declaran ya el mismo juego de 34
nombres, con borde de control a 3:1 en los dos temas, y la hoja se quedó sin
los 62 colores de reserva que disimulaban las definiciones que faltaban.

## Qué se hizo

| Tarea | Commit | Diff |
|---|---|---|
| 1 · el mismo juego de tokens en los dos bloques | `0407194` | +92 −7 |
| 2 · fuera los 62 colores de reserva en línea | `38f5dcc` | +79 −62 |

Rama `gsd-inicializacion`, se suman al PR #23. Nada tocó `main`.

## Tokens añadidos

### Bloque claro (`:root, :root[data-theme="light"]`)

Contraste sobre tarjeta `#FFFFFF` / fondo `#F4F4F1` / superficie suave `#EEEEEA`:

| token | valor | card | bg | soft |
|---|---|---|---|---|
| `--app-borde-control` | `#848889` | 3.58 | 3.25 | 3.08 |
| `--ambar-texto` | `#8F6100` | 5.42 | 4.91 | 4.66 |
| `--texto-claro` | `#686D70` | 5.24 | 4.75 | 4.50 |
| `--texto-error` | `#7A1B15` | 10.53 | 9.55 | 9.05 |
| `--texto-ok` | `#14532D` | 9.11 | 8.27 | 7.83 |
| `--texto-peligro` | `#B3261E` | 6.54 | 5.93 | 5.62 |

Y sin número porque son superficies o filetes, no texto: `--sup-calida`
`#FFFDF7`, `--sup-error` `#FDF3F3`, `--sup-ok` `#F2FAF6`, `--borde-error`
`#E8C4C4`, `--borde-ok` `#B9D7C8`, `--sobre-oscuro` `#FFFFFF`,
`--sobre-oscuro-2` `#D5DEE5`.

### Bloque oscuro (`:root[data-theme="dark"]`)

| token | valor | card | bg | soft |
|---|---|---|---|---|
| `--app-borde-control` | `#727677` | 4.27 | 3.80 | 3.30 |
| `--ambar-texto` | `#F2A900` | 9.75 | 8.68 | 7.55 |

Más `--texto-peligro` `#F3A29C`, `--borde-error` `#5A2A26`, `--borde-ok`
`#1A4530`, `--sobre-oscuro` `#FFFFFF` y `--sobre-oscuro-2` `#D5DEE5`.

El oscuro sube a 3:1 igual que el claro por decisión expresa de Victor: estaba
en 1.66 e incumplía lo mismo, y lo que se persigue en esta fase es que los dos
temas se comporten idéntico.

## Desviaciones

### 1. [Rule 1 · corrección de contraste] Los dos valores aprobados se cambian ahora, no en 02-06

La D-02 del plan dejaba escrito que `--ambar-texto: #9A6800` y
`--texto-claro: #6E7376` se escribieran tal cual y que fuese el comprobador de
02-03 quien decidiera. Victor midió de nuevo antes de ejecutar y confirmó que
se quedan cortos: 4.38 y 4.35 sobre `--app-bg`, 4.15 y 4.12 sobre `--app-soft`,
por debajo del 4.5:1 del criterio. Se usan los sustitutos ya medidos de la
propia D-02, `#8F6100` y `#686D70`, verificados aquí contra las tres
superficies. **El plan 02-06 ya no tiene que hacer esto.**

### 2. [Rule 2 · corrección necesaria] `--app-accent-texto` se mueve con su alias

El plan decía que `--ambar-texto` es alias de `--app-accent-texto` y que «se
mueven los dos juntos o ninguno», pero solo mandaba cambiar el primero. El
segundo es el que de verdad pinta (`.panel__titulo em`, `.banda__titulo em`,
`.heroe__titulo em`, `.enlace-mas`); dejarlo en `#9A6800` habría mantenido el
4.38 sobre el fondo y la fase no cumpliría su propio criterio. Aprobado por
Victor durante la ejecución. Los dos quedan en `#8F6100` con un comentario que
dice que van en bloque, para que nadie los separe después.

### 3. [Rule 4 · consultado y aprobado] `--texto-claro` es texto SOBRE oscuro, no texto apagado

Lo más importante de esta ejecución, y por lo que se paró antes de tocar nada.

El plan trataba `--texto-claro` como un gris apagado para superficie clara. En
la hoja era lo contrario: valía el azul pálido `#A2B4C1` en el `:root` general
y `#A8AAA9` en el bloque oscuro, es decir, un color pensado para ir **sobre
panel oscuro**. Tiene 17 usos y seis de los que siguen vivos en la cascada
están sobre paneles que son oscuros también en el tema claro.

Declarar `--texto-claro: #686D70` en el bloque claro los habría hundido de
**8.51 a 3.47** sobre `#141616`, en el tema por defecto. Entre ellos, el
subtítulo y el botón de cerrar del chat, que sale en **todas** las páginas.

Victor eligió la opción A: declarar el gris **y repuntar en el mismo commit**
esas seis declaraciones a `var(--sobre-oscuro-2)` (13.33 sobre el panel), para
que ningún commit intermedio deje el sitio incumpliendo — el PR #23 puede
fusionarse en cualquier momento y fusionar despliega.

| línea | regla | antes | ahora |
|---|---|---|---|
| 2150 | `.vista-previa__rotulo` | `--texto-claro` | `--sobre-oscuro-2` |
| 2161 | `.vista-previa__nota` | `--texto-claro` | `--sobre-oscuro-2` |
| 2705 | `.perfil__meta` | `--texto-claro` | `--sobre-oscuro-2` |
| 3476 | `.heroe-ajuste__vacia` | `--texto-claro` | `--sobre-oscuro-2` |
| 3936 | `.chat__sub` | `--texto-claro` | `--sobre-oscuro-2` |
| 3943 | `.chat__cerrar` | `--texto-claro` | `--sobre-oscuro-2` |

> **Para el plan 02-05:** `.perfil__meta` es tuyo y **ya está hecho**. No lo
> repitas. `.perfil__texto`, justo debajo, sigue con `#D5DEE5` escrito a mano y
> ése sí te toca: es exactamente el valor que ahora se llama
> `--sobre-oscuro-2`.

### 4. [Rule 3 · desbloqueo] Cuatro tokens de simetría que el contrato no listaba

El bloque oscuro redefinía `--blanco`, `--gris-neutro`, `--ambar-hondo` y
`--verde`, y el contrato del plan no los mencionaba. Sin ellos en el claro, la
comprobación automática de la Tarea 1 fallaba. Se declaran en el bloque claro
con su valor del `:root` general (`#FFFFFF`, `#E7E6E0`, `#C98A00`, `#157A4B`):
cero píxeles de cambio y la simetría queda escrita en vez de suponerse.

### 5. [Rule 3 · comprobación corregida] Las reservas son 71, no 62

Las 62 de color que contaba el plan cuadran exactas. Las otras nueve **no son
colores y no se pueden quitar**, así que la comprobación se ajustó a la forma
con hexadecimal (que es lo que dice la prosa del plan, `var(--token, #hex)`;
era su expresión regular la que iba más lejos que su propio texto):

- `--avance`, `--uso`, `--muestra-alto` y `--pub-arranque` los rellena el JS en
  marcha (`assets/app.js:1470` y `:1523`, `assets/panel.js:65`,
  `assets/publicar.js:1643`). El segundo argumento es el valor de partida
  mientras el script no ha corrido; sin él la cabecera pegajosa se solapa y las
  barras de progreso arrancan descuadradas.
- `--app-accent`, `--app-text` y `--app-muted` (líneas 3278, 3303, 3343 y 3344)
  encadenan a otro token de la guía de marca, no a un color escrito a mano. Si
  el primero faltara, el segundo tampoco lo taparía en silencio, que es lo que
  la D-04 quería evitar.

Queda un comentario en la cabecera de la hoja explicando las nueve, para que
nadie las «limpie» dentro de seis meses.

### 6. [hallazgo] `--pub-ancho` y `--pub-alto` se usan sin declarar, a propósito

La comprobación de tokens huérfanos los señaló. Son previos a este plan y están
bien: los pone `assets/app.js:1369` en el atributo `style` de cada muestra de
publicidad. Se añadieron a la lista de tokens de tiempo de ejecución de la
comprobación. Aun así son frágiles —`max-width: calc(var(--pub-ancho) * 1px)`
sin reserva no pinta nada si el JS no corre—, pero arreglarlo no es de este
plan.

## Los dos copiados cruzados: confirmados

Era la prueba que el plan quería, y salió tal cual:

- **`.solicitud__intro`** llevaba `var(--gris-acero, #33475A)`. `#33475A` no es
  ni ha sido el valor de `--gris-acero` (`#5F6364` en claro, `#60717D` en el
  `:root` general): es el de `--texto-2`. Ahora resuelve por el token y pinta
  `#5F6364`, que es lo que la regla quería.
- **`.campo-v__ayuda`** llevaba `var(--texto-claro, #60717D)`, y `#60717D` sí
  es el valor de `--gris-acero`. Estaban intercambiados.

Y el detalle que remata el argumento de la D-04: esa reserva de
`.campo-v__ayuda` **nunca llegó a aplicarse**, porque `--texto-claro` sí estaba
definido. Quien la escribió creía que pintaba gris mientras la cascada pintaba
el azul pálido `#A2B4C1` sobre blanco, a 1.85:1. La reserva documentaba una
intención que el navegador jamás cumplió: eso es justo lo que esta costumbre
escondía. (La regla vive en la línea 2877 y la pisa la piel app en la 4609 con
`var(--gris-acero)`; `.solicitud__intro` está en la 2852.)

## Verificación

| # | Criterio | Resultado |
|---|---|---|
| 1 | Los dos bloques declaran los mismos nombres | OK · 34 y 34 |
| 2 | `--app-borde-control` `#848889` claro / `#727677` oscuro | OK |
| 3 | Sin `var(--token, #hex)` en la hoja | OK · 0 de 62 |
| 4 | Ningún token usado sin declarar | OK (salvo los seis de tiempo de ejecución) |
| 5 | `git diff --stat` en decenas, no 4.741 | OK · +92−7 y +79−62 |
| 6 | Nada se pintó de negro ni desapareció | Ver abajo |

El punto 6 queda **pendiente de mirada humana**. Lo comprobable a máquina está
comprobado y ningún `var()` se quedó sin token, que era el riesgo T-02-01 del
registro. Merece un vistazo a `equipos.html` y `publicar.html` en los dos temas,
y sobre todo al chat, que es lo que más se movió.

## Pendientes y avisos

- **`styles.css` no está cubierto por `.gitattributes`.** Con
  `core.autocrlf=true`, git avisa en cada operación de que «LF will be replaced
  by CRLF the next time Git touches it»: un `checkout` limpio convertirá el
  archivo entero y el siguiente diff será de 4.741 líneas. Los dos commits de
  este plan se guardaron en LF (comprobado: cero `\r`, y los diffs son de 99 y
  141 líneas). Añadir `styles.css text eol=lf` al `.gitattributes` dejaría la
  intención cerrada, pero ese archivo no está en el alcance de este plan.
- **Hay otros dos planes escribiendo en esta misma copia de trabajo.** Al
  empezar el árbol estaba limpio y a los pocos minutos había 19 `.html`
  modificados sin commitear (los `theme-color` del plan 02-02) más
  `tools/check-contraste.js` sin seguir. No son míos y **siguen sin commitear**.
  Los dos commits indexaron solo `styles.css`, con `git add styles.css` y
  `--only`; nunca `git add .`.
- **Declaraciones inertes que conviene no despertar:** `var(--texto-claro)`
  sigue en `.heroe__sub`, `.heroe__cifras li`, `.pie`, `.cab__cuenta`,
  `.banda__sub` y `.banda__texto`, todas de la piel vieja y todas pisadas hoy
  por la piel app, que les pone `--app-muted`. No se ven, pero están sobre
  fondos oscuros de la piel vieja: si 02-04 o 02-05 quitan el override sin
  cambiar el token, reaparecerá el 3.47. Repuntarlas a `--sobre-oscuro-2` o
  borrarlas es trabajo de esos planes.
- `.cab__pulso` y los tres `.sol__*` sí mejoran con el cambio: estaban en el
  azul pálido sobre superficie clara y ahora van a `#686D70`.

## Self-Check: PASSED

- `styles.css` — FOUND
- `.planning/phases/02-tema-claro-y-oscuro-coherentes/02-01-SUMMARY.md` — FOUND
- commit `0407194` — FOUND
- commit `38f5dcc` — FOUND
