---
phase: 06-cardnet-construido-probado-y-apagado
plan: 10
subsystem: pagos
tags: [cardnet, extremo-a-extremo, auditorias, despliegue, apagado]

requires:
  - phase: 06-cardnet-construido-probado-y-apagado
    provides: "06-03 a 06-09: cobro, notificación, conciliación, renovación automática y panel con tarjeta"
provides:
  - "Sección 24 de tools/probar-cardnet.js: los cinco criterios de la fase, el cobro recurrente y el apagado, de extremo a extremo con el doble"
  - "Comprobaciones nuevas de permisos sobre las rutas de pago y de ausencia del selector de tarjeta con CardNet apagado"
  - "deploy/README.md sección 10c: procedimiento de encendido, respaldo, temporizador y apagado"
  - "06-USER-SETUP.md al día"
affects: [cierre-de-fase-06]

key-files:
  created: []
  modified:
    - tools/probar-cardnet.js
    - tools/auditar-permisos.js
    - tools/auditar-flujos.js
    - deploy/README.md
    - .planning/phases/06-cardnet-construido-probado-y-apagado/06-USER-SETUP.md

key-decisions:
  - "El criterio 3 se lee como «activa la publicación o la capacidad comprada» (R-07)"
  - "El informe «sin nada que conciliar» se compara en un proceso con base vacía: las secciones anteriores dejan pagos sin aplicar a propósito y esos sí deben salir en el informe"
  - "Ninguna clave de QA de CardNet entra al repositorio ni a .env.example: solo marcadores entre ángulos"

requirements-completed: [PAGO-04, PAGO-05, PAGO-06, PAGO-07, PAGO-08]

duration: ~1h30
completed: 2026-09-30
---

# Phase 6 Plan 10: cierre de la fase, los cinco criterios de extremo a extremo

**Los cinco criterios del ROADMAP y el cobro recurrente pasan de principio a fin contra el doble de CardNet sobre el modelo comercial nuevo, el sitio con CardNet apagado pasa la batería y las auditorías con navegador, y el encendido queda escrito paso a paso en la sección 10c de `deploy/README.md`.**

## Tareas

| Tarea | Nombre | Commit |
|-------|--------|--------|
| 1 | Los cinco criterios de extremo a extremo (sección 24 del arnés) | 7df16b2 |
| 2 | Auditorías con navegador y batería completa con CardNet apagado | 42e0f42 |
| 3 | El procedimiento de encendido y 06-USER-SETUP | 5f63623 |

## Criterio → sección del arnés (`tools/probar-cardnet.js`, sección 24)

| Criterio del ROADMAP | Subsección | Qué recorre |
|----------------------|------------|-------------|
| 1. Sin datos de tarjeta en nuestro servidor | «Criterio 1» | Borrador → pago 202 con `urlCaptura` → confirmar con un cuerpo lleno de número, token y vencimiento inventados → aprobado. Cobra con el token del `Customer` del doble; ni el número ni el token inventado están en ninguna tabla; ninguna cadena de 13 a 19 dígitos en el pago ni en sus eventos; `git grep` del nombre del código de seguridad, vacío |
| 2. Apagado = como antes | «Criterio 2» | `/api/planes`, publicar, comprar, ampliar, renovar, panel (mismas claves, sin `tarjetas`), notificación 404 como ruta inexistente, CSP sin `frame-src`, las tres tareas y `reconciliar`/`renovarAutomaticas` sin llamadas, informe idéntico al de antes, transferencia pendiente → recibida → comprobante |
| 3. Aprobado activa y emite; rechazado no deja nada | «Criterio 3» | Particular publica con tarjeta (activo, B02, NCF); dealer compra capacidad de 5 y la amplía a 8 (NCF en cada una); rechazo de publicación y de capacidad: 402, sin factura, B02 igual |
| 4. Idempotencia y centavos | «Criterio 4» | La misma notificación dos veces: una factura, B02 +1; RD$2.000 (`desglose(1646)`) viaja como `200000`, el ITBIS también en centavos |
| 5. Aviso perdido recuperado y descuadre informado | «Criterio 5» | Aprobado en el doble y pendiente en la base: `pagos.reconciliar` lo completa con una factura; `componerInforme` lista su referencia en «Pasarela de pago» |
| Cobro recurrente | «Renovación automática» | Publicación del particular (casilla por `PUT`) y capacidad del dealer (casilla al comprar) se renuevan solas con `renovarAutomaticas`: fin alargado, un comprobante cada una, importe = `precios.precioRenovacion`, un `purchase` con el token guardado; sin la casilla no se renueva |
| El procesador `demo` | final de la sección | Contado por un envoltorio; cero llamadas con CardNet activo |

## Batería (CardNet apagado, `MERCA_DB` desechable)

| Comando | Resultado |
|---------|-----------|
| `check:encoding` | 0 por reparar |
| `taxonomia` | sale 0 |
| `facturas:letras` | 0 fallos |
| `precios:probar` | 0 fallos |
| `seguridad:probar` | sale 0 |
| `dealer:probar` | sale 0 |
| `bitacora:probar` | sale 0 |
| `contactos:probar` | sale 0 |
| `catalogo:probar` | sale 0 |
| `facturas:probar` | sale 0 |
| `pagos:probar` | 112 comprobaciones, 0 fallos |
| `metricas:probar` | sale 0 |
| `transferencia:probar` | 213 comprobaciones, 0 fallos |
| `publicacion:probar` | 163 comprobaciones, 0 fallos |
| `renovacion:probar` | 152 comprobaciones, 0 fallos |
| `recordatorios:probar` | 32 comprobaciones, 0 fallos |
| `capacidad:probar` | 132 comprobaciones, 0 fallos |
| `cardnet:probar` | 579 comprobaciones, 0 fallos, `intentosDeRed === 0` |
| `chat:probar` | sale 0 |
| `npm run auditar` (sitio en el 8080 sobre `db:demo`, sin `MERCA_CARDNET*`) | sale 0, 0 hallazgos; incluye taxonomía, público, flujos, permisos, métricas y contraste |
| `npm run check` | sale 0, sin problemas |
| `npm run check:motion` | sale 0 |
| `node tools/tareas.js --seco` | 15/15 tareas, «CardNet apagado» en conciliar, renovar y avisar |

Chrome con el envoltorio del scratchpad vía `PUPPETEER_EXECUTABLE_PATH`; nada de `tools/` se tocó por eso. El servidor del 8080 se detuvo al terminar (ningún proceso queda escuchando). `git diff` de `tools/facturas.js` vacío; `git grep -n -i -E "c[v]v"` sobre `tools assets db deploy '*.html'` sin resultados (lo comprueba también la sección 24 del arnés).

Auditorías nuevas verificadas en el navegador: el pago ajeno (`GET /pagos/:id` y `POST /pagos/:id/confirmar`) da 404, `GET /metodos-pago` sin sesión 401, `DELETE /metodos-pago/inexistente` 404 y la notificación 404; ninguna pantalla (publicar, planes y panel del particular; panel, planes y publicar del dealer) enseña `.captura`, `.metodo-pago`, `.tarjetas`, `.tarjetas-guardadas` ni `[data-metodo-pago]`.

## Deviations from Plan

**1. [Ajuste] Comprobación del informe en un proceso aparte.** El plan pedía comparar el informe con CardNet apagado con el de antes. Dentro del arnés, `db.informe` trae `sinAplicar` de las secciones 14 a 20 (pagos aprobados en el banco y no aplicados, dejados a propósito), y el informe correctamente los lista. La comparación «sin nada que conciliar» se hace ahora en un proceso hijo con base vacía. No es un fallo del código: es lo que debe pasar.

**2. [Ajuste] La casilla de la publicación del particular se activa por `PUT /renovacion-automatica`.** `POST /borradores/:id/pago` no lleva la casilla (solo compra, ampliar y renovar). El recorrido del particular publica con tarjeta y activa la casilla con la ruta que usa el panel.

**3. [Ajuste] «Dealer» en el arnés es una cuenta de tipo particular con capacidad de 5 y 8.** El arnés no necesita la aprobación del dealer: la ruta de compra de capacidad es la misma.

No apareció ningún fallo real en el código de los planes anteriores: no hubo commits `fix(06-10)`. Ninguna deuda de precios, ni `tools/facturas.js` ni `aprobarPago` tocados.

## Lista para Victor

Lo pendiente es todo de credenciales y trámites con CardNet; nada de nuestro lado bloquea.

1. **CardNet, antes de encender** (detalle en la sección 10c y en `06-USER-SETUP.md`): afiliación con Tokenización y los casos `Ecommerce_COF` y `MOTO_Recurring`; credenciales de QA; registrar la URL `https://mercamaquinarias.com/api/pagos/cardnet/notificacion`; y **`DataDo.Invoice`: si va el NCF, no se enciende y hay que rediseñar.**
2. **Decisiones tuyas, ya tomadas y reversibles:**
   - (a) **Durante la promoción de lanzamiento la renovación automática renueva gratis, sin cobrar** (decisión del 06-08): con importe cero se renueva por `db.renovarSinCosto`, sin llamar a CardNet ni emitir comprobante. Es reversible; si prefieres otra cosa, es cambiar ese camino en `pagos.renovarAutomaticas`.
   - (b) **La frase «Tu anuncio vence el {fecha}.» va de tú** (texto del modelo comercial) **mientras el panel trata de usted.** Queda la mezcla; unificar es cambiar un texto en `assets/panel.js`.
3. **Lo que queda por confirmar en el laboratorio de CardNet** (cada uno se corrige en su función aislada, sin tocar el resto):
   - la forma del `message` que manda el formulario al terminar (escucha de fin en `assets/cardnet.js`);
   - que el formulario admita ser embebido en un iframe;
   - el alto del iframe para el reto 3-D Secure;
   - el orden en que devuelve los perfiles nuevos (`perfilesDe`);
   - `DataDo.Invoice` (`cuerpoCompra`);
   - si el cobro recurrente exige un indicador en `purchase` (solo `cardnet.cuerpoCompra`).
4. **Verificación manual con credenciales** (no bloquea el cierre): iframe real, notificación real y un cobro recurrente real, según la lista del punto 6 de la sección 10c y `06-VALIDATION.md`.
5. **Al encender:** respaldo verificado de la base antes de la migración `2026-10-cardnet` (`VACUUM INTO` + `integrity_check`), e instalar el temporizador `mercamaquinarias-pagos` (sección 10c, punto 5).

## Known Stubs

Ninguno.

## Threat Flags

Ninguno: no hay endpoints, rutas de autenticación ni tablas nuevas. Mitigaciones del registro: T-06-52 (README solo con marcadores entre ángulos, comprobado por la verificación), T-06-53 (README ordena `lab` primero y la pregunta de `DataDo.Invoice` como condición), T-06-54 (respaldo verificado antes de la migración y de pasar a producción), T-06-55 (auditoría de permisos con las rutas nuevas), T-06-56 (README ordena avisar a quien tenga renovaciones automáticas si el apagado dura).

## Self-Check: PASSED

- FOUND: 7df16b2, 42e0f42, 5f63623
- FOUND: sección 10c en deploy/README.md (LF, sin valores de llave, sin teléfono; verificación de la tarea 3 en «ok»)
- Sin modificaciones a STATE.md ni ROADMAP.md
