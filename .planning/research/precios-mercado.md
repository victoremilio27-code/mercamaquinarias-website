# Precios de publicación: ¿son competitivos RD$1.800 y RD$3.200?

**Fecha:** 2026-09-26 · **Pedido:** «¿son 1,800 y 3,200 precios competitivos y atractivos, y a la
vez justificados? ¿Alguna sugerencia?» · **Alcance:** solo investigación. No se tocó código ni
precios. Las sugerencias de la §8 son para que Victor decida y **no inventan planes**: se mueven
dentro de `modelo-comercial.md` (bases 1.800/3.200, Premium 5.500, fórmula base × 1,03 × 1,18) y
de las preguntas abiertas de `auditoria-modelo-comercial.md` §8.

**Cómo leer las etiquetas**
- **Verificado** = texto de la página oficial del competidor. Ojo: el proxy de salida de esta
  sesión **bloquea la lectura directa** de supercarros.com, corotos.com.do, maquinariasrd.com,
  mercadolibre, equipmenttrader.com y otros (error `EGRESS_BLOCKED`). Lo verificado aquí es el
  **fragmento de esa página oficial que devuelve el buscador**, no la página abierta entera.
  Por eso lo marco *Verificado (buscador)*. Conviene que Victor abra la página de SuperCarros
  una vez para confirmar la cifra clave (§«Lo que no pude verificar»).
- **Inferido** = conclusión mía a partir de lo anterior.
- **Tasa:** RD$59,4 por US$ (tasa de referencia del Banco Central, 22-23 sep 2026, según
  prensa). El pedido decía ~63: esa cifra está desfasada. Con 63 los US$ de abajo bajan un 6 %.

---

## Veredicto en cuatro líneas

1. **Justificados: sí, con holgura.** Están casi en el mismo punto que la única referencia local
   que importa, SuperCarros (RD$2.100 / 3.250 / 7.000 por 30 días), y respecto al valor de una
   máquina son una fracción mínima: 0,04-0,07 % de una retro de RD$3-6 millones.
2. **Competitivos en precio: sí.** El Destacado da 30 días de destacado y portada; el plan de
   SuperCarros que cuesta menos (3.250) solo da 7 días de prioridad.
3. **Atractivos para un sitio nuevo: todavía no, y no por el precio.** Lo que se compara no es
   2.188 contra 2.100: es 2.188 contra **gratis** (Corotos, Facebook, Mercado Libre, Locanto)
   con un sitio que aún no tiene compradores. Eso lo arregla la promoción, no bajar la tarifa.
4. **Recomendación:** mantener 1.800/3.200, mantener el Estándar a RD$0 hasta el 2026-11-30 y
   decidir con datos si se alarga; que el Destacado sea el producto de pago desde el día uno.

---

## 1. Lo que vendemos (código de este repositorio)

| Nivel | Base | Final exacto | Final entero | US$ (59,4) | Fotos | Destacado + portada | Página de empresa |
|---|---|---|---|---|---|---|---|
| Estándar | 1.800 | 2.187,72 | 2.188 | 36,8 | 8 | No | No |
| Destacado | 3.200 | 3.889,28 | 3.889 | 65,5 | 20 | Sí, **los 30 días** | No |
| Premium | 5.500 | 6.684,70 | 6.685 | 112,5 | 30 | Sí, los 30 días | Sí |

- Duración 30 días; 60 días = 1,8 × 30 (`assets/precios.js:39-45`): Estándar 60 días = base
  3.240 → final 3.937,90. — Verificado (código).
- El destacado dura **todo el periodo** del anuncio: `destacado_hasta = s.fin`
  (`tools/db.js:3122`, `3134`). — Verificado (código). Es la diferencia principal con SuperCarros.
- Fotos 8/20/30 y videos 1/2/3 (`db/schema.sql:796-798` y auditoría §1.1). **Si el video
  (PR #9) sigue sin fusionar, no se puede contar como argumento de precio.**
- Hoy el Estándar está en promoción a RD$0 hasta el 2026-11-30 (`tools/db.js:414`). La promoción
  va sobre el precio vigente del plan, así que **también cubre la capacidad Estándar de los
  dealers** mientras dure. — Inferido de la auditoría §1.1 (el cobro usa `conPrecioVigente`).
- Frente a los finales de hoy (2.360 / 4.130) el cambio es una **bajada**, aunque se sume el 3 %.

---

## 2. Qué cobran en República Dominicana

| Sitio | Qué cobra al particular | Destacar | Dealer / tienda | Confianza |
|---|---|---|---|---|
| **SuperCarros** (autos + «V. Pesados») | **RD$2.100**: hasta 12 fotos, 30 días, resaltado en resultados | **RD$3.250**: 12 fotos, 30 días + borde de color y prioridad **7 días**. **RD$7.000**: lo anterior + portada como «SuperCarro» **7 días** | Planes para profesionales; **precio no publicado** | Verificado (buscador) |
| **Corotos** | **Gratis e ilimitado** en varias categorías, incluidos vehículos | «Impulsar» de pago; precio no encontrado | Planes Pro y Premium (anuncios sin vencimiento, cuenta verificada, perfil destacado); **los bajaron de precio**, cifra no encontrada | Verificado (buscador) |
| **maquinariasrd.com** | Nivel de entrada con 1 anuncio regular (el «0 US$» del estudio anterior) | Incluido en los planes | **Básico US$21/mes** (3 regulares + 1 destacado) · **Premium US$39** (5 + 4 destacados + 2 principales) · **Premium Plus US$59** (7 + 5 + 4) | Verificado (buscador) |
| **Mercado Libre RD** | Publicar vehículos es gratis en ML; hay retros y excavadoras publicadas en `.com.do` | Plata / Oro / Oro Premium de pago; tarifa de RD no encontrada | — | Verificado para CO y MX; RD Inferido |
| Facebook Marketplace, grupos, Locanto, SuperEquipos (Wix) | **Gratis** | — | — | Verificado (buscador) para Locanto y SuperEquipos; Facebook por conocimiento general |

En pesos por anuncio (Inferido, cálculo propio):
- **SuperCarros** es la vara de medir: un sitio con más de 1.250.000 visitas al mes y más de
  15.000 anuncios cobra RD$2.100 por un auto. **Nuestro Estándar (2.188) queda un 4 % por
  encima; el Destacado (3.889), un 20 % por encima de su plan de 3.250**, pero ese plan da 7 días
  de prioridad y el nuestro 30 días de destacado y portada. Nuestro Premium (6.685) queda por
  debajo de su plan de 7.000, que da 7 días de portada.
- **No sé si los precios de SuperCarros incluyen ITBIS.** Si no lo incluyen, sus finales serían
  2.478 / 3.835 / 8.260, y entonces el Estándar es más barato y el Destacado cuesta casi lo
  mismo que su plan intermedio.
- **maquinariasrd.com** sale a RD$210-310 por anuncio al mes (US$21 / 4 anuncios; US$59 / 16
  anuncios). Es barato porque, por lo que se ve, tiene poco tráfico y poco inventario (Inferido;
  el estudio anterior lo clasificó como «débil pero indexado»).

---

## 3. Referencias internacionales

| Sitio | Particular | Dealer | Nota | Confianza |
|---|---|---|---|---|
| **Chileautos** (Chile) | Maquinaria: aviso Estándar **desde CLP 5.500** (≈ US$6), según el valor del equipo; Premium desde CLP 11.990 (autos). **Activo hasta que se vende**; sin comisión | Tarifas propias | Pasaron de cobrar comisión por venta a cobrar solo al publicar | Verificado (buscador); US$ Inferido |
| **Mercado Libre** (MX, CO, CL) | Publicar un vehículo es gratis; Oro / Oro Premium de pago, con republicación gratis hasta 1 año | «Costos para concesionarios» y agencias, aparte | En vehículos cobra por publicar, no comisión por venta | Verificado (buscador); importes no encontrados |
| **Equipment Trader** (EEUU) | **Desde US$29** (≈ RD$1.720): 4 fotos, **2 semanas**. Enhanced y Best más caros, con portada | — | Sin comisión | Verificado (buscador) |
| **Machinery Trader** (EEUU) | Precio no publicado | **US$799 a más de US$3.000 al mes**, solo hablando con un vendedor | Cifra de un blog de terceros | Baja |
| **Mascus** | Anuncio de 30 días «según lista de precios», con tarjeta | Suscripciones | Lista no encontrada | Verificado que cobra; importe no |
| **Machineryzone, Machineryline, Truck1** | — | Paquetes para profesionales, «tarifas claras» (Truck1) | Importes no encontrados | Sin cifra |
| **Makitor** (España) | Gratis y sin comisión | — | Sitio nuevo que compite con gratis | Verificado (buscador) |

**Qué dicen juntas** (Inferido): los portales grandes de maquinaria viven del **dealer**, no del
particular. Al particular le cobran poco (Chileautos) o nada (ML, Corotos) y ganan con el
destacado. Donde se cobra por anuncio suelto, el rango va de ≈ US$6 (Chileautos, con mucho
tráfico) a US$29-37 (Equipment Trader, SuperCarros, nosotros).

---

## 4. La tarifa frente al valor del equipo

Precios reales de lo que se anuncia en RD:
- Retroexcavadoras Caterpillar en Mercado Libre RD: **de RD$950.000 a más de RD$4.000.000**. —
  Verificado (buscador).
- Retro Caterpillar 2010 anunciada en **US$85.000** (≈ RD$5,05 millones); excavadora Cat 323GX
  2021 con financiamiento al 50 %. — Verificado (buscador, portal de anuncios local).
- Rango general de retros usadas de marca: US$20.000-200.000. — Baja (blog extranjero).

| Valor del equipo | Estándar (2.188) | Destacado (3.889) | Corredor al 5 % |
|---|---|---|---|
| RD$1.000.000 | 0,22 % | 0,39 % | RD$50.000 |
| RD$3.000.000 | 0,07 % | 0,13 % | RD$150.000 |
| RD$6.000.000 | 0,04 % | 0,06 % | RD$300.000 |
| RD$10.000.000 | 0,02 % | 0,04 % | RD$500.000 |

- **Comisiones de corredor:** en EEUU, el corretaje o consignación de maquinaria pesada va del
  5 al 10 % (5 % por encima de US$100.000). — Media (varias guías del sector coinciden). Para
  RD **no encontré fuente**; el 3-5 % que se suele decir es plausible pero no está verificado.
  Aun con un 3 %, una retro de RD$3 millones paga RD$90.000 al corredor: **41 veces el Estándar**.
- **Comparación de fondo** (Inferido): SuperCarros cobra 2.100 por un carro de ~RD$1 millón
  (0,2 %). Nosotros cobramos parecido por un activo de 3 a 10 veces más valor. Por disposición a
  pagar, el techo es alto: el precio no es la barrera; **la barrera es la duda de si el sitio
  trae compradores**.

---

## 5. El dealer: capacidad de publicaciones activas

Con las reglas de hoy (cupos × nivel × 30 días, uno gratis por cada cinco; auditoría §2), en
precio final (Inferido, cálculo propio):

| Capacidad | Cupos cobrados | Final al mes | US$ | Por anuncio |
|---|---|---|---|---|
| 5 Estándar | 4 | 8.750,88 | 147 | 1.750 |
| 10 Estándar | 8 | 17.501,76 | 295 | 1.750 |
| 20 Estándar | 16 | 35.003,52 | 589 | 1.750 |
| 10 Destacado | 8 | 31.114,24 | 524 | 3.111 |

- La **página pública del dealer se enciende con cualquier compra Premium** si el dealer está
  aprobado (`tools/db.js:2816-2822`). — Verificado (código). No comprobé si se apaga al vencer.
  Un dealer puede entrar con 1 Premium + N Estándar.
- Contra **maquinariasrd.com** (US$59 por 16 anuncios) somos unas 8 veces más caros por anuncio (1.750 frente a ~220). Contra
  **Machinery Trader** (US$799+) somos más baratos. En RD, el dealer de maquinaria compara
  contra Facebook, que es gratis, y contra sus vendedores. — Inferido.
- **El dealer es quien trae inventario el primer año** (Inferido, y coincide con cómo viven
  Mascus, Machinery Trader y Truck1). Por eso el riesgo de precio es mayor aquí que en el
  particular: 17.500 al mes por 10 máquinas es poco frente a una sola venta, pero mucho frente a
  un sitio que todavía no le ha mandado ni un contacto.

---

## 6. Riesgos

1. **Competir con gratis sin tráfico.** Quien tiene una retro la publicará gratis en Facebook y
   Corotos de todos modos. Si además paga 2.188 aquí y en 30 días recibe cero contactos, no
   vuelve y lo cuenta. Es el riesgo principal y no depende del precio.
2. **Pocas fotos en el Estándar.** Tiene 8; el básico de SuperCarros tiene 12. Es la única
   comparación directa en la que perdemos. Cambiarlo sería tocar un beneficio, y eso está fuera
   del documento: lo dejo como dato, no como recomendación.
3. **30 días es poco para maquinaria.** Una máquina de millones se vende más despacio que un
   carro (Inferido). Chileautos deja la maquinaria activa hasta que se vende. Si el anuncio vence
   antes de venderse, el vendedor siente que pagó dos veces.
4. **El salto de 0 a 3.889.** Mientras el Estándar es gratis, el único pago es el Destacado. Si
   nadie lo compra en noviembre, no se sabrá si es por el precio o porque falta tráfico.
5. **Precio con centavos a la vista.** «RD$2.187,72» parece un cálculo, no un precio.

## 7. Qué justifica cobrar (y hay que decirlo en la tarjeta de cada plan)

Solo beneficios que ya existen o están en el roadmap, sin inventar:
- **El pago filtra.** Un anuncio pagado es de alguien que quiere vender de verdad. Para el
  comprador significa menos estafas y menos anuncios muertos que en los sitios gratuitos (Truck1
  dedica una página entera a las estafas de su mercado).
- **Ficha técnica seria**: horas, motor, transmisión, implementos, permuta, ITBIS, «ya en el
  país». Ningún clasificado general la tiene (`mercado.md` §2).
- **Verificación del dealer** por RNC y registro mercantil, y **contactos verificados** (fase 9).
- **Destacado de 30 días**, no de 7.
- **Sin comisión sobre la venta**: se paga una vez, frente al 3-10 % de un corredor.

---

## 8. Sugerencias (decide Victor)

1. **Mantener 1.800 / 3.200 y no bajarlos más.** Quedan pegados a SuperCarros, por debajo de los
   de hoy y muy por debajo de lo que vale lo anunciado. Bajar el precio no arregla la falta de
   tráfico, y subirlo después cuesta mucho más que bajarlo.
2. **Mantener el Estándar a RD$0 hasta el 2026-11-30 (responde P3: sí).** Son siete semanas
   después del lanzamiento del 14 de octubre para llenar el catálogo. **El 15 de noviembre,
   mirar dos cifras**: anuncios activos y contactos (WhatsApp y llamada) por anuncio. Si un
   anuncio no recibe al menos unos pocos contactos al mes, alargar la promoción (es solo cambiar
   `promo_hasta`, que ya existe) antes que cobrar a vendedores que no van a vender. El umbral lo
   pones tú. Durante la promoción, el Destacado es el producto de pago y su argumento es claro:
   30 días en portada por menos de lo que SuperCarros cobra por 7.
3. **Precio final en pesos enteros (responde P1): RD$2.188 / 3.889 / 6.685**, «ITBIS incluido».
   3.889 ya queda por debajo de 3.900; 2.188, por debajo de 2.200. No cambia columnas ni el
   cliente de CardNet (auditoría §3). Para un final «redondo» exacto habría que mover la base
   (base = final ÷ 1,2154) y el documento fija 1.800 y 3.200, así que no lo recomiendo.
4. **Ofrecer 60 días al particular y ponerlo como opción recomendada (responde P10).** Ya existe
   (1,8 × 30): Estándar 60 días = RD$3.938, Destacado 60 días = RD$7.001. Encaja con el ciclo
   de venta de una máquina y reduce el «pagué y venció». Renovar al mismo precio vigente
   (P8), sin tarifa de renovación distinta: una rebaja de renovación sería un precio nuevo.
5. **Dealer: conservar «uno de cada cinco» y el descuento de 60 días (P4) y no tocar el precio
   por cupo.** La promoción del Estándar ya les cubre la capacidad Estándar hasta el 30 de
   noviembre. Además, decirle al dealer en la tarjeta que con **un solo cupo Premium** se enciende
   su página de empresa. Es el camino más barato para que entre, y ya existe.

**Relación Destacado / Estándar:** 1,78 veces. SuperCarros tiene 1,55 (3.250 / 2.100) y
Chileautos alrededor de 2. Está dentro de lo normal y el Destacado da más días que el de ellos:
no la cambiaría.

---

## Lo que no pude verificar

- **Las páginas de precios abiertas enteras.** El proxy bloquea supercarros.com, corotos.com.do,
  ayuda.corotos.com.do, maquinariasrd.com, mercadolibre, equipmenttrader.com, maquiterra.com.mx,
  hoy.com.do y buyfleetnow.com. Todo lo de SuperCarros, Corotos y maquinariasrd.com sale de los
  fragmentos que devuelve el buscador. **Lo más importante que falta confirmar a mano:** que
  SuperCarros siga en 2.100 / 3.250 / 7.000, **si esos precios incluyen ITBIS**, y si los planes
  se aplican igual a «V. Pesados». Basta con abrir `supercarros.com/vender` e ir hasta el pago.
- **Planes de dealer de SuperCarros y precios de Corotos Pro/Premium e «Impulsar»:** existen,
  pero no encontré las cifras.
- **Mascus, Machineryzone, Machineryline, Truck1:** confirman que cobran, no cuánto.
  Machinery Trader (US$799-3.000+/mes) sale de un blog de terceros.
- **Tarifas de Mercado Libre para maquinaria en MX/CO/CL y en RD**, y si ML República Dominicana
  cobra por publicar vehículos pesados.
- **Comisión de corredores de maquinaria en RD.** El 5-10 % es de EEUU; el 3-5 % local no tiene
  fuente.
- **Tráfico e inventario reales de maquinariasrd.com**, y el volumen de maquinaria usada que se
  vende en RD al año (tampoco lo encontró `mercado.md`).
- **Tasa CLP/US$** para pasar Chileautos a dólares: ≈ 950, sin verificar.

## Fuentes

**Código de este repositorio (Verificado):** `assets/precios.js:39-63`, `db/schema.sql:455-520` y
`794-798`, `tools/db.js:414`, `2816-2822`, `3112-3135`; `.planning/research/auditoria-modelo-comercial.md`
§1.1, §2, §3, §8; `.planning/research/modelo-comercial.md` §11-12.

**Verificado (buscador, página oficial):**
- SuperCarros, vender (planes 2.100 / 3.250 / 7.000): https://www.supercarros.com/vender
- SuperCarros, dealers: https://www.supercarros.com/vender/dealers-1/ · devoluciones: https://www.supercarros.com/informacion/politica-devoluciones-cancelaciones
- SuperCarros, Vehículos Pesados: https://m.supercarros.com/V.Pesados
- Corotos, publicar gratis e ilimitado y bajada de planes: https://www.corotos.com.do/blog/te-escuchamos-ahora-publicar-en-corotos-es-gratis-e-ilimitado-y-bajamos-los-precios-de-los-planes
- Corotos, planes Pro y Premium: https://www.corotos.com.do/blog/nueva-funcionalidad-en-corotos-descuento-en-anuncios-para-planes-pro-y-premium · https://ayuda.corotos.com.do/hc/es-419/articles/12302328354967-Precio-de-tus-anuncios
- Maquinarias RD (planes US$21 / 39 / 59): https://maquinariasrd.com/
- Mercado Libre, costos de vender un vehículo: https://www.mercadolibre.com.mx/ayuda/Costos-de-vender-un-vehiculo_868 · https://www.mercadolibre.com.co/ayuda/Costos-de-publicar-un-vehiculo_868 · https://www.mercadolibre.cl/ayuda/Costos-de-vender-vehiculo_868
- Mercado Libre RD, retroexcavadoras: https://vehiculos.mercadolibre.com.do/retroexcavadora-caterpillar
- Chileautos, tarifas: https://ayuda.chileautos.cl/hc/es/articles/43429048852121-Precios-y-Tarifas-por-Publicar-en-Chileautos-cl-Todo-lo-que-Necesitas-Saber · https://www.chileautos.cl/estaticas/tarifas
- Equipment Trader, vender: https://www.equipmenttrader.com/sell
- Mascus, términos: https://www.mascus.co.uk/Dynagen_Template.aspx?Item=1923
- Makitor: https://makitor.com/publicar-maquinaria-en-machineryline-que-otras-opciones-existen/
- Locanto RD: https://www.locanto.com.do/g/Maquinaria-pesada/910/ · SuperEquipos: https://coronagf.wixsite.com/superequipos

**Media:**
- Comisiones de corretaje y consignación de maquinaria: https://www.ironmartonline.com/what-is-heavy-equipment-brokerage/ · https://buscamaquinaria.com/en/blog/heavy-equipment-consignment · https://www.rpgequipment.com/blog/selling-heavy-equipment-on-consignment
- Tasa del dólar, septiembre 2026: https://elcomercio.pe/mag/respuestas/us/precio-del-dolar-en-republica-dominicana-hoy-23-de-septiembre-usd-a-dop-compra-y-venta-nnda-nnrt-noticia/ · https://www.cibaonoticias.com/tasa-del-dolar-republica-dominicana-banco-central/
- Retro Cat 2010 en US$85.000: https://supercarros1.com/autos/retro-excavadora/

**Baja:**
- Machinery Trader, US$799-3.000+/mes: https://buyfleetnow.com/news/how-much-does-machinery-trader-cost
- Rango de precios de retros en RD: https://termini.es/precio-de-retroexcavadora-en-republica-dominicana/
