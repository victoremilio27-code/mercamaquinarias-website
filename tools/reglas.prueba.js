/**
 * Pruebas estáticas de las reglas que protegen la arquitectura del sitio.
 *
 *   node --test tools/reglas.prueba.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const MODULOS_COMPARTIDOS = [
  'assets/precios.js',
  'assets/servicios.js',
  'assets/taxonomia.js',
  'assets/legales.js',
  'assets/especificaciones.js',
];

const leer = (archivo) => fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
const lineaEn = (texto, indice) => texto.slice(0, indice).split('\n').length;
const ubicacion = (archivo, texto, indice) => `${archivo}:${lineaEn(texto, indice)}`;
const htmlDeRaiz = () => fs.readdirSync(RAIZ).filter((archivo) => archivo.endsWith('.html')).sort();

function fallarSiHay(errores, seccion) {
  assert.equal(errores.length, 0, `${errores.join('\n')} (vea CLAUDE.md, ${seccion})`);
}

test('package.json conserva el proyecto sin dependencias de ejecución', () => {
  const archivo = 'package.json';
  const texto = leer(archivo);
  const paquete = JSON.parse(texto);
  const errores = [];
  const linea = (clave) => ubicacion(archivo, texto, Math.max(0, texto.indexOf(`"${clave}"`)));

  if (paquete.dependencies && Object.keys(paquete.dependencies).length) {
    errores.push(`${linea('dependencies')} contiene dependencias de ejecución`);
  }
  const desarrollo = Object.keys(paquete.devDependencies || {});
  if (desarrollo.length !== 1 || desarrollo[0] !== 'puppeteer') {
    errores.push(`${linea('devDependencies')} devDependencies solo puede contener puppeteer`);
  }
  if (!paquete.engines || !paquete.engines.node) {
    errores.push(`${linea('engines')} debe declarar engines.node`);
  }
  fallarSiHay(errores, '«Arquitectura: lo que parece raro pero es deliberado»');
});

test('los módulos compartidos conservan el formato compatible con navegador y Node', () => {
  const errores = [];
  for (const archivo of MODULOS_COMPARTIDOS) {
    const texto = leer(archivo);
    const exportacionComun = /if \(typeof module !== 'undefined' && module\.exports\) \{[\s\S]*\}\s*$/;
    if (!exportacionComun.test(texto)) {
      errores.push(`${archivo}:${texto.split('\n').length} debe terminar con el bloque de module.exports`);
    }
    const moduloEs = texto.match(/^\s*(?:import\s|export\s)/m);
    if (moduloEs) {
      errores.push(`${ubicacion(archivo, texto, moduloEs.index)} no puede usar import/export de módulo ES`);
    }
    assert.doesNotThrow(
      () => require(path.join(RAIZ, archivo)),
      `${archivo}:1 no se puede require() sin window ni document (vea CLAUDE.md, «Módulos compartidos entre navegador y node»)`,
    );
  }
  fallarSiHay(errores, '«Módulos compartidos entre navegador y node»');
});

test('los HTML de la raíz no contienen scripts en línea ni atributos de evento', () => {
  const errores = [];
  for (const archivo of htmlDeRaiz()) {
    const texto = leer(archivo);
    for (const coincidencia of texto.matchAll(/<script\b([^>]*)>/gi)) {
      const atributos = coincidencia[1];
      const tieneSrc = /\bsrc\s*=/i.test(atributos);
      const esJsonLd = /\btype\s*=\s*["']application\/ld\+json["']/i.test(atributos);
      if (!tieneSrc && !esJsonLd) {
        errores.push(`${ubicacion(archivo, texto, coincidencia.index)} contiene un <script> en línea`);
      }
    }
    for (const coincidencia of texto.matchAll(/\son[a-z]+\s*=/gi)) {
      errores.push(`${ubicacion(archivo, texto, coincidencia.index)} contiene el atributo de evento ${coincidencia[0].trim()}`);
    }
  }
  fallarSiHay(errores, '«Despliegue — cuidado» (CSP de tools/cabeceras.js)');
});

test('los HTML de la raíz no publican teléfonos de la empresa', () => {
  const errores = [];
  for (const archivo of htmlDeRaiz()) {
    const texto = leer(archivo);
    for (const coincidencia of texto.matchAll(/href\s*=\s*["']tel:/gi)) {
      errores.push(`${ubicacion(archivo, texto, coincidencia.index)} contiene un enlace href="tel:`);
    }
    const telefono = /(?<!\d)(?:\+?1[ .-]?)?\(?((?:809|829|849))\)?[ .-]?(\d{3})[ .-]?(\d{4})(?!\d)/g;
    for (const coincidencia of texto.matchAll(telefono)) {
      if (`${coincidencia[2]}${coincidencia[3]}` !== '0000000') {
        errores.push(`${ubicacion(archivo, texto, coincidencia.index)} contiene un número dominicano real`);
      }
    }
  }
  fallarSiHay(errores, '«Reglas de negocio que no se negocian»');
});

test(`el nombre viejo TuEquipo${'RD'} solo permanece en los archivos autorizados`, () => {
  const permitidos = new Set([
    'CLAUDE.md',
    'assets/publicar.js',
    'deploy/nginx-dominio-viejo.conf',
    'tools/db.js',
  ]);
  const errores = [];

  function revisarDirectorio(directorio = '') {
    for (const entrada of fs.readdirSync(path.join(RAIZ, directorio), { withFileTypes: true })) {
      const archivo = path.join(directorio, entrada.name).replaceAll(path.sep, '/');
      if (entrada.isDirectory()) {
        if (['.git', 'node_modules'].includes(entrada.name) || archivo === '.planning') continue;
        revisarDirectorio(archivo);
      } else if (!permitidos.has(archivo)) {
        const texto = leer(archivo);
        const coincidencia = new RegExp(`tuequipo${'rd'}`, 'i').exec(texto);
        if (coincidencia) errores.push(`${ubicacion(archivo, texto, coincidencia.index)} contiene el nombre viejo`);
      }
    }
  }

  revisarDirectorio();
  fallarSiHay(errores, '«Cómo se trabaja con Victor»');
});

test('cada HTML público declara idioma, título y metadatos básicos', {
  todo: 'Los HTML actuales declaran lang="es-DO" en vez de lang="es".',
}, () => {
  const errores = [];
  for (const archivo of htmlDeRaiz().filter((nombre) => nombre !== 'proximamente.html')) {
    const texto = leer(archivo);
    const reglas = [
      [/<html\b[^>]*\blang\s*=\s*["']es["']/i, '<html lang="es"'],
      [/<title\b[^>]*>\s*[^<\s][\s\S]*?<\/title>/i, 'un <title> no vacío'],
      [/<meta\b[^>]*\bname\s*=\s*["']description["'][^>]*>/i, '<meta name="description">'],
      [/<meta\b[^>]*\bname\s*=\s*["']viewport["'][^>]*>/i, '<meta name="viewport">'],
    ];
    for (const [patron, descripcion] of reglas) {
      if (!patron.test(texto)) {
        const apertura = /<(?:html|head)\b/i.exec(texto);
        errores.push(`${ubicacion(archivo, texto, apertura ? apertura.index : 0)} debe declarar ${descripcion}`);
      }
    }
  }
  fallarSiHay(errores, '«Sin paso de compilación y sin TypeScript»');
});

test('.gitattributes mantiene LF en scripts, despliegue y flujos de CI', () => {
  const archivo = '.gitattributes';
  const texto = leer(archivo);
  const reglas = [
    [/^\*\.sh\s+text eol=lf\s*$/m, '*.sh'],
    [/^deploy\/desplegar-mercamaquinarias\s+text eol=lf\s*$/m, 'deploy/desplegar-mercamaquinarias'],
    [/^deploy\/\*\.service\s+text eol=lf\s*$/m, 'deploy/*.service'],
    [/^deploy\/\*\.timer\s+text eol=lf\s*$/m, 'deploy/*.timer'],
    [/^deploy\/\*\.conf\s+text eol=lf\s*$/m, 'deploy/*.conf'],
    [/^\.github\/workflows\/\*\.yml\s+text eol=lf\s*$/m, '.github/workflows/'],
  ];
  const errores = reglas
    .filter(([patron]) => !patron.test(texto))
    .map(([, alcance]) => `${archivo}:1 debe declarar text eol=lf para ${alcance}`);
  fallarSiHay(errores, '«Saltos de línea»');
});
