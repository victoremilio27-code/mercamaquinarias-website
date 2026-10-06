/**
 * Pruebas puras de tools/codex.js: la extracción del bloque diff de una
 * respuesta de Codex y la elección de qué respuesta cuenta. Sin red ni disco.
 *
 * Los casos salen de lo que Codex ha entregado de verdad: un parche entero,
 * varios bloques en una respuesta (el último manda), «parte 1 de N», una
 * respuesta con solo el comando, y GitHub devolviendo el cuerpo con \r\n.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  bloquesDiff, ultimoParcheCompleto, clasificarRespuesta, partesPendientes,
  respuestaVigente, desenvolverCrlf,
} = require('./codex.js');

const SHA = '3581e5d8c5dbbe47b88d7359341202eab1b1c2e1';

function parche(archivo, extra) {
  return [
    'From ' + SHA + ' Mon Sep 17 00:00:00 2001',
    'From: Codex <codex@openai.com>',
    'Date: Fri, 2 Oct 2026 02:49:17 +0000',
    'Subject: [PATCH] prueba: ' + archivo,
    '',
    '---',
    ' ' + archivo + ' | 2 +-',
    ' 1 file changed, 1 insertion(+), 1 deletion(-)',
    '',
    'diff --git a/' + archivo + ' b/' + archivo,
    'index 1111111..2222222 100644',
    '--- a/' + archivo,
    '+++ b/' + archivo,
    '@@ -1,3 +1,3 @@',
    ' uno',
    '-dos' + (extra || ''),
    '+DOS',
    ' tres',
    '-- ',
    '2.43.0',
  ];
}

function respuesta(...partes) {
  return partes.join('\n');
}

function cercado(lineas, etiqueta) {
  return ['```' + (etiqueta === undefined ? 'diff' : etiqueta), ...lineas, '```'].join('\n');
}

test('un parche completo se reconoce y se devuelve entero', () => {
  const texto = respuesta('### Resumen', '', '* Hice lo pedido.', '', cercado(parche('a.js')), '', ' [View task →](https://x)');
  const c = clasificarRespuesta(texto);
  assert.equal(c.tipo, 'completo');
  const b = ultimoParcheCompleto(texto);
  assert.ok(b);
  assert.ok(b.texto.startsWith('From ' + SHA));
  assert.ok(b.texto.endsWith('-- \n2.43.0\n'));
  assert.equal(b.commits, 1);
});

test('con varios bloques gana el último completo, y un bloque de comando se ignora', () => {
  const texto = respuesta(
    cercado(['git format-patch main..HEAD --stdout'], 'bash'),
    cercado(parche('vieja.js')),
    'Corregí algo, va de nuevo:',
    cercado(parche('nueva.js'))
  );
  assert.equal(bloquesDiff(texto).length, 2);
  const b = ultimoParcheCompleto(texto);
  assert.match(b.texto, /nueva\.js/);
  assert.doesNotMatch(b.texto, /vieja\.js/);
});

test('un bloque diff cortado sin firma es parcial, no completo', () => {
  const cortado = parche('a.js').slice(0, 16);
  const c = clasificarRespuesta(cercado(cortado));
  assert.equal(c.tipo, 'parcial');
  assert.equal(ultimoParcheCompleto(cercado(cortado)), null);
});

test('un bloque sin cerrar (respuesta cortada) es parcial', () => {
  const texto = ['```diff', ...parche('a.js')].join('\n');
  assert.equal(clasificarRespuesta(texto).tipo, 'parcial');
});

test('hunks que no cuadran con su cabecera cuentan como parcial aunque lleve firma', () => {
  const p = parche('a.js');
  p.splice(p.indexOf(' tres'), 1);
  assert.equal(clasificarRespuesta(cercado(p)).tipo, 'parcial');
});

test('«parte 1 de 3» es parcial aunque el bloque venga entero; «parte 1 de N» no', () => {
  const entero = cercado(parche('a.js'));
  assert.equal(clasificarRespuesta('Entrego parte 1 de 3.\n\n' + entero).tipo, 'parcial');
  assert.deepEqual(partesPendientes('parte 2 de 3'), { k: 2, n: 3 });
  assert.equal(partesPendientes('parte 3 de 3'), null);
  assert.equal(partesPendientes('«parte 1 de N»'), null);
  assert.equal(clasificarRespuesta('Si no cabe, «parte 1 de N».\n\n' + entero).tipo, 'completo');
});

test('una respuesta sin diff (solo el comando) es sin-diff', () => {
  const texto = respuesta('Listo. Corre:', cercado(['git format-patch main..HEAD --stdout'], 'bash'), 'y pégalo.');
  assert.equal(clasificarRespuesta(texto).tipo, 'sin-diff');
  assert.equal(ultimoParcheCompleto(texto), null);
  assert.equal(clasificarRespuesta('').tipo, 'sin-diff');
  assert.equal(clasificarRespuesta(null).tipo, 'sin-diff');
});

test('un bloque sin etiqueta solo cuenta si empieza por From <sha>', () => {
  assert.equal(clasificarRespuesta(cercado(parche('a.js'), '')).tipo, 'completo');
  assert.equal(clasificarRespuesta(cercado(['npm run auditar', 'ok'], '')).tipo, 'sin-diff');
});

test('saltos CRLF de GitHub en todo el cuerpo: se quita un \\r por línea y el parche queda con LF', () => {
  const crlf = respuesta('### Resumen', '', cercado(parche('a.js'))).replace(/\n/g, '\r\n');
  const b = ultimoParcheCompleto(crlf);
  assert.ok(b, 'debía reconocerse el parche pese a los \\r');
  assert.ok(!b.texto.includes('\r'));
  assert.ok(b.texto.startsWith('From ' + SHA + ' Mon Sep 17 00:00:00 2001\n'));
});

test('CRLF legítimo de un archivo CRLF sobrevive al envoltorio LF', () => {
  // Parche de un archivo CRLF dentro de un comentario con \n: las líneas de
  // contenido llevan \r y NO se deben tocar (git am --keep-cr los necesita).
  const p = parche('b.js').map((l) => (/^[ +-](uno|dos|tres|DOS)$/.test(l) ? l + '\r' : l));
  const b = ultimoParcheCompleto(cercado(p));
  assert.ok(b);
  assert.ok(b.texto.includes('-dos\r\n'));
  assert.ok(b.texto.includes('+DOS\r\n'));
  assert.ok(b.texto.startsWith('From ' + SHA + ' Mon Sep 17 00:00:00 2001\n'));
});

test('CRLF legítimo dentro de un cuerpo con todo en CRLF: queda un \\r en el contenido', () => {
  const p = parche('b.js').map((l) => (/^[ +-](uno|dos|tres|DOS)$/.test(l) ? l + '\r' : l));
  const cuerpo = cercado(p).replace(/\n/g, '\r\n');
  const b = ultimoParcheCompleto(cuerpo);
  assert.ok(b);
  assert.ok(b.texto.includes('-dos\r\n'));
  assert.ok(!b.texto.includes('\r\r'));
  assert.ok(b.texto.startsWith('From ' + SHA + ' Mon Sep 17 00:00:00 2001\n'));
});

test('desenvolverCrlf no toca líneas que no son un parche', () => {
  assert.deepEqual(desenvolverCrlf(['hola\r', 'mundo\r']), ['hola\r', 'mundo\r']);
});

test('el espacio final de «-- » que GitHub se come no impide reconocer el parche', () => {
  const p = parche('a.js').map((l) => (l === '-- ' ? '--' : l));
  assert.equal(clasificarRespuesta(cercado(p)).tipo, 'completo');
});

test('un U+FFFD dentro del parche se avisa con su línea', () => {
  const p = parche('a.js');
  p[14] = ' un�o';
  const b = ultimoParcheCompleto(cercado(p));
  assert.ok(b);
  assert.equal(b.lineaRota, 15);
});

test('un parche que parchea markdown con ``` dentro no cierra el bloque antes de tiempo', () => {
  const p = parche('a.md');
  p.splice(p.indexOf(' tres'), 0, '+```js');
  p[p.indexOf('@@ -1,3 +1,3 @@')] = '@@ -1,3 +1,4 @@';
  assert.equal(clasificarRespuesta(cercado(p)).tipo, 'completo');
});

test('varios commits en un solo bloque (format-patch --stdout) se cuentan', () => {
  const dos = [...parche('a.js'), ...parche('b.js').map((l) => l.replace(SHA, SHA.replace(/^3/, '4')))];
  const b = ultimoParcheCompleto(cercado(dos));
  assert.ok(b);
  assert.equal(b.commits, 2);
});

function com(id, login, cuando, body) {
  return { id, user: { login }, created_at: cuando, body };
}

test('respuestaVigente: la respuesta anterior al último encargo no cuenta', () => {
  const BOT = 'chatgpt-codex-connector[bot]';
  const hilo = [
    com(1, 'victor', '2026-10-02T01:00:00Z', '@codex haz esto'),
    com(2, BOT, '2026-10-02T01:05:00Z', 'respuesta vieja'),
    com(3, 'victor', '2026-10-02T02:00:00Z', '@codex otra vez, no aplicó'),
  ];
  let v = respuestaVigente(hilo);
  assert.equal(v.encargo.id, 3);
  assert.equal(v.ultima, null);
  assert.equal(v.viejas, 1);
  hilo.push(com(4, BOT, '2026-10-02T02:10:00Z', 'respuesta nueva'));
  v = respuestaVigente(hilo);
  assert.equal(v.ultima.id, 4);
  assert.equal(v.respuestas.length, 1);
});

test('respuestaVigente: sin encargo no hay referencia y el bot mencionando a codex no es un encargo', () => {
  const BOT = 'chatgpt-codex-connector[bot]';
  const v = respuestaVigente([com(1, BOT, '2026-10-02T01:05:00Z', 'cc @codex')]);
  assert.equal(v.encargo, null);
  assert.equal(v.ultima.id, 1);
});

test('respuestaVigente: de varias respuestas tras el encargo manda la última', () => {
  const BOT = 'chatgpt-codex-connector[bot]';
  const v = respuestaVigente([
    com(2, BOT, '2026-10-02T01:20:00Z', 'parte 1 de 2'),
    com(1, 'victor', '2026-10-02T01:00:00Z', '@codex haz esto'),
    com(3, BOT, '2026-10-02T01:30:00Z', 'parte 2 de 2'),
  ]);
  assert.equal(v.ultima.id, 3);
  assert.equal(v.respuestas.length, 2);
});
