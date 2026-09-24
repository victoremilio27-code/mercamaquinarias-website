/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Qué servicios se ofrecen hoy

   UN SOLO INTERRUPTOR, y todo el sitio lo consulta. La carga el
   navegador con <script> y el servidor con require(), igual que los
   precios: lo que se enseña y lo que se acepta salen de la misma
   lista, no de dos copias que se desincronizan.

   POR QUÉ ESTO Y NO BORRAR EL CÓDIGO

   El transporte y el directorio de financiamiento NO se ofrecen en el
   lanzamiento, pero vienen después. Borrarlos obligaría a reescribir
   desde cero unas mil líneas que ya funcionan —la flota, el
   seguimiento del envío, la calculadora de cuota, sus pantallas de
   administración— y a redescubrir todas las decisiones que ya se
   tomaron una vez.

   Así que el código se queda entero y APAGADO. Encenderlos el día que
   toque es cambiar `activo` a `true` aquí, desplegar, y comprobar.

   LO QUE APAGAR SIGNIFICA, en concreto:

     · No salen en ningún menú, pie, atajo ni botón del sitio.
     · Sus páginas no se sirven: el servidor manda a la portada.
     · La API no acepta solicitudes de ese servicio.
     · El asistente dice que no se ofrecen si le preguntan.
     · Sus pantallas de administración no aparecen, para que nadie
       alimente una flota que no se va a enseñar.

   Lo que NO cambia: los textos legales siguen describiendo la
   situación real —«temporalmente fuera de servicio»— porque un
   contrato tiene que decir la verdad esté el servicio activo o no, y
   las solicitudes que entraron cuando sí se ofrecía siguen guardadas y
   se pueden consultar.
   ═══════════════════════════════════════════════════════════ */

const SERVICIOS = {
  /* Los que sí se ofrecen. */
  alquiler: {
    activo: true,
    nombre: 'Alquiler de equipos',
    pagina: 'alquiler.html',
  },
  importacion: {
    activo: true,
    nombre: 'Importación de maquinaria',
    pagina: 'importar.html',
  },

  /* Los que no, todavía. */
  transporte: {
    activo: false,
    nombre: 'Transporte de equipos',
    pagina: 'transporte.html',
  },
  financiamiento: {
    activo: false,
    nombre: 'Directorio de financiamiento',
    pagina: 'financiamiento.html',
  },
};

const seOfrece = (cual) => !!(SERVICIOS[cual] && SERVICIOS[cual].activo);

/* Las páginas que hoy no deben servirse, para que el servidor las
   redirija en vez de enseñarlas. */
const paginasApagadas = () => Object.values(SERVICIOS)
  .filter((s) => !s.activo && s.pagina)
  .map((s) => `/${s.pagina}`);

/* Los servicios por los que se puede pedir cotización ahora mismo.
   `contacto` no es un servicio propio: es el formulario general. */
const serviciosQueAdmitenSolicitud = () => [
  ...Object.keys(SERVICIOS).filter(seOfrece),
  'contacto',
];

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SERVICIOS, seOfrece, paginasApagadas, serviciosQueAdmitenSolicitud };
}
