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
const correo = require('./correo');
/* Por el objeto del módulo y no desestructurado: la prueba sustituye su
   transporte y el cobro tiene que ver la sustitución. */
const cardnet = require('./cardnet');
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
  const { pago, membresia, yaEstaba, periodo } = (envolver || ((f) => f()))(() => db.aprobarPago(idPago));

  // Rechazado o devuelto: no hay nada que otorgar ni que emitir.
  if (pago.estado !== 'aprobado') {
    return { pago, membresia: null, comprobante: null, yaEstaba: true };
  }

  const intencion = leerIntencion(pago);
  /* La línea del comprobante de una renovación dice el periodo PAGADO
     (del fin anterior, o de hoy si ya venció, al fin nuevo), no la vida
     entera de la membresía: con `membresia.inicio` un segundo mes se
     facturaría como si cubriera también el primero.

     `periodo` solo llega en la aprobación que renovó. En un reintento
     (`yaEstaba`) ya no se sabe y cae al de la membresía, pero ese caso
     solo emite si la primera emisión falló; la que salió bien ya tiene
     su factura y `emitir` la devuelve sin volver a imprimir nada. */
  const comprobante = emitir(pago, intencion,
    periodo && membresia ? { ...membresia, inicio: periodo.inicio, fin: periodo.fin } : membresia);

  /* El aviso «ya está publicado» va aquí y no en la ruta que pide el
     pago: la transferencia se confirma desde la consola y CardNet lo
     hará desde su aviso, y los tres caminos pasan por esta función.
     Puesto en la ruta, el anuncio pagado por transferencia se habría
     publicado en silencio. `yaEstaba` impide un segundo correo cuando
     la confirmación llega dos veces. */
  if (!yaEstaba && intencion.tipo === 'publicacion') {
    avisarAnuncioPublicado({
      idAnuncio: intencion.idAnuncio,
      para: intencion.correoCliente,
      nombre: (intencion.cliente && intencion.cliente.razonSocial) || null,
      idPlan: intencion.idPlan,
    });
  }

  /* El consentimiento de renovación automática se aplica AL APROBARSE el
     pago y no al pedirlo: un pago que no se aprueba no autoriza cobros
     futuros (R-03). Solo con tarjeta y solo si la casilla iba marcada;
     con transferencia no hay tarjeta que cobrar sola. Va después de
     emitir y con su propio try/catch: no toca la emisión, y que esto
     falle no revierte un cobro que ya entró (queda la suscripción sin
     renovación automática, que el cliente puede activar a mano). */
  if (!yaEstaba && membresia) {
    try {
      if (pago.procesador === 'cardnet' && intencion.renovacionAutomatica && pago.metodo_pago_id) {
        db.activarRenovacionConTarjeta({
          idSusc: membresia.id, idOrg: pago.organizacion_id, idMetodo: pago.metodo_pago_id,
          texto: intencion.renovacionAutomatica.texto, aceptada: intencion.renovacionAutomatica.aceptada,
        });
      }
      if (intencion.tipo === 'renovacion') db.reprogramarRenovacion(membresia.id);
    } catch (e) {
      console.error(`pagos: no se pudo aplicar la renovación automática del pago ${pago.id} · ${e.message}`);
    }
  }
  return { pago, membresia, comprobante, yaEstaba };
}

/* «Su equipo ya está publicado», para el anuncio que acaba de pasar de
   borrador a activo. La usa también la ruta del importe cero, que no
   pasa por `confirmarPago`, para que los dos correos sean el mismo.

   Nunca lanza ni se espera: el anuncio ya está activo y el pago
   aprobado, y una caída del proveedor de correo no puede deshacer
   nada de eso. `enviar` devuelve una promesa con Brevo y un objeto con
   el transporte de archivo; las dos cosas se cubren, porque una
   promesa rechazada sin manejador tumba el proceso. */
function avisarAnuncioPublicado({ idAnuncio, para, nombre, idPlan }) {
  try {
    const a = db.anuncio(idAnuncio);
    if (!a || !para) return;
    const plan = idPlan ? db.planPorId(idPlan) : null;
    Promise.resolve(correo.enviarAnuncioPublicado({
      para,
      nombre,
      equipo: nombreDeEquipo(a),
      idAnuncio,
      vence: a.vence,
      plan: plan ? plan.nombre : null,
    })).catch((e) => console.error(`correo: anuncio publicado ${idAnuncio} · ${e.message}`));
  } catch (e) {
    console.error(`correo: anuncio publicado ${idAnuncio} · ${e.message}`);
  }
}

/* «2019 Peterbilt 567»: año, nombre visible de la marca y modelo. La
   marca se guarda como id (`peterbilt`); el nombre lo añade db.anuncio. */
const nombreDeEquipo = (a) => [a.anio, a.marca_nombre || a.marca, a.modelo]
  .filter((x) => x !== null && x !== undefined && x !== '').join(' ');

/* Un rechazo no emite nada ni consume NCF. Código y motivo se guardan
   en el pago (fase 6) para que el comprador y la consola vean por qué;
   además el motivo se devuelve para decírselo al anunciante. */
function rechazarPago(idPago, { motivo, codigo } = {}) {
  const { pago, cambiado } = db.rechazarPago(idPago, { codigo, motivo });
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

  /* CardNet, con la tarjeta enlazada al pago (`metodo_pago_id`).
   *
   * Se relee la fila del pago: el objeto que llega puede ser viejo (se
   * enlazó la tarjeta después de crearlo) o el pago puede haberse
   * rechazado o aprobado entre medias. Desde la relectura hasta el
   * evento `cobro-enviado` NO hay ningún `await`: un pago que deja de
   * estar pendiente en ese hueco no se cobra.
   *
   * La guarda de la 05.4 (`intencionAplicable`) se mira solo en el PRIMER
   * intento, antes de que el dinero salga: no se cobra lo que
   * `aprobarPago` va a rechazar. Con un intento previo NO se mira: CardNet
   * puede haber cobrado ya, así que se reenvía siempre con el mismo
   * `UniqueID` (devuelve el resultado ya obtenido sin duplicar) y
   * `resolver` trata el aprobado que no se pueda aplicar como
   * `aprobado-sin-aplicar`. Rechazar aquí un cobro que sí entró lo
   * dejaría invisible (R-05). */
  cardnet: async (pago) => {
    const fila = db.pagoPorId(pago.id);
    if (!fila || fila.estado !== 'pendiente') return { resultado: 'pendiente' };
    const metodo = fila.metodo_pago_id ? db.metodoPagoDe(fila.metodo_pago_id, fila.organizacion_id) : null;
    if (!metodo || metodo.activo !== 1) return { resultado: 'pendiente' };

    if (!db.huboIntentoDeCobro(fila.id)) {
      const guarda = db.intencionAplicable(fila);
      if (!guarda.ok) {
        return {
          resultado: 'rechazado', codigo: guarda.codigo,
          motivo: `${MOTIVO_NO_APLICABLE[guarda.codigo] || MOTIVO_NO_APLICABLE.default} No se le cobró nada.`,
        };
      }
    }

    // Antes de llamar: la conciliación sabe así que hubo intento (D-25).
    db.anotarEventoPago({ pagoId: fila.id, procesador: 'cardnet', origen: 'cobro', tipo: 'cobro-enviado',
      cuerpo: { referencia: fila.referencia } });
    const r = await cardnet.cobrar({ token: metodo.token, pago: fila });
    db.anotarEventoPago({ pagoId: fila.id, procesador: 'cardnet', origen: 'cobro', tipo: 'respuesta', cuerpo: r.crudo });
    db.anotarRespuestaProcesador(fila.id, {
      procesadorId: r.procesadorId, autorizacion: r.autorizacion, codigo: r.codigo, intento: true,
    });
    if (r.resultado === 'aprobado') db.anotarResultadoTarjeta(metodo.id, true);
    else if (r.resultado === 'rechazado') db.anotarResultadoTarjeta(metodo.id, false);

    const normalizado = { ...r };
    delete normalizado.crudo;
    return normalizado;
  },
};

/* Qué dice el rechazo cuando lo comprado ya no se puede aplicar. */
const MOTIVO_NO_APLICABLE = {
  'membresia-vencida': 'Esa membresía ya venció y no se le puede sumar capacidad.',
  'publicacion-huerfana': 'Ese anuncio ya no está esperando su publicación.',
  'renovacion-huerfana': 'Esa membresía ya no se puede renovar.',
  default: 'Lo que intentaba pagar ya no se puede aplicar.',
};

/* Los métodos con los que un comprador puede pagar HOY, en orden de
   preferencia. Los decide el servidor, en cada llamada.

   Con CardNet apagado, como en la fase 5: con la transferencia
   encendida `demo` desaparece de la lista (demo aprueba siempre, y
   dejarlo al alcance de un comprador real sería regalar cupos); apagada,
   todo sigue como antes. Con CardNet activo: `cardnet` primero, la
   transferencia detrás si está encendida, y nunca `demo`.
   `cardnet.activo()` se lee en cada llamada, como el interruptor de la
   transferencia. */
function metodosDeCobro() {
  if (cardnet.activo()) return transferenciaActiva() ? ['cardnet', 'transferencia'] : ['cardnet'];
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

/* Lo que se le dice a quien pagó y no se pudo aplicar. Sin teléfono: los
   únicos canales son el correo y el asistente del sitio. */
const SIN_APLICAR = 'El banco aprobó su pago, pero no pudimos activar lo que compró y no se emitió comprobante. Le devolveremos el dinero: escríbanos por correo electrónico o por el asistente del sitio y lo resolvemos.';

/* La resolución de un cobro, la misma para todos los orígenes: la
   respuesta directa de `cobrar`, la notificación de CardNet, la
   conciliación y la renovación automática llaman a ESTA función y no a
   una copia. `respuesta` es lo normalizado por el procesador:
   `{ resultado, motivo?, codigo?, procesadorId?, autorizacion?, redireccion?, origen? }`.
   Solo un `aprobado` explícito llega a `confirmarPago`.
   Repetirla con la misma respuesta es seguro (una factura, un evento).

   El aprobado que no se puede aplicar NO se rechaza. Si `aprobarPago`
   lanza 404/409 (la membresía venció entre la guarda y la aprobación),
   o `confirmarPago` vuelve con el pago en otro estado que `aprobado`
   (`db.aprobarPago` devuelve `yaEstaba` en silencio para un pago ya
   rechazado: `reemplazado`, `abandonado`, la guarda), el dinero SÍ
   entró. Rechazarlo lo haría invisible; se anota UN evento
   `aprobado-sin-aplicar` (sin comprobante ni NCF) que recoge el informe
   y la conciliación deja de reintentar. */
function resolver(pago, respuesta) {
  const pendiente = (extra = {}) => ({
    estado: 'pendiente', pago: db.pagoPorId(pago.id), membresia: null, comprobante: null, motivo: null, ...extra,
  });
  const resultado = respuesta && respuesta.resultado;

  if (respuesta && (respuesta.procesadorId || respuesta.autorizacion || respuesta.codigo)) {
    db.anotarRespuestaProcesador(pago.id, {
      procesadorId: respuesta.procesadorId, autorizacion: respuesta.autorizacion, codigo: respuesta.codigo,
    });
  }

  if (resultado === 'aprobado') {
    let r = null;
    let fallo = null;
    try {
      r = confirmarPago(pago.id);
    } catch (e) {
      if (e && (e.codigo === 404 || e.codigo === 409)) fallo = e;
      else throw e;
    }
    if (r && r.pago.estado === 'aprobado') {
      return {
        estado: 'aprobado', pago: r.pago, membresia: r.membresia, comprobante: r.comprobante, motivo: null,
      };
    }
    const actual = db.pagoPorId(pago.id);
    if (!db.eventosDePago(pago.id).some((e) => e.tipo === 'aprobado-sin-aplicar')) {
      db.anotarEventoPago({
        pagoId: pago.id, procesador: pago.procesador, origen: respuesta.origen || 'cobro',
        tipo: 'aprobado-sin-aplicar',
        cuerpo: {
          referencia: actual ? actual.referencia : null,
          procesadorId: respuesta.procesadorId || null, autorizacion: respuesta.autorizacion || null,
          estadoDelPago: actual ? actual.estado : null,
          causa: fallo ? fallo.message : 'el pago ya no estaba pendiente',
        },
      });
      console.error(`pagos: CardNet aprobó el pago ${pago.id} (${actual ? actual.referencia : '?'}) pero no se pudo aplicar · ${
        fallo ? fallo.message : `estado ${actual ? actual.estado : '?'}`}`);
    }
    return pendiente({ sinAplicar: true, motivo: SIN_APLICAR });
  }

  if (resultado === 'rechazado') {
    const codigo = respuesta.codigo || null;
    const r = rechazarPago(pago.id, { motivo: respuesta.motivo || cardnet.mensajeDeRechazo(codigo), codigo });
    return {
      estado: r.pago.estado === 'rechazado' ? 'rechazado' : r.pago.estado,
      pago: r.pago, membresia: null, comprobante: null, motivo: r.motivo,
    };
  }

  if (respuesta && respuesta.redireccion) return pendiente({ redireccion: respuesta.redireccion });
  return pendiente();
}

/* Pregunta al procesador del pago y resuelve la transición.
 *
 * Por defecto NUNCA se aprueba: un procesador sin entrada, uno que
 * lanza (no sabemos si se cobró; lo resolverá la conciliación) o una
 * respuesta que no se entiende dejan el pago 'pendiente'. Solo un
 * 'aprobado' explícito otorga cupos y consume NCF, y eso lo decide
 * `resolver`. La tabla se consulta en el momento de la llamada para que
 * las pruebas puedan sustituirla. */
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
  return resolver(pago, respuesta);
}

/* ── El primer cobro con tarjeta: captura, registro, confirmación ───
 *
 * Ninguna de estas funciones acepta ni reenvía datos de tarjeta: solo
 * ids, referencias y lo que devuelve CardNet ya limpio. */

const error = (codigo, mensaje) => Object.assign(new Error(mensaje), { codigo });

/* Prepara el formulario de captura de la tarjeta (D-17): crea el
   `Customer` de la organización la primera vez y lo reutiliza después
   (dos clientes dejarían tarjetas repartidas y ninguna renovación sabría
   cuál usar). Cada consulta del cliente da una sesión de captura nueva,
   así que se pide siempre. Devuelve la URL y el origen que el navegador
   puede cargar. */
async function prepararCaptura(pago, { correo, nombre, rnc } = {}) {
  if (!cardnet.activo()) throw error(409, 'El pago con tarjeta no está disponible.');
  const NO_ABRE = 'No pudimos abrir el formulario de la tarjeta. No se le cobró nada.';
  let clienteId = db.clienteProcesador(pago.organizacion_id, 'cardnet');
  if (!clienteId) {
    const c = await cardnet.crearCliente({ correo, nombre, rnc });
    if (!c.ok) {
      console.error(`pagos: CardNet no creó el cliente de la organización ${pago.organizacion_id} · ${JSON.stringify(cardnet.limpiar(c))}`);
      throw error(502, NO_ABRE);
    }
    clienteId = db.guardarClienteProcesador(pago.organizacion_id, 'cardnet', c.clienteId);
  }
  const v = await cardnet.verCliente(clienteId);
  if (!v.ok) {
    console.error(`pagos: CardNet no abrió la captura del cliente ${clienteId} · ${JSON.stringify(cardnet.limpiar(v))}`);
    throw error(502, NO_ABRE);
  }
  return { urlCaptura: v.urlCaptura, origen: cardnet.origenCaptura() };
}

/* Registra la tarjeta que el cliente acaba de capturar (D-10, D-17).
   El navegador solo avisa de que terminó: el token se toma del
   `Customer` en CardNet, porque aceptar uno del navegador permitiría
   cobrar a una tarjeta ajena. Elige el perfil que aún no está en
   `metodos_pago` de la organización (el último, si hay varios), o el más
   reciente si todos ya están. Devuelve la tarjeta SIN token. */
async function registrarTarjeta(pago) {
  const clienteId = db.clienteProcesador(pago.organizacion_id, 'cardnet');
  if (!clienteId) throw error(409, 'No encontramos la tarjeta. Vuelva a ingresarla.');
  const v = await cardnet.verCliente(clienteId);
  if (!v.ok) {
    console.error(`pagos: CardNet no devolvió el cliente ${clienteId} · ${JSON.stringify(cardnet.limpiar(v))}`);
    throw error(502, 'No pudimos leer la tarjeta. No se le cobró nada.');
  }
  const perfiles = v.perfiles || [];
  if (!perfiles.length) throw error(409, 'No encontramos la tarjeta. Vuelva a ingresarla.');

  const guardados = new Set(db.metodosPagoDe(pago.organizacion_id)
    .map((m) => db.metodoPagoDe(m.id, pago.organizacion_id))
    .filter(Boolean).map((f) => f.procesador_perfil_id));
  const nuevos = perfiles.filter((p) => !guardados.has(String(p.perfilId)));
  const perfil = (nuevos.length ? nuevos : perfiles).slice(-1)[0];

  const fila = db.guardarMetodoPago({ idOrg: pago.organizacion_id, procesador: 'cardnet', clienteId, perfil });
  db.enlazarMetodoPago(pago.id, fila.id);
  const metodo = db.metodosPagoDe(pago.organizacion_id).find((m) => m.id === fila.id);
  return { metodo, activacion: !metodo.activo };
}

/* Los pagos que se están confirmando ahora mismo en ESTE proceso. Frena
   el doble clic: la segunda llamada sobre el mismo pago no llega a
   CardNet. Entre procesos protegen el `UniqueID` (que es la referencia
   del pago) y la idempotencia de `confirmarPago`. */
const EN_CURSO = new Set();

/* Confirma el pago con tarjeta: la guardada que el cliente eligió
   (`metodoPago`, un id que se valida contra su organización) o la que
   acaba de capturar. El token nunca viene de quien llama: sale de la
   fila de `metodos_pago`, que salió del `Customer` de CardNet. Una
   tarjeta sin activar no se cobra: devuelve `{ estado: 'activacion' }`. */
async function confirmarConTarjeta(idPago, idOrg, { metodoPago } = {}) {
  const pago = db.pagoPorId(idPago);
  if (!pago || pago.organizacion_id !== idOrg || pago.procesador !== 'cardnet') {
    throw error(404, 'Ese pago no existe.');
  }
  if (EN_CURSO.has(idPago)) throw error(409, 'Ese pago ya se está procesando.');
  EN_CURSO.add(idPago);
  try {
    const actual = db.pagoPorId(idPago);
    if (actual.estado !== 'pendiente') {
      return { estado: actual.estado, pago: actual, membresia: null, comprobante: null, motivo: actual.motivo || null };
    }
    let metodo;
    if (metodoPago) {
      const tarjeta = db.metodoPagoDe(metodoPago, idOrg);
      if (!tarjeta || tarjeta.activo !== 1) throw error(400, 'Esa tarjeta no está disponible.');
      db.enlazarMetodoPago(idPago, tarjeta.id);
      metodo = { id: tarjeta.id, activo: true };
    } else {
      metodo = (await registrarTarjeta(actual)).metodo;
    }
    if (!metodo.activo) return { estado: 'activacion', metodoPago: metodo };
    return await cobrar(db.pagoPorId(idPago));
  } finally {
    EN_CURSO.delete(idPago);
  }
}

/* Activa una tarjeta con el código que CardNet le pide al cliente (D-20).
   Solo se marca activa si CardNet confirma. */
async function activarTarjeta(idMetodo, idOrg, codigo) {
  const c = typeof codigo === 'string' ? codigo.trim() : '';
  if (!c || c.length > 12) throw error(400, 'Escriba el código de activación que le envió el banco.');
  const metodo = db.metodoPagoDe(idMetodo, idOrg);
  if (!metodo) throw error(404, 'Esa tarjeta no existe.');
  const r = await cardnet.activarPerfil({ clienteId: metodo.procesador_cliente_id, token: metodo.token, codigo: c });
  if (!r.ok) throw error(409, 'No pudimos activar la tarjeta. Revise el código e intente de nuevo.');
  db.activarMetodoPago(idMetodo, idOrg);
  return { metodo: db.metodosPagoDe(idOrg).find((m) => m.id === idMetodo) || null };
}

/* Un pendiente de tarjeta que nunca llegó a CardNet no puede bloquear
   24 horas un borrador o una membresía: los índices únicos de la 05.2 y
   la 05.3 solo admiten un pendiente, y quien cambió de idea o abandonó
   la captura tendría que esperar. Uno CON intento de cobro NO se anula
   aquí: pudo cobrarse, y lo resuelve la conciliación. */
function pendienteSinCobro(pago) {
  return !!pago && pago.procesador === 'cardnet' && pago.estado === 'pendiente' && !db.huboIntentoDeCobro(pago.id);
}

function anularPendienteSinCobro(idPago) {
  const pago = db.pagoPorId(idPago);
  if (!pago) throw error(404, 'Ese pago no existe.');
  if (pago.procesador === 'cardnet' && pago.estado === 'pendiente' && db.huboIntentoDeCobro(idPago)) {
    throw error(409, 'Ese pago ya se envió al banco: lo resuelve la conciliación.');
  }
  if (!pendienteSinCobro(pago)) return { pago, cambiado: false, motivo: null };
  return rechazarPago(idPago, {
    codigo: 'reemplazado', motivo: 'Se abrió otro pago para lo mismo. No se le cobró nada.',
  });
}

module.exports = {
  confirmarPago, rechazarPago, cobrar, resolver, PROCESADORES, lineaDeCupos,
  metodosDeCobro, procesadorDeCobro, avisarAnuncioPublicado, nombreDeEquipo,
  prepararCaptura, registrarTarjeta, confirmarConTarjeta, activarTarjeta,
  pendienteSinCobro, anularPendienteSinCobro,
};
