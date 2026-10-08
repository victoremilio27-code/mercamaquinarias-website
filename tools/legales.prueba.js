/**
 * Pruebas puras de la fuente única de documentos legales.
 *
 *   node --test tools/legales.prueba.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const RAIZ = path.join(__dirname, '..');
const RUTA_MODULO = path.join(RAIZ, 'assets', 'legales.js');
const TEXTO_MODULO = fs.readFileSync(RUTA_MODULO, 'utf8');
const HTML_LEGAL = fs.readFileSync(path.join(RAIZ, 'legal.html'), 'utf8');
const {
  DOCUMENTOS,
  OBLIGATORIOS,
  PARA_PUBLICAR,
  PARA_PAGAR,
  documento,
  versionDe,
  enlaceDe,
  faltanPorAceptar,
} = require(RUTA_MODULO);

test('DOCUMENTOS tiene ids únicos y metadatos válidos', () => {
  assert.equal(new Set(DOCUMENTOS.map(({ id }) => id)).size, DOCUMENTOS.length);

  for (const actual of DOCUMENTOS) {
    assert.match(actual.id, /^\S+$/, `${actual.id}: el id debe tener contenido`);
    assert.match(actual.nombre, /\S/, `${actual.id}: falta el título`);
    assert.match(actual.version, /^\d+\.\d+$/, `${actual.id}: versión inválida`);
    assert.match(actual.vigenteDesde, /^\d{4}-\d{2}-\d{2}$/, `${actual.id}: fecha inválida`);
    assert.equal(typeof actual.obligatorio, 'boolean', `${actual.id}: obligatorio debe ser booleano`);
  }
});

test('OBLIGATORIOS es exactamente el filtro de documentos obligatorios', () => {
  assert.deepEqual(OBLIGATORIOS, DOCUMENTOS.filter(({ obligatorio }) => obligatorio));
});

test('las listas de cada operación solo contienen ids existentes y sin repetidos', () => {
  const ids = new Set(DOCUMENTOS.map(({ id }) => id));
  for (const [nombre, pedidos] of Object.entries({ PARA_PUBLICAR, PARA_PAGAR })) {
    assert.equal(new Set(pedidos).size, pedidos.length, `${nombre} contiene ids repetidos`);
    for (const id of pedidos) assert.ok(ids.has(id), `${nombre} contiene el id desconocido ${id}`);
  }
});

test('faltanPorAceptar pide todos ante aceptaciones ausentes o vacías', () => {
  const pedidos = DOCUMENTOS.map(({ id }) => id);
  for (const aceptado of [null, {}, Object.create(null)]) {
    assert.deepEqual(faltanPorAceptar(aceptado, pedidos), pedidos);
  }
});

test('faltanPorAceptar reconoce las versiones vigentes y detecta una anterior', () => {
  const pedidos = DOCUMENTOS.map(({ id }) => id);
  const aceptado = Object.fromEntries(DOCUMENTOS.map(({ id, version }) => [id, version]));
  assert.deepEqual(faltanPorAceptar(aceptado, pedidos), []);

  const [idAnterior] = pedidos;
  aceptado[idAnterior] = '0.0';
  assert.deepEqual(faltanPorAceptar(aceptado, pedidos), [idAnterior]);
});

test('faltanPorAceptar ignora ids desconocidos y no muta las aceptaciones', () => {
  const aceptado = { terminos: '1.0', extra: 'conservar' };
  const original = structuredClone(aceptado);
  assert.deepEqual(faltanPorAceptar(aceptado, ['no-existe']), []);
  assert.deepEqual(aceptado, original);
});

test('los buscadores y enlaces responden para ids existentes y desconocidos', () => {
  const existente = DOCUMENTOS[0];
  assert.equal(documento(existente.id), existente);
  assert.equal(versionDe(existente.id), existente.version);
  assert.equal(enlaceDe(existente.id), `legal.html#${existente.id}`);

  assert.equal(documento('no-existe'), null);
  assert.equal(versionDe('no-existe'), null);
  assert.equal(enlaceDe('no-existe'), 'legal.html#no-existe');
});

test('cada documento tiene destino y metadatos acordes en legal.html', () => {
  for (const actual of DOCUMENTOS) {
    const apertura = new RegExp(`<section\\b[^>]*\\bid=["']${actual.id}["'][^>]*>`, 'i');
    const inicio = HTML_LEGAL.search(apertura);
    assert.notEqual(inicio, -1, `${enlaceDe(actual.id)} no tiene un elemento de destino`);

    const fin = HTML_LEGAL.indexOf('</section>', inicio);
    assert.notEqual(fin, -1, `${actual.id}: la sección no tiene cierre`);
    const seccion = HTML_LEGAL.slice(inicio, fin);
    const metadatos = seccion.match(/class=["']doc-version["'][^>]*>([^<]*)/i);
    assert.ok(metadatos, `${actual.id}: faltan los metadatos visibles actuales`);
    const versionVisible = metadatos[1].match(/v(\d+\.\d+)/i);
    const fechaVisible = metadatos[1].match(/\d{4}-\d{2}-\d{2}/);
    if (versionVisible) assert.equal(versionVisible[1], actual.version, `${actual.id}: la versión visible no cuadra`);
    if (fechaVisible) assert.equal(fechaVisible[0], actual.vigenteDesde, `${actual.id}: la fecha visible no cuadra`);
  }
});

test('legal.html no publica números de teléfono dominicanos', () => {
  const telefono = /(?<!\d)(?:\+?1[ .-]?)?\(?(?:809|829|849)\)?[ .-]?\d{3}[ .-]?\d{4}(?!\d)/;
  assert.doesNotMatch(HTML_LEGAL, telefono);
});

test('el módulo conserva el final CommonJS y carga sin window', () => {
  const finalComun = /if \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*\}\s*$/;
  assert.match(TEXTO_MODULO, finalComun);
  assert.doesNotThrow(() => execFileSync(process.execPath, [
    '-e',
    `delete global.window; require(${JSON.stringify(RUTA_MODULO)})`,
  ]));
});
