/**
 * pagos.js — el único sitio donde un cobro se convierte en cupos y
 * comprobante.
 *
 * QUÉ FALLÓ ANTES
 *
 * Hasta la fase 3, `anotarPago` escribía 'aprobado' a mano en el SQL, y
 * la compra otorgaba los cupos y consumía un NCF en la misma petición
 * en que se pedía el cobro. Con un procesador de verdad, una tarjeta
 * rechazada habría dejado un comprobante fiscal de dinero que no entró.
 * Ese comprobante no se borra ni se reescribe: solo se corrige con una
 * nota de crédito B04, por un error que no tenía por qué ocurrir.
 *
 * Ahora un cobro con importe nace 'pendiente' y la transición a
 * 'aprobado' vive aquí, entera: los cupos (db.aprobarPago) y el
 * comprobante (facturas.emitirPorPago), juntos. La confirmación de la
 * pasarela y el marcado manual de una transferencia llaman a la misma
 * `confirmarPago`, nunca a una copia.
 *
 * Por qué importa que sea una sola: la emisión ya estuvo escrita dos
 * veces y solo funcionaba en una. Comprar cupos emitía comprobante y
 * ampliarlos no; el cliente pagaba la ampliación y no había documento.
 * Era ingreso cobrado y no declarado, invisible hasta una inspección.
 *
 * Vive en su propio módulo porque no cabe en otro: db.js no puede
 * cargar facturas.js (que ya depende de db.js), y api.js es el
 * enrutador entero, que ni la consola de administración ni la tarea de
 * reconciliación deberían cargar para confirmar un pago.
 */

const db = require('./db');
const facturas = require('./facturas');
const { transferenciaActiva } = require('./transferencia');

/* Lo que se imprime como línea de detalle.
 *
 * La multiplicación tiene que cuadrar: cantidad × precio unitario =
 * importe. Con cupos gratis por cantidad el subtotal deja de ser
 * divisible, así que en ese caso va una sola línea por el total y el
 * reparto se explica en el texto. Una factura donde la multiplicación
 * no da es una factura que el cliente reclama. */
function lineaDeCupos({ cupo, subtotal, inicio, fin }) {
  const divisible = cupo > 0 && subtotal % cupo === 0;
  return {
    cantidad: divisible ? cupo : 1,
    precio_unitario: divisible ? subtotal / cupo : subtotal,
    periodo: [inicio, fin]
      .map((f) => String(f).slice(0, 10).split('-').reverse().join('/')).join(' al '),
  };
}

/* Los pagos anteriores a esta fase no guardan qué se compró. Si alguno
   llega aquí —una emisión que falló entonces y se reintenta ahora—, se
   emite con lo mínimo en vez de lanzar. */
const INTENCION_VACIA = { concepto: 'Membresía', cliente: {} };

function leerIntencion(pago) {
  try {
    return JSON.parse(pago.intencion) || INTENCION_VACIA;
  } catch (_) {
    return INTENCION_VACIA;
  }
}

/* Emite el comprobante de un pago aprobado.
 *
 * Nunca lanza: que no se pueda emitir NO revierte un cobro que ya
 * entró. El pago queda aprobado, el error se registra con su id, y
 * confirmarlo otra vez emite lo que faltó. El pago sin factura sale
 * además en la lista de pendientes de administración.
 *
 * Si el pago ya tiene factura se devuelve esa y NO se vuelve a mandar
 * el correo: una confirmación repetida no puede llenarle el buzón al
 * cliente de copias del mismo comprobante. */
function emitir(pago, intencion, membresia) {
  if (!pago || !(pago.total > 0)) return null;

  const yaEsta = db.facturaDePago(pago.id);
  if (yaEsta) return yaEsta;

  try {
    const detalle = lineaDeCupos({
      cupo: intencion.tipo === 'ampliacion' ? intencion.anadidos : intencion.cupo,
      subtotal: pago.subtotal,
      inicio: membresia ? membresia.inicio : null,
      fin: membresia ? membresia.fin : null,
    });
    // Sin membresía viva no hay periodo que imprimir; mejor vacío que «null al null».
    if (!membresia) detalle.periodo = null;

    /* Por el objeto del módulo y no desestructurada: así la prueba
       puede sustituirla y simular una emisión que falla. */
    const comprobante = facturas.emitirPorPago(pago, {
      concepto: intencion.concepto, detalle, cliente: intencion.cliente || {},
    });

    /* El envío va aparte y sin esperarlo: emitir y notificar fallan por
       motivos distintos, y una caída del proveedor de correo no puede
       dejar sin comprobante un pago que ya entró. Lo que no salga lo
       reintenta la tarea diaria. Con catch, porque una promesa suelta
       que se rechace sin manejador tumba el proceso. */
    facturas.enviar(comprobante, { correoCliente: intencion.correoCliente })
      .catch((e) => console.error(
        `facturas: no se pudo enviar el comprobante ${comprobante.numero} · ${e.message}`));

    return comprobante;
  } catch (e) {
    console.error(`facturas: no se pudo emitir el comprobante del pago ${pago.id} · ${e.message}`);
    return null;
  }
}

/* LA transición pendiente → aprobado: cupos y comprobante.
 *
 * Síncrona, como la emisión; solo el correo va suelto. Repetirla es
 * seguro de punta a punta: db.aprobarPago no otorga dos veces, y si el
 * pago ya tiene factura no se emite otra ni se reenvía el correo. Y
 * sirve de recuperación: un pago aprobado cuya emisión falló se
 * completa confirmándolo otra vez, que es lo que hará la
 * reconciliación.
 *
 * `envolver` deja que la consola corra la parte de base dentro de
 * `db.enNombreDe`: recibe la función que aprueba y devuelve lo que ella
 * devuelva. NO es un segundo camino de aprobación: es la misma
 * transición, con la anotación de quién la hizo en la misma
 * transacción que los cupos. Si la anotación falla, los cupos no quedan.
 *
 * La emisión queda FUERA del envoltorio a propósito. Un NCF consumido o
 * un PDF escrito dentro de un SAVEPOINT que luego se deshace sería un
 * documento fiscal de algo que no ocurrió, y ese no se borra. Solo se
 * emite cuando la aprobación ya quedó escrita. */
function confirmarPago(idPago, { envolver } = {}) {
  const { pago, membresia, yaEstaba } = (envolver || ((f) => f()))(() => db.aprobarPago(idPago));

  // Rechazado o devuelto: no hay nada que otorgar ni que emitir.
  if (pago.estado !== 'aprobado') {
    return { pago, membresia: null, comprobante: null, yaEstaba: true };
  }

  const comprobante = emitir(pago, leerIntencion(pago), membresia);
  return { pago, membresia, comprobante, yaEstaba };
}

/* Un rechazo no emite nada ni consume NCF. El motivo solo se devuelve
   para decírselo al anunciante; guardarlo en la base es de la fase 6,
   que añade `codigo_respuesta` con la integración de la pasarela. */
function rechazarPago(idPago, { motivo } = {}) {
  const { pago, cambiado } = db.rechazarPago(idPago);
  return { pago, cambiado, motivo: motivo || null };
}

/* Los procesadores de pago, por nombre.
 *
 * `demo` es el procesador de demostración de hoy y aprueba siempre.
 * Existe para que la compra de demostración recorra la misma
 * transición que recorrerá un cobro de verdad en lugar de saltársela.
 * La pasarela real se registra aquí como una entrada más, sin tocar
 * `cobrar`. Cada uno recibe la fila del pago y devuelve
 * `{ resultado: 'aprobado' | 'rechazado' | 'pendiente', motivo? }`.
 *
 * `transferencia` responde SIEMPRE pendiente y no aprueba nunca por sí
 * sola: el dinero llega al banco, no al sitio. La aprobación la hace
 * una persona desde la consola, y pasa por `confirmarPago`, la misma
 * transición de todos los cobros, no por una copia. */
const PROCESADORES = {
  demo: async () => ({ resultado: 'aprobado' }),
  transferencia: async () => ({ resultado: 'pendiente' }),
};

/* Los métodos con los que un comprador puede pagar HOY, en orden de
   preferencia. Los decide el servidor, en cada llamada.

   Con la transferencia encendida, `demo` desaparece de la lista: demo
   aprueba siempre, y dejarlo al alcance de un comprador real sería
   regalar cupos a quien lo pidiera en la petición. Apagada, todo sigue
   como antes. La fase 6 añade `cardnet` aquí. */
function metodosDeCobro() {
  return transferenciaActiva() ? ['transferencia'] : ['demo'];
}

/* El procesador de un cobro nuevo. Lo que pida el navegador se valida
   contra la lista del servidor; sin pedido, el primero. */
function procesadorDeCobro(pedido) {
  const metodos = metodosDeCobro();
  if (pedido === undefined || pedido === null || pedido === '') return metodos[0];
  if (typeof pedido === 'string' && metodos.includes(pedido)) return pedido;
  throw Object.assign(new Error('Ese método de pago no está disponible.'), { codigo: 400 });
}

/* Pregunta al procesador del pago y resuelve la transición.
 *
 * Por defecto NUNCA se aprueba: un procesador sin entrada, uno que
 * lanza (no sabemos si se cobró; lo resolverá la reconciliación) o una
 * respuesta que no se entiende dejan el pago 'pendiente'. Solo un
 * 'aprobado' explícito otorga cupos y consume NCF. La tabla se consulta
 * en el momento de la llamada para que las pruebas puedan sustituirla. */
async function cobrar(pago) {
  const procesador = PROCESADORES[pago.procesador];
  const pendiente = () => ({
    estado: 'pendiente', pago: db.pagoPorId(pago.id), membresia: null, comprobante: null, motivo: null,
  });

  if (!procesador) return pendiente();

  let respuesta;
  try {
    respuesta = await procesador(pago);
  } catch (e) {
    console.error(`pagos: el procesador ${pago.procesador} falló con el pago ${pago.id} · ${e.message}`);
    return pendiente();
  }

  const resultado = respuesta && respuesta.resultado;
  if (resultado === 'aprobado') {
    const r = confirmarPago(pago.id);
    return {
      estado: r.pago.estado === 'aprobado' ? 'aprobado' : r.pago.estado,
      pago: r.pago, membresia: r.membresia, comprobante: r.comprobante, motivo: null,
    };
  }
  if (resultado === 'rechazado') {
    const r = rechazarPago(pago.id, { motivo: respuesta.motivo });
    return {
      estado: r.pago.estado === 'rechazado' ? 'rechazado' : r.pago.estado,
      pago: r.pago, membresia: null, comprobante: null, motivo: r.motivo,
    };
  }
  return pendiente();
}

module.exports = {
  confirmarPago, rechazarPago, cobrar, PROCESADORES, lineaDeCupos,
  metodosDeCobro, procesadorDeCobro,
};
