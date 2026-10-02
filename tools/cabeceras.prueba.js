/**
 * Pruebas del contrato de las cabeceras de seguridad.
 *
 * Cada directiva se comprueba por separado para que una relajación accidental
 * diga exactamente qué protección desapareció. CardNet se alterna mediante el
 * entorno: su módulo consulta las variables en cada llamada y no requiere red.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { CABECERAS_SEGURIDAD, cabecerasDe, politicaDeContenido } = require('./cabeceras.js');

const VARIABLES_CARDNET = [
  'MERCA_CARDNET',
  'MERCA_CARDNET_LLAVE_PUB',
  'MERCA_CARDNET_LLAVE_PRIV',
  'MERCA_CARDNET_URL',
];

function conEntorno(cambios, accion) {
  const anterior = {};
  for (const nombre of Object.keys(cambios)) {
    anterior[nombre] = process.env[nombre];
    if (cambios[nombre] === undefined) delete process.env[nombre];
    else process.env[nombre] = cambios[nombre];
  }
  try {
    return accion();
  } finally {
    for (const [nombre, valor] of Object.entries(anterior)) {
      if (valor === undefined) delete process.env[nombre];
      else process.env[nombre] = valor;
    }
  }
}

function cardnetApagado() {
  return Object.fromEntries(VARIABLES_CARDNET.map((nombre) => [nombre, undefined]));
}

function directivas(politica) {
  return new Map(politica.split('; ').map((directiva) => {
    const [nombre, ...valores] = directiva.split(' ');
    return [nombre, valores];
  }));
}

test("la CSP limita por defecto los recursos al propio sitio", () => {
  conEntorno(cardnetApagado(), () => {
    assert.deepEqual(directivas(politicaDeContenido()).get('default-src'), ["'self'"]);
  });
});

test("script-src solo permite scripts propios y excluye las excepciones inseguras", () => {
  conEntorno(cardnetApagado(), () => {
    const scripts = directivas(politicaDeContenido()).get('script-src');
    assert.deepEqual(scripts, ["'self'"]);
    assert.ok(!scripts.includes("'unsafe-inline'"));
    assert.ok(!scripts.includes("'unsafe-eval'"));
  });
});

test('la CSP declara por separado las hojas y los archivos de fuentes de Google', () => {
  conEntorno(cardnetApagado(), () => {
    const csp = directivas(politicaDeContenido());
    assert.deepEqual(csp.get('style-src'), ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com']);
    assert.deepEqual(csp.get('font-src'), ["'self'", 'https://fonts.gstatic.com']);
  });
});

test('el origen de CardNet solo aparece en frame-src cuando el módulo está activo', () => {
  conEntorno(cardnetApagado(), () => {
    assert.equal(directivas(politicaDeContenido()).has('frame-src'), false);
  });

  conEntorno({
    ...cardnetApagado(),
    MERCA_CARDNET: 'lab',
    MERCA_CARDNET_LLAVE_PUB: 'publica-de-prueba',
    MERCA_CARDNET_LLAVE_PRIV: 'privada-de-prueba',
    MERCA_CARDNET_URL: 'https://captura.ejemplo.test/ruta/',
  }, () => {
    const csp = directivas(politicaDeContenido());
    assert.deepEqual(csp.get('frame-src'), ['https://captura.ejemplo.test']);
    assert.deepEqual(csp.get('script-src'), ["'self'"]);
  });
});

test('la CSP prohíbe marcos antecesores y objetos', () => {
  conEntorno(cardnetApagado(), () => {
    const csp = directivas(politicaDeContenido());
    assert.deepEqual(csp.get('frame-ancestors'), ["'none'"]);
    assert.deepEqual(csp.get('object-src'), ["'none'"]);
  });
});

test('las cabeceras fijas conservan sus valores de seguridad', () => {
  assert.equal(CABECERAS_SEGURIDAD['X-Content-Type-Options'], 'nosniff');
  assert.equal(CABECERAS_SEGURIDAD['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.equal(CABECERAS_SEGURIDAD['X-Frame-Options'], 'DENY');
  assert.equal(
    CABECERAS_SEGURIDAD['Permissions-Policy'],
    'camera=(), microphone=(), geolocation=(), payment=()',
  );
});

test('HSTS solo se envía en producción con HTTPS y dura al menos 180 días', () => {
  for (const produccion of [false, true]) {
    for (const https of [undefined, '0', '1']) {
      conEntorno({ MERCA_HTTPS: https }, () => {
        const hsts = cabecerasDe({}, { produccion })['Strict-Transport-Security'];
        if (!produccion || https !== '1') {
          assert.equal(hsts, undefined);
          return;
        }
        const coincidencia = /^max-age=(\d+)(?:;|$)/.exec(hsts);
        assert.ok(coincidencia, hsts);
        assert.ok(Number(coincidencia[1]) >= 180 * 24 * 60 * 60, hsts);
      });
    }
  }
});

test('ninguna cabecera calculada tiene un valor ausente o vacío', () => {
  conEntorno({ ...cardnetApagado(), MERCA_HTTPS: '1' }, () => {
    for (const [nombre, valor] of Object.entries(cabecerasDe({}, { produccion: true }))) {
      assert.ok(valor !== undefined && valor !== null && String(valor).trim() !== '', nombre);
    }
  });
});
