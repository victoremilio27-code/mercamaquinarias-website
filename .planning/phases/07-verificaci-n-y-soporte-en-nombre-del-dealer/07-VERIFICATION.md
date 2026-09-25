---
phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer
verified: 2026-09-25T23:59:00Z
status: passed
score: 5/5 criterios de éxito verificados
---

# Phase 7: Verificación y soporte en nombre del dealer — Verification Report

**Phase Goal:** Que el personal pueda hacer desde el sitio todo lo que hoy exige una terminal o es
imposible: verificar una organización, revisar un número de serie y arreglar la página de un dealer por él.
**Verified:** 2026-09-25, sobre el commit c8fa375 (tras las correcciones de la revisión)
**Status:** passed. Queda pendiente la mirada humana en claro y oscuro, que no bloquea (ver abajo).

## Goal Achievement

### Criterios de éxito del ROADMAP

| # | Criterio | Estado | Evidencia |
|---|---|---|---|
| 1 | El personal concede y retira el sello a una organización registrada por la web, desde el sitio | ✓ VERIFIED | `GET /api/admin/organizaciones` + `POST …/:id/verificar` (409 si no está aprobada, 400 al retirar sin motivo). Sección «Empresas dealer» en `admin.html`, conectada en `assets/admin.js:249,573`. `bitacora:probar` «Empresas y sello» (15 comprobaciones); recorrido en navegador de 07-04 (retirar en blanco rechazado, con motivo retirado, dado de nuevo) |
| 2 | El personal ve el número de serie, deja constancia del resultado y el resultado se ve donde corresponde | ✓ VERIFIED | `GET /api/admin/series`, `POST /api/admin/anuncios/:id/serie` (conforme / observada con nota / pendiente). Consola: `assets/admin.js:688,701`. El vendedor lo ve en `/api/mis-anuncios` → `assets/panel.js:290,312`; el público solo ve `serie_cotejada` → `assets/app.js:988,2137`. `bitacora:probar` «Número de serie» (22); recorrido 07-04 y 07-06 |
| 3 | Lo que dice `publicar.html` sobre la serie coincide con la diligencia real | ✓ VERIFIED | `publicar.html:155`: se coteja con la placa de las fotos y con los demás anuncios, no se publica, no se consultan registros de robo. Es exactamente lo que hace la consola. La promesa «no se publica» es ahora cierta: `seguridad:probar` bloque 1b (7), ni un visitante ni otra cuenta reciben la serie |
| 4 | El personal edita la página de un dealer en su nombre y el dealer ve el cambio con su borrador/publicada respetado | ✓ VERIFIED | Rutas `/api/admin/organizaciones/:id/pagina…` sobre el mismo núcleo de validación que el dealer; el editor en modo soporte vive en `assets/mi-pagina.js:39`, con entrada desde «Empresas» (`admin.js:563`). No hay publicar ni despublicar de admin. `dealer:probar` «Edición en nombre del dealer» (33): el dealer ve el cambio en `/api/mi-pagina`, sigue publicada, y en borrador sigue en borrador. Recorrido 07-05 |
| 5 | Cada escritura aparece en la bitácora con quién, cuándo y sobre qué organización | ✓ VERIFIED | Todas las escrituras nuevas pasan por `conAdminEnNombreDe` (`organizacion.verificar`, `anuncio.serie`, `pagina.editar`). La guarda sobre `RUTAS` de `probar-bitacora.js` clasifica las 10 escrituras nuevas bajo `/api/admin/`; las pruebas comprueban admin, IP, organización, antes/después y motivo |

**Score:** 5/5

### Requisitos

| Requisito | Estado |
|---|---|
| ADMIN-02 — sello desde el sitio | ✓ SATISFIED (criterio 1) |
| ADMIN-03 — revisar el número de serie | ✓ SATISFIED (criterio 2) |
| ADMIN-04 — editar la página del dealer en su nombre | ✓ SATISFIED (criterio 4) |
| CONF-01 — la promesa de `publicar.html` se cumple | ✓ SATISFIED (criterio 3) |

### Artefactos y reglas del repositorio

| Comprobación | Estado |
|---|---|
| Migración `2026-09-serie-revision` al final de `MIGRACIONES` (`tools/db.js:926`, el array cierra en la 932) | ✓ |
| Cero dependencias nuevas (`package.json` sin cambios) | ✓ |
| Ninguna ruta pública ni JSON-LD (`tools/meta.js`) entrega la serie; el catálogo no la selecciona | ✓ |
| Sin teléfono de soporte publicado, sin envíos al contador, sin tocar planes ni precios, nada fiscal tocado | ✓ |
| Finales de línea: índice y copia en LF, como `origin/main` (`git ls-files --eol`) | ✓ |

## Pruebas (sobre c8fa375)

| Suite | Resultado |
|---|---|
| seguridad:probar | 78 bien, 0 mal |
| dealer:probar | 82 bien, 0 mal |
| bitacora:probar | 117 bien, 0 mal |
| facturas:probar | Todo correcto |
| pagos:probar | Todo correcto (75) |
| chat:probar | 40 bien, 0 mal |
| facturas:letras | 6 pass, 0 fail |
| check:encoding | sin caracteres sospechosos |
| taxonomia | sin incoherencias |
| auditar-publico | sale 0; los 52 hallazgos son Google Fonts (26 peticiones + 26 errores de consola por el certificado del proxy de este entorno) |
| auditar-flujos | 0 hallazgos |
| auditar-permisos | 0 fallos, incluidas las 5 rutas nuevas de la fase |
| check-contraste | 0 hallazgos en los dos temas |
| check (enlaces) | 15 destinos internos sin roturas; los 16 «problemas» son el mismo error de Google Fonts |
| check:motion | movimiento reducido respetado |

Las auditorías se corrieron contra un servidor propio en el puerto 8094, con base de demostración
en `.tmp/fase07-verif/`, copias de las herramientas con el puerto cambiado y Chrome envuelto con
`--no-sandbox` (el contenedor corre como root). `correo:probar` no es una prueba: manda un correo
real a la dirección que se le pase, no está en CI y no se corrió.

## Verificación humana pendiente (no bloquea)

- Mirar en claro y oscuro «Empresas dealer», «Números de serie», el editor en modo soporte y la
  ficha con «Serie cotejada». Los recorridos automáticos de 07-04, 07-05 y 07-06 se hicieron en
  claro. El comprobador de contraste no entra detrás de la sesión.

## Gaps

Ninguno.
