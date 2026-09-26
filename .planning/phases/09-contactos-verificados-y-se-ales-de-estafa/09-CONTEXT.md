# Phase 9: Contactos verificados y señales de estafa - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning
**Source:** Sin discusión con Victor (encargo del orquestador): las decisiones técnicas y reversibles las toma el planificador según `CLAUDE.md`, `PROJECT.md`, `STATE.md` y `ROADMAP.md`. Lo que solo Victor puede decidir queda en «Pendiente de Victor».

<domain>
## Phase Boundary

Entrega CONF-02 y CONF-03:

- **CONF-03:** ningún anuncio muestra un teléfono que no esté verificado. El vendedor verifica
  cada número una vez por su organización —por correo hoy, por SMS el día que se paguen los
  créditos de Brevo— y desde ese momento el número aparece en todos sus anuncios.
- **CONF-02:** una página de señales de estafa escrita para el mercado dominicano, enlazada
  desde el aviso que ya existe al pie de la ficha (`.detalle__aviso` en `assets/app.js`).

Fuera de esta fase: los teléfonos de la página del dealer y de sus sucursales (`organizaciones.telefono_publico`,
`sucursales.telefono/whatsapp`). CONF-03 habla de «un anuncio», los dealers pasan por revisión con
RNC, y la página del dealer la está tocando la fase 7 en paralelo. Queda anotado como pendiente.

</domain>

<decisions>
## Implementation Decisions

### D-01 · Qué es «un contacto»
Los contactos de un anuncio son sus teléfonos (`anuncio_contactos`: número, uso, nota). El correo
del paso 4 de `publicar.html` no se publica en la ficha: es donde llegan factura y avisos. Por eso
lo que se verifica son **teléfonos**.

### D-02 · Se verifica por organización y número, no por anuncio
Tabla nueva `contactos_verificados (organizacion_id, numero)` con `UNIQUE`. El número se guarda
normalizado a diez dígitos. Verificarlo una vez lo enseña en **todos** los anuncios de esa
organización que lo lleven, también en los ya publicados (criterio 2: «ese contacto aparece en su
anuncio»). Otra organización que use el mismo número tiene que verificarlo ella.

### D-03 · Qué prueba cada vía
- **SMS:** el código llega al propio teléfono. Prueba que quien publica controla ese número.
- **Correo:** el código llega al correo **ya verificado** de la cuenta que ha iniciado sesión. Prueba
  que el titular de la cuenta —no solo quien tenga su cookie— declara ese número como suyo. Es la
  vía que Victor aceptó mientras los SMS estén apagados («con los créditos SMS apagados, el correo basta»).
- La ficha dice por qué vía se verificó cada número, para no vender una confirmación de correo como
  si fuera una prueba de titularidad del teléfono.

### D-04 · Código propio en la fila, no en la tabla `codigos`
`codigos.tipo` tiene un `CHECK (tipo IN ('verificacion','acceso','restablecer'))` que SQLite no deja
ampliar sin reconstruir la tabla. El código pendiente vive en la propia fila de
`contactos_verificados` (hash HMAC con `MERCA_SECRETO`, vía, vencimiento de 15 minutos, intentos, tope 5)
y se consume con un `UPDATE ... WHERE codigo_hash = ?` condicional, igual que `verificarCodigo`.

### D-05 · El interruptor del SMS vive en `tools/correo.js`
`tools/correo.js` es el único punto de envío (nota del ROADMAP). Se le añade `enviarSms` y `smsActivo()`
con su interruptor por entorno `MERCA_SMS`:
- `apagado` (por defecto): la vía SMS no se ofrece y la API la rechaza con un mensaje claro.
- `archivo`: escribe el SMS en `.tmp/sms/` y saca el código por consola (desarrollo y pruebas).
- `brevo`: `POST https://api.brevo.com/v3/transactionalSMS/sms` con `BREVO_API_KEY`.
El modo se lee en cada llamada, no al cargar el módulo, para que encenderlo sea cambiar una variable
y reiniciar, y para que la prueba demuestre el criterio 3 encendiéndolo sin tocar nada más.
Remitente `MERCA_SMS_REMITENTE` (por defecto `MercaMaq`, tope de 11 caracteres de Brevo) y ruta
`MERCA_SMS_RUTA` configurables por si Brevo cambia algo antes del día de encender.

### D-06 · Publicar no se bloquea por un número sin verificar
El paso 4 se puede llenar sin sesión y la cuenta se abre al final, así que no se puede exigir la
verificación antes de publicar sin romper ese flujo. El servidor acepta el anuncio; los números sin
verificar se guardan y **no se muestran** hasta que se verifiquen. El paso 4 (con sesión) y el panel
avisan y ofrecen verificar ahí mismo.

### D-07 · El filtro es del servidor
`GET /api/anuncios/:id` a quien no es el dueño le devuelve solo los teléfonos verificados. El
navegador filtra otra vez (defensa en profundidad y para que el dueño vea su ficha como la ve el
comprador). Sin número verificado la ficha lo dice y no enseña nada.

### D-08 · Anuncios que ya existen
No se «regalan» como verificados: la regla es la regla. En producción (antes del lanzamiento del
2026-10-14) sus números dejan de verse hasta que el anunciante los verifique desde el panel. La
semilla de demostración sí marca los suyos como verificados, porque es dato de prueba y las auditorías
del navegador esperan un `tel:` en la ficha.

### D-09 · Límites de envío
Pedir código: 5 por organización y número cada hora, 20 por organización cada hora (el SMS cuesta
créditos). Confirmar: 20 intentos por IP cada 15 minutos, además del tope de 5 por código.

### D-10 · Página de estafas
`estafas.html`, página de texto con el mismo armazón que `legal.html`. Mercado dominicano: pedir
adelantos por transferencia o depósito, cuentas a nombre de un tercero, precios muy por debajo del
mercado, equipo «en el puerto» o «fuera del país», presión de tiempo, documentos que no cuadran
(matrícula, DUA, número de serie), consultar RNC y matrícula en la DGII, pagar a nombre de la empresa
con comprobante fiscal, verlo funcionando, y cómo reportar. **Sin ningún número de teléfono**, ni de
la empresa ni de instituciones: se nombran por su nombre. Se enlaza desde el aviso de la ficha y
entra en sitemap, comprobador de enlaces, auditoría pública y comprobador de contraste.

### Claude's Discretion
- Módulo de navegador compartido `assets/contactos.js` para el formulario de verificación, cargado
  en `publicar.html` y `panel.html` después de `app.js`.
- No se crea UI-SPEC aparte: la interfaz reutiliza clases existentes (`panel`, `prosa`, `pastilla--verde`,
  `btn--linea btn--chico`, `acceso__aviso`) y el comprobador de contraste cubre la página nueva.
- Prueba nueva `tools/probar-contactos.js` (`npm run contactos:probar`), estilo arnés, colgada del CI.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/ROADMAP.md` — Phase 9, criterios de éxito.
- `.planning/REQUIREMENTS.md` — CONF-02, CONF-03.
- `CLAUDE.md` — interruptor para lo que depende de un pago, sin teléfono publicado, migraciones al final, cero dependencias.
- `tools/correo.js` — único punto de envío, transporte de archivo y Brevo.
- `tools/db.js` — `crearCodigo`/`verificarCodigo` (patrón del código), `permitir`, `MIGRACIONES`, `anuncio()`.
- `tools/api.js` — `verAnuncio`, `publicar`, `conSesion`, `RUTAS`.
- `assets/app.js` — `contactosHTML`, `montarDetalle`, `.detalle__aviso`.

</canonical_refs>

<specifics>
## Pendiente de Victor

- Pagar los créditos SMS de Brevo, validar el remitente `MercaMaq` para República Dominicana y poner
  `MERCA_SMS=brevo` en el entorno del VPS. Confirmar ese día la ruta del API de SMS (`MERCA_SMS_RUTA`).
- Decidir si la Política de publicación (`legal.html#anuncios`) debe decir que los teléfonos se
  verifican. No se tocó: cambiar un texto legal versionado pide nueva versión y nueva aceptación.
- Decidir si CONF-03 se extiende a los teléfonos de la página del dealer y sus sucursales.
- Revisar el texto de `estafas.html` y verlo en claro y oscuro.

</specifics>

<deferred>
## Deferred Ideas

- Teléfonos de la página del dealer y de las sucursales verificados con el mismo mecanismo.
- Enlace a la página de estafas desde el pie de todas las páginas (tocaría todos los `.html` mientras
  otras cinco fases trabajan en paralelo).

</deferred>

---

*Phase: 09-contactos-verificados-y-se-ales-de-estafa*
*Context gathered: 2026-09-25, decisiones del planificador*
