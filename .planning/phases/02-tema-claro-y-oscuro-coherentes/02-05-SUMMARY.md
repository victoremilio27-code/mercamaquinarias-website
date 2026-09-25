---
phase: 02-tema-claro-y-oscuro-coherentes
plan: 05
subsystem: colores literales de la hoja de estilos
tags: [css, tema, contraste, accesibilidad, tokens]
requires:
  - phase: "02-01"
    provides: "--sobre-oscuro, --texto-peligro, --texto-error, --borde-error, --sup-ok y compañía en los dos bloques"
  - phase: "02-04"
    provides: "controles y ámbar de letra ya sobre sus tokens; control en cero"
provides:
  - ".perfil fijada oscura (#141616) en los dos temas, con su porqué escrito"
  - "tokens nuevos en los dos bloques: --sobre-ambar (#151515) y --velo-foto"
  - "rojos y verdes de estado sobre --texto-peligro / --texto-error / --sup-* / --borde-*"
  - "cero hallazgos de texto y de control en las 17 rutas y los dos temas"
affects: ["02-06 verificación y cierre de la fase"]
tech-stack:
  added: []
  patterns:
    - "Letra sobre el ámbar de marca: --sobre-ambar, nunca var(--azul), que en oscuro es crema"
    - "Superficie oscura deliberada: fondo fijo + --sobre-oscuro dentro; nada que gire dentro de ella"
key-files:
  created: [.planning/phases/02-tema-claro-y-oscuro-coherentes/02-05-SUMMARY.md]
  modified: [styles.css, index.html]
key-decisions:
  - "El acento de 3 px de los avisos de error va a --texto-peligro, no a --borde-error: con el borde tenue se perdía la franja y en claro cambia cero píxeles"
  - "El borde de un campo con error va a --texto-peligro: --borde-error (1.49:1) no llega al 3:1 de un control"
  - "select:hover a --gris-acero y no a --app-borde-control: con el mismo color que el reposo el realce no existiría"
  - "El sello de la foto y la vista previa de publicar NO son superficies oscuras (el 02-01 y el plan lo suponían): uno es ámbar y la otra la pinta la piel app como tarjeta"
requirements-completed: [UI-01]
metrics:
  duration: ~90 min (con una interrupción por límite de uso)
  tasks: 3
  files: 2
  completed: 2026-09-25
---

# Fase 02 Plan 05: los colores congelados pasan al tema

**La cabecera del dealer queda fija en oscuro y legible en los dos temas, y los
hallazgos de texto del comprobador bajan de 101 a 0. Quedan 190 de
dinamismo, todos de una sola pieza deliberada (la cuenta de fotos sobre la
imagen), que decide el 02-06.**

## Números del comprobador

Servidor en 8091 y comprobador contra la misma `MERCA_DB` (base sembrada en el
scratchpad de la sesión).

| | antes | después |
|---|---|---|
| **total** | **317** | **190** |
| `control` | 0 | 0 |
| `texto` | 101 | **0** |
| `dinamismo` | 216 | 190 |
| `navegacion` | 0 | 0 |
| por tema: claro | 12 | 0 |
| por tema: oscuro | 89 | 0 |
| por tema: ambos | 216 | 190 |

**Cero excepciones nuevas.** `tools/check-contraste.js` no se tocó.

## Commits

| Tarea | Commit |
|---|---|
| 1 · cabecera del dealer fija y lo oscuro deliberado con sus tokens | `2b62f0e` |
| 2 · rojos y verdes de estado | `f8eb2b4` |
| 3 · el resto del inventario, letra sobre ámbar y el SVG del héroe | `8a140e4` |

`styles.css` se guardó en LF, como estaba en la copia de trabajo (cero `\r`
antes y después); `index.html` conserva su CRLF. Diffs en decenas de líneas.

## El reparto de las 19 apariciones de `#B3261E`

| destino | veces | dónde |
|---|---|---|
| `--texto-peligro` (tinta o acento de peligro) | 16 | franja izquierda de `.paso__aviso`, `.acceso__aviso`, `.resumen__error`, `.sol--rechazada`; borde de `.campo-v--error`; `.campo-v__error`; `.cuenta-aviso`; `.telefono__quitar:hover` (borde y letra); `.btn-tabla--quitar:hover` (borde y letra); `.vigencia--pronto`; `.pastilla--roja`; `.tren-edita__aviso--error`; `.btn-tabla--borrar` y su `:hover` |
| `--texto-error` (texto dentro de un aviso) | 1 | `.paso__aviso .ico` |
| `--sup-error` (fondo) | 2 | `.foto__sello--aviso` (commit de la tarea 1) y `.foto__btn--quitar:hover`; los dos pasan su letra a `--texto-error` |

El mensaje del commit `f8eb2b4` dice «15 / 2 / 2»: está mal contado. El
reparto bueno es éste. No se reescribió el commit (regla de historial).

## Otros literales convertidos

| antes | dónde | ahora |
|---|---|---|
| `#E8C4C4` ×3 | bordes de aviso de error | `--borde-error` |
| `#E8F3ED` / `#10512F`, `#FBEBE9` / `#8C2B22` | `.aviso-linea--bien/--mal` | `--sup-ok`/`--texto-ok`, `--sup-error`/`--texto-error` |
| `#A3342A` | `.enlace-plano--peligro` | `--texto-peligro` |
| `#B9D7C8`, `rgba(21,122,75,.08/.07/.25)` | `.acceso__aviso--bien/--ok` | `--borde-ok`, `--sup-ok` |
| `var(--verde)` sobre tinte verde | `.pastilla--verde`, `.plan__ahorro`, `.duracion__op b`, `.plan-op__ahorro`, `.estado--activo` | `--texto-ok` (el «Verificado» estaba a 4.04:1 en claro) |
| `#fff` | `.regla--si .regla__marca` | `--blanco`, como el paso hecho de publicar |
| `#D5DEE5` | `.perfil__texto`, `.cab__nav a` (inerte) | `--sobre-oscuro-2` |
| `#FFFFFF` | `.mosaico__nombre`, `.aviso__fotos`, `.galeria-editor__quitar` | `--sobre-oscuro` |
| `rgba(7,26,43,.78)` ×2 | `.aviso__fotos`, `.galeria-editor__quitar` | `--velo-foto` |
| `#FCFBF7` | `.tabla-anuncios tbody tr:hover` | `--app-soft` |
| `#92A0AA` | placeholder del buscador del héroe | `--app-muted` |
| `#C9C6BC` | `select:hover` | `--gris-acero` |
| `#F2F0EA` / `#EDEBE4` / `#CFCCC2` / `#9E9C93` | `.anuncio` | `--app-bg` / `--app-soft` / `--linea` / `--app-muted` |
| `#D2CFC5` | trazo del mapa | `--linea` |
| `#071A2B` | `--oferta-tinta` | `var(--sobre-ambar)` |
| `rgba(7,26,43,.22)` | filete de `.oferta__plazo` | `rgba(21,21,21,.22)`, la tinta nueva al 22 % |
| `#071A2B` ×3 | `stop-color` de `#desvanece` en `index.html` | fuera del SVG; `#desvanece stop { stop-color: var(--app-bg) }` en la hoja |
| `var(--azul)` sobre ámbar | `.skip`, `.marca-esq`, `.plan__cinta`, `.plan-op__cinta`, paso activo, `.cat-tarjeta__ico`, `.duracion__op` marcada, `.identidad__sello`, `.perfil__sello`, `.foto__sello` | `--sobre-ambar` |

## Desviaciones

**1. [Regla 1] La letra sobre ámbar no partía de un literal sino de `var(--azul)`.**
Los 66 «crema sobre ámbar» que dejó el 02-04 venían de `color: var(--azul)`,
que en oscuro es `#F7F5EF`. Se declara `--sobre-ambar: #151515` en los dos
bloques (el mismo valor que ya usa `.btn--ambar`) y lo usan las diez cajas
ámbar que ponían `--azul`. `.btn--ambar` de la piel vieja no se tocó: la pisa
la piel app.

**2. [Regla 1] La vista previa de publicar no es oscura.** `.panel--previa`
pone `var(--azul)`, pero la piel app pinta todo `.panel` con `--app-card` más
abajo y con la misma especificidad: es una tarjeta. El 02-01 repuntó su
rótulo y su nota a `--sobre-oscuro-2`, que en claro quedaba a 1.3:1 sobre
blanco (el comprobador lo cazaba). Pasan a `--app-muted`; el icono a
`--ambar-texto`. Queda corregido el comentario del bloque de tokens que la
nombraba como superficie oscura.

**3. [Regla 1] El sello de la foto es ámbar, no oscuro.** La piel app le ponía
`#FFFFFF` junto a `.aviso__fotos` («texto sobre fotografía»), pero su relleno
es ámbar: blanco sobre ámbar a 1.84:1. Pasa a `--sobre-ambar`. La razón de
su excepción en `check-contraste.js` («su fondo oscuro») es falsa; no se
tocó la lista, pero el 02-06 debería corregir ese comentario o quitar la
excepción, que ya no hace falta.

**4. [Regla 1] Dentro de `.perfil` había más cosas que giraban.** Además de lo
del plan: `.perfil__lema` (`--gris-acero`), el «Anunciante verificado»
(verde de papel claro sobre fondo oscuro, 1.9:1 en claro), el fondo de
`.btn--linea` que la piel app pone en `--app-card` (blanco sobre blanco en
claro) y el `:hover` de `.perfil__red` (`--hueso`). Todo a `--sobre-oscuro*`
o a blanco translúcido.

**5. [Regla 2] La caja de la oferta lleva ámbar liso bajo el degradado.** El
comprobador (y cualquier cálculo de fondo) no ve un `background-image`: medía
la tinta sobre el fondo del tema, 1.1:1 en oscuro. Con `var(--ambar)` como
color de fondo de la capa se mide lo que se ve. Cero píxeles de cambio.

**6. [Regla 1] Hovers con tokens que giran sobre superficie fija.**
`.chat__cerrar:hover` ponía `--blanco` (negro en oscuro, sobre la cabecera
oscura del chat) y `.galeria-editor__quitar:hover` `--azul` (crema en
oscuro, bajo un aspa blanca). El primero a `--sobre-oscuro`; el segundo a
`--sup-error`/`--texto-error`, como el quitar foto de publicar.

**7. `select:hover` no va a `--app-borde-control`** como decía el plan: es el
mismo color del reposo y el realce no existiría. Va a `--gris-acero`, más
marcado que el reposo en los dos temas.

**8. La comprobación automática de la tarea 2 no sale limpia al pie de la
letra**: cuenta dos `#157A4B` antes del bloque claro, que son el comentario
de la guía de marca y el `--verde` base del `:root` general (el mismo caso
que el `--azul` base que las notas mandan dejar). Ningún uso.

## Lo que queda para el 02-06

**Los 190 de dinamismo son una sola pieza: `.aviso__fotos`.** 95 veces la
pastilla (`background-color` `--velo-foto`) y 95 su icono (`color`
`--sobre-oscuro`), en Inicio, Transporte, Financiamiento, Catálogo, Publicar,
Perfil de dealer y la ficha. Es la cuenta de fotos que va **sobre la
fotografía** del anuncio: la foto no gira con el tema y el velo tampoco debe.
El comprobador la ve «congelada» porque no ve la imagen y mide el
marcador de posición de detrás (`--gris-neutro`, que sí gira). Es el mismo
caso que `.foto__sello` tenía en la lista: candidata a excepción por regla 3,
con la regla 1 viva (hoy pasa en los dos temas). No se añadió aquí (D-04).

Otros pendientes, anotados y sin tocar:

- `rgba(7, 26, 43, …)` sigue en velos y sombras: `.heroe__foto::after` (oculto
  con `display: none !important` en la piel app), `.mosaico__pieza::after` de
  la piel vieja (pisado por la app), `.foto__mandos`, `.velo-filtros`,
  `.nota-rnc`, `.invitacion-dealer`, `.pastilla--azul`, `.estado--vendido` y
  cuatro sombras. Son tintes translúcidos que se componen sobre el fondo; en
  oscuro el tinte azul al 5-10 % casi no se ve. Si el 02-06 quiere la hoja sin
  un solo azul noche, éstos son los que quedan.
- El plano del héroe (`#desvanece`) ya toma `--app-bg`, pero **no se ve en
  ningún tema**: `.heroe__plano` está oculto con `!important` en la piel app.
  Comprobado en las capturas: el degradado resuelve `rgb(244,244,241)` en
  claro y `rgb(25,26,26)` en oscuro, sin dibujarse.
- `.videos__pieza` y `.video-sub__vista` (`#000`) no llevan texto encima: D-02
  no tenía nada que cambiar allí.
- `.perfil__logo` pinta `--blanco`, que en oscuro es negro: su comentario dice
  «fondo blanco para que un logotipo oscuro se lea». Con un logo oscuro
  sembrado no se ha visto; merece mirada humana en el 02-06.
- `.btn-tabla--borrar` conserva `border-color: rgba(179,38,30,.3)`, por
  debajo de 3:1 como contorno de control. Está tras el muro de sesión.
- Las declaraciones inertes con `var(--texto-claro)` (`.heroe__sub`,
  `.heroe__cifras li`, `.pie`, `.cab__cuenta`, `.banda__sub`,
  `.banda__texto`) **siguen tapadas**: este plan no quitó ningún override de
  la piel app. Nada que medir.
- Verificación humana que el comprobador no puede hacer: fila de
  `panel.html` al pasar el cursor en oscuro, avisos de error de formulario en
  los dos temas, sello «Fuera del plan» en publicar.

## Verificación

| # | Criterio | Resultado |
|---|---|---|
| 1 | Sin `[dinamismo]`, `[control]` ni `[texto]` | **Parcial**: control 0, texto 0, dinamismo 190 (arriba) |
| 2 | `.perfil` sin `var(--azul)` y con comentario | OK |
| 3 | Literales de estado fuera de los bloques | OK (los dos `#157A4B` son la definición base) |
| 4 | `EXCEPCIONES` no creció | OK, archivo sin tocar |
| 5 | Diff en decenas | OK |
| 6 | A ojo | `dealer.html` en oscuro: cabecera, descripción, metadatos y categorías se leen (captura). `index.html` en claro y oscuro sin roturas. `panel.html` hover: no comprobable sin sesión, queda para el 02-06 |

Además: `npm run check` (contra 8091) sin problemas; `npm run seguridad:probar`
71 bien, 0 mal; `auditar-publico` 0 hallazgos y `auditar-flujos` 0 hallazgos,
los dos contra 8091 con la misma base (copias del script con el puerto
cambiado, en el scratchpad; el repo no se tocó).

## Self-Check: PASSED

- `styles.css`, `index.html` — FOUND
- commits `2b62f0e`, `f8eb2b4`, `8a140e4` — FOUND
- Ningún commit borra archivos
