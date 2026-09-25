---
phase: 09-contactos-verificados-y-se-ales-de-estafa
reviewed: 2026-09-25
depth: standard
scope: "git diff a9184fa..HEAD -- . ':!.planning' (20 archivos)"
status: issues_fixed
findings:
  critical: 0
  high: 0
  medium: 2
  low: 2
  info: 6
fixed_in: [f543fa5, 47cef04]
---

# Phase 9: Code Review

Alcance: todo lo que cambió la fase fuera de `.planning/`:

- `tools/db.js`, `tools/api.js`, `tools/correo.js` y `tools/seed.js`;
- `assets/contactos.js`, `assets/panel.js`, `assets/publicar.js` y `assets/app.js`;
- `panel.html`, `publicar.html`, `estafas.html` y `styles.css`;
- las pruebas y auditorías tocadas, `package.json` y el CI.

Se revisaron errores, seguridad (fuerza bruta del código, límites de envío, enumeración, fugas de números sin
verificar) y las reglas de `CLAUDE.md`.

## Hallazgos corregidos

### MD-01 · Se podía acosar un teléfono ajeno con SMS abriendo varias cuentas — corregido en f543fa5
`POST /api/contactos/codigo` tenía dos topes: 5 por organización y número, y 20 por organización. Los dos son por
cuenta. Con el SMS encendido, quien abriera varias cuentas podía mandar cinco SMS por cuenta a un número que no es
suyo. Eso gasta créditos y es acoso. También multiplicaba los intentos de adivinar un código enviado por SMS.
**Corrección:** tope de 5 SMS por hora **por número, sin mirar la organización** (`contacto-sms:<numero>`), y tope
de 30 peticiones de código por hora por conexión (`contacto-ip`, con `origen()`, es decir `CF-Connecting-IP`).
Prueba nueva en `contactos:probar`: seis SMS al mismo número repartidos entre dos cuentas; el sexto da 429.

### MD-02 · `estafas.html` prometía más de lo que se verifica — corregido en 47cef04
Decía que el teléfono se cotejaba «para que no sea un número inventado o copiado de otro anuncio». Con la vía por
correo, la única mientras el SMS esté apagado, solo se prueba que el titular de una cuenta con correo verificado
declara el número. No se prueba que el teléfono sea suyo (D-03). Una página contra estafas que exagera la garantía
es justo la que baja la guardia del comprador.
**Corrección:** el texto dice ahora qué se prueba por cada vía, y que la ficha dice cuál. Se matizaron también dos
afirmaciones documentales:
- La matrícula solo aplica si el equipo está registrado en la DGII; mucha maquinaria de obra no lo está.
- La certificación de propiedad acredita al propietario registrado; ya no se afirma que garantice la ausencia de
  gravámenes.

### LO-01 · Un código agotado seguía ofreciendo su campo en el panel — corregido en f543fa5
Tras cinco fallos, `confirmarCodigoContacto` solo anulaba el hash. `contactosDe` seguía viendo la vía y el
vencimiento, y el panel volvía a pintar el campo del código de un código que ya no existía.
**Corrección:** al agotarse se anulan hash, vía y vencimiento. `pendiente` exige además un hash vigente y menos de
cinco intentos.

### LO-02 · Pedir códigos no tenía tope por conexión — corregido en f543fa5
Se añadió el tope por conexión junto con MD-01.

## Revisado sin hallazgo

- **Fuerza bruta del código de 6 dígitos:**
  - Cada código admite 5 intentos. Hay 5 códigos por hora por organización y número, y 5 SMS por hora por número
    en total. Con eso, adivinar un código ajeno por SMS es del orden de 25 intentos por hora contra 10⁶.
  - Confirmar tiene además 20 intentos por conexión cada 15 minutos.
  - El código se guarda como HMAC con `MERCA_SECRETO` y se compara con `timingSafeEqual`. La firma incluye
    organización, número y vía: un código no sirve para otro número, otra organización ni otra vía.
  - El consumo es un `UPDATE ... WHERE codigo_hash = ?` condicional. Con `DatabaseSync` la función entera es
    síncrona y no hay carrera entre leer los intentos y sumarlos.
- **Enumeración:**
  - Las tres rutas exigen sesión y solo operan sobre la organización de la sesión.
  - Confirmar sobre un número de otra organización responde lo mismo que un número sin código («inexistente»).
  - `yaVerificado` solo mira la propia organización. No hay forma de saber si otra cuenta verificó un número.
- **Fugas de números sin verificar:**
  - `GET /api/anuncios/:id` filtra para quien no es el dueño.
  - El catálogo (`/api/anuncios`) no trae teléfonos, y `tools/meta.js` (metadatos, JSON-LD y sitemap) tampoco.
  - Las demás respuestas que llevan `db.anuncio()` comprueban antes que el anuncio es del que pregunta.
  - El destino del código va enmascarado.
- **Reglas de `CLAUDE.md`:**
  - Cero dependencias nuevas; solo `node:https` y `node:crypto`.
  - La migración es la última de `MIGRACIONES`, y la prueba lo comprueba.
  - Nada se envía a un contador.
  - Ninguna página publica un teléfono de la empresa; hay prueba estática sobre `estafas.html` y el aviso.
  - `assets/servicios.js` no se tocó.
  - El SMS, que depende de un pago pendiente, está construido entero y apagado tras `MERCA_SMS`.
  - `ctx` nulo lo cubre `conSesion`, y cada `api()` del navegador va con su `try/catch`.
  - La IP sale de `origen()`.
  - Comentarios y textos en español, con el porqué.
- **XSS:** todo lo dinámico de `assets/contactos.js`, `assets/panel.js`, `assets/publicar.js` y `assets/app.js`
  pasa por `esc()` o `textContent`.

## Informativos (sin cambio)

- **IN-01 · Página del dealer:** `telefono_publico` de la organización y los teléfonos y WhatsApp de las sucursales
  se publican sin verificar. Es comportamiento anterior a la fase y queda fuera de CONF-03, que habla de los
  contactos de un anuncio. No se tocó porque la fase 7 trabaja esa página en paralelo. Decisión de Victor si se
  extiende la regla; el mecanismo (`numerosVerificados`) ya sirve para ello.
- **IN-02 · La vía por correo no prueba la titularidad del teléfono** (D-03, aceptado). La ficha lo dice por
  número.
- **IN-03 · `verAnuncio` sirve anuncios no activos** (retirados o vencidos) a cualquiera. Es anterior a la fase y
  no cambia con ella. Ahora esos anuncios además solo enseñan teléfonos verificados.
- **IN-04 · «En N anuncios»** del panel cuenta anuncios de cualquier estado, también los vencidos.
- **IN-05 · `estafas.html`** usa `acceso__aviso`, que es el estilo de error, para su aviso de responsabilidad.
  Es cosmético; el contraste da 0.
- **IN-06 · Ruta y cuerpo de la API de SMS de Brevo** sin contrastar con su documentación, que estaba bloqueada
  en la sesión. Se pueden corregir sin código con `MERCA_SMS_RUTA` y `MERCA_SMS_REMITENTE`.
