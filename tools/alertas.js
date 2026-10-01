/**
 * Lógica pura de búsquedas guardadas. No abre la base ni conoce cuentas:
 * recibe los mismos filtros del catálogo y una fila de `anuncios`.
 */

const taxonomia = require('../assets/taxonomia.js');
const precios = require('../assets/precios.js');

const CLAVES = [
  'q', 'categoria', 'subcategoria', 'marca', 'provincia', 'condicion',
  'anioMin', 'anioMax', 'precioMin', 'precioMax', 'horasMax',
  'disponibilidad', 'permuta', 'itbis',
];
const NUMERICAS = new Set(['anioMin', 'anioMax', 'precioMin', 'precioMax', 'horasMax']);
const DISPONIBILIDADES = new Set(['en-pais', 'bajo-pedido']);

function entradas(query) {
  if (query instanceof URLSearchParams) return query.entries();
  if (!query || typeof query !== 'object') return [];
  return Object.entries(query);
}

function normalizarBusqueda(query) {
  const recibidos = Object.fromEntries(entradas(query));
  const resultado = {};

  for (const clave of CLAVES) {
    const original = recibidos[clave];
    if (original === null || original === undefined) continue;

    if (NUMERICAS.has(clave)) {
      const numero = Number(String(original).trim());
      if (Number.isFinite(numero) && numero > 0) resultado[clave] = numero;
      continue;
    }

    if (clave === 'permuta' || clave === 'itbis') {
      if (String(original) === '1') resultado[clave] = '1';
      continue;
    }

    const valor = String(original).trim();
    if (!valor) continue;
    if (clave === 'categoria' && !taxonomia.categoria(valor)) continue;
    if (clave === 'subcategoria' && !taxonomia.subcategoria(valor)) continue;
    if (clave === 'marca' && !Object.hasOwn(taxonomia.MARCAS, valor)) continue;
    if (clave === 'disponibilidad' && !DISPONIBILIDADES.has(valor)) continue;
    resultado[clave] = valor;
  }

  return Object.keys(resultado).length ? resultado : null;
}

function coincide(busqueda, anuncio) {
  if (!busqueda || !anuncio || anuncio.estado !== 'activo') return false;

  const iguales = ['categoria', 'subcategoria', 'marca', 'provincia', 'condicion', 'disponibilidad'];
  if (iguales.some((clave) => busqueda[clave] && String(anuncio[clave] || '') !== String(busqueda[clave]))) {
    return false;
  }
  if (busqueda.permuta && Number(anuncio.permuta) !== 1) return false;
  if (busqueda.itbis && Number(anuncio.itbis_incluido) !== 1) return false;

  const precio = precios.precioEnPesos(anuncio.precio, anuncio.moneda);
  if (busqueda.precioMin && (precio === null || !(precio >= busqueda.precioMin))) return false;
  if (busqueda.precioMax && (precio === null || !(precio <= busqueda.precioMax))) return false;
  if (busqueda.anioMin && (anuncio.anio === null || !(Number(anuncio.anio) >= busqueda.anioMin))) return false;
  if (busqueda.anioMax && (anuncio.anio === null || !(Number(anuncio.anio) <= busqueda.anioMax))) return false;
  if (busqueda.horasMax && anuncio.uso_unidad === 'h' &&
      (anuncio.uso_valor === null || !(Number(anuncio.uso_valor) <= busqueda.horasMax))) {
    return false;
  }

  const texto = [anuncio.marca, anuncio.modelo, anuncio.categoria, anuncio.subcategoria,
    anuncio.provincia, anuncio.anio].filter((valor) => valor !== null && valor !== undefined)
    .join(' ').toLowerCase();
  const palabras = String(busqueda.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  return palabras.every((palabra) => texto.includes(palabra));
}

const ENTERO = new Intl.NumberFormat('es-DO', { maximumFractionDigits: 0 });

function resumenBusqueda(busqueda) {
  if (!busqueda) return '';
  const partes = [];
  if (busqueda.q) partes.push(`“${busqueda.q}”`);
  if (busqueda.categoria) partes.push((taxonomia.categoria(busqueda.categoria) || {}).nombre || busqueda.categoria);
  if (busqueda.subcategoria) partes.push(taxonomia.nombreSubcategoria(busqueda.subcategoria));
  if (busqueda.marca) partes.push(taxonomia.nombreMarca(busqueda.marca));
  if (busqueda.provincia) partes.push(busqueda.provincia);
  if (busqueda.condicion) partes.push(busqueda.condicion);
  if (busqueda.anioMin) partes.push(`desde ${busqueda.anioMin}`);
  if (busqueda.anioMax) partes.push(`hasta ${busqueda.anioMax}`);
  if (busqueda.precioMin) partes.push(`desde RD$ ${ENTERO.format(busqueda.precioMin)}`);
  if (busqueda.precioMax) partes.push(`hasta RD$ ${ENTERO.format(busqueda.precioMax)}`);
  if (busqueda.horasMax) partes.push(`hasta ${ENTERO.format(busqueda.horasMax)} horas`);
  if (busqueda.disponibilidad === 'en-pais') partes.push('en el país');
  if (busqueda.disponibilidad === 'bajo-pedido') partes.push('bajo pedido');
  if (busqueda.permuta) partes.push('acepta permuta');
  if (busqueda.itbis) partes.push('ITBIS incluido');
  return partes.join(' · ');
}

module.exports = { normalizarBusqueda, coincide, resumenBusqueda };
