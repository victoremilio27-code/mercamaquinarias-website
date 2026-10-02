/**
 * s3.js — cliente mínimo para almacenamiento compatible con S3. Sin dependencias.
 *
 * POR QUÉ NO EL SDK DE AWS
 *
 * Igual que el generador de `tools/pdf.js`, este cliente cubre una operación pequeña
 * sin añadir al VPS de 512 MB una cadena grande de paquetes que haya que instalar,
 * respaldar, actualizar y auditar. Node ya trae crypto, streams y HTTPS; aquí solo
 * hacen falta la firma AWS V4 y un PUT.
 */

const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');

const REGION_PREDETERMINADA = 'us-east-1';
const ESPERA_MS = 60_000;

function sha256(valor) {
  return crypto.createHash('sha256').update(valor).digest('hex');
}

function hmac(clave, valor) {
  return crypto.createHmac('sha256', clave).update(valor).digest();
}

/* encodeURIComponent deja cinco signos reservados sin escapar. SigV4 exige la
   variante RFC 3986 y, para S3, conserva únicamente las barras entre segmentos. */
function codificarSegmento(valor) {
  return encodeURIComponent(valor).replace(/[!'()*]/g, (signo) =>
    `%${signo.charCodeAt(0).toString(16).toUpperCase()}`);
}

function decodificarSegmento(segmento) {
  try {
    return decodeURIComponent(segmento);
  } catch {
    return segmento;
  }
}

function rutaCanonica(url) {
  return url.pathname.split('/')
    .map((segmento) => codificarSegmento(decodificarSegmento(segmento)))
    .join('/');
}

function consultaCanonica(url) {
  return [...url.searchParams.entries()]
    .map(([nombre, valor]) => [codificarSegmento(nombre), codificarSegmento(valor)])
    .sort(([nombreA, valorA], [nombreB, valorB]) => {
      if (nombreA !== nombreB) return nombreA < nombreB ? -1 : 1;
      if (valorA === valorB) return 0;
      return valorA < valorB ? -1 : 1;
    })
    .map(([nombre, valor]) => `${nombre}=${valor}`)
    .join('&');
}

function fechaAmazon(fecha) {
  return fecha.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function normalizarCabeceras(cabeceras) {
  const normalizadas = {};
  for (const [nombre, valor] of Object.entries(cabeceras || {})) {
    normalizadas[nombre.toLowerCase()] = String(valor).trim().replace(/\s+/g, ' ');
  }
  return normalizadas;
}

function firmar({
  metodo,
  url,
  cabeceras = {},
  cuerpoSha256,
  region,
  servicio = 's3',
  clave,
  secreto,
  fecha,
}) {
  const destino = url instanceof URL ? url : new URL(url);
  const momento = fechaAmazon(fecha);
  const dia = momento.slice(0, 8);
  const normalizadas = normalizarCabeceras(cabeceras);

  normalizadas.host = destino.host;
  normalizadas['x-amz-content-sha256'] = cuerpoSha256;
  normalizadas['x-amz-date'] = momento;

  const nombres = Object.keys(normalizadas).sort();
  const cabecerasCanonicas = nombres
    .map((nombre) => `${nombre}:${normalizadas[nombre]}\n`)
    .join('');
  const cabecerasFirmadas = nombres.join(';');
  const solicitudCanonica = [
    metodo.toUpperCase(),
    rutaCanonica(destino),
    consultaCanonica(destino),
    cabecerasCanonicas,
    cabecerasFirmadas,
    cuerpoSha256,
  ].join('\n');
  const alcance = `${dia}/${region}/${servicio}/aws4_request`;
  const cadenaParaFirmar = [
    'AWS4-HMAC-SHA256',
    momento,
    alcance,
    sha256(solicitudCanonica),
  ].join('\n');
  const claveDia = hmac(`AWS4${secreto}`, dia);
  const claveRegion = hmac(claveDia, region);
  const claveServicio = hmac(claveRegion, servicio);
  const claveFirma = hmac(claveServicio, 'aws4_request');
  const firma = crypto.createHmac('sha256', claveFirma).update(cadenaParaFirmar).digest('hex');

  return {
    ...normalizadas,
    Authorization: `AWS4-HMAC-SHA256 Credential=${clave}/${alcance},SignedHeaders=${cabecerasFirmadas},Signature=${firma}`,
  };
}

function hashDeArchivo(archivo) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const lectura = fs.createReadStream(archivo);
    lectura.on('data', (bloque) => hash.update(bloque));
    lectura.on('error', reject);
    lectura.on('end', () => resolve(hash.digest('hex')));
  });
}

function ocultarSecreto(error, secreto) {
  const mensaje = error instanceof Error ? error.message : String(error || 'Error desconocido');
  return secreto ? mensaje.split(secreto).join('[secreto oculto]') : mensaje;
}

async function subir({ endpoint, cubo, clave: claveObjeto, archivo, credenciales, region = REGION_PREDETERMINADA }) {
  const base = /^[a-z]+:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`;
  const destino = new URL(base);
  destino.pathname = `/${codificarSegmento(cubo)}/${String(claveObjeto).split('/').map(codificarSegmento).join('/')}`;

  try {
    const [estado, cuerpoSha256] = await Promise.all([
      fs.promises.stat(archivo),
      hashDeArchivo(archivo),
    ]);
    const cabeceras = firmar({
      metodo: 'PUT',
      url: destino,
      cabeceras: { 'content-length': estado.size },
      cuerpoSha256,
      region,
      clave: credenciales.clave,
      secreto: credenciales.secreto,
      fecha: new Date(),
    });
    const transporte = destino.protocol === 'http:' ? http : https;

    return await new Promise((resolve) => {
      const peticion = transporte.request(destino, { method: 'PUT', headers: cabeceras }, (respuesta) => {
        const bloques = [];
        respuesta.on('data', (bloque) => bloques.push(bloque));
        respuesta.on('end', () => {
          if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) {
            resolve({ ok: true, etag: respuesta.headers.etag });
            return;
          }
          const detalle = Buffer.concat(bloques).toString('utf8') || respuesta.statusMessage || 'Error de S3';
          resolve({
            ok: false,
            estado: respuesta.statusCode,
            error: ocultarSecreto(detalle, credenciales.secreto),
          });
        });
      });

      peticion.setTimeout(ESPERA_MS, () => peticion.destroy(new Error('Tiempo de espera agotado')));
      peticion.on('error', (error) => resolve({
        ok: false,
        estado: 0,
        error: ocultarSecreto(error, credenciales.secreto),
      }));
      fs.createReadStream(archivo).on('error', (error) => peticion.destroy(error)).pipe(peticion);
    });
  } catch (error) {
    return { ok: false, estado: 0, error: ocultarSecreto(error, credenciales.secreto) };
  }
}

function configurada(env = process.env) {
  return ['MERCA_S3_ENDPOINT', 'MERCA_S3_CUBO', 'MERCA_S3_CLAVE', 'MERCA_S3_SECRETO']
    .every((nombre) => !!env[nombre]);
}

module.exports = { firmar, subir, configurada };
