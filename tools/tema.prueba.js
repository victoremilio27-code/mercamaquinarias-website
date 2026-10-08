/**
 * Pruebas del tema en un DOM mínimo: solo se fingen los nodos que tema.js
 * consulta al arrancar y al crear su botón.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ruta = path.join(__dirname, '..', 'assets', 'tema.js');
const codigo = fs.readFileSync(ruta, 'utf8');

function cargar({ guardado = null, fallaLectura = false, fallaEscritura = false } = {}) {
  const atributosRaiz = new Map();
  const oyentesDocumento = {};
  const botones = new Map();
  const raiz = {
    setAttribute(nombre, valor) { atributosRaiz.set(nombre, valor); },
    getAttribute(nombre) { return atributosRaiz.get(nombre) || null; },
    classList: { add() {}, remove() {} },
  };
  const cabecera = { insertBefore(boton) { botones.set(boton.id, boton); } };
  const meta = { setAttribute() {} };
  const document = {
    documentElement: raiz,
    body: {},
    addEventListener(tipo, funcion) { oyentesDocumento[tipo] = funcion; },
    querySelector(selector) {
      if (selector === 'meta[name="theme-color"]') return meta;
      if (selector === '.cab__inner') return cabecera;
      return null;
    },
    querySelectorAll() { return []; },
    getElementById(id) { return botones.get(id) || null; },
    createElement() {
      const oyentes = {};
      return {
        setAttribute() {},
        addEventListener(tipo, funcion) { oyentes[tipo] = funcion; },
        pulsar() { oyentes.click(); },
      };
    },
  };
  const localStorage = {
    getItem(clave) {
      assert.equal(clave, 'mm-tema');
      if (fallaLectura) throw new Error('lectura bloqueada');
      return guardado;
    },
    setItem(clave, valor) {
      assert.equal(clave, 'mm-tema');
      if (fallaEscritura) throw new Error('escritura bloqueada');
      guardado = valor;
    },
  };
  const window = {
    matchMedia: () => ({ matches: false }),
    getComputedStyle: () => ({ backgroundColor: '' }),
  };
  vm.runInContext(codigo, vm.createContext({
    document,
    window,
    localStorage,
    setTimeout,
    clearTimeout,
  }), { filename: ruta });
  return {
    tema: () => raiz.getAttribute('data-theme'),
    cargarDom() { oyentesDocumento.DOMContentLoaded(); },
    boton: () => botones.get('temaToggle'),
  };
}

test('aplica al cargar el tema guardado con la clave mm-tema', () => {
  assert.equal(cargar({ guardado: 'dark' }).tema(), 'dark');
});

test('sin tema guardado sale claro', () => {
  assert.equal(cargar().tema(), 'light');
});

test('si localStorage falla al leer o escribir, el botón cambia el tema durante la visita', () => {
  for (const opciones of [
    { fallaLectura: true },
    { fallaEscritura: true },
  ]) {
    const pagina = cargar(opciones);
    assert.equal(pagina.tema(), 'light');
    assert.doesNotThrow(() => pagina.cargarDom());
    assert.doesNotThrow(() => pagina.boton().pulsar());
    assert.equal(pagina.tema(), 'dark');
  }
});
