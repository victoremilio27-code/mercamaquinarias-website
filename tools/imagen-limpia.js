/**
 * Elimina metadatos de imágenes sin volver a codificar sus píxeles.
 * Todas las lecturas se comprueban antes de hacerse: guardar una imagen
 * parcialmente recorrida dejaría pasar justo los metadatos que se quieren quitar.
 */

const FIRMA_PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

function limpiarJpeg(buffer) {
  if (buffer.length < 3) return null;

  const partes = [Buffer.from(buffer.subarray(0, 2))];
  let posicion = 2;
  let tieneSof = false;

  while (posicion < buffer.length) {
    const inicio = posicion;
    if (buffer[posicion] !== 0xFF) return null;
    while (posicion < buffer.length && buffer[posicion] === 0xFF) posicion += 1;
    if (posicion >= buffer.length) return null;

    const marcador = buffer[posicion++];
    if (marcador === 0x00) return null;
    if (marcador === 0xD9) {
      partes.push(Buffer.from(buffer.subarray(inicio)));
      return Buffer.concat(partes);
    }

    // SOI, RST0–RST7 y TEM no llevan longitud. Fuera de los datos de escaneo
    // son raros, pero siguen siendo marcadores JPEG válidos.
    if (marcador === 0xD8 || marcador === 0x01 || (marcador >= 0xD0 && marcador <= 0xD7)) {
      partes.push(Buffer.from(buffer.subarray(inicio, posicion)));
      continue;
    }

    if (posicion + 2 > buffer.length) return null;
    const longitud = buffer.readUInt16BE(posicion);
    if (longitud < 2 || posicion + longitud > buffer.length) return null;
    const fin = posicion + longitud;

    if (marcador === 0xDA) {
      if (!tieneSof) return null;
      // Desde SOS los 0xFF también pueden pertenecer a los datos comprimidos.
      partes.push(Buffer.from(buffer.subarray(inicio)));
      return Buffer.concat(partes);
    }

    // Los marcadores SOF admitidos por JPEG anuncian la imagen que después
    // codifica SOS. D4, D8 y DC no son SOF aunque queden dentro del intervalo.
    if ((marcador >= 0xC0 && marcador <= 0xC3)
      || (marcador >= 0xC5 && marcador <= 0xC7)
      || (marcador >= 0xC9 && marcador <= 0xCB)
      || (marcador >= 0xCD && marcador <= 0xCF)) tieneSof = true;

    // APP0 conserva JFIF, APP2 conserva el perfil ICC y APP14 conserva la
    // transformación Adobe: quitarlos altera colores, sobre todo en JPEG CMYK.
    if (marcador !== 0xE1 && marcador !== 0xED && marcador !== 0xFE) {
      partes.push(Buffer.from(buffer.subarray(inicio, fin)));
    }
    posicion = fin;
  }

  return Buffer.concat(partes);
}

function limpiarPng(buffer) {
  if (buffer.length < FIRMA_PNG.length) return null;
  const partes = [Buffer.from(buffer.subarray(0, FIRMA_PNG.length))];
  const quitar = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);
  let posicion = FIRMA_PNG.length;

  while (posicion < buffer.length) {
    if (posicion + 12 > buffer.length) return null;
    const longitud = buffer.readUInt32BE(posicion);
    const fin = posicion + 12 + longitud;
    if (fin > buffer.length) return null;
    const tipo = buffer.toString('ascii', posicion + 4, posicion + 8);
    if (!quitar.has(tipo)) partes.push(Buffer.from(buffer.subarray(posicion, fin)));
    posicion = fin;
  }

  return Buffer.concat(partes);
}

function limpiarWebp(buffer) {
  if (buffer.length < 12) return null;
  const tamanoDeclarado = buffer.readUInt32LE(4);
  if (tamanoDeclarado + 8 !== buffer.length || tamanoDeclarado < 4) return null;

  const partes = [];
  let posicion = 12;
  while (posicion < buffer.length) {
    if (posicion + 8 > buffer.length) return null;
    const tipo = buffer.toString('ascii', posicion, posicion + 4);
    const longitud = buffer.readUInt32LE(posicion + 4);
    const finDatos = posicion + 8 + longitud;
    const fin = finDatos + (longitud % 2);
    if (fin > buffer.length) return null;

    if (tipo !== 'EXIF' && tipo !== 'XMP ') {
      const fragmento = Buffer.from(buffer.subarray(posicion, fin));
      if (tipo === 'VP8X') {
        if (longitud < 1) return null;
        // En VP8X los bits 3 y 2 anuncian EXIF y XMP respectivamente.
        fragmento[8] &= ~0x0C;
      }
      partes.push(fragmento);
    }
    posicion = fin;
  }

  const cuerpo = Buffer.concat([Buffer.from('WEBP'), ...partes]);
  const salida = Buffer.alloc(8 + cuerpo.length);
  salida.write('RIFF', 0, 'ascii');
  salida.writeUInt32LE(cuerpo.length, 4);
  cuerpo.copy(salida, 8);
  return salida;
}

function limpiar(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return limpiarJpeg(buffer);
  }
  if (buffer.length >= 4 && buffer.subarray(0, 4).equals(FIRMA_PNG.subarray(0, 4))) {
    if (!buffer.subarray(0, 8).equals(FIRMA_PNG)) return null;
    return limpiarPng(buffer);
  }
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP') return limpiarWebp(buffer);

  // PDF y los demás formatos quedan intactos: limpiar metadatos de PDF exige
  // interpretar el documento completo y está expresamente fuera de esta tarea.
  return buffer;
}

module.exports = { limpiar };
