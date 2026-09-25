/**
 * probar-contactos.js — que ningún teléfono sin verificar salga en un anuncio.
 *
 *   node tools/probar-contactos.js
 *
 * POR QUÉ EXISTE
 *
 * La ficha pintaba cualquier número que alguien escribiera al publicar.
 * Un estafador copia las fotos de un anuncio bueno, pone su teléfono y
 * el comprador no tiene cómo distinguirlo. La fase 9 (CONF-03) exige que
 * un anuncio solo enseñe teléfonos verificados, por correo hoy y por SMS
 * el día que se paguen los créditos de Brevo.
 *
 * Lo que se comprueba aquí es lo que nadie ve leyendo la ficha: que el
 * filtro está en el SERVIDOR (no basta con que el navegador lo esconda),
 * que un código no sirve para otro número ni otra organización, que el
 * SMS apagado no envía nada y que encenderlo no pide tocar el flujo.
 *
 * Corre contra una base TEMPORAL —`.tmp/prueba-contactos/`— que se
 * borra y se rehace en cada ejecución. No toca la base real.
 */

const fs = require('fs');
const path = require('path');

/* Antes de cargar db.js y correo.js: las rutas se resuelven al importarlos. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-contactos');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
delete process.env.MERCA_SMS;               // el interruptor, apagado como en producción

const db = require('./db.js');
const correo = require('./correo.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) {
    bien++;
    console.log(`  ok  ${que}`);
    return;
  }
  mal++;
  console.log(`  MAL ${que}`);
}

/* ── Siembra ─────────────────────────────────────────────── */
function cuenta(correoCuenta, nombre) {
  const { idUsuario } = db.crearCuenta({
    correo: correoCuenta,
    clave: 'UnaClaveLargaYSegura9',
    nombre,
    telefono: '8095550000',
    tipo: 'particular',
  });
  db.marcarCorreoVerificado(idUsuario);
  return { idUsuario, org: db.organizacionDe(idUsuario) };
}

function anuncio(idOrg, idUsuario, telefonos) {
  const creado = db.crearAnuncio({
    idOrg,
    usuarioId: idUsuario,
    categoria: 'camiones',
    subcategoria: 'cam-volteo',
    marca: 'peterbilt',
    modelo: '567',
    anio: 2019,
    condicion: 'usado',
    usoValor: 120000,
    usoUnidad: 'km',
    descripcion: 'Camion de volteo para la prueba de contactos.',
    provincia: 'santo-domingo',
    precio: 4500000,
    moneda: 'DOP',
    modalidadPrecio: 'fijo',
    vence: db.sumarDias(30),
    fotos: ['/fotos/2026-09/a.jpg', '/fotos/2026-09/b.jpg', '/fotos/2026-09/c.jpg'],
    telefonos,
  });
  return creado.idAnuncio || creado.id || creado;
}

const sembrado = {};
function sembrar() {
  sembrado.a = cuenta('vendedora-a@ejemplo.test', 'Vendedora A');
  sembrado.b = cuenta('vendedor-b@ejemplo.test', 'Vendedor B');
  sembrado.anuncioA = anuncio(sembrado.a.org.id, sembrado.a.idUsuario, [
    { numero: '(809) 555-1234', tipo: 'ambos', nota: 'Ventas' },
    { numero: '829-555-9876', tipo: 'whatsapp', nota: null },
  ]);
  sembrado.anuncioB = anuncio(sembrado.b.org.id, sembrado.b.idUsuario, [
    { numero: '(809) 555-1234', tipo: 'ambos', nota: null },
  ]);
}

/* ── Bloque «La base» ────────────────────────────────────── */
function bloqueBase() {
  const { a, b, anuncioA } = sembrado;
  const idA = a.org.id;

  console.log('\nLa migración va al final');
  const ultima = db.abrir().prepare('SELECT id FROM migraciones ORDER BY rowid DESC LIMIT 1').get();
  comprobar(ultima && ultima.id === '2026-09-contactos-verificados',
    'la última migración aplicada es la de contactos verificados');

  console.log('\nLos números se comparan en dígitos');
  comprobar(db.normalizarNumero('(809) 555-1234') === '8095551234', '«(809) 555-1234» → 8095551234');
  comprobar(db.normalizarNumero('+1 809 555 1234') === '8095551234', '«+1 809 555 1234» → 8095551234');
  comprobar(db.normalizarNumero('555-1234') === null, 'un número de siete dígitos no vale');

  console.log('\nUn anuncio recién publicado no tiene nada verificado');
  let fila = db.anuncio(anuncioA);
  comprobar(fila.telefonos.length === 2 && fila.telefonos.every((t) => t.verificado === false && t.via === null),
    'anuncio() devuelve los dos teléfonos marcados sin verificar');

  console.log('\nPedir y confirmar un código');
  const pedido = db.pedirCodigoContacto({ idOrg: idA, numero: '(809) 555-1234', via: 'correo' });
  comprobar(pedido && /^\d{6}$/.test(pedido.codigo) && pedido.minutos === 15, 'se emite un código de seis dígitos, 15 minutos');
  const guardado = db.abrir().prepare('SELECT codigo_hash FROM contactos_verificados WHERE organizacion_id = ?').get(idA);
  comprobar(guardado && guardado.codigo_hash !== pedido.codigo && !guardado.codigo_hash.includes(pedido.codigo),
    'en la base solo queda el hash, no el código');

  const otroCodigo = pedido.codigo === '000000' ? '111111' : '000000';
  let r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8095551234', codigo: otroCodigo, idUsuario: a.idUsuario });
  comprobar(!r.ok && r.motivo === 'incorrecto' && r.restantes === 4, 'un código equivocado resta un intento');

  r = db.confirmarCodigoContacto({ idOrg: b.org.id, numero: '8095551234', codigo: pedido.codigo, idUsuario: b.idUsuario });
  comprobar(!r.ok, 'el código de A no verifica el mismo número para la organización B');

  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8295559876', codigo: pedido.codigo, idUsuario: a.idUsuario });
  comprobar(!r.ok, 'ni otro número de la misma organización');

  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '809.555.1234', codigo: pedido.codigo, idUsuario: a.idUsuario });
  comprobar(r.ok && r.via === 'correo', 'el código correcto verifica el número, por correo');

  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8095551234', codigo: pedido.codigo, idUsuario: a.idUsuario });
  comprobar(!r.ok, 'y no sirve una segunda vez');

  fila = db.anuncio(anuncioA);
  const [primero, segundo] = fila.telefonos;
  comprobar(primero.verificado === true && primero.via === 'correo', 'anuncio() marca el número verificado y su vía');
  comprobar(segundo.verificado === false, 'y el otro sigue sin verificar');
  comprobar(db.anuncio(sembrado.anuncioB).telefonos[0].verificado === false,
    'el mismo número en el anuncio de B sigue sin verificar');

  const ya = db.pedirCodigoContacto({ idOrg: idA, numero: '8095551234', via: 'correo' });
  comprobar(ya && ya.yaVerificado === true, 'pedir otra vez por correo un número ya verificado no emite código');
  const subir = db.pedirCodigoContacto({ idOrg: idA, numero: '8095551234', via: 'sms' });
  comprobar(subir && /^\d{6}$/.test(subir.codigo), 'pero sí por SMS, para subir de correo a SMS');
  comprobar(db.anuncio(anuncioA).telefonos[0].verificado === true, 'y mientras tanto sigue verificado');

  console.log('\nEl tope de intentos');
  const p2 = db.pedirCodigoContacto({ idOrg: idA, numero: '8295559876', via: 'correo' });
  const malo = p2.codigo === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++) db.confirmarCodigoContacto({ idOrg: idA, numero: '8295559876', codigo: malo });
  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8295559876', codigo: p2.codigo });
  comprobar(!r.ok && r.motivo === 'agotado', 'tras cinco fallos ni el código correcto pasa');

  console.log('\nUn código vencido no sirve');
  const p3 = db.pedirCodigoContacto({ idOrg: idA, numero: '8295559876', via: 'correo' });
  db.abrir().prepare('UPDATE contactos_verificados SET codigo_expira = ? WHERE organizacion_id = ? AND numero = ?')
    .run(new Date(Date.now() - 1000).toISOString(), idA, '8295559876');
  r = db.confirmarCodigoContacto({ idOrg: idA, numero: '8295559876', codigo: p3.codigo });
  comprobar(!r.ok && r.motivo === 'vencido', 'vencido se rechaza');

  console.log('\nEl panel del anunciante');
  const lista = db.contactosDe(idA);
  const n1 = lista.find((c) => c.numero === '8095551234');
  const n2 = lista.find((c) => c.numero === '8295559876');
  comprobar(lista.length === 2 && n1 && n2, 'contactosDe lista los dos números de sus anuncios');
  comprobar(n1.verificado && n1.via === 'correo' && n1.anuncios === 1, 'con estado, vía y en cuántos anuncios va');
  comprobar(lista[0].numero === '8295559876', 'los sin verificar primero');

  console.log('\nLa purga no toca lo verificado');
  db.abrir().prepare('UPDATE contactos_verificados SET codigo_expira = ? WHERE organizacion_id = ? AND numero = ?')
    .run(new Date(Date.now() - 3 * 86400000).toISOString(), idA, '8295559876');
  db.purgar();
  const quedan = db.abrir().prepare('SELECT numero FROM contactos_verificados WHERE organizacion_id = ?').all(idA)
    .map((f) => f.numero);
  comprobar(quedan.length === 1 && quedan[0] === '8095551234', 'borra el pendiente abandonado y conserva el verificado');
}

/* ── Bloque «El SMS» ─────────────────────────────────────── */
function bloqueSms() {
  const bandeja = correo.BANDEJA_SMS;
  const cuantos = () => (fs.existsSync(bandeja) ? fs.readdirSync(bandeja).length : 0);

  console.log('\nCon el interruptor apagado no sale ningún SMS');
  const antes = cuantos();
  comprobar(correo.smsActivo() === false, 'smsActivo() es falso sin MERCA_SMS');
  const r = correo.enviarSms({ numero: '8095551234', texto: 'prueba' });
  comprobar(r && r.entregado === false && cuantos() === antes, 'enviarSms no envía nada y lo dice');

  console.log('\nEncendido en modo archivo');
  process.env.MERCA_SMS = 'archivo';
  comprobar(correo.smsActivo() === true, 'smsActivo() se entera sin recargar el módulo');
  const texto = correo.textoSmsContacto({ codigo: '123456', minutos: 15 });
  const r2 = correo.enviarSms({ numero: '8095551234', texto });
  comprobar(r2 && r2.entregado === true && cuantos() === antes + 1, 'el SMS queda en .tmp/sms/');
  comprobar(texto.length <= 160 && !/[^\x20-\x7E]/.test(texto), 'el texto cabe en un SMS y va sin tildes');

  process.env.MERCA_SMS = 'algo-raro';
  comprobar(correo.smsActivo() === false && correo.enviarSms({ numero: '8095551234', texto }).entregado === false,
    'un modo desconocido cuenta como apagado');
  delete process.env.MERCA_SMS;

  console.log('\nEl código de teléfono por correo');
  const e = correo.enviarCodigoContacto({ para: 'x@ejemplo.test', nombre: 'X', numero: '8095551234', codigo: '654321', minutos: 15 });
  const contenido = e && e.archivo ? fs.readFileSync(e.archivo, 'utf8') : '';
  comprobar(e && e.entregado && contenido.includes('654321') && contenido.includes('(809) 555-1234'),
    'lleva el código y el número');
}

(async () => {
  console.log('\nMercaMaquinarias · contactos verificados\n');
  sembrar();

  console.log('La base');
  bloqueBase();

  console.log('\nEl SMS');
  bloqueSms();

  console.log(`\n${bien} bien, ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})();
