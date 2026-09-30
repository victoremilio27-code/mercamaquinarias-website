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
    ok(/no se le cobró nada/i.test(generico) && /no se activó nada/i.test(generico) && !/cupo/i.test(generico) && /comprobante/i.test(generico),
      `código desconocido: ${generico}`);
    ok(cardnet.mensajeDeRechazo(null) === generico, 'sin código: el genérico');
  }

  console.log('\n5. limpiar: nada de tarjeta ni de token hacia registros');
  {
    const pan = ['4111', '1111', '1111', '1111'].join('');
    // El nombre del campo, armado por partes: la barrera de la sección 12 también recorre este archivo.
    const CAMPO_NUMERO = ['Credit', 'Card', 'Number'].join('');
    const original = {
      Company: 'Equipos SRL', Brand: 'VISA', Last4: '1111', Token: 'CT__secreto', TrxToken: 'OT_secreto',
      [CAMPO_NUMERO]: pan, Nota: `pagó con ${pan} ayer`,
      PaymentProfiles: [{ PaymentProfileId: 7, Token: 'CT__otro', Brand: 'MC', Expiration: '12/29', Enabled: true }],
      Profundo: { a: { b: [`x ${pan}9`] } }, Numero: Number(pan),
    };
    const copia = JSON.parse(JSON.stringify(original));
    const l = cardnet.limpiar(original);
    const texto = JSON.stringify(l);
    ok(l.Company === 'Equipos SRL' && l.Brand === 'VISA' && l.Last4 === '1111', 'conserva Company, Brand y Last4');
    ok(!('Token' in l) && !('TrxToken' in l) && !(CAMPO_NUMERO in l), 'quita Token, TrxToken y el número de tarjeta');
    ok(!texto.includes('CT__') && !texto.includes('OT_'), 'ningún token en ninguna profundidad');
    ok(!texto.includes(pan), 'ninguna secuencia de 13 a 19 dígitos queda a la vista');
    ok(l.PaymentProfiles[0].Brand === 'MC' && !('Expiration' in l.PaymentProfiles[0]), 'dentro de listas también');
    ok(/\*{13,}/.test(l.Nota) && l.Nota.startsWith('pagó con '), `enmascara dentro de cadenas: ${l.Nota}`);
    ok(typeof l.Numero === 'string' && !l.Numero.includes('4111'), 'un número suelto de 16 cifras también');
    ok(JSON.stringify(original) === JSON.stringify(copia), 'no modifica el objeto original');
    ok(cardnet.limpiar(null) === null && cardnet.limpiar('abc') === 'abc', 'valores sueltos pasan tal cual');
  }

  console.log('\n6. Apagado, ninguna llamada sale');
  {
    apagar();
    doble(() => ({ estado: 200, cuerpo: {} }));
    const rs = [
      await cardnet.crearCliente({ correo: 'a@prueba.invalid', nombre: 'A' }),
      await cardnet.verCliente('C1'),
      await cardnet.cobrar({ token: 'CT__x', pago: { referencia: 'TE-2026-AAAAAA', total: 2000, itbis: 0 } }),
      await cardnet.consultarCompra('P1'),
      await cardnet.devolver('P1'),
      await cardnet.activarPerfil({ clienteId: 'C1', token: 'CT__x', codigo: '123' }),
      await cardnet.borrarPerfil({ clienteId: 'C1', perfilId: '7' }),
    ];
    ok(rs.every((r) => r && r.ok === false && r.motivo === 'apagado'), 'las siete llamadas responden { ok: false, motivo: apagado }');
    ok(llamadas.length === 0, `el transporte no recibió nada (${llamadas.length})`);
  }

  const BASIC = `Basic ${Buffer.from(`${LLAVE_PRIV}:`).toString('base64')}`;

  console.log('\n7. El cliente en CardNet y la URL de captura');
  {
    encender('lab');
    doble([{ estado: 200, cuerpo: { CustomerId: 'C-900', Email: 'compras@prueba.invalid' } }]);
    const c = await cardnet.crearCliente({ correo: 'compras@prueba.invalid', nombre: 'Equipos de Prueba SRL', rnc: '1-31-00000-1' });
    ok(c.ok === true && c.clienteId === 'C-900', `crearCliente → ${JSON.stringify(c)}`);
    const l = llamadas[0];
    ok(l.metodo === 'POST' && l.url === `${URL_LAB}v1/api/customer`, `POST ${l.url}`);
    ok(l.cuerpo.Email === 'compras@prueba.invalid' && l.cuerpo.FirstName === 'Equipos de Prueba SRL',
      `cuerpo con Email y FirstName: ${JSON.stringify(l.cuerpo)}`);
    ok(l.cuerpo.DocumentNumber === '131000001', 'DocumentNumber con el RNC en dígitos');
    ok(l.cabeceras.Authorization === BASIC, 'Authorization es Basic de la llave privada con contraseña vacía');
    ok(!('DocumentNumber' in cardnet.cuerpoCliente({ correo: 'x@prueba.invalid', nombre: 'X' })), 'sin RNC no hay DocumentNumber');

    doble([{ estado: 500, cuerpo: null }]);
    const mal = await cardnet.crearCliente({ correo: 'compras@prueba.invalid', nombre: 'X' });
    ok(mal.ok === false && !mal.clienteId, 'un 500 al crear el cliente: ok false');

    doble([{
      estado: 200,
      cuerpo: {
        CustomerId: 'C-900', CaptureURL: 'https://labservicios.cardnet.com.do/captura/abc', UniqueID: 'U 1&2',
        PaymentProfiles: [
          { PaymentProfileId: 71, Token: 'CT__uno', Brand: 'VISA', Last4: '1111', Expiration: '12/29', Enabled: true, Extra: 'x' },
          { PaymentProfileID: '72', Token: 'CT__dos', Brand: 'MASTERCARD', Last4: '4444', Expiration: '203001', Enabled: false },
        ],
      },
    }]);
    const v = await cardnet.verCliente('C-900');
    ok(llamadas[0].metodo === 'GET' && llamadas[0].url === `${URL_LAB}v1/api/customer/C-900`, `GET ${llamadas[0].url}`);
    ok(v.ok && v.clienteId === 'C-900' && v.sesion === 'U 1&2', 'verCliente devuelve cliente y sesión');
    ok(v.urlCaptura === `https://labservicios.cardnet.com.do/captura/abc?key=${LLAVE_PUB}&session_id=U%201%262`,
      `urlCaptura con llave pública y UniqueID codificados: ${v.urlCaptura}`);
    ok(!v.urlCaptura.includes(LLAVE_PRIV), 'la llave privada no va en la URL');
    ok(v.perfiles.length === 2, 'dos perfiles');
    const [p1, p2] = v.perfiles;
    ok(JSON.stringify(Object.keys(p1).sort()) === JSON.stringify(['activo', 'marca', 'perfilId', 'token', 'ultimos4', 'venceAnio', 'venceMes']),
      `cada perfil solo trae campos conocidos: ${Object.keys(p1).join(', ')}`);
    ok(p1.perfilId === '71' && p1.token === 'CT__uno' && p1.marca === 'VISA' && p1.ultimos4 === '1111'
      && p1.venceMes === 12 && p1.venceAnio === 2029 && p1.activo === true, `perfil 1: ${JSON.stringify(p1)}`);
    ok(p2.perfilId === '72' && p2.venceMes === 1 && p2.venceAnio === 2030 && p2.activo === false, `perfil 2: ${JSON.stringify(p2)}`);
    ok(cardnet.perfilesDe(null).length === 0 && cardnet.perfilesDe({}).length === 0, 'sin perfiles: lista vacía');
    ok(cardnet.perfilesDe({ PaymentProfiles: [{ Brand: 'VISA' }] }).length === 0, 'un perfil sin id ni token se descarta');

    doble([{ estado: 200, cuerpo: { CustomerId: 'C-900', CaptureURL: 'http://inseguro.prueba/c', UniqueID: 'U' } }]);
    const inseguro = await cardnet.verCliente('C-900');
    ok(inseguro.ok === false, 'una CaptureURL sin https no se entrega al navegador');
    doble([]);
    const raro = await cardnet.verCliente('../purchase/1');
    ok(raro.ok === false && llamadas.length === 0, 'un id de cliente con barras no sale a la red');
  }

  console.log('\n8. El cobro: centavos, referencia en Order, UniqueID e Invoice');
  {
    encender('lab');
    const pago = { id: 'pago-1', referencia: 'TE-2026-CCCCCC', subtotal: 2000, itbis: 360, total: 2360 };
    doble([{
      estado: 200,
      cuerpo: { Status: 'Approved', ResponseCode: '00', PurchaseId: 'P-1', AuthorizationCode: 'AU1', Order: pago.referencia, TrxToken: 'CT__uno' },
    }]);
    const r = await cardnet.cobrar({ token: 'CT__uno', pago });
    const l = llamadas[0];
    ok(l.metodo === 'POST' && l.url === `${URL_LAB}v1/api/purchase`, `POST ${l.url}`);
    ok(l.cuerpo.Amount === 236000 && l.cuerpo.DataDo.Tax === 36000, `RD$2.360 con ITBIS 360 → Amount ${l.cuerpo.Amount}, Tax ${l.cuerpo.DataDo.Tax}`);
    ok(l.cuerpo.Currency === 'DOP' && l.cuerpo.Capture === true, 'DOP y captura inmediata');
    ok(l.cuerpo.Order === pago.referencia && l.cuerpo.UniqueID === pago.referencia && l.cuerpo.DataDo.Invoice === pago.referencia,
      'Order, UniqueID y DataDo.Invoice llevan la referencia del pago, nunca el NCF');
    ok(l.cuerpo.TrxToken === 'CT__uno', 'TrxToken es el token recibido');
    ok(l.cabeceras.Authorization === BASIC, 'firmado con la llave privada');
    ok(r.ok === true && r.resultado === 'aprobado' && r.procesadorId === 'P-1' && r.autorizacion === 'AU1',
      `aprobado normalizado: ${r.resultado}`);
    ok(r.crudo && !JSON.stringify(r.crudo).includes('CT__'), 'crudo va limpio, sin token');

    doble([{ estado: 200, cuerpo: { ResponseCode: '00' } }]);
    await cardnet.cobrar({ token: 'CT__uno', pago: { referencia: 'TE-2026-DDDDDD', total: 2000, itbis: 0 } });
    ok(llamadas[0].cuerpo.Amount === 200000, `RD$2.000 viaja como ${llamadas[0].cuerpo.Amount}`);

    const c = cardnet.cuerpoCompra({ token: 'CT__uno', pago });
    ok(c.Amount === 236000 && c.UniqueID === pago.referencia, 'cuerpoCompra arma lo mismo sin llamar');
    ok(!!lanza(() => cardnet.cuerpoCompra({ token: 'CT__uno', pago: { ...pago, total: 23.6 } })), 'un total con decimales no se manda');
    ok(!!lanza(() => cardnet.cuerpoCompra({ token: '', pago })), 'sin token no se arma el cobro');
    ok(!!lanza(() => cardnet.cuerpoCompra({ token: 'CT__uno', pago: { ...pago, referencia: '' } })), 'sin referencia no se arma el cobro');

    doble([{ estado: 200, cuerpo: { ResponseCode: '51', Order: pago.referencia } }]);
    const rech = await cardnet.cobrar({ token: 'CT__uno', pago });
    ok(rech.resultado === 'rechazado' && rech.codigo === '51' && rech.motivo === cardnet.mensajeDeRechazo('51'), 'rechazo 51 normalizado');
  }

  console.log('\n9. Red caída o CardNet caído: pendiente, nunca rechazo');
  {
    encender('lab');
    const pago = { referencia: 'TE-2026-EEEEEE', total: 2000, itbis: 0 };
    doble([{ estado: 0, cuerpo: null, fallo: 'ECONNRESET' }]);
    const caida = await cardnet.cobrar({ token: 'CT__uno', pago });
    ok(caida.resultado === 'pendiente' && caida.ok === false && !!caida.fallo, `estado 0: pendiente (${caida.fallo})`);
    doble([{ estado: 503, cuerpo: { ResponseCode: '51' } }]);
    const r503 = await cardnet.cobrar({ token: 'CT__uno', pago });
    ok(r503.resultado === 'pendiente' && !!r503.fallo, '503 con un código de rechazo dentro: pendiente igualmente');
    doble([{ estado: 502, cuerpo: { Status: 'Approved', ResponseCode: '00' } }]);
    ok((await cardnet.cobrar({ token: 'CT__uno', pago })).resultado === 'pendiente', '502 que dice aprobado: pendiente');
    cardnet._transporte = async () => { throw new Error('se rompió el doble'); };
    const lanzo = await cardnet.cobrar({ token: 'CT__uno', pago });
    ok(lanzo.resultado === 'pendiente' && lanzo.ok === false, 'un transporte que lanza también es pendiente');
    doble([{ estado: 400, cuerpo: { Errors: [{ Code: 'CS012', Message: 'PROFILE_MUST_BE_ACTIVATED_FIRST' }] } }]);
    const cs = await cardnet.cobrar({ token: 'CT__uno', pago });
    ok(cs.resultado === 'pendiente' && cs.codigo === 'CS012', `CS012 llega como código, sin aprobar ni rechazar: ${cs.codigo}`);
  }

  console.log('\n10. Consultar, devolver, activar y borrar');
  {
    encender('lab');
    doble([{ estado: 200, cuerpo: { Status: 'Approved', ResponseCode: '00', PurchaseId: 'P-9', Order: 'TE-2026-FFFFFF' } }]);
    const q = await cardnet.consultarCompra('P-9');
    ok(llamadas[0].metodo === 'GET' && llamadas[0].url === `${URL_LAB}v1/api/purchase/P-9`, `GET ${llamadas[0].url}`);
    ok(q.ok && q.resultado === 'aprobado' && q.referencia === 'TE-2026-FFFFFF', 'consultarCompra normaliza');
    doble([{ estado: 0, cuerpo: null, fallo: 'tiempo agotado' }]);
    ok((await cardnet.consultarCompra('P-9')).resultado === 'pendiente', 'consulta sin red: pendiente');

    doble([{ estado: 200, cuerpo: { Status: 'Refunded' } }]);
    const d = await cardnet.devolver('P-9');
    ok(llamadas[0].metodo === 'POST' && llamadas[0].url === `${URL_LAB}v1/api/purchase/P-9/refund`, `POST ${llamadas[0].url}`);
    ok(d.ok === true, 'devolver responde ok con un 200');

    doble([{ estado: 200, cuerpo: {} }]);
    const a = await cardnet.activarPerfil({ clienteId: 'C-900', token: 'CT__dos', codigo: '4321' });
    ok(llamadas[0].metodo === 'POST' && llamadas[0].url === `${URL_LAB}v1/api/customer/C-900/activate`, `POST ${llamadas[0].url}`);
    ok(llamadas[0].cuerpo.Token === 'CT__dos' && llamadas[0].cuerpo.ActivationCode === '4321', 'activate lleva Token y ActivationCode');
    ok(a.ok === true, 'activarPerfil ok');
    doble([{ estado: 400, cuerpo: { Errors: [{ Code: 'CS099' }] } }]);
    ok((await cardnet.activarPerfil({ clienteId: 'C-900', token: 'CT__dos', codigo: '0' })).ok === false, 'un 400 al activar: ok false');

    doble([{ estado: 200, cuerpo: {} }]);
    const b = await cardnet.borrarPerfil({ clienteId: 'C-900', perfilId: '71' });
    ok(llamadas[0].metodo === 'POST' && llamadas[0].url === `${URL_LAB}v1/api/customer/C-900/PaymentProfileDelete`, `POST ${llamadas[0].url}`);
    ok(llamadas[0].cuerpo.PaymentProfileId === '71' && b.ok === true, 'PaymentProfileDelete lleva el id del perfil');
  }

  console.log('\n11. De qué compra habla una notificación');
  {
    const n = (o) => cardnet.compraDeNotificacion(o);
    ok(n({ ResourceType: 'Purchase', ResourceUrl: '/v1/api/purchase/P-1', ResourceObject: { PurchaseId: 'P-7' } }) === 'P-7',
      'del ResourceObject');
    ok(n({ ResourceType: 'Purchase', ResourceUrl: 'https://labservicios.cardnet.com.do/servicios/tokens/v1/api/purchase/P-8' }) === 'P-8',
      'del final de ResourceUrl');
    ok(n({ Notification: { ResourceType: 'Purchase', ResourceObject: { PurchaseID: 'P-6' } } }) === 'P-6', 'envuelto en Notification');
    ok(n({ ResourceType: 'Customer', ResourceObject: { CustomerId: 'C-1', PurchaseId: 'P-1' } }) === null, 'un recurso que no es compra: null');
    ok(n({ ResourceType: 'Purchase', ResourceObject: { PurchaseId: '../customer/1' } }) === null, 'un id con barras: null');
    ok(n(null) === null && n({}) === null && n('texto') === null, 'cuerpos vacíos o raros: null');
  }

  console.log('\n12. Barrera de PCI: el código no nombra campos de tarjeta');
  {
    /* La regla de revisión de PAGO-05: si el código nombra una variable
       así, está mal, porque solo la necesitaría quien recibe la tarjeta
       en su servidor, y eso nos mete en el alcance de PCI-DSS SAQ D. Los
       nombres se arman por partes para que este archivo no los contenga:
       así la barrera se recorre también a sí misma, sin excepciones. */
    const PROHIBIDOS = [
      ['c', 'v', 'v'].join(''),
      ['c', 'v', 'c'].join(''),
      ['card', 'number'].join('-'),
      ['card', 'number'].join(''),
      ['expiration', 'date'].join('-'),
      ['numero', 'tarjeta'].join('_'),
    ];
    const BINARIOS = /\.(png|jpe?g|webp|gif|ico|pdf|mp4|webm|mov|woff2?|ttf|db|db-wal|db-shm|db-journal|sqlite)$/i;
    const RAIZ = path.join(__dirname, '..');
    const FUERA = new Set(['node_modules', '.tmp', '.planning', '.git']);
    const archivos = [];
    const recorrer = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (FUERA.has(e.name)) continue;
        const ruta = path.join(dir, e.name);
        if (e.isDirectory()) recorrer(ruta);
        else if (e.isFile() && !BINARIOS.test(e.name)) archivos.push(ruta);
      }
    };
    for (const d of ['tools', 'assets', 'db', 'deploy']) recorrer(path.join(RAIZ, d));
    for (const f of fs.readdirSync(RAIZ)) if (f.endsWith('.html')) archivos.push(path.join(RAIZ, f));

    const hallazgos = [];
    for (const archivo of archivos) {
      const lineas = fs.readFileSync(archivo, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        const baja = linea.toLowerCase();
        for (const p of PROHIBIDOS) {
          if (baja.includes(p)) hallazgos.push(`${path.relative(RAIZ, archivo)}:${i + 1} nombra «${p}»`);
        }
      });
    }
    ok(archivos.length > 50 && archivos.some((a) => a.endsWith('cardnet.js')), `se recorrieron ${archivos.length} archivos, cardnet.js entre ellos`);
    ok(hallazgos.length === 0, hallazgos.length ? `campos de tarjeta en el código:\n        ${hallazgos.join('\n        ')}` : 'ningún campo de tarjeta en tools/, assets/, db/, deploy/ ni en los .html');
  }

  console.log('\n13. La migración 2026-10-cardnet: última, única, sin duplicar lo de la 05.3');
  {
    const { DatabaseSync } = require('node:sqlite');
    const { execFileSync } = require('child_process');
    const db = require('./db');
    const d = db.abrir();

    /* Es la última de MIGRACIONES: se lee el orden en que quedaron
       anotadas y el texto del archivo. */
    const anotadas = d.prepare('SELECT id FROM migraciones ORDER BY aplicada, rowid').all().map((r) => r.id);
    ok(anotadas[anotadas.length - 1] === '2026-10-cardnet', `es la última migración anotada (${anotadas[anotadas.length - 1]})`);
    ok(anotadas.filter((x) => x === '2026-10-cardnet').length === 1, 'anotada una sola vez');

    const fuente = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
    const desde = fuente.indexOf("['2026-10-cardnet', [");
    const cuerpo = fuente.slice(desde, fuente.indexOf('\n];', desde));
    ok(desde > 0 && fuente.indexOf("['2026-10-cardnet'", desde + 1) === -1, 'una sola entrada en el archivo');
    ok(fuente.indexOf("['2026-09-renovacion', [") < desde, 'va detrás de 2026-09-renovacion');
    const REPETIDAS = ['renovacion_automatica', 'renovacion_aceptada', 'renovacion_texto', 'proximo_cargo'];
    ok(REPETIDAS.every((c) => !cuerpo.includes(c)), 'no vuelve a crear el consentimiento de la 05.3 ni proximo_cargo');

    /* Una base vieja migrada y una nueva tienen las mismas columnas: la
       vieja sale de vaciar la migración de una copia de la nueva. */
    const copia = path.join(BANCO, 'vieja.db');
    d.exec(`VACUUM INTO '${copia.replace(/'/g, "''")}'`);
    const v = new DatabaseSync(copia);
    v.exec("DELETE FROM migraciones WHERE id = '2026-10-cardnet'");
    for (const x of ['ux_pagos_cardnet_referencia', 'ix_pagos_procesador_id', 'ux_metodos_perfil']) v.exec(`DROP INDEX IF EXISTS ${x}`);
    for (const x of ['tr_pagos_eventos_sin_cambios', 'tr_pagos_eventos_sin_borrado']) v.exec(`DROP TRIGGER IF EXISTS ${x}`);
    v.exec('DROP TABLE pagos_eventos');
    v.exec('DROP TABLE clientes_procesador');
    const NUEVAS = {
      pagos: ['procesador_id', 'autorizacion', 'codigo_respuesta', 'motivo', 'intentos'],
      metodos_pago: ['procesador_cliente_id', 'procesador_perfil_id', 'activo', 'fallos_seguidos', 'borrado', 'aviso_vencimiento'],
      suscripciones: ['metodo_pago_id', 'renovacion_intentos', 'renovacion_avisada'],
    };
    for (const [tabla, cols] of Object.entries(NUEVAS)) for (const c of [...cols].reverse()) v.exec(`ALTER TABLE ${tabla} DROP COLUMN ${c}`);

    /* Filas de antes: dos demo con la MISMA referencia (no impiden
       migrar) y una suscripción con su consentimiento. */
    const t = new Date().toISOString();
    v.exec("INSERT INTO organizaciones (id, tipo, nombre, creada) VALUES ('org-vieja', 'particular', 'Vieja', '" + t + "')");
    const pg = v.prepare(`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia, procesador, creado)
                          VALUES (?, 'org-vieja', 100, 18, 118, 'aprobado', 'REF-REPETIDA', ?, ?)`);
    pg.run('pago-viejo-1', 'demo', t);
    pg.run('pago-viejo-2', 'transferencia', t);
    v.exec(`INSERT INTO suscripciones (id, organizacion_id, plan_id, modalidad, estado, precio_pactado, inicio, creada,
                                       renovacion_automatica, renovacion_aceptada, renovacion_texto)
            VALUES ('susc-vieja', 'org-vieja', 'estandar', 'vigencia', 'activa', 1800, '${t}', '${t}', 1, '2026-09-01T00:00:00.000Z', 'texto viejo')`);
    v.close();

    const salida = execFileSync(process.execPath, ['-e', `
      const db = require(${JSON.stringify(path.join(__dirname, 'db.js'))});
      const d = db.abrir();
      const cols = (t) => d.prepare('PRAGMA table_info(' + t + ')').all().map((c) => c.name + ':' + c.type + ':' + c.notnull + ':' + c.dflt_value).sort();
      const susc = d.prepare("SELECT renovacion_automatica AS a, renovacion_aceptada AS b, renovacion_texto AS c, renovacion_intentos AS i FROM suscripciones WHERE id = 'susc-vieja'").get();
      const veces = d.prepare("SELECT COUNT(*) AS n FROM migraciones WHERE id = '2026-10-cardnet'").get().n;
      const pagos = d.prepare("SELECT COUNT(*) AS n FROM pagos WHERE referencia = 'REF-REPETIDA'").get().n;
      let cardnetDoble = null;
      const ins = d.prepare("INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia, procesador, creado) VALUES (?, 'org-vieja', 1, 0, 1, 'pendiente', 'REF-CN', 'cardnet', 'x')");
      ins.run('cn-1');
      try { ins.run('cn-2'); } catch (e) { cardnetDoble = e.message; }
      console.log(JSON.stringify({ pagos: cols('pagos'), metodos: cols('metodos_pago'), susc: cols('suscripciones'), suscFila: susc, veces, repetidas: pagos, cardnetDoble }));
    `], { env: { ...process.env, MERCA_DB: copia }, encoding: 'utf8' });
    const vieja = JSON.parse(salida.trim().split('\n').pop());
    const cols = (t) => d.prepare(`PRAGMA table_info(${t})`).all().map((c) => `${c.name}:${c.type}:${c.notnull}:${c.dflt_value}`).sort();
    ok(JSON.stringify(vieja.pagos) === JSON.stringify(cols('pagos')), 'pagos: la base vieja migrada y la nueva tienen las mismas columnas');
    ok(JSON.stringify(vieja.metodos) === JSON.stringify(cols('metodos_pago')), 'metodos_pago: mismas columnas');
    ok(JSON.stringify(vieja.susc) === JSON.stringify(cols('suscripciones')), 'suscripciones: mismas columnas');
    ok(vieja.veces === 1, 'la migración corrió una vez sobre la base vieja');
    ok(vieja.repetidas === 2, 'dos pagos antiguos con la misma referencia no impidieron migrar');
    ok(vieja.suscFila.a === 1 && vieja.suscFila.c === 'texto viejo' && vieja.suscFila.b === '2026-09-01T00:00:00.000Z' && vieja.suscFila.i === 0,
      'la suscripción vieja conserva su consentimiento y sale con intentos = 0');
    ok(/UNIQUE constraint failed/i.test(vieja.cardnetDoble || ''), 'dos pagos cardnet con la misma referencia: el segundo lanza por UNIQUE');

    /* Abrir de nuevo no reaplica: la base de esta prueba ya se abrió al
       cargar db.js y otra vez arriba. */
    const otraVez = execFileSync(process.execPath, ['-e', `
      const d = require(${JSON.stringify(path.join(__dirname, 'db.js'))}).abrir();
      console.log(d.prepare("SELECT COUNT(*) AS n FROM migraciones WHERE id = '2026-10-cardnet'").get().n);
    `], { env: { ...process.env, MERCA_DB: process.env.MERCA_DB }, encoding: 'utf8' });
    ok(otraVez.trim() === '1', 'abrir la base otra vez no vuelve a anotar la migración');

    /* Referencias iguales en demo y transferencia entran; en cardnet no. */
    const ref = 'REF-' + Date.now();
    const insp = d.prepare(`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia, procesador, creado)
                            SELECT ?, id, 1, 0, 1, 'pendiente', ?, ?, ? FROM organizaciones LIMIT 1`);
    d.exec("INSERT OR IGNORE INTO organizaciones (id, tipo, nombre, creada) VALUES ('org-c13', 'particular', 'C13', '" + t + "')");
    const insq = d.prepare(`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia, procesador, creado)
                            VALUES (?, 'org-c13', 1, 0, 1, 'pendiente', ?, ?, ?)`);
    void insp;
    insq.run('c13-a', ref, 'demo', t);
    ok(lanza(() => insq.run('c13-b', ref, 'demo', t)) === null, 'dos demo con la misma referencia: ambos entran');
    insq.run('c13-c', ref + 'x', 'cardnet', t);
    ok(/UNIQUE/i.test((lanza(() => insq.run('c13-d', ref + 'x', 'cardnet', t)) || {}).message || ''), 'dos cardnet con la misma referencia: el segundo lanza');

    /* pagos_eventos es de solo añadir. */
    d.prepare("INSERT INTO pagos_eventos (pago_id, procesador, origen, tipo, cuerpo, creado) VALUES ('c13-a', 'cardnet', 'prueba', 'x', '{}', ?)").run(t);
    ok(/no se modifican/.test((lanza(() => d.exec("UPDATE pagos_eventos SET tipo = 'y'")) || {}).message || ''), 'UPDATE de pagos_eventos: aborta con el texto del disparador');
    ok(/no se borran/.test((lanza(() => d.exec('DELETE FROM pagos_eventos')) || {}).message || ''), 'DELETE de pagos_eventos: aborta con el texto del disparador');

    /* Columnas con DEFAULT en filas antiguas. */
    const f = d.prepare("SELECT intentos FROM pagos WHERE id = 'c13-a'").get();
    ok(f.intentos === 0, 'intentos de un pago sin cobrar vale 0');
  }

  console.log('\n14. Funciones de base: clientes, tarjetas, respuestas, eventos y consentimiento');
  {
    const db = require('./db');
    const precios = require('../assets/precios.js');
    const d = db.abrir();
    const SELLO = Date.now().toString(36);
    const DIA = 86400000;
    let n = 0;
    const enDias = (x) => new Date(Date.now() + x * DIA).toISOString();
    const cuenta = (etiqueta) => {
      const { idUsuario } = db.crearCuenta({
        correo: `${etiqueta}-${SELLO}@prueba.invalid`, clave: 'UnaClaveLargaYSegura9', nombre: `Prueba ${etiqueta}`,
        telefono: '8095550000', tipo: 'particular',
      });
      return db.organizacionDe(idUsuario).id;
    };
    const susc = (idOrg, { fin = enDias(20), estado = 'activa' } = {}) => {
      const idSusc = `susc14-${SELLO}-${++n}`;
      d.prepare(`INSERT INTO suscripciones (id, organizacion_id, plan_id, modalidad, ciclo, estado, precio_pactado,
                   anuncios_incluidos, dias_ciclo, inicio, fin, proximo_cargo, creada)
                 VALUES (?, ?, 'estandar', 'vigencia', NULL, ?, 1800, 1, 30, ?, ?, NULL, ?)`)
        .run(idSusc, idOrg, estado, enDias(-10), fin, new Date().toISOString());
      return idSusc;
    };
    const perfil = (extra = {}) => ({ perfilId: `PF-${SELLO}-${++n}`, token: `tok-${SELLO}-${n}`, marca: 'Visa', ultimos4: '1111',
      venceMes: 12, venceAnio: 2030, activo: true, ...extra });
    const pagoCon = (idOrg, { idSusc = null, intencion, procesador = 'cardnet', creado = null }) => {
      const p = db.registrarCobro({
        idOrg, idSusc, cobro: { ...precios.desglose(1800), referencia: `R14-${SELLO}-${++n}`, procesador }, intencion });
      if (creado) d.prepare('UPDATE pagos SET creado = ? WHERE id = ?').run(creado, p.id);
      return p;
    };
    const COMPRA = { tipo: 'compra', idPlan: 'estandar', cupo: 1, dias: 30 };

    const org = cuenta('a14');
    const otra = cuenta('b14');

    // Cliente en el procesador
    ok(db.clienteProcesador(org, 'cardnet') === null, 'sin cliente guardado: null');
    ok(db.guardarClienteProcesador(org, 'cardnet', 'C1') === 'C1', 'guardarClienteProcesador devuelve el id');
    ok(db.guardarClienteProcesador(org, 'cardnet', 'C2') === 'C1', 'guardar otra vez no lo cambia');
    ok(d.prepare('SELECT COUNT(*) AS n FROM clientes_procesador WHERE organizacion_id = ?').get(org).n === 1, 'y no lo duplica');

    // Tarjetas
    const p1 = perfil({ numero: '4111111111111111', codigoSeguridad: '123' });
    const m1 = db.guardarMetodoPago({ idOrg: org, procesador: 'cardnet', clienteId: 'C1', perfil: p1 });
    const m1b = db.guardarMetodoPago({ idOrg: org, procesador: 'cardnet', clienteId: 'C1', perfil: p1 });
    ok(m1.id === m1b.id && d.prepare('SELECT COUNT(*) AS n FROM metodos_pago WHERE organizacion_id = ?').get(org).n === 1,
      'el mismo perfil dos veces es una sola fila');
    const filaEntera = JSON.stringify(d.prepare('SELECT * FROM metodos_pago WHERE id = ?').get(m1.id));
    ok(!filaEntera.includes('4111111111111111') && !filaEntera.includes('123"'), 'una propiedad extra del perfil no llega a la base');
    ok(m1.predeterminado === 1 && m1.procesador_perfil_id === p1.perfilId && m1.procesador_cliente_id === 'C1', 'la primera queda predeterminada, con sus identificadores');
    const m2 = db.guardarMetodoPago({ idOrg: org, procesador: 'cardnet', clienteId: 'C1', perfil: perfil({ ultimos4: '2222' }) });
    ok(m2.predeterminado === 0, 'la segunda no lo es');
    const lista = db.metodosPagoDe(org);
    ok(lista.length === 2 && lista.every((m) => !('token' in m) && !JSON.stringify(m).includes('tok-')), 'metodosPagoDe no devuelve token');
    ok(lista[0].id === m1.id && lista[0].ultimos4 === '1111' && lista[0].venceMes === 12 && lista[0].venceAnio === 2030 && lista[0].activo === true,
      'metodosPagoDe: marca, últimos cuatro, vencimiento, activo');
    ok(db.metodoPagoDe(m1.id, otra) === null, 'metodoPagoDe de otra organización: null');
    ok(db.metodoPagoDe(m1.id, org).token === p1.token, 'metodoPagoDe con la suya trae el token (uso del servidor)');
    ok(lanza(() => db.guardarMetodoPago({ idOrg: org, procesador: 'cardnet', perfil: { perfilId: 'x' } })) !== null, 'sin token no se guarda');

    // Resultado de cobros con la tarjeta
    db.anotarResultadoTarjeta(m2.id, false); db.anotarResultadoTarjeta(m2.id, false);
    ok(d.prepare('SELECT fallos_seguidos AS f FROM metodos_pago WHERE id = ?').get(m2.id).f === 2, 'dos rechazos: fallos_seguidos = 2');
    db.anotarResultadoTarjeta(m2.id, true);
    ok(d.prepare('SELECT fallos_seguidos AS f FROM metodos_pago WHERE id = ?').get(m2.id).f === 0, 'un aprobado los pone a 0');
    d.prepare('UPDATE metodos_pago SET activo = 0, fallos_seguidos = 3 WHERE id = ?').run(m2.id);
    ok(db.activarMetodoPago(m2.id, otra) === false && db.activarMetodoPago(m2.id, org) === true, 'activarMetodoPago solo la del dueño');
    ok(d.prepare('SELECT activo, fallos_seguidos AS f FROM metodos_pago WHERE id = ?').get(m2.id).f === 0, 'y limpia los fallos');

    // Enlazar tarjeta y anotar respuesta
    const cn = pagoCon(org, { intencion: COMPRA });
    ok(db.enlazarMetodoPago(cn.id, m1.id) === true && db.pagoPorId(cn.id).metodo_pago_id === m1.id, 'enlazarMetodoPago en un pendiente');
    let r = db.anotarRespuestaProcesador(cn.id, { procesadorId: 'P-1', autorizacion: 'A1', codigo: '00', intento: true });
    ok(r.procesador_id === 'P-1' && r.autorizacion === 'A1' && r.codigo_respuesta === '00' && r.intentos === 1, 'anotarRespuestaProcesador rellena y cuenta el intento');
    r = db.anotarRespuestaProcesador(cn.id, { procesadorId: 'P-1', codigo: '00' });
    ok(r.intentos === 1 && r.autorizacion === 'A1', 'sin intento no suma y no borra lo anotado');
    const e409 = lanza(() => db.anotarRespuestaProcesador(cn.id, { procesadorId: 'P-OTRO' }));
    ok(e409 && e409.codigo === 409 && db.pagoPorId(cn.id).procesador_id === 'P-1', 'otro id de compra: 409 y no se sobrescribe');
    ok((lanza(() => db.anotarRespuestaProcesador('no-existe', {})) || {}).codigo === 404, 'un pago que no existe: 404');

    // Rechazo con código y motivo
    const suscAntes = d.prepare('SELECT COUNT(*) AS n FROM suscripciones').get().n;
    const facturasAntes = d.prepare('SELECT COUNT(*) AS n FROM facturas').get().n;
    const rz = db.rechazarPago(cn.id, { codigo: '51', motivo: 'Fondos insuficientes' });
    ok(rz.cambiado && rz.pago.estado === 'rechazado' && rz.pago.codigo_respuesta === '51' && rz.pago.motivo === 'Fondos insuficientes', 'rechazarPago guarda código y motivo');
    ok(d.prepare('SELECT COUNT(*) AS n FROM suscripciones').get().n === suscAntes && d.prepare('SELECT COUNT(*) AS n FROM facturas').get().n === facturasAntes,
      'sin tocar suscripciones ni facturas');
    ok(db.enlazarMetodoPago(cn.id, m2.id) === false && db.pagoPorId(cn.id).metodo_pago_id === m1.id, 'enlazarMetodoPago no toca un pago ya resuelto');
    const sinArg = pagoCon(org, { intencion: COMPRA });
    const rz2 = db.rechazarPago(sinArg.id);
    ok(rz2.cambiado && rz2.pago.estado === 'rechazado' && rz2.pago.codigo_respuesta === null, 'sin segundo argumento se comporta como antes');
    ok(db.rechazarPago(sinArg.id).cambiado === false, 'un rechazado no vuelve a cambiar');

    // Eventos
    const ev = pagoCon(org, { intencion: COMPRA });
    ok(db.huboIntentoDeCobro(ev.id) === false, 'sin evento cobro-enviado: no hubo intento');
    db.anotarEventoPago({ pagoId: ev.id, procesador: 'cardnet', origen: 'cobro', tipo: 'cobro-enviado', cuerpo: { uniqueId: 'U1' } });
    db.anotarEventoPago({ pagoId: ev.id, procesador: 'cardnet', origen: 'notificacion', tipo: 'recibido', cuerpo: { estado: 'x' } });
    const evs = db.eventosDePago(ev.id);
    ok(evs.length === 2 && evs[0].tipo === 'cobro-enviado' && evs[1].tipo === 'recibido' && evs[0].cuerpo.uniqueId === 'U1', 'eventosDePago en orden de id, con el cuerpo como JSON');
    ok(db.huboIntentoDeCobro(ev.id) === true, 'con cobro-enviado: hubo intento');

    // intencionAplicable
    const compra = pagoCon(org, { intencion: COMPRA });
    ok(db.intencionAplicable(compra).ok === true, 'compra con plan activo: aplicable');
    const sViva = susc(org);
    const amp = pagoCon(org, { idSusc: sViva, intencion: { tipo: 'ampliacion', idSusc: sViva, anadidos: 1 } });
    ok(db.intencionAplicable(amp).ok === true, 'ampliación sobre membresía viva: aplicable');
    const sVencida = susc(org, { fin: enDias(-1) });
    const ampV = pagoCon(org, { idSusc: sVencida, intencion: { tipo: 'ampliacion', idSusc: sVencida, anadidos: 1 } });
    ok(db.intencionAplicable(ampV).ok === false && db.intencionAplicable(ampV).codigo === 'membresia-vencida', 'ampliación sobre una vencida: membresia-vencida');
    const borr = db.crearBorrador({ idOrg: org, idPlan: 'estandar', dias: 30 });
    const pub = pagoCon(org, { intencion: { tipo: 'publicacion', idPlan: 'estandar', idAnuncio: borr, dias: 30 } });
    ok(db.intencionAplicable(pub).ok === true, 'publicación sobre un borrador: aplicable');
    d.prepare("UPDATE anuncios SET estado = 'activo' WHERE id = ?").run(borr);
    ok(db.intencionAplicable(pub).codigo === 'publicacion-huerfana', 'publicación cuyo anuncio ya no es borrador: publicacion-huerfana');
    const pubX = pagoCon(org, { intencion: { tipo: 'publicacion', idPlan: 'estandar', idAnuncio: 'no-existe', dias: 30 } });
    ok(db.intencionAplicable(pubX).codigo === 'publicacion-huerfana', 'publicación cuyo anuncio no existe: publicacion-huerfana');
    const ren = pagoCon(org, { idSusc: sViva, intencion: { tipo: 'renovacion', idSusc: sViva, dias: 30, idPlan: 'estandar', cupo: 1 } });
    ok(db.intencionAplicable(ren).ok === true, 'renovación de una suscripción renovable: aplicable');
    d.prepare("UPDATE suscripciones SET estado = 'cancelada' WHERE id = ?").run(sViva);
    ok(db.intencionAplicable(ren).codigo === 'renovacion-huerfana', 'renovación de una cancelada: renovacion-huerfana');
    d.prepare("UPDATE suscripciones SET estado = 'activa' WHERE id = ?").run(sViva);
    ok(db.intencionAplicable({ organizacion_id: org, intencion: 'no es json' }).codigo === 'intencion-invalida', 'intención rota: intencion-invalida');

    // Consentimiento con tarjeta
    const sRen = susc(org, { fin: enDias(30) });
    const antes = d.prepare('SELECT * FROM suscripciones WHERE id = ?').get(sRen);
    const ajena = db.guardarMetodoPago({ idOrg: otra, procesador: 'cardnet', perfil: perfil() });
    ok(db.activarRenovacionConTarjeta({ idSusc: sRen, idOrg: org, idMetodo: ajena.id, texto: 'T' }) === false, 'con tarjeta ajena: false');
    d.prepare('UPDATE metodos_pago SET activo = 0 WHERE id = ?').run(m1.id);
    ok(db.activarRenovacionConTarjeta({ idSusc: sRen, idOrg: org, idMetodo: m1.id, texto: 'T' }) === false, 'con tarjeta inactiva: false');
    d.prepare('UPDATE metodos_pago SET activo = 1 WHERE id = ?').run(m1.id);
    ok(JSON.stringify(d.prepare('SELECT * FROM suscripciones WHERE id = ?').get(sRen)) === JSON.stringify(antes), 'sin tarjeta válida no cambió nada');
    ok(db.activarRenovacionConTarjeta({ idSusc: sRen, idOrg: otra, idMetodo: ajena.id, texto: 'T' }) === false, 'con una suscripción de otra organización: false');
    ok(db.activarRenovacionConTarjeta({ idSusc: sRen, idOrg: org, idMetodo: m1.id, texto: 'Texto de la 05.3', aceptada: '2026-10-01T10:00:00.000Z' }) === true, 'con su tarjeta activa: true');
    const s1 = d.prepare('SELECT * FROM suscripciones WHERE id = ?').get(sRen);
    ok(s1.renovacion_automatica === 1 && s1.renovacion_aceptada === '2026-10-01T10:00:00.000Z' && s1.renovacion_texto === 'Texto de la 05.3'
      && s1.metodo_pago_id === m1.id && s1.renovacion_intentos === 0, 'consentimiento, texto, tarjeta e intentos a 0');
    const esperado = new Date(new Date(s1.fin).getTime() - 3 * DIA).toISOString().slice(0, 16);
    ok(s1.proximo_cargo && s1.proximo_cargo.slice(0, 16) === esperado, 'proximo_cargo = fin − 3 días (fecha del próximo intento)');

    // Reprogramar tras renovar
    const finNuevo = enDias(60);
    d.prepare('UPDATE suscripciones SET fin = ?, renovacion_intentos = 2 WHERE id = ?').run(finNuevo, sRen);
    ok(db.reprogramarRenovacion(sRen) === true, 'reprogramarRenovacion con automática activa');
    const s2 = d.prepare('SELECT * FROM suscripciones WHERE id = ?').get(sRen);
    ok(s2.renovacion_intentos === 0 && s2.proximo_cargo.slice(0, 16) === new Date(new Date(finNuevo).getTime() - 3 * DIA).toISOString().slice(0, 16),
      'intentos a 0 y próximo intento 3 días antes del nuevo fin');
    db.reprogramarRenovacion(sRen);
    ok(d.prepare('SELECT proximo_cargo AS p FROM suscripciones WHERE id = ?').get(sRen).p === s2.proximo_cargo, 'idempotente');
    const sSin = susc(org);
    ok(db.reprogramarRenovacion(sSin) === false && d.prepare('SELECT proximo_cargo AS p FROM suscripciones WHERE id = ?').get(sSin).p === null,
      'sin automática no cambia nada');

    // Desactivar conserva el historial
    ok(db.desactivarRenovacion(sRen, otra) === false, 'desactivar ajena: false');
    ok(db.desactivarRenovacion(sRen, org) === true, 'desactivar la propia');
    const s3 = d.prepare('SELECT * FROM suscripciones WHERE id = ?').get(sRen);
    ok(s3.renovacion_automatica === 0 && s3.proximo_cargo === null && s3.renovacion_aceptada === '2026-10-01T10:00:00.000Z' && s3.renovacion_texto === 'Texto de la 05.3',
      'apagada, sin próximo intento, con el historial del consentimiento');

    // Borrar una tarjeta apaga las renovaciones que la usaban
    db.activarRenovacionConTarjeta({ idSusc: sRen, idOrg: org, idMetodo: m1.id, texto: 'T' });
    ok(db.borrarMetodoPago(m1.id, otra) === false, 'borrar la tarjeta de otra: false');
    ok(db.borrarMetodoPago(m1.id, org) === true, 'borrar la propia');
    ok(db.metodosPagoDe(org).every((m) => m.id !== m1.id) && db.metodoPagoDe(m1.id, org) === null, 'ya no se lista ni se puede usar');
    ok(d.prepare('SELECT metodo_pago_id AS m FROM pagos WHERE id = ?').get(cn.id).m === m1.id, 'el pago cobrado con ella sigue apuntándole');
    const s4 = d.prepare('SELECT * FROM suscripciones WHERE id = ?').get(sRen);
    ok(s4.renovacion_automatica === 0 && s4.proximo_cargo === null && s4.metodo_pago_id === m1.id, 'la suscripción deja de renovarse sola y conserva la cita');
    ok(db.guardarMetodoPago({ idOrg: org, procesador: 'cardnet', perfil: p1 }).id === m1.id && db.metodosPagoDe(org).some((m) => m.id === m1.id),
      'volver a guardar el mismo perfil la recupera');

    // Conciliación
    const base = Date.now();
    const viejo = pagoCon(org, { intencion: COMPRA, creado: new Date(base - 30 * 60000).toISOString() });
    const reciente = pagoCon(org, { intencion: COMPRA, creado: new Date(base - 2 * 60000).toISOString() });
    const sinApl = pagoCon(org, { intencion: COMPRA, creado: new Date(base - 40 * 60000).toISOString() });
    const demo = pagoCon(org, { intencion: COMPRA, procesador: 'demo', creado: new Date(base - 50 * 60000).toISOString() });
    db.anotarRespuestaProcesador(viejo.id, { procesadorId: 'P-V' });
    db.enlazarMetodoPago(viejo.id, m2.id);
    db.anotarEventoPago({ pagoId: viejo.id, procesador: 'cardnet', origen: 'cobro', tipo: 'cobro-enviado' });
    db.anotarEventoPago({ pagoId: sinApl.id, procesador: 'cardnet', origen: 'reconciliacion', tipo: 'aprobado-sin-aplicar' });
    const cola = db.pagosCardnetPorReconciliar({ minutos: 10, ahora: new Date(base) });
    const idsCola = cola.map((p) => p.id);
    ok(idsCola.includes(viejo.id) && !idsCola.includes(reciente.id) && !idsCola.includes(demo.id), 'solo cardnet pendientes con más de N minutos');
    ok(!idsCola.includes(sinApl.id), 'excluye los aprobado-sin-aplicar');
    const fv = cola.find((p) => p.id === viejo.id);
    ok(fv.procesador_id === 'P-V' && fv.metodo_pago_id === m2.id && fv.huboIntento === true && fv.sinAplicar === false, 'trae procesador_id, metodo_pago_id, huboIntento y sinAplicar');
  }

  console.log('\n15. pagos.js: selector, guarda de la 05.4, resolver y consentimiento al aprobar');
  {
    const db = require('./db');
    const pagos = require('./pagos');
    const precios = require('../assets/precios.js');
    db.secuenciasNcf();
    db.cargarSecuencia({ tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 500, vence: '2027-12-31', usaSitio: true });
    const d = db.abrir();
    const SELLO = Date.now().toString(36);
    const DIA = 86400000;
    let n = 0;
    const enDias = (x) => new Date(Date.now() + x * DIA).toISOString();
    const b02 = () => d.prepare("SELECT siguiente FROM secuencias_ncf WHERE tipo = 'B02' AND activa = 1").get().siguiente;
    const facturasDe = (idPago) => d.prepare("SELECT COUNT(*) AS n FROM facturas WHERE pago_id = ? AND tipo <> 'nota_credito'").get(idPago).n;
    const tiposDeEventos = (idPago) => db.eventosDePago(idPago).map((e) => e.tipo);
    const cuenta = (etiqueta) => {
      const { idUsuario } = db.crearCuenta({
        correo: `${etiqueta}-${SELLO}@prueba.invalid`, clave: 'UnaClaveLargaYSegura9', nombre: `Prueba ${etiqueta}`,
        telefono: '8095550000', tipo: 'particular',
      });
      return db.organizacionDe(idUsuario).id;
    };
    const susc = (idOrg, { fin = enDias(20) } = {}) => {
      const idSusc = `susc15-${SELLO}-${++n}`;
      d.prepare(`INSERT INTO suscripciones (id, organizacion_id, plan_id, modalidad, ciclo, estado, precio_pactado,
                   anuncios_incluidos, dias_ciclo, inicio, fin, proximo_cargo, creada)
                 VALUES (?, ?, 'estandar', 'vigencia', NULL, 'activa', 1800, 1, 30, ?, ?, NULL, ?)`)
        .run(idSusc, idOrg, enDias(-10), fin, new Date().toISOString());
      return idSusc;
    };
    const tarjeta = (idOrg, cliente = 'C-15') => db.guardarMetodoPago({
      idOrg, procesador: 'cardnet', clienteId: cliente,
      perfil: { perfilId: `PF15-${SELLO}-${++n}`, token: `CT__15-${SELLO}-${n}`, marca: 'Visa', ultimos4: '1111', venceMes: 12, venceAnio: 2030, activo: true },
    });
    const CLIENTE = { razonSocial: 'Cliente de prueba', correo: 'cliente@prueba.invalid' };
    const COMPRA = { tipo: 'compra', idPlan: 'estandar', cupo: 1, dias: 30, concepto: 'Estándar · 1 cupo', cliente: CLIENTE, correoCliente: CLIENTE.correo };
    const pagoNuevo = (idOrg, { intencion = COMPRA, idSusc = null, metodo = null, procesador = 'cardnet' } = {}) => {
      const p = db.registrarCobro({
        idOrg, idSusc, cobro: { ...precios.desglose(1800), referencia: `R15-${SELLO}-${++n}`, procesador }, intencion });
      if (metodo) db.enlazarMetodoPago(p.id, metodo.id);
      return db.pagoPorId(p.id);
    };
    const aprobada = (id = `P15-${SELLO}`) => ({ estado: 200, cuerpo: { Status: 'Approved', ResponseCode: '00', PurchaseId: id, AuthorizationCode: 'AU15' } });
    const compras = () => llamadas.filter((l) => /purchase/.test(l.url)).length;
    const org = cuenta('a15');
    const otra = cuenta('b15');

    // Selector
    apagar();
    delete process.env.MERCA_TRANSFERENCIA;
    ok(JSON.stringify(pagos.metodosDeCobro()) === '["demo"]', `apagado, sin transferencia: ${JSON.stringify(pagos.metodosDeCobro())}`);
    ok((lanza(() => pagos.procesadorDeCobro('cardnet')) || {}).codigo === 400, 'apagado: procesadorDeCobro(cardnet) lanza 400');
    encender('lab');
    ok(JSON.stringify(pagos.metodosDeCobro()) === '["cardnet"]' && pagos.procesadorDeCobro() === 'cardnet', 'activo sin transferencia: ["cardnet"] y es el de por defecto');
    ok((lanza(() => pagos.procesadorDeCobro('demo')) || {}).codigo === 400, 'activo: demo lanza 400');
    const VARS_TRANSF = {
      MERCA_TRANSFERENCIA_BANCO: 'Banco de Prueba', MERCA_TRANSFERENCIA_TITULAR: 'Titular de Prueba, S.R.L.',
      MERCA_TRANSFERENCIA_RNC: '000000000', MERCA_TRANSFERENCIA_TIPO: 'corriente', MERCA_TRANSFERENCIA_CUENTA: '000-000000-0',
    };
    Object.assign(process.env, VARS_TRANSF);
    ok(JSON.stringify(pagos.metodosDeCobro()) === '["cardnet","transferencia"]', `activo con transferencia: ${JSON.stringify(pagos.metodosDeCobro())}`);
    ok(pagos.procesadorDeCobro('transferencia') === 'transferencia', 'activo: transferencia sigue siendo válida');
    apagar();
    ok(JSON.stringify(pagos.metodosDeCobro()) === '["transferencia"]', 'apagado con transferencia: ["transferencia"], como en la fase 5');
    for (const k of Object.keys(VARS_TRANSF)) delete process.env[k];
    ok(pagos.PROCESADORES.transferencia && typeof pagos.PROCESADORES.cardnet === 'function', 'PROCESADORES tiene cardnet y transferencia');

    // Sin tarjeta enlazada
    encender('lab');
    doble(() => ({ estado: 200, cuerpo: aprobada().cuerpo }));
    const antesB02 = b02();
    const sinTarjeta = pagoNuevo(org);
    let r = await pagos.cobrar(sinTarjeta);
    ok(r.estado === 'pendiente' && llamadas.length === 0 && b02() === antesB02, 'sin tarjeta enlazada: pendiente, el doble no recibe llamadas, B02 igual');

    // Tarjeta de otra organización, borrada o inactiva
    const ajena = tarjeta(otra);
    const pAjena = pagoNuevo(org);
    d.prepare('UPDATE pagos SET metodo_pago_id = ? WHERE id = ?').run(ajena.id, pAjena.id);
    r = await pagos.cobrar(db.pagoPorId(pAjena.id));
    ok(r.estado === 'pendiente' && llamadas.length === 0, 'tarjeta de otra organización: pendiente sin llamar');
    const borrada = tarjeta(org);
    db.borrarMetodoPago(borrada.id, org);
    const pBorr = pagoNuevo(org);
    d.prepare('UPDATE pagos SET metodo_pago_id = ? WHERE id = ?').run(borrada.id, pBorr.id);
    r = await pagos.cobrar(db.pagoPorId(pBorr.id));
    ok(r.estado === 'pendiente' && llamadas.length === 0, 'tarjeta borrada: pendiente sin llamar');
    const inactiva = tarjeta(org);
    d.prepare('UPDATE metodos_pago SET activo = 0 WHERE id = ?').run(inactiva.id);
    const pInact = pagoNuevo(org, { metodo: inactiva });
    r = await pagos.cobrar(db.pagoPorId(pInact.id));
    ok(r.estado === 'pendiente' && llamadas.length === 0, 'tarjeta inactiva: pendiente sin llamar');

    // Aprobado: compra
    const t1 = tarjeta(org);
    const p1 = pagoNuevo(org, { metodo: t1 });
    const viejo = pagoNuevo(org, { procesador: 'cardnet' }); // objeto sin la tarjeta, se enlaza después
    db.enlazarMetodoPago(viejo.id, t1.id);
    doble([aprobada('P15-A')]);
    let b = b02();
    r = await pagos.cobrar(p1);
    const f1 = db.pagoPorId(p1.id);
    ok(r.estado === 'aprobado' && f1.estado === 'aprobado' && r.comprobante && facturasDe(p1.id) === 1 && b02() === b + 1, `compra aprobada: ${r.estado}, una factura, B02 +1`);
    ok(f1.procesador_id === 'P15-A' && f1.autorizacion === 'AU15' && f1.intentos === 1, 'procesador_id, autorizacion e intentos guardados');
    const ev = db.eventosDePago(p1.id);
    ok(JSON.stringify(ev.map((e) => e.tipo)) === '["cobro-enviado","respuesta"]', `eventos: ${ev.map((e) => e.tipo)}`);
    ok(!JSON.stringify(ev).includes('CT__'), 'los eventos no llevan token');
    ok(compras() === 1 && llamadas[0].cuerpo.TrxToken === t1.token, 'el cobro usó el token de la tarjeta enlazada');

    // resolver dos veces
    b = b02();
    const rr = pagos.resolver(db.pagoPorId(p1.id), { resultado: 'aprobado', procesadorId: 'P15-A' });
    ok(rr.estado === 'aprobado' && facturasDe(p1.id) === 1 && b02() === b, 'resolver aprobado dos veces: una factura y B02 igual');

    // cobrar con el objeto viejo en memoria (tarjeta enlazada después)
    doble([aprobada('P15-V')]);
    r = await pagos.cobrar(viejo);
    ok(r.estado === 'aprobado' && compras() === 1, 'cobrar con el objeto viejo: relee la fila y cobra');

    // Rechazo
    const t2 = tarjeta(org);
    const p2 = pagoNuevo(org, { metodo: t2 });
    doble([{ estado: 200, cuerpo: { ResponseCode: '51', Status: 'Rejected' } }]);
    b = b02();
    r = await pagos.cobrar(p2);
    const f2 = db.pagoPorId(p2.id);
    ok(r.estado === 'rechazado' && f2.estado === 'rechazado' && f2.codigo_respuesta === '51' && f2.motivo === cardnet.mensajeDeRechazo('51'),
      `rechazo 51: ${f2.estado}, ${f2.codigo_respuesta}`);
    ok(b02() === b && facturasDe(p2.id) === 0, 'el rechazo no consume NCF ni emite factura');
    ok(d.prepare('SELECT fallos_seguidos AS f FROM metodos_pago WHERE id = ?').get(t2.id).f === 1, 'fallos_seguidos de la tarjeta = 1');
    const p2b = pagoNuevo(org, { metodo: t2 });
    doble([aprobada('P15-B')]);
    await pagos.cobrar(p2b);
    ok(d.prepare('SELECT fallos_seguidos AS f FROM metodos_pago WHERE id = ?').get(t2.id).f === 0, 'una aprobación posterior lo pone a 0');

    // Borrador que sigue borrador tras un rechazo
    const borr = db.crearBorrador({ idOrg: org, idPlan: 'estandar', dias: 30 });
    const INT_PUB = { tipo: 'publicacion', idPlan: 'estandar', idAnuncio: borr, dias: 30, concepto: 'Publicación', cliente: CLIENTE, correoCliente: CLIENTE.correo };
    const t3 = tarjeta(org);
    const pPub = pagoNuevo(org, { intencion: INT_PUB, metodo: t3 });
    doble([{ estado: 200, cuerpo: { ResponseCode: '51' } }]);
    await pagos.cobrar(pPub);
    ok(d.prepare('SELECT estado FROM anuncios WHERE id = ?').get(borr).estado === 'borrador', 'rechazado: el borrador sigue siendo borrador');
    const pPub2 = pagoNuevo(org, { intencion: INT_PUB, metodo: t3 });
    doble([aprobada('P15-PUB')]);
    r = await pagos.cobrar(pPub2);
    ok(r.estado === 'aprobado' && d.prepare('SELECT estado FROM anuncios WHERE id = ?').get(borr).estado === 'activo', 'aprobado: el anuncio queda activo');

    // Estado 0: pendiente con un intento
    const p0 = pagoNuevo(org, { metodo: t3 });
    doble([{ estado: 0, cuerpo: null, fallo: 'ECONNRESET' }]);
    b = b02();
    r = await pagos.cobrar(p0);
    ok(r.estado === 'pendiente' && db.pagoPorId(p0.id).intentos === 1 && tiposDeEventos(p0.id).filter((t) => t === 'cobro-enviado').length === 1 && b02() === b,
      'estado 0: pendiente, intentos = 1, un cobro-enviado');

    // Redirección
    const pR = pagoNuevo(org, { metodo: t3 });
    doble([{ estado: 200, cuerpo: { CommerceAction: { ActionType: 1, Url: 'https://labservicios.cardnet.com.do/3ds' } } }]);
    r = await pagos.cobrar(pR);
    ok(r.estado === 'pendiente' && db.pagoPorId(pR.id).estado === 'pendiente' && /^https:\/\/labservicios/.test(r.redireccion || ''), 'redirección: pendiente y el retorno lleva la URL');

    // Guarda de la 05.4: primer intento, sin llamar a CardNet
    const sVenc = susc(org, { fin: enDias(-1) });
    const INT_AMP = (idSusc) => ({ tipo: 'ampliacion', idSusc, anadidos: 1, concepto: 'Ampliación', cliente: CLIENTE, correoCliente: CLIENTE.correo });
    const pV = pagoNuevo(org, { idSusc: sVenc, intencion: INT_AMP(sVenc), metodo: t3 });
    doble([aprobada('P15-NO')]);
    b = b02();
    const incl = d.prepare('SELECT anuncios_incluidos AS a FROM suscripciones WHERE id = ?').get(sVenc).a;
    r = await pagos.cobrar(pV);
    const fV = db.pagoPorId(pV.id);
    ok(r.estado === 'rechazado' && fV.estado === 'rechazado' && fV.codigo_respuesta === 'membresia-vencida' && llamadas.length === 0,
      `ampliación de una membresía vencida: rechazado sin llamar (${fV.codigo_respuesta})`);
    ok(d.prepare('SELECT anuncios_incluidos AS a FROM suscripciones WHERE id = ?').get(sVenc).a === incl && facturasDe(pV.id) === 0 && b02() === b, 'no suma capacidad, sin factura, B02 igual');
    ok(!/cupo/i.test(fV.motivo) && /No se le cobró nada/.test(fV.motivo), `el motivo no dice «cupo»: ${fV.motivo}`);

    // La membresía se vence ENTRE la guarda y la aprobación
    const sMitad = susc(org, { fin: enDias(-1) });
    const pM = pagoNuevo(org, { idSusc: sMitad, intencion: INT_AMP(sMitad), metodo: t3 });
    const guardaReal = db.intencionAplicable;
    db.intencionAplicable = () => ({ ok: true });
    doble([aprobada('P15-M')]);
    b = b02();
    try { r = await pagos.cobrar(pM); } finally { db.intencionAplicable = guardaReal; }
    ok(r.estado === 'pendiente' && r.sinAplicar === true && db.pagoPorId(pM.id).estado === 'pendiente', 'aprobado sin aplicar: pendiente con sinAplicar');
    ok(tiposDeEventos(pM.id).filter((t) => t === 'aprobado-sin-aplicar').length === 1 && b02() === b && facturasDe(pM.id) === 0, 'un evento aprobado-sin-aplicar, sin factura y B02 igual');
    ok(/no se emitió comprobante/.test(r.motivo) && /no pudimos activar/.test(r.motivo) && !/\d{3}[- ]?\d{3}[- ]?\d{4}/.test(r.motivo), 'el texto dice que entró, que no se activó nada, sin comprobante y sin teléfono');
    const otraVez = pagos.resolver(db.pagoPorId(pM.id), { resultado: 'aprobado', procesadorId: 'P15-M' });
    ok(otraVez.sinAplicar === true && tiposDeEventos(pM.id).filter((t) => t === 'aprobado-sin-aplicar').length === 1, 'resolver otra vez: no añade otro evento');

    // Intento previo + membresía vencida: no se aplica la guarda, se reenvía y NUNCA se rechaza
    const sPrev = susc(org, { fin: enDias(-1) });
    const pP = pagoNuevo(org, { idSusc: sPrev, intencion: INT_AMP(sPrev), metodo: t3 });
    db.anotarEventoPago({ pagoId: pP.id, procesador: 'cardnet', origen: 'cobro', tipo: 'cobro-enviado' });
    doble([aprobada('P15-PREV')]);
    b = b02();
    r = await pagos.cobrar(pP);
    ok(compras() === 1 && llamadas[0].cuerpo.UniqueID === pP.referencia, 'con intento previo: se reenvía con el mismo UniqueID');
    ok(r.sinAplicar === true && db.pagoPorId(pP.id).estado === 'pendiente' && tiposDeEventos(pP.id).filter((t) => t === 'aprobado-sin-aplicar').length === 1
      && b02() === b && facturasDe(pP.id) === 0, 'con intento previo: aprobado-sin-aplicar y el pago nunca pasa a rechazado');

    // Aviso tardío sobre un pago ya rechazado
    const pT = pagoNuevo(org, { metodo: t3 });
    db.rechazarPago(pT.id, { codigo: 'reemplazado', motivo: 'Reemplazado' });
    b = b02();
    let tarde = pagos.resolver(db.pagoPorId(pT.id), { resultado: 'aprobado', procesadorId: 'P15-T', origen: 'notificacion' });
    ok(tarde.sinAplicar === true && tiposDeEventos(pT.id).filter((t) => t === 'aprobado-sin-aplicar').length === 1 && facturasDe(pT.id) === 0 && b02() === b,
      'aviso tardío sobre un rechazado: un evento aprobado-sin-aplicar, sin factura');
    tarde = pagos.resolver(db.pagoPorId(pT.id), { resultado: 'aprobado', procesadorId: 'P15-T', origen: 'notificacion' });
    ok(tiposDeEventos(pT.id).filter((t) => t === 'aprobado-sin-aplicar').length === 1 && db.pagoPorId(pT.id).estado === 'rechazado', 'repetido: no añade otro y el pago sigue rechazado');

    // Pago que ya no está pendiente al llegar al procesador
    const pX = pagoNuevo(org, { metodo: t3 });
    db.rechazarPago(pX.id, { codigo: 'abandonado' });
    doble([aprobada('P15-X')]);
    r = await pagos.PROCESADORES.cardnet(pX);
    ok(r.resultado === 'pendiente' && llamadas.length === 0 && !tiposDeEventos(pX.id).includes('cobro-enviado'), 'pago ya no pendiente: ninguna llamada ni cobro-enviado');

    // Consentimiento de renovación al aprobarse
    const REN = { texto: 'Texto de la 05.3', aceptada: '2026-10-01T10:00:00.000Z' };
    const t4 = tarjeta(org);
    const pC = pagoNuevo(org, { intencion: { ...COMPRA, renovacionAutomatica: REN }, metodo: t4 });
    doble([aprobada('P15-C')]);
    r = await pagos.cobrar(pC);
    const sC = d.prepare('SELECT * FROM suscripciones WHERE id = ?').get(r.membresia.id);
    ok(sC.renovacion_automatica === 1 && sC.renovacion_texto === REN.texto && sC.renovacion_aceptada === REN.aceptada && sC.metodo_pago_id === t4.id,
      'compra con tarjeta y casilla: consentimiento, texto, fecha y tarjeta');
    ok(sC.proximo_cargo && sC.proximo_cargo.slice(0, 16) === new Date(new Date(sC.fin).getTime() - 3 * DIA).toISOString().slice(0, 16), 'proximo_cargo = fin − 3 días');
    const pTr = pagoNuevo(org, { intencion: { ...COMPRA, renovacionAutomatica: REN }, metodo: t4, procesador: 'transferencia' });
    const rt = pagos.confirmarPago(pTr.id);
    ok(d.prepare('SELECT renovacion_automatica AS r FROM suscripciones WHERE id = ?').get(rt.membresia.id).r === 0, 'la misma compra por transferencia: sin renovación automática');
    const pSin = pagoNuevo(org, { metodo: t4 });
    doble([aprobada('P15-S')]);
    r = await pagos.cobrar(pSin);
    ok(d.prepare('SELECT renovacion_automatica AS r FROM suscripciones WHERE id = ?').get(r.membresia.id).r === 0, 'con tarjeta pero sin casilla: nada cambia');

    // Renovación aprobada: reprograma
    const sRen = susc(org, { fin: enDias(10) });
    db.activarRenovacionConTarjeta({ idSusc: sRen, idOrg: org, idMetodo: t4.id, texto: 'T' });
    d.prepare('UPDATE suscripciones SET renovacion_intentos = 2 WHERE id = ?').run(sRen);
    const INT_REN = { tipo: 'renovacion', idSusc: sRen, dias: 30, idPlan: 'estandar', cupo: 1, concepto: 'Renovación', cliente: CLIENTE, correoCliente: CLIENTE.correo };
    const pRen = pagoNuevo(org, { idSusc: sRen, intencion: INT_REN, metodo: t4 });
    doble([aprobada('P15-R')]);
    r = await pagos.cobrar(pRen);
    const sR = d.prepare('SELECT * FROM suscripciones WHERE id = ?').get(sRen);
    ok(r.estado === 'aprobado' && sR.renovacion_intentos === 0 && sR.proximo_cargo.slice(0, 16) === new Date(new Date(sR.fin).getTime() - 3 * DIA).toISOString().slice(0, 16),
      'renovación aprobada: intentos a 0 y próximo intento = nuevo fin − 3 días');

    // Texto genérico de rechazo
    const gen = cardnet.mensajeDeRechazo('9999');
    ok(!/cupo/i.test(gen) && /no se activó nada/.test(gen) && /comprobante/.test(gen), `texto genérico: ${gen}`);
    apagar();
  }

  console.log('\n16. pagos.js: preparar la captura, registrar la tarjeta, confirmar y liberar');
  {
    const db = require('./db');
    const pagos = require('./pagos');
    const precios = require('../assets/precios.js');
    db.secuenciasNcf();
    db.cargarSecuencia({ tipo: 'B02', nombre: 'Consumidor final', desde: 1, hasta: 500, vence: '2027-12-31', usaSitio: true });
    const d = db.abrir();
    const SELLO = Date.now().toString(36);
    let n = 0;
    const cuenta = (etiqueta) => {
      const { idUsuario } = db.crearCuenta({
        correo: `${etiqueta}-${SELLO}@prueba.invalid`, clave: 'UnaClaveLargaYSegura9', nombre: `Prueba ${etiqueta}`,
        telefono: '8095550000', tipo: 'particular',
      });
      return db.organizacionDe(idUsuario).id;
    };
    const CLIENTE = { razonSocial: 'Cliente de prueba', correo: 'cliente@prueba.invalid' };
    const COMPRA = { tipo: 'compra', idPlan: 'estandar', cupo: 1, dias: 30, concepto: 'Estándar · 1 cupo', cliente: CLIENTE, correoCliente: CLIENTE.correo };
    const pagoNuevo = (idOrg, procesador = 'cardnet') => db.registrarCobro({
      idOrg, cobro: { ...precios.desglose(1800), referencia: `R16-${SELLO}-${++n}`, procesador }, intencion: COMPRA });
    const perfilCN = (id, token, activo = true, ult = '1111') => ({
      PaymentProfileId: id, Token: token, Brand: 'VISA', Last4: ult, Expiration: '12/30', Enabled: activo });
    const clienteCN = (perfiles) => ({
      estado: 200, cuerpo: { CustomerId: 'C-16', CaptureURL: 'https://labservicios.cardnet.com.do/captura/x', UniqueID: 'S16', PaymentProfiles: perfiles } });
    const conteo = (fragmento, metodo) => llamadas.filter((l) => l.url.includes(fragmento) && (!metodo || l.metodo === metodo)).length;

    // prepararCaptura
    const org = cuenta('a16');
    const p0 = pagoNuevo(org);
    apagar();
    let e = null;
    try { await pagos.prepararCaptura(p0, { correo: 'x@prueba.invalid', nombre: 'X' }); } catch (x) { e = x; }
    ok(e && e.codigo === 409 && e.message === 'El pago con tarjeta no está disponible.', 'apagado: prepararCaptura lanza 409');
    encender('lab');
    doble((op) => (op.metodo === 'POST' ? { estado: 200, cuerpo: { CustomerId: 'C-16' } } : clienteCN([])));
    const c1 = await pagos.prepararCaptura(p0, { correo: 'x@prueba.invalid', nombre: 'X' });
    const c2 = await pagos.prepararCaptura(p0, { correo: 'x@prueba.invalid', nombre: 'X' });
    ok(conteo('v1/api/customer', 'POST') === 1, `el Customer se crea una sola vez (${conteo('v1/api/customer', 'POST')} POST)`);
    ok(db.clienteProcesador(org, 'cardnet') === 'C-16', 'el id del cliente queda guardado');
    ok(c1.urlCaptura === c2.urlCaptura && c1.urlCaptura.includes('key=llave-publica-de-prueba') && c1.urlCaptura.includes('session_id=S16'), 'la URL lleva la llave pública y la sesión');
    ok(c1.origen === 'https://labservicios.cardnet.com.do' && !JSON.stringify(c1).includes('llave-privada'), 'devuelve el origen y nunca la llave privada');
    const orgCaida = cuenta('caida16');
    const pCaida = pagoNuevo(orgCaida);
    doble([{ estado: 0, cuerpo: null, fallo: 'ECONNRESET' }]);
    e = null;
    try { await pagos.prepararCaptura(pCaida, { correo: 'x@prueba.invalid', nombre: 'X' }); } catch (x) { e = x; }
    ok(e && e.codigo === 502 && e.message === 'No pudimos abrir el formulario de la tarjeta. No se le cobró nada.', 'CardNet caído: 502 con el texto que dice que no se cobró');

    // registrarTarjeta
    const orgSin = cuenta('sin16');
    e = null;
    try { await pagos.registrarTarjeta(pagoNuevo(orgSin)); } catch (x) { e = x; }
    ok(e && e.codigo === 409 && e.message === 'No encontramos la tarjeta. Vuelva a ingresarla.', 'sin cliente en CardNet: 409');
    db.guardarClienteProcesador(orgSin, 'cardnet', 'C-16');
    doble([clienteCN([])]);
    e = null;
    try { await pagos.registrarTarjeta(pagoNuevo(orgSin)); } catch (x) { e = x; }
    ok(e && e.codigo === 409, 'sin perfiles: 409 «No encontramos la tarjeta»');

    const pa = pagoNuevo(org);
    doble([clienteCN([perfilCN(161, 'CT__16uno')])]);
    const ra = await pagos.registrarTarjeta(pa);
    ok(ra.metodo && ra.activacion === false && ra.metodo.ultimos4 === '1111' && !('token' in ra.metodo), 'registrarTarjeta devuelve la tarjeta sin token, activa');
    ok(db.pagoPorId(pa.id).metodo_pago_id === ra.metodo.id, 'la tarjeta queda enlazada al pago');
    const pb = pagoNuevo(org);
    doble([clienteCN([perfilCN(161, 'CT__16uno'), perfilCN(162, 'CT__16dos', true, '2222')])]);
    const rb = await pagos.registrarTarjeta(pb);
    ok(rb.metodo.ultimos4 === '2222' && rb.metodo.id !== ra.metodo.id, 'elige el perfil que aún no estaba guardado');
    const pc = pagoNuevo(org);
    doble([clienteCN([perfilCN(161, 'CT__16uno'), perfilCN(162, 'CT__16dos', true, '2222')])]);
    const rc = await pagos.registrarTarjeta(pc);
    ok(rc.metodo.ultimos4 === '2222' && d.prepare('SELECT COUNT(*) AS n FROM metodos_pago WHERE organizacion_id = ?').get(org).n === 2, 'con todos guardados usa el más reciente y no duplica');
    const orgIn = cuenta('inact16');
    db.guardarClienteProcesador(orgIn, 'cardnet', 'C-16');
    doble([clienteCN([perfilCN(163, 'CT__16tres', false)])]);
    const ri = await pagos.registrarTarjeta(pagoNuevo(orgIn));
    ok(ri.activacion === true && ri.metodo.activo === false, 'un perfil sin activar pide activación');

    // confirmarConTarjeta
    const purchase = { estado: 200, cuerpo: { Status: 'Approved', ResponseCode: '00', PurchaseId: 'P16-1', AuthorizationCode: 'AU16' } };
    const respuestas = (op) => (op.metodo === 'GET' ? clienteCN([perfilCN(161, 'CT__16uno'), perfilCN(162, 'CT__16dos', true, '2222')]) : purchase);
    const pd = pagoNuevo(org);
    e = null;
    try { await pagos.confirmarConTarjeta(pd.id, cuenta('ajena16'), {}); } catch (x) { e = x; }
    ok(e && e.codigo === 404, 'un pago de otra organización: 404');
    const pTr = pagoNuevo(org, 'transferencia');
    e = null;
    try { await pagos.confirmarConTarjeta(pTr.id, org, {}); } catch (x) { e = x; }
    ok(e && e.codigo === 404, 'un pago que no es cardnet: 404');

    // token inventado por quien llama: se ignora
    doble(respuestas);
    const r1 = await pagos.confirmarConTarjeta(pd.id, org, { token: 'CT__inventado', TrxToken: 'CT__inventado' });
    const compra = llamadas.find((l) => l.url.includes('purchase'));
    ok(r1.estado === 'aprobado' && compra && compra.cuerpo.TrxToken === 'CT__16dos' && !JSON.stringify(llamadas).includes('inventado'),
      `el cobro usa el token del perfil leído de CardNet, no el del llamador (${compra && compra.cuerpo.TrxToken})`);

    // ya no pendiente: devuelve su estado sin llamar
    doble(respuestas);
    const r2 = await pagos.confirmarConTarjeta(pd.id, org, {});
    ok(r2.estado === 'aprobado' && llamadas.length === 0, 'un pago ya resuelto devuelve su estado sin llamar a CardNet');

    // tarjeta guardada elegida por id
    const pe = pagoNuevo(org);
    const guardada = db.metodosPagoDe(org)[0];
    doble(respuestas);
    const r3 = await pagos.confirmarConTarjeta(pe.id, org, { metodoPago: guardada.id });
    ok(r3.estado === 'aprobado' && conteo('customer') === 0 && conteo('purchase') === 1, 'con una tarjeta guardada no toca el Customer');
    const pf = pagoNuevo(org);
    e = null;
    try { await pagos.confirmarConTarjeta(pf.id, org, { metodoPago: db.metodosPagoDe(orgIn)[0].id }); } catch (x) { e = x; }
    ok(e && e.codigo === 400, 'la tarjeta de otra organización: 400');
    d.prepare('UPDATE metodos_pago SET activo = 0 WHERE id = ?').run(guardada.id);
    e = null;
    try { await pagos.confirmarConTarjeta(pf.id, org, { metodoPago: guardada.id }); } catch (x) { e = x; }
    ok(e && e.codigo === 400, 'una tarjeta inactiva: 400');
    d.prepare('UPDATE metodos_pago SET activo = 1 WHERE id = ?').run(guardada.id);

    // tarjeta nueva sin activar
    const pg = pagoNuevo(orgIn);
    doble((op) => (op.metodo === 'GET' ? clienteCN([perfilCN(163, 'CT__16tres', false)]) : purchase));
    const r4 = await pagos.confirmarConTarjeta(pg.id, orgIn, {});
    ok(r4.estado === 'activacion' && r4.metodoPago && conteo('purchase') === 0, 'tarjeta sin activar: estado activacion y no se cobra');

    // doble confirmación simultánea
    const ph = pagoNuevo(org);
    doble(respuestas);
    const dos = await Promise.allSettled([pagos.confirmarConTarjeta(ph.id, org, {}), pagos.confirmarConTarjeta(ph.id, org, {})]);
    const rechazadas = dos.filter((x) => x.status === 'rejected');
    ok(rechazadas.length === 1 && rechazadas[0].reason.codigo === 409 && rechazadas[0].reason.message === 'Ese pago ya se está procesando.', 'la segunda llamada simultánea lanza 409');
    ok(conteo('purchase') === 1 && d.prepare("SELECT COUNT(*) AS n FROM facturas WHERE pago_id = ?").get(ph.id).n === 1, 'el doble ve UNA llamada a purchase y hay una factura');
    doble(respuestas);
    const otraVez = await pagos.confirmarConTarjeta(ph.id, org, {});
    ok(otraVez.estado === 'aprobado', 'liberado el cerrojo, una tercera llamada responde con el estado');

    // activarTarjeta
    const tj = db.metodosPagoDe(orgIn)[0];
    doble([]);
    for (const malo of ['', '   ', '1234567890123', null, 12345]) {
      e = null;
      try { await pagos.activarTarjeta(tj.id, orgIn, malo); } catch (x) { e = x; }
      ok(e && e.codigo === 400, `código «${malo}»: 400`);
    }
    ok(llamadas.length === 0, 'un código inválido no llama a CardNet');
    doble([{ estado: 400, cuerpo: { Errors: [{ Code: 'X', Message: 'mal' }] } }]);
    e = null;
    try { await pagos.activarTarjeta(tj.id, orgIn, '000111'); } catch (x) { e = x; }
    ok(e && e.codigo === 409 && db.metodosPagoDe(orgIn)[0].activo === false, 'si CardNet no confirma, la tarjeta sigue inactiva');
    doble([{ estado: 200, cuerpo: {} }]);
    const act = await pagos.activarTarjeta(tj.id, orgIn, '000111');
    ok(act.metodo && act.metodo.activo === true && db.metodosPagoDe(orgIn)[0].activo === true, 'con la confirmación de CardNet queda activa');
    ok(llamadas[0].url.endsWith('/activate') && llamadas[0].cuerpo.Token === 'CT__16tres', 'activó el perfil de la tarjeta guardada');
    e = null;
    try { await pagos.activarTarjeta(tj.id, org, '000111'); } catch (x) { e = x; }
    ok(e && e.codigo === 404, 'la tarjeta de otra organización: 404');

    // pendienteSinCobro / anularPendienteSinCobro
    const pi = pagoNuevo(org);
    ok(pagos.pendienteSinCobro(db.pagoPorId(pi.id)) === true, 'pendiente cardnet sin intento: pendienteSinCobro');
    ok(pagos.pendienteSinCobro(db.pagoPorId(pTr.id)) === false, 'una transferencia no lo es');
    ok(pagos.pendienteSinCobro(db.pagoPorId(pd.id)) === false, 'un aprobado no lo es');
    const an = pagos.anularPendienteSinCobro(pi.id);
    const fi = db.pagoPorId(pi.id);
    ok(an.cambiado === true && fi.estado === 'rechazado' && fi.codigo_respuesta === 'reemplazado', 'anularPendienteSinCobro lo deja rechazado con codigo reemplazado');
    const pj = pagoNuevo(org);
    db.anotarEventoPago({ pagoId: pj.id, procesador: 'cardnet', origen: 'cobro', tipo: 'cobro-enviado' });
    ok(pagos.pendienteSinCobro(db.pagoPorId(pj.id)) === false, 'con cobro-enviado ya no es pendienteSinCobro');
    e = null;
    try { pagos.anularPendienteSinCobro(pj.id); } catch (x) { e = x; }
    ok(e && e.codigo === 409 && db.pagoPorId(pj.id).estado === 'pendiente', 'con intento de cobro: 409 y sigue pendiente');
    apagar();
  }

  apagar();
  ok(intentosDeRed === 0, `ninguna llamada llegó al transporte sin doble (${intentosDeRed})`);
  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
