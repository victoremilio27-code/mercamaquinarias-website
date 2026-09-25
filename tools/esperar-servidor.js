/**
 * esperar-servidor.js — espera a que el sitio conteste de verdad antes de
 * lanzarle las auditorías.
 *
 * Por qué existe: arrancar `npm start` en segundo plano y seguir es una
 * carrera. Un `sleep` fijo corto deja a puppeteer y a auditar-permisos
 * estrellándose contra un puerto que todavía no escucha —y el fallo que se
 * lee en el registro no tiene nada que ver con la causa—; uno largo regala
 * esos segundos en cada pasada, siempre, aunque el servidor hubiera estado
 * listo al instante. Esto pregunta, y sigue en cuanto hay respuesta.
 *
 * Lo que se espera es que el PUERTO conteste, no que una página concreta
 * esté bien: cualquier respuesta por debajo de 500 vale. Si el sitio
 * contesta 404 o 302, ya está levantado, y decidir si eso está bien es
 * trabajo de las auditorías, no de este ayudante.
 *
 * Sirve igual en local mientras arranca `npm start`, que es la razón de que
 * sea un script y no cuatro líneas de bash enterradas en el YAML.
 *
 * Uso:
 *   node tools/esperar-servidor.js
 *   node tools/esperar-servidor.js --url http://127.0.0.1:8080/
 *   node tools/esperar-servidor.js --intentos 120 --espera 250
 *
 * Sale 0 en cuanto responde. Sale 1 si se agotan los intentos.
 */

const http = require('http');

const POR_DEFECTO = {
  url: 'http://127.0.0.1:8080/',
  intentos: 60,
  espera: 500,
};

function leerArgs(argv) {
  const args = { ...POR_DEFECTO };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url' || a === '-u') args.url = argv[++i];
    else if (a === '--intentos' || a === '-i') args.intentos = Number(argv[++i]);
    else if (a === '--espera' || a === '-e') args.espera = Number(argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log(require('fs').readFileSync(__filename, 'utf8').split('*/')[0]);
      process.exit(0);
    } else if (!a.startsWith('-')) args.url = a;
  }
  if (!Number.isFinite(args.intentos) || args.intentos < 1) args.intentos = POR_DEFECTO.intentos;
  if (!Number.isFinite(args.espera) || args.espera < 0) args.espera = POR_DEFECTO.espera;
  return args;
}

const args = leerArgs(process.argv.slice(2));

function dormir(ms) {
  return new Promise((listo) => setTimeout(listo, ms));
}

/* Un intento. Devuelve el código de estado si el puerto contestó, o null si
   no hay nadie ahí todavía. Nunca lanza y nunca llama a process.exit: quien
   decide es el bucle de abajo, con la cuenta de intentos ya resuelta. */
function tocar(url, msTope) {
  return new Promise((listo) => {
    let resuelto = false;
    const terminar = (valor) => {
      if (resuelto) return;
      resuelto = true;
      listo(valor);
    };

    let peticion;
    try {
      peticion = http.get(url, (res) => {
        /* Hay que consumir el cuerpo o el socket se queda abierto y agente
           y proceso no terminan nunca. */
        res.resume();
        terminar(res.statusCode);
      });
    } catch (err) {
      // URL mal escrita, protocolo que no es http, etc.
      console.error('esperar-servidor: no se pudo pedir ' + url + ': ' + err.message);
      terminar(null);
      return;
    }

    /* Tope por intento: un puerto que acepta la conexión pero no contesta
       (el servidor a medio arrancar) colgaría el ayudante para siempre. */
    peticion.setTimeout(msTope, () => {
      peticion.destroy();
      terminar(null);
    });

    // ECONNREFUSED mientras el servidor no escucha; también ECONNRESET.
    peticion.on('error', () => {
      peticion.destroy();
      terminar(null);
    });
  });
}

async function esperar() {
  const arranque = Date.now();
  const msTope = Math.max(1000, args.espera * 4);

  for (let intento = 1; intento <= args.intentos; intento++) {
    const estado = await tocar(args.url, msTope);

    /* Menos de 500 significa «ya escucha». Un 5xx es un servidor arriba pero
       reventado; se sigue esperando por si está terminando de migrar la base
       y todavía puede recuperarse dentro del presupuesto de intentos. */
    if (estado !== null && estado < 500) {
      const segundos = ((Date.now() - arranque) / 1000).toFixed(1);
      console.log(
        'El sitio responde (HTTP ' + estado + ') en ' + args.url +
        ' tras ' + segundos + ' s y ' + intento + ' intento(s).'
      );
      return true;
    }

    if (intento < args.intentos) await dormir(args.espera);
  }

  const segundos = ((Date.now() - arranque) / 1000).toFixed(1);
  console.error(
    'esperar-servidor: ' + args.url + ' no respondió tras ' + args.intentos +
    ' intento(s) cada ' + args.espera + ' ms (' + segundos + ' s en total).'
  );
  console.error('Mira el registro del servidor antes de subir los intentos: lo normal es que no arrancara.');
  return false;
}

esperar().then((logrado) => {
  if (!logrado) process.exitCode = 1;
});
