---
phase: 02-tema-claro-y-oscuro-coherentes
plan: 06
subsystem: tema y comprobador de contraste
tags: [css, tema, contraste, accesibilidad, ci]
requires:
  - phase: "02-05"
    provides: "texto y control en cero; 190 de dinamismo, todos en .aviso__fotos"
provides:
  - "tools/check-contraste.js sale 0 en las 17 rutas y los dos temas"
  - "npm run auditar sale 0 con el contraste dentro de la cadena"
  - "lista de excepciones cerrada, cada una con su razón"
affects: ["verificación humana de la fase 2", "PR de la fase (pendiente, no se abrió por instrucción)"]
tech-stack:
  added: []
  patterns:
    - "Tinta neutra rgba(20, 22, 22, α) para sombras y velos, en lugar del azul noche rgba(7, 26, 43, α)"
key-files:
  created: [.planning/phases/02-tema-claro-y-oscuro-coherentes/02-06-SUMMARY.md]
  modified: [styles.css, tools/check-contraste.js]
key-decisions:
  - ".aviso__fotos entra en EXCEPCIONES (regla 3): va sobre la foto, medida a mano 9.01:1 sobre foto blanca y 18.91:1 sobre negra"
  - ".foto__sello sale de EXCEPCIONES: su razón era falsa (es ámbar, no oscuro) y el comprobador sale en 0 sin ella"
  - "Los tintes al 5-10 % de azul noche pasan a --app-soft, que gira con el tema; sombras y velo del filtro a la tinta neutra"
  - ".perfil__logo lleva blanco fijo (#FFFFFF): var(--blanco) es casi negro en oscuro"
requirements-completed: [UI-01, UI-02, UI-03]
metrics:
  duration: ~35 min
  tasks: "1 de 3 (la 2 es verificación humana; la 3, el PR, no se hizo por instrucción)"
  files: 2
  completed: 2026-09-25
---

# Fase 02 Plan 06: cierre de la fase

**El comprobador de contraste sale en 0 en las 17 rutas y los dos temas, y
`npm run auditar` pasa entero con él dentro. La única excepción nueva es la
cuenta de fotos sobre la imagen; sale la del sello de la foto, que tenía la
razón equivocada.**

## Números del comprobador

Base sembrada con `node tools/seed.js` en el scratchpad de la sesión; servidor
y comprobador con la misma `MERCA_DB`. Primero en el 8091; la cadena completa
`npm run auditar` en el 8080, que estaba libre.

| | antes (fin del 02-05) | después |
|---|---|---|
| **total** | **190** | **0** |
| `control` | 0 | 0 |
| `texto` | 0 | 0 |
| `dinamismo` | 190 (`.aviso__fotos`, 95 pastilla + 95 icono) | 0 |

## Tabla de contrastes de antes y después (para el PR)

Los «antes» son los medidos al planificar, sin recalcular.

| caso | antes | después |
|---|---|---|
| borde de control, claro | 1.30 | 3.58 tarjeta / 3.25 fondo / 3.08 suave (`#848889`) |
| borde de control, oscuro | 1.66 | 4.27 / 3.80 / 3.30 (`#727677`) |
| `--texto-claro` (claro) | 2.14 | `#686D70`: 5.24 / 4.75 / 4.50 |
| `--ambar-hondo` como letra (claro) | 2.95 | la letra ámbar va en `--ambar-texto` `#8F6100`: 5.42 / 4.91 / 4.66; `--ambar-hondo` queda para superficies |
| `.perfil__texto` en oscuro | 1.31 | 13.33 (`#D5DEE5` sobre `#141616`, fijo en los dos temas) |
| `#B3261E` sobre `--sup-error` oscuro | 2.66 | 8.66 (`--texto-peligro` `#F3A29C` en oscuro) |
| borde de aviso de error `#E8C4C4` en oscuro | 10.87 (chillón) | 1.49 (`--borde-error` `#5A2A26`, a la par del claro) |
| borde de `.btn-tabla--borrar` | rojo al 30 %, bajo 3:1 | 6.54 claro / 9.76 oscuro |
| borde de `.btn-tabla--avisa` (claro) | 2.95 | 5.42 |

Los valores de D-01 (`#8F6100` y `#686D70`) ya los había adelantado el 02-01;
aquí no se movió ningún token.

## Lista final de EXCEPCIONES

Todas con `reglas: [3]` (exentas del dinamismo, nunca de la legibilidad):

| selector | razón |
|---|---|
| `.mosaico__pieza` | fotos sobre superficie oscura fija; si girara, flotarían sobre crema |
| `.videos__pieza` | banda del vídeo en negro fijo, convención de cualquier reproductor |
| `.aviso__fotos` | **nueva**: va sobre la fotografía, que no gira; velo y letra blanca tampoco deben. Comprobado en el navegador que está dentro del rectángulo de la `img` cargada; medido 9.01:1 sobre foto blanca, 18.91:1 sobre negra |
| `.perfil` | cabecera del dealer fijada oscura por decisión de Victor; la regla 1 la sigue midiendo |
| `.pub-muestra` | `ajustarContraste` le elige el color midiendo el fondo real |
| `.btn--ambar, .cab__nav-cta` | `#151515` sobre ámbar de marca, correcto en los dos temas |

Sale `.foto__sello`: decía «su fondo oscuro» y es ámbar. Con el comprobador en
0 sin ella, no hace falta. Ojo: el sello solo aparece tras subir fotos en
`publicar.html`, así que el comprobador no lo ve; si algún día lo viera,
la razón legítima sería la de `.btn--ambar`, no la que tenía.

## Commits

| commit | qué |
|---|---|
| `970e9c8` | azul noche activo a tinta neutra o `--app-soft`; inertes anotados; `.perfil__logo` y borde de `.btn-tabla--borrar` |
| `50860d8` | `.aviso__fotos` entra en EXCEPCIONES, sale `.foto__sello`, comentario de `.perfil` al día |
| `36c95b7` | borde de `.btn-tabla--avisa` a 3:1 en claro |

## Qué pasó con el `rgba(7, 26, 43, …)`

| dónde | estado | ahora |
|---|---|---|
| sombra de `.cat-tarjeta:hover`, `.pestanas__op--activa`, `.chat__lanzador`, `.chat__panel`, `.perfil__logo` | activas | `rgba(20, 22, 22, α)` mismo alfa |
| `.velo-filtros` (móvil) | activo | `rgba(20, 22, 22, .5)` |
| degradado de `.foto__mandos` (sobre la foto) | activo | `var(--velo-foto)` |
| tinte de `.nota-rnc`, `.invitacion-dealer`, `.pastilla--azul`, `.estado--vendido` | activos | `var(--app-soft)`: en oscuro el tinte azul al 5-10 % no se veía |
| `.heroe__foto::after` (y su `@media`) | inerte: `display: none !important` en la piel app | anotado en la hoja, sin tocar |
| `.mosaico__pieza::after` de la piel vieja | inerte: lo pisa la piel app | anotado en la hoja, sin tocar |

## Desviaciones

**1. [Regla 1] Borde de `.btn-tabla--avisa` a 2.95:1 en claro.** Estaba junto
al de borrar y con el mismo fallo: `--ambar-hondo` como contorno de control.
Pasa a `--ambar-texto`; en oscuro los dos valen `#F2A900`, cero cambio ahí.
Tras el muro de sesión, el comprobador no lo ve.

**2. Tareas 2 y 3 del plan no se hicieron aquí.** La 2 es verificación humana
(abajo). La 3, el PR, quedó fuera por instrucción del orquestador: sin push ni
PR. Por eso no hay número de PR, ni pasada de CI, ni duración del job
`navegador`.

**3. `styles.css` y `check-contraste.js` están en LF en la copia de trabajo**
(cero `\r` antes y después; git los normaliza con `autocrlf=true`). Se
conservaron así. Diff total: 2 archivos, +29 −18.

## Verificación

| prueba | resultado |
|---|---|
| `node tools/check-contraste.js` (8091 y 8080) | salida 0, 0 hallazgos, 17 rutas × 2 temas |
| `npm run auditar` (8080, misma `MERCA_DB`) | salida 0: público 0 hallazgos, flujos 0, permisos 0 fallos, contraste 0. Repetida tras el último commit: igual |
| `npm run check` | salida 0, sin problemas |
| `npm run check:motion` | salida 0 |
| `npm run check:encoding` | salida 0, 0 archivos por reparar |
| `npm run seguridad:probar` | 71 bien, 0 mal |
| `npm run dealer:probar` | 49 bien, 0 mal |
| `npm run facturas:probar` | «Todo correcto» |
| `npm run chat:probar` | 40 bien, 0 mal |
| `npm run facturas:letras` | 6 pasan, 0 fallan |
| `package.json` y `assets/*.js` | sin cambios |

## Para verificación humana (tarea 2 del plan)

1. `equipos.html` en claro: «Limpiar», `select` y buscador de filtros con borde visible.
2. `panel.html` en oscuro con sesión: la fila de la tabla se realza al pasar el cursor y no se pone blanca; los botones «Borrar» y «Avisar» con contorno visible.
3. `dealer.html?d=maquinarias-del-caribe` en oscuro: descripción y categorías legibles; cabecera oscura en los dos temas; el logo sobre recuadro blanco en los dos.
4. `publicar.html` en oscuro: aviso de error de formulario legible, borde sin rosa chillón; sello «Fuera del plan» sobre la foto.
5. Teléfono real: la barra del navegador cambia de color al cambiar de tema.

Además, pendiente fuera de este plan: abrir el PR de la fase con la tabla de
arriba y comprobar en su pasada que `pruebas` y `navegador` salen en verde,
`desplegar` omitido y cuánto tarda `navegador` (tope 15 min).

## Self-Check: PASSED

- `styles.css`, `tools/check-contraste.js` — FOUND
- commits `970e9c8`, `50860d8`, `36c95b7` — FOUND
- Ningún commit borra archivos
