# Guion del viernes 2026-10-09 — oleadas 7 y 8 de Codex

Para cualquier sesión que lo abra sin contexto: **este archivo es todo lo que hace falta.** Sigue los pasos en
orden. Los números de issue son los del tablero #162. Lanzamiento firme: 2026-10-14. Reglas que no cambian
(`CLAUDE.md`): rama y PR siempre, nunca `main` directo, nunca `--force`, commits en español con rutas
explícitas, lo de Codex es una afirmación hasta verificarlo.

Para gastar poco: **no leas los issues ni los parches a mano.** Todo lo que sea recoger lo hace
`tools/codex.js`; tú solo miras lo que falla.

> **Regla de la palabra con arroba.** Codex arranca una tarea con solo ver su nombre precedido de arroba en un
> comentario o en la descripción de un PR. Por eso esa palabra aparece **solo** dentro de los bloques «Pegar» de
> este documento, y solo se escribe en GitHub el viernes, cuando Victor confirme que Codex tiene uso. Ni en
> descripciones de PR, ni en mensajes de commit, ni en comentarios de revisión.

## 0. Antes de empezar (5 minutos)

1. `git fetch origin` y comprueba en `main`: la oleada 6 está dentro (PR #145 fusionado). Debe existir
   `GET /api/salud` en `tools/api.js` (de #136).
2. Prepara el entorno si es una sesión nueva en la nube: `bash tools/preparar-nube.sh` (Node ≥ 22.5 y `npm ci`).
3. Comprueba que `node tools/codex.js estado 154` contesta (hace una petición a GitHub). Debe decir `ESPERA`
   (sin respuesta de Codex todavía) o `SIN ENCARGO`. Si da 403 en la nube, la herramienta ya se relanza con
   `NODE_USE_ENV_PROXY=1`; si aun así falla, mira `/root/.ccr/README.md`.
4. Confirma con Victor que Codex ya tiene uso. **Si no, no encargues nada** y termina aquí.

## 1. Disparar la oleada 7 (ya, entera a la vez)

Ocho tareas, sin archivos de código compartidos; solo `package.json` recibe una línea de cada una.

Para **cada** issue de la tabla: (a) pega el comentario de abajo, tal cual, en una sola línea; (b) ponle la
etiqueta `en-curso`.

Pegar (idéntico en los ocho):

```text
@codex implementa este issue tal como está descrito, siguiendo AGENTS.md, y entrega el parche como dice «Entrega».
```

| # | Tarea | Archivos que toca |
|---|---|---|
| #154 | Prueba de humo después de desplegar | `tools/humo.js` |
| #155 | Respaldo cifrado fuera del VPS, apagado | `tools/respaldo-externo.js` y su prueba, `tools/tareas.js` (solo `respaldar`), `.env.example`, `deploy/README.md` |
| #156 | El asistente al día con lo nuevo | `tools/chat.js`, `tools/prueba-chat.js` |
| #157 | Pruebas de `assets/legales.js` y `legal.html` | `tools/legales.prueba.js` |
| #158 | Quitar EXIF/GPS de fotos y documentos | `tools/imagen-limpia.js` y su prueba, `tools/fotos.js` y `tools/documentos.js` (solo `guardar`) |
| #159 | Página de mantenimiento para nginx | `deploy/mantenimiento.html` |
| #160 | Prueba de carga ligera | `tools/carga.js` |
| #161 | Pruebas de la lista blanca del servidor | `tools/probar-servidor.js` |

Etiquetas: con la API de GitHub desde la nube, `mcp__github__issue_write` (método `update`, `labels` con las que ya
tiene más `en-curso`). Hay que mandar **la lista completa** de etiquetas, no solo la nueva.

<!-- AÑADIR: issues nuevos de la oleada 7 que salgan de las dos auditorías en curso. Una fila por issue en la tabla
de arriba (mismo comentario «Pegar» de arriba) y su comando de verificación en la sección 4. -->

## 2. Disparar la oleada 8 (cuando cada base esté en `main`)

Cada tarea depende de una base de Claude. **No se encarga hasta que esa base esté fusionada en `main`**; si
el encargo se hace antes, Codex trabaja sobre un `main` sin la base y devuelve un parche que no aplica (pasó en la
tanda 5, issues #127 y #128).

| # | Tarea | Espera a | Archivos que toca |
|---|---|---|---|
| #150 | Un NCF por pago, en una transacción (fiscal) | PR #164 fusionado (base de #146, lleva migración) | `tools/facturas.js` |
| #151 | «Marcar devuelto» en la consola | PR #165 fusionado (base de #147; va sobre #164, así que primero #164) | `tools/api.js`, `assets/admin.js`, `tools/probar-sin-aplicar-api.js`, `package.json` |
| #152 | Fase 14 K1: `tools/importacion.js` y consultas | las bases #148 y #149 en `main` (hoy sin PR) | `tools/db.js` (sección nueva), `tools/importacion.js`, `tools/pagos.js` (mínimo) |
| #153 | Fase 14 K2: calculadora con cifras de muestra, apagada | la base #148 en `main` (hoy sin PR) | archivos nuevos y una línea de `package.json` |

Cómo saber si una base ya está: `gh pr view 164 --json state,mergedAt` (o `mcp__github__pull_request_read`), y en
`main` buscar `enTransaccionInmediata` en `tools/db.js` (#164), `devolverCobroSinAplicar` en `tools/db.js` (#165) y
`assets/importacion.js` (#148/#149). **#164 lleva migración y #165 va encima de él:** los dos PR dicen «no se
fusiona sin Victor». Se fusionan solo si Victor ya los autorizó (en esta conversación o en #162); si no, se dejan
listos con el CI en verde y se le piden en «Para Victor». La base de la importación (#148/#149) también es suya:
si no dice nada, va después del 14.

Cuando una base esté en `main`, pega en el issue correspondiente el mismo texto de la sección 1:

```text
@codex implementa este issue tal como está descrito, siguiendo AGENTS.md, y entrega el parche como dice «Entrega».
```

y pon `en-curso`. **Excepción:** si una tarea tiene que encargarse antes de que su base esté en `main`,
se encarga en el **PR de la base**, nunca en el issue. En ese PR pega, cambiando el número:

```text
@codex implementa el issue #150 sobre esta rama, tal como está descrito, siguiendo AGENTS.md, y entrega el parche como dice «Entrega».
```

<!-- AÑADIR: issues nuevos de la oleada 8 de las auditorías; anota de qué base dependen y en qué orden. -->

## 3. Recoger (a cualquier hora, cuantas veces haga falta)

Todo con `tools/codex.js`. Carpeta de trabajo: `/tmp/parches` (cualquiera vale).

1. Ver qué ha contestado Codex, sin leer nada:

   ```bash
   node tools/codex.js estado 154 155 156 157 158 159 160 161
   ```

   Una línea por issue. `OK` = respuesta posterior al último encargo con un parche entero (empieza por `From `,
   acaba con la firma de git y sus hunks cuadran). `PARCIAL` = bloque cortado o «parte k de n». `SIN DIFF` =
   solo trajo el comando. `ESPERA` = aún no contesta. Un `AVISO: U+FFFD` significa carácter roto dentro del
   parche: arréglalo a mano en el `.patch` antes de aplicar (así se rompió #128).
2. Para los `PARCIAL` y `SIN DIFF`: devuélvelos con un comentario corto en el issue (aquí sí con la arroba, una
   vez por issue, el texto de abajo cambiando la parte entre corchetes) y vuelve a mirar `estado` más tarde:

   ```text
   @codex tu respuesta [no trae el bloque diff completo / dice parte 1 de N]: devuelve el git format-patch entero de tus commits en un único bloque diff, sin resumir.
   ```

3. Bajar los parches (no aplica nada):

   ```bash
   node tools/codex.js bajar 154 155 156 157 158 159 160 161 --dir /tmp/parches
   ```

4. Rama de la tanda desde `main` actualizado y aplicar en el **orden de abajo**:

   ```bash
   git fetch origin && git checkout -b codex/tanda-7 origin/main
   node tools/codex.js aplicar 159 154 160 161 157 156 155 158 --dir /tmp/parches
   ```

   `aplicar` hace `git am --keep-cr -3` en el orden dado y, si uno falla, `git am --abort`, lo anota y sigue con el
   siguiente; el resumen final dice aplicados y fallidos. Sale con 1 si hay algún fallido.
   Un parche que ya estaba en la rama también se cuenta como fallido («no creó ningún commit»).

**Orden de aplicación y por qué.** Primero lo que solo añade archivos nuevos y no toca nada compartido
(#159, #154, #160, #161, #157), luego lo que toca archivos existentes de uno en uno (#156 `chat.js`, #155
`tareas.js`, #158 `fotos.js` y `documentos.js`). `package.json` lo tocan #154, #155, #157, #158, #160 y #161 con
una línea cada una en puntos distintos; si aun así hay conflicto en `package.json` (líneas contiguas), se resuelve
**conservando las dos líneas** y `git am --continue`; para eso aplica ese parche a mano
(`git am --keep-cr -3 /tmp/parches/<n>.patch`) en vez de con `aplicar`.

Oleada 8, mismo método, rama `codex/tanda-8`, orden `150 151 153 152` (#150 solo `facturas.js`; #151 `api.js` y
`admin.js`; #153 solo archivos nuevos; #152 el último porque es el que toca `db.js` y `pagos.js`):

```bash
git checkout -b codex/tanda-8 origin/main
node tools/codex.js estado 150 151 152 153
node tools/codex.js aplicar 150 151 153 152 --dir /tmp/parches
```

<!-- AÑADIR: orden de aplicación de los issues nuevos (los de menos archivos compartidos primero). -->

### Si un parche no aplica

1. Mira el motivo en la salida de `aplicar` (la herramienta lo imprime debajo del número). Casos:
   - **«ya estaba aplicado»**: la tarea ya estaba en `main`; ignóralo.
   - **Conflicto de contexto**: casi siempre el `main` de Codex era viejo. Devuélvelo con el comentario de
     «devolver» de abajo, pegando solo las 5 primeras líneas del error.
   - **Conflicto en `package.json` entre dos parches de la misma tanda**: resuélvelo a mano conservando las dos
     líneas.
   - **Un `U+FFFD` o una línea de contexto estropeada**: edita esa línea en `/tmp/parches/<n>.patch` y reintenta;
     no gastes un encargo por un carácter.
2. Devolver a Codex, en el issue (una vez por parche):

   ```text
   @codex tu parche no aplica sobre main actual: [pega aquí la causa en una línea]. Rehaz la rama desde origin/main y entrega otra vez el git format-patch entero en un único bloque diff.
   ```

3. Si el segundo intento tampoco aplica, o el issue lleva más de ~2 h sin respuesta con uso disponible: quita
   `en-curso`, anótalo en el #162 y sigue con lo demás. Nada de esto es motivo para retrasar el 14.

## 4. Verificar (siempre entera, antes de publicar)

Con la rama `codex/tanda-7` (o `-8`) ya con los parches aplicados.

### 4.1 Pruebas sin navegador

Es la lista del job `pruebas` de `.github/workflows/desplegar.yml`; si cambia allí, cambia aquí.

```bash
export MERCA_CORREO=archivo MERCA_SECRETO=secreto-de-ci-no-usar-en-produccion
for s in check:encoding taxonomia facturas:letras precios:probar lote:puro alertas:puro busquedas-api:probar alertas:tarea f607:puro especificaciones:puro especificaciones:probar lote:probar paquete:probar servicios:probar seguridad:probar dealer:probar bitacora:probar cuenta:probar busquedas:probar documentos:probar documentos-api:probar testigos:probar respaldo-migrar:probar telefono:probar contactos:probar catalogo:probar facturas:probar respaldo:probar pagos:probar metricas:probar transferencia:probar publicacion:probar renovacion:probar recordatorios:probar capacidad:probar cardnet:probar chat:probar medios:puro pdf:puro entorno:puro meta:probar reglas:puro rango:puro mapa:puro s3:puro cabeceras:puro codex:puro correo:puro rutas:probar tareas:probar solicitudes:probar; do
  npm run "$s" >/tmp/prueba.log 2>&1 && echo "ok     $s" || { echo "FALLA  $s"; tail -25 /tmp/prueba.log; }
done
```

Luego las pruebas **nuevas** de cada issue (las que su «Terminado cuando» nombra y que aún no están en CI):

```bash
for s in respaldo-externo:puro tareas:seco legales:puro imagen-limpia:puro servidor:probar; do
  npm run "$s" >/tmp/prueba.log 2>&1 && echo "ok     $s" || { echo "FALLA  $s"; tail -25 /tmp/prueba.log; }
done
```

Oleada 8, en lugar de lo anterior:

```bash
for s in ncf-unico:probar sin-aplicar:probar sin-aplicar-api:probar importacion:probar importacion:puro importacion-migracion:probar importacion-cifras:puro; do
  npm run "$s" >/tmp/prueba.log 2>&1 && echo "ok     $s" || { echo "FALLA  $s"; tail -25 /tmp/prueba.log; }
done
```

<!-- AÑADIR: los `npm run` de las pruebas de los issues nuevos de las auditorías (están en su «Terminado cuando»). -->

Todo lo que dé `FALLA` se arregla o se devuelve; **nunca** se silencia ni se salta una prueba. En #150 las
pruebas de `ncf-unico:probar` las escribió Claude: Codex no las puede haber tocado; compruébalo con
`git diff origin/main --stat -- tools/probar-*.js tools/*.prueba.js` y que no aparezcan modificadas.

### 4.2 Navegador: `auditar`, `check`, `check:motion` y accesibilidad

Con el sitio arrancado como en el job `navegador` del CI. Chrome como root necesita un envoltorio.

1. Crea el envoltorio con la herramienta de escribir archivos (**no con un heredoc**: el shell se come las comillas
   y los `$@`), en `/tmp/chrome-merca.sh`:

   ```text
   #!/bin/bash
   exec /opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell --no-sandbox --disable-dev-shm-usage --no-zygote --disable-gpu --ignore-certificate-errors "$@"
   ```

   y `chmod +x /tmp/chrome-merca.sh`. Si ese binario no existe, `ls /opt/pw-browsers/`. Sin
   `--ignore-certificate-errors`, `auditar-publico` y `check` salen en rojo solo por Google Fonts.
2. Arrancar, esperar y auditar (puertos fijos: 8080 y 8091; si hay otro agente con el navegador, espera):

   ```bash
   export PUPPETEER_EXECUTABLE_PATH=/tmp/chrome-merca.sh PUPPETEER_SKIP_DOWNLOAD=1
   export MERCA_DB=/tmp/ci-merca.db MERCA_CORREO=archivo MERCA_SECRETO=x MERCA_HTTPS=0 PORT=8080
   rm -f /tmp/ci-merca.db*
   npm run db:demo
   (nohup npm start > /tmp/servidor.log 2>&1 &)
   node tools/esperar-servidor.js --url http://127.0.0.1:8080/
   npm run auditar && npm run check && npm run check:motion && npm run auditar:accesibilidad
   ```

3. Parar el sitio siempre, pase o falle: `lsof -t -i :8080 | xargs -r kill`.

Para #154 y #160 corren contra este mismo sitio arrancado, antes de pararlo:

```bash
npm run humo
npm run carga -- --concurrencia 10 --segundos 15 --pid "$(lsof -t -i :8080 | head -1)"
npm run carga -- --concurrencia 40 --segundos 15 --pid "$(lsof -t -i :8080 | head -1)"
```

`humo` debe pasar entero (y salir con 1 con el servidor parado). En `carga`, si alguna ruta da 5xx,
**no** se arregla dentro del parche: se apunta ruta y error para Claude y se decide si hace falta algo antes del 14.

<!-- AÑADIR: comandos de navegador o de humo/carga que traigan los issues nuevos de las auditorías. -->

### 4.3 Revisar el diff (solo lo que cambió)

```bash
git diff origin/main --stat
git diff origin/main -- <archivo>
```

Contra `CLAUDE.md`: cero dependencias nuevas en `package.json` (solo las líneas de scripts que lista cada issue),
sin TypeScript, ninguna migración en `tools/db.js` (salvo que la tarea lo traiga), `!!ctx` antes de
`ctx.organizacion`, finales de módulo compartido, nada fiscal ni de precios fuera de lo pedido, ningún teléfono,
ninguna dirección de la empresa, nada que envíe a un contador. **#150 es fiscal: se lee línea a línea.**
Para cada archivo que el issue no lista: pregunta por qué está.

### 4.4 A ojo (Codex no tiene navegador)

A **390 y 1280 px**, en **tema claro y oscuro**, con el sitio arrancado como arriba y capturas con
`npm run shot` (o puppeteer con el mismo envoltorio):

- **#159** `deploy/mantenimiento.html`: ábrelo directo (`file://`); legible, sin enlaces rotos ni recursos
  externos, sin teléfono. Después Claude lo conecta: `error_page 502 503 504` en `deploy/nginx.conf`.
- **#151** consola de administración, sección de pagos: el botón «Marcar devuelto» solo sale en un cobro
  `aprobado-sin-aplicar`; el formulario pide motivo; un error se ve; no se desborda a 390 px.
- **#153** `calcular-importacion.html`: con el interruptor apagado no debe verse por ningún enlace del sitio; con
  él encendido en local, el resultado calculado se lee y marca que son cifras de muestra.
- **#156** el asistente del sitio: haz una pregunta de cada frase nueva que Codex listó y comprueba que no
  menciona un teléfono ni precios fuera de `modelo-comercial.md`.
- Cualquier página tocada: nada de «cupos» en texto visible y nada de «TuEquipoRD».

<!-- AÑADIR: qué mirar a ojo de los issues nuevos de las auditorías (página, tema, ancho). -->

### 4.5 Lo que Claude añade al recoger la oleada 7

Es trabajo propio de Claude (no se delega), en la misma rama o en un PR aparte:

- Colgar de CI lo nuevo: un paso por cada `npm run` nuevo del job `pruebas` en
  `.github/workflows/desplegar.yml` (`respaldo-externo:puro`, `legales:puro`, `imagen-limpia:puro`,
  `servidor:probar`).
- Conectar `npm run humo` al final del job `desplegar`, tras «Sitio arriba», con el mismo estilo de pasos.
- `error_page 502 503 504 /mantenimiento.html;` en `deploy/nginx.conf`, sirviendo `deploy/mantenimiento.html`
  (#159).
- Correr `carga` en local y decidir si hace falta algo antes del 14 (#160).

## 5. Publicar

1. Un PR por tanda desde la rama `codex/tanda-7` (o `-8`), contra `main`:

   ```bash
   git push -u origin codex/tanda-7
   ```

   Cuerpo en español, con una línea `Closes #154` por issue que entra (usa solo los que de verdad pasaron la
   verificación) y una línea por cada arreglo que Claude hizo al recoger. **Sin la palabra de Codex con arroba.**
   Termina con:

   ```text
   🤖 Generated with [Claude Code](https://claude.com/claude-code)
   ```

   más el enlace de sesión que pida el recordatorio de atribución de la sesión.
2. **Esperar el CI**: `pruebas` y `navegador` en verde en el **último** commit
   (`mcp__github__pull_request_read` con `get_check_runs`, o `gh pr checks <n>`). En rojo: lee el log del job que falló,
   arregla en la rama (nunca silenciar), vuelve a empujar y a esperar.
3. **Fusionar** con CI en verde (autorizado en `CLAUDE.md`; lo único que no cubre es fusionar con una barrera
   saltada). **Excepción:** si el PR trae una migración (#164, #165 y la base de la importación #148), se fusiona solo si
   Victor lo ha autorizado en esta conversación o en #162; si no, se deja listo y se le pide en «Para Victor».
   Método: `mcp__github__merge_pull_request` (merge normal, como los PR anteriores).
4. **Confirmar el despliegue**: fusionar a `main` lanza el flujo `desplegar.yml`; espera a que el job `desplegar`
   termine y lee su registro con `mcp__github__get_job_logs` (la API de logs por `gh` no llega desde la nube; la red
   de la nube tampoco llega a `mercamaquinarias.com`). Debe contener **`Sitio arriba: <sha>`** con el sha
   de la fusión. Si el despliegue vuelve solo a la versión anterior o el paso falla: avisa a Victor, no reintentes
   a ciegas.
5. Si `humo` ya está conectado (4.5), su paso también debe verse en verde en ese mismo registro.
6. Cierre: los issues con `Closes #…` se cierran solos; quita `en-curso` de los que no entraron; actualiza el
   tablero #162 (editar el cuerpo, no comentar) y la sección «Para retomar» de `.planning/STATE.md`; di a Victor qué
   esperar y, solo si hay algo nuevo, su bloque «Para Victor».
   Si queda tiempo en la sesión: «Listo para revisión si quieres» (sin revisión grande si no la pide).

## Qué no se hace el viernes

- No se toca el PR #9 (video en anuncios, en pausa a propósito).
- No se encarga **nada** que dependa de una base no fusionada en el issue (se hace en el PR de la base).
- Nada de precios fuera de `.planning/research/modelo-comercial.md`; nada de enviar a un contador; ningún teléfono.
- Migraciones y producción no se delegan nunca; el respaldo previo a una migración lo hace el despliegue (#73).
- No se mezclan la oleada 7 y la 8 en un mismo PR: dos ramas, dos PR.
