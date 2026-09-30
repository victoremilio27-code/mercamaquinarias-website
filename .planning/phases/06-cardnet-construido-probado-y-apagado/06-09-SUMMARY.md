---
phase: 06-cardnet-construido-probado-y-apagado
plan: 09
subsystem: frontend
tags: [cardnet, panel, tarjetas-guardadas, renovacion-automatica, pci, apagado]

requires:
  - phase: 06-cardnet-construido-probado-y-apagado
    provides: "06-05 tarjetas, renovacionTarjeta, proximoIntento, sinCobro, DELETE /api/metodos-pago/:id, PUT renovacion-automatica con metodoPago; 06-07 window.CardnetCaptura"
provides:
  - "assets/panel.js: renovar y agregar publicaciones activas con tarjeta nueva o guardada"
  - "Sección «Tarjetas guardadas» con borrado confirmado"
  - "Interruptor de renovación automática con tarjeta y fecha del próximo intento"
  - "Pagos en espera con tarjeta explicados sin datos bancarios"
affects: [06-10]

key-decisions:
  - "Solo se toca assets/panel.js; la confirmación con tarjeta sigue en assets/cardnet.js (panel.js no contiene «/confirmar»)"
  - "Todo lo nuevo cuelga de METODOS_PAGO.includes('cardnet'), de TARJETAS no null o de RENOVACION_AUTO.disponible: apagado, el panel es el de hoy"
  - "El estado de la renovación automática se repinta con recargarTodo() tras cada PUT, para que diga la tarjeta y la fecha reales del servidor"

requirements-completed: [PAGO-04, PAGO-05, PAGO-08]

duration: ~30min
completed: 2026-09-30
---

# Phase 6 Plan 09: el panel con tarjeta

**`assets/panel.js` renueva y amplía con tarjeta (selector y modal de `CardnetCaptura`), lista y borra las tarjetas guardadas y gobierna la renovación automática diciendo con qué tarjeta y cuándo; con CardNet apagado no se pinta ni se escucha nada nuevo.**

## Tareas

| Tarea | Nombre | Commit |
|-------|--------|--------|
| 1 | Renovar y agregar publicaciones activas con tarjeta; pagos en espera con tarjeta | 0997d54 |
| 2 | Tarjetas guardadas y renovación automática con tarjeta | 27fcda5 |

## Qué hace cada pieza

- `guardarPagos` guarda `TARJETAS` (null si el servidor no manda `tarjetas`, es decir CardNet apagado). `ROTULO_METODO.cardnet` = «Tarjeta de crédito o débito».
- `abrirRenovacion` / `abrirAmpliacion`: con `cardnet` ofrecido pintan `CardnetCaptura.selectorDeMetodo` (prefijos `ren` y `amp`; la casilla de renovación automática va dentro del selector solo en renovar, desmarcada; la ampliación no lleva casilla). La casilla vieja `#chkRenovacionAuto` no se pinta con el selector.
- `pagarRenovacion` / `confirmarAmpliacion`: el cuerpo toma `CardnetCaptura.leerMetodo`. Un 202 con `cardnet` abre `CardnetCaptura.abrir`; con `redireccion` va por `CardnetCaptura.tratar`. `alAprobar` y `alEsperar` comparten la misma función de cierre que el 201/200 directo (`terminarRenovacion`, `terminarAmpliacion`); `alRechazar` reactiva el botón y enseña el texto del banco. Un 402 de una tarjeta guardada lo lanza `api()` y sale por el `catch` de siempre.
- Pagos en espera con `procesador === 'cardnet'`: sin datos bancarios. `sinCobro` true: «Pago con tarjeta sin completar. Si no se completa, se anula solo en 24 horas sin cobrarle nada.»; si no: «Estamos confirmando el pago con su banco; no lo pague otra vez.» (un `sinCobro` ausente cae en el texto prudente).
- «Tarjetas guardadas» (`tarjetasGuardadasHTML`, en las cuatro variantes de `pintarPlan`): «{marca} terminada en {ultimos4}» · «vence mm/aa», «pendiente de activar» si `activo` es false, «Borrar» con `confirm()` y `DELETE /metodos-pago/:id` en `try/catch`. Sin tarjetas: «No tiene tarjetas guardadas. Se guardan al pagar con tarjeta.»
- Interruptor: línea de estado `data-renovacion-estado` bajo la casilla. Activada: «Se renovará automáticamente con {marca} terminada en {ultimos4} el {fecha}.»; con `renovacionIntentos > 0`: «… El último cobro de la renovación no se aprobó; lo intentaremos otra vez el {fecha}.»; desactivada: «Tu anuncio vence el {fecha}.» (texto literal del modelo comercial §30). Activar sin tarjeta: «Para renovar automáticamente hace falta una tarjeta guardada. Se guarda la primera vez que paga con tarjeta.» (sin llamar al servidor); con varias y sin tarjeta ya elegida para ese plan, `<select>` en línea «Renovar con» y «Activar»; con una sola manda su `metodoPago`. 409/400 del servidor revierten la casilla y enseñan su texto.

## Verificación

- `node --check assets/panel.js`, `check:encoding` (0 por reparar), `cardnet:probar` (462 comprobaciones, 0 fallos; barrera PCI sobre `assets/` incluida).
- Comprobación de textos exigidos: `CardnetCaptura.abrir/leerMetodo/selectorDeMetodo`, rótulo `cardnet`, «Tarjetas guardadas», `/metodos-pago/`, «Se renovará automáticamente con», «lo intentaremos otra vez el»; sin `/confirmar`, sin `prompt(`, sin teléfono/WhatsApp.
- Pendiente de la batería del orquestador: `check:contraste` (necesita puppeteer y falla como root sin `--no-sandbox` en este entorno), auditorías de navegador y revisión visual del panel con CardNet encendido. Ninguna clase de CSS nueva: la sección usa `tarjetas-guardadas` (sin regla) y clases ya existentes.
- Apagado: `TARJETAS` es null, `METODOS_PAGO` sin `cardnet` y `RENOVACION_AUTO.disponible` false, así que todas las ramas nuevas quedan inactivas (`selectorDeMetodo` ni se llama).

## Deviations from Plan

**1. [Nota] Fin de línea:** en este worktree `assets/panel.js` está en LF (0 retornos de carro); se editó con scripts que respetan lo que hay, sin mezclar finales de línea.

**2. [Ajuste] Nombre de clase:** la sección no usa la clase `.tarjetas` que el plan mencionaba, porque 06-07 ya la definió como estilo de la etiqueta del selector de tarjeta (fuente pequeña en cuadrícula) y habría cambiado el aspecto de la sección; se llamó `tarjetas-guardadas`.

**3. [Nota] Tras cada PUT de renovación automática** se llama a `recargarTodo()` (repinta el panel) para que el estado diga la tarjeta y fecha reales; solo ocurre con la renovación automática disponible, es decir con CardNet activo.

## Estados no verificables sin CardNet en lab

- Que el iframe se pueda embeber y la altura del reto 3-D Secure (ver 06-07).
- Forma real de `proximo_cargo` (se usa `slice(0, 10)` para la fecha).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del registro: T-06-48 (todo valor del servidor por `esc()`), T-06-49 (solo marca, últimos cuatro y vencimiento), T-06-50 (el estado dice tarjeta y fecha; con varias se obliga a elegir), T-06-51 (sin llamada propia a `/confirmar`).

## Self-Check: PASSED

- FOUND: assets/panel.js con «Tarjetas guardadas», commits 0997d54 y 27fcda5
- Sin modificaciones a STATE.md ni ROADMAP.md
