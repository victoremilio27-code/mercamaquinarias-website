/* Catálogo compartido de especificaciones e implementos por tipo de máquina.
   Los ids se guardarán en los anuncios: no se cambian aunque se corrija el nombre. */

const ESPECIFICACIONES = {
  excavadoras: [
    { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 0.5, max: 1000, paso: 0.1 },
    { id: 'potencia-neta', nombre: 'Potencia neta', unidad: 'hp', min: 8, max: 5000, paso: 1 },
    { id: 'capacidad-cucharon', nombre: 'Capacidad del cucharón', unidad: 'm³', min: 0.01, max: 50, paso: 0.01 },
    { id: 'profundidad-excavacion', nombre: 'Profundidad de excavación', unidad: 'm', min: 0.5, max: 30, paso: 0.1 },
  ],
  retroexcavadoras: [
    { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 2, max: 30, paso: 0.1 },
    { id: 'potencia-neta', nombre: 'Potencia neta', unidad: 'hp', min: 30, max: 300, paso: 1 },
    { id: 'capacidad-cucharon-delantero', nombre: 'Capacidad del cucharón delantero', unidad: 'm³', min: 0.1, max: 5, paso: 0.01 },
    { id: 'profundidad-excavacion', nombre: 'Profundidad de excavación', unidad: 'm', min: 1, max: 12, paso: 0.1 },
  ],
  cargadores: [
    { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 0.5, max: 300, paso: 0.1 },
    { id: 'potencia-neta', nombre: 'Potencia neta', unidad: 'hp', min: 10, max: 2500, paso: 1 },
    { id: 'capacidad-cucharon', nombre: 'Capacidad del cucharón', unidad: 'm³', min: 0.05, max: 50, paso: 0.01 },
    { id: 'carga-vuelco', nombre: 'Carga de vuelco', unidad: 'kg', min: 200, max: 250000, paso: 10 },
  ],
  bulldozers: [
    { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 1, max: 300, paso: 0.1 },
    { id: 'potencia-neta', nombre: 'Potencia neta', unidad: 'hp', min: 20, max: 2000, paso: 1 },
    { id: 'ancho-hoja', nombre: 'Ancho de hoja', unidad: 'm', min: 1, max: 12, paso: 0.1 },
  ],
  motoniveladoras: [
    { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 3, max: 80, paso: 0.1 },
    { id: 'potencia-neta', nombre: 'Potencia neta', unidad: 'hp', min: 40, max: 1000, paso: 1 },
    { id: 'ancho-hoja', nombre: 'Ancho de hoja', unidad: 'm', min: 1.5, max: 8, paso: 0.1 },
  ],
  compactadoras: [
    { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 0.05, max: 80, paso: 0.1 },
    { id: 'ancho-tambor', nombre: 'Ancho de tambor', unidad: 'm', min: 0.2, max: 4, paso: 0.01 },
    { id: 'fuerza-centrifuga', nombre: 'Fuerza centrífuga', unidad: 'kN', min: 1, max: 1000, paso: 1 },
  ],
  pavimentacion: [
    { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 0.5, max: 200, paso: 0.1 },
    { id: 'potencia-neta', nombre: 'Potencia neta', unidad: 'hp', min: 10, max: 2500, paso: 1 },
    { id: 'ancho-trabajo', nombre: 'Ancho de trabajo', unidad: 'm', min: 0.2, max: 20, paso: 0.1 },
  ],
  gruas: [
    { id: 'capacidad-maxima', nombre: 'Capacidad máxima', unidad: 't', min: 0.5, max: 5000, paso: 0.1 },
    { id: 'longitud-pluma', nombre: 'Longitud de pluma', unidad: 'm', min: 1, max: 250, paso: 0.1 },
  ],
  elevacion: [
    { id: 'altura-trabajo', nombre: 'Altura de trabajo', unidad: 'm', min: 1, max: 100, paso: 0.1 },
    { id: 'capacidad-plataforma', nombre: 'Capacidad de la plataforma', unidad: 'kg', min: 50, max: 5000, paso: 1 },
  ],
  montacargas: [
    { id: 'capacidad', nombre: 'Capacidad', unidad: 'kg', min: 100, max: 100000, paso: 10 },
    { id: 'altura-elevacion', nombre: 'Altura de elevación', unidad: 'm', min: 0.5, max: 30, paso: 0.1 },
  ],
  camiones: [
    { id: 'peso-bruto-vehicular', nombre: 'Peso bruto vehicular', unidad: 't', min: 1, max: 250, paso: 0.1 },
    { id: 'capacidad-carga', nombre: 'Capacidad de carga', unidad: 't', min: 0.1, max: 200, paso: 0.1 },
    { id: 'numero-ejes', nombre: 'Número de ejes', unidad: 'ejes', min: 2, max: 20, paso: 1 },
    { id: 'potencia', nombre: 'Potencia', unidad: 'hp', min: 40, max: 2000, paso: 1 },
  ],
  autobuses: [
    { id: 'capacidad-pasajeros', nombre: 'Capacidad de pasajeros', unidad: 'personas', min: 5, max: 200, paso: 1 },
    { id: 'potencia', nombre: 'Potencia', unidad: 'hp', min: 40, max: 1000, paso: 1 },
  ],
  remolques: [
    { id: 'capacidad-carga', nombre: 'Capacidad de carga', unidad: 't', min: 0.5, max: 300, paso: 0.1 },
    { id: 'numero-ejes', nombre: 'Número de ejes', unidad: 'ejes', min: 1, max: 20, paso: 1 },
    { id: 'longitud', nombre: 'Longitud', unidad: 'm', min: 1, max: 40, paso: 0.1 },
  ],
  agricola: [
    { id: 'potencia', nombre: 'Potencia', unidad: 'hp', min: 5, max: 1500, paso: 1 },
    { id: 'ancho-trabajo', nombre: 'Ancho de trabajo', unidad: 'm', min: 0.2, max: 30, paso: 0.1 },
  ],
  perforacion: [
    { id: 'profundidad-perforacion', nombre: 'Profundidad de perforación', unidad: 'm', min: 1, max: 5000, paso: 1 },
    { id: 'diametro-perforacion', nombre: 'Diámetro de perforación', unidad: 'mm', min: 10, max: 5000, paso: 1 },
  ],
  generadores: [
    { id: 'potencia-nominal', nombre: 'Potencia nominal', unidad: 'kW', min: 0.5, max: 10000, paso: 0.1 },
    { id: 'horas-uso', nombre: 'Horas de uso', unidad: 'h', min: 0, max: 200000, paso: 1 },
  ],
};

/* `agregar` también reemplaza una especificación del mismo id. Así una
   subcategoría puede ajustar su escala sin inventar un id incompatible. */
const POR_SUBCATEGORIA = {
  'exc-mini': {
    categoria: 'excavadoras',
    agregar: [
      { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 0.5, max: 6, paso: 0.1 },
      { id: 'capacidad-cucharon', nombre: 'Capacidad del cucharón', unidad: 'm³', min: 0.01, max: 1, paso: 0.01 },
    ],
  },
  'exc-pesada': {
    categoria: 'excavadoras',
    agregar: [
      { id: 'peso-operativo', nombre: 'Peso operativo', unidad: 't', min: 25, max: 1000, paso: 0.1 },
      { id: 'capacidad-cucharon', nombre: 'Capacidad del cucharón', unidad: 'm³', min: 0.5, max: 50, paso: 0.01 },
    ],
  },
  'agr-implemento': { categoria: 'agricola', quitar: ['potencia'] },
};

const IMPLEMENTOS = {
  excavadoras: [
    { id: 'martillo-hidraulico', nombre: 'Martillo hidráulico' },
    { id: 'pulgar', nombre: 'Pulgar' },
    { id: 'cucharon-zanja', nombre: 'Cucharón de zanja' },
    { id: 'cucharon-roca', nombre: 'Cucharón de roca' },
    { id: 'garra', nombre: 'Garra' },
  ],
  retroexcavadoras: [
    { id: 'martillo-hidraulico', nombre: 'Martillo hidráulico' },
    { id: 'cucharon-zanja', nombre: 'Cucharón de zanja' },
    { id: 'horquillas', nombre: 'Horquillas' },
    { id: 'barrena', nombre: 'Barrena' },
  ],
  cargadores: [
    { id: 'horquillas', nombre: 'Horquillas' },
    { id: 'barredora', nombre: 'Barredora' },
    { id: 'cucharon-roca', nombre: 'Cucharón de roca' },
    { id: 'garra', nombre: 'Garra' },
  ],
  bulldozers: [{ id: 'ripper', nombre: 'Ripper' }, { id: 'cabrestante', nombre: 'Cabrestante' }],
  motoniveladoras: [{ id: 'ripper', nombre: 'Ripper' }, { id: 'escarificador', nombre: 'Escarificador' }],
  compactadoras: [{ id: 'kit-pata-cabra', nombre: 'Kit pata de cabra' }],
  pavimentacion: [{ id: 'regla-extensible', nombre: 'Regla extensible' }],
  gruas: [{ id: 'jib', nombre: 'Plumín (jib)' }, { id: 'cabrestante', nombre: 'Cabrestante' }],
  elevacion: [{ id: 'generador-plataforma', nombre: 'Generador en plataforma' }],
  montacargas: [{ id: 'desplazador-lateral', nombre: 'Desplazador lateral' }, { id: 'pinza-rollos', nombre: 'Pinza para rollos' }],
  camiones: [{ id: 'toma-fuerza', nombre: 'Toma de fuerza' }, { id: 'liftgate', nombre: 'Compuerta elevadora' }],
  autobuses: [{ id: 'rampa-discapacidad', nombre: 'Rampa para discapacidad' }],
  remolques: [{ id: 'rampas', nombre: 'Rampas' }, { id: 'cabrestante', nombre: 'Cabrestante' }],
  agricola: [{ id: 'arado', nombre: 'Arado' }, { id: 'rastra', nombre: 'Rastra' }, { id: 'segadora', nombre: 'Segadora' }],
  perforacion: [{ id: 'barrena', nombre: 'Barrena' }, { id: 'martillo-fondo', nombre: 'Martillo de fondo' }],
  generadores: [{ id: 'tanque-externo', nombre: 'Tanque externo' }, { id: 'remolque', nombre: 'Remolque' }],
};

function especificacionesDe(idCategoria, idSub) {
  const base = ESPECIFICACIONES[idCategoria] || [];
  const cambios = POR_SUBCATEGORIA[idSub];
  if (!cambios || cambios.categoria !== idCategoria) return base.slice();

  const quitar = new Set(cambios.quitar || []);
  const reemplazos = new Map((cambios.agregar || []).map((item) => [item.id, item]));
  const efectivas = base
    .filter((item) => !quitar.has(item.id))
    .map((item) => reemplazos.get(item.id) || item);
  const idsBase = new Set(base.map((item) => item.id));
  for (const item of cambios.agregar || []) {
    if (!idsBase.has(item.id) && !quitar.has(item.id)) efectivas.push(item);
  }
  return efectivas;
}

function implementosDe(idCategoria) {
  return (IMPLEMENTOS[idCategoria] || []).slice();
}

function numeroDecimal(valor) {
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : null;
  if (typeof valor !== 'string') return null;
  const texto = valor.trim();
  if (!texto || !/^[+-]?(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(texto)) return null;
  const numero = Number(texto.replace(',', '.'));
  return Number.isFinite(numero) ? numero : null;
}

function validarEspecificaciones(idCategoria, idSub, valores) {
  const limpios = {};
  const errores = [];
  if (!valores || typeof valores !== 'object' || Array.isArray(valores)) {
    return { limpios, errores };
  }

  for (const especificacion of especificacionesDe(idCategoria, idSub)) {
    if (!Object.prototype.hasOwnProperty.call(valores, especificacion.id)) continue;
    const valor = valores[especificacion.id];
    if (valor === null || valor === undefined || (typeof valor === 'string' && !valor.trim())) continue;
    const numero = numeroDecimal(valor);
    if (numero === null) {
      errores.push(`${especificacion.nombre} debe ser un número en ${especificacion.unidad}.`);
    } else if (numero < especificacion.min || numero > especificacion.max) {
      errores.push(`${especificacion.nombre} debe estar entre ${especificacion.min} y ${especificacion.max} ${especificacion.unidad}.`);
    } else {
      limpios[especificacion.id] = numero;
    }
  }
  return { limpios, errores };
}

function validarImplementos(idCategoria, ids) {
  const limpios = [];
  const errores = [];
  const permitidos = new Map(implementosDe(idCategoria).map((item) => [item.id, item]));
  const vistos = new Set();
  if (ids === null || ids === undefined) return { limpios, errores };
  if (!Array.isArray(ids)) return { limpios, errores: ['Los implementos deben enviarse como una lista.'] };

  for (const id of ids) {
    if (vistos.has(id)) continue;
    vistos.add(id);
    if (permitidos.has(id)) limpios.push(id);
    else errores.push(`El implemento «${id}» no corresponde a esta categoría.`);
  }
  return { limpios, errores };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ESPECIFICACIONES,
    POR_SUBCATEGORIA,
    IMPLEMENTOS,
    especificacionesDe,
    implementosDe,
    validarEspecificaciones,
    validarImplementos,
  };
}
