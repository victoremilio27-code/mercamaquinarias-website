# Phase 9: Contactos verificados y señales de estafa - Research

**Researched:** 2026-09-25
**Confidence:** Alta en el código (leído); media en la API de SMS de Brevo (documentación bloqueada por el proxy de la sesión, se usa lo conocido y se deja configurable).

## Lo que hay hoy

| Pieza | Dónde | Qué hace |
|---|---|---|
| Teléfonos del anuncio | `anuncio_contactos` (`db/schema.sql:737`), `db.crearAnuncio` (`tools/db.js` ~2686) | Hasta 5 números con uso (`llamadas`, `whatsapp`, `ambos`) y nota. Se guardan tal como llegan: `(809) 555-1234`. |
| Validación al publicar | `tools/api.js` `publicar` (~2383) | Exige al menos uno de 10 dígitos. No hay verificación. |
| Ficha | `tools/api.js` `verAnuncio` (~2592) → `db.anuncio` | Devuelve `telefonos` enteros a cualquiera. `ctx` es `null` sin sesión. |
| Pintado | `assets/app.js` `contactosHTML` (~859) | Enlaces `tel:` y `wa.me`, sin distinguir verificados. |
| Aviso de la ficha | `assets/app.js` ~1001, `.detalle__aviso` | «MercaMaquinarias publica este anuncio pero no interviene… Reportar este anuncio». Sin guía. |
| Códigos por correo | `db.crearCodigo`/`verificarCodigo` | HMAC con `MERCA_SECRETO`, consumo con `UPDATE` condicional, tope de 5 intentos. `codigos.tipo` tiene un CHECK cerrado. |
| Límite de envíos | `db.permitir(clave, tope, minutos)` | Ventana por clave. |
| Envío | `tools/correo.js` | `enviar()` nunca lanza; transportes `archivo` y `brevo`. No hay SMS en ninguna parte del código. |
| Paso 4 de publicar | `assets/publicar.js` `filaTelefonoHTML`, `montarPasoContacto`, `validarContacto` | Se puede rellenar sin sesión; la cuenta se abre al final. |
| Panel | `panel.html` + `assets/panel.js` `montarPanel` | Secciones `panel` con `panel__titulo`. |

## Pruebas y auditorías afectadas

- `tools/auditar-publico.js:132` exige un `a[href^="tel:"]` en la primera ficha del catálogo sembrado → **la semilla debe dejar verificados sus números**.
- `probar-seguridad.js` y `probar-pagina-dealer.js` publican anuncios con teléfonos sin verificar: siguen pasando porque publicar no se bloquea (D-06).
- Las auditorías del navegador tienen el puerto 8080 escrito; con agentes en paralelo se corren desde copias con otro puerto (lo mismo que hizo 04-02).
- Páginas enumeradas: `tools/check-links.js:19`, `tools/auditar-publico.js:18`, `tools/check-contraste.js:61`, sitemap en `tools/meta.js:199`.

## Brevo SMS transaccional

- `POST https://api.brevo.com/v3/transactionalSMS/sms`, cabecera `api-key`, cuerpo
  `{ sender, recipient, content, type: 'transactional', unicodeEnabled }`. Respuesta 201 con `messageId`.
- `sender`: alfanumérico de hasta 11 caracteres (o número de hasta 15 dígitos).
- `recipient`: número internacional sin `+` → para RD `1` + diez dígitos.
- Sin créditos Brevo responde error (402/400): el transporte lo trata como `entregado: false` sin lanzar.
- Ruta configurable (`MERCA_SMS_RUTA`) por si cambió; confirmarlo el día de encender.

## Señales de estafa en República Dominicana (contenido de `estafas.html`)

Patrones habituales en venta de maquinaria y vehículos de trabajo por clasificados y WhatsApp:
- Adelanto «para apartar» o «para el flete» por transferencia o depósito antes de ver el equipo.
- Cuenta a nombre de una persona distinta del vendedor o de la empresa que anuncia.
- Precio muy por debajo del mercado; equipo «en el puerto», «saliendo de aduana» o vendedor «fuera del país».
- Prisa: «hay otro comprador», «solo hoy».
- Documentos que no cuadran: matrícula (DGII) a nombre de otro, número de serie o de chasis distinto del que tiene la placa del equipo, DUA de importación que no corresponde.
- Piden códigos que llegan por correo o SMS, o datos de tarjeta, «para verificar».
- Qué hacer: ver el equipo funcionando, cotejar serie, pedir la certificación de propiedad y consultar el RNC en la DGII, pagar a nombre de la empresa con comprobante fiscal, desconfiar de intermediarios, y reportar el anuncio. Denuncia ante la Policía Nacional (DICAT) o la Procuraduría Especializada contra Crímenes y Delitos de Alta Tecnología (PEDATEC), nombradas sin teléfono.

## Validation Architecture

| Criterio | Cómo se comprueba | Dónde |
|---|---|---|
| 1. Ningún contacto sin verificar en un anuncio | `GET /api/anuncios/:id` sin sesión y con otra sesión no trae el número sin verificar; el dueño lo ve marcado `verificado:false` | `tools/probar-contactos.js` |
| 2. Correo basta con SMS apagado | Pedir código vía correo → llega al `.tmp/correos/` → confirmar → la ficha pública trae el número con `via:'correo'` | `tools/probar-contactos.js` |
| 3. SMS funciona sin tocar el flujo | Con `MERCA_SMS=apagado` la vía SMS da 400; con `MERCA_SMS=archivo` la misma ruta envía y el mismo `confirmar` la verifica con `via:'sms'` | `tools/probar-contactos.js` |
| 4. Aviso → página de estafas | El aviso de la ficha enlaza `estafas.html`; la página existe, no tiene ningún patrón de teléfono | `tools/probar-contactos.js` (estático) + `npm run check` + `auditar` |

Barreras: `npm run contactos:probar` en el CI (`pruebas`), más todas las existentes.
