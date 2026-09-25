# Despliegue de MercaMaquinarias en un VPS

Ubuntu 24.04. El dominio ya está puesto en todos los archivos: `mercamaquinarias.com`.

El sitio corre como un proceso Node en el puerto 8080, escuchando solo
en local. Nginx lo publica hacia fuera en los puertos 80 y 443 y se
encarga del certificado.

**Requisito importante:** Node 22.5 o superior. La base usa el módulo
integrado `node:sqlite`, que no existe en versiones anteriores. Estos
pasos instalan Node 24 LTS.

---

## 1. Servidor y usuario

```bash
# Como root, recién creado el VPS
apt update && apt upgrade -y
apt install -y curl git nginx

# Node 24 LTS
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
apt install -y nodejs
node --version   # debe decir v24.x

# Usuario sin privilegios para el sitio
adduser --system --group --home /var/www/mercamaquinarias mercamaquinarias

# Base de datos y fotografías de los anuncios. Fuera del proyecto: así
# un `git pull` no las toca y se respaldan aparte.
mkdir -p /var/lib/mercamaquinarias/fotos
chown -R mercamaquinarias:mercamaquinarias /var/lib/mercamaquinarias
```

## 2. Código

```bash
git clone https://github.com/victoremilio27-code/mercamaquinarias-website.git /var/www/mercamaquinarias
chown -R mercamaquinarias:mercamaquinarias /var/www/mercamaquinarias
```

El repositorio es **público**, así que `git clone` no pide credenciales.
Si algún día pasa a privado, hará falta una *deploy key* de solo lectura:
genera una clave en el servidor con `ssh-keygen -t ed25519 -C mercamaquinarias-vps`,
copia `~/.ssh/id_ed25519.pub` y añádelo en GitHub bajo
**Settings → Deploy keys**. Luego clona por SSH:
`git@github.com:victoremilio27-code/mercamaquinarias-website.git`.

**Ese `chown` no es opcional.** Todo lo que toque este directorio después
—incluido cualquier `git` que se ejecute a mano— tiene que ser como
`mercamaquinarias`, nunca como root: git escribe los objetos nuevos con el dueño
de quien lo ejecuta, y un solo `git pull` hecho como root deja el
repositorio inservible para el despliegue automático.

No hace falta `npm install`: el servidor y la API no usan dependencias.
Puppeteer es solo para capturas en desarrollo.

## 3. Secretos

```bash
# Genera un secreto de sesión largo y aleatorio
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Crea `/etc/mercamaquinarias.env` con ese valor:

```
MERCA_SECRETO=<el valor generado arriba>

MERCA_CORREO=brevo
BREVO_API_KEY=<la clave de Brevo>
MERCA_REMITENTE=MercaMaquinarias <no-reply@mercamaquinarias.com>
MERCA_REVISION=dealers@mercamaquinarias.com
MERCA_SITIO=https://mercamaquinarias.com
```

Ciérralo para que solo root lo lea:

```bash
chmod 600 /etc/mercamaquinarias.env
chown root:root /etc/mercamaquinarias.env
```

`MERCA_SECRETO` firma las sesiones. Si cambia, todo el mundo pierde
la sesión iniciada; si se filtra, cualquiera puede falsificar una. No
lo pongas nunca en el repositorio.

## 4. Servicio

```bash
cp /var/www/mercamaquinarias/deploy/mercamaquinarias.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mercamaquinarias
systemctl status mercamaquinarias
```

La base se crea sola en `/var/lib/mercamaquinarias/mercamaquinarias.db` a partir de
`db/schema.sql` la primera vez que arranca.

Comprueba que responde en local antes de seguir:

```bash
curl -I http://127.0.0.1:8080/
```

### Inventario de partida

La base nace vacía. Hay que sembrar la flota propia —los equipos de
alquiler y las camas de transporte—, que es inventario real y no
demostración:

```bash
sudo -u mercamaquinarias MERCA_DB=/var/lib/mercamaquinarias/mercamaquinarias.db \
  node /var/www/mercamaquinarias/tools/seed.js --solo-flota
```

**Nunca ejecutes `node tools/seed.js` sin `--solo-flota` en
producción**: sin esa bandera crea cinco anunciantes falsos con sus
anuncios, y limpiarlos después es una molestia evitable.

Repetirlo no duplica nada: si la flota ya está, no la toca.

### Cuentas del equipo

Se crean desde el servidor, con el correo ya verificado:

```bash
cd /var/www/mercamaquinarias

sudo -u mercamaquinarias node tools/admin.js crear principal@mercamaquinarias.com \
  "Administración MercaMaquinarias" --admin --exenta --empresa "MercaMaquinarias"

sudo -u mercamaquinarias node tools/admin.js crear <tu-correo> "<Tu nombre>" --exenta
sudo -u mercamaquinarias node tools/admin.js crear <correo-socio> "<Nombre>" --exenta
```

Cada comando imprime la contraseña generada **una sola vez**. Anótalas
antes de cerrar la terminal.

`--admin` da acceso a `/admin.html`; `--exenta` permite publicar sin
pagar. Ninguna de las dos se puede conceder desde el sitio.

Para ver quién tiene permisos internos: `node tools/admin.js listar`.

## 5. Nginx (arranque, sin certificado todavía)

`deploy/nginx.conf` es la configuración **definitiva** y da por hecho que
el certificado existe. En una máquina recién montada no existe, así que
primero va un bloque mínimo que sirva el sitio por HTTP puro. Es lo que
certbot necesita para validar el dominio en el paso 7.

```bash
cat > /etc/nginx/sites-available/mercamaquinarias <<'FIN'
server {
    listen 80;
    listen [::]:80;
    server_name mercamaquinarias.com www.mercamaquinarias.com;
    client_max_body_size 12M;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Host $host;
    }
}
FIN

ln -s /etc/nginx/sites-available/mercamaquinarias /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

**Sin redirigir a HTTPS todavía.** Redirigir antes de tener certificado
deja el sitio inalcanzable: el navegador va a https, no hay certificado
y no llega a ninguna parte.

## 6. DNS

En el panel del registrador, apuntando a la IP del VPS:

| Tipo | Nombre | Valor        |
|------|--------|--------------|
| A    | `@`    | IP del VPS   |
| A    | `www`  | IP del VPS   |

Espera a que propague antes del paso siguiente; certbot falla si el
dominio todavía no resuelve al servidor. Verifica con
`dig +short mercamaquinarias.com`.

## 7. HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d mercamaquinarias.com -d www.mercamaquinarias.com
```

Certbot reescribe la configuración de nginx para servir por HTTPS y
redirigir el HTTP. La renovación queda automática por temporizador.

Con el certificado ya puesto, se sustituye por la configuración buena,
que además manda el `www` al dominio sin `www`:

```bash
cp /var/www/mercamaquinarias/deploy/nginx.conf /etc/nginx/sites-available/mercamaquinarias
nginx -t && systemctl reload nginx
```

Si el sitio viene de otro dominio, `deploy/nginx-dominio-viejo.conf`
lo redirige entero al nuevo con un 301. Es temporal y el propio archivo
explica cómo quitarlo.

El servicio ya arranca con `MERCA_HTTPS=1`, que marca las cookies de
sesión como `Secure`. Eso **solo funciona una vez que el certificado
está puesto**: si entras por HTTP puro con esa variable activa, el
navegador descarta la cookie y no se puede iniciar sesión. Por eso este
paso va antes de dar el sitio por publicado.

## 8. Cortafuegos

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```

---

## 9. Correo saliente (Brevo)

Sin esto no salen ni los códigos de verificación: nadie puede crear
una cuenta. Es el paso que más se olvida y el que más rápido se nota.

1. Crea la cuenta en [brevo.com](https://www.brevo.com) y añade el
   dominio en **Senders, Domains & Dedicated IPs → Domains**.
2. Brevo da tres registros DNS —**DKIM**, **DMARC** y un TXT de
   verificación—. Añádelos en el registrador junto al SPF:

   ```
   TXT  @   v=spf1 include:spf.brevo.com ~all
   ```

   Los tres son necesarios. Sin ellos el correo sale, pero Gmail y
   Outlook lo mandan a spam, que a efectos prácticos es lo mismo que
   no enviarlo.
3. Genera la clave en **SMTP & API → API Keys** y ponla en
   `/etc/mercamaquinarias.env` como `BREVO_API_KEY`.
4. Comprueba que sale de verdad. **Como root**, que es quien puede leer
   el archivo de secretos; la herramienta saca la configuración de la
   misma unidad de systemd que usa el sitio, así que no hay que
   repetirle nada:

   ```bash
   cd /var/www/mercamaquinarias
   node tools/probar-correo.js tucorreo@gmail.com
   ```

   Antes de enviar imprime qué transporte, qué remitente y si encuentra
   la clave. Si dice `archivo` en vez de `brevo`, el correo se queda en
   el servidor y no sale a internet.

El plan gratuito son 300 correos al día. Con el volumen inicial sobra;
si se queda corto, se nota porque la API empieza a devolver 402 y el
registro del servicio lo anota.

## 10. El asistente del sitio (Anthropic)

El chat flotante llama a la API de Anthropic desde `tools/chat.js`. La
clave **nunca llega al navegador**: vive en `/etc/mercamaquinarias.env`,
la lee el servicio y solo ese archivo habla con Anthropic.

Sin clave el sitio funciona igual: el chat responde con una disculpa y
el correo de soporte. No es un fallo, es el comportamiento previsto.

1. En **console.anthropic.com → API keys**, crea una clave. Es una
   cuenta de API con su propio saldo: **no se paga con la suscripción
   de claude.ai**, son cosas distintas y se facturan aparte.
2. En **Settings → Limits**, pon un límite de gasto mensual. Con el
   asistente actual —Sonnet 5, sin pensamiento extendido, respuestas de
   800 tokens— una conversación cuesta centavos, pero un límite evita
   sorpresas si alguien se pone a conversar por deporte.
3. Añádela al archivo de secretos y reinicia el servicio:

   ```bash
   printf 'ANTHROPIC_API_KEY=%s\n' 'sk-ant-…' >> /etc/mercamaquinarias.env
   chmod 600 /etc/mercamaquinarias.env
   systemctl restart mercamaquinarias
   ```

4. Comprueba que responde. El cliente se prueba sin gastar una llamada
   real —sustituye la petición por un doble—:

   ```bash
   cd /var/www/mercamaquinarias
   node tools/prueba-chat.js
   ```

   Y en el sitio, abre el chat y pregunta algo que esté en el prompt,
   por ejemplo «¿cómo publico una excavadora?».

**Qué sabe el asistente** está escrito en el prompt de `tools/chat.js`:
qué es MercaMaquinarias, cómo se publica, los planes y sus precios —que
los lee de `assets/precios.js`, no los repite a mano—, el alquiler, la
importación, y qué servicios NO se ofrecen ahora mismo. Cuando algo no
está ahí, tiene orden de decir que no lo sabe y pasar el correo de
soporte, en vez de inventar. Si cambia un precio o una regla, se cambia
ahí y se despliega: no hay que reentrenar nada.

**Modelo**: por defecto `claude-sonnet-5`. Se cambia con
`MERCA_CHAT_MODELO` sin tocar código: `claude-haiku-4-5` sale más
barato, `claude-opus-5` responde mejor y cuesta más.

## 10b. Cobro por transferencia bancaria

Es el camino de cobro mientras CardNet no esté afiliado: el comprador
ve los datos de la cuenta, transfiere, y el personal marca el pago como
recibido en la consola cuando lo ve en el banco. Solo entonces se
otorgan los cupos y se emite el comprobante.

Los datos de la cuenta **no están en el repositorio** ni tienen valor
por defecto: solo los tiene Victor. Con cualquiera de las cinco
variables vacía o mal escrita, la transferencia no se ofrece y el sitio
sigue exactamente como antes. La cuenta tiene que ser **en pesos
(DOP)**: los precios lo son.

1. Añade las cinco líneas al archivo de secretos, cambiando cada
   marcador entre ángulos por el dato real:

   ```bash
   cat >> /etc/mercamaquinarias.env <<'FIN'
   MERCA_TRANSFERENCIA_BANCO=<nombre del banco, como lo reconoce el cliente>
   MERCA_TRANSFERENCIA_TITULAR=<titular exacto de la cuenta>
   MERCA_TRANSFERENCIA_RNC=<RNC de 9 dígitos o cédula de 11, con o sin guiones>
   MERCA_TRANSFERENCIA_TIPO=<corriente o ahorros>
   MERCA_TRANSFERENCIA_CUENTA=<número de cuenta en pesos, dígitos y guiones>
   FIN
   chmod 600 /etc/mercamaquinarias.env
   systemctl restart mercamaquinarias
   ```

2. Comprueba que quedó encendida:
   - el registro del servicio (`journalctl -u mercamaquinarias -n 50`) ya
     **no** muestra el aviso de arranque que nombra las variables de la
     transferencia que faltan;
   - `planes.html` ofrece pagar por transferencia.

   Si el aviso sigue saliendo, nombra la variable que falta o no valida
   (nunca su valor): corrígela y reinicia otra vez.

3. Para apagarla sin borrar los datos, añade `MERCA_TRANSFERENCIA=0` y
   reinicia.

**Qué cambia al encenderla.** El procesador de demostración, que aprueba
siempre, deja de estar al alcance del comprador. Desde ese momento toda
compra con importe queda **pendiente** hasta que el personal la marque
como recibida en la consola; hasta entonces no hay cupos ni comprobante.

## 11. Mantenimiento automático

Caducar anuncios, avisar de vencimientos, purgar y respaldar la base:

```bash
mkdir -p /var/backups/mercamaquinarias
chown mercamaquinarias:mercamaquinarias /var/backups/mercamaquinarias

cp /var/www/mercamaquinarias/deploy/mercamaquinarias-tareas.* /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mercamaquinarias-tareas.timer
systemctl list-timers mercamaquinarias-tareas.timer
```

Corre a las 5:00. Para ver qué haría sin hacer nada:

```bash
sudo -u mercamaquinarias node tools/tareas.js --seco
```

### Los informes a gerencia

Aparte del mantenimiento, porque tienen su propio horario: semanal los
lunes a las 07:00 y mensual el día 1 a las 07:30. Van a
`gerencia@inversionesxzt.com` con copia a `facturacion@`.

```bash
cp /var/www/mercamaquinarias/deploy/mercamaquinarias-informes.service /etc/systemd/system/
cp /var/www/mercamaquinarias/deploy/mercamaquinarias-informe-*.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now mercamaquinarias-informe-semanal.timer
systemctl enable --now mercamaquinarias-informe-mensual.timer
systemctl list-timers 'mercamaquinarias-informe-*'
```

**No van en la tanda diaria** a propósito: un informe semanal que
llegara todos los días se dejaría de leer en una semana, y entonces
tampoco se leería el que importa.

Para verlo sin mandarlo, o para mandarlo a mano:

```bash
sudo -u mercamaquinarias node tools/tareas.js --seco informe-semanal
sudo -u mercamaquinarias node tools/tareas.js informe-mensual
```

El semanal cubre de lunes a domingo de la semana **cerrada**, y el
mensual el mes anterior completo. No son «los últimos siete días»: si
los periodos solaparan, las cifras de dos informes no se podrían sumar
y no habría forma de cuadrar el mes.

Cada tarea es idempotente: repetirla no manda dos veces el mismo aviso.

**Saca los respaldos del servidor.** Un respaldo en la misma máquina no
protege del fallo que más importa, que es perder la máquina. Con
`rclone` a cualquier almacenamiento remoto:

```bash
rclone sync /var/backups/mercamaquinarias remoto:mercamaquinarias-respaldos
rclone sync /var/lib/mercamaquinarias/fotos remoto:mercamaquinarias-fotos
```

**Las fotos van en su propia línea a propósito.** La tarea de
mantenimiento respalda la base, que es donde están las rutas, pero no
las imágenes: son archivos y crecen mucho más rápido que la base.
Restaurar solo la base dejaría cada anuncio apuntando a una foto que
ya no existe.

## Actualizar el sitio

**No hace falta entrar al servidor.** Al fusionar un Pull Request en `main`,
GitHub Actions despliega solo: ver `.github/workflows/desplegar.yml`. El
resultado se mira en la pestaña **Actions** del repositorio, o con
`gh run list --workflow=desplegar.yml`.

Las migraciones de `tools/db.js` se aplican solas al arrancar.

### Qué hace el despliegue

`/usr/local/bin/desplegar-mercamaquinarias`, como root:

0. `chown -R mercamaquinarias:mercamaquinarias` sobre el repositorio. **No es decorativo:**
   si alguien entra al servidor y hace `git pull` como root, git deja objetos
   nuevos con dueño root y el siguiente despliegue falla con *insufficient
   permission for adding an object*. Pasó exactamente eso la primera vez.
1. `git fetch` y, si no hay nada nuevo, termina sin tocar el servicio.
2. `git merge --ff-only origin/main` — a propósito: si alguien hubiera
   hecho un commit a mano en el servidor, es preferible que el despliegue
   falle a que se fusione a ciegas.
3. Reinicia `mercamaquinarias` y espera hasta 15 s a que el sitio responda.
4. **Si no responde, vuelve solo a la versión anterior** y la reinicia.
   Ojo: eso devuelve el código, no la base. Las migraciones son de ida;
   como solo añaden, una versión anterior sigue arrancando, pero una
   migración que borrara o renombrara algo rompería esa suposición.

### Cómo está montado el acceso

- Usuario `deploy`, sin contraseña, y una regla en `/etc/sudoers.d/deploy`
  que le deja ejecutar ese script y nada más.
- La llave de GitHub Actions vive en `/home/deploy/.ssh/authorized_keys`
  con la orden **forzada**: `command="sudo -n /usr/local/bin/desplegar-mercamaquinarias"`,
  sin pty ni reenvíos. Aunque el secreto se filtrara, esa llave no sirve
  para leer nada de la máquina — se comprobó pidiéndole
  `cat /etc/mercamaquinarias.env` y ejecutó el despliegue igualmente.
- Los secretos del repositorio son `VPS_HOST` y `VPS_SSH_KEY`. La llave
  privada no queda en ningún PC.

### A mano, si alguna vez hace falta

```bash
cd /var/www/mercamaquinarias
sudo -u mercamaquinarias git pull
systemctl restart mercamaquinarias
```

## Copias de seguridad

Toda la información vive en un archivo. Cópialo fuera del servidor con
regularidad; SQLite necesita `.backup` en vez de `cp` para no capturar
una escritura a medias:

```bash
sqlite3 /var/lib/mercamaquinarias/mercamaquinarias.db ".backup '/tmp/respaldo.db'"
```

## Ver qué pasa

```bash
journalctl -u mercamaquinarias -f      # registro del sitio
tail -f /var/log/nginx/error.log # registro de nginx
```
