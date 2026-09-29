/**
 * probar-correo.js — comprueba que el correo sale de verdad.
 *
 *   node tools/probar-correo.js tucorreo@gmail.com
 *   node tools/probar-correo.js tucorreo@gmail.com --todas
 *
 * Sin --todas manda solo la bienvenida. Con --todas manda una de cada
 * plantilla, para revisar de una vez cómo se ven todas en el móvil.
 *
 * Diagnostica antes de enviar: si falta la clave o el transporte está
 * en 'archivo', lo dice en vez de dejar el correo en un archivo local
 * y hacerte creer que salió.
 */

require('./entorno');

const correo = require('./correo');

const destino = process.argv.find((a) => a.includes('@'));
const todas = process.argv.includes('--todas');

if (!destino) {
  console.error('\nIndique a qué dirección enviar:');
  console.error('  node tools/probar-correo.js tucorreo@gmail.com\n');
  process.exit(1);
}

const transporte = process.env.MERCA_CORREO || 'archivo';

console.log('\n── Configuración ──');
console.log(`  Transporte:  ${transporte}`);
console.log(`  Remitente:   ${process.env.MERCA_REMITENTE || '(el de por defecto)'}`);
console.log(`  Sitio:       ${correo.SITIO}`);
console.log(`  BREVO_API_KEY: ${process.env.BREVO_API_KEY ? 'definida' : 'SIN DEFINIR'}`);
console.log(`  Destino:     ${destino}`);

console.log('\n── Buzones ──');
for (const [area, direccion] of Object.entries(correo.BUZONES)) {
  console.log(`  ${area.padEnd(12)} ${direccion}`);
}

console.log('\n── Empresa ──');
console.log(`  ${correo.EMPRESA.razonSocial} · RNC ${correo.EMPRESA.rnc}`);
// El domicilio NO va en los correos. Se enseña aquí para poder
// comprobar que está bien puesto de cara a las facturas, que es el
// único documento donde aparece.
console.log(`  domicilio fiscal (solo facturas): ${correo.EMPRESA.domicilioFiscal}\n`);

if (transporte === 'archivo') {
  console.log('  Aviso: el transporte es "archivo". Los correos se escriben en');
  console.log(`  ${correo.BANDEJA} y NO salen a internet.`);
  console.log('  Para probar Brevo de verdad: MERCA_CORREO=brevo en el .env\n');
}
if (transporte === 'brevo' && !process.env.BREVO_API_KEY) {
  console.error('  Falta BREVO_API_KEY. Póngala en el .env y repita.\n');
  process.exit(1);
}

/* Una muestra de cada plantilla, con datos inventados pero realistas:
   lo que se revisa es cómo se lee, no si los datos son ciertos. */
const MUESTRAS = [
  ['bienvenida', () => correo.enviarBienvenida({
    para: destino, nombre: 'Prueba', esDealer: false,
  })],
  ['código de verificación', () => correo.enviarCodigo({
    para: destino, codigo: '123456', tipo: 'verificacion', nombre: 'Prueba', minutos: 10,
  })],
  ['anuncio publicado', () => correo.enviarAnuncioPublicado({
    para: destino, nombre: 'Prueba', equipo: '2021 Caterpillar 320',
    idAnuncio: 'demo', vence: new Date(Date.now() + 30 * 86400000).toISOString(), plan: 'Destacado',
  })],
  ['aviso de vencimiento (7 días)', () => correo.enviarRecordatorioVencimiento({
    para: destino, nombre: 'Prueba', equipo: '2021 Caterpillar 320', idAnuncio: 'demo',
    vence: new Date(Date.now() + 7 * 86400000).toISOString(), tipo: '7d', plan: 'Destacado',
  })],
  ['aviso de vencimiento (3 días)', () => correo.enviarRecordatorioVencimiento({
    para: destino, nombre: 'Prueba', equipo: '2021 Caterpillar 320', idAnuncio: 'demo',
    vence: new Date(Date.now() + 3 * 86400000).toISOString(), tipo: '3d', plan: 'Destacado',
  })],
  ['aviso de vencimiento (mañana)', () => correo.enviarRecordatorioVencimiento({
    para: destino, nombre: 'Prueba', equipo: '2021 Caterpillar 320', idAnuncio: 'demo',
    vence: new Date(Date.now() + 86400000).toISOString(), tipo: '1d', plan: 'Destacado',
  })],
  ['anuncio vencido', () => correo.enviarAnuncioVencido({
    para: destino, nombre: 'Prueba', equipo: '2021 Caterpillar 320', idAnuncio: 'demo',
  })],
  ['comprobante de cobro', () => correo.enviarComprobante({
    para: destino, nombre: 'Prueba', plan: 'Destacado',
    subtotal: 2000, itbis: 360, total: 2360, referencia: 'TE-PRUEBA-001',
    fin: new Date(Date.now() + 60 * 86400000).toISOString(),
  })],
  ['contacto recibido', () => correo.enviarContactoRecibido({
    para: destino, nombre: 'Prueba', equipo: '2021 Caterpillar 320',
    idAnuncio: 'demo', via: 'whatsapp',
  })],
  ['cuenta de dealer aprobada', () => correo.enviarResolucionDealer({
    para: destino, nombre: 'Prueba', empresa: 'Equipos de Prueba SRL',
    aprobada: true, slug: 'equipos-de-prueba',
  })],
  ['cuenta de dealer rechazada', () => correo.enviarResolucionDealer({
    para: destino, nombre: 'Prueba', empresa: 'Equipos de Prueba SRL',
    aprobada: false, motivo: 'El RNC no aparece en el registro mercantil.',
  })],
  ['aviso de cambio de contraseña', () => correo.enviarAvisoCambioClave({
    para: destino, nombre: 'Prueba',
  })],
  /* Estas dos mandan DOS mensajes: uno al cliente y otro al buzón del
     área. Con el transporte de archivo se ven los dos en la bandeja. */
  ['cotización de alquiler (cliente + ventas@)', () => correo.enviarSolicitudServicio({
    servicio: 'alquiler', nombre: 'Prueba', telefono: '8095551234', correo: destino,
    empresa: 'Constructora de Prueba', referencia: 'MM-PRUEBA-001',
    detalle: { Equipo: 'Retroexcavadora', Días: '5', Zona: 'Santo Domingo' },
  })],
  ['solicitud de dealer (a dealers@)', () => correo.enviarSolicitudDealer({
    id: 'PRUEBA-001', razon_social: 'Equipos de Prueba SRL', nombre_comercial: 'Equipos Prueba',
    rnc: '131909090', anios_operando: 8, direccion: 'Av. Principal 45', municipio: 'Herrera',
    provincia: 'Santo Domingo', telefono: '8095551234', encargado: 'Prueba Pérez',
    cargo: 'Gerente', solicitante: 'Prueba Pérez', correo_solicitante: destino,
    equipos_inventario: 24, equipos_publicar: 12, tipos_equipo: 'excavadoras, cargadores',
    origen: 'Instagram', comentario: 'Mensaje de prueba.',
  })],
];

(async () => {
  const aEnviar = todas ? MUESTRAS : MUESTRAS.slice(0, 1);
  console.log(`── Enviando ${aEnviar.length} correo(s) ──`);

  let bien = 0;
  for (const [nombre, enviar] of aEnviar) {
    const r = await enviar();
    const salio = r && r.entregado;
    if (salio) bien++;
    console.log(`  ${salio ? '✓' : '✗'} ${nombre}${salio ? '' : ` — ${(r && r.error) || 'sin detalle'}`}`);
  }

  console.log(`\n${bien}/${aEnviar.length} entregado(s) al proveedor.`);
  if (bien && transporte === 'brevo') {
    console.log('\nRevise la bandeja de entrada Y la carpeta de spam.');
    console.log('Si llegó a spam, faltan los registros SPF, DKIM o DMARC del dominio.\n');
  }
  process.exit(bien === aEnviar.length ? 0 : 1);
})();
