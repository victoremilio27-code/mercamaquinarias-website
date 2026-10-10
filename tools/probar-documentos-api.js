/**
 * Contrato HTTP de los documentos de anuncios (FICHA-01).
 * Usa el enrutador real con una base, un directorio y req/res temporales.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-documentos-api');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_DOCUMENTOS = path.join(BANCO, 'archivos');
process.env.MERCA_DOCUMENTOS_TOPE_MB = '100';
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

/* Las variables anteriores tienen que existir antes de estas cargas. */
const db = require('./db.js');
const api = require('./api.js');
const documentos = require('./documentos.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) {
    bien++;
    console.log(`  ok  ${que}`);
  } else {
    mal++;
    console.log(`  MAL ${que}`);
  }
}

function pedir({ metodo = 'GET', url, cuerpo, testigo }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = {
      'user-agent': 'prueba-documentos-api',
      'cf-connecting-ip': '203.0.113.8',
      ...(testigo ? { cookie: `te_sesion=${testigo}` } : {}),
    };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const trozos = [];
    const res = {
      codigo: 0,
      cabeceras: {},
      writeHead(codigo, cabeceras) {
        res.codigo = codigo;
        res.cabeceras = cabeceras || {};
        return res;
      },
      write(datos) { if (datos) trozos.push(Buffer.from(datos)); },
      end(datos) {
        if (datos) trozos.push(Buffer.from(datos));
        const bruto = Buffer.concat(trozos);
        const esJson = String(res.cabeceras['Content-Type'] || '').startsWith('application/json');
        resolver({
          codigo: res.codigo, cabeceras: res.cabeceras, bruto,
          datos: esJson && bruto.length ? JSON.parse(bruto.toString('utf8')) : null,
        });
      },
    };
    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => {
      if (cuerpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(cuerpo)));
      req.emit('end');
    });
  });
}

function crearUsuario(correo) {
  const { idUsuario } = db.crearCuenta({
    correo, clave: 'UnaClaveLargaYSegura9', nombre: 'Persona de prueba',
    telefono: '8095550000', tipo: 'particular',
  });
  db.marcarCorreoVerificado(idUsuario);
  return { id: idUsuario, org: db.organizacionDe(idUsuario), testigo: db.abrirSesion(idUsuario) };
}

function anuncioDe(usuario, estado = 'activo') {
  const id = db.crearBorrador({ idOrg: usuario.org.id, idUsuario: usuario.id, idPlan: 'destacado', dias: 30 });
  if (estado !== 'borrador') db.abrir().prepare('UPDATE anuncios SET estado = ? WHERE id = ?').run(estado, id);
  return id;
}

const dataUrl = (tipo, buffer) => `data:${tipo};base64,${buffer.toString('base64')}`;
const PDF = Buffer.from('%PDF-1.7\n%%EOF');
const PNG = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

async function probar() {
  console.log('\nDocumentos de anuncios por API');
  const ana = crearUsuario('ana-documentos-api@ejemplo.test');
  const bia = crearUsuario('bia-documentos-api@ejemplo.test');
  const anuncio = anuncioDe(ana);

  let r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, cuerpo: {
    nombre: 'Informe de inspección.pdf', archivo: dataUrl('application/pdf', PDF),
  } });
  comprobar(r.codigo === 401, 'subir sin sesión devuelve 401');

  r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: bia.testigo, cuerpo: {
    nombre: 'Ajeno.pdf', archivo: dataUrl('application/pdf', PDF),
  } });
  comprobar(r.codigo === 404 && r.datos.motivo === 'no-existe', 'subir a un anuncio ajeno devuelve 404');

  r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: ana.testigo, cuerpo: {
    nombre: 'engaño.pdf', archivo: dataUrl('application/pdf', Buffer.from('<html>no es pdf</html>')),
  } });
  comprobar(r.codigo === 415 && r.datos.motivo === 'tipo', 'rechaza HTML aunque se anuncie como PDF');

  for (const [nombre, jpeg] of [
    ['marcador nulo', Buffer.from([0xFF, 0xD8, 0xFF, 0x00])],
    ['longitud imposible', Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0xFF, 0xFF])],
  ]) {
    r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: ana.testigo, cuerpo: {
      nombre: `${nombre}.jpg`, archivo: dataUrl('image/jpeg', jpeg),
    } });
    comprobar(r.codigo === 415 && r.datos.error === 'El tipo de documento no está admitido',
      `JPEG con ${nombre} devuelve 415`);
  }

  r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: ana.testigo, cuerpo: {
    nombre: 'vacío.pdf', archivo: dataUrl('application/pdf', Buffer.alloc(0)),
  } });
  comprobar(r.codigo === 400 && r.datos.motivo === 'vacio', 'rechaza un archivo vacío con 400');

  const grande = Buffer.alloc(db.TOPES_DOCUMENTOS.bytesPorArchivo + 1);
  Buffer.from('%PDF-').copy(grande);
  r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: ana.testigo, cuerpo: {
    nombre: 'muy-grande.pdf', archivo: dataUrl('application/pdf', grande),
  } });
  comprobar(r.codigo === 413 && r.datos.motivo === 'tope-archivo', 'rechaza 4 MB más un byte');

  r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: ana.testigo, cuerpo: {
    nombre: 'Informe de inspección.pdf', archivo: dataUrl('text/plain', PDF),
  } });
  const idPdf = r.datos && r.datos.documento && r.datos.documento.id;
  comprobar(r.codigo === 201 && r.datos.documento.tipo === 'application/pdf', 'sube un PDF por su firma, no por la etiqueta');

  r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: ana.testigo, cuerpo: {
    nombre: 'Plano máquina.png', archivo: dataUrl('image/png', PNG),
  } });
  comprobar(r.codigo === 201 && r.datos.documento.tipo === 'image/png', 'sube una PNG real');

  for (let n = 3; n <= 4; n++) {
    await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: ana.testigo, cuerpo: {
      nombre: `Documento ${n}.pdf`, archivo: dataUrl('application/pdf', PDF),
    } });
  }
  r = await pedir({ metodo: 'POST', url: `/api/anuncios/${anuncio}/documentos`, testigo: ana.testigo, cuerpo: {
    nombre: 'Quinto.pdf', archivo: dataUrl('application/pdf', PDF),
  } });
  comprobar(r.codigo === 409 && r.datos.motivo === 'tope-cantidad', 'el quinto documento devuelve 409');

  r = await pedir({ url: `/api/anuncios/${anuncio}/documentos` });
  comprobar(r.codigo === 200 && r.datos.documentos.length === 4
    && r.datos.topes.porAnuncio === db.TOPES_DOCUMENTOS.porAnuncio,
  'lista sin sesión un anuncio activo y devuelve los topes');

  const borrador = anuncioDe(ana, 'borrador');
  r = await pedir({ url: `/api/anuncios/${borrador}/documentos`, testigo: bia.testigo });
  comprobar(r.codigo === 404, 'un borrador ajeno no se puede listar');

  r = await pedir({ url: `/api/anuncios/${anuncio}/documentos/${idPdf}` });
  comprobar(r.codigo === 200 && r.bruto.equals(PDF)
    && r.cabeceras['Content-Type'] === 'application/pdf'
    && r.cabeceras['X-Content-Type-Options'] === 'nosniff'
    && r.cabeceras['Content-Disposition'] === "inline; filename*=UTF-8''Informe%20de%20inspecci%C3%B3n.pdf"
    && r.cabeceras['Cache-Control'] === 'private, max-age=300',
  'descarga los bytes con las cuatro cabeceras exactas');

  const rutaPdf = db.documentoParaDescargar(anuncio, idPdf).ruta;
  r = await pedir({ metodo: 'DELETE', url: `/api/anuncios/${anuncio}/documentos/${idPdf}`, testigo: ana.testigo });
  comprobar(r.codigo === 200 && r.datos.ok && documentos.archivoDe(rutaPdf) === null,
    'borrar quita la fila y el archivo del disco');

  const paraBorrar = anuncioDe(ana);
  r = await pedir({ metodo: 'POST', url: `/api/anuncios/${paraBorrar}/documentos`, testigo: ana.testigo, cuerpo: {
    nombre: 'Se va con el anuncio.pdf', archivo: dataUrl('application/pdf', PDF),
  } });
  const idParaBorrar = r.datos.documento.id;
  const rutaParaBorrar = db.documentoParaDescargar(paraBorrar, idParaBorrar).ruta;
  r = await pedir({ metodo: 'DELETE', url: `/api/anuncios/${paraBorrar}`, testigo: ana.testigo });
  comprobar(r.codigo === 200 && documentos.archivoDe(rutaParaBorrar) === null,
    'borrar el anuncio borra también sus documentos');

  /* SEG-PERMISOS-02: un anuncio pausado, retirado, vendido o vencido se
     veía entero por su enlace, con teléfonos y documentos. Ahora, como un
     borrador, no existe para nadie más que su dueño. */
  console.log('\nUn anuncio no activo solo existe para su dueño');
  for (const estado of ['pausado', 'retirado', 'vendido', 'vencido']) {
    const id = anuncioDe(ana, estado);
    await pedir({ metodo: 'POST', url: `/api/anuncios/${id}/documentos`, testigo: ana.testigo, cuerpo: {
      nombre: 'Historial.pdf', archivo: dataUrl('application/pdf', PDF),
    } });
    const visitante = await pedir({ url: `/api/anuncios/${id}` });
    const otra = await pedir({ url: `/api/anuncios/${id}`, testigo: bia.testigo });
    const duena = await pedir({ url: `/api/anuncios/${id}`, testigo: ana.testigo });
    comprobar(visitante.codigo === 404 && otra.codigo === 404 && duena.codigo === 200,
      `${estado}: visitante ${visitante.codigo}, otra cuenta ${otra.codigo}, dueña ${duena.codigo}`);
    const docsVisitante = await pedir({ url: `/api/anuncios/${id}/documentos` });
    const docsDuena = await pedir({ url: `/api/anuncios/${id}/documentos`, testigo: ana.testigo });
    comprobar(docsVisitante.codigo === 404 && docsDuena.codigo === 200 && docsDuena.datos.documentos.length === 1,
      `${estado}: sus documentos tampoco (visitante ${docsVisitante.codigo}, dueña ${docsDuena.codigo})`);
  }

  console.log(`\n${bien} comprobaciones bien; ${mal} mal.`);
  if (mal) process.exitCode = 1;
}

probar().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
