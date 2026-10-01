const DESFASE_SANTO_DOMINGO_MS = 4 * 60 * 60 * 1000;
const db = require('./db');
const facturas = require('./facturas');
const pdf = require('./pdf');

function mesDe(isoUtc) {
  const fecha = new Date(isoUtc);
  if (Number.isNaN(fecha.getTime())) throw new Error('La fecha UTC no es válida.');
  const local = new Date(fecha.getTime() - DESFASE_SANTO_DOMINGO_MS);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, '0')}`;
}

function mesActual(ahoraMs = Date.now()) {
  return mesDe(new Date(ahoraMs).toISOString());
}

function errorDeSolicitud(mensaje) {
  const error = new Error(mensaje);
  error.codigo = 400;
  return error;
}

function validarMes(mes, ahoraMs = Date.now()) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw errorDeSolicitud('El mes debe tener el formato AAAA-MM.');
  }
  const actual = mesActual(ahoraMs);
  if (mes > actual) throw errorDeSolicitud('El mes no puede ser posterior al mes en curso.');

  const [ano, numeroMes] = mes.split('-').map(Number);
  const desdeMs = Date.UTC(ano, numeroMes - 1, 1, 4);
  const hastaMs = Date.UTC(ano, numeroMes, 1, 4);
  return {
    mes,
    desde: new Date(desdeMs).toISOString(),
    hasta: new Date(hastaMs).toISOString(),
    parcial: mes === actual,
  };
}

const TABLA_CRC = Array.from({ length: 256 }, (_, numero) => {
  let crc = numero;
  for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  return crc >>> 0;
});

function crc32(datos) {
  let crc = 0xffffffff;
  for (const byte of datos) crc = (crc >>> 8) ^ TABLA_CRC[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entradas) {
  if (!Array.isArray(entradas) || entradas.length > 0xffff) {
    throw new Error('La lista de entradas del ZIP no es válida.');
  }

  const locales = [];
  const centrales = [];
  let desplazamiento = 0;

  for (const entrada of entradas) {
    if (!entrada || typeof entrada.nombre !== 'string' || !Buffer.isBuffer(entrada.datos)) {
      throw new Error('Cada entrada del ZIP necesita un nombre y datos en un Buffer.');
    }
    const nombre = Buffer.from(entrada.nombre, 'utf8');
    if (nombre.length === 0 || nombre.length > 0xffff || entrada.datos.length > 0xffffffff) {
      throw new Error('Una entrada del ZIP excede los límites admitidos.');
    }
    const crc = crc32(entrada.datos);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0x0021, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(entrada.datos.length, 18);
    local.writeUInt32LE(entrada.datos.length, 22);
    local.writeUInt16LE(nombre.length, 26);
    local.writeUInt16LE(0, 28);
    locales.push(local, nombre, entrada.datos);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0x0021, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(entrada.datos.length, 20);
    central.writeUInt32LE(entrada.datos.length, 24);
    central.writeUInt16LE(nombre.length, 28);
    central.writeUInt32LE(desplazamiento, 42);
    centrales.push(central, nombre);
    desplazamiento += local.length + nombre.length + entrada.datos.length;
  }

  const directorio = Buffer.concat(centrales);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(directorio.length, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...locales, directorio, fin]);
}

const bloqueVacio = () => ({ cantidad: 0, subtotal: 0, itbis: 0, total: 0 });

function sumar(bloque, fila, signo = 1) {
  bloque.cantidad += 1;
  bloque.subtotal += signo * Number(fila.subtotal || 0);
  bloque.itbis += signo * Number(fila.itbis || 0);
  bloque.total += signo * Number(fila.total || 0);
}

function mesesVecinos(mes) {
  const [ano, numero] = mes.split('-').map(Number);
  return [-1, 0, 1].map((salto) => {
    const fecha = new Date(Date.UTC(ano, numero - 1 + salto, 1));
    return `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function pdfDe(fila) {
  if (!fila.ruta_pdf) return null;
  const bytes = facturas.leerPdf(fila.ruta_pdf);
  return Buffer.isBuffer(bytes) && bytes.length ? bytes : null;
}

function previa(mes, { ahora = Date.now() } = {}) {
  const periodo = validarMes(mes, ahora);
  const filas = db.comprobantesDelPeriodo(periodo.desde, periodo.hasta);
  const fiscal = bloqueVacio();
  const sinValorFiscal = bloqueVacio();
  const notasSobreRecibos = bloqueVacio();

  for (const fila of filas) {
    const sobreRecibo = fila.tipo === 'nota_credito'
      && /^MM-\d{4}-\d{6}$/.test(fila.ncf_modificado || '');
    /* Un recibo no dio crédito fiscal que revertir. Su nota se informa
       aparte: restarla del bloque fiscal inventaría un impuesto que el
       comprobante original nunca tuvo. */
    if (sobreRecibo) sumar(notasSobreRecibos, fila);
    else if (!fila.ncf) sumar(sinValorFiscal, fila);
    else sumar(fiscal, fila, fila.tipo === 'nota_credito' ? -1 : 1);
  }

  return {
    ...periodo,
    archivo: `comprobantes-${mes}${periodo.parcial ? '-parcial' : ''}.zip`,
    cantidad: filas.length,
    conNcf: filas.filter((fila) => !!fila.ncf).length,
    sinNcf: filas.filter((fila) => !fila.ncf).length,
    fiscal,
    sinValorFiscal,
    notasSobreRecibos,
    notasCredito: filas.filter((fila) => fila.tipo === 'nota_credito').length,
    anulados: filas.filter((fila) => !!fila.anulado_por).length,
    noCuadran: filas.filter((fila) => Number(fila.subtotal) + Number(fila.itbis) !== Number(fila.total))
      .map((fila) => fila.numero),
    faltanPdf: filas.filter((fila) => !pdfDe(fila)).map((fila) => fila.numero),
    fechasIrregulares: db.fechasIrregulares(mesesVecinos(mes)).map((fila) => fila.numero),
  };
}

function celdaCsv(valor) {
  let texto = String(valor == null ? '' : valor);
  if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
  if (/[;"\r\n]/.test(texto)) texto = `"${texto.replace(/"/g, '""')}"`;
  return texto;
}

function fechaDominicana(iso) {
  const fecha = new Date(new Date(iso).getTime() - DESFASE_SANTO_DOMINGO_MS);
  return `${String(fecha.getUTCDate()).padStart(2, '0')}/${String(fecha.getUTCMonth() + 1).padStart(2, '0')}/${fecha.getUTCFullYear()}`;
}

const CABECERA_CSV = ['Fecha', 'Fecha UTC', 'Numero', 'Tipo', 'NCF', 'NCF modificado',
  'NCF vence', 'Cliente', 'RNC', 'Subtotal gravado', 'ITBIS', 'Total', 'Moneda',
  'Metodo de pago', 'Anulado', 'Cuadra', 'PDF', 'Archivo'];

function resumenCsv(filas, repuestos) {
  const lineas = [CABECERA_CSV];
  for (const fila of filas) {
    lineas.push([
      fechaDominicana(fila.fecha), fila.fecha, fila.numero, facturas.TITULOS[fila.tipo] || '',
      fila.ncf || '', fila.ncf_modificado || '', fila.ncf_vencimiento || '',
      fila.razon_social || 'Consumidor final', fila.rnc || '', fila.subtotal, fila.itbis,
      fila.total, fila.moneda, fila.metodo_pago || '', fila.anulado_por ? 'si' : 'no',
      Number(fila.subtotal) + Number(fila.itbis) === Number(fila.total) ? 'si' : 'no',
      repuestos.has(fila.numero) ? 'repuesto al generar' : 'guardado', `${fila.numero}.pdf`,
    ]);
  }
  return Buffer.from(`\ufeff${lineas.map((linea) => linea.map(celdaCsv).join(';')).join('\r\n')}\r\n`, 'utf8');
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function mesEnPalabras(mes) {
  const [ano, numero] = mes.split('-').map(Number);
  return `${MESES[numero - 1]} de ${ano}`;
}

function pesosEnteros(valor) {
  return `RD$ ${Number(valor || 0).toLocaleString('en-US')}`;
}

function listaCorta(numeros) {
  if (!numeros.length) return 'ninguno';
  const visibles = numeros.slice(0, 15).join(', ');
  return numeros.length > 15 ? `${visibles} y ${numeros.length - 15} más (ver resumen.csv)` : visibles;
}

function resumenPdf(datos, emisor, cantidadRepuestos) {
  const d = pdf.documento();
  d.texto(emisor.razonSocial, 42, 45, { tamano: 13, tipo: 'negrita' });
  d.texto(`RNC ${emisor.rnc}`, 42, 62, { tamano: 9 });
  d.texto('Resumen de comprobantes', 42, 100, { tamano: 18, tipo: 'negrita' });
  d.texto(mesEnPalabras(datos.mes), 42, 122, { tamano: 12 });
  let y = 148;
  if (datos.parcial) {
    d.texto('Mes en curso: paquete parcial', 42, y, { tamano: 10, tipo: 'negrita' });
    y += 25;
  }
  const bloques = [
    ['Con valor fiscal (las notas de crédito restan)', datos.fiscal],
    ['Sin valor fiscal (recibos)', datos.sinValorFiscal],
    ['Notas de crédito sobre recibos sin NCF (no restan del neto fiscal)', datos.notasSobreRecibos],
  ];
  for (const [titulo, bloque] of bloques) {
    d.texto(titulo, 42, y, { tamano: 10, tipo: 'negrita' });
    y += 16;
    d.texto(`${bloque.cantidad} comprobantes · Subtotal ${pesosEnteros(bloque.subtotal)} · ITBIS ${pesosEnteros(bloque.itbis)} · Total ${pesosEnteros(bloque.total)}`, 42, y, { tamano: 8 });
    y += 25;
  }
  d.texto(`Comprobantes: ${datos.cantidad}`, 42, y, { tamano: 9 }); y += 15;
  d.texto(`Anulados: ${datos.anulados}`, 42, y, { tamano: 9 }); y += 15;
  d.texto(`No cuadran: ${datos.noCuadran.length} (${listaCorta(datos.noCuadran)})`, 42, y, { tamano: 9 }); y += 15;
  d.texto(`PDF repuestos: ${cantidadRepuestos}`, 42, y, { tamano: 9 });
  return d.terminar();
}

function leeme(datos, emisor) {
  const parcial = datos.parcial ? ' Este paquete es parcial porque el mes está en curso.' : '';
  const texto = [
    `Este paquete contiene los comprobantes de ${mesEnPalabras(datos.mes)} de ${emisor.razonSocial}, RNC ${emisor.rnc}.${parcial}`,
    '',
    'con-ncf/ contiene los comprobantes con NCF y su resumen.csv.',
    'sin-ncf/ contiene los recibos sin NCF y su resumen.csv. Los recibos no tienen valor fiscal.',
    '',
    'El corte comprende desde el día 1 a las 00:00 hasta el último día a las 24:00, hora de Santo Domingo (America/Santo_Domingo, UTC−4), y cuenta la fecha del cobro.',
    'En los comprobantes emitidos antes del 2 de octubre de 2026, la fecha impresa en el PDF está en UTC y puede ser un día después para lo cobrado de 20:00 a 24:00. El CSV trae la fecha de Santo Domingo y la fecha UTC.',
    '',
    'Las notas de crédito sobre comprobantes fiscales restan. Las «Notas de crédito sobre recibos sin NCF» van aparte y no restan del neto fiscal.',
    '«guardado» significa que se usó el PDF conservado al emitir; «repuesto al generar» significa que el sitio reconstruyó el PDF que faltaba.',
    'El CSV antepone una comilla simple a las celdas que podrían interpretarse como fórmulas.',
    '',
    'Este paquete lo genera el sitio solo cuando alguien lo descarga desde la consola. El sitio no lo envía a nadie: lo envía quien lo descargó.',
  ].join('\r\n');
  return Buffer.from(`\ufeff${texto}\r\n`, 'utf8');
}

function claveSuma(fila) { return `${fila.tipo}\u0000${fila.moneda}`; }

function validarCuadre(filas, sumas) {
  const calculadas = new Map();
  for (const fila of filas) {
    const clave = claveSuma(fila);
    if (!calculadas.has(clave)) calculadas.set(clave, { cantidad: 0, subtotal: 0, itbis: 0, total: 0 });
    sumar(calculadas.get(clave), fila);
  }
  const declaradas = new Map(sumas.map((fila) => [claveSuma(fila), fila]));
  const claves = new Set([...calculadas.keys(), ...declaradas.keys()]);
  for (const clave of claves) {
    const a = calculadas.get(clave) || bloqueVacio();
    const b = declaradas.get(clave) || bloqueVacio();
    if (['cantidad', 'subtotal', 'itbis', 'total'].some((campo) => Number(a[campo]) !== Number(b[campo]))) {
      const error = new Error('El paquete no cuadra con los totales del período.');
      error.codigo = 500;
      throw error;
    }
  }
}

function armarPaquete(mes, { emisor, ahora = Date.now(), reponer = facturas.reponerPdfsDe,
  sumas = db.sumaDelPeriodo } = {}) {
  if (!emisor) throw new Error('Hace falta el emisor para armar el paquete.');
  let datos = previa(mes, { ahora });
  if (datos.fechasIrregulares.length) {
    const error = new Error(`Hay fechas irregulares: ${datos.fechasIrregulares.join(', ')}.`);
    error.codigo = 500;
    throw error;
  }

  let filas = db.comprobantesDelPeriodo(datos.desde, datos.hasta);
  const faltantes = filas.filter((fila) => !pdfDe(fila));
  const resultado = faltantes.length ? reponer(faltantes, { emisor }) : { hechos: [], fallos: [] };
  const repuestos = new Set((resultado && resultado.hechos) || []);
  filas = db.comprobantesDelPeriodo(datos.desde, datos.hasta);
  const sinPdf = filas.filter((fila) => !pdfDe(fila));
  if (sinPdf.length) {
    // Un comprobante sin su papel haría incompleto el paquete entregado al contador: se bloquea, no se omite.
    const numeros = sinPdf.map((fila) => fila.numero);
    const error = new Error(`Faltan PDF de los comprobantes: ${numeros.join(', ')}.`);
    error.codigo = 409;
    error.faltan = numeros;
    throw error;
  }
  validarCuadre(filas, sumas(datos.desde, datos.hasta));
  datos = previa(mes, { ahora });

  const conNcf = filas.filter((fila) => !!fila.ncf);
  const sinNcf = filas.filter((fila) => !fila.ncf);
  const entradas = [];
  for (const fila of conNcf) entradas.push({ nombre: `con-ncf/${fila.numero}.pdf`, datos: pdfDe(fila) });
  entradas.push({ nombre: 'con-ncf/resumen.csv', datos: resumenCsv(conNcf, repuestos) });
  for (const fila of sinNcf) entradas.push({ nombre: `sin-ncf/${fila.numero}.pdf`, datos: pdfDe(fila) });
  entradas.push({ nombre: 'sin-ncf/resumen.csv', datos: resumenCsv(sinNcf, repuestos) });
  entradas.push({ nombre: 'resumen.pdf', datos: resumenPdf(datos, emisor, repuestos.size) });
  entradas.push({ nombre: 'LEEME.txt', datos: leeme(datos, emisor) });
  return { nombre: datos.archivo, zip: zip(entradas), previa: datos };
}

module.exports = { mesDe, mesActual, validarMes, zip, previa, armarPaquete };
