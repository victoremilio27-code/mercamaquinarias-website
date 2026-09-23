/**
 * chat.js — asistente de soporte del sitio. Sin dependencias.
 *
 * Llama a la API de Anthropic por HTTPS con el módulo nativo de Node,
 * igual que correo.js llama a Brevo. No se usa el SDK oficial a
 * propósito: el proyecto no tiene ni una dependencia de tiempo de
 * ejecución, en el servidor no se corre `npm install`, y desplegar
 * sigue siendo un `git pull`. Lo que el SDK aporta —reintentos y
 * tipos— cabe en las cien líneas de abajo.
 *
 * LA CLAVE NUNCA LLEGA AL NAVEGADOR. Vive en ANTHROPIC_API_KEY, que
 * en desarrollo sale del .env (gitignored) y en producción de
 * /etc/mercamaquinarias.env. La página habla con /api/chat, y solo este
 * archivo habla con Anthropic.
 *
 * Configuración:
 *   ANTHROPIC_API_KEY=sk-ant-…      (obligatoria)
 *   MERCA_CHAT_MODELO=…          (opcional; por defecto Sonnet 5)
 */

const https = require('https');
const db = require('./db');
const precios = require('../assets/precios.js');

const CLAVE = () => process.env.ANTHROPIC_API_KEY || '';

/* Sonnet 5: buena redacción y buen criterio para decir «no sé», a un
   tercio de lo que cuesta Opus. Para un FAQ con el contexto ya escrito
   en el prompt no hace falta más. */
const MODELO = process.env.MERCA_CHAT_MODELO || 'claude-sonnet-5';

/* El pensamiento adaptativo viene encendido en Sonnet 5. Aquí se apaga
   a propósito: quien escribe en un widget de soporte está esperando
   delante de la pantalla, y las respuestas salen de un contexto que ya
   está escrito —no hay nada que razonar—. Con `effort: low` además se
   acortan las respuestas, que es justo lo que se quiere.
   Si algún día el asistente contesta flojo, el primer botón que hay
   que mover es este: `{ type: 'adaptive' }` y `effort: 'medium'`. */
const PENSAR = { type: 'disabled' };
const ESFUERZO = 'low';

/* Un FAQ no necesita más. Si la respuesta se corta, el problema es que
   el asistente se está enrollando, no que falte espacio. */
const MAX_TOKENS = 800;

/* Cuántos turnos de la conversación se reenvían. El historial vive en
   el navegador, así que llega entero en cada petición: sin tope, una
   pestaña abierta toda la tarde acabaría mandando un libro. */
const TURNOS_MAXIMOS = 12;
const LARGO_MAXIMO = 1000;

/* ── Datos del negocio ──────────────────────────────────── */

/* Los buzones salen de correo.js, que es donde viven todos.
 *
 * Aquí estaban escritos a mano, y al mudar el dominio uno se quedó
 * apuntando al viejo: el asistente daba una dirección muerta a quien le
 * preguntaba cómo contactar, que es el peor momento posible para
 * hacerlo.
 *
 * SOPORTE y no general: quien llega a preguntarle al asistente y no
 * encuentra respuesta necesita que le atiendan, y hola@ está en el pie
 * de todas las páginas, así que ya lo tiene a la vista.
 * VENTAS para cotizar, que es de lo que se trata cuando alguien
 * pregunta por un alquiler o una importación. */
const { BUZONES } = require('./correo');

const CORREO_GENERAL = BUZONES.soporte;
const CORREO_COTIZAR = BUZONES.ventas;

/* Los precios salen de la tabla `planes`, que es la misma fila que
   después se cobra. Escribirlos a mano aquí sería crear una cuarta
   copia del precio —ya hubo una en data.js que se desincronizó— y un
   asistente que cotiza mal es peor que no tener asistente.
   Esto NO es leer el catálogo en vivo: son las tarifas publicadas, las
   mismas que enseña /planes.html. */
const pesos = (n) => `RD$${Math.round(n).toLocaleString('en-US')}`;

/* Fecha en palabras. Sale de la tabla, no del reloj: es la fecha en
   que termina la promoción, no «hoy», así que no rompe la caché. */
function fechaLarga(iso) {
  const [a, m, d] = String(iso || '').split('-').map(Number);
  if (!a || !m || !d) return '';
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${d} de ${meses[m - 1]} de ${a}`;
}

function tarifas() {
  return db.planes()
    .filter((p) => !p.solo_dealer)
    .map((p) => {
      let precio;
      if (p.precio_vigente === 0) {
        /* Hoy el nivel Estándar es gratis por la promoción de
           lanzamiento. Escribirlo como «RD$0» es exacto y se lee fatal:
           quien pregunta el precio quiere oír «no cuesta nada». */
        precio = 'SIN COSTO por la promoción de lanzamiento'
          + (p.promo_hasta ? `, hasta el ${fechaLarga(p.promo_hasta)}` : '')
          + (p.precio_normal ? ` (después ${pesos(p.precio_normal)} por cupo)` : '');
      } else if (p.en_promo && p.precio_normal > p.precio_vigente) {
        precio = `${pesos(p.precio_vigente)} por cupo de 30 días en promoción `
          + `(precio normal ${pesos(p.precio_normal)}), `
          + `${pesos(p.precio_vigente * (1 + precios.ITBIS))} con ITBIS`;
      } else {
        precio = `${pesos(p.precio_vigente)} por cupo de 30 días `
          + `(${pesos(p.precio_vigente * (1 + precios.ITBIS))} con ITBIS incluido)`;
      }

      return `- ${p.nombre}: ${precio}. Hasta ${p.fotos_maximas} fotos.`
        + (p.videos_maximos
          ? ` ${p.videos_maximos} ${p.videos_maximos === 1 ? 'video' : 'videos'} de hasta 30 segundos por equipo.`
          : '')
        + (p.destacado ? ' Aparece destacado en el catálogo.' : '')
        + (p.perfil_publico ? ' Incluye página pública de la empresa.' : '');
    })
    .join('\n');
}

/* ── El system prompt ───────────────────────────────────── */

/* Todo lo que el asistente sabe está aquí. No consulta el catálogo ni
   la base de anuncios: si le preguntan por disponibilidad de una
   máquina concreta, tiene que decir que no lo sabe y pasar el
   contacto. Eso está escrito abajo con ejemplos, no insinuado. */
function sistema() {
  return `Eres el asistente de soporte de MercaMaquinarias, un portal dominicano de maquinaria y equipo pesado. Ayudas a quien visita la página a entender cómo funciona el sitio y a llegar a la sección que necesita.

# Cómo hablas
- En español dominicano neutro, tratando de "usted".
- Profesional pero cercano. Directo, sin sonar a folleto.
- Breve: dos o tres frases cuando alcance. Nada de listas largas si una frase resuelve.
- Cuando la respuesta viva en una página del sitio, di el nombre de la página y su ruta. Ejemplo: "en Planes (/planes.html)".
- Nunca inventes precios, plazos, disponibilidad ni condiciones. Lo que no está escrito aquí abajo, no lo sabes.

# Qué es MercaMaquinarias
Un portal donde se compran y venden equipos pesados en República Dominicana, y donde además la empresa presta tres servicios propios: alquiler, importación y un directorio de financiamiento.

# Publicar un equipo (/publicar.html, /planes.html)
- Se paga antes de publicar. Primero se compran cupos en Planes, después se publica.
- Un cupo = un equipo publicado. Si ya le quedan cupos libres, publicar no cuesta nada más.
- Hay tres niveles y el nivel decide cómo se ve el anuncio:
${tarifas()}
- Los precios son por cupo y por 30 días. Se puede contratar por 60 días con un recargo.
- Descuento por cantidad: por cada ${precios.CUPOS_POR_UNO_GRATIS} cupos que compre, uno sale gratis. Comprando 5 paga 4; comprando 10 paga 8.
- Ampliar a mitad de ciclo se cobra prorrateado por los días que queden.
- Un cupo lo ocupa un anuncio activo o pausado. Pausar NO libera el cupo. Marcarlo vendido o retirarlo, sí, y entonces el cupo vuelve a quedar disponible sin volver a pagarlo.
- Los anuncios se administran desde el panel (/panel.html).

# Alquiler de equipos (/alquiler.html)
- Es flota propia de MercaMaquinarias, no equipos de terceros.
- Todos los equipos van CON OPERADOR. No existe la modalidad sin operador. La tarifa incluye el combustible del turno.
- Se cotiza POR HORA. La tarifa puede variar de la estándar según la ubicación de la obra, sus condiciones y el tipo de trabajo.
- El transporte se cotiza aparte y por viaje, según la distancia y la dificultad de acceso.
- El mantenimiento preventivo y las averías mecánicas corren por cuenta de MercaMaquinarias. Si el equipo se detiene por una falla imputable a ellos, ese tiempo no se factura.
- Si el daño lo causa la negligencia del cliente, la reparación corre íntegra por cuenta del cliente y las horas que el equipo pase en taller se siguen facturando.
- Se alquila un TIPO de equipo por lo que hace, no una máquina concreta ni un tamaño: el cliente marca la función que necesita y MercaMaquinarias asigna la unidad disponible según el trabajo y la accesibilidad de la obra.
- Tipos en flota: excavadora, retroexcavadora, cargador frontal, camión volteo, rodillo compactador y planta eléctrica.
- Si necesita un equipo que no está en la lista, puede indicarlo en la solicitud: se evalúa la disponibilidad y, si no lo tienen, hacen las gestiones del servicio.
- Se piden varios equipos en la misma solicitud. Quien no sepa cuántos necesita puede describir el proyecto y le sugieren.

# Transporte de equipos
- Por ahora MercaMaquinarias NO ofrece el servicio de transporte de equipos. Si lo piden, dilo con claridad y ofrece el contacto por si quieren consultar más adelante.

# Importación de maquinaria (/importar.html)
- Se busca el equipo en subastas y dealers de Estados Unidos según el presupuesto y el uso previsto. No hace falta saber el modelo exacto.
- Presentan opciones con fotos, horas, reporte de condición y precio puesto en puerto dominicano.
- El costo total se compone de: precio del equipo más comisión de la subasta o el dealer; servicio de inspección independiente si aplica; transporte interno en origen hasta el puerto; flete marítimo y seguro; aranceles e impuestos de aduana; y gastos de puerto, agente aduanal y transporte hasta la obra.
- La cotización se entrega con la cifra final a la vista, sin cargos imprevistos al arribo.

# Financiamiento
- Por ahora MercaMaquinarias NO ofrece el directorio de financiamiento: la sección está fuera de servicio. MercaMaquinarias nunca ha prestado dinero ni aprobado créditos. Si preguntan, dilo con claridad y pasa el contacto de ventas por si quieren orientación.

# Otras páginas
- Catálogo de equipos en venta: /equipos.html. Por categorías: /categorias.html.
- Directorio de dealers y talleres: /dealers.html. La página pública de empresa viene con el nivel Premium.
- Crear cuenta o iniciar sesión: /cuenta.html. Si olvidó la contraseña, ahí mismo se recupera por correo.

# QUÉ HACER CUANDO NO SABES
Solo respondes preguntas sobre MercaMaquinarias y cómo moverse por el sitio. Si la pregunta se sale de eso, o si la información que necesitas no está escrita arriba, NO adivines. Di en una frase que no lo sabes y pasa los dos contactos, tal cual:

Correo: ${CORREO_GENERAL} (dudas generales) o ${CORREO_COTIZAR} (cotizaciones de alquiler e importación)

Ejemplos DENTRO de alcance — respóndelos con lo que sabes:
- "¿Cómo publico una excavadora?" → Explica que primero se compran cupos en Planes y después se publica.
- "¿Cuánto cuesta el plan Destacado?" → Da el precio por cupo de 30 días y menciona el descuento por cantidad.
- "¿Alquilan retroexcavadora sin operador?" → No: todos los equipos van con operador, y se cotiza por hora.
- "Pausé un anuncio, ¿recupero el cupo?" → No; pausar no libera el cupo, marcarlo vendido sí.

Ejemplos FUERA de alcance — di que no lo sabes y pasa los contactos:
- "¿Tienen una excavadora de 45 toneladas disponible esta semana?" → No consultas inventario ni disponibilidad en tiempo real.
- "¿En cuánto puedo vender mi CAT 320 de 2015?" → No tasas equipos ni das precios de mercado.
- "¿Me redactas el contrato de alquiler?" → No das asesoría legal ni redactas contratos.
- "¿Qué tiempo va a hacer mañana en Santiago?" → No tiene que ver con MercaMaquinarias.

En casos así la respuesta correcta es corta: una frase diciendo que eso no lo puedes resolver tú, y los dos contactos. No intentes aproximarte, no des un rango "orientativo", no propongas un borrador. Es mejor mandar a la persona con alguien que sepa que darle un número inventado.`;
}

/* ── Llamada a la API ───────────────────────────────────── */

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function pedir(cuerpo) {
  const datos = JSON.stringify(cuerpo);
  return new Promise((resolver) => {
    const req = https.request({
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'x-api-key': CLAVE(),
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(datos),
      },
      timeout: 30000,
    }, (res) => {
      let crudo = '';
      res.on('data', (t) => { crudo += t; });
      res.on('end', () => resolver({ estado: res.statusCode, crudo }));
    });

    req.on('timeout', () => { req.destroy(); resolver({ estado: 0, crudo: '', fallo: 'tiempo agotado' }); });
    req.on('error', (e) => resolver({ estado: 0, crudo: '', fallo: e.message }));
    req.write(datos);
    req.end();
  });
}

/* Los 429 y los 5xx sí se reintentan —son pasajeros—; un 400 o un 401
   no, porque reintentar una petición mal formada o una clave inválida
   solo gasta tiempo. Dos intentos y se rinde: al otro lado hay una
   persona esperando. */
const REINTENTABLE = (estado) => estado === 0 || estado === 429 || estado >= 500;

async function conversar(turnos) {
  if (!CLAVE()) {
    console.error('chat: falta ANTHROPIC_API_KEY');
    return { ok: false, motivo: 'sin-clave' };
  }

  const cuerpo = {
    model: MODELO,
    max_tokens: MAX_TOKENS,
    thinking: PENSAR,
    output_config: { effort: ESFUERZO },
    /* El prompt del sistema es largo y no cambia entre peticiones, así
       que se cachea: a partir de la segunda consulta esa parte cuesta
       una décima parte. Por eso mismo aquí no puede entrar nada
       variable —ni la fecha, ni el nombre de quien pregunta—: un solo
       byte distinto tira la caché entera. */
    system: [{ type: 'text', text: sistema(), cache_control: { type: 'ephemeral' } }],
    messages: turnos,
  };

  for (let intento = 0; intento < 2; intento++) {
    if (intento) await esperar(600);
    const { estado, crudo, fallo } = await pedir(cuerpo);

    if (estado === 200) {
      let datos;
      try { datos = JSON.parse(crudo); } catch { return { ok: false, motivo: 'respuesta-ilegible' }; }

      // Los clasificadores pueden declinar la petición. Llega un 200
      // con `stop_reason: refusal`, no un error, así que hay que
      // mirarlo ANTES de leer el contenido.
      if (datos.stop_reason === 'refusal') return { ok: false, motivo: 'declinado' };

      const texto = (datos.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();

      if (!texto) return { ok: false, motivo: 'respuesta-vacia' };
      return { ok: true, texto };
    }

    console.error(`chat: Anthropic devolvió ${estado || fallo} · ${crudo.slice(0, 200)}`);
    if (!REINTENTABLE(estado)) break;
  }

  return { ok: false, motivo: 'sin-respuesta' };
}

/* ── Validación de lo que manda el navegador ────────────── */

/* El historial llega del cliente, así que se revisa entero: los roles
   tienen que alternar y empezar por el usuario, o la API devuelve 400.
   Se recorta a los últimos turnos y se corta cada mensaje. */
function limpiarTurnos(bruto) {
  if (!Array.isArray(bruto)) return { error: 'Formato de conversación inválido' };

  const turnos = [];
  for (const t of bruto.slice(-TURNOS_MAXIMOS)) {
    const rol = t && t.rol === 'asistente' ? 'assistant' : 'user';
    const texto = String((t && t.texto) || '').trim().slice(0, LARGO_MAXIMO);
    if (!texto) continue;
    // Dos turnos seguidos del mismo lado se funden en uno.
    if (turnos.length && turnos[turnos.length - 1].role === rol) {
      turnos[turnos.length - 1].content += `\n\n${texto}`;
      continue;
    }
    turnos.push({ role: rol, content: texto });
  }

  while (turnos.length && turnos[0].role !== 'user') turnos.shift();
  if (!turnos.length) return { error: 'Escriba su pregunta' };
  if (turnos[turnos.length - 1].role !== 'user') return { error: 'Escriba su pregunta' };

  return { turnos };
}

module.exports = {
  conversar, limpiarTurnos, sistema,
  MODELO, TURNOS_MAXIMOS, LARGO_MAXIMO,
  CORREO_GENERAL, CORREO_COTIZAR,
};
