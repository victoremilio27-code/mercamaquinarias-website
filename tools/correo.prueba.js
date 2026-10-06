const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CARPETA = fs.mkdtempSync(path.join(os.tmpdir(), 'mercamaquinarias-correo-'));
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_CORREOS = CARPETA;

// El transporte y su carpeta se deciden al cargar el módulo, por eso el
// entorno se fija antes de este require.
const correo = require('./correo');

const USUARIO = '<script>alert(1)</script> "Ñandú" & Cía\r\nBcc: x@y.z';
const DESTINATARIO = 'persona@example.com';
const FECHA = '2026-10-14T16:00:00.000Z';
const URL = 'https://mercamaquinarias.com/prueba?token=seguro';

const base = {
  para: DESTINATARIO,
  nombre: USUARIO,
};

const casos = {
  enviar: () => correo.enviar({
    para: DESTINATARIO,
    asunto: USUARIO.repeat(5),
    texto: 'Mensaje de prueba',
    html: '<p>Mensaje de prueba</p>',
  }),
  enviarCodigo: () => correo.enviarCodigo({ ...base, codigo: '123456', tipo: 'verificacion', minutos: 10 }),
  enviarAvisoCambioClave: () => correo.enviarAvisoCambioClave({ ...base, via: 'sms', numero: USUARIO, enlaceNoFuiYo: URL }),
  enviarAvisoCuentaEliminada: () => correo.enviarAvisoCuentaEliminada(base),
  enviarSolicitudDealer: () => correo.enviarSolicitudDealer({
    razon_social: USUARIO, nombre_comercial: USUARIO, rnc: USUARIO, anios_operando: USUARIO,
    direccion: USUARIO, municipio: USUARIO, provincia: USUARIO, telefono: USUARIO, web: USUARIO,
    encargado: USUARIO, cargo: USUARIO, solicitante: USUARIO, correo_solicitante: DESTINATARIO,
    equipos_inventario: USUARIO, equipos_publicar: USUARIO, tipos_equipo: USUARIO,
    origen: USUARIO, comentario: USUARIO, id: 'SOL-1',
  }),
  enviarResolucionDealer: () => correo.enviarResolucionDealer({ ...base, empresa: USUARIO, aprobada: false, motivo: USUARIO, slug: 'empresa' }),
  enviarSolicitudServicio: () => correo.enviarSolicitudServicio({
    servicio: 'alquiler', nombre: USUARIO, telefono: USUARIO, correo: DESTINATARIO,
    empresa: USUARIO, detalle: { modelo: USUARIO, nota: USUARIO }, referencia: 'SER-1',
  }),
  enviarAnuncioPublicado: () => correo.enviarAnuncioPublicado({ ...base, equipo: USUARIO, idAnuncio: 1, vence: FECHA, plan: USUARIO }),
  enviarRecordatorioVencimiento: () => correo.enviarRecordatorioVencimiento({ ...base, equipo: USUARIO, idAnuncio: 1, vence: FECHA, tipo: '7d', dias: 7, plan: USUARIO }),
  enviarAnuncioVencido: () => correo.enviarAnuncioVencido({ ...base, equipo: USUARIO, idAnuncio: 1 }),
  enviarAlertaBusqueda: () => correo.enviarAlertaBusqueda({
    ...base, resumen: USUARIO, anuncios: [{ id: 1, anio: 2020, marca_nombre: USUARIO, modelo: USUARIO, provincia: USUARIO, precio: 100, moneda: 'DOP' }],
    restantes: 1, enlaceCatalogo: URL, enlaceBaja: URL,
  }),
  enviarComprobante: () => correo.enviarComprobante({ ...base, plan: USUARIO, subtotal: 100, itbis: 18, total: 118, referencia: 'PAG-1', fin: FECHA }),
  enviarContactoRecibido: () => correo.enviarContactoRecibido({ ...base, equipo: USUARIO, idAnuncio: 1, via: 'telefono' }),
  enviarBienvenida: () => correo.enviarBienvenida({ ...base, esDealer: true }),
  enviarDatosTransferencia: () => correo.enviarDatosTransferencia({
    ...base, referencia: 'PAG-2', total: 118, concepto: USUARIO,
    datos: { banco: USUARIO, titular: USUARIO, rnc: USUARIO, tipoCuenta: USUARIO, cuenta: USUARIO },
  }),
  enviarTransferenciaAnulada: () => correo.enviarTransferenciaAnulada({ ...base, referencia: 'PAG-3', motivo: USUARIO }),
  avisarInternamente: () => correo.avisarInternamente({ buzon: 'general', asunto: USUARIO, texto: USUARIO, html: `<p>${USUARIO.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</p>` }),
  enviarCodigoContacto: () => correo.enviarCodigoContacto({ ...base, numero: USUARIO, codigo: '123456', minutos: 10 }),
  enviarAvisoTelefonoLiberado: () => correo.enviarAvisoTelefonoLiberado({ ...base, numero: USUARIO }),
  enviarAvisoTelefonoCambiado: () => correo.enviarAvisoTelefonoCambiado({ ...base, anterior: USUARIO, nuevo: USUARIO, verificado: true }),
  enviarAvisoAccesoSms: () => correo.enviarAvisoAccesoSms({ ...base, numero: USUARIO }),
  avisarTopeSms: () => correo.avisarTopeSms({ tope: 300 }),
  enviarRenovacionProxima: () => correo.enviarRenovacionProxima({ ...base, concepto: USUARIO, total: 118, fecha: FECHA, marca: USUARIO, ultimos4: '1234', idAnuncio: 1 }),
  enviarRenovacionRechazada: () => correo.enviarRenovacionRechazada({ ...base, concepto: USUARIO, motivo: USUARIO, intento: 1, quedan: 2, fin: FECHA, idAnuncio: 1 }),
  enviarTarjetaPorVencer: () => correo.enviarTarjetaPorVencer({ ...base, marca: USUARIO, ultimos4: '1234', venceMes: 10, venceAnio: 2026 }),
  enviarAvisoCambioCorreo: () => correo.enviarAvisoCambioCorreo({ ...base, nuevo: DESTINATARIO, enlaceRevertir: URL }),
  enviarCorreoCambiado: () => correo.enviarCorreoCambiado(base),
  enviarRecuperacionRecibida: () => correo.enviarRecuperacionRecibida({ ...base, referencia: 'REC-1', desde: FECHA }),
  enviarAvisoRecuperacionAlTitular: () => correo.enviarAvisoRecuperacionAlTitular({ ...base, contactoEnmascarado: USUARIO, desde: FECHA }),
  avisarRecuperacionInterna: () => correo.avisarRecuperacionInterna({
    referencia: 'REC-2', correo_cuenta: DESTINATARIO, usuario_id: 1,
    correo_contacto: DESTINATARIO, nombre: USUARIO, telefono: USUARIO,
    rnc: USUARIO, detalle: USUARIO, resolver_desde: FECHA,
  }),
  enviarRecuperacionAprobada: () => correo.enviarRecuperacionAprobada(base),
  enviarRecuperacionRechazada: () => correo.enviarRecuperacionRechazada({ para: DESTINATARIO, referencia: 'REC-3' }),
};

const exportadasDeCorreo = Object.keys(correo)
  .filter((nombre) => /^(enviar|avisar)/.test(nombre) && nombre !== 'enviarSms')
  .sort();

test('la prueba recorre todas las funciones exportadas que envían correo', () => {
  assert.deepEqual(Object.keys(casos).sort(), exportadasDeCorreo);
});

test('todas las plantillas producen mensajes seguros', async () => {
  const permitidos = new Set([DESTINATARIO, ...Object.values(correo.BUZONES)]);
  const telefonoDominicano = /\b(?:809|829|849)\D*\d{3}\D*\d{4}\b/;

  for (const [nombre, ejecutar] of Object.entries(casos)) {
    const anteriores = new Set(fs.readdirSync(CARPETA));
    await Promise.resolve(ejecutar());
    const nuevos = fs.readdirSync(CARPETA).filter((archivo) => !anteriores.has(archivo));
    const textos = nuevos.filter((archivo) => archivo.endsWith('.txt'));
    assert.ok(textos.length > 0, `${nombre} no escribió ningún correo`);

    for (const archivo of textos) {
      const ruta = path.join(CARPETA, archivo);
      const contenido = fs.readFileSync(ruta, 'utf8');
      const para = /^Para: (.+)$/m.exec(contenido)?.[1];
      const asunto = /^Asunto: (.*)$/m.exec(contenido)?.[1];
      const texto = contenido.split('\n\n').slice(1).join('\n\n').trim();
      const rutaHtml = ruta.replace(/\.txt$/, '.html');
      const html = fs.existsSync(rutaHtml) ? fs.readFileSync(rutaHtml, 'utf8') : '';

      assert.ok(permitidos.has(para), `${nombre} escribió a un destinatario inesperado: ${para}`);
      assert.ok(texto, `${nombre} dejó vacío el texto plano`);
      assert.ok(asunto != null && !/[\r\n]/.test(asunto), `${nombre} dejó un salto en el asunto`);
      assert.ok(asunto.length <= 150, `${nombre} dejó un asunto de ${asunto.length} caracteres`);
      assert.doesNotMatch(html, /<script[\s>]/i, `${nombre} dejó HTML del usuario sin escapar`);
      assert.doesNotMatch(texto, telefonoDominicano, `${nombre} publicó un teléfono dominicano`);
      assert.doesNotMatch(html, telefonoDominicano, `${nombre} publicó un teléfono dominicano en HTML`);
    }
  }
});

test('la alerta incluye la cabecera de baja sin declarar baja de un clic', () => {
  const antes = new Set(fs.readdirSync(CARPETA));
  casos.enviarAlertaBusqueda();
  const archivo = fs.readdirSync(CARPETA).find((nombre) => !antes.has(nombre) && nombre.endsWith('.txt'));
  const contenido = fs.readFileSync(path.join(CARPETA, archivo), 'utf8');
  assert.match(contenido, new RegExp(`^List-Unsubscribe: <${URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}>$`, 'm'));
  assert.doesNotMatch(contenido, /^List-Unsubscribe-Post:/m);
});
