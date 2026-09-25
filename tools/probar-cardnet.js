/**
 * probar-cardnet.js — el cobro con tarjeta por CardNet.
 *
 *   node tools/probar-cardnet.js
 *
 * POR QUÉ EXISTE
 *
 * Cada comprobación de aquí es un fallo que costaría dinero real o que
 * metería el sitio entero en el alcance de PCI-DSS:
 *
 * - un factor de 100 mal puesto cobra RD$20 o RD$200.000 por un plan de
 *   RD$2.000, y en desarrollo no rompe nada;
 * - una respuesta de la pasarela que no se entiende y se da por aprobada
 *   regala cupos y consume un NCF de un dinero que no entró, y un
 *   comprobante emitido no se borra: solo se corrige con una nota B04;
 * - un número de tarjeta en un registro, o un campo de tarjeta nombrado
 *   en el código, cambia el cuestionario de PCI que hay que rellenar y
 *   auditar cada año.
 *
 * Como probar-pagos.js, corre contra una base DESECHABLE en
 * `.tmp/prueba-cardnet/`, con el correo en modo archivo y SIN RED: el
 * transporte de `tools/cardnet.js` se sustituye al cargarlo por uno que
 * lanza, y cada sección instala su propio doble con las respuestas que
 * necesita. Las llaves de esta prueba son falsas a la vista y nunca se
 * parecen a las de certificación que publica CardNet.
 */

const fs = require('fs');
const path = require('path');

/* Las variables de entorno ANTES de cargar db.js: la ruta de la base
   se resuelve al importarlo. Hecho después, la prueba escribiría en la
   base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-cardnet');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });

process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_FACTURAS = path.join(BANCO, 'facturas');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
/* tools/entorno.js (lo cargan tareas.js y serve.js) leería el .env local
   y podría volver a encender CardNet a mitad de prueba con llaves de
   verdad. Apuntado a un archivo que no existe, no carga nada. */
process.env.MERCA_ENV = path.join(BANCO, 'no-existe.env');

/* Un .env local o el entorno de quien corre la prueba no puede decidir
   el resultado: se borra todo lo que venga de fuera. */
for (const k of Object.keys(process.env)) {
  if (k.startsWith('MERCA_CARDNET') || k.startsWith('MERCA_TRANSFERENCIA')) delete process.env[k];
}

const cardnet = require('./cardnet');

/* La red no se toca. Si algo llega al transporte sin un doble puesto,
   se cuenta y la prueba falla al final: un `catch` de más en el código
   no puede esconder que se intentó salir. */
let intentosDeRed = 0;
function sinRed() {
  cardnet._transporte = () => {
    intentosDeRed++;
    throw new Error('la prueba intentó salir a la red');
  };
}
sinRed();

let fallos = 0;
let comprobaciones = 0;
function ok(condicion, texto) {
  comprobaciones++;
  if (!condicion) fallos++;
  console.log(`  ${condicion ? 'OK   ' : 'FALLA'}  ${texto}`);
}

function lanza(fn) {
  try { fn(); return null; } catch (e) { return e; }
}

const LLAVE_PUB = 'llave-publica-de-prueba';
const LLAVE_PRIV = 'llave-privada-de-prueba';

function apagar() {
  for (const k of Object.keys(process.env)) {
    if (k.startsWith('MERCA_CARDNET')) delete process.env[k];
  }
}
function encender(modo = 'lab', cambios = {}) {
  apagar();
  process.env.MERCA_CARDNET = modo;
  process.env.MERCA_CARDNET_LLAVE_PUB = LLAVE_PUB;
  process.env.MERCA_CARDNET_LLAVE_PRIV = LLAVE_PRIV;
  for (const [k, v] of Object.entries(cambios)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

/* El doble de CardNet: guarda cada llamada tal como la vería la red y
   contesta con lo programado, en orden, o con lo que devuelva una
   función. Sin respuesta programada contesta como una red caída. */
let llamadas = [];
function doble(respuestas) {
  llamadas = [];
  const cola = Array.isArray(respuestas) ? [...respuestas] : null;
  cardnet._transporte = async (op) => {
    llamadas.push({ metodo: op.metodo, url: op.url, cabeceras: op.cabeceras, cuerpo: op.cuerpo });
    const r = cola ? cola.shift() : respuestas(op);
    return r || { estado: 0, cuerpo: null, fallo: 'sin respuesta programada' };
  };
}

const URL_LAB = 'https://labservicios.cardnet.com.do/servicios/tokens/';
const URL_PROD = 'https://servicios.cardnet.com.do/servicios/tokens/';

(async () => {
  console.log('\n1. El interruptor: apagado salvo con modo y dos llaves');
  {
    apagar();
    ok(cardnet.modo() === 'apagado', `sin variables el modo es «${cardnet.modo()}»`);
    ok(cardnet.activo() === false, 'sin variables no está activo');
    const f = cardnet.faltantes();
    ok(['MERCA_CARDNET', 'MERCA_CARDNET_LLAVE_PUB', 'MERCA_CARDNET_LLAVE_PRIV'].every((n) => f.includes(n)),
      `faltantes nombra las tres variables: ${f.join(', ')}`);
    ok(cardnet.origenCaptura() === null, 'apagado, sin origen de captura');
    ok(cardnet.autorizacionEsperada() === null, 'apagado, sin cabecera esperada');

    encender('lab');
    ok(cardnet.activo() === true && cardnet.modo() === 'lab', 'lab con las dos llaves: activo');
    ok(cardnet.urlBase() === URL_LAB, `urlBase de lab: ${cardnet.urlBase()}`);
    ok(cardnet.origenCaptura() === 'https://labservicios.cardnet.com.do', `origen: ${cardnet.origenCaptura()}`);
    ok(cardnet.faltantes().length === 0, 'encendido del todo, no falta nada');

    encender('produccion');
    ok(cardnet.urlBase() === URL_PROD, `urlBase de producción: ${cardnet.urlBase()}`);

    for (const raro of ['encendido', 'LAB', 'Produccion', 'si', '1', '']) {
      encender(raro);
      ok(cardnet.activo() === false && cardnet.modo() === 'apagado', `MERCA_CARDNET=«${raro}» es apagado`);
    }
    encender('apagado');
    ok(cardnet.activo() === false, 'MERCA_CARDNET=apagado es apagado');

    encender('lab', { MERCA_CARDNET_LLAVE_PRIV: '' });
    ok(cardnet.activo() === false, 'sin llave privada no está activo');
    ok(cardnet.faltantes().includes('MERCA_CARDNET_LLAVE_PRIV') && !cardnet.faltantes().includes('MERCA_CARDNET'),
      'faltantes nombra solo la llave que falta');
    ok(!cardnet.faltantes().join(' ').includes(LLAVE_PUB), 'faltantes no enseña ningún valor');
    encender('lab', { MERCA_CARDNET_LLAVE_PUB: '   ' });
    ok(cardnet.activo() === false, 'una llave de solo espacios cuenta como vacía');

    encender('lab', { MERCA_CARDNET_URL: 'http://x.prueba/tokens/' });
    ok(cardnet.urlBase() === URL_LAB, 'MERCA_CARDNET_URL sin https se ignora');
    encender('lab', { MERCA_CARDNET_URL: 'https://otra.prueba/tokens' });
    ok(cardnet.urlBase() === 'https://otra.prueba/tokens/', `MERCA_CARDNET_URL https se usa, con barra final: ${cardnet.urlBase()}`);
    ok(cardnet.origenCaptura() === 'https://otra.prueba', 'y el origen de captura la sigue');

    encender('lab');
    const antes = cardnet.activo();
    apagar();
    ok(antes === true && cardnet.activo() === false, 'cambiar el entorno a mitad de ejecución cambia el resultado');
  }

  console.log('\n2. Centavos: una sola conversión, entera y no negativa');
  {
    ok(cardnet.aCentavos(2000) === 200000, `RD$2.000 → ${cardnet.aCentavos(2000)}`);
    ok(cardnet.aCentavos(0) === 0, 'RD$0 → 0');
    ok(cardnet.aCentavos(2360) === 236000, 'RD$2.360 → 236000');
    for (const malo of [2000.5, -1, '2000', NaN, null, undefined, Infinity]) {
      ok(!!lanza(() => cardnet.aCentavos(malo)), `aCentavos(${String(malo)}) lanza`);
    }
    const fuente = fs.readFileSync(path.join(__dirname, 'cardnet.js'), 'utf8');
    const factores = fuente.split('\n').filter((l) => /\* *100|100 *\*|\/ *100/.test(l));
    ok(factores.length === 1, `una sola multiplicación por 100 en cardnet.js (hay ${factores.length})`);
  }

  console.log('\n3. normalizar: nunca aprueba por duda');
  {
    encender('lab');
    const aprobada = cardnet.normalizar({
      Status: 'Approved', ResponseCode: '00', PurchaseId: 'P1', AuthorizationCode: 'A1', Order: 'TE-2026-AAAAAA',
    });
    ok(aprobada.resultado === 'aprobado' && aprobada.codigo === '00' && aprobada.procesadorId === 'P1'
      && aprobada.autorizacion === 'A1' && aprobada.referencia === 'TE-2026-AAAAAA',
    `aprobada explícita: ${JSON.stringify(aprobada)}`);
    ok(cardnet.normalizar({ ResponseCode: '00', PurchaseID: 'P2' }).resultado === 'aprobado',
      'ResponseCode 00 sin Status: aprobada');
    ok(cardnet.normalizar({ ResponseCode: '00', PurchaseID: 'P2' }).procesadorId === 'P2', 'PurchaseID también se lee');
    ok(cardnet.normalizar({ Status: 'aprobada' }).resultado === 'aprobado', 'Status «aprobada»: aprobada');

    const rechazada = cardnet.normalizar({ ResponseCode: '51', PurchaseId: 'P3', Order: 'TE-2026-BBBBBB' });
    ok(rechazada.resultado === 'rechazado' && rechazada.codigo === '51', 'ResponseCode 51 sin Status: rechazada');
    ok(rechazada.motivo === cardnet.mensajeDeRechazo('51'), `motivo del 51: ${rechazada.motivo}`);
    for (const st of ['Rejected', 'declined', 'Rechazada']) {
      ok(cardnet.normalizar({ Status: st, ResponseCode: '05' }).resultado === 'rechazado', `Status «${st}»: rechazada`);
    }

    for (const [nombre, r] of [
      ['null', null], ['{}', {}], ['Status raro', { Status: 'Algo' }], ['cadena', 'Approved'],
      ['Status Pending', { Status: 'Pending' }], ['ResponseCode vacío', { ResponseCode: '' }],
      ['aprobada y código 51 a la vez', { Status: 'Approved', ResponseCode: '51' }],
      ['rechazada y código 00 a la vez', { Status: 'Rejected', ResponseCode: '00' }],
    ]) {
      ok(cardnet.normalizar(r).resultado === 'pendiente', `${nombre}: pendiente`);
    }

    const conRedir = cardnet.normalizar({
      Status: 'Approved', ResponseCode: '00',
      CommerceAction: { ActionType: 1, Url: 'https://labservicios.cardnet.com.do/3ds/abc' },
    });
    ok(conRedir.resultado === 'pendiente' && conRedir.redireccion === 'https://labservicios.cardnet.com.do/3ds/abc',
      'CommerceAction de redirección al origen de CardNet: pendiente con redireccion');
    const ajena = cardnet.normalizar({ CommerceAction: { ActionType: 1, Url: 'https://malo.prueba/3ds' } });
    ok(ajena.resultado === 'pendiente' && !('redireccion' in ajena) , 'redirección a otro origen: pendiente y sin redireccion');
    const http = cardnet.normalizar({ CommerceAction: { ActionType: 1, Url: 'http://labservicios.cardnet.com.do/3ds' } });
    ok(!('redireccion' in http), 'redirección sin https: se descarta');
  }

  console.log('\n4. Mensajes de rechazo que dicen qué hacer y qué NO pasó');
  {
    ok(/fondos/i.test(cardnet.mensajeDeRechazo('51')), `51: ${cardnet.mensajeDeRechazo('51')}`);
    ok(/vencid/i.test(cardnet.mensajeDeRechazo('54')), `54: ${cardnet.mensajeDeRechazo('54')}`);
    ok(/activ/i.test(cardnet.mensajeDeRechazo('CS012')), `CS012: ${cardnet.mensajeDeRechazo('CS012')}`);
    for (const c of ['05', '14', '57', '61', '91']) {
      const m = cardnet.mensajeDeRechazo(c);
      ok(typeof m === 'string' && m.length > 20 && m !== cardnet.mensajeDeRechazo('XX'), `${c}: ${m}`);
    }
    const generico = cardnet.mensajeDeRechazo('ZZ');
    ok(/no se le cobró nada/i.test(generico) && /cupo/i.test(generico) && /comprobante/i.test(generico),
      `código desconocido: ${generico}`);
    ok(cardnet.mensajeDeRechazo(null) === generico, 'sin código: el genérico');
  }

  console.log('\n5. limpiar: nada de tarjeta ni de token hacia registros');
  {
    const pan = ['4111', '1111', '1111', '1111'].join('');
    const original = {
      Company: 'Equipos SRL', Brand: 'VISA', Last4: '1111', Token: 'CT__secreto', TrxToken: 'OT_secreto',
      CreditCardNumber: pan, Nota: `pagó con ${pan} ayer`,
      PaymentProfiles: [{ PaymentProfileId: 7, Token: 'CT__otro', Brand: 'MC', Expiration: '12/29', Enabled: true }],
      Profundo: { a: { b: [`x ${pan}9`] } }, Numero: Number(pan),
    };
    const copia = JSON.parse(JSON.stringify(original));
    const l = cardnet.limpiar(original);
    const texto = JSON.stringify(l);
    ok(l.Company === 'Equipos SRL' && l.Brand === 'VISA' && l.Last4 === '1111', 'conserva Company, Brand y Last4');
    ok(!('Token' in l) && !('TrxToken' in l) && !('CreditCardNumber' in l), 'quita Token, TrxToken y CreditCardNumber');
    ok(!texto.includes('CT__') && !texto.includes('OT_'), 'ningún token en ninguna profundidad');
    ok(!texto.includes(pan), 'ninguna secuencia de 13 a 19 dígitos queda a la vista');
    ok(l.PaymentProfiles[0].Brand === 'MC' && !('Expiration' in l.PaymentProfiles[0]), 'dentro de listas también');
    ok(/\*{13,}/.test(l.Nota) && l.Nota.startsWith('pagó con '), `enmascara dentro de cadenas: ${l.Nota}`);
    ok(typeof l.Numero === 'string' && !l.Numero.includes('4111'), 'un número suelto de 16 cifras también');
    ok(JSON.stringify(original) === JSON.stringify(copia), 'no modifica el objeto original');
    ok(cardnet.limpiar(null) === null && cardnet.limpiar('abc') === 'abc', 'valores sueltos pasan tal cual');
  }

  apagar();
  ok(intentosDeRed === 0, `ninguna llamada llegó al transporte sin doble (${intentosDeRed})`);
  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
