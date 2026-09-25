/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Asistente de publicación

   Cinco pasos y ninguno cobra. La capacidad se contrata en
   planes.html, que es el único sitio del portal donde entra dinero;
   aquí el anuncio solo ocupa un cupo de lo que ya se pagó.

   Antes había dos pasos más —elegir plan y pagar— dentro de este
   mismo asistente. Quien ya tenía cupos contratados los veía igual,
   con su formulario de tarjeta, y parecía que se le cobraba dos veces
   por lo mismo. No hacía falta redactar mejor esa pantalla: hacía
   falta que no estuviera.

   No hay solicitud previa ni revisión manual: la publicación es del
   anunciante y se activa al confirmar.

   Depende de data.js y app.js (cargados antes): usa esc, pesos,
   miles, icono, $ y $$. El cálculo del importe, de precios.js.
   ═══════════════════════════════════════════════════════════ */

/* ── Configuración del flujo ────────────────────────────── */

/* Los rótulos van cortos a propósito: la columna del paso mide poco y
   los anteriores se cortaban a media palabra ("Monto y modali…"), que
   se lee como un error de la página. */
const PASOS = [
  { id: 'equipo',   nombre: 'Equipo',      detalle: 'Ficha técnica' },
  { id: 'fotos',    nombre: 'Fotografías', detalle: 'Fotos y video' },
  { id: 'precio',   nombre: 'Precio',      detalle: 'Monto' },
  { id: 'contacto', nombre: 'Contacto',    detalle: 'Teléfonos' },
  { id: 'confirmar', nombre: 'Publicar',   detalle: 'Revisión' },
];

const FOTOS_MINIMAS = 3;
const FOTOS_MAXIMAS = 20;

/* Las imágenes se reducen antes de guardarse: el original de una
   cámara de teléfono pesa varios megabytes y no aporta nada por
   encima de este ancho en la ficha. */
const ANCHO_MAXIMO_FOTO = 1600;
const CALIDAD_FOTO = 0.82;

/* Segundo tamaño, para las tarjetas del catálogo. Una tarjeta mide
   unos 400 px en pantalla, así que 900 cubre también las de retina sin
   mandar la de 1600, que sería tirar el 90 % de los bytes. */
const ANCHO_MINIATURA = 900;
const CALIDAD_MINIATURA = 0.78;

/* ── Video ──────────────────────────────────────────────────
   Un video del equipo encendido vale más que diez fotos: se oye el
   motor y se ve si se mueve. Pero también pesa doce veces más, así que
   se recorta por los dos lados.

   30 SEGUNDOS. Suficiente para dar una vuelta a la máquina y arrancarla.
   El tope se comprueba antes de procesar nada, porque rechazar un video
   de dos minutos después de tenerlo codificando medio minuto sería una
   pérdida de tiempo para quien lo sube.

   720p. Un teléfono actual graba a 1080p o 4K: 30 s a 4K son 150 MB. A
   720 la ficha se ve igual de bien —el reproductor no pasa de 700 px de
   ancho— y el archivo baja a unos 6 MB.

   SE REDUCE AQUÍ Y NO EN EL SERVIDOR. El VPS tiene 512 MB de RAM y un
   solo núcleo; pasarle ffmpeg a cada video lo dejaría sin responder
   durante minutos. El navegador de quien sube, en cambio, está ocioso.
   El precio es que la reducción va en tiempo real: un video de 30 s
   tarda unos 30 s, y por eso hay barra de progreso. */
const SEGUNDOS_MAXIMOS_VIDEO = 30;
const ALTURA_VIDEO = 720;

/* 1,5 Mb/s a 720p. MediaRecorder por defecto usa el doble largo, y para
   una máquina parada o moviéndose despacio no hace falta: sube el peso
   sin que se note en pantalla. */
const BITRATE_VIDEO = 1_500_000;

/* Orden de preferencia de formatos. MP4 primero porque lo reproduce
   todo, incluidos los iPhone con iOS antiguo; WebM es el respaldo,
   porque Chrome y Firefox llevan años grabando en él y hasta hace poco
   era lo único que ofrecían.
 *
 * DOS LISTAS, y no es un detalle cosmético: declarar un códec de audio
 * en un video que no lleva pista de audio produce un archivo que luego
 * NO SE PUEDE LEER. Se descubrió probando con un video mudo, que es
 * exactamente lo que sube quien graba con el micrófono tapado o desde
 * una app que no captura sonido. */
const FORMATOS_VIDEO_CON_AUDIO = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

const FORMATOS_VIDEO_SIN_AUDIO = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

const FORMATOS_VIDEO = [...FORMATOS_VIDEO_CON_AUDIO, ...FORMATOS_VIDEO_SIN_AUDIO];

const CLAVE_BORRADOR = 'mercamaquinarias:borrador';

/* La clave de antes del cambio de nombre.
 *
 * Renombrar y ya está le habría borrado el anuncio a medio escribir a
 * cualquiera que tuviese uno guardado, sin avisarle y sin manera de
 * recuperarlo. Se rescata una vez y se tira la clave vieja.
 *
 * Esta línea sobra a partir de finales de 2026: para entonces nadie
 * conserva un borrador de antes de la mudanza. */
const CLAVE_BORRADOR_ANTERIOR = 'tuequipord:borrador';

function rescatarBorradorAnterior() {
  try {
    const viejo = localStorage.getItem(CLAVE_BORRADOR_ANTERIOR);
    if (!viejo) return;
    if (!localStorage.getItem(CLAVE_BORRADOR)) localStorage.setItem(CLAVE_BORRADOR, viejo);
    localStorage.removeItem(CLAVE_BORRADOR_ANTERIOR);
  } catch (_) { /* almacenamiento no disponible: no hay nada que rescatar */ }
}

/* ── Estado ─────────────────────────────────────────────── */

function estadoInicial() {
  return {
    paso: 0,
    equipo: {
      categoria: '', subcategoria: '', marca: '', modelo: '', anio: '',
      condicion: '', uso: '', unidad: 'h', serie: '', potencia: '', peso: '',
      provincia: '', ciudad: '', implementos: '', descripcion: '',
    },
    fotos: [],
    videos: [],
    precio: {
      modalidad: 'fijo', monto: '', moneda: 'DOP', minimo: '',
      itbisIncluido: false, permuta: false, financiamiento: false,
    },
    // La razón social y el RNC ya no viven aquí: son de la
    // organización de la cuenta, se registran una vez y todos los
    // anuncios los heredan.
    contacto: {
      nombre: '', correo: '', sucursal: '',
      telefonos: [{ numero: '', tipo: 'ambos', nota: '' }],
      horario: '', web: '', preferencia: 'whatsapp',
    },
    /* Ni plan ni pago viven ya en el borrador. El anuncio ocupa el
       cupo libre de mayor nivel que tenga la cuenta en el momento de
       publicar, y eso se consulta al servidor: guardarlo aquí solo
       serviría para que un borrador de hace tres días apuntara a una
       membresía que ya venció. */
  };
}

let estado = estadoInicial();

/* El borrador sobrevive a un cierre de pestaña. Las fotos van dentro:
   ya están reducidas, y el navegador avisa por excepción si el cupo
   de almacenamiento se agota. En ese caso se guarda sin ellas antes
   que perder todo lo escrito. */
function guardarBorrador() {
  try {
    localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(estado));
  } catch (_) {
    try {
      localStorage.setItem(CLAVE_BORRADOR, JSON.stringify({ ...estado, fotos: [] }));
    } catch (__) { /* almacenamiento no disponible: se sigue en memoria */ }
  }
}

function leerBorrador() {
  rescatarBorradorAnterior();
  try {
    const crudo = localStorage.getItem(CLAVE_BORRADOR);
    if (!crudo) return null;
    const datos = JSON.parse(crudo);
    const base = estadoInicial();
    // Fusión superficial por bloque: un borrador viejo al que le falte
    // un campo nuevo se completa con el valor por defecto.
    return {
      ...base, ...datos,
      equipo: { ...base.equipo, ...(datos.equipo || {}) },
      precio: { ...base.precio, ...(datos.precio || {}) },
      contacto: { ...base.contacto, ...(datos.contacto || {}) },
      fotos: Array.isArray(datos.fotos) ? datos.fotos : [],
      // Los borradores guardados antes de que hubiera video traen la
      // clave `video` con un enlace de YouTube y ninguna lista. Sin
      // esto, el primer `estado.videos.map` reventaría el formulario a
      // quien tuviera un anuncio a medio escribir.
      videos: Array.isArray(datos.videos) ? datos.videos : [],
    };
  } catch (_) {
    return null;
  }
}

const borrarBorrador = () => {
  try { localStorage.removeItem(CLAVE_BORRADOR); } catch (_) { /* nada que borrar */ }
};

/* Duplicar un anuncio propio (MET-04): trae la copia del servidor y la
   deja con la misma forma que `leerBorrador()`, lista para volcarse al
   formulario. No toca `localStorage` ni el `estado` global: eso lo
   decide quien llama, según haya o no un borrador a medio escribir que
   el dueño no quiera perder.

   El servidor ya deja el número de serie en blanco (`copiarAnuncio` en
   tools/api.js): copiarlo publicaría dos anuncios con la misma serie,
   que identifica una sola máquina. */
async function cargarCopia(idAnuncio) {
  try {
    const r = await api(`/mis-anuncios/${encodeURIComponent(idAnuncio)}/copia`);
    if (!r || !r.copia) return null;
    const base = estadoInicial();
    const c = r.copia;
    return {
      ...base,
      equipo: { ...base.equipo, ...c.equipo },
      precio: { ...base.precio, ...c.precio },
      contacto: { ...base.contacto, ...c.contacto },
      fotos: Array.isArray(c.fotos) ? c.fotos : [],
      videos: Array.isArray(c.videos) ? c.videos : [],
      paso: 0,
      origen: c.origen || null,
    };
  } catch (_) {
    return null;              // sin conexión, sin permiso o el anuncio ya no existe
  }
}


/* ── Utilidades de formato ──────────────────────────────── */

const soloDigitos = (s) => String(s || '').replace(/\D+/g, '');

const simboloMoneda = (id) => (MONEDAS.find((m) => m.id === id) || MONEDAS[0]).simbolo;

const montoConMoneda = (valor, moneda) =>
  `${simboloMoneda(moneda)}${miles(Number(soloDigitos(valor) || 0))}`;

/* Teléfono dominicano: (809) 000-0000. Se formatea mientras se
   escribe y se guarda con el mismo formato que se muestra. */
function formatearTelefono(valor) {
  const d = soloDigitos(valor).slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

const telefonoValido = (valor) => soloDigitos(valor).length === 10;

const correoValido = (valor) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(valor || '').trim());

/* Miles mientras se escribe en los campos de dinero. */
const formatearMonto = (valor) => {
  const d = soloDigitos(valor);
  return d ? miles(Number(d)) : '';
};

/* ── Errores de validación ──────────────────────────────── */

/* Marca el campo, escribe el motivo debajo y devuelve false para
   encadenar: `ok = exigir(...) && ok` recorre todo el paso y deja
   señalados todos los campos, no solo el primero. */
function exigir(campo, condicion, motivo) {
  const contenedor = campo && campo.closest('.campo-v, .campo-grupo');
  if (!contenedor) return condicion;

  contenedor.classList.toggle('campo-v--error', !condicion);
  let aviso = contenedor.querySelector('.campo-v__error');

  if (condicion) {
    if (aviso) aviso.remove();
    campo.removeAttribute('aria-invalid');
    return true;
  }

  if (!aviso) {
    aviso = document.createElement('span');
    aviso.className = 'campo-v__error';
    contenedor.appendChild(aviso);
  }
  aviso.textContent = motivo;
  campo.setAttribute('aria-invalid', 'true');
  return false;
}

function limpiarErrores(seccion) {
  $$('.campo-v--error', seccion).forEach((c) => c.classList.remove('campo-v--error'));
  $$('.campo-v__error', seccion).forEach((c) => c.remove());
  $$('[aria-invalid]', seccion).forEach((c) => c.removeAttribute('aria-invalid'));
}

/* Aviso de bloque, para lo que no cuelga de un campo concreto
   (faltan fotos, falta un plan). */
function avisoPaso(seccion, texto) {
  let caja = $('.paso__aviso', seccion);
  if (!texto) {
    if (caja) caja.remove();
    return;
  }
  if (!caja) {
    caja = document.createElement('p');
    caja.className = 'paso__aviso';
    caja.setAttribute('role', 'alert');
    seccion.insertBefore(caja, seccion.firstChild);
  }
  caja.innerHTML = `${icono('i-aviso')} <span>${esc(texto)}</span>`;
}

/* ── Paso 1 · Equipo ────────────────────────────────────── */

/* Taxonomía traída del servidor. Vive aquí, en una sola variable, para
   que los cuatro selectores encadenados lean todos de lo mismo. */
let TAXONOMIA = null;

const OTRO_MODELO = '__otro__';

/* ── Paso 1 · Equipo: cadena categoría → subcategoría → marca → modelo
 *
 * Antes había una sola lista global de 22 marcas que se ofrecía en
 * todas las categorías: se podía publicar una excavadora marca Genie o
 * un generador marca Mack. Ahora cada nivel filtra al siguiente, y lo
 * mismo valida el servidor.
 *
 * Cambiar un nivel superior limpia los inferiores. Dejar una marca de
 * excavadora colgando tras cambiar a camiones es justo el estado
 * incoherente que se quería eliminar. */
async function montarPasoEquipo() {
  const cat = $('#e-categoria');
  const sub = $('#e-subcategoria');
  const marca = $('#e-marca');
  const modelo = $('#e-modelo');
  const modeloOtro = $('#e-modelo-otro');
  if (!cat || !sub) return;

  const cond = $('#e-condicion');
  if (cond && !cond.options.length > 1) { /* ya montado */ }
  if (cond && cond.options.length <= 1) {
    CONDICIONES.forEach((c) => cond.add(new Option(`${c.nombre} — ${c.detalle}`, c.nombre)));
  }

  TAXONOMIA = await api('/taxonomia', { silencioso: true });
  if (!TAXONOMIA) return;                 // sin servidor no hay jerarquía

  // Categorías
  cat.innerHTML = '<option value="">Elija una categoría</option>';
  TAXONOMIA.categorias.forEach((c) => cat.add(new Option(c.nombre, c.id)));

  const inactivo = (sel, si) => {
    sel.disabled = si;
    const campo = sel.closest('.campo-v');
    if (campo) campo.classList.toggle('campo-v--inactivo', si);
  };

  function pintarSub() {
    const c = TAXONOMIA.categorias.find((x) => x.id === cat.value);
    const lista = c ? c.subcategorias : [];
    sub.innerHTML = `<option value="">${lista.length ? 'Elija el tipo de equipo' : 'Elija primero la categoría'}</option>`;
    lista.forEach((s) => sub.add(new Option(s.nombre, s.id)));
    inactivo(sub, !lista.length);
  }

  function pintarMarcas() {
    const ids = TAXONOMIA.marcasPorSub[sub.value] || [];
    marca.innerHTML = `<option value="">${ids.length ? 'Elija una marca' : 'Elija primero el tipo de equipo'}</option>`;

    // Alfabético, con «Otra marca» al final: es la salida, no una
    // opción más entre iguales.
    ids.filter((id) => id !== 'otra')
      .map((id) => ({ id, nombre: TAXONOMIA.marcas[id] || id }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .forEach((m) => marca.add(new Option(m.nombre, m.id)));
    if (ids.includes('otra')) marca.add(new Option(TAXONOMIA.marcas.otra, 'otra'));

    inactivo(marca, !ids.length);
  }

  function pintarModelos() {
    const lista = (TAXONOMIA.modelos[sub.value] || {})[marca.value] || [];
    modelo.innerHTML = `<option value="">${marca.value ? 'Elija un modelo' : 'Elija primero la marca'}</option>`;
    lista.forEach((m) => modelo.add(new Option(m, m)));

    /* Ninguna lista de modelos puede ser exhaustiva: hay máquinas de
       los ochenta y series regionales que no van a estar. Bloquear una
       publicación legítima por eso sería peor que aceptar un texto
       escrito a mano. */
    if (marca.value) modelo.add(new Option('Otro modelo…', OTRO_MODELO));
    inactivo(modelo, !marca.value);
    pintarOtroModelo();
  }

  function pintarOtroModelo() {
    const otro = modelo.value === OTRO_MODELO;
    modeloOtro.hidden = !otro;
    if (otro) modeloOtro.focus();
    else modeloOtro.value = '';
  }

  /* Motor y transmisión: solo en vehículos de carretera. */
  function pintarTrenMotriz() {
    const bloque = $('#bloqueTrenMotriz');
    if (!bloque) return;
    const aplica = TAXONOMIA.subsConTrenMotriz.includes(sub.value);
    bloque.hidden = !aplica;
    if (!aplica) {
      ['#e-motor-marca', '#e-motor-modelo', '#e-trans-marca', '#e-trans-modelo']
        .forEach((s) => { if ($(s)) $(s).value = ''; });
      return;
    }

    const llenar = (selMarca, selModelo, fuente) => {
      const sm = $(selMarca);
      const smod = $(selModelo);
      if (!sm.dataset.listo) {
        Object.entries(fuente).forEach(([id, m]) => sm.add(new Option(m.nombre, id)));
        sm.dataset.listo = '1';
        sm.addEventListener('change', () => {
          const modelos = (fuente[sm.value] || {}).modelos || [];
          smod.innerHTML = `<option value="">${modelos.length ? 'Sin especificar' : 'No aplica'}</option>`;
          modelos.forEach((m) => smod.add(new Option(m, m)));
          smod.disabled = !modelos.length;
        });
      }
    };
    llenar('#e-motor-marca', '#e-motor-modelo', TAXONOMIA.motores);
    llenar('#e-trans-marca', '#e-trans-modelo', TAXONOMIA.transmisiones);
  }

  // Cada nivel limpia los de abajo.
  cat.addEventListener('change', () => { pintarSub(); pintarMarcas(); pintarModelos(); pintarTrenMotriz(); });
  sub.addEventListener('change', () => { pintarMarcas(); pintarModelos(); pintarTrenMotriz(); });
  marca.addEventListener('change', pintarModelos);
  modelo.addEventListener('change', pintarOtroModelo);

  pintarSub();
  pintarMarcas();
  pintarModelos();
  pintarTrenMotriz();
}

/* El modelo que se guarda: el de la lista, o el escrito a mano cuando
   se eligió «Otro modelo…». */
function modeloElegido() {
  const sel = $('#e-modelo');
  if (!sel) return '';
  return sel.value === OTRO_MODELO ? $('#e-modelo-otro').value.trim() : sel.value;
}

function validarEquipo(seccion) {
  limpiarErrores(seccion);
  let ok = true;
  const anio = Number($('#e-anio').value);
  const limite = new Date().getFullYear() + 1;

  ok = exigir($('#e-categoria'), !!$('#e-categoria').value, 'Seleccione la categoría del equipo.') && ok;
  ok = exigir($('#e-subcategoria'), !!$('#e-subcategoria').value, 'Seleccione el tipo dentro de la categoría.') && ok;
  ok = exigir($('#e-marca'), !!$('#e-marca').value, 'Seleccione la marca.') && ok;
  ok = exigir($('#e-modelo'), modeloElegido().length >= 2,
    $('#e-modelo').value === OTRO_MODELO
      ? 'Escriba el modelo tal como aparece en la placa del equipo.'
      : 'Seleccione el modelo.') && ok;
  ok = exigir($('#e-anio'), anio >= 1970 && anio <= limite, `Año entre 1970 y ${limite}.`) && ok;
  ok = exigir($('#e-condicion'), !!$('#e-condicion').value, 'Seleccione la condición del equipo.') && ok;
  ok = exigir($('#e-uso'), soloDigitos($('#e-uso').value).length > 0, 'Indique las horas de horómetro o el kilometraje acumulado.') && ok;
  ok = exigir($('#e-provincia'), !!$('#e-provincia').value, 'Indique la provincia donde se encuentra el equipo.') && ok;
  ok = exigir($('#e-descripcion'), $('#e-descripcion').value.trim().length >= 40,
    'Describa el estado en al menos 40 caracteres: mantenimientos, trabajos pendientes y uso que se le dio.') && ok;

  return ok;
}

/* ── Paso 2 · Fotografías ───────────────────────────────── */

/* ¿Sabe este navegador CODIFICAR WebP con canvas?
 *
 * No basta con que sepa mostrarlo. Safari lo muestra desde hace años
 * pero tardó en poder generarlo, y cuando no puede, `toDataURL` no
 * avisa: devuelve un PNG. Un PNG de una foto pesa varias veces más que
 * el JPEG, así que dar por hecho el soporte empeoraría justo lo que se
 * quiere arreglar. Se comprueba una vez y se decide con el resultado. */
const ADMITE_WEBP = (() => {
  try {
    const c = document.createElement('canvas');
    c.width = 1; c.height = 1;
    return c.toDataURL('image/webp').startsWith('data:image/webp');
  } catch { return false; }
})();

const FORMATO_FOTO = ADMITE_WEBP ? 'image/webp' : 'image/jpeg';

/* Dibuja la imagen a un ancho dado y devuelve el data URL. */
function aDataUrl(img, ancho, calidad) {
  const escala = Math.min(1, ancho / img.width);
  const lienzo = document.createElement('canvas');
  lienzo.width = Math.round(img.width * escala);
  lienzo.height = Math.round(img.height * escala);
  const ctx = lienzo.getContext('2d');
  // Fondo blanco: un PNG con transparencia sobre JPEG saldría negro.
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
  return lienzo.toDataURL(FORMATO_FOTO, calidad);
}

/* Reduce la imagen en el navegador y la sube al servidor. Devuelve las
   RUTAS de los dos tamaños, no la imagen.
 *
 * Antes esto devolvía el data URL y acababa guardado en la base. Una
 * foto de móvil ocupaba 697 KB así, una página de catálogo pesaba
 * 16 MB y nada de eso se podía cachear. Ahora el navegador manda los
 * bytes una vez y a partir de ahí pide archivos normales. */
function procesarImagen(archivo) {
  return new Promise((resolver, rechazar) => {
    if (!archivo.type.startsWith('image/')) {
      rechazar(new Error('No es una imagen'));
      return;
    }
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error('Imagen dañada'));
      img.onload = async () => {
        const completa = aDataUrl(img, ANCHO_MAXIMO_FOTO, CALIDAD_FOTO);
        const miniatura = aDataUrl(img, ANCHO_MINIATURA, CALIDAD_MINIATURA);

        try {
          const r = await api('/fotos', { metodo: 'POST', cuerpo: { completa, miniatura } });
          if (!r) throw new Error('No hay conexión con el servidor');
          resolver({
            id: `f-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            nombre: archivo.name,
            url: r.completa,
            miniatura: r.miniatura,
          });
        } catch (e) {
          rechazar(new Error(`No se pudo subir «${archivo.name}»: ${e.message}`));
        }
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

/* ── Video: reducción en el navegador ───────────────────── */

/* ¿Puede este navegador reducir un video? Hacen falta tres cosas que no
   están en todas partes. Se comprueba antes de enseñar el botón: es
   mejor no ofrecerlo que ofrecerlo y fallar al final. */
function puedeReducirVideo() {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function'
    // Basta con poder grabar sin audio: es el caso más restrictivo y el
    // que siempre hace falta.
    && !!FORMATOS_VIDEO_SIN_AUDIO.find((f) => MediaRecorder.isTypeSupported(f));
}

/* El formato se elige SEGÚN HAYA AUDIO O NO. Ver el porqué donde se
   declaran las dos listas. */
const formatoVideo = (conAudio) =>
  (conAudio ? FORMATOS_VIDEO_CON_AUDIO : FORMATOS_VIDEO_SIN_AUDIO)
    .find((f) => MediaRecorder.isTypeSupported(f));

/* Carga los metadatos de un archivo de video. Se usa para saber la
   duración ANTES de procesar: así un video de dos minutos se rechaza al
   instante en vez de después de medio minuto codificando. */
function leerVideo(archivo) {
  return new Promise((resolver, rechazar) => {
    const url = URL.createObjectURL(archivo);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    v.onloadedmetadata = () => resolver({ video: v, url });
    v.onerror = () => {
      URL.revokeObjectURL(url);
      rechazar(new Error('No se pudo leer el video. Pruebe con otro archivo.'));
    };
    v.src = url;
  });
}

const aBlobDataUrl = (blob) => new Promise((ok, err) => {
  const l = new FileReader();
  l.onerror = () => err(new Error('No se pudo preparar el video'));
  l.onload = () => ok(l.result);
  l.readAsDataURL(blob);
});

/* Dibuja el video en un lienzo de 720p y graba lo dibujado.
 *
 * Va en tiempo real a propósito: `requestVideoFrameCallback` o un bucle
 * de seek darían un resultado más rápido, pero el primero no está en
 * Firefox y el segundo produce saltos de audio. Reproducir y grabar es
 * lo que funciona igual en todas partes.
 *
 * EL AUDIO IMPORTA: en maquinaria usada, oír el motor es medio
 * diagnóstico. Y conservarlo tiene una trampa: hay que reproducir el
 * video para grabarlo, pero quien está subiendo no tiene por qué oírlo
 * sonar treinta segundos. La salida fácil —`v.muted = true`— también
 * silencia lo que se graba, y el video acabaría mudo.
 *
 * Por eso el sonido se desvía con la API de audio: se enchufa al
 * grabador y NO a los altavoces. Se graba con audio y no se oye nada.
 * Si algo de eso falla, se sigue sin audio en vez de no subir nada. */
function reducirVideo(v, alProgreso) {
  return new Promise((resolver, rechazar) => {
    const escala = Math.min(1, ALTURA_VIDEO / v.videoHeight);
    // Pares: algunos codificadores rechazan dimensiones impares.
    const ancho = Math.max(2, Math.round((v.videoWidth * escala) / 2) * 2);
    const alto = Math.max(2, Math.round((v.videoHeight * escala) / 2) * 2);

    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext('2d');

    const flujo = lienzo.captureStream(30);

    let audioCtx = null;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        audioCtx = new AC();
        const destino = audioCtx.createMediaStreamDestination();
        audioCtx.createMediaElementSource(v).connect(destino);
        // Sin `connect(audioCtx.destination)` a propósito: eso es lo
        // que lo mandaría a los altavoces.
        destino.stream.getAudioTracks().forEach((t) => flujo.addTrack(t));
      }
    } catch (_) {
      audioCtx = null;              // se sigue, mudo
    }

    // Se pregunta al flujo, no a lo que se intentó: si añadir la pista
    // falló, aquí se ve, y el formato se elige en consecuencia.
    const conAudio = flujo.getAudioTracks().length > 0;

    let grabador;
    try {
      grabador = new MediaRecorder(flujo, {
        mimeType: formatoVideo(conAudio),
        videoBitsPerSecond: BITRATE_VIDEO,
      });
    } catch (e) {
      rechazar(new Error('Su navegador no puede preparar el video'));
      return;
    }

    const trozos = [];
    grabador.ondataavailable = (e) => { if (e.data && e.data.size) trozos.push(e.data); };

    /* El dibujo va por dos vías a la vez, y no es redundancia inútil:
       `requestAnimationFrame` SE CONGELA cuando la pestaña pierde el
       foco. Sin la segunda vía, quien cambia de pestaña mientras se
       prepara el video vuelve y se encuentra un video congelado en el
       fotograma donde se fue —el reproductor sigue avanzando y la
       grabación también, pero el lienzo ya no se actualiza—.

       El intervalo también se frena en segundo plano (a una vez por
       segundo), pero un video a un fotograma por segundo es mucho mejor
       que uno congelado. */
    const fotograma = () => {
      if (v.ended || v.paused) return;
      ctx.drawImage(v, 0, 0, ancho, alto);
      if (alProgreso && v.duration) alProgreso(Math.min(1, v.currentTime / v.duration));
    };

    const porIntervalo = setInterval(fotograma, 1000 / 30);

    const dibujar = () => {
      if (v.ended || v.paused) return;
      fotograma();
      requestAnimationFrame(dibujar);
    };

    // Red de seguridad: si el video no termina —un archivo con duración
    // mal declarada— se corta igual al llegar al tope.
    const corte = setTimeout(() => {
      if (grabador.state !== 'inactive') { v.pause(); grabador.stop(); }
    }, (SEGUNDOS_MAXIMOS_VIDEO + 3) * 1000);

    /* Un solo sitio donde se suelta todo. El intervalo y el contexto de
       audio siguen vivos si no se cierran, y treinta segundos de video
       repetidos dejan al navegador con temporizadores y contextos
       colgando. */
    const recoger = () => {
      clearInterval(porIntervalo);
      clearTimeout(corte);
      if (audioCtx) { try { audioCtx.close(); } catch (_) { /* ya cerrado */ } }
    };

    grabador.onstop = () => {
      recoger();
      resolver({ blob: new Blob(trozos, { type: grabador.mimeType }), ancho, alto });
    };
    grabador.onerror = () => { recoger(); rechazar(new Error('Falló la preparación del video')); };

    v.onended = () => {
      // Un último fotograma: sin esto, el final se corta en negro.
      ctx.drawImage(v, 0, 0, ancho, alto);
      if (grabador.state !== 'inactive') grabador.stop();
    };

    v.currentTime = 0;
    v.play().then(() => {
      grabador.start();
      dibujar();
    }).catch(() => {
      recoger();
      rechazar(new Error('No se pudo reproducir el video para prepararlo'));
    });
  });
}

/* El primer fotograma, como imagen. `<video>` sin póster enseña un
   rectángulo negro hasta que alguien pulsa, y en una ficha de
   maquinaria eso se lee como algo que no cargó. */
function posterDe(v, ancho, alto) {
  try {
    const lienzo = document.createElement('canvas');
    lienzo.width = ancho;
    lienzo.height = alto;
    lienzo.getContext('2d').drawImage(v, 0, 0, ancho, alto);
    return lienzo.toDataURL(FORMATO_FOTO, CALIDAD_FOTO);
  } catch (_) {
    return null;
  }
}

async function procesarVideo(archivo, alProgreso) {
  if (!archivo.type.startsWith('video/')) throw new Error('No es un video');
  if (!puedeReducirVideo()) {
    throw new Error('Su navegador no puede preparar videos. Pruebe desde Chrome, Edge o Safari actualizados.');
  }

  const { video: v, url } = await leerVideo(archivo);

  try {
    // Medio segundo de margen: los teléfonos declaran 30,04 s para un
    // video de 30, y rechazarlo por eso seria incomprensible.
    if (v.duration > SEGUNDOS_MAXIMOS_VIDEO + 0.5) {
      throw new Error(
        `El video dura ${Math.round(v.duration)} segundos y el máximo son ${SEGUNDOS_MAXIMOS_VIDEO}. Recórtelo antes de subirlo.`,
      );
    }
    if (!v.videoHeight) throw new Error('Ese archivo no tiene imagen de video');

    const { blob, ancho, alto } = await reducirVideo(v, alProgreso);

    // El póster se saca del primer fotograma, ya con el video al final:
    // se rebobina para capturarlo.
    v.currentTime = 0;
    await new Promise((ok) => { v.onseeked = ok; setTimeout(ok, 400); });
    const poster = posterDe(v, ancho, alto);

    const r = await api('/videos', {
      metodo: 'POST',
      cuerpo: { video: await aBlobDataUrl(blob), poster, duracion: v.duration },
    });
    if (!r) throw new Error('No hay conexión con el servidor');

    return {
      id: `v-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      nombre: archivo.name,
      url: r.url,
      poster: r.poster,
      duracion: r.duracion || v.duration,
    };
  } finally {
    URL.revokeObjectURL(url);
    v.removeAttribute('src');
    v.load();
  }
}

function pintarFotos() {
  const lista = $('#listaFotos');
  const cuenta = $('#contadorFotos');
  if (!lista) return;

  const tope = limiteFotos();
  const sobran = estado.fotos.length - tope;

  lista.innerHTML = estado.fotos.map((f, i) => `
    <li class="foto${i === 0 ? ' foto--portada' : ''}${i >= tope ? ' foto--excedida' : ''}" data-id="${esc(f.id)}">
      <img src="${esc(f.url)}" alt="${esc(f.nombre)}">
      ${i === 0 ? '<span class="foto__sello">Portada</span>' : ''}
      ${i >= tope ? '<span class="foto__sello foto__sello--aviso">Fuera del plan</span>' : ''}
      <span class="foto__mandos">
        <button type="button" class="foto__btn" data-mover="-1" ${i === 0 ? 'disabled' : ''} aria-label="Mover la foto ${i + 1} hacia atrás">&larr;</button>
        <button type="button" class="foto__btn" data-portada aria-label="Usar la foto ${i + 1} como portada" ${i === 0 ? 'disabled' : ''}>${icono('i-estrella')}</button>
        <button type="button" class="foto__btn" data-mover="1" ${i === estado.fotos.length - 1 ? 'disabled' : ''} aria-label="Mover la foto ${i + 1} hacia delante">&rarr;</button>
        <button type="button" class="foto__btn foto__btn--quitar" data-quitar aria-label="Quitar la foto ${i + 1}">${icono('i-equis')}</button>
      </span>
    </li>`).join('');

  cuenta.innerHTML = estado.fotos.length
    ? `<b class="num">${estado.fotos.length}</b> de ${tope} fotografías${sobran > 0
        ? ` · <span class="cuenta-aviso">${sobran} quedarán fuera con el plan elegido</span>` : ''}`
    : `Mínimo ${FOTOS_MINIMAS} fotografías · máximo ${tope}`;

  pintarVistaPrevia();
}

const segundos = (n) => `${Math.round(n || 0)} s`;

function pintarVideos() {
  const lista = $('#listaVideos');
  const cuenta = $('#contadorVideos');
  const zona = $('#zonaVideos');
  if (!lista || !zona) return;

  const tope = limiteVideos();

  /* Sin plan con video no se enseña la zona de subida: ofrecer un botón
     que al final va a decir que no se puede es peor que no ofrecerlo. */
  zona.hidden = tope === 0;

  lista.innerHTML = estado.videos.map((v, i) => `
    <li class="video-sub" data-id="${esc(v.id)}">
      <video class="video-sub__vista" src="${esc(v.url)}"
             ${v.poster ? `poster="${esc(v.poster)}"` : ''} controls preload="none" playsinline></video>
      <span class="video-sub__pie">
        <span class="video-sub__dato num">${esc(segundos(v.duracion))}</span>
        <button type="button" class="foto__btn foto__btn--quitar" data-quitar-video
                aria-label="Quitar el video ${i + 1}">${icono('i-equis')}</button>
      </span>
    </li>`).join('');

  if (cuenta) {
    cuenta.innerHTML = tope === 0
      ? 'Su plan no incluye video.'
      : estado.videos.length
        ? `<b class="num">${estado.videos.length}</b> de ${tope} ${tope === 1 ? 'video' : 'videos'}`
        : `Hasta ${tope} ${tope === 1 ? 'video' : 'videos'} · máximo ${SEGUNDOS_MAXIMOS_VIDEO} segundos cada uno`;
  }

  const boton = $('#botonVideo');
  if (boton) boton.hidden = estado.videos.length >= tope;
}

function avisarVideo(mensaje, malo = true) {
  const aviso = $('#avisoVideo');
  if (!aviso) return;
  aviso.hidden = !mensaje;
  aviso.textContent = mensaje || '';
  aviso.classList.toggle('acceso__aviso--bien', !malo);
}

async function agregarVideos(archivos) {
  const pendientes = [...archivos].filter((a) => a.type.startsWith('video/'));
  if (!pendientes.length) return;

  const tope = limiteVideos();
  const sitio = tope - estado.videos.length;
  if (sitio <= 0) {
    avisarVideo(`Su plan admite ${tope} ${tope === 1 ? 'video' : 'videos'}. Quite uno para subir otro.`);
    return;
  }

  const barra = $('#progresoVideo');
  const zona = $('#zonaVideos');
  avisarVideo('');

  for (const archivo of pendientes.slice(0, sitio)) {
    zona.classList.add('zona-fotos--cargando');
    if (barra) { barra.hidden = false; barra.value = 0; }
    try {
      const v = await procesarVideo(archivo, (p) => { if (barra) barra.value = p; });
      estado.videos.push(v);
      pintarVideos();
      guardarBorrador();
    } catch (e) {
      avisarVideo(e.message);
    } finally {
      zona.classList.remove('zona-fotos--cargando');
      if (barra) barra.hidden = true;
    }
  }
}

function montarPasoVideos() {
  const zona = $('#zonaVideos');
  const input = $('#inputVideo');
  const lista = $('#listaVideos');
  if (!zona || !input) return;

  /* El navegador que no puede preparar videos lo dice aquí y no al
     final del proceso. Safari viejo y algún navegador de fabricante no
     traen MediaRecorder. */
  if (!puedeReducirVideo()) {
    const boton = $('#botonVideo');
    if (boton) boton.hidden = true;
    avisarVideo('Este navegador no puede preparar videos. Pruebe desde Chrome, Edge o Safari actualizados.');
    return;
  }

  input.addEventListener('change', () => {
    agregarVideos(input.files);
    input.value = '';
  });

  lista.addEventListener('click', (ev) => {
    const btn = ev.target.closest('[data-quitar-video]');
    if (!btn) return;
    const li = btn.closest('li');
    const i = estado.videos.findIndex((v) => v.id === li.dataset.id);
    if (i < 0) return;
    estado.videos.splice(i, 1);
    pintarVideos();
    guardarBorrador();
  });

  pintarVideos();
}

function agregarArchivos(archivos) {
  const zona = $('#zonaFotos');
  const pendientes = [...archivos].filter((a) => a.type.startsWith('image/'));
  if (!pendientes.length) return;

  zona.classList.add('zona-fotos--cargando');
  Promise.allSettled(pendientes.map(procesarImagen)).then((salidas) => {
    salidas.forEach((s) => {
      if (s.status === 'fulfilled' && estado.fotos.length < FOTOS_MAXIMAS) {
        estado.fotos.push(s.value);
      }
    });
    zona.classList.remove('zona-fotos--cargando');
    pintarFotos();
    guardarBorrador();
  });
}

function montarPasoFotos() {
  const zona = $('#zonaFotos');
  const input = $('#inputFotos');
  const lista = $('#listaFotos');
  if (!zona || !input) return;

  input.addEventListener('change', () => {
    agregarArchivos(input.files);
    input.value = '';           // permite volver a elegir el mismo archivo
  });

  ['dragenter', 'dragover'].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault();
    zona.classList.add('zona-fotos--activa');
  }));
  ['dragleave', 'drop'].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault();
    zona.classList.remove('zona-fotos--activa');
  }));
  zona.addEventListener('drop', (e) => {
    if (e.dataTransfer && e.dataTransfer.files) agregarArchivos(e.dataTransfer.files);
  });

  lista.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const li = btn.closest('.foto');
    const i = estado.fotos.findIndex((f) => f.id === li.dataset.id);
    if (i < 0) return;

    if (btn.hasAttribute('data-quitar')) {
      estado.fotos.splice(i, 1);
    } else if (btn.hasAttribute('data-portada')) {
      const [f] = estado.fotos.splice(i, 1);
      estado.fotos.unshift(f);
    } else {
      const destino = i + Number(btn.dataset.mover);
      if (destino < 0 || destino >= estado.fotos.length) return;
      const [f] = estado.fotos.splice(i, 1);
      estado.fotos.splice(destino, 0, f);
    }
    pintarFotos();
    guardarBorrador();
  });

  pintarFotos();
}

function validarFotos(seccion) {
  limpiarErrores(seccion);
  if (estado.fotos.length < FOTOS_MINIMAS) {
    avisoPaso(seccion, `Cargue al menos ${FOTOS_MINIMAS} fotografías. Los anuncios con menos de tres imágenes reciben la mitad de contactos.`);
    return false;
  }
  avisoPaso(seccion, '');
  return true;
}

/* ── Paso 3 · Precio ────────────────────────────────────── */

function montarPasoPrecio() {
  const grupo = $('#modalidadPrecio');
  if (!grupo) return;

  grupo.innerHTML = MODALIDADES_PRECIO.map((m) => `
    <label class="opcion">
      <input type="radio" name="modalidad" value="${esc(m.id)}"${m.id === estado.precio.modalidad ? ' checked' : ''}>
      <span class="opcion__cuerpo">
        <b class="opcion__nombre">${esc(m.nombre)}</b>
        <span class="opcion__detalle">${esc(m.detalle)}</span>
      </span>
    </label>`).join('');

  const moneda = $('#p-moneda');
  MONEDAS.forEach((m) => moneda.add(new Option(m.nombre, m.id)));
  moneda.value = estado.precio.moneda;

  // Toda modalidad publica cifra: lo único que cambia es si además se
  // pide el mínimo privado con el que filtrar las ofertas.
  function pintarModalidad() {
    const valor = (grupo.querySelector('input:checked') || {}).value || 'fijo';
    estado.precio.modalidad = valor;
    $('#bloqueMinimo').hidden = valor !== 'ofertas';
    pintarVistaPrevia();
  }

  grupo.addEventListener('change', () => { pintarModalidad(); guardarBorrador(); });

  ['#p-monto', '#p-minimo'].forEach((sel) => {
    const campo = $(sel);
    campo.addEventListener('input', () => { campo.value = formatearMonto(campo.value); });
  });

  pintarModalidad();
}

function validarPrecio(seccion) {
  limpiarErrores(seccion);
  let ok = true;

  const monto = Number(soloDigitos($('#p-monto').value));
  ok = exigir($('#p-monto'), monto > 0, 'Indique el precio solicitado. Los anuncios sin cifra publicada reciben menos contactos calificados.') && ok;

  if (estado.precio.modalidad === 'ofertas' && $('#p-minimo').value.trim()) {
    const minimo = Number(soloDigitos($('#p-minimo').value));
    ok = exigir($('#p-minimo'), minimo > 0 && minimo <= monto,
      'El mínimo aceptable no puede superar el precio publicado.') && ok;
  }
  return ok;
}

/* ── Paso 4 · Contacto ──────────────────────────────────── */

function filaTelefonoHTML(tel, i) {
  return `<li class="telefono" data-i="${i}">
    <span class="telefono__ico">${icono('i-telefono')}</span>
    <label class="campo-v">
      <span class="visualmente-oculto">Número ${i + 1}</span>
      <input type="tel" class="tel-numero" value="${esc(tel.numero)}" placeholder="(809) 000-0000" autocomplete="tel">
    </label>
    <label class="campo-v">
      <span class="visualmente-oculto">Uso del número ${i + 1}</span>
      <select class="tel-tipo">
        ${TIPOS_CONTACTO.map((t) => `<option value="${esc(t.id)}"${t.id === tel.tipo ? ' selected' : ''}>${esc(t.nombre)}</option>`).join('')}
      </select>
    </label>
    <label class="campo-v">
      <span class="visualmente-oculto">Nota del número ${i + 1}</span>
      <input type="text" class="tel-nota" value="${esc(tel.nota)}" placeholder="Ej. Departamento de ventas">
    </label>
    <button type="button" class="telefono__quitar" data-quitar-tel aria-label="Quitar el número ${i + 1}"${i === 0 && estado.contacto.telefonos.length === 1 ? ' disabled' : ''}>${icono('i-equis')}</button>
  </li>`;
}

function pintarTelefonos() {
  const lista = $('#listaTelefonos');
  if (!lista) return;
  lista.innerHTML = estado.contacto.telefonos.map(filaTelefonoHTML).join('');
  $('#btnAgregarTelefono').disabled = estado.contacto.telefonos.length >= 5;
}

function leerTelefonos() {
  estado.contacto.telefonos = $$('#listaTelefonos .telefono').map((li) => ({
    numero: $('.tel-numero', li).value,
    tipo: $('.tel-tipo', li).value,
    nota: $('.tel-nota', li).value.trim(),
  }));
}

function montarPasoContacto() {
  const lista = $('#listaTelefonos');
  if (!lista) return;

  pintarTelefonos();

  $('#btnAgregarTelefono').addEventListener('click', () => {
    leerTelefonos();
    estado.contacto.telefonos.push({ numero: '', tipo: 'ambos', nota: '' });
    pintarTelefonos();
    const ultimo = $$('#listaTelefonos .tel-numero').pop();
    if (ultimo) ultimo.focus();
    guardarBorrador();
  });

  lista.addEventListener('input', (e) => {
    if (e.target.classList.contains('tel-numero')) {
      e.target.value = formatearTelefono(e.target.value);
    }
    leerTelefonos();
  });

  lista.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-quitar-tel]');
    if (!btn) return;
    leerTelefonos();
    const i = Number(btn.closest('.telefono').dataset.i);
    estado.contacto.telefonos.splice(i, 1);
    if (!estado.contacto.telefonos.length) {
      estado.contacto.telefonos.push({ numero: '', tipo: 'ambos', nota: '' });
    }
    pintarTelefonos();
    guardarBorrador();
  });

  pintarIdentidad();
  pintarSucursales();
}

/* Desde qué sucursal se ofrece el equipo. Solo aparece si hay más de
   una: con una sola, preguntarlo es ruido y el servidor ya la asigna
   por defecto. */
function pintarSucursales() {
  const bloque = $('#bloqueSucursal');
  const sel = $('#c-sucursal');
  if (!bloque) return;

  const lista = (SESION.sucursales || []).filter((s) => s.activa !== 0);
  bloque.hidden = lista.length < 2;
  if (bloque.hidden) return;

  sel.innerHTML = lista.map((s) => {
    const donde = [s.municipio, s.provincia].filter(Boolean).join(', ');
    return `<option value="${esc(s.id)}"${s.principal ? ' selected' : ''}>${esc(s.nombre)}${donde ? ` — ${esc(donde)}` : ''}</option>`;
  }).join('');

  if (estado.contacto.sucursal && lista.some((s) => s.id === estado.contacto.sucursal)) {
    sel.value = estado.contacto.sucursal;
  }
  estado.contacto.sucursal = sel.value;
}

/* Quién firma el anuncio. Sale de la cuenta y no de un formulario:
   el RNC solo se enseña —y solo existe— para organizaciones de tipo
   dealer, y es el mismo que ya está asociado de forma permanente a la
   cuenta y que sostiene su página pública. */
function pintarIdentidad() {
  const caja = $('#identidadAnunciante');
  if (!caja) return;
  const org = SESION.organizacion;

  if (!haySesion()) {
    caja.className = 'identidad identidad--anonima';
    caja.innerHTML = `
      ${icono('i-usuario')}
      <span>
        <b>Publicará con una cuenta de MercaMaquinarias.</b>
        Puede completar la ficha ahora y entrar al final: lo que escriba se guarda.
        La cuenta es lo que le permite después editar el anuncio, medir sus visitas y renovarlo.
      </span>`;
    return;
  }

  if (org.tipo === 'dealer') {
    caja.className = 'identidad identidad--dealer';
    caja.innerHTML = `
      <span class="identidad__sello">${icono('i-edificio')}</span>
      <span class="identidad__cuerpo">
        <b class="identidad__nombre">${esc(org.nombre)}
          ${org.verificada ? `<span class="pastilla pastilla--verde">${icono('i-check')} Verificado</span>` : ''}
        </b>
        <span class="identidad__meta">Cuenta de empresa · RNC <b class="num">${esc(org.rncMascara || '—')}</b></span>
        <span class="identidad__nota">${org.estadoRevision === 'aprobada'
    ? `El anuncio se publica bajo esta empresa y aparece en ${org.slug ? `<a href="dealer.html?d=${encodeURIComponent(org.slug)}">su página pública</a>` : 'su página pública'}.`
    : 'El anuncio se publica bajo esta empresa. Su página pública se activa cuando aprobemos la cuenta.'}</span>
      </span>`;
    return;
  }

  caja.className = 'identidad';
  caja.innerHTML = `
    <span class="identidad__sello">${icono('i-usuario')}</span>
    <span class="identidad__cuerpo">
      <b class="identidad__nombre">${esc(org.nombre)}</b>
      <span class="identidad__meta">Cuenta particular</span>
      <span class="identidad__nota">¿Comercializa maquinaria de forma habitual?
        <a href="panel.html">Registre el RNC de su empresa</a> para obtener página pública y perfil en el directorio.</span>
    </span>`;
}

function validarContacto(seccion) {
  limpiarErrores(seccion);
  leerTelefonos();
  let ok = true;

  ok = exigir($('#c-nombre'), $('#c-nombre').value.trim().length >= 3, 'Indique el nombre de la persona que atiende las llamadas.') && ok;
  ok = exigir($('#c-correo'), correoValido($('#c-correo').value), 'Indique un correo válido: allí se envían la factura y los avisos del anuncio.') && ok;

  const primero = $('#listaTelefonos .tel-numero');
  const validos = estado.contacto.telefonos.filter((t) => telefonoValido(t.numero));
  ok = exigir(primero, validos.length > 0, 'Registre al menos un teléfono operativo de 10 dígitos.') && ok;

  // Un número escrito a medias es un error, no un campo opcional vacío.
  $$('#listaTelefonos .telefono').forEach((li) => {
    const campo = $('.tel-numero', li);
    const valor = campo.value.trim();
    if (valor && !telefonoValido(valor)) {
      ok = exigir(campo, false, 'Número incompleto.') && ok;
    }
  });

  return ok;
}

/* ── Paso 5 · Confirmación ───────────────────────────────────
   AQUÍ NO SE COBRA NADA. La capacidad se contrata en planes.html, que
   es el único sitio donde entra dinero. Publicar solo ocupa un cupo de
   lo que ya se pagó.

   Antes había dos pasos más —elegir plan y pagar— dentro del propio
   asistente. Quien ya tenía cupos contratados los veía igual, con su
   formulario de tarjeta, y parecía que se le cobraba dos veces por lo
   mismo. Ese era el problema, y quitarlos es la solución: no hay una
   pantalla de pago mejor redactada, hay una pantalla de pago que
   sobra.

   El nivel tampoco se pregunta. Se usa el más alto con sitio libre,
   que es el que más hace por el anuncio, y se dice cuál en la
   confirmación. Cambiarlo después es un desplegable en el panel, sin
   volver a publicar. */

let MEMBRESIAS = [];
let EXENTA = false;

const conHueco = () => MEMBRESIAS.filter((m) => m.libres === null || m.libres > 0);

/* Dónde va a caer este anuncio: el nivel más alto con sitio. La lista
   llega ordenada por nivel descendente desde el servidor. */
const membresiaElegida = () => conHueco()[0] || null;

/* Cuántas fotos admite. Sin cupo se permite el máximo: el anunciante
   sube primero y resuelve la capacidad al final, no al revés. */
function limiteFotos() {
  const m = membresiaElegida();
  return m ? m.fotos_maximas : FOTOS_MAXIMAS;
}

/* Cuántos videos admite el plan. Al revés que con las fotos, sin cupo
   elegido se permite UNO y no el máximo: el video es lo que más pesa y
   lo que más tarda en prepararse, y dejar que alguien suba tres para
   luego decirle que su plan solo admite uno es hacerle perder minutos
   de su tiempo, no kilobytes. */
function limiteVideos() {
  const m = membresiaElegida();
  return m ? (m.videos_maximos || 0) : 1;
}

async function cargarMembresias() {
  if (!haySesion()) { MEMBRESIAS = []; return; }
  const r = await api('/membresias', { silencioso: true });
  MEMBRESIAS = (r && r.membresias) || [];
  EXENTA = !!(r && r.exenta);
}

/* Lo que se le ofrece a quien se quedó sin sitio. Nunca «vuelva a
   empezar»: o amplía la membresía que ya tiene —prorrateada, solo los
   días que le queden— o contrata otro nivel, y en los dos casos vuelve
   aquí con el borrador intacto. */
function pintarSinCupo() {
  const caja = $('#bloqueSinCupo');
  const hay = !!membresiaElegida();

  caja.hidden = hay;
  if (hay) return;

  const volver = encodeURIComponent('publicar.html');
  const tiene = MEMBRESIAS.filter((m) => m.anuncios_incluidos != null);

  $('#textoSinCupo').textContent = tiene.length
    ? 'Sus cupos están ocupados. Añada uno a la membresía que ya tiene —solo paga los días que le queden— o libere uno marcando un equipo como vendido.'
    : 'Todavía no tiene cupos. Contrate uno para publicar este equipo; su borrador queda guardado.';

  const ampliables = tiene.map((m) => {
    const p = precioAmpliacion({
      precioUnitario: m.precio_unitario,
      cupoActual: m.anuncios_incluidos,
      cupoNuevo: m.anuncios_incluidos + 1,
      dias: m.dias_ciclo || 30,
      diasRestantes: diasRestantes(m.fin) ?? (m.dias_ciclo || 30),
    });
    return `<button type="button" class="btn btn--ambar" data-ampliar="${esc(m.id)}">
      Añadir un cupo a ${esc(m.plan_nombre)}${EXENTA || p.total === 0 ? '' : ` · ${pesos(p.total)}`}
    </button>`;
  }).join('');

  $('#accionesSinCupo').innerHTML = ampliables
    + `<a class="btn ${tiene.length ? 'btn--linea' : 'btn--ambar'}" href="planes.html?destino=${volver}">
         ${tiene.length ? 'Ver todos los planes' : 'Ver los planes'}
       </a>`;
}

function pintarResumenPublicacion() {
  const caja = $('#resumenPublicacion');
  if (!caja) return;

  const m = membresiaElegida();
  const e = estado.equipo;
  const titulo = [e.anio, nombreMarca(e.marca) || e.marca, e.modelo].filter(Boolean).join(' ') || 'Su equipo';

  if (!m) {
    caja.innerHTML = `
      <h3 class="pedido__titulo">Falta un cupo</h3>
      <p class="pedido__vacio">${icono('i-etiqueta')} ${esc(titulo)} está listo para publicarse. Solo falta el sitio donde ponerlo.</p>`;
    $('#btnPublicar').disabled = true;
    $('#btnPublicar').textContent = 'Publicar anuncio';
    return;
  }

  const dias = m.fin ? diasRestantes(m.fin) : null;
  $('#btnPublicar').disabled = false;
  $('#btnPublicar').textContent = 'Publicar anuncio';

  caja.innerHTML = `
    <h3 class="pedido__titulo">Se publica ahora</h3>
    <dl class="pedido__lista">
      <div><dt>Equipo</dt><dd>${esc(titulo)}</dd></div>
      <div><dt>Nivel</dt><dd>${esc(m.plan_nombre)}${m.destacado ? ' · sale destacado' : ''}</dd></div>
      <div><dt>Fotografías</dt><dd class="num">${estado.fotos.length} de ${m.fotos_maximas}</dd></div>
      <div><dt>Vigencia</dt><dd>${dias === null ? 'Sin caducidad' : `${dias} ${dias === 1 ? 'día' : 'días'}`}</dd></div>
      <div class="pedido__total"><dt>Costo</dt><dd class="num">${EXENTA
    ? 'Sin costo' : 'Ninguno · usa un cupo que ya pagó'}</dd></div>
    </dl>
    <p class="pedido__nota">Puede cambiarlo de nivel cuando quiera desde <a href="panel.html">su panel</a>, sin volver a publicarlo.</p>`;
}

function pintarPasoFinal() {
  pintarSinCupo();
  pintarResumenPublicacion();
  pintarFotos();
}

async function montarPasoConfirmar() {
  await cargarMembresias();

  /* Quien llega sin ninguna capacidad contratada se va derecho a los
     planes, sin recorrer cinco pasos para chocar al final. Solo si no
     tiene NADA: a quien le sobra un cupo no se le enseña un precio. */
  if (haySesion() && !MEMBRESIAS.length && params().get('sincupos') !== '1') {
    guardarBorrador();
    location.href = `planes.html?destino=${encodeURIComponent('publicar.html')}`;
    return;
  }

  $('#accionesSinCupo').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('[data-ampliar]');
    if (!btn) return;

    const m = MEMBRESIAS.find((x) => x.id === btn.dataset.ampliar);
    if (!m) return;

    const p = precioAmpliacion({
      precioUnitario: m.precio_unitario,
      cupoActual: m.anuncios_incluidos,
      cupoNuevo: m.anuncios_incluidos + 1,
      dias: m.dias_ciclo || 30,
      diasRestantes: diasRestantes(m.fin) ?? (m.dias_ciclo || 30),
    });

    const texto = EXENTA || p.total === 0
      ? `Añadir un cupo a ${m.plan_nombre} sin costo. ¿Confirma?`
      : `Añadir un cupo a ${m.plan_nombre} cuesta ${pesos(p.total)} por los días que le quedan.\n\n¿Confirma?`;
    if (!confirm(texto)) return;

    btn.disabled = true;
    try {
      const r = await api(`/membresias/${encodeURIComponent(m.id)}/ampliar`, {
        metodo: 'POST', cuerpo: { cupo: m.anuncios_incluidos + 1 },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');
      await cargarMembresias();
      pintarPasoFinal();
    } catch (e) {
      btn.disabled = false;
      avisoPaso($('.paso[data-paso="confirmar"]'), e.message);
    }
  });

  $('#aceptaCondiciones').addEventListener('change', (e) => {
    if (e.target.checked) avisoPaso($('.paso[data-paso="confirmar"]'), '');
  });
}

function validarConfirmar(seccion) {
  if (!membresiaElegida()) {
    avisoPaso(seccion, 'Necesita un cupo libre para publicar este equipo.');
    return false;
  }
  if (!$('#aceptaCondiciones').checked) {
    avisoPaso(seccion, 'Debe aceptar las condiciones de publicación.');
    return false;
  }
  avisoPaso(seccion, '');
  return true;
}

/* ── Publicación ────────────────────────────────────────── */

/* Fecha en palabras, para la confirmación. Vivía en el paso de pago y
   se fue con él; la usa el resumen del anuncio publicado. */
const fechaCorta = (d) =>
  d.toLocaleDateString('es-DO', { day: 'numeric', month: 'long', year: 'numeric' });

/* El borrador, con la forma que espera POST /api/anuncios. Ningún
   importe viaja aquí: publicar ya no cobra. Lo único que se manda es
   en qué membresía va el anuncio, y el servidor comprueba que sea de
   esta organización y que le quede sitio. */
function anuncioParaApi() {
  const e = estado.equipo;
  return {
    membresia: (membresiaElegida() || {}).id || null,

    categoria: e.categoria,
    subcategoria: e.subcategoria,
    marca: e.marca,
    modelo: e.modelo,
    anio: Number(e.anio),
    condicion: e.condicion,
    usoValor: Number(soloDigitos(e.uso)) || null,
    usoUnidad: e.unidad,

    /* Tren motriz. Se recogía en el paso 1, se guardaba en el borrador
       y NO se mandaba: el formulario lo preguntaba, el anunciante lo
       rellenaba y llegaba al servidor en blanco. En un cabezote es de
       lo primero que pregunta el comprador, así que el anuncio salía
       sin el dato que más pesa en la decisión.

       El servidor los ignora en las categorías que no los piden, así
       que mandarlos siempre no ensucia una excavadora. */
    motorMarca: e.motorMarca || '',
    motorModelo: e.motorModelo || '',
    transmisionMarca: e.transmisionMarca || '',
    transmisionModelo: e.transmisionModelo || '',

    serie: e.serie,
    potencia: e.potencia,
    peso: e.peso,
    implementos: e.implementos,
    descripcion: e.descripcion,
    provincia: e.provincia,
    municipio: e.ciudad,

    precio: Number(soloDigitos(estado.precio.monto)) || null,
    moneda: estado.precio.moneda,
    modalidadPrecio: estado.precio.modalidad,
    precioMinimo: Number(soloDigitos(estado.precio.minimo)) || null,
    itbisIncluido: estado.precio.itbisIncluido,
    permuta: estado.precio.permuta,
    financiamiento: estado.precio.financiamiento,

    // Van los dos tamaños: el catálogo pinta la miniatura y la ficha
    // la completa. Son rutas, no imágenes; las subió procesarImagen().
    fotos: estado.fotos.slice(0, limiteFotos()).map((f) => ({ url: f.url, miniatura: f.miniatura })),

    // Rutas también: el archivo lo subió procesarVideo(). El servidor
    // vuelve a recortar al tope del plan, porque esto viene del
    // navegador y ahí no se decide qué se contrató.
    videos: estado.videos.slice(0, limiteVideos())
      .map((v) => ({ url: v.url, poster: v.poster, duracion: v.duracion })),
    telefonos: estado.contacto.telefonos.filter((t) => telefonoValido(t.numero)),
    sucursal: estado.contacto.sucursal || null,
  };
}

function pintarConfirmacion(respuesta) {
  const anuncio = respuesta.anuncio;
  const m = respuesta.membresia;
  const equipo = esc(`${anuncio.anio} ${anuncio.marca} ${anuncio.modelo}`);

  const libres = m && m.libres;
  const cabecera = `
    <h2 class="publicado__titulo">Anuncio publicado</h2>
    <p class="publicado__texto">
      ${equipo} ya está visible en el catálogo y empieza a recibir contactos.
      ${anuncio.vence
        ? `Se publica hasta el ${fechaCorta(new Date(anuncio.vence))}.`
        : 'No tiene fecha de caducidad.'}
    </p>`;

  // Publicar nunca cobra: el importe se liquidó al contratar la
  // capacidad, en su propia página y con su propio comprobante.
  const filasCobro = `<div><dt>Costo</dt><dd>${EXENTA
    ? 'Sin costo · cuenta interna'
    : 'Ninguno · ocupó un cupo que ya tenía'}</dd></div>`;

  $('#publicar').hidden = true;
  const caja = $('#publicado');
  caja.hidden = false;
  caja.innerHTML = `
    <div class="publicado__sello">${icono('i-check')}</div>
    ${cabecera}

    <dl class="publicado__datos">
      <div><dt>Referencia del anuncio</dt><dd class="num">${esc(anuncio.id.slice(0, 8).toUpperCase())}</dd></div>
      <div><dt>Nivel</dt><dd>${esc(m ? m.plan_nombre : '—')}</dd></div>
      ${filasCobro}
      <div><dt>Cupos libres que le quedan</dt><dd class="num">${libres === null || libres === undefined
        ? 'Sin límite' : libres}</dd></div>
      <div><dt>Fotografías publicadas</dt><dd class="num">${anuncio.fotos.length}</dd></div>
    </dl>

    <p class="publicado__nota">
      Enviamos la confirmación a <b>${esc(estado.contacto.correo)}</b>.
      Desde <a href="panel.html">su panel</a> puede seguir las visitas, cambiar el nivel de
      este equipo o marcarlo como vendido para liberar su cupo.
    </p>

    <div class="acciones acciones--pie">
      <a class="btn btn--ambar btn--grande" href="equipo.html?id=${encodeURIComponent(anuncio.id)}">Ver el anuncio</a>
      <a class="btn btn--linea btn--grande" href="panel.html">Ir a mi panel</a>
      <a class="btn btn--linea btn--grande" href="publicar.html">Publicar otro equipo</a>
    </div>`;
  caja.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Publica. Una sola llamada, sin cobro de por medio: el anuncio ocupa
   un cupo de lo que la organización ya tiene contratado.

   Antes eran dos operaciones —comprar capacidad y después publicar— y
   había que explicarle al anunciante qué pasaba si la segunda fallaba
   con la primera ya cobrada. Ese enredo desapareció al sacar el cobro
   de aquí: la capacidad se contrata en planes.html, y esto solo
   publica.

   Sin sesión se guarda el borrador y se manda a crear la cuenta:
   volverá aquí con todo lo escrito intacto. */
async function publicar() {
  const btn = $('#btnPublicar');
  const seccion = $('.paso[data-paso="confirmar"]');

  if (!haySesion()) {
    guardarBorrador();
    location.href = 'cuenta.html?destino=publicar.html&crear=1';
    return;
  }

  btn.disabled = true;
  btn.classList.add('btn--ocupado');
  btn.textContent = 'Publicando…';

  const restaurar = (mensaje) => {
    btn.disabled = false;
    btn.classList.remove('btn--ocupado');
    avisoPaso(seccion, mensaje);
    pintarPasoFinal();
    seccion.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  try {
    const respuesta = await api('/anuncios', { metodo: 'POST', cuerpo: anuncioParaApi() });
    if (!respuesta) return restaurar('No hay conexión con el servidor. Vuelva a intentarlo; su borrador está guardado.');
    borrarBorrador();
    pintarConfirmacion(respuesta);
  } catch (e) {
    /* Si el servidor dice que no queda sitio, se vuelve a leer la
       capacidad: puede haber cambiado en otra pestaña, y así el paso
       ofrece ampliar en vez de repetir un error. */
    await cargarMembresias();
    restaurar(e.message);
  }
}

/* ── Vista previa y resumen lateral ─────────────────────── */

function textoPrecioPreview() {
  const monto = Number(soloDigitos(estado.precio.monto));
  if (!monto) return 'Precio pendiente';
  return montoConMoneda(estado.precio.monto, estado.precio.moneda);
}

function pintarVistaPrevia() {
  const caja = $('#vistaPrevia');
  if (!caja) return;

  const e = estado.equipo;
  const titulo = [e.anio, e.marca, e.modelo].filter(Boolean).join(' ') || 'Tu equipo';
  const uso = soloDigitos(e.uso) ? `${miles(Number(soloDigitos(e.uso)))} ${e.unidad}` : 'Uso pendiente';
  // El distintivo depende del nivel del cupo que vaya a ocupar.
  const destacado = !!(membresiaElegida() || {}).destacado;

  caja.innerHTML = `
    <p class="vista-previa__rotulo">${icono('i-buscar')} Así se verá en el catálogo</p>
    <div class="aviso aviso--previa">
      <span class="aviso__foto">
        ${destacado ? '<span class="marca-esq">Destacado</span>' : ''}
        ${estado.fotos.length
          ? `<img src="${esc(estado.fotos[0].url)}" alt="Portada del anuncio">`
          : icono('i-hex-doble', 'fantasma')}
      </span>
      <span class="aviso__nombre">${esc(titulo)}</span>
      <span class="aviso__specs num">${esc(uso)}${e.provincia ? ` · ${esc(e.provincia)}` : ''}</span>
      <span class="aviso__precio num">${esc(textoPrecioPreview())}</span>
      ${estado.precio.modalidad === 'ofertas' ? '<span class="pastilla pastilla--ambar">Acepta ofertas</span>' : ''}
    </div>
    ${e.subcategoria ? `<p class="vista-previa__nota">${esc(nombreCategoria(e.categoria))} · ${esc(e.subcategoria)}</p>` : ''}`;
}

function pintarResumenPedido() {
  const caja = $('#resumenPedido');
  if (!caja) return;

  /* Aquí no hay pedido que resumir: publicar no cobra. Lo que se dice
     es dónde va a caer el anuncio y qué le queda después, que es la
     información que de verdad le sirve mientras rellena la ficha. */
  const m = membresiaElegida();

  if (!m) {
    caja.innerHTML = haySesion()
      ? `<h3 class="pedido__titulo">Le falta un cupo</h3>
         <p class="pedido__vacio">${icono('i-etiqueta')} Complete la ficha igual: al final podrá añadir un cupo o contratar un plan, y su borrador no se pierde.</p>`
      : `<p class="pedido__vacio">${icono('i-etiqueta')} Entre a su cuenta al terminar para publicar el equipo.</p>`;
    return;
  }

  caja.innerHTML = `
    <h3 class="pedido__titulo">Sin costo adicional</h3>
    <dl class="pedido__lista">
      <div><dt>Se publica en</dt><dd>${esc(m.plan_nombre)}</dd></div>
      <div><dt>Fotografías</dt><dd class="num">hasta ${m.fotos_maximas}</dd></div>
      <div><dt>Cupos libres</dt><dd class="num">${m.libres === null ? 'Sin límite' : m.libres}</dd></div>
      <div class="pedido__total"><dt>Total</dt><dd class="num">${EXENTA ? 'Sin costo' : 'Ya pagado'}</dd></div>
    </dl>`;
}

/* ── Navegación entre pasos ─────────────────────────────── */

const VALIDADORES = {
  equipo: validarEquipo,
  fotos: validarFotos,
  precio: validarPrecio,
  contacto: validarContacto,
  confirmar: validarConfirmar,
};

function pintarPasos() {
  const nav = $('#pasosNav');
  nav.innerHTML = PASOS.map((p, i) => `
    <li class="pasos__it${i === estado.paso ? ' pasos__it--activo' : ''}${i < estado.paso ? ' pasos__it--hecho' : ''}">
      <button type="button" class="pasos__btn" data-ir="${i}"${i > estado.paso ? ' disabled' : ''}
        ${i === estado.paso ? 'aria-current="step"' : ''}>
        <span class="pasos__num num">${i < estado.paso ? '✓' : i + 1}</span>
        <span class="pasos__cuerpo">
          <b>${esc(p.nombre)}</b>
          <span>${esc(p.detalle)}</span>
        </span>
      </button>
    </li>`).join('');

  $$('.paso').forEach((s) => { s.hidden = s.dataset.paso !== PASOS[estado.paso].id; });

  const ultimo = estado.paso === PASOS.length - 1;
  $('#btnAtras').hidden = estado.paso === 0;
  $('#btnSiguiente').hidden = ultimo;
  $('#btnPublicar').hidden = !ultimo;
  $('#progresoTexto').textContent = `Paso ${estado.paso + 1} de ${PASOS.length}`;
  $('#progresoBarra').style.setProperty('--avance', `${((estado.paso + 1) / PASOS.length) * 100}%`);

  if (ultimo) pintarPasoFinal();
}

function irAPaso(i) {
  estado.paso = Math.max(0, Math.min(PASOS.length - 1, i));
  pintarPasos();
  guardarBorrador();
  const caja = $('#publicar');
  if (caja.getBoundingClientRect().top < 0) caja.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* Vuelca los campos del paso visible al estado. Se hace al avanzar y
   no en cada tecla: el borrador se guarda igual y el DOM no se toca
   más de lo necesario. */
function leerPaso(id) {
  if (id === 'equipo') {
    Object.assign(estado.equipo, {
      categoria: $('#e-categoria').value,
      subcategoria: $('#e-subcategoria').value,
      marca: $('#e-marca').value,
      modelo: modeloElegido(),
      motorMarca: ($('#e-motor-marca') || {}).value || '',
      motorModelo: ($('#e-motor-modelo') || {}).value || '',
      transmisionMarca: ($('#e-trans-marca') || {}).value || '',
      transmisionModelo: ($('#e-trans-modelo') || {}).value || '',
      anio: $('#e-anio').value,
      condicion: $('#e-condicion').value,
      uso: $('#e-uso').value,
      unidad: $('#e-unidad').value,
      serie: $('#e-serie').value.trim(),
      potencia: $('#e-potencia').value.trim(),
      peso: $('#e-peso').value.trim(),
      provincia: $('#e-provincia').value,
      ciudad: $('#e-ciudad').value.trim(),
      implementos: $('#e-implementos').value.trim(),
      descripcion: $('#e-descripcion').value.trim(),
    });
  } else if (id === 'precio') {
    Object.assign(estado.precio, {
      monto: $('#p-monto').value,
      moneda: $('#p-moneda').value,
      minimo: $('#p-minimo').value,
      itbisIncluido: $('#p-itbis').checked,
      permuta: $('#p-permuta').checked,
      financiamiento: $('#p-financiamiento').checked,
    });
  } else if (id === 'contacto') {
    leerTelefonos();
    Object.assign(estado.contacto, {
      nombre: $('#c-nombre').value.trim(),
      correo: $('#c-correo').value.trim(),
      sucursal: $('#c-sucursal').value,
      horario: $('#c-horario').value,
      web: $('#c-web').value.trim(),
      preferencia: $('#c-preferencia').value,
    });
  }
}

/* Vuelve a poner el borrador en los campos al recargar la página. */
function volcarEstadoAlFormulario() {
  const e = estado.equipo;
  $('#e-categoria').value = e.categoria;
  $('#e-modelo').value = e.modelo;
  $('#e-anio').value = e.anio;
  $('#e-uso').value = e.uso;
  $('#e-unidad').value = e.unidad;
  $('#e-serie').value = e.serie;
  $('#e-potencia').value = e.potencia;
  $('#e-peso').value = e.peso;
  $('#e-ciudad').value = e.ciudad;
  $('#e-implementos').value = e.implementos;
  $('#e-descripcion').value = e.descripcion;
  // marca, provincia y condición se llenan por script: se asignan
  // después de que app.js haya poblado sus <option>.
  $('#e-marca').value = e.marca;
  $('#e-provincia').value = e.provincia;
  $('#e-condicion').value = e.condicion;

  $('#p-monto').value = estado.precio.monto;
  $('#p-minimo').value = estado.precio.minimo;
  $('#p-itbis').checked = estado.precio.itbisIncluido;
  $('#p-permuta').checked = estado.precio.permuta;
  $('#p-financiamiento').checked = estado.precio.financiamiento;

  const c = estado.contacto;
  $('#c-nombre').value = c.nombre;
  $('#c-correo').value = c.correo;
  $('#c-horario').value = c.horario;
  $('#c-web').value = c.web;
  $('#c-preferencia').value = c.preferencia;

}

/* ── Arranque ───────────────────────────────────────────── */

async function montarPublicador() {
  const caja = $('#publicar');
  if (!caja) return;

  // La sesión decide qué capacidad tiene ya contratada y qué identidad
  // firma el anuncio. Se resuelve ANTES de pintar: el paso del plan
  // necesita saber si le quedan cupos libres para enseñar un camino o
  // el otro.
  await cargarSesion();

  /* Si hay condiciones nuevas sin aceptar, se avisa arriba. No bloquea
     el asistente: quien esté a medio escribir un anuncio puede seguir.
     Lo que no va a poder es publicarlo, y eso lo impide el servidor. */
  montarAvisoLegal('publicar');

  const previo = leerBorrador();
  const idDuplicar = params().get('duplicar');
  let copia = null;

  // Duplicar (MET-04): se resuelve ANTES de tocar `estado`, porque el
  // texto de confirmación necesita saber de qué equipo es la copia.
  if (idDuplicar && haySesion()) {
    copia = await cargarCopia(idDuplicar);
    if (copia) {
      const aMedio = previo && (previo.equipo.marca || previo.equipo.modelo);
      if (aMedio && !window.confirm(
        `Tiene un anuncio a medio escribir. ¿Reemplazarlo por la copia de ${copia.origen ? copia.origen.nombre : 'este equipo'}?`,
      )) {
        copia = null;          // se conserva el borrador que ya tenía
      }
    }
    // Se quita el parámetro tanto si se usó la copia como si no: sin
    // esto, recargar la página vuelve a preguntar o a copiar de nuevo.
    history.replaceState(null, '', 'publicar.html');
  }

  const guardado = copia || previo;
  if (copia) {
    estado = copia;
    guardarBorrador();
  } else if (guardado) {
    estado = guardado;
    estado.paso = 0;    // se retoma desde el principio, con todo lleno
  }

  /* Con `await`: la categoría, la marca y el modelo son <select> que
     `montarPasoEquipo` llena de <option> al recibir la taxonomía del
     servidor, y `volcarEstadoAlFormulario` de aquí abajo solo puede
     asignarles un valor si esa opción ya existe. Sin esperar, la
     asignación llegaba antes que las opciones y un borrador —o una
     copia— se recuperaba con la ficha técnica en blanco: el número de
     serie sí quedaba (es un campo de texto), pero categoría, marca y
     modelo no. Nunca se vio porque hasta ahora nadie había podido
     probar esta pantalla en un navegador de verdad (ver 10-02-SUMMARY). */
  await montarPasoEquipo();
  montarPasoFotos();
  montarPasoVideos();
  montarPasoPrecio();
  montarPasoContacto();
  await montarPasoConfirmar();

  if (guardado) {
    volcarEstadoAlFormulario();
    /* La cadena es categoría → subcategoría → marca → modelo: cada
       nivel llena las <option> del siguiente al recibir su propio
       `change`, así que hay que disparar los cuatro EN ORDEN y no solo
       el primero. Antes solo se disparaba el de categoría y se
       reponía a mano el valor de subcategoría sin avisar a marca: la
       marca se quedaba con la lista vacía de «elija primero el tipo de
       equipo» y modelo nunca llegaba a existir como <option>, aunque
       `volcarEstadoAlFormulario` ya le hubiera puesto el valor un
       instante antes. */
    const e = estado.equipo;
    $('#e-categoria').dispatchEvent(new Event('change'));
    $('#e-subcategoria').value = e.subcategoria;
    $('#e-subcategoria').dispatchEvent(new Event('change'));
    $('#e-marca').value = e.marca;
    $('#e-marca').dispatchEvent(new Event('change'));

    const selModelo = $('#e-modelo');
    const modeloConocido = [...selModelo.options].some((o) => o.value === e.modelo);
    selModelo.value = modeloConocido ? e.modelo : OTRO_MODELO;
    selModelo.dispatchEvent(new Event('change'));
    if (!modeloConocido) $('#e-modelo-otro').value = e.modelo;

    /* Motor y transmisión, con la misma cadena: el `change` de la
       subcategoría de arriba ya llenó sus marcas, y el de cada marca
       llena sus modelos. Faltaba: al duplicar un camión —que es justo
       donde el comprador pregunta primero por el motor— el asistente
       salía con el tren motriz en blanco aunque la copia lo trajera, y
       el dealer tenía que volver a elegirlo. Vale igual para cualquier
       borrador recuperado. En una excavadora no hay valores y no pasa
       nada. */
    [
      ['#e-motor-marca', '#e-motor-modelo', e.motorMarca, e.motorModelo],
      ['#e-trans-marca', '#e-trans-modelo', e.transmisionMarca, e.transmisionModelo],
    ].forEach(([selMarca, selModeloTren, valorMarca, valorModelo]) => {
      const sm = $(selMarca);
      if (!sm || !valorMarca) return;
      sm.value = valorMarca;
      sm.dispatchEvent(new Event('change'));
      const smod = $(selModeloTren);
      if (smod && valorModelo) smod.value = valorModelo;
    });

    $('#avisoBorrador').hidden = false;
    if (copia) {
      $('#avisoBorrador span').textContent =
        `Copia de ${copia.origen ? copia.origen.nombre : 'un anuncio anterior'}. `
        + 'Cambie lo que sea distinto —número de serie, horas, precio y fotos— y publíquelo.';
    }
  } else if (idDuplicar && haySesion()) {
    // Se pidió duplicar pero la copia no llegó (ya no es suyo, o no hay
    // conexión) y no había ningún borrador que mostrar en su lugar: se
    // avisa aquí mismo en vez de dejarlo sin explicación.
    $('#avisoBorrador').hidden = false;
    $('#avisoBorrador span').textContent =
      'No se pudo cargar el anuncio para duplicar. Puede completar la ficha desde cero.';
  }

  // Los datos de contacto se rellenan con los de la cuenta: nadie
  // debería reescribir su propio nombre y correo en cada anuncio.
  if (haySesion()) {
    if (!$('#c-nombre').value) $('#c-nombre').value = SESION.usuario.nombre;
    if (!$('#c-correo').value) $('#c-correo').value = SESION.usuario.correo;
    if (!$('#listaTelefonos .tel-numero').value && SESION.usuario.telefono) {
      $('#listaTelefonos .tel-numero').value = formatearTelefono(SESION.usuario.telefono);
      leerTelefonos();
    }
  }

  $('#btnSiguiente').addEventListener('click', () => {
    const id = PASOS[estado.paso].id;
    const seccion = $(`.paso[data-paso="${id}"]`);
    leerPaso(id);
    if (!VALIDADORES[id](seccion)) {
      const primero = $('[aria-invalid], .paso__aviso', seccion);
      if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    irAPaso(estado.paso + 1);
  });

  $('#btnAtras').addEventListener('click', () => {
    leerPaso(PASOS[estado.paso].id);
    irAPaso(estado.paso - 1);
  });

  $('#pasosNav').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-ir]');
    if (!btn || btn.disabled) return;
    leerPaso(PASOS[estado.paso].id);
    irAPaso(Number(btn.dataset.ir));
  });

  $('#btnPublicar').addEventListener('click', () => {
    const seccion = $('.paso[data-paso="confirmar"]');
    if (!validarConfirmar(seccion)) return;
    publicar();
  });

  $('#btnDescartar').addEventListener('click', () => {
    borrarBorrador();
    location.href = 'publicar.html';
  });

  // La vista previa se actualiza mientras se escribe la ficha, y el
  // error de un campo desaparece en cuanto se corrige: mantenerlo en
  // rojo mientras se teclea la solución es ruido.
  caja.addEventListener('input', (ev) => {
    const contenedor = ev.target.closest('.campo-v--error, .campo-grupo');
    if (contenedor && contenedor.classList.contains('campo-v--error')) {
      contenedor.classList.remove('campo-v--error');
      const aviso = contenedor.querySelector('.campo-v__error');
      if (aviso) aviso.remove();
      ev.target.removeAttribute('aria-invalid');
    }
    leerPaso(PASOS[estado.paso].id);
    pintarVistaPrevia();
  });
  caja.addEventListener('change', () => {
    leerPaso(PASOS[estado.paso].id);
    pintarVistaPrevia();
    guardarBorrador();
  });

  // Enter no debe disparar un envío: el flujo lo manda la botonera.
  $('#formPublicar').addEventListener('submit', (ev) => ev.preventDefault());

  pintarPasos();
  pintarVistaPrevia();
  pintarResumenPedido();
}

document.addEventListener('DOMContentLoaded', montarPublicador);
