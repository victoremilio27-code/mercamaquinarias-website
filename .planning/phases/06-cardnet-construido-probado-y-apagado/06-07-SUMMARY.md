---
phase: 06-cardnet-construido-probado-y-apagado
plan: 07
subsystem: frontend
tags: [cardnet, iframe, modal, pci, publicar, planes, apagado]

requires:
  - phase: 06-cardnet-construido-probado-y-apagado
    provides: "06-05 rutas de cobro con 202 { pago, cardnet { urlCaptura, origen } }, /api/pagos/:id/confirmar, /api/metodos-pago/:id/activar, tarjetas y renovacionAutomatica en /api/membresias"
provides:
  - "assets/cardnet.js: window.CardnetCaptura (modal del iframe, confirmación única, selector de método compartido)"
  - "Pago con tarjeta nueva o guardada en publicar.html y planes.html"
  - "cardnet.js cargado antes de panel.js (lo usará 06-09)"
affects: [06-09, 06-10]

key-decisions:
  - "La tarjeta solo se teclea en el iframe de CardNet: el src va por propiedad y solo se acepta el mensaje del origen exacto que dio el servidor"
  - "Único punto del navegador que llama a la confirmación: cardnet.js, con su propio fetch (api() descarta el cuerpo de 402/202/409)"
  - "El selector no repinta al cambiar de método en planes: solo cambia el texto del botón y el aviso de transferencia, para no quitar el foco al radio"
  - "El selector se crea en un contenedor propio junto a #metodoPublicar; sin CardNet no existe y los HTML no cambian"

requirements-completed: [PAGO-04, PAGO-05, PAGO-08]

duration: ~35min
completed: 2026-09-30
---

# Phase 6 Plan 07: pagar con tarjeta en publicar y en planes

**`assets/cardnet.js` abre el formulario seguro de CardNet en un modal con iframe, confirma una sola vez con el servidor y reparte el resultado; publicar.js y planes.js lo usan para pagar con tarjeta nueva o guardada, y apagado no se pinta ni escucha nada.**

## Tareas

| Tarea | Nombre | Commit |
|-------|--------|--------|
| 1 | assets/cardnet.js, el modal de captura y su confirmación (+ 3 HTML + styles.css) | 2a1ee7e |
| 2 | publicar.js y planes.js pagan con tarjeta nueva o guardada | 319f780 |

## Interfaz final de `window.CardnetCaptura`

| Función | Qué hace |
|---------|----------|
| `pedir(ruta, cuerpo)` | `fetch` POST a `/api` + ruta; devuelve `{ estado, datos }`; nunca lanza (sin red: `estado: 0`) |
| `abrir({ pago, captura, alAprobar, alRechazar, alEsperar, alCancelar? })` | Modal con el iframe (`src` por propiedad), «Ya ingresé mi tarjeta» y «Cancelar»; escucha `message` solo del origen exacto; una sola confirmación por captura |
| `confirmar(idPago, metodoPago, manejadores)` | La ÚNICA llamada del navegador a `POST /api/pagos/:id/confirmar`; reparte con `tratar` |
| `tratar({ estado, datos }, manejadores, contexto?)` | 200/201 aprobado; 402 rechazado (texto del banco tal cual); 202 con `redireccion` (solo si su origen es el `origen` del servidor) o espera; 409 `activacion` paso del código; 409 en curso, nada visible; otro: mensaje de «no pudimos confirmar» |
| `cerrar()` | Quita el diálogo y los oyentes |
| `selectorDeMetodo({ metodos, tarjetas, renovacion, prefijo, previo? })` | HTML del grupo de método; cadena vacía si `metodos` no incluye `cardnet` |
| `leerMetodo(raiz)` | `{ metodo, metodoPago?, renovacionAutomatica? }`, cada clave solo si procede; `{}` sin selector |
| `leerEstado(raiz)` | Añadido: estado completo del selector para repintarlo sin perder lo elegido (no se manda al servidor) |

`alCancelar` es opcional; si falta, cancelar llama a `alRechazar` con el texto de cancelación.

## Textos de cada estado del modal

- Abierto: «Pague con su tarjeta» / «Sus datos se escriben en el formulario seguro de CardNet; MercaMaquinarias no los ve ni los guarda.» / iframe titulado «Formulario seguro de CardNet» / botones «Ya ingresé mi tarjeta» y «Cancelar».
- Confirmando: «Confirmando su pago…» (botones deshabilitados).
- Cancelado (Cancelar o Escape): «No se le cobró nada. Puede intentarlo de nuevo cuando quiera.» (por `alCancelar` o `alRechazar`).
- Aprobado: se cierra; publicar muestra «Anuncio publicado»; planes «Listo. Contrató N publicaciones activas de …».
- Rechazado (402): se cierra y se muestra el motivo del banco tal cual, en el aviso de la pantalla.
- En proceso (202): se cierra; publicar pinta «Esperando confirmación del pago» con el aviso del servidor; planes usa su bloque de espera.
- Verificación del banco (202 con redirección): «Su banco necesita confirmar el pago; le llevamos a su página.» y `location.assign`.
- Activación (409): «Código de activación que le envió su banco» (`inputmode="numeric"`, `autocomplete="one-time-code"`, máx. 12) y «Activar»; un 400 muestra el error sin cerrar; si va bien repite la confirmación.
- Sin poder confirmar: «No pudimos confirmar el pago. Si se le cobró, se confirmará solo en unos minutos; no lo pague otra vez.» (el modal sigue abierto y se puede repetir la confirmación, idempotente en el servidor).

## Comportamiento por pantalla

- **publicar.html:** el selector se crea (`#selectorMetodoPublicar`) solo con `cardnet` ofrecido y total > 0. El botón dice «Pagar {total} con tarjeta y publicar» con tarjeta elegida. El cuerpo del pago añade lo que devuelve `leerMetodo`; sin selector, `metodo: 'transferencia'` como hoy. El borrador local no se borra hasta aprobar o quedar en espera.
- **planes.html:** el selector va dentro de `#resumenPlan`; botón «Pagar {total} con tarjeta»; el aviso de transferencia se oculta con tarjeta elegida. El botón sigue ocupado mientras el modal está abierto.
- **Casilla de renovación:** solo dentro del selector, desmarcada, con el texto del servidor, visible solo con «Tarjeta» elegido (CSS `:has`) y enviada solo si se marcó.
- **Apagado:** `selectorDeMetodo` da cadena vacía, `leerMetodo` da `{}`, los HTML solo ganan una línea `<script>`; textos, cuerpos y botones son los de hoy. En planes.js el pedido gana solo espacio en blanco en la plantilla.

## Verificación

- `node --check` de cardnet.js, publicar.js y planes.js: bien.
- `check:encoding`: 0 por reparar.
- `cardnet:probar`: 395 comprobaciones, 0 fallos (barrera PCI incluida, recorre `assets/` y los `.html`).
- Prueba rápida en node del selector: escapa marca y ids, oculta con métodos sin `cardnet`, casilla desmarcada por defecto.
- Ningún `/confirmar` de pago fuera de cardnet.js (`contactos.js` tiene otro, de teléfonos, ajeno).
- Pendiente de la batería del orquestador (no se corrió: puerto 8080 y puppeteer como root sin `--no-sandbox`): `check:contraste` sobre el bloque nuevo de `styles.css`, `auditar` y `check`, y una revisión visual a 360 px en claro y oscuro.

## Deviations from Plan

**1. [Ajuste del verificador] La comprobación de orden de scripts del plan falla con `publicar.html`**
- `publicar.html` menciona `assets/publicar.js` en dos comentarios (l. 92 y 238) antes del bloque de scripts, así que la búsqueda `assets/(publicar|...).js` da un índice menor que el de cardnet.js aunque el orden real es correcto. Se comprobó con la etiqueta `<script src="...">` completa: los tres HTML cargan cardnet.js justo antes de su script de página.

**2. [Adición] `leerEstado` y `alCancelar`**
- No estaban en el plan. `leerEstado` evita perder «Otra tarjeta» y la casilla al repintar el resumen; `alCancelar` permite distinguir una cancelación de un rechazo si una pantalla quiere.

**3. [Corrección de mi verificación] Comentario con `/confirmar` en publicar.js**
- El criterio prohíbe la cadena en publicar.js y planes.js; un comentario propio la contenía y se reescribió.

## Lo que queda por ver en lab (no verificable sin CardNet)

- Forma exacta del `message` que CardNet manda al terminar la captura (hoy vale cualquier mensaje del origen exacto; es solo una señal).
- Que CardNet permita ser embebido en un iframe desde nuestro dominio (cabeceras `frame-ancestors` del lado de ellos). El `frame-src` hacia su origen ya lo pone `tools/cabeceras.js` solo con CardNet encendido.
- Altura suficiente del iframe (420 px) para el reto 3-D Secure.
- Orden real de activación (409 con `activacion`) y del 202 con redirección.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del registro del plan (T-06-36 a T-06-41 mitigados: origen exacto, sin campos de tarjeta, `esc()` y `src` por propiedad, bandera contra doble confirmación, redirección solo al origen del servidor, casilla desmarcada y solo con tarjeta).

## Self-Check: PASSED

- FOUND: assets/cardnet.js, commits 2a1ee7e y 319f780
- Sin modificaciones a STATE.md ni ROADMAP.md
