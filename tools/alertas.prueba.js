const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');

const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'merca-alertas-'));
process.env.MERCA_DB = path.join(temporal, 'alertas.db');
process.env.MERCA_TASA_USD = '63';

// MERCA_DB tiene que quedar fijada antes de cargar db.js: el módulo resuelve
// una sola vez qué archivo abre y jamás debe alcanzar la base habitual.
const db = require('./db.js');
const { normalizarBusqueda, coincide, resumenBusqueda } = require('./alertas.js');

test('normaliza solo filtros conocidos y válidos', () => {
  const resultado = normalizarBusqueda(new URLSearchParams({
    q: '  pala Santiago  ', categoria: 'excavadoras', subcategoria: 'exc-mediana',
    marca: 'caterpillar', anioMin: '2015', precioMax: '3000000', horasMax: '0',
    disponibilidad: 'en-pais', permuta: '1', itbis: 'false', orden: 'recientes', pagina: '3',
    'e_peso-operativo_min': '20', 'e_inventada_max': '99', implemento: 'martillo-hidraulico',
  }));
  assert.deepEqual(resultado, {
    q: 'pala Santiago', categoria: 'excavadoras', subcategoria: 'exc-mediana',
    marca: 'caterpillar', anioMin: 2015, precioMax: 3000000,
    disponibilidad: 'en-pais', permuta: '1', 'e_peso-operativo_min': 20,
    implemento: 'martillo-hidraulico',
  });
  assert.equal(normalizarBusqueda({ categoria: 'inventada', marca: 'ninguna', precioMin: 'no' }), null);
  assert.equal(normalizarBusqueda({}), null);
});

test('coincide reproduce texto, rangos, horas, moneda y etiquetas', () => {
  const anuncio = {
    estado: 'activo', categoria: 'excavadoras', subcategoria: 'exc-mediana',
    marca: 'caterpillar', modelo: '320 D', provincia: 'Santiago', condicion: 'Bueno',
    anio: 2018, precio: 40000, moneda: 'USD', uso_valor: 4200, uso_unidad: 'h',
    disponibilidad: 'en-pais', permuta: 1, itbis_incluido: 1,
  };
  assert.equal(coincide(normalizarBusqueda({ q: 'caterpillar santiago', precioMax: 2600000,
    anioMin: 2015, horasMax: 5000, permuta: 1, itbis: 1 }), anuncio), true);
  assert.equal(coincide(normalizarBusqueda({ precioMax: 2500000 }), anuncio), false);
  assert.equal(coincide(normalizarBusqueda({ q: 'descripción ausente' }),
    { ...anuncio, descripcion: 'Descripción ausente' }), false);
  assert.equal(coincide(normalizarBusqueda({ categoria: 'excavadoras' }),
    { ...anuncio, estado: 'pausado' }), false);
  assert.equal(coincide(normalizarBusqueda({ horasMax: 10 }),
    { ...anuncio, uso_valor: 90000, uso_unidad: 'km' }), true);
  assert.equal(coincide(normalizarBusqueda({ precioMax: 3000000 }),
    { ...anuncio, precio: null }), false);
  assert.equal(coincide(normalizarBusqueda({ anioMax: 2020 }),
    { ...anuncio, anio: null }), false);
  assert.equal(coincide(normalizarBusqueda({ horasMax: 5000 }),
    { ...anuncio, uso_valor: null }), false);
});

test('resume la búsqueda con nombres y cifras legibles', () => {
  assert.equal(resumenBusqueda(normalizarBusqueda({
    categoria: 'excavadoras', marca: 'caterpillar', anioMin: 2015, precioMax: 3000000,
  })), 'Excavadoras · Caterpillar · desde 2015 · hasta RD$ 3,000,000');
  assert.equal(resumenBusqueda(null), '');
  assert.equal(resumenBusqueda(normalizarBusqueda({ categoria: 'excavadoras',
    'e_peso-operativo_min': 20, implemento: 'martillo-hidraulico' })),
  'Excavadoras · peso operativo desde 20 t · con martillo hidráulico');
});

function crearVendedor() {
  const { idUsuario } = db.crearCuenta({
    correo: 'alertas@ejemplo.test', clave: 'ClaveLargaDePrueba9', nombre: 'Prueba Alertas',
    telefono: '8095550101', tipo: 'particular',
  });
  return db.organizacionDe(idUsuario);
}

function sembrar(org, indice, datos) {
  const creado = db.crearAnuncio({
    idOrg: org.id,
    categoria: 'excavadoras', subcategoria: 'exc-mediana', marca: 'caterpillar',
    modelo: `Serie ${indice}`, anio: 2010 + indice, condicion: indice % 2 ? 'Bueno' : 'Regular',
    usoValor: indice * 700, usoUnidad: indice % 5 === 0 ? 'km' : 'h',
    descripcion: `Descripción que el catálogo no busca ${indice}`,
    provincia: indice % 3 === 0 ? 'Santiago' : 'Santo Domingo',
    precio: 500000 + indice * 100000, moneda: 'DOP', modalidadPrecio: 'fijo',
    itbisIncluido: indice % 4 === 0, permuta: indice % 3 === 0,
    disponibilidad: indice % 2 ? 'en-pais' : 'bajo-pedido',
    vence: db.sumarDias(30), fotos: [], telefonos: [],
    ...datos,
  });
  return creado.idAnuncio || creado.id || creado;
}

test('coincide selecciona los mismos ids que buscarAnuncios en una base temporal', () => {
  const org = crearVendedor();
  const ids = [];
  for (let i = 1; i <= 15; i += 1) {
    ids.push(sembrar(org, i, i === 14 ? {
      categoria: 'camiones', subcategoria: 'camion-volteo', marca: 'mack',
      modelo: 'Granite', moneda: 'USD', precio: 30000,
    } : {}));
  }
  // Un estado que el catálogo público excluye también debe excluirse en memoria.
  db.cambiarEstadoAnuncio(ids[14], org.id, 'pausado');
  const filas = ids.map((id) => db.anuncio(id));
  const sqlite = new (require('node:sqlite').DatabaseSync)(process.env.MERCA_DB);
  sqlite.prepare('UPDATE anuncios SET especificaciones = ?, implementos_lista = ? WHERE id = ?')
    .run(JSON.stringify({ 'peso-operativo': 22 }), JSON.stringify(['martillo-hidraulico']), ids[5]);
  sqlite.prepare('UPDATE anuncios SET especificaciones = ?, implementos_lista = ? WHERE id = ?')
    .run(JSON.stringify({ 'peso-operativo': 35 }), JSON.stringify(['pulgar']), ids[6]);
  sqlite.close();
  filas[5] = db.anuncio(ids[5]);
  filas[6] = db.anuncio(ids[6]);

  const casos = [
    { categoria: 'excavadoras' },
    { subcategoria: 'exc-mediana', marca: 'caterpillar' },
    { provincia: 'Santiago', condicion: 'Bueno' },
    { anioMin: 2016, anioMax: 2021 },
    { precioMin: 1000000, precioMax: 1700000 },
    { precioMax: 2000000 },
    { horasMax: 4000 },
    { disponibilidad: 'bajo-pedido' },
    { permuta: 1, itbis: 1 },
    { q: 'caterpillar santo 2021' },
    { categoria: 'camiones', precioMax: 2000000 },
    { categoria: 'excavadoras', 'e_peso-operativo_min': 20, 'e_peso-operativo_max': 30 },
    { categoria: 'excavadoras', implemento: 'martillo-hidraulico' },
  ];

  for (const filtros of casos) {
    const busqueda = normalizarBusqueda(filtros);
    const esperados = [];
    let pagina = 1;
    let resultado;
    do {
      resultado = db.buscarAnuncios({ ...busqueda, pagina, porPagina: 3, orden: 'recientes' });
      esperados.push(...resultado.anuncios.map((anuncio) => anuncio.id));
      pagina += 1;
    } while (pagina <= resultado.paginas);

    const actuales = filas.filter((anuncio) => coincide(busqueda, anuncio)).map((anuncio) => anuncio.id);
    assert.deepEqual(new Set(actuales), new Set(esperados), JSON.stringify(filtros));
  }
});
