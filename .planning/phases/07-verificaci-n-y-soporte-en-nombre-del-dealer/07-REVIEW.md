---
phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer
reviewed: 2026-09-25
depth: standard
scope: "git diff a9184fa..HEAD -- . ':!.planning' (13 archivos, +1324 −132)"
status: clean-after-fixes
findings: { critical: 0, high: 0, medium: 0, low: 2, info: 4 }
fixed: 2
---

# Phase 7 — Code Review

Alcance: lo que cambió la fase fuera de `.planning/`: `admin.html`, `assets/admin.js`, `assets/app.js`,
`assets/mi-pagina.js`, `assets/panel.js`, `mi-pagina.html`, `publicar.html`, `tools/api.js`,
`tools/db.js`, `tools/auditar-permisos.js` y las tres pruebas.

## Focos pedidos

### Acceso de un no-admin a `/api/admin/organizaciones/:id/pagina…` y a `?org=`
**Sin hallazgos.** La lectura va con `conAdmin` y las ocho escrituras con `conAdminEnNombreDe`.
Las dos responden 404 a quien no es administrador, sin revelar que la ruta existe. `?org=` en
`mi-pagina.js` solo cambia la ruta base (`encodeURIComponent`): la decisión la toma el servidor,
y un 404 o un 401 terminan en «Página no encontrada». Cubierto por `dealer:probar` (usuario normal,
otro dealer, sin sesión, cuenta particular, empresa inexistente, siempre sin fila) y por
`auditar-permisos` en vivo.

### Fugas del número de serie
**Una fuga ya existía antes de la fase y se cerró durante ella (07-02).** `GET /api/anuncios/:id` hacía
`SELECT a.*` y `PRIVADOS_DEL_ANUNCIO` no incluía `serie`. Recorrido del resto:
- Catálogo, directorio y página del dealer (`anunciosPublicos`, `buscarAnuncios`, `verDealer`):
  seleccionan columnas concretas, sin `serie`.
- Metadatos y JSON-LD (`tools/meta.js`): no la usan.
- Asistente (`tools/chat.js`): no la lee.
- Respuestas al dueño (`publicar`, `cambiarPlanDeAnuncio`, `editarTrenMotriz`, `/api/mis-anuncios`):
  solo las recibe quien es de la organización.
- Rutas que la muestran: solo las de `/api/admin/series`.
- La bitácora guarda el resultado y la nota, nunca la serie (comprobado en `bitacora:probar`).

Ver L-01.

### Toda escritura en nombre de otro, dentro de la bitácora
**Sin hallazgos.** Las diez escrituras nuevas de la fase bajo `/api/admin/` pasan por
`conAdminEnNombreDe`: el sello, la serie y ocho escrituras de la página. No hay escrituras en nombre
de otro fuera de `/api/admin/`. La guarda de `probar-bitacora.js` las clasifica. Las validaciones que
fallan se lanzan DENTRO del callback de `enNombreDe`, así que no dejan fila. `ordenarSecciones` y
`guardarEnlaces` pasaron a `SAVEPOINT`, y una mutación con `BEGIN` hace fallar `dealer:probar`.

### Reglas de CLAUDE.md
**Sin hallazgos.**
- La migración va al final de `MIGRACIONES` y no se reescribe ninguna anterior.
- Cero dependencias nuevas.
- Ningún teléfono de soporte publicado y ningún envío al contador.
- Planes y precios sin tocar; nada fiscal tocado.
- Las rutas específicas van antes que las genéricas (`/secciones/orden`).
- `!!ctx` en la ruta pública.
- El logotipo del modo soporte se sigue reduciendo con alfa (`subir(archivo, 600, true)`).
- Comentarios en el estilo del proyecto y todo en español.
- LF en el índice, igual que `origin/main`.

## Hallazgos

### L-01 (baja, corregido en c8fa375): la ficha le daba al dueño el nombre del empleado que revisó su serie
`verAnuncio` solo borraba `serie_revisada_por` para quien no es dueño, así que el vendedor recibía
en el JSON el nombre del empleado. Eso contradice el criterio de D-14: el dealer sabe que el personal
actuó, pero quién fue está en la bitácora. Ahora se borra siempre en esa ruta; el panel no lo usaba.
Prueba nueva en `seguridad:probar`.

### L-02 (baja, corregido en c8fa375): una «serie» hecha solo de separadores salía como placa repetida
`normalizarSerie('--')` es `''`, y todos los anuncios con una serie así contaban como repetidos entre
sí: la consola los señalaba como la misma placa. Ahora una serie que normaliza a vacío no cuenta.
Prueba nueva en `bitacora:probar`.

### I-01 (info): la API deja al personal editar la página de un dealer con el alta pendiente o rechazada
La consola solo enlaza «Editar su página» para las aprobadas, pero la ruta acepta cualquier dealer.
No se ve fuera, porque la página pública exige el alta aprobada. Se deja así a propósito: soporte
puede ayudar a una empresa a preparar su página antes de aprobarla.

### I-02 (info): `revisarSerie` acepta un anuncio en borrador
La lista no los enseña, así que solo llega quien conozca el id. La escritura va igual a la bitácora.
Sin efecto práctico.

### I-03 (info): `tools/admin.js` (línea de comandos) sigue escribiendo el sello sin bitácora
Existía antes de la fase y está fuera de su alcance: la bitácora cubre lo que se hace desde el sitio.
Si se quiere que también la terminal deje rastro, va en la deuda técnica (fase 13).

### I-04 (info): una fila de bitácora por cada campo guardado en modo soporte
El editor guarda al salir de cada campo, así que arreglar cinco campos son cinco filas. Es lo
correcto para un reclamo, porque cada cambio lleva su antes y su después. Si molesta al leerla, se
puede agrupar en la consola más adelante.

## Resultado

Sin hallazgos críticos, altos ni medios. Los dos bajos están corregidos con prueba en el commit
c8fa375. Todas las suites y auditorías en verde (ver `07-VERIFICATION.md`).
