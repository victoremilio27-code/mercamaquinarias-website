# Phase 7: Verificación y soporte en nombre del dealer - Research

**Researched:** 2026-09-25
**Domain:** consola de administración, bitácora, página del dealer, privacidad del anuncio
**Confidence:** HIGH (todo leído en el código de este repositorio)

## Resumen

La fase no parte de cero: la fase 4 dejó la puerta `db.enNombreDe`, el envoltorio
`conAdminEnNombreDe`, la guarda sobre `RUTAS` y un botón de sello en la pestaña «Aprobadas» de
la cola. Lo que falta es: un directorio de empresas desde el que dar el sello a cualquiera
(y con motivo al retirarlo), todo el circuito del número de serie, y rutas de administración
para la página del dealer.

**Recomendación principal:** reutilizar. Un solo editor de página (modo soporte por `?org=`),
los manejadores de `mi-pagina` partidos en núcleo + dos envoltorios, y las comprobaciones en los
archivos de prueba que ya corren en CI.

## Estado actual (verificado en el código)

| Pieza | Dónde | Estado |
|---|---|---|
| Sello desde el sitio | `tools/api.js` `verificarOrganizacion` (por la bitácora); `assets/admin.js:193` `alternarVerificada` | Solo accesible desde «Aprobadas» de la cola; no manda motivo |
| `marcarVerificada` | `tools/db.js:2190` | Escribe `verificada` a pelo |
| Número de serie | `db/schema.sql:584` `anuncios.serie`; se escribe en `tools/api.js:2406` | **Nadie lo lee**, y además `GET /api/anuncios/:id` lo entrega a cualquiera: `db.anuncio` hace `SELECT a.*` y `PRIVADOS_DEL_ANUNCIO` (`tools/api.js`) no lo incluye |
| Edición de serie tras publicar | — | No existe ruta: la serie queda fija al publicar. No hace falta «resetear» la revisión |
| Página del dealer | `tools/api.js` `verMiPagina`…`guardarMisEnlaces`, todas con `conPagina` (sesión del dueño) | Sin vía para el personal |
| Transacciones de la página | `tools/db.js` `ordenarSecciones`, `guardarEnlaces` | Usan `BEGIN`: **lanzarían** dentro del `SAVEPOINT` de `enNombreDe` |
| Acciones de bitácora | `tools/db.js` `ACCIONES_BITACORA` | Catálogo cerrado; una acción ausente hace fallar `conAdminEnNombreDe` al arrancar |
| Guarda de escrituras admin | `tools/probar-bitacora.js` «La guarda sobre RUTAS» | Toda escritura bajo `/api/admin/` debe ir por la bitácora o estar en `ESCRITURAS_ADMIN_PROPIAS` |
| Estado de revisión | `organizaciones.estado_revision` ∈ `no_aplica`, `pendiente`, `aprobada`, `rechazada` | Particulares = `no_aplica` |

## Patrones a seguir

- **Escritura en nombre de otro:** `conAdminEnNombreDe(accion, async (req, res, ctx, id) => { … ctx.enNombreDe(idOrg, { objetoTipo, objetoId, motivo }, (org) => { …; return { antes, despues, resultado }; }) })`.
  El callback es síncrono; los errores con `codigo` se traducen a `fallo(res, e.codigo, e.message)`.
- **Rutas:** array plano; las específicas antes que las genéricas (`/secciones/orden` antes que `/secciones/:id`).
- **Contexto nulo en rutas públicas:** `!!ctx && !!ctx.organizacion` antes de mirar la organización.
- **Frontend:** `api()` lanza en error; el editor ya envuelve con `llamar()`.
- **Pruebas:** arnés propio con `comprobar()`, `pedir()` sobre `api.manejar`, base temporal en `.tmp/`,
  variables de entorno **antes** del `require('./db.js')`.
- **Migraciones:** `['id', [sentencias]]` al final de `MIGRACIONES`; `ALTER TABLE … ADD COLUMN`
  tolera «duplicate column». `db/schema.sql` no refleja las columnas que nacen en migraciones
  (así se hizo con `bitacora_admin` y `atendida_por`).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Un BEGIN anidado rompe la escritura en nombre del dealer | D-13: SAVEPOINT en `ordenarSecciones` y `guardarEnlaces`; prueba de orden y enlaces por la vía de admin |
| Fuga del número de serie por la ficha | `serie`, `serie_nota`, `serie_revisada_por`, `serie_revisada`, `serie_revision` a privados; `serie_cotejada` booleano público; prueba en `seguridad:probar` |
| El personal publica sin querer | No existen rutas admin de publicar/despublicar; prueba que un POST a ellas no responde 2xx |
| Conflicto con fases paralelas en `MIGRACIONES` y `ACCIONES_BITACORA` | Añadir solo al final; el orquestador conserva ambas al fusionar |
| El logotipo pierde el alfa | El editor de soporte es el mismo editor: `reducir(…, true)` |

## Validation Architecture

**Framework:** arnés propio de Node (contadores + `process.exit`), `node:test` para puras,
puppeteer para auditorías. Sin instalación nueva.

| Requisito | Comprobación automática | Comando |
|---|---|---|
| ADMIN-02 | directorio de empresas solo admin; sello concedido/retirado con fila de bitácora; 409 si no aprobada; 400 al retirar sin motivo | `npm run bitacora:probar` |
| ADMIN-03 | listado de series con duplicados; resultado conforme/observada/pendiente con bitácora; nota obligatoria en observada; el vendedor ve el resultado en `/api/mis-anuncios` | `npm run bitacora:probar` |
| CONF-01 | la ficha no entrega `serie` ni la nota a terceros; `serie_cotejada` sí; texto de `publicar.html` | `npm run seguridad:probar`, `grep` en `publicar.html` |
| ADMIN-04 | el personal lee y edita la página por `/api/admin/organizaciones/:id/pagina…`; cada escritura deja fila `pagina.editar`; el dealer ve el cambio en `/api/mi-pagina`; `estado_pagina` no cambia; no hay publicar/despublicar de admin; un no-admin recibe 404 | `npm run dealer:probar` |
| ADMIN-05 (transversal) | la guarda sobre `RUTAS` clasifica las rutas nuevas | `npm run bitacora:probar` |
| Permisos en vivo | una cuenta normal no ve las rutas nuevas | `npm run auditar` (auditar-permisos) |

**Quick run:** `npm run bitacora:probar && npm run dealer:probar && npm run seguridad:probar` (~10 s).
**Full suite:** además `npm run auditar`, `check`, `facturas:probar`, `pagos:probar`, `chat:probar`,
`facturas:letras`, `taxonomia`, `check:encoding` (auditar necesita el servidor de demo en 8080).

**Manual:** aspecto de las secciones nuevas en claro y oscuro, y del editor en modo soporte
(el comprobador de contraste no entra detrás de la sesión).

## RESEARCH COMPLETE
