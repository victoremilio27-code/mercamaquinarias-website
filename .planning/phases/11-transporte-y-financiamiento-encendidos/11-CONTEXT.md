# Fase 11: Transporte y financiamiento encendidos — Contexto

**Reunido:** 2026-09-25
**Estado:** Listo para planificar
**Modo:** sin discusión con Victor. Lo técnico y reversible lo decidió el planificador
según `CLAUDE.md`, `PROJECT.md` y `ROADMAP.md`. Lo que solo Victor puede dar (tarifas,
lista de entidades, texto legal, qué flota existe de verdad) se construye configurable y
**el interruptor no se enciende hasta que lo dé**: es el plan 11-05, que no es autónomo.
**Base de ejecución:** `main` con las fases 1 a 10 fusionadas. Se usa `precioEnPesos` y
`tasaUsd` de la fase 8 (`assets/precios.js`, `tools/db.js`).

<domain>
## Límite de la fase

SERV-01 y SERV-02, y nada más:

1. **Transporte:** el visitante elige provincia de origen y de destino sobre el mapa de
   `assets/mapa.js`, ve la ruta dibujada y obtiene una estimación de traslado (distancia,
   tiempo y, si hay tarifas cargadas, un rango de precio). Desde ahí pide la reserva.
2. **Financiamiento:** el visitante ve entidades dominicanas reales que financian
   maquinaria y calcula una cuota con monto, inicial, plazo y tasa.
3. **Encendido:** las dos páginas dejan de redirigir a la portada, y el menú, el pie, la
   ficha del equipo y el asistente las ofrecen donde corresponde.

Fuera: seguimiento GPS real (no hay proveedor contratado; `PROVEEDOR_GPS` sigue en
`null`), cobrar el transporte en línea, solicitudes de crédito a través del sitio,
intermediar con entidades, planes y precios del marketplace.
</domain>

<decisions>
## Decisiones de implementación

### El interruptor
- **D-01 · `assets/servicios.js` no cambia de forma.** Encender sigue siendo poner
  `activo: true`. Los planes 11-01 a 11-04 se construyen y se prueban **con el interruptor
  apagado**; el arnés prueba el estado encendido mutando `SERVICIOS.<x>.activo` en el
  propio proceso **antes** del `require` de `tools/api.js` (que calcula
  `SERVICIOS_SOLICITUD` al cargar). El plan 11-05 lo enciende en producción cuando Victor
  haya dado los datos.
- **D-02 · Las pruebas siguen al interruptor, no a un valor fijo.** El bloque «Los
  servicios apagados» de `tools/probar-seguridad.js` exige hoy que estén apagados; pasa a
  exigir la regla: una solicitud se admite **si y solo si** `seOfrece(servicio)`, y
  `paginasApagadas()` coincide con los servicios con `activo: false`. Así la misma prueba
  vale antes y después de encender, y apagar mañana otra vez no rompe el CI.
- **D-03 · Las pantallas de administración se ven aunque el servicio esté apagado**, con
  un aviso «Servicio apagado: lo que cargue aquí se publicará cuando se encienda». Hoy se
  ocultan «para que nadie alimente una flota que no se va a enseñar»; pero la flota y las
  tarifas tienen que estar cargadas **antes** de encender o el primer visitante ve una
  página vacía. Se actualiza ese párrafo del comentario de `servicios.js`; la bandera no
  se toca.

### Transporte (SERV-01)
- **D-04 · Módulo compartido nuevo `assets/traslado.js`** (navegador con `<script>` y
  Node con `require`, termina en el `if (typeof module …)` de siempre, sin `window` ni
  sintaxis de módulo ES). Contiene:
  - `PROVINCIAS_RD`: las 32 (31 provincias y el Distrito Nacional) con
    `{ id, nombre, capital, lat, lon }` de la capital provincial.
  - `FACTOR_CARRETERA = 1.35`, `VELOCIDAD_CAMA_KMH = 45`, `HORAS_CARGA = 1`,
    `KM_MINIMO = 25`.
  - `distanciaCarreteraKm(origen, destino)`: Haversine entre capitales × factor,
    redondeado a 5 km; misma provincia → `KM_MINIMO`.
  - `estimarTraslado({ origen, destino, cama, idaYVuelta }, tarifas)` →
    `{ km, horas, precio: null | { desde, hasta, moneda: 'DOP', itbis: 'aparte' } }`.
    Sin tarifa para esa cama, `precio` es `null` y la página dice «precio a confirmar».
    Con tarifa: `base + porKm × km` (× 2 si ida y vuelta), rango ±15 % redondeado a
    RD$500.
  - `tarifasValidas(obj)`: valida la forma de las tarifas (números ≥ 0, cama conocida).
  No se duplica `distanciaKm` de `mapa.js`: `traslado.js` lleva su propia Haversine
  porque `mapa.js` depende de `CIUDADES_RD` y del DOM y no se carga en Node.
- **D-05 · `PROVINCIAS` del catálogo no se toca** (tiene 16 y alimenta publicar y los
  filtros). El estimador usa `PROVINCIAS_RD`. Unificar las dos listas queda diferido.
- **D-06 · Tarifas como ajuste de la plataforma.** Nueva clave `tarifas_transporte` en
  `AJUSTES` (JSON `{ camas: { <idCama>: { base, porKm } } }`). Por defecto no existe.
  `GET /api/transporte/tarifas` (pública, solo lectura) y `PATCH
  /api/admin/tarifas-transporte` (`conAdmin`, en `ESCRITURAS_ADMIN_PROPIAS`: es escritura
  de la plataforma, no en nombre de otra organización). Las camas son las de la flota de
  transporte (`GET /api/flota/transporte`).
- **D-07 · El servidor recalcula el estimado.** Al recibir `POST /api/solicitudes` con
  `servicio: 'transporte'`, la API recalcula con `traslado.estimarTraslado` y las tarifas
  vigentes y añade al `detalle` el par «Estimado mostrado» (km, horas y rango, o «precio a
  confirmar»). Lo que diga el navegador no se guarda como estimado: se podría manipular.
- **D-08 · El estimado no es una cotización.** Texto fijo bajo el resultado: «Estimado
  orientativo, antes de ITBIS. El precio final se confirma al revisar peso, medidas y
  acceso». El ITBIS va aparte hasta que Victor diga lo contrario.
- **D-09 · Sin seguimiento GPS de demostración a clientes reales.** Con
  `PROVEEDOR_GPS === null`, `montarSeguimiento` no se llama y la sección no existe en la
  página nueva. El código de seguimiento se queda (misma filosofía que el interruptor).
  El mapa se usa para el estimador: ruta estática origen → destino con `dibujarMapa`,
  sin posición del camión ni refresco automático. `tools/check-motion.js` deja de
  observar el refresco del mapa en `transporte.html` (no lo hay) y lo dice.
- **D-10 · La página se rehace desde la versión anterior** (`git show
  2b8ccac^:transporte.html`): «Cómo funciona», «Por qué pedimos peso y medidas», camas y
  formulario de reserva se recuperan; se quitan las promesas que hoy no se cumplen (GPS,
  «flota propia» mientras Victor no lo confirme: texto neutro «Coordinamos el traslado»).

### Financiamiento (SERV-02)
- **D-11 · `FINANCIADORAS` en `assets/data.js` pasa a datos reales y revisables:**
  `{ id, nombre, tipo, productos: [], requisitos: [], web, correo, revisado }`. **Sin
  campo de teléfono** (CLAUDE.md: no se publica ningún teléfono en ninguna página). Solo
  se pintan las entradas con `revisado` (fecha ISO). El planificador deja una propuesta
  de entidades dominicanas conocidas (banca múltiple, asociaciones de ahorros y
  préstamos, arrendadoras) **con `revisado: null`**: nombres públicos, sin productos ni
  tasas inventadas. Victor o su equipo completan y fechan cada una.
  Se prefirió el archivo a una tabla con pantalla de administración: cambia pocas veces,
  el cambio queda revisado en un PR, y no hace falta código de administración nuevo.
- **D-12 · Calculadora de cuota con cuatro entradas:** monto (RD$), inicial (%, 0-80,
  por defecto 20), plazo (12, 24, 36, 48, 60 o 72 meses) y tasa anual (%, 1-40, por
  defecto 14, rotulada «tasa de referencia; cada entidad fija la suya»). Salida: cuota
  mensual, monto financiado y total de intereses. La fórmula va en una función pura
  `cuotaMensual(principal, tasaAnual, meses)` en `assets/precios.js` (compartido), con
  tasa 0 resuelta como `principal / meses`.
- **D-13 · Desde la ficha:** «Calcular cuota» lleva `financiamiento.html?monto=` con el
  precio **en pesos** (`precioEnPesos` de la fase 8 si el anuncio está en US$, y la nota
  «convertido a RD$<tasa>»). Solo si `seOfrece('financiamiento')` y el anuncio tiene
  precio.

### Encendido (criterio 3)
- **D-14 · Los enlaces los pone `app.js`, no el HTML de veinte páginas.** Nueva
  `montarEnlacesServicios()` que, por cada servicio con `activo`, inserta el enlace en
  `#navMenu` (antes de `.cab__nav-cta`), en la columna «Otros servicios» del pie y en la
  ficha («Cotizar traslado» → `transporte.html?equipo=<id>`). Mismo patrón que
  `montarEnlaceGuardados()` de la fase 10. `tools/wire-transporte.js` queda obsoleto y
  no se usa (reescribía el HTML).
- **D-15 · Texto legal.** La cláusula 4 de «Servicios propios y de terceros» dice hoy
  «temporalmente suspendido». Encender obliga a una **versión nueva** (2.1) del documento
  `servicios` en `assets/legales.js` y en `legal.html`, en el mismo commit que el
  encendido, porque el contrato tiene que decir la verdad en cada estado. El borrador lo
  escribe el agente; lo aprueba Victor (pregunta abierta).

### Pruebas
- **D-16 · Arnés nuevo `tools/probar-servicios.js` (`npm run servicios:probar`)**, estilo
  contadores, colgado del job `pruebas` del CI: tarifas (validación, 404 sin admin),
  estimado recalculado en la solicitud, y el estado encendido simulado en proceso.
- **D-17 · `node:test` para las funciones puras:** `tools/traslado.prueba.js`
  (`npm run traslado:calculos`): 32 provincias dentro de `MAPA_LIMITES`, distancias
  simétricas, Santo Domingo → Santiago entre 140 y 190 km, misma provincia = mínimo,
  estimado sin tarifa sin precio, `cuotaMensual` con tasa 0 y con un caso calculado a
  mano.

### A discreción del agente
- Textos de interfaz (de usted), orden de secciones, iconos del sprite existentes.
</decisions>

<canonical_refs>
## Referencias canónicas

- `.planning/ROADMAP.md` § Phase 11; `.planning/REQUIREMENTS.md` SERV-01, SERV-02.
- `CLAUDE.md` — interruptor de `assets/servicios.js`, sin teléfono, módulos compartidos,
  CRLF, cero dependencias.
- `assets/servicios.js` — `SERVICIOS`, `seOfrece`, `paginasApagadas`,
  `serviciosQueAdmitenSolicitud`.
- `assets/mapa.js` — `dibujarMapa(contenedor, { puntos, posicion, avance, descripcion })`,
  `MAPA_LIMITES`, `proyectar`.
- `assets/data.js` — `FINANCIADORAS`, `FLOTA_TRANSPORTE`, `CIUDADES_RD`,
  `PROVEEDOR_GPS`, `ENVIO_DEMO`.
- `assets/app.js` — `montarTransporte`, `montarSeguimiento`, `montarFinanciadoras`,
  `montarCalculadora`, `TASA_ANUAL`, arranque en `DOMContentLoaded`,
  `montarEnlaceGuardados` (patrón).
- `tools/api.js` — `crearSolicitud` (`POST /api/solicitudes`), `SERVICIOS_SOLICITUD`,
  flota (`/api/flota/:servicio`), `ESCRITURAS_ADMIN_PROPIAS`, `conAdmin`.
- `tools/db.js` — `AJUSTES`, `ajustes`, `guardarAjuste`, `crearSolicitudServicio`.
- `tools/serve.js` — `PAGINAS_APAGADAS`; `tools/chat.js` — prompt según el interruptor.
- `tools/probar-seguridad.js` § 7d; `tools/check-motion.js`; `tools/auditar-publico.js`;
  `tools/check-contraste.js`; `tools/check-links.js`.
- `git show 2b8ccac^:transporte.html` — la página antes de la suspensión.
- Fase 8: `precioEnPesos`, `tasaUsd` (`origin/claude/fase-08-moneda-disponibilidad`).
</canonical_refs>

<specifics>
## Preguntas abiertas para Victor (bloquean solo el plan 11-05)

1. **Tarifas de transporte** por tipo de cama: cargo base y precio por km. ¿El precio se
   anuncia con ITBIS incluido o aparte?
2. **¿Flota propia o subcontratada?** ¿Qué camas existen de verdad (las cuatro de
   `FLOTA_TRANSPORTE` son de ejemplo)? ¿Incluye seguro de la carga y permisos?
3. **Entidades de financiamiento:** confirmar la lista propuesta, qué producto de
   maquinaria o leasing tiene cada una, su web y un correo institucional (nunca
   teléfono), y fechar la revisión.
4. **Texto legal** de la versión 2.1 de «Servicios propios y de terceros» (cláusulas 1.5,
   3 y 4): aprobar el borrador.
5. **Fecha de encendido** y buzón que responde las reservas (hoy `ventas@`).
</specifics>

<deferred>
## Ideas diferidas

- Seguimiento GPS real cuando se contrate proveedor (`posicionEnvio` es el único punto).
- Unificar `PROVINCIAS` (16) del catálogo con las 32 de `PROVINCIAS_RD`.
- Distancias por carretera reales (matriz) en vez de Haversine × factor.
- Solicitud de precalificación de crédito a través del sitio.
</deferred>

---

*Fase: 11-transporte-y-financiamiento-encendidos*
