# Phase 8 — UI Design Contract

**Creado:** 2026-09-25 · Sin componentes nuevos: todo se construye con las clases que ya
existen en `styles.css` (`campo`, `campo-v`, `casillas`/`casilla`, `chip`, `pastilla`,
`btn-tabla`, `panel`, `campos`). Tema claro y oscuro heredados de la fase 2: no se
escriben colores sueltos.

## equipos.html · panel de filtros

| Elemento | Posición | Contrato |
|---|---|---|
| Nota de tasa | Debajo del rango «Precio RD$» | `<small class="campo-v__ayuda" id="notaTasa">` con «Los precios en US$ se comparan a RD$63 por dólar.» La cifra sale de la respuesta del catálogo (`tasaUsd`); sin respuesta, el texto se queda oculto. |
| «Dónde está el equipo» | Tras «Provincia» | `<select name="disponibilidad">`: «Cualquiera» (vacío), «Ya en el país» (`en-pais`), «Bajo pedido» (`bajo-pedido`). |
| «Condiciones» | Tras el anterior, antes del pie del formulario | `fieldset.campo` con leyenda «Condiciones» y `.casillas` con dos `label.casilla`: «Acepta permuta» (`name="permuta" value="1"`) y «Precio con ITBIS incluido» (`name="itbis" value="1"`). |
| Chips | Barra de resultados | «Dónde · Ya en el país / Bajo pedido», «Condición · Acepta permuta», «Condición · ITBIS incluido». Quitar uno conserva el resto. |

## Tarjeta del catálogo

- Si `bajo-pedido`: `<span class="pastilla pastilla--ambar">Bajo pedido</span>` en
  `.aviso__pie`, junto a «Acepta ofertas». En el país no lleva marca.

## equipo.html · ficha

- Bajo la línea de ubicación (`.detalle__sitio`), un párrafo `.detalle__disponibilidad`:
  - en el país: «Ya está en República Dominicana.»
  - bajo pedido: «Bajo pedido: se importa tras la venta. Confirme con el vendedor el plazo
    de entrega y si el precio incluye flete y aduana.»
- En la ficha técnica, fila «Disponibilidad» con «En el país» / «Bajo pedido».

## publicar.html · paso 1

- Junto a «Provincia donde se encuentra *»: `label.campo-v` «¿Dónde está el equipo? *»
  con `<select id="e-disponibilidad">`: «Ya está en República Dominicana» (`en-pais`, por
  defecto) y «Bajo pedido: se importa tras la venta» (`bajo-pedido`).
- La vista previa del paso final marca «Bajo pedido» igual que la tarjeta.

## panel.html · tabla de anuncios

- Columna de acciones: `button.btn-tabla[data-disponibilidad]`.
  - En el país → «Es bajo pedido» (lo pasa a bajo pedido).
  - Bajo pedido → «Ya llegó al país» con `btn-tabla--avisa` (lo pasa a en el país).
- La meta de la celda del equipo añade « · Bajo pedido» cuando corresponde.

## admin.html · tasa de referencia

- Sección `panel` «Tasa de referencia del dólar», tras la de la portada: un
  `input type="text" inputmode="decimal"` con la tasa vigente, botón «Guardar tasa» y
  «Volver al valor por defecto». Una línea dice de dónde sale la vigente («fijada por el
  equipo el …», «variable de entorno», «valor por defecto») y para qué se usa: «Solo
  para comparar y ordenar precios del catálogo. Ningún precio publicado cambia.»

## Accesibilidad

- Toda casilla y selector con `<label>` asociado; los chips mantienen el texto oculto
  «Quitar filtro». El botón del panel lleva `aria-label` con el nombre del equipo.
- Pendiente de Victor (manual): revisar a ojo los filtros nuevos en móvil y en tema
  oscuro. La auditoría automática cubre desborde horizontal y contraste.
