/**
 * probar-pagina-dealer.js — la página propia del dealer, de punta a
 * punta.
 *
 *   node tools/probar-pagina-dealer.js
 *
 * QUÉ SE COMPRUEBA
 *
 * Sobre todo las REGLAS, porque son la parte que se puede romper sin
 * que nadie lo note: el día que alguien cambie el conteo de anuncios y
 * empiece a contar los pausados, la página seguirá publicándose y
 * nadie verá un error. Lo que fallará es que un dealer presuma de
 * cinco equipos y enseñe dos.
 *
 * Y que el borrador NO se vea desde fuera, que es lo que separa
 * «estoy armando mi página» de «mi página está publicada».
 *
 * Corre contra una base TEMPORAL que se borra en cada ejecución.
 */

const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const BANCO = path.join(__dirname, '..', '.tmp', 'prueba-pagina-dealer');
fs.rmSync(BANCO, { recursive: true, force: true });
fs.mkdirSync(BANCO, { recursive: true });
process.env.MERCA_DB = path.join(BANCO, 'prueba.db');
process.env.MERCA_CORREO = 'archivo';
process.env.MERCA_SECRETO = 'secreto-de-prueba-no-usar-en-produccion';

const db = require('./db.js');
const api = require('./api.js');
const legales = require('../assets/legales.js');

let bien = 0;
let mal = 0;
function comprobar(condicion, que) {
  if (condicion) { bien++; console.log(`  ok  ${que}`); return; }
  mal++;
  console.log(`  MAL ${que}`);
}

function pedir({ metodo = 'GET', url, cuerpo, cabeceras = {} }) {
  return new Promise((resolver) => {
    const req = new EventEmitter();
    req.method = metodo;
    req.url = url;
    req.headers = { 'user-agent': 'prueba-pagina', 'cf-connecting-ip': '201.1.1.1', ...cabeceras };
    req.socket = { remoteAddress: '127.0.0.1' };
    req.destroy = () => {};

    const res = {
      codigo: 0,
      setHeader() {},
      writeHead(c) { res.codigo = c; return res; },
      destroy() {},
      end(d) {
        let datos = null;
        try { datos = d ? JSON.parse(d) : null; } catch { datos = null; }
        resolver({ codigo: res.codigo, datos });
      },
    };

    api.manejar(req, res, new URL(url, 'http://localhost').pathname);
    setImmediate(() => {
      if (cuerpo !== undefined) req.emit('data', Buffer.from(JSON.stringify(cuerpo), 'utf8'));
      req.emit('end');
    });
  });
}

/* Deja al usuario con todo lo legal aceptado: lo que se prueba aquí es
   la página, no el muro de condiciones. */
function aceptarTodo(idUsuario) {
  legales.DOCUMENTOS.forEach((doc) => db.registrarAceptacion({
    usuarioId: idUsuario,
    documento: doc.id,
    version: doc.version,
    ip: '127.0.0.1',
    userAgent: 'prueba',
  }));
}

const regla = (datos, cual) => (datos.reglas || []).find((r) => r.id === cual) || {};

/* Publica N equipos activos para esa organización. */
function publicarEquipos(idOrg, idUsuario, cuantos) {
  const susc = db.suscripcionActiva(idOrg);
  for (let i = 0; i < cuantos; i++) {
    db.crearAnuncio({
      idOrg,
      usuarioId: idUsuario,
      idSuscripcion: susc && susc.id,
      categoria: 'camiones',
      subcategoria: 'cam-volteo',
      marca: 'peterbilt',
      modelo: `56${i}`,
      anio: 2018 + (i % 5),
      condicion: 'usado',
      usoValor: 100000 + i,
      usoUnidad: 'km',
      descripcion: `Camion de volteo numero ${i + 1} para la prueba de la pagina.`,
      provincia: 'santo-domingo',
      precio: 1000000 + i,
      moneda: 'DOP',
      vence: db.sumarDias(30),
      fotos: ['/fotos/2026-09/a.jpg', '/fotos/2026-09/b.jpg', '/fotos/2026-09/c.jpg'],
      telefonos: [{ numero: '(809) 555-1234', tipo: 'ambos' }],
    });
  }
}

(async () => {
  console.log('\nMercaMaquinarias · la pagina propia del dealer\n');

  /* ── Un particular no tiene página de empresa ────────────── */
  console.log('Quien no es dealer');
  const particular = db.crearCuenta({
    correo: 'particular@ejemplo.test',
    clave: 'UnaClaveLargaYSegura9',
    nombre: 'Particular',
    telefono: '8095550001',
    tipo: 'particular',
  });
  aceptarTodo(particular.idUsuario);
  const sesionParticular = { cookie: `te_sesion=${db.abrirSesion(particular.idUsuario)}` };

  const sinPagina = await pedir({ url: '/api/mi-pagina', cabeceras: sesionParticular });
  comprobar(sinPagina.codigo === 404, 'un particular no tiene pagina de empresa (404)');

  const sinSesion = await pedir({ url: '/api/mi-pagina' });
  comprobar(sinSesion.codigo === 401, 'y sin sesion tampoco se entra');

  /* ── Un dealer recién registrado ─────────────────────────── */
  console.log('\nUn dealer recien registrado');
  const dealer = db.crearCuenta({
    correo: 'dealer@ejemplo.test',
    clave: 'UnaClaveLargaYSegura9',
    nombre: 'Encargado del dealer',
    telefono: '8095550002',
    tipo: 'dealer',
    empresa: 'Maquinarias de Prueba, S.R.L.',
    rnc: '131111111',
    direccion: 'Calle Principal No. 10',
    provincia: 'santo-domingo',
    /* Sin esto no se crea la solicitud y el dealer se queda pendiente
       para siempre, sin nada que el administrador pueda aprobar. */
    solicitud: { encargado: 'Encargado del dealer', aniosOperando: 5 },
  });
  aceptarTodo(dealer.idUsuario);
  const org = db.organizacionDe(dealer.idUsuario);
  const sesionDealer = { cookie: `te_sesion=${db.abrirSesion(dealer.idUsuario)}` };

  let estado = (await pedir({ url: '/api/mi-pagina', cabeceras: sesionDealer })).datos;
  comprobar(!!estado && estado.reglas.length === 6, 'se devuelven las seis reglas, cumplidas o no');
  comprobar(regla(estado, 'aprobada').cumple === false, 'todavia no esta aprobado');
  comprobar(estado.puedeCrear === false, 'y por tanto no puede crear la pagina');
  comprobar(!!regla(estado, 'aprobada').falta, 'la regla explica QUE falta, no solo que falta');

  /* ── Aprobado, pero sin plan ─────────────────────────────── */
  console.log('\nAprobado, pero sin plan');
  const solicitud = db.abrir()
    .prepare("SELECT * FROM solicitudes_dealer WHERE organizacion_id = ? AND estado = 'pendiente'")
    .get(org.id);
  const admin = db.crearCuenta({
    correo: 'admin@ejemplo.test',
    clave: 'UnaClaveLargaYSegura9',
    nombre: 'Administrador',
    telefono: '8095550003',
    tipo: 'particular',
  });
  db.marcarAdmin('admin@ejemplo.test', true);
  db.resolverSolicitud(solicitud.id, { aprobar: true, idRevisor: admin.idUsuario });

  estado = (await pedir({ url: '/api/mi-pagina', cabeceras: sesionDealer })).datos;
  comprobar(regla(estado, 'aprobada').cumple === true, 'ya consta aprobado');
  comprobar(regla(estado, 'plan').cumple === false, 'pero no tiene plan con pagina');
  comprobar(estado.puedeCrear === false, 'asi que sigue sin poder crearla');

  /* ── Con plan, pero con cuatro equipos ───────────────────── */
  console.log('\nCon plan, pero con cuatro equipos');
  const compra = await pedir({
    metodo: 'POST',
    url: '/api/membresias',
    cuerpo: { plan: 'premium', cupo: 8, dias: 30 },
    cabeceras: sesionDealer,
  });
  comprobar(compra.codigo === 201, `contrata el nivel con pagina propia (fue ${compra.codigo})`);

  publicarEquipos(org.id, dealer.idUsuario, 4);
  estado = (await pedir({ url: '/api/mi-pagina', cabeceras: sesionDealer })).datos;
  comprobar(regla(estado, 'plan').cumple === true, 'el plan ya cuenta');
  comprobar(regla(estado, 'anuncios').cumple === false, 'con CUATRO equipos la regla no se cumple');
  comprobar(regla(estado, 'anuncios').detalle === '4 de 5', 'y dice cuantos lleva: 4 de 5');
  comprobar(estado.puedeCrear === false, 'no puede crear la pagina todavia');

  /* ── El quinto equipo ────────────────────────────────────── */
  console.log('\nEl quinto equipo');
  publicarEquipos(org.id, dealer.idUsuario, 1);
  estado = (await pedir({ url: '/api/mi-pagina', cabeceras: sesionDealer })).datos;
  comprobar(regla(estado, 'anuncios').cumple === true, 'con CINCO ya se cumple');
  comprobar(estado.puedeCrear === true, 'y ya puede crear su pagina');

  /* Pausar uno no la quita, pero deja de contar para crear. */
  const suyos = db.anunciosDeOrganizacion(org.id);
  db.cambiarEstadoAnuncio(suyos[0].id, org.id, 'pausado');
  estado = (await pedir({ url: '/api/mi-pagina', cabeceras: sesionDealer })).datos;
  comprobar(regla(estado, 'anuncios').detalle === '4 de 5',
    'un equipo PAUSADO no cuenta: ocupa cupo pero no se ve');
  db.cambiarEstadoAnuncio(suyos[0].id, org.id, 'activo');

  /* ── Publicar: lo obligatorio y lo opcional ──────────────── */
  console.log('\nQue hace falta para publicarla');
  estado = (await pedir({ url: '/api/mi-pagina', cabeceras: sesionDealer })).datos;
  comprobar(regla(estado, 'nombre').cumple === true, 'el nombre ya lo tiene desde el alta');
  comprobar(regla(estado, 'descripcion').cumple === false, 'la descripcion no');
  comprobar(regla(estado, 'contacto').cumple === false, 'ni el contacto publico');
  comprobar(estado.puedePublicar === false, 'asi que no puede publicar');

  const prematura = await pedir({
    metodo: 'POST', url: '/api/mi-pagina/publicar', cabeceras: sesionDealer,
  });
  comprobar(prematura.codigo === 400, 'publicar sin cumplir devuelve error');
  comprobar((prematura.datos.pendientes || []).length === 2,
    `y dice exactamente que falta (${(prematura.datos.pendientes || []).map((p) => p.id).join(', ')})`);

  /* Una descripción corta no vale: el mínimo está para que la página
     diga algo, no para rellenar el campo. */
  const corta = await pedir({
    metodo: 'PATCH', url: '/api/mi-pagina',
    cuerpo: { descripcion: 'Vendemos equipos.' },
    cabeceras: sesionDealer,
  });
  comprobar(regla(corta.datos, 'descripcion').cumple === false,
    'una descripcion de tres palabras no cumple');

  const patch = await pedir({
    metodo: 'PATCH', url: '/api/mi-pagina',
    cuerpo: {
      descripcion: 'Distribuidor de maquinaria pesada con taller propio y repuestos en '
        + 'inventario. Equipo revisado por nuestros tecnicos y garantia escrita.',
      lema: 'Equipo revisado, garantia escrita',
      correoPublico: 'ventas@maquinariasdeprueba.test',
      telefonoPublico: '8095550099',
    },
    cabeceras: sesionDealer,
  });
  comprobar(patch.codigo === 200 && patch.datos.puedePublicar === true,
    'con descripcion y contacto ya puede publicar');

  /* ── El borrador no se ve desde fuera ────────────────────── */
  console.log('\nEl borrador no lo ve nadie');
  const antesDePublicar = await pedir({ url: `/api/dealers/${org.slug}` });
  comprobar(antesDePublicar.codigo === 404,
    'la pagina en borrador NO responde en la ruta publica');

  const directorioAntes = await pedir({ url: '/api/dealers' });
  comprobar(!(directorioAntes.datos.dealers || []).some((d) => d.slug === org.slug),
    'ni sale en el directorio');

  const publicada = await pedir({
    metodo: 'POST', url: '/api/mi-pagina/publicar', cabeceras: sesionDealer,
  });
  comprobar(publicada.codigo === 200, 'se publica');

  const despues = await pedir({ url: `/api/dealers/${org.slug}` });
  comprobar(despues.codigo === 200, 'y ahora si responde');
  comprobar(despues.datos.dealer.lema === 'Equipo revisado, garantia escrita',
    'con su lema');
  comprobar(despues.datos.dealer.correo === 'ventas@maquinariasdeprueba.test',
    'y el correo PUBLICO, no el de la cuenta');
  comprobar(despues.datos.dealer.correo !== 'dealer@ejemplo.test',
    'el de acceso no se publica');
  comprobar((despues.datos.anuncios || []).length === 5, 'y sus cinco equipos');

  /* ── Imágenes: solo las del sitio ────────────────────────── */
  console.log('\nEl logotipo y la portada');
  const ajena = await pedir({
    metodo: 'PATCH', url: '/api/mi-pagina',
    cuerpo: { logo: 'https://otro-sitio.example/logo.png' },
    cabeceras: sesionDealer,
  });
  comprobar(ajena.codigo === 400, 'un logotipo alojado fuera se rechaza');

  const incrustada = await pedir({
    metodo: 'PATCH', url: '/api/mi-pagina',
    cuerpo: { banner: 'data:image/png;base64,iVBORw0KGgo=' },
    cabeceras: sesionDealer,
  });
  comprobar(incrustada.codigo === 400, 'y una imagen incrustada en la peticion tambien');

  /* ── Los bloques de la página ────────────────────────────── */
  console.log('\nLos bloques que el dealer arma');
  const b1 = await pedir({
    metodo: 'POST', url: '/api/mi-pagina/secciones',
    cuerpo: { tipo: 'texto', titulo: 'Quienes somos', cuerpo: { texto: 'Taller propio desde 2015.' } },
    cabeceras: sesionDealer,
  });
  const b2 = await pedir({
    metodo: 'POST', url: '/api/mi-pagina/secciones',
    cuerpo: { tipo: 'marcas', titulo: 'Marcas que representamos', cuerpo: { lista: ['Caterpillar', 'JCB'] } },
    cabeceras: sesionDealer,
  });
  const b3 = await pedir({
    metodo: 'POST', url: '/api/mi-pagina/secciones',
    cuerpo: { tipo: 'inventario', titulo: 'Nuestros equipos' },
    cabeceras: sesionDealer,
  });
  comprobar(b1.codigo === 201 && b2.codigo === 201 && b3.codigo === 201, 'se crean tres bloques');
  comprobar(b3.datos.secciones.length === 3, 'y la pagina los tiene los tres');

  const inventado = await pedir({
    metodo: 'POST', url: '/api/mi-pagina/secciones',
    cuerpo: { tipo: 'loquesea' },
    cabeceras: sesionDealer,
  });
  comprobar(inventado.codigo === 400, 'un tipo de bloque inventado se rechaza');

  const ordenado = await pedir({
    metodo: 'PATCH', url: '/api/mi-pagina/secciones/orden',
    cuerpo: { ids: [b3.datos.id, b1.datos.id, b2.datos.id] },
    cabeceras: sesionDealer,
  });
  comprobar(ordenado.codigo === 200 && ordenado.datos.secciones[0].id === b3.datos.id,
    'se reordenan y el inventario queda primero');

  const oculto = await pedir({
    metodo: 'PATCH', url: `/api/mi-pagina/secciones/${b2.datos.id}`,
    cuerpo: { visible: false },
    cabeceras: sesionDealer,
  });
  comprobar(oculto.codigo === 200, 'un bloque se puede ocultar sin borrarlo');

  const publicaConBloques = await pedir({ url: `/api/dealers/${org.slug}` });
  comprobar((publicaConBloques.datos.secciones || []).length === 2,
    'la pagina publica enseña 2 de los 3: el oculto no sale');

  const borrado = await pedir({
    metodo: 'DELETE', url: `/api/mi-pagina/secciones/${b2.datos.id}`,
    cabeceras: sesionDealer,
  });
  comprobar(borrado.codigo === 200 && borrado.datos.secciones.length === 2, 'y se puede borrar');

  /* ── Enlaces ─────────────────────────────────────────────── */
  console.log('\nLas redes');
  const malEnlace = await pedir({
    metodo: 'PUT', url: '/api/mi-pagina/enlaces',
    cuerpo: { enlaces: [{ tipo: 'instagram', valor: 'maquinariasdeprueba' }] },
    cabeceras: sesionDealer,
  });
  comprobar(malEnlace.codigo === 400, 'un enlace sin http:// se rechaza: roto es peor que ausente');

  const buenEnlace = await pedir({
    metodo: 'PUT', url: '/api/mi-pagina/enlaces',
    cuerpo: {
      enlaces: [
        { tipo: 'instagram', valor: 'https://instagram.com/maquinariasdeprueba' },
        { tipo: 'whatsapp', valor: '8095550099' },
      ],
    },
    cabeceras: sesionDealer,
  });
  comprobar(buenEnlace.codigo === 200 && buenEnlace.datos.enlaces.length === 2, 'dos enlaces buenos entran');

  /* ── Otro dealer no puede tocar esta página ──────────────── */
  console.log('\nLa pagina de otro');
  const ajeno = db.crearCuenta({
    correo: 'otro@ejemplo.test',
    clave: 'UnaClaveLargaYSegura9',
    nombre: 'Otro dealer',
    telefono: '8095550004',
    tipo: 'dealer',
    empresa: 'Otra Empresa, S.R.L.',
    rnc: '131222222',
    direccion: 'Otra Calle No. 20',
    provincia: 'santiago',
  });
  aceptarTodo(ajeno.idUsuario);
  const sesionAjena = { cookie: `te_sesion=${db.abrirSesion(ajeno.idUsuario)}` };

  const suPropia = await pedir({ url: '/api/mi-pagina', cabeceras: sesionAjena });
  comprobar(suPropia.codigo === 200 && suPropia.datos.pagina.id !== org.id,
    'cada dealer ve la suya, no la del vecino');

  const intento = await pedir({
    metodo: 'DELETE', url: `/api/mi-pagina/secciones/${b1.datos.id}`,
    cabeceras: sesionAjena,
  });
  comprobar(intento.codigo === 404, 'y no puede borrar un bloque ajeno');

  /* ── El personal, en nombre del dealer (fase 7, ADMIN-04) ─ */
  /* Soporte arregla la página por el dealer: con las mismas reglas que
     él, cada escritura en la bitácora, y sin tocar si está publicada o
     en borrador, que es decisión de la empresa. */
  console.log('\nEdicion en nombre del dealer');
  const sesionAdmin = { cookie: `te_sesion=${db.abrirSesion(admin.idUsuario)}`, 'cf-connecting-ip': '201.9.9.9' };
  const base = `/api/admin/organizaciones/${org.id}/pagina`;
  const filasPagina = () => db.abrir()
    .prepare("SELECT COUNT(*) AS n FROM bitacora_admin WHERE accion = 'pagina.editar'").get().n;
  const ultimaFila = () => db.bitacora({ organizacion: org.id, limite: 1 })[0];

  let r = await pedir({ url: base, cabeceras: sesionAdmin });
  comprobar(r.codigo === 200 && r.datos.organizacion.id === org.id && r.datos.pagina.id === org.id
    && (r.datos.reglas || []).length === 6, 'el personal abre la pagina del dealer, con sus seis reglas');
  comprobar(!JSON.stringify(r.datos).includes('131111111'), 'sin el RNC de la empresa');

  let n = filasPagina();
  const descSoporte = 'Distribuidor de maquinaria pesada con taller propio en Santo Domingo. '
    + 'Repuestos originales, garantia escrita y entrega en todo el pais.';
  r = await pedir({ metodo: 'PATCH', url: base, cabeceras: sesionAdmin,
    cuerpo: { descripcion: descSoporte, motivo: 'Correo del dealer: corregir la descripcion' } });
  comprobar(r.codigo === 200 && filasPagina() === n + 1, 'editar la descripcion responde 200 y deja una fila');
  const fila = ultimaFila();
  comprobar(fila.accion === 'pagina.editar' && fila.admin_id === admin.idUsuario && fila.ip === '201.9.9.9'
    && fila.motivo === 'Correo del dealer: corregir la descripcion', 'con quien, desde donde y el motivo');
  comprobar(/^Distribuidor de maquinaria pesada con taller propio y/.test(fila.antes.descripcion || '')
    && fila.despues.descripcion === descSoporte, 'y la descripcion antes y despues');

  const vista = (await pedir({ url: '/api/mi-pagina', cabeceras: sesionDealer })).datos;
  comprobar(vista.pagina.descripcion === descSoporte, 'el dealer ve el cambio en su propio editor');
  comprobar(vista.pagina.estado_pagina === 'publicada', 'su pagina sigue publicada');
  comprobar(!!vista.editadaPorSoporte, 'y el editor sabe que la toco el personal');
  comprobar(!JSON.stringify(vista).includes('admin@ejemplo.test'), 'sin decirle quien de dentro');
  const enVivo = await pedir({ url: `/api/dealers/${org.slug}` });
  comprobar(enVivo.datos.dealer.descripcion === descSoporte, 'publicada: el arreglo se ve al momento');

  n = filasPagina();
  r = await pedir({ metodo: 'PATCH', url: base, cuerpo: { web: 'sin-protocolo.com' }, cabeceras: sesionAdmin });
  comprobar(r.codigo === 400 && filasPagina() === n, 'la misma validacion que el dealer: web mala, 400 y sin fila');
  r = await pedir({ metodo: 'PATCH', url: base, cuerpo: { logo: 'https://otro-sitio.example/logo.png' }, cabeceras: sesionAdmin });
  comprobar(r.codigo === 400 && filasPagina() === n, 'y un logotipo de fuera, 400 y sin fila');
  r = await pedir({ metodo: 'PATCH', url: `${base}/secciones/no-existe`, cuerpo: { titulo: 'x' }, cabeceras: sesionAdmin });
  comprobar(r.codigo === 404 && filasPagina() === n, 'un bloque que no existe: 404 y sin fila');

  r = await pedir({ metodo: 'POST', url: `${base}/secciones`, cabeceras: sesionAdmin,
    cuerpo: { tipo: 'texto', titulo: 'Horario', cuerpo: { texto: 'Lunes a viernes' } } });
  const idS = r.datos && r.datos.id;
  comprobar(r.codigo === 201 && !!idS && filasPagina() === n + 1, 'crea un bloque: 201 y una fila');
  const orden = r.datos.secciones.map((s) => s.id).reverse();
  r = await pedir({ metodo: 'PATCH', url: `${base}/secciones/orden`, cuerpo: { ids: orden }, cabeceras: sesionAdmin });
  comprobar(r.codigo === 200 && r.datos.secciones[0].id === orden[0] && filasPagina() === n + 2,
    'reordena dentro de la bitacora (SAVEPOINT, no BEGIN): 200 y una fila');
  r = await pedir({ metodo: 'PATCH', url: `${base}/secciones/${idS}`, cuerpo: { titulo: 'Horario de atencion' }, cabeceras: sesionAdmin });
  comprobar(r.codigo === 200 && filasPagina() === n + 3 && ultimaFila().despues.titulo === 'Horario de atencion',
    'edita el bloque y anota el titulo nuevo');
  r = await pedir({ metodo: 'DELETE', url: `${base}/secciones/${idS}`, cabeceras: sesionAdmin });
  comprobar(r.codigo === 200 && r.datos.secciones.length === 2 && filasPagina() === n + 4, 'y lo quita');

  r = await pedir({ metodo: 'POST', url: `${base}/galeria`, cuerpo: { url: '/fotos/2026-09/taller.jpg' }, cabeceras: sesionAdmin });
  const idFoto = r.datos && r.datos.galeria && r.datos.galeria[0] && r.datos.galeria[0].id;
  comprobar(r.codigo === 201 && !!idFoto && filasPagina() === n + 5, 'añade una foto a la galeria');
  r = await pedir({ metodo: 'DELETE', url: `${base}/galeria/${idFoto}`, cabeceras: sesionAdmin });
  comprobar(r.codigo === 200 && r.datos.galeria.length === 0 && filasPagina() === n + 6, 'y la quita');
  r = await pedir({ metodo: 'PUT', url: `${base}/enlaces`, cabeceras: sesionAdmin,
    cuerpo: { enlaces: [{ tipo: 'facebook', valor: 'https://facebook.com/maquinariasdeprueba' }] } });
  comprobar(r.codigo === 200 && r.datos.enlaces.length === 1 && filasPagina() === n + 7
    && ultimaFila().antes.enlaces.length === 2, 'guarda las redes, con las dos de antes en la fila');

  console.log('\nEl personal no publica ni despublica por el dealer');
  for (const accion of ['publicar', 'despublicar']) {
    r = await pedir({ metodo: 'POST', url: `${base}/${accion}`, cabeceras: sesionAdmin });
    comprobar(!(r.codigo >= 200 && r.codigo < 300), `POST .../pagina/${accion} no existe (fue ${r.codigo})`);
  }
  comprobar(db.paginaDe(org.id).estado_pagina === 'publicada', 'y la pagina sigue como estaba');

  await pedir({ metodo: 'POST', url: '/api/mi-pagina/despublicar', cabeceras: sesionDealer });
  r = await pedir({ metodo: 'PATCH', url: base, cuerpo: { lema: 'Taller propio desde 2015' }, cabeceras: sesionAdmin });
  const enBorrador = (await pedir({ url: '/api/mi-pagina', cabeceras: sesionDealer })).datos;
  comprobar(r.codigo === 200 && enBorrador.pagina.lema === 'Taller propio desde 2015'
    && enBorrador.pagina.estado_pagina === 'borrador', 'en borrador: el dealer ve el arreglo y sigue en borrador');
  comprobar((await pedir({ url: `/api/dealers/${org.slug}` })).codigo === 404, 'y fuera no se ve');
  r = await pedir({ metodo: 'POST', url: '/api/mi-pagina/publicar', cabeceras: sesionDealer });
  comprobar(r.codigo === 200, 'la vuelve a publicar el dealer, no el personal');

  console.log('\nQuien no es del personal');
  n = filasPagina();
  r = await pedir({ url: base, cabeceras: sesionParticular });
  comprobar(r.codigo === 404, 'un usuario normal no la abre (404)');
  r = await pedir({ metodo: 'PATCH', url: base, cuerpo: { lema: 'hackeado' }, cabeceras: sesionAjena });
  comprobar(r.codigo === 404 && filasPagina() === n, 'otro dealer no la edita (404) y no queda fila');
  r = await pedir({ metodo: 'PATCH', url: base, cuerpo: { lema: 'hackeado' } });
  comprobar((r.codigo === 401 || r.codigo === 404) && filasPagina() === n, 'sin sesion tampoco');
  const orgParticular = db.organizacionDe(particular.idUsuario);
  r = await pedir({ url: `/api/admin/organizaciones/${orgParticular.id}/pagina`, cabeceras: sesionAdmin });
  comprobar(r.codigo === 404, 'una cuenta particular no tiene pagina que editar (404)');
  r = await pedir({ metodo: 'PATCH', url: `/api/admin/organizaciones/${orgParticular.id}/pagina`,
    cuerpo: { lema: 'x' }, cabeceras: sesionAdmin });
  comprobar(r.codigo === 404 && filasPagina() === n, 'ni se escribe en ella, y sin fila');
  r = await pedir({ metodo: 'PATCH', url: '/api/admin/organizaciones/no-existe/pagina',
    cuerpo: { lema: 'x' }, cabeceras: sesionAdmin });
  comprobar(r.codigo === 404 && filasPagina() === n, 'una empresa inexistente: 404 y sin fila');
  comprobar(db.paginaDe(org.id).lema === 'Taller propio desde 2015', 'el lema no lo cambio nadie de fuera');

  /* ── Cuando vence el plan ────────────────────────────────── */
  console.log('\nCuando vence el plan');
  db.abrir().prepare("UPDATE suscripciones SET estado = 'vencida' WHERE organizacion_id = ?").run(org.id);

  const apagados = db.apagarPerfilesSinPlan();
  comprobar(apagados.apagados.includes(org.id), 'el perfil se apaga al quedarse sin plan');

  const yaNo = await pedir({ url: `/api/dealers/${org.slug}` });
  comprobar(yaNo.codigo === 404, 'y la pagina deja de verse');

  const borradorIntacto = db.paginaDe(org.id);
  comprobar(borradorIntacto.secciones.length === 2 && borradorIntacto.lema,
    'pero el borrador sigue entero, esperando a que renueve');

  console.log(`\n${bien} bien, ${mal} mal\n`);
  process.exit(mal ? 1 : 0);
})();
