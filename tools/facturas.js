/**
 * facturas.js — emisión de comprobantes. Sin dependencias.
 *
 * QUÉ SE EMITE Y CUÁNDO
 *
 * Todo pago aprobado genera un comprobante. Siempre, lo pida el cliente
 * o no: es la constancia de lo que se cobró, y no tenerla es lo que
 * convierte una reclamación en la palabra de uno contra la del otro.
 *
 * Qué tipo depende de si el cliente pidió comprobante fiscal:
 *
 *   · Pide RNC          → FACTURA DE CRÉDITO FISCAL, con NCF B01.
 *   · No pide RNC       → lo correcto sería una factura de consumo con
 *                         NCF B02… que TODAVÍA NO EXISTE. Mientras la
 *                         DGII no apruebe esa secuencia, se emite un
 *                         RECIBO DE PAGO rotulado como NO FISCAL.
 *   · Devolución        → NOTA DE CRÉDITO con NCF B04, enlazada al
 *                         comprobante original, que no se toca.
 *
 * LO DEL B02 NO ES UN DETALLE. El sitio va a vender sobre todo a
 * particulares y a empresas pequeñas que no piden crédito fiscal: es
 * decir, a la mayoría le corresponde justo la secuencia que falta. El
 * código ya sabe emitirla; en cuanto se cargue el rango en
 * `secuencias_ncf` con usa_sitio = 1, deja de salir el recibo y empieza
 * a salir la factura. No hay que tocar nada más.
 *
 * UN COMPROBANTE EMITIDO NO SE MODIFICA NI SE BORRA. Si hay que anular,
 * se emite una nota de crédito.
 *
 * Su PDF tampoco se reescribe: el archivo que se le mandó al cliente y
 * el que queda guardado son el mismo. La única excepción es el papel
 * que NUNCA llegó a existir —porque dibujarlo falló, o porque el
 * archivo se perdió— y ahí `regenerarPdfsPendientes` lo dibuja de
 * nuevo a partir de la fila, que es la que manda. No cambia un número
 * ni un importe: repone un documento que faltaba. Dejarlo sin reponer
 * sería peor, porque un comprobante emitido hay que poder recuperarlo.
 */

const fs = require('fs');
const path = require('path');

const db = require('./db');
const pdf = require('./pdf');
const correo = require('./correo');
const precios = require('../assets/precios.js');
const { enLetras } = require('./numero-a-letras.js');

const RAIZ = path.resolve(__dirname, '..');

/* Fuera del proyecto, como las fotos y los videos: así un despliegue no
   los toca y entran en el respaldo diario. */
const CARPETA = process.env.MERCA_FACTURAS || path.join(RAIZ, '.tmp', 'facturas');

/* Aviso cuando una secuencia se está acabando.
 *
 * Dos umbrales, no uno: al quedar pocos se avisa para que dé tiempo a
 * pedir más, y al quedar uno se vuelve a avisar porque el siguiente
 * cobro ya sale sin comprobante fiscal. El primero es configurable
 * —B01 tiene quince números en total y B15 cincuenta, y lo que es
 * «pocos» no es lo mismo en cada caso—; el segundo no, porque quedarse
 * en uno significa lo mismo siempre. */
const AVISAR_BAJO = Math.max(1, Number(process.env.MERCA_AVISO_NCF) || 5);
const AVISAR_CRITICO = 1;

const TITULOS = {
  recibo: 'RECIBO DE PAGO',
  factura_consumo: 'FACTURA DE CONSUMO',
  factura_credito_fiscal: 'FACTURA DE CRÉDITO FISCAL',
  nota_credito: 'NOTA DE CRÉDITO',
};

const pesos = (n) => `RD$ ${Number(n || 0).toLocaleString('en-US', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
})}`;

const fechaLarga = (iso) => new Date(iso).toLocaleDateString('es-DO', {
  day: '2-digit', month: 'long', year: 'numeric',
});

const fechaCorta = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`;
};

/* Cómo se cobró, en palabras.
 *
 * `procesador` es lo que la base guarda del cobro. Traducirlo aquí y no
 * en la base deja el nombre técnico donde sirve —en los registros— y
 * pone en el papel lo que el cliente reconoce. */
const METODOS = {
  interna: 'Cortesía interna',
  demo: 'Pago en línea',
  transferencia: 'Transferencia bancaria',
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
};

/* ── El documento ───────────────────────────────────────── */

/* Dibuja el comprobante. Devuelve el PDF en memoria.
 *
 * La maqueta es la de `tools/plantilla-factura.html`, que es la fuente
 * del diseño y lo que ve el cliente en el panel: membrete con el emisor
 * a la izquierda y el recuadro del comprobante a la derecha, dos cajas
 * de datos, el detalle en tabla con la cabecera en negativo, los
 * totales a la derecha con el importe en letras enfrente, y el pie
 * legal anclado abajo.
 *
 * POR QUÉ SE REDIBUJA EN VEZ DE IMPRIMIR EL HTML
 *
 * Imprimir la plantilla sería más fiel, pero pide un Chromium en el
 * servidor: 300 MB de disco y picos de 200 MB de RAM en un droplet de
 * 512 que además sirve el sitio y la base. La plantilla no lleva nada
 * que no quepa aquí —texto en rejilla, dos recuadros, una tabla— así
 * que se redibuja con `pdf.js` y el HTML se reserva para la vista web
 * del mismo comprobante, que sí es idéntica.
 *
 * Campos opcionales de `f` que la maqueta contempla y que, si no
 * vienen, no dejan hueco: `ncf_vencimiento`, `ncf_modificado`,
 * `referencia_pago`, `metodo_pago`, `periodo_servicio`, `telefono`,
 * `correo`, `descuento`, `cantidad`, `precio_unitario`, `notas`. */
function dibujar(f, { emisor }) {
  const d = pdf.documento();
  const M = 40;                       // margen
  const ANCHO_UTIL = d.ANCHO - M * 2;
  const TINTA = '#141616';
  const AMBAR = '#F2A900';
  const GRIS = '#55605C';
  const GRIS_SUAVE = '#7A8481';
  const LINEA = '#E8EBE9';
  const BORDE = '#DFE3E1';
  const FONDO = '#FAFAF8';

  /* ── Membrete ─────────────────────────────────────────── */

  /* El nombre va compuesto, no como imagen: incrustar un logotipo
     obligaría a decodificar PNG a mano por no traer dependencias, y el
     resultado se vería peor que el texto. */
  d.texto('Merca', M, 58, { tamano: 19, tipo: 'negrita', color: TINTA });
  d.texto('Maquinarias', M + pdf.anchoDe('Merca', 19, true), 58, { tamano: 19, tipo: 'negrita', color: AMBAR });

  let yEmisor = 74;
  d.texto(emisor.razonSocial, M, yEmisor, { tamano: 9, tipo: 'negrita', color: TINTA });
  yEmisor += 12;
  /* RNC y Registro Mercantil en la misma línea: son los dos números con
     los que se identifica a una empresa dominicana, y separarlos en dos
     renglones robaba altura al membrete sin ganar nada. Si no hay RM
     configurado, sale solo el RNC. */
  d.texto(`RNC ${emisor.rnc}${emisor.registroMercantil ? ` · RM ${emisor.registroMercantil}` : ''}`,
    M, yEmisor, { tamano: 8.5, color: GRIS });
  yEmisor += 12;
  /* El domicilio fiscal SÍ va aquí. En el sitio no aparece —es una
     vivienda—, pero un comprobante sin domicilio del emisor no cumple. */
  yEmisor = d.parrafo(emisor.domicilioFiscal, M, yEmisor, 240, { tamano: 8.5, color: GRIS, interlinea: 1.35 });
  d.texto(`${correo.BUZONES.facturacion} · mercamaquinarias.com`, M, yEmisor, { tamano: 8.5, color: GRIS });
  yEmisor += 12;

  /* ── Recuadro del comprobante ─────────────────────────── */

  const anchoCaja = 208;
  const xCaja = d.ANCHO - M - anchoCaja;
  const padCaja = 11;
  const yCaja = 44;

  const metas = [
    f.ncf_vencimiento ? `Válido hasta ${fechaCorta(f.ncf_vencimiento)}` : null,
    f.ncf_modificado ? `Modifica ${f.ncf_modificado}` : null,
    `No. interno ${f.numero}`,
    `Emitida el ${fechaCorta(f.fecha)}`,
  ].filter(Boolean);

  const altoCaja = 50 + metas.length * 11 + 6;
  d.marco(xCaja, yCaja, anchoCaja, altoCaja, { grosor: 1.2, color: TINTA });

  const derecha = { alinear: 'derecha', ancho: anchoCaja - padCaja * 2 };
  d.texto((TITULOS[f.tipo] || 'COMPROBANTE').toUpperCase(), xCaja + padCaja, yCaja + 17, {
    tamano: 9, tipo: 'negrita', color: TINTA, ...derecha,
  });
  d.texto(f.ncf || 'SIN VALOR FISCAL', xCaja + padCaja, yCaja + 37, {
    tamano: f.ncf ? 15 : 11, tipo: 'negrita', color: f.ncf ? TINTA : GRIS_SUAVE, ...derecha,
  });
  metas.forEach((linea, i) => {
    d.texto(linea, xCaja + padCaja, yCaja + 52 + i * 11, { tamano: 8.2, color: GRIS, ...derecha });
  });

  /* La regla ámbar separa el membrete —que es siempre igual— de lo que
     cambia de un comprobante a otro. */
  let y = Math.max(yEmisor + 8, yCaja + altoCaja + 14);
  d.rect(M, y, ANCHO_UTIL, 3, AMBAR);
  y += 18;

  /* ── Cajas de datos ───────────────────────────────────── */

  const anchoDato = (ANCHO_UTIL - 10) / 2;
  const padDato = 11;

  /* Las dos listas se arman antes para poder darles la misma altura:
     una caja más alta que la otra se lee como un error de maquetación,
     no como que había menos que decir. */
  const cliente = [
    ['nombre', f.razon_social || 'Consumidor final'],
    f.rnc ? ['dato', `RNC / Cédula: ${f.rnc}`] : null,
    f.direccion ? ['dato', f.direccion] : null,
    f.telefono ? ['dato', `Tel. ${f.telefono}`] : null,
    f.correo ? ['dato', f.correo] : null,
  ].filter(Boolean);

  const condiciones = [
    ['dato', `Condición: ${f.condicion_pago || (f.tipo === 'nota_credito' ? 'Anulación' : 'Pagado')}`],
    ['dato', `Método: ${METODOS[f.metodo_pago] || f.metodo_pago || 'Pago en línea'}`],
    f.referencia_pago ? ['dato', `Referencia: ${f.referencia_pago}`] : null,
    f.periodo_servicio ? ['dato', `Período: ${f.periodo_servicio}`] : null,
    ['dato', 'Moneda: Peso dominicano (RD$)'],
  ].filter(Boolean);

  const altoDato = 24 + Math.max(cliente.length, condiciones.length) * 13 + 8;

  const pintarCaja = (x, titulo, lineas) => {
    d.rect(x, y, anchoDato, altoDato, FONDO);
    d.marco(x, y, anchoDato, altoDato, { color: BORDE });
    d.texto(titulo, x + padDato, y + 15, { tamano: 7.6, tipo: 'negrita', color: GRIS_SUAVE });
    lineas.forEach(([clase, linea], i) => {
      d.texto(linea, x + padDato, y + 30 + i * 13, clase === 'nombre'
        ? { tamano: 11, tipo: 'negrita', color: TINTA }
        : { tamano: 8.8, color: GRIS });
    });
  };

  pintarCaja(M, 'FACTURAR A', cliente);
  pintarCaja(M + anchoDato + 10, 'CONDICIONES', condiciones);
  y += altoDato + 20;

  /* ── Detalle ──────────────────────────────────────────── */

  const pad = 9;
  const wNum = 78;
  const xImporte = d.ANCHO - M - pad - wNum;
  const xPrecio = xImporte - 12 - wNum;
  const wCant = 40;
  const xDesc = M + 52;
  const wDesc = xPrecio - 10 - xDesc;

  d.rect(M, y, ANCHO_UTIL, 20, TINTA);
  d.texto('CANT.', M + pad, y + 13.5, { tamano: 7.6, tipo: 'negrita', color: '#FFFFFF', alinear: 'centro', ancho: wCant });
  d.texto('DESCRIPCIÓN', xDesc, y + 13.5, { tamano: 7.6, tipo: 'negrita', color: '#FFFFFF' });
  d.texto('PRECIO UNIT.', xPrecio, y + 13.5, { tamano: 7.6, tipo: 'negrita', color: '#FFFFFF', alinear: 'derecha', ancho: wNum });
  d.texto('IMPORTE', xImporte, y + 13.5, { tamano: 7.6, tipo: 'negrita', color: '#FFFFFF', alinear: 'derecha', ancho: wNum });
  y += 20;

  /* Una fila por concepto. El concepto que llega es del estilo «Plan
     Estándar · 2 cupos · 30 días»: lo de antes del primer separador es
     el nombre, y el resto baja en pequeño como detalle. */
  const lineas = Array.isArray(f.lineas) && f.lineas.length ? f.lineas : [{
    cantidad: f.cantidad || 1,
    concepto: f.concepto || 'Servicio contratado',
    precio: f.precio_unitario != null ? f.precio_unitario : f.subtotal,
    importe: f.subtotal,
  }];

  for (const l of lineas) {
    const partes = String(l.concepto || '').split('·').map((p) => p.trim()).filter(Boolean);
    const titulo = partes.shift() || 'Servicio contratado';
    const detalle = partes.join(' · ');

    const yTexto = y + 15;
    d.texto(String(l.cantidad), M + pad, yTexto, { tamano: 9.5, color: TINTA, alinear: 'centro', ancho: wCant });
    let abajo = d.parrafo(titulo, xDesc, yTexto, wDesc, { tamano: 9.5, tipo: 'negrita', color: TINTA, interlinea: 1.3 });
    if (detalle) abajo = d.parrafo(detalle, xDesc, abajo, wDesc, { tamano: 8.6, color: GRIS_SUAVE, interlinea: 1.3 });
    d.texto(pesos(l.precio), xPrecio, yTexto, { tamano: 9.5, color: TINTA, alinear: 'derecha', ancho: wNum });
    d.texto(pesos(l.importe), xImporte, yTexto, { tamano: 9.5, color: TINTA, alinear: 'derecha', ancho: wNum });

    y = Math.max(abajo, yTexto + 8) + 5;
    d.linea(M, y, d.ANCHO - M, y, { color: LINEA });
  }

  /* ── Totales e importe en letras ──────────────────────── */

  const yCierre = y + 14;
  y = yCierre + 8;

  const anchoTotales = 196;
  const xTotales = d.ANCHO - M - anchoTotales;
  const filaTotal = (etiqueta, valor) => {
    d.texto(etiqueta, xTotales + pad, y, { tamano: 9.3, color: GRIS });
    d.texto(valor, xTotales, y, { tamano: 9.3, color: TINTA, alinear: 'derecha', ancho: anchoTotales - pad });
    y += 15;
  };

  filaTotal('Subtotal', pesos(f.subtotal));
  if (f.descuento) filaTotal('Descuento', `-${pesos(f.descuento)}`);
  filaTotal(`ITBIS ${Math.round((f.itbis_tasa != null ? f.itbis_tasa : precios.ITBIS) * 100)} %`, pesos(f.itbis));

  y += 3;
  d.rect(xTotales, y, anchoTotales, 27, TINTA);
  d.texto('Total', xTotales + pad, y + 18, { tamano: 11.5, tipo: 'negrita', color: '#FFFFFF' });
  d.texto(pesos(f.total), xTotales, y + 18, {
    tamano: 13, tipo: 'negrita', color: AMBAR, alinear: 'derecha', ancho: anchoTotales - pad,
  });
  y += 27;

  /* El importe en letras, enfrente de la cifra: es lo que impide que la
     cifra se retoque después. */
  d.texto('SON', M + 12, yCierre + 9, { tamano: 7.6, tipo: 'negrita', color: GRIS_SUAVE });
  const finLetras = d.parrafo(enLetras(f.total), M + 12, yCierre + 23, xTotales - M - 26, {
    tamano: 9.3, color: '#3C4442', interlinea: 1.4,
  });
  d.rect(M, yCierre + 2, 3, finLetras - yCierre - 10, AMBAR);

  y = Math.max(y, finLetras) + 16;

  /* ── Notas ────────────────────────────────────────────── */

  if (f.notas) {
    const alto = 34;
    d.rect(M, y, ANCHO_UTIL, alto, FONDO);
    d.marco(M, y, ANCHO_UTIL, alto, { color: BORDE });
    d.texto('NOTAS', M + 11, y + 14, { tamano: 7.6, tipo: 'negrita', color: GRIS_SUAVE });
    d.parrafo(f.notas, M + 11, y + 26, ANCHO_UTIL - 22, { tamano: 8.8, color: '#3C4442' });
  }

  /* ── Pie legal ────────────────────────────────────────── */

  /* Lo que hay que advertir cambia con el tipo: un recibo no fiscal
     tiene que decir que no lo es, con todas las letras, y una factura
     de crédito fiscal tiene que decir a qué da derecho. */
  const legales = {
    recibo: 'Este documento no constituye comprobante fiscal. Si requiere factura con valor '
      + 'fiscal, escríbanos a facturacion@mercamaquinarias.com. Se emite como constancia del '
      + 'pago recibido y del servicio contratado.',
    factura_consumo: 'Comprobante fiscal emitido conforme a las normas de la Dirección General '
      + 'de Impuestos Internos (DGII). Es válido como comprobante fiscal únicamente con su '
      + 'Número de Comprobante Fiscal (NCF) impreso y dentro de su fecha de vencimiento.',
    factura_credito_fiscal: 'Comprobante fiscal con derecho a crédito fiscal, emitido conforme a '
      + 'las normas de la Dirección General de Impuestos Internos (DGII). Es válido únicamente '
      + 'con su Número de Comprobante Fiscal (NCF) impreso y dentro de su fecha de vencimiento. '
      + 'Consérvelo para sus registros contables.',
    nota_credito: 'Nota de crédito emitida conforme a las normas de la Dirección General de '
      + 'Impuestos Internos (DGII) para anular total o parcialmente el comprobante que se indica. '
      + 'No sustituye a la devolución del importe, que se tramita por separado.',
  };

  const cierre = 'Los servicios facturados corresponden a capacidad de publicación en la plataforma '
    + 'MercaMaquinarias y no son reembolsables una vez iniciada su vigencia, conforme a las Condiciones '
    + 'de Contratación publicadas en mercamaquinarias.com/legal.html#contratacion. Cualquier reclamación '
    + 'sobre este comprobante debe dirigirse a facturacion@mercamaquinarias.com dentro de los treinta (30) '
    + 'días de su emisión.';

  /* El pie va anclado abajo, no a continuación del detalle: así todos
     los comprobantes terminan a la misma altura, lleven una línea o
     cinco. */
  const yPie = d.ALTO - 108;
  d.linea(M, yPie - 14, d.ANCHO - M, yPie - 14, { color: LINEA });
  const finLegal = d.parrafo(legales[f.tipo] || '', M, yPie, ANCHO_UTIL, {
    tamano: 8, color: GRIS, interlinea: 1.55,
  });
  d.parrafo(cierre, M, finLegal + 4, ANCHO_UTIL, { tamano: 8, color: GRIS_SUAVE, interlinea: 1.55 });

  d.texto('Documento generado electrónicamente. No requiere firma ni sello.',
    M, d.ALTO - 32, { tamano: 8, color: GRIS_SUAVE });
  d.texto(`${f.numero} · ${fechaCorta(f.fecha)}`, d.ANCHO - M - 220, d.ALTO - 32, {
    tamano: 8, color: GRIS_SUAVE, alinear: 'derecha', ancho: 220,
  });

  return d.terminar();
}

/* ── El mismo comprobante, como página ──────────────────── */

/* `plantilla-factura.html` es la fuente del diseño. El PDF la reproduce
 * con `pdf.js` porque en el servidor no cabe un Chromium; esta función
 * la rellena de verdad, para la vista web del panel y para que un
 * cambio de maqueta se vea en algún sitio sin recompilar nada.
 *
 * El motor es reemplazo literal de {{VARIABLE}} más el borrado de los
 * elementos con `data-opcional` cuyo valor viene vacío: una factura sin
 * RNC no puede enseñar una línea de RNC en blanco. */
const PLANTILLA = path.join(__dirname, 'plantilla-factura.html');

/* Todo lo que venga del cliente pasa por aquí antes de entrar en el
   HTML: una razón social con «<script>» no puede llegar al navegador
   de nadie tal cual. */
const escapar = (v) => String(v == null ? '' : v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;');

function variablesDe(f, { emisor = correo.EMPRESA } = {}) {
  const lineas = Array.isArray(f.lineas) && f.lineas.length ? f.lineas : [{
    cantidad: f.cantidad || 1,
    concepto: f.concepto || 'Servicio contratado',
    precio: f.precio_unitario != null ? f.precio_unitario : f.subtotal,
    importe: f.subtotal,
  }];

  const filas = lineas.map((l) => {
    const partes = String(l.concepto || '').split('·').map((p) => p.trim()).filter(Boolean);
    const titulo = escapar(partes.shift() || 'Servicio contratado');
    const detalle = escapar(partes.join(' · '));
    return '<tr>'
      + `<td class="c">${escapar(l.cantidad)}</td>`
      + `<td><strong>${titulo}</strong>${detalle ? `<span class="det">${detalle}</span>` : ''}</td>`
      + `<td class="d">${escapar(pesos(l.precio))}</td>`
      + `<td class="d">${escapar(pesos(l.importe))}</td>`
      + '</tr>';
  }).join('\n');

  return {
    TIPO_DOCUMENTO: TITULOS[f.tipo] || 'COMPROBANTE',
    NCF: f.ncf || 'SIN VALOR FISCAL',
    NCF_VENCIMIENTO: f.ncf_vencimiento ? fechaCorta(f.ncf_vencimiento) : '',
    NCF_MODIFICADO: f.ncf_modificado || '',
    NUMERO_INTERNO: f.numero,
    FECHA_EMISION: fechaCorta(f.fecha),
    CONDICION_PAGO: f.condicion_pago || (f.tipo === 'nota_credito' ? 'Anulación' : 'Pagado'),
    METODO_PAGO: METODOS[f.metodo_pago] || f.metodo_pago || 'Pago en línea',
    REFERENCIA_PAGO: f.referencia_pago || '',
    PERIODO_SERVICIO: f.periodo_servicio || '',
    CLIENTE_NOMBRE: f.razon_social || 'Consumidor final',
    CLIENTE_RNC: f.rnc || '',
    CLIENTE_DIRECCION: f.direccion || '',
    CLIENTE_TELEFONO: f.telefono || '',
    CLIENTE_CORREO: f.correo || '',
    FILAS: filas,
    SUBTOTAL: pesos(f.subtotal),
    DESCUENTO: f.descuento ? pesos(f.descuento) : '',
    ITBIS_TASA: `${Math.round((f.itbis_tasa != null ? f.itbis_tasa : precios.ITBIS) * 100)}%`,
    ITBIS: pesos(f.itbis),
    TOTAL: pesos(f.total),
    TOTAL_LETRAS: enLetras(f.total),
    NOTAS: f.notas || '',
    EMISOR_RAZON_SOCIAL: emisor.razonSocial,
    EMISOR_RNC: emisor.rnc,
    EMISOR_DOMICILIO: emisor.domicilioFiscal,
    EMISOR_CORREO: correo.BUZONES.facturacion,
  };
}

function comoHtml(f, opciones = {}) {
  /* Los comentarios se quitan: documentan la plantilla para quien la
     edita, y lo que se le sirve al cliente es su comprobante, no las
     instrucciones de la maqueta. */
  let html = fs.readFileSync(PLANTILLA, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
  const valores = variablesDe(f, opciones);

  /* Primero se quitan los bloques opcionales vacíos, con la variable
     todavía sin sustituir: así se reconoce el elemento por su atributo
     y no hay que adivinar si lo que quedó dentro era del molde o del
     comprobante. */
  for (const [clave, valor] of Object.entries(valores)) {
    if (valor !== '') continue;
    html = html.replace(
      new RegExp(`\\s*<([a-z]+)[^>]*data-opcional="${clave}"[^>]*>[\\s\\S]*?</\\1>`, 'g'), '');
  }

  for (const [clave, valor] of Object.entries(valores)) {
    /* FILAS ya es HTML generado aquí; lo demás se escapa. */
    const texto = clave === 'FILAS' ? valor : escapar(valor);
    html = html.split(`{{${clave}}}`).join(texto);
  }

  return html;
}

/* ── Guardar en disco ───────────────────────────────────── */

/* Por año y mes, con el número de comprobante como nombre. Buscar «la
   factura MM-2026-000123» es entonces buscar un archivo, sin consultar
   nada. */
function guardarPdf(numero, fecha, bytes) {
  const d = new Date(fecha);
  const carpeta = path.join(CARPETA, String(d.getUTCFullYear()),
    String(d.getUTCMonth() + 1).padStart(2, '0'));
  fs.mkdirSync(carpeta, { recursive: true });

  const archivo = path.join(carpeta, `${numero}.pdf`);
  fs.writeFileSync(archivo, bytes);
  return path.relative(CARPETA, archivo).split(path.sep).join('/');
}

const rutaAbsoluta = (relativa) => path.join(CARPETA, relativa);

const leerPdf = (relativa) => {
  /* La ruta viene de la base, no de una petición, pero se comprueba
     igual: el día que alguien añada un parámetro que llegue hasta aquí,
     esta línea es la que evita que se sirva /etc/passwd. */
  const abs = path.resolve(CARPETA, relativa);
  if (!abs.startsWith(path.resolve(CARPETA) + path.sep)) return null;
  try { return fs.readFileSync(abs); } catch { return null; }
};

/* ── Emisión ────────────────────────────────────────────── */

/* Qué tipo de comprobante corresponde, y con qué NCF.
 *
 * Aquí es donde vive la consecuencia de que falte el B02: si el cliente
 * no pide RNC, se intenta la factura de consumo y, al no haber
 * secuencia, se cae al recibo no fiscal. El día que exista, este mismo
 * código emite la factura sin tocar una línea. */
function decidirTipo({ quiereFiscal }) {
  if (quiereFiscal) {
    const ncf = db.tomarNcf('B01');
    if (ncf) return { tipo: 'factura_credito_fiscal', ...ncf };
    /* Sin B01 disponible no se puede prometer crédito fiscal. Se emite
       el recibo y se avisa: es preferible un comprobante honesto que
       una factura sin número autorizado. */
    return { tipo: 'recibo', ncf: null, agotada: 'B01' };
  }

  const ncf = db.tomarNcf('B02');
  if (ncf) return { tipo: 'factura_consumo', ...ncf };
  return { tipo: 'recibo', ncf: null };
}

/* Emite el comprobante de un pago. Devuelve la fila creada.
 *
 * No manda el correo: eso lo hace `enviar()`, aparte, para que un fallo
 * del proveedor de correo no impida que el comprobante quede emitido y
 * guardado. Emitir y notificar son dos cosas distintas y fallan por
 * motivos distintos. */
function emitirPorPago(pago, { concepto, detalle = {}, cliente = {}, emisor = correo.EMPRESA }) {
  const yaEsta = db.facturaDePago(pago.id);
  if (yaEsta) return yaEsta;                    // no se emite dos veces

  const decision = decidirTipo({ quiereFiscal: !!cliente.rnc });

  const { id: idFactura, numero } = db.crearFactura({
    pagoId: pago.id,
    organizacionId: pago.organizacion_id,
    tipo: decision.tipo,
    ncf: decision.ncf,
    ncfVencimiento: decision.vence || null,
    razonSocial: cliente.razonSocial || null,
    rnc: cliente.rnc || null,
    direccion: cliente.direccion || null,
    telefono: cliente.telefono || null,
    correo: cliente.correo || null,
    concepto,
    subtotal: pago.subtotal,
    itbis: pago.itbis,
    /* La tasa se deduce de lo cobrado, no de la constante: si un día el
       ITBIS cambia, un pago viejo que se facture tarde tiene que
       llevar la tasa con la que se cobró. */
    itbisTasa: pago.subtotal ? Math.round((pago.itbis / pago.subtotal) * 10000) / 10000 : precios.ITBIS,
    total: pago.total,
    moneda: pago.moneda || 'DOP',
    condicionPago: 'Pagado',
    metodoPago: pago.procesador || null,
    referenciaPago: pago.referencia || null,
    periodoServicio: detalle.periodo || null,
    /* La fecha del comprobante es cuando entró el dinero, no cuando se
       pidió el cobro: una transferencia confirmada días después caería
       en el mes equivocado. Los pagos anteriores a `confirmado` no la
       tienen y usan `creado`, como siempre. */
    fecha: pago.confirmado || pago.creado,
  });

  /* El PDF va APARTE y a prueba de fallos.
   *
   * Dibujar un documento puede fallar por cosas que no tienen nada que
   * ver con el cobro: una razón social con un carácter raro, el disco
   * lleno. Si eso tumbara la emisión, el NCF ya consumido se quedaría
   * sin factura y la DGII vería un salto en la secuencia que hay que
   * justificar por escrito. Así que la fila se emite igual y el papel
   * se regenera después: `regenerarPdfsPendientes` lo recoge.
   *
   * Lo que NO puede pasar es que el correo salga sin adjunto y la
   * factura quede marcada como enviada, porque entonces ninguna tarea
   * vuelve a mirarla nunca. De eso se ocupa `enviar()`. */
  try {
    const fila = db.facturaPorId(idFactura);
    const bytes = dibujar({ ...fila, ...detalle }, { emisor });
    const ruta = guardarPdf(numero, fila.fecha, bytes);
    db.anotarPdf(idFactura, ruta);
  } catch (e) {
    console.error(`facturas: ${numero} quedó emitida sin PDF · ${e.message}`);
  }

  return { ...db.facturaPorId(idFactura), agotada: decision.agotada };
}

/* Vuelve a dibujar los comprobantes que quedaron sin papel.
 *
 * Los busca por `ruta_pdf` nulo o por archivo que ya no está en disco.
 * Un comprobante emitido hay que poder recuperarlo, y el número y los
 * importes no se tocan: se redibuja exactamente lo que dice la fila. */
function regenerarPdfsPendientes({ limite = 200, emisor = correo.EMPRESA } = {}) {
  const hechos = [];
  const fallos = [];

  for (const f of db.facturas({ limite })) {
    /* `ruta_pdf` se guarda RELATIVA a la carpeta de comprobantes, así
       que hay que resolverla antes de preguntar si el archivo está.
       Comprobarla tal cual daba siempre que no, y esta función pasaba
       de reponer lo que falta a redibujarlo todo: exactamente lo que la
       cabecera de este archivo prohíbe. */
    const falta = !f.ruta_pdf || !fs.existsSync(rutaAbsoluta(f.ruta_pdf));
    if (!falta) continue;
    try {
      const bytes = dibujar(f, { emisor });
      db.anotarPdf(f.id, guardarPdf(f.numero, f.fecha, bytes));
      hechos.push(f.numero);
    } catch (e) {
      fallos.push(`${f.numero}: ${e.message}`);
    }
  }

  return { hechos, fallos };
}

/* Nota de crédito que anula un comprobante. El original no se toca:
   solo se le anota quién lo anuló. */
function emitirNotaCredito(original, { motivo, emisor = correo.EMPRESA } = {}) {
  if (!original) return null;
  if (original.anulado_por) return db.facturaPorId(original.anulado_por);

  const ncf = db.tomarNcf('B04');

  /* Sin B04 no hay nota de crédito que valga.
   *
   * Antes se seguía adelante con el NCF en nulo y la API respondía 201
   * tan campante: salía un papel con el sello SIN VALOR FISCAL y un pie
   * afirmando que se emite conforme a las normas de la DGII. El cliente
   * se quedaba con la factura original vigente y una anulación que
   * fiscalmente no anulaba nada, y nadie se enteraba hasta la
   * inspección. El rango son diez números; a la undécima devolución
   * pasaba esto.
   *
   * Vale más un error claro en pantalla —«pida el rango»— que un
   * documento que aparenta lo que no es. Se lanza antes de tocar nada,
   * así que el comprobante original queda intacto. */
  if (!ncf) {
    const e = new Error('No quedan notas de crédito autorizadas (B04). '
      + 'Solicite un rango nuevo a la DGII antes de anular este comprobante.');
    e.codigo = 409;
    throw e;
  }

  const { id: idNota, numero } = db.crearFactura({
    pagoId: original.pago_id,
    organizacionId: original.organizacion_id,
    tipo: 'nota_credito',
    ncf: ncf.ncf,
    ncfVencimiento: ncf.vence,
    /* En el papel va el NCF del comprobante que se modifica, que es lo
       que pide la DGII. Si el original fue un recibo sin NCF, va su
       número interno: es lo único que lo identifica. */
    ncfModificado: original.ncf || original.numero,
    razonSocial: original.razon_social,
    rnc: original.rnc,
    direccion: original.direccion,
    telefono: original.telefono,
    correo: original.correo,
    concepto: `Anulación de ${original.numero}${motivo ? ` · ${motivo}` : ''}`,
    subtotal: original.subtotal,
    itbis: original.itbis,
    itbisTasa: original.itbis_tasa,
    total: original.total,
    moneda: original.moneda,
    condicionPago: 'Anulación',
    metodoPago: original.metodo_pago,
    referenciaPago: original.referencia_pago,
    notas: motivo || null,
    anulaA: original.id,
  });

  db.marcarAnulada(original.id, idNota);

  const fila = db.facturaPorId(idNota);
  const bytes = dibujar(fila, { emisor });
  db.anotarPdf(idNota, guardarPdf(numero, fila.fecha, bytes));

  return db.facturaPorId(idNota);
}

/* ── Envío ──────────────────────────────────────────────── */

/* Dos correos independientes: al cliente y al buzón de facturación.
 *
 * Cada uno se marca por separado en la base. Si el del cliente rebota
 * —correo mal escrito, buzón lleno— la copia interna tiene que salir
 * igual: es la que hace de archivo. Por eso NO van como un solo mensaje
 * con copia, y por eso el fallo de uno no corta el otro. */
async function enviar(factura, { correoCliente } = {}) {
  let pdfBytes = factura.ruta_pdf ? leerPdf(factura.ruta_pdf) : null;

  /* Si falta el papel, se intenta dibujar aquí mismo antes de mandar
     nada. Enviar el comprobante sin adjunto y marcarlo como enviado lo
     saca de la lista de pendientes para siempre: el cliente recibe un
     correo que dice «adjuntamos su comprobante» y no adjunta nada, y
     ninguna tarea vuelve a mirarlo. Vale más no mandarlo todavía. */
  if (!pdfBytes) {
    const { hechos } = regenerarPdfsPendientes({ limite: 1000 });
    if (hechos.includes(factura.numero)) {
      const refrescada = db.facturaPorId(factura.id);
      pdfBytes = refrescada && refrescada.ruta_pdf ? leerPdf(refrescada.ruta_pdf) : null;
    }
  }

  if (!pdfBytes) {
    db.sumarIntentoEnvio(factura.id);
    console.error(`facturas: ${factura.numero} sigue sin PDF; no se envía para no darlo por entregado`);
    return db.facturaPorId(factura.id);
  }

  const adjunto = [{ content: pdfBytes.toString('base64'), name: `${factura.numero}.pdf` }];

  const titulo = TITULOS[factura.tipo] || 'Comprobante';

  /* El asunto se busca, no se lee.
   *
   * Lleva delante una etiqueta fija —[Facturación]— para poder filtrar
   * el buzón de una vez, y detrás el número interno y la referencia del
   * cobro, que son los dos códigos por los que alguien busca un
   * comprobante: el primero lo cita el cliente, el segundo cuadra con
   * el banco o el procesador.
   *
   * La etiqueta NO dice «Factura» a secas a propósito: mientras falte
   * la secuencia B02, la mitad de estos documentos son recibos no
   * fiscales, y rotular de factura lo que no lo es es justo el error
   * que la DGII no perdona. «Facturación» vale para los tres tipos y
   * se filtra igual. */
  const referencia = factura.referencia_pago ? ` · ref. ${factura.referencia_pago}` : '';
  const asunto = `[Facturación] ${titulo} ${factura.numero}${referencia}`;

  const resumen = [
    `${titulo} ${factura.numero}`,
    factura.ncf ? `NCF: ${factura.ncf}` : 'Documento sin valor fiscal',
    factura.referencia_pago ? `Referencia del pago: ${factura.referencia_pago}` : null,
    `Fecha: ${fechaLarga(factura.fecha)}`,
    `Cliente: ${factura.razon_social || 'Consumidor final'}`,
    factura.rnc ? `RNC: ${factura.rnc}` : null,
    '',
    `Subtotal:  ${pesos(factura.subtotal)}`,
    `ITBIS:     ${pesos(factura.itbis)}`,
    `Total:     ${pesos(factura.total)}`,
  ].filter((l) => l !== null).join('\n');

  db.sumarIntentoEnvio(factura.id);

  /* Al cliente. */
  if (correoCliente && !factura.enviada_cliente) {
    const r = await correo.enviar({
      para: correoCliente,
      responderA: correo.BUZONES.facturacion,
      asunto,
      texto: [
        'Hola:', '',
        `Adjuntamos el comprobante de su pago.`, '',
        resumen, '',
        'MercaMaquinarias',
      ].join('\n'),
      adjuntos: adjunto,
    });
    if (r && r.entregado) db.marcarEnviada(factura.id, 'cliente');
  }

  /* Al buzón de facturación, SIEMPRE y aparte.
     El asunto lleva número, cliente e importe para que se pueda buscar
     en el buzón sin abrir nada: ese correo es el archivo. */
  if (!factura.enviada_interna) {
    const r = await correo.enviar({
      para: correo.BUZONES.facturacion,
      responderA: correo.BUZONES.facturacion,
      asunto: `${asunto} · ${factura.razon_social || 'Consumidor final'} · ${pesos(factura.total)}`,
      texto: resumen,
      adjuntos: adjunto,
    });
    if (r && r.entregado) db.marcarEnviada(factura.id, 'interna');
  }

  return db.facturaPorId(factura.id);
}

/* Secuencias que se están acabando. Lo consulta la tarea diaria.
 *
 * Solo las que el sitio emite (`usa_sitio`). Las demás —compras,
 * gastos menores, regímenes especiales, gubernamental— las consume
 * el contador por fuera, así que su contador aquí no se mueve: con
 * cinco números cargados y el umbral en cinco, avisarían todos los
 * días para siempre. El día que se agote la B01 de verdad, ese
 * correo tiene que llegar a una bandeja donde signifique algo. */
/* La fecha de hoy y la de dentro de N días, como las guarda la base. */
const enDias = (n) => new Date(Date.now() + n * 24 * 3600 * 1000).toISOString().slice(0, 10);

function secuenciasBajas() {
  /* Treinta días de margen para el vencimiento: pedir una autorización
     nueva a la DGII no es inmediato, y enterarse el día que caduca es
     enterarse tarde. */
  const hoy = enDias(0);
  const dentroDeUnMes = enDias(30);

  return db.secuenciasNcf()
    .filter((s) => s.activa && s.usa_sitio)
    .map((s) => {
      /* Se avisa por dos motivos distintos y conviene saber cuál: que
         se acaben los números, o que se acabe el plazo. Hasta ahora
         solo se miraba lo primero, así que una secuencia con números
         de sobra y la fecha cumplida no decía nada. */
      const porAgotarse = s.quedan <= AVISAR_BAJO;
      const porVencer = !!s.vence && s.vence <= dentroDeUnMes;
      const vencida = !!s.vence && s.vence < hoy;
      return {
        ...s,
        umbral: AVISAR_BAJO,
        porAgotarse,
        porVencer,
        vencida,
        /* Crítica es cuando el próximo cobro ya sale sin comprobante
           fiscal: o no queda ningún número, o el plazo ya pasó. */
        critica: s.quedan <= AVISAR_CRITICO || vencida,
      };
    })
    .filter((s) => s.porAgotarse || s.porVencer);
}

/* Comprobantes emitidos sin NCF, a la espera de que llegue la secuencia
 * que les correspondía.
 *
 * Mientras falte la B02, cada cliente sin RNC recibe un recibo no
 * fiscal. Eso no es un error que se pierda: queda aquí listado para
 * emitir sus facturas en lote el día que la DGII apruebe el rango. */
function pendientesDeRegularizar({ limite = 500 } = {}) {
  return db.facturas({ limite })
    .filter((f) => f.tipo === 'recibo' && !f.anulado_por);
}

module.exports = {
  CARPETA, TITULOS,
  dibujar, comoHtml, guardarPdf, leerPdf, rutaAbsoluta,
  emitirPorPago, emitirNotaCredito, enviar, secuenciasBajas, pendientesDeRegularizar, decidirTipo,
  regenerarPdfsPendientes,
};

/* ── Línea de comandos ──────────────────────────────────── */

/* `node tools/facturas.js cargar-secuencia --tipo B02 --desde 1 --hasta 50
 *                        --vence 2027-12-31 --nombre "Consumidor final" --usa-sitio`
 *
 * Existe para que cargar un rango nuevo NO requiera tocar código ni
 * abrir la base a mano. Es lo único que queda pendiente para que el
 * sistema emita facturas de consumo. */
function cargarDesdeConsola(args) {
  const valor = (nombre) => {
    const i = args.indexOf(`--${nombre}`);
    return i >= 0 ? args[i + 1] : undefined;
  };

  const datos = {
    tipo: valor('tipo'),
    nombre: valor('nombre'),
    desde: valor('desde'),
    hasta: valor('hasta'),
    vence: valor('vence') || null,
    activa: !args.includes('--inactiva'),
    usaSitio: args.includes('--usa-sitio'),
  };

  if (!datos.tipo || !datos.desde || !datos.hasta) {
    console.error('Uso: node tools/facturas.js cargar-secuencia --tipo B02 --desde 1 --hasta 50'
      + ' [--vence AAAA-MM-DD] [--nombre "Consumidor final"] [--usa-sitio] [--inactiva]');
    process.exitCode = 1;
    return;
  }

  const s = db.cargarSecuencia(datos);
  console.log(`${s.nueva ? 'Cargada' : 'Actualizada'} ${s.tipo}: `
    + `${s.prefijo}${String(s.desde).padStart(8, '0')} a ${s.prefijo}${String(s.hasta).padStart(8, '0')}`
    + ` · próximo ${s.prefijo}${String(s.siguiente).padStart(8, '0')}`
    + ` · ${s.activa ? 'activa' : 'inactiva'}${s.usa_sitio ? ', la usa el sitio' : ''}`
    + `${s.vence ? ` · vence ${s.vence}` : ' · sin fecha de vencimiento'}`);
}

if (require.main === module) {
  const [orden, ...resto] = process.argv.slice(2);

  if (orden === 'cargar-secuencia') cargarDesdeConsola(resto);
  else if (orden === 'secuencias') {
    for (const s of db.secuenciasNcf()) {
      console.log(`${s.tipo}  ${String(s.quedan).padStart(4)} de ${s.hasta - s.desde + 1}`
        + `  ${s.activa ? 'activa  ' : 'inactiva'}  ${s.usa_sitio ? 'sitio' : '     '}  ${s.nombre}`);
    }
  } else {
    console.error('Órdenes: cargar-secuencia, secuencias');
    process.exitCode = 1;
  }
}
