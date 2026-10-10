/**
 * Contrato HTTP de la trampa de las solicitudes públicas.
 * Corre contra una base temporal y usa el enrutador real con req/res fingidos.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-solicitudes');
const BANDEJA = path.join(__dirname, '..', '.tmp', 'correos');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.rmSync(BANDEJA, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
const api = require('./api.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) {
    bien++;
    console.log(`  ok  ${que}`);
  } else {
    mal++;
    console.log(`  MAL ${que}`);
  }
}

function pedir(cuerpo, ip) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = 'POST';
    req.url = '/api/solicitudes';
    req.headers = {
      'user-agent': 'prueba-solicitudes',
      'cf-connecting-ip': ip,
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      writeHead(codigo) { res.codigo = codigo; return res; },
      end(datos) {
        resolver({ codigo: res.codigo, datos: datos ? JSON.parse(datos) : null });
      },
    };
    api.manejar(req, res, '/api/solicitudes');
    setImmediate(() => {
      req.emit('data', Buffer.from(JSON.stringify(cuerpo)));
      req.emit('end');
    });
  });
}

function cantidadCorreos() {
  if (!fs.existsSync(BANDEJA)) return 0;
  return fs.readdirSync(BANDEJA).filter((nombre) => nombre.endsWith('.txt')).length;
}

function cuerpoValido(extra = {}) {
  return {
    servicio: 'alquiler',
    nombre: 'María de prueba',
    telefono: '8095550182',
    correo: 'maria@ejemplo.test',
    empresa: 'Constructora de prueba',
    detalle: { Trabajo: 'Excavar una zanja' },
    ms_formulario: 5000,
    sitio_web: '',
    ...extra,
  };
}

function mismaFormaDeExito(real, descarte) {
  const clavesReal = Object.keys(real.datos).sort().join(',');
  const clavesDescarte = Object.keys(descarte.datos).sort().join(',');
  return real.codigo === descarte.codigo
    && clavesReal === clavesDescarte
    && real.datos.mensaje === descarte.datos.mensaje
    && /^[A-Z]\d{4}-[A-F0-9]{5}$/.test(descarte.datos.referencia);
}

async function probar() {
  console.log('\nTrampa de solicitudes públicas');

  const normal = await pedir(cuerpoValido(), '201.8.7.1');
  comprobar(normal.codigo === 201 && db.solicitudesServicio().length === 1,
    'la solicitud normal se guarda');
  comprobar(cantidadCorreos() === 2,
    'la solicitud normal deja el aviso interno y la copia en el transporte de archivo');

  const correosAntes = cantidadCorreos();
  const conTrampa = await pedir(cuerpoValido({ sitio_web: 'https://spam.test' }), '201.8.7.2');
  comprobar(mismaFormaDeExito(normal, conTrampa),
    'la trampa rellena recibe una respuesta indistinguible del éxito salvo la referencia');
  comprobar(db.solicitudesServicio().length === 1 && cantidadCorreos() === correosAntes,
    'la trampa rellena no guarda ni manda correo');

  const rapida = await pedir(cuerpoValido({ ms_formulario: 2999 }), '201.8.7.3');
  comprobar(mismaFormaDeExito(normal, rapida),
    'la solicitud demasiado rápida recibe la misma respuesta de éxito');
  comprobar(db.solicitudesServicio().length === 1 && cantidadCorreos() === correosAntes,
    'la solicitud demasiado rápida no guarda ni manda correo');

  const antigua = cuerpoValido();
  delete antigua.ms_formulario;
  const sinTiempo = await pedir(antigua, '201.8.7.4');
  comprobar(sinTiempo.codigo === 201 && db.solicitudesServicio().length === 2,
    'un cliente antiguo sin ms_formulario se acepta y guarda');
  comprobar(cantidadCorreos() === correosAntes + 2,
    'un cliente antiguo también manda sus correos');

  /* E2E-CLIENTE-05 y E2E-NEGOCIO-6: el formulario de contacto pedía un
     teléfono aunque el cliente solo quisiera dejar su correo. */
  console.log('\nContacto: basta un correo o un teléfono');
  const contacto = (extra, ip) => pedir(cuerpoValido({
    servicio: 'contacto', empresa: '', detalle: { Mensaje: 'Una consulta' }, ...extra,
  }), ip);
  let r = await contacto({ telefono: '', correo: 'solo-correo@ejemplo.test' }, '201.8.7.11');
  comprobar(r.codigo === 201, `solo con correo: ${r.codigo}`);
  r = await contacto({ telefono: '8095550183', correo: '' }, '201.8.7.12');
  comprobar(r.codigo === 201, `solo con teléfono: ${r.codigo}`);
  r = await contacto({ telefono: '', correo: '' }, '201.8.7.13');
  comprobar(r.codigo === 400 && /un correo o un teléfono/.test(r.datos.error), `sin ninguno: ${r.codigo} «${r.datos.error}»`);
  r = await contacto({ telefono: '80955', correo: 'tel-corto@ejemplo.test' }, '201.8.7.14');
  comprobar(r.codigo === 400 && /10 dígitos/.test(r.datos.error), `teléfono corto aunque haya correo: ${r.codigo}`);
  r = await pedir(cuerpoValido({ telefono: '', correo: 'alquila@ejemplo.test' }), '201.8.7.15');
  comprobar(r.codigo === 400 && /10 dígitos/.test(r.datos.error), `alquiler sigue exigiendo teléfono: ${r.codigo}`);

  console.log(`\n${bien} comprobaciones bien; ${mal} mal.`);
  if (mal) process.exitCode = 1;
}

probar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
