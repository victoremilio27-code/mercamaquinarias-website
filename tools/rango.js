function rangoDe(cabecera, total) {
  const pedido = /^bytes=(\d*)-(\d*)$/.exec(cabecera || '');
  if (!pedido) return null;

  // `bytes=-500` son los ÚLTIMOS 500, no los primeros.
  const sufijo = pedido[1] === '';
  let desde = sufijo ? total - Number(pedido[2] || 0) : Number(pedido[1]);
  let hasta = sufijo || pedido[2] === '' ? total - 1 : Number(pedido[2]);

  desde = Math.max(0, desde);
  hasta = Math.min(total - 1, hasta);

  if (!Number.isFinite(desde) || !Number.isFinite(hasta) || desde > hasta || desde >= total) {
    return { invalido: true };
  }

  return { desde, hasta };
}

module.exports = { rangoDe };
