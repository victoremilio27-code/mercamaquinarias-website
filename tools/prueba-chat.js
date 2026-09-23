/* Ejecutar con:  node tools/prueba-chat.js

   Comprueba el cliente de Anthropic sin gastar una llamada real:
   sustituye https.request por un doble que captura lo que sale y
   devuelve lo que se le diga. */
const https = require('https');
const { EventEmitter } = require('events');

const fallos = [];
const ok = [];
const comprobar = (c, t) => (c ? ok : fallos).push(t);

let capturado = null;
let guion = [];

https.request = (opciones, alLlegar) => {
  const req = new EventEmitter();
  let cuerpo = '';
  req.write = (t) => { cuerpo += t; };
  req.destroy = () => {};
  req.end = () => {
    capturado = { opciones, cuerpo: JSON.parse(cuerpo) };
    const paso = guion.shift() || { estado: 200, datos: {} };
    setImmediate(() => {
      if (paso.red) { req.emit('error', new Error(paso.red)); return; }
      const res = new EventEmitter();
      res.statusCode = paso.estado;
      alLlegar(res);
      res.emit('data', JSON.stringify(paso.datos));
      res.emit('end');
    });
  };
  return req;
};

process.env.ANTHROPIC_API_KEY = 'sk-ant-de-mentira';
const chat = require('./chat.js');

const respuestaBuena = (txt) => ({ estado: 200, datos: { stop_reason: 'end_turn', content: [{ type: 'text', text: txt }] } });

(async () => {
  /* ── 1. Forma de la petición ──────────────────────────── */
  guion = [respuestaBuena('Se compran cupos en Planes.')];
  let r = await chat.conversar([{ role: 'user', content: '¿Cómo publico?' }]);

  comprobar(r.ok && r.texto === 'Se compran cupos en Planes.', 'devuelve el texto de la respuesta');

  const { opciones, cuerpo } = capturado;
  comprobar(opciones.hostname === 'api.anthropic.com' && opciones.path === '/v1/messages',
    `apunta a ${opciones.hostname}${opciones.path}`);
  comprobar(opciones.headers['anthropic-version'] === '2023-06-01', 'manda anthropic-version');
  comprobar(opciones.headers['x-api-key'] === 'sk-ant-de-mentira', 'manda la clave en x-api-key');
  comprobar(!JSON.stringify(cuerpo).includes('sk-ant'), 'la clave NO va en el cuerpo');

  comprobar(cuerpo.model === 'claude-sonnet-5', `modelo: ${cuerpo.model}`);
  comprobar(cuerpo.thinking && cuerpo.thinking.type === 'disabled', 'pensamiento apagado (latencia)');
  comprobar(cuerpo.output_config && cuerpo.output_config.effort === 'low', 'esfuerzo bajo');
  comprobar(cuerpo.max_tokens === 800, `max_tokens: ${cuerpo.max_tokens}`);
  comprobar(!('temperature' in cuerpo) && !('top_p' in cuerpo) && !('top_k' in cuerpo),
    'sin temperature/top_p/top_k (Sonnet 5 los rechaza)');
  comprobar(!('budget_tokens' in (cuerpo.thinking || {})), 'sin budget_tokens (400 en Sonnet 5)');
  comprobar(Array.isArray(cuerpo.system) && cuerpo.system[0].cache_control
    && cuerpo.system[0].cache_control.type === 'ephemeral', 'el prompt del sistema va cacheado');
  comprobar(cuerpo.system[0].text.length > 4000,
    `prompt del sistema: ${cuerpo.system[0].text.length} caracteres (supera el mínimo de caché)`);
  comprobar(cuerpo.messages[cuerpo.messages.length - 1].role === 'user', 'el último turno es del usuario');
  comprobar(!cuerpo.messages.some((m) => m.role === 'system'), 'el prompt del sistema no va en messages');

  /* El prompt tiene que llevar las dos vías de contacto y los ejemplos. */
  const sis = cuerpo.system[0].text;
  comprobar(sis.includes('ayuda@mercamaquinarias.com') && sis.includes('ventas@mercamaquinarias.com'),
    'el prompt lleva los dos correos');
  comprobar(!/\(809\)/.test(sis), 'el prompt NO lleva teléfono: no hay');
  comprobar(/NO ofrece el servicio de transporte/.test(sis)
    && /NO ofrece el directorio de financiamiento/.test(sis),
    'el prompt dice que transporte y financiamiento no se ofrecen');

  /* Y que no se contradiga a sí mismo, que es peor que callarse.
     Arriba definía la empresa como «tres servicios propios, uno de
     ellos un directorio de financiamiento» y abajo negaba los dos
     retirados: preguntado por «¿qué servicios tienen?», el modelo leía
     la definición y ofrecía lo que la empresa nunca ha prestado. */
  comprobar(!/tres servicios propios/.test(sis),
    'el prompt ya no define la empresa por tres servicios');
  comprobar(!/directorio de financiamiento: alquiler|importación y un directorio/.test(sis),
    'ni presenta el financiamiento como algo que se ofrece');
  comprobar(!/El transporte se cotiza aparte/.test(sis),
    'ni dice que se cotice un transporte que no se presta');
  comprobar((sis.match(/DENTRO de alcance/g) || []).length === 1
    && (sis.match(/FUERA de alcance/g) || []).length === 1, 'el prompt separa dentro y fuera de alcance');
  comprobar(!/RD\$0\b/.test(sis), 'el plan gratis no se anuncia como «RD$0»');
  comprobar(/SIN COSTO/.test(sis), 'el plan gratis se anuncia como sin costo');

  /* La caché exige que el prompt no cambie entre peticiones. */
  guion = [respuestaBuena('otra')];
  await chat.conversar([{ role: 'user', content: 'otra' }]);
  comprobar(capturado.cuerpo.system[0].text === sis,
    'el prompt es idéntico entre peticiones (si no, la caché no sirve de nada)');

  /* ── 2. Fallos ────────────────────────────────────────── */
  guion = [{ estado: 200, datos: { stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [] } }];
  r = await chat.conversar([{ role: 'user', content: 'x' }]);
  comprobar(!r.ok && r.motivo === 'declinado', 'un 200 con stop_reason refusal se trata como fallo');

  guion = [{ estado: 429, datos: {} }, respuestaBuena('a la segunda')];
  r = await chat.conversar([{ role: 'user', content: 'x' }]);
  comprobar(r.ok && r.texto === 'a la segunda', 'un 429 se reintenta');

  guion = [{ estado: 500, datos: {} }, respuestaBuena('recuperado')];
  r = await chat.conversar([{ role: 'user', content: 'x' }]);
  comprobar(r.ok, 'un 500 se reintenta');

  let llamadas = 0;
  const contar = https.request;
  https.request = (...a) => { llamadas++; return contar(...a); };
  guion = [{ estado: 400, datos: { error: { message: 'malo' } } }, respuestaBuena('no debería llegar')];
  r = await chat.conversar([{ role: 'user', content: 'x' }]);
  comprobar(!r.ok && llamadas === 1, `un 400 NO se reintenta (${llamadas} llamada)`);

  guion = [{ red: 'ECONNRESET' }, { red: 'ECONNRESET' }];
  r = await chat.conversar([{ role: 'user', content: 'x' }]);
  comprobar(!r.ok && r.motivo === 'sin-respuesta', 'la red caída devuelve fallo, no excepción');

  const clave = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  r = await chat.conversar([{ role: 'user', content: 'x' }]);
  comprobar(!r.ok && r.motivo === 'sin-clave', 'sin clave devuelve fallo, no excepción');
  process.env.ANTHROPIC_API_KEY = clave;

  /* ── 3. Limpieza del historial que manda el navegador ─── */
  const L = chat.limpiarTurnos;

  comprobar(L('no es un array').error, 'rechaza lo que no es un array');
  comprobar(L([]).error, 'rechaza una conversación vacía');
  comprobar(L([{ rol: 'asistente', texto: 'hola' }]).error,
    'rechaza una conversación que no termina en el usuario');

  let t = L([{ rol: 'asistente', texto: 'hola' }, { rol: 'usuario', texto: '¿precio?' }]).turnos;
  comprobar(t.length === 1 && t[0].role === 'user', 'descarta los turnos previos al primero del usuario');

  t = L([{ rol: 'usuario', texto: 'a' }, { rol: 'usuario', texto: 'b' }]).turnos;
  comprobar(t.length === 1 && t[0].content === 'a\n\nb', 'funde dos turnos seguidos del usuario');

  // 41 alternos: empieza y termina en el usuario, como una conversación real.
  t = L(Array.from({ length: 41 }, (_, i) => ({ rol: i % 2 ? 'asistente' : 'usuario', texto: `m${i}` }))).turnos;
  comprobar(t.length <= chat.TURNOS_MAXIMOS, `recorta a ${t.length} turnos (tope ${chat.TURNOS_MAXIMOS})`);
  comprobar(t[0].role === 'user' && t[t.length - 1].role === 'user',
    'tras recortar, sigue empezando y acabando en el usuario');

  t = L([{ rol: 'usuario', texto: 'x'.repeat(5000) }]).turnos;
  comprobar(t[0].content.length === chat.LARGO_MAXIMO, `corta el mensaje a ${chat.LARGO_MAXIMO} caracteres`);

  t = L([{ rol: 'usuario', texto: '  hola  ' }, { rol: 'x', texto: '   ' }]).turnos;
  comprobar(t.length === 1 && t[0].content === 'hola', 'ignora los mensajes en blanco');

  ok.forEach((x) => console.log('  ok   ' + x));
  fallos.forEach((x) => console.log('  FALLA ' + x));
  console.log(`\n${ok.length} bien, ${fallos.length} mal.`);
  process.exit(fallos.length ? 1 : 0);
})();
