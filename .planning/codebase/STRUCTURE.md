# Codebase Structure

**Analysis Date:** 2026-09-25

## Directory Layout

```
TuEquipoRD-website/
├── *.html                    # 19 páginas del sitio, sin build (index.html, panel.html, admin.html, publicar.html, equipo.html, dealer.html, ...)
├── assets/                   # JS del navegador; algunos módulos también los usa Node (require)
├── tools/                    # Node.js: servidor, API, acceso a datos, tareas, scripts de CLI
├── db/                       # schema.sql (fuente del esquema) + archivo SQLite en tiempo de ejecución
├── deploy/                   # Unidades systemd, temporizadores, config de nginx, guías de despliegue
├── brand_assets/             # Logos, guía de marca, imágenes de portada/categorías
├── .github/workflows/        # CI: despliegue automático a producción al hacer merge a main
├── .planning/                # Documentación de planeación de GSD (este mapeo vive aquí)
├── .tmp/                     # Correos de desarrollo, respaldos, scripts puntuales, capturas (no productivo)
├── styles.css                # Hoja de estilos única y global del sitio
├── favicon.ico, robots.txt   # Estáticos de raíz
├── package.json              # Scripts npm; sin dependencias de runtime, puppeteer solo en dev
└── vercel.json                # Configuración de despliegue alternativo (ver nota en Special Directories)
```

## Directory Purposes

**`assets/`:**
- Purpose: Todo el JavaScript que corre en el navegador; sin build, servido tal cual con `<script src="assets/archivo.js">`
- Contains: Módulos compartidos por casi toda página (`tema.js`, `sesion.js`, `app.js`), módulos de doble entorno navegador+servidor (`taxonomia.js`, `precios.js`, `servicios.js`, `legales.js`, `data.js`), y módulos exclusivos de una pantalla (`panel.js`, `admin.js`, `publicar.js`, `cuenta.js`, `perfil.js`, `mi-pagina.js`, `mapa.js`, `chat.js`, `planes.js`)
- Key files: `assets/sesion.js` (cliente de la API y estado `SESION`, se carga antes que cualquier otro script), `assets/app.js` (render e iconografía del sitio público), `assets/taxonomia.js` (categoría→subcategoría→marca→modelo, fuente única)

**`tools/`:**
- Purpose: Todo el código Node.js del proyecto — servidor, API, acceso a datos, tareas, scripts de administración y auditoría
- Contains: Servidor (`serve.js`), router de API (`api.js`), acceso a datos (`db.js`), tareas programadas (`tareas.js`), servicios de borde (`correo.js`, `chat.js`, `facturas.js`, `pdf.js`, `fotos.js`, `videos.js`, `meta.js`, `numero-a-letras.js`), CLI de administración (`admin.js`, `seed.js`), scripts de auditoría (`auditar-*.js`) y de verificación manual (`probar-*.js`, `prueba-*.js`)
- Key files: `tools/serve.js` (entry point HTTP), `tools/api.js` (router plano `RUTAS`), `tools/db.js` (todo el SQL), `tools/tareas.js` (mantenimiento programado), `tools/entorno.js` (debe importarse primero en cualquier script que lea `process.env`)

**`db/`:**
- Purpose: Persistencia SQLite del proyecto
- Contains: `schema.sql` (fuente de verdad del esquema, con `CREATE ... IF NOT EXISTS`), `mercamaquinarias.db` + `-shm`/`-wal` (archivo de base de datos en modo WAL, generado en tiempo de ejecución)
- Key files: `db/schema.sql` — leer los comentarios de cabecera antes de tocar el esquema; documentan por qué la organización (no el usuario) es la unidad de propiedad y por qué el dinero se guarda en enteros

**`deploy/`:**
- Purpose: Todo lo necesario para operar el sitio en el VPS de producción
- Contains: Unidad de systemd del sitio (`mercamaquinarias.service`), unidad y temporizador de tareas (`mercamaquinarias-tareas.service`/`.timer`), temporizadores de informes (semanal/mensual), configuración de nginx (dominio actual y dominio viejo), script `desplegar-mercamaquinarias`, guías (`README.md`, `VERCEL.md`)
- Key files: `deploy/mercamaquinarias.service` (variables de entorno de producción, rutas de `/var/lib/mercamaquinarias`), `deploy/nginx.conf` (TLS, redirecciones canónicas)

**`brand_assets/`:**
- Purpose: Activos de marca consultados antes de diseñar cualquier pantalla nueva
- Contains: `guia-de-marca.html`/`.png`, `img/`, `svg/`, `portada/`, `categorias/`, `generated/`
- Key files: `brand_assets/README.md`, `brand_assets/guia-de-marca.html` (paleta y tipografía oficiales)

**`.github/workflows/`:**
- Purpose: Integración/despliegue continuo
- Contains: `desplegar.yml` — al hacer push/merge a `main`, GitHub Actions entra por SSH al droplet y ejecuta el único script permitido en el servidor (`desplegar-mercamaquinarias`), con rollback automático si el sitio no responde tras el despliegue
- Key files: `.github/workflows/desplegar.yml`

**`.tmp/`:**
- Purpose: Carpeta de trabajo de desarrollo/generada — correos capturados por el transporte 'archivo' de `tools/correo.js`, respaldos, scripts puntuales de una sola vez, capturas de pantalla, PDFs de prueba
- Contains: Scripts sueltos (`ajustar-*.js`, `arreglar-*.js`, `ver-*.js`, etc.), subcarpetas `correos/`, `facturas/`, `fotos/`, `videos/`, `shots/`, `mig*`, `dep`, `parches`
- Key files: Ninguno estable — es zona de descarte, no código de producto

## Key File Locations

**Entry Points:**
- `tools/serve.js`: servidor HTTP (estáticos + monta `/api`); `npm start`
- `tools/api.js`: router de la API, función exportada `manejar(req, res, ruta)`
- `tools/tareas.js`: mantenimiento programado, invocado por systemd timer o `npm run tareas`

**Configuration:**
- `tools/entorno.js`: carga `.env` (dev) y la unidad de systemd (producción) en `process.env`; debe ser el primer `require` de cualquier script que use variables de entorno
- `.env.example`: variables de entorno documentadas (sin valores reales)
- `package.json`: scripts npm de arranque, auditoría, semillas y pruebas manuales
- `vercel.json`: configuración de despliegue alternativo (ver nota abajo)

**Core Logic:**
- `tools/db.js`: todo el SQL, migraciones, funciones de dominio
- `tools/api.js`: reglas de negocio y permisos de cada endpoint
- `assets/precios.js`, `assets/taxonomia.js`, `assets/servicios.js`, `assets/legales.js`: reglas de negocio compartidas navegador+servidor

**Testing:**
- `tools/numero-a-letras.prueba.js`: única prueba con `node --test` (`npm run facturas:letras`)
- `tools/probar-*.js`, `tools/prueba-*.js`: scripts de verificación manual/end-to-end contra un servidor corriendo (correo, facturas, seguridad, chat, página de dealer) — no son suite automatizada de CI
- `tools/auditar-*.js`: auditorías con Puppeteer o HTTP directo (flujos completos, permisos cruzados, accesibilidad pública) — informan, no aseveran con framework de test

## Naming Conventions

**Files:**
- Todo en español, minúsculas, con guiones para separar palabras cuando aplica (`fix-encoding.js`, `check-links.js`, `numero-a-letras.js`)
- Un archivo `.js` en `assets/` por pantalla o por responsabilidad compartida; el nombre del archivo coincide con el nombre de la página HTML que lo usa en exclusiva cuando aplica (`panel.html` ↔ `assets/panel.js`, `admin.html` ↔ `assets/admin.js`)
- Scripts de verificación manual usan el prefijo `probar-` o `prueba-`; scripts de auditoría automatizada usan el prefijo `auditar-`

**Directories:**
- Nombres en minúsculas, en español, un nivel plano bajo la raíz (`assets/`, `tools/`, `db/`, `deploy/`, `brand_assets/`)
- No hay anidamiento profundo por feature; toda la lógica de servidor vive en un único directorio `tools/` sin subcarpetas

**Identificadores en el código (JS):**
- Nombres de función, variable y comentarios en español (`anotarVisita`, `huellaDe`, `conAdmin`, `cargarUnidad`)
- Constantes de configuración en MAYÚSCULAS (`RUTAS`, `LIMITES`, `PRODUCCION`, `MIGRACIONES`, `PUBLICO`)

## Where to Add New Code

**Nueva página del sitio:**
- Página: nuevo archivo `.html` en la raíz, siguiendo el orden de `<script>` de una página similar (`tema.js` → `sesion.js` → `taxonomia.js` → `precios.js` → `servicios.js` → `data.js` → `legales.js` si aplica → `app.js` → módulo propio → `chat.js` si aplica)
- Lógica de la página: nuevo archivo en `assets/nombre-pagina.js`, con `document.addEventListener('DOMContentLoaded', montarNombrePagina)` como patrón de arranque
- Añadir la página a la lista blanca `PUBLICO` en `tools/serve.js:154` si no calza ya en el patrón `^/[\w-]+\.html$`

**Nuevo endpoint de API:**
- Manejador: función en `tools/api.js`, cerca de otros manejadores del mismo dominio (ver secciones marcadas con comentarios en el archivo)
- Registro de ruta: añadir tupla `['MÉTODO', /^\/api\/.../, manejador]` al array `RUTAS` (`tools/api.js:2553` en adelante); envolver con `conSesion`/`conAdmin` si requiere autenticación/autorización
- Acceso a datos: nueva función en la sección correspondiente de `tools/db.js`; nunca escribir SQL directamente en `tools/api.js`

**Cambio de esquema de base de datos:**
- Si la base ya está en producción: añadir una nueva entrada al final de `MIGRACIONES` en `tools/db.js` (nunca editar una entrada ya escrita)
- Si es una tabla nueva sin datos previos: añadir `CREATE TABLE IF NOT EXISTS` en `db/schema.sql`

**Regla de negocio compartida (precio, taxonomía, servicio activo, texto legal):**
- Editar el módulo de doble entorno correspondiente en `assets/` (`precios.js`, `taxonomia.js`, `servicios.js`, `legales.js`)
- Mantener el patrón `if (typeof module !== 'undefined' && module.exports) { module.exports = {...}; }` al final del archivo para que siga funcionando tanto en `<script>` como en `require()`

**Tarea de mantenimiento programada:**
- Nueva función en `tools/tareas.js`, registrada en el diccionario `TAREAS`; debe ser idempotente (verificar en la base qué ya se hizo antes de repetirlo)
- Si necesita un temporizador propio (no diario), añadir unidad `.service`/`.timer` en `deploy/`

**Utilidades:**
- Compartidas por todo el servidor: nuevo módulo en `tools/` (sin subcarpetas)
- Compartidas por todo el navegador: añadir a `assets/app.js` si es de render/DOM, o a `assets/sesion.js` si es de comunicación con la API

## Special Directories

**`.tmp/`:**
- Purpose: Carpeta de trabajo de desarrollo (correos capturados, respaldos, scripts puntuales, capturas)
- Generated: Sí (mayormente)
- Committed: Parcialmente — contiene archivos sueltos que parecen scripts de una sola vez ya usados (`ajustar-*.js`, `arreglar-*.js`); revisar `.gitignore` antes de asumir que todo su contenido es descartable

**`db/`:**
- Purpose: Archivo de base de datos SQLite en tiempo de ejecución
- Generated: Sí, el `.db`/`-shm`/`-wal` (schema.sql es la única fuente versionada)
- Committed: `schema.sql` sí; el archivo `.db` normalmente no debería versionarse en un proyecto en producción — verificar `.gitignore` si se encuentra comprometido

**`brand_assets/generated/`:**
- Purpose: Activos generados a partir de la guía de marca
- Generated: Sí
- Committed: Verificar caso por caso

**`node_modules/`:**
- Purpose: Dependencia única de desarrollo, `puppeteer` (usado por `tools/screenshot.js` y los `auditar-*.js`)
- Generated: Sí
- Committed: No

---

*Structure analysis: 2026-09-25*
