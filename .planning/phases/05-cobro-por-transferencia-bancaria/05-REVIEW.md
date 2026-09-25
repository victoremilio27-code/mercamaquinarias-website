---
phase: 05-cobro-por-transferencia-bancaria
reviewed: 2026-09-25
alcance: "git diff a9184fa..HEAD -- . ':!.planning' (16 archivos, +2432/-28)"
hallazgos: {criticos: 0, altos: 0, medios: 0, bajos: 4}
corregidos: 4
---

# Fase 5: revisión de código

Solo se revisó lo que cambió la fase 5: `tools/transferencia.js`,
`tools/pagos.js`, `tools/db.js`, `tools/api.js`, `tools/correo.js`,
`tools/auditar-permisos.js`, `tools/probar-transferencia.js`,
`assets/planes.js`, `assets/panel.js`, `assets/admin.js`, `admin.html`,
`styles.css`, `package.json`, `.github/workflows/desplegar.yml`,
`.env.example` y `deploy/README.md`.

## Reglas de CLAUDE.md

| Regla | Resultado |
|-------|-----------|
| Un comprobante emitido nunca se borra ni se reescribe | **Se cumple.** `anularTransferencia` solo acepta pagos `pendiente` y los deja en `rechazado`. A un aprobado le responde 409 y le remite a la nota de crédito B04. Ninguna ruta nueva escribe en `facturas`. |
| NCF solo al aprobar | **Se cumple.** El procesador `transferencia` devuelve siempre `pendiente`. `confirmarPago` emite después del envoltorio de la bitácora, nunca dentro del SAVEPOINT, así que un NCF no puede quedar consumido por una aprobación que se deshace. Repetir el marcado devuelve la misma factura. |
| Sin teléfono publicado | **Se cumple.** Ninguna línea añadida tiene un número, `tel:` ni WhatsApp. Los correos nuevos remiten a `facturacion@` y el arnés lo comprueba. |
| Nada automático al contador | **Se cumple.** Los dos avisos internos van al buzón propio `facturacion@`. El comentario de `avisarTransferenciaPedida` lo dice. |
| Cero dependencias | **Se cumple.** `package.json` solo añade el script `transferencia:probar`. |
| Migraciones solo al final | **Se cumple.** No hay migraciones nuevas. `aprobarPago` pasa de BEGIN a SAVEPOINT, que es código y no esquema; un SAVEPOINT suelto se comporta como BEGIN. |
| IP fiable detrás de Cloudflare | **Se cumple.** La bitácora usa la IP de `ctx.enNombreDe` (fase 4, `CF-Connecting-IP`). El arnés lo comprueba en §25 y §32. |
| `!!ctx` en rutas públicas | **No aplica.** `listarPlanes` no usa `ctx`; las demás rutas nuevas van con `conSesion` o con `conAdmin`. |
| `api()` lanza: envoltorio propio | **Se cumple.** `marcarRecibido`, `anularPago`, `contratar` y `ampliar` tienen `try/catch`. El `e.codigo` (409) viene de `sesion.js`. |

## Seguridad

- **Procesador elegido por el servidor.** `procesadorDeCobro` valida
  contra la lista del servidor y solo acepta cadenas; «constructor» y
  similares dan 400. Con la transferencia encendida, `demo` (que aprueba
  siempre) sale del alcance del comprador. Un método no disponible da 400
  antes de anotar el pago.
- **Datos bancarios.** Solo se leen de `process.env` y nunca tienen un
  valor por defecto. El aviso de arranque da nombres de variable, nunca
  valores. `/api/planes`, que es pública, solo dice los métodos. La cuenta
  sale únicamente en respuestas con sesión y a quien tiene un pendiente
  por transferencia.
- **Consola.** Las tres rutas `/api/admin/pagos*` van con `conAdmin` o
  `conAdminEnNombreDe` y responden 404 sin permiso (lo comprueban
  `auditar-permisos` y el arnés §30). Las comprobaciones previas van
  fuera de la bitácora, así que un 404 o un 409 no dejan fila. La carrera
  de D-07 da 409 y deshace todo.
- **XSS.** En `planes.js`, `panel.js`, `admin.js` y los correos, todo lo que
  llega del servidor pasa por `esc()`. El `mailto:` se arma con
  `encodeURIComponent`. `destinoPropio()` impide un `destino=javascript:`.
  05-04 lo comprobó con un nombre de empresa que llevaba `<img onerror>`.
- **Doble clic.** Los botones de confirmar se deshabilitan mientras dura la
  petición. En el servidor, `aprobarPago` usa una actualización
  condicionada (`changes !== 1` → 409).

## Hallazgos

### B-01 (bajo, corregido): «RD4,130» sin el signo de pesos
`assets/admin.js`, en la tabla de recibos pendientes de regularizar de
Facturas: `RD${…}` interpolaba sin el `$` literal. Es anterior a la fase y
estaba anotado en 05-04. Cambio de una línea. **Commit da6f511.**

### B-02 (bajo, corregido): el título «Pagos en espera» pegado al párrafo
`assets/panel.js` pinta `<section class="pagos-espera">`, pero esa clase no
tenía regla en `styles.css`. En las capturas de la verificación el título
salía pegado al texto de encima. Se añade `.pagos-espera { margin: 18px 0; }`.
**Commit e388d88.**

### B-03 (bajo, corregido): comentario de `sinEsperar` encima de otra función
`tools/api.js`: el comentario que explica por qué `sinEsperar` cubre promesa
y excepción síncrona quedó encima de `intencionDePago`, con otro comentario
debajo. Se movió junto a su función. **Commit 3495dd6.**

### B-04 (bajo, corregido): comentario de ampliar separado de su código
`assets/panel.js`: el manejador de «Copiar» se insertó entre el comentario
de «Añadir cupos a una membresía viva» y el manejador que ese comentario
describe. Se reordenó. **Commit 3495dd6.**

## Observaciones sin cambio

- `intencionDePago` (api.js) e `intencionDe` (db.js) hacen casi lo mismo.
  Se dejan así: db.js no exporta la suya y juntarlas no arregla nada.
- La marca de tiempo de `pagosPendientesDe` y `pagosParaConsola` usa
  `rowid` para desempatar. Es correcto, porque `creado` puede repetirse
  dentro del mismo milisegundo.
- `planes.js` manda `metodo: 'transferencia'` también en un pedido de
  RD$0. El servidor lo ignora (el importe cero no pasa por
  `procesadorDeCobro`) y el arnés §19 lo cubre.
- Fuera de la fase, sin tocar: el desborde del panel a 390 px con un
  anuncio publicado (`.tabla-envoltura` sin `position: relative`) queda
  como tarea aparte.

## Verificación tras las correcciones

`node --check` de los tres JS y `check:encoding` limpios. Los diffs son de
12 líneas añadidas y 9 quitadas, sin cambios de fin de línea. La batería
completa se repitió después (ver 05-05-SUMMARY y STATE).
