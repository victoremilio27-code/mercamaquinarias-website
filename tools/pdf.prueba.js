const test = require('node:test');
const assert = require('node:assert/strict');

const { documento, anchoDe, ANCHO, ALTO } = require('./pdf.js');

function crearPdf() {
  const pdf = documento();
  pdf.texto('Español: áéíóú, ¿qué? ¡sí! RD$ ·', 24, 0);
  pdf.texto('Comillas ‘simples’ y “dobles” — guion…', 24, 30, {
    tipo: 'negrita', alinear: 'derecha', ancho: ANCHO - 48,
  });
  pdf.texto('Equipos (SRL) \\ prueba', 24, 50, { alinear: 'centro', ancho: ANCHO - 48 });
  pdf.rect(24, 70, 80, 20, '#EEEEEE');
  pdf.marco(24, 100, 120, 30, { grosor: 1, color: '#222222' });
  pdf.linea(24, 140, 180, 140, { grosor: 0.5, color: '#333333' });
  pdf.parrafo('Este párrafo usa varias palabras para ocupar más de una línea.', 24, 160, 120);
  return pdf.terminar();
}

function datosXref(pdf) {
  const texto = pdf.toString('latin1');
  const coincidenciaInicio = /startxref\n(\d+)\n%%EOF\n?$/.exec(texto);
  assert.ok(coincidenciaInicio, 'el PDF declara startxref antes de %%EOF');
  const inicio = Number(coincidenciaInicio[1]);
  assert.equal(pdf.subarray(inicio, inicio + 5).toString('ascii'), 'xref\n');

  const seccion = /^xref\n0 (\d+)\n0000000000 65535 f \n((?:\d{10} 00000 n \n)+)/
    .exec(texto.slice(inicio));
  assert.ok(seccion, 'xref tiene una subsección completa desde el objeto cero');
  const entradas = [...seccion[2].matchAll(/(\d{10}) 00000 n /g)].map((entrada) => Number(entrada[1]));
  assert.equal(entradas.length, Number(seccion[1]) - 1);
  return { texto, inicio, entradas };
}

function comprobarEstructura(pdf) {
  assert.ok(Buffer.isBuffer(pdf));
  assert.ok(pdf.subarray(0, 5).equals(Buffer.from('%PDF-')));
  assert.match(pdf.toString('latin1'), /%%EOF\n?$/);

  const { texto, entradas } = datosXref(pdf);
  entradas.forEach((desplazamiento, indice) => {
    const numero = indice + 1;
    assert.equal(
      pdf.subarray(desplazamiento, desplazamiento + 16).toString('ascii').startsWith(`${numero} 0 obj`),
      true,
      `xref apunta al inicio del objeto ${numero}`,
    );
  });

  const trailer = /trailer\n<< \/Size (\d+) \/Root (\d+) 0 R >>/.exec(texto);
  assert.ok(trailer, 'el PDF tiene /Size y /Root en el trailer');
  assert.equal(Number(trailer[1]), entradas.length + 1);
  const raiz = Number(trailer[2]);
  assert.match(texto.slice(entradas[raiz - 1]), new RegExp(`^${raiz} 0 obj\\n<< \\/Type \\/Catalog\\b`));

  let busqueda = 0;
  let cantidadFlujos = 0;
  const marcaInicio = Buffer.from('stream\n');
  const marcaFin = Buffer.from('\nendstream');
  while ((busqueda = pdf.indexOf(marcaInicio, busqueda)) !== -1) {
    const inicioFlujo = busqueda + marcaInicio.length;
    const finFlujo = pdf.indexOf(marcaFin, inicioFlujo);
    assert.notEqual(finFlujo, -1, 'cada stream termina en endstream');
    const cabecera = pdf.subarray(Math.max(0, busqueda - 80), busqueda).toString('ascii');
    const longitud = /\/Length (\d+) >>\n$/.exec(cabecera);
    assert.ok(longitud, 'cada stream declara /Length');
    assert.equal(Number(longitud[1]), finFlujo - inicioFlujo);
    cantidadFlujos += 1;
    busqueda = finFlujo + marcaFin.length;
  }
  assert.ok(cantidadFlujos > 0, 'el PDF contiene al menos un stream');
}

test('genera un PDF con xref, trailer y longitudes de stream exactos', () => {
  comprobarEstructura(crearPdf());
});

test('conserva el español en latin1 y normaliza signos fuera de WinAnsi', () => {
  const contenido = crearPdf().toString('latin1');
  assert.match(contenido, /Espa\\361ol: \\341\\351\\355\\363\\372, \\277qu\\351\? \\241s\\355! RD\$ \\267/);
  assert.ok(contenido.includes('(Comillas \'simples\' y "dobles" - guion...) Tj'));
});

test('escapa paréntesis y contrabarras sin alterar la estructura', () => {
  const pdf = crearPdf();
  assert.ok(pdf.toString('latin1').includes('(Equipos \\(SRL\\) \\\\ prueba) Tj'));
  comprobarEstructura(pdf);
});

test('calcula anchos crecientes, mayores en negrita y nulos para texto vacío', () => {
  assert.equal(anchoDe('', 10, false), 0);
  assert.ok(anchoDe('Maquinaria', 10, false) > anchoDe('Máquina', 10, false));
  assert.ok(anchoDe('Maquinaria', 10, true) > anchoDe('Maquinaria', 10, false));
});

test('convierte la coordenada superior a la altura de la página', () => {
  const pdf = documento().texto('Arriba', 25, 0).terminar().toString('latin1');
  const posicion = /25\.00 (\d+\.\d+) Td/.exec(pdf);
  assert.ok(posicion, 'el contenido incluye la posición del texto');
  assert.ok(Math.abs(Number(posicion[1]) - ALTO) < 0.01);
});
