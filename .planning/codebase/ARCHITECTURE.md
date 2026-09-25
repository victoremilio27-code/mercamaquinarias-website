<!-- refreshed: 2026-09-25 -->
# Architecture

**Analysis Date:** 2026-09-25

## System Overview

```text
┌─────────────────────────────────────────────────────────────────────┐
│                     NAVEGADOR (sin build, sin framework)             │
├───────────────────┬───────────────────────┬─────────────────────────┤
│  Páginas .html     │  Módulos compartidos  │  Módulos por página     │
│  `index.html`,     │  `assets/sesion.js`   │  `assets/publicar.js`   │
│  `panel.html`, ... │  `assets/taxonomia.js`│  `assets/panel.js`      │
│  (19 páginas)      │  `assets/precios.js`  │  `assets/admin.js`      │
│                    │  `assets/servicios.js`│  `assets/mi-pagina.js`  │
│                    │  `assets/app.js`      │  `assets/cuenta.js` ... │
└─────────┬──────────┴───────────┬───────────┴─────────────┬───────────┘
          │ fetch('/api/...')    │ require(...)             │
          ▼                      ▼                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    tools/serve.js  (servidor HTTP, sin deps)         │
│  Estáticos con lista blanca · cabeceras de seguridad · streaming     │
│  de video con rangos · metadatos Open Graph · conteo de visitas      │
└─────────┬───────────────────────────────────┬───────────────────────┘
          │ /api/*                            │ estáticos, /fotos, /videos
          ▼                                   ▼
┌───────────────────────────────┐   ┌─────────────────────────────────┐
│      tools/api.js              │   │  Disco: páginas .html, assets/, │
│  RUTAS = [método, regex,       │   │  brand_assets/, fotos y videos  │
│  manejador] · sesión por       │   │  subidos (fuera del proyecto en │
│  cookie · límites de tasa      │   │  producción, `.tmp/` en dev)    │
└─────────┬──────────────┬───────┘   └─────────────────────────────────┘
          │              │
          ▼              ▼
┌──────────────────┐  ┌──────────────────────────────────────────────┐
│  tools/db.js      │  │  Servicios de borde: tools/correo.js (Brevo),│
│  TODO el SQL      │  │  tools/chat.js (Anthropic), tools/facturas.js│
│  (SQLite, node:   │  │  (NCF/PDF), tools/fotos.js, tools/videos.js, │
│  sqlite). Sesiones,│  │  tools/pdf.js, tools/meta.js                │
│  anuncios, pagos,  │  └──────────────────────────────────────────────┘
│  facturas, etc.    │
└─────────┬──────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  db/mercamaquinarias.db (SQLite, WAL) · db/schema.sql (fuente)       │
└─────────────────────────────────────────────────────────────────────┘

           (fuera del ciclo de petición, disparado por systemd timers)
┌─────────────────────────────────────────────────────────────────────┐
│  tools/tareas.js — caducar anuncios, avisos, reintentos de correo,   │
│  reintentos de comprobantes, respaldo, huérfanos, informes           │
│  (llama a los mismos tools/db.js, tools/correo.js, tools/facturas.js)│
└─────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Servidor HTTP | Estáticos con lista blanca, cabeceras de seguridad, streaming de video/fotos, monta `/api`, metadatos de compartir | `tools/serve.js` |
| Router de API | Reglas de negocio y permisos; ningún SQL directo; valida entrada y da forma a la respuesta JSON | `tools/api.js` |
| Acceso a datos | Todo el SQL del proyecto; migraciones nombradas append-only; utilidades de fecha/id/hash | `tools/db.js` |
| Tareas programadas | Mantenimiento diario/semanal/mensual idempotente (caducar, avisar, respaldar, limpiar) | `tools/tareas.js` |
| Correo | Único punto de envío de correo, con transporte de archivo en dev y Brevo en producción | `tools/correo.js` |
| Comprobantes fiscales | Emisión de NCF, numeración, PDF, reenvío/anulación | `tools/facturas.js`, `tools/pdf.js`, `tools/numero-a-letras.js` |
| Asistente de soporte | Llama a la API de Anthropic por HTTPS nativo (sin SDK) | `tools/chat.js` |
| Fotos / Videos | Almacenamiento en disco, nombre aleatorio del servidor, tipo por contenido, servido con streaming/rangos | `tools/fotos.js`, `tools/videos.js` |
| Metadatos de compartir | Open Graph/Twitter Card renderizados en servidor para rastreadores que no ejecutan JS | `tools/meta.js` |
| Entorno | Carga `.env` y, en el VPS, la unidad de systemd, antes que cualquier otro módulo | `tools/entorno.js` |
| Auditorías | Scripts de verificación que no arreglan nada, solo informan (accesibilidad de rutas, permisos cruzados, flujos con Puppeteer) | `tools/auditar-publico.js`, `tools/auditar-permisos.js`, `tools/auditar-flujos.js` |
| Reglas compartidas navegador/servidor | Precios, catálogo de servicios activos, taxonomía jerárquica, versiones legales — una sola fuente para ambos lados | `assets/precios.js`, `assets/servicios.js`, `assets/taxonomia.js`, `assets/legales.js` |
| Render y comportamiento del sitio público | Iconografía SVG, catálogo, ficha de equipo, filtros | `assets/app.js` |
| Cliente de la API y estado de sesión | `api()` fetch wrapper y estado global `SESION`, cargado antes que cualquier otro script de página | `assets/sesion.js` |
| Pantallas por página | Un módulo por página con lógica exclusiva de esa pantalla | `assets/panel.js`, `assets/admin.js`, `assets/publicar.js`, `assets/cuenta.js`, `assets/perfil.js`, `assets/mi-pagina.js`, `assets/mapa.js` |

## Pattern Overview

**Overall:** Servidor monolítico de Node.js sin dependencias de producción (`node:http`, `node:sqlite`, `node:crypto`) sirviendo un frontend multi-página (MPA) de JavaScript vanilla sin build ni framework. No hay capas de ORM, sin bundler, sin transpilación.

**Key Characteristics:**
- Cero dependencias de runtime en producción (`package.json` solo declara `puppeteer` como `devDependency`, usado por scripts de auditoría/captura).
- El SQL vive en un único módulo (`tools/db.js`); `tools/api.js` nunca escribe una consulta.
- Reglas de negocio con impacto en dinero o legal (precios, catálogo de servicios activos, taxonomía, versiones legales) están en `assets/*.js` cargadas TANTO por el navegador (`<script>`) como por Node (`require`), evitando que servidor y cliente se desincronicen.
- Router plano: `tools/api.js` define un array `RUTAS` de tuplas `[método, RegExp, manejador]` recorrido en orden; no hay un framework de rutas ni middlewares encadenados — el "middleware" son funciones de orden superior (`conSesion`, `conAdmin`) que envuelven al manejador.
- Migraciones de base de datos son una lista nombrada, append-only, aplicada una vez y anotada en una tabla `migraciones`; `db/schema.sql` solo crea lo que falta con `IF NOT EXISTS`.
- El servidor de estáticos usa lista blanca de rutas servibles (no lista negra) para no exponer accidentalmente `.env`, la base de datos o el código fuente.
- Tareas de mantenimiento (`tools/tareas.js`) corren fuera del ciclo de petición HTTP, disparadas por temporizadores de systemd, y son explícitamente idempotentes.

## Layers

**Capa de transporte (servidor HTTP):**
- Purpose: Servir archivos estáticos con seguridad y cachear correctamente; delegar `/api/*` al router
- Location: `tools/serve.js`
- Contains: Manejo crudo de `http.createServer`, cabeceras de seguridad (CSP, etc.), streaming de video con rangos HTTP, ETags
- Depends on: `tools/fotos.js`, `tools/videos.js`, `tools/api.js`, `tools/meta.js`, `tools/db.js`, `assets/servicios.js`
- Used by: Es el proceso raíz (`npm start` → `node tools/serve.js`)

**Capa de API / reglas de negocio:**
- Purpose: Validar entrada, aplicar permisos y límites de tasa, dar forma a la respuesta JSON
- Location: `tools/api.js`
- Contains: Router plano `RUTAS`, envoltorios de sesión (`conSesion`, `conAdmin`), validación, límites de tasa por operación (`LIMITES`)
- Depends on: `tools/db.js`, `tools/correo.js`, `tools/chat.js`, `tools/facturas.js`, `tools/fotos.js`, `tools/videos.js`, `assets/precios.js`, `assets/servicios.js`, `assets/legales.js`
- Used by: `tools/serve.js` (montado bajo `/api`)

**Capa de acceso a datos:**
- Purpose: Todo el SQL del proyecto; si cambia el motor de base de datos, solo este archivo se reescribe
- Location: `tools/db.js` (3353 líneas, dividido en secciones con comentarios `── Nombre ──`)
- Contains: Apertura de la base (`abrir`), migraciones nombradas (`MIGRACIONES`, `migrar`), y funciones de dominio agrupadas por área (usuarios/sesiones, códigos, equipos de confianza, perfil de dealer, solicitudes de servicio, flota propia, publicidad, ajustes, catálogo público, anuncios, membresías, comprobantes, tráfico del sitio, aceptaciones legales)
- Depends on: `node:sqlite` (`DatabaseSync`), `node:crypto`, `assets/taxonomia.js`, `db/schema.sql`
- Used by: `tools/api.js`, `tools/serve.js` (visitas, sitemap), `tools/tareas.js`, `tools/admin.js`, `tools/seed.js`

**Capa de tareas programadas:**
- Purpose: Mantenimiento diario/semanal/mensual desacoplado del ciclo de petición HTTP
- Location: `tools/tareas.js`
- Contains: Diccionario `TAREAS` (caducar, perfiles, informes, avisos de vencimiento, reintentos de comprobantes, avisos NCF, limpieza, huérfanos, respaldo, optimizar) ejecutado por systemd timer
- Depends on: `tools/db.js`, `tools/correo.js`, `tools/facturas.js`
- Used by: `deploy/mercamaquinarias-tareas.timer` (systemd), invocación manual (`npm run tareas`)

**Capa de frontend (páginas + scripts compartidos):**
- Purpose: Renderizado en el navegador sin build; cada página HTML es una entrada independiente que carga sus scripts con `<script src>` en un orden fijo
- Location: `*.html` (raíz del proyecto), `assets/*.js`
- Contains: Módulos compartidos por casi toda página (`tema.js`, `sesion.js`, `taxonomia.js`, `precios.js`, `servicios.js`, `data.js`, `app.js`) más un módulo específico por pantalla (`panel.js`, `admin.js`, `publicar.js`, `cuenta.js`, `perfil.js`, `mi-pagina.js`, `mapa.js`, `chat.js`)
- Depends on: `/api/*` vía `fetch` (a través de `api()` en `sesion.js`)
- Used by: El navegador del visitante; ningún paso de build las toca

## Data Flow

### Primer render de una página pública (ej. catálogo en `index.html`)

1. El navegador pide `GET /` → `tools/serve.js` sirve `index.html` desde disco tras pasar la lista blanca `PUBLICO` (`tools/serve.js:154`)
2. Los `<script>` se ejecutan en orden: `tema.js` → `sesion.js` → `taxonomia.js` → `precios.js` → `servicios.js` → `data.js` → `app.js` → `chat.js` (`index.html:507-513`)
3. `assets/app.js` escucha `DOMContentLoaded` (`assets/app.js:2206`) e invoca `api('/anuncios?...')`, definida en `assets/sesion.js`
4. La petición llega a `tools/serve.js`, que la reenvía a `api.manejar(req, res, ruta)` porque empieza por `/api/` (`tools/serve.js:341`)
5. `tools/api.js` recorre `RUTAS`, halla el patrón que coincide, arma el `contexto(req)` (sesión, si la hay) y llama al manejador correspondiente (`tools/api.js:2603`)
6. El manejador llama a una función de `tools/db.js` (p. ej. catálogo público) que ejecuta SQL sobre `db/mercamaquinarias.db`
7. La respuesta JSON vuelve al navegador; `assets/app.js` la pinta en el DOM sin ningún framework de plantillas

### Publicar un anuncio (`publicar.html` → `assets/publicar.js`)

1. `montarPublicador()` arranca en `DOMContentLoaded` (`assets/publicar.js:1854`)
2. Cada foto/video elegido se sube de inmediato vía `POST /api/fotos` o `/api/videos` (no se espera al envío del formulario) — de ahí la tarea de limpieza de huérfanos en `tools/tareas.js`
3. Al enviar, se llama a `POST /api/anuncios` (o similar); `tools/api.js` valida contra `assets/taxonomia.js` y `assets/precios.js` (las mismas reglas que ya validó el navegador) y escribe con `tools/db.js`
4. `tools/db.js` descuenta capacidad de la suscripción vigente y crea la fila del anuncio

### Emisión de un comprobante fiscal

1. Un pago se aprueba (flujo de suscripción/membresía) y `tools/api.js` llama a `tools/facturas.js`
2. `tools/facturas.js` toma el siguiente NCF (`tools/db.js: tomarNcf`/`siguienteNumero`), genera el PDF con `tools/pdf.js` (sin `pdfkit`, generador propio) y pide el envío a `tools/correo.js`
3. Si el correo falla, el comprobante queda emitido igual; `tools/tareas.js` (`reenviarComprobantes`) reintenta hasta 10 veces en ejecuciones diarias posteriores

**State Management:**
- No hay estado de aplicación centralizado en el cliente: cada módulo de página mantiene sus propias variables de módulo (p. ej. `SESION` en `assets/sesion.js`, `VISTAS` en `assets/cuenta.js`)
- El estado de sesión del servidor vive en SQLite (tabla de sesiones) referenciado por una cookie httpOnly (`te_sesion`); no hay JWT ni sesión en memoria del proceso
- El estado de negocio persistente (anuncios, pagos, comprobantes, taxonomía en uso) vive exclusivamente en `db/mercamaquinarias.db`

## Key Abstractions

**Ruta pública API (tupla en `RUTAS`):**
- Purpose: Declarar método HTTP, patrón de URL con capturas y manejador en una sola línea, sin capa de configuración aparte
- Examples: `tools/api.js:2553-2603`
- Pattern: `['MÉTODO', /regex/, manejador]`; las capturas del regex se pasan como argumentos posicionales al manejador junto con `ctx` y `consulta`

**Envoltorios de autorización (`conSesion`, `conAdmin`):**
- Purpose: Adjuntar requisitos de autenticación/autorización a un manejador sin tocar su cuerpo
- Examples: `tools/api.js:179-195`
- Pattern: Función de orden superior que recibe un manejador y devuelve otro con la misma firma; `conAdmin` responde 404 (no 403) para no revelar la existencia de rutas de administración

**Migración nombrada append-only:**
- Purpose: Evolucionar el esquema de una base ya en producción sin reescribir historial
- Examples: `tools/db.js:50-153` (`MIGRACIONES`), aplicadas por `migrar()` en `tools/db.js:836`
- Pattern: `['id-fecha-descripcion', ['SENTENCIA SQL', ...]]`; cada migración corre dentro de una transacción y se anota en la tabla `migraciones`; nunca se edita una entrada ya escrita, solo se añade al final

**Módulo de fuente única navegador+servidor:**
- Purpose: Evitar que una regla de negocio (precio, taxonomía, catálogo de servicios activos, versión de documento legal) tenga dos copias que se desincronicen
- Examples: `assets/precios.js`, `assets/servicios.js`, `assets/taxonomia.js`, `assets/legales.js`
- Pattern: El archivo termina con `if (typeof module !== 'undefined' && module.exports) { module.exports = {...}; }`; en el navegador, las mismas declaraciones `const`/`function` de nivel superior quedan como globales porque el script no es un módulo ES ni usa `'use strict'` con scope de módulo

**Interruptor de servicio (`SERVICIOS` / `paginasApagadas()`):**
- Purpose: Apagar una funcionalidad completa (transporte, financiamiento) sin borrar el código que la implementa
- Examples: `assets/servicios.js`, consumido por `tools/serve.js:225` (redirección 302 de páginas apagadas) y por `tools/api.js`
- Pattern: Objeto de configuración con `activo: true/false` por servicio; un solo punto de verdad consultado tanto por el servidor de estáticos como por la API

## Entry Points

**Servidor web (proceso de producción):**
- Location: `tools/serve.js`
- Triggers: `npm start` (`node tools/serve.js --port 8080`); en producción, la unidad de systemd `deploy/mercamaquinarias.service`
- Responsibilities: Servir estáticos con lista blanca, aplicar cabeceras de seguridad, montar `/api`, servir fotos/videos con streaming, componer metadatos de compartir y `sitemap.xml`

**API HTTP:**
- Location: `tools/api.js`, función exportada `manejar(req, res, ruta)`
- Triggers: Toda petición cuya ruta empiece por `/api/`, enrutada desde `tools/serve.js`
- Responsibilities: Autenticación por cookie, autorización, límites de tasa, validación, invocación de `tools/db.js` y servicios de borde, forma de la respuesta JSON

**Tareas programadas:**
- Location: `tools/tareas.js`
- Triggers: `deploy/mercamaquinarias-tareas.timer` (systemd, diario a las 5:00) más `mercamaquinarias-informe-semanal.timer` y `mercamaquinarias-informe-mensual.timer`; también invocable a mano (`npm run tareas`, `npm run tareas:seco`)
- Responsibilities: Caducar anuncios, avisos por correo, reintentos de comprobantes, respaldo de base, limpieza de archivos huérfanos, informes periódicos

**Herramientas de línea de comandos (administración y verificación):**
- Location: `tools/admin.js` (permisos internos), `tools/seed.js` (datos de demostración), `tools/verificar-taxonomia.js`, `tools/auditar-*.js` (auditorías que no modifican nada, solo informan)
- Triggers: Invocación manual vía scripts de `package.json` (`npm run auditar`, `npm run db:demo`, etc.)
- Responsibilities: Operación y verificación fuera del ciclo de una petición HTTP

**Páginas HTML (entradas del frontend):**
- Location: 19 archivos `.html` en la raíz del proyecto (`index.html`, `panel.html`, `admin.html`, `publicar.html`, `equipo.html`, `dealer.html`, etc.)
- Triggers: Navegación del usuario; cada página es una URL independiente, no hay enrutador del lado del cliente
- Responsibilities: Cada página carga su propio conjunto de `<script>` en orden fijo (módulos compartidos primero, módulo específico de la página al final)

## Architectural Constraints

- **Threading:** Un solo proceso Node.js de un hilo (event loop); no hay worker threads ni cluster. SQLite (`node:sqlite`) es síncrono dentro del proceso, así que una consulta larga bloquea el event loop.
- **Global state:** `let db` en `tools/db.js` es un singleton de módulo (una sola conexión SQLite por proceso); `let SESION` en `assets/sesion.js` es estado global del navegador por página cargada; `assets/data.js`/`assets/taxonomia.js` exponen constantes globales de nivel superior en el navegador (sin namespace, sin `window.X =` explícito — dependen de que los scripts NO sean módulos ES).
- **Sin build ni bundler:** Los archivos de `assets/` se sirven tal cual; no hay minificación, tree-shaking ni resolución de módulos. El orden de los `<script>` en cada `.html` importa y debe mantenerse manualmente coherente entre páginas.
- **Cero dependencias de producción:** `tools/*.js` usa solo módulos nativos de Node (`node:http`, `node:sqlite`, `node:crypto`, `fs`, `path`). Añadir un paquete npm de runtime es una decisión arquitectónica explícita, no algo trivial — el proyecto lo evita a propósito (ver comentarios en `tools/chat.js`, `tools/pdf.js`).
- **Módulos de doble entorno:** `assets/precios.js`, `assets/servicios.js`, `assets/taxonomia.js`, `assets/legales.js` deben seguir siendo compatibles tanto con `<script>` (global) como con `require()` (CommonJS). Cualquier cambio debe evitar sintaxis de módulo ES o API exclusiva del navegador (`window`, `document`) en esos archivos.
- **Consistencia entre `db/schema.sql` y `tools/db.js`:** El esquema base usa `CREATE ... IF NOT EXISTS`, así que una base ya existente NO recibe columnas nuevas de `schema.sql`; toda evolución de esquema debe ir como entrada nueva en `MIGRACIONES`, nunca editando `schema.sql` a secas para una base en producción.

## Anti-Patterns

### God module en el acceso a datos

**What happens:** `tools/db.js` concentra 3353 líneas y decenas de responsabilidades (usuarios, sesiones, facturas, catálogo, métricas, publicidad, flota) en un único archivo.
**Why it's wrong:** Cualquier cambio en el esquema o en una consulta obliga a navegar un archivo enorme; el riesgo de colisión al editar en paralelo crece con el tamaño.
**Do this instead:** El propio archivo ya está organizado en secciones marcadas con comentarios `── Nombre ──` (`tools/db.js:875` en adelante) — al añadir funciones nuevas, ubicarlas en la sección correspondiente existente en vez de añadir al final del archivo sin clasificar.

### Router sin capa de middleware explícita

**What happens:** La autorización se aplica envolviendo el manejador (`conSesion`, `conAdmin`) en vez de con una tubería de middlewares declarada en la definición de ruta.
**Why it's wrong:** No es un anti-patrón en sí para este tamaño de proyecto, pero es fácil olvidar envolver un manejador nuevo y dejar una ruta sin protección — no hay ninguna verificación automática de que las rutas `/api/admin/*` estén todas envueltas en `conAdmin`.
**Do this instead:** Antes de añadir una ruta bajo `/api/admin/*`, envolver el manejador explícitamente y correr `npm run auditar:permisos` (`tools/auditar-permisos.js`), que prueba autorización cruzada contra la API directamente.

## Error Handling

**Strategy:** Errores con código HTTP adjunto (`e.codigo`) capturados centralmente en el bucle de `manejar()` de `tools/api.js`; 5xx se registran en consola y responden con mensaje genérico, 4xx devuelven el mensaje del error tal cual al cliente.

**Patterns:**
- `tools/api.js:2603-2615`: cada manejador de ruta corre dentro de un `try/catch` único en el despachador; no hace falta que cada manejador individual capture errores
- `process.on('unhandledRejection', ...)` y `process.on('uncaughtException', ...)` en `tools/serve.js:280-291` registran y, en el caso de excepción no capturada, terminan el proceso con código de error para que systemd reinicie limpio
- Los flujos de streaming (`enviarArchivo` en `tools/serve.js:267`) escuchan el evento `error` del `ReadStream` para evitar una excepción no capturada que tumbe el proceso
- `tools/tareas.js`: cada tarea corre en su propio `try/catch` dentro del bucle principal; el fallo de una tarea no detiene a las demás

## Cross-Cutting Concerns

**Logging:** `console.log`/`console.error` sin librería; el servidor registra cada petición con código de estado (`200`, `304`, `404`, `302`) y ruta; no hay niveles de log ni salida estructurada (JSON), se apoya en journald vía systemd en producción.

**Validation:** Validación manual en `tools/api.js` (sin librería de esquemas); las reglas de negocio compartidas (`assets/taxonomia.js`, `assets/precios.js`, `assets/servicios.js`) se validan contra la MISMA fuente que usa el navegador para evitar reglas duplicadas divergentes.

**Authentication:** Cookie httpOnly (`te_sesion`) con testigo aleatorio; la sesión se resuelve contra la base en cada petición (`db.sesion(testigo)`), no contra un JWT firmado — revocar acceso es inmediato porque no hay estado cacheado del lado del cliente que sobreviva a un cambio en la base.

---

*Architecture analysis: 2026-09-25*
