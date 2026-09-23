/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Documentos legales y sus versiones

   FUENTE ÚNICA. Este archivo lo carga el navegador con <script> y lo
   importa el servidor con require(). La versión que se enseña al
   usuario y la que se guarda en la base tienen que ser la misma: si
   fueran dos listas, el día que se publique una versión nueva el
   servidor pediría aceptar una y el navegador enseñaría otra.

   CÓMO SE PUBLICA UNA VERSIÓN NUEVA

   1. Se edita el texto en legal.html y se sube el número aquí.
   2. Se cambia también `vigenteDesde` y la línea `v1.0 · vigente
      desde …` del propio documento en legal.html.
   3. Nada más. A partir del despliegue, quien ya tenía cuenta verá el
      aviso de que hay condiciones nuevas la próxima vez que entre, y
      no podrá publicar ni pagar hasta aceptarlas.

   NO se reescribe una versión ya publicada. Si el texto cambia, cambia
   el número: lo que alguien aceptó un día tiene que poder reconstruirse
   tal y como lo aceptó, y para eso la versión debe identificar un texto
   y solo uno.
   ═══════════════════════════════════════════════════════════ */

const DOCUMENTOS = [
  {
    id: 'terminos',
    nombre: 'Términos y condiciones de uso',
    version: '2.0',
    vigenteDesde: '2026-09-23',
    // Se exige aceptarlo para crear la cuenta.
    obligatorio: true,
  },
  {
    id: 'privacidad',
    nombre: 'Política de privacidad y protección de datos',
    version: '2.0',
    vigenteDesde: '2026-09-23',
    obligatorio: true,
  },
  {
    id: 'anuncios',
    nombre: 'Política de publicación de anuncios',
    version: '2.0',
    vigenteDesde: '2026-09-23',
    /* No se exige al registrarse: quien abre una cuenta para mirar el
       catálogo no tiene por qué aceptar las reglas de publicar. Se
       exige al publicar el primer equipo. */
    obligatorio: false,
  },
  {
    id: 'contratacion',
    nombre: 'Condiciones de contratación y pagos',
    version: '2.0',
    vigenteDesde: '2026-09-23',
    // Se exige al pagar, no antes.
    obligatorio: false,
  },
  {
    id: 'cookies',
    nombre: 'Cookies y almacenamiento local',
    version: '2.0',
    vigenteDesde: '2026-09-23',
    obligatorio: false,
  },
  {
    id: 'servicios',
    nombre: 'Servicios propios y de terceros',
    version: '2.0',
    vigenteDesde: '2026-09-23',
    obligatorio: false,
  },
];

/* Los que hay que aceptar para crear una cuenta. */
const OBLIGATORIOS = DOCUMENTOS.filter((d) => d.obligatorio);

/* Los que hay que tener aceptados antes de publicar o de pagar. La
   distinción importa: exigirlo todo al registrarse convierte el alta en
   un muro, y exigir lo de publicar a quien solo viene a mirar es pedir
   que acepte reglas que no le aplican. */
const PARA_PUBLICAR = ['terminos', 'privacidad', 'anuncios'];
const PARA_PAGAR = ['terminos', 'privacidad', 'contratacion'];

const documento = (id) => DOCUMENTOS.find((d) => d.id === id) || null;

/* La versión vigente de un documento, o null si el id no existe. */
const versionDe = (id) => (documento(id) || {}).version || null;

/* Enlace al documento dentro del centro legal. */
const enlaceDe = (id) => `legal.html#${id}`;

/* Qué le falta por aceptar a alguien, dada la lista de lo que ya
   aceptó. `aceptado` es un objeto { idDocumento: version }.
 *
 * Se compara por igualdad y no por «mayor que»: una versión distinta es
 * un texto distinto, y da igual si el número sube o baja. Comparar
 * números de versión como si fueran decimales es además una trampa
 * clásica —la 1.10 es posterior a la 1.9 y «menor» como número—. */
function faltanPorAceptar(aceptado, ids) {
  const ya = aceptado || {};
  return (ids || []).filter((id) => {
    const d = documento(id);
    return d && ya[id] !== d.version;
  });
}

/* En Node se importa; en el navegador quedan como globales. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DOCUMENTOS, OBLIGATORIOS, PARA_PUBLICAR, PARA_PAGAR,
    documento, versionDe, enlaceDe, faltanPorAceptar,
  };
}
