/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Importación asistida (fase 14)

   Estados del expediente, transiciones permitidas y quién hace cada
   una, conceptos del libro de dinero del cliente, parámetros con nombre
   e interruptores. Lo carga el navegador con <script> y el servidor con
   require(), como `assets/servicios.js`: la pantalla y el servidor leen
   la misma tabla, no dos copias que se desincronizan.

   La referencia completa (rutas, errores, firmas de tools/importacion.js)
   está en `.planning/importacion-contrato.md`. Si algo de aquí no casa
   con el contrato, manda el contrato y se corrige aquí.

   TODO ESTÁ APAGADO A PROPÓSITO. El servicio se construye entero y se
   entrega con los interruptores en `false`: encenderlo exige que todos
   los parámetros obligatorios tengan valor (`puedeEncenderse`) y que lo
   fiscal esté decidido e implementado (`FISCAL_LISTO`). La decisión
   fiscal (la empresa como mandataria o como revendedora) la toma el
   contador de Victor; hasta entonces, nada que emita un comprobante.

   NINGÚN PRECIO NI COMISIÓN SE PROPONE AQUÍ. Lo que no ha decidido
   Victor, el contador, el abogado o las condiciones de la subasta está
   a `null`, y con un `null` obligatorio el servicio no se enciende.

   Unidades, para no repetirlas en cada línea:
     · Importes: enteros en centavos de la moneda de la línea (US$ salvo
       que diga otra cosa). Nunca decimales: un 0.1 + 0.2 en un depósito
       es exactamente el error que no se puede devolver.
     · Porcentajes: enteros en puntos básicos (1 % = 100), para que el
       redondeo sea aritmética de enteros y no de coma flotante.
     · Plazos: enteros en días (`_DIAS`) o en horas (`_H`).

   El «cargo por aplicar el depósito» (`CARGO_APLICAR_DEPOSITO`) es un
   cargo de la subasta. No tiene nada que ver con el 3 % de la fórmula de
   precios del sitio, y este módulo no carga `assets/precios.js`.
   ═══════════════════════════════════════════════════════════ */

/* Todo dentro de una función y un solo nombre global, `Importacion`:
   panel.js ya declara un `ESTADOS` propio, y dos `const` con el mismo
   nombre en dos <script> de la misma página tumban el segundo entero. */
const Importacion = (function () {
  const IMPORTACION = {
    // El flujo nuevo entero. Apagado, `importar.html` y su formulario
    // siguen como hoy y las rutas nuevas responden 503.
    asistida: { activo: false },
    // La inspección en la yarda: opcional, cobrada aparte, no es garantía
    // y no se reembolsa.
    inspeccion: { activa: false },
    // La calculadora pública (#113). Se enciende cuando Victor apruebe
    // la tabla de #112.
    calculadora: { activa: false },
  };

  /* Lo fiscal no está implementado: depende de la decisión del contador.
     Mientras sea `false`, `puedeEncenderse` no deja encender el servicio
     aunque `MODELO_FISCAL` tenga valor. Se pone a `true` en el mismo PR
     que implemente y pruebe la emisión de comprobantes. */
  const FISCAL_LISTO = false;

  const PARAMETROS = {
    /* Contador. 'mandatario': la empresa compra por cuenta del cliente.
       'revendedor': la empresa compra y revende. Cambia qué conceptos
       emiten NCF; las tablas son las mismas. */
    MODELO_FISCAL: null,

    /* Victor (modelo-comercial.md). Objeto { TX, FL, PA, EXCEPCION } en
       centavos de US$. Sin él la inspección no se enciende. */
    PRECIO_INSPECCION_POR_ZONA: null,

    /* Victor (modelo-comercial.md). { forma: 'fija', importe } o
       { forma: 'porcentaje', pb, minimo, maximo } (minimo y maximo en
       centavos, opcionales). */
    COMISION_SERVICIO: null,

    /* Confirmado por Victor en #110: US$40,000. Solo cambia cómo se
       destaca la sugerencia de inspección, nunca si se ofrece. */
    UMBRAL_INSPECCION_DESTACADA: 4000000,

    // Victor. Estados de EE. UU. desde los que se proponen lotes.
    ZONAS_PERMITIDAS: ['TX', 'FL', 'PA'],
    // Victor. Presupuesto mínimo (centavos) para proponer fuera de zona.
    PRESUPUESTO_MIN_EXCEPCION_ZONA: null,

    // Condiciones de la subasta (#115).
    PORCENTAJE_DEPOSITO_SUBASTA: null, // pb sobre el límite de puja
    CARGO_APLICAR_DEPOSITO: null, // pb sobre el depósito aplicado
    COMISION_TRANSFERENCIA: null, // centavos, fijo por transferencia
    PLAZO_PAGO_SUBASTA_DIAS: null,
    PLAZO_RETIRO_DIAS: null,
    MULTAS_SUBASTA: null,

    // Plazos propios (Victor, con #115).
    PLAZO_PROPUESTA_DIAS: null,
    PLAZO_SALDO_CLIENTE_DIAS: null,
    PLAZO_DEPOSITO_ANTES_SUBASTA_H: null,
    PLAZO_MIN_INSPECCION_DIAS: null,
    PLAZO_DECISION_TRAS_INFORME_H: null,
    PLAZO_AJUSTE_DIAS: null,
    PLAZO_DEVOLUCION_DIAS: null,
    RECORDATORIOS_SALDO_H: null, // lista de horas antes del vencimiento

    /* Victor, con #115. 'al_ganar': un solo cobro grande al ganar.
       'por_etapa': cada tramo logístico se cobra antes de contratarlo. */
    POLITICA_COBRO: null,

    // Victor, con #115. pb de colchón sobre lo estimado; 0 = ninguno.
    COLCHON_IMPREVISTOS: null,

    // Victor y contador. 'USD' o 'DOP'; con 'DOP', FUENTE_TASA obligatoria.
    MONEDA_COBRO: null,
    FUENTE_TASA: null,

    /* Contrato (#115, abogado). { retiene: [conceptos], descuento } con
       `descuento` en centavos: qué se descuenta de la devolución. */
    DEVOLUCION_SI_PERDIDA: null,
    DEVOLUCION_SIN_PUJA: null,

    // Abogado. 'en_linea' o 'documento' (PDF firmado subido).
    FIRMA_CONTRATO: null,
  };

  const OPCIONES = {
    MODELO_FISCAL: ['mandatario', 'revendedor'],
    POLITICA_COBRO: ['al_ganar', 'por_etapa'],
    MONEDA_COBRO: ['USD', 'DOP'],
    FIRMA_CONTRATO: ['en_linea', 'documento'],
  };

  /* ── Estados ─────────────────────────────────────────────── */

  const ESTADOS = Object.freeze([
    'solicitada', 'en_busqueda', 'propuesta', 'confirmacion',
    'inspeccion_pendiente_pago', 'inspeccion_en_curso', 'inspeccion_entregada',
    'deposito_pendiente', 'lista_para_pujar', 'pujando',
    'perdida', 'ganada', 'saldo_pendiente', 'pagada_subasta',
    'retiro', 'transito_terrestre', 'puerto_origen', 'transito_maritimo',
    'en_aduana', 'endosada', 'transporte_rd', 'entregada',
    'devolucion_pendiente', 'cerrada',
    'desistida', 'sin_opciones', 'cancelada', 'incumplida',
  ]);

  const ESTADOS_SALIDA = Object.freeze(['desistida', 'sin_opciones', 'cancelada', 'incumplida']);
  const ACTORES = Object.freeze(['cliente', 'personal', 'sistema']);

  /* Etapas de cobro. Una transición con `cobro` exige que el cobro de esa
     etapa esté CONFIRMADO; con `cobroPorEtapa`, solo cuando
     POLITICA_COBRO = 'por_etapa' (con 'al_ganar' ese tramo ya se cobró en
     el saldo). Es la regla que sostiene todo: la empresa no se compromete
     con un tercero (pujar, pagar la subasta, contratar un flete) con
     dinero que todavía no tiene. */
  const TRANSICIONES = Object.freeze([
    { de: 'solicitada', a: 'en_busqueda', actor: 'personal' },
    { de: 'en_busqueda', a: 'propuesta', actor: 'personal', exige: 'al menos un lote propuesto' },
    { de: 'en_busqueda', a: 'sin_opciones', actor: 'personal' },
    { de: 'propuesta', a: 'confirmacion', actor: 'cliente', exige: 'un lote elegido' },
    { de: 'propuesta', a: 'en_busqueda', actor: 'sistema', exige: 'el lote caducó sin elección' },
    { de: 'confirmacion', a: 'propuesta', actor: 'cliente', exige: 'cambiar de lote' },
    { de: 'confirmacion', a: 'deposito_pendiente', actor: 'cliente', exige: 'huella que casa y condiciones aceptadas, sin inspección pedida' },
    { de: 'confirmacion', a: 'inspeccion_pendiente_pago', actor: 'cliente', exige: 'huella que casa y condiciones aceptadas, con inspección pedida' },
    { de: 'inspeccion_pendiente_pago', a: 'inspeccion_en_curso', actor: 'personal', cobro: 'inspeccion' },
    { de: 'inspeccion_pendiente_pago', a: 'deposito_pendiente', actor: 'sistema', exige: 'venció el pago de la inspección: sigue sin inspección' },
    { de: 'inspeccion_en_curso', a: 'inspeccion_entregada', actor: 'personal', exige: 'informe_inspeccion subido' },
    { de: 'inspeccion_entregada', a: 'deposito_pendiente', actor: 'cliente', exige: 'decide seguir' },
    { de: 'inspeccion_entregada', a: 'desistida', actor: 'sistema', exige: 'venció PLAZO_DECISION_TRAS_INFORME_H sin respuesta' },
    { de: 'deposito_pendiente', a: 'lista_para_pujar', actor: 'personal', cobro: 'deposito' },
    { de: 'deposito_pendiente', a: 'en_busqueda', actor: 'sistema', exige: 'el depósito no se confirmó a tiempo: no se puja' },
    { de: 'lista_para_pujar', a: 'confirmacion', actor: 'cliente', exige: 'subir el límite de puja: otra confirmación' },
    { de: 'lista_para_pujar', a: 'pujando', actor: 'personal', cobro: 'deposito' },
    { de: 'pujando', a: 'ganada', actor: 'personal', exige: 'precio de martillo' },
    { de: 'pujando', a: 'perdida', actor: 'personal' },
    { de: 'perdida', a: 'propuesta', actor: 'cliente', exige: 'otro lote con el mismo depósito' },
    { de: 'perdida', a: 'devolucion_pendiente', actor: 'cliente' },
    { de: 'ganada', a: 'saldo_pendiente', actor: 'sistema' },
    { de: 'saldo_pendiente', a: 'pagada_subasta', actor: 'personal', cobro: 'saldo' },
    { de: 'saldo_pendiente', a: 'incumplida', actor: 'sistema', exige: 'venció PLAZO_SALDO_CLIENTE_DIAS' },
    { de: 'saldo_pendiente', a: 'incumplida', actor: 'personal', exige: 'motivo' },
    { de: 'pagada_subasta', a: 'retiro', actor: 'personal', cobroPorEtapa: 'flete_eeuu' },
    { de: 'retiro', a: 'transito_terrestre', actor: 'personal' },
    { de: 'transito_terrestre', a: 'puerto_origen', actor: 'personal' },
    { de: 'puerto_origen', a: 'transito_maritimo', actor: 'personal', cobroPorEtapa: 'maritimo' },
    { de: 'transito_maritimo', a: 'en_aduana', actor: 'personal' },
    { de: 'en_aduana', a: 'endosada', actor: 'personal', cobroPorEtapa: 'aduana', exige: 'ajuste de liquidación a cobrar, si lo hay, confirmado' },
    { de: 'endosada', a: 'transporte_rd', actor: 'personal', cobroPorEtapa: 'flete_rd' },
    { de: 'transporte_rd', a: 'entregada', actor: 'personal', exige: 'acta_entrega subida' },
    { de: 'entregada', a: 'cerrada', actor: 'sistema', exige: 'saldo del cliente en cero' },
    { de: 'entregada', a: 'devolucion_pendiente', actor: 'sistema', exige: 'queda dinero del cliente' },
    { de: 'devolucion_pendiente', a: 'cerrada', actor: 'personal', exige: 'devolución registrada en el libro' },
    // Salidas antes de pujar.
    ...['solicitada', 'en_busqueda', 'propuesta', 'confirmacion', 'inspeccion_pendiente_pago',
      'inspeccion_entregada', 'deposito_pendiente', 'lista_para_pujar']
      .map((de) => ({ de, a: 'desistida', actor: 'cliente' })),
    ...['solicitada', 'en_busqueda', 'propuesta', 'confirmacion', 'inspeccion_pendiente_pago',
      'inspeccion_en_curso', 'inspeccion_entregada', 'deposito_pendiente', 'lista_para_pujar']
      .map((de) => ({ de, a: 'cancelada', actor: 'personal', exige: 'motivo' })),
    // Desde una salida solo se devuelve o se cierra.
    ...ESTADOS_SALIDA.map((de) => ({ de, a: 'devolucion_pendiente', actor: 'sistema', exige: 'queda dinero del cliente' })),
    ...ESTADOS_SALIDA.map((de) => ({ de, a: 'cerrada', actor: 'sistema', exige: 'saldo del cliente en cero' })),
  ]);

  function transicionPermitida(de, a, actor) {
    return TRANSICIONES.some((t) => t.de === de && t.a === a && t.actor === actor);
  }

  function transicion(de, a, actor) {
    return TRANSICIONES.find((t) => t.de === de && t.a === a && t.actor === actor) || null;
  }

  /* ── Conceptos del libro ─────────────────────────────────── */

  const CONCEPTOS = Object.freeze([
    'inspeccion', 'comision_servicio', 'deposito_puja', 'cargo_aplicar_deposito',
    'precio_equipo', 'cargos_comprador', 'comision_transferencia', 'multa_subasta',
    'flete_terrestre_eeuu', 'flete_maritimo', 'seguro', 'impuestos_aduana',
    'agente_aduanal', 'gastos_puerto', 'flete_rd', 'ajuste_liquidacion', 'otro',
  ]);

  const SENTIDOS = Object.freeze(['cobro_cliente', 'pago_tercero', 'devolucion_cliente', 'ajuste']);

  /* Lo que nunca entra en una devolución, sea cual sea el motivo: la
     inspección se cobró como servicio aparte y no se reembolsa (decisión
     de Victor, #110). */
  const NO_REEMBOLSABLES = Object.freeze(['inspeccion']);

  const ETAPAS = Object.freeze(['inspeccion', 'deposito', 'saldo', 'flete_eeuu', 'maritimo', 'aduana', 'flete_rd']);

  const TRAMOS = {
    flete_eeuu: ['flete_terrestre_eeuu'],
    maritimo: ['flete_maritimo', 'seguro'],
    aduana: ['impuestos_aduana', 'agente_aduanal', 'gastos_puerto'],
    flete_rd: ['flete_rd'],
  };

  /* Qué conceptos se cobran en cada etapa. La comisión del servicio va en
     el saldo en las dos políticas porque es la única etapa en la que ya se
     conoce el martillo (sirve tanto si es fija como si es un porcentaje).
     Con 'al_ganar' los tramos logísticos entran también en el saldo y sus
     etapas propias quedan vacías. */
  function conceptosDeEtapa(etapa, politica) {
    if (etapa === 'inspeccion') return ['inspeccion'];
    if (etapa === 'deposito') return ['deposito_puja'];
    if (etapa === 'saldo') {
      const base = ['precio_equipo', 'cargos_comprador', 'cargo_aplicar_deposito', 'comision_transferencia', 'comision_servicio'];
      if (politica === 'al_ganar') return base.concat(TRAMOS.flete_eeuu, TRAMOS.maritimo, TRAMOS.aduana, TRAMOS.flete_rd);
      return base;
    }
    if (TRAMOS[etapa]) return politica === 'por_etapa' ? TRAMOS[etapa].slice() : [];
    throw new Error(`etapa desconocida: ${etapa}`);
  }

  /* ── Dinero: aritmética de enteros ───────────────────────── */

  function entero(valor, que) {
    if (!Number.isSafeInteger(valor)) throw new Error(`${que} tiene que ser un entero (centavos o puntos básicos): ${valor}`);
    return valor;
  }

  /* importe × pb / 10000, redondeado a la mitad hacia arriba, SIN coma
     flotante. Math.round(5000 * (3 / 10000)) da 1 y no 2, porque
     5000 × 0,0003 sale 1,4999999999999998 en binario; aquí sale lo mismo
     en el navegador y en el servidor. Solo admite no negativos. */
  function porcentaje(importe, pb) {
    entero(importe, 'el importe');
    entero(pb, 'el porcentaje');
    if (importe < 0 || pb < 0) throw new Error('porcentaje() no admite negativos');
    return Math.floor((importe * pb + 5000) / 10000);
  }

  function depositoPara(limitePuja, config) {
    const pb = config.PORCENTAJE_DEPOSITO_SUBASTA;
    if (pb == null) throw new Error('falta PORCENTAJE_DEPOSITO_SUBASTA');
    return porcentaje(entero(limitePuja, 'el límite de puja'), pb);
  }

  function comisionServicio(base, config) {
    const c = config.COMISION_SERVICIO;
    if (!c) throw new Error('falta COMISION_SERVICIO');
    if (c.forma === 'fija') return entero(c.importe, 'la comisión fija');
    if (c.forma === 'porcentaje') {
      let importe = porcentaje(base, c.pb);
      if (c.minimo != null) importe = Math.max(importe, entero(c.minimo, 'el mínimo'));
      if (c.maximo != null) importe = Math.min(importe, entero(c.maximo, 'el máximo'));
      return importe;
    }
    throw new Error(`forma de comisión desconocida: ${c.forma}`);
  }

  /* Aplica el depósito contra las líneas del saldo, en el orden en que
     vienen (el servidor las manda en el orden de CONCEPTOS, así que
     primero el precio del equipo). Devuelve qué falta cobrar por cada
     concepto, cuánto del depósito se aplicó a cada uno (en el libro va
     como un par de ajustes: menos en deposito_puja, más en ese concepto)
     y el sobrante si el depósito superó el saldo, que se devuelve al
     cerrar. Ninguna línea queda negativa. */
  function aplicarDeposito(lineas, deposito) {
    entero(deposito, 'el depósito');
    let queda = deposito;
    const cobros = [];
    const aplicaciones = [];
    for (const l of lineas) {
      entero(l.importe, `la línea ${l.concepto}`);
      const aplicado = Math.min(queda, l.importe);
      queda -= aplicado;
      if (aplicado > 0) aplicaciones.push({ concepto: l.concepto, importe: aplicado });
      if (l.importe - aplicado > 0) cobros.push({ concepto: l.concepto, importe: l.importe - aplicado });
    }
    return { cobros, aplicaciones, sobrante: queda };
  }

  /* Signo de cada movimiento en el saldo del cliente: el dinero suyo que
     la empresa tiene en la mano. Un ajuste lleva su propio signo. */
  function importeConSigno(m) {
    if (m.sentido === 'cobro_cliente') return m.importe;
    if (m.sentido === 'devolucion_cliente' || m.sentido === 'pago_tercero') return -m.importe;
    if (m.sentido === 'ajuste') return m.importe;
    throw new Error(`sentido desconocido: ${m.sentido}`);
  }

  function saldoCliente(movimientos) {
    return movimientos.reduce((s, m) => s + importeConSigno(m), 0);
  }

  /* Cuánto se le devuelve al cliente según la política del motivo.
     `politica` es { retiene: [conceptos], descuento } o null (sin
     retención). Los movimientos de un concepto retenido o no reembolsable
     no cuentan, ni a favor ni en contra: lo cobrado por la inspección y
     lo pagado al inspector quedan fuera juntos. El descuento fijo se resta
     al final y la devolución nunca es negativa. */
  function devolucionDe(movimientos, politica) {
    const fuera = new Set(NO_REEMBOLSABLES.concat((politica && politica.retiene) || []));
    const base = movimientos
      .filter((m) => !fuera.has(m.concepto))
      .reduce((s, m) => s + importeConSigno(m), 0);
    const descuento = politica && politica.descuento ? entero(politica.descuento, 'el descuento') : 0;
    return Math.max(0, base - descuento);
  }

  /* Qué política de devolución rige según el estado del que se sale. */
  function motivoDevolucion(estadoPrevio) {
    if (estadoPrevio === 'perdida') return 'perdida';
    if (estadoPrevio === 'incumplida') return 'incumplida';
    if (estadoPrevio === 'cancelada') return 'cancelada';
    if (estadoPrevio === 'entregada') return 'cierre';
    if (estadoPrevio === 'desistida' || estadoPrevio === 'sin_opciones') return 'sin_puja';
    throw new Error(`no hay devolución desde ${estadoPrevio}`);
  }

  function politicaDevolucion(motivo, config) {
    if (motivo === 'perdida') return config.DEVOLUCION_SI_PERDIDA;
    if (motivo === 'sin_puja') return config.DEVOLUCION_SIN_PUJA;
    // El diseño de #110 lo fija: quien incumple pierde el depósito y
    // carga con las multas de la subasta.
    if (motivo === 'incumplida') return { retiene: ['deposito_puja', 'multa_subasta'], descuento: 0 };
    // Cancelación por la empresa y sobrante al cerrar: sin retención
    // (salvo lo no reembolsable). Pendiente de que Victor lo confirme.
    if (motivo === 'cancelada' || motivo === 'cierre') return null;
    throw new Error(`motivo de devolución desconocido: ${motivo}`);
  }

  function destacarInspeccion(presupuesto, config) {
    return entero(presupuesto, 'el presupuesto') >= config.UMBRAL_INSPECCION_DESTACADA;
  }

  /* ── Huella del desglose ─────────────────────────────────── */

  /* JSON canónico: claves ordenadas, sin espacios, y solo números
     enteros. Un decimal aquí es un importe mal calculado: se rechaza en
     vez de firmarlo. */
  function canonico(valor) {
    if (valor === null || typeof valor === 'boolean' || typeof valor === 'string') return JSON.stringify(valor);
    if (typeof valor === 'number') return String(entero(valor, 'un número del desglose'));
    if (Array.isArray(valor)) return `[${valor.map(canonico).join(',')}]`;
    if (typeof valor === 'object') {
      return `{${Object.keys(valor).sort().map((k) => `${JSON.stringify(k)}:${canonico(valor[k])}`).join(',')}}`;
    }
    throw new Error(`valor no admitido en el desglose: ${typeof valor}`);
  }

  /* Lo que se firma: solo estos campos. Lo demás que viaje con el
     desglose (nombres, textos de ayuda) puede cambiar sin cambiar lo que
     el cliente aceptó. */
  function contenidoFirmado(desglose) {
    return {
      cifras_version: desglose.cifras_version,
      condiciones_version: desglose.condiciones_version,
      limite_puja: desglose.limite_puja,
      lineas: desglose.lineas.map((l) => ({
        concepto: l.concepto, importe: l.importe, moneda: l.moneda, es_estimado: !!l.es_estimado,
      })),
    };
  }

  /* SHA-256 en hex. Solo en el servidor: el navegador recibe la huella ya
     calculada y la devuelve al confirmar. */
  function huellaDesglose(desglose) {
    if (typeof require !== 'function') throw new Error('huellaDesglose solo corre en el servidor');
    return require('crypto').createHash('sha256').update(canonico(contenidoFirmado(desglose))).digest('hex');
  }

  /* ── Configuración e interruptores ───────────────────────── */

  /* La configuración efectiva: los parámetros y los interruptores de este
     módulo con lo que se sobrescriba. Las pruebas la inyectan así en vez
     de tocar el módulo compartido. */
  function configuracion(sobre) {
    const s = sobre || {};
    return Object.assign({}, PARAMETROS, s, {
      IMPORTACION: {
        asistida: Object.assign({}, IMPORTACION.asistida, s.IMPORTACION && s.IMPORTACION.asistida),
        inspeccion: Object.assign({}, IMPORTACION.inspeccion, s.IMPORTACION && s.IMPORTACION.inspeccion),
        calculadora: Object.assign({}, IMPORTACION.calculadora, s.IMPORTACION && s.IMPORTACION.calculadora),
      },
      FISCAL_LISTO: s.FISCAL_LISTO != null ? s.FISCAL_LISTO : FISCAL_LISTO,
    });
  }

  const OBLIGATORIOS_ASISTIDA = Object.freeze([
    'MODELO_FISCAL', 'COMISION_SERVICIO', 'UMBRAL_INSPECCION_DESTACADA', 'ZONAS_PERMITIDAS',
    'PRESUPUESTO_MIN_EXCEPCION_ZONA', 'PORCENTAJE_DEPOSITO_SUBASTA', 'CARGO_APLICAR_DEPOSITO',
    'COMISION_TRANSFERENCIA', 'PLAZO_PAGO_SUBASTA_DIAS', 'PLAZO_RETIRO_DIAS', 'MULTAS_SUBASTA',
    'PLAZO_PROPUESTA_DIAS', 'PLAZO_SALDO_CLIENTE_DIAS', 'PLAZO_DEPOSITO_ANTES_SUBASTA_H',
    'PLAZO_AJUSTE_DIAS', 'PLAZO_DEVOLUCION_DIAS', 'RECORDATORIOS_SALDO_H', 'POLITICA_COBRO',
    'COLCHON_IMPREVISTOS', 'MONEDA_COBRO', 'DEVOLUCION_SI_PERDIDA', 'DEVOLUCION_SIN_PUJA',
    'FIRMA_CONTRATO',
  ]);

  const OBLIGATORIOS_INSPECCION = Object.freeze([
    'PRECIO_INSPECCION_POR_ZONA', 'PLAZO_MIN_INSPECCION_DIAS', 'PLAZO_DECISION_TRAS_INFORME_H',
  ]);

  /* Lista de lo que falta para encender `servicio` ('asistida' o
     'inspeccion'). Vacía = se puede encender. Un valor fuera de sus
     opciones cuenta como que falta. */
  function puedeEncenderse(config, servicio) {
    const c = config || configuracion();
    const cual = servicio || 'asistida';
    const faltan = [];
    const revisar = (nombre) => {
      const v = c[nombre];
      if (v == null) { faltan.push(nombre); return; }
      if (OPCIONES[nombre] && !OPCIONES[nombre].includes(v)) faltan.push(nombre);
    };
    OBLIGATORIOS_ASISTIDA.forEach(revisar);
    if (c.MONEDA_COBRO === 'DOP' && c.FUENTE_TASA == null) faltan.push('FUENTE_TASA');
    if (!c.FISCAL_LISTO) faltan.push('FISCAL_LISTO');
    if (cual === 'inspeccion') OBLIGATORIOS_INSPECCION.forEach(revisar);
    return faltan;
  }

  return {
    IMPORTACION, FISCAL_LISTO, PARAMETROS, OPCIONES,
    ESTADOS, ESTADOS_SALIDA, ACTORES, TRANSICIONES, transicionPermitida, transicion,
    CONCEPTOS, SENTIDOS, NO_REEMBOLSABLES, ETAPAS, conceptosDeEtapa,
    porcentaje, depositoPara, comisionServicio, aplicarDeposito,
    importeConSigno, saldoCliente, devolucionDe, motivoDevolucion, politicaDevolucion,
    destacarInspeccion, canonico, contenidoFirmado, huellaDesglose,
    configuracion, OBLIGATORIOS_ASISTIDA, OBLIGATORIOS_INSPECCION, puedeEncenderse,
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = Importacion;
}
