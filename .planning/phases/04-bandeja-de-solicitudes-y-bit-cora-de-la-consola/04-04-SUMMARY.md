---
phase: 04-bandeja-de-solicitudes-y-bit-cora-de-la-consola
plan: 04
subsystem: consola de administración
tags: [admin, bitacora, verificacion-humana]
requires: [04-02, 04-03]
provides: [montarBitacora, cargarBitacora, pintarBitacora]
affects: []
tech-stack:
  added: []
  patterns: [tabla de solo lectura con filtro por organización, refresco tras escribir]
key-files:
  created: []
  modified: [admin.html, assets/admin.js]
decisions:
  - "No hizo falta tocar styles.css: .tabla-legales y .campo-v cubren la bitácora."
metrics:
  completed: 2026-09-25
  tasks: "2 de 3 (la 3 es el punto de control humano, pendiente)"
---

# Phase 4 Plan 04: la bitácora en la consola

Sección «Bitácora de administración» tras «Aceptaciones legales», de solo lectura: cuándo, quién (nombre y correo), organización, acción, cambio «Rótulo: antes → después», motivo e IP; selector de organización «Nombre · N»; sello y alta refrescan la bitácora sin recargar.

## Commits

| Tarea | Commit | Qué |
|---|---|---|
| 1 | fe73bda | Sección en `admin.html`, bloque de la bitácora en `assets/admin.js`, refresco en `alternarVerificada` y `resolver` |

## Verificación (tarea 2)

Servidor propio en **8092** con `MERCA_DB=.tmp/fase-04/demo.db`, arrancado después de todos los cambios.

| Prueba | Resultado |
|---|---|
| bitacora:probar | 72 bien, 0 mal |
| seguridad:probar | 71 bien, 0 mal |
| dealer:probar | 49 bien, 0 mal |
| facturas:probar | Todo correcto |
| chat:probar | 40 bien, 0 mal |
| facturas:letras | 6 pass, 0 fail |
| taxonomia | Sin incoherencias |
| check:encoding | Sin caracteres sospechosos |
| check (enlaces) | 15 destinos, sin problemas |
| auditar-publico | 0 hallazgos |
| auditar-flujos | 0 hallazgos |
| auditar-permisos | 0 fallos (25 comprobaciones, 5 nuevas) |
| check-contraste | 317 hallazgos antes y 317 después; «Admin (sin sesión)» 1 y 1: resumen por página idéntico. Sigue en rojo por la fase 2, como estaba previsto |
| recorrido de la consola con sesión | 23 bien, 0 mal (pasos 2-10 del punto de control, automatizados) |

Las auditorías tienen el puerto 8080 escrito; se corrieron desde copias con 8092 en `.tmp/fase-04/aud/`. `puppeteer` se tomó por `NODE_PATH` del `node_modules` de la copia principal (solo lectura): el worktree no tiene `node_modules` y no se instaló nada.

## Punto de control humano (tarea 3): PENDIENTE

El comprobador de contraste no ve lo que hay detrás de la sesión. Capturas en `.tmp/fase-04/`: `bandeja-claro.png`, `bandeja-atendidas-claro.png`, `bandeja-oscuro.png`, `bandeja-todas-oscuro.png`, `bitacora-claro.png`, `bitacora-oscuro.png`, `bandeja-movil-claro.png`, `bitacora-movil-claro.png`.

Banco limpio listo (3 solicitudes nuevas, 1 de transporte antigua y cerrada, 2 dealers pendientes, bitácora vacía). Para verlo en vivo:
`MERCA_DB=.tmp/fase-04/demo.db MERCA_CORREO=archivo node tools/serve.js --port 8092`, entrar con `revisor@demo.mercamaquinarias.do` / `RevisorDePrueba2026` (si pide código, está en `.tmp/correos/`) y seguir los diez pasos del plan. Para rehacer el banco: `bash .tmp/fase-04/banco.sh` y, con el servidor arriba, `node .tmp/fase-04/sembrar-bandeja.js` (con `MERCA_DB` fijado).

## Deviations from Plan

- Puerto 8092 en vez de 8080/8090, por encargo del coordinador.
- El recorrido de prueba hace clic en los botones de la cola por el DOM: con la página desplazada, la cabecera fija del sitio (`.cab`, sticky) tapaba el botón y el clic de puppeteer caía en ella. Es un efecto del robot, no del sitio, pero Victor puede comprobar en el paso 6 que el botón queda visible al desplazarse.

## Self-Check: PASSED
