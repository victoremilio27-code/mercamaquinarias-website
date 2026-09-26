---
phase: 09-contactos-verificados-y-se-ales-de-estafa
plan: 03
subsystem: interfaz del vendedor
tags: [contactos, panel, publicar]
requires: [09-02]
provides: [VerificarContacto (assets/contactos.js), montarContactos (panel), pintarVerificacion (publicar)]
affects: []
tech-stack:
  added: []
  patterns: [módulo de navegador compartido por dos páginas, delegación de eventos sobre bloques que se repintan]
key-files:
  created: [assets/contactos.js]
  modified: [panel.html, assets/panel.js, publicar.html, assets/publicar.js, styles.css]
decisions:
  - "El formulario del código no es un <form>: publicar ya lo es; el Enter del campo se intercepta."
  - "En el paso 4 solo se repinta una fila si cambia el número o su estado, para no cerrar el campo del código al escribir."
  - "La confirmación de publicar avisa si el anuncio salió con teléfonos sin verificar y enlaza a panel.html#panelContactos."
metrics:
  completed: 2026-09-25
  tasks: 2
---

# Phase 9 Plan 03: el vendedor verifica sus teléfonos

`assets/contactos.js` (cargado tras `app.js` en `panel.html` y `publicar.html`) pinta el estado de un número y pide y
confirma el código. El panel tiene la sección «Teléfonos de contacto» bajo la tabla de anuncios; el paso 4 de publicar,
con sesión, dice bajo cada número válido si está verificado y ofrece verificarlo ahí; la confirmación avisa de los que
quedaron sin verificar.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | d3be3e2 | `assets/contactos.js` |
| 2 | 83173bc | Sección del panel, estado por fila en el paso 4, aviso en la confirmación, estilos con tokens de tema |

## Verificación

- `node --check` de `assets/contactos.js`, `assets/publicar.js` y `assets/panel.js`: correcto.
- **NO se corrieron las auditorías del navegador sobre este plan** (`auditar-flujos`, contraste, enlaces): el orquestador
  ordenó parar la ejecución a mitad de la tarea 2. Quien retome la fase debe correr `npm run auditar` y `npm run check`
  antes de dar el plan por bueno. En este contenedor hacen falta un servidor propio en otro puerto y Chrome con
  `--no-sandbox` (ver 09-02-SUMMARY).

## Deviations from Plan

- Ninguna en el código. La verificación quedó pendiente por el cambio de instrucciones.

## Pendiente de Victor

- Ver el panel y el paso 4 en claro y oscuro, y hacer una verificación por correo de punta a punta.

## Self-Check: PENDIENTE (auditorías del navegador sin correr)
