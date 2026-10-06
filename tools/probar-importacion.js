/**
 * probar-importacion.js — fase 14, base C3 (#149): el punto único de
 * transición del expediente, `tools/importacion.js`.
 *
 *   node tools/probar-importacion.js
 *
 * POR QUÉ EXISTE
 *
 * Hay dinero de clientes en juego: depósitos de subasta, saldos de
 * decenas de miles de dólares, devoluciones. Estas pruebas fijan el
 * comportamiento ANTES de que se escriba el código (#152), que se
 * implementa hasta que pasen SIN tocarlas. La especificación es
 * `.planning/importacion-contrato.md`; si una prueba y el contrato no
 * casan, se corrige el contrato y se avisa, no la prueba a escondidas.
 *
 * Con la base sola (sin `tools/importacion.js`) este arnés FALLA a
 * propósito: por eso aún no está en CI. Se cuelga cuando pase.
 *
 * Los parámetros inyectados son VALORES DE PRUEBA, números redondos para
 * hacer las cuentas a mano. No son cifras reales ni propuestas de precio
 * o comisión. La parte fiscal está SALTADA: depende de que el contador
 * decida si la empresa es mandataria o revendedora (sección 12).
 *
 * Corre contra una base TEMPORAL en `.tmp/prueba-importacion/`.
 */

const fs = require('fs');
const path = require('path');

/* Antes de cargar db.js: la ruta de la base, el correo, el secreto y la
   carpeta de documentos se leen al importarlo. Si se fijan después, la
   prueba corre contra la base equivocada. */
const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-importacion');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_CORREOS = path.join(BANCO, 'correos');
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';
process.env.MERCA_DOCUMENTOS = path.join(BANCO, 'documentos');

const db = require('./db.js');
const correo = require('./correo.js');
const Importacion = require('../assets/importacion.js');

let imp;
try {
  imp = require('./importacion.js');
} catch (e) {
  if (e.code !== 'MODULE_NOT_FOUND' || !/importacion\.js/.test(e.message)) throw e;
  console.log('\n  MAL tools/importacion.js aún no existe: lo implementa #152 siguiendo .planning/importacion-contrato.md');
  process.exit(1);
}

let bien = 0;
let mal = 0;
let saltadas = 0;
function comprobar(condicion, que) {
  if (condicion) { bien++; console.log(`  ok  ${que}`); return; }
  mal++;
  console.log(`  MAL ${que}`);
}
function saltar(que, porque) {
  saltadas++;
  console.log(`  --  SALTADA ${que} (${porque})`);
}
const lanza = (fn) => { try { fn(); return null; } catch (e) { return e; } };
function lanzaCon(fn, codigo, motivo, que) {
  const e = lanza(fn);
  comprobar(!!e && e.codigo === codigo && (!motivo || e.motivo === motivo),
    `${que} → ${codigo}${motivo ? ` ${motivo}` : ''}${e ? ` (dio ${e.codigo} ${e.motivo || e.message})` : ' (no lanzó)'}`);
  return e;
}
/* Una sección entera no puede tumbar las siguientes: si la
   implementación aún no está, se anota como fallo y se sigue. */
function seccion(titulo, fn) {
  console.log(`\n${titulo}`);
  const e = lanza(fn);
  if (e) comprobar(false, `la sección terminó con una excepción: ${e.codigo || ''} ${e.motivo || ''} ${e.message}`);
}

const d = () => db.abrir();
const fila = (sql, ...args) => d().prepare(sql).get(...args);
const todas = (sql, ...args) => d().prepare(sql).all(...args);
const contar = (tabla, donde = '1 = 1', ...args) => fila(`SELECT COUNT(*) AS n FROM ${tabla} WHERE ${donde}`, ...args).n;
const expediente = (id) => fila('SELECT * FROM importaciones WHERE id = ?', id);
const libro = (id) => todas('SELECT * FROM importacion_movimientos WHERE importacion_id = ? ORDER BY id', id);
const eventos = (id) => todas('SELECT * FROM importacion_eventos WHERE importacion_id = ? ORDER BY id', id);
const sumaDe = (movs, conceptos) => movs.filter((m) => conceptos.includes(m.concepto))
  .reduce((s, m) => s + Importacion.importeConSigno(m), 0);
const idDe = (r) => (r && (r.id || (r.expediente && r.expediente.id))) || null;

/* ── Escenario ───────────────────────────────────────────── */

const AHORA = '2026-11-02T12:00:00.000Z';
const masDias = (iso, dias) => new Date(Date.parse(iso) + dias * 86400000).toISOString();
const masHoras = (iso, h) => new Date(Date.parse(iso) + h * 3600000).toISOString();
const SUBASTA = masDias(AHORA, 10);

const COSTOS_ESTIMADOS = [
  { concepto: 'cargos_comprador', importe: 150000 },
  { concepto: 'flete_terrestre_eeuu', importe: 200000 },
  { concepto: 'flete_maritimo', importe: 400000 },
  { concepto: 'seguro', importe: 30000 },
  { concepto: 'impuestos_aduana', importe: 900000 },
  { concepto: 'agente_aduanal', importe: 50000 },
  { concepto: 'gastos_puerto', importe: 40000 },
  { concepto: 'flete_rd', importe: 80000 },
].map((l) => Object.assign({ moneda: 'USD', es_estimado: true }, l));

// VALORES DE PRUEBA. Ninguno es una cifra real ni una propuesta.
const BASE_PRUEBA = {
  IMPORTACION: { asistida: { activo: true }, inspeccion: { activa: true } },
  PRECIO_INSPECCION_POR_ZONA: { TX: 60000, FL: 60000, PA: 60000, EXCEPCION: 90000 },
  COMISION_SERVICIO: { forma: 'fija', importe: 100000 },
  PRESUPUESTO_MIN_EXCEPCION_ZONA: 8000000,
  PORCENTAJE_DEPOSITO_SUBASTA: 1000, // 10 %
  CARGO_APLICAR_DEPOSITO: 300, // 3 %
  COMISION_TRANSFERENCIA: 5000,
  PLAZO_PAGO_SUBASTA_DIAS: 7, PLAZO_RETIRO_DIAS: 10, MULTAS_SUBASTA: {},
  PLAZO_PROPUESTA_DIAS: 5, PLAZO_SALDO_CLIENTE_DIAS: 3, PLAZO_DEPOSITO_ANTES_SUBASTA_H: 48,
  PLAZO_MIN_INSPECCION_DIAS: 3, PLAZO_DECISION_TRAS_INFORME_H: 24, PLAZO_AJUSTE_DIAS: 5,
  PLAZO_DEVOLUCION_DIAS: 10, RECORDATORIOS_SALDO_H: [48, 24],
  POLITICA_COBRO: 'al_ganar', COLCHON_IMPREVISTOS: 0, MONEDA_COBRO: 'USD', FIRMA_CONTRATO: 'en_linea',
  DEVOLUCION_SI_PERDIDA: { retiene: [], descuento: 2500 },
  DEVOLUCION_SIN_PUJA: { retiene: [], descuento: 0 },
  CONDICIONES_VERSION: 'prueba-condiciones-1',
  estimarCostos: () => ({ version: 'prueba-cifras-1', lineas: COSTOS_ESTIMADOS.map((l) => Object.assign({}, l)) }),
  // MODELO_FISCAL se deja en null a propósito: nada de lo que se prueba
  // aquí puede depender de él (sección 12).
};
const config = (cambios) => Importacion.configuracion(Object.assign({}, BASE_PRUEBA, cambios));
const CONFIG = config();

const { idUsuario: CLIENTE, idOrg: ORG } = db.crearCuenta({
  correo: 'cliente-importacion@prueba.do', clave: 'UnaClaveLargaYSegura9', nombre: 'Cliente Importación',
  telefono: '8095550101', tipo: 'particular',
});
const { idUsuario: SIN_VERIFICAR, idOrg: ORG_SIN_VERIFICAR } = db.crearCuenta({
  correo: 'sin-verificar@prueba.do', clave: 'UnaClaveLargaYSegura9', nombre: 'Sin Verificar',
  telefono: '8095550102', tipo: 'particular',
});
const { idUsuario: PERSONAL } = db.crearCuenta({
  correo: 'personal-importacion@prueba.do', clave: 'UnaClaveLargaYSegura9', nombre: 'Personal',
  telefono: '8095550103', tipo: 'particular',
});
d().prepare('UPDATE usuarios SET correo_verificado = 1 WHERE id IN (?, ?)').run(CLIENTE, PERSONAL);
d().prepare('UPDATE usuarios SET correo_verificado = 0 WHERE id = ?').run(SIN_VERIFICAR);

const ctx = (actor, extra = {}) => Object.assign({
  config: CONFIG, actor, ahora: AHORA, ip: '203.0.113.7',
  usuarioId: actor === 'cliente' ? CLIENTE : actor === 'personal' ? PERSONAL : null,
}, extra);
const cliente = (extra) => ctx('cliente', extra);
const personal = (extra) => ctx('personal', extra);
const sistema = (extra) => ctx('sistema', extra);

const DATOS = {
  organizacionId: ORG, tipo_equipo: 'excavadora', marca: 'Caterpillar', anio_min: 2015, horas_max: 8000,
  uso: 'construcción', provincia_destino: 'Santo Domingo', zona_preferida: 'TX', presupuesto_declarado: 5000000,
};

let nLote = 0;
const lote = (cambios = {}) => Object.assign({
  subasta: 'ritchie_bros', numero_lote: `L-${++nLote}`, zona: 'TX', estado_eeuu: 'TX',
  fecha_subasta: SUBASTA, marca: 'Caterpillar', modelo: '320', anio: 2018, horas: 5000, serie: 'CAT0320X1',
}, cambios);

/* Lleva un expediente nuevo hasta `confirmacion` con un lote elegido. */
function hastaConfirmacion(c = CONFIG, cambiosLote = {}) {
  const e = imp.crearSolicitud(Object.assign({}, DATOS), cliente({ config: c }));
  const id = idDe(e);
  imp.avanzar(id, 'en_busqueda', personal({ config: c }));
  imp.proponerLotes(id, [lote(cambiosLote)], personal({ config: c }));
  const loteId = fila("SELECT id FROM importacion_lotes WHERE importacion_id = ? AND estado = 'propuesto'", id).id;
  imp.elegirLote(id, loteId, cliente({ config: c }));
  return { id, loteId };
}
function confirmarCon(id, limite, c = CONFIG) {
  const g = imp.desglose(id, { limitePuja: limite }, cliente({ config: c }));
  imp.confirmar(id, { huella: g.huella, limitePuja: limite, aceptaCondiciones: true }, cliente({ config: c }));
  return g;
}
/* Hasta `pujando` con el depósito pagado. */
function hastaPujando(c = CONFIG, limite = 5000000) {
  const { id } = hastaConfirmacion(c);
  confirmarCon(id, limite, c);
  imp.registrarPago(id, { etapa: 'deposito', referencia: `DEP-${id}` }, personal({ config: c }));
  imp.avanzar(id, 'lista_para_pujar', personal({ config: c }));
  imp.avanzar(id, 'pujando', personal({ config: c }));
  return id;
}
function subirInforme(id) {
  d().prepare(`INSERT INTO importacion_documentos (id, importacion_id, tipo, nombre, formato, bytes, ruta, visible_cliente, creado)
               VALUES (?, ?, 'informe_inspeccion', 'informe.pdf', 'application/pdf', 100, ?, 1, ?)`)
    .run(db.id(), id, `importaciones/${id}/${db.id()}.pdf`, AHORA);
}

/* ── 1 · Interruptor apagado ─────────────────────────────── */
seccion('1 · Con el servicio apagado nada escribe', () => {
  const apagado = config({ IMPORTACION: { asistida: { activo: false } } });
  const antes = contar('importaciones');
  lanzaCon(() => imp.crearSolicitud(Object.assign({}, DATOS), cliente({ config: apagado })), 503, 'servicio_apagado', 'crearSolicitud apagado');
  comprobar(contar('importaciones') === antes, 'no se creó ningún expediente');

  const { id } = hastaConfirmacion();
  const ev = eventos(id).length;
  const mov = libro(id).length;
  const g = imp.desglose(id, { limitePuja: 5000000 }, cliente());
  lanzaCon(() => imp.confirmar(id, { huella: g.huella, limitePuja: 5000000, aceptaCondiciones: true }, cliente({ config: apagado })),
    503, 'servicio_apagado', 'confirmar apagado');
  lanzaCon(() => imp.registrarPago(id, { etapa: 'deposito', referencia: 'X' }, personal({ config: apagado })), 503, 'servicio_apagado', 'registrarPago apagado');
  lanzaCon(() => imp.avanzar(id, 'cancelada', personal({ config: apagado, nota: 'x' })), 503, 'servicio_apagado', 'avanzar apagado');
  lanzaCon(() => imp.desistir(id, cliente({ config: apagado })), 503, 'servicio_apagado', 'desistir apagado');
  comprobar(expediente(id).estado === 'confirmacion', 'el estado no cambió');
  comprobar(eventos(id).length === ev && libro(id).length === mov, 'ni eventos ni movimientos nuevos');
});

/* ── 2 · Crear la solicitud ─────────────────────────────── */
seccion('2 · Crear la solicitud', () => {
  lanzaCon(() => imp.crearSolicitud(Object.assign({}, DATOS, { organizacionId: ORG_SIN_VERIFICAR }),
    ctx('cliente', { usuarioId: SIN_VERIFICAR })), 403, 'correo_sin_verificar', 'sin correo verificado');
  lanzaCon(() => imp.crearSolicitud(Object.assign({}, DATOS, { presupuesto_declarado: 50000.5 }), cliente()),
    400, 'datos_invalidos', 'presupuesto con decimales');

  const id = idDe(imp.crearSolicitud(Object.assign({}, DATOS), cliente()));
  const e = expediente(id);
  comprobar(!!e && e.estado === 'solicitada', 'nace en solicitada');
  comprobar(/^I\d{4}-/.test(e.referencia), `referencia con la letra I (${e.referencia})`);
  comprobar(e.inspeccion_destacada === 1 && e.umbral_inspeccion === 4000000, 'US$50,000 ≥ umbral: inspección destacada, con el umbral guardado');
  const ev = eventos(id);
  comprobar(ev.length === 1 && ev[0].de_estado === null && ev[0].a_estado === 'solicitada' && ev[0].actor === 'cliente',
    'un evento NULL → solicitada del cliente');

  const id2 = idDe(imp.crearSolicitud(Object.assign({}, DATOS, { presupuesto_declarado: 3999999 }), cliente()));
  comprobar(expediente(id2).inspeccion_destacada === 0, 'un centavo por debajo del umbral: no destacada');

  lanzaCon(() => imp.avanzar(id, 'en_busqueda', cliente()), 409, 'transicion_no_permitida', 'el cliente no puede pasar a en_busqueda');
  lanzaCon(() => imp.avanzar(id, 'pujando', personal()), 409, 'transicion_no_permitida', 'de solicitada a pujando');
  comprobar(expediente(id).estado === 'solicitada' && eventos(id).length === 1, 'el estado no cambió');
});

/* ── 3 · Lotes y zonas ───────────────────────────────────── */
seccion('3 · Lotes fuera de zona', () => {
  const id = idDe(imp.crearSolicitud(Object.assign({}, DATOS), cliente()));
  imp.avanzar(id, 'en_busqueda', personal());
  lanzaCon(() => imp.proponerLotes(id, [lote({ zona: 'CA', estado_eeuu: 'CA' })], personal()), 400, 'zona_no_permitida',
    'fuera de zona con presupuesto por debajo del mínimo');
  comprobar(expediente(id).estado === 'en_busqueda' && contar('importacion_lotes', 'importacion_id = ?', id) === 0, 'no se guardó nada');

  const id2 = idDe(imp.crearSolicitud(Object.assign({}, DATOS, { presupuesto_declarado: 9000000 }), cliente()));
  imp.avanzar(id2, 'en_busqueda', personal());
  lanzaCon(() => imp.proponerLotes(id2, [lote({ zona: 'CA' })], personal()), 400, 'zona_no_permitida', 'fuera de zona sin motivo');
  imp.proponerLotes(id2, [lote({ zona: 'CA', excepcion_zona: 1, motivo_excepcion: 'Única unidad en el presupuesto' })], personal());
  const l = fila('SELECT * FROM importacion_lotes WHERE importacion_id = ?', id2);
  comprobar(!!l && l.excepcion_zona === 1 && expediente(id2).estado === 'propuesta', 'con presupuesto y motivo: excepción anotada y en propuesta');
});

/* ── 4 · Desglose y huella ───────────────────────────────── */
seccion('4 · El desglose sale del servidor y la huella manda', () => {
  const { id } = hastaConfirmacion();
  const g = imp.desglose(id, { limitePuja: 5000000, importe: 1, lineas: [] }, cliente());
  comprobar(/^[0-9a-f]{64}$/.test(g.huella), 'huella SHA-256 en hex');
  comprobar(g.huella === Importacion.huellaDesglose(g), 'la huella es la del contrato (JSON canónico)');
  comprobar(g.deposito === 500000, 'depósito = 10 % de prueba de US$50,000');
  comprobar(g.cifras_version === 'prueba-cifras-1' && g.condiciones_version === 'prueba-condiciones-1', 'con las versiones de cifras y condiciones');
  const por = Object.fromEntries(g.lineas.map((l) => [l.concepto, l]));
  comprobar(por.precio_equipo && por.precio_equipo.importe === 5000000, 'precio del equipo = el límite');
  comprobar(por.cargo_aplicar_deposito && por.cargo_aplicar_deposito.importe === 15000, 'cargo por aplicar el depósito = 3 % de prueba del depósito');
  comprobar(por.comision_servicio && por.comision_servicio.importe === 100000, 'comisión de prueba');
  comprobar(!por.inspeccion, 'sin inspección pedida no hay línea de inspección');
  comprobar(!por.deposito_puja, 'el depósito no es una línea más (es un anticipo del precio)');
  comprobar(g.lineas.every((l) => Number.isSafeInteger(l.importe)), 'todos los importes enteros');
  const orden = g.lineas.map((l) => Importacion.CONCEPTOS.indexOf(l.concepto));
  comprobar(orden.every((x, i) => i === 0 || orden[i - 1] < x), 'líneas en el orden de CONCEPTOS');
  comprobar(g.total === g.lineas.reduce((s, l) => s + l.importe, 0), 'el total es la suma de las líneas');

  const ev = eventos(id).length;
  lanzaCon(() => imp.confirmar(id, { huella: 'f'.repeat(64), limitePuja: 5000000, aceptaCondiciones: true }, cliente()),
    409, 'huella_distinta', 'otra huella');
  lanzaCon(() => imp.confirmar(id, { huella: g.huella, limitePuja: 6000000, aceptaCondiciones: true }, cliente()),
    409, 'huella_distinta', 'la huella de un límite con otro límite');
  lanzaCon(() => imp.confirmar(id, { huella: g.huella, limitePuja: 5000000, aceptaCondiciones: false }, cliente()),
    400, 'datos_invalidos', 'sin aceptar las condiciones');
  comprobar(expediente(id).estado === 'confirmacion' && eventos(id).length === ev, 'nada cambió');
  comprobar(contar('importacion_aceptaciones', 'importacion_id = ?', id) === 0, 'ninguna aceptación guardada');

  imp.confirmar(id, { huella: g.huella, limitePuja: 5000000, aceptaCondiciones: true, importe: 1, total: 1, deposito: 1 }, cliente());
  const e = expediente(id);
  comprobar(e.estado === 'deposito_pendiente', 'confirmado: deposito_pendiente');
  comprobar(e.desglose_huella === g.huella && e.limite_puja === 5000000, 'guarda la huella y el límite firmados');
  comprobar(JSON.parse(e.desglose_json).total === g.total, 'el desglose guardado es el del servidor, no el importe de la entrada');
  comprobar(e.vence_accion === masHoras(SUBASTA, -48), 'vence 48 h (de prueba) antes de la subasta');
  const a = todas('SELECT * FROM importacion_aceptaciones WHERE importacion_id = ?', id);
  comprobar(a.length === 1 && a[0].ip === '203.0.113.7' && a[0].desglose_huella === g.huella && a[0].limite_puja === 5000000,
    'una aceptación con IP, huella y límite');
});

/* ── 5 · Depósito antes de pujar ─────────────────────────── */
seccion('5 · Sin depósito confirmado no se puja', () => {
  const { id } = hastaConfirmacion();
  confirmarCon(id, 5000000);
  lanzaCon(() => imp.avanzar(id, 'lista_para_pujar', personal()), 409, 'cobro_sin_confirmar', 'lista_para_pujar sin depósito');
  comprobar(expediente(id).estado === 'deposito_pendiente', 'sigue en deposito_pendiente');

  const ev = eventos(id).length;
  imp.registrarPago(id, { etapa: 'deposito', referencia: 'TRF-D1', importe: 1, concepto: 'otro' }, personal());
  let movs = libro(id);
  comprobar(movs.length === 1 && movs[0].concepto === 'deposito_puja' && movs[0].importe === 500000 && movs[0].sentido === 'cobro_cliente'
    && movs[0].es_estimado === 0, 'el cobro es el depósito calculado (500000), no el importe de la entrada');
  comprobar(eventos(id).length === ev, 'registrar un pago no escribe evento');
  const r = imp.registrarPago(id, { etapa: 'deposito', referencia: 'TRF-D1' }, personal());
  comprobar(libro(id).length === 1 && r && r.duplicado === true, 'el mismo pago dos veces: un solo movimiento y duplicado = true');
  comprobar(eventos(id).length === ev, 'ni un evento de más');

  imp.avanzar(id, 'lista_para_pujar', personal());
  comprobar(expediente(id).estado === 'lista_para_pujar', 'con el depósito: lista_para_pujar');

  // Subir el límite exige otra confirmación y la diferencia del depósito.
  imp.avanzar(id, 'confirmacion', cliente());
  const g2 = imp.desglose(id, { limitePuja: 6000000 }, cliente());
  comprobar(g2.huella !== expediente(id).desglose_huella, 'otro límite, otra huella');
  imp.confirmar(id, { huella: g2.huella, limitePuja: 6000000, aceptaCondiciones: true }, cliente());
  comprobar(contar('importacion_aceptaciones', 'importacion_id = ?', id) === 2, 'la aceptación nueva se añade; la primera sigue');
  lanzaCon(() => imp.avanzar(id, 'lista_para_pujar', personal()), 409, 'cobro_sin_confirmar', 'con el depósito del límite viejo no basta');
  imp.registrarPago(id, { etapa: 'deposito', referencia: 'TRF-D2' }, personal());
  movs = libro(id);
  comprobar(movs.length === 2 && movs[1].importe === 100000, 'solo se cobra la diferencia (100000)');
  imp.avanzar(id, 'lista_para_pujar', personal());
  imp.avanzar(id, 'pujando', personal());
  comprobar(expediente(id).estado === 'pujando', 'ahora sí se puja');
  lanzaCon(() => imp.desistir(id, cliente()), 409, 'transicion_no_permitida', 'pujando ya no se desiste');
});

/* ── 6 · Ganar y pagar la subasta ────────────────────────── */
seccion('6 · Sin saldo confirmado no se paga la subasta', () => {
  const id = hastaPujando();
  lanzaCon(() => imp.registrarResultado(id, { resultado: 'ganada', martillo: 5000001, cargosComprador: 0 }, personal()),
    409, 'martillo_sobre_limite', 'martillo por encima del límite firmado');
  comprobar(expediente(id).estado === 'pujando', 'sigue pujando');

  imp.registrarResultado(id, { resultado: 'ganada', martillo: 3000000, cargosComprador: 150000 }, personal());
  const e = expediente(id);
  comprobar(e.estado === 'saldo_pendiente', 'ganada → saldo_pendiente');
  comprobar(eventos(id).slice(-2).map((x) => x.a_estado).join(',') === 'ganada,saldo_pendiente', 'dos eventos: ganada y saldo_pendiente');
  comprobar(e.vence_accion === masDias(AHORA, 3), 'el saldo vence en PLAZO_SALDO_CLIENTE_DIAS (3, de prueba)');
  lanzaCon(() => imp.avanzar(id, 'pagada_subasta', personal()), 409, 'cobro_sin_confirmar', 'pagada_subasta sin saldo');

  imp.registrarPago(id, { etapa: 'saldo', referencia: 'TRF-S1', importe: 1 }, personal());
  const movs = libro(id);
  const lineas = Importacion.lineasSaldo({ martillo: 3000000, cargosComprador: 150000, deposito: 500000,
    desglose: JSON.parse(e.desglose_json), config: CONFIG });
  const exigido = lineas.reduce((s, l) => s + l.importe, 0);
  const cobrado = movs.filter((m) => m.sentido === 'cobro_cliente').reduce((s, m) => s + m.importe, 0);
  comprobar(cobrado === 500000 + exigido - 500000, `se cobra el saldo menos el depósito (${exigido - 500000}), ni un centavo más`);
  const aplicados = movs.filter((m) => m.sentido === 'ajuste');
  comprobar(aplicados.length === 2 && aplicados.some((m) => m.concepto === 'deposito_puja' && m.importe === -500000)
    && aplicados.some((m) => m.concepto === 'precio_equipo' && m.importe === 500000), 'el depósito aplicado: un par de ajustes al precio');
  comprobar(Importacion.saldoCliente(movs) === exigido, 'el saldo del cliente cuadra con lo exigido');
  comprobar(sumaDe(movs, ['deposito_puja']) === 0, 'el depósito quedó aplicado entero');
  imp.avanzar(id, 'pagada_subasta', personal());
  comprobar(expediente(id).estado === 'pagada_subasta', 'con el saldo: pagada_subasta');
  imp.avanzar(id, 'retiro', personal());
  comprobar(expediente(id).estado === 'retiro', "con 'al_ganar' el flete ya iba en el saldo: retiro sin otro cobro");
});

/* ── 7 · Por etapa: cada tramo antes de contratarlo ──────── */
seccion("7 · Con 'por_etapa', ningún tramo sin su cobro", () => {
  const c = config({ POLITICA_COBRO: 'por_etapa' });
  const id = hastaPujando(c);
  imp.registrarResultado(id, { resultado: 'ganada', martillo: 3000000, cargosComprador: 150000 }, personal({ config: c }));
  imp.registrarPago(id, { etapa: 'saldo', referencia: 'PE-S' }, personal({ config: c }));
  imp.avanzar(id, 'pagada_subasta', personal({ config: c }));
  const tramo = (a, etapa, antes = []) => {
    for (const b of antes) imp.avanzar(id, b, personal({ config: c }));
    lanzaCon(() => imp.avanzar(id, a, personal({ config: c })), 409, 'cobro_sin_confirmar', `${a} sin el cobro de ${etapa}`);
    imp.registrarPago(id, { etapa, referencia: `PE-${etapa}` }, personal({ config: c }));
    imp.avanzar(id, a, personal({ config: c }));
    comprobar(expediente(id).estado === a, `${a} con el cobro de ${etapa}`);
  };
  tramo('retiro', 'flete_eeuu');
  tramo('transito_maritimo', 'maritimo', ['transito_terrestre', 'puerto_origen']);
  tramo('endosada', 'aduana', ['en_aduana']);
  tramo('transporte_rd', 'flete_rd');
  const movs = libro(id);
  comprobar(sumaDe(movs, ['flete_maritimo', 'seguro']) === 430000, 'el tramo marítimo cobró flete y seguro estimados');
  lanzaCon(() => imp.avanzar(id, 'entregada', personal({ config: c })), 409, 'falta_documento', 'entregada sin acta');
});

/* ── 8 · Estado y evento juntos ──────────────────────────── */
seccion('8 · Si falla el evento, el estado no cambia', () => {
  const id = idDe(imp.crearSolicitud(Object.assign({}, DATOS), cliente()));
  const ev = eventos(id).length;
  const rota = { escribirEvento: () => { throw new Error('evento roto a propósito'); } };
  const e = lanza(() => imp.avanzar(id, 'en_busqueda', personal({ dependencias: rota })));
  comprobar(!!e, 'la transición lanza');
  comprobar(expediente(id).estado === 'solicitada', 'el estado sigue en solicitada');
  comprobar(eventos(id).length === ev, 'no quedó evento a medias');
  imp.avanzar(id, 'en_busqueda', personal());
  comprobar(expediente(id).estado === 'en_busqueda', 'con el evento sano, la misma transición entra');
});

/* ── 9 · El libro es de solo añadir ──────────────────────── */
seccion('9 · El libro solo se corrige con contramovimientos', () => {
  const borra = /(actualiz|modific|borr|elimin|anul|editar|cambiar).*movimiento|movimiento.*(actualiz|modific|borr|elimin)/i;
  const nombres = Object.keys(imp).concat(Object.keys(db));
  const culpables = nombres.filter((n) => borra.test(n));
  comprobar(culpables.length === 0, `ninguna función actualiza ni borra un movimiento${culpables.length ? `: ${culpables.join(', ')}` : ''}`);
  const fuente = fs.readFileSync(path.join(__dirname, 'importacion.js'), 'utf8');
  comprobar(!/(UPDATE|DELETE\s+FROM)\s+importacion_movimientos/i.test(fuente), 'tools/importacion.js no tiene UPDATE ni DELETE sobre el libro');

  const id = hastaPujando();
  const antes = Importacion.saldoCliente(libro(id));
  const malo = imp.registrarMovimiento(id, { sentido: 'pago_tercero', concepto: 'multa_subasta', importe: 7777, nota: 'por error' }, personal());
  const idMalo = (malo && malo.id) || libro(id).slice(-1)[0].id;
  comprobar(Importacion.saldoCliente(libro(id)) === antes - 7777, 'el pago equivocado resta');
  imp.registrarMovimiento(id, { sentido: 'ajuste', concepto: 'multa_subasta', corrige_id: idMalo, nota: 'corrige el anterior' }, personal());
  const movs = libro(id);
  const contra = movs.slice(-1)[0];
  comprobar(contra.corrige_id === idMalo && contra.importe === 7777, 'el contramovimiento apunta al corregido y lleva el signo contrario');
  comprobar(Importacion.saldoCliente(movs) === antes, 'el saldo vuelve a cuadrar');
  comprobar(movs.some((m) => m.id === idMalo && m.importe === 7777), 'el movimiento equivocado sigue en el libro, intacto');
  lanzaCon(() => imp.registrarMovimiento(id, { sentido: 'cobro_cliente', concepto: 'deposito_puja', importe: 1 }, personal()),
    400, 'datos_invalidos', 'un cobro no se apunta a mano (sale de registrarPago)');
});

/* ── 10 · Inspección ─────────────────────────────────────── */
seccion('10 · La inspección: opcional, cobrada antes, no reembolsable', () => {
  const sinInspeccion = config({ IMPORTACION: { asistida: { activo: true }, inspeccion: { activa: false } } });
  const a = hastaConfirmacion(sinInspeccion);
  lanzaCon(() => imp.pedirInspeccion(a.id, cliente({ config: sinInspeccion })), 503, 'inspeccion_apagada', 'inspección apagada');

  const cerca = hastaConfirmacion(CONFIG, { fecha_subasta: masDias(AHORA, 2) });
  lanzaCon(() => imp.pedirInspeccion(cerca.id, cliente()), 409, 'sin_tiempo_para_inspeccion', 'subasta en 2 días con mínimo de 3');

  const { id } = hastaConfirmacion();
  imp.pedirInspeccion(id, cliente());
  comprobar(expediente(id).inspeccion === 'pedida' && expediente(id).estado === 'confirmacion', 'pedida, sin cambiar de estado');
  const g = confirmarCon(id, 5000000);
  comprobar(g.lineas.some((l) => l.concepto === 'inspeccion' && l.importe === 60000), 'el desglose incluye la inspección de su zona');
  comprobar(expediente(id).estado === 'inspeccion_pendiente_pago', 'confirmar con inspección: inspeccion_pendiente_pago');
  lanzaCon(() => imp.avanzar(id, 'inspeccion_en_curso', personal()), 409, 'cobro_sin_confirmar', 'no se contrata al inspector sin cobrar');
  imp.registrarPago(id, { etapa: 'inspeccion', referencia: 'INS-1', importe: 1 }, personal());
  comprobar(sumaDe(libro(id), ['inspeccion']) === 60000, 'se cobra el precio de la zona, no el importe de la entrada');
  imp.avanzar(id, 'inspeccion_en_curso', personal());
  lanzaCon(() => imp.avanzar(id, 'inspeccion_entregada', personal()), 409, 'falta_documento', 'entregada sin informe');
  subirInforme(id);
  imp.avanzar(id, 'inspeccion_entregada', personal());
  const antes = libro(id).map((m) => `${m.id}:${m.importe}`).join('|');
  imp.decidirTrasInforme(id, 'desistir', cliente());
  comprobar(expediente(id).estado === 'desistida', 'desistir tras el informe: desistida');
  comprobar(libro(id).map((m) => `${m.id}:${m.importe}`).join('|') === antes, 'el movimiento de la inspección queda intacto');
  const dev = imp.calcularDevolucion(id, sistema());
  comprobar(dev && dev.importe === 0 && dev.motivo === 'sin_puja', 'la devolución no incluye la inspección');
  lanzaCon(() => imp.decidirTrasInforme(id, 'seguir', cliente()), 409, 'transicion_no_permitida', 'ya no se puede seguir');
});

/* ── 11 · Perder la subasta ──────────────────────────────── */
seccion('11 · Perder: se devuelve según DEVOLUCION_SI_PERDIDA y cuadra con el libro', () => {
  const id = hastaPujando();
  imp.registrarResultado(id, { resultado: 'perdida' }, personal());
  comprobar(expediente(id).estado === 'perdida', 'perdida');
  const dev = imp.calcularDevolucion(id, cliente());
  comprobar(dev && dev.motivo === 'perdida' && dev.importe === 500000 - 2500, 'depósito menos el descuento de prueba (497500)');
  comprobar(libro(id).length === 1, 'calcular no escribe nada');
  imp.avanzar(id, 'devolucion_pendiente', cliente());
  const dev2 = imp.calcularDevolucion(id, personal());
  comprobar(dev2.importe === dev.importe && dev2.motivo === 'perdida', 'en devolucion_pendiente rige el motivo del estado previo');
  imp.registrarDevolucion(id, { referencia: 'DEV-1' }, personal());
  const movs = libro(id);
  const devuelto = movs.filter((m) => m.sentido === 'devolucion_cliente').reduce((s, m) => s + m.importe, 0);
  comprobar(devuelto === 497500, 'lo devuelto es lo calculado');
  comprobar(Importacion.saldoCliente(movs) === 2500, 'en el libro queda exactamente lo retenido');
  comprobar(expediente(id).estado === 'cerrada', 'cerrada');

  // Perder y elegir otro lote con el mismo depósito.
  const id2 = hastaPujando();
  imp.registrarResultado(id2, { resultado: 'perdida' }, personal());
  imp.avanzar(id2, 'propuesta', cliente());
  comprobar(expediente(id2).estado === 'propuesta' && sumaDe(libro(id2), ['deposito_puja']) === 500000, 'otro lote: el depósito sigue en el libro');
});

/* ── 12 · Lo fiscal ──────────────────────────────────────── */
seccion('12 · Lo fiscal: nada se factura hasta la decisión del contador', () => {
  /* Lo que SÍ está fijado: mientras no haya decisión, ningún cobro de
     importación crea un pago ni un comprobante. */
  comprobar(contar('pagos', 'importacion_id IS NOT NULL') === 0, 'ningún cobro de importación creó una fila en pagos');
  comprobar(contar('facturas') === 0, 'ninguna factura emitida, ningún NCF consumido');
  const id = hastaPujando();
  const m = libro(id)[0];
  for (const modelo of [null, 'mandatario', 'revendedor']) {
    lanzaCon(() => imp.facturarCobro(id, m.id, personal({ config: config({ MODELO_FISCAL: modelo }) })), 501,
      'decision_fiscal_pendiente', `facturarCobro con MODELO_FISCAL = ${modelo}`);
  }

  /* Lo que NO está fijado. Si la empresa es mandataria o revendedora lo
     decide el contador de Victor, y de eso depende qué conceptos emiten
     NCF, de qué tipo (B01/B02), con qué ITBIS y en qué momento. Escribir
     estas pruebas ahora sería inventar comportamiento fiscal, que una vez
     emitido no se puede borrar. Cuando haya decisión, Claude las escribe
     aquí, se implementa hasta que pasen y FISCAL_LISTO pasa a true. */
  const porque = 'depende de la decisión del contador: mandataria o revendedora';
  saltar('qué conceptos pasan por confirmarPago y emiten comprobante', porque);
  saltar('que el cobro fiscal no otorga cupos ni toca membresías', porque);
  saltar('que depósito, precio del equipo, fletes e impuestos no consumen NCF (o sí, si es revendedora)', porque);
  saltar('tipo de NCF y momento (al cobrar o al endosar)', porque);
  saltar('nota de crédito B04 cuando se devuelve algo ya facturado', porque);
});

/* ── 13 · Nada a un contador ─────────────────────────────── */
seccion('13 · Ningún correo sale a quien no sea el cliente o un buzón interno', () => {
  const permitidos = new Set(['cliente-importacion@prueba.do', ...Object.values(correo.BUZONES)]);
  let archivos = [];
  try { archivos = fs.readdirSync(process.env.MERCA_CORREOS).filter((f) => f.endsWith('.txt')); } catch (_) { /* sin correos */ }
  const ajenos = archivos
    .map((f) => /^Para: (.*)$/m.exec(fs.readFileSync(path.join(process.env.MERCA_CORREOS, f), 'utf8')))
    .filter((m) => m && !permitidos.has(m[1].trim().toLowerCase()))
    .map((m) => m[1]);
  comprobar(ajenos.length === 0, `todos los correos van al cliente o a un buzón interno${ajenos.length ? `: ${ajenos.join(', ')}` : ''}`);
  comprobar(!Object.keys(imp).some((n) => /contador/i.test(n)), 'ninguna función envía nada a un contador');
});

console.log(`\n${bien} bien, ${mal} mal, ${saltadas} saltadas (fiscal, pendiente del contador)`);
process.exit(mal ? 1 : 0);
