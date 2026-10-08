'use strict';

const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const { performance } = require('node:perf_hooks');

function salir(mensaje) {
  console.error(`Error: ${mensaje}`);
  process.exit(2);
}

function argumentos(argv) {
  const opciones = {
    base: 'http://127.0.0.1:8080',
    concurrencia: 20,
    segundos: 30,
    pid: null,
    siProduccion: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const argumento = argv[i];
    if (argumento === '--si-produccion') {
      opciones.siProduccion = true;
      continue;
    }
    const nombres = {
      '--base': 'base',
      '--concurrencia': 'concurrencia',
      '--segundos': 'segundos',
      '--pid': 'pid',
    };
    const nombre = nombres[argumento];
    if (!nombre || argv[i + 1] === undefined) salir(`argumento desconocido o incompleto: ${argumento}`);
    opciones[nombre] = argv[i + 1];
    i += 1;
  }

  let base;
  try {
    base = new URL(opciones.base);
  } catch {
    salir(`la base no es una URL válida: ${opciones.base}`);
  }
  if (!['http:', 'https:'].includes(base.protocol)) salir('la base debe usar http o https');
  if (base.username || base.password || base.search || base.hash) salir('la base no puede llevar credenciales, consulta ni fragmento');

  const entero = (nombre, minimo) => {
    const valor = Number(opciones[nombre]);
    if (!Number.isSafeInteger(valor) || valor < minimo) salir(`--${nombre} debe ser un entero de al menos ${minimo}`);
    return valor;
  };
  opciones.concurrencia = entero('concurrencia', 1);
  opciones.segundos = entero('segundos', 1);
  if (opciones.pid !== null) opciones.pid = entero('pid', 1);

  const local = base.hostname === '127.0.0.1' || base.hostname === 'localhost';
  if (!local && !opciones.siProduccion) {
    salir('se negó la prueba contra una dirección no local; use --si-produccion si es deliberado');
  }
  if (!local) {
    /* En producción Cloudflare, el límite de frecuencia y los clientes
       reales comparten capacidad con esta prueba. Estos topes evitan que
       una medición manual se convierta en una denegación de servicio. */
    opciones.concurrencia = Math.min(opciones.concurrencia, 5);
    opciones.segundos = Math.min(opciones.segundos, 20);
    console.warn('AVISO: prueba contra producción limitada a 5 conexiones y 20 segundos.');
  }
  base.pathname = base.pathname.replace(/\/$/, '') || '/';
  opciones.base = base;
  return opciones;
}

function crearCliente(base) {
  const transporte = base.protocol === 'https:' ? https : http;
  const agente = new transporte.Agent({ keepAlive: true });

  const pedir = (ruta) => new Promise((resolve, reject) => {
    const inicio = performance.now();
    const destino = new URL(ruta.replace(/^\//, ''), base.href.endsWith('/') ? base : `${base.href}/`);
    const peticion = transporte.get(destino, {
      agent: agente,
      headers: { accept: 'application/json, text/html;q=0.9, */*;q=0.8' },
    }, (respuesta) => {
      const partes = [];
      respuesta.on('data', (parte) => partes.push(parte));
      respuesta.on('end', () => resolve({
        estado: respuesta.statusCode || 0,
        milisegundos: performance.now() - inicio,
        cuerpo: Buffer.concat(partes).toString('utf8'),
      }));
    });
    peticion.on('error', (error) => reject(Object.assign(error, {
      milisegundos: performance.now() - inicio,
    })));
  });

  return { pedir, cerrar: () => agente.destroy() };
}

function valorId(valor) {
  if (typeof valor === 'string') return valor;
  return valor && (valor.id || valor.slug || valor.categoria);
}

function primeraFoto(anuncios) {
  for (const anuncio of anuncios) {
    const candidatas = [anuncio.foto, anuncio.imagen, ...(Array.isArray(anuncio.fotos) ? anuncio.fotos : [])];
    for (const candidata of candidatas) {
      const ruta = typeof candidata === 'string' ? candidata : candidata && (candidata.url || candidata.completa);
      if (typeof ruta === 'string' && ruta.startsWith('/fotos/')) return ruta;
    }
  }
  return null;
}

async function preparar(pedir) {
  const [taxonomia, catalogo] = await Promise.all([pedir('/api/taxonomia'), pedir('/api/anuncios')]);
  if (taxonomia.estado < 200 || taxonomia.estado >= 300) salir(`/api/taxonomia respondió ${taxonomia.estado}`);
  if (catalogo.estado < 200 || catalogo.estado >= 300) salir(`/api/anuncios respondió ${catalogo.estado}`);
  let datosTaxonomia;
  let datosCatalogo;
  try {
    datosTaxonomia = JSON.parse(taxonomia.cuerpo);
    datosCatalogo = JSON.parse(catalogo.cuerpo);
  } catch {
    salir('la taxonomía o el catálogo no devolvieron JSON válido');
  }
  const categorias = (datosTaxonomia.categorias || []).map(valorId).filter(Boolean);
  const anuncios = Array.isArray(datosCatalogo.anuncios) ? datosCatalogo.anuncios : [];
  const ids = anuncios.map((anuncio) => anuncio.id).filter(Boolean);
  const foto = primeraFoto(anuncios);

  const tipos = [
    { nombre: 'portada HTML', peso: 15, ruta: () => '/' },
    { nombre: 'catálogo HTML', peso: 15, ruta: () => '/equipos.html' },
    { nombre: 'catálogo sin filtros', peso: 20, ruta: () => '/api/anuncios' },
    {
      nombre: 'catálogo filtrado', peso: 15,
      ruta: () => `/api/anuncios?categoria=${encodeURIComponent(categorias[Math.floor(Math.random() * categorias.length)])}&orden=precio-asc`,
      disponible: categorias.length > 0,
    },
    {
      nombre: 'ficha de anuncio', peso: 15,
      ruta: () => `/api/anuncios/${encodeURIComponent(ids[Math.floor(Math.random() * ids.length)])}`,
      disponible: ids.length > 0,
    },
    { nombre: 'datos de portada', peso: 10, ruta: () => '/api/portada' },
    { nombre: 'foto', peso: 10, ruta: () => foto, disponible: !!foto },
  ].filter((tipo) => tipo.disponible !== false);
  return tipos;
}

function escoger(tipos) {
  const total = tipos.reduce((suma, tipo) => suma + tipo.peso, 0);
  let punto = Math.random() * total;
  for (const tipo of tipos) {
    punto -= tipo.peso;
    if (punto < 0) return tipo;
  }
  return tipos[tipos.length - 1];
}

function nuevoResultado(nombre) {
  return { nombre, latencias: [], dosxx: 0, tresxx: 0, noModificado: 0, limitadas: 0, fallos: 0 };
}

function registrar(resultado, estado, milisegundos) {
  resultado.latencias.push(milisegundos);
  if (estado >= 200 && estado < 300) resultado.dosxx += 1;
  else if (estado === 304) resultado.noModificado += 1;
  else if (estado === 429) resultado.limitadas += 1;
  else if (estado >= 300 && estado < 400) resultado.tresxx += 1;
  else if (estado >= 500 || estado === 0) resultado.fallos += 1;
}

function percentil(ordenadas, porcentaje) {
  if (!ordenadas.length) return 0;
  return ordenadas[Math.max(0, Math.ceil(ordenadas.length * porcentaje) - 1)];
}

function fila(resultado, segundos) {
  const ordenadas = [...resultado.latencias].sort((a, b) => a - b);
  const numero = ordenadas.length;
  const ms = (valor) => valor.toFixed(1).padStart(8);
  return `${resultado.nombre.padEnd(23)} ${String(numero).padStart(7)} ${(numero / segundos).toFixed(1).padStart(7)} ${ms(percentil(ordenadas, 0.50))} ${ms(percentil(ordenadas, 0.95))} ${ms(percentil(ordenadas, 0.99))} ${ms(ordenadas.at(-1) || 0)} ${String(resultado.dosxx).padStart(6)} ${String(resultado.tresxx).padStart(6)} ${String(resultado.noModificado).padStart(6)} ${String(resultado.limitadas).padStart(6)} ${String(resultado.fallos).padStart(8)}`;
}

function leerRss(pid) {
  try {
    const coincidencia = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+)\s+kB$/m);
    return coincidencia ? Number(coincidencia[1]) : null;
  } catch {
    return null;
  }
}

async function principal() {
  const opciones = argumentos(process.argv.slice(2));
  const cliente = crearCliente(opciones.base);
  const tipos = await preparar(cliente.pedir);
  const resultados = new Map(tipos.map((tipo) => [tipo.nombre, nuevoResultado(tipo.nombre)]));
  let rssMaximo = null;
  let intervaloRss;
  if (opciones.pid) {
    const mostrarRss = () => {
      const rss = leerRss(opciones.pid);
      if (rss === null) console.warn(`RSS: no se pudo leer /proc/${opciones.pid}/status`);
      else {
        rssMaximo = Math.max(rssMaximo || 0, rss);
        console.log(`RSS del proceso ${opciones.pid}: ${(rss / 1024).toFixed(1)} MiB`);
      }
    };
    mostrarRss();
    intervaloRss = setInterval(mostrarRss, 5000);
  }

  console.log(`Carga: ${opciones.base.href} · concurrencia ${opciones.concurrencia} · ${opciones.segundos} s`);
  const inicio = performance.now();
  const limite = inicio + opciones.segundos * 1000;
  const trabajador = async () => {
    while (performance.now() < limite) {
      const tipo = escoger(tipos);
      const resultado = resultados.get(tipo.nombre);
      try {
        const respuesta = await cliente.pedir(tipo.ruta());
        registrar(resultado, respuesta.estado, respuesta.milisegundos);
      } catch (error) {
        registrar(resultado, 0, error.milisegundos || 0);
      }
    }
  };
  await Promise.all(Array.from({ length: opciones.concurrencia }, trabajador));
  const segundosReales = (performance.now() - inicio) / 1000;
  if (intervaloRss) clearInterval(intervaloRss);
  if (opciones.pid) {
    const ultimoRss = leerRss(opciones.pid);
    if (ultimoRss !== null) rssMaximo = Math.max(rssMaximo || 0, ultimoRss);
  }
  cliente.cerrar();

  const total = nuevoResultado('TOTAL');
  for (const resultado of resultados.values()) {
    total.latencias.push(...resultado.latencias);
    total.dosxx += resultado.dosxx;
    total.tresxx += resultado.tresxx;
    total.noModificado += resultado.noModificado;
    total.limitadas += resultado.limitadas;
    total.fallos += resultado.fallos;
  }
  console.log('\nTipo                    Número     /s      p50      p95      p99      máx    2xx    3xx    304    429  5xx/red');
  for (const resultado of resultados.values()) console.log(fila(resultado, segundosReales));
  console.log(fila(total, segundosReales));
  if (opciones.pid) {
    console.log(rssMaximo === null ? 'RSS máximo: no disponible' : `RSS máximo: ${(rssMaximo / 1024).toFixed(1)} MiB`);
  }
  process.exitCode = total.fallos > 0 ? 1 : 0;
}

principal().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
});
