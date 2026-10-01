/**
 * admin.js — permisos internos y alta de cuentas del equipo.
 *
 *   node tools/admin.js listar
 *   node tools/admin.js conceder  <correo>     permiso de revisión
 *   node tools/admin.js retirar   <correo>
 *   node tools/admin.js eximir    <correo>     publica sin pagar
 *   node tools/admin.js cobrar    <correo>     le quita la exención
 *   node tools/admin.js crear     <correo> "<Nombre>" [--admin] [--exenta] [--empresa "Razón social" --rnc 123456789] [--verificar-por <correo-admin>]
 *
 * Deliberadamente fuera del sitio: no hay pantalla, ruta ni formulario
 * que otorgue estos permisos. Se dan desde el servidor, por alguien
 * que ya tiene acceso a él. Así, comprometer una cuenta del sitio
 * nunca alcanza para volverse administrador ni para dejar de pagar.
 *
 * Las cuentas creadas aquí nacen con el correo YA VERIFICADO: quien
 * las crea tiene acceso al servidor, no hace falta demostrar que
 * controla el buzón.
 */

require('./entorno');

const crypto = require('crypto');
const db = require('./db');

const args = process.argv.slice(2);
const accion = args[0];
const opcion = (nombre) => {
  const i = args.indexOf(`--${nombre}`);
  return i >= 0 ? (args[i + 1] || true) : null;
};
const bandera = (nombre) => args.includes(`--${nombre}`);

function uso(mensaje) {
  if (mensaje) console.error(`\n${mensaje}`);
  console.error(`
Uso:
  node tools/admin.js listar
  node tools/admin.js conceder <correo>          permiso para revisar solicitudes
  node tools/admin.js retirar  <correo>
  node tools/admin.js eximir   <correo>          publica sin pagar
  node tools/admin.js cobrar   <correo>
  node tools/admin.js rnc      <correo> <numero>  fija o corrige el RNC
  node tools/admin.js crear    <correo> "<Nombre>" [opciones]

Opciones de crear:
  --admin                  con permiso de revisión
  --exenta                 publica sin pagar
  --empresa "Razón social" cuenta de empresa en vez de particular
  --rnc 123456789          RNC, obligatorio con --empresa
  --verificar-por <correo> da el sello en nombre de ese administrador
  --telefono 8095551234
  --clave "..."            si no se indica, se genera una segura
`);
  process.exit(mensaje ? 1 : 0);
}

/* Contraseña legible pero fuerte: cuatro bloques separados por
   guiones. Se dicta por teléfono sin equivocarse y no cae en las
   listas de contraseñas comunes que rechaza el registro. */
function claveSegura() {
  const alfabeto = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bloque = () => Array.from(
    crypto.randomBytes(4),
    (b) => alfabeto[b % alfabeto.length],
  ).join('');
  return [bloque(), bloque(), bloque(), bloque()].join('-');
}

const d = db.abrir();

/* ── listar ─────────────────────────────────────────────── */

if (accion === 'listar') {
  const cuentas = d.prepare(`
    SELECT u.correo, u.nombre, u.es_admin, u.correo_verificado,
           o.nombre AS empresa, o.tipo, o.exenta_pago
    FROM usuarios u
    LEFT JOIN miembros m ON m.usuario_id = u.id
    LEFT JOIN organizaciones o ON o.id = m.organizacion_id
    WHERE u.es_admin = 1 OR o.exenta_pago = 1
    ORDER BY u.es_admin DESC, u.correo`).all();

  if (!cuentas.length) {
    console.log('\nNo hay cuentas con permisos internos.');
    console.log('Cree una con:  node tools/admin.js crear <correo> "<Nombre>" --admin\n');
    process.exit(0);
  }

  console.log(`\n${cuentas.length} cuenta(s) con permisos internos:\n`);
  cuentas.forEach((c) => {
    const marcas = [
      c.es_admin ? 'ADMINISTRADOR' : null,
      c.exenta_pago ? 'EXENTA DE PAGO' : null,
      c.correo_verificado ? null : 'correo sin verificar',
    ].filter(Boolean).join(' · ');
    console.log(`  ${c.correo}`);
    console.log(`    ${c.nombre}${c.empresa && c.empresa !== c.nombre ? ` · ${c.empresa}` : ''} (${c.tipo || 'sin organización'})`);
    console.log(`    ${marcas}\n`);
  });
  process.exit(0);
}

/* ── crear ──────────────────────────────────────────────── */

if (accion === 'crear') {
  const correo = args[1];
  const nombre = args[2];
  if (!correo || !correo.includes('@')) uso('Indique un correo válido.');
  if (!nombre) uso('Indique el nombre de la persona, entre comillas.');

  const verificarPor = opcion('verificar-por');
  const administradorVerificador = verificarPor ? db.usuarioPorCorreo(verificarPor) : null;
  if (verificarPor && (!administradorVerificador || !administradorVerificador.es_admin)) {
    console.error(`\n${verificarPor} no corresponde a una cuenta administradora.\n`);
    process.exit(1);
  }

  if (db.usuarioPorCorreo(correo)) {
    console.error(`\nYa existe una cuenta con ${correo}.`);
    console.error('Para cambiarle los permisos use conceder, retirar, eximir o cobrar.\n');
    process.exit(1);
  }

  const empresa = opcion('empresa');
  const rnc = opcion('rnc');

  /* El RNC es opcional aquí, a diferencia del registro público.
     Estas cuentas las crea el equipo desde el servidor y no pasan por
     revisión: el RNC sirve para comprobar que una empresa ajena
     existe, no para dar de alta la propia. Se puede añadir después
     con `node tools/admin.js rnc <correo> <numero>`. */
  if (rnc && String(rnc).replace(/\D/g, '').length !== 9) uso('El RNC tiene 9 dígitos.');

  const clave = opcion('clave') || claveSegura();

  const { idUsuario, idOrg } = db.crearCuenta({
    correo,
    clave,
    nombre,
    telefono: opcion('telefono') || null,
    tipo: empresa ? 'dealer' : 'particular',
    empresa: empresa || null,
    rnc: rnc ? String(rnc).replace(/\D/g, '') : null,
    direccion: opcion('direccion') || null,
    provincia: opcion('provincia') || null,
    municipio: null,
    solicitud: empresa ? { encargado: nombre } : null,
  });

  // El correo se da por bueno: quien crea la cuenta tiene acceso al
  // servidor, no hace falta que demuestre que controla el buzón.
  db.marcarCorreoVerificado(idUsuario);

  if (bandera('admin')) db.marcarAdmin(correo, true);
  if (bandera('exenta')) {
    d.prepare('UPDATE organizaciones SET exenta_pago = 1, actualizada = ? WHERE id = ?')
      .run(db.ahora(), idOrg);
  }

  // Una empresa creada desde aquí ya está revisada: la crea el equipo.
  if (empresa) {
    d.prepare("UPDATE organizaciones SET estado_revision = 'aprobada', actualizada = ? WHERE id = ?")
      .run(db.ahora(), idOrg);
    d.prepare("UPDATE solicitudes_dealer SET estado = 'aprobada', revisada = ? WHERE organizacion_id = ?")
      .run(db.ahora(), idOrg);
    if (administradorVerificador) {
      db.enNombreDe({
        idAdmin: administradorVerificador.id,
        idOrganizacion: idOrg,
        accion: 'organizacion.verificar',
        objetoTipo: 'organizacion',
        objetoId: idOrg,
        motivo: 'Alta por línea de comandos (tools/admin.js)',
      }, (org) => {
        db.marcarVerificada(idOrg, true);
        return { antes: { verificada: !!org.verificada }, despues: { verificada: true } };
      });
    }
  }

  console.log(`
╭──────────────────────────────────────────────────────────
│  Cuenta creada
│
│  Correo      ${correo}
│  Contraseña  ${clave}
│  Nombre      ${nombre}
│  Tipo        ${empresa ? `empresa · ${empresa} · RNC ${String(rnc).replace(/\D/g, '')}` : 'particular'}
│  Permisos    ${[
    bandera('admin') ? 'revisa solicitudes' : null,
    bandera('exenta') ? 'publica sin pagar' : null,
  ].filter(Boolean).join(' · ') || 'ninguno'}
${empresa && !administradorVerificador ? '│  Sello       se da desde la consola, sección «Empresas»\n' : ''}│
│  Anote la contraseña ahora: no se vuelve a mostrar.
╰──────────────────────────────────────────────────────────
`);
  process.exit(0);
}

/* ── permisos sobre una cuenta existente ────────────────── */

const correo = args[1];
if (!['conceder', 'retirar', 'eximir', 'cobrar', 'rnc'].includes(accion)) uso();
if (!correo) uso('Falta el correo.');

const usuario = db.usuarioPorCorreo(correo);
if (!usuario) {
  console.error(`\nNo hay ninguna cuenta con el correo ${correo}.`);
  console.error(`Créela con:  node tools/admin.js crear ${correo} "<Nombre>"\n`);
  process.exit(1);
}

if (accion === 'conceder' || accion === 'retirar') {
  const conceder = accion === 'conceder';
  db.marcarAdmin(correo, conceder);
  console.log(conceder
    ? `\n${correo} ya puede revisar solicitudes en /admin.html\n`
    : `\n${correo} deja de ser administrador.\n`);
  process.exit(0);
}

const org = db.organizacionDe(usuario.id);
if (!org) {
  console.error(`\n${correo} no tiene organización asociada.\n`);
  process.exit(1);
}

if (accion === 'rnc') {
  const numero = String(args[2] || '').replace(/\D/g, '');
  if (numero.length !== 9) uso('El RNC tiene 9 dígitos.');

  const dueno = d.prepare('SELECT nombre FROM organizaciones WHERE rnc = ? AND id <> ?')
    .get(numero, org.id);
  if (dueno) {
    console.error(`\nEse RNC ya está registrado por ${dueno.nombre}.\n`);
    process.exit(1);
  }

  d.prepare('UPDATE organizaciones SET rnc = ?, actualizada = ? WHERE id = ?')
    .run(numero, db.ahora(), org.id);
  console.log(`\nRNC de ${org.nombre} actualizado.\n`);
  process.exit(0);
}

const eximir = accion === 'eximir';
d.prepare('UPDATE organizaciones SET exenta_pago = ?, actualizada = ? WHERE id = ?')
  .run(eximir ? 1 : 0, db.ahora(), org.id);

console.log(eximir
  ? `\n${org.nombre} publica sin pagar a partir de ahora.\n`
  : `\n${org.nombre} vuelve a pagar por sus publicaciones.\n`);
