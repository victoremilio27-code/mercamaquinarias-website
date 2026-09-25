# MercaMaquinarias — reglas de este repositorio

Lo general de cómo trabajar con Victor está en el `CLAUDE.md` global.
Aquí va solo lo propio de este proyecto. Todo lo de abajo son reglas que ya costaron
caro una vez.

El mapa completo del código está en `.planning/codebase/` y el contexto del proyecto en
`.planning/PROJECT.md`. Léelos antes de explorar a ciegas.

## Reglas de negocio que no se negocian

- **Nunca se envía nada automáticamente a un contador.** Victor acumula los comprobantes
  y los manda él a fin de mes. Si alguna vez parece que "falta" el envío automático,
  no falta: está prohibido a propósito.
- **Los únicos canales de soporte son el correo electrónico y el asistente del sitio.**
  No se publica un número de teléfono en ninguna página.
- **Los informes van a `gerencia@inversionesxzt.com`** con copia a
  `facturacion@mercamaquinarias.com`. La copia se manda como correo aparte, no como CC.
- **No se toca el modelo de negocio de los planes ni sus precios.** Se trabaja por otro
  lado. Usa `planes.perfil_publico` tal como está; no propongas planes ni precios nuevos.
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

- **Fusionar a `main` despliega a producción automáticamente.** No hay barrera de
  pruebas en CI todavía. Rama y Pull Request siempre; nunca push directo a `main`.
- Hay **otra persona trabajando en este repositorio**. Nunca reescribas historial ni uses
  `--force`.
- Antes de tocar la base de producción, respaldo verificado (`VACUUM INTO` +
  `integrity_check`).

## Pruebas

```bash
npm run auditar            # taxonomía, público, flujos y permisos
npm run check              # enlaces
npm run seguridad:probar   # 71 comprobaciones sobre un arnés falso de req/res
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
- **Saltos de línea:** el repositorio es CRLF (`core.autocrlf=true`), pero `styles.css`
  es LF. Una búsqueda con `\n` no casa contra un archivo CRLF.
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
