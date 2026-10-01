const DESFASE_SANTO_DOMINGO_MS = 4 * 60 * 60 * 1000;

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

module.exports = { mesDe, mesActual, validarMes, zip };
