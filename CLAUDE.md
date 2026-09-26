# MercaMaquinarias — reglas de este repositorio

Victor tiene además un `CLAUDE.md` global en su PC. **Las sesiones en la nube no lo
ven**, así que lo imprescindible de él está copiado en «Cómo se trabaja con Victor».
Todo lo demás de abajo son reglas que ya costaron caro una vez.

El mapa completo del código está en `.planning/codebase/` y el contexto del proyecto en
`.planning/PROJECT.md`. **Dónde va el trabajo ahora mismo está en `.planning/STATE.md`**:
léelo al empezar una sesión nueva, antes de explorar a ciegas.

## Cómo se trabaja con Victor

- **El proyecto se llama MercaMaquinarias.** "TuEquipoRD" es el nombre viejo: sobrevive
  solo en la carpeta local, en la migración que renombra los datos antiguos, en la clave
  del borrador viejo de `assets/publicar.js` y en la redirección del dominio viejo. No
  lo uses para nada nuevo.
- Todo en español. Decide tú lo técnico y reversible; agrupa en una sola tanda las
  preguntas que solo él puede contestar (datos reales, pagos, algo irreversible).
- **Se trabaja por fases GSD en orden fijo** (`.planning/ROADMAP.md`): lanzamiento →
  transporte y financiamiento → lote del contador → deuda técnica. Lanzamiento el
  **2026-10-14**, fecha firme. Solo la afiliación de CardNet puede retrasarlo, nunca
  nuestro trabajo.
- **Una petición nueva a mitad de fase no interrumpe:** se anota en la fase que le toca y
  se recoge al cerrar la actual.
- **El plazo se dice una vez y no se repite** en cada mensaje.
- **Luz verde:** con *"sigue hasta que se acabe el uso"* no se espera entre tareas ni
  fases, y se pueden correr 2 o 3 agentes en paralelo si no tocan los mismos archivos.
  Si pidió esperar en un punto de control, se espera.
- **Publicar:** autorizó fusionar a `main` en cuanto un PR tenga el CI en verde, sin
  volver a preguntar, y comprobar después el sitio en vivo. Eso no cubre saltarse la
  barrera ni silenciar una prueba para poder publicar.
- **Revisiones de código solo cuando él las pida.** Al cerrar un bloque grande basta con
  decir "Listo para revisión si quieres".
- Commits pequeños, en español, con `git add` de rutas explícitas; nunca `git add .`,
  `stash` sin etiqueta, `--force` ni push a `main`.
- **El video en anuncios (PR #9) está en pausa a propósito:** terminado pero sin
  fusionar, porque falta una prueba manual que el navegador sin pantalla no puede hacer.

## En la nube (claude.ai/code)

Victor trabaja también en sesiones en la nube, que gastan un crédito propio. Allí no hay
nada de su PC: ni su `CLAUDE.md` global, ni la memoria de sesiones anteriores, ni GSD.
`tools/preparar-nube.sh` los deja listos: Node ≥ 22.5, `npm ci` y GSD. Va configurado
como script de preparación del entorno.

Una misma fase no se trabaja a la vez en la nube y en local: cada sesión en su rama.

## Reglas de negocio que no se negocian

- **Nunca se envía nada automáticamente a un contador.** Victor acumula los comprobantes
  y los manda él a fin de mes. Si alguna vez parece que "falta" el envío automático,
  no falta: está prohibido a propósito.
- **Los únicos canales de soporte son el correo electrónico y el asistente del sitio.**
  No se publica un número de teléfono en ninguna página.
- **Los informes van a `gerencia@inversionesxzt.com`** con copia a
  `facturacion@mercamaquinarias.com`. La copia se manda como correo aparte, no como CC.
- **El modelo comercial cambia según `.planning/research/modelo-comercial.md`**, autorizado
  por Victor el 2026-09-25: el particular paga por publicar un equipo y el dealer por una
  capacidad de publicaciones activas; precio final = base × 1,03 × 1,18, con el 3 % dentro
  del subtotal gravado y nunca a la vista como cargo. **Fuera de ese documento no se toca
  nada de precios:** no propongas planes ni precios nuevos.
- **Transporte y financiamiento están apagados a propósito** con el interruptor de
  `assets/servicios.js`. Es una bandera, no código muerto: no lo borres. Encenderlos es
  cambiar `activo` a `true`.
- No publiques la dirección de la empresa salvo que sea imprescindible; para facturas se
  usa el domicilio registrado que ya está en `tools/correo.js`.

## Fiscal (DGII) — irreversible

- **Un comprobante emitido nunca se borra ni se reescribe.** Ni el importe, ni el NCF,
  ni la fecha. Si hay que corregir, se emite una nota de crédito (B04).
- Los NCF se consumen de secuencias con tope y vencimiento. Emitir desde una secuencia
  agotada o vencida es un error que el cliente no puede usar como crédito fiscal.
- ITBIS 18 %. B01 crédito fiscal, B02 consumo, B04 notas de crédito.

## Arquitectura: lo que parece raro pero es deliberado

- **Cero dependencias en tiempo de ejecución.** El servidor, SQLite, el correo, el PDF y
  la llamada a Anthropic están escritos a mano sobre módulos de Node. La única
  dependencia de desarrollo es puppeteer. **No añadas paquetes**; si crees que hace
  falta uno, dilo y explica por qué no se puede sin él.
- **Sin paso de compilación y sin TypeScript.** El frontend son `.html` sueltos con
  `assets/*.js` cargados por `<script>`, en orden fijo.
- **`node:sqlite` con `DatabaseSync`** (requiere Node ≥ 22.5; el VPS corre Node 24).
  Todo el SQL vive en `tools/db.js`.
- **Las migraciones solo se añaden al final.** Nunca se reescribe una anterior: ya se
  ejecutó en producción. Van en el array `MIGRACIONES` de `tools/db.js`.
- **Las rutas son un array plano** `[metodo, regexp, manejador]` en `tools/api.js`. Una
  ruta más específica va **antes** que la genérica.
- **Módulos compartidos entre navegador y node** (`assets/precios.js`, `servicios.js`,
  `taxonomia.js`, `legales.js`): se cargan con `<script>` y con `require()`, y terminan
  en `if (typeof module !== 'undefined' && module.exports)`. No rompas ese final.
- **Producción está detrás de Cloudflare**, así que la IP fiable del cliente es la
  cabecera `CF-Connecting-IP`, no el primer elemento de `X-Forwarded-For`.

## Despliegue — cuidado

- **Fusionar a `main` despliega a producción automáticamente.** El despliegue espera a
  que pasen `pruebas` y `navegador` en CI, pero GitHub todavía deja **fusionar** un PR en
  rojo: la protección de rama es un paso manual de Victor (plan 01-02). Mira el CI antes
  de fusionar. Rama y Pull Request siempre; nunca push directo a `main`.
- Hay **otra persona trabajando en este repositorio**. Nunca reescribas historial ni uses
  `--force`.
- Antes de tocar la base de producción, respaldo verificado (`VACUUM INTO` +
  `integrity_check`).

## Pruebas

```bash
npm run auditar            # taxonomía, público, flujos y permisos
npm run check              # enlaces
npm run seguridad:probar   # 87 comprobaciones sobre un arnés falso de req/res
npm run dealer:probar      # 49 comprobaciones de la página del dealer
npm run facturas:probar    # facturación y NCF
npm run chat:probar        # el prompt del asistente
npm run facturas:letras    # node:test, números a letras
```

Conviven tres estilos a propósito: `node:test` para funciones puras, un arnés propio con
contadores y `process.exit` para las pruebas de base y API, y puppeteer para las
auditorías del navegador. **No unifiques los tres.**

En las pruebas con arnés, las variables de entorno se fijan **antes** de `require` de
`tools/db.js`. Si se hace después, la prueba corre contra la base equivocada.

## Trampas concretas

- **El shell se come las comillas invertidas.** No metas código con backticks, `${...}`
  ni expresiones regulares con `\s`/`\d` dentro de un heredoc de bash: se expanden o se
  destrozan. Usa las herramientas de escritura de archivos. Esto ya rompió trabajo dos
  veces.
- **Saltos de línea:** el repositorio es CRLF (`core.autocrlf=true`) y **`styles.css`
  también**, como todo lo demás. Una búsqueda con `\n` no casa contra un archivo CRLF:
  usa las herramientas de edición de archivos en vez de comparar cadenas a mano.
  *(Aquí decía que `styles.css` era LF. Era falso: comprobado commit por commit, siempre
  tuvo tantos retornos de carro como líneas. Si alguien "restaura el LF" provocará un
  diff de 4.700 líneas que oculta el cambio real.)*
  Lo que sí va en LF obligatoriamente está declarado en `.gitattributes`: los `.sh`, lo
  de `deploy/` y los flujos de `.github/workflows/`. Corren en Linux y bash leería el
  `\r` como parte del comando.
- **El contexto de una ruta pública puede ser `null`.** Comprueba `!!ctx` antes de
  `ctx.organizacion`, o el 500 aparece solo para visitantes sin sesión.
- **`api()` en `assets/sesion.js` lanza** cuando la respuesta no es `ok`. Quien la use en
  un formulario necesita su propio envoltorio con `try/catch`.
- **Los reductores de imagen pintan fondo blanco y exportan JPEG**, así que un PNG con
  transparencia pierde el fondo. Para logotipos hay que conservar el alfa.
- Lo que depende de un pago pendiente (SMS de Brevo, clave de Anthropic, y ahora CardNet)
  se construye entero y se entrega **apagado tras un interruptor**, nunca a medias.

## Idioma

Todo en español: identificadores, comentarios, textos de la interfaz, mensajes de commit
y descripciones de PR. Los comentarios de este proyecto explican **qué falló antes y por
qué el código es así**; sigue ese estilo en vez de comentar lo obvio.
