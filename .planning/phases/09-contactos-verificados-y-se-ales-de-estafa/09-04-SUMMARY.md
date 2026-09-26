---
phase: 09-contactos-verificados-y-se-ales-de-estafa
plan: 04
subsystem: interfaz pública
tags: [contactos, ficha, estafas, sitemap]
requires: [09-02]
provides: [estafas.html, contactosHTML filtrado, aviso enlazado]
affects: []
tech-stack:
  added: []
  patterns: [filtro de privacidad repetido en el navegador para que el dueño vea su ficha como el comprador]
key-files:
  created: [estafas.html]
  modified: [assets/app.js, tools/meta.js, tools/check-links.js, tools/auditar-publico.js, tools/check-contraste.js, tools/probar-contactos.js, .planning/ROADMAP.md]
decisions:
  - "No se necesitó el interruptor de emergencia que el encargo pedía comprobar: con MERCA_SMS apagado, la vía por correo sigue activa sin ninguna condición (tools/api.js pedirCodigoContacto), así que un anunciante en producción siempre puede reverificar sus números tras la fusión. Ver 'Comprobación del riesgo de lanzamiento' abajo."
  - "El párrafo sin ningún verificado usa panel__texto en vez de una clase nueva: no había que tocar styles.css."
  - "La vía de cada número se pinta con la clase contactos__nota ya existente (texto pequeño gris bajo el número), reutilizada dos veces si además hay una nota del anunciante."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 9 Plan 04: la ficha solo enseña teléfonos verificados y un aviso que lleva a la guía dominicana

`contactosHTML` filtra por `t.verificado`, rotula «Teléfonos verificados», dice bajo cada número si se
verificó por SMS o por correo, y si no hay ninguno lo explica sin enseñar números. El aviso de la ficha
enlaza «Señales de estafa: qué revisar antes de pagar» a `estafas.html`, página nueva sin ningún teléfono,
dada de alta en el sitemap, en `check-links`, en `auditar-publico` y en `check-contraste`.

## Comprobación del riesgo de lanzamiento

Antes de tocar código se comprobó si, con el SMS apagado (`MERCA_SMS`) y sin que ningún anuncio existente
se dé por verificado (decisión D-08 de la fase), el filtro de la ficha se quedaría sin ninguna vía para
que un anunciante verifique su número el día que esto se fusione a producción.

**Resultado: sí hay una vía que funciona con el SMS apagado, no se cambió nada.** En
`tools/api.js` (`pedirCodigoContacto`, ~línea 2636) la vía `correo` no pasa por `correo.smsActivo()`:
solo la vía `sms` la comprueba y responde 400 si está apagada. El código por correo va al correo ya
verificado de la cuenta con sesión (D-03 de `09-CONTEXT.md`), y esa vía queda activa sin ningún
interruptor de por medio. Un anunciante con anuncios en producción, tras la fusión, entra a su panel
(sección «Teléfonos de contacto», 09-03) o al paso 4 de publicar y verifica sus números por correo en el
acto; no depende de que Victor pague los créditos de Brevo. Por eso no se construyó el interruptor de
emergencia que el encargo pedía dejar listo para el caso contrario: la condición que lo habría exigido
(«ninguna vía funciona con el SMS apagado») no se da.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 77123cb | `contactosHTML` filtra por `t.verificado`, rótulo, vía por número, párrafo sin ninguno verificado; aviso con enlace a `estafas.html` |
| 2 | 2796b98 | `estafas.html`; alta en `tools/meta.js` (sitemap), `tools/check-links.js`, `tools/auditar-publico.js`, `tools/check-contraste.js`; prueba estática (criterio 4) en `tools/probar-contactos.js` |

## Verificación

- `npm run contactos:probar`: 63 bien, 0 mal (incluye el bloque nuevo «La página de estafas», criterio 4).
- `npm run seguridad:probar` 71/0, `npm run dealer:probar` 49/0, `npm run bitacora:probar` 72/0,
  `npm run pagos:probar` 75 correctas, `npm run facturas:probar` «Todo correcto», `npm run chat:probar` 40/0,
  `npm run facturas:letras` 6/6, `npm run check:encoding` sin caracteres sospechosos.
- `npm run auditar` (taxonomía, público, flujos, permisos, contraste) y `npm run check` (enlaces) contra un
  servidor propio en el puerto 8241 con base temporal y datos de `npm run db:demo`: 0 hallazgos reales; los
  únicos avisos son `net::ERR_CERT_AUTHORITY_INVALID` al pedir Google Fonts sin salida a internet, en las
  17-18 páginas por igual (nada nuevo de este plan). `estafas.html` cargó, pasó `check-links` y `check-contraste`
  en los dos temas, y en la ficha de la demo «contacto visible: sí».
- Entorno del contenedor: Chrome como root necesita `--no-sandbox`; se usó un envoltorio en
  `/tmp/.../scratchpad/chrome-no-sandbox.sh` (exec del Chrome de Puppeteer con `--no-sandbox
  --disable-setuid-sandbox`) vía `PUPPETEER_EXECUTABLE_PATH`, sin tocar las herramientas del repo. El puerto
  8080 estaba ocupado por otro worktree; se usó el 8241. `auditar-publico.js`, `auditar-flujos.js` y
  `auditar-permisos.js` tienen su base en 8080 sin bandera `--base`: se les añadió temporalmente una lectura
  de variable de entorno (`MM_AUDITAR_BASE` / `MM_AUDITAR_PUERTO`), se corrieron, y se revirtió el cambio con
  `git checkout --` antes de terminar (no queda en el repositorio).

## Deviations from Plan

Ninguna en el alcance de las tareas. El único desvío es la comprobación previa del punto 1 del encargo, que
no llevó a ningún cambio de código (documentado arriba).

## Pendiente de Victor

- Ver `estafas.html` en claro y oscuro (pendiente ya anotado en `09-CONTEXT.md`).
- Decidir si la Política de publicación debe mencionar la verificación de teléfonos (pendiente de 09-01/09-02).

## Self-Check: PASSED

- `estafas.html`: FOUND
- `assets/app.js` contiene `estafas.html` y `t.verificado`: FOUND
- `tools/meta.js`, `tools/check-links.js`, `tools/auditar-publico.js`, `tools/check-contraste.js` mencionan `estafas.html`: FOUND
- Commit `77123cb`: FOUND
- Commit `2796b98`: FOUND
