/**
 * Barreras estáticas y de comportamiento para las reglas de negocio que no
 * deben depender de que quien edite estos módulos recuerde su contexto.
 *
 *   node --test tools/reglas-negocio.prueba.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const RAIZ = path.join(__dirname, '..');
const REGLAS = 'CLAUDE.md, «Reglas de negocio que no se negocian»';
const MODULOS_PERMITIDOS = new Set(['db', 'facturas', 'pdf', 'formato607']);
const CARPETA_CORREOS = fs.mkdtempSync(path.join(os.tmpdir(), 'mercamaquinarias-reglas-negocio-'));

process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_CORREOS = CARPETA_CORREOS;

// El transporte y BUZONES se fijan al cargar el módulo, por eso el entorno
// desechable se prepara antes de este require.
const correo = require('./correo');

const leer = (archivo) => fs.readFileSync(path.join(RAIZ, archivo), 'utf8');
const lineaEn = (texto, indice) => texto.slice(0, indice).split('\n').length;
const ubicacion = (archivo, texto, indice) => `${archivo}:${lineaEn(texto, indice)}`;

function exigirSinErrores(errores) {
  assert.equal(errores.length, 0, `${errores.join('\n')} (rompe ${REGLAS})`);
}

function archivosDentro(directorio) {
  const encontrados = [];
  for (const entrada of fs.readdirSync(path.join(RAIZ, directorio), { withFileTypes: true })) {
    const archivo = path.posix.join(directorio, entrada.name);
    if (entrada.isDirectory()) encontrados.push(...archivosDentro(archivo));
    else encontrados.push(archivo);
  }
  return encontrados;
}

test('el lote y el 607 no pueden alcanzar ningún transporte de correo', () => {
  const errores = [];
  const revisados = new Set();

  function revisar(archivo, esEntrada = false) {
    const nombre = path.basename(archivo, '.js');
    if (!esEntrada && MODULOS_PERMITIDOS.has(nombre)) return;
    if (revisados.has(archivo)) return;
    revisados.add(archivo);

    const texto = leer(archivo);
    const requisitos = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    for (const coincidencia of texto.matchAll(requisitos)) {
      const modulo = coincidencia[1];
      const donde = ubicacion(archivo, texto, coincidencia.index);
      if (['node:http', 'node:https', 'node:net'].includes(modulo)) {
        errores.push(`${donde} requiere el transporte ${modulo}`);
      }
      if (!modulo.startsWith('./')) continue;

      const solicitado = path.basename(modulo, '.js');
      if (solicitado === 'correo') {
        errores.push(`${donde} alcanza tools/correo.js`);
        continue;
      }
      if (MODULOS_PERMITIDOS.has(solicitado)) continue;

      const rutaModulo = modulo.replace(/^\.\//, '');
      const relativo = path.posix.join(
        path.posix.dirname(archivo),
        rutaModulo.endsWith('.js') ? rutaModulo : `${rutaModulo}.js`,
      );
      if (fs.existsSync(path.join(RAIZ, relativo))) revisar(relativo);
    }
  }

  revisar('tools/lote.js', true);
  revisar('tools/formato607.js', true);
  exigirSinErrores(errores);
});

test('el código no configura un destinatario automático de contabilidad', () => {
  const errores = [];
  const archivos = [...archivosDentro('tools'), ...archivosDentro('assets')]
    .filter((archivo) => {
      const nombre = path.basename(archivo);
      return !nombre.endsWith('.prueba.js') && !nombre.startsWith('probar-');
    });

  for (const archivo of archivos) {
    const texto = leer(archivo);
    const correoContable = /[a-z0-9._%+-]*(?:contador|contab)[a-z0-9._%+-]*@[a-z0-9.-]+/gi;
    for (const coincidencia of texto.matchAll(correoContable)) {
      errores.push(`${ubicacion(archivo, texto, coincidencia.index)} contiene un correo de contabilidad`);
    }
    const variableContable = /\bMERCA_CONTADOR[A-Z0-9_]*\b/g;
    for (const coincidencia of texto.matchAll(variableContable)) {
      errores.push(`${ubicacion(archivo, texto, coincidencia.index)} contiene ${coincidencia[0]}`);
    }
  }

  for (const [clave, valor] of Object.entries(correo.BUZONES)) {
    if (/contab|contador/i.test(`${clave} ${valor}`)) {
      errores.push(`tools/correo.js:44 BUZONES contiene un destinatario de contabilidad en ${clave}`);
    }
  }
  exigirSinErrores(errores);
});

test('los informes salen a gerencia y facturación como mensajes separados', async () => {
  const anteriores = new Set(fs.readdirSync(CARPETA_CORREOS));
  await correo.avisarInternamente({
    buzon: 'gerencia',
    copia: 'facturacion',
    asunto: 'prueba',
    texto: 'x',
  });

  const nuevos = fs.readdirSync(CARPETA_CORREOS)
    .filter((archivo) => !anteriores.has(archivo) && archivo.endsWith('.txt'));
  assert.equal(nuevos.length, 2,
    `tools/correo.js:470 debe crear dos correos separados (rompe ${REGLAS})`);
  const mensajes = nuevos.map((archivo) => fs.readFileSync(path.join(CARPETA_CORREOS, archivo), 'utf8'));
  const destinos = mensajes.map((mensaje) => /^Para: (.+)$/m.exec(mensaje)?.[1]).sort();
  assert.deepEqual(destinos, [
    'facturacion@mercamaquinarias.com',
    'gerencia@inversionesxzt.com',
  ], `tools/correo.js:470 debe enviar a los dos buzones autorizados (rompe ${REGLAS})`);
  for (const mensaje of mensajes) {
    assert.doesNotMatch(mensaje, /^Cc:/mi,
      `tools/correo.js:470 no puede usar Cc (rompe ${REGLAS})`);
    assert.doesNotMatch(mensaje, /^Para: .*[,;]/m,
      `tools/correo.js:470 no puede juntar destinatarios en Para (rompe ${REGLAS})`);
  }

  const archivo = 'tools/tareas.js';
  const texto = leer(archivo);
  const envios = [...texto.matchAll(/correo\.avisarInternamente\s*\(\s*\{[\s\S]*?\n\s*\}\s*\)/g)];
  const envio = envios.find(({ 0: llamada }) => (
    /buzon:\s*'gerencia'/.test(llamada) && /copia:\s*'facturacion'/.test(llamada)
  ));
  assert.ok(envio,
    `${archivo}:1 el envío de informes debe usar gerencia y copia a facturación (rompe ${REGLAS})`);
});

test('scripts, correos, asistente y factura no publican teléfonos dominicanos', () => {
  const archivos = [
    ...fs.readdirSync(path.join(RAIZ, 'assets'))
      .filter((archivo) => archivo.endsWith('.js'))
      .sort()
      .map((archivo) => `assets/${archivo}`),
    'tools/correo.js',
    'tools/chat.js',
    'tools/plantilla-factura.html',
  ];
  const errores = [];

  for (const archivo of archivos) {
    const texto = leer(archivo);
    // Es deliberadamente la misma expresión de tools/reglas.prueba.js: ambas
    // barreras deben reconocer exactamente el mismo formato dominicano.
    const telefono = /(?<!\d)(?:\+?1[ .-]?)?\(?((?:809|829|849))\)?[ .-]?(\d{3})[ .-]?(\d{4})(?!\d)/g;
    for (const coincidencia of texto.matchAll(telefono)) {
      if (`${coincidencia[2]}${coincidencia[3]}` !== '0000000') {
        errores.push(`${ubicacion(archivo, texto, coincidencia.index)} contiene un número dominicano real`);
      }
    }
  }
  exigirSinErrores(errores);
});
