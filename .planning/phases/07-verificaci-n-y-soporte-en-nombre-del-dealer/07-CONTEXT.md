# Phase 7: Verificación y soporte en nombre del dealer - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning
**Source:** Decisiones autónomas del orquestador (sin discusión con Victor, por encargo:
"decide tú lo técnico y reversible según CLAUDE.md"). Lo que solo Victor puede dar va
anotado como pendiente al final.

<domain>
## Phase Boundary

El personal hace desde la consola (`admin.html`) tres cosas que hoy exigen terminal o son
imposibles:

1. Conceder y retirar el sello de **verificada** a cualquier empresa dealer aprobada, sin
   depender de que esté en la cola de solicitudes (ADMIN-02).
2. Ver el **número de serie** de cada anuncio que lo declaró, dejar constancia del resultado
   de la revisión y que ese resultado se vea en el panel del vendedor y, cuando cuadra, en la
   ficha pública (ADMIN-03). El texto de `publicar.html:149` pasa a describir exactamente esa
   diligencia (CONF-01).
3. Abrir el editor de la página de un dealer **en su nombre** y editarla, respetando su
   borrador/publicada y las seis reglas visibles (ADMIN-04).

Todas las escrituras pasan por `db.enNombreDe` (bitácora de la fase 4, ADMIN-05).

Fuera: publicar o despublicar la página de un dealer en su nombre; consultar registros
externos de robo (no existe uno dominicano); avisos por correo al dealer.
</domain>

<decisions>
## Implementation Decisions

### Sello de verificada (ADMIN-02)
- **D-01:** Nueva sección «Empresas» en la consola, alimentada por `GET /api/admin/organizaciones`
  (solo dealers; búsqueda por nombre; filtro por estado de revisión). Cada fila: nombre, estado
  de revisión, sello, estado de la página, anuncios activos y series pendientes. Así el sello
  deja de depender de encontrar la empresa en la pestaña «Aprobadas» de la cola.
- **D-02:** El sello solo se **concede** a dealers con `estado_revision = 'aprobada'` (409 si no).
  Retirarlo se permite siempre. Una cuenta particular no recibe el sello: el texto de la ficha
  dice que se cotejó «la existencia registral del negocio».
- **D-03:** **Retirar el sello exige motivo** (400 sin él). Concederlo lo admite opcional. El
  motivo viaja a la bitácora; es lo que contesta un reclamo «¿por qué me lo quitaron?». El botón
  de la cola de «Aprobadas» usa la misma regla.

### Número de serie (ADMIN-03, CONF-01)
- **D-04:** Migración nueva al final de `MIGRACIONES` (`2026-09-serie-revision`) con cuatro
  columnas en `anuncios`: `serie_revision` ('conforme' | 'observada'; NULL = pendiente),
  `serie_revisada` (fecha), `serie_revisada_por` (nombre copiado del admin), `serie_nota`.
- **D-05:** La diligencia real, y la única que se promete: (a) el número coincide con la placa
  que se vea en las fotos del anuncio, (b) no se repite en otro anuncio del sitio (la consola lo
  detecta sola, normalizando mayúsculas, espacios y guiones), (c) tiene una forma plausible. No
  se consultan registros de robo: no hay uno dominicano.
- **D-06:** Resultado por `POST /api/admin/anuncios/:id/serie` con `{ resultado, nota }`:
  `conforme`, `observada` (nota obligatoria: es lo que lee el vendedor) o `pendiente` (deshacer).
  Pasa por `conAdminEnNombreDe('anuncio.serie')` sobre la organización dueña del anuncio. La
  bitácora guarda resultado y nota, **no** el número de serie.
- **D-07:** Visible donde corresponde: el **vendedor** ve en su panel «pendiente de revisión»,
  «cotejado» o «con observaciones: <nota>»; la **ficha pública** enseña solo un booleano
  `serie_cotejada` con el texto de límites («no es un certificado de propiedad ni de ausencia de
  robo»). El número de serie y la nota nunca salen hacia quien no es dueño.
- **D-08 (defecto encontrado en la investigación):** `GET /api/anuncios/:id` devolvía `serie` a
  cualquier visitante (`SELECT a.*` y `PRIVADOS_DEL_ANUNCIO` sin `serie`). Se corrige en esta
  fase: con la promesa «solo visible para el equipo de verificación» era falsa.
- **D-09:** `publicar.html` dice exactamente lo de D-05 y D-07: se ve solo el personal, se coteja
  con la placa de las fotos y contra otros anuncios, y si cuadra la ficha lo indica. Sin prometer
  nada más.

### Edición en nombre del dealer (ADMIN-04)
- **D-10:** Se reutiliza el editor existente: `mi-pagina.html?org=<id>` en **modo soporte**. El
  JS cambia la base de las llamadas de `/mi-pagina` a `/admin/organizaciones/<id>/pagina`. Un solo
  editor, las mismas seis reglas, la misma validación.
- **D-11:** En el servidor, los manejadores de `mi-pagina` se parten en un núcleo que recibe la
  organización y dos envoltorios: `conPagina` (el dueño, como hoy) y `conAdminEnNombreDe('pagina.editar')`
  (el personal, bajo `/api/admin/organizaciones/:id/pagina…`). Cada escritura del personal va en
  `ctx.enNombreDe` con `antes`/`despues` del trozo que cambió.
- **D-12:** El personal **no publica ni despublica** en nombre del dealer: esas rutas no existen
  bajo `/api/admin/`. Editar una página publicada se ve al momento (como cuando la edita el dealer);
  una en borrador sigue en borrador. Es lo que significa «su estado borrador/publicada respetado».
- **D-13:** `ordenarSecciones` y `guardarEnlaces` pasan de `BEGIN` a `SAVEPOINT`: dentro de
  `enNombreDe` un `BEGIN` anidado lanza.
- **D-14:** El dealer ve en su editor «El equipo de MercaMaquinarias editó su página el <fecha>»
  (última fila `pagina.editar` de su organización), sin nombre ni correo del empleado.
- **D-15:** En modo soporte, un campo «Motivo (opcional)» en la cabecera acompaña cada escritura a
  la bitácora (`motivo` en el cuerpo).
- **D-16:** Logotipo: se sube con el reductor que conserva el alfa (`reducir(…, true)`), igual que
  el dealer; los reductores del resto pintan fondo blanco y exportan JPEG.

### Bitácora
- **D-17:** `ACCIONES_BITACORA` gana `anuncio.serie` y `pagina.editar` en el mismo cambio que las usa.
  La guarda de `tools/probar-bitacora.js` cubre las rutas nuevas porque cuelgan de `/api/admin/`.

### Pruebas
- **D-18:** Sin scripts nuevos ni cambios en `.github/workflows/`: las comprobaciones se añaden a
  `probar-bitacora.js` (sello, directorio, serie), `probar-pagina-dealer.js` (edición en nombre) y
  `probar-seguridad.js` (la serie no sale por la ficha). Así las fases paralelas no chocan en el flujo.

### Claude's Discretion
- Maquetación de las secciones nuevas con las clases existentes (`panel`, `solicitudes`, `sol`,
  `revision__filtros`, `tabla-legales`); sin colores literales ni `style=`.
- Nombres de funciones internas y orden de columnas en el listado.
</decisions>

<canonical_refs>
## Canonical References

- `CLAUDE.md` — reglas del repositorio (migraciones al final, cero dependencias, CRLF, `!!ctx`).
- `.planning/ROADMAP.md` § Phase 7 — criterios de éxito.
- `.planning/REQUIREMENTS.md` — ADMIN-02, ADMIN-03, ADMIN-04, CONF-01, ADMIN-05.
- `.planning/research/mercado.md` § 4 — el número de serie como promesa incumplida.
- `.planning/phases/04-*/04-01-SUMMARY.md`, `04-02-SUMMARY.md` — `enNombreDe`, `conAdminEnNombreDe`,
  `ESCRITURAS_ADMIN_PROPIAS` y la guarda sobre `RUTAS`.
- `tools/api.js` (`conAdminEnNombreDe`, `reglasDePagina`, `conPagina`, `verAnuncio`, `RUTAS`),
  `tools/db.js` (`enNombreDe`, `ACCIONES_BITACORA`, `MIGRACIONES`, página del dealer),
  `assets/admin.js`, `admin.html`, `assets/mi-pagina.js`, `mi-pagina.html`, `assets/panel.js`,
  `assets/app.js` (ficha), `publicar.html:148-149`.
</canonical_refs>

<specifics>
## Specific Ideas

- Texto de la ficha cuando la serie está cotejada: «Número de serie cotejado. El personal de
  MercaMaquinarias comprobó que el número declarado coincide con la placa de las fotos y no se
  repite en otro anuncio. No es un certificado de propiedad ni de ausencia de robo.»
- La consola marca «Repetido en N anuncios» cuando la serie normalizada aparece en otro anuncio.
</specifics>

<deferred>
## Deferred Ideas / pendientes de Victor

- ¿Avisar al vendedor por correo cuando su serie queda «con observaciones»? Hoy lo ve en el panel.
- ¿Avisar al dealer por correo cuando el personal edita su página? Hoy lo ve en su editor.
- ¿Debe el personal poder publicar o despublicar una página en nombre del dealer (p. ej. retirar
  contenido indebido)? Hoy no, a propósito (D-12).
- Verificación visual de las secciones nuevas en claro y oscuro (punto de control humano).
</deferred>

---

*Phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer*
*Context gathered: 2026-09-25, decisiones autónomas*
