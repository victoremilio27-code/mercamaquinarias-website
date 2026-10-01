const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const taxonomia = require('../assets/taxonomia.js');
const catalogo = require('../assets/especificaciones.js');

const {
  ESPECIFICACIONES,
  POR_SUBCATEGORIA,
  IMPLEMENTOS,
  especificacionesDe,
  validarEspecificaciones,
  validarImplementos,
} = catalogo;

test('todas las categorías tienen listas de especificaciones e implementos', () => {
  for (const { id } of taxonomia.CATEGORIAS) {
    assert.ok(Array.isArray(ESPECIFICACIONES[id]), `faltan especificaciones de ${id}`);
    assert.ok(Array.isArray(IMPLEMENTOS[id]), `faltan implementos de ${id}`);
  }
});

test('los ids no se repiten y los rangos son válidos', () => {
  for (const [categoria, lista] of Object.entries(ESPECIFICACIONES)) {
    assert.equal(new Set(lista.map(({ id }) => id)).size, lista.length, categoria);
    for (const especificacion of lista) {
      assert.match(especificacion.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      assert.ok(especificacion.min < especificacion.max, `${categoria}/${especificacion.id}`);
      assert.ok(especificacion.paso > 0, `${categoria}/${especificacion.id}`);
      for (const clave of ['min', 'max', 'paso']) assert.equal(typeof especificacion[clave], 'number');
    }
  }
  for (const [categoria, lista] of Object.entries(IMPLEMENTOS)) {
    assert.equal(new Set(lista.map(({ id }) => id)).size, lista.length, categoria);
  }
});

test('cada ajuste pertenece a una subcategoría existente', () => {
  const ids = new Set(taxonomia.CATEGORIAS.flatMap(({ subcategorias }) => subcategorias.map(({ id }) => id)));
  for (const id of Object.keys(POR_SUBCATEGORIA)) assert.ok(ids.has(id), id);
});

test('la subcategoría reemplaza rangos y puede quitar especificaciones', () => {
  assert.equal(especificacionesDe('excavadoras', 'exc-mini').find(({ id }) => id === 'peso-operativo').max, 6);
  assert.ok(!especificacionesDe('agricola', 'agr-implemento').some(({ id }) => id === 'potencia'));
  assert.equal(especificacionesDe('camiones', 'exc-mini').find(({ id }) => id === 'peso-bruto-vehicular').max, 250);
});

test('limpia coma decimal, ignora claves desconocidas y omite vacíos', () => {
  const resultado = validarEspecificaciones('excavadoras', 'exc-mini', {
    'peso-operativo': ' 5,5 ',
    'potencia-neta': '',
    inventada: 18,
  });
  assert.deepEqual(resultado, { limpios: { 'peso-operativo': 5.5 }, errores: [] });
});

test('informa valores no numéricos y fuera de rango con nombre y unidad', () => {
  const resultado = validarEspecificaciones('excavadoras', 'exc-mini', {
    'peso-operativo': 'pesada',
    'capacidad-cucharon': 20,
  });
  assert.equal(resultado.errores.length, 2);
  assert.match(resultado.errores[0], /Peso operativo.*t/);
  assert.match(resultado.errores[1], /Capacidad del cucharón.*m³/);
});

test('valida implementos y elimina duplicados', () => {
  assert.deepEqual(validarImplementos('excavadoras', ['pulgar', 'pulgar', 'desconocido']), {
    limpios: ['pulgar'],
    errores: ['El implemento «desconocido» no corresponde a esta categoría.'],
  });
});

test('se carga como script de navegador y deja funciones globales', () => {
  const codigo = fs.readFileSync(path.join(__dirname, '..', 'assets', 'especificaciones.js'), 'utf8');
  const contexto = vm.createContext({});
  vm.runInContext(codigo, contexto);
  assert.equal(typeof contexto.especificacionesDe, 'function');
  assert.equal(typeof contexto.validarEspecificaciones, 'function');
});
