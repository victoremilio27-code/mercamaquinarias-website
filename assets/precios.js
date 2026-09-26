/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Cómo se cobra
   Fuente única del cálculo. La carga el navegador con <script> y el
   servidor con require(): la cifra que se enseña y la que se cobra
   salen de la misma función, no de dos copias que se desincronizan.

   ── El modelo ──────────────────────────────────────────────
   No se paga por anuncio publicado. Se compra CAPACIDAD: un nivel
   (Estándar, Destacado o Premium) y una cantidad de cupos, por 30 o
   por 60 días. Cada equipo publicado ocupa un cupo, y el anunciante
   decide a qué equipo se lo pone y cuándo se lo quita.

   Un cupo libre se puede reutilizar sin volver a pagar: vendió la
   excavadora, la marca como vendida y publica el camión en su lugar.

   ── Las tres reglas ────────────────────────────────────────
   1. UNO GRATIS POR CADA CINCO. Cinco cupos se cobran como cuatro;
      diez, como ocho. La regla es una sola y vale para cualquier
      cantidad, así que se puede decir en una línea y comprobar de
      cabeza.

   2. SESENTA DÍAS CUESTAN MENOS QUE DOS VECES TREINTA. El factor de
      RECARGO_60 se aplica sobre el total, después del descuento por
      cantidad. Los dos beneficios se acumulan.

   3. AMPLIAR A MITAD DE CICLO SE PRORRATEA. Quien añade un cupo
      cuando le quedan doce de treinta días paga esos doce días, no
      un ciclo entero. No se fía nada: se cobra en el momento y la
      fecha de renovación no se mueve.

   ── Cómo se llega al precio final ──────────────────────────
   Las reglas de arriba dan la BASE. De la base al precio final solo
   se llega por `desglose`: ajuste, subtotal gravado e ITBIS, en ese
   orden y en ningún otro sitio. Ver el comentario de AJUSTE.
   ═══════════════════════════════════════════════════════════ */

/* ITBIS sobre servicios de publicidad. */
const ITBIS = 0.18;

/* Ajuste del modelo comercial (research/modelo-comercial.md §12,
   autorizado por Victor el 2026-09-25):

     subtotal gravado = base × (1 + AJUSTE)
     ITBIS            = subtotal gravado × ITBIS
     precio final     = subtotal gravado + ITBIS

   El ajuste va ANTES del ITBIS, dentro del subtotal gravado. Si se
   sumara después, el ITBIS del comprobante con NCF se calcularía
   sobre menos de lo cobrado y no cuadraría ante la DGII.

   Esta es la única fuente de la tasa: ningún otro módulo escribe el
   0.03. Al comprador nunca se le enseña como cargo, comisión ni
   «+3 %»: ve un solo precio final con el ITBIS incluido. */
const AJUSTE = 0.03;

/* Un cupo gratis por cada cuantos se compren. */
const CUPOS_POR_UNO_GRATIS = 5;

/* Sesenta días valen 1.8 veces treinta, no 2. */
const RECARGO_60 = 1.8;

/* Duraciones que se venden. `factor` multiplica el precio unitario,
   que siempre está expresado en treinta días. */
const DURACIONES = [
  { dias: 30, nombre: '30 días', factor: 1 },
  { dias: 60, nombre: '60 días', factor: RECARGO_60 },
];

const CUPO_MAXIMO = 100;

const duracion = (dias) =>
  DURACIONES.find((d) => d.dias === Number(dias)) || DURACIONES[0];

/* Cuántos cupos se regalan y cuántos se cobran. */
const cuposGratis = (cupo) =>
  Math.floor(Math.max(0, Math.trunc(cupo)) / CUPOS_POR_UNO_GRATIS);

const cuposCobrados = (cupo) => {
  const n = Math.max(0, Math.trunc(cupo));
  return n - cuposGratis(n);
};

/* Ahorro de contratar 60 días de una vez en lugar de dos veces 30. */
const ahorro60 = () => Math.round((1 - RECARGO_60 / 2) * 100);

/* ── Compra ─────────────────────────────────────────────────
   `precioUnitario` es lo que cuesta un cupo de ese nivel durante
   treinta días. Sale de la tabla `planes`, nunca de aquí: los precios
   cambian y las suscripciones ya vendidas siguen apuntando a lo que
   se pactó. */
function precioCompra({ precioUnitario, cupo, dias }) {
  const cobrados = cuposCobrados(cupo);
  const base = Math.round(Number(precioUnitario) * cobrados * duracion(dias).factor);
  return desglose(base, { cupo: Math.trunc(cupo), cobrados, gratis: cuposGratis(cupo), dias: duracion(dias).dias });
}

/* ── Ampliación a mitad de ciclo ────────────────────────────
   Se cobra la diferencia de cupos cobrables, prorrateada por los días
   que quedan. Pasar de 4 a 5 cupos no cuesta nada: el quinto es el
   gratis de la regla. Eso es intencionado y hay que verlo en pantalla,
   porque es el momento en que la regla se vuelve visible. */
function precioAmpliacion({ precioUnitario, cupoActual, cupoNuevo, dias, diasRestantes }) {
  const d = duracion(dias);
  const restantes = Math.max(0, Math.min(Number(diasRestantes), d.dias));
  const diferencia = cuposCobrados(cupoNuevo) - cuposCobrados(cupoActual);

  const base = diferencia <= 0 ? 0
    : Math.round(Number(precioUnitario) * diferencia * d.factor * (restantes / d.dias));

  return desglose(base, {
    cupo: Math.trunc(cupoNuevo),
    anade: Math.trunc(cupoNuevo) - Math.trunc(cupoActual),
    cobrados: diferencia,
    gratis: (Math.trunc(cupoNuevo) - Math.trunc(cupoActual)) - Math.max(0, diferencia),
    dias: d.dias,
    diasRestantes: restantes,
    proporcion: d.dias ? restantes / d.dias : 0,
  });
}

/* ── Renovación ─────────────────────────────────────────────
   Renovar es comprar otra vez el mismo cupo. Sin sorpresas: el precio
   es el mismo que vería contratando hoy. */
const precioRenovacion = ({ precioUnitario, cupo, dias }) =>
  precioCompra({ precioUnitario, cupo, dias });

/* De la base al precio final. Pesos enteros (D-03 de la fase 05.1):
   `aCentavos` del cobro con tarjeta lanza con decimales, así que cada
   importe se redondea una sola vez y el total es la suma exacta de
   subtotal e ITBIS, sin un tercer redondeo que pueda descuadrarlo.

   `subtotal` es el GRAVADO (base + ajuste), no la base. Antes del
   ajuste era lo mismo; ahora no, y por eso se llama igual que antes:
   `pagos.subtotal`, `facturas.subtotal` y la tasa que deduce
   `facturas.emitirPorPago` (itbis / subtotal) siguen cuadrando sin
   tocarlos. Una base cero o negativa da todo cero (promoción, D-04). */
function desglose(base, extra = {}) {
  const b = Math.max(0, Math.round(Number(base) || 0));
  const ajuste = Math.round(b * AJUSTE);
  const subtotal = b + ajuste;
  const itbis = Math.round(subtotal * ITBIS);
  return {
    base: b, ajusteTasa: AJUSTE, ajuste, subtotal,
    itbisTasa: ITBIS, itbis, total: subtotal + itbis,
    ...extra,
  };
}

/* Días que faltan para una fecha ISO, nunca negativos: para prorratear,
   un ciclo vencido aporta cero días, no días en contra. */
function diasRestantes(iso, desde = new Date()) {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso) - desde) / 86400000));
}

/* Qué le costaría al anunciante el siguiente cupo. Sirve para
   rotularlo en el panel sin que tenga que abrir el formulario:
   "el sexto le sale gratis" es información que cambia decisiones. */
function siguienteCupo({ precioUnitario, cupoActual, dias, diasRestantes }) {
  const p = precioAmpliacion({
    precioUnitario, cupoActual, cupoNuevo: cupoActual + 1, dias, diasRestantes,
  });
  return { ...p, gratuito: p.total === 0 };
}

/* ── Moneda del catálogo ────────────────────────────────────
   Los anuncios se publican en pesos o en dólares, y el buscador
   comparaba la cifra cruda: una excavadora de US$120,000 quedaba fuera
   de «desde RD$1,000,000» y se ordenaba por debajo de una camioneta de
   RD$500,000. Para COMPARAR, los dólares se pasan a pesos con una tasa
   de referencia. Para MOSTRAR, cada anuncio conserva su moneda: la
   cifra convertida no la publicó el vendedor.

   La tasa vigente la fija el equipo desde /admin.html (ajuste
   `tasa_usd`); esta constante es solo el valor de partida cuando nadie
   la ha fijado. No es la tasa oficial del día. */
const TASA_USD_POR_DEFECTO = 63;

/* Fuera de este rango, una tasa es un cero de más o de menos al
   teclearla, no un tipo de cambio. Se rechaza en vez de reordenar el
   catálogo entero con ella. */
const TASA_USD_MIN = 20;
const TASA_USD_MAX = 200;

/* La tasa limpia (dos decimales) o null si no sirve. Admite la coma
   decimal porque así la escribe quien la copia de un periódico. */
function tasaValida(valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  const n = Number(String(valor).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < TASA_USD_MIN || n > TASA_USD_MAX) return null;
  return Math.round(n * 100) / 100;
}

/* Cifra en pesos para comparar. Tiene que dar lo mismo que la
   expresión PRECIO_EN_PESOS de tools/db.js, que es la que ordena y
   filtra en la base. */
function precioEnPesos(precio, moneda, tasa = TASA_USD_POR_DEFECTO) {
  if (precio === null || precio === undefined) return null;
  return moneda === 'USD' ? Number(precio) * Number(tasa) : Number(precio);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    ITBIS, AJUSTE, CUPOS_POR_UNO_GRATIS, RECARGO_60, DURACIONES, CUPO_MAXIMO,
    duracion, cuposGratis, cuposCobrados, ahorro60,
    precioCompra, precioAmpliacion, precioRenovacion, desglose,
    diasRestantes, siguienteCupo,
    TASA_USD_POR_DEFECTO, TASA_USD_MIN, TASA_USD_MAX, tasaValida, precioEnPesos,
  };
}
