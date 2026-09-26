# Fase 10 — notas de traspaso

La ejecución se paró a mitad por un cambio de instrucciones del orquestador (la ejecución
pasa a otro agente). Estado al parar, 2026-09-25:

| Plan | Estado | Commits |
|---|---|---|
| 10-01 | Hecho, con SUMMARY | 4efa7f4, 100494e, 02d7b07 |
| 10-02 | Hecho, con SUMMARY (falta el recorrido de navegador, que es 10-04) | 1ac35d2, ff20209, 194f4e7 |
| 10-03 | **Tarea 1 hecha** (contactos en el panel y compartidos en la tarjeta). **Falta la tarea 2** (Duplicar en el panel + `?duplicar=` en `assets/publicar.js`) y el SUMMARY | 3ddd16c |
| 10-04 | Sin empezar | — |

## Lo que conviene saber antes de seguir

- **Navegador sin pantalla en la nube:** el contenedor corre como root y Chromium exige
  `--no-sandbox`; desactivar el sandbox lo deniega la política de permisos. Ninguna
  auditoría de puppeteer (`npm run auditar`, `check`, `check-contraste`) se pudo correr
  aquí: se corren en el job `navegador` del CI.
- **Puertos:** otros agentes ocupan 8080 y 8093. Para probar por HTTP se usó un servidor
  propio en 8110 con `MERCA_DB=.tmp/fase10/demo.db`. Las auditorías tienen 8080 escrito;
  `check-links` y `check-contraste` aceptan `--base`.
- **Los clics de contacto de la ficha se escuchan por `.contactos [data-canal]`**, no por
  `.contactos__it`: el menú de compartir reutiliza esa clase.
- `GET /api/mis-anuncios/:id/copia` ya devuelve el borrador con la forma exacta de
  `estadoInicial()` (ver `copiarAnuncio` en `tools/api.js` y el bloque «Duplicar» de
  `tools/probar-metricas.js`); la tarea 2 de 10-03 solo tiene que consumirlo.
