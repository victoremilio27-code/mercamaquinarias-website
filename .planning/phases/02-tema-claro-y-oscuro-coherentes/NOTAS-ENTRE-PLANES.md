# Notas que pasan de un plan a otro

Cosas descubiertas ejecutando un plan que cambian el alcance de otro. Se escriben aquí
porque los SUMMARY se leen tarde y esto hay que saberlo **antes** de lanzar el plan
afectado.

## Para 02-05 · Amplía el alcance más allá de `styles.css`

**1. Tres `#071A2B` viven en `index.html`, no en la hoja de estilos.**

`index.html:95-97`, las paradas del degradado `#desvanece` dentro del SVG del plano del
héroe:

```
<stop offset="0"   stop-color="#071A2B" stop-opacity="1"/>
<stop offset=".42" stop-color="#071A2B" stop-opacity=".82"/>
<stop offset=".78" stop-color="#071A2B" stop-opacity="0"/>
```

Ese degradado **no se mueve al cambiar de tema**, que es exactamente lo que UI-01
persigue. El plan 02-05 daba por hecho que fuera de los metas solo quedaban 3 `#071A2B`
y los tres en `styles.css`. Si solo mira `styles.css`, **no los encuentra**.

Hallado por el plan 02-02, confirmado con grep sobre todo el árbol.

**2. Lo que queda de `#071A2B` en el código fuente, ya inventariado:**

| Dónde | Qué es | Qué hacer |
|---|---|---|
| `index.html:95-97` | degradado del SVG del héroe | **convertir** — es el hueco de arriba |
| `styles.css:880` | `--oferta-tinta` | **convertir** — literal congelado, ya estaba en el plan |
| `styles.css:40` | `--azul` en el `:root` general | dejar: es el valor base que los bloques de tema pisan |
| `styles.css:30` | comentario de la guía de marca | dejar: es texto, no un valor |
| `proximamente.html` (3) | meta, token propio y logotipo | dejar, ver abajo |

## Sobre `proximamente.html`

El plan 02-02 **no** le cambió el `theme-color`, y la decisión es correcta: es la única
de las 19 páginas que **no carga `assets/tema.js`**, define su propio `--azul` y su fondo
es exactamente ese azul marino. Ponerle `#F4F4F1` dejaría la barra del teléfono blanca
sobre una página azul, de forma permanente, porque ahí no hay script que la corrija.

**Pero corrijo el razonamiento que acompañaba a esa decisión**, para que no se propague:
el informe decía que, con `vercel.json` todavía en el repositorio, `proximamente.html` es
«hoy la página que ve quien entra al dominio». **Es falso.** Comprobado contra el dominio
real: `mercamaquinarias.com` responde 200 con el `index.html` de verdad, servido por el
VPS detrás de Cloudflare, sin cabeceras `x-vercel-*`, y `/api/estadisticas` devuelve datos
vivos, cosa que un alojamiento estático no puede hacer. Vercel está fuera del camino.

Es el mismo error que cometió el mapeador de `STACK.md`: creerse `deploy/VERCEL.md` en vez
de comprobar el estado. El documento describe un plan de migración que **ya se ejecutó**.

**Consecuencia real:** `proximamente.html` y `vercel.json` son restos. `deploy/VERCEL.md`
dice en su propia línea 66 que se borran el día del lanzamiento. **Borrarlos no es trabajo
de esta fase** y necesita el visto bueno de Victor, así que queda anotado como pendiente,
no hecho.

## Sobre la verificación de 02-02

La comprobación automática pedía cero `#071A2B` en las 19 páginas. Se corrió acotada a las
**18 que cargan `tema.js`**, y salen 18/18. La 19 es `proximamente.html`, por lo de arriba.
Si alguien vuelve sobre esto: no es un fallo, es la excepción documentada.
