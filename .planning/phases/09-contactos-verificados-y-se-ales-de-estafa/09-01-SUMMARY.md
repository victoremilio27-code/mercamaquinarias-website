---
phase: 09-contactos-verificados-y-se-ales-de-estafa
plan: 01
subsystem: base y envío
tags: [contactos, sms, interruptor, migracion]
requires: []
provides: [contactos_verificados, pedirCodigoContacto, confirmarCodigoContacto, contactosDe, numerosVerificados, marcarContactoVerificado, smsActivo, enviarSms, enviarCodigoContacto]
affects: [tools/api.js (09-02), tools/seed.js (09-02)]
tech-stack:
  added: []
  patterns: [código pendiente en la propia fila con UPDATE condicional, interruptor leído en cada llamada]
key-files:
  created: [tools/probar-contactos.js]
  modified: [tools/db.js, tools/correo.js, package.json, .github/workflows/desplegar.yml]
decisions:
  - "Migración 2026-09-contactos-verificados como última entrada de MIGRACIONES."
  - "El código de contacto no usa la tabla codigos: su CHECK sobre tipo no se puede ampliar sin reconstruirla."
  - "Un número verificado por correo admite subir a SMS; mientras se confirma, sigue verificado."
  - "MERCA_SMS se lee en cada llamada (apagado | archivo | brevo); remitente y ruta de Brevo configurables."
  - "El texto del SMS va sin tildes: con unicode cada SMS cuesta el doble."
metrics:
  completed: 2026-09-25
  tasks: 3
---

# Phase 9 Plan 01: la base de los contactos verificados y el SMS apagado

Tabla `contactos_verificados` por organización y número, código de seis dígitos firmado con organización, número y vía,
`anuncio()` que marca cada teléfono con `verificado` y `via`, y el canal SMS en `tools/correo.js` apagado tras `MERCA_SMS`.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 6a8e28f | Migración, funciones de contactos, `anuncio()` marcado, purga de pendientes abandonados |
| 2 | d48bab5 | `enviarSms` con modos apagado/archivo/brevo, `smsActivo`, `enviarCodigoContacto`, `textoSmsContacto` |
| 3 | 8b581f8 | `tools/probar-contactos.js`, script `contactos:probar` y paso en el CI |

## Verificación

- `npm run contactos:probar`: 31 bien, 0 mal.

## Deviations from Plan

Ninguna.

## Pendiente de Victor

- La documentación de Brevo estaba bloqueada por el proxy de la sesión: la ruta `/v3/transactionalSMS/sms` y el cuerpo
  salen de lo conocido. El día de encender se comprueba con un envío real; si cambió, `MERCA_SMS_RUTA` lo corrige sin código.
- Validar el remitente `MercaMaq` en Brevo para República Dominicana (o fijar otro en `MERCA_SMS_REMITENTE`).

## Self-Check: PASSED
