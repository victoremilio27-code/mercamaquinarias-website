const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { mesDe, mesActual, validarMes, zip } = require('./lote.js');

function crc32(datos) {
  let crc = 0xffffffff;
  for (const byte of datos) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function leerDirectorioCentral(archivo) {
  const firmaFin = 0x06054b50;
  let fin = archivo.length - 22;
  while (fin >= 0 && archivo.readUInt32LE(fin) !== firmaFin) fin -= 1;
  assert.ok(fin >= 0, 'el ZIP tiene directorio central');
  const cantidad = archivo.readUInt16LE(fin + 10);
  let posicion = archivo.readUInt32LE(fin + 16);
  const entradas = [];
  for (let indice = 0; indice < cantidad; indice += 1) {
    assert.equal(archivo.readUInt32LE(posicion), 0x02014b50);
    const largoNombre = archivo.readUInt16LE(posicion + 28);
    const largoExtra = archivo.readUInt16LE(posicion + 30);
    const largoComentario = archivo.readUInt16LE(posicion + 32);
    entradas.push({
      nombre: archivo.subarray(posicion + 46, posicion + 46 + largoNombre).toString('utf8'),
      tamano: archivo.readUInt32LE(posicion + 24),
      crc: archivo.readUInt32LE(posicion + 16),
      utf8: Boolean(archivo.readUInt16LE(posicion + 8) & 0x0800),
    });
    posicion += 46 + largoNombre + largoExtra + largoComentario;
  }
  return entradas;
}

test('calcula el mes según la hora fija de Santo Domingo', () => {
  assert.equal(mesDe('2025-10-01T03:59:59.999Z'), '2025-09');
  assert.equal(mesDe('2025-10-01T04:00:00.000Z'), '2025-10');
  assert.equal(mesActual(Date.parse('2025-10-01T04:00:00.000Z')), '2025-10');
});

test('valida un mes completo y el cambio de año', () => {
  assert.deepEqual(validarMes('2025-09', Date.parse('2025-11-15T12:00:00.000Z')), {
    mes: '2025-09', desde: '2025-09-01T04:00:00.000Z', hasta: '2025-10-01T04:00:00.000Z', parcial: false,
  });
  assert.equal(validarMes('2025-12', Date.parse('2026-01-02T12:00:00.000Z')).hasta, '2026-01-01T04:00:00.000Z');
  assert.equal(validarMes('2025-11', Date.parse('2025-11-15T12:00:00.000Z')).parcial, true);
});

test('rechaza formatos incorrectos y meses futuros con código 400', () => {
  for (const mes of ['2025-13', '25-09', '2025-9', '2025-12']) {
    assert.throws(
      () => validarMes(mes, Date.parse('2025-11-15T12:00:00.000Z')),
      (error) => error.codigo === 400 && /mes/i.test(error.message),
    );
  }
});

test('crea un ZIP determinista con carpetas, nombres UTF-8, tamaños y CRC válidos', (t) => {
  const fuentes = [
    { nombre: 'con-ncf/B0100000001.pdf', datos: Buffer.from('%PDF-prueba') },
    { nombre: 'sin-ncf/resumen-á.csv', datos: Buffer.from('uno,dos\n1,2\n') },
  ];
  const primero = zip(fuentes);
  assert.deepEqual(zip(fuentes), primero);
  assert.deepEqual(leerDirectorioCentral(primero), fuentes.map((entrada) => ({
    nombre: entrada.nombre, tamano: entrada.datos.length, crc: crc32(entrada.datos), utf8: true,
  })));

  const disponible = spawnSync('unzip', ['-v'], { stdio: 'ignore' });
  if (disponible.error && disponible.error.code === 'ENOENT') {
    t.diagnostic('unzip no está disponible; se omite su comprobación');
    return;
  }
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-zip-'));
  const archivo = path.join(carpeta, 'lote.zip');
  fs.writeFileSync(archivo, primero);
  t.after(() => fs.rmSync(carpeta, { recursive: true, force: true }));
  const comprobacion = spawnSync('unzip', ['-t', archivo], { encoding: 'utf8' });
  assert.equal(comprobacion.status, 0, comprobacion.stdout + comprobacion.stderr);
});
