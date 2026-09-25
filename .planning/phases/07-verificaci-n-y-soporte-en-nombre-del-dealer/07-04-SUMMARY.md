---
phase: 07-verificaci-n-y-soporte-en-nombre-del-dealer
plan: 04
subsystem: consola de administración (frontend)
tags: [admin, sello, serie, bitacora]
requires: [07-01, 07-02, 07-03]
provides: ["sección Empresas dealer en admin.html", "sección Números de serie en admin.html", montarEmpresas, montarSeries]
affects: [07-05 (enlace «Editar su página»), 07-06 (mismos datos de serie que ve el panel/ficha)]
key-files:
  modified: [admin.html, assets/admin.js]
decisions:
  - "El buscador de «Empresas» espera 250 ms tras la última tecla antes de consultar, igual que el resto de buscadores de la consola."
  - "El botón de sello es el mismo componente (pedirEnFila) en la cola y en «Empresas»: una sola función de envío, una sola forma de pedir motivo."
metrics:
  completed: 2026-09-25
  tasks: 3
---

# Phase 7 Plan 04: consola con «Empresas dealer» y «Números de serie»

Dos secciones nuevas en `admin.html`, tras la cola de revisión: **Empresas dealer** (filtro por
alta, buscador por nombre, sello de verificado con motivo obligatorio al retirar y opcional al
dar, enlace «Editar su página» a `mi-pagina.html?org=<id>` solo si el alta está aprobada) y
**Números de serie** (filtro por resultado, la placa declarada, las fotos enlazadas a tamaño
completo, el aviso de placa repetida en otro anuncio, y Coincide / Con observaciones (nota
obligatoria) / Volver a pendiente). El botón de sello de la cola de «Aprobadas» también empezó a
pedir motivo al retirar, reutilizando la misma caja y el mismo envío. La bitácora rotula las
claves nuevas (`revision` → «Serie», `nota` → «Nota», y las de página del dealer que trae 07-05).

## Commits

| Tarea | Qué |
|---|---|
| 1 | Sección «Empresas» y motivo al retirar el sello desde la cola (`a6d3154`, junto con la tarea 2) |
| 2 | Sección «Números de serie» (`a6d3154`) |
| 3 | Recorrido en navegador contra un servidor y una base de demostración propios; ver más abajo |

Las tareas 1 y 2 llegaron ya hechas al recibir este plan (commit `a6d3154`); esta sesión hizo la
tarea 3.

## Verificación

- `node --check assets/admin.js`: sin errores.
- `npm run check:encoding`: sin caracteres sospechosos.
- `npm run bitacora:probar`: 116 bien, 0 mal (igual que al cierre de 07-03: esta consola no le
  añadió comprobaciones propias al arnés, solo pantalla sobre rutas ya probadas).
- Recorrido de navegador (tarea 3, ver abajo): 0 fallos.

## Recorrido de navegador (tarea 3)

Automatizado con Puppeteer contra un servidor y una base propios, fuera de cualquier entorno
compartido:

- Servidor: `node tools/serve.js` en el puerto 8093 (no 8080, en uso por otros árboles de trabajo
  de este mismo proyecto), con `MERCA_DB` apuntando a una base temporal en `/tmp/fase07-nav/demo.db`
  sembrada con `node tools/seed.js` y una cuenta de administrador creada con `tools/admin.js crear
  ... --admin`. Se fijaron a mano dos números de serie de prueba (una placa repetida a propósito
  en dos anuncios) para poder probar el aviso de repetidos sin esperar a que alguien publique con
  ese dato.
- Chrome corre como root en este contenedor: se usó un envoltorio (`chrome-no-sandbox.sh`, fuera
  del repo) que añade `--no-sandbox`, sin tocar `tools/screenshot.js` ni ningún otro script del
  proyecto.
- El script del recorrido vive en `/tmp/fase07-nav/recorrido.js`, fuera del repositorio: es un
  script de un solo uso para este cierre de fase, no una herramienta que deba quedar versionada.

**Pasos probados y resultado:**
- Sesión de administrador (con el código de acceso leído del buzón de archivo) → ve `#adminContenido`.
- «Empresas»: 3 empresas aprobadas listadas; el buscador filtra por «Caribe» a una sola fila.
- Sello: retirarlo en blanco lo rechaza (sigue pidiendo motivo); con motivo, se retira y la fila
  pasa a `data-verificada="0"`; darlo de nuevo con motivo en blanco (opcional al dar) funciona.
- «Números de serie»: 3 anuncios con serie declarada; el aviso «La misma placa aparece en 1
  anuncio más» aparece en los dos anuncios con la placa duplicada; «Con observaciones» pide nota
  obligatoria y, con nota, queda anotada y visible en la fila («Nota: …»).
- La bitácora de administración recoge las cuatro escrituras (`organizacion.verificar` x2,
  `anuncio.serie` x3) con `antes`/`despues` y motivo, sin guardar el número de serie en la fila.

**Pendiente de Victor:** la mirada humana en claro y oscuro. Las capturas de todo el recorrido
(cola, Empresas, Números de serie, caja de motivo, resultado tras confirmar) quedaron en
`/tmp/fase07-nav/capturas/` — fuera del repositorio, para que Victor las revise localmente si lo
prefiere; no se han conservado como parte de este cierre porque el recorrido fue en modo claro
por defecto y falta el cambio a oscuro (`assets/tema.js`) sobre la misma sesión.

## Deviations from Plan

- **[Rule 3 - Blocking] Las cuentas nuevas piden código de acceso al iniciar sesión aunque nazcan
  con el correo ya verificado.** El plan (y la referencia de `auditar-flujos.js`) ya contemplaban
  esto para el flujo autenticado; se ajustó el script del recorrido para leer el código del buzón
  de archivo (`.tmp/correos`) en vez de asumir que una cuenta verificada entra sin código. No
  afecta a `admin.html` ni a `assets/admin.js`: es un ajuste del script de verificación, no del
  producto.

## Self-Check: PASSED
