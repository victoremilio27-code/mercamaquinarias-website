# Phase 7 — UI Design Contract

**Fuente:** decisiones autónomas; todo se construye con el sistema visual existente
(`styles.css`, tokens de tema claro/oscuro de la fase 2). **Prohibido:** `style=` en línea,
colores literales, CSS nuevo salvo que una clase existente no cubra el caso (en ese caso, con
tokens `var(--…)` y comprobado en claro y oscuro).

## 1. Consola (`admin.html`) — sección «Empresas»

- Posición: justo después de «Cola de revisión».
- Cabecera: `panel__cabeza` + `h2.panel__titulo.panel__titulo--limpio` «<em>Empresas</em> dealer»;
  `p.panel__meta` con el total.
- Filtros: `div.revision__filtros` con botones `btn btn--chico` (activo `btn--ambar`, resto
  `btn--linea`), `role="tablist"`: Aprobadas (por defecto) · Pendientes · Rechazadas · Todas.
  Atributo `data-empresas-estado` (no `data-estado`: lo engancha la cola).
- Búsqueda: `label.campo-v` con `input type="search"` «Buscar por nombre».
- Lista: `ul.solicitudes` de `li.sol`; cada fila: nombre (`b.sol__nombre`), `sol__meta` con
  estado de revisión, «Sello: sí/no», «Página: publicada/borrador», «N equipos activos»,
  «N series pendientes». Acciones (`sol__acciones`): «Dar el sello de verificado» / «Retirar el
  sello de verificado» (`btn btn--linea btn--chico`), «Editar su página» (`a.btn.btn--linea.btn--chico`
  a `mi-pagina.html?org=<id>`; solo dealers aprobados).
- Retirar: abre caja `sol__motivo` con `textarea` «Por qué se retira. Queda en la bitácora.» y
  botones «Confirmar retirada» (`btn--ambar`) / «Cancelar». Dar: motivo opcional en la misma caja.
- Avisos: `p.acceso__aviso` (`--bien` en éxito) con `role="alert"`.

## 2. Consola — sección «Números de serie»

- Posición: después de «Empresas».
- Filtros: Pendientes (por defecto) · Cotejados · Con observaciones · Todos. Atributo `data-serie-estado`.
- Fila `li.sol`: «Año Marca Modelo» + empresa; serie en `code`/clase `num`; si repetida,
  `p.sol__meta` con «Repetido en N anuncios» en negrita; miniaturas de hasta 4 fotos como enlaces
  (`target="_blank" rel="noopener"`) que abren la foto completa para leer la placa; enlace
  «Ver la ficha»; si revisada, «Revisada el <fecha> por <nombre>» y la nota.
- Acciones: «Coincide» (`btn--ambar`), «Con observaciones» (pide nota en `sol__motivo`:
  «Qué no cuadra. Lo lee el vendedor.»), «Volver a pendiente» (solo si revisada).
- Texto fijo bajo el título (`p.panel__meta`): «Se coteja con la placa de las fotos y contra los
  demás anuncios. No se consulta ningún registro de robo.»

## 3. Editor de página en modo soporte (`mi-pagina.html?org=<id>`)

- Franja superior (`section.panel` con `p.acceso__aviso` sin `--bien`): «Está editando la
  página de **<nombre>** en su nombre. Cada cambio queda en la bitácora. Publicar o despublicar
  es decisión de la empresa.» + `label.campo-v` «Motivo del soporte (opcional)».
- Migas: Inicio › Revisión › Página de <nombre>. Título «<em>Página</em> de <nombre>».
- Ocultos: «Publicar página» y «Despublicar». Visible «Verla como la ven» si está publicada.
- Estado: «Está publicada: los cambios se ven al momento.» / «Está en borrador: los cambios no
  se ven hasta que la empresa la publique.»

## 4. Editor del dealer (modo normal)

- Si hubo edición del personal: `p.panel__meta` bajo el estado: «El equipo de MercaMaquinarias
  editó su página el <fecha>.»

## 5. Panel del vendedor (`panel.html`) — lista de anuncios

- Si el anuncio declaró serie, una línea en la tarjeta: «Serie: pendiente de revisión» ·
  «Serie cotejada» · «Serie con observaciones: <nota>». Reutiliza las clases de meta existentes.

## 6. Ficha pública (`equipo.html`)

- Solo si `serie_cotejada`: `p.nota-verificado` con `span.pastilla.pastilla--verde` + icono
  `i-check` «Serie cotejada» y el texto: «El personal de MercaMaquinarias comprobó que el número
  de serie declarado coincide con la placa de las fotos y no se repite en otro anuncio. No es un
  certificado de propiedad ni de ausencia de robo.»

## 7. Publicar (`publicar.html`)

- Placeholder: «Opcional. No se publica: solo lo ve el personal de MercaMaquinarias».
- Ayuda `small.campo-v__ayuda`: «Si lo indica, lo cotejamos con la placa que se vea en sus fotos
  y con los demás anuncios. Si cuadra, la ficha dirá «Serie cotejada». No consultamos registros
  de robo.»
