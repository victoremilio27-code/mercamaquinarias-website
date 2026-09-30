---
phase: 12
slug: lote-mensual-de-comprobantes
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-09-30
---

# Fase 12 — Estrategia de validación

Sale de «Arquitectura de validación» de `12-RESEARCH.md`, ajustada a los planes 12-01 a 12-04.

## Infraestructura

| Propiedad | Valor |
|-----------|-------|
| **Marco** | Arnés propio con contadores y `process.exit` (`tools/probar-lote.js`) y puppeteer (`tools/auditar-*.js`) |
| **Configuración** | ninguna; base desechable en `.tmp/prueba-lote/`, con `MERCA_DB`, `MERCA_FACTURAS`, `MERCA_FOTOS` y `MERCA_CORREO=archivo` fijados antes de `require('./db')` |
| **Reloj** | datos de prueba en 2025 (año cerrado) y `AHORA_FIJO = 2025-11-15T12:00:00.000Z`; todo rango sale de `lote.validarMes(mes, AHORA_FIJO)`. Solo «mes en curso» y «mes futuro» de las rutas (12-03) usan el reloj real, calculado en la prueba |
| **Comando rápido** | `npm run lote:probar` |
| **Suite completa** | `npm run lote:probar && npm run facturas:probar && npm run seguridad:probar && npm run transferencia:probar && npm run bitacora:probar`; con servidor de demo en 8080, `npm run auditar` y `npm run check` |
| **Duración estimada** | ~5 s rápido, ~3 min completo |

## Muestreo

- **Tras cada tarea:** `npm run lote:probar` (y `facturas:probar` + `seguridad:probar` si se tocó `tools/facturas.js` o `tools/db.js`).
- **Tras cada plan:** la suite completa del arnés.
- **Tras fusionar las olas 3 y 4:** el orquestador corre `npm run auditar` y `npm run check` con el servidor de demo (en la nube, con el envoltorio de Chrome de STATE).
- **Antes de verificar la fase:** todo lo anterior en verde.

## Mapa por tarea

| Tarea | Plan | Ola | Requisito | Amenaza | Comportamiento seguro | Tipo | Comando | Existe | Estado |
|-------|------|-----|-----------|---------|-----------------------|------|---------|--------|--------|
| 12-01-01 | 01 | 1 | CONTAB-01 (C2) | T-12-01, T-12-05 | consultas solo SELECT, sin LIMIT ni join; reponer solo el papel que falta | arnés | `npm run facturas:probar && npm run seguridad:probar` | ✅ | ⬜ |
| 12-01-02 | 01 | 1 | CONTAB-01 (C1, C2) | T-12-02, T-12-03, T-12-04 | corte a las 04:00Z; ZIP leído por lector propio y `unzip -t`; nombres solo desde `numero`; tope de tamaño | arnés | `npm run lote:probar` | ❌ W0 | ⬜ |
| 12-02-01 | 02 | 2 | CONTAB-01 (C1, C2) | T-12-07, T-12-09, T-12-11 | tres bloques (fiscal, sin valor fiscal, notas sobre recibos); cuadre por tipo; CSV con prefijo contra fórmulas; sin domicilio | arnés | `npm run lote:probar` | ❌ W0 | ⬜ |
| 12-02-02 | 02 | 2 | CONTAB-01 (C1, C2) | T-12-06, T-12-10 | PDF idénticos a disco; 409 si falta; 500 si no cuadra o fecha irregular; hash de `facturas` intacto; mismos bytes en dos descargas | arnés | `npm run lote:probar` | ❌ W0 | ⬜ |
| 12-03-01 | 03 | 3 | CONTAB-01 (C1) | T-12-12, T-12-13, T-12-14 | 401 sin sesión, 404 sin admin, 400 mes malo o futuro; cabeceras `private, no-store`, `nosniff`, `attachment` | arnés | `npm run lote:probar && npm run bitacora:probar` | ❌ W0 | ⬜ |
| 12-03-02 | 03 | 3 | CONTAB-01 (C3) | T-12-15 | ningún correo en la bandeja; sin `./correo` ni `.enviar(` en el lote; nada de lote en tareas, `serve.js` ni `deploy/`; `lotes_contador` vacía | arnés + navegador | `npm run lote:probar`; `npm run auditar` (permisos) | ❌ W0 | ⬜ |
| 12-04-01 | 04 | 4 | CONTAB-01 (C1) | T-12-18, T-12-20 | todo lo del servidor pasa por `esc`; aviso fijo «el sitio no lo envía a nadie»; error visible, sin ZIP roto | sintaxis + arnés | `node --check assets/admin.js && npm run check:encoding` | ✅ | ⬜ |
| 12-04-02 | 04 | 4 | CONTAB-01 (C1) | — | botón, aviso, vista previa 200 y mensaje de error con mes futuro | navegador | `npm run auditar` | ❌ W0 | ⬜ |

## Requisito → prueba

| Criterio | Comportamiento | Dónde |
|----------|----------------|-------|
| C1 | Un solo `application/zip` con `pdf/`, `resumen.csv`, `resumen.pdf`, `LEEME.txt` | 12-02-02, 12-03-01 |
| C1 | El ZIP se lee con el lector propio (CRC y tamaños) y con `unzip -t` si existe | 12-01-02, 12-02-02 |
| C2 | Cada NCF, importe e ITBIS del CSV coincide con la fila; N filas = `COUNT(*)` del rango | 12-02-01, 12-03-01 |
| C2 | Resumen por tipo = SUM independiente; PDF del ZIP = bytes de disco | 12-02-01, 12-02-02 |
| C2 | Bordes del mes (03:59:59.999Z / 04:00:00.000Z); nota B04 en el mes de su emisión; nota sobre recibo aparte | 12-01-02, 12-02-01 |
| C2 | El comprobante emitido no cambia (hash de `facturas`) | 12-02-02 |
| C2 | PDF que falta: se repone y se marca, o 409 | 12-02-02 |
| C3 | Ningún camino automático | 12-03-02 |
| Seguridad | 401 / 404 / 400 | 12-03-01, 12-03-02 (`auditar-permisos`) |
| Determinismo | Dos descargas del mismo mes = mismos bytes | 12-02-02 |
| UI | Botón, aviso y error en la consola | 12-04-02 |

## Ola 0

- [ ] `tools/probar-lote.js`, script `lote:probar` y paso «Lote del contador» en el job `pruebas` de `.github/workflows/desplegar.yml` (plan 12-01).
- [ ] Rutas del lote en `tools/auditar-permisos.js` (plan 12-03) y comprobación del botón en `tools/auditar-flujos.js` (plan 12-04).
- [ ] Sin instalación de marco: todo es `node:*`.

## Solo manual

| Comportamiento | Requisito | Por qué manual | Instrucciones |
|----------------|-----------|----------------|---------------|
| El ZIP abre de fábrica en Windows y el CSV en Excel en español con acentos bien | CONTAB-01 | Sin Windows ni Excel en el CI | Descargar un mes desde la consola, abrir el ZIP con el explorador de Windows y `resumen.csv` con Excel |
| `resumen.pdf` se lee bien y cabe en una página | CONTAB-01 | Juicio visual | Abrirlo junto al LEEME |
| La descarga real por el botón guarda el archivo con su nombre | CONTAB-01 | El navegador sin pantalla de la auditoría no descarga | Pulsar «Descargar paquete del mes» en la consola real |
| Aceptar que el mes no se preselecciona en `#mesFacturas` (D-08) | CONTAB-01 | Decisión de Victor | Ver la nota en `12-CONTEXT.md` (D-08) |
| El contador acepta el contenido (607, ZIP, recibos, corte) | CONTAB-01 | Pregunta de negocio | Preguntas de `12-CONTEXT.md` |

## Firma

- [x] Toda tarea tiene verificación automática o depende de la ola 0
- [x] Nunca tres tareas seguidas sin verificación automática
- [x] Sin modos de vigilancia
- [x] Las pruebas no dependen del día ni de la hora (salvo los dos casos del mes en curso real, calculados en la prueba)
- [x] `nyquist_compliant: true`

**Aprobación:** pendiente
