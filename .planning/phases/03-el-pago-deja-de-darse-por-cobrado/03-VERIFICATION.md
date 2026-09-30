---
phase: 03-el-pago-deja-de-darse-por-cobrado
verified: 2026-09-30
status: passed
score: 5/5 criterios de éxito (y 19/19 verdades de los planes)
requirements: [PAGO-01, PAGO-02, PAGO-03]
head_verificado: c28a8b3
re_verification: false
retroactiva: true
---

# Fase 3 · Verificación retroactiva: el pago deja de darse por cobrado

**Objetivo (ROADMAP):** que un pago solo otorgue cupos y consuma un NCF cuando el dinero
se confirma, con un único punto de transición compartido por todos los caminos de cobro.

**Veredicto: PASADA.** Se verificó sobre el código ACTUAL (`c28a8b3`, rama
`claude/papeleo-roadmap` = `main`), no sobre el de la fecha de la fase. Desde entonces
las fases 5, 05.1 a 05.4 y 6 construyeron encima (transferencia, publicación del
particular, renovación, capacidad del dealer, CardNet), y añadieron tres tipos de
intención (`publicacion`, `renovacion`) y tres caminos nuevos de confirmación (consola,
aviso de CardNet, conciliación). Todos siguen desembocando en la misma transición
`pagos.confirmarPago`; ninguno la copia ni la rodea. Los SUMMARY no se tomaron como
prueba: cada criterio se trazó en el código y se comprobó con las baterías, que se
corrieron en esta verificación.

## Criterios de éxito

| # | Criterio | Estado | Evidencia en el código actual |
|---|----------|--------|-------------------------------|
| 1 | Un pago recién creado aparece como `pendiente`; sin cupos ni comprobante hasta confirmarse | ✓ | `db.registrarCobro` (`tools/db.js:3364`) inserta con `'pendiente'` literal (`:3391`), `confirmado` NULL y lo comprado en `intencion`; no toca `suscripciones` ni `facturas`. Rechaza el importe cero (`:3365`) y un cobro que no sale de `precios.desglose` (`:3375`). Las cinco rutas con importe lo usan: compra (`tools/api.js:2897`), ampliación (`:3009`), publicación (`:3796`), renovación (`:3981`) y la renovación automática (`tools/pagos.js:762`). Un 202 con `membresia: null` y `comprobante: null` cuando no hay aprobación (`tools/api.js:2815-2827`, `:3038-3051`). `pagos:probar` §2 y §21. |
| 2 | Al confirmarse, cupos y comprobante aparecen juntos, venga de pasarela o de persona | ✓ | `pagos.confirmarPago` (`tools/pagos.js:180`) llama a `db.aprobarPago` y luego a `emitir` → `facturas.emitirPorPago` (`:141`), el ÚNICO llamador de la emisión en todo `tools/` (grep). `db.aprobarPago` solo lo llaman `pagos.js:181` y la semilla de demostración (`tools/seed.js:281`, ver nota). Caminos: persona → consola `marcarTransferenciaRecibida` (`tools/api.js:1610`, dentro de `enNombreDe`); procesador directo → `cobrar` → `resolver` → `confirmarPago` (`tools/pagos.js:462`, `:413`); aviso de CardNet → `pagos.resolver` (`tools/api.js:4266`); conciliación → `resolver` (`tools/pagos.js:681`). `transferencia:probar` vigila que `api.js` no llame a `db.aprobarPago` (`tools/probar-transferencia.js:932`). `pagos:probar` §10, §15, §17, §20. |
| 3 | Repetir la confirmación deja los mismos cupos y el mismo NCF | ✓ | Tres guardas encadenadas: `aprobarPago` devuelve `yaEstaba` sin tocar nada si el pago ya no está pendiente (`tools/db.js:3441`) y su `UPDATE … WHERE estado = 'pendiente'` exige `changes === 1` o deshace el SAVEPOINT entero (`:3535-3537`); `emitir` devuelve la factura existente sin reenviar el correo (`tools/pagos.js:126`); `emitirPorPago` repite la comprobación (`tools/facturas.js:521`). `pagos:probar` §4, §5, §11 (misma factura, B02 +1, un correo), §14 (la emisión fallida se completa confirmando otra vez). |
| 4 | Un cobro rechazado queda `rechazado`, sin cupos y sin NCF | ✓ | `db.rechazarPago` (`tools/db.js:3726`) solo cambia un `pendiente` y no toca suscripciones ni facturas; `pagos.rechazarPago` (`tools/pagos.js:274`) no emite. `resolver` solo llega a `confirmarPago` con un `aprobado` explícito (`:409`); un procesador desconocido, que lanza o que responde algo raro deja `pendiente` (`:468-476`). Un aprobado de CardNet que ya no se puede aplicar NO se rechaza ni emite: queda un evento `aprobado-sin-aplicar` (`:423-438`). Compra y ampliación responden 402 (`tools/api.js:2812`, `:3035`). `pagos:probar` §6, §12, §13, §18, §20, §25. |
| 5 | Una compra de importe cero sigue aprobada al instante y sin emitir | ✓ | Los cuatro caminos del cero pasan por `anotarPago` (`tools/db.js:3062`), que escribe `'aprobado'` con procesador `'sin-costo'` y lanza con importe (`soloCero`, `:3055`): `comprarCupos` (`:3094`), `ampliarCupos` (`:4175`), `publicarBorradorSinCosto` (`:3162`) y `renovarSinCosto` (`:3264`). Ninguno llama a `facturas`; además `emitir` corta en `!(pago.total > 0)` (`tools/pagos.js:124`). Rutas: `tools/api.js:2882`, `:2996`, `:3764`, `:3953`; renovación automática `tools/pagos.js:755`. `pagos:probar` §7, §19, §22 (las puertas del cero lanzan con importe), §27. |

## Verdades de los planes (must_haves)

| Plan | Verdad | Estado |
|------|--------|--------|
| 03-01 | Cobro con importe nace pendiente, sin suscripción, cupos ni comprobante | ✓ `registrarCobro` |
| 03-01 | `pendiente → aprobado` otorga la intención y marca el pago en una sola transacción | ✓ SAVEPOINT `aprobar_pago` (`tools/db.js:3436-3545`); con BEGIN antes, cambiado a SAVEPOINT en la fase 5 para ir dentro de `enNombreDe`, mismo efecto |
| 03-01 | Repetir no crea otra suscripción ni suma dos veces | ✓ §4, §5 |
| 03-01 | Rechazado queda sin nada y ya no se aprueba | ✓ §6, §13 |
| 03-01 | `registrarCobro` niega el cero | ✓ `tools/db.js:3365`, §7 |
| 03-01 | Los pagos viejos (`aprobado`, sin `confirmado`) se cuentan y facturan igual | ✓ §8; `emitirPorPago` cae en `creado` (`tools/facturas.js:563`); la migración no tiene UPDATE |
| 03-01 | El comprobante lleva la fecha de confirmación | ✓ `fecha: pago.confirmado \|\| pago.creado` (`tools/facturas.js:563`), §9 |
| 03-02 | Una única `confirmarPago` con cupos y comprobante juntos | ✓ |
| 03-02 | Confirmar dos veces: una factura, un NCF, un correo | ✓ §11 |
| 03-02 | Rechazar no emite ni consume NCF | ✓ §12 |
| 03-02 | Emisión fallida: el pago queda aprobado, nada lanza, y reconfirmar la completa | ✓ `emitir` con try/catch (`tools/pagos.js:129-158`), §14 |
| 03-02 | `cobrar` pregunta al procesador; desconocido o que falla → pendiente | ✓ `tools/pagos.js:462-478`, §16 |
| 03-03 | Comprar con `demo`: 201 con membresía y comprobante, pasando por pendiente | ✓ §17 |
| 03-03 | Ampliar con `demo`: 200 con cupo y comprobante | ✓ §20 |
| 03-03 | Procesador rechaza: 402, rechazado, sin membresía, cupo igual, sin NCF | ✓ §18, §20, §25 |
| 03-03 | Importe cero: aprobado al instante, `sin-costo`, sin comprobante | ✓ §19, §27 |
| 03-03 | Ninguna ruta otorga ni emite por un cobro con importe fuera de `confirmarPago` | ✓ grep: `emitirPorPago` solo en `pagos.js:141`; `aprobarPago` solo en `pagos.js:181` y `seed.js:281`; los cuatro caminos del cero lanzan con importe (§22) |
| 03-03 | `npm run db:demo` sigue sembrando | ✓ `tools/seed.js:264-281`; lo corre el job `navegador` (`desplegar.yml:157`) |
| 03-03 | `pagos:probar` en el job `pruebas` del CI | ✓ `.github/workflows/desplegar.yml:94` |

## Requisitos

| Requisito | Criterios | Estado |
|-----------|-----------|--------|
| PAGO-01 · el pago nace `pendiente` y solo pasa a `aprobado` al confirmarse | 1, 4 | ✓ Cumplido |
| PAGO-02 · cupos y comprobante en un único punto compartido por pasarela y marcado manual | 2, 3 | ✓ Cumplido: consola (`api.js:1610`) y CardNet (`pagos.js:413` vía `resolver`) llaman a la misma `confirmarPago` |
| PAGO-03 · el importe cero sigue aprobado sin emitir | 5 | ✓ Cumplido |

Sin requisitos huérfanos: REQUIREMENTS.md asigna a la fase 3 exactamente PAGO-01..03.

## Artefactos y conexiones

| Artefacto | Existe | Tiene contenido real | Está conectado |
|-----------|--------|----------------------|----------------|
| Migración `2026-09-pagos-pendientes` (`tools/db.js:856`) | ✓ | ✓ idéntica a la del commit `e6c36e9`: no se reescribió | ✓ columnas en `db/schema.sql:570-573` |
| `db.registrarCobro` / `aprobarPago` / `rechazarPago` | ✓ | ✓ | ✓ exportadas (`tools/db.js:5829`), llamadas solo desde `pagos.js`, las rutas de cobro y la semilla |
| `otorgarCompra` compartida (`tools/db.js:3123`) | ✓ | ✓ | ✓ la usan `comprarCupos`, `publicarBorradorSinCosto` y `aprobarPago` (compra y publicación) |
| `tools/pagos.js` · `confirmarPago`, `cobrar`, `resolver`, `PROCESADORES` | ✓ | ✓ 805 líneas | ✓ `api.js`, `tareas.js` (conciliación), `seed.js` no |
| `tools/facturas.js` · `emitirPorPago` idempotente y fechado por `confirmado` | ✓ | ✓ | ✓ solo desde `pagos.emitir` |
| `tools/probar-pagos.js` + `pagos:probar` | ✓ | ✓ 112 comprobaciones, 27 secciones | ✓ `package.json:31`, CI `desplegar.yml:94`; `MERCA_DB` se fija antes del `require` (`:34` y `:46`) |

## Pruebas corridas en esta verificación

Todas herméticas, sin servidor ni navegador, todas en verde:

| Batería | Resultado |
|---------|-----------|
| `pagos:probar` | Todo correcto, 112 comprobaciones |
| `facturas:probar` | Todo correcto |
| `transferencia:probar` | 213 comprobaciones, 0 fallos |
| `publicacion:probar` | 163, 0 fallos |
| `renovacion:probar` | 152, 0 fallos |
| `capacidad:probar` | 132, 0 fallos |
| `cardnet:probar` | 583, 0 fallos |
| `seguridad:probar` | 101 bien, 0 mal |

## Anti-patrones

Ninguno. Sin TBD/FIXME/XXX en los archivos de la fase (la única coincidencia de
«TODO» es `METODOS` en `tools/facturas.js`). Sin manejadores vacíos ni retornos fijos:
cada rama de `resolver` y de las rutas devuelve el estado real del pago releído de la base.

## Notas (no bloquean)

1. **La semilla aprueba sin emitir** (`tools/seed.js:281` llama a `db.aprobarPago` y no a
   `pagos.confirmarPago`). Es deliberado y comentado: la semilla corre en bases
   desechables y no debe consumir NCF ni mandar correos. En producción solo se ejecuta
   `seed.js --solo-flota` (`tools/seed.js:402`, `deploy/README.md:118`), que no siembra
   membresías. No es un camino del sitio.
2. **Doble confirmación entre DOS procesos a la vez.** Los cupos están a salvo entre
   procesos (el `UPDATE … WHERE estado = 'pendiente'` con `changes === 1`). La emisión
   no del todo: `facturas` no tiene índice único sobre `pago_id` (solo `ix_facturas_pago`,
   `tools/db.js:559`), y la comprobación «ya tiene factura» (`tools/pagos.js:126`) y la
   inserción no van en una transacción, con `tomarNcf` en medio. Dos procesos que
   confirmaran el mismo pago en el mismo instante podrían consumir dos NCF. Hoy no puede
   ocurrir: con CardNet apagado, `reconciliar` y `renovarAutomaticas` (el único código que
   confirma desde otro proceso, `tools/tareas.js:589 y :632`) devuelven `apagado` sin mirar nada,
   y dentro del proceso del servidor la confirmación es síncrona. Además la conciliación
   solo mira pagos de más de 10 minutos. Conviene cerrarlo antes de encender CardNet: es
   materia de la fase 6 y, si no, de la deuda técnica (fase 13).
3. **Papeleo desfasado:** `ROADMAP.md:39` y los tres planes siguen con la casilla sin marcar,
   y la tabla de trazabilidad de `REQUIREMENTS.md:146-148` dice «Pendiente» para
   PAGO-01..03. El código cumple; falta actualizar los documentos.

## Verificación humana

Ninguna necesaria. La fase no tiene interfaz propia: lo que el comprador ve de un pago
pendiente (202, datos de la transferencia) lo verificó la fase 5.

---

_Verificado: 2026-09-30 · retroactiva sobre `c28a8b3`_
_Verificador: Claude (gsd-verifier)_
