---
phase: 05-cobro-por-transferencia-bancaria
verified: 2026-09-25T21:10:00Z
status: human_needed
score: 5/5 criterios de éxito verificados por máquina
requirements: {PAGO-09: satisfecho, ADMIN-06: satisfecho}
human_verification:
  - revisión visual en navegador real, claro y oscuro, móvil y escritorio
  - botón «Copiar» con HTTPS
  - encendido en producción con los cinco datos bancarios reales
---

# Fase 5: verificación del cobro por transferencia bancaria

**Objetivo de la fase:** que la empresa pueda cobrar y otorgar cupos el 14 de
octubre sin que ningún proveedor externo tenga que haber encendido nada.
**Verificado:** 2026-09-25, sobre `claude/dazzling-bardeen-gq9csi` (a31077d).
**Estado:** `human_needed`. Todo lo comprobable por máquina está verificado.
Queda lo que la máquina no puede juzgar: la revisión a ojo y los datos
bancarios reales, que solo tiene Victor.

## Criterios de éxito del ROADMAP

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | El comprador puede elegir transferencia y ve los datos de la cuenta y la referencia | ✓ VERIFICADO | `POST /api/membresias` → 202 con `transferencia` y `cobro.referencia` (arnés §16, §18, §32). `planes.html` pinta «Forma de pago: transferencia bancaria», el botón «Pedir datos para transferir» y el bloque `.transferencia` con banco, titular, RNC, tipo, cuenta, importe y referencia (prueba de humo en navegador, los dos temas). Correo con los mismos datos y «no es un comprobante fiscal» (§20). |
| 2 | El pago queda `pendiente` y el comprador ve que está en espera, sin cupos | ✓ VERIFICADO | En la base, `estado='pendiente'`, sin membresía, sin factura y B02 quieto (§6, §16, §32). `GET /api/membresias` → `pagosPendientes` solo de su organización (§21). El panel muestra «Pagos en espera de confirmación» y publicar da 402 (§32 y prueba de humo). |
| 3 | El personal marca recibido y en ese momento el comprador gana cupos y recibe su comprobante con NCF | ✓ VERIFICADO | `POST /api/admin/pagos/:id/recibido` → 200 con membresía y `comprobante.ncf` B02; B02 avanza exactamente 1 en el marcado y 0 antes (§25, §32). Correo del comprobante al comprador con el NCF (§32). La consola lo hace con un botón y avisa del NCF emitido (prueba de humo). Repetir no emite otro (§26). |
| 4 | El marcado aparece en la bitácora de la fase 4 con quién y cuándo | ✓ VERIFICADO | Una fila `pago.transferencia_recibida` con `admin_id`, IP de `CF-Connecting-IP`, `antes`/`despues` y fecha (§25, §32). Si algo falla después de aprobar, no quedan ni cupos ni fila (§9). La consola muestra «Transferencia marcada como recibida» sin recargar (prueba de humo). La guarda de `bitacora:probar` ve las dos rutas nuevas (§31). |
| 5 | Con CardNet apagado, este camino cubre de principio a fin comprar cupos y publicar | ✓ VERIFICADO | Arnés §32: organización nueva → 202 → 402 al publicar → marcado → 201 al publicar → el anuncio sale en `GET /api/anuncios` sin sesión; `demo` llamado 0 veces; ninguna pasarela al alcance del comprador. Corre en CI, en el paso «Transferencia» del job `pruebas`. |

**Puntuación:** 5/5.

## Must-haves de los planes

| Plan | Must-have | Estado |
|------|-----------|--------|
| 05-01 | Apagada salvo con las cinco variables válidas; `demo` fuera del alcance al encenderla; `confirmarPago` dentro de `enNombreDe` con SAVEPOINT | ✓ (arnés §1-§14) |
| 05-02 | El procesador lo elige el servidor y se valida antes de anotar el pago; rutas de la consola por la bitácora y por `pagos.confirmarPago` | ✓ (§15-§31; `api.js` no llama a `db.aprobarPago`) |
| 05-03 | Un 202 nunca se presenta como compra hecha; la cuenta solo sale de la respuesta con sesión | ✓ (prueba de humo; `/api/planes` sin datos bancarios, §22) |
| 05-04 | La consola lista, marca y anula con la bitácora al día; ampliación huérfana solo anulable | ✓ (§28; prueba de humo) |
| 05-05 | Extremo a extremo en el arnés, batería en verde y verificación en los dos temas | ✓ automatizable / ? humano |

## Artefactos

| Artefacto | Existe | Sustancial | Conectado |
|-----------|--------|------------|-----------|
| `tools/transferencia.js` | ✓ | ✓ 75 líneas, validación por campo | ✓ `pagos.js`, `api.js` |
| `tools/pagos.js` (`transferencia`, `metodosDeCobro`, `procesadorDeCobro`, `confirmarPago({ envolver })`) | ✓ | ✓ | ✓ `api.js` 2127, 2312, 2425, 1515 |
| `tools/db.js` (`pagosPendientesDe`, `pagosParaConsola`, acciones de bitácora) | ✓ | ✓ | ✓ `api.js` 1463, 2170 |
| `tools/api.js` (3 rutas `/api/admin/pagos`, 202 de compra y ampliación) | ✓ | ✓ | ✓ en `RUTAS`, antes de las genéricas |
| `tools/correo.js` (`enviarDatosTransferencia`, `enviarTransferenciaAnulada`) | ✓ | ✓ | ✓ llamadas sin esperar desde `api.js` |
| `assets/planes.js`, `assets/panel.js`, `styles.css` (`.transferencia`) | ✓ | ✓ | ✓ |
| `admin.html` + `assets/admin.js` (sección `t-pagos`) | ✓ | ✓ | ✓ |
| `tools/probar-transferencia.js` + paso de CI | ✓ | ✓ 196 comprobaciones | ✓ `desplegar.yml:90` |
| `.env.example` y `deploy/README.md` §10b | ✓ | ✓ variables vacías, sin valores | — |

## Requisitos

| Requisito | Estado | Por qué |
|-----------|--------|---------|
| PAGO-09: cobro por transferencia con el pago marcado desde la consola | ✓ SATISFECHO | Criterios 1, 2, 3 y 5 |
| ADMIN-06: marcar un pago por transferencia como recibido | ✓ SATISFECHO | Criterios 3 y 4 |

## Reglas de CLAUDE.md

| Regla | Estado | Evidencia |
|-------|--------|-----------|
| Un comprobante nunca se borra ni se reescribe | ✓ | Anular solo pasa un pendiente a `rechazado` y no toca `facturas`. Un aprobado responde 409 y remite a la nota de crédito. |
| NCF solo al aprobar | ✓ | La emisión va después y fuera del SAVEPOINT (`confirmarPago`); B02 +0 antes del marcado (§6, §16, §32) y +0 al repetir (§26). |
| Sin teléfono publicado | ✓ | Las líneas añadidas por la fase no tienen teléfono, `tel:` ni WhatsApp. Correos y pantallas nuevas comprobados en el arnés y en la prueba de humo. |
| Nada automático a un contador | ✓ | Los avisos van a `facturacion@` (buzón propio). No hay ningún envío a un contador. |
| Cero dependencias | ✓ | `package.json` solo cambia en `scripts`. |
| Migraciones solo al final | ✓ | La fase no añade migraciones. `aprobarPago` cambia de BEGIN a SAVEPOINT, que es código y no esquema. |
| La cuenta bancaria fuera del repositorio | ✓ | `git grep` solo encuentra nombres de variable y marcadores. En la prueba, los valores son de prueba a la vista. |

## Antipatrones

Se revisaron los 16 archivos de la fase. No hay TBD, FIXME, XXX, TODO ni HACK
(las apariciones de «TODO» son la palabra en mayúsculas dentro de un
comentario). Tampoco hay marcadores de contenido pendiente. **0 bloqueantes.**

### Calidad de las pruebas

| Archivo | Requisito | Activas | Saltadas | Circular | Nivel de aserción | Veredicto |
|---------|-----------|---------|----------|----------|-------------------|-----------|
| `tools/probar-transferencia.js` | PAGO-09, ADMIN-06 | 196 | 0 | no | comportamiento (recorridos de varios pasos, valores exactos) | ✓ |
| `tools/probar-bitacora.js` | ADMIN-06 (guarda) | 74 | 0 | no | valor | ✓ |
| `tools/auditar-permisos.js` | ADMIN-06 (404 sin permiso) | 3 nuevas | 0 | no | estado | ✓ |

Pruebas desactivadas: 0. Circulares: 0. Aserciones insuficientes: 0.

### Cobertura de decisiones

Se omite: la fase no tiene `CONTEXT.md`. Las decisiones D-01 a D-10 están
citadas en los planes y aplicadas en el código (D-03 procesador del
servidor, D-06 solo transferencias en la consola, D-07 ampliación huérfana,
D-08 `rechazado` y no `devuelto`, D-10 la cuenta solo con sesión).

## Verificación de comportamiento

| Batería | Resultado |
|---------|-----------|
| `check:encoding`, `taxonomia` | limpio |
| `facturas:letras` | 6/0 |
| `seguridad:probar` | 71/0 |
| `dealer:probar` | 49/0 |
| `bitacora:probar` | 74/0 |
| `facturas:probar`, `pagos:probar` | Todo correcto |
| `transferencia:probar` | 196/0 |
| `chat:probar` | 40/0 |
| `auditar` (taxonomía, público, flujos, permisos, contraste) | 0 hallazgos (con Google Fonts accesible) |
| `check`, `check:motion` | sin problemas |

## Verificación humana (lo que queda)

1. **Revisión visual.** Qué hacer: recorrer los pasos 1-8 de 05-05-PLAN, en
   claro y oscuro, en un teléfono y en escritorio. Qué esperar: todo
   legible y el bloque de datos cómodo de copiar a mano. Por qué no lo hace
   la máquina: el contraste está medido (0 hallazgos) y las capturas se
   revisaron, pero juzgar si algo es cómodo y claro es de una persona.
2. **«Copiar» con HTTPS.** Qué hacer: en producción, pulsar «Copiar» junto
   a la referencia. Qué esperar: el texto pasa al portapapeles y el botón
   dice «Copiada». Por qué no lo hace la máquina: el portapapeles solo
   existe en un contexto seguro con un usuario real.
3. **Encendido real.** Qué hacer: poner los cinco datos en
   `/etc/mercamaquinarias.env` y reiniciar. Qué esperar: el registro no
   nombra variables que falten y `planes.html` ofrece la transferencia. Por
   qué no lo hace la máquina: los datos bancarios reales solo los tiene
   Victor.

## Diferido (no bloquea la fase)

- Desborde horizontal del panel a 390 px con un anuncio publicado. Viene de
  `.tabla-anuncios`, de agosto, anterior a esta fase. Queda como tarea
  aparte.

## Resumen de huecos

Ninguno. La fase cumple su objetivo en todo lo comprobable. Solo falta la
mirada de Victor y sus datos bancarios.
