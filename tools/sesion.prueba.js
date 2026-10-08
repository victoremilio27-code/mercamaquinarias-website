/**
 * Contrato real: api() devuelve datos JSON, devuelve null sin red, con respuesta no JSON o en errores silenciosos, y lanza los demás errores HTTP.
 *
 * El documento fingido solo recibe el registro de DOMContentLoaded: sesion.js lo
 * hace al cargarse, aunque estas pruebas ejercitan únicamente su cliente HTTP.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ruta = path.join(__dirname, '..', 'assets', 'sesion.js');
const codigo = fs.readFileSync(ruta, 'utf8');

function cargar(fetch) {
  const contexto = vm.createContext({
    fetch,
    document: { addEventListener() {} },
  });
  vm.runInContext(codigo, contexto, { filename: ruta });
  return vm.runInContext('({ api, mensajePorEstado })', contexto);
}

function respuesta({ estado = 200, datos, jsonFalla = false, reintentar = null }) {
  return {
    ok: estado >= 200 && estado < 300,
    status: estado,
    headers: { get: (nombre) => nombre === 'Retry-After' ? reintentar : null },
    json: async () => {
      if (jsonFalla) throw new Error('No es JSON');
      return datos;
    },
  };
}

test('mensajePorEstado explica todos los estados conocidos y uno desconocido', () => {
  const { mensajePorEstado } = cargar(async () => {});
  const casos = new Map([
    [400, 'Revise los datos del formulario e inténtelo de nuevo.'],
    [401, 'Su sesión terminó. Inicie sesión de nuevo.'],
    [403, 'No encontramos lo que busca o no tiene permiso para verlo.'],
    [404, 'No encontramos lo que busca o no tiene permiso para verlo.'],
    [409, 'Esto cambió mientras tanto. Recargue la página e inténtelo de nuevo.'],
    [413, 'El archivo o los datos son demasiado grandes.'],
    [429, 'Demasiados intentos seguidos. Espere unos minutos y vuelva a intentarlo.'],
    [500, 'Algo falló de nuestro lado. Inténtelo de nuevo en unos minutos.'],
    [502, 'El sitio no responde en este momento. Inténtelo de nuevo en unos minutos.'],
    [503, 'El sitio no responde en este momento. Inténtelo de nuevo en unos minutos.'],
    [504, 'El sitio no responde en este momento. Inténtelo de nuevo en unos minutos.'],
    [418, 'No se pudo completar la operación'],
  ]);
  for (const [estado, mensaje] of casos) assert.equal(mensajePorEstado(estado, null), mensaje);
});

test('mensajePorEstado interpreta Retry-After válido y rechaza valores inválidos', () => {
  const { mensajePorEstado } = cargar(async () => {});
  assert.match(mensajePorEstado(429, '30'), /1 minuto/);
  assert.match(mensajePorEstado(429, '600'), /10 minutos/);
  for (const valor of [null, '', 'abc', '-5']) {
    assert.equal(
      mensajePorEstado(429, valor),
      'Demasiados intentos seguidos. Espere unos minutos y vuelva a intentarlo.',
    );
  }
});

test('api envía la ruta, credenciales y cuerpo JSON cuando corresponde', async () => {
  const llamadas = [];
  const { api } = cargar(async (...argumentos) => {
    llamadas.push(argumentos);
    return respuesta({ datos: { id: 7 } });
  });
  assert.deepEqual(await api('/equipos', { metodo: 'POST', cuerpo: { nombre: 'Grúa' } }), { id: 7 });
  assert.equal(llamadas[0][0], '/api/equipos');
  assert.deepEqual(JSON.parse(JSON.stringify(llamadas[0][1])), {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre: 'Grúa' }),
  });

  await api('/sesion');
  assert.equal(llamadas[1][0], '/api/sesion');
  assert.equal(llamadas[1][1].credentials, 'same-origin');
  assert.equal(llamadas[1][1].headers, undefined);
  assert.equal(llamadas[1][1].body, undefined);
});

test('api devuelve null cuando no hay red o el éxito no contiene JSON', async () => {
  const sinRed = cargar(async () => { throw new Error('sin red'); }).api;
  assert.equal(await sinRed('/sesion'), null);
  const sinJson = cargar(async () => respuesta({ jsonFalla: true })).api;
  assert.equal(await sinJson('/sesion'), null);
});

test('api lanza el mensaje del servidor y adjunta el estado en 4xx', async () => {
  const { api } = cargar(async () => respuesta({ estado: 400, datos: { error: 'x' } }));
  await assert.rejects(api('/fallo'), (error) => {
    assert.equal(error.message, 'x');
    assert.equal(error.codigo, 400);
    assert.equal(error.name, 'Error');
    return true;
  });
});

test('api usa mensajePorEstado si un 500 no contiene JSON', async () => {
  const { api, mensajePorEstado } = cargar(async () => respuesta({ estado: 500, jsonFalla: true }));
  await assert.rejects(api('/fallo'), { message: mensajePorEstado(500), codigo: 500 });
});

test('api incorpora Retry-After al mensaje de un 429 sin error', async () => {
  const { api } = cargar(async () => respuesta({ estado: 429, datos: {}, reintentar: '600' }));
  await assert.rejects(api('/limitado'), { message: /10 minutos/, codigo: 429 });
});

test('api devuelve null para cualquier respuesta no-ok silenciosa', async () => {
  for (const estado of [400, 429, 500]) {
    const { api } = cargar(async () => respuesta({ estado, datos: { error: 'x' } }));
    assert.equal(await api('/fallo', { silencioso: true }), null);
  }
});
