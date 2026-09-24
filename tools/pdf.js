/**
 * pdf.js — generador de PDF mínimo. Sin dependencias.
 *
 * POR QUÉ NO pdfkit
 *
 * El proyecto entero corre sin una sola dependencia en producción, y eso
 * no es una manía: en un VPS de 512 MB cada paquete que se instala son
 * megas de node_modules que hay que respaldar, actualizar y auditar, y
 * una cadena de dependencias transitivas que nadie ha leído. pdfkit son
 * unos 30 paquetes para lo que aquí hace falta: escribir texto en una
 * hoja, dibujar cuatro líneas y un par de rectángulos.
 *
 * Un comprobante no lleva imágenes, ni columnas fluidas, ni tipografías
 * exóticas. Lleva texto en rejilla. Eso cabe en este archivo.
 *
 * QUÉ SABE HACER
 *
 *   · Texto con las tipografías estándar del formato —Helvetica y sus
 *     variantes— que TODO lector de PDF trae incorporadas. No se
 *     incrusta ninguna fuente: el archivo pesa unos 3 KB.
 *   · Rectángulos rellenos y líneas, para la cabecera y las separaciones.
 *   · Una sola página. Un comprobante de un plan no da para más, y
 *     paginar de verdad —con su repetición de cabeceras— sería el triple
 *     de código para algo que no ocurre.
 *
 * LO QUE HAY QUE SABER PARA TOCARLO
 *
 *   · El origen de coordenadas está ABAJO a la izquierda, no arriba.
 *     Aquí se trabaja en coordenadas «de arriba abajo», que es como
 *     piensa cualquiera que maquete, y se convierte al escribir.
 *   · Las tipografías estándar usan WinAnsiEncoding: cubre el español
 *     entero —acentos, ñ, ¿, ¡— pero NO el guion largo ni las comillas
 *     tipográficas. `aWinAnsi` los sustituye en vez de dejar un byte
 *     inválido que pinta un cuadrado.
 *   · La tabla xref lleva el desplazamiento EXACTO en bytes de cada
 *     objeto. Por eso el documento se arma como lista de trozos y se
 *     miden al concatenar: calcularlos a mano es como se hacen los PDF
 *     que no abren.
 */

const TIPOS = {
  normal: 'Helvetica',
  negrita: 'Helvetica-Bold',
  oblicua: 'Helvetica-Oblique',
};

/* Carta, en puntos. Es el tamaño de papel de la República Dominicana;
   A4 dejaría un margen raro al imprimir. */
const ANCHO = 612;
const ALTO = 792;

/* Texto a WinAnsi (cp1252).
 *
 * Node no trae codificador para cp1252, pero para los primeros 256
 * puntos coincide con latin1 salvo el bloque 0x80–0x9F, donde cp1252
 * mete comillas tipográficas, guiones largos y demás. Como en un
 * comprobante esos caracteres no aportan nada, se cambian por su
 * equivalente de toda la vida antes de convertir. */
function aWinAnsi(texto) {
  const plano = String(texto == null ? '' : texto)
    .replace(/[‘’‛]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/ /g, ' ')
    .replace(/[•·]/g, '·');   // el punto medio sí existe en latin1
  return Buffer.from(plano, 'latin1');
}

/* Escapa lo que el formato interpreta dentro de una cadena: paréntesis
   y contrabarra. Sin esto, un nombre con «(SRL)» rompe el archivo. */
function cadenaPdf(texto) {
  const bytes = aWinAnsi(texto);
  let salida = '';
  for (const b of bytes) {
    const c = String.fromCharCode(b);
    if (c === '(' || c === ')' || c === '\\') salida += `\\${c}`;
    else if (b < 32 || b > 126) salida += `\\${b.toString(8).padStart(3, '0')}`;
    else salida += c;
  }
  return salida;
}

/* Ancho aproximado de un texto, para poder alinear a la derecha y
   centrar sin incrustar las métricas completas de la tipografía.
 *
 * Es una APROXIMACIÓN a propósito: las tablas de anchos de Helvetica son
 * 256 números por variante, y aquí solo se usan para que una cifra quede
 * pegada al margen derecho. Un error de un punto no se ve; mantener
 * tres tablas de métricas sí se nota al leer el archivo. */
const ESTRECHOS = 'iljtfrI.,:;\'`|!()[]{} ';
const ANCHOS_MEDIOS = 'ABCDEFGHJKLMNOPQRSTUVWXYZmwMW@%';

function anchoDe(texto, tamano, negrita) {
  let unidades = 0;
  for (const c of String(texto)) {
    if (ESTRECHOS.includes(c)) unidades += 0.31;
    else if (ANCHOS_MEDIOS.includes(c)) unidades += 0.71;
    else unidades += 0.55;
  }
  return unidades * tamano * (negrita ? 1.03 : 1);
}

function documento() {
  const ordenes = [];
  let colorActual = null;

  const color = (hex) => {
    if (hex === colorActual) return;
    colorActual = hex;
    const n = parseInt(String(hex).replace('#', ''), 16);
    const r = ((n >> 16) & 255) / 255;
    const g = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    ordenes.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg`);
    ordenes.push(`${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} RG`);
  };

  const api = {
    ANCHO,
    ALTO,

    /* `y` va de arriba abajo. La conversión a las coordenadas del
       formato se hace aquí, una vez, y no en cada llamada. */
    texto(t, x, y, { tamano = 10, tipo = 'normal', color: c = '#000000', alinear = 'izquierda', ancho = 0 } = {}) {
      const contenido = String(t == null ? '' : t);
      if (!contenido) return api;

      let xf = x;
      if (alinear === 'derecha') xf = x + ancho - anchoDe(contenido, tamano, tipo === 'negrita');
      else if (alinear === 'centro') xf = x + (ancho - anchoDe(contenido, tamano, tipo === 'negrita')) / 2;

      color(c);
      ordenes.push('BT');
      ordenes.push(`/${tipo} ${tamano} Tf`);
      ordenes.push(`${xf.toFixed(2)} ${(ALTO - y).toFixed(2)} Td`);
      ordenes.push(`(${cadenaPdf(contenido)}) Tj`);
      ordenes.push('ET');
      return api;
    },

    rect(x, y, ancho, alto, c = '#000000') {
      color(c);
      ordenes.push(`${x.toFixed(2)} ${(ALTO - y - alto).toFixed(2)} ${ancho.toFixed(2)} ${alto.toFixed(2)} re f`);
      return api;
    },

    /* Rectángulo sin relleno, para los recuadros del comprobante. Va
       aparte de `rect` porque el formato distingue relleno (`f`) de
       trazo (`S`) y mezclarlos en una sola orden pinta la caja negra. */
    marco(x, y, ancho, alto, { grosor = 0.8, color: c = '#DDDDDD' } = {}) {
      color(c);
      ordenes.push(`${grosor} w`);
      ordenes.push(`${x.toFixed(2)} ${(ALTO - y - alto).toFixed(2)} ${ancho.toFixed(2)} ${alto.toFixed(2)} re S`);
      return api;
    },

    linea(x1, y1, x2, y2, { grosor = 0.6, color: c = '#CCCCCC' } = {}) {
      color(c);
      ordenes.push(`${grosor} w`);
      ordenes.push(`${x1.toFixed(2)} ${(ALTO - y1).toFixed(2)} m ${x2.toFixed(2)} ${(ALTO - y2).toFixed(2)} l S`);
      return api;
    },

    /* Texto que no cabe en una línea, partido por palabras. Devuelve la
       `y` siguiente, para poder encadenar. */
    parrafo(t, x, y, anchoCaja, { tamano = 9, tipo = 'normal', color: c = '#000000', interlinea = 1.45 } = {}) {
      const palabras = String(t || '').split(/\s+/).filter(Boolean);
      let linea = '';
      let cursor = y;
      const salto = tamano * interlinea;

      for (const p of palabras) {
        const prueba = linea ? `${linea} ${p}` : p;
        if (anchoDe(prueba, tamano, tipo === 'negrita') > anchoCaja && linea) {
          api.texto(linea, x, cursor, { tamano, tipo, color: c });
          cursor += salto;
          linea = p;
        } else {
          linea = prueba;
        }
      }
      if (linea) { api.texto(linea, x, cursor, { tamano, tipo, color: c }); cursor += salto; }
      return cursor;
    },

    terminar() {
      const flujo = Buffer.from(ordenes.join('\n'), 'latin1');

      const objetos = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${ANCHO} ${ALTO}] `
          + '/Resources << /Font << /normal 5 0 R /negrita 6 0 R /oblicua 7 0 R >> >> '
          + '/Contents 4 0 R >>',
        null,   // 4: el flujo de contenido, que va aparte por ser binario
        `<< /Type /Font /Subtype /Type1 /BaseFont /${TIPOS.normal} /Encoding /WinAnsiEncoding >>`,
        `<< /Type /Font /Subtype /Type1 /BaseFont /${TIPOS.negrita} /Encoding /WinAnsiEncoding >>`,
        `<< /Type /Font /Subtype /Type1 /BaseFont /${TIPOS.oblicua} /Encoding /WinAnsiEncoding >>`,
      ];

      const trozos = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
      const desplazamientos = [];
      let cursor = trozos[0].length;

      const meter = (buf) => { trozos.push(buf); cursor += buf.length; };

      objetos.forEach((cuerpo, i) => {
        const n = i + 1;
        desplazamientos[n] = cursor;
        if (n === 4) {
          meter(Buffer.from(`${n} 0 obj\n<< /Length ${flujo.length} >>\nstream\n`, 'latin1'));
          meter(flujo);
          meter(Buffer.from('\nendstream\nendobj\n', 'latin1'));
        } else {
          meter(Buffer.from(`${n} 0 obj\n${cuerpo}\nendobj\n`, 'latin1'));
        }
      });

      const inicioXref = cursor;
      let xref = `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
      for (let n = 1; n <= objetos.length; n++) {
        xref += `${String(desplazamientos[n]).padStart(10, '0')} 00000 n \n`;
      }
      xref += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\n`
        + `startxref\n${inicioXref}\n%%EOF\n`;
      meter(Buffer.from(xref, 'latin1'));

      return Buffer.concat(trozos);
    },
  };

  return api;
}

module.exports = { documento, anchoDe, ANCHO, ALTO };
