/**
 * Pruebas puras de `assets/importacion.js` (fase 14, base C3, #149).
 *
 *   node --test tools/importacion.prueba.js
 *
 * Fijan la tabla de transiciones y la aritmética del dinero ANTES de que
 * se implemente `tools/importacion.js`: quien la implemente tiene que
 * pasarlas sin tocarlas. Los valores de los parámetros que aparecen aquí
 * son de prueba (números redondos para hacer las cuentas a mano), no
 * cifras reales ni propuestas de precio.
 *
 * Lo fiscal queda en `todo`: depende de que el contador decida si la
 * empresa actúa como mandataria o como revendedora (ver el final).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const I = require('../assets/importacion.js');

/* ── Transiciones ────────────────────────────────────────── */

test('cada transición de la tabla está permitida para su actor y prohibida para los demás', () => {
  for (const t of I.TRANSICIONES) {
    const actores = new Set(I.TRANSICIONES.filter((x) => x.de === t.de && x.a === t.a).map((x) => x.actor));
    for (const actor of I.ACTORES) {
      assert.equal(I.transicionPermitida(t.de, t.a, actor), actores.has(actor), `${t.de} → ${t.a} por ${actor}`);
    }
  }
});

test('cualquier par fuera de la tabla está prohibido', () => {
  const enTabla = new Set(I.TRANSICIONES.map((t) => `${t.de}>${t.a}`));
  let fuera = 0;
  for (const de of I.ESTADOS) {
    for (const a of I.ESTADOS) {
      if (enTabla.has(`${de}>${a}`)) continue;
      fuera++;
      for (const actor of I.ACTORES) assert.equal(I.transicionPermitida(de, a, actor), false, `${de} → ${a} por ${actor}`);
    }
  }
  assert.ok(fuera > 600, 'la tabla no puede permitirlo casi todo');
  assert.equal(I.transicionPermitida('solicitada', 'en_busqueda', 'contador'), false, 'un actor desconocido no hace nada');
});

test('la tabla solo usa estados y actores conocidos, sin filas repetidas', () => {
  const vistas = new Set();
  for (const t of I.TRANSICIONES) {
    assert.ok(I.ESTADOS.includes(t.de), t.de);
    assert.ok(I.ESTADOS.includes(t.a), t.a);
    assert.ok(I.ACTORES.includes(t.actor), t.actor);
    const clave = `${t.de}>${t.a}>${t.actor}`;
    assert.ok(!vistas.has(clave), `repetida: ${clave}`);
    vistas.add(clave);
    if (t.cobro) assert.ok(I.ETAPAS.includes(t.cobro), t.cobro);
    if (t.cobroPorEtapa) assert.ok(I.ETAPAS.includes(t.cobroPorEtapa), t.cobroPorEtapa);
  }
});

test('desde una salida solo se va a devolucion_pendiente o a cerrada, y cerrada no sale', () => {
  for (const de of I.ESTADOS_SALIDA) {
    const destinos = new Set(I.TRANSICIONES.filter((t) => t.de === de).map((t) => t.a));
    assert.deepEqual([...destinos].sort(), ['cerrada', 'devolucion_pendiente'], de);
  }
  assert.equal(I.TRANSICIONES.filter((t) => t.de === 'cerrada').length, 0);
  assert.deepEqual(I.TRANSICIONES.filter((t) => t.de === 'devolucion_pendiente').map((t) => t.a), ['cerrada']);
});

test('todo estado se alcanza desde solicitada y todo estado no final tiene salida', () => {
  const alcanzados = new Set(['solicitada']);
  let antes = 0;
  while (alcanzados.size !== antes) {
    antes = alcanzados.size;
    for (const t of I.TRANSICIONES) if (alcanzados.has(t.de)) alcanzados.add(t.a);
  }
  assert.deepEqual([...alcanzados].sort(), [...I.ESTADOS].sort());
  for (const e of I.ESTADOS) {
    if (e === 'cerrada') continue;
    assert.ok(I.TRANSICIONES.some((t) => t.de === e), `${e} no tiene salida`);
  }
});

test('ningún paso que compromete dinero con un tercero va sin su cobro confirmado', () => {
  const cobro = (de, a) => I.TRANSICIONES.filter((t) => t.de === de && t.a === a);
  // Pujar: el depósito.
  for (const t of cobro('deposito_pendiente', 'lista_para_pujar')) assert.equal(t.cobro, 'deposito');
  for (const t of cobro('lista_para_pujar', 'pujando')) assert.equal(t.cobro, 'deposito');
  // Pagar la subasta: el saldo.
  for (const t of cobro('saldo_pendiente', 'pagada_subasta')) assert.equal(t.cobro, 'saldo');
  // Contratar al inspector: la inspección.
  for (const t of cobro('inspeccion_pendiente_pago', 'inspeccion_en_curso')) assert.equal(t.cobro, 'inspeccion');
  // Cada tramo logístico con POLITICA_COBRO = 'por_etapa'.
  assert.equal(cobro('pagada_subasta', 'retiro')[0].cobroPorEtapa, 'flete_eeuu');
  assert.equal(cobro('puerto_origen', 'transito_maritimo')[0].cobroPorEtapa, 'maritimo');
  assert.equal(cobro('en_aduana', 'endosada')[0].cobroPorEtapa, 'aduana');
  assert.equal(cobro('endosada', 'transporte_rd')[0].cobroPorEtapa, 'flete_rd');
  // Y a esos estados no se llega por ningún otro camino sin cobro.
  for (const a of ['lista_para_pujar', 'pujando', 'pagada_subasta', 'inspeccion_en_curso']) {
    for (const t of I.TRANSICIONES.filter((x) => x.a === a)) assert.ok(t.cobro, `${t.de} → ${a} sin cobro`);
  }
});

test('solo el cliente acepta, elige, sigue o desiste; solo el personal puja y avanza la logística', () => {
  const actorDe = (de, a) => I.TRANSICIONES.filter((t) => t.de === de && t.a === a).map((t) => t.actor);
  assert.deepEqual(actorDe('confirmacion', 'deposito_pendiente'), ['cliente']);
  assert.deepEqual(actorDe('propuesta', 'confirmacion'), ['cliente']);
  assert.deepEqual(actorDe('inspeccion_entregada', 'deposito_pendiente'), ['cliente']);
  assert.deepEqual(actorDe('pujando', 'ganada'), ['personal']);
  assert.deepEqual(actorDe('pujando', 'perdida'), ['personal']);
  for (const [de, a] of [['retiro', 'transito_terrestre'], ['transito_maritimo', 'en_aduana'], ['transporte_rd', 'entregada']]) {
    assert.deepEqual(actorDe(de, a), ['personal'], `${de} → ${a}`);
  }
  // Una vez pujando, el cliente ya no puede desistir.
  for (const de of ['pujando', 'ganada', 'saldo_pendiente', 'pagada_subasta']) {
    assert.equal(I.transicionPermitida(de, 'desistida', 'cliente'), false, de);
  }
});

/* ── Etapas de cobro ─────────────────────────────────────── */

test('cada etapa cobra sus conceptos y la política decide dónde van los tramos', () => {
  assert.deepEqual(I.conceptosDeEtapa('deposito', 'por_etapa'), ['deposito_puja']);
  assert.deepEqual(I.conceptosDeEtapa('inspeccion', 'al_ganar'), ['inspeccion']);
  assert.deepEqual(I.conceptosDeEtapa('maritimo', 'por_etapa'), ['flete_maritimo', 'seguro']);
  assert.deepEqual(I.conceptosDeEtapa('maritimo', 'al_ganar'), []);
  const saldoAlGanar = I.conceptosDeEtapa('saldo', 'al_ganar');
  for (const c of ['flete_terrestre_eeuu', 'flete_maritimo', 'seguro', 'impuestos_aduana', 'agente_aduanal', 'gastos_puerto', 'flete_rd']) {
    assert.ok(saldoAlGanar.includes(c), c);
    assert.ok(!I.conceptosDeEtapa('saldo', 'por_etapa').includes(c), c);
  }
  assert.equal(I.conceptosDeEtapa('saldo', 'por_etapa')[0], 'precio_equipo', 'el depósito se aplica primero al equipo');
  assert.throws(() => I.conceptosDeEtapa('propina', 'por_etapa'));
  for (const e of I.ETAPAS) for (const c of I.conceptosDeEtapa(e, 'por_etapa')) assert.ok(I.CONCEPTOS.includes(c), c);
});

/* ── Redondeos ───────────────────────────────────────────── */

test('porcentaje: enteros, mitad hacia arriba, sin coma flotante', () => {
  assert.equal(I.porcentaje(12345, 300), 370); // 370,35
  assert.equal(I.porcentaje(12350, 300), 371); // 370,50 → arriba
  assert.equal(I.porcentaje(5000, 3), 2); // 1,5: Math.round(5000 * 0.0003) da 1
  assert.equal(I.porcentaje(0, 1000), 0);
  assert.equal(I.porcentaje(1, 4999), 0);
  assert.equal(I.porcentaje(1, 5000), 1);
  assert.equal(I.porcentaje(999999999, 10000), 999999999);
  assert.throws(() => I.porcentaje(100.5, 300), /entero/);
  assert.throws(() => I.porcentaje(100, 2.5), /entero/);
  assert.throws(() => I.porcentaje(-100, 300));
});

test('depósito y comisión salen de los parámetros, y sin ellos lanzan', () => {
  const c = I.configuracion({ PORCENTAJE_DEPOSITO_SUBASTA: 1000 });
  assert.equal(I.depositoPara(5000000, c), 500000);
  assert.equal(I.depositoPara(3333333, c), 333333);
  assert.throws(() => I.depositoPara(5000000, I.configuracion()), /PORCENTAJE_DEPOSITO_SUBASTA/);
  assert.throws(() => I.depositoPara(50000.5, c), /entero/);

  assert.equal(I.comisionServicio(3000000, I.configuracion({ COMISION_SERVICIO: { forma: 'fija', importe: 77700 } })), 77700);
  const pct = I.configuracion({ COMISION_SERVICIO: { forma: 'porcentaje', pb: 500, minimo: 100000, maximo: 400000 } });
  assert.equal(I.comisionServicio(3000000, pct), 150000);
  assert.equal(I.comisionServicio(1000000, pct), 100000, 'el mínimo manda');
  assert.equal(I.comisionServicio(20000000, pct), 400000, 'el máximo manda');
  assert.throws(() => I.comisionServicio(3000000, I.configuracion()), /COMISION_SERVICIO/);
  assert.throws(() => I.comisionServicio(3000000, I.configuracion({ COMISION_SERVICIO: { forma: 'regalo' } })));
});

/* ── Depósito aplicado al saldo ──────────────────────────── */

const CONFIG_SALDO = I.configuracion({
  CARGO_APLICAR_DEPOSITO: 300, COMISION_TRANSFERENCIA: 5000, POLITICA_COBRO: 'por_etapa',
  COMISION_SERVICIO: { forma: 'fija', importe: 100000 }, PORCENTAJE_DEPOSITO_SUBASTA: 1000,
});

test('saldo al ganar: precio primero, cargo por aplicar el depósito sobre el depósito', () => {
  const lineas = I.lineasSaldo({ martillo: 3000000, cargosComprador: 150000, deposito: 500000, desglose: null, config: CONFIG_SALDO });
  assert.deepEqual(lineas.map((l) => [l.concepto, l.importe]), [
    ['precio_equipo', 3000000],
    ['cargos_comprador', 150000],
    ['cargo_aplicar_deposito', 15000],
    ['comision_transferencia', 5000],
    ['comision_servicio', 100000],
  ]);
  const r = I.aplicarDeposito(lineas, 500000);
  assert.deepEqual(r.aplicaciones, [{ concepto: 'precio_equipo', importe: 500000 }]);
  assert.equal(r.sobrante, 0);
  const cobrado = r.cobros.reduce((s, x) => s + x.importe, 0);
  assert.equal(cobrado, 3270000 - 500000, 'se cobra el saldo menos el depósito, ni un centavo más');
  assert.equal(r.cobros[0].importe, 2500000);
});

test('saldo al ganar con al_ganar: entran los tramos estimados del desglose congelado', () => {
  const c = I.configuracion(Object.assign({}, CONFIG_SALDO, { POLITICA_COBRO: 'al_ganar' }));
  const desglose = { lineas: [
    { concepto: 'flete_maritimo', importe: 400000, es_estimado: true },
    { concepto: 'flete_rd', importe: 80000, es_estimado: true },
    { concepto: 'precio_equipo', importe: 9999999, es_estimado: true },
  ] };
  const lineas = I.lineasSaldo({ martillo: 3000000, cargosComprador: 0, deposito: 500000, desglose, config: c });
  const por = Object.fromEntries(lineas.map((l) => [l.concepto, l]));
  assert.equal(por.precio_equipo.importe, 3000000, 'el martillo real, no lo estimado');
  assert.equal(por.flete_maritimo.importe, 400000);
  assert.equal(por.flete_maritimo.es_estimado, true);
  assert.equal(por.flete_rd.importe, 80000);
  assert.ok(!por.cargos_comprador, 'una línea en cero no se cobra');
  assert.ok(!por.seguro, 'un tramo sin estimación no se inventa');
});

test('un depósito mayor que el saldo deja sobrante y ninguna línea negativa', () => {
  const lineas = [{ concepto: 'precio_equipo', importe: 300000 }, { concepto: 'comision_servicio', importe: 100000 }];
  const r = I.aplicarDeposito(lineas, 500000);
  assert.deepEqual(r.cobros, []);
  assert.deepEqual(r.aplicaciones, [{ concepto: 'precio_equipo', importe: 300000 }, { concepto: 'comision_servicio', importe: 100000 }]);
  assert.equal(r.sobrante, 100000);
  assert.throws(() => I.aplicarDeposito(lineas, 100.5), /entero/);
});

/* ── Devoluciones ────────────────────────────────────────── */

const mov = (sentido, concepto, importe) => ({ sentido, concepto, importe });

test('el saldo del cliente: cobros suman, pagos a terceros y devoluciones restan, ajustes con su signo', () => {
  const libro = [
    mov('cobro_cliente', 'deposito_puja', 500000),
    mov('cobro_cliente', 'deposito_puja', 20000), // cobrado de más por error
    mov('ajuste', 'deposito_puja', -20000), // su contramovimiento
    mov('pago_tercero', 'multa_subasta', 1000),
    mov('devolucion_cliente', 'deposito_puja', 100000),
  ];
  assert.equal(I.saldoCliente(libro), 399000);
  assert.throws(() => I.saldoCliente([mov('regalo', 'otro', 1)]));
});

test('la inspección nunca se devuelve, sea cual sea el motivo', () => {
  const libro = [
    mov('cobro_cliente', 'inspeccion', 60000),
    mov('pago_tercero', 'inspeccion', 45000),
    mov('cobro_cliente', 'deposito_puja', 500000),
  ];
  for (const motivo of ['perdida', 'sin_puja', 'cancelada', 'cierre']) {
    const politica = I.politicaDevolucion(motivo, I.configuracion({
      DEVOLUCION_SI_PERDIDA: { retiene: [], descuento: 0 }, DEVOLUCION_SIN_PUJA: { retiene: [], descuento: 0 },
    }));
    assert.equal(I.devolucionDe(libro, politica), 500000, motivo);
  }
  assert.deepEqual(I.NO_REEMBOLSABLES, ['inspeccion']);
});

test('perder la subasta aplica DEVOLUCION_SI_PERDIDA y lo devuelto más lo retenido cuadra con el libro', () => {
  const config = I.configuracion({ DEVOLUCION_SI_PERDIDA: { retiene: ['comision_transferencia'], descuento: 2500 } });
  const libro = [
    mov('cobro_cliente', 'inspeccion', 60000),
    mov('cobro_cliente', 'deposito_puja', 500000),
    mov('cobro_cliente', 'comision_transferencia', 5000),
    mov('pago_tercero', 'comision_transferencia', 5000),
  ];
  const politica = I.politicaDevolucion(I.motivoDevolucion('perdida'), config);
  const devolucion = I.devolucionDe(libro, politica);
  assert.equal(devolucion, 500000 - 2500);
  const despues = libro.concat([mov('devolucion_cliente', 'deposito_puja', devolucion)]);
  const reembolsable = despues.filter((m) => !['inspeccion', 'comision_transferencia'].includes(m.concepto));
  assert.equal(I.saldoCliente(reembolsable), 2500, 'en el libro queda exactamente el descuento');
  assert.equal(I.devolucionDe(despues, politica), 0, 'una segunda devolución sale en cero');
});

test('quien incumple pierde el depósito y las multas; la devolución nunca es negativa', () => {
  const libro = [
    mov('cobro_cliente', 'deposito_puja', 500000),
    mov('pago_tercero', 'multa_subasta', 30000),
    mov('cobro_cliente', 'comision_servicio', 100000),
  ];
  const p = I.politicaDevolucion(I.motivoDevolucion('incumplida'), I.configuracion());
  assert.equal(I.devolucionDe(libro, p), 100000);
  assert.equal(I.devolucionDe([mov('pago_tercero', 'flete_rd', 5000)], null), 0);
  assert.throws(() => I.devolucionDe(libro, { retiene: [], descuento: 0.5 }), /entero/);
});

test('cada estado de salida tiene su motivo de devolución, y los demás no', () => {
  assert.equal(I.motivoDevolucion('perdida'), 'perdida');
  assert.equal(I.motivoDevolucion('desistida'), 'sin_puja');
  assert.equal(I.motivoDevolucion('sin_opciones'), 'sin_puja');
  assert.equal(I.motivoDevolucion('incumplida'), 'incumplida');
  assert.equal(I.motivoDevolucion('cancelada'), 'cancelada');
  assert.equal(I.motivoDevolucion('entregada'), 'cierre');
  assert.throws(() => I.motivoDevolucion('pujando'));
  for (const t of I.TRANSICIONES.filter((x) => x.a === 'devolucion_pendiente')) {
    assert.doesNotThrow(() => I.motivoDevolucion(t.de), t.de);
  }
});

/* ── Inspección destacada ────────────────────────────────── */

test('la inspección se destaca desde el umbral, justo en él y no un centavo antes', () => {
  const c = I.configuracion();
  assert.equal(c.UMBRAL_INSPECCION_DESTACADA, 4000000);
  assert.equal(I.destacarInspeccion(4000000, c), true);
  assert.equal(I.destacarInspeccion(3999999, c), false);
  assert.throws(() => I.destacarInspeccion(40000.5, c), /entero/);
});

/* ── Huella del desglose ─────────────────────────────────── */

const DESGLOSE = {
  cifras_version: '2026-10-muestra',
  condiciones_version: '2026-10',
  limite_puja: 5000000,
  lineas: [
    { concepto: 'precio_equipo', importe: 5000000, moneda: 'USD', es_estimado: true },
    { concepto: 'flete_maritimo', importe: 400000, moneda: 'USD', es_estimado: true },
  ],
};

test('la huella es SHA-256 en hex del JSON canónico de lo firmado', () => {
  const h = I.huellaDesglose(DESGLOSE);
  assert.match(h, /^[0-9a-f]{64}$/);
  const esperado = '{"cifras_version":"2026-10-muestra","condiciones_version":"2026-10","limite_puja":5000000,'
    + '"lineas":[{"concepto":"precio_equipo","es_estimado":true,"importe":5000000,"moneda":"USD"},'
    + '{"concepto":"flete_maritimo","es_estimado":true,"importe":400000,"moneda":"USD"}]}';
  assert.equal(I.canonico(I.contenidoFirmado(DESGLOSE)), esperado);
  assert.equal(h, require('node:crypto').createHash('sha256').update(esperado).digest('hex'));
});

test('la huella no cambia con el orden de las claves ni con campos que no se firman', () => {
  const desordenado = {
    lineas: DESGLOSE.lineas.map((l) => ({ es_estimado: l.es_estimado, moneda: l.moneda, importe: l.importe, concepto: l.concepto, nombre: 'texto de ayuda' })),
    limite_puja: 5000000, condiciones_version: '2026-10', cifras_version: '2026-10-muestra', total: 5400000,
  };
  assert.equal(I.huellaDesglose(desordenado), I.huellaDesglose(DESGLOSE));
});

test('la huella cambia con un centavo, con otra versión de cifras o de condiciones, o con otro límite', () => {
  const base = I.huellaDesglose(DESGLOSE);
  const con = (cambio) => I.huellaDesglose(Object.assign({}, DESGLOSE, cambio));
  const lineasMas1 = DESGLOSE.lineas.map((l, i) => (i === 1 ? Object.assign({}, l, { importe: l.importe + 1 }) : l));
  assert.notEqual(con({ lineas: lineasMas1 }), base, 'un centavo');
  assert.notEqual(con({ cifras_version: '2026-11-muestra' }), base, 'versión de cifras');
  assert.notEqual(con({ condiciones_version: '2026-11' }), base, 'versión de condiciones');
  assert.notEqual(con({ limite_puja: 5000001 }), base, 'límite de puja');
  assert.notEqual(con({ lineas: DESGLOSE.lineas.slice().reverse() }), base, 'el orden de las líneas sí cuenta');
  const firme = DESGLOSE.lineas.map((l, i) => (i === 1 ? Object.assign({}, l, { es_estimado: false }) : l));
  assert.notEqual(con({ lineas: firme }), base, 'estimado o firme');
});

test('un importe con decimales no se firma', () => {
  const malo = Object.assign({}, DESGLOSE, { limite_puja: 50000.5 });
  assert.throws(() => I.huellaDesglose(malo), /entero/);
});

/* ── Parámetros e interruptores ──────────────────────────── */

test('todo se entrega apagado y sin precios ni comisiones decididos', () => {
  assert.equal(I.IMPORTACION.asistida.activo, false);
  assert.equal(I.IMPORTACION.inspeccion.activa, false);
  assert.equal(I.IMPORTACION.calculadora.activa, false);
  assert.equal(I.FISCAL_LISTO, false);
  for (const [nombre, valor] of Object.entries(I.PARAMETROS)) {
    if (nombre === 'UMBRAL_INSPECCION_DESTACADA' || nombre === 'ZONAS_PERMITIDAS') continue;
    assert.equal(valor, null, `${nombre} no puede tener valor hasta que lo decida quien corresponde`);
  }
  assert.deepEqual(I.PARAMETROS.ZONAS_PERMITIDAS, ['TX', 'FL', 'PA']);
});

test('puedeEncenderse lista todo lo que falta y no deja encender con un null', () => {
  const faltan = I.puedeEncenderse(I.configuracion());
  for (const [nombre, valor] of Object.entries(I.PARAMETROS)) {
    if (valor === null && I.OBLIGATORIOS_ASISTIDA.includes(nombre)) assert.ok(faltan.includes(nombre), nombre);
  }
  assert.ok(faltan.includes('MODELO_FISCAL'));
  assert.ok(faltan.includes('FISCAL_LISTO'), 'lo fiscal sin implementar también bloquea');
  assert.ok(!faltan.includes('UMBRAL_INSPECCION_DESTACADA'));
  assert.ok(faltan.length > 0);
  // Si el módulo se publica encendido, tiene que poder encenderse.
  if (I.IMPORTACION.asistida.activo) assert.deepEqual(I.puedeEncenderse(I.configuracion()), []);
  if (I.IMPORTACION.inspeccion.activa) assert.deepEqual(I.puedeEncenderse(I.configuracion(), 'inspeccion'), []);
});

/* Una configuración con todo relleno con valores DE PRUEBA, para
   comprobar que cada hueco, por sí solo, impide encender. */
function configCompleta(cambios) {
  return I.configuracion(Object.assign({
    MODELO_FISCAL: 'mandatario', FISCAL_LISTO: true,
    PRECIO_INSPECCION_POR_ZONA: { TX: 1, FL: 1, PA: 1, EXCEPCION: 1 },
    COMISION_SERVICIO: { forma: 'fija', importe: 1 }, PRESUPUESTO_MIN_EXCEPCION_ZONA: 1,
    PORCENTAJE_DEPOSITO_SUBASTA: 1, CARGO_APLICAR_DEPOSITO: 1, COMISION_TRANSFERENCIA: 1,
    PLAZO_PAGO_SUBASTA_DIAS: 1, PLAZO_RETIRO_DIAS: 1, MULTAS_SUBASTA: {},
    PLAZO_PROPUESTA_DIAS: 1, PLAZO_SALDO_CLIENTE_DIAS: 1, PLAZO_DEPOSITO_ANTES_SUBASTA_H: 1,
    PLAZO_MIN_INSPECCION_DIAS: 1, PLAZO_DECISION_TRAS_INFORME_H: 1, PLAZO_AJUSTE_DIAS: 1,
    PLAZO_DEVOLUCION_DIAS: 1, RECORDATORIOS_SALDO_H: [1], POLITICA_COBRO: 'por_etapa',
    COLCHON_IMPREVISTOS: 0, MONEDA_COBRO: 'USD',
    DEVOLUCION_SI_PERDIDA: { retiene: [], descuento: 0 }, DEVOLUCION_SIN_PUJA: { retiene: [], descuento: 0 },
    FIRMA_CONTRATO: 'en_linea',
  }, cambios));
}

test('cada parámetro obligatorio, por sí solo, impide encender', () => {
  assert.deepEqual(I.puedeEncenderse(configCompleta()), []);
  assert.deepEqual(I.puedeEncenderse(configCompleta(), 'inspeccion'), []);
  for (const nombre of I.OBLIGATORIOS_ASISTIDA) {
    assert.deepEqual(I.puedeEncenderse(configCompleta({ [nombre]: null })), [nombre], nombre);
  }
  assert.deepEqual(I.puedeEncenderse(configCompleta({ FISCAL_LISTO: false })), ['FISCAL_LISTO']);
  assert.deepEqual(I.puedeEncenderse(configCompleta({ MODELO_FISCAL: 'mixto' })), ['MODELO_FISCAL'], 'un valor fuera de sus opciones cuenta como que falta');
  assert.deepEqual(I.puedeEncenderse(configCompleta({ MONEDA_COBRO: 'DOP' })), ['FUENTE_TASA']);
  assert.deepEqual(I.puedeEncenderse(configCompleta({ COLCHON_IMPREVISTOS: 0 })), [], 'un colchón de cero es una decisión, no un hueco');
});

test('la inspección no se enciende sin precio por zona ni sus plazos', () => {
  for (const nombre of I.OBLIGATORIOS_INSPECCION) {
    assert.deepEqual(I.puedeEncenderse(configCompleta({ [nombre]: null }), 'inspeccion'), [nombre], nombre);
    assert.deepEqual(I.puedeEncenderse(configCompleta({ [nombre]: null }), 'asistida'), [], `${nombre} no frena el resto`);
  }
});

test('configuracion() inyecta sin tocar el módulo compartido', () => {
  const c = I.configuracion({ IMPORTACION: { asistida: { activo: true } }, PLAZO_AJUSTE_DIAS: 3 });
  assert.equal(c.IMPORTACION.asistida.activo, true);
  assert.equal(c.IMPORTACION.inspeccion.activa, false);
  assert.equal(c.PLAZO_AJUSTE_DIAS, 3);
  assert.equal(I.IMPORTACION.asistida.activo, false);
  assert.equal(I.PARAMETROS.PLAZO_AJUSTE_DIAS, null);
});

test('el módulo no mezcla el cargo de la subasta con la fórmula de precios del sitio', () => {
  const fuente = fs.readFileSync(path.join(__dirname, '..', 'assets', 'importacion.js'), 'utf8');
  assert.doesNotMatch(fuente, /require\([^)]*precios/);
  assert.doesNotMatch(fuente, /PRECIOS\b/);
});

/* ── Lo fiscal: pendiente de la decisión del contador ────────────────
   Si la empresa actúa como MANDATARIA (compra por cuenta del cliente) o
   como REVENDEDORA (compra y revende) lo decide el contador de Victor, y
   de eso depende qué conceptos emiten NCF, con qué tipo (B01/B02) y en
   qué momento (al cobrar o al endosar). Hasta que lo decida, estas
   pruebas quedan como `todo`: escribirlas ahora sería inventar
   comportamiento fiscal, que es irreversible una vez emitido. El día que
   haya decisión, Claude las escribe (regla de «delegar solo con red»),
   se implementa hasta que pasen y `FISCAL_LISTO` pasa a true. */

test('fiscal · qué conceptos emiten comprobante con MODELO_FISCAL decidido', { todo: 'depende de la decisión del contador: mandataria o revendedora' });
test('fiscal · tipo de NCF (B01/B02) y momento de emisión de cada cobro', { todo: 'depende de la decisión del contador' });
test('fiscal · qué conceptos llevan ITBIS y sobre qué base', { todo: 'depende de la decisión del contador' });
test('fiscal · tratamiento de los anticipos (depósito, saldo) antes del endoso', { todo: 'depende de la decisión del contador' });
test('fiscal · nota de crédito (B04) cuando se devuelve algo ya facturado', { todo: 'depende de la decisión del contador' });
