/**
 * numero-a-letras.js — el importe escrito, para los comprobantes.
 *
 * POR QUÉ VA EN UN ARCHIVO APARTE
 *
 * Un comprobante lleva el total en letras porque una cifra se altera
 * con un trazo y una frase no. Es la única parte de la facturación que
 * es puro cálculo de texto, sin base de datos ni PDF de por medio, así
 * que se prueba sola: `node --test tools/numero-a-letras.prueba.js`.
 *
 * DETALLES DEL ESPAÑOL QUE AQUÍ SÍ IMPORTAN
 *
 *   · Apócope: delante de un sustantivo masculino se dice «un peso»,
 *     «veintiún pesos», «treinta y un pesos» — no «uno».
 *   · «cien» a secas, «ciento» cuando le sigue algo: cien / ciento uno.
 *   · «un millón DE pesos» cuando el millón está redondo, pero «un
 *     millón quinientos mil pesos» cuando no lo está.
 *   · Los centavos NO se escriben en letras: van como fracción sobre
 *     cien, que es como se leen las facturas dominicanas — «con 00/100».
 */

const UNIDADES = ['', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve',
  'diez', 'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
  'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve'];

const DECENAS = ['', '', '', 'treinta', 'cuarenta', 'cincuenta', 'sesenta', 'setenta', 'ochenta', 'noventa'];

const CENTENAS = ['', 'ciento', 'doscientos', 'trescientos', 'cuatrocientos', 'quinientos',
  'seiscientos', 'setecientos', 'ochocientos', 'novecientos'];

/* De 1 a 999. El cero no llega aquí: se resuelve antes, porque «cero»
   solo aparece cuando el número entero es cero, nunca dentro de otro. */
function menorDeMil(n) {
  if (n === 100) return 'cien';

  const centena = CENTENAS[Math.floor(n / 100)];
  const r = n % 100;

  let resto = '';
  if (r < 30) resto = UNIDADES[r];
  else if (r % 10 === 0) resto = DECENAS[Math.floor(r / 10)];
  else resto = `${DECENAS[Math.floor(r / 10)]} y ${UNIDADES[r % 10]}`;

  return [centena, resto].filter(Boolean).join(' ');
}

/* «uno» → «un» al final de la frase, que es donde se pega el sustantivo. */
const apocopar = (frase) => frase
  .replace(/veintiuno$/, 'veintiún')
  .replace(/(^|\s)uno$/, '$1un');

/* El número entero, en palabras. Hasta 999.999.999: por encima de eso
   no hay comprobante posible en esta plataforma. */
function enPalabras(entero) {
  const n = Math.floor(Math.abs(Number(entero) || 0));
  if (n === 0) return 'cero';

  const millones = Math.floor(n / 1e6);
  const miles = Math.floor((n % 1e6) / 1000);
  const resto = n % 1000;

  const partes = [];
  if (millones === 1) partes.push('un millón');
  else if (millones > 1) partes.push(`${apocopar(menorDeMil(millones))} millones`);
  if (miles === 1) partes.push('mil');
  else if (miles > 1) partes.push(`${apocopar(menorDeMil(miles))} mil`);
  if (resto) partes.push(menorDeMil(resto));

  return partes.join(' ');
}

/* El importe completo, tal como va impreso en el comprobante.
 *
 * `moneda` se deja configurable porque la plataforma cobra en pesos hoy,
 * pero la plantilla ya imprime la moneda como dato y no como constante. */
function enLetras(monto, { singular = 'peso dominicano', plural = 'pesos dominicanos' } = {}) {
  const valor = Math.abs(Number(monto) || 0);
  const entero = Math.floor(valor);
  /* Se redondea a dos decimales ANTES de partir: 0.005 tiene que subir
     a 01/100, no desaparecer. */
  const centavos = Math.round((valor - entero) * 100);

  /* El redondeo de los centavos puede llevarse el entero: 1.999 → 2.00 */
  const enteroFinal = centavos === 100 ? entero + 1 : entero;
  const centavosFinal = centavos === 100 ? 0 : centavos;

  const palabras = apocopar(enPalabras(enteroFinal));
  const nombre = enteroFinal === 1 ? singular : plural;

  /* «un millón DE pesos» solo si el millón está redondo. */
  const redondoEnMillones = enteroFinal >= 1e6 && enteroFinal % 1e6 === 0;
  const union = redondoEnMillones ? ' de ' : ' ';

  const frase = `${palabras}${union}${nombre} con ${String(centavosFinal).padStart(2, '0')}/100`;
  return frase.charAt(0).toUpperCase() + frase.slice(1);
}

module.exports = { enLetras, enPalabras };
