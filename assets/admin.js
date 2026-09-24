/* ═══════════════════════════════════════════════════════════
   MercaMaquinarias · Revisión de solicitudes de dealer

   Pantalla interna. Quien no tenga el permiso recibe 404 de la API y
   aquí ve lo mismo: la página no revela que exista una cola de
   revisión detrás.

   El expediente completo —con el RNC— no se pide al cargar la lista,
   sino al desplegar una solicitud concreta. Así el número reservado
   solo viaja cuando alguien va a cotejarlo de verdad.
   ═══════════════════════════════════════════════════════════ */

let ESTADO = 'pendiente';
let ABIERTA = null;   // id de la solicitud desplegada

const ROTULO = {
  pendiente: { vacio: 'No hay solicitudes pendientes. Todo revisado.', clase: '' },
  aprobada: { vacio: 'Todavía no ha aprobado ninguna solicitud.', clase: 'sol--aprobada' },
  rechazada: { vacio: 'No hay solicitudes rechazadas.', clase: 'sol--rechazada' },
};

function avisar(mensaje, bien = false) {
  const aviso = $('#avisoAdmin');
  aviso.hidden = !mensaje;
  aviso.className = `acceso__aviso${bien ? ' acceso__aviso--bien' : ''}`;
  aviso.textContent = mensaje || '';
}

const cuando = (iso) => (iso ? new Date(iso).toLocaleDateString('es-DO', {
  day: 'numeric', month: 'short', year: 'numeric',
}) : '—');

/* ── Pintado ────────────────────────────────────────────── */

function solicitudHTML(s) {
  const detalle = ABIERTA === s.id;
  const pendiente = s.estado === 'pendiente';

  return `<li class="sol ${ROTULO[s.estado].clase}" data-id="${esc(s.id)}" data-org="${esc(s.organizacion_id)}">
    <div class="sol__cabeza">
      <b class="sol__nombre">${esc(s.razon_social)}</b>
      ${s.nombre_comercial ? `<span class="sol__meta">opera como ${esc(s.nombre_comercial)}</span>` : ''}
      <span class="sol__fecha">${cuando(s.creada)}</span>
    </div>
    <p class="sol__meta">
      ${esc(s.encargado)}${s.cargo ? ` · ${esc(s.cargo)}` : ''} · ${esc(s.correo_solicitante)}
    </p>
    <p class="sol__meta">
      ${s.equipos_inventario != null ? `${miles(s.equipos_inventario)} en inventario` : 'Inventario sin indicar'}
      · ${s.equipos_publicar != null ? `${miles(s.equipos_publicar)} a publicar` : 'sin indicar cuántos publicará'}
    </p>
    ${s.estado === 'rechazada' && s.motivo ? `<p class="sol__meta"><b>Motivo:</b> ${esc(s.motivo)}</p>` : ''}

    <div class="sol__acciones">
      <button type="button" class="btn btn--linea btn--chico" data-accion="ver">
        ${detalle ? 'Ocultar' : 'Ver expediente'}
      </button>
      ${pendiente ? `
        <button type="button" class="btn btn--ambar btn--chico" data-accion="aprobar">Aprobar</button>
        <button type="button" class="btn btn--linea btn--chico" data-accion="rechazar">Rechazar</button>` : ''}
      ${s.estado === 'aprobada' ? `
        <!-- El sello es distinto de la aprobación: aprobar significa
             que la empresa existe y puede publicar; verificar, que
             alguien comprobó su documentación a fondo. Hasta ahora
             solo se podía dar por línea de comandos, así que un dealer
             registrado por el sitio no lo obtenía nunca. -->
        <button type="button" class="btn btn--linea btn--chico" data-accion="verificar">
          ${s.verificada ? 'Retirar el sello de verificado' : 'Dar el sello de verificado'}
        </button>` : ''}
    </div>

    <div class="sol__detalle" id="detalle-${esc(s.id)}" ${detalle ? '' : 'hidden'}></div>
  </li>`;
}

function pintar(solicitudes) {
  const lista = $('#listaSolicitudes');
  const vacio = $('#colaVacia');

  lista.innerHTML = solicitudes.map(solicitudHTML).join('');
  vacio.hidden = solicitudes.length > 0;
  vacio.textContent = ROTULO[ESTADO].vacio;
}

/* Expediente. Es la única vista con el RNC entero, y por eso lleva su
   propio recordatorio: quien lo está viendo debe saber que ese dato no
   sale de aquí. */
function detalleHTML(s) {
  const dato = (rotulo, valor, clase = '') =>
    (valor == null || valor === '' ? '' : `<div><dt>${esc(rotulo)}</dt><dd class="${clase}">${esc(valor)}</dd></div>`);

  const ubicacion = [s.direccion, s.municipio, s.provincia].filter(Boolean).join(', ');

  return `
    <dl class="sol__datos">
      ${dato('Razón social', s.razon_social)}
      ${dato('Nombre comercial', s.nombre_comercial)}
      ${dato('RNC', s.rnc, 'num')}
      ${dato('Años operando', s.anios_operando, 'num')}
      ${dato('Dirección', ubicacion)}
      ${dato('Teléfono', s.telefono, 'num')}
      ${dato('Web', s.web)}
      ${dato('Encargado', s.encargado)}
      ${dato('Cargo', s.cargo)}
      ${dato('Abrió la cuenta', s.solicitante)}
      ${dato('Correo', s.correo_solicitante)}
      ${dato('Equipos en inventario', s.equipos_inventario, 'num')}
      ${dato('Equipos a publicar', s.equipos_publicar, 'num')}
      ${dato('Tipos de equipo', s.tipos_equipo)}
      ${dato('Cómo nos conoció', s.origen)}
      ${dato('Comentario', s.comentario)}
      ${dato('Revisada', s.revisada ? `${cuando(s.revisada)}${s.revisor ? ` por ${s.revisor}` : ''}` : null)}
    </dl>
    <p class="sol__reservado">
      El RNC es un dato reservado. Sirve para comprobar la empresa contra el registro
      mercantil y no debe copiarse a ningún mensaje, ficha ni página pública.
    </p>`;
}

/* ── Acciones ───────────────────────────────────────────── */

async function cargar() {
  avisar('');
  let datos;
  try {
    // Sin `silencioso`: aquí un error sí debe verse. La sesión pudo
    // caducar mientras la pestaña estaba abierta.
    datos = await api(`/admin/solicitudes?estado=${ESTADO}`);
  } catch (e) {
    return avisar(e.message);
  }
  if (!datos) return avisar('No hay conexión con el servidor.');

  const n = datos.pendientes;
  $('#adminSub').textContent = n === 0
    ? 'No queda ninguna solicitud por revisar.'
    : `${n} ${n === 1 ? 'solicitud pendiente' : 'solicitudes pendientes'} de revisión.`;

  pintar(datos.solicitudes || []);
}

async function alternarDetalle(id, caja, boton) {
  if (ABIERTA === id) {
    ABIERTA = null;
    caja.hidden = true;
    boton.textContent = 'Ver expediente';
    return;
  }

  try {
    const datos = await api(`/admin/solicitudes/${encodeURIComponent(id)}`);
    if (!datos) throw new Error('No hay conexión con el servidor.');
    ABIERTA = id;
    caja.innerHTML = detalleHTML(datos.solicitud);
    caja.hidden = false;
    boton.textContent = 'Ocultar';
  } catch (e) {
    avisar(e.message);
  }
}

/* Rechazar exige un motivo escrito: es lo que se le manda a la empresa
   por correo, y sin él la negativa genera una respuesta preguntando
   qué pasó que hay que contestar igual. */
function pedirMotivo(fila, alConfirmar) {
  if (fila.querySelector('.sol__motivo')) return;

  const caja = document.createElement('div');
  caja.className = 'sol__motivo';
  caja.innerHTML = `
    <textarea placeholder="Por qué no se aprueba. Se le envía a la empresa tal cual." aria-label="Motivo del rechazo"></textarea>
    <div class="sol__acciones">
      <button type="button" class="btn btn--ambar btn--chico" data-accion="confirmar-rechazo">Confirmar rechazo</button>
      <button type="button" class="btn btn--linea btn--chico" data-accion="cancelar-rechazo">Cancelar</button>
    </div>`;
  fila.appendChild(caja);
  caja.querySelector('textarea').focus();

  caja.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.accion === 'cancelar-rechazo') return caja.remove();

    const motivo = caja.querySelector('textarea').value.trim();
    if (!motivo) return avisar('Escriba el motivo del rechazo.');
    alConfirmar(motivo);
  });
}

/* El sello de verificado. Es una accion aparte de aprobar: aprobar
   dice que la empresa existe y puede publicar; verificar, que
   alguien comprobo su documentacion a fondo. */
async function alternarVerificada(fila) {
  const idOrg = fila.dataset.org;
  const boton = fila.querySelector('[data-accion="verificar"]');
  const dar = /Dar el sello/.test(boton.textContent);
  try {
    await api(`/admin/organizaciones/${encodeURIComponent(idOrg)}/verificar`, {
      metodo: 'POST', cuerpo: { verificada: dar },
    });
    cargar();
  } catch (e) {
    avisar(e.message || 'No se pudo cambiar el sello.');
  }
}

async function resolver(id, decision, motivo) {
  try {
    const datos = await api(`/admin/solicitudes/${encodeURIComponent(id)}`, {
      metodo: 'POST',
      cuerpo: { decision, motivo },
    });
    if (!datos) throw new Error('No hay conexión con el servidor.');

    ABIERTA = null;
    // Recargar primero: `cargar` limpia el aviso al empezar, y hacerlo
    // al revés borraba la confirmación en cuanto se pintaba.
    await cargar();
    avisar(decision === 'aprobar'
      ? `${datos.solicitud.razon_social} quedó aprobada. Le avisamos por correo.`
      : `${datos.solicitud.razon_social} quedó rechazada. Le enviamos el motivo por correo.`, true);
  } catch (e) {
    avisar(e.message);
  }
}

/* ═══ Flota propia ═══════════════════════════════════════
   Los equipos de alquiler y las camas de transporte. Estaban escritos
   a mano en assets/data.js, así que quitar una excavadora del alquiler
   obligaba a editar código y volver a desplegar.

   Se desactiva en vez de borrarse: una cama retirada del servicio
   suele volver, y borrarla perdería el histórico de cotizaciones que
   la mencionan. El botón de eliminar existe para lo creado por error.
   ═══════════════════════════════════════════════════════ */

let SERVICIO = 'alquiler';

function avisarFlota(mensaje, bien = false) {
  const aviso = $('#avisoFlota');
  aviso.hidden = !mensaje;
  aviso.className = `acceso__aviso${bien ? ' acceso__aviso--bien' : ''}`;
  aviso.textContent = mensaje || '';
}

function flotaHTML(f) {
  /* La capacidad manda sobre todo lo demás: es lo que distingue un tipo
     de equipo de otro para quien lo alquila. */
  const medida = SERVICIO === 'transporte'
    ? (f.capacidad_texto || `hasta ${Number(f.capacidad) || '—'} t`)
    : [f.capacidad_texto, `por ${f.unidad || 'día'}`].filter(Boolean).join(' · ');

  const fotos = f.fotos || [];

  return `<li class="sol${f.activo ? '' : ' sol--rechazada'}" data-id="${esc(f.id)}">
    <div class="sol__cabeza">
      <b class="sol__nombre">${esc(f.nombre)}</b>
      <span class="sol__meta">${esc(medida)}</span>
      ${f.activo ? '' : '<span class="pastilla pastilla--roja">Fuera de servicio</span>'}
    </div>
    ${f.detalle ? `<p class="sol__meta">${esc(f.detalle)}</p>` : ''}
    ${fotos.length
      ? `<div class="flota-fotos">${fotos.map((x) => `<img src="${esc(x.url)}" alt="${esc(x.alt || f.nombre)}">`).join('')}</div>`
      : '<p class="sol__meta sol__meta--aviso">Sin fotografías. Con una sola imagen el cliente espera esa máquina en concreto; con varias de marcas distintas entiende que se le entrega la disponible.</p>'}
    <div class="sol__acciones">
      <button type="button" class="btn btn--linea btn--chico" data-flota="alternar">
        ${f.activo ? 'Retirar del servicio' : 'Volver a poner'}
      </button>
      <button type="button" class="btn btn--linea btn--chico" data-flota="subir">Subir</button>
      <button type="button" class="btn btn--linea btn--chico" data-flota="borrar">Eliminar</button>
    </div>
  </li>`;
}

async function cargarFlota() {
  avisarFlota('');
  try {
    const datos = await api(`/admin/flota/${SERVICIO}`);
    if (!datos) return avisarFlota('No hay conexión con el servidor.');
    $('#listaFlota').innerHTML = datos.flota.length
      ? datos.flota.map(flotaHTML).join('')
      : '<li class="revision__vacio">No hay nada en esta flota todavía.</li>';
  } catch (e) {
    avisarFlota(e.message);
  }
}

/* Sube un puesto intercambiando el orden con el de arriba. Mover con
   dos botones es más fiable que arrastrar, sobre todo desde el móvil,
   que es donde se administra esto la mitad de las veces. */
async function subirEnFlota(id) {
  const filas = [...document.querySelectorAll('#listaFlota .sol')];
  const i = filas.findIndex((f) => f.dataset.id === id);
  if (i <= 0) return;

  const anterior = filas[i - 1].dataset.id;
  await api(`/admin/flota/item/${encodeURIComponent(id)}`, { metodo: 'PATCH', cuerpo: { orden: i - 1 } });
  await api(`/admin/flota/item/${encodeURIComponent(anterior)}`, { metodo: 'PATCH', cuerpo: { orden: i } });
  await cargarFlota();
}

function montarFlota() {
  if (!document.getElementById('listaFlota')) return;

  // Alquiler pide unidad de cobro; transporte, capacidad.
  const pintarCampos = () => {
    $('#campoUnidad').hidden = SERVICIO !== 'alquiler';
    $('#campoCapacidad').hidden = SERVICIO !== 'transporte';
  };

  $$('[data-servicio]').forEach((boton) => {
    boton.addEventListener('click', () => {
      SERVICIO = boton.dataset.servicio;
      $$('[data-servicio]').forEach((b) => {
        b.setAttribute('aria-selected', String(b === boton));
        b.classList.toggle('btn--ambar', b === boton);
        b.classList.toggle('btn--linea', b !== boton);
      });
      pintarCampos();
      cargarFlota();
    });
  });
  pintarCampos();

  $('#listaFlota').addEventListener('click', async (ev) => {
    const boton = ev.target.closest('button[data-flota]');
    if (!boton) return;
    const fila = boton.closest('.sol');
    const id = fila.dataset.id;

    try {
      switch (boton.dataset.flota) {
        case 'alternar': {
          const activo = !fila.classList.contains('sol--rechazada');
          await api(`/admin/flota/item/${encodeURIComponent(id)}`, {
            metodo: 'PATCH', cuerpo: { activo: !activo },
          });
          await cargarFlota();
          avisarFlota(activo ? 'Retirado del servicio.' : 'De vuelta en servicio.', true);
          break;
        }
        case 'subir':
          await subirEnFlota(id);
          break;
        case 'borrar': {
          const nombre = fila.querySelector('.sol__nombre').textContent;
          // eslint-disable-next-line no-alert
          if (!confirm(`¿Eliminar «${nombre}» de la flota? Esto no se puede deshacer.`)) return;
          await api(`/admin/flota/item/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
          await cargarFlota();
          avisarFlota('Eliminado.', true);
          break;
        }
        default:
      }
    } catch (e) {
      avisarFlota(e.message);
    }
  });

  /* Las fotos se suben al elegirlas, no al enviar: así el equipo ve si
     alguna falló antes de dar de alta el tipo. Se reducen en el
     navegador, igual que en publicar.js. */
  let FOTOS_FLOTA = [];
  const entradaFotos = $('#fl-fotos');
  entradaFotos.addEventListener('change', async () => {
    const archivos = [...(entradaFotos.files || [])].slice(0, 8);
    const estado = $('#flEstadoFotos');
    if (!archivos.length) { FOTOS_FLOTA = []; return; }

    estado.textContent = `Subiendo ${archivos.length}…`;
    try {
      FOTOS_FLOTA = [];
      for (const archivo of archivos) {
        // Secuencial y no en paralelo: ocho canvas a la vez en un móvil
        // se queda sin memoria y falla la última sin decir por qué.
        // eslint-disable-next-line no-await-in-loop
        FOTOS_FLOTA.push({ url: await reducirYSubir(archivo, 1200) });
      }
      estado.textContent = `${FOTOS_FLOTA.length} ${FOTOS_FLOTA.length === 1 ? 'fotografía lista' : 'fotografías listas'}.`;
    } catch (e) {
      FOTOS_FLOTA = [];
      estado.textContent = `No se pudieron subir: ${e.message}`;
    }
  });

  $('#formFlota').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const cuerpo = {
      nombre: $('#fl-nombre').value.trim(),
      detalle: $('#fl-detalle').value.trim(),
      capacidadTexto: $('#fl-capacidad-texto').value.trim(),
      icono: $('#fl-icono').value,
      fotos: FOTOS_FLOTA,
    };
    if (SERVICIO === 'alquiler') cuerpo.unidad = $('#fl-unidad').value;
    else cuerpo.capacidad = $('#fl-capacidad').value;

    try {
      const r = await api(`/admin/flota/${SERVICIO}`, { metodo: 'POST', cuerpo });
      if (!r) throw new Error('No hay conexión con el servidor.');
      $('#formFlota').reset();
      FOTOS_FLOTA = [];
      $('#flEstadoFotos').textContent = 'Varias, y de marcas distintas: enseñar una sola promete esa máquina en concreto.';
      $('#altaFlota').open = false;
      await cargarFlota();
      avisarFlota(`«${r.elemento.nombre}» añadido a ${SERVICIO}.`, true);
    } catch (e) {
      avisarFlota(e.message);
    }
  });

  cargarFlota();
}

/* ═══ Publicidad de la portada ═══════════════════════════ */

/* La imagen se sube antes de crear la campaña, por la misma ruta que
   las fotos de los anuncios: se guarda en disco y aquí solo queda la
   ruta. Se reduce en el navegador antes de mandarla, igual que en
   publicar.js, para no subir un archivo de cámara de 6 MB. */
let IMAGEN_PUB = null;

function avisarPub(mensaje, bien = false) {
  const aviso = $('#avisoPub');
  aviso.hidden = !mensaje;
  aviso.className = `acceso__aviso${bien ? ' acceso__aviso--bien' : ''}`;
  aviso.textContent = mensaje || '';
}

/* Las letras son las del tarifario que se le enseña al anunciante: así
   lo que se vende y lo que se administra se llaman igual. */
const NOMBRE_ESPACIO = {
  superior: 'A · Horizontal',
  catalogo: 'B · Catálogo',
  bloque: 'C · Bloque de portada',
  ficha: 'D · Ficha de equipo',
  'lateral-izq': 'E · Lateral izquierdo',
  'lateral-der': 'E · Lateral derecho',
  'movil-superior': 'F · Superior móvil',
  'movil-cuadro': 'G · Cuadro de portada',
  'movil-lista': 'H · Cuadro en listas',
};

/* Ancho al que se guarda la imagen de cada formato: el doble del que se
   ve, para que no salga borrosa en pantallas de mucha densidad. Subir
   un 1216×160 a 480 px lo dejaba ilegible. */
const ANCHO_SUBIDA = {
  superior: 1600,
  catalogo: 1280,
  bloque: 1200,
  ficha: 600,
  'lateral-izq': 480,
  'lateral-der': 480,
  'movil-superior': 640,
  'movil-cuadro': 672,
  'movil-lista': 672,
};

/* Una campaña puede estar encendida y aun así no verse: por eso el
   estado que se muestra es el REAL, no el valor de `activo`. */
function estadoPub(p) {
  const hoy = new Date().toISOString().slice(0, 10);
  if (!p.activo) return { texto: 'Apagada', clase: 'pastilla--roja' };
  if (p.desde && p.desde > hoy) return { texto: `Empieza el ${p.desde}`, clase: 'pastilla--ambar' };
  if (p.hasta && p.hasta < hoy) return { texto: `Terminó el ${p.hasta}`, clase: 'pastilla--roja' };
  return { texto: 'En portada', clase: 'pastilla--verde' };
}

function pubHTML(p) {
  const est = estadoPub(p);
  const ctr = p.impresiones
    ? `${miles(p.impresiones)} impresiones · ${miles(p.clics)} clics · ${((p.clics / p.impresiones) * 100).toFixed(1)} %`
    : 'Sin impresiones todavía';

  return `<li class="sol${est.clase === 'pastilla--verde' ? '' : ' sol--rechazada'}" data-id="${esc(p.id)}">
    <div class="sol__cabeza">
      <b class="sol__nombre">${esc(p.nombre)}</b>
      <span class="pastilla ${est.clase}">${esc(est.texto)}</span>
      <span class="sol__fecha">${esc(NOMBRE_ESPACIO[p.espacio] || p.espacio)}</span>
    </div>
    <p class="sol__meta">${p.anunciante ? `${esc(p.anunciante)} · ` : ''}${esc(ctr)}</p>
    <div class="pub-previa"><img src="${esc(p.imagen)}" alt="${esc(p.alt)}" loading="lazy"></div>
    <div class="sol__acciones">
      <button type="button" class="btn btn--linea btn--chico" data-pub="alternar">
        ${p.activo ? 'Apagar' : 'Encender'}
      </button>
      <button type="button" class="btn btn--linea btn--chico" data-pub="borrar">Eliminar</button>
    </div>
  </li>`;
}

async function cargarPub() {
  avisarPub('');
  try {
    const datos = await api('/admin/publicidad');
    if (!datos) return avisarPub('No hay conexión con el servidor.');
    $('#listaPub').innerHTML = datos.publicidad.length
      ? datos.publicidad.map(pubHTML).join('')
      : '<li class="revision__vacio">No hay campañas. La portada se ve sin espacios publicitarios.</li>';
  } catch (e) {
    avisarPub(e.message);
  }
}

/* Reduce la imagen en el navegador y la sube. Devuelve la ruta. */
function reducirYSubir(archivo, anchoMax) {
  return new Promise((resolver, rechazar) => {
    if (!archivo.type.startsWith('image/')) return rechazar(new Error('No es una imagen'));
    const lector = new FileReader();
    lector.onerror = () => rechazar(new Error('No se pudo leer el archivo'));
    lector.onload = () => {
      const img = new Image();
      img.onerror = () => rechazar(new Error('Imagen dañada'));
      img.onload = async () => {
        const escala = Math.min(1, anchoMax / img.width);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * escala);
        c.height = Math.round(img.height * escala);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        try {
          const r = await api('/fotos', { metodo: 'POST', cuerpo: { completa: c.toDataURL('image/jpeg', 0.85) } });
          resolver(r.completa);
        } catch (e) { rechazar(e); }
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

function montarPub() {
  if (!document.getElementById('listaPub')) return;

  $('#pub-imagen').addEventListener('change', async (ev) => {
    const archivo = ev.target.files[0];
    if (!archivo) return;
    const estado = $('#pubEstadoImagen');
    estado.textContent = 'Subiendo…';
    try {
      const ancho = ANCHO_SUBIDA[$('#pub-espacio').value] || 480;
      IMAGEN_PUB = await reducirYSubir(archivo, ancho);
      estado.textContent = 'Imagen lista.';
    } catch (e) {
      IMAGEN_PUB = null;
      estado.textContent = `No se pudo subir: ${e.message}`;
    }
  });

  $('#listaPub').addEventListener('click', async (ev) => {
    const boton = ev.target.closest('button[data-pub]');
    if (!boton) return;
    const fila = boton.closest('.sol');
    const id = fila.dataset.id;

    try {
      if (boton.dataset.pub === 'alternar') {
        const encendida = boton.textContent.trim() === 'Apagar';
        await api(`/admin/publicidad/${encodeURIComponent(id)}`, {
          metodo: 'PATCH', cuerpo: { activo: !encendida },
        });
        await cargarPub();
        avisarPub(encendida ? 'Campaña apagada.' : 'Campaña encendida.', true);
      } else {
        const nombre = fila.querySelector('.sol__nombre').textContent;
        // eslint-disable-next-line no-alert
        if (!confirm(`¿Eliminar la campaña «${nombre}»? Esto no se puede deshacer.`)) return;
        await api(`/admin/publicidad/${encodeURIComponent(id)}`, { metodo: 'DELETE' });
        await cargarPub();
        avisarPub('Campaña eliminada.', true);
      }
    } catch (e) {
      avisarPub(e.message);
    }
  });

  $('#formPub').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!IMAGEN_PUB) return avisarPub('Cargue la imagen del anuncio.');

    try {
      const r = await api('/admin/publicidad', {
        metodo: 'POST',
        cuerpo: {
          espacio: $('#pub-espacio').value,
          nombre: $('#pub-nombre').value.trim(),
          anunciante: $('#pub-anunciante').value.trim(),
          imagen: IMAGEN_PUB,
          enlace: $('#pub-enlace').value.trim(),
          alt: $('#pub-alt').value.trim(),
          desde: $('#pub-desde').value,
          hasta: $('#pub-hasta').value,
        },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');
      $('#formPub').reset();
      $('#pubEstadoImagen').textContent = 'JPG, PNG o WebP.';
      IMAGEN_PUB = null;
      $('#altaPub').open = false;
      await cargarPub();
      avisarPub(`«${r.anuncio.nombre}» ya está en la portada.`, true);
    } catch (e) {
      avisarPub(e.message);
    }
  });

  cargarPub();
}

/* ── Arranque ───────────────────────────────────────────── */

async function montarAdmin() {
  if (!document.getElementById('adminContenido')) return;

  await cargarSesion();

  /* Una sola llamada decide si esta página existe para quien la abre.
     `silencioso` devuelve null tanto si la API dice 404 como si el
     servidor no responde; ambos casos acaban igual, enseñando la
     página de no encontrada. Equivocarse hacia el lado de no mostrar
     la cola es el error barato. */
  if (!await api('/admin/solicitudes', { silencioso: true })) {
    $('#adminCargando').hidden = true;
    $('#adminSinAcceso').hidden = false;
    return;
  }

  $('#adminCargando').hidden = true;
  $('#adminContenido').hidden = false;

  /* Se filtra por `data-estado` y no por la clase del contenedor: hay
     dos bloques de filtros en la página —el de solicitudes y el de la
     flota— y engancharse a `.revision__filtros button` a secas ponía
     este manejador también en los botones de la flota, que dejaban
     ESTADO en undefined al pulsarlos. */
  $$('[data-estado]').forEach((boton) => {
    boton.addEventListener('click', () => {
      ESTADO = boton.dataset.estado;
      ABIERTA = null;
      $$('.revision__filtros button').forEach((b) => {
        b.setAttribute('aria-selected', String(b === boton));
        b.classList.toggle('btn--ambar', b === boton);
        b.classList.toggle('btn--linea', b !== boton);
      });
      cargar();
    });
  });

  $('#listaSolicitudes').addEventListener('click', (ev) => {
    const boton = ev.target.closest('button[data-accion]');
    if (!boton) return;

    const fila = boton.closest('.sol');
    if (!fila) return;
    const id = fila.dataset.id;

    switch (boton.dataset.accion) {
      case 'ver':
        return alternarDetalle(id, fila.querySelector('.sol__detalle'), boton);
      case 'aprobar':
        return resolver(id, 'aprobar');
      case 'rechazar':
        return pedirMotivo(fila, (motivo) => resolver(id, 'rechazar', motivo));
      case 'verificar':
        return alternarVerificada(fila);
      default:
    }
  });

  await cargar();
  montarFlota();
  montarPub();
  montarHeroe();
}

/* ── Fotografía de la portada ───────────────────────────────
   Dos caminos al mismo sitio: subir una imagen propia o tomar la de un
   equipo ya publicado. El segundo existe porque casi siempre la mejor
   foto disponible ya está en el catálogo, y volver a subirla sería
   pedirle al equipo un trabajo que no hace falta. */

let HEROE_SUBIDA = null;

function pintarHeroe(heroe) {
  const previa = $('#heroePrevia');
  const fijada = heroe && heroe.imagen;

  previa.innerHTML = fijada
    ? `<img src="${esc(heroe.imagen)}" alt="${esc(heroe.alt || 'Fotografía de la portada')}">
       <span class="heroe-ajuste__estado">Fijada por el equipo</span>`
    : `<span class="heroe-ajuste__vacia">Sin fotografía fijada</span>
       <span class="heroe-ajuste__estado">La portada rota entre las últimas máquinas publicadas</span>`;

  $('#btnQuitarHeroe').hidden = !fijada;
  if (heroe && heroe.alt) $('#heroe-alt').value = heroe.alt;

  /* Solo se ofrecen las que la API puede fijar: archivos del propio
     sitio. Poner en la lista una que va a rechazarse convierte el
     desplegable en una trampa. */
  const sel = $('#heroe-catalogo');
  const candidatas = (heroe && heroe.delCatalogo ? heroe.delCatalogo : []).filter((o) => o.fijable);
  sel.length = 1;
  candidatas.forEach((o) => {
    sel.add(new Option(o.alt.replace(' publicado en MercaMaquinarias', ''), o.imagen));
  });

  sel.disabled = !candidatas.length;
  sel.options[0].text = candidatas.length
    ? 'Elija un equipo del catálogo'
    : 'Todavía no hay equipos con fotografía propia';
}

async function montarHeroe() {
  const form = $('#formHeroe');
  if (!form) return;

  const aviso = (mensaje, ok = false) => {
    const el = $('#avisoHeroe');
    el.hidden = !mensaje;
    el.textContent = mensaje || '';
    el.classList.toggle('acceso__aviso--ok', ok);
  };

  const recargar = async () => {
    const datos = await api('/portada', { silencioso: true });
    if (datos) pintarHeroe(datos.heroe);
  };
  await recargar();

  const entrada = $('#heroe-imagen');
  entrada.addEventListener('change', async () => {
    const archivo = entrada.files && entrada.files[0];
    const estado = $('#heroeEstadoImagen');
    if (!archivo) { HEROE_SUBIDA = null; return; }

    estado.textContent = 'Subiendo…';
    try {
      // 1920 de ancho: es el tope útil para un fondo a pantalla
      // completa y evita mandar los 6 MB que sale de una cámara.
      HEROE_SUBIDA = await reducirYSubir(archivo, 1920);
      estado.textContent = 'Imagen lista. Pulse «Fijar esta fotografía».';
      $('#heroe-catalogo').value = '';
    } catch (e) {
      HEROE_SUBIDA = null;
      estado.textContent = `No se pudo subir: ${e.message}`;
    }
  });

  // Elegir del catálogo descarta la subida a medias, y al revés: solo
  // una de las dos puede acabar fijada.
  $('#heroe-catalogo').addEventListener('change', (e) => {
    if (!e.target.value) return;
    HEROE_SUBIDA = null;
    entrada.value = '';
    $('#heroeEstadoImagen').textContent = 'JPG, PNG o WebP. Apaisada y de al menos 1600 px de ancho.';
    const texto = e.target.options[e.target.selectedIndex].text;
    if (!$('#heroe-alt').value) $('#heroe-alt').value = `${texto} publicado en MercaMaquinarias`;
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    aviso('');

    const imagen = HEROE_SUBIDA || $('#heroe-catalogo').value;
    if (!imagen) return aviso('Suba una fotografía o elija un equipo del catálogo.');

    try {
      const r = await api('/admin/portada', {
        metodo: 'PATCH', cuerpo: { imagen, alt: $('#heroe-alt').value.trim() },
      });
      if (!r) throw new Error('No hay conexión con el servidor.');
      HEROE_SUBIDA = null;
      entrada.value = '';
      pintarHeroe(r.heroe);
      aviso('Fotografía fijada. Ya se ve en la portada.', true);
    } catch (e) { aviso(e.message); }
  });

  $('#btnQuitarHeroe').addEventListener('click', async () => {
    if (!confirm('¿Quitar la fotografía fijada?\n\nLa portada volverá a rotar entre las últimas máquinas publicadas.')) return;
    try {
      const r = await api('/admin/portada', { metodo: 'PATCH', cuerpo: { imagen: '', alt: '' } });
      if (!r) throw new Error('No hay conexión con el servidor.');
      $('#heroe-alt').value = '';
      pintarHeroe(r.heroe);
      aviso('Quitada. La portada vuelve a rotar.', true);
    } catch (e) { aviso(e.message); }
  });

  montarLegales();
  montarFacturasAdmin();
}

/* ── Comprobantes ───────────────────────────────────────── */

let MES_FACTURAS = null;

const TIPO_CORTO = {
  recibo: 'Recibo',
  factura_consumo: 'Consumo',
  factura_credito_fiscal: 'Crédito fiscal',
  nota_credito: 'Nota de crédito',
};

function pintarFacturasAdmin(datos) {
  const lista = datos.facturas || [];
  $('#facturasVacio').hidden = lista.length > 0;

  $('#listaFacturasAdmin').innerHTML = lista.map((f) => {
    const cuando = new Date(f.fecha);
    /* Los dos envíos, por separado: que el del cliente rebotara no
       significa que la copia interna no saliera, y al revés. Verlos
       juntos escondería justo el caso que hay que atender. */
    const marca = (fechaEnvio, etiqueta) => (fechaEnvio
      ? `<span class="envio envio--si">${etiqueta} ✓</span>`
      : `<span class="envio envio--no">${etiqueta} ✗</span>`);

    return `<tr>
      <td class="num">${cuando.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' })}
        <span class="tabla-legales__hora">${cuando.getFullYear()}</span></td>
      <td class="num">${esc(f.numero)}
        <span class="tabla-legales__sub">${esc(TIPO_CORTO[f.tipo] || f.tipo)}${f.ncf ? ` · ${esc(f.ncf)}` : ''}</span>
        ${f.anulado_por ? '<span class="pastilla pastilla--ambar">anulada</span>' : ''}</td>
      <td>${esc(f.razon_social || 'Consumidor final')}
        ${f.rnc ? `<span class="tabla-legales__sub">RNC ${esc(f.rnc)}</span>` : ''}</td>
      <td class="num">RD$${Number(f.total).toLocaleString('en-US')}</td>
      <td>${marca(f.enviada_cliente, 'cliente')} ${marca(f.enviada_interna, 'interna')}</td>
      <td class="acciones-fila">
        <a class="btn btn--linea btn--chico" href="/api/facturas/${esc(f.id)}.pdf" target="_blank" rel="noopener">PDF</a>
        <button type="button" class="btn btn--linea btn--chico" data-factura="${esc(f.id)}" data-accion="reenviar">Reenviar</button>
        ${f.tipo !== 'nota_credito' && !f.anulado_por
    ? `<button type="button" class="btn btn--linea btn--chico" data-factura="${esc(f.id)}" data-accion="anular">Anular</button>`
    : ''}
      </td>
    </tr>`;
  }).join('');

  /* Estado de las secuencias, y el aviso si alguna se está acabando. */
  $('#listaSecuencias').innerHTML = (datos.secuencias || []).map((s) => `<tr>
      <td class="num">${esc(s.tipo)}<span class="tabla-legales__sub">${esc(s.nombre)}</span></td>
      <td class="num">${esc(s.prefijo)}${String(s.desde).padStart(8, '0')} – ${String(s.hasta).padStart(8, '0')}</td>
      <td class="num">${String(s.siguiente).padStart(8, '0')}</td>
      <td class="num">${s.quedan}</td>
      <td>${s.usa_sitio ? 'la usa el sitio' : 'solo contabilidad'}</td>
    </tr>`).join('');

  /* Los recibos que salieron sin NCF, a la espera del rango que
     faltaba. Va debajo del listado y no en un aviso: no es una alarma,
     es trabajo pendiente que se despacha cuando llegue la secuencia. */
  const pendientes = datos.pendientes || [];
  const caja = $('#cajaPendientes');
  if (caja) {
    caja.hidden = !pendientes.length;
    $('#cuentaPendientes').textContent = String(pendientes.length);
    $('#listaPendientes').innerHTML = pendientes.map((f) => {
      const cuando = new Date(f.fecha);
      return `<tr>
        <td class="num">${cuando.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
        <td class="num">${esc(f.numero)}</td>
        <td>${esc(f.razon_social || 'Consumidor final')}</td>
        <td class="num">RD${Number(f.total).toLocaleString('en-US')}</td>
      </tr>`;
    }).join('');
  }

  const bajas = datos.bajas || [];
  $('#avisoNcf').innerHTML = bajas.length
    ? `<div class="aviso-legal">
         <p class="aviso-legal__titulo">Se están acabando los comprobantes</p>
         <p class="aviso-legal__texto">Quedan pocos en ${bajas.map((b) => `<b>${esc(b.tipo)}</b> (${b.quedan})`).join(' y ')}.
           Sin NCF disponible no se puede emitir una factura fiscal: pida un rango nuevo a la DGII antes de que se agote.</p>
       </div>`
    : '';
}

async function cargarFacturasAdmin() {
  const datos = await api(`/admin/facturas${MES_FACTURAS ? `?mes=${MES_FACTURAS}` : ''}`,
    { silencioso: true });
  if (!datos) return null;
  pintarFacturasAdmin(datos);
  const csv = $('#btnCsv');
  if (csv) csv.href = `/api/admin/facturas.csv${MES_FACTURAS ? `?mes=${MES_FACTURAS}` : ''}`;
  return datos;
}

async function montarFacturasAdmin() {
  if (!$('#listaFacturasAdmin')) return;
  if (!await cargarFacturasAdmin()) return;

  $('#mesFacturas').addEventListener('change', (ev) => {
    MES_FACTURAS = ev.target.value || null;
    cargarFacturasAdmin();
  });

  /* Cargar una secuencia nueva. Es el gesto que pone al sistema a
     emitir facturas de consumo: al guardarse una B02 activa y marcada
     para el sitio, los clientes sin RNC dejan de recibir el recibo. */
  const formSec = $('#formSecuencia');
  if (formSec) {
    formSec.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const eco = $('#ecoSecuencia');
      eco.textContent = 'Cargando…';
      try {
        const r = await api('/admin/secuencias', {
          metodo: 'POST',
          cuerpo: {
            tipo: $('#secTipo').value,
            nombre: $('#secNombre').value,
            desde: $('#secDesde').value,
            hasta: $('#secHasta').value,
            vence: $('#secVence').value || null,
            usaSitio: $('#secUsaSitio').checked,
          },
        });
        if (!r) throw new Error('No hay conexión con el servidor.');
        eco.textContent = `${r.secuencia.nueva ? 'Cargada' : 'Actualizada'} ${r.secuencia.tipo}: quedan ${r.secuencia.quedan}.`;
        formSec.reset();
        $('#secUsaSitio').checked = true;
        cargarFacturasAdmin();
      } catch (e) { eco.textContent = e.message; }
    });
  }

  $('#listaFacturasAdmin').addEventListener('click', async (ev) => {
    const boton = ev.target.closest('button[data-factura]');
    if (!boton) return;
    const { factura, accion } = boton.dataset;

    if (accion === 'anular') {
      /* Anular emite una nota de crédito con su NCF, y eso consume un
         número autorizado que no se recupera. Por eso se pregunta. */
      const motivo = prompt('¿Por qué se anula este comprobante?\n\n'
        + 'Se emitirá una nota de crédito con su propio NCF. El comprobante original\n'
        + 'NO se borra: queda marcado como anulado.');
      if (motivo === null) return;

      boton.disabled = true;
      try {
        const r = await api(`/admin/facturas/${factura}/anular`, {
          metodo: 'POST', cuerpo: { motivo },
        });
        if (!r) throw new Error('No hay conexión con el servidor.');
        aviso(`Nota de crédito ${r.nota.numero} emitida.`, true);
        cargarFacturasAdmin();
      } catch (e) { aviso(e.message); boton.disabled = false; }
      return;
    }

    boton.disabled = true;
    boton.textContent = 'Enviando…';
    try {
      const r = await api(`/admin/facturas/${factura}/reenviar`, { metodo: 'POST' });
      if (!r) throw new Error('No hay conexión con el servidor.');
      aviso('Reenviado.', true);
      cargarFacturasAdmin();
    } catch (e) { aviso(e.message); boton.disabled = false; boton.textContent = 'Reenviar'; }
  });
}

/* ── Aceptaciones legales ─────────────────────────────────── */

/* Quién aceptó qué y cuándo.
 *
 * Se enseña la VERSIÓN y la FECHA, no un «sí»: la pregunta que esta
 * tabla tiene que poder responder es «demuestre que esta persona
 * aceptó este texto», y para eso hace falta saber qué texto regía ese
 * día. Con un booleano no se responde nada.
 *
 * La IP se guarda pero NO se pinta por defecto: es dato personal y en
 * una lista de doscientas filas no aporta nada. Está en la respuesta de
 * la API para quien la necesite. */
let DOC_LEGAL = null;

function pintarLegales(datos) {
  const cuerpo = $('#listaLegales');
  const lista = datos.aceptaciones || [];

  $('#legalesVacio').hidden = lista.length > 0;
  cuerpo.innerHTML = lista.map((a) => {
    const doc = (datos.documentos || []).find((d) => d.id === a.documento);
    const cuando = new Date(a.aceptado_en);
    const vigente = doc && doc.version === a.version;
    return `<tr>
      <td class="num">${cuando.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' })}
        <span class="tabla-legales__hora">${cuando.toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' })}</span></td>
      <td>${esc(a.nombre || '')}${a.empresa ? `<span class="tabla-legales__sub">${esc(a.empresa)}</span>` : ''}
        <span class="tabla-legales__sub">${esc(a.correo)}</span></td>
      <td>${esc((doc && doc.nombre) || a.documento)}</td>
      <td class="num">${esc(a.version)}${vigente ? '' : ' <span class="pastilla pastilla--ambar">anterior</span>'}</td>
      <td class="num">${esc(a.ip || '—')}</td>
    </tr>`;
  }).join('');
}

async function cargarLegales() {
  const datos = await api(`/admin/legales${DOC_LEGAL ? `?documento=${encodeURIComponent(DOC_LEGAL)}` : ''}`,
    { silencioso: true });
  if (!datos) return null;
  pintarLegales(datos);
  return datos;
}

async function montarLegales() {
  if (!$('#listaLegales')) return;

  const datos = await cargarLegales();
  if (!datos) return;

  /* Los filtros se pintan desde la lista que manda el servidor y no
     escritos aquí: si mañana hay un documento más, aparece solo. */
  const filtros = $('#filtrosLegales');
  filtros.innerHTML = [{ id: '', nombre: 'Todos' }, ...(datos.documentos || [])]
    .map((d, i) => `<button type="button" class="btn btn--chico ${i === 0 ? 'btn--ambar' : 'btn--linea'}"
      data-doc="${esc(d.id)}" role="tab" aria-selected="${i === 0}">${esc(d.nombre)}</button>`).join('');

  filtros.addEventListener('click', (ev) => {
    const boton = ev.target.closest('button[data-doc]');
    if (!boton) return;
    DOC_LEGAL = boton.dataset.doc || null;
    [...filtros.children].forEach((b) => {
      b.setAttribute('aria-selected', String(b === boton));
      b.classList.toggle('btn--ambar', b === boton);
      b.classList.toggle('btn--linea', b !== boton);
    });
    cargarLegales();
  });
}

document.addEventListener('DOMContentLoaded', montarAdmin);
