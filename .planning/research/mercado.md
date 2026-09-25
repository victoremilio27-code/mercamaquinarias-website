# Mercado: qué ofrecen los marketplaces de maquinaria del mundo y qué le falta a MercaMaquinarias

**Investigado:** 2026-09-25
**Enfoque:** referencias internacionales (Machinery Trader, Mascus, IronPlanet, Ritchie Bros,
MachineryZone, Machineryline, Truck1, Equipment Trader) contra lo que el sitio ya hace hoy.
**Confianza global:** MEDIA-ALTA en lo internacional (fuentes oficiales y de prensa), ALTA en
el diagnóstico del código (leído directamente), MEDIA-BAJA en lo específico de RD y el Caribe
(hay pocas fuentes formales; lo marco caso por caso).

## Cómo leer este documento

- **Verificado** = lo leí en la página del propio competidor, en una nota de prensa suya o
  en el código de este repositorio. Llevo la URL o el archivo y la línea.
- **Inferido** = conclusión mía a partir de lo anterior. No hay fuente que lo diga así.

Una corrección de entrada, antes de las tablas, porque cambia la estrategia:

1. **«No hay competencia» es cierto con matices.** No existe un marketplace dominicano
   especializado, es verdad. Pero **SuperCarros ya tiene una sección «V. Pesados» con
   Camión, Autobús y Pesados**, y declara más de 66.000 visitantes diarios
   ([supercarros.com](https://m.supercarros.com/)) — verificado. Y el terreno de búsqueda en
   español lo ocupan ya sitios débiles pero indexados: `maquinariasrd.com` se presenta como
   marketplace de clasificados de maquinaria con cuentas, categorías y planes de 0 a 59 US$
   al mes ([maquinariasrd.com](https://maquinariasrd.com/)) — verificado; `SuperEquipos`
   es un sitio Wix de anuncios gratis
   ([coronagf.wixsite.com/superequipos](https://coronagf.wixsite.com/superequipos)); y
   Locanto RD tiene su categoría de maquinaria pesada
   ([locanto.com.do](https://www.locanto.com.do/g/Maquinaria-pesada/910/)).
   Además Machineryzone y Machineryline sirven páginas en español y captan búsquedas
   regionales ([machineryzone.com](https://www.machineryzone.com/),
   [machineryline.com/about.php](https://machineryline.com/about.php)).
   **Implicación:** el vacío no es de sitios, es de un sitio *serio*. La ventaja no será
   «ser el primero», será «ser el único creíble». Eso empuja las fichas y la confianza por
   delante del volumen.

2. **El financiamiento en RD no es escaso: es disperso.** Verificado: LAFISE ofrece leasing
   hasta el 100 % de la inversión ([lafise.com/leasing](https://www.lafise.com/leasing/)),
   Promerica hasta el 80 % y plazos de hasta 7 años
   ([promerica.com.do](https://www.promerica.com.do/banca-corporativa/leasing-promerica/)),
   Motor Crédito hasta el 100 % del activo a 60 meses para camiones y maquinarias
   ([motorcredito.com.do](https://motorcredito.com.do/prestamos/financiamiento/leasing-financiero/)),
   y la ABA reporta que el arrendamiento financiero de la banca múltiple creció 129,8 %
   entre 2021 y febrero de 2024, de RD$9.142 millones a RD$21.010 millones
   ([aba.org.do](https://aba.org.do/articulos-perspectivas/leasing-republica-dominicana-oportunidad-de-crecimiento-para-empresas/)).
   Lo que no existe es un sitio que junte esas ofertas junto a la máquina. SuperCarros sí lo
   hace para carros: tiene sección de financiamiento con «las mejores ofertas actualizadas de
   las instituciones financieras» y calculadora de cuota
   ([m.supercarros.com/financiamiento](https://m.supercarros.com/financiamiento)) — verificado.
   `assets/servicios.js` ya tiene el interruptor de financiamiento apagado; el hueco no es
   construir el servicio, es **qué se pone dentro**.

---

## 1. Qué tienen los grandes y nosotros no

«¿Importa aquí?» es mi juicio para el mercado dominicano de 2026, no un dato.

| Función | Quién la tiene (verificado) | ¿La tenemos? | ¿Importa aquí? |
|---|---|---|---|
| Informe de inspección por un tercero, con fotos, prueba funcional y análisis de aceites | IronPlanet / Ritchie Bros — «IronClad Assurance»: un inspector visita la máquina, califica sistemas y componentes, hace pruebas funcionales y, cuando aplica, análisis de laboratorio de aceites y fluidos buscando contaminantes y metales de desgaste ([ironplanet.com/ironclad-assurance](https://www.ironplanet.com/ironclad-assurance)); Ritchie Bros. hace más de 100.000 inspecciones al año ([rbglobal.com/solutions/services](https://rbglobal.com/solutions/services/)) | No | **Sí, y es el mayor diferenciador posible.** Es lo único que resuelve el problema real: comprar una máquina de millones a un desconocido. Pero es un servicio con personas, no software |
| Garantía de que la máquina coincide con el informe, con ventana de reclamo | IronPlanet: si el bien no está en la condición descrita, el comprador reclama dentro de **un día hábil** de recibirlo ([ironplanet.com/ironclad-assurance](https://www.ironplanet.com/ironclad-assurance), [política](https://www.rbauction.com/legal-policies/ironclad-assurance-policy)) | No | Sí, pero solo tiene sentido si antes existe la inspección |
| Datos de subasta y valores de referencia (cuánto vale de verdad) | Sandhills/Machinery Trader: AuctionValues.com, base continuamente actualizada y buscable de resultados de subasta de construcción, agricultura y transporte ([nota](https://www.machinerytrader.com/blog/sandhills-news/2024/02/sandhills-global-launches-auction-values-comprehensive-resource-for-industry-auction-prices)); Ritchie Bros/Rouse hace tasaciones consideradas referencia de industria ([nota](https://www.prnewswire.com/news-releases/ritchie-bros-announces-rouse-appraisal-services-301268049.html)) | No | Sí, a mediano plazo. **Y es la ventaja compuesta del que llega primero:** cada anuncio publicado hoy es un dato de precio dominicano que nadie más tendrá |
| Búsquedas guardadas y alertas por correo o SMS cuando aparece lo buscado | Machinery Trader: «Saved Searches» y alertas de texto cuando sale a la venta o a subasta lo que buscas ([blog](https://www.machinerytrader.com/blog/how-to-and-tips/2025/09/how-to-search-machinery-trader-for-construction-equipment)). SuperCarros: hasta **5 alertas** por correo ([m.supercarros.com/buscar](https://m.supercarros.com/buscar)) | No | **Sí, y es lo más barato de construir de toda esta tabla.** Un comprador de maquinaria busca durante meses; sin alerta, se va y no vuelve |
| Favoritos / guardados | SuperCarros: «Mis Favoritos» ([m.supercarros.com](https://m.supercarros.com/)) | **A medias, y mal:** el panel ya pinta una tarjeta «Guardados» (`assets/panel.js:139`) y `tools/db.js:2735` sabe contar el evento `favorito`, pero **nada en el navegador lo emite**. La tarjeta siempre dirá 0 | Sí. Hoy es una promesa visible que se incumple en la primera pantalla que ve el anunciante |
| Filtros por especificación técnica del tipo de máquina | Truck1 filtra 450.000 anuncios por marca, precio, norma Euro, **configuración de ejes** y otras especificaciones ([truck1.eu/txt/how_buyer](https://www.truck1.eu/txt/how_buyer)); Machinery Trader tiene filtro de tipo de anuncio: en venta, alquiler, leasing, subasta en curso y resultados de subasta ([blog](https://www.machinerytrader.com/blog/how-to-and-tips/2025/09/how-to-search-machinery-trader-for-construction-equipment)) | No. `equipos.html:79-140` filtra categoría, subcategoría, marca, condición, año, horas (solo máximo) precio y provincia. Nada por especificación | Sí, por tipo. Quien busca una grúa busca capacidad de izaje, no «grúa» |
| Carga masiva de inventario y feeds automáticos hacia el sitio | Mascus da soluciones de gestión de stock a dealers, brókeres y exportadores ([mascus.com/solutions-sellers](https://www.mascus.com/solutions-sellers)); Trader Interactive tiene TraderTraxx para gestión de inventario y **TraderConnect**, que inserta el inventario de Equipment Trader en los sitios de los fabricantes actualizado en tiempo real ([traderinteractive.com](https://www.traderinteractive.com/trader-interactives-new-traderconnect-embeds-dealer-listings-in-oem-websites-to-increase-leads/)) | No. `publicar.html` es un asistente de 5 pasos, una máquina a la vez | **Todavía no.** Con cero dealers a bordo, la carga masiva no resuelve nada; con quince, es lo que decide si se quedan |
| Gestión de contactos (leads) para el vendedor | Equipment Trader: «Lead Manager» da al dealer control y visibilidad de los contactos que recibe, con inventario y métricas de desempeño en un solo sistema ([traderinteractive.com](https://www.traderinteractive.com/trader-interactives-new-traderconnect-embeds-dealer-listings-in-oem-websites-to-increase-leads/)) | No, y es el hueco más grave (ver sección 3) | Sí |
| Página propia del dealer con su inventario reunido | Mascus, MachineryZone (`/pros/list/` — [directorio de dealers](https://www.machineryzone.eu/pros/list/1.html)), Truck1 con su icono de «Dealer status», SuperCarros con su directorio de dealers | **Sí, y bien.** `dealer.html` + `mi-pagina.html` + `dealers.html`: logo, portada, lema, galería, bloques reordenables, borrador/publicada, sucursales en `panel.html` | Sí. Aquí ya estamos a la altura o por encima |
| Anuncios promocionados / destacados | Truck1 vende destacados con color, tamaño y etiquetas publicitarias, más remarketing, banners y campañas en YouTube y redes ([truck1-us.com/txt/services_seller](https://www.truck1-us.com/txt/services_seller)) | Sí, hay destacados (`destacado_hasta`, marca en `assets/app.js` y orden `destacados` en `tools/db.js:2412`) y espacios publicitarios por tarifario | Sí, ya resuelto |
| Estadísticas al vendedor | Truck1: «estadísticas detalladas» en el panel del vendedor ([mismo enlace](https://www.truck1-us.com/txt/services_seller)) | Sí: vistas, contactos y tasa de contacto de 30 días (`assets/panel.js:118-139`), más serie diaria en `tools/db.js:2961` | Sí, ya resuelto |
| Chat con traducción automática | Truck1 ofrece chat autotraducido con vendedores globales ([truck1.eu/txt/how_buyer](https://www.truck1.eu/txt/how_buyer)) | No | **No.** Mercado monolingüe. Sería trabajo tirado |
| Financiamiento y transporte desde la ficha | Ritchie Bros: financiamiento propio y envío con uShip y VeriTread ([help.ritchiebros.com](https://help.ritchiebros.com/ritchie-bros-auctioneers-services-for-buying/)) | Construido y **apagado** a propósito en `assets/servicios.js` (Fase 2) | Sí. Y el `assets/mapa.js` de seguimiento ya está escrito y hoy no lo carga ninguna página |
| Verificación de robo por número de serie | Registro externo: NER/Verisk con IRONcheck, más de 20 millones de registros de robo y propiedad para establecer exactitud e historial del PIN ([ner.net/solutions/ironcheck](https://www.ner.net/solutions/ironcheck/), [HELPtech](https://www.ner.net/solutions/helptech/)) | **No, y peor:** el número de serie se pide y se guarda pero no se usa (ver sección 4) | Sí, pero no hay equivalente dominicano al que consultar. Ver sección 5 |
| App móvil | Machinery Trader, MachineryZone, Machineryline y Truck1 tienen app en Google Play | No | **No.** El sitio es responsive; una app nativa a cambio de nada. Descartado |

---

## 2. Lo que un comprador de maquinaria necesita ver en una ficha

Lo que el consenso técnico dice que decide una compra, comparado con lo que capturan
`publicar.html` y `assets/taxonomia.js`. La referencia de qué mirar viene de guías de
inspección de excavadora usada, que coinciden en el mismo orden: motor, hidráulica, tren de
rodaje, neumáticos, chasis, **registros de mantenimiento**, horas, implementos, sistemas de
seguridad y evidencia de reparaciones previas
([boomandbucket.com](https://www.boomandbucket.com/blog/10-things-to-check-when-buying-used-heavy-equipment),
[highways.today](https://highways.today/2026/09/10/buying-a-used-excavator/)) — MEDIA,
son fuentes de industria, no normativas.

| Lo que el comprador necesita | ¿Lo capturamos? | Dónde, y el hueco exacto |
|---|---|---|
| Marca, modelo, año, tipo | **Sí, y mejor que la mayoría.** La jerarquía categoría → subcategoría → marca → modelo de `assets/taxonomia.js` impide publicar una excavadora marca Genie, y `MODELOS` da listas por par subcategoría+marca con salida «Otro modelo» | `publicar.html:94-108`. Esto es una fortaleza real frente a Facebook Marketplace |
| Horas de horómetro o kilómetros, con la unidad correcta | **Sí.** Y bien pensado: la unidad es explícita y el orden por uso manda al final lo que no lleva horómetro (`tools/db.js:2418-2422`) | `publicar.html:117-123`. El hueco está en el filtro: `equipos.html:120` solo ofrece **horas máximas**, no un mínimo ni un rango |
| Motor y transmisión (marca y modelo) | **Sí**, en el bloque de tren motriz | `publicar.html:130-145`, se dibuja en la ficha en `assets/app.js` (`fichaTecnicaHTML`) |
| Potencia y peso operativo | Sí, pero como **texto libre** («Ej. 148 hp», «Ej. 21,500 kg») | `publicar.html:151-155`. Al ser texto no se puede filtrar ni ordenar. Un rango «de 20 a 25 toneladas» es imposible hoy |
| Registros de mantenimiento | **No.** Hay descripción libre que los pide de palabra: «Mantenimientos realizados, uso que se le dio, trabajos pendientes y componentes reemplazados» | `publicar.html:168-170`. **No existe forma de adjuntar un documento a un anuncio.** Solo fotos (`tools/fotos.js`) y video (`tools/videos.js`). Una factura de servicio o un reporte de aceites hay que fotografiarla |
| Porcentaje de tren de rodaje / desgaste de zapatas, rodillos, sprockets | **No hay campo.** Cae en implementos o en la descripción | Y ojo: las guías advierten que **no se debe aceptar un «porcentaje restante» sin sustento del vendedor** ([highways.today](https://highways.today/2026/09/10/buying-a-used-excavator/)). Un campo numérico de tren de rodaje sin inspección detrás inventa precisión. Mejor: pedir fotos obligatorias del tren de rodaje por categoría de oruga |
| Implementos y accesorios incluidos | **Sí, pero como una sola línea de texto** | `publicar.html:164-166`, `e-implementos`: «Ej. Cucharón de 1.2 m³, martillo hidráulico, zapatas nuevas». No es lista, no es filtrable, y el martillo hidráulico —que puede ser el 20 % del valor— es indistinguible de un adjetivo |
| Número de serie / VIN / PIN | **Se pide y se guarda, y no sirve para nada.** El campo dice «Opcional, solo visible para el equipo de verificación» | `publicar.html:148-149` → `tools/api.js:2310` → `db/schema.sql:578`. Escritura sin lectura: no lo muestra ninguna pantalla, no lo revisa ningún flujo de admin, no se coteja contra nada. Prometer verificación y no verificar es peor que no pedirlo (ver sección 5) |
| Telemática / datos del propio equipo | No | Existe un estándar de industria para esto (AEMP / ISO 15143-3) — **inferido de mi conocimiento previo, no lo verifiqué en esta investigación**. Irrelevante para nosotros por años: exige acuerdos con fabricantes |
| Fotos suficientes y video | **Sí, y bien resuelto.** Galería, tope de fotos por membresía (`assets/publicar.js:1223`), video con `preload="metadata"` y póster para no quemar datos móviles, streaming con rangos en `tools/serve.js` | Truck1 destaca «videos de arranque del motor» como parte de la ficha ([truck1.eu/txt/how_buyer](https://www.truck1.eu/txt/how_buyer)). Nosotros tenemos el video; lo que falta es **pedir ese video en concreto** en el paso 2 |
| Ubicación de la máquina | Sí: provincia obligatoria y municipio o sector | `publicar.html:157-161`. Suficiente para RD |
| Precio, moneda y condiciones comerciales | Sí, y con detalle que los grandes no tienen: mínimo aceptable privado, ITBIS incluido, permuta, facilidades de pago | `publicar.html:220-248`, se pinta en `condicionesHTML` (`assets/app.js:929`). La permuta y el ITBIS son muy dominicanos y están bien puestos |
| Comparar precio contra el mercado | No, y no se puede todavía: hace falta inventario | Es el activo que se acumula desde el día uno |

### El defecto que encontré leyendo el código

**El filtro y el orden de precio ignoran la moneda.** `assets/data.js:50-53` permite publicar
en DOP o USD. Pero `tools/db.js:2460-2461` compara `a.precio` crudo contra `precioMin` y
`precioMax`, y `ORDENES_SQL['precio-asc']` / `['precio-desc']` (`tools/db.js:2414-2415`)
ordenan por `a.precio` sin mirar `a.moneda`. Consecuencia concreta: una excavadora en
**US$120.000** queda fuera del filtro «desde RD$1.000.000» y aparece más barata que una
camioneta de RD$500.000 en el orden ascendente. Como los equipos importados se cotizan en
dólares y los usados locales en pesos, esto va a golpear exactamente a los anuncios de mayor
valor del catálogo.

Lo notable es que el equipo **ya resolvió el mismo problema para otra unidad**: el comentario
de `tools/db.js:2418-2420` explica que mezclar horas y kilómetros en un mismo orden compara
unidades distintas, y por eso los que no llevan horómetro caen al final. El precio tiene el
mismo defecto sin la misma defensa.

---

## 3. Lo que un vendedor o dealer necesita para vender de verdad

Lo que hacen los grandes por el lado vendedor, en orden de lo que más nos falta:

**a) Un buzón de contactos. Esto es el hueco número uno de todo el documento.**

Verificado en el código: la ficha ofrece exactamente dos vías, `tel:` y `wa.me` con el mensaje
ya redactado (`assets/app.js` en `contactosHTML`, aprox. líneas 855-892). **No existe ningún
formulario de mensaje en el sitio.** Consecuencias:

- El vendedor no tiene bandeja. Si no contesta el WhatsApp, el contacto no existió.
- MercaMaquinarias no tiene ningún registro del contenido del contacto. Sabe que hubo un
  clic (`anotar(e.id, 'whatsapp')`, `assets/app.js:1017`) y nada más.
- `tools/db.js:2730-2737` ya tiene columna para el evento `correo` y **nada la emite**: como
  los favoritos, es infraestructura esperando una pantalla.
- Y el argumento de venta se cae solo: si el contacto sale por WhatsApp igual que en un grupo
  de Facebook, ¿qué compró el dealer con su suscripción? Compró alcance, sí — pero no puede
  demostrar que los contactos vinieron de aquí, porque nada queda escrito de este lado.

Equipment Trader vende justamente eso: «Lead Manager» con control y visibilidad de los
contactos, inventario y métricas de desempeño en un solo sistema
([traderinteractive.com](https://www.traderinteractive.com/trader-interactives-new-traderconnect-embeds-dealer-listings-in-oem-websites-to-increase-leads/)).

**Matiz importante para RD:** el formulario **no sustituye** al WhatsApp, lo acompaña. Ver
sección 5.

**b) Carga masiva de inventario.** Mascus ofrece soluciones de gestión de stock a dealers,
brókeres, exportadores y fabricantes
([mascus.com/solutions-sellers](https://www.mascus.com/solutions-sellers)); Trader Interactive
tiene TraderTraxx y TraderConnect con actualización en tiempo real hacia sitios de fabricantes
([traderinteractive.com](https://www.traderinteractive.com/trader-interactives-new-traderconnect-embeds-dealer-listings-in-oem-websites-to-increase-leads/)).
Nosotros: asistente de 5 pasos, una máquina por vez (`publicar.html`).

Y aquí hay una pista del terreno local que vale oro: `maquinariasrd.com` usa como argumento
comercial **subir los anuncios por el vendedor**, contra la queja de que «tengo que ingresar
todo el equipo por mi cuenta» ([maquinariasrd.com](https://maquinariasrd.com/)) — verificado.
Un dealer dominicano con 30 máquinas no va a llenar 30 asistentes de 5 pasos. **Inferido:** en
el corto plazo el sustituto correcto no es un importador de CSV, es que alguien de la empresa
las suba (servicio, no software). Eso ya existe como práctica en el mercado y no cuesta código.

**c) Duplicar un anuncio.** No lo vi en el código. Un dealer que vende cinco retroexcavadoras
del mismo modelo llena la misma ficha cinco veces. Es la mejora de carga masiva más barata
que existe y no cambia nada de la arquitectura.

**d) Estadísticas.** Aquí estamos bien: vistas, contactos y tasa de contacto sobre 30 días
(`assets/panel.js:118-139`), con el criterio honesto de contar personas y no pulsaciones, y
con un umbral mínimo antes de mostrar un porcentaje. Truck1 solo promete «estadísticas
detalladas» ([truck1-us.com](https://www.truck1-us.com/txt/services_seller)). Lo que falta es
menor: el panel no tiene **de dónde vino la visita** ni comparación contra anuncios parecidos
(«su excavadora recibe la mitad de las vistas que el promedio de su categoría»), que es la
métrica que hace que el dealer pague por destacar.

**e) Promoción.** Ya resuelto: destacados con vencimiento y espacios publicitarios del
tarifario. Truck1 lo vende igual, con color, tamaño y etiquetas
([truck1-us.com](https://www.truck1-us.com/txt/services_seller)).

**f) Marcar vendido y liberar el cupo.** `db/schema.sql:568` tiene el estado `vendido` y el
panel conserva visitas y contactos al marcarlo (`assets/panel.js:833`). Es más de lo que hace
un grupo de WhatsApp, y es el dato que alimentará el histórico de precios. Mantener.

---

## 4. Confianza y verificación

El estándar internacional en operaciones de alto valor, verificado:

| Mecanismo | Cómo lo hacen | Nuestra situación |
|---|---|---|
| Inspección por un tercero con informe publicado | IronPlanet: inspector presencial, calificación de sistemas y componentes, pruebas funcionales, muchas fotos y análisis de laboratorio de aceites; con el límite explícito de que **no incluye pruebas de carga ni de excavación** ([ironplanet.com/ironclad-assurance](https://www.ironplanet.com/ironclad-assurance), [política](https://www.rbauction.com/legal-policies/ironclad-assurance-policy)) | No existe. Es el diferenciador de un año, no de una semana |
| Garantía condicionada al informe | Reclamo del comprador en **un día hábil** si no coincide ([ironplanet.com](https://www.ironplanet.com/ironclad-assurance)) | No, y no debe prometerse sin inspección |
| Verificación de la empresa vendedora | Truck1: icono de «Dealer status» con fiabilidad, años operando con Truck1 y condición de socio oficial de fabricantes; y afirma que **revisa cada empresa** que quiere anunciarse ([truck1.eu/txt/security_buyer](https://www.truck1.eu/txt/security_buyer)) | **Sí, y con una honestidad superior a la del sector.** `dealers.html:59-74` documenta que se corrigió el texto: ya no dice «todas están verificadas» ni «titularidad comprobada», porque lo que se comprueba es que la razón social y el RNC correspondan a una empresa inscrita en el registro mercantil. `assets/app.js:993` repite el límite en la ficha: «No certifica la calidad del equipo ni garantiza la operación» |
| Historial de robo y exactitud del PIN | NER/IRONcheck: más de 20 millones de registros de robo y propiedad; analistas entrenados en detectar inconsistencias en placas de PIN y números de modelo ([ner.net/solutions/ironcheck](https://www.ner.net/solutions/ironcheck/)) | **Aquí hay una promesa incumplida en el código.** `publicar.html:149` le dice al usuario que el número de serie es «solo visible para el equipo de verificación». Verificado: se guarda en `db/schema.sql:578` y **no lo lee nadie**. No hay pantalla de admin que lo muestre ni proceso que lo coteje. Es una frase que compromete a la empresa a una diligencia que no ocurre |
| Custodia de fondos (escrow) | Machineryline se describe como intermediario entre vendedor y comprador con «transacciones seguras» ([machineryline.com/about.php](https://machineryline.com/about.php)) — **el detalle de qué garantiza no lo pude verificar**. Truck1, en cambio, **no ofrece escrow**: su guía dice literalmente «nunca haga transferencias antes de firmar el acuerdo de compra», y advierte de precios un tercio o la mitad del mercado, pagos por Western Union o MoneyGram, empresas sin dirección ni sitio web, y correos gratuitos para operaciones grandes ([truck1.eu/txt/security_buyer](https://www.truck1.eu/txt/security_buyer)) | No retenemos fondos y así lo dice la ficha (`assets/app.js:1001`). **Correcto, y debe seguir así.** Retener dinero de terceros es otro negocio, con otra regulación |
| Educar al comprador sobre el fraude | Truck1 publica una página completa de señales de estafa ([truck1.eu/txt/security_buyer](https://www.truck1.eu/txt/security_buyer)) | No la tenemos. `legal.html` cubre términos, privacidad y política de anuncios. **Es la medida de confianza más barata del documento:** una página con las señales de estafa en maquinaria, adaptada a RD, y un enlace desde la ficha junto al aviso que ya existe |

**Conclusión de la sección:** la postura de MercaMaquinarias sobre qué promete y qué no es
mejor que la de la mayoría de los competidores — está escrita en los comentarios del propio
código y es defendible. El único agujero es el número de serie: o se construye el flujo que
lo revisa, o se cambia el texto de `publicar.html:149` antes de lanzar.

---

## 5. Lo que aplica a RD y el Caribe, y no aplica a EEUU o Europa

**a) WhatsApp no es un canal más: es el canal.** Verificado con reservas de calidad de fuente:
WhatsApp es la red más usada en RD con 68,2 %, por delante de Facebook con 61,9 %, según el
estudio «Cultura de la Democracia» 2018/19
([Diario Libre](https://www.diariolibre.com/actualidad/whatsapp-es-la-red-social-mas-usada-en-la-republica-dominicana-PG15461187),
[DPL News](https://dplnews.com/whatsapp-es-la-red-social-mas-usada-en-la-republica-dominicana/)) —
el dato es de 2018/19 y el porcentaje sin duda subió, así que tómese como piso, no como
medida actual. El 83,6 % de los usuarios de WhatsApp lo usa a diario, contra 62,5 % de
Facebook ([La UNI](https://launi.com.do/el-68-por-ciento-usuarios-de-telefonicas-en-rd-prefieren-whatsapp-y-lo-usan-para-hablar-de-politica/)).

El sitio ya lo entendió: `assets/app.js` arma el enlace `wa.me` con el mensaje redactado, y el
comentario del código lo justifica bien — «obligar a copiar el número a mano pierde la mitad de
esas conversaciones». También cuenta WhatsApp y llamada como eventos separados, que es la
decisión correcta.

**La implicación que un sitio de EEUU no tendría:** el formulario de mensaje que propongo en la
sección 3 **no puede competir con el botón de WhatsApp ni desplazarlo**. Aquí un formulario que
promete respuesta por correo es un contacto que muere. **Inferido:** la forma que sí encaja es
un botón de WhatsApp que, además de abrir el chat, registre el contacto del lado del sitio
—qué máquina, cuándo, y opcionalmente quién si hay sesión—, de modo que el vendedor tenga
constancia de que hubo 14 interesados este mes aunque la conversación entera viva en su
teléfono. Eso es un buzón sin robarle el canal a nadie.

**b) El teléfono de soporte no aplica.** `CLAUDE.md` lo prohíbe: solo correo y el asistente del
sitio. Es contraintuitivo en un mercado telefónico, y conviene tenerlo presente al medir por
qué un dealer no completa el registro. No es una recomendación de cambio; es un dato del
contexto.

**c) La logística de importación es parte del producto, no un extra.** El sitio ya tiene
`importar.html` y solicitudes de importación, que es más de lo que ofrece cualquier sitio
extranjero para un comprador dominicano. Lo que el comprador local necesita saber y no está en
ninguna ficha: si la máquina **ya está en el país** o hay que traerla, y con qué costo.
La documentación que exige la DGA para importar maquinaria (factura comercial, conocimiento de
embarque, lista de empaque, certificado de origen, póliza, DUA, registro previo como importador
ante la DGA, y permisos del MICM o Agricultura según el equipo) la reportan agentes aduanales
y no la fuente oficial: confianza **BAJA**, verificar con la DGA antes de publicarla
([macro-bridge.com](https://macro-bridge.com/servicios/aduanas/tramites-aduanales-para-la-importacion-de-maquinaria/),
[cps-dom.com](https://cps-dom.com/que-permisos-se-necesitan-para-importar-republica-dominicana/),
portal oficial: [aduanas.gob.do](https://www.aduanas.gob.do/preguntas-frecuentes/)).
**Inferido, y es lo más accionable de esta sección:** un indicador en la ficha de **«ya en el
país / bajo pedido»** vale más que cualquier página de contenido, y es un campo, no un servicio.

**d) La moneda dual es una condición del mercado, no una preferencia.** Ver el defecto de la
sección 2. En EEUU o Europa nadie mezcla dos monedas en un mismo catálogo; aquí es lo normal
y el código no lo contempla en filtros ni orden.

**e) Permuta e ITBIS.** Ya están capturados (`publicar.html:245-247`) y ningún sitio extranjero
los tiene. Es ventaja local real; conviene que sean **filtros** del catálogo, no solo etiquetas
de la ficha.

**f) Financiamiento: agregar, no originar.** Ver la corrección de la entrada. Existe leasing de
maquinaria en RD (LAFISE, Promerica, Motor Crédito, Banco Popular) y creció 129,8 % en cuatro
años según la ABA. SuperCarros ya demuestra el patrón con su sección de financiamiento y su
calculadora. Cuando se encienda el interruptor de `assets/servicios.js`, lo que debe haber
dentro es **una lista de instituciones reales y una calculadora de cuota**, no un formulario
genérico.

**g) El sello del registro mercantil pesa más aquí.** En un mercado donde la alternativa es un
perfil de Facebook, «razón social y RNC cotejados contra el registro mercantil» es una señal
mucho más fuerte de lo que sería en Europa. Está bien hecho y bien delimitado en
`dealers.html`. Conviene que sea **filtro del catálogo** («solo anunciantes verificados»), que
es el uso que le da valor comercial al sello.

---

## 6. Huecos priorizados

### Imprescindible antes de lanzar (30 de septiembre, tope ~16 de octubre)

Criterio: o corrige algo que ya está roto o prometido en falso, o es tan barato que no
lanzarlo sin ello no tiene excusa. Nada de esto requiere dependencias nuevas ni cambia la
arquitectura.

1. **Precio y moneda en filtros y orden** (`tools/db.js:2460-2461`, `2414-2415`). Es un defecto
   funcional, no una mejora, y golpea a los anuncios más caros. Es lo único de esta lista que
   puede hacer que un dealer diga «su buscador no funciona» el primer día.
2. **Arreglar o retirar la promesa del número de serie** (`publicar.html:149`). Una de dos: se
   añade a la pantalla de administración de solicitudes que ya está en Fase 1, o se cambia el
   texto. Dejarlo así es prometer una diligencia inexistente, exactamente lo que el equipo ya
   corrigió a mano en `dealers.html`.
3. **Favoritos**, con el evento `favorito` que `tools/db.js:2735` ya sabe contar. Hoy el panel
   promete una tarjeta «Guardados» que siempre dirá 0 (`assets/panel.js:139`). Y es la función
   que SuperCarros tiene y define lo que un dominicano espera de un portal.
4. **Botón de compartir en la ficha**, con el evento `compartir` que también existe sin emisor.
   Los metadatos de WhatsApp ya están hechos (`tools/meta.js`): falta el botón que los use. En
   un mercado donde el equipo se recomienda por WhatsApp, es la vía de crecimiento más barata
   que hay.
5. **Registrar el contacto de WhatsApp como contacto, no solo como clic.** Versión mínima del
   buzón: el clic ya se anota; lo que falta es que el panel del anunciante liste **qué anuncio
   y cuándo**, no solo el total. Sin esto el dealer no puede atribuir ni una venta al sitio, y
   es la primera pregunta que hará al renovar.
6. **Indicador «ya en el país / bajo pedido»** en la ficha. Un campo, enorme valor local.
7. **Duplicar anuncio** desde el panel. La única concesión realista a la carga masiva antes de
   lanzar.
8. **Página de señales de estafa**, al estilo de la de Truck1 pero dominicana, enlazada desde
   el aviso que ya está en la ficha (`assets/app.js:1001`). Texto, no código.

### Lo que nos hace la referencia en un año

En orden de cuánto separa a MercaMaquinarias de cualquier alternativa:

1. **Inspección propia con informe publicado en la ficha.** Es el modelo IronClad y es la
   respuesta al problema de fondo del mercado dominicano: no hay forma de confiar en una
   máquina de un desconocido. Requiere personas, un protocolo escrito, un formato de informe
   —y **adjuntar documentos a un anuncio**, que hoy no se puede: solo fotos y video. Nótese la
   advertencia de la sección 2: el informe debe describir lo observado, no certificar
   porcentajes ni prometer pruebas de carga, igual que IronPlanet acota lo suyo.
2. **Alertas y búsquedas guardadas.** Machinery Trader y SuperCarros las tienen; SuperCarros
   permite cinco. Es lo que convierte una visita en un usuario que vuelve durante los seis
   meses que dura la búsqueda de una máquina. Barato, pero depende de los créditos SMS de
   Brevo y del correo, así que encaja mejor después del lanzamiento.
3. **Datos de precio dominicanos.** El estado `vendido` ya conserva el histórico. Con
   suficientes anuncios, «cuánto vale una 320D de 2016 en RD» es un dato que nadie más en el
   país puede producir. Es el AuctionValues local y el foso defensivo del proyecto.
4. **Especificaciones por tipo de máquina, filtrables.** Capacidad de cucharón, capacidad de
   izaje, altura de trabajo, configuración de ejes, potencia y peso como números y no como
   texto. `assets/taxonomia.js` ya tiene la estructura jerárquica donde colgarlas: es la
   extensión natural de un archivo que ya declara qué marcas fabrican cada subcategoría.
5. **Implementos como lista estructurada y filtrable**, no la línea de texto de
   `publicar.html:164`. Un martillo hidráulico cambia el precio y hoy es indistinguible de un
   adjetivo.
6. **Financiamiento agregado** al encender el interruptor de Fase 2: instituciones reales y
   calculadora, con el patrón que SuperCarros ya validó en RD.
7. **Transporte con el mapa que ya está escrito.** `assets/mapa.js` existe, está comentado con
   cuidado («la escala es provincia a provincia, que es la resolución real de un lowboy
   cruzando el país») y ninguna página lo carga. Es valor construido esperando el interruptor.
8. **Carga masiva o feed de inventario.** Última a propósito. Solo importa cuando haya dealers
   con inventarios grandes, y hasta entonces «lo subimos nosotros» —lo que `maquinariasrd.com`
   usa como argumento comercial— es más efectivo y no cuesta código.

**Lo que recomiendo NO construir**, para que no aparezca en una lista futura: escrow o
retención de fondos (otro negocio, otra regulación; Truck1 tampoco lo hace), chat con
traducción automática (mercado monolingüe), app nativa (el sitio es responsive y los grandes
la tienen por escala, no por necesidad), e integración de telemática (exige acuerdos con
fabricantes que un sitio nuevo no consigue).

---

## Fuentes

**Confianza ALTA — página oficial del competidor o código de este repositorio**
- IronPlanet, IronClad Assurance: https://www.ironplanet.com/ironclad-assurance
- Política IronClad, Ritchie Bros.: https://www.rbauction.com/legal-policies/ironclad-assurance-policy
- RB Global, servicios: https://rbglobal.com/solutions/services/
- Ritchie Bros., servicios de compra (financiamiento, uShip, VeriTread): https://help.ritchiebros.com/ritchie-bros-auctioneers-services-for-buying/
- Truck1, servicios al vendedor: https://www.truck1-us.com/txt/services_seller
- Truck1, seguridad del comprador: https://www.truck1.eu/txt/security_buyer
- Truck1, cómo comprar: https://www.truck1.eu/txt/how_buyer
- NER/Verisk, IRONcheck: https://www.ner.net/solutions/ironcheck/ · HELPtech: https://www.ner.net/solutions/helptech/
- Mascus, soluciones para vendedores: https://www.mascus.com/solutions-sellers
- MachineryZone, directorio de dealers: https://www.machineryzone.eu/pros/list/1.html
- Machineryline, acerca de: https://machineryline.com/about.php
- SuperCarros: https://m.supercarros.com/ · financiamiento: https://m.supercarros.com/financiamiento · buscar/alertas: https://m.supercarros.com/buscar
- DGA, preguntas frecuentes: https://www.aduanas.gob.do/preguntas-frecuentes/
- Código: `assets/taxonomia.js`, `assets/app.js`, `assets/panel.js`, `assets/publicar.js`, `assets/data.js`, `assets/mapa.js`, `publicar.html`, `equipos.html`, `equipo.html`, `dealers.html`, `tools/db.js`, `tools/api.js`, `db/schema.sql`

**Confianza MEDIA — nota de prensa, prensa especializada o blog del propio competidor**
- Sandhills lanza AuctionValues: https://www.machinerytrader.com/blog/sandhills-news/2024/02/sandhills-global-launches-auction-values-comprehensive-resource-for-industry-auction-prices
- Machinery Trader, cómo buscar (filtros, búsquedas guardadas, alertas): https://www.machinerytrader.com/blog/how-to-and-tips/2025/09/how-to-search-machinery-trader-for-construction-equipment
- Trader Interactive, TraderConnect y Lead Manager: https://www.traderinteractive.com/trader-interactives-new-traderconnect-embeds-dealer-listings-in-oem-websites-to-increase-leads/
- Ritchie Bros., Rouse Appraisal Services: https://www.prnewswire.com/news-releases/ritchie-bros-announces-rouse-appraisal-services-301268049.html
- Ritchie Bros. adquiere Mascus: https://www.prnewswire.com/news-releases/ritchie-bros-acquires-mascus---a-leading-global-online-equipment-listing-service-569396501.html
- ABA, leasing en RD (crecimiento 129,8 %): https://aba.org.do/articulos-perspectivas/leasing-republica-dominicana-oportunidad-de-crecimiento-para-empresas/
- LAFISE leasing: https://www.lafise.com/leasing/ · Promerica: https://www.promerica.com.do/banca-corporativa/leasing-promerica/ · Motor Crédito: https://motorcredito.com.do/prestamos/financiamiento/leasing-financiero/
- Qué revisar en maquinaria usada: https://www.boomandbucket.com/blog/10-things-to-check-when-buying-used-heavy-equipment · https://highways.today/2026/09/10/buying-a-used-excavator/
- WhatsApp la red más usada en RD (dato de 2018/19): https://www.diariolibre.com/actualidad/whatsapp-es-la-red-social-mas-usada-en-la-republica-dominicana-PG15461187 · https://dplnews.com/whatsapp-es-la-red-social-mas-usada-en-la-republica-dominicana/ · https://launi.com.do/el-68-por-ciento-usuarios-de-telefonicas-en-rd-prefieren-whatsapp-y-lo-usan-para-hablar-de-politica/

**Confianza BAJA — fuente comercial única, sin contraste oficial**
- Trámites aduanales de importación de maquinaria en RD: https://macro-bridge.com/servicios/aduanas/tramites-aduanales-para-la-importacion-de-maquinaria/ · https://cps-dom.com/que-permisos-se-necesitan-para-importar-republica-dominicana/
- Panorama local: https://maquinariasrd.com/ · https://coronagf.wixsite.com/superequipos · https://www.locanto.com.do/g/Maquinaria-pesada/910/

## Lo que no pude verificar

- **Mascus y Machinery Trader devolvieron 403** a la lectura automática de sus páginas
  (`mascus.com/solutions-sellers`, `info.machinerytrader.com`). Lo que afirmo de ellos viene
  de resultados de búsqueda y notas de prensa, no de la página leída entera. En concreto **no
  pude confirmar los formatos exactos de carga masiva ni de feed** (CSV, XML, API) de Mascus.
- **Qué garantiza exactamente Machineryline** al llamarse «intermediario con transacciones
  seguras»: no encontré la letra pequeña. No asumir que es escrow.
- **Telemática (AEMP / ISO 15143-3):** lo menciono desde conocimiento previo y **no lo
  verifiqué** en esta investigación. Irrelevante para el plazo, pero no citarlo como hecho.
- **Precio de las suscripciones de los competidores**: fuera de alcance a propósito, porque el
  modelo de planes y precios de MercaMaquinarias se trabaja por otro lado.
- **Volumen real del mercado dominicano de maquinaria usada** (unidades o valor al año): no hay
  fuente pública que encontrara. Es la cifra que haría falta para dimensionar el inventario
  objetivo del primer año.
