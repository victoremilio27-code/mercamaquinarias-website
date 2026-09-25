/* Auditoría de autorización: qué puede tocar una cuenta de lo que
   pertenece a otra. Se prueba contra la API directamente, saltándose
   las pantallas, porque un atacante también se las salta. */

const http = require('http');

const BASE = { host: '127.0.0.1', port: 8080 };
const fallos = [];

function pedir(ruta, { metodo = 'GET', cuerpo, cookie } = {}) {
  return new Promise((resolver) => {
    const datos = cuerpo ? JSON.stringify(cuerpo) : null;
    const req = http.request({
      ...BASE, path: `/api${ruta}`, method: metodo,
      headers: {
        ...(datos ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(datos) } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
      },
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(b); } catch { /* respuesta no JSON */ }
        const set = res.headers['set-cookie'];
        resolver({
          estado: res.statusCode,
          json,
          cookie: set ? set.map((c) => c.split(';')[0]).join('; ') : null,
        });
      });
    });
    req.on('error', () => resolver({ estado: 0, json: null }));
    if (datos) req.write(datos);
    req.end();
  });
}

const comprobar = (titulo, condicion, detalle) => {
  if (condicion) { console.log(`  ✓ ${titulo}`); return; }
  console.log(`  ✗ ${titulo} — ${detalle}`);
  fallos.push(`${titulo}: ${detalle}`);
};

/* Entra con una cuenta ya verificada de la demostración.
   Solo funciona con MERCA_CORREO=archivo, porque lee el código del
   buzón en disco. Contra un entorno con correo real no hay forma —ni
   debe haberla— de leer el código de nadie. */
async function entrar(correo, clave) {
  const r1 = await pedir('/cuenta/entrar', { metodo: 'POST', cuerpo: { correo, clave } });
  if (r1.json && r1.json.usuario) return r1.cookie;

  if (r1.estado === 429) {
    console.log(`\n  El límite de intentos frenó el acceso de ${correo}.`);
    console.log('  Es el comportamiento correcto, pero impide auditar. Reinícielo con:');
    console.log('    node -e "require(\'./tools/db\').abrir().prepare(\'DELETE FROM intentos\').run()"\n');
    return null;
  }

  const fs = require('fs');
  const dir = '.tmp/correos';
  const arch = fs.existsSync(dir)
    // Solo .txt: el buzón guarda también el .html de cada correo.
    && fs.readdirSync(dir)
      .filter((f) => f.endsWith('.txt') && f.includes(correo.split('@')[0])).sort().pop();
  if (!arch) {
    console.log(`\n  No hay código en ${dir} para ${correo}.`);
    console.log('  Esta auditoría necesita MERCA_CORREO=archivo.\n');
    return null;
  }

  const codigo = /Código: (\d+)/.exec(fs.readFileSync(`${dir}/${arch}`, 'utf8'))[1];
  const r2 = await pedir('/cuenta/verificar', {
    metodo: 'POST', cuerpo: { correo, tipo: 'acceso', codigo }, cookie: r1.cookie,
  });
  return r2.cookie || r1.cookie;
}

(async () => {
  console.log('\n═══ Autorización entre cuentas ═══\n');

  const caribe = await entrar('caribe@demo.mercamaquinarias.do', 'demostracion2026');
  const cibao = await entrar('cibao@demo.mercamaquinarias.do', 'demostracion2026');

  if (!caribe || !cibao) {
    console.log('No se pudo abrir sesión con las cuentas de demostración.');
    process.exit(1);
  }

  const misCaribe = await pedir('/mis-anuncios', { cookie: caribe });
  const misCibao = await pedir('/mis-anuncios', { cookie: cibao });
  const anuncioCaribe = misCaribe.json.anuncios[0];
  const anuncioCibao = misCibao.json.anuncios[0];

  console.log(`  Caribe tiene ${misCaribe.json.anuncios.length} anuncios · Cibao ${misCibao.json.anuncios.length}\n`);

  // 1. Ver anuncios ajenos en el listado propio
  const idsCaribe = new Set(misCaribe.json.anuncios.map((a) => a.id));
  comprobar('mis-anuncios no filtra anuncios de otra empresa',
    !misCibao.json.anuncios.some((a) => idsCaribe.has(a.id)),
    'aparecen anuncios de Caribe en el listado de Cibao');

  /* 2. Cambiar el estado de un anuncio ajeno.
     El estado tiene que ser uno VÁLIDO: con uno inventado salta antes
     la validación del cuerpo y la prueba no llega a tocar el control
     de propiedad, que es lo que se quiere comprobar. */
  for (const estado of ['pausado', 'retirado', 'vendido']) {
    const r = await pedir(`/anuncios/${anuncioCaribe.id}`, {
      metodo: 'PATCH', cuerpo: { estado }, cookie: cibao,
    });
    comprobar(`PATCH "${estado}" sobre anuncio ajeno rechazado`,
      r.estado === 403 || r.estado === 404,
      `devolvió ${r.estado} ${JSON.stringify(r.json)}`);
  }
  const sigueIgual = await pedir('/mis-anuncios', { cookie: caribe });
  comprobar('el anuncio ajeno quedó intacto',
    sigueIgual.json.anuncios.find((a) => a.id === anuncioCaribe.id).estado === anuncioCaribe.estado,
    'el estado del anuncio cambió pese al rechazo');

  // 3. Editar una sucursal ajena
  const sucCaribe = await pedir('/sucursales', { cookie: caribe });
  const idSuc = sucCaribe.json.sucursales && sucCaribe.json.sucursales[0] && sucCaribe.json.sucursales[0].id;
  if (idSuc) {
    const r2 = await pedir(`/sucursales/${idSuc}`, {
      metodo: 'PATCH', cuerpo: { nombre: 'Secuestrada', provincia: 'Azua', direccion: 'Calle falsa 123', telefono: '8090000000' }, cookie: cibao,
    });
    comprobar('PATCH sobre sucursal ajena rechazado',
      r2.estado === 403 || r2.estado === 404,
      `devolvió ${r2.estado} ${JSON.stringify(r2.json)}`);

    const r3 = await pedir(`/sucursales/${idSuc}`, { metodo: 'DELETE', cookie: cibao });
    comprobar('DELETE sobre sucursal ajena rechazado',
      r3.estado === 403 || r3.estado === 404,
      `devolvió ${r3.estado} ${JSON.stringify(r3.json)}`);
  }

  // 4. Rutas de administración desde una cuenta normal
  const r4 = await pedir('/admin/solicitudes', { cookie: cibao });
  comprobar('cola de revisión oculta a cuenta sin permiso',
    r4.estado === 404, `devolvió ${r4.estado}`);

  const r5 = await pedir('/admin/solicitudes/cualquiera', {
    metodo: 'POST', cuerpo: { decision: 'aprobar' }, cookie: cibao,
  });
  comprobar('aprobar solicitudes bloqueado sin permiso',
    r5.estado === 404, `devolvió ${r5.estado}`);

  /* La bitácora y la bandeja de solicitudes de servicio: 404, no 403,
     como el resto de la consola. La bitácora lleva la IP y el correo del
     personal, y la bandeja el teléfono de quien pidió cotización. */
  const rBit = await pedir('/admin/bitacora', { cookie: cibao });
  comprobar('bitácora de administración oculta a cuenta sin permiso',
    rBit.estado === 404, `devolvió ${rBit.estado}`);

  const rBan = await pedir('/admin/solicitudes-servicio', { cookie: cibao });
  comprobar('bandeja de solicitudes de servicio oculta a cuenta sin permiso',
    rBan.estado === 404, `devolvió ${rBan.estado}`);

  const rMar = await pedir('/admin/solicitudes-servicio/cualquiera', {
    metodo: 'PATCH', cuerpo: { estado: 'cerrada' }, cookie: cibao,
  });
  comprobar('marcar solicitudes de servicio bloqueado sin permiso',
    rMar.estado === 404, `devolvió ${rMar.estado}`);

  const rVer = await pedir('/admin/organizaciones/cualquiera/verificar', {
    metodo: 'POST', cuerpo: { verificada: true }, cookie: cibao,
  });
  comprobar('dar el sello de verificada bloqueado sin permiso',
    rVer.estado === 404, `devolvió ${rVer.estado}`);

  // 5. Sin sesión ninguna
  for (const [ruta, metodo] of [['/mis-anuncios', 'GET'], ['/sucursales', 'GET'], ['/admin/solicitudes', 'GET'], ['/admin/bitacora', 'GET']]) {
    const rr = await pedir(ruta, { metodo });
    comprobar(`${metodo} ${ruta} sin sesión rechazado`,
      rr.estado === 401 || rr.estado === 404, `devolvió ${rr.estado}`);
  }

  // 6. Testigo de sesión inventado
  const r6 = await pedir('/mis-anuncios', { cookie: 'te_sesion=' + 'a'.repeat(64) });
  comprobar('testigo de sesión falso rechazado', r6.estado === 401, `devolvió ${r6.estado}`);

  // 7. Escalada: ¿puede una cuenta concederse es_admin por la API?
  const r7 = await pedir('/dealer/registro', {
    metodo: 'POST',
    cuerpo: { rnc: '131000001', empresa: 'X SRL', encargado: 'Y', es_admin: 1, esAdmin: true },
    cookie: cibao,
  });
  const sesionTras = await pedir('/sesion', { cookie: cibao });
  comprobar('no se puede concederse administrador por la API',
    !(sesionTras.json && sesionTras.json.usuario && sesionTras.json.usuario.esAdmin),
    'la cuenta acabó con esAdmin = true');

  // 8. El RNC no viaja a quien no debe
  const pub = await pedir('/dealers');
  comprobar('el directorio público no expone el RNC',
    !JSON.stringify(pub.json).includes('"rnc"'), 'aparece rnc en /api/dealers');

  const perfil = await pedir('/dealers/maquinarias-del-caribe');
  comprobar('el perfil público no expone el RNC',
    !JSON.stringify(perfil.json).includes('"rnc"'), 'aparece rnc en el perfil');

  const ses = await pedir('/sesion', { cookie: caribe });
  comprobar('la sesión solo lleva el RNC enmascarado',
    !/"rnc":/.test(JSON.stringify(ses.json)), 'la sesión lleva el RNC completo');

  /* 9. Archivos que no deben servirse nunca.
     El servidor llegó a publicar el proyecto entero: /.env con la
     clave de Brevo, /db/mercamaquinarias.db con los hashes y los RNC, y
     /.git con el repositorio. Se comprueba en cada auditoría porque
     basta con añadir una ruta a la lista blanca de serve.js sin
     pensarla para volver a abrir el agujero. */
  console.log('');
  const privados = [
    '/.env', '/.env.example', '/.git/config', '/.gitignore',
    '/db/mercamaquinarias.db', '/db/schema.sql',
    '/package.json', '/package-lock.json',
    '/tools/db.js', '/tools/serve.js', '/tools/api.js', '/tools/correo.js',
    '/deploy/README.md', '/node_modules/puppeteer/package.json',
  ];
  const filtrados = [];
  for (const ruta of privados) {
    const estado = await new Promise((res) => {
      http.get({ ...BASE, path: ruta }, (r) => { r.resume(); res(r.statusCode); })
        .on('error', () => res(0));
    });
    if (estado === 200) filtrados.push(ruta);
  }
  comprobar(`${privados.length} archivos internos fuera del alcance público`,
    filtrados.length === 0, `SE SIRVEN: ${filtrados.join(', ')}`);

  // Y que lo público siga siéndolo
  const publicos = ['/', '/index.html', '/equipos.html', '/styles.css', '/assets/app.js'];
  const rotos = [];
  for (const ruta of publicos) {
    const estado = await new Promise((res) => {
      http.get({ ...BASE, path: ruta }, (r) => { r.resume(); res(r.statusCode); })
        .on('error', () => res(0));
    });
    if (estado !== 200) rotos.push(`${ruta} (${estado})`);
  }
  comprobar('las páginas y recursos públicos siguen sirviéndose',
    rotos.length === 0, `no responden: ${rotos.join(', ')}`);

  // 10. Cabeceras de seguridad
  const cabeceras = await new Promise((res) => {
    http.get({ ...BASE, path: '/' }, (r) => res(r.headers));
  });
  const faltan = ['x-content-type-options', 'x-frame-options', 'content-security-policy', 'referrer-policy']
    .filter((h) => !cabeceras[h]);
  comprobar('cabeceras de seguridad presentes', faltan.length === 0, `faltan: ${faltan.join(', ')}`);

  // 11. Cookie de sesión
  const login = await pedir('/cuenta/entrar', {
    metodo: 'POST', cuerpo: { correo: 'caribe@demo.mercamaquinarias.do', clave: 'demostracion2026' },
  });
  console.log(`\n  cookie emitida: ${login.cookie || '(ninguna en este paso)'}`);

  console.log(`\n══ ${fallos.length} fallo(s) de autorización ══`);
  fallos.forEach((f) => console.log(`  · ${f}`));
})();
