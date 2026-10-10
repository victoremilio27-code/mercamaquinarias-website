# Auditoría final antes del lanzamiento (2026-10-09/10)

Auditoría a fondo del sitio antes del 2026-10-14, sobre `main` en `3229ca6` (tanda 10 en producción). La pidió
Victor el 2026-10-09. Cada hallazgo de abajo está **reproducido** con un script, una captura mirada o pasos
exactos. Las sospechas que no se pudieron reproducir no están: van a «No comprobado».

## Cómo se hizo

- Toda la batería del job `pruebas` de CI (70 scripts) y, con el sitio arrancado como en el job `navegador`,
  `auditar`, `check`, `check:motion`, `auditar:accesibilidad`, `humo` y `carga` (10 de concurrencia). Todo en
  verde antes de empezar: los fallos de abajo son los que la batería **no** cubre.
- Siete auditorías en paralelo, cada una con su puerto y su base: permisos e IDOR, plataforma de seguridad
  (sesiones, CSRF, topes, subidas, cabeceras, estáticos, secretos), fiscal y dinero, recorrido completo como
  visitante y particular, recorrido como admin y dealer, visual/SEO/peso, rendimiento y operación. Los scripts y
  las salidas están en la carpeta de trabajo de la sesión; aquí va lo que se comprobó.
- **La visual y la de operación no terminaron** (el tope de uso cortó a los agentes tres veces). Quedan sus
  mediciones parciales (peso por página, tiempos con una base inflada) y lo que cubren las auditorías oficiales.
  Ver «No comprobado».

## Resumen

| Severidad | Arreglado (PR #202) | Encargado a Codex | Pendiente de Victor | Pendiente |
|---|---|---|---|---|
| Crítico | 1 | 0 | 0 | 0 |
| Alto | 3 | 3 | 3 | 0 |
| Medio | 9 | 8 | 1 | 0 |
| Bajo | 1 | 15 | 1 | 2 |

Encargos a Codex: #203 (API), #204 (publicar), #205 (panel, consola y estilos), #206 (mi página), #207 (medios).
Agrupados por archivo: ninguno toca un archivo de otro.

## Crítico

### FISCAL-1 · Sin transferencia, el sitio cobraba con `demo`: aprobado sin dinero y B01 reales gastados — **arreglado**
Con CardNet apagado, `pagos.metodosDeCobro()` caía a `demo` en cuanto la transferencia no estaba encendida: bastaba
`MERCA_TRANSFERENCIA=0` (lo indicaba `deploy/README.md` §10b) o un tecleo en una de sus cinco variables. Desde ahí
cualquiera publicaba sin pagar y cada compra con RNC gastaba un B01 irreversible (quedan ~15), con el PDF diciendo
«Pago en línea». Reproducido en el arnés: compra 201, factura emitida, `demo` llamado.
**Arreglo:** en producción (`NODE_ENV=production`) `demo` no es nunca un método; sin cobro de verdad la compra
responde 503 sin anotar nada. Aviso al arrancar, aviso en «Estado del sistema», comprobación en el `humo` contra
producción y README corregido. Prueba: sección 34 de `probar-transferencia.js`, `estado.prueba.js`.

## Alto

### FISCAL-2 · Anular un recibo sin NCF gastaba un B04 que el 607 no declara — **arreglado**
Sin B02, todo particular recibe un recibo; anularlo consumía uno de los diez B04 para «modificar» un documento
sin NCF. La norma no lo admite y el 607 lo excluye, así que quedaba un NCF emitido y nunca declarado.
**Arreglo:** el recibo se anula con una anulación interna sin NCF («Anulación de recibo», sin nombrar a la DGII);
una B01/B02 sigue con su B04. De paso: la vista web del comprobante (botón «Ver» del panel) decía «comprobante
fiscal emitido conforme a las normas de la DGII» **también en los recibos**; ahora el pie sale del mismo texto
por tipo que el PDF. Prueba: sección nueva de `probar-facturas.js`.

### FISCAL-3 · No hay forma de corregir un comprobante — **pendiente de Victor (migración)**
Un RNC o una razón social mal escritos dejan al cliente sin B01 válida para siempre: anular marca el pago
«devuelto» (sale del informe a gerencia aunque el dinero sigue en el banco) y el índice único por pago impide
emitir la B01 corregida. A la inversa, en una devolución real el anuncio y la capacidad siguen activos.
**Propuesta:** dos acciones distintas, «corregir datos» (B04 + comprobante nuevo del mismo pago) y «devolver»
(B04, pago devuelto y retirada de lo comprado); necesita una migración al final de `MIGRACIONES` (índice único
parcial que excluya los anulados). Va después del 14 salvo que Victor diga otra cosa; FISCAL-5 reduce mucho la
probabilidad del error de origen.

### SEG-PERMISOS-01 · `/api/eventos` sin sesión mandaba un correo por evento — **arreglado**
Cambiando el User-Agent, 40 eventos «teléfono» desde una IP fueron 40 correos «Alguien pidió su contacto» al
dealer (unos 1.200 por hora). Si se agota la cuota de Brevo dejan de salir los códigos de acceso y los
comprobantes de todo el sitio. También se aceptaban eventos sobre un borrador ajeno.
**Arreglo:** el contacto se sigue contando igual; el correo, una vez por origen y anuncio al día y diez por
anuncio al día; un evento sobre un anuncio no activo ni cuenta ni avisa. Prueba: `probar-seguridad.js`.

### E2E-NEGOCIO-2 · Secuencias NCF en la consola: recargar un rango le borraba el vencimiento — **arreglado**
Recargar un rango ya cargado sin fecha le ponía `vence = null` (y con ello quitaba la guarda contra emitir
fuera de plazo); reactivar un rango viejo lo dejaba activo junto al nuevo (dos B01 activas). La tabla no
enseñaba ni el vencimiento ni si estaba activo. **Arreglo** en `db.cargarSecuencia` y la consola. Prueba:
`probar-facturas.js`.

### E2E-CLIENTE-03 / SEG-PERMISOS-02 / E2E-NEGOCIO-5 · Un anuncio pausado, retirado o vendido sigue abierto por su enlace — **encargado #203**
Con Llamar, WhatsApp, documentos descargables y el distintivo «Destacado»; la ficha ya tiene preparado el «ya no
está disponible» y nunca lo enseña. Por defecto: 404 para quien no es el dueño (Victor decide si «vendido» se
ve con una franja).

### E2E-CLIENTE-01 · Una especificación fuera de rango deja la publicación sin poder pagarse — **encargado #204**
El campo marca el error pero el asistente deja avanzar; cada autoguardado da 400 y al final el aviso señala
«Categoría inválida».

### E2E-CLIENTE-02 · Un anuncio pagado sin teléfono verificado sale sin ninguna vía de contacto — **encargado #203, #204, #205**
Ni la espera, ni el correo «ya está publicado», ni el panel se lo dicen al particular.

### E2E-CLIENTE-04 · No se puede editar un anuncio activo, y el correo de publicación dice que sí — **Victor; el texto, #203**
La fila del panel no tiene «Editar» y `PATCH` responde «Estado inválido». Antes del 14 se quita «editarlo» del
correo (#203); construir la edición (ruta + botón) es decisión de Victor.

### Buzón `legal@mercamaquinarias.com` — **pendiente de Victor**
`legal.html` lo da cuatro veces como el canal para ejercer los derechos sobre datos personales (Ley 172-13), y no
está entre los buzones que Victor dijo que existen (#177). Basta con crearlo o ponerle un alias; no hace falta
tocar la versión legal.

## Medio

| Id | Hallazgo | Estado |
|---|---|---|
| FISCAL-4 | Con la B01 agotada o vencida, la empresa pagaba con RNC y recibía un recibo sin aviso | **Arreglado**: 409 antes de cobrar; si se agota entre pedido y confirmación, aviso urgente a gerencia con copia aparte a facturación |
| FISCAL-5 | Las B01 rechazaban la cédula y aceptaban un RNC con el dígito verificador mal | **Arreglado**: módulo 11 (RNC) y Luhn (cédula); formularios «RNC o cédula» |
| FISCAL-6 | Cargar el rango nuevo sin «la usa el sitio» apagaba en silencio la B01 vigente | **Arreglado**: 400 si el sitio ya emite ese tipo; aviso crítico sin secuencia del sitio |
| SEG-PERMISOS-03 | `/api/cuenta/reenviar` emitía un código de acceso (o de verificación a una cuenta ya verificada) sin contraseña, y abría sesión; y servía para saber qué correos tienen cuenta | **Arreglado** |
| Plataforma | Diez contraseñas falsas desde diez IP dejaban fuera al dueño aun desde su equipo de confianza | **Arreglado**: el tope por cuenta no aplica desde un equipo recordado; mensaje neutro |
| Plataforma | CSRF de inicio de sesión: un formulario ajeno dejaba al navegador de la víctima dentro de la cuenta del atacante | **Arreglado**: escrituras con `Origin` ajeno → 403 |
| SEG-PERMISOS-08 | Los topes por IP usaban la IPv6 entera: 100 altas desde un /64 = 100 correos de verificación a terceros | **Arreglado**: claves por /64 |
| Rendimiento | `/sitemap.xml` tardaba 1,7-2,6 s con 5.000 anuncios, con el hilo de Node parado | **Arreglado**: 17-33 ms, mismo XML byte a byte |
| E2E-NEGOCIO-1 | Consola, Comprobantes: «Reenviar» colgado y «Anular» mudo (`aviso` no definido) | **Arreglado**, visto en el navegador |
| SEG-PERMISOS-04 | Un particular gratis agota el tope global de documentos (100 MB) y nadie más puede adjuntar | #203 |
| SEG-PERMISOS-05 | Nota y tipo de teléfono sin límite (ficha de 6 MB) y elementos raros dan 500 | #203 |
| E2E-CLIENTE-05 / NEGOCIO-6 | Contacto y reporte dicen «teléfono opcional» y el servidor lo exige | #203 |
| E2E-CLIENTE-06 | A 390 px las acciones de cada anuncio del panel quedan fuera de pantalla | #205 |
| E2E-NEGOCIO-3 | Tras aceptar condiciones, «Confirmar» de agregar publicaciones sigue deshabilitado | #204 + #205 |
| E2E-NEGOCIO-4 | Mi página dice «publicada y cualquiera puede verla» cuando la pública da 404 | #203 + #206 |
| Plataforma | El borrador local de publicar lo ve la siguiente cuenta del mismo navegador | #204 |
| Claude | El particular ve «Capacidad para 1 equipo, 0 disponibles» (responde #177 punto 7: sí lo verá) | #205 |
| E2E-CLIENTE-07 | Una transferencia pedida y no pagada queda en espera para siempre y bloquea eliminar la cuenta | Victor decide (botón «Cancelar pedido» y/o caducar a N días); toca pagos: lo hace Claude |

## Bajo

| Id | Hallazgo | Estado |
|---|---|---|
| FISCAL-9 | El aviso de NCF iba solo a facturación y una vencida salía como «se agota» | **Arreglado**: a gerencia con copia aparte |
| FISCAL-7 | Al particular se le promete «comprobante fiscal / con NCF» y recibe un recibo | #203 + #205 |
| FISCAL-8 | El informe a gerencia cuenta las devoluciones por la fecha del cobro | #203 |
| SEG-PERMISOS-06 | `porPagina=1.5` da 500 en el catálogo; `-1` devuelve el catálogo entero | #203 |
| SEG-PERMISOS-07 | Precio sin tope y horas negativas | #203 |
| SEG-PERMISOS-10 | La página del dealer enseña como mucho 60 equipos | #203 |
| E2E-CLIENTE-09 | Con el tope de códigos alcanzado, la API dice «Le enviamos un código» y no envía nada | #203 |
| E2E-NEGOCIO-8 | Dos pestañas con el mismo borrador: la segunda pisa a la primera sin aviso | #203 + #204 |
| E2E-CLIENTE-08 | El primer pago de toda cuenta nueva da 409 aunque el texto dice que pagar es aceptar | #204 (pagar registra la aceptación, como dice el texto) |
| E2E-CLIENTE-10 | Un WebM sin duración se rechaza con «dura Infinity segundos» | #204 |
| E2E-NEGOCIO-10 | Vista previa y consola con ids crudos («peterbilt», «cam-volteo») | #204 + #205 |
| E2E-CLIENTE-11 | «N inactivos» cuenta los borradores | #205 |
| E2E-NEGOCIO-7 | Pausar, Reactivar, Marcar vendido y sucursales fallan en silencio con un 401 | #205 |
| E2E-NEGOCIO-9 | Mi página: subir algo que no es imagen lanza una excepción sin mensaje | #206 |
| Plataforma | Un documento JPEG malformado da 500 en vez de 415 | #207 |
| Plataforma | Un «JPEG» sin imagen (SOS sin SOF) pasa como foto; se sirve con `nosniff` y no ejecuta nada | #207 |
| SEG-PERMISOS-09 | El registro dice «Ya existe una cuenta con ese correo» (enumeración) | Victor: mantener (es lo habitual) o responder igual |
| Peso | `categorias.html` transfiere 1,3 MB a 390 px: 16 renders de 1280×720 (60-90 KB) para tarjetas pequeñas | Pendiente, después del 14: variantes de 640 px con `srcset` |
| Fechas | La promoción y el año del número interno se calculan en UTC: lo confirmado el 31-12 después de las 20:00 RD saldría con año siguiente | Pendiente, después del 14 (solo lectura del código, no ejecutado) |

## Lo que está bien (comprobado)

- **Permisos:** barrido de las 143 rutas como visitante, particular, dealer y admin (560 peticiones): ningún
  5xx sin sesión; las 50 de `/api/admin/*` dan 404 a no admin y 401 al visitante. IDOR con ids reales de otra
  cuenta sobre borradores, anuncios, documentos, búsquedas, pagos, membresías, comprobantes (PDF y HTML),
  sucursales y secciones: nada se filtra. Asignación masiva cerrada (estado, vence, plan, `organizacion_id`,
  `es_admin`, `exenta`… se ignoran). Importes siempre calculados en el servidor.
- **Sesiones:** HttpOnly, SameSite=Lax, Secure en producción; salir invalida; cambiar o restablecer la
  contraseña cierra las demás; la base guarda solo el HMAC del testigo.
- **Cabeceras y estáticos:** CSP con `script-src 'self'` y `frame-ancestors 'none'`, cero violaciones en las 22
  páginas; HSTS solo en producción; `no-store` en la API privada; 88 rutas a archivos privados con trucos de
  codificación, todas 404. Historial (831 commits) sin claves reales.
- **Fiscal:** sin secuencia o vencida no emite (y no avanza la secuencia); 30 confirmaciones simultáneas sobre 10
  pagos dan 10 comprobantes B0100000016-25 sin huecos ni repetidos; un pago = un comprobante; ningún UPDATE ni
  DELETE de importes, NCF o fechas; la B04 es atómica. Precio = base × 1,03 × 1,18 con el 3 % dentro del subtotal
  y subtotal + ITBIS = total exacto en todos los planes, igual en servidor, PDF, correo, `planes.html`,
  `publicar.html` y panel. Datos del emisor, «Válido hasta 30/11/2026» y monto en letras correctos.
- **Reglas de negocio:** ningún buzón de contador; el informe semanal sale en dos envíos separados (gerencia y
  facturación, sin CC); el 607 nunca se envía. Ningún teléfono de soporte (lo vigila `auditar:telefono`).
  Interruptores intactos.
- **Rendimiento** (base inflada: 5.000 anuncios, 2.000 usuarios, 50.000 eventos): todas las rutas por debajo de
  40 ms en p95 salvo el sitemap (arreglado). Carga a 10 de concurrencia sin 5xx, p99 22 ms, RSS 174 MiB.

| Ruta | demo p50/p95 ms | inflada p50/p95 ms |
|---|---|---|
| catálogo por defecto | 1,9 / 3,3 | 8,8 / 9,6 |
| catálogo texto | 1,3 / 2,2 | 17,5 / 18,5 |
| catálogo página 80 | 1,7 / 4,4 | 36,1 / 41,0 |
| portada API | 1,4 / 6,0 | 37,0 / 38,9 |
| panel: mis-anuncios (dealer de 400) | 1,9 / 4,2 | 21,1 / 27,5 |
| sitemap.xml | 1,4 / 2,8 | 1.975 / 2.108 → **~20 tras el arreglo** |

- **Peso por página a 390 px** (transferido, con gzip): la mayoría 230-310 KB (`styles.css` son 50 KB y
  `assets/taxonomia.js` 20 KB en todas); portada 607 KB y alquiler 623 KB por los renders; categorías 1,3 MB (ver
  «Bajo»).

## No comprobado

- **Auditoría visual completa** (capturas a 390 y 1280 px, claro y oscuro, de todas las páginas) y **revisión de
  operación** (despliegue, temporizadores, respaldos, nginx): sin terminar por el tope de uso. Cubren parte las
  auditorías oficiales en verde (`auditar`, `auditar:accesibilidad`, `check:contraste`, `check:motion`) y las
  pruebas `despliegue:puro`, `reglas-negocio:puro`, `tareas:probar`, `respaldo:probar`. Conviene relanzarlas en la
  próxima sesión.
- Todo lo de producción (la nube no llega a `mercamaquinarias.com`): ver la lista de abajo.
- La cuota real de Brevo, el disco del droplet y si Cloudflare entrega IPv6 real en `CF-Connecting-IP`.

## Comprobar en vivo (Victor, desde su PC o el VPS)

```bash
# 1. Que el sitio cobra por transferencia y nunca por demo (FISCAL-1). Debe dar ["transferencia"]:
curl -s https://mercamaquinarias.com/api/planes | grep -o '"metodosPago":\[[^]]*\]'
# 2. Que no se aprobó nada con demo ni hay facturas demo (en el VPS):
sqlite3 -readonly /var/lib/mercamaquinarias/mercamaquinarias.db "SELECT procesador, estado, COUNT(*), SUM(total) FROM pagos GROUP BY 1,2; SELECT numero, ncf, total FROM facturas WHERE metodo_pago='demo';"
# 3. Secuencias: B01 y B04 activas, del sitio, cuántas quedan y vencimiento:
sqlite3 -readonly /var/lib/mercamaquinarias/mercamaquinarias.db "SELECT tipo,desde,hasta,siguiente,hasta-siguiente+1 AS quedan,vence,activa,usa_sitio FROM secuencias_ncf ORDER BY tipo,desde;"
# 4. Que no se gastó ya un B04 sobre un recibo (FISCAL-2):
sqlite3 -readonly /var/lib/mercamaquinarias/mercamaquinarias.db "SELECT numero, ncf, ncf_modificado FROM facturas WHERE tipo='nota_credito' AND ncf_modificado LIKE 'MM-%';"
# 5. Avisos de cobro al arrancar (vacío) y el aviso nuevo «pagos: no hay ningún método de cobro» (no debe salir):
journalctl -u mercamaquinarias --since "-2 days" | grep -E "transferencia:|cardnet:|pagos:"
# 6. Cabeceras, estáticos privados y nginx detrás de Cloudflare (#169):
for r in / /panel.html /api/sesion; do curl -sI https://mercamaquinarias.com$r | grep -iE '^(strict-transport-security|content-security-policy|x-frame-options|cache-control):'; done
for r in /.env /.git/config /tools/db.js /deploy/nginx.conf /CLAUDE.md; do printf '%s ' $r; curl -s -o /dev/null -w '%{http_code}\n' https://mercamaquinarias.com$r; done   # 404 en todos
nginx -T 2>/dev/null | grep -E 'real_ip_header|set_real_ip_from' | head -3; ufw status numbered | head
# 7. Temporizadores (#170): tareas, informe semanal y mensual, con próxima ejecución:
systemctl list-timers 'mercamaquinarias*'
# 8. Disco y tráfico IPv6:
df -h /var/lib/mercamaquinarias; awk '{print $1}' /var/log/nginx/access.log | grep -c ':'
```

Y a mano: que `legal@mercamaquinarias.com` reciba; en app.brevo.com, el plan y la cuota diaria de envíos; una
transferencia de prueba hasta el comprobante (y anularla desde la consola: con un recibo, ahora debe decir
«Anulación … emitida» sin gastar B04).

## Preguntas para Victor (una línea cada una)

1. **FISCAL-3:** ¿corregir comprobantes (necesita migración) antes o después del 14? Propuesta: después.
2. Cuando se devuelve el dinero de una publicación, ¿se retira el anuncio en el acto? Hoy sigue hasta que vence.
3. **Recibo sin NCF:** se anula ahora con una anulación interna sin B04. ¿Lo confirma con el contador? ¿Y emitir
   recibos a particulares mientras no haya B02 (o se pide la B02 ya)?
4. Los rangos **B01 y B04 vencen el 2026-11-30**: ¿cuándo se piden los nuevos? El aviso automático empieza el 31-10
   y ahora le llega a gerencia.
5. ¿Se aceptan cédulas antiguas que no pasan el dígito verificador? Hoy se rechazan con un mensaje.
6. La promoción del Estándar (RD$0 hasta el 30-11) vale también para la capacidad de los dealers: uno puede
   contratar 100 publicaciones activas Estándar a 60 días sin pagar. ¿Es lo que quiere?
7. **Editar un anuncio activo** (precio, descripción): ¿se construye antes del 14 o después?
8. Una transferencia pedida y no pagada: ¿botón «Cancelar pedido» para el cliente, caducar sola a los N días, o las
   dos?
9. Un anuncio **vendido**: ¿desaparece como uno pausado (lo que hace #203) o se ve con una franja «Vendido» y sin
   teléfonos?
10. ¿Se crea `legal@mercamaquinarias.com` o un alias a un buzón que sí se lee?
11. ¿Qué plan de Brevo hay y cuál es su cuota diaria? ¿Y qué disco tiene el droplet?
12. ¿El tope de precio de RD$10.000 millones por anuncio (#203) le vale?
