/**
 * transferencia.js — los datos de la cuenta a la que se transfiere, y
 * si la transferencia existe o no.
 *
 * POR QUÉ EXISTE
 *
 * Es la contingencia del lanzamiento (PAGO-09): el 14 de octubre la
 * empresa tiene que poder cobrar aunque la afiliación de CardNet no
 * haya llegado. Sin pasarela, el cliente transfiere, el personal lo ve
 * en el banco y lo marca como recibido en la consola.
 *
 * POR QUÉ LOS DATOS NO ESTÁN EN EL REPOSITORIO
 *
 * Solo Victor tiene la cuenta. Viven en `/etc/mercamaquinarias.env`,
 * como las demás claves, y aquí no hay ningún valor de ejemplo ni «por
 * defecto»: una cuenta de ejemplo publicada por error es peor que no
 * ofrecer transferencia, porque alguien le mandaría dinero. Por eso el
 * interruptor es estricto: con una sola variable vacía o que no pase
 * la validación mínima, la transferencia no existe y el sitio sigue
 * como antes.
 *
 * Se lee `process.env` en cada llamada y no al cargar el módulo, para
 * que la prueba pueda encenderla y apagarla en la misma ejecución.
 */

const VARIABLES = {
  banco: 'MERCA_TRANSFERENCIA_BANCO',
  titular: 'MERCA_TRANSFERENCIA_TITULAR',
  rnc: 'MERCA_TRANSFERENCIA_RNC',
  tipoCuenta: 'MERCA_TRANSFERENCIA_TIPO',
  cuenta: 'MERCA_TRANSFERENCIA_CUENTA',
};

const TIPOS = ['corriente', 'ahorros'];

/* Validación mínima: no demuestra que la cuenta exista, solo atrapa el
   error de copiar un dato en la variable equivocada o a medias. */
const VALIDA = {
  banco: (v) => v.length > 0,
  titular: (v) => v.length > 0,
  // RNC de 9 dígitos o cédula de 11, con o sin guiones.
  rnc: (v) => /^[0-9-]+$/.test(v) && [9, 11].includes(v.replace(/-/g, '').length),
  tipoCuenta: (v) => TIPOS.includes(v.toLowerCase()),
  cuenta: (v) => /^[0-9-]{6,30}$/.test(v),
};

const leer = (campo) => String(process.env[VARIABLES[campo]] || '').trim();

/* Nombres de las variables que faltan o no validan, NUNCA sus valores:
   esto acaba en el aviso de arranque, que va al registro del servidor. */
function faltantes() {
  return Object.keys(VARIABLES)
    .filter((campo) => !VALIDA[campo](leer(campo)))
    .map((campo) => VARIABLES[campo]);
}

const apagadaAMano = () => String(process.env.MERCA_TRANSFERENCIA || '').trim() === '0';

/* Los datos que ve el comprador, o null si la transferencia no existe.
   La moneda es siempre DOP: los precios lo son. */
function datosTransferencia() {
  if (apagadaAMano() || faltantes().length) return null;
  return {
    banco: leer('banco'),
    titular: leer('titular'),
    rnc: leer('rnc'),
    tipoCuenta: leer('tipoCuenta').toLowerCase(),
    cuenta: leer('cuenta'),
    moneda: 'DOP',
  };
}

const transferenciaActiva = () => datosTransferencia() !== null;

module.exports = { datosTransferencia, transferenciaActiva, faltantes };
