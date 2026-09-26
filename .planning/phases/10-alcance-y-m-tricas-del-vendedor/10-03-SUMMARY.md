---
phase: 10-alcance-y-m-tricas-del-vendedor
plan: 03
subsystem: panel del anunciante y asistente de publicar
tags: [metricas, contactos, duplicar, panel, publicar]
requires: [10-01]
provides: ["contactos recibidos en panel.html", "compartidos en la tarjeta Guardados", "boton Duplicar", "cargarCopia en publicar.js", "?duplicar= en publicar.html"]
affects: [tools/auditar-metricas.js (10-04)]
tech-stack:
  added: []
  patterns: [navegación de fila con location.href en vez de SPA, cadena de <select> restaurada disparando `change` nivel por nivel]
key-files:
  created: []
  modified: [assets/panel.js, panel.html, styles.css, assets/publicar.js]
decisions:
  - "cargarCopia() no toca `estado` ni `localStorage`: decide quien llama, según haya o no un borrador a medio escribir que el dueño no quiera perder."
  - "?duplicar= se quita de la URL con history.replaceState tanto si la copia se usó como si falló: recargar nunca debe repetir la pregunta ni el intento."
  - "Si la copia falla y no había ningún borrador que mostrar en su lugar, se avisa en el mismo #avisoBorrador con un mensaje genérico, en vez de dejarlo sin explicación."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Fase 10 Plan 03: contactos atribuidos y duplicar un anuncio

El panel lista cada contacto con el equipo y la hora de Santo Domingo que lo trajo,
filtrable por equipo y por canal, y la tarjeta «Guardados» suma cuántas veces se
compartió. Cada fila de la tabla de anuncios tiene «Duplicar», que abre
`publicar.html?duplicar=<id>` con el asistente precargado —equipo, precio, contacto,
fotos y video— salvo el número de serie, avisando de que es una copia y preguntando
antes de reemplazar un borrador a medio escribir.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 3ddd16c | `pintarMetricas` con compartidos en la tarjeta Guardados; `panelContactos` en `panel.html`; `montarContactos()` con los filtros de equipo y canal |
| 2 | 6a6503e | `data-duplicar` en `filaAnuncio` y su listener en `montarPanel`; `cargarCopia()` y la rama `duplicar` de `montarPublicador`; corregido de paso un bug preexistente que vaciaba categoría/marca/modelo al recuperar cualquier borrador |

## Verificación

- `metricas:probar` 59/0 (sin cambios: la tarea 2 es solo frontend, no toca el servidor).
- Sintaxis de `assets/panel.js` y `assets/publicar.js` comprobada con `vm.Script`.
- **Recorrido real en navegador** (puppeteer, Chrome headless con `--no-sandbox` vía un
  envoltorio en `/tmp`, servidor de demostración propio en el puerto 8121 —el 8080 y el
  8093 los ocupan otros agentes—): como visitante, ficha del JCB 3CX de `jperez` →
  `POST /api/eventos` con `whatsapp`; entrando como `jperez@demo.mercamaquinarias.do`,
  `panel.html` muestra la fila «2017 JCB 3CX · WhatsApp» en `#filasContactos`; al pulsar
  `[data-duplicar]` la URL acaba en `publicar.html` sin `duplicar`, `#e-modelo` vale
  `3CX`, `#e-serie` queda vacío y `#avisoBorrador` dice «Copia de 2017 JCB 3CX. ...».
  También se repitió sin la copia, con un borrador a mano en `localStorage`, para
  aislar el bug de abajo del camino de duplicar.

## Desvíos del plan

### Corregidos automáticamente

**1. [Regla 1 · error] `montarPasoEquipo()` no se esperaba: cualquier borrador
recuperado perdía categoría, marca y modelo**
- **Encontrado en:** Tarea 2, al probar Duplicar en un navegador de verdad.
- **El problema:** `montarPublicador()` llamaba a `montarPasoEquipo()` sin `await`.
  Esa función llena los `<select>` de categoría/marca/modelo al recibir la taxonomía
  del servidor; `volcarEstadoAlFormulario()` corría antes de que existieran esas
  `<option>`, así que asignarles un valor no hacía nada. Además, el único
  `dispatchEvent('change')` (el de categoría) reponía la subcategoría por código en
  vez de disparar su propio `change`, así que el manejador de marca corría con la
  subcategoría todavía en blanco y la lista de marcas quedaba vacía. El número de
  serie sí sobrevivía —es un campo de texto suelto, no depende de ninguna lista—, lo
  que ocultaba el problema en cualquier revisión que solo mirara ese campo.
  No es un bug de esta fase: afecta a **cualquier** borrador recuperado, no solo a la
  copia. Nadie lo había visto porque 10-02 no pudo correr un navegador en su sesión.
- **La corrección:** se espera `montarPasoEquipo()` antes de volcar el borrador, y la
  restauración dispara los cuatro `change` en cadena —categoría, subcategoría, marca,
  modelo—, cada uno después de fijar el valor del nivel correspondiente. Si el modelo
  guardado no está en la lista de esa marca, se cae a «Otro modelo…» con el texto en
  `#e-modelo-otro`, igual que haría alguien escribiéndolo a mano.
- **Archivos modificados:** `assets/publicar.js`.
- **Verificación:** recorrido en puppeteer descrito arriba, repetido con un borrador
  manual sin copia de por medio.
- **Confirmado en:** 6a6503e (commit de la Tarea 2).

---

**Total de desvíos:** 1 corregido automáticamente (Regla 1).
**Impacto en el plan:** necesario para que «Duplicar abre el asistente lleno» sea
cierto; sin la corrección, el criterio de éxito de la Tarea 2 no se cumplía. Sin
alcance añadido fuera de lo que el propio plan pedía verificar.

## Pendiente fuera de alcance

- La copia de un anuncio no restaura motor ni transmisión (`#e-motor-marca` y
  similares): `estadoInicial()` no tiene esos campos y `volcarEstadoAlFormulario()`
  nunca los toca, aunque `copiarAnuncio` en `tools/api.js` sí los manda. No afecta al
  JCB 3CX de la prueba (una retroexcavadora no lleva tren motriz) ni a ningún criterio
  de éxito de esta fase —solo lo llevan los vehículos de carretera—, así que queda
  anotado y no corregido aquí. Anotado también en `deferred-items.md`.

## Self-Check: PASSED
