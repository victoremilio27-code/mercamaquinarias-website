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

const { DatabaseSync } = require('node:sqlite');
const { spawnSync } = require('child_process');
const cardnet = require('./cardnet');
const db = require('./db');

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

function conexion(ruta = process.env.MERCA_DB) {
  const d = new DatabaseSync(ruta);
  d.exec('PRAGMA busy_timeout = 5000');
  return d;
}
function consulta(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).get(...args); } finally { d.close(); }
}
function todas(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).all(...args); } finally { d.close(); }
}
function ejecuta(sql, ...args) {
  const d = conexion();
  try { return d.prepare(sql).run(...args); } finally { d.close(); }
}

/* Abre una base con db.js en OTRO proceso: así se prueba el arranque
   de verdad (esquema y migraciones) sobre un archivo distinto del de
   la prueba, sin tocar el módulo ya cargado. */
function abrirEnOtroProceso(ruta) {
  const r = spawnSync(process.execPath, ['-e', "require('./tools/db').abrir()"], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, MERCA_DB: ruta },
    encoding: 'utf8',
  });
  return { codigo: r.status, error: (r.stderr || '').trim() };
}

const columnas = (d, tabla) => d.prepare(`PRAGMA table_info(${tabla})`).all()
  .map((c) => `${c.name}:${c.type}:${c.notnull}:${c.dflt_value}`);
const objetos = (d) => d.prepare(`SELECT type, name FROM sqlite_master
  WHERE type IN ('table', 'index', 'trigger') AND name NOT LIKE 'sqlite_%' ORDER BY type, name`).all()
  .map((o) => `${o.type}:${o.name}`);

function prepararOrganizacion(idOrg, nombre) {
  const t = new Date().toISOString();
  ejecuta(`INSERT OR IGNORE INTO organizaciones (id, tipo, nombre, creada, actualizada)
           VALUES (?, 'particular', ?, ?, ?)`, idOrg, nombre, t, t);
}

const SELLO = Date.now().toString(36).toUpperCase();
let contadorRef = 0;
const referencia = () => `TE-2026-${SELLO.slice(-3)}${String(++contadorRef).padStart(3, '0')}`;

const ID_ORG = 'org-cardnet';
const ID_ORG_OTRA = 'org-cardnet-otra';
const CLIENTE = { razonSocial: 'Cliente de tarjeta', correo: 'tarjeta@prueba.invalid' };

const intencionCompra = (cupo = 1, dias = 30) => ({
  tipo: 'compra', idPlan: 'destacado', cupo, dias,
  concepto: `Destacado · ${cupo} cupo(s) · ${dias} días`,
  cliente: CLIENTE, correoCliente: CLIENTE.correo,
});

const cobroDe = (subtotal, procesador = 'cardnet') => {
  const itbis = Math.round(subtotal * 0.18);
  return { subtotal, itbis, total: subtotal + itbis, referencia: referencia(), procesador };
};

const pendiente = ({ idOrg = ID_ORG, procesador = 'cardnet', subtotal = 3500, cupo = 1 } = {}) =>
  db.registrarCobro({ idOrg, cobro: cobroDe(subtotal, procesador), intencion: intencionCompra(cupo, 30) });

/* Abrir la base aplica el esquema y las migraciones. */
db.abrir();
prepararOrganizacion(ID_ORG, 'Cliente de tarjeta');
prepararOrganizacion(ID_ORG_OTRA, 'Otra empresa');

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

  /* ── 06-02: dónde vive lo que devuelve CardNet ─────────── */

  console.log('\n13. La migración 2026-10-cardnet sobre una base vieja y una nueva');
  {
    const NUEVA = path.join(BANCO, 'nueva.db');
    const VIEJA = path.join(BANCO, 'vieja.db');
    const a = abrirEnOtroProceso(NUEVA);
    ok(a.codigo === 0, `una base nueva arranca${a.error ? `: ${a.error}` : ''}`);
    const b = abrirEnOtroProceso(VIEJA);
    ok(b.codigo === 0, 'la base que se va a envejecer arranca');

    /* Se envejece a mano hasta como estaba antes de la fase: sin las
       tablas, columnas, índices ni la anotación de la migración. Con
       filas antiguas, incluidas dos de demostración con la misma
       referencia, que en producción podrían existir. */
    const v = conexion(VIEJA);
    try {
      v.exec(`DROP INDEX IF EXISTS ux_pagos_cardnet_referencia;
              DROP INDEX IF EXISTS ix_pagos_procesador_id;
              DROP INDEX IF EXISTS ux_metodos_perfil;
              DROP TABLE IF EXISTS pagos_eventos;
              DROP TABLE IF EXISTS clientes_procesador;
              DELETE FROM migraciones WHERE id = '2026-10-cardnet';`);
      const quitar = {
        pagos: ['procesador_id', 'autorizacion', 'codigo_respuesta', 'motivo', 'intentos'],
        metodos_pago: ['procesador_cliente_id', 'procesador_perfil_id', 'activo', 'fallos_seguidos', 'borrado', 'aviso_vencimiento'],
        suscripciones: ['metodo_pago_id', 'renovacion_automatica', 'renovacion_aceptada', 'renovacion_intentos',
          'renovacion_proxima', 'renovacion_avisada'],
      };
      for (const [tabla, cols] of Object.entries(quitar)) {
        for (const c of cols) {
          try { v.exec(`ALTER TABLE ${tabla} DROP COLUMN ${c}`); } catch (_) { /* no existía aún */ }
        }
      }
      const t = new Date().toISOString();
      v.prepare(`INSERT INTO organizaciones (id, tipo, nombre, creada, actualizada) VALUES ('org-vieja', 'particular', 'Vieja', ?, ?)`).run(t, t);
      v.prepare(`INSERT INTO suscripciones (id, organizacion_id, plan_id, modalidad, estado, precio_pactado, inicio, creada)
                 VALUES ('susc-vieja', 'org-vieja', 'destacado', 'vigencia', 'activa', 3500, ?, ?)`).run(t, t);
      v.prepare(`INSERT INTO metodos_pago (id, organizacion_id, procesador, token, creado)
                 VALUES ('mp-viejo', 'org-vieja', 'demo', 'tok-viejo', ?)`).run(t);
      for (const idp of ['pago-viejo-1', 'pago-viejo-2']) {
        v.prepare(`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia, procesador, creado)
                   VALUES (?, 'org-vieja', 3500, 630, 4130, 'aprobado', 'TE-2026-REPETI', 'demo', ?)`).run(idp, t);
      }
    } finally { v.close(); }

    const c = abrirEnOtroProceso(VIEJA);
    ok(c.codigo === 0, `la base vieja arranca y migra${c.error ? `: ${c.error}` : ''}`);
    const n = conexion(NUEVA);
    const m = conexion(VIEJA);
    try {
      for (const tabla of ['pagos', 'metodos_pago', 'suscripciones', 'clientes_procesador', 'pagos_eventos']) {
        const cn = columnas(n, tabla);
        const cm = columnas(m, tabla);
        ok(cn.length > 0 && JSON.stringify(cn) === JSON.stringify(cm),
          `${tabla}: mismas columnas en la nueva y en la migrada (${cn.length})`);
      }
      ok(JSON.stringify(objetos(n)) === JSON.stringify(objetos(m)), 'mismas tablas, índices y disparadores');
      const nombres = objetos(n);
      for (const o of ['index:ux_pagos_cardnet_referencia', 'index:ix_pagos_procesador_id', 'index:ux_metodos_perfil',
        'index:ix_pagos_eventos_pago', 'trigger:tr_pagos_eventos_sin_cambios', 'trigger:tr_pagos_eventos_sin_borrado']) {
        ok(nombres.includes(o), `existe ${o}`);
      }
      const viejos = m.prepare("SELECT COUNT(*) AS n FROM pagos WHERE referencia = 'TE-2026-REPETI'").get().n;
      ok(viejos === 2, 'los dos pagos demo antiguos con la misma referencia siguen ahí');
      const pv = m.prepare("SELECT intentos FROM pagos WHERE id = 'pago-viejo-1'").get();
      const mv = m.prepare("SELECT activo, fallos_seguidos, borrado FROM metodos_pago WHERE id = 'mp-viejo'").get();
      const sv = m.prepare("SELECT renovacion_automatica, renovacion_intentos, metodo_pago_id FROM suscripciones WHERE id = 'susc-vieja'").get();
      ok(pv.intentos === 0 && mv.activo === 1 && mv.fallos_seguidos === 0 && mv.borrado === null
        && sv.renovacion_automatica === 0 && sv.renovacion_intentos === 0 && sv.metodo_pago_id === null,
      'las filas antiguas reciben los valores por defecto (0, 1, NULL)');
      const ultima = m.prepare('SELECT id FROM migraciones ORDER BY rowid DESC LIMIT 1').get();
      ok(ultima && ultima.id === '2026-10-cardnet', `la migración quedó anotada (${ultima && ultima.id})`);
    } finally { n.close(); m.close(); }

    const antes = consulta.call(null, 'SELECT 1'); // la base de la prueba sigue viva
    const d = abrirEnOtroProceso(VIEJA);
    const m2 = conexion(VIEJA);
    try {
      ok(d.codigo === 0 && m2.prepare("SELECT COUNT(*) AS n FROM migraciones WHERE id = '2026-10-cardnet'").get().n === 1,
        'abrirla otra vez no reaplica la migración ni falla');
    } finally { m2.close(); }
    ok(!!antes, 'la base de la prueba no se tocó');

    const fuente = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
    const ini = fuente.indexOf('const MIGRACIONES = [');
    const fin = fuente.indexOf('\n];', ini);
    const nombresMig = [...fuente.slice(ini, fin).matchAll(/^ {2}\['([\w-]+)', \[/gm)].map((x) => x[1]);
    ok(nombresMig[nombresMig.length - 1] === '2026-10-cardnet', `2026-10-cardnet es la última de MIGRACIONES (${nombresMig.slice(-2).join(' → ')})`);
    ok(nombresMig.filter((x) => x === '2026-10-cardnet').length === 1, 'y aparece una sola vez');
  }

  console.log('\n14. Referencia única en cardnet y eventos de solo añadir');
  {
    const t = new Date().toISOString();
    const ins = (idp, ref, proc) => ejecuta(`INSERT INTO pagos (id, organizacion_id, subtotal, itbis, total, estado, referencia, procesador, creado)
      VALUES (?, ?, 100, 18, 118, 'pendiente', ?, ?, ?)`, idp, ID_ORG, ref, proc, t);
    ins('dup-c1', 'TE-2026-DUPLIC', 'cardnet');
    ok(!!lanza(() => ins('dup-c2', 'TE-2026-DUPLIC', 'cardnet')), 'un segundo pago cardnet con la misma referencia lanza');
    ins('dup-d1', 'TE-2026-DUPDEM', 'demo');
    ok(!lanza(() => ins('dup-d2', 'TE-2026-DUPDEM', 'demo')), 'dos pagos demo con la misma referencia entran');
    ejecuta("DELETE FROM pagos WHERE id IN ('dup-c1', 'dup-d1', 'dup-d2')");

    ejecuta(`INSERT INTO pagos_eventos (pago_id, procesador, origen, tipo, cuerpo, creado)
             VALUES ('x', 'cardnet', 'prueba', 'prueba', '{}', ?)`, t);
    const eu = lanza(() => ejecuta("UPDATE pagos_eventos SET tipo = 'otro' WHERE pago_id = 'x'"));
    const ed = lanza(() => ejecuta("DELETE FROM pagos_eventos WHERE pago_id = 'x'"));
    ok(!!eu && /no se modifican/.test(eu.message), `UPDATE aborta: ${eu && eu.message}`);
    ok(!!ed && /no se borran/.test(ed.message), `DELETE aborta: ${ed && ed.message}`);
    ok(consulta("SELECT COUNT(*) AS n FROM pagos_eventos WHERE pago_id = 'x'").n === 1, 'el evento sigue ahí');

    const cols = todas('PRAGMA table_info(metodos_pago)').map((c) => c.name);
    const PERMITIDAS = ['id', 'organizacion_id', 'procesador', 'token', 'marca', 'ultimos4', 'vence_mes', 'vence_anio',
      'predeterminado', 'creado', 'procesador_cliente_id', 'procesador_perfil_id', 'activo', 'fallos_seguidos', 'borrado',
      'aviso_vencimiento'];
    ok(cols.every((c) => PERMITIDAS.includes(c)), `metodos_pago solo tiene columnas conocidas: ${cols.join(', ')}`);
  }

  apagar();
  ok(intentosDeRed === 0, `ninguna llamada llegó al transporte sin doble (${intentosDeRed})`);
  console.log(`\n${comprobaciones} comprobaciones, ${fallos} fallos`);
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
