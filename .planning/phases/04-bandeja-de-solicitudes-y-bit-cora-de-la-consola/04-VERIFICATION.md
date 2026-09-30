---
phase: 04-bandeja-de-solicitudes-y-bit-cora-de-la-consola
verified: 2026-09-30
status: human_needed
score: 4/4 criterios de éxito
requirements: [ADMIN-01, ADMIN-05]
head_verificado: c28a8b3
re_verification: false
deferred:
  - truth: "Toda escritura hecha en nombre de otra organización queda anotada (incluida la línea de comandos del servidor)"
    addressed_in: "Phase 13"
    evidence: "STATE.md: «`tools/admin.js` (terminal) cambia el sello sin pasar por la bitácora: a la fase de deuda técnica». Excluido a propósito en 04-01-PLAN (D-01): exige acceso al servidor, otra amenaza distinta del robo de una cuenta del sitio."
human_verification:
  - test: "Abrir admin.html con sesión de administrador en tema claro y oscuro (escritorio y móvil) y revisar «Solicitudes de servicio» y «Bitácora de administración»"
    expected: "Textos, pastillas («servicio apagado»), filtros y tabla legibles en los dos temas; el botón de la cola no queda tapado por la cabecera fija al desplazarse"
    why_human: "El comprobador de contraste no entra detrás de la sesión; es el punto de control de la tarea 3 de 04-04, que sigue en la lista de Victor (STATE.md, «Revisión visual en claro y oscuro de las fases 2, 4, …»)"
  - test: "Orquestador: correr `auditar-permisos` contra el servidor sembrado"
    expected: "0 fallos; /admin/bitacora y /admin/solicitudes-servicio (GET y PATCH) responden 404 a una cuenta normal"
    why_human: "Auditoría de navegador/servidor en el puerto 8080; esta verificación no arranca servidores"
---

# Fase 4 · Verificación retroactiva: bandeja de solicitudes y bitácora de la consola

**Objetivo (ROADMAP):** que el personal pueda atender desde el sitio las solicitudes que
hoy se capturan y nadie ve, y que quede cimentado el registro de toda escritura hecha en
nombre de otra organización.

**Veredicto: PENDIENTE DE REVISIÓN HUMANA (human_needed), 4/4.** Los cuatro criterios se
cumplen en el código **actual** (`c28a8b3`, con las fases 5 a 10 ya construidas encima),
y los demuestra `bitacora:probar` (120/0), que corre en el job `pruebas` del CI. Las
fases posteriores no rompieron nada: al contrario, sus escrituras en nombre de otro
(transferencias, número de serie, página del dealer) entraron por la misma puerta y la
guarda sobre `RUTAS` las clasifica todas. Queda pendiente solo lo que no se automatiza:
la revisión visual en los dos temas (punto de control de 04-04, nunca cerrado) y la
auditoría de permisos contra un servidor, que corre el orquestador.

La verificación se hizo leyendo el código y corriendo las pruebas, no sobre lo que dicen
los SUMMARY.

## Criterios de éxito

| # | Criterio | Estado | Evidencia |
|---|----------|--------|-----------|
| 1 | El personal ve en el sitio las solicitudes de alquiler, importación y contacto con su estado, y las marca atendidas sin terminal | ✓ | `admin.html:152-169` sección «Solicitudes de servicio» con filtros de estado (Nuevas por defecto) y de servicio, `#listaBandeja`. `assets/admin.js:355` `bandejaHTML` pinta referencia, fecha, contacto del solicitante, detalle, nota y estado, con botones «Marcar atendida», «Cerrar», «Reabrir», «Añadir nota». `marcarBandeja` (`admin.js:439`) hace `PATCH /admin/solicitudes-servicio/:id`; `montarBandeja()` se llama desde `montarAdmin` (`admin.js:1628`). Servidor: `listarSolicitudesServicio` y `marcarSolicitudServicio` (`tools/api.js:1024`, `1043`) en `RUTAS` (`api.js:4890-4891`), ambos con `conAdmin`. Los filtros de servicio salen de `servicios.activos` que manda el servidor: transporte y financiamiento apagados no aparecen como filtro, y lo histórico se sigue viendo con la pastilla «servicio apagado». |
| 2 | Una atendida sale de la bandeja pendiente y conserva quién y cuándo | ✓ | Migración `2026-09-bitacora-admin` añade `solicitudes_servicio.atendida_por` (`tools/db.js:910`). `marcarSolicitudServicio` (`db.js:1918-1925`) guarda `atendida` y `atendida_por`, y los borra al volver a `nueva`; devuelve `false` con un id inexistente → 404. `solicitudesServicio` une con `usuarios` para `atendida_por_nombre` (`db.js:1902`), y la tarjeta enseña «Atendida el … por …». `bitacora:probar` «Solicitudes de servicio»: marcada devuelve quién, ya no sale entre las nuevas, sí entre las atendidas; id inexistente 404; usuario normal 404. |
| 3 | Toda escritura en nombre de otra organización queda anotada con quién, cuándo y sobre qué organización | ✓ | Tabla `bitacora_admin` (`db.js:882-911`) con dos disparadores `RAISE(ABORT)` contra UPDATE y DELETE. `db.enNombreDe` (`db.js:2336`) es el único `INSERT INTO bitacora_admin` del repositorio (la prueba lo cuenta); la escritura va como callback dentro del mismo `SAVEPOINT`, con catálogo cerrado `ACCIONES_BITACORA` (`db.js:2308`, hoy 6 acciones). `conAdminEnNombreDe` (`api.js:246`) fija administrador, acción e IP (`CF-Connecting-IP` vía `origen`), sin que el manejador pueda falsearlos. Pasan por ella: sello (`api.js:1897`), alta de dealer (`1748`), transferencias recibida/anulada (`1575`, `1673`), número de serie (`1952`) y las ocho rutas de la página del dealer (`2410`). La guarda sobre `RUTAS` en `tools/probar-bitacora.js` clasifica **las 25 escrituras de `/api/admin/`**, cada una una sola vez (bitácora o `ESCRITURAS_ADMIN_PROPIAS`, `api.js:4758`). Ninguna ruta fuera de `/api/admin/` deja escribir a un administrador sobre lo ajeno (`esAdmin` solo aparece en lecturas de comprobantes, `api.js:1340`, `1367`). |
| 4 | La bitácora se consulta desde la consola filtrando por organización | ✓ | `GET /api/admin/bitacora` (`api.js:1985`, ruta `4826`) con `conAdmin`, `?organizacion=` y `organizaciones` con su número de entradas; ninguna otra ruta la toca (la prueba confirma que ningún POST/PATCH/PUT/DELETE responde 2xx). `admin.html:359-386` sección «Bitácora de administración» con selector de organización y tabla Cuándo / Quién (nombre y correo) / Organización / Acción / Cambio (antes → después) / Motivo e IP, sin ningún control de edición ni borrado. `montarBitacora` / `cargarBitacora` / `pintarBitacora` (`admin.js:2113-2151`) conectados desde `montarAdmin` (`1633`). Se refresca sin recargar tras el sello (`enviarSello`, `admin.js:274`), el alta (`resolver`, `291`), la serie (`753`) y los pagos (`refrescarTrasPago`, `1033`). |

## Requisitos

| Requisito | Criterios | Estado |
|-----------|-----------|--------|
| ADMIN-01 · pantalla para las solicitudes de servicio | 1, 2 | ✓ Cumplido |
| ADMIN-05 · toda escritura en nombre de otro queda registrada | 3, 4 | ✓ Cumplido en el sitio; la línea de comandos queda diferida (ver abajo) |

`REQUIREMENTS.md` (líneas 170 y 174) todavía marca los dos como «Pendiente» y la casilla
de la fase 4 en `ROADMAP.md:40` sigue sin marcar: es papeleo, no código.

## Artefactos y conexiones

| Artefacto | Existe | Tiene contenido real | Está conectado |
|-----------|--------|----------------------|----------------|
| `tools/db.js` · migración `2026-09-bitacora-admin`, disparadores, `enNombreDe`, `bitacora`, `organizacionesEnBitacora`, `ACCIONES_BITACORA`, `atendida_por` | ✓ | ✓ | ✓ exportados (`db.js:5819`) y usados por `api.js` |
| `tools/db.js` · `resolverSolicitud` con `SAVEPOINT resolver_solicitud` | ✓ | ✓ | ✓ anidable dentro de `enNombreDe`; también `aprobarPago`, `ordenarSecciones`, `guardarEnlaces` siguieron el patrón |
| `tools/api.js` · `conAdminEnNombreDe`, `ESCRITURAS_ADMIN_PROPIAS`, `listarBitacora`, `RUTAS` exportado | ✓ | ✓ | ✓ en `RUTAS`; `module.exports` incluye `RUTAS` y `ESCRITURAS_ADMIN_PROPIAS` |
| `admin.html` + `assets/admin.js` · bandeja | ✓ | ✓ | ✓ `montarBandeja()` desde `montarAdmin()`; GET y PATCH reales |
| `admin.html` + `assets/admin.js` · bitácora | ✓ | ✓ | ✓ `montarBitacora()` desde `montarAdmin()`; datos de la API, nada inventado |
| `tools/probar-bitacora.js` + `bitacora:probar` en `package.json:42` y en el CI | ✓ | ✓ 120 comprobaciones | ✓ paso «Bitacora» del job `pruebas` (`.github/workflows/desplegar.yml:85-86`) |
| `tools/auditar-permisos.js` · `/admin/bitacora` y `/admin/solicitudes-servicio` | ✓ | ✓ | corre en el job `navegador`; no se corrió aquí (ver pendientes) |

## Pruebas corridas en esta verificación

Herméticas, todas en verde, sobre `c28a8b3` con Node 22.22:

- `bitacora:probar` **120 bien, 0 mal** (eran 72 al cerrar la fase: las fases 5 y 7
  añadieron sus bloques). La guarda: «las 25 escrituras de /api/admin/ están
  clasificadas una sola vez».
- `seguridad:probar` 101/0, `dealer:probar` 82/0, `transferencia:probar` 213/0.
- `node --check assets/admin.js` y `check:encoding` sin incidencias.

No corridas (necesitan servidor o navegador; las corre el orquestador): `auditar-permisos`,
`auditar-flujos`, `check-contraste`.

## Anti-patrones

Ninguno bloqueante. Sin `TBD`/`FIXME`/`XXX` en `admin.html`, `assets/admin.js` ni
`tools/probar-bitacora.js`. Sin enlace `tel:` ni teléfono de la empresa en la consola: el
único teléfono es el que dejó el visitante, en una pantalla solo del personal.

| Archivo | Línea | Hallazgo | Severidad |
|---------|-------|----------|-----------|
| `tools/db.js` | 2407-2412 | El comentario «Alimenta el filtro de la consola…» de `organizacionesEnBitacora` quedó encima de `ultimaAnotacion` (fase 7 insertó esta función en medio). Cosmético | Info |
| `tools/api.js` | 4768-4771 | `anularFactura` sigue en `ESCRITURAS_ADMIN_PROPIAS` con la pregunta D-01 abierta para Victor (¿la nota de crédito va por la bitácora?). Decisión documentada, no un olvido | Info |

## Diferido

| Hueco | Dónde va | Evidencia |
|-------|----------|-----------|
| `tools/admin.js` (terminal del servidor) escribe sobre organizaciones sin bitácora: `rnc` (`admin.js:219`), `eximir`/`cobrar` (`admin.js:226`) y `crear --empresa` que aprueba y verifica (`admin.js:155`) | Fase 13, deuda técnica | Excluido a propósito en 04-01-PLAN («exige acceso al servidor, que es otra amenaza distinta del robo de una cuenta del sitio») y anotado en `STATE.md:325`. El criterio 3 se lee sobre el sitio, que es donde la guarda lo exige |

## Pendiente (no bloquea el código)

1. **Revisión visual en claro y oscuro** de la bandeja y la bitácora, con sesión, en
   escritorio y móvil. Es la tarea 3 de 04-04, que nunca se cerró; sigue en la lista de
   Victor (`STATE.md:216`).
2. **Orquestador:** `auditar-permisos` contra el sitio sembrado (404 a una cuenta normal
   en `/admin/bitacora` y `/admin/solicitudes-servicio`). `bitacora:probar` ya lo cubre en
   el arnés, así que un fallo aquí sería inesperado.
3. **Papeleo:** marcar la fase 4 en `ROADMAP.md` y ADMIN-01/ADMIN-05 en `REQUIREMENTS.md`
   cuando se cierre lo anterior.

---

_Verificado: 2026-09-30_
_Verificador: Claude (gsd-verifier)_
