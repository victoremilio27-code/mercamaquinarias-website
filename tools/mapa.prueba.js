/**
 * Pruebas puras de los cálculos del mapa, sin encender el servicio.
 *
 *   node --test tools/mapa.prueba.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const contexto = vm.createContext({ console, Math });
for (const archivo of ['data.js', 'mapa.js']) {
  const ruta = path.join(__dirname, '..', 'assets', archivo);
  vm.runInContext(fs.readFileSync(ruta, 'utf8'), contexto, { filename: ruta });
}

const {
  CIUDADES_RD,
  proyectar,
  distanciaKm,
  puntosDeRuta,
  posicionEnRuta,
  largoRutaKm,
  MAPA_VISTA,
} = vm.runInContext(`({
  CIUDADES_RD,
  proyectar,
  distanciaKm,
  puntosDeRuta,
  posicionEnRuta,
  largoRutaKm,
  MAPA_VISTA,
})`, contexto);

test('proyectar coloca las ciudades dentro del lienzo y conserva la orientación', () => {
  for (const ciudad of CIUDADES_RD) {
    const punto = proyectar(ciudad.lon, ciudad.lat);
    assert.ok(punto.x >= 0 && punto.x <= MAPA_VISTA.ancho, ciudad.id);
    assert.ok(punto.y >= 0 && punto.y <= MAPA_VISTA.alto, ciudad.id);
  }

  const oeste = CIUDADES_RD.reduce((a, b) => a.lon < b.lon ? a : b);
  const este = CIUDADES_RD.reduce((a, b) => a.lon > b.lon ? a : b);
  const sur = CIUDADES_RD.reduce((a, b) => a.lat < b.lat ? a : b);
  const norte = CIUDADES_RD.reduce((a, b) => a.lat > b.lat ? a : b);
  assert.ok(proyectar(este.lon, este.lat).x > proyectar(oeste.lon, oeste.lat).x);
  assert.ok(proyectar(norte.lon, norte.lat).y < proyectar(sur.lon, sur.lat).y);
});

test('distanciaKm es nula consigo misma, simétrica y plausible entre las dos ciudades principales', () => {
  const santoDomingo = CIUDADES_RD.find(({ id }) => id === 'santo-domingo');
  const santiago = CIUDADES_RD.find(({ id }) => id === 'santiago');
  assert.ok(santoDomingo);
  assert.ok(santiago);
  assert.equal(distanciaKm(santoDomingo, santoDomingo), 0);
  assert.equal(distanciaKm(santoDomingo, santiago), distanciaKm(santiago, santoDomingo));
  assert.ok(distanciaKm(santoDomingo, santiago) >= 120);
  assert.ok(distanciaKm(santoDomingo, santiago) <= 160);
});

test('puntosDeRuta conserva el orden y descarta identificadores desconocidos', () => {
  const puntos = puntosDeRuta({
    origen: 'santiago',
    paso: ['no-existe', 'la-vega', 'bonao'],
    destino: 'santo-domingo',
  });
  assert.deepEqual(Array.from(puntos, ({ id }) => id), [
    'santiago',
    'la-vega',
    'bonao',
    'santo-domingo',
  ]);
});

test('posicionEnRuta recorta el avance y resuelve los extremos', () => {
  const origen = { id: 'origen', lat: 18, lon: -71 };
  const destino = { id: 'destino', lat: 19, lon: -69 };
  for (const avance of [-1, 0]) {
    const posicion = posicionEnRuta([origen, destino], avance);
    assert.equal(posicion.lat, origen.lat);
    assert.equal(posicion.lon, origen.lon);
  }
  for (const avance of [1, 2]) {
    const posicion = posicionEnRuta([origen, destino], avance);
    assert.equal(posicion.lat, destino.lat);
    assert.equal(posicion.lon, destino.lon);
  }
});

test('posicionEnRuta admite una ciudad e interpola el avance por distancia', () => {
  const unica = { id: 'unica', lat: 18, lon: -70 };
  assert.doesNotThrow(() => posicionEnRuta([unica], 0.5));
  assert.equal(posicionEnRuta([unica], 0.5).id, 'unica');

  const puntoMedio = posicionEnRuta([
    { lat: 0, lon: 0 },
    { lat: 0, lon: 1 },
    { lat: 0, lon: 4 },
  ], 0.5);
  assert.ok(puntoMedio.lon > 1 && puntoMedio.lon < 4);
});

test('largoRutaKm suma los tramos y vale cero para un solo punto', () => {
  const puntos = [
    { lat: 18, lon: -71 },
    { lat: 18.5, lon: -70.5 },
    { lat: 19, lon: -70 },
  ];
  const suma = distanciaKm(puntos[0], puntos[1]) + distanciaKm(puntos[1], puntos[2]);
  assert.equal(largoRutaKm(puntos), suma);
  assert.equal(largoRutaKm([puntos[0]]), 0);
});

test('transporte y financiamiento siguen apagados', () => {
  const { seOfrece } = require('../assets/servicios.js');
  assert.deepEqual(['transporte', 'financiamiento'].map(seOfrece), [false, false]);
});
