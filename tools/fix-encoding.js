/**
 * fix-encoding.js — repara los caracteres que se rompieron al reescribir
 * los HTML con Set-Content de PowerShell.
 *
 * Qué pasó: PowerShell leyó archivos UTF-8 sin BOM como ANSI (cp1252) y
 * los volvió a escribir como UTF-8, doblando la codificación. El primer
 * arreglo usó latin1, que coincide con cp1252 salvo en 0x80–0x9F, así que
 * los caracteres cuyo UTF-8 tiene un byte en ese rango quedaron rotos:
 * × → › — ═
 *
 * Se reemplazan por entidades HTML: sobreviven a cualquier reescritura
 * futura sin importar la codificación con que se guarde el archivo.
 *
 * Uso: node tools/fix-encoding.js [--check]
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const SOLO_REVISAR = process.argv.includes('--check');

/* Secuencias dañadas → lo que debían ser. El orden importa: primero las
   más largas, para que no se coman entre ellas. */
const ARREGLOS = [
  [/^�/, ''],                                  // resto del BOM que metió PowerShell
  [/�"��"�/g, '===='],          // ═══ decorativo dentro de comentarios
  [/�/g, '&times;'],                     // ×
  [/�/g, '&mdash;'],                     // —
  [/� /g, '&rarr;'],                     // →
  [/⬺/g, '&rsaquo;'],                          // › (quedó como carácter válido pero equivocado)
];

/* Lo que sí debe aparecer fuera de ASCII: acentos y signos del español.

   Los dos últimos se añadieron cuando esta comprobación entró en CI: sin
   ellos salía 1 sobre el repositorio limpio, diciendo «0 archivo(s) por
   reparar» y suspendiendo igual. No son mojibake, son lo que se quiso
   escribir: «…» son los puntos suspensivos de cuenta.html e index.html y
   «═» arma los separadores de sección de los comentarios de legal.html.
   La lista se queda estrecha a propósito: cada carácter que se añade aquí
   es un mojibake que esta herramienta deja de cazar. */
const PERMITIDO = /[ -ÿ–—‘’“”→›…═]/;

let cambiados = 0;
const sospechosos = [];

for (const archivo of fs.readdirSync(RAIZ).filter((f) => f.endsWith('.html'))) {
  const ruta = path.join(RAIZ, archivo);
  const original = fs.readFileSync(ruta, 'utf8');

  let texto = original;
  for (const [patron, reemplazo] of ARREGLOS) texto = texto.replace(patron, reemplazo);

  // Cualquier cosa rara que haya quedado.
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (c.charCodeAt(0) < 0x80 || PERMITIDO.test(c)) continue;
    sospechosos.push(`${archivo}: U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')} en «${texto.slice(Math.max(0, i - 20), i + 20).replace(/\s+/g, ' ')}»`);
  }

  if (texto !== original) {
    if (!SOLO_REVISAR) fs.writeFileSync(ruta, texto, 'utf8');
    console.log(`${SOLO_REVISAR ? 'necesita arreglo' : 'reparado'}  ${archivo}`);
    cambiados++;
  }
}

console.log(`\n${cambiados} archivo(s) ${SOLO_REVISAR ? 'por reparar' : 'reparados'}`);

if (sospechosos.length) {
  console.log(`\n${sospechosos.length} carácter(es) fuera de lo esperado:`);
  [...new Set(sospechosos)].slice(0, 25).forEach((s) => console.log('  · ' + s));
  process.exit(1);
}
console.log('Sin caracteres sospechosos.');
