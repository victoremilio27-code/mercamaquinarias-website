# Fase 10 — Contrato de interfaz

Contrato corto a propósito: todo reutiliza componentes que ya existen y ya pasan el
comprobador de contraste en los dos temas. Nada de colores nuevos: solo fichas del tema.

## Ficha del equipo (`equipo.html`, `montarDetalle`)

- Debajo del precio y de las condiciones, antes de la ficha técnica, una fila
  `.detalle__acciones` con dos botones `btn btn--linea btn--chico`:
  - `#btnGuardar` — icono `i-estrella`, texto «Guardar» / «Guardado»,
    `aria-pressed="false|true"`. Guardado: clase `is-activo`, icono relleno con
    `currentColor`.
  - `#btnCompartir` — icono nuevo `i-compartir` (tres nodos unidos), texto «Compartir»,
    `aria-expanded` y `aria-controls="menuCompartir"` cuando abre el desplegable.
  - Enlace `#enlaceGuardados` «Ver guardados (N)» a `guardados.html`, oculto con N = 0.
- `#menuCompartir` (oculto por defecto): dos enlaces en fila — «WhatsApp» (icono
  `i-whatsapp`, `href="https://wa.me/?text=…"`, `target="_blank"`, `rel="noopener"`) y
  el botón «Copiar enlace», que cambia a «Enlace copiado» durante 2 s. Mensaje de estado
  en `role="status"`.

## Navegación

- `montarEnlaceGuardados()` inserta `<a href="guardados.html" data-guardados>Guardados
  (N)</a>` en `#navMenu`, justo antes de `.cab__nav-cta`, solo si N > 0. En la página
  `guardados.html` lleva `aria-current="page"`.

## `guardados.html`

- Misma cabecera, pie y orden de scripts que `equipos.html`. Título «Equipos
  <em>guardados</em>», texto «Se guardan en este navegador. No hace falta cuenta.»
- `#listaGuardados` es una `ul.rejilla` con `avisoHTML(e)`; bajo cada tarjeta, dentro del
  mismo `li` contenedor, un botón `btn-tabla` «Quitar» con `data-quitar="<id>"` y
  `aria-label="Quitar <equipo> de guardados"`.
- `#guardadosVacio`: «Todavía no ha guardado ningún equipo.» con enlace «Ver equipos
  publicados» (`btn btn--ambar`).
- `#guardadosRetirados`: «N equipo(s) guardado(s) ya no están publicados.» con botón
  «Quitarlos de la lista».

## Panel del anunciante (`panel.html`, `assets/panel.js`)

- Tarjeta «Guardados»: detalle «Compradores que lo guardaron · N compartido(s)».
- Columna de acciones de cada fila: botón `btn-tabla` «Duplicar» con `data-duplicar="<id>"`
  y `aria-label="Duplicar <equipo>"`, antes de «Eliminar».
- Sección nueva «Contactos recibidos» (`#panelContactos`, `section.panel`) después de la
  tabla de anuncios: dos `select` (equipo, canal) y una tabla con columnas Fecha y hora
  (`es-DO`, zona `America/Santo_Domingo`), Equipo (enlace a la ficha) y Canal (pastilla
  «WhatsApp» o «Llamada»). Vacío: «Todavía no ha recibido contactos por el sitio.»
  Pie: «Cada fila es una persona distinta que pidió el contacto ese día.»

## Publicar (`publicar.html?duplicar=<id>`)

- `#avisoBorrador` reutilizado con otro texto: «Copia de <equipo>. Cambie lo que sea
  distinto —número de serie, horas, precio y fotos— y publíquelo.» Botón «Descartar
  borrador» igual que hoy.
