/**
 * respaldo-antes-de-migrar.js — #73: el despliegue respalda la base de
 * producción ANTES de reiniciar, si el código nuevo trae migraciones que
 * esa base todavía no tiene.
 *
 *   MERCA_DB=… MERCA_RESPALDOS=… node tools/respaldo-antes-de-migrar.js
 *
 * Lo llama `deploy/desplegar-mercamaquinarias` después del `git merge` y
 * antes de `systemctl restart`. Sale con 0 si no hacía falta o si el
 * respaldo quedó hecho y verificado; con 1 si algo falló, y entonces el
 * despliegue vuelve al código anterior SIN reiniciar.
 *
 * POR QUÉ EXISTE
 *
 * Las migraciones se aplican solas al arrancar, y la vuelta atrás del
 * despliegue devuelve el código, no la base. Los respaldos de la 10.1, la
 * 10.2 y la tanda 4 los hizo Victor a mano por SSH antes de cada fusión;
 * esto hace lo mismo (`VACUUM INTO` + `integrity_check`) sin depender de
 * que alguien se acuerde.
 *
 * NO usa `db.abrir()`: abrir la base con el código nuevo aplicaría las
 * migraciones antes de respaldar, que es justo lo que se quiere evitar.
 * Abre el archivo en solo lectura y compara la tabla `migraciones` con
 * `db.NOMBRES_MIGRACIONES`, que no abre nada.
 *
 * Se guardan los últimos MERCA_RESPALDOS_MIGRAR (5 por omisión) en la
 * subcarpeta `antes-de-migrar/`, aparte de la rotación diaria de
 * `tools/tareas.js` (que solo mira `mercamaquinarias-*.db`). El disco del
 * droplet es pequeño: más copias no caben.
 */

const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const RAIZ = path.resolve(__dirname, '..');
const BASE = process.env.MERCA_DB || path.join(RAIZ, 'db', 'mercamaquinarias.db');
const CARPETA = path.join(process.env.MERCA_RESPALDOS || path.join(RAIZ, '.tmp', 'respaldos'), 'antes-de-migrar');
const CONSERVAR = Number(process.env.MERCA_RESPALDOS_MIGRAR) > 0 ? Number(process.env.MERCA_RESPALDOS_MIGRAR) : 5;

/* Lo que la base ya tiene anotado. Una base sin la tabla (no debería
   pasar en producción) cuenta como que le falta todo. */
function aplicadas(conexion) {
  const hay = conexion.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'migraciones'").get();
  if (!hay) return new Set();
  return new Set(conexion.prepare('SELECT id FROM migraciones').all().map((f) => f.id));
}

function pendientesDe(conexion, nombres) {
  const ya = aplicadas(conexion);
  return nombres.filter((n) => !ya.has(n));
}

function respaldar({ base = BASE, carpeta = CARPETA, conservar = CONSERVAR, nombres } = {}) {
  /* Sin base no hay nada que perder: el primer arranque la crea. */
  if (!fs.existsSync(base)) return { hecho: false, motivo: 'sin-base', pendientes: [] };

  /* db.js avisa si falta MERCA_SECRETO, y el despliegue no lo tiene: aquí
     no se firma nada, solo se leen los nombres de las migraciones. Sin
     esto, el registro de cada despliegue llevaría un aviso falso. */
  if (!nombres && !process.env.MERCA_SECRETO) process.env.MERCA_SECRETO = 'respaldo-antes-de-migrar-no-firma-nada';
  const lista = nombres || require('./db.js').NOMBRES_MIGRACIONES;
  const origen = new DatabaseSync(base, { readOnly: true });
  let destino = null;
  try {
    origen.exec('PRAGMA busy_timeout = 5000');
    const pendientes = pendientesDe(origen, lista);
    if (!pendientes.length) return { hecho: false, motivo: 'al-dia', pendientes };

    fs.mkdirSync(carpeta, { recursive: true });
    const sello = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
    /* El nombre dice qué migración venía: es lo que se busca el día que
       hay que volver atrás. Sin caracteres raros en la ruta. */
    const etiqueta = pendientes[0].replace(/[^\w-]/g, '_');
    destino = path.join(carpeta, `antes-${etiqueta}-${sello}.db`);
    fs.rmSync(destino, { force: true });
    origen.exec(`VACUUM INTO '${destino.replace(/'/g, "''")}'`);

    const copia = new DatabaseSync(destino, { readOnly: true });
    let integridad;
    let mismas;
    try {
      integridad = Object.values(copia.prepare('PRAGMA integrity_check').get())[0];
      mismas = pendientesDe(copia, lista).length === pendientes.length;
    } finally {
      copia.close();
    }
    if (integridad !== 'ok' || !mismas) {
      fs.rmSync(destino, { force: true });
      throw new Error(`el respaldo no pasó la comprobación (integrity_check: ${integridad})`);
    }

    /* Rotación: solo los de esta carpeta, del más nuevo al más viejo por
       nombre (el sello va en ISO, así que ordena por fecha dentro de la
       misma migración) y por fecha de modificación entre migraciones. */
    const viejos = fs.readdirSync(carpeta)
      .filter((f) => f.startsWith('antes-') && f.endsWith('.db'))
      .map((f) => ({ f, t: fs.statSync(path.join(carpeta, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t || b.f.localeCompare(a.f))
      .slice(conservar);
    viejos.forEach(({ f }) => fs.rmSync(path.join(carpeta, f), { force: true }));

    return { hecho: true, destino, pendientes, bytes: fs.statSync(destino).size, borrados: viejos.length };
  } finally {
    origen.close();
  }
}

if (require.main === module) {
  try {
    const r = respaldar();
    if (!r.hecho) {
      console.log(r.motivo === 'sin-base'
        ? `respaldo antes de migrar: no hay base en ${BASE}; nada que respaldar`
        : 'respaldo antes de migrar: sin migraciones pendientes');
    } else {
      console.log(`respaldo antes de migrar (${r.pendientes.join(', ')}): ${r.destino}`
        + ` · ${Math.round(r.bytes / 1024)} KB · íntegro`
        + (r.borrados ? ` · ${r.borrados} antiguo(s) eliminado(s)` : ''));
    }
    process.exit(0);
  } catch (e) {
    console.error(`ERROR respaldo antes de migrar: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { respaldar, pendientesDe };
