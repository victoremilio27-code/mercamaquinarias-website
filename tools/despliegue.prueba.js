/**
 * Pruebas estáticas de los archivos que se copian al VPS.
 *
 * No se cargan las tareas ni se invocan systemd o nginx: hacerlo abriría la
 * base o haría que estas comprobaciones dependieran de programas del servidor.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');

const RAIZ = path.resolve(__dirname, '..');
const CARPETA_DESPLIEGUE = path.join(RAIZ, 'deploy');
const VARIABLES_RUTAS = ['MERCA_DB', 'MERCA_FOTOS', 'MERCA_VIDEOS', 'MERCA_FACTURAS', 'MERCA_DOCUMENTOS'];

function archivosDe(carpeta) {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const completo = path.join(carpeta, entrada.name);
    return entrada.isDirectory() ? archivosDe(completo) : [completo];
  });
}

function relativo(archivo) {
  return path.relative(RAIZ, archivo).replaceAll(path.sep, '/');
}

function leer(archivo) {
  return fs.readFileSync(archivo, 'utf8');
}

function numeroDeLinea(texto, patron) {
  const indice = texto.search(patron);
  return indice < 0 ? 1 : texto.slice(0, indice).split(/\r?\n/).length;
}

function ubicacion(archivo, texto, patron) {
  return `${relativo(archivo)}:${numeroDeLinea(texto, patron)}`;
}

function tareasDeclaradas() {
  const archivo = path.join(RAIZ, 'tools', 'tareas.js');
  const texto = leer(archivo);
  const inicio = texto.indexOf('const TAREAS = {');
  assert.notEqual(inicio, -1, `${relativo(archivo)}:1: falta la declaración const TAREAS = {`);
  const fin = texto.indexOf('\n};', inicio);
  assert.notEqual(fin, -1, `${ubicacion(archivo, texto, /const TAREAS = \{/)}: no termina el objeto TAREAS`);

  const claves = new Set();
  for (const linea of texto.slice(inicio, fin).split(/\r?\n/).slice(1)) {
    const coincidencia = /^\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_$][\w$-]*))\s*(?::|,)/.exec(linea);
    if (coincidencia) claves.add(coincidencia[1] || coincidencia[2] || coincidencia[3]);
  }
  return claves;
}

const archivosDespliegue = archivosDe(CARPETA_DESPLIEGUE);
const servicios = archivosDespliegue.filter((archivo) => archivo.endsWith('.service'));
const temporizadores = archivosDespliegue.filter((archivo) => archivo.endsWith('.timer'));
const tareas = tareasDeclaradas();

test('las unidades service apuntan a programas y tareas existentes', () => {
  for (const archivo of servicios) {
    const texto = leer(archivo);
    const inicio = /^ExecStart=\/usr\/bin\/node tools\/([^\s]+)(?:[ \t]+([^\s#]+))?$/m.exec(texto);
    assert.ok(inicio, `${relativo(archivo)}:1: falta un ExecStart de Node con la forma esperada`);
    const linea = numeroDeLinea(texto, /^ExecStart=/m);
    const programa = path.join(RAIZ, 'tools', inicio[1]);
    assert.ok(fs.existsSync(programa), `${relativo(archivo)}:${linea}: no existe tools/${inicio[1]}`);
    if (inicio[2] && inicio[2] !== '%i') {
      assert.ok(tareas.has(inicio[2]), `${relativo(archivo)}:${linea}: TAREAS no acepta ${inicio[2]}`);
    }
    assert.match(texto, /^WorkingDirectory=\/var\/www\/mercamaquinarias$/m,
      `${relativo(archivo)}:${numeroDeLinea(texto, /^WorkingDirectory=/m)}: WorkingDirectory no es el de producción`);
    assert.match(texto, /^EnvironmentFile=\/etc\/mercamaquinarias\.env$/m,
      `${relativo(archivo)}:${numeroDeLinea(texto, /^EnvironmentFile=/m)}: falta el archivo de entorno`);
  }
});

test('las variables de rutas coinciden entre unidades', () => {
  const valores = new Map();
  for (const archivo of servicios) {
    const texto = leer(archivo);
    for (const nombre of VARIABLES_RUTAS) {
      const coincidencia = new RegExp(`^Environment=${nombre}=(.+)$`, 'm').exec(texto);
      if (!coincidencia) continue;
      const donde = `${relativo(archivo)}:${numeroDeLinea(texto, new RegExp(`^Environment=${nombre}=`, 'm'))}`;
      if (!valores.has(nombre)) valores.set(nombre, { valor: coincidencia[1], donde });
      else assert.equal(coincidencia[1], valores.get(nombre).valor,
        `${donde}: ${nombre} difiere de ${valores.get(nombre).donde}`);
    }
  }
});

test('la tanda diaria recibe todas las carpetas de medios del servicio web', () => {
  const web = servicios.find((archivo) => path.basename(archivo) === 'mercamaquinarias.service');
  const tanda = servicios.find((archivo) => path.basename(archivo) === 'mercamaquinarias-tareas.service');
  assert.ok(web, 'deploy/mercamaquinarias.service:1: falta la unidad del sitio');
  assert.ok(tanda, 'deploy/mercamaquinarias-tareas.service:1: falta la unidad de la tanda diaria');
  const textoWeb = leer(web);
  const textoTanda = leer(tanda);
  for (const nombre of ['MERCA_FOTOS', 'MERCA_VIDEOS', 'MERCA_DOCUMENTOS']) {
    if (!new RegExp(`^Environment=${nombre}=`, 'm').test(textoWeb)) continue;
    assert.match(textoTanda, new RegExp(`^Environment=${nombre}=`, 'm'),
      `${relativo(tanda)}:1: falta ${nombre}, presente en ${relativo(web)}`);
  }
});

test('la plantilla de informes pasa la instancia a tareas.js', () => {
  const archivo = servicios.find((actual) => path.basename(actual) === 'mercamaquinarias-informes@.service');
  assert.ok(archivo, 'deploy/mercamaquinarias-informes@.service:1: falta la plantilla de informes');
  const texto = leer(archivo);
  assert.match(texto, /^ExecStart=\/usr\/bin\/node tools\/tareas\.js %i$/m,
    `${relativo(archivo)}:${numeroDeLinea(texto, /^ExecStart=/m)}: ExecStart no usa %i`);
});

test('cada temporizador tiene una unidad válida', () => {
  for (const archivo of temporizadores) {
    const texto = leer(archivo);
    const unidad = /^Unit=(\S+)$/m.exec(texto);
    if (unidad) {
      const instancia = /^mercamaquinarias-informes@(.+)\.service$/.exec(unidad[1]);
      if (instancia) {
        // tareas.js rechaza cualquier argumento que no sea una clave de TAREAS;
        // por eso esa lista, leída sin require, es el contrato de las instancias.
        assert.ok(tareas.has(instancia[1]),
          `${relativo(archivo)}:${numeroDeLinea(texto, /^Unit=/m)}: TAREAS no acepta ${instancia[1]}`);
      } else {
        assert.ok(servicios.some((servicio) => path.basename(servicio) === unidad[1]),
          `${relativo(archivo)}:${numeroDeLinea(texto, /^Unit=/m)}: no existe ${unidad[1]}`);
      }
      continue;
    }
    const esperado = `${path.basename(archivo, '.timer')}.service`;
    assert.ok(servicios.some((servicio) => path.basename(servicio) === esperado),
      `${relativo(archivo)}:1: no declara Unit y falta ${esperado}`);
  }
});

test('los rangos de confianza de Cloudflare son CIDR IPv4 e IPv6 válidos', () => {
  const archivo = path.join(CARPETA_DESPLIEGUE, 'nginx-cloudflare.conf');
  const texto = leer(archivo);
  assert.match(texto, /^real_ip_header CF-Connecting-IP;$/m,
    `${relativo(archivo)}:${numeroDeLinea(texto, /^real_ip_header/m)}: falta real_ip_header CF-Connecting-IP`);
  const rangos = [...texto.matchAll(/^set_real_ip_from\s+([^;]+);$/gm)];
  const familias = new Set();
  for (const rango of rangos) {
    const [direccion, prefijoTexto, sobra] = rango[1].split('/');
    const familia = net.isIP(direccion);
    const prefijo = Number(prefijoTexto);
    const linea = numeroDeLinea(texto, new RegExp(`^set_real_ip_from\\s+${rango[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')};`, 'm'));
    assert.ok(!sobra && familia, `${relativo(archivo)}:${linea}: ${rango[1]} no contiene una IP válida`);
    assert.ok(Number.isInteger(prefijo) && prefijo >= 0 && prefijo <= (familia === 4 ? 32 : 128),
      `${relativo(archivo)}:${linea}: el prefijo de ${rango[1]} está fuera de rango`);
    familias.add(familia);
  }
  assert.ok(familias.has(4), `${relativo(archivo)}:1: falta al menos un rango IPv4`);
  assert.ok(familias.has(6), `${relativo(archivo)}:1: falta al menos un rango IPv6`);
});

test('nginx incluye Cloudflare y declara el dominio vigente', () => {
  const archivo = path.join(CARPETA_DESPLIEGUE, 'nginx.conf');
  const texto = leer(archivo);
  assert.match(texto, /^\s*include \/etc\/nginx\/snippets\/cloudflare\.conf;$/m,
    `${relativo(archivo)}:${numeroDeLinea(texto, /include .*cloudflare\.conf/)}: falta el snippet de Cloudflare`);
  assert.match(texto, /^\s*server_name\s+[^;]*\bmercamaquinarias\.com\b[^;]*;$/m,
    `${relativo(archivo)}:${numeroDeLinea(texto, /^\s*server_name/m)}: falta mercamaquinarias.com en server_name`);
});

/* El video (PR #9) se fusionó el 18-09 y nginx se quedó en 12M, con un
   comentario que mandaba subirlo «el día que se fusione»: un video de más
   de unos 9 MB llegaba en base64 por encima del límite y nginx lo cortaba
   con un 413 en HTML. El tope se lee del texto de tools/videos.js para no
   cargar el módulo (abre carpetas). */
test('nginx admite el video más grande que acepta el servidor', () => {
  const archivo = path.join(CARPETA_DESPLIEGUE, 'nginx.conf');
  const texto = leer(archivo);
  const limite = texto.match(/^\s*client_max_body_size\s+(\d+)M;$/m);
  assert.ok(limite, `${relativo(archivo)}: falta client_max_body_size en megas`);
  const tope = leer(path.join(RAIZ, 'tools', 'videos.js')).match(/const TOPE_BYTES = (\d+) \* 1024 \* 1024;/);
  assert.ok(tope, 'tools/videos.js: no se encuentra TOPE_BYTES');
  const MB = 1024 * 1024;
  // base64 crece un tercio, y el JSON de alrededor pide algo de margen.
  const necesario = Math.ceil((Number(tope[1]) * MB * 4) / 3) + MB;
  assert.ok(Number(limite[1]) * MB >= necesario,
    `${relativo(archivo)}:${numeroDeLinea(texto, /client_max_body_size/)}: ${limite[1]}M no deja pasar un video de ${tope[1]} MB `
    + `en base64 (hacen falta ${Math.ceil(necesario / MB)} MB)`);
});

/* Era un «todo» mientras vivía la redirección del dominio viejo; #193 borró
   ese .conf, así que ahora la comprobación es de verdad. */
test('ningún bloque server nombra un dominio ajeno', () => {
  for (const archivo of archivosDespliegue.filter((actual) => actual.endsWith('.conf'))) {
    const texto = leer(archivo);
    for (const bloque of texto.matchAll(/\bserver\s*\{[\s\S]*?\n\}/g)) {
      for (const declaracion of bloque[0].matchAll(/^\s*server_name\s+([^;]+);$/gm)) {
        const linea = texto.slice(0, bloque.index + declaracion.index).split(/\r?\n/).length;
        for (const dominio of declaracion[1].trim().split(/\s+/)) {
          assert.ok(dominio === 'mercamaquinarias.com' || dominio === 'www.mercamaquinarias.com',
            `${relativo(archivo)}:${linea}: server_name conserva el dominio ajeno ${dominio}`);
        }
      }
    }
  }
});

function patronDeAtributos(patron) {
  const escapar = (valor) => valor.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const expresion = escapar(patron).replaceAll('**', '\0').replaceAll('*', '[^/]*').replaceAll('\0', '.*');
  return new RegExp(`^${patron.includes('/') ? expresion : `(?:.*/)?${expresion}`}$`);
}

test('los archivos de deploy declarados LF no contienen retornos de carro', () => {
  const atributos = leer(path.join(RAIZ, '.gitattributes')).split(/\r?\n/)
    .map((linea) => linea.trim())
    .filter((linea) => linea && !linea.startsWith('#') && /(?:^|\s)eol=lf(?:\s|$)/.test(linea))
    .map((linea) => patronDeAtributos(linea.split(/\s+/)[0]));
  for (const archivo of archivosDespliegue) {
    const nombre = relativo(archivo);
    if (!atributos.some((patron) => patron.test(nombre))) continue;
    const contenido = fs.readFileSync(archivo);
    const retorno = contenido.indexOf(13);
    const linea = retorno < 0 ? 1 : contenido.subarray(0, retorno).filter((byte) => byte === 10).length + 1;
    assert.equal(retorno, -1, `${nombre}:${linea}: contiene un retorno de carro pese a eol=lf`);
  }
});
