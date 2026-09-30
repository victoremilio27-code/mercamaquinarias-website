---
phase: 06-cardnet-construido-probado-y-apagado
plan: 06
subsystem: pagos
tags: [cardnet, notificacion, conciliacion, descuadre, informe, systemd, idempotencia]

requires:
  - phase: 06-cardnet-construido-probado-y-apagado
    provides: "06-01 cardnet.js, 06-02 funciones de base, 06-04 pagos.resolver, 06-05 rutas de cobro"
provides:
  - "POST /api/pagos/cardnet/notificacion: autenticada, releída en CardNet, idempotente, sin tope por IP"
  - "pagos.reconciliar({ minutos, ahora }) y la tarea reconciliar con su temporizador de 10 minutos"
  - "db.descuadresEntre, pagosCardnetAtascados, cobrosSinAplicar (por el evento) e informe().pasarela"
  - "Sección «Pasarela de pago» en el informe a gerencia (copia aparte a facturación); componerInforme exportada"
affects: [06-07, 06-08, 06-10]

key-decisions:
  - "La notificación va primera del bloque de cobro con tarjeta en RUTAS; sin db.permitir (CardNet reintenta)"
  - "Autenticación con timingSafeEqual sobre SHA-256 de ambas cabeceras, antes de leer el cuerpo"
  - "cobrosSinAplicar busca por el evento aprobado-sin-aplicar, no por el estado del pago"
  - "reconciliar reenvía con el mismo UniqueID sin mirar la guarda cuando hubo intento previo"

requirements-completed: [PAGO-07, PAGO-08]
completed: 2026-09-30
---

# Phase 6 Plan 06: notificación de CardNet, conciliación e informe

**La notificación autenticada y la conciliación cada 10 minutos completan los pagos con tarjeta cuando se pierden el navegador o el aviso, con un solo comprobante y un solo NCF, y lo que no cuadra sale en «Pasarela de pago».**

## Tareas

| Tarea | Nombre | Commit |
|-------|--------|--------|
| 1 | La notificación de CardNet | 0417625 |
| 2 | pagos.reconciliar y consultas del descuadre | 948c82b |
| 3 | Tarea, temporizador, sección del informe y arnés (secciones 19 a 21) | d1ac443 |

## Respuestas de la notificación

| Caso | Respuesta |
|------|-----------|
| CardNet apagado | 404 «Ruta inexistente», sin leer el cuerpo ni anotar nada |
| Sin cabecera, otra llave, esquema distinto de Basic | 401 «No autorizado», sin evento |
| JSON inválido: llave correcta / incorrecta | 400 / 401 |
| Aprobado en la consulta | 200; anuncio activo, una factura, B02 +1 |
| Mismo aviso repetido | 200; misma factura, B02 igual |
| Rechazado en la consulta (aunque el cuerpo diga aprobado) | 200; pago rechazado con código, sin factura |
| Referencia desconocida, pago no cardnet, recurso que no es compra | 200 y evento `ignorada` |
| Consulta caída o fallo propio | 500 (CardNet reintenta) |
| 100 avisos seguidos de una IP | ninguno 429 |

## Retorno de reconciliar

`{ revisados, recuperados: [{ id, referencia, total }], rechazados, fallidos }`; apagado: `{ apagado: true, revisados: 0 }`. Un pago que pasa de pendiente a aprobado deja un evento `descuadre` (origen `reconciliacion`).

## Ejemplo de la sección del informe

```
Pasarela de pago
────────────────
  Pagos recuperados por la conciliación ...... 1
    TE-2026-AAAAAA · RD$ 2,360
  Pagos con tarjeta atascados ................ 1
  Cobrados sin aplicar (devolver) ............ 1
    TE-2026-BBBBBB · RD$ 3,889
```

Con CardNet apagado y todo a cero, la sección no existe y el informe es idéntico al anterior (comparado con la salida del código de la fase previa).

## Instalar el temporizador (VPS)

```
sudo cp deploy/mercamaquinarias-pagos.service deploy/mercamaquinarias-pagos.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mercamaquinarias-pagos.timer
```

Con CardNet apagado la tarea no hace nada, así que es inocuo instalarlo antes. El despliegue automático no lo instala; lo documenta 06-10.

## Deviations from Plan

Ninguna en el fondo. Detalles:
- Los commits de las tareas 1 y 2 no llevan sus pruebas: el arnés (secciones 19 a 21) se commiteó junto a la tarea 3.
- La sección 20 rejuvenece al inicio los pagos pendientes que dejó la sección 14 (envejecidos a propósito), para contar exactamente lo suyo.
- `pagosCardnetAtascados` excluye los pagos con `aprobado-sin-aplicar` (ya salen en «Cobrados sin aplicar») para no contarlos dos veces.
- El evento `recibida` se anota sin `pago_id`: se escribe antes de saber de qué pago habla el aviso.

## Verificación

- `cardnet:probar` 462/0 (secciones nuevas 19, 20 y 21). Cubren: aprobado sin aplicar sobre un pago `reemplazado` que sale en `cobrosSinAplicar` y en el texto real de «Pasarela de pago»; reenvío con intento previo y membresía vencida (un solo evento `aprobado-sin-aplicar`, sin NCF, nunca rechazado).
- Verdes: `pagos` 112, `seguridad` 101, `facturas`, `transferencia` 213, `publicacion` 163, `renovacion` 152, `capacidad` 132, `bitacora` 120, `metricas` 60, `chat` 55.
- `tools/facturas.js` sin cambios; sin SQL en `tools/pagos.js`; nada se envía a un contador.
- Auditorías de navegador (`auditar`, `check`): no aplican; pendientes de la batería del orquestador.

## Known Stubs

Ninguno.

## Threat Flags

Ninguno fuera del registro del plan (T-06-29 a T-06-35).

## Self-Check: PASSED

- FOUND: commits 0417625, 948c82b, d1ac443
- FOUND: deploy/mercamaquinarias-pagos.service y .timer (LF)
