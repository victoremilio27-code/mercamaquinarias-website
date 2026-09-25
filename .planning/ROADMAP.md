# Roadmap: MercaMaquinarias

## Overview

Dieciséis fases que van de un repositorio que despliega a ciegas a un marketplace que cobra,
da soporte y se puede auditar. Las diez primeras son **v1: todo tiene que estar terminado
el 2026-10-14**. Están ordenadas por lo que deja de sangrar antes: primero la barrera de
pruebas (hoy cada fusión a `main` es un despliegue a ciegas con dos personas empujando),
luego el sistema de temas —que trae consigo el comprobador de contraste y por tanto
protege todo lo que se construya después—, luego el dinero en tres pasos (partir el pago
en `pendiente`/`aprobado`, abrir un camino de cobro que no dependa de nadie externo, y
solo entonces CardNet entero y apagado), luego la consola que permite dar soporte, y al
final los huecos que un cliente vería el primer día: la moneda en el buscador, los
contactos verificados y el alcance del vendedor. Las seis últimas son v2. Las tres primeras de ellas van en el orden
que fijó Victor — transporte y financiamiento, el lote del contador, la deuda técnica — y
las otras tres recogen lo que la investigación de mercado señala como lo que nos hace la
referencia en un año: la inspección con informe publicado, los datos filtrables de la
máquina y las alertas.

La regla que ordena todo esto es de Victor, del 2026-09-25: **el 14 de octubre todo lo que
depende de nosotros está terminado**. El código de CardNet se escribe, se prueba y se
certifica dentro de v1 aunque la afiliación no esté aprobada. Lo único que puede quedar
pendiente ese día es que CardNet encienda el interruptor — y la Fase 5 existe justamente
para que ni eso bloquee el lanzamiento.

## Phases

**Numeración de fases:**
- Fases enteras (1, 2, 3): trabajo planificado del hito.
- Fases decimales (2.1, 2.2): inserciones urgentes (marcadas con INSERTED).

Las fases decimales aparecen entre sus enteros vecinos, en orden numérico.

**v1 — Lanzamiento (2026-10-14, fecha firme)**

- [ ] **Phase 1: Barrera de pruebas en la fusión** - Ninguna fusión a `main` llega a producción sin que pasen las pruebas que ya existen
- [ ] **Phase 2: Tema claro y oscuro coherentes** - Los dos temas se comportan igual de bien en las 19 páginas, con un comprobador que lo impide romper
- [ ] **Phase 3: El pago deja de darse por cobrado** - Un pago nace `pendiente` y solo otorga cupos y NCF cuando el cobro se confirma
- [ ] **Phase 4: Bandeja de solicitudes y bitácora de la consola** - El personal atiende las solicitudes desde el sitio y toda escritura en nombre de otro queda registrada
- [ ] **Phase 5: Cobro por transferencia bancaria** - La empresa puede cobrar y publicar el 14 de octubre sin depender de CardNet
- [ ] **Phase 6: CardNet construido, probado y apagado** - Tokenización y cobro recurrente completos tras un interruptor, sin que una tarjeta toque nuestro servidor
- [ ] **Phase 7: Verificación y soporte en nombre del dealer** - Sello de verificada, revisión del número de serie y edición asistida de la página de un dealer
- [ ] **Phase 8: Moneda y disponibilidad en el catálogo** - El buscador respeta DOP y USD, y la ficha dice si el equipo está en el país
- [ ] **Phase 9: Contactos verificados y señales de estafa** - Ningún anuncio muestra un contacto sin verificar, y el aviso de la ficha lleva a una guía dominicana
- [ ] **Phase 10: Alcance y métricas del vendedor** - Favoritos, compartir, atribución de cada contacto de WhatsApp y duplicar un anuncio

**v2 — Después del lanzamiento, en el orden fijado por Victor**

- [ ] **Phase 11: Transporte y financiamiento encendidos** - Los dos servicios apagados en `assets/servicios.js` entran en operación
- [ ] **Phase 12: Lote mensual de comprobantes** - Victor descarga el paquete del mes y lo envía él mismo
- [ ] **Phase 13: Deuda técnica de seguridad y mantenibilidad** - Testigos cifrados, `scrypt` asíncrono, archivos partidos y respaldos fuera del VPS
- [ ] **Phase 14: Inspección propia con informe publicado** - Documentos adjuntos a un anuncio y un informe de lo observado en la ficha
- [ ] **Phase 15: Especificaciones e implementos filtrables** - Los números de la máquina y sus implementos dejan de ser texto suelto
- [ ] **Phase 16: Búsquedas guardadas y alertas** - Un visitante deja una búsqueda puesta y el sitio le avisa cuando entra lo que busca

## Phase Details

### Phase 1: Barrera de pruebas en la fusión
**Goal**: Que ninguna fusión a `main` pueda desplegar a producción sin que las pruebas y auditorías que ya existen hayan pasado.
**Depends on**: Nothing (first phase)
**Requirements**: CI-01, CI-02
**Success Criteria** (what must be TRUE):
  1. Un Pull Request con una prueba en rojo muestra la comprobación fallida en GitHub y no se puede fusionar.
  2. Fusionar a `main` con todo en verde despliega a producción igual que hoy, sin paso manual nuevo.
  3. Cualquiera de las dos personas ve, dentro del propio PR, qué script falló y con qué salida, sin entrar al VPS.
  4. `CLAUDE.md` está en la raíz del repositorio con las reglas fiscales, de dependencias y de despliegue que no se pueden olvidar.
**Plans**: 3 plans
- [x] 01-01-PLAN.md — Colgar las pruebas de un flujo de Actions y encadenar el despliegue detras de ellas
- [ ] 01-02-PLAN.md — Proteger main con las comprobaciones obligatorias y demostrar que un PR en rojo no se fusiona
- [ ] 01-03-PLAN.md — Poner al dia la seccion de despliegue de CLAUDE.md y fusionar en verde para ver el despliegue pasar por la barrera
**Notas**: Los scripts ya existen (`npm run auditar`, `seguridad:probar`, `dealer:probar`, `facturas:probar`, `facturas:letras`, `chat:probar`); no hay que escribirlos, hay que colgarlos del workflow. Hoy `.github/workflows/desplegar.yml` tiene un único paso que entra por SSH y despliega. Los tres estilos de prueba conviven a propósito y no se unifican. CI-02 quedó hecho el 2026-09-25: la fase lo verifica, no lo reescribe.

### Phase 2: Tema claro y oscuro coherentes
**Goal**: Que cualquier página del sitio se lea igual de bien en los dos temas, y que una comprobación automática impida que vuelva a romperse.
**Depends on**: Phase 1
**Requirements**: UI-01, UI-02, UI-03
**Success Criteria** (what must be TRUE):
  1. Cambiar de claro a oscuro en cualquiera de las 19 páginas no deja ningún elemento con un color congelado sobre el fondo nuevo.
  2. En los dos temas, el borde de todo control interactivo se distingue de la superficie de atrás con al menos 3:1 medidos.
  3. Los enlaces ámbar y los metadatos del panel de administración se leen en modo claro con al menos 4.5:1 medidos.
  4. `npm run auditar` falla si alguien introduce un color literal que incumpla, y ese fallo bloquea la fusión gracias a la Fase 1.
**Plans**: 6 planes en 4 olas
- [x] 02-01-PLAN.md — La capa de tokens completa en los dos bloques y sin colores de reserva en linea
- [x] 02-02-PLAN.md — La barra del navegador del movil sigue al tema en las 19 paginas
- [x] 02-03-PLAN.md — tools/check-contraste.js y su enganche a la cadena npm run auditar
- [ ] 02-04-PLAN.md — El borde de control a 3:1 y el ambar separado en texto y superficie
- [ ] 02-05-PLAN.md — Los colores literales convertidos y la cabecera del dealer fijada oscura
- [ ] 02-06-PLAN.md — Cierre: residuos, bateria en verde, verificacion humana y Pull Request
**UI hint**: yes
**Notas**: Hay un plan aprobado y medido en `C:\Users\Victor\.claude\plans\majestic-dancing-firefly.md` — se ejecuta, no se vuelve a planificar. Incluye el comprobador `tools/check-contraste.js` colgado de `npm run auditar`. Va antes que las pantallas nuevas de las fases 4-10 a propósito: así el comprobador las vigila desde el primer día en vez de tener que retocarlas después. `styles.css` es LF aunque el repositorio sea CRLF.

### Phase 3: El pago deja de darse por cobrado
**Goal**: Que un pago solo otorgue cupos y consuma un NCF cuando el dinero se confirma, con un único punto de transición compartido por todos los caminos de cobro.
**Depends on**: Phase 1
**Requirements**: PAGO-01, PAGO-02, PAGO-03
**Success Criteria** (what must be TRUE):
  1. Un pago recién creado aparece como `pendiente`, y el comprador no gana cupos ni recibe comprobante hasta que se confirma.
  2. Al confirmarse, los cupos y el comprobante aparecen juntos, y lo hacen igual venga la confirmación de una pasarela o de una persona.
  3. Repetir la confirmación del mismo pago deja los mismos cupos y el mismo NCF: no hay cupo doble ni segundo comprobante.
  4. Un cobro rechazado deja el pago en `rechazado`, sin cupos otorgados y sin ningún NCF consumido.
  5. Una compra de importe cero sigue quedando aprobada al instante y sin emitir nada, como hoy.
**Plans**: TBD
**Notas**: Es el prerrequisito de todo PAGO y vale por sí solo: hoy `anotarPago` escribe `'aprobado'` a mano en el SQL (`tools/db.js:2147`) y `comprarMembresia` compone el cobro con `procesador: 'demo'` (`tools/api.js:1983`), de modo que un rechazo otorgaría cupos y emitiría un NCF de dinero que nunca entró. El `CHECK` de `pagos.estado` ya admite `pendiente`. Columnas nuevas solo por migración añadida al final de `MIGRACIONES`. `facturas.emitirPorPago` ya es idempotente — no se reescribe.

### Phase 4: Bandeja de solicitudes y bitácora de la consola
**Goal**: Que el personal pueda atender desde el sitio las solicitudes que hoy se capturan y nadie ve, y que quede cimentado el registro de toda escritura hecha en nombre de otra organización.
**Depends on**: Phase 2 (el tema y su comprobador), Phase 3 (no estrictamente, pero la consola crece sobre el mismo armazón)
**Requirements**: ADMIN-01, ADMIN-05
**Success Criteria** (what must be TRUE):
  1. El personal ve en el sitio las solicitudes de alquiler, importación y contacto con su estado, y las marca atendidas sin abrir una terminal.
  2. Una solicitud marcada como atendida sale de la bandeja pendiente y conserva quién la atendió y cuándo.
  3. Toda escritura hecha en nombre de otra organización queda anotada con quién la hizo, cuándo y sobre qué organización.
  4. Esa bitácora se puede consultar desde la consola filtrando por organización, y un reclamo de un cliente empresa se puede contestar con ella delante.
**Plans**: TBD
**UI hint**: yes
**Notas**: `listarSolicitudesServicio` y `marcarSolicitudServicio` ya existen en la API y ninguna pantalla las usa. La bitácora (ADMIN-05) va en esta fase, antes que cualquier acción en nombre de otro (fases 5 y 7), para no tener que retro-instrumentar escrituras que ya estarían sueltas. Toda ruta nueva bajo `/api/admin/*` se envuelve en `conAdmin` y se comprueba con `npm run auditar:permisos`; `conAdmin` responde 404, no 403, a propósito. No se publica ningún teléfono en las pantallas de soporte.

### Phase 5: Cobro por transferencia bancaria
**Goal**: Que la empresa pueda cobrar y otorgar cupos el 14 de octubre sin que ningún proveedor externo tenga que haber encendido nada.
**Depends on**: Phase 3, Phase 4
**Requirements**: PAGO-09, ADMIN-06
**Success Criteria** (what must be TRUE):
  1. Un comprador puede elegir pagar por transferencia y ve los datos de la cuenta y la referencia que tiene que poner.
  2. Su pago queda `pendiente` y él ve en su cuenta que está en espera de confirmación, sin cupos todavía.
  3. El personal marca el pago como recibido desde la consola y, en ese mismo momento, el comprador gana los cupos y recibe su comprobante con NCF.
  4. Ese marcado aparece en la bitácora de la Fase 4 con quién lo hizo y cuándo.
  5. Con CardNet apagado, este camino cubre de principio a fin comprar cupos y publicar un anuncio.
**Plans**: TBD
**UI hint**: yes
**Notas**: Es la contingencia de lanzamiento y es barata: quita la dependencia externa de la fecha firme, así que va bien antes de CardNet, no después. Usa exactamente la transición `pendiente → aprobado` de la Fase 3 — la misma función, no una copia. `planes.perfil_publico` se usa tal como está; no se proponen planes ni precios nuevos.

### Phase 6: CardNet construido, probado y apagado
**Goal**: Que la integración de cobro con CardNet esté escrita, probada y lista para certificar, entregada apagada tras un interruptor, para que el día de la afiliación sea encender y no construir.
**Depends on**: Phase 3, Phase 5
**Requirements**: PAGO-04, PAGO-05, PAGO-06, PAGO-07, PAGO-08
**Success Criteria** (what must be TRUE):
  1. Un comprador guarda una tarjeta y paga sin que el número, la fecha de vencimiento ni el CVV pasen nunca por nuestro servidor; buscar `cvv` en el repositorio no devuelve nada.
  2. Con el interruptor en `apagado`, todo el sitio se comporta exactamente como antes de esta fase, con el camino de transferencia intacto.
  3. Con el interruptor en el ambiente de pruebas, un cobro aprobado otorga cupos y emite comprobante, y uno rechazado no deja ni cupos ni NCF consumido.
  4. La misma notificación de la pasarela entregada dos veces emite un solo comprobante y consume un solo NCF; y RD$2.000 llega a CardNet como `200000`.
  5. Un aviso perdido se recupera solo: la reconciliación encuentra el pago aprobado en la pasarela sin fila aprobada nuestra, completa la transición y el descuadre sale en el informe a gerencia.
**Plans**: TBD
**UI hint**: yes
**Notas**: PCI es frontera dura — la tokenización ocurre en el navegador; ninguna ruta nuestra puede recibir datos de tarjeta. Diseño completo en `.planning/research/cardnet.md`: módulo `tools/cardnet.js` con `https.request` a mano y cero dependencias, `POST /v1/api/purchase` para el primer cobro y las renovaciones, ruta de notificación antes de cualquier patrón genérico `/api/pagos/...`, autenticada con `crypto.timingSafeEqual` y sin limitador por IP. Las claves de QA publicadas por CardNet no entran al repositorio ni a `.env.example`. Pruebas con arnés propio (`tools/probar-pagos.js`) y doble de `tools/cardnet.js`: la red no se toca; las variables de entorno se fijan **antes** del `require` de `tools/db.js`. Queda una pregunta abierta de mayor impacto para CardNet: confirmar que `DataDo.Invoice` es un número de orden del comercio y no el NCF de la DGII.

### Phase 7: Verificación y soporte en nombre del dealer
**Goal**: Que el personal pueda hacer desde el sitio todo lo que hoy exige una terminal o es imposible: verificar una organización, revisar un número de serie y arreglar la página de un dealer por él.
**Depends on**: Phase 4
**Requirements**: ADMIN-02, ADMIN-03, ADMIN-04, CONF-01
**Success Criteria** (what must be TRUE):
  1. El personal concede y retira el sello de verificada a una organización registrada por la web, desde el sitio, sin línea de comandos.
  2. El personal ve el número de serie de un anuncio, deja constancia del resultado de su revisión, y ese resultado es visible donde corresponda.
  3. Lo que un vendedor lee en `publicar.html` sobre la verificación del número de serie se corresponde con la diligencia que el personal hace de verdad — o el texto ya no lo promete.
  4. El personal abre la página de un dealer, la edita en su nombre, y el dealer ve el cambio en su propia pantalla con su estado borrador/publicada respetado.
  5. Cada una de esas escrituras aparece en la bitácora con quién la hizo, cuándo y sobre qué organización.
**Plans**: TBD
**UI hint**: yes
**Notas**: CONF-01 se cierra aquí porque ADMIN-03 es lo que la cumple; si la revisión no va a hacerse, el criterio 3 se satisface retirando el texto de `publicar.html:149`. La edición en nombre de otro (ADMIN-04) respeta las seis reglas visibles de la página del dealer ya existentes. Cuidado con los reductores de imagen: pintan fondo blanco y exportan JPEG, así que un logotipo PNG con transparencia pierde el alfa.

### Phase 8: Moneda y disponibilidad en el catálogo
**Goal**: Que el buscador deje de mentir: que el precio se compare en la misma moneda y que la ficha diga si la máquina está en el país o viene bajo pedido.
**Depends on**: Phase 2
**Requirements**: CAT-01, CAT-02, CAT-03
**Success Criteria** (what must be TRUE):
  1. Filtrar «desde RD$1.000.000» devuelve una máquina de US$120.000 en lugar de dejarla fuera.
  2. Ordenar por precio coloca esa máquina de US$120.000 por encima de una de RD$500.000.
  3. La ficha dice si el equipo está ya en el país o es bajo pedido, y el catálogo se puede filtrar por eso.
  4. Permuta e ITBIS incluido se pueden usar como filtro, no solo leer como etiqueta.
**Plans**: TBD
**UI hint**: yes
**Notas**: Es un defecto funcional, no una mejora: hoy `tools/db.js` compara `a.precio` en crudo (líneas ~2414 y ~2460) aunque `MONEDAS` admite DOP y USD. Es lo único de la lista que puede hacer que un dealer diga «su buscador no funciona» el primer día. Las reglas de precio viven en `assets/precios.js`, cargado por el navegador y por Node: cualquier cambio tiene que seguir funcionando en los dos lados y conservar el `module.exports` del final.

### Phase 9: Contactos verificados y señales de estafa
**Goal**: Que todo contacto que un comprador vea esté verificado, y que quien sospeche tenga una guía dominicana a un clic del aviso que ya existe.
**Depends on**: Phase 2
**Requirements**: CONF-02, CONF-03
**Success Criteria** (what must be TRUE):
  1. Un anuncio no muestra ningún contacto que no esté verificado.
  2. Un vendedor verifica su contacto por correo y ese contacto aparece en su anuncio; con los créditos SMS apagados, el correo basta.
  3. El día que se enciendan los SMS, la verificación por teléfono funciona sin volver a tocar el flujo.
  4. El aviso de la ficha lleva a una página de señales de estafa escrita para el mercado dominicano.
**Plans**: TBD
**UI hint**: yes
**Notas**: Los créditos SMS de Brevo están pendientes de pago: la vía SMS se entrega construida y apagada tras el interruptor, igual que el resto. `tools/correo.js` es el único punto de envío y ya tiene transporte de archivo para desarrollo. La página de estafas es texto, no código, y no publica ningún teléfono.

### Phase 10: Alcance y métricas del vendedor
**Goal**: Que el vendedor pueda atribuir al sitio lo que vende y que el comprador tenga las dos acciones que un dominicano espera de un portal: guardar y compartir.
**Depends on**: Phase 2
**Requirements**: MET-01, MET-02, MET-03, MET-04
**Success Criteria** (what must be TRUE):
  1. Un visitante guarda un anuncio como favorito, lo vuelve a encontrar, y el panel del anunciante deja de decir «Guardados: 0» para siempre.
  2. Un visitante comparte la ficha y el enlace llega a WhatsApp con foto, título y precio.
  3. El anunciante ve, por cada contacto de WhatsApp, qué anuncio fue y cuándo, no solo el total.
  4. El anunciante duplica un anuncio desde el panel y solo edita lo que cambia.
**Plans**: TBD
**UI hint**: yes
**Notas**: La infraestructura ya está y nadie la usa: la columna y el tipo de evento `favorito` y `compartir` existen en `tools/db.js` sin emisor, y los metadatos de compartir están hechos en `tools/meta.js`. Los eventos de métrica tienen deduplicación cubierta por `tools/probar-seguridad.js`: no se rompe.

### Phase 11: Transporte y financiamiento encendidos
**Goal**: Que los dos servicios que están escritos y apagados entren en operación con contenido dominicano real.
**Depends on**: Phase 10 (cierre de v1)
**Requirements**: SERV-01, SERV-02
**Success Criteria** (what must be TRUE):
  1. Un visitante entra a transporte, usa el mapa provincia a provincia y obtiene una estimación de traslado.
  2. Un visitante entra a financiamiento, ve instituciones dominicanas reales y calcula una cuota.
  3. Ninguna de las dos páginas redirige ya a la de servicio apagado, y el resto del sitio las ofrece donde corresponde.
**Plans**: TBD
**UI hint**: yes
**Notas**: Encender es cambiar `activo` a `true` en `assets/servicios.js`; hasta esta fase se quedan apagados y el código **no se borra** — es una bandera, no código muerto. `assets/mapa.js` ya está escrito, comentado con cuidado y ninguna página lo carga.

### Phase 12: Lote mensual de comprobantes
**Goal**: Que Victor cierre el mes fiscal descargando un solo paquete, sin armarlo a mano y sin que nada salga por correo automáticamente.
**Depends on**: Phase 11
**Requirements**: CONTAB-01
**Success Criteria** (what must be TRUE):
  1. Victor descarga, en un solo archivo, todos los comprobantes de un mes con su resumen.
  2. El paquete cuadra con lo emitido: los mismos NCF, los mismos importes y el mismo ITBIS que tiene la base.
  3. No existe ningún camino por el que el sistema envíe eso a un contador: la descarga manual es el único.
**Plans**: TBD
**Notas**: El envío automático al contador está **prohibido** por decisión de Victor; si algún día parece que «falta», no falta. Un comprobante emitido nunca se borra ni se reescribe, así que el paquete solo lee. El PDF se genera con `tools/pdf.js`, sin dependencias nuevas.

### Phase 13: Deuda técnica de seguridad y mantenibilidad
**Goal**: Que una copia filtrada de la base no sea una sesión secuestrada, que el acceso no bloquee el sitio, y que dos personas puedan trabajar en paralelo sin chocar.
**Depends on**: Phase 12
**Requirements**: DEUDA-01, DEUDA-02, DEUDA-03, DEUDA-04, DEUDA-05
**Success Criteria** (what must be TRUE):
  1. Quien lea una copia de la base no puede entrar con ningún testigo de sesión o de dispositivo que vea allí.
  2. Iniciar sesión no deja al resto de los visitantes esperando mientras se comprueba la contraseña.
  3. El tiempo de respuesta del acceso no revela si un correo está registrado o no.
  4. Las dos personas pueden editar el acceso a datos y la API en la misma semana sin encontrarse en el mismo archivo.
  5. Existe una copia de la base fuera del VPS y se ha restaurado al menos una vez para comprobar que sirve.
**Plans**: TBD
**Notas**: `codigos.codigo_hash` ya guarda un HMAC en vez del código crudo, con el comentario que explica por qué — DEUDA-01 aplica el mismo criterio a `sesiones.testigo` y `dispositivos.testigo`. Al partir `tools/db.js` (3.353 líneas) y `tools/api.js` (2.677) se conservan las secciones `── Nombre ──` ya existentes, el array plano `RUTAS` con la ruta específica antes de la genérica, y el `MIGRACIONES` append-only. Antes de tocar la base de producción, respaldo verificado (`VACUUM INTO` + `integrity_check`).

### Phase 14: Inspección propia con informe publicado
**Goal**: Que un comprador pueda confiar en la máquina de un desconocido porque alguien de la casa la vio y escribió lo que vio.
**Depends on**: Phase 13
**Requirements**: FICHA-01, FICHA-02
**Success Criteria** (what must be TRUE):
  1. Un vendedor adjunta documentos a su anuncio, no solo fotos y video, y el comprador los puede abrir desde la ficha.
  2. Un anuncio inspeccionado muestra en la ficha el informe de lo observado, con su fecha y quién lo hizo.
  3. El informe describe lo observado y no certifica porcentajes ni promete pruebas de carga: quien lo lee entiende exactamente qué alcance tiene.
  4. Un anuncio sin inspección no aparenta tenerla en ningún sitio.
**Plans**: TBD
**UI hint**: yes
**Notas**: FICHA-01 es prerrequisito de FICHA-02: hoy un anuncio solo admite fotos y video, así que sin documentos no hay dónde colgar un informe. Requiere además personas y un protocolo escrito, que es decisión de Victor y no código. El techo de disco del droplet (512 MB, 60 % ocupado) manda sobre el tamaño de lo que se adjunta.

### Phase 15: Especificaciones e implementos filtrables
**Goal**: Que los números que deciden una compra de maquinaria —cucharón, izaje, ejes, potencia, peso— y los implementos se puedan filtrar como datos y no leer como adjetivos.
**Depends on**: Phase 8, Phase 14
**Requirements**: FICHA-03, FICHA-04
**Success Criteria** (what must be TRUE):
  1. Un comprador filtra por capacidad, potencia o peso dentro de un tipo de máquina y obtiene solo los que cumplen.
  2. Las especificaciones que se piden al publicar dependen del tipo de máquina, no son una lista única para todo.
  3. Un comprador filtra por implemento y un martillo hidráulico deja de ser indistinguible de un adjetivo.
  4. Los anuncios que ya existen siguen visibles y buscables aunque no tengan los datos nuevos.
**Plans**: TBD
**UI hint**: yes
**Notas**: `assets/taxonomia.js` ya tiene la jerarquía donde colgar esto, y ya declara qué marcas fabrican cada subcategoría: es su extensión natural. Es un módulo compartido navegador/servidor, así que conserva el `module.exports` del final y nada de sintaxis de módulo ES ni de `window`. Hoy los implementos son la línea de texto de `publicar.html:164`.

### Phase 16: Búsquedas guardadas y alertas
**Goal**: Que una visita se convierta en alguien que vuelve durante los meses que dura la búsqueda de una máquina.
**Depends on**: Phase 9, Phase 15
**Requirements**: ALERT-01
**Success Criteria** (what must be TRUE):
  1. Un visitante guarda una búsqueda con sus filtros y la vuelve a encontrar en su cuenta.
  2. Cuando entra un anuncio que encaja, recibe el aviso por correo con el enlace a ese anuncio.
  3. Puede dejar de recibir una alerta desde el propio correo, sin escribir a soporte.
  4. Con los créditos SMS apagados, las alertas por correo funcionan igual y nada queda a medias.
**Plans**: TBD
**UI hint**: yes
**Notas**: Depende de los créditos SMS de Brevo y del correo, así que encaja después del lanzamiento. `tools/correo.js` sigue siendo el único punto de envío y `tools/tareas.js` el sitio de lo que corre fuera de una petición HTTP, con la idempotencia que esas tareas ya tienen por norma. Va después de la Fase 15 para que una búsqueda guardada pueda incluir los filtros numéricos nuevos y no haya que rehacerla.

## Progress

**Orden de ejecución:**
Las fases se ejecutan en orden numérico, de la 1 a la 16. Las diez primeras son v1 y tienen
que estar terminadas el 2026-10-14. De las seis de v2, las fases 11, 12 y 13 van en el orden
que fijó Victor; el orden relativo de las fases 14, 15 y 16 puede cambiar cuando llegue el
momento — lo que no cambia es que van después del lanzamiento.
`auto_advance` está en `false`: Victor da luz verde a cada fase por separado, y cada fase
entrega valor sin esperar a la siguiente.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Barrera de pruebas en la fusión | 1/3 | In Progress | - |
| 2. Tema claro y oscuro coherentes | 3/6 | In Progress|  |
| 3. El pago deja de darse por cobrado | 0/TBD | Not started | - |
| 4. Bandeja de solicitudes y bitácora | 0/TBD | Not started | - |
| 5. Cobro por transferencia bancaria | 0/TBD | Not started | - |
| 6. CardNet construido y apagado | 0/TBD | Not started | - |
| 7. Verificación y soporte al dealer | 0/TBD | Not started | - |
| 8. Moneda y disponibilidad en el catálogo | 0/TBD | Not started | - |
| 9. Contactos verificados y estafas | 0/TBD | Not started | - |
| 10. Alcance y métricas del vendedor | 0/TBD | Not started | - |
| 11. Transporte y financiamiento | 0/TBD | Not started | - |
| 12. Lote mensual de comprobantes | 0/TBD | Not started | - |
| 13. Deuda técnica | 0/TBD | Not started | - |
| 14. Inspección con informe publicado | 0/TBD | Not started | - |
| 15. Especificaciones e implementos filtrables | 0/TBD | Not started | - |
| 16. Búsquedas guardadas y alertas | 0/TBD | Not started | - |

## Cobertura de requisitos

**v1: 30 de 30 requisitos mapeados, cada uno a exactamente una fase. Sin huérfanos y sin duplicados.**

| Requisito | Fase |
|---|---|
| PAGO-01, PAGO-02, PAGO-03 | 3 |
| PAGO-04, PAGO-05, PAGO-06, PAGO-07, PAGO-08 | 6 |
| PAGO-09 | 5 |
| ADMIN-01, ADMIN-05 | 4 |
| ADMIN-02, ADMIN-03, ADMIN-04 | 7 |
| ADMIN-06 | 5 |
| CAT-01, CAT-02, CAT-03 | 8 |
| CONF-01 | 7 |
| CONF-02, CONF-03 | 9 |
| MET-01, MET-02, MET-03, MET-04 | 10 |
| UI-01, UI-02, UI-03 | 2 |
| CI-01, CI-02 | 1 |

**v2: 13 de 13 requisitos mapeados.**

| Requisito | Fase |
|---|---|
| SERV-01, SERV-02 | 11 |
| CONTAB-01 | 12 |
| DEUDA-01 … DEUDA-05 | 13 |
| FICHA-01, FICHA-02 | 14 |
| FICHA-03, FICHA-04 | 15 |
| ALERT-01 | 16 |

## Restricciones que atraviesan todas las fases

Vienen de `CLAUDE.md` y de `PROJECT.md`. Ninguna fase las negocia.

- **Cero dependencias en tiempo de ejecución.** Si parece que hace falta un paquete, se dice y se explica por qué no se puede sin él.
- **Las migraciones solo se añaden al final** del array `MIGRACIONES` de `tools/db.js`. Nunca se reescribe una anterior: ya corrió en producción.
- **Un comprobante emitido nunca se borra ni se reescribe.** Corregir es emitir una nota de crédito B04.
- **Nada se envía automáticamente a un contador.** Nunca, en ninguna fase.
- **No se publica ningún número de teléfono.** Soporte es correo y el asistente del sitio.
- **Transporte y financiamiento siguen apagados** por `assets/servicios.js` hasta la Fase 11.
- **PCI es frontera dura:** ninguna fase diseña nada donde el número de tarjeta, el vencimiento o el CVV lleguen a nuestro servidor.
- **Rama y Pull Request siempre**, nunca push directo a `main`, nunca `--force`, nunca reescribir historial: hay otra persona en el repositorio.
- **No se toca el modelo de negocio de los planes ni sus precios.** Se usa `planes.perfil_publico` tal como está.
- **Todo en español**: identificadores, comentarios, interfaz, mensajes de commit y descripciones de PR.

---
*Last updated: 2026-09-25*
