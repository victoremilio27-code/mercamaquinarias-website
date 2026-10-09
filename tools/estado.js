const fs = require('node:fs');
const path = require('node:path');

const UMBRALES = Object.freeze({
  discoLibrePorcentaje: 15,
  respaldoHoras: 30,
  walBytes: 100 * 1024 * 1024,
});

function mensajeDe(error) {
  return { error: error instanceof Error ? error.message : String(error) };
}

function tamanoSiExiste(ruta, fsx) {
  try {
    return fsx.statSync(ruta).size;
  } catch (error) {
    if (error && error.code === 'ENOENT') return null;
    throw error;
  }
}

function estadoBase(archivoBase, fsx) {
  return {
    bytes: fsx.statSync(archivoBase).size,
    wal: tamanoSiExiste(`${archivoBase}-wal`, fsx),
    shm: tamanoSiExiste(`${archivoBase}-shm`, fsx),
  };
}

function estadoDisco(archivoBase, fsx) {
  const datos = fsx.statfsSync(archivoBase);
  const bloque = Number(datos.bsize);
  const total = Number(datos.blocks) * bloque;
  const libres = Number(datos.bavail === undefined ? datos.bfree : datos.bavail) * bloque;
  return {
    libres,
    total,
    porcentajeLibre: total === 0 ? 0 : libres / total * 100,
  };
}

function estadoRespaldo(carpetaRespaldos, ahora, fsx) {
  const candidatos = fsx.readdirSync(carpetaRespaldos)
    .filter((nombre) => nombre.startsWith('mercamaquinarias-') && nombre.endsWith('.db'))
    .map((nombre) => ({ nombre, datos: fsx.statSync(path.join(carpetaRespaldos, nombre)) }))
    .filter(({ datos }) => datos.isFile())
    .sort((a, b) => b.datos.mtimeMs - a.datos.mtimeMs || b.nombre.localeCompare(a.nombre));

  if (!candidatos.length) return null;
  const ultimo = candidatos[0];
  return {
    nombre: ultimo.nombre,
    bytes: ultimo.datos.size,
    antiguedadHoras: Math.max(0, (ahora - ultimo.datos.mtimeMs) / 3_600_000),
  };
}

function medirCarpeta(carpeta, fsx) {
  let archivos = 0;
  let bytes = 0;

  function recorrer(actual) {
    for (const entrada of fsx.readdirSync(actual, { withFileTypes: true })) {
      const ruta = path.join(actual, entrada.name);
      if (entrada.isSymbolicLink()) continue;
      if (entrada.isDirectory()) {
        recorrer(ruta);
      } else if (entrada.isFile()) {
        archivos += 1;
        bytes += fsx.statSync(ruta).size;
      }
    }
  }

  recorrer(carpeta);
  return { archivos, bytes };
}

function intentar(fn) {
  try {
    return fn();
  } catch (error) {
    return mensajeDe(error);
  }
}

function estadoDelSistema({
  archivoBase,
  carpetaRespaldos,
  carpetas = {},
  ahora = Date.now(),
  fsx = fs,
} = {}) {
  const base = intentar(() => estadoBase(archivoBase, fsx));
  const disco = intentar(() => estadoDisco(archivoBase, fsx));
  const respaldo = intentar(() => estadoRespaldo(carpetaRespaldos, ahora, fsx));
  const estadoCarpetas = {};

  try {
    for (const [nombre, carpeta] of Object.entries(carpetas)) {
      estadoCarpetas[nombre] = intentar(() => medirCarpeta(carpeta, fsx));
    }
  } catch (error) {
    estadoCarpetas.error = mensajeDe(error).error;
  }

  const avisos = [];
  if (!disco.error && disco.porcentajeLibre < UMBRALES.discoLibrePorcentaje) {
    avisos.push('Queda menos de 15 % de espacio libre en el disco.');
  }
  if (respaldo === null) {
    avisos.push('No hay ningún respaldo de la base de datos.');
  } else if (!respaldo.error && respaldo.antiguedadHoras > UMBRALES.respaldoHoras) {
    avisos.push('El último respaldo tiene más de 30 horas.');
  }
  if (!base.error && base.wal !== null && base.wal > UMBRALES.walBytes) {
    avisos.push('El archivo WAL de la base supera los 100 MB.');
  }

  return { base, disco, respaldo, carpetas: estadoCarpetas, avisos };
}

function formatoBytes(n) {
  const unidades = ['B', 'KB', 'MB', 'GB', 'TB'];
  let valor = Number(n);
  let unidad = 0;
  while (Math.abs(valor) >= 1024 && unidad < unidades.length - 1) {
    valor /= 1024;
    unidad += 1;
  }
  const numero = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1, useGrouping: false })
    .format(valor).replace('.', ',');
  return `${numero} ${unidades[unidad]}`;
}

module.exports = { UMBRALES, estadoDelSistema, formatoBytes };
