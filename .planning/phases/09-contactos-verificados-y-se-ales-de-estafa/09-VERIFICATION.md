---
phase: 09-contactos-verificados-y-se-ales-de-estafa
verified: 2026-09-25
status: passed
score: 4/4
requirements: [CONF-02, CONF-03]
human_verification:
  - "Ver panel (Teléfonos de contacto), paso 4 de publicar, ficha y estafas.html en claro y oscuro."
  - "El día que se encienda MERCA_SMS=brevo, un envío real a un móvil dominicano (ruta y remitente de Brevo)."
---

# Phase 9: Contactos verificados y señales de estafa — Verification

**Veredicto: PASSED (4/4).** Los cuatro criterios del ROADMAP se cumplen en el código y los demuestra una
prueba automática. Quedan dos comprobaciones humanas que ninguna prueba sustituye: la vista en los dos temas
y el primer SMS real.

## Criterios de éxito

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | Un anuncio no muestra ningún contacto que no esté verificado. | ✓ | `tools/api.js` `verAnuncio`: a quien no es el dueño solo le llegan teléfonos con `verificado`. `assets/app.js` `contactosHTML` filtra otra vez. `contactos:probar` («Criterio 1»): sin sesión y con otra organización llegan 0 números; el dueño los ve marcados. Ninguna otra ruta pública lleva teléfonos de anuncio (`meta.js`, catálogo y sitemap revisados). De punta a punta en el navegador: el visitante no tiene `tel:` y la ficha explica por qué. |
| 2 | Un vendedor verifica su contacto por correo y ese contacto aparece en su anuncio; con el SMS apagado, el correo basta. | ✓ | `POST /api/contactos/codigo` con `via:'correo'` no depende del interruptor y el código llega al correo de la cuenta. `contactos:probar` («Criterio 2»): confirmar y el número aparece en la ficha pública de ese anuncio y de otro anuncio de la organización que lo lleva. De punta a punta en el navegador: panel, «Verificar por correo», código, «Verificado», y la ficha del visitante ya enseña el `tel:` con «correo verificado». |
| 3 | El día que se enciendan los SMS, la verificación por teléfono funciona sin volver a tocar el flujo. | ✓ | `tools/correo.js` lee `MERCA_SMS` en cada llamada (`apagado` por defecto, `archivo`, `brevo`). `contactos:probar` («Criterio 3») lo enciende en mitad de la ejecución: las mismas dos rutas envían por SMS y verifican con `via:'sms'`, y el panel pasa a ofrecer la vía. Apagado: 400 con mensaje que manda al correo, sin enviar nada. |
| 4 | El aviso de la ficha lleva a una página de señales de estafa escrita para el mercado dominicano. | ✓ | `assets/app.js`: el aviso `.detalle__aviso` enlaza «Señales de estafa: qué revisar antes de pagar» a `estafas.html`. La página habla de DGII, matrícula, DUA, RNC, DICAT y PEDATEC, y no lleva ningún teléfono (prueba estática en `contactos:probar`). Está en el sitemap, `check-links`, `auditar-publico` y `check-contraste`; el contraste da 0 en los dos temas. |

## Requisitos

- **CONF-03** — cumplido (criterios 1 a 3).
- **CONF-02** — cumplido (criterio 4).

## Pruebas corridas (2026-09-25, tras las correcciones de la revisión)

| Prueba | Resultado |
|---|---|
| `contactos:probar` | 64 bien, 0 mal |
| `seguridad:probar` | 71 bien, 0 mal |
| `dealer:probar` | 49 bien, 0 mal |
| `bitacora:probar` | 72 bien, 0 mal |
| `pagos:probar` | Todo correcto (75) |
| `facturas:probar` | Todo correcto |
| `chat:probar` | 40 bien, 0 mal |
| `facturas:letras` | 6 pass, 0 fail |
| `check:encoding`, `taxonomia` | sin hallazgos |
| `correo:probar` (herramienta manual, con transporte de archivo) | 12/12 |
| `auditar` (público, flujos, permisos, contraste 18 rutas × 2 temas) | 0 hallazgos |
| `check` (enlaces), `check:motion` | sin problemas |
| Recorrido de punta a punta con puppeteer (local, sin versionar) | 6/6 |

Las auditorías del navegador se corrieron contra un servidor propio en el puerto 8123, con base temporal y
`npm run db:demo`. Chrome se lanzó con un envoltorio local (`--no-sandbox`, certificado del proxy ignorado),
porque en el contenedor corre como root y Google Fonts pasa por el proxy de salida. No se tocó ninguna prueba.

## Pendiente de Victor (humano)

1. Ver el panel, el paso 4, la ficha y `estafas.html` en claro y oscuro.
2. Pagar los créditos SMS, validar el remitente `MercaMaq` y poner `MERCA_SMS=brevo`. Ese día, un envío real:
   la ruta `/v3/transactionalSMS/sms` no se pudo contrastar con la documentación de Brevo (bloqueada en la sesión).
   Si cambió, se corrige con `MERCA_SMS_RUTA`, sin tocar código.
3. Decidir si la Política de publicación menciona la verificación de teléfonos, y si la regla se extiende a los
   teléfonos de la página del dealer y sus sucursales (ver 09-REVIEW.md, IN-01).
4. Tras fusionar, los anuncios que ya están en producción dejarán de mostrar teléfonos hasta que sus anunciantes
   los verifiquen desde el panel (decisión D-08). Conviene avisarles.
