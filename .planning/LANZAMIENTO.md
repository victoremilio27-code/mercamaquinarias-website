# Lanzamiento del 2026-10-14 — lista de comprobación

Para Victor y para cualquier sesión que entre sin contexto. Fecha firme. Solo la afiliación de
CardNet puede moverla, y para eso existe la salida por transferencia (ya construida). Fuentes:
`CLAUDE.md`, «Para retomar» de `.planning/STATE.md`, `deploy/README.md`, `assets/servicios.js` y los
issues con etiqueta `victor` (#78, #79, #177) más #65, #66 y #168. Lo que aquí no se sabe queda como
pregunta; no se inventan cuentas, correos ni precios.

Todos los comandos de servidor se ejecutan como `root` en el VPS (Ubuntu 24.04, Node 24), salvo los
que llevan `sudo -u mercamaquinarias`.

---

## 1. Antes del día 14 (por día)

### Hasta el jueves 8 (hoy)

- [ ] **Victor:** contestar #177 (ver preguntas al final de esta sección). Lo no contestado se deja como está.
- [ ] **Victor:** proteger `main` (#78): Settings → Branches → regla que exija `pruebas` y `navegador`. Hoy GitHub deja fusionar un PR en rojo.
- [ ] **Victor:** activar los Backups de DigitalOcean del droplet (copia fuera del servidor).

### Viernes 9

- [ ] **Victor:** comprobar los cuatro buzones que enseña el sitio (`hola@`, `ayuda@`, `ventas@`, `publicidad@mercamaquinarias.com`): que existen, reciben y alguien los lee (#177 punto 2). Mandar un correo de prueba a cada uno.
- [ ] **Victor:** decidir lo del asistente (#177 punto 3): o la clave de Anthropic pagada y puesta (`deploy/README.md` §10, con límite de gasto mensual), o botón oculto hasta tenerla.
- [ ] **Victor:** CardNet. Si la afiliación no llegó, se lanza con transferencia y CardNet apagado (§2). Si llegó, hay que certificar en lab antes de encender (`deploy/README.md` §10c) y eso **no** corre contra el reloj del 14: se enciende después.
- [ ] **Victor:** confirmar que `/etc/mercamaquinarias.env` tiene las cinco variables `MERCA_TRANSFERENCIA_*` (`deploy/README.md` §10b) y que `planes.html` ofrece pagar por transferencia.
- [ ] **Victor:** `npm run correo:probar` con una dirección propia (manda correos reales) y `node tools/probar-correo.js <su correo>` en el servidor: debe decir `brevo`, no `archivo`.
- [ ] **Victor:** comprobar con el contador las **secuencias de NCF**: vigentes (no vencidas) y con margen. Según STATE quedaban 15 B01, 10 B04 y ninguna B02; pedir más y cargar las fechas de vencimiento con `tools/facturas.js`. El aviso diario de secuencias bajas va a gerencia.
- [ ] **Claude/Codex:** retomar la oleada pendiente (STATE: Codex sin uso hasta el viernes 9). Pendientes anotados: 6 avisos de orden de encabezados (h3 sin h2) en panel, dealer y 404; los arreglos de #171-#176 de la auditoría de frontend.
- [ ] **Claude:** #168 (fiscal): `tomarNcf` ignora `usa_sitio` y la nota de crédito B04 no es atómica. Va por el procedimiento fiscal: pruebas primero escritas por Claude, Codex implementa sin tocarlas, Claude revisa línea a línea. Si hay migración: respaldo verificado antes de fusionar (§3.2).

### Sábado 10

- [ ] **Victor:** mirar a ojo en móvil y escritorio, claro y oscuro: panel del dealer, celular en el panel y «¿No cambió usted su contraseña?» (#78).
- [ ] **Victor:** confirmar que existe la cuenta de dealer de prueba (Inversiones XZT) en la base de producción, creada con `MERCA_DB` (§4 de `deploy/README.md`).
- [ ] **Victor:** desde su PC (la nube no llega a `mercamaquinarias.com`, 403): revisar cabeceras, `robots.txt`, `sitemap.xml` y diferencias entre producción y local (#177 punto 8).
- [ ] **Claude:** cerrar los PR de la oleada en curso, todos con CI en verde. Nada que toque `tools/db.js` ni precios sin respaldo.

### Domingo 11

- [ ] **Claude:** congelar las fusiones grandes. Desde hoy solo entra lo que arregle un fallo comprobado.
- [ ] **Victor:** si se decidió ocultar el botón del asistente o los recuadros publicitarios, que el cambio ya esté fusionado y desplegado hoy.

### Lunes 12

- [ ] **Claude:** correr toda la batería sobre `main` y las auditorías con el sitio arrancado como en el job `navegador`: `npm run auditar && npm run check && npm run check:motion`, más `seguridad:probar`, `dealer:probar`, `facturas:probar`, `chat:probar`, `facturas:letras`.
- [ ] **Claude:** comprobar que el último despliegue a `main` terminó con «Sitio arriba» (job `desplegar`).
- [ ] **Victor:** revisar los `Pendiente de Victor` de STATE por si quedara algo bloqueante.

### Martes 13 (víspera)

- [ ] **Todos:** ningún PR sin fusionar que deba entrar el 14; `main` verde.
- [ ] **Victor:** tener a mano la clave SSH del VPS y el acceso a GitHub desde su PC.
- [ ] **Victor:** confirmar la hora y que alguien esté disponible las 48 h siguientes (§4).
- [ ] **Claude:** dejar «Para retomar» de `STATE.md` actualizado y dejar esta lista al día.

### Preguntas de #177 (solo Victor; mientras no conteste, se deja como está)

1. ¿Hay cuentas de Instagram y Facebook? Si sí, los enlaces; si no, se quitan del pie.
2. ¿Los cuatro buzones reciben y quién los lee?
3. ¿Estará la clave de Anthropic pagada y puesta el 14? Si no, ¿se oculta el botón del asistente?
4. ¿Se enseñan los recuadros «Espacio publicitario» vacíos o se apagan hasta el primer anunciante (existe `?publicidad=no`)?
5. La cinta «Más contratado»: mantener, cambiar por «Recomendado» o quitar.
6. La frase del registro sobre códigos por SMS con el SMS apagado: ¿se cambia?
7. El render de compactadoras con logotipo BOMAG visible: ¿se deja o se pide otro? Y confirmar que una cuenta particular real no ve «capacidad» en su panel.
8. De #79: ¿se sube la versión legal para cambiar «cupos» en `legal.html` (obliga a aceptar de nuevo)? ¿Se permite una nota de crédito sobre un recibo sin NCF (propuesta: no)?

---

## 2. Interruptores el día del lanzamiento

Posición con la que se lanza, salvo que Victor decida otra cosa:

| Interruptor | Dónde | Posición |
|---|---|---|
| Transporte | `assets/servicios.js`, `SERVICIOS.transporte.activo` | `false` (apagado a propósito; es una bandera, no se borra) |
| Financiamiento | `assets/servicios.js`, `SERVICIOS.financiamiento.activo` | `false` |
| Alquiler e importación | `assets/servicios.js` | `true` |
| Transferencia bancaria | `/etc/mercamaquinarias.env`, `MERCA_TRANSFERENCIA_*` (cinco variables, cuenta en DOP) | puestas; sin `MERCA_TRANSFERENCIA=0` |
| CardNet | `MERCA_CARDNET` | sin fijar o `apagado` (hasta afiliación y certificación) |
| SMS | `MERCA_SMS` | sin fijar (los códigos van por correo) |
| Correo | `MERCA_CORREO` | `brevo`, con `BREVO_API_KEY` |
| Asistente | `ANTHROPIC_API_KEY` | puesta; si no, botón oculto (decisión de Victor) |
| HTTPS | `MERCA_HTTPS` | `1` (ya lo fija la unidad de systemd) |

Comprobar sin imprimir secretos (nunca pegar valores en el chat ni en un issue):

```bash
grep -c '^MERCA_TRANSFERENCIA_' /etc/mercamaquinarias.env        # debe dar 5
grep -E '^(MERCA_CARDNET|MERCA_SMS|MERCA_CORREO)=' /etc/mercamaquinarias.env
grep -c '^ANTHROPIC_API_KEY=' /etc/mercamaquinarias.env          # 1 si hay clave
grep -n 'activo' /var/www/mercamaquinarias/assets/servicios.js
```

---

## 3. El día 14, en orden

### 3.1 Antes de nada: estado de la rama y del último despliegue

- [ ] En GitHub, Actions: el último `desplegar` de `main` termina en «Sitio arriba» y `pruebas` y `navegador` están en verde.

### 3.2 Respaldo verificado (siempre, aunque no haya migración pendiente)

```bash
mkdir -p /var/backups/mercamaquinarias
rm -f /var/backups/mercamaquinarias/lanzamiento-2026-10-14.db
sqlite3 /var/lib/mercamaquinarias/mercamaquinarias.db "VACUUM INTO '/var/backups/mercamaquinarias/lanzamiento-2026-10-14.db'"
sqlite3 /var/backups/mercamaquinarias/lanzamiento-2026-10-14.db "PRAGMA integrity_check;"
```

La segunda orden tiene que responder exactamente `ok`. Si no, no se sigue. (`VACUUM INTO` se niega a escribir sobre un archivo que ya existe; por eso el `rm -f`.)

- [ ] Respaldo hecho y `ok`.

### 3.3 Servicio, temporizadores y registro

```bash
systemctl status mercamaquinarias --no-pager
curl -I http://127.0.0.1:8080/
systemctl list-timers 'mercamaquinarias*'
journalctl -u mercamaquinarias --since today
journalctl -u mercamaquinarias --since today -p err
tail -n 50 /var/log/nginx/error.log
```

- [ ] Servicio `active (running)` y `curl` local responde 200.
- [ ] Temporizadores presentes con próxima ejecución: `mercamaquinarias-tareas.timer` (5:00 diario), `mercamaquinarias-informe-semanal.timer` (lunes 7:00), `mercamaquinarias-informe-mensual.timer` (día 1, 7:30). `mercamaquinarias-pagos.timer` (cada 10 min) existe tras el despliegue pero no hace nada con `MERCA_CARDNET` sin fijar: es lo previsto.
- [ ] El registro no trae errores nuevos ni el aviso de arranque que nombra variables de transferencia que faltan. Un «sms: …» o «Brevo devolvió 402» es una alerta.
- [ ] Probar las tareas sin efectos: `sudo -u mercamaquinarias node /var/www/mercamaquinarias/tools/tareas.js --seco`.

### 3.4 Comprobar el sitio en vivo (desde el PC de Victor, no desde la nube)

```bash
curl -sI https://mercamaquinarias.com/ | head -n 15
curl -sI https://www.mercamaquinarias.com/ | head -n 5     # debe mandar al dominio sin www
curl -s  https://mercamaquinarias.com/api/salud
curl -s  https://mercamaquinarias.com/api/planes | grep -o '"metodosPago":\[[^]]*\]'   # debe dar ["transferencia"], nunca "demo" ni [] (auditoría 2026-10)
curl -sI https://mercamaquinarias.com/robots.txt
curl -sI https://mercamaquinarias.com/sitemap.xml
curl -sI https://mercamaquinarias.com/transporte.html      # apagado: debe redirigir a la portada
curl -sI https://mercamaquinarias.com/financiamiento.html  # apagado: debe redirigir a la portada
```

Y a mano en el navegador, en móvil y escritorio:

- [ ] Portada, catálogo, una ficha, `planes.html`, `contacto`, `legal.html`, la 404: cargan, sin enlaces rotos.
- [ ] **Registro:** crear una cuenta nueva con un correo propio; llega el código por correo (no por SMS) y se verifica.
- [ ] **Publicar:** con una cuenta de prueba, llegar hasta el pago de un equipo; el borrador queda «pendiente de pago».
- [ ] **Pago:** se ofrece la transferencia con los datos correctos de la cuenta; NO se ofrece tarjeta (CardNet apagado). Si Victor decidió encender CardNet, es otra lista (`deploy/README.md` §10c) y no se mezcla con el 14.
- [ ] **Confirmar el pago** en la consola como administrador: se activa el anuncio y sale el comprobante con NCF de una secuencia vigente. Revisar el PDF a ojo.
- [ ] **Correo:** el de confirmación llega, no cae en spam, y el pie y los buzones son los correctos.
- [ ] **Asistente:** responde (o, sin clave, el botón está oculto según lo decidido).
- [ ] El pie no enseña redes sin cuenta; los recuadros publicitarios están como se decidió.
- [ ] Ningún número de teléfono de soporte visible; los únicos canales son el correo y el asistente.

### 3.5 Si todo está bien

- [ ] Avisar a Victor «lanzamiento hecho», anotarlo en `STATE.md` y empezar la vigilancia de §5.

---

## 4. Plan de vuelta atrás

Regla fija: nunca `--force`, nunca push directo a `main`, nunca reescribir historial. Hay otra persona trabajando en el repositorio.

### 4.1 Revertir el último despliegue (código)

1. En GitHub, abrir el PR fusionado que causó el problema y pulsar **Revert**: crea un PR nuevo que deshace los cambios.
2. Esperar `pruebas` y `navegador` en verde y fusionarlo. El despliegue automático publica la versión anterior.
3. Comprobar «Sitio arriba» en el job `desplegar`.

El script de despliegue ya vuelve solo a la versión anterior si el sitio no responde tras reiniciar, pero eso devuelve el código, no la base.

### 4.2 Restaurar la base (solo si una migración o los datos quedaron mal)

Primero revertir el PR (4.1) para que la versión nueva no vuelva a migrar al arrancar. Los respaldos automáticos de antes de migrar están en `/var/backups/mercamaquinarias/antes-de-migrar/` (se conservan los últimos 5); el de §3.2 está en `/var/backups/mercamaquinarias/`.

```bash
ls -lt /var/backups/mercamaquinarias/antes-de-migrar/
sqlite3 /var/backups/mercamaquinarias/antes-de-migrar/<archivo>.db "PRAGMA integrity_check;"   # debe responder: ok
systemctl stop mercamaquinarias mercamaquinarias-tareas.timer
mv /var/lib/mercamaquinarias/mercamaquinarias.db /var/lib/mercamaquinarias/roto-$(date +%F).db
cp /var/backups/mercamaquinarias/antes-de-migrar/<archivo>.db /var/lib/mercamaquinarias/mercamaquinarias.db
chown mercamaquinarias: /var/lib/mercamaquinarias/mercamaquinarias.db
sqlite3 /var/lib/mercamaquinarias/mercamaquinarias.db "PRAGMA integrity_check;"                 # otra vez: ok
systemctl start mercamaquinarias mercamaquinarias-tareas.timer
systemctl status mercamaquinarias --no-pager
```

- Si el `integrity_check` no responde exactamente `ok`, no se restaura ese archivo: probar el siguiente más reciente.
- La base rota se aparta, no se borra.
- Lo que entró entre el respaldo y la vuelta atrás (cuentas, pagos, comprobantes) se pierde en la copia restaurada y está en `roto-<fecha>.db`. **Un comprobante emitido nunca se borra ni se reescribe**: si en la base rota hay comprobantes con NCF ya entregados, hay que avisar a Victor y a su contador antes de seguir, y corregir con nota de crédito B04, no a mano.
- Después de restaurar, confirmar el sitio como en §3.4.

### 4.3 Apagar sin revertir

- Un servicio con fallo: `activo: false` en `assets/servicios.js` por PR.
- CardNet: `MERCA_CARDNET=apagado` (o borrar la línea) y `systemctl restart mercamaquinarias`.
- SMS: borrar `MERCA_SMS=brevo` y reiniciar.
- Transferencia: `MERCA_TRANSFERENCIA=0` y reiniciar.

---

## 5. Primeras 48 horas

| Cada cuánto | Qué mirar | Comando o lugar |
|---|---|---|
| Cada hora, las primeras 6 h | Errores del servicio | `journalctl -u mercamaquinarias --since "1 hour ago" -p err` |
| Cada hora, las primeras 6 h | Registro de nginx | `tail -n 50 /var/log/nginx/error.log` |
| Cada 2-3 h el día 14 | Buzones: registros, pagos por transferencia, consultas | los cuatro buzones de §1 |
| Cada 2-3 h el día 14 | Pagos pendientes en la consola, para confirmarlos al verlos en el banco | consola de administración |
| Dos veces al día | Correo saliente: que no se acerque al tope del plan gratuito de Brevo (300/día); un 402 en el registro es alerta | `journalctl -u mercamaquinarias --since today \| grep -i brevo` |
| Dos veces al día | Gasto de la clave de Anthropic frente al límite mensual (si hay clave) | console.anthropic.com |
| Dos veces al día | Secuencias de NCF: cuántos quedan y cuándo vencen | aviso diario a gerencia; consola |
| El día 15 a las 5:00 | La primera ejecución de las tareas (caducidad de anuncios, avisos, respaldo) | `systemctl list-timers 'mercamaquinarias*'` y `journalctl -u mercamaquinarias-tareas --since today` |
| Lunes siguiente 7:00 | Primer informe semanal a `gerencia@inversionesxzt.com`, con la copia aparte a `facturacion@mercamaquinarias.com` | los buzones |
| A las 48 h | Balance: errores, solicitudes sin atender, cualquier cliente que no pudo pagar o registrarse | revisión con Victor |

Reglas para estas 48 h: nada de migraciones ni cambios de precios; solo arreglos de fallos comprobados, con PR y CI en verde. Nada se envía automáticamente a un contador.

---

## 6. Después del 14 (no es parte del lanzamiento)

Según el orden fijado: transporte y financiamiento (fase 11, necesita el contenido real de #79 punto 8 y encender es `activo: true`), luego el lote del contador, luego la deuda técnica. CardNet: antes de encenderlo faltan #65 (un pago no puede consumir dos NCF) y #66 (devolver cobros aprobado-sin-aplicar), ambos con respaldo verificado previo y sin delegar. Borrar los respaldos `antes-telefono.db` y `antes-recuperar-cuenta.db` cuando lleven unos días sin problemas.
