---
phase: 10-alcance-y-m-tricas-del-vendedor
plan: 04
subsystem: auditorías de navegador
tags: [puppeteer, auditoria, ci, metricas]
requires: [10-01, 10-02, 10-03]
provides: ["tools/auditar-metricas.js", "npm run auditar:metricas"]
affects: []
tech-stack:
  added: []
  patterns: ["recorrido de navegador con la cuenta de demo en vez de registrar una nueva, pidiendo el propio anuncio por la API en vez de suponer marca o modelo"]
key-files:
  created: [tools/auditar-metricas.js]
  modified: [package.json]
decisions:
  - "Se usa jperez@demo.mercamaquinarias.do (tools/seed.js) en vez de registrar una cuenta nueva: a esta auditoría le basta con un anuncio activo ya publicado, no con probar el alta."
  - "El anuncio de prueba se pide con GET /mis-anuncios (el primero activo) en vez de buscarlo por marca o modelo: si tools/seed.js cambia el inventario de demostración, la auditoría no se rompe con él."
  - "El clic de WhatsApp en la ficha se sustituye por POST /api/eventos {tipo:'whatsapp'} directo: el enlace real navega a wa.me, un dominio externo sin red en este contenedor, y el propio plan admite la alternativa porque es exactamente lo que el servidor cuenta."
metrics:
  completed: 2026-09-25
  tasks: 1
---

# Fase 10 Plan 04: los cuatro criterios de la fase, demostrados en un navegador

`tools/auditar-metricas.js` recorre con puppeteer, contra el servidor de demostración,
los cuatro criterios de éxito del ROADMAP para la fase 10: guardar y quitar un equipo,
compartir por WhatsApp con la vista previa correcta, ver el contacto atribuido en el
panel y duplicar un anuncio hasta el asistente lleno sin serie. Queda sumada a
`npm run auditar`, antes de `check-contraste.js`, con su propio `npm run
auditar:metricas`.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | 4066b21 | `tools/auditar-metricas.js`; `auditar` y `auditar:metricas` en `package.json` |

## Verificación

No se pudo correr contra el puerto 8080 real: en este contenedor otros agentes ya
tienen servidores propios en el 8080 y el 8093. Se validó así:

- **Sintaxis:** `vm.Script` sobre el archivo.
- **Navegador real:** Chrome headless con `--no-sandbox` vía un envoltorio en `/tmp`
  (fuera del repo, apuntado con `PUPPETEER_EXECUTABLE_PATH`) — sin eso Chrome no arranca
  como root en este contenedor. Servidor y base de demostración propios en el puerto
  8121 y luego el 8134 (`MERCA_DB` en `.tmp/`, `npm run db:demo`,
  `node tools/serve.js`, `node tools/esperar-servidor.js`).
- **La auditoría de esta fase, con una copia temporal con el puerto cambiado** (el
  8080 está escrito en el archivo, a propósito, igual que en sus hermanas —así corre
  en el CI—; la copia nunca se guardó en el repositorio): **0 hallazgos**, dos pasadas
  seguidas (para confirmar que correr la auditoría dos veces seguidas —como pasaría en
  dos pasadas del CI el mismo día— no deja nada a medias que rompa la siguiente).
- **La cadena completa de `npm run auditar`**, con copias temporales del mismo tipo
  para `auditar-publico.js`, `auditar-flujos.js` y `auditar-permisos.js` (los tres
  llevan el puerto escrito, sin `--base`): `verificar-taxonomia` (0),
  `auditar-publico` (solo ruido de Google Fonts sin red, ver abajo), `auditar-flujos`
  (0), `auditar-permisos` (0), `auditar-metricas` (0), `check-contraste` (0).
- **`npm run check`** (`check-links.js`, que sí acepta `--base`): mismo resultado, solo
  ruido de Google Fonts.
- Las líneas «Google Fonts» son `net::ERR_CERT_AUTHORITY_INVALID` en
  `fonts.googleapis.com` en las diecisiete rutas: no hay red de verdad hacia fuera en
  este contenedor. No cuentan como hallazgo (indicado en la tarea) y desaparecen en el
  runner del CI, que sí tiene salida a internet.
- Se corrieron también el resto de pruebas del arnés y `node:test`:
  `seguridad:probar` (71/0), `chat:probar` (40/0), `facturas:probar` (Todo correcto),
  `pagos:probar` (75/0), `dealer:probar` (49/0), `bitacora:probar` (72/0),
  `metricas:probar` (59/0), `facturas:letras` (6/6).
- **`correo:probar` no corrió**: exige una dirección real como argumento
  (`node tools/probar-correo.js tucorreo@gmail.com`) para mandarle un correo de
  verdad; no es una prueba automática ni está en la cadena de CI (`.github/workflows/desplegar.yml`
  no la invoca), así que no hay ninguna dirección de prueba que usar aquí sin mandar
  correo a alguien de verdad.

## Desvíos del plan

None — se ejecutó tal como estaba escrito. El único bug que apareció al construir esta
auditoría (la restauración incompleta de categoría/marca/modelo al recuperar un
borrador) se encontró y se corrigió en el `10-03` porque es código de esa tarea, no de
esta; queda documentado en `10-03-SUMMARY.md`.

## Pendiente de Victor

- El puerto 8080 y el 8093 estaban ocupados por otros agentes trabajando en este mismo
  contenedor durante esta sesión; la validación completa de `npm run auditar` en el
  puerto real queda para el job `navegador` del CI, que si tiene el 8080 libre y salida
  a Google Fonts.

## Self-Check: PASSED
