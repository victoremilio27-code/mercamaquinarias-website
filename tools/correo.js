/**
 * correo.js — envío de correo. Sin dependencias.
 *
 * Un único punto de salida para todo el correo del sitio, con dos
 * transportes:
 *
 *   · 'archivo' (por defecto en desarrollo) — no manda nada a nadie:
 *     escribe cada mensaje en .tmp/correos/ y saca el código por
 *     consola. Se puede probar el flujo entero sin cuenta de correo
 *     ni riesgo de escribirle a una dirección real por error.
 *
 *   · 'brevo' — producción. Correo transaccional por la API HTTPS de
 *     Brevo. Ni la API ni las pantallas se enteran del cambio.
 *
 * Elegir con MERCA_CORREO=brevo y definir BREVO_API_KEY.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const BANDEJA = path.join(RAIZ, '.tmp', 'correos');

/* ── Buzones ────────────────────────────────────────────────
 *
 * TODAS las direcciones del sitio viven aquí. Antes estaban escritas a
 * mano en tres archivos distintos, y cuando el dominio cambió hubo que
 * ir a buscarlas una por una; alguna se quedó apuntando a un buzón
 * muerto hasta que alguien se quejó.
 *
 * EL REMITENTE ES SIEMPRE no-reply@. Tiene que ser una dirección del
 * dominio autenticado en Brevo o el correo acaba en spam, y no hay
 * nadie leyendo ahí. A dónde va la respuesta lo decide cada mensaje con
 * su `responderA`: quien recibe una cotización responde a ventas@, y
 * quien recibe una factura a facturacion@. Es la diferencia entre que
 * la respuesta llegue a quien puede atenderla y que caiga en el montón.
 *
 * Cada buzón se puede cambiar por entorno sin tocar código, que es lo
 * que hace falta el día que alguien atienda ventas de verdad y quiera
 * su correo aparte. */
const REMITENTE = process.env.MERCA_REMITENTE || 'MercaMaquinarias <no-reply@mercamaquinarias.com>';
const TRANSPORTE = process.env.MERCA_CORREO || 'archivo';

const BUZONES = {
  // Contacto general. Es el que va en el pie del sitio y el que recoge
  // las respuestas de lo que no encaja en ningún área concreta.
  general: process.env.MERCA_GENERAL || 'hola@mercamaquinarias.com',
  // Quien tiene un problema, no una pregunta: el asistente y los avisos
  // de seguridad mandan aquí.
  soporte: process.env.MERCA_SOPORTE || 'ayuda@mercamaquinarias.com',
  // Cotizaciones de alquiler e importación.
  ventas: process.env.MERCA_VENTAS || 'ventas@mercamaquinarias.com',
  // Solicitudes de alta de dealer, que un administrador revisa a mano.
  revision: process.env.MERCA_REVISION || 'dealers@mercamaquinarias.com',
  // Publicaciones, vencimientos y cupos.
  anuncios: process.env.MERCA_ANUNCIOS || 'anuncios@mercamaquinarias.com',
  // Cobros, comprobantes y facturas.
  facturacion: process.env.MERCA_FACTURACION || 'facturacion@mercamaquinarias.com',
  // Espacios publicitarios.
  publicidad: process.env.MERCA_PUBLICIDAD || 'publicidad@mercamaquinarias.com',
  // Avisos legales y ejercicio de derechos sobre datos personales.
  legal: process.env.MERCA_LEGAL || 'legal@mercamaquinarias.com',
  /* Los informes de negocio. Va a otro dominio a propósito: es el de
     la sociedad que opera la plataforma, no el de la marca. */
  gerencia: process.env.MERCA_GERENCIA || 'gerencia@inversionesxzt.com',
};

/* Nombres viejos, que siguen exportándose porque hay código que los
   usa. `REVISION` es el que más: lo lee tools/chat.js y lo consulta
   probar-correo.js. */
const REVISION = BUZONES.revision;
const RESPUESTAS = BUZONES.general;
const SOPORTE = BUZONES.soporte;

/* ── Identidad de la empresa ────────────────────────────────
 *
 * Quien recibe un correo automático tiene derecho a saber de qué
 * empresa viene, no solo de qué marca. La razón social y el RNC van en
 * el pie de TODOS los mensajes, y con esos dos datos cualquiera puede
 * comprobar la empresa en el registro mercantil.
 *
 * EL DOMICILIO NO SE PUBLICA. No hay oficina: el domicilio registrado
 * es una vivienda particular, y ponerlo en el pie de cada correo
 * automático la expone sin que nadie lo necesite para nada. La razón
 * social, el RNC y un correo de contacto identifican a la empresa de
 * sobra.
 *
 * Se guarda aquí porque en una FACTURA sí es obligatorio: un
 * comprobante fiscal tiene que llevar el domicilio del emisor. Ese es
 * el único sitio donde debe aparecer, y es el domicilio social que
 * consta en el Registro Mercantil, no una dirección operativa. */
const EMPRESA = {
  marca: 'MercaMaquinarias',
  razonSocial: process.env.MERCA_RAZON_SOCIAL || 'Inversiones XZT, S.R.L.',
  rnc: process.env.MERCA_RNC || '1-31-27975-9',
  /* Solo para documentos fiscales. NO usar en correos ni en el sitio.
   *
   * Es el que consta en el Registro Mercantil 116099SD de la Cámara de
   * Comercio y Producción de Santo Domingo, comprobado contra el
   * certificado: «DOMICILIO DE LA EMPRESA · CALLE RAMON SANTANA, NO. 4
   * GAZCUE». Aquí había otro distinto, y una factura con un domicilio
   * del emisor que no es el registrado es una factura impugnable; peor
   * todavía, corregirlo después obliga a emitir una nota de crédito por
   * cada comprobante ya entregado. */
  domicilioFiscal: process.env.MERCA_DOMICILIO_FISCAL
    || 'C/ Ramón Santana No. 4, Gazcue, Distrito Nacional, República Dominicana',

  /* El número de Registro Mercantil. No es obligatorio en el
   * comprobante —lo que la DGII exige es el RNC— pero es habitual en
   * las facturas dominicanas y ayuda a que el cliente identifique al
   * emisor sin buscarlo. Vacío no imprime nada. */
  registroMercantil: process.env.MERCA_REGISTRO_MERCANTIL || '116099SD',
};

// URL pública, para los enlaces que van dentro de los correos.
const SITIO = process.env.MERCA_SITIO || 'https://mercamaquinarias.com';

/* Escapa lo que venga del usuario antes de meterlo en el HTML del
   correo: un nombre con "<script>" no debe llegar a la bandeja de
   nadie tal cual. */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ── Maquetación común ──────────────────────────────────── */

/* Un solo armazón para todos los correos. Antes cada plantilla se
   escribía suelta y solo la del código tenía HTML; las demás llegaban
   en texto plano y se veían pobres al lado.
 *
 * Reglas de maquetación de correo, que no son las de una página web:
 *
 *   · TABLAS, no flexbox ni grid. Outlook de escritorio usa el motor
 *     de Word y no entiende nada moderno; una tabla se ve igual en
 *     todas partes.
 *   · ESTILOS EN LÍNEA. Gmail descarta las hojas de estilo y buena
 *     parte de lo que haya en <style>.
 *   · ANCHO MÁXIMO 560 px, y todo se apila solo en pantalla estrecha.
 *   · COLORES EXPLÍCITOS en cada elemento. Sin esto, el modo oscuro de
 *     algunos clientes invierte el texto y lo deja ilegible.
 */

const AZUL = '#071A2B';
const AMBAR = '#F2A900';
const HUESO = '#F7F5EF';
const LINEA = '#DEDCD4';
const GRIS = '#33475A';
const GRIS_CLARO = '#60717D';

const TIPO = 'Inter,-apple-system,\'Segoe UI\',Roboto,Helvetica,Arial,sans-serif';

/* Botón «a prueba de balas»: el color de fondo va en la celda de la
   tabla y no en el enlace, porque varios clientes recortan el relleno
   de un <a> con fondo. */
const boton = (texto, url) => `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 4px">
    <tr><td align="center" bgcolor="${AMBAR}" style="border-radius:6px">
      <a href="${esc(url)}" style="display:inline-block;padding:14px 30px;font-family:${TIPO};font-size:15px;font-weight:700;color:${AZUL};text-decoration:none;border-radius:6px">${esc(texto)}</a>
    </td></tr>
  </table>`;

/* Tarjeta destacada: el dato que la persona ha venido a buscar. */
const tarjeta = (contenido, centrado = false) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0">
    <tr><td bgcolor="#FFFFFF" style="padding:20px;border:1px solid ${LINEA};border-left:3px solid ${AMBAR};border-radius:6px;${centrado ? 'text-align:center' : ''}">
      ${contenido}
    </td></tr>
  </table>`;

/* Lista de pares rótulo/valor, para comprobantes y resúmenes. */
const filas = (pares) => `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="font-family:${TIPO};font-size:14px">
    ${pares.filter(([, v]) => v != null && v !== '').map(([k, v], i, todas) => `
      <tr>
        <td style="padding:9px 0;color:${GRIS_CLARO};${i < todas.length - 1 ? `border-bottom:1px solid ${LINEA};` : ''}">${esc(k)}</td>
        <td align="right" style="padding:9px 0;color:${AZUL};font-weight:600;${i < todas.length - 1 ? `border-bottom:1px solid ${LINEA};` : ''}">${esc(v)}</td>
      </tr>`).join('')}
  </table>`;

/* Armazón completo: banner, cuerpo y pie. */
function envoltura({ titulo, saludo, parrafos = [], extra = '', nota = '', accion,
  responderA = BUZONES.general }) {
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(titulo)}</title></head>
<body style="margin:0;padding:0;background:#E7E6E0;font-family:${TIPO}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#E7E6E0">
<tr><td align="center" style="padding:24px 12px">

  <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;border-radius:10px;overflow:hidden;box-shadow:0 1px 3px rgba(7,26,43,.12)">

    <!-- Banner -->
    <tr><td bgcolor="${AZUL}" style="padding:26px 26px 24px;border-bottom:4px solid ${AMBAR}">
      <div style="font-family:${TIPO};font-size:27px;font-weight:800;letter-spacing:-.02em;color:#FFFFFF;line-height:1">
        Merca<span style="color:${AMBAR}">Maquinarias</span>
      </div>
      <div style="margin-top:6px;font-family:${TIPO};font-size:12px;font-weight:500;letter-spacing:.06em;text-transform:uppercase;color:#8FA3B3">
        Maquinaria y equipo pesado
      </div>
    </td></tr>

    <!-- Cuerpo -->
    <tr><td bgcolor="${HUESO}" style="padding:30px 26px">
      <h1 style="margin:0 0 14px;font-family:${TIPO};font-size:23px;font-weight:800;line-height:1.25;letter-spacing:-.02em;color:${AZUL}">${esc(titulo)}</h1>
      ${saludo ? `<p style="margin:0 0 12px;font-family:${TIPO};font-size:15px;font-weight:600;color:${AZUL}">${esc(saludo)}</p>` : ''}
      ${parrafos.map((p) => `<p style="margin:0 0 12px;font-family:${TIPO};font-size:14.5px;line-height:1.65;color:${GRIS}">${p}</p>`).join('')}
      ${extra}
      ${accion ? boton(accion.texto, accion.url) : ''}
      ${nota ? `<p style="margin:22px 0 0;padding-top:16px;border-top:1px solid ${LINEA};font-family:${TIPO};font-size:12.5px;line-height:1.6;color:${GRIS_CLARO}">${nota}</p>` : ''}
    </td></tr>

    <!-- Pie: la firma corporativa, igual en todos los mensajes -->
    <tr><td bgcolor="${AZUL}" style="padding:20px 26px">
      <p style="margin:0 0 8px;font-family:${TIPO};font-size:12.5px;line-height:1.6;color:#FFFFFF;font-weight:600">
        ${esc(EMPRESA.marca)}
      </p>
      <p style="margin:0;font-family:${TIPO};font-size:12px;line-height:1.65;color:#8FA3B3">
        ${esc(EMPRESA.razonSocial)} · RNC ${esc(EMPRESA.rnc)}<br>
        República Dominicana<br>
        <a href="${SITIO}" style="color:${AMBAR};text-decoration:none">mercamaquinarias.com</a>
        ${responderA ? ` · <a href="mailto:${esc(responderA)}" style="color:${AMBAR};text-decoration:none">${esc(responderA)}</a>` : ''}
      </p>
      <p style="margin:14px 0 0;padding-top:12px;border-top:1px solid rgba(143,163,179,.3);font-family:${TIPO};font-size:11px;line-height:1.55;color:#6E8496">
        Mensaje automático dirigido a su destinatario. Si lo ha recibido
        por error, bórrelo y avísenos. No responda a esta dirección:
        las respuestas se atienden en el correo indicado arriba.
      </p>
    </td></tr>

  </table>

</td></tr></table>
</body></html>`;
}

/* ── Plantillas ─────────────────────────────────────────── */

/* Un correo con código se lee en la notificación del teléfono: el
   código va en el asunto y en la primera línea, no al final. */
function plantillaCodigo({ codigo, tipo, nombre, minutos }) {
  const textos = {
    verificacion: {
      asunto: `${codigo} es su código de verificación · MercaMaquinarias`,
      titulo: 'Confirme su correo',
      cuerpo: 'Use este código para terminar de crear su cuenta en MercaMaquinarias.',
    },
    acceso: {
      asunto: `${codigo} es su código de acceso · MercaMaquinarias`,
      titulo: 'Código de acceso',
      cuerpo: 'Alguien está iniciando sesión en su cuenta desde un equipo nuevo. Use este código para continuar.',
    },
    restablecer: {
      asunto: `${codigo} es su código para cambiar la contraseña · MercaMaquinarias`,
      titulo: 'Cambio de contraseña',
      cuerpo: 'Use este código para establecer una contraseña nueva en su cuenta.',
    },
  };
  const t = textos[tipo] || textos.verificacion;
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';

  const texto = [
    saludo, '',
    `${t.cuerpo}`, '',
    `Código: ${codigo}`,
    `Vence en ${minutos} minutos y solo sirve una vez.`, '',
    'Si no fue usted, ignore este mensaje y no comparta el código con nadie.',
    'Nunca le pediremos este código por teléfono ni por WhatsApp.', '',
    'MercaMaquinarias',
  ].join('\n');

  const html = envoltura({
    titulo: t.titulo,
    saludo,
    parrafos: [esc(t.cuerpo)],
    extra: tarjeta(`
      <div style="font-family:${TIPO};font-size:38px;font-weight:800;letter-spacing:.3em;color:${AZUL};font-variant-numeric:tabular-nums;line-height:1.1">${esc(codigo)}</div>
      <div style="margin-top:8px;font-family:${TIPO};font-size:12.5px;color:${GRIS_CLARO}">Vence en ${minutos} minutos · un solo uso</div>`, true),
    nota: 'Si no fue usted, ignore este mensaje y no comparta el código con nadie. <b style="color:'
      + AZUL + '">Nunca le pediremos este código por teléfono ni por WhatsApp.</b>',
  });

  return { asunto: t.asunto, texto, html };
}

/* ── Transportes ────────────────────────────────────────── */

/* Cuenta de mensajes de esta ejecución. Va en el nombre del archivo.
 *
 * El nombre era solo la marca de tiempo y el destinatario, y dos
 * correos al mismo destinatario dentro del mismo milisegundo se
 * pisaban: el segundo borraba al primero sin decir nada. Pasa de
 * verdad, y justo donde peor sienta —al mandar el comprobante al
 * cliente y la copia a facturación, que salen seguidos—: la prueba
 * decía «12 de 12 entregados» y en la bandeja había diez. */
let secuencia = 0;

function porArchivo({ para, asunto, texto, html, responderA = BUZONES.general, adjuntos = [] }) {
  fs.mkdirSync(BANDEJA, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const n = String(++secuencia).padStart(3, '0');
  const base = path.join(BANDEJA, `${sello}-${n}-${para.replace(/[^\w.@-]/g, '_')}`);
  const archivo = `${base}.txt`;
  fs.writeFileSync(archivo,
    `Para: ${para}\nDe: ${REMITENTE}\nResponder a: ${responderA}\nAsunto: ${asunto}\n\n${texto}\n`, 'utf8');

  // La versión HTML se guarda aparte para poder abrirla en el navegador
  // y ver cómo va a llegar, sin gastar un envío real.
  if (html) fs.writeFileSync(`${base}.html`, html, 'utf8');

  /* Los adjuntos también se escriben. Con el transporte de archivo no
     hay envío que inspeccionar, y un comprobante que «se mandó» pero
     cuyo PDF nadie ha abierto es exactamente el que sale mal el día que
     lo abre un cliente. */
  for (const a of adjuntos) {
    try {
      fs.writeFileSync(path.join(BANDEJA, `${sello}-${n}-${a.name}`),
        Buffer.from(a.content, 'base64'));
    } catch (_) { /* un adjunto ilegible no debe tumbar el envío */ }
  }

  // En desarrollo el código se lee aquí, en la consola del servidor.
  const codigo = /Código: (\d+)/.exec(texto);
  console.log(`✉  ${para} · ${asunto}${codigo ? `  → CÓDIGO ${codigo[1]}` : ''}`);
  return { entregado: true, archivo };
}

/* Brevo, por su API HTTPS de correo transaccional.
 *
 * Se usa la API y no el SMTP a propósito: no hace falta abrir el
 * puerto 587 (muchos proveedores de VPS lo bloquean de salida para
 * frenar el spam), la respuesta dice si el mensaje se aceptó, y no se
 * arrastra una dependencia de cliente SMTP.
 *
 * Sin `node:https` extra: viene con Node.
 *
 * Configuración:
 *   MERCA_CORREO=brevo
 *   BREVO_API_KEY=xkeysib-…
 *
 * El remitente debe estar verificado en Brevo y el dominio necesita
 * SPF, DKIM y DMARC publicados, o el correo acaba en spam. Ver
 * deploy/README.md.
 */
const https = require('https');

/* Separa "Nombre <correo@dominio>" en las dos partes que pide la API. */
function partirRemitente(cadena) {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(String(cadena));
  return m ? { name: m[1] || undefined, email: m[2] } : { email: String(cadena).trim() };
}

function porBrevo({ para, asunto, texto, html, responderA = BUZONES.general, adjuntos = [] }) {
  const clave = process.env.BREVO_API_KEY;
  if (!clave) throw new Error('Falta BREVO_API_KEY');

  const cuerpo = JSON.stringify({
    sender: partirRemitente(REMITENTE),
    to: [{ email: para }],
    replyTo: partirRemitente(responderA),
    subject: asunto,
    textContent: texto,
    ...(html ? { htmlContent: html } : {}),
    /* Brevo los quiere en base64 con su nombre. Van dentro del JSON,
       así que el cuerpo crece un 33 % sobre el peso real del archivo:
       un comprobante son 3 KB, no hay problema, pero conviene saberlo
       antes de adjuntar algo grande. */
    ...(adjuntos.length ? { attachment: adjuntos.map((a) => ({ content: a.content, name: a.name })) } : {}),
  });

  return new Promise((resolver) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: '/v3/smtp/email',
      method: 'POST',
      headers: {
        'api-key': clave,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(cuerpo),
      },
      timeout: 10000,
    }, (res) => {
      let datos = '';
      res.on('data', (c) => { datos += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolver({ entregado: true, id: (JSON.parse(datos || '{}') || {}).messageId });
        } else {
          // No se lanza: quien llama ya trata `entregado: false`, y una
          // caída de Brevo no puede tumbar un registro que sí se guardó.
          console.error(`correo: Brevo devolvió ${res.statusCode} · ${datos.slice(0, 200)}`);
          resolver({ entregado: false, error: `Brevo ${res.statusCode}` });
        }
      });
    });

    req.on('timeout', () => { req.destroy(); resolver({ entregado: false, error: 'tiempo agotado' }); });
    req.on('error', (e) => resolver({ entregado: false, error: e.message }));
    req.write(cuerpo);
    req.end();
  });
}

/* ── Salida única ───────────────────────────────────────── */

const TRANSPORTES = { archivo: porArchivo, brevo: porBrevo };

/* Nunca lanza: un fallo del correo no debe tumbar la operación que lo
   provocó. Devuelve si se entregó para que quien llame decida.

   Con Brevo devuelve una promesa. Quien llama puede ignorarla —el
   correo es accesorio a la operación— o esperarla si necesita saber si
   salió; por eso el `catch` cubre los dos casos. */
function enviar(mensaje) {
  const transporte = TRANSPORTES[TRANSPORTE];
  if (!transporte) {
    console.error(`correo: transporte "${TRANSPORTE}" desconocido; use archivo o brevo`);
    return { entregado: false, error: 'transporte desconocido' };
  }
  try {
    const r = transporte(mensaje);
    return r && typeof r.catch === 'function'
      ? r.catch((e) => {
        console.error('correo: no se pudo enviar a', mensaje.para, '·', e.message);
        return { entregado: false, error: e.message };
      })
      : r;
  } catch (e) {
    console.error('correo: no se pudo enviar a', mensaje.para, '·', e.message);
    return { entregado: false, error: e.message };
  }
}

/* Copia al buzón del área, como MENSAJE APARTE.
 *
 * Nunca como CC ni BCC del mensaje al cliente. Tres razones, y las tres
 * han mordido a alguien alguna vez:
 *
 *   · Un CC enseña al cliente una dirección interna y, si hay varios
 *     destinatarios, los correos de unos a otros.
 *   · Si el correo del cliente rebota, un proveedor puede dar el envío
 *     entero por fallido y la copia interna se pierde con él. Justo la
 *     que avisa de que hay trabajo pendiente.
 *   · El mensaje interno quiere decir otra cosa: al cliente se le
 *     confirma, al área se le avisa de que tiene algo que atender.
 *
 * No se espera al resultado: quien llama ya está mandando su correo y
 * esto es accesorio. Los fallos se anotan en el registro. */
function avisarInternamente({ buzon, asunto, texto, html, copia }) {
  const destino = BUZONES[buzon] || BUZONES.general;

  /* La copia va como un envío aparte y no como CC.
   *
   * El proveedor acepta varios destinatarios, pero entonces cada uno
   * ve la dirección del otro y una respuesta accidental a todos sale
   * de la casa. Para un informe interno da igual; para el día que un
   * informe se reenvíe a alguien de fuera, no. Dos envíos cuestan dos
   * llamadas y ahorran esa conversación.
   *
   * Si el primero falla, el segundo sale igual: son destinatarios
   * independientes y que uno rebote no es razón para que el otro se
   * quede sin su copia. */
  const destinos = [destino];
  if (copia) {
    const segundo = BUZONES[copia] || copia;
    if (segundo && segundo !== destino) destinos.push(segundo);
  }

  const envios = destinos.map((para) => {
    const r = enviar({ para, asunto, texto, html, responderA: destino });
    if (r && typeof r.then === 'function') {
      r.then((x) => {
        if (!x || !x.entregado) console.error(`correo: la copia interna a ${para} no salió`);
      });
    }
    return r;
  });

  return envios.length === 1 ? envios[0] : Promise.all(envios);
}

const enviarCodigo = ({ para, codigo, tipo, nombre, minutos }) =>
  enviar({
    para,
    // Un código que no llega es un problema, no una consulta comercial.
    responderA: BUZONES.soporte,
    ...plantillaCodigo({ codigo, tipo, nombre, minutos }),
  });

/* ── Verificación de teléfonos (fase 9) ─────────────────────
 *
 * Ningún teléfono sale en un anuncio sin verificar. Hay dos vías y las
 * dos salen de aquí, que es el único punto de envío del sitio:
 *
 *   · correo — el código va al correo YA verificado de la cuenta. Prueba
 *     que el titular declara el número como suyo. Es la vía de hoy.
 *   · sms    — el código va al propio teléfono. Prueba que quien publica
 *     lo tiene en la mano. Depende de los créditos SMS de Brevo, que
 *     están sin pagar: se entrega construida y APAGADA.
 */

const formatoNumero = (n) => {
  const d = String(n || '').replace(/\D/g, '').slice(-10);
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : String(n || '');
};

function enviarCodigoContacto({ para, nombre, numero, codigo, minutos }) {
  const tel = formatoNumero(numero);
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';
  const cuerpo = `Use este código para confirmar que el teléfono ${tel} es suyo y que puede aparecer en sus anuncios de MercaMaquinarias.`;
  const texto = [
    saludo, '',
    cuerpo, '',
    `Código: ${codigo}`,
    `Vence en ${minutos} minutos y solo sirve una vez.`, '',
    'Si no fue usted, ignore este mensaje: el número no se mostrará.',
    'Nunca le pediremos este código por teléfono ni por WhatsApp.', '',
    'MercaMaquinarias',
  ].join('\n');

  const html = envoltura({
    titulo: 'Confirme su teléfono',
    saludo,
    parrafos: [esc(cuerpo)],
    extra: tarjeta(`
      <div style="font-family:${TIPO};font-size:38px;font-weight:800;letter-spacing:.3em;color:${AZUL};font-variant-numeric:tabular-nums;line-height:1.1">${esc(codigo)}</div>
      <div style="margin-top:8px;font-family:${TIPO};font-size:12.5px;color:${GRIS_CLARO}">Vence en ${minutos} minutos · un solo uso</div>`, true),
    nota: 'Si no fue usted, ignore este mensaje: el número no se mostrará. <b style="color:'
      + AZUL + '">Nunca le pediremos este código por teléfono ni por WhatsApp.</b>',
  });

  return enviar({
    para,
    responderA: BUZONES.soporte,
    // El código va en el asunto: se lee en la notificación del teléfono.
    asunto: `${codigo} es su código para confirmar el ${tel} · MercaMaquinarias`,
    texto,
    html,
  });
}

/* El texto del SMS va SIN tildes a propósito: con `unicodeEnabled`
   apagado Brevo las destroza, y encendido cada mensaje pasa de 160 a 70
   caracteres y cuesta el doble de créditos. */
const textoSmsContacto = ({ codigo, minutos }) =>
  `MercaMaquinarias: su codigo para verificar este telefono es ${codigo}. `
  + `Vence en ${minutos} min. No lo comparta: nunca se lo pediremos.`;

/* EL INTERRUPTOR. `MERCA_SMS` se lee en cada llamada y no al cargar el
   módulo: encender los SMS es poner MERCA_SMS=brevo en el entorno del
   VPS y reiniciar, sin tocar código ni el flujo de verificación, y la
   prueba puede demostrarlo encendiéndolo en mitad de la ejecución.

     apagado (por defecto) — la vía SMS no se ofrece y la API la rechaza.
     archivo               — escribe en .tmp/sms/ y saca el código por consola.
     brevo                 — API de SMS transaccional de Brevo. */
const modoSms = () => String(process.env.MERCA_SMS || 'apagado').trim().toLowerCase();
const BANDEJA_SMS = path.join(RAIZ, '.tmp', 'sms');

function smsPorArchivo({ numero, texto }) {
  fs.mkdirSync(BANDEJA_SMS, { recursive: true });
  const sello = new Date().toISOString().replace(/[:.]/g, '-');
  const n = String(++secuencia).padStart(3, '0');
  const archivo = path.join(BANDEJA_SMS, `${sello}-${n}-${String(numero).replace(/\D/g, '')}.txt`);
  fs.writeFileSync(archivo, `Para: ${numero}\n\n${texto}\n`, 'utf8');
  const codigo = /(\d{6})/.exec(texto);
  console.log(`✆  ${numero} · SMS${codigo ? `  → CÓDIGO ${codigo[1]}` : ''}`);
  return { entregado: true, archivo };
}

/* Brevo, SMS transaccional. Remitente alfanumérico de hasta once
   caracteres; el destinatario en formato internacional sin «+». La ruta
   es configurable porque la documentación de Brevo no se pudo consultar
   al escribir esto: el día de encender se comprueba y, si cambió, se
   corrige con MERCA_SMS_RUTA sin tocar código. */
function smsPorBrevo({ numero, texto }) {
  const clave = process.env.BREVO_API_KEY;
  if (!clave) throw new Error('Falta BREVO_API_KEY');
  const digitos = String(numero).replace(/\D/g, '');
  const cuerpo = JSON.stringify({
    type: 'transactional',
    unicodeEnabled: false,
    sender: String(process.env.MERCA_SMS_REMITENTE || 'MercaMaq').slice(0, 11),
    recipient: digitos.length === 10 ? `1${digitos}` : digitos,
    content: texto,
  });

  return new Promise((resolver) => {
    const req = https.request({
      hostname: 'api.brevo.com',
      path: process.env.MERCA_SMS_RUTA || '/v3/transactionalSMS/sms',
      method: 'POST',
      headers: {
        'api-key': clave,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(cuerpo),
      },
      timeout: 10000,
    }, (res) => {
      let datos = '';
      res.on('data', (c) => { datos += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          let idMensaje;
          try { idMensaje = (JSON.parse(datos || '{}') || {}).messageId; } catch (_) { idMensaje = undefined; }
          resolver({ entregado: true, id: idMensaje });
        } else {
          // Sin créditos Brevo responde con error: se anota y se sigue.
          console.error(`sms: Brevo devolvió ${res.statusCode} · ${datos.slice(0, 200)}`);
          resolver({ entregado: false, error: `Brevo ${res.statusCode}` });
        }
      });
    });
    req.on('timeout', () => { req.destroy(); resolver({ entregado: false, error: 'tiempo agotado' }); });
    req.on('error', (e) => resolver({ entregado: false, error: e.message }));
    req.write(cuerpo);
    req.end();
  });
}

const TRANSPORTES_SMS = { archivo: smsPorArchivo, brevo: smsPorBrevo };

const smsActivo = () => Object.prototype.hasOwnProperty.call(TRANSPORTES_SMS, modoSms());

/* Igual que `enviar`: nunca lanza. Con el interruptor apagado no sale
   nada y lo dice, para que quien llame no lo dé por enviado. */
function enviarSms({ numero, texto }) {
  const modo = modoSms();
  if (modo === 'apagado') return { entregado: false, error: 'sms apagado' };
  const transporte = TRANSPORTES_SMS[modo];
  if (!transporte) {
    console.error(`sms: modo "${modo}" desconocido; use apagado, archivo o brevo`);
    return { entregado: false, error: 'modo desconocido' };
  }
  try {
    const r = transporte({ numero, texto });
    return r && typeof r.catch === 'function'
      ? r.catch((e) => {
        console.error('sms: no se pudo enviar a', numero, '·', e.message);
        return { entregado: false, error: e.message };
      })
      : r;
  } catch (e) {
    console.error('sms: no se pudo enviar a', numero, '·', e.message);
    return { entregado: false, error: e.message };
  }
}

/* Aviso de que la contraseña cambió. No lleva código ni enlace: su
   único fin es que el dueño se entere si el cambio no fue suyo. */
function enviarAvisoCambioClave({ para, nombre }) {
  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';
  return enviar({
    para,
    asunto: 'Su contraseña de MercaMaquinarias cambió',
    texto: [
      saludo, '',
      'La contraseña de su cuenta de MercaMaquinarias acaba de cambiar y se cerraron todas las sesiones abiertas.', '',
      'Si fue usted, no hay nada que hacer.',
      `Si no fue usted, escriba de inmediato a ${SOPORTE}.`, '',
      'MercaMaquinarias',
    ].join('\n'),
    responderA: BUZONES.soporte,
    html: envoltura({
      titulo: 'Su contraseña cambió',
      saludo,
      responderA: BUZONES.soporte,
      parrafos: [
        'La contraseña de su cuenta acaba de cambiar y se cerraron todas las sesiones abiertas.',
        'Si fue usted, no hay nada que hacer.',
      ],
      nota: `Si <b style="color:${AZUL}">no</b> fue usted, escríbanos de inmediato a `
        + `<a href="mailto:${esc(SOPORTE)}" style="color:${AMBAR}">${esc(SOPORTE)}</a>.`,
    }),
  });
}

/* ── Alta de dealers ────────────────────────────────────── */

/* Buzón del equipo que revisa las solicitudes de empresa. */

/* Expediente para quien revisa. Va en texto plano y ordenado por
   bloques: se lee entero desde el teléfono y se compara contra el
   registro mercantil sin abrir el panel.
 *
 * Este es el único correo que lleva el RNC completo, y va a una
 * dirección interna. No se reenvía al dealer ni aparece en ningún
 * mensaje que reciba un tercero. */
/* ── Solicitud de alquiler, transporte o importación ────────
   Van DOS correos: uno al equipo, con los datos de contacto arriba del
   todo porque lo primero que se hace es llamar; y otro al cliente con
   su referencia, para que sepa que llegó y tenga con qué preguntar.

   El del cliente solo sale si dejó correo: el teléfono es obligatorio,
   el correo no. */
const NOMBRE_SERVICIO = {
  alquiler: 'alquiler de maquinaria',
  transporte: 'transporte de maquinaria',
  importacion: 'importación de maquinaria',
  contacto: 'contacto general',
};

function enviarSolicitudServicio(s) {
  const servicio = NOMBRE_SERVICIO[s.servicio] || s.servicio;
  const detalle = Object.entries(s.detalle || {}).filter(([, v]) => v !== '' && v != null);

  const cuerpo = [
    `Nueva solicitud de ${servicio}.`,
    '',
    '── Contacto ──',
    `Nombre: ${s.nombre}`,
    `Teléfono: ${s.telefono}`,
    s.correo ? `Correo: ${s.correo}` : null,
    s.empresa ? `Empresa: ${s.empresa}` : null,
    '',
    '── Lo que pide ──',
    ...detalle.map(([k, v]) => `${k}: ${v}`),
    '',
    `Referencia ${s.referencia}`,
  ].filter((l) => l !== null).join('\n');

  /* Una cotización es trabajo de ventas; un «contacto general» todavía
     no se sabe de quién es. El área decide a qué buzón va la copia y a
     dónde contesta el cliente si responde. */
  const area = s.servicio === 'contacto' ? 'general' : 'ventas';

  avisarInternamente({
    buzon: area,
    asunto: `Solicitud de ${servicio} · ${s.nombre} · ${s.referencia}`,
    texto: cuerpo,
    html: envoltura({
      titulo: `Solicitud de ${servicio}`,
      responderA: BUZONES[area],
      parrafos: [
        `<b style="color:${AZUL}">${esc(s.nombre)}</b> pide una cotización.`,
        `Teléfono: <b>${esc(s.telefono)}</b>${s.correo ? ` · Correo: ${esc(s.correo)}` : ''}`,
      ],
      extra: tarjeta(filas([
        ['Referencia', s.referencia],
        ['Nombre', s.nombre],
        ['Teléfono', s.telefono],
        ['Correo', s.correo],
        ['Empresa', s.empresa],
        ...detalle,
      ])),
    }),
  });

  if (!s.correo) return { entregado: true };

  return enviar({
    para: s.correo,
    responderA: BUZONES[area],
    asunto: `Recibimos su solicitud · ${s.referencia}`,
    texto: [
      `Hola ${s.nombre},`,
      '',
      `Recibimos su solicitud de ${servicio}. La referencia es ${s.referencia}.`,
      'Le respondemos con precio y disponibilidad, normalmente el mismo día hábil.',
      '',
      'Si necesita adelantar algo, responda a este correo citando la referencia.',
    ].join('\n'),
    html: envoltura({
      titulo: 'Recibimos su solicitud',
      responderA: BUZONES[area],
      parrafos: [
        `Hola ${esc(s.nombre)}, ya tenemos su solicitud de ${esc(servicio)}.`,
        'Le respondemos con precio y disponibilidad, normalmente el mismo día hábil.',
      ],
      extra: tarjeta(filas([['Referencia', s.referencia]])),
    }),
  });
}

function enviarSolicitudDealer(s) {
  const linea = (rotulo, valor) => (valor == null || valor === '' ? null : `${rotulo}: ${valor}`);
  const ubicacion = [s.direccion, s.municipio, s.provincia].filter(Boolean).join(', ');

  const cuerpo = [
    'Solicitud de cuenta de dealer pendiente de revisión.',
    '',
    '── Empresa ──',
    linea('Razón social', s.razon_social),
    linea('Nombre comercial', s.nombre_comercial),
    linea('RNC', s.rnc),
    linea('Años operando', s.anios_operando),
    linea('Dirección', ubicacion),
    linea('Teléfono', s.telefono),
    linea('Web', s.web),
    '',
    '── Responsable ──',
    linea('Encargado', s.encargado),
    linea('Cargo', s.cargo),
    linea('Abrió la cuenta', s.solicitante),
    linea('Correo', s.correo_solicitante),
    '',
    '── Operación ──',
    linea('Equipos en inventario', s.equipos_inventario),
    linea('Equipos que desea publicar', s.equipos_publicar),
    linea('Tipos de equipo', s.tipos_equipo),
    '',
    '── Contexto ──',
    linea('Cómo nos conoció', s.origen),
    linea('Comentario', s.comentario),
    '',
    `Solicitud ${s.id}`,
    'Apruébela o recházela en /admin.html',
  ].filter((l) => l !== null).join('\n');

  return enviar({
    para: BUZONES.revision,
    responderA: BUZONES.revision,
    asunto: `Solicitud de dealer · ${s.razon_social}`,
    texto: cuerpo,
    html: envoltura({
      titulo: 'Solicitud de dealer',
      responderA: BUZONES.revision,
      parrafos: [`<b style="color:${AZUL}">${esc(s.razon_social)}</b> pide cuenta de empresa.`],
      extra: tarjeta(filas([
        ['Razón social', s.razon_social],
        ['Nombre comercial', s.nombre_comercial],
        ['RNC', s.rnc],
        ['Años operando', s.anios_operando],
        ['Ubicación', ubicacion],
        ['Teléfono', s.telefono],
        ['Encargado', s.encargado],
        ['Cargo', s.cargo],
        ['Abrió la cuenta', s.solicitante],
        ['Correo', s.correo_solicitante],
        ['En inventario', s.equipos_inventario],
        ['Desea publicar', s.equipos_publicar],
        ['Tipos de equipo', s.tipos_equipo],
        ['Cómo nos conoció', s.origen],
        ['Comentario', s.comentario],
      ])),
      accion: { texto: 'Revisar la solicitud', url: `${SITIO}/admin.html` },
      nota: `El RNC es un dato reservado: sirve para comprobar la empresa contra el registro `
        + `mercantil y no debe copiarse a ninguna ficha ni página pública. Solicitud ${esc(s.id)}.`,
    }),
  });
}

/* Resultado de la revisión, para la empresa. Un rechazo explica por
   qué y cómo volver a intentarlo: una negativa sin motivo genera una
   respuesta preguntando qué pasó, que hay que contestar igual. */
function enviarResolucionDealer({ para, nombre, empresa, aprobada, motivo, slug }) {
  const texto = aprobada
    ? [
      nombre ? `Hola, ${nombre}:` : 'Hola:', '',
      `Revisamos los datos de ${empresa} y su cuenta de dealer quedó aprobada.`, '',
      'Ya puede publicar equipos y su página de empresa aparecerá en el directorio',
      'en cuanto contrate un plan que la incluya.',
      slug ? `Su dirección será: https://mercamaquinarias.com/dealer.html?d=${slug}` : null,
      '',
      'MercaMaquinarias',
    ]
    : [
      nombre ? `Hola, ${nombre}:` : 'Hola:', '',
      `Revisamos la solicitud de ${empresa} y por ahora no podemos aprobarla.`, '',
      motivo ? `Motivo: ${motivo}` : 'No pudimos confirmar los datos de la empresa.',
      '',
      'Su cuenta sigue activa y puede escribirnos a dealers@mercamaquinarias.com con la',
      'documentación corregida para que la revisemos de nuevo.',
      '',
      'MercaMaquinarias',
    ];

  const saludo = nombre ? `Hola, ${nombre}:` : 'Hola:';

  return enviar({
    para,
    // Quien pregunta por su alta de dealer escribe a quien la revisa.
    responderA: BUZONES.revision,
    asunto: aprobada
      ? `Su cuenta de dealer quedó aprobada · MercaMaquinarias`
      : `Sobre su solicitud de cuenta de dealer · MercaMaquinarias`,
    texto: texto.filter((l) => l !== null).join('\n'),
    html: aprobada
      ? envoltura({
        titulo: 'Su cuenta de dealer quedó aprobada',
        saludo,
        responderA: BUZONES.revision,
        parrafos: [
          `Revisamos los datos de <b style="color:${AZUL}">${esc(empresa)}</b> y su cuenta de empresa está aprobada.`,
          'Ya puede publicar equipos. Su página de empresa aparecerá en el directorio en cuanto contrate un plan que la incluya.',
        ],
        extra: slug ? tarjeta(`
          <div style="font-family:${TIPO};font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${GRIS_CLARO}">Su página pública</div>
          <div style="margin-top:6px;font-family:${TIPO};font-size:15px;font-weight:600;color:${AZUL};word-break:break-all">${SITIO}/dealer.html?d=${esc(slug)}</div>`) : '',
        accion: { texto: 'Publicar un equipo', url: `${SITIO}/publicar.html` },
      })
      : envoltura({
        titulo: 'Sobre su solicitud',
        saludo,
        responderA: BUZONES.revision,
        parrafos: [
          `Revisamos la solicitud de <b style="color:${AZUL}">${esc(empresa)}</b> y por ahora no podemos aprobarla.`,
        ],
        extra: tarjeta(`
          <div style="font-family:${TIPO};font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:${GRIS_CLARO}">Motivo</div>
          <div style="margin-top:6px;font-family:${TIPO};font-size:14.5px;line-height:1.6;color:${AZUL}">${esc(motivo || 'No pudimos confirmar los datos de la empresa.')}</div>`),
        nota: 'Su cuenta sigue activa. Escríbanos a '
          + `<a href="mailto:${esc(REVISION)}" style="color:${AMBAR}">${esc(REVISION)}</a>`
          + ' con la documentación corregida y la revisamos de nuevo.',
      }),
  });
}

/* ── Ciclo de vida del anuncio ──────────────────────────── */

const fecha = (iso) => (iso
  ? new Date(iso).toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' })
  : null);

/* Confirmación de publicación. Lleva el enlace a la ficha porque es lo
   primero que quiere hacer quien acaba de publicar: verla y
   compartirla. */
const enviarAnuncioPublicado = ({ para, nombre, equipo, idAnuncio, vence, plan }) => enviar({
  para,
  responderA: BUZONES.anuncios,
  asunto: `Su ${equipo} ya está publicado · MercaMaquinarias`,
  texto: [
    nombre ? `Hola, ${nombre}:` : 'Hola:', '',
    `Su anuncio de ${equipo} está publicado y visible en el catálogo.`, '',
    `Verlo: ${SITIO}/equipo.html?id=${idAnuncio}`,
    plan ? `Plan: ${plan}` : null,
    vence ? `Vigente hasta el ${fecha(vence)}.` : 'Se mantiene publicado mientras la membresía siga activa.',
    '',
    'Desde su panel puede editarlo, pausarlo, marcarlo como vendido y ver',
    `cuánta gente lo está mirando: ${SITIO}/panel.html`, '',
    'MercaMaquinarias',
  ].filter((l) => l !== null).join('\n'),
  html: envoltura({
    titulo: 'Su equipo ya está publicado',
    saludo: nombre ? `Hola, ${nombre}:` : 'Hola:',
    parrafos: ['Su anuncio está visible en el catálogo y cualquiera puede encontrarlo.'],
    extra: tarjeta(`
      <div style="font-family:${TIPO};font-size:18px;font-weight:700;color:${AZUL};line-height:1.3">${esc(equipo)}</div>
      ${filas([
    ['Plan', plan],
    ['Vigente hasta', vence ? fecha(vence) : 'Mientras la membresía siga activa'],
  ])}`),
    accion: { texto: 'Ver el anuncio', url: `${SITIO}/equipo.html?id=${idAnuncio}` },
    nota: `Desde <a href="${SITIO}/panel.html" style="color:${AMBAR}">su panel</a> puede editarlo, `
      + 'pausarlo, marcarlo como vendido y ver cuánta gente lo está mirando.',
  }),
});

/* Aviso previo al vencimiento. Se manda una sola vez por anuncio; de
   eso se encarga quien llama, anotándolo en la base. */
const enviarAnuncioPorVencer = ({ para, nombre, equipo, idAnuncio, vence, dias }) => enviar({
  para,
  responderA: BUZONES.anuncios,
  asunto: `Su ${equipo} vence en ${dias} ${dias === 1 ? 'día' : 'días'} · MercaMaquinarias`,
  texto: [
    nombre ? `Hola, ${nombre}:` : 'Hola:', '',
    `Su anuncio de ${equipo} deja de publicarse el ${fecha(vence)}.`, '',
    'Si todavía no lo ha vendido, puede renovarlo desde el panel y sigue',
    'apareciendo en el catálogo sin perder las visitas acumuladas:',
    `${SITIO}/panel.html`, '',
    'Si ya lo vendió, márquelo como vendido y así no le volvemos a escribir.', '',
    'MercaMaquinarias',
  ].join('\n'),
  html: envoltura({
    titulo: `Su anuncio vence en ${dias} ${dias === 1 ? 'día' : 'días'}`,
    saludo: nombre ? `Hola, ${nombre}:` : 'Hola:',
    parrafos: ['Si todavía no lo ha vendido, renuévelo y sigue apareciendo en el catálogo sin perder las visitas acumuladas.'],
    extra: tarjeta(`
      <div style="font-family:${TIPO};font-size:18px;font-weight:700;color:${AZUL};line-height:1.3">${esc(equipo)}</div>
      <div style="margin-top:10px;font-family:${TIPO};font-size:13px;color:${GRIS_CLARO}">Deja de publicarse el</div>
      <div style="margin-top:2px;font-family:${TIPO};font-size:20px;font-weight:800;color:${AMBAR}">${esc(fecha(vence))}</div>`),
    accion: { texto: 'Renovar el anuncio', url: `${SITIO}/panel.html` },
    nota: 'Si ya lo vendió, márquelo como vendido en el panel y así no le volvemos a escribir por este equipo.',
  }),
});

const enviarAnuncioVencido = ({ para, nombre, equipo, idAnuncio }) => enviar({
  para,
  responderA: BUZONES.anuncios,
  asunto: `Su ${equipo} dejó de publicarse · MercaMaquinarias`,
  texto: [
    nombre ? `Hola, ${nombre}:` : 'Hola:', '',
    `El anuncio de ${equipo} llegó al final de su vigencia y ya no aparece en el catálogo.`, '',
    'Sus fotos, su descripción y sus estadísticas siguen guardadas: renovarlo',
    `lo vuelve a publicar tal como estaba. ${SITIO}/panel.html`, '',
    'MercaMaquinarias',
  ].join('\n'),
  html: envoltura({
    titulo: 'Su anuncio dejó de publicarse',
    saludo: nombre ? `Hola, ${nombre}:` : 'Hola:',
    parrafos: ['Llegó al final de su vigencia y ya no aparece en el catálogo.'],
    extra: tarjeta(`
      <div style="font-family:${TIPO};font-size:18px;font-weight:700;color:${AZUL};line-height:1.3">${esc(equipo)}</div>`),
    accion: { texto: 'Volver a publicarlo', url: `${SITIO}/panel.html` },
    nota: 'Sus fotos, su descripción y sus estadísticas siguen guardadas. Renovarlo lo publica de nuevo tal como estaba.',
  }),
});

/* Comprobante del cobro. No sustituye a la factura fiscal; sirve para
   que el anunciante tenga por escrito qué contrató y por cuánto.

   Va con copia a facturación, como mensaje aparte: cada cobro tiene que
   quedar registrado en el buzón del área aunque el correo del cliente
   rebote. */
const enviarComprobante = ({ para, nombre, plan, subtotal, itbis, total, referencia, fin }) => {
  const dinero = (n) => `RD$${Number(n).toLocaleString('en-US')}`;

  avisarInternamente({
    buzon: 'facturacion',
    asunto: `Cobro ${referencia} · ${plan} · ${dinero(total)}`,
    texto: [
      'Pago confirmado.',
      '',
      `Cliente:    ${nombre || '(sin nombre)'} <${para}>`,
      `Plan:       ${plan}`,
      `Subtotal:   ${dinero(subtotal)}`,
      `ITBIS 18%:  ${dinero(itbis)}`,
      `Total:      ${dinero(total)}`,
      `Referencia: ${referencia}`,
      fin ? `Vigente hasta el ${fecha(fin)}.` : null,
    ].filter((l) => l !== null).join('\n'),
    html: envoltura({
      titulo: 'Pago confirmado',
      responderA: BUZONES.facturacion,
      parrafos: [`<b style="color:${AZUL}">${esc(nombre || para)}</b> contrató el plan ${esc(plan)}.`],
      extra: tarjeta(filas([
        ['Cliente', nombre],
        ['Correo', para],
        ['Plan', plan],
        ['Subtotal', dinero(subtotal)],
        ['ITBIS 18%', dinero(itbis)],
        ['Total', dinero(total)],
        ['Referencia', referencia],
        ['Vigente hasta', fin ? fecha(fin) : null],
      ])),
    }),
  });

  return enviar({
    para,
    responderA: BUZONES.facturacion,
    asunto: `Comprobante de su plan ${plan} · MercaMaquinarias`,
    texto: [
      nombre ? `Hola, ${nombre}:` : 'Hola:', '',
      `Confirmamos la contratación del plan ${plan}.`, '',
      `Subtotal:   ${dinero(subtotal)}`,
      `ITBIS 18%:  ${dinero(itbis)}`,
      `Total:      ${dinero(total)}`,
      `Referencia: ${referencia}`,
      fin ? `Vigente hasta el ${fecha(fin)}.` : null,
      '',
      `Su historial de pagos está en ${SITIO}/panel.html`, '',
      'MercaMaquinarias',
    ].filter((l) => l !== null).join('\n'),
    html: envoltura({
      titulo: 'Comprobante de su plan',
      saludo: nombre ? `Hola, ${nombre}:` : 'Hola:',
      responderA: BUZONES.facturacion,
      parrafos: [`Confirmamos la contratación del plan <b style="color:${AZUL}">${esc(plan)}</b>.`],
    extra: tarjeta(`
      ${filas([
    ['Subtotal', `RD$${Number(subtotal).toLocaleString('en-US')}`],
    ['ITBIS 18%', `RD$${Number(itbis).toLocaleString('en-US')}`],
  ])}
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px;padding-top:12px;border-top:2px solid ${AZUL}">
        <tr>
          <td style="font-family:${TIPO};font-size:15px;font-weight:700;color:${AZUL}">Total</td>
          <td align="right" style="font-family:${TIPO};font-size:21px;font-weight:800;color:${AZUL}">RD$${Number(total).toLocaleString('en-US')}</td>
        </tr>
      </table>
      ${filas([
    ['Referencia', referencia],
    ['Vigente hasta', fin ? fecha(fin) : null],
  ])}`),
      accion: { texto: 'Ver mi historial de pagos', url: `${SITIO}/panel.html` },
      nota: 'Este comprobante confirma lo contratado y su importe. No sustituye a la factura fiscal.',
    }),
  });
};

/* Aviso al vendedor de que alguien pidió su contacto. Es la señal de
   que el anuncio está funcionando, y la razón principal por la que
   alguien renueva. */
const enviarContactoRecibido = ({ para, nombre, equipo, idAnuncio, via }) => enviar({
  para,
  responderA: BUZONES.anuncios,
  asunto: `Alguien pidió su contacto por el ${equipo} · MercaMaquinarias`,
  texto: [
    nombre ? `Hola, ${nombre}:` : 'Hola:', '',
    `Una persona interesada pidió su ${via === 'whatsapp' ? 'WhatsApp' : 'teléfono'}`,
    `desde el anuncio de ${equipo}.`, '',
    'No tenemos sus datos: el contacto ocurre directamente entre ustedes.',
    'Le avisamos para que esté pendiente de la llamada o del mensaje.', '',
    `Ver el anuncio y sus estadísticas: ${SITIO}/panel.html`, '',
    'MercaMaquinarias',
  ].join('\n'),
  html: envoltura({
    titulo: 'Alguien pidió su contacto',
    saludo: nombre ? `Hola, ${nombre}:` : 'Hola:',
    parrafos: [
      `Una persona interesada pidió su <b style="color:${AZUL}">${via === 'whatsapp' ? 'WhatsApp' : 'teléfono'}</b> desde este anuncio.`,
    ],
    extra: tarjeta(`
      <div style="font-family:${TIPO};font-size:18px;font-weight:700;color:${AZUL};line-height:1.3">${esc(equipo)}</div>`),
    accion: { texto: 'Ver sus estadísticas', url: `${SITIO}/panel.html` },
    nota: 'No tenemos los datos de esa persona: el contacto ocurre directamente entre ustedes. '
      + 'Le avisamos para que esté pendiente de la llamada o del mensaje.',
  }),
});

/* Bienvenida, tras confirmar el correo. Orienta sobre el primer paso
   en vez de limitarse a celebrar el registro. */
const enviarBienvenida = ({ para, nombre, esDealer }) => enviar({
  para,
  responderA: BUZONES.general,
  asunto: 'Su cuenta de MercaMaquinarias está lista',
  texto: [
    nombre ? `Hola, ${nombre}:` : 'Hola:', '',
    'Su correo quedó confirmado y ya puede usar su cuenta.', '',
    esDealer
      ? [
        'Como pidió una cuenta de empresa, revisaremos los datos que nos dio',
        'y le escribiremos con el resultado, normalmente en menos de 24 horas',
        'hábiles. Mientras tanto puede ir preparando sus equipos.',
      ].join('\n')
      : [
        'Para publicar un equipo necesita sus fotos, el año, las horas de uso',
        'y el precio. El asistente le guía paso a paso y toma unos minutos.',
      ].join('\n'),
    '',
    `Publicar un equipo: ${SITIO}/publicar.html`,
    `Su panel:           ${SITIO}/panel.html`, '',
    'MercaMaquinarias',
  ].join('\n'),
  html: envoltura({
    titulo: 'Su cuenta está lista',
    saludo: nombre ? `Hola, ${nombre}:` : 'Hola:',
    parrafos: [
      'Su correo quedó confirmado y ya puede usar su cuenta.',
      esDealer
        ? 'Como pidió una cuenta de empresa, revisaremos los datos que nos dio y le escribiremos con el resultado, normalmente en menos de 24 horas hábiles. Mientras tanto puede ir preparando sus equipos.'
        : 'Para publicar un equipo necesita sus fotos, el año, las horas de uso y el precio. El asistente le guía paso a paso y toma unos minutos.',
    ],
    accion: { texto: 'Publicar un equipo', url: `${SITIO}/publicar.html` },
    nota: `Su panel está en <a href="${SITIO}/panel.html" style="color:${AMBAR}">${SITIO}/panel.html</a>. `
      + 'Ahí verá sus anuncios, cuánta gente los mira y cuántos piden su contacto.',
  }),
});

module.exports = {
  enviar, enviarCodigo, enviarAvisoCambioClave,
  enviarSolicitudDealer, enviarResolucionDealer, enviarSolicitudServicio,
  enviarAnuncioPublicado, enviarAnuncioPorVencer, enviarAnuncioVencido,
  enviarComprobante, enviarContactoRecibido, enviarBienvenida,
  avisarInternamente,
  // Verificación de teléfonos: el SMS va apagado tras MERCA_SMS.
  enviarCodigoContacto, textoSmsContacto, enviarSms, smsActivo, BANDEJA_SMS,
  BANDEJA, SITIO, BUZONES, EMPRESA, avisarInternamente,
  // Nombres sueltos que ya usaba otro código. BUZONES es lo que hay que
  // usar a partir de ahora.
  REVISION, RESPUESTAS, SOPORTE,
};
