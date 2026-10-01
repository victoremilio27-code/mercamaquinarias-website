/* Borrador para el contador: el sitio nunca envía este Formato 607. */

const DESFASE_SANTO_DOMINGO_MS = 4 * 60 * 60 * 1000;

function soloDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function importe(valor) {
  const numero = Number(valor);
  return Math.abs(Number.isFinite(numero) ? numero : 0).toFixed(2);
}

function fechaDominicana(valor) {
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) throw new Error('La fecha del comprobante no es válida.');
  const local = new Date(fecha.getTime() - DESFASE_SANTO_DOMINGO_MS);
  return `${local.getUTCFullYear()}${String(local.getUTCMonth() + 1).padStart(2, '0')}${String(local.getUTCDate()).padStart(2, '0')}`;
}

function formaDe(fila) {
  const metodo = String(fila.metodo_pago || fila.metodoPago || '').toLowerCase();
  if (metodo === 'efectivo') return 'efectivo';
  if (metodo === 'transferencia') return 'transferencia';
  if (metodo === 'cardnet' || metodo === 'tarjeta') return 'tarjeta';
  return 'otras';
}

function lineaDe(fila, avisos) {
  const columnas = Array(23).fill('');
  const documento = soloDigitos(fila.rnc);
  columnas[0] = documento;
  columnas[1] = documento.length === 9 ? '1' : documento.length === 11 ? '2' : '';
  columnas[2] = fila.ncf || '';
  columnas[3] = fila.tipo === 'nota_credito' ? fila.ncf_modificado || fila.ncfModificado || '' : '';
  columnas[4] = '01';
  columnas[5] = fechaDominicana(fila.fecha);
  columnas[7] = importe(fila.subtotal);
  columnas[8] = importe(fila.itbis);

  if (fila.tipo !== 'nota_credito') {
    const forma = formaDe(fila);
    const columna = { efectivo: 16, transferencia: 17, tarjeta: 18, otras: 22 }[forma];
    columnas[columna] = importe(fila.total);
    if (forma === 'otras') {
      avisos.push(`${fila.numero}: la forma de pago ${fila.metodo_pago || fila.metodoPago || 'desconocida'} se incluyó en otras formas de venta.`);
    }
  }
  return columnas.join('|');
}

function formato607(filas, { rncEmisor, mes } = {}) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes || '')) {
    throw new Error('El mes debe tener el formato AAAA-MM.');
  }
  const rnc = soloDigitos(rncEmisor);
  if (rnc.length !== 9) throw new Error('El RNC del emisor debe tener 9 dígitos.');

  const avisos = [];
  const consumo = {
    cantidad: 0,
    subtotal: 0,
    itbis: 0,
    porForma: { efectivo: 0, transferencia: 0, tarjeta: 0, otras: 0 },
  };
  const detalles = [];

  for (const fila of [...(filas || [])].sort((a, b) =>
    String(a.fecha).localeCompare(String(b.fecha)) || String(a.numero).localeCompare(String(b.numero)))) {
    if (fila.tipo === 'factura_consumo') {
      const subtotal = Math.abs(Number(fila.subtotal) || 0);
      consumo.cantidad += 1;
      consumo.subtotal += subtotal;
      consumo.itbis += Math.abs(Number(fila.itbis) || 0);
      consumo.porForma[formaDe(fila)] += Math.abs(Number(fila.total) || 0);
      if (subtotal >= 250000) {
        avisos.push(`${fila.numero}: la factura de consumo tiene un subtotal de 250000 o más y requiere identificar al comprador.`);
      }
      continue;
    }
    if (fila.tipo === 'nota_credito') {
      const modificado = fila.ncf_modificado || fila.ncfModificado || '';
      if (!/^[BE]\d{2}/.test(modificado)) {
        avisos.push(`${fila.numero}: la nota de crédito sobre el recibo ${modificado} quedó fuera del Formato 607.`);
        continue;
      }
    } else if (fila.tipo !== 'factura_credito_fiscal' || !fila.ncf) {
      continue;
    }
    detalles.push(lineaDe(fila, avisos));
  }

  const encabezado = `607|${rnc}|${mes.replace('-', '')}|${detalles.length}`;
  return { texto: `${[encabezado, ...detalles].join('\r\n')}\r\n`, avisos, consumo };
}

module.exports = { formato607 };
