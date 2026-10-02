# Tanda 5 — contrato de la base (paso 2)

Rama `claude/tanda-5-base`. Parche para Codex: `.planning/parches/tanda5-base.patch`
(`git am --keep-cr -3`). Lo que aquí se fija lo prueban `npm run documentos:probar` (en CI) y
`npm run testigos:probar` (en rojo hasta que se haga lo mecánico de #72; entonces entra en CI).

## FICHA-01 · Documentos adjuntos a un anuncio

**Tabla** `documentos_anuncio` (migración `2026-10-documentos-anuncio`): `id`, `anuncio_id`
(CASCADE), `nombre` (1-120), `tipo` (`application/pdf`, `image/jpeg`, `image/png`, `image/webp`),
`bytes`, `ruta` (única, relativa, sin `..`, sin `/` inicial ni `\`), `subido_por`, `creado`.

**Topes** (`db.TOPES_DOCUMENTOS`, congelado): 4 MB por archivo, 4 documentos y 10 MB por anuncio,
100 MB en total (`MERCA_DOCUMENTOS_TOPE_MB` lo cambia). El disco del droplet es de 512 MB y lo
comparten fotos, base, PDF de facturas y respaldos.

**Funciones de `tools/db.js`:**

| Función | Devuelve |
|---|---|
| `motivoSinDocumento({ idAnuncio, idOrg, tipo, bytes })` | `null` o `'no-existe' \| 'tipo' \| 'vacio' \| 'tope-archivo' \| 'tope-cantidad' \| 'tope-anuncio' \| 'tope-total'` |
| `agregarDocumento({ idAnuncio, idOrg, idUsuario, nombre, tipo, bytes, ruta })` | `{ documento }` o `{ error }` (mismos códigos); lanza si la ruta es peligrosa o repetida |
| `documentosDe(idAnuncio, idOrg = null)` | lista pública `{ id, nombre, tipo, bytes, creado }`, o `null` si no existe o es un borrador ajeno |
| `documentoParaDescargar(idAnuncio, idDocumento, idOrg = null)` | `{ id, nombre, tipo, bytes, ruta }` o `null` (mismo criterio) |
| `borrarDocumento(idAnuncio, idDocumento, idOrg)` | la `ruta` para borrar el archivo, o `null` |
| `espacioDocumentos()` | `{ documentos, bytes, tope }` |

`borrarAnuncio` y `eliminarCuenta` devuelven además `documentos: [rutas]`; quien llama borra esos
archivos (como ya hace con `fotos` y `videos`). Duplicar un anuncio **no** copia sus documentos.

Visibilidad: la de `verAnuncio` en `tools/api.js`. Un borrador solo lo ve su dueño; cualquier otro
estado (activo, pausado, vendido…) lo ve cualquiera, también sin sesión.

**Almacenamiento (lo escribe Codex, `tools/documentos.js`, a imagen de `tools/fotos.js`):**
carpeta `process.env.MERCA_DOCUMENTOS || .tmp/documentos`; subcarpeta por mes `AAAA-MM/`;
nombre `crypto.randomUUID()` + extensión (`pdf`, `jpg`, `png`, `webp`) que genera el servidor,
nunca el de quien sube. El tipo se deduce de los primeros bytes (`%PDF-`; firmas de JPEG, PNG y
WebP `RIFF....WEBP`), nunca del `Content-Type` ni de la extensión. Exporta
`guardar(buffer) → { ruta, tipo, bytes }` (lanza si el tipo no es admitido), `tipoDe(buffer)`,
`archivoDe(ruta) → ruta absoluta o null` (rechaza lo que salga de la carpeta) y `borrar(ruta)`.
`/var/lib/mercamaquinarias/documentos` en producción (lo fija Victor en el `.env`, ver
`deploy/README.md`).

**Rutas de la API previstas** (array de `tools/api.js`, las específicas antes que
`/api/anuncios/([\w-]+)$`):

- `POST /api/anuncios/:id/documentos` — sesión; cuerpo JSON `{ nombre, archivo }` con `archivo`
  como data URL (como las fotos; el límite de 25 MB del cuerpo cubre 4 MB en base64). Orden:
  `motivoSinDocumento` con el tipo deducido de los bytes → `documentos.guardar` →
  `agregarDocumento` (si devuelve error, borrar el archivo). Límite de ritmo con
  `db.permitir('documentos:<usuario>', 20, 60)`. Respuestas: 201 `{ documento }`; 404 `no-existe`;
  415 `tipo`; 400 `vacio`; 413 `tope-archivo`; 409 `tope-cantidad`/`tope-anuncio`; 507 `tope-total`.
- `GET /api/anuncios/:id/documentos` — sin sesión obligatoria (`!!ctx` antes de
  `ctx.organizacion`); 200 `{ documentos, topes }` o 404.
- `GET /api/anuncios/:id/documentos/:doc` — el archivo, con `Content-Type` de la fila,
  `X-Content-Type-Options: nosniff`, `Content-Disposition: inline; filename*=UTF-8''<nombre>`,
  `Cache-Control: private, max-age=300`; 404 si `documentoParaDescargar` da `null` o falta el
  archivo.
- `DELETE /api/anuncios/:id/documentos/:doc` — dueño; 200 `{ ok: true }` o 404; borra el archivo.

## #72 · Testigos como HMAC

Migración `2026-10-testigos-hmac`: vacía `sesiones` y `dispositivos` (las filas viejas tienen el
testigo en claro y SQLite no sabe hacer HMAC): todos vuelven a entrar una vez.

`db.huellaTestigo(clase, testigo)` = HMAC-SHA256 con `MERCA_SECRETO` de
`testigo-<clase>|<testigo>`, clase `'sesion'` o `'dispositivo'` (otra lanza). Lo mecánico
(Codex): que `abrirSesion`, `sesion`, `cerrarSesion`, `cerrarOtrasDe`, `recordarDispositivo` y
`dispositivoDeConfianza` guarden y busquen por la huella sin cambiar sus firmas ni lo que
devuelven (la cookie sigue llevando el testigo en claro). `tools/api.js` no se toca.

## #73 · Respaldo antes de migrar

`deploy/desplegar-mercamaquinarias`: antes de reiniciar, si `tools/db.js` trae migraciones que la
base de producción no tiene anotadas, `VACUUM INTO` + `PRAGMA integrity_check` a
`/var/backups/mercamaquinarias/antes-<migración>-<fecha>.db`; si el respaldo falla, el despliegue
se para sin reiniciar. Las migraciones pendientes las lista `node tools/migraciones-pendientes.js`.
