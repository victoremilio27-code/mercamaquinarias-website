/* ═══════════════════════════════════════════════════════════
   mi-pagina.js — el editor de la página del dealer.

   CÓMO ESTÁ PENSADO

   Se guarda solo. No hay un botón «guardar» general porque nadie lo
   pulsa: se sale del campo y se guarda ese campo. Publicar SÍ es un
   botón, porque es el único momento en que algo se hace público y eso
   tiene que ser una decisión, no un efecto secundario de escribir.

   La lista de reglas está siempre a la vista y se refresca con cada
   guardado. Es lo que convierte «no puedo publicar» en «me faltan dos
   cosas y son estas». Sin ella, el dealer rellena, pulsa publicar y
   recibe un error, que es la peor forma de enterarse.

   Nada se pinta con innerHTML sin escapar: los textos son del propio
   dealer, pero acaban en una página pública.
   ═══════════════════════════════════════════════════════════ */

(() => {
  const el = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  /* Estado en memoria. Se recarga del servidor tras cada cambio: la
     verdad está allí, y así dos pestañas abiertas no se pisan sin que
     se note. */
  let estado = null;

  /* Modo soporte (fase 7, ADMIN-04). `mi-pagina.html?org=<id>`, abierto
     por el personal desde la consola, edita la página de esa empresa en
     su nombre: el mismo editor, las mismas reglas, contra las rutas de
     administración, que anotan cada escritura en la bitácora. Si quien
     lo abre no es del personal, la API responde 404 y se enseña «no
     encontrada», nunca el editor de otro. */
  const ORG = new URLSearchParams(location.search).get('org');
  const SOPORTE = !!ORG;
  const BASE = SOPORTE ? `/admin/organizaciones/${encodeURIComponent(ORG)}/pagina` : '/mi-pagina';

  const REDES = [
    ['instagram', 'Instagram', 'https://instagram.com/…'],
    ['facebook', 'Facebook', 'https://facebook.com/…'],
    ['whatsapp', 'WhatsApp', '(809) 000-0000'],
    ['youtube', 'YouTube', 'https://youtube.com/…'],
    ['tiktok', 'TikTok', 'https://tiktok.com/@…'],
    ['linkedin', 'LinkedIn', 'https://linkedin.com/company/…'],
  ];

  const NOMBRES_BLOQUE = {
    inventario: 'Mis equipos publicados',
    texto: 'Texto libre',
    destacados: 'Equipos destacados',
    marcas: 'Marcas que representa',
    servicios: 'Servicios que ofrece',
    galeria: 'Galería de fotos',
    sucursales: 'Sus sucursales',
  };

  /* Los tres que se pintan solos con lo que ya hay en la base: no
     tienen nada que editar aquí dentro. */
  const SIN_CUERPO = ['inventario', 'galeria', 'sucursales'];

  /* `api()` LANZA cuando el servidor responde con error, no devuelve
     null: sin envolverla, un «el logotipo tiene que subirse al sitio»
     se convertía en una promesa rechazada y el editor se quedaba
     parado sin decir nada. Aquí se convierte en un aviso en pantalla,
     que es donde el dealer lo va a leer. */
  async function llamar(ruta, opciones) {
    try {
      return await api(ruta, conMotivo(ruta, opciones));
    } catch (e) {
      avisar(e.message || 'No se pudo guardar', false);
      return null;
    }
  }

  /* En modo soporte, cada escritura sobre la página lleva el motivo del
     campo de la franja, que acaba en la bitácora. La subida de fotos
     (/fotos) no: no escribe en la página de nadie hasta que se guarda. */
  function conMotivo(ruta, opciones) {
    if (!SOPORTE || !opciones || !opciones.metodo || opciones.metodo === 'GET') return opciones;
    if (!String(ruta).startsWith(BASE)) return opciones;
    const motivo = el('motivoSoporte').value.trim();
    return { ...opciones, cuerpo: { ...(opciones.cuerpo || {}), ...(motivo ? { motivo } : {}) } };
  }

  function avisar(texto, bien) {
    const caja = el('aviso');
    caja.textContent = texto;
    caja.className = `aviso-linea ${bien ? 'aviso-linea--bien' : 'aviso-linea--mal'}`;
    caja.hidden = false;
    clearTimeout(avisar.reloj);
    avisar.reloj = setTimeout(() => { caja.hidden = true; }, 4000);
  }

  /* ── Imágenes ──────────────────────────────────────────────
     Se reducen en el navegador antes de subir. El logotipo mantiene
     PNG: los reductores del resto del sitio pintan fondo blanco y
     exportan JPEG, lo que le come la transparencia a cualquier
     logotipo y lo deja con un recuadro blanco alrededor. */
  function reducir(archivo, anchoMax, conservarAlfa) {
    return new Promise((resolver, rechazar) => {
      const lector = new FileReader();
      lector.onerror = () => rechazar(new Error('No se pudo leer el archivo'));
      lector.onload = () => {
        const img = new Image();
        img.onerror = () => rechazar(new Error('Ese archivo no es una imagen'));
        img.onload = () => {
          const escala = Math.min(1, anchoMax / img.width);
          const lienzo = document.createElement('canvas');
          lienzo.width = Math.round(img.width * escala);
          lienzo.height = Math.round(img.height * escala);
          const ctx = lienzo.getContext('2d');
          if (!conservarAlfa) {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, lienzo.width, lienzo.height);
          }
          ctx.drawImage(img, 0, 0, lienzo.width, lienzo.height);
          resolver(conservarAlfa
            ? lienzo.toDataURL('image/png')
            : lienzo.toDataURL('image/jpeg', 0.85));
        };
        img.src = lector.result;
      };
      lector.readAsDataURL(archivo);
    });
  }

  async function subir(archivo, anchoMax, conservarAlfa) {
    const datos = await reducir(archivo, anchoMax, conservarAlfa);
    const r = await llamar('/fotos', { metodo: 'POST', cuerpo: { completa: datos } });
    return r && r.completa;
  }

  /* ── Guardado ───────────────────────────────────────────── */

  async function guardar(cambios) {
    const r = await llamar(BASE, { metodo: 'PATCH', cuerpo: cambios });
    if (!r) return false;
    /* Mezclar y no sustituir: la respuesta del PATCH no trae `direccion`
       ni `editadaPorSoporte` ni `organizacion`, y sustituir escondía el
       botón «Verla como la ven» en cuanto se guardaba un campo. */
    estado = { ...estado, ...r };
    pintarReglas();
    pintarCabecera();
    return true;
  }

  /* ── Pintado ────────────────────────────────────────────── */

  function pintarCabecera() {
    const p = estado.pagina;
    const publicada = p.estado_pagina === 'publicada';

    if (SOPORTE) {
      /* El personal no publica ni despublica: las rutas ni existen. */
      el('estadoPagina').textContent = publicada
        ? 'Está publicada: los cambios se ven al momento.'
        : 'Está en borrador: los cambios no se ven hasta que la empresa la publique.';
      el('btnPublicar').hidden = true;
      el('btnDespublicar').hidden = true;
    } else {
      el('estadoPagina').textContent = publicada
        ? 'Su página está publicada y cualquiera puede verla.'
        : 'Su página está en borrador. Solo la ve usted hasta que la publique.';

      el('btnPublicar').hidden = publicada;
      el('btnDespublicar').hidden = !publicada;
      el('btnPublicar').disabled = !estado.puedePublicar;
    }

    /* El dealer tiene derecho a saber que el personal tocó su página;
       quién de dentro fue está en la bitácora, no aquí. */
    const nota = el('notaSoporte');
    if (!SOPORTE && estado.editadaPorSoporte) {
      const fecha = new Date(estado.editadaPorSoporte).toLocaleDateString('es-DO', {
        day: 'numeric', month: 'long', year: 'numeric',
      });
      nota.textContent = `El equipo de MercaMaquinarias editó su página el ${fecha}.`;
      nota.hidden = false;
    } else {
      nota.hidden = true;
    }

    const verla = el('btnVerla');
    if (publicada && estado.direccion) {
      verla.href = estado.direccion;
      verla.hidden = false;
    } else {
      verla.hidden = true;
    }
  }

  function pintarReglas() {
    const cumplidas = estado.reglas.filter((r) => r.cumple).length;
    el('resumenReglas').textContent = `${cumplidas} de ${estado.reglas.length} resueltas`;

    el('listaReglas').innerHTML = estado.reglas.map((r) => `
      <li class="regla ${r.cumple ? 'regla--si' : 'regla--no'}">
        <span class="regla__marca" aria-hidden="true">${r.cumple ? '✓' : '·'}</span>
        <div class="regla__cuerpo">
          <b class="regla__titulo">${esc(r.titulo)}</b>
          ${r.detalle ? `<span class="regla__detalle">${esc(r.detalle)}</span>` : ''}
          ${r.cumple ? '' : `<p class="regla__falta">${esc(r.falta)}</p>`}
        </div>
      </li>`).join('');

    /* El contador de la descripción, que es la regla que más cuesta
       entender sin un número delante. */
    const reglaDesc = estado.reglas.find((r) => r.id === 'descripcion');
    if (reglaDesc) el('ayudaDescripcion').textContent = reglaDesc.detalle || '';
  }

  function pintarBasico() {
    const p = estado.pagina;
    el('c-nombre').value = p.nombre || '';
    el('c-lema').value = p.lema || '';
    el('c-descripcion').value = p.descripcion || '';
    el('c-correo').value = p.correo_publico || '';
    el('c-telefono').value = p.telefono_publico || '';
    el('c-web').value = p.web || '';
    pintarPrevia('logo', p.logo);
    pintarPrevia('banner', p.banner);
  }

  function pintarPrevia(cual, ruta) {
    const caja = el(cual === 'logo' ? 'previaLogo' : 'previaBanner');
    const quitar = el(cual === 'logo' ? 'quitarLogo' : 'quitarBanner');
    if (ruta) {
      caja.innerHTML = `<img src="${esc(ruta)}" alt="">`;
      quitar.hidden = false;
    } else {
      caja.innerHTML = '<span class="editor-imagen__hueco">Sin imagen</span>';
      quitar.hidden = true;
    }
  }

  function pintarRedes() {
    const puestas = new Map(estado.pagina.enlaces.map((e) => [e.tipo, e.valor]));
    el('camposRedes').innerHTML = REDES.map(([tipo, nombre, pista]) => `
      <label class="campo-v"><span>${esc(nombre)}</span>
        <input type="text" data-red="${tipo}" maxlength="200"
          placeholder="${esc(pista)}" value="${esc(puestas.get(tipo) || '')}">
      </label>`).join('');
  }

  function pintarGaleria() {
    const fotos = estado.pagina.galeria;
    el('galeriaEditor').innerHTML = fotos.length
      ? fotos.map((f) => `
        <li class="galeria-editor__foto">
          <img src="${esc(f.url)}" alt="${esc(f.alt || '')}">
          <button type="button" class="galeria-editor__quitar" data-quitar-foto="${esc(f.id)}"
            aria-label="Quitar fotografía">×</button>
        </li>`).join('')
      : '<li class="galeria-editor__vacio">Todavía no ha subido ninguna.</li>';
  }

  function pintarBloques() {
    const bloques = estado.pagina.secciones;
    if (!bloques.length) {
      el('listaBloques').innerHTML =
        '<li class="bloques__vacio">Su página no tiene bloques todavía. '
        + 'Empiece por «Mis equipos publicados», que es el que más se mira.</li>';
      return;
    }

    el('listaBloques').innerHTML = bloques.map((b, i) => `
      <li class="bloque ${b.visible ? '' : 'bloque--oculto'}" data-bloque="${esc(b.id)}">
        <div class="bloque__cabeza">
          <div class="bloque__orden">
            <button type="button" data-subir="${esc(b.id)}" ${i === 0 ? 'disabled' : ''}
              aria-label="Subir bloque">▲</button>
            <button type="button" data-bajar="${esc(b.id)}" ${i === bloques.length - 1 ? 'disabled' : ''}
              aria-label="Bajar bloque">▼</button>
          </div>
          <div class="bloque__identidad">
            <span class="bloque__tipo">${esc(NOMBRES_BLOQUE[b.tipo] || b.tipo)}</span>
            <input type="text" class="bloque__titulo" data-titulo="${esc(b.id)}"
              value="${esc(b.titulo || '')}" placeholder="Título del bloque" maxlength="120">
          </div>
          <div class="bloque__acciones">
            <button type="button" class="enlace-plano" data-visible="${esc(b.id)}">
              ${b.visible ? 'Ocultar' : 'Mostrar'}
            </button>
            <button type="button" class="enlace-plano enlace-plano--peligro"
              data-borrar="${esc(b.id)}">Quitar</button>
          </div>
        </div>
        ${cuerpoDeBloque(b)}
      </li>`).join('');
  }

  function cuerpoDeBloque(b) {
    if (SIN_CUERPO.includes(b.tipo)) {
      const explica = {
        inventario: 'Se llena solo con los equipos que tenga publicados.',
        galeria: 'Enseña las fotografías que suba arriba.',
        sucursales: 'Enseña las sucursales que tenga dadas de alta en el panel.',
      };
      return `<p class="bloque__nota">${esc(explica[b.tipo])}</p>`;
    }

    if (b.tipo === 'texto') {
      return `<textarea class="bloque__texto" data-texto="${esc(b.id)}" rows="4"
        maxlength="4000" placeholder="Escriba aquí">${esc(b.cuerpo.texto || '')}</textarea>`;
    }

    if (b.tipo === 'marcas' || b.tipo === 'servicios') {
      const pista = b.tipo === 'marcas'
        ? 'Caterpillar, JCB, Komatsu'
        : 'Mantenimiento preventivo, Repuestos, Inspección';
      return `<input type="text" class="bloque__lista" data-lista="${esc(b.id)}"
        value="${esc((b.cuerpo.lista || []).join(', '))}"
        placeholder="${esc(pista)}, separados por comas">`;
    }

    if (b.tipo === 'destacados') {
      return '<p class="bloque__nota">Enseña los equipos que tenga en nivel Destacado. '
        + 'Si no tiene ninguno, este bloque muestra los más recientes.</p>';
    }

    return '';
  }

  function pintarTodo() {
    pintarCabecera();
    pintarReglas();
    pintarBasico();
    pintarRedes();
    pintarGaleria();
    pintarBloques();
  }

  /* ── Escuchas ───────────────────────────────────────────── */

  function conectar() {
    /* Los campos básicos se guardan al salir del campo, y solo si
       cambiaron: sin esa comprobación, entrar y salir de un campo
       manda una petición por cada paso del tabulador. */
    const campos = [
      ['c-nombre', 'nombre'],
      ['c-lema', 'lema'],
      ['c-descripcion', 'descripcion'],
      ['c-correo', 'correoPublico'],
      ['c-telefono', 'telefonoPublico'],
      ['c-web', 'web'],
    ];

    campos.forEach(([idCampo, clave]) => {
      const campo = el(idCampo);
      let anterior = campo.value;
      campo.addEventListener('blur', async () => {
        if (campo.value === anterior) return;
        anterior = campo.value;
        if (await guardar({ [clave]: campo.value })) avisar('Guardado', true);
      });
    });

    /* El contador de la descripción se mueve mientras se escribe, no
       al salir: es lo que hace ver que faltan caracteres. */
    el('c-descripcion').addEventListener('input', () => {
      const n = el('c-descripcion').value.trim().length;
      el('ayudaDescripcion').textContent = n >= 80
        ? `${n} caracteres`
        : `${n} de 80 caracteres`;
    });

    /* Imágenes. */
    el('campoLogo').addEventListener('change', async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      const ruta = await subir(archivo, 600, true);
      if (ruta && await guardar({ logo: ruta })) { pintarPrevia('logo', ruta); avisar('Logotipo guardado', true); }
      e.target.value = '';
    });

    el('campoBanner').addEventListener('change', async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      const ruta = await subir(archivo, 1920, false);
      if (ruta && await guardar({ banner: ruta })) { pintarPrevia('banner', ruta); avisar('Portada guardada', true); }
      e.target.value = '';
    });

    el('quitarLogo').addEventListener('click', async () => {
      if (await guardar({ logo: '' })) { pintarPrevia('logo', null); avisar('Logotipo quitado', true); }
    });
    el('quitarBanner').addEventListener('click', async () => {
      if (await guardar({ banner: '' })) { pintarPrevia('banner', null); avisar('Portada quitada', true); }
    });

    /* Redes: se mandan todas juntas, que son seis campos. */
    el('btnGuardarRedes').addEventListener('click', async () => {
      const enlaces = [...document.querySelectorAll('[data-red]')]
        .map((c) => ({ tipo: c.dataset.red, valor: c.value.trim() }))
        .filter((e) => e.valor);

      const r = await llamar(`${BASE}/enlaces`, { metodo: 'PUT', cuerpo: { enlaces } });
      if (!r) return;
      estado.pagina.enlaces = r.enlaces;
      avisar('Redes guardadas', true);
    });

    /* Galería. */
    el('campoGaleria').addEventListener('change', async (e) => {
      const archivo = e.target.files[0];
      if (!archivo) return;
      const ruta = await subir(archivo, 1600, false);
      if (!ruta) return;
      const r = await llamar(`${BASE}/galeria`, { metodo: 'POST', cuerpo: { url: ruta } });
      if (r) { estado.pagina.galeria = r.galeria; pintarGaleria(); avisar('Fotografía añadida', true); }
      e.target.value = '';
    });

    el('galeriaEditor').addEventListener('click', async (e) => {
      const boton = e.target.closest('[data-quitar-foto]');
      if (!boton) return;
      const r = await llamar(`${BASE}/galeria/${boton.dataset.quitarFoto}`, { metodo: 'DELETE' });
      if (r) { estado.pagina.galeria = r.galeria; pintarGaleria(); }
    });

    /* Bloques: añadir. */
    el('btnAnadirBloque').addEventListener('click', async () => {
      const tipo = el('tipoBloque').value;
      const r = await llamar(`${BASE}/secciones`, {
        metodo: 'POST',
        cuerpo: { tipo, titulo: NOMBRES_BLOQUE[tipo] },
      });
      if (r) { estado.pagina.secciones = r.secciones; pintarBloques(); avisar('Bloque añadido', true); }
    });

    /* Bloques: todo lo demás, por delegación. La lista se repinta
       entera en cada cambio, así que escuchar en cada botón dejaría
       escuchas colgando de nodos que ya no existen. */
    el('listaBloques').addEventListener('click', async (e) => {
      const boton = e.target.closest('button');
      if (!boton) return;
      const d = boton.dataset;

      if (d.borrar) {
        const r = await llamar(`${BASE}/secciones/${d.borrar}`, { metodo: 'DELETE' });
        if (r) { estado.pagina.secciones = r.secciones; pintarBloques(); pintarReglas(); }
        return;
      }

      if (d.visible) {
        const b = estado.pagina.secciones.find((x) => x.id === d.visible);
        const r = await llamar(`${BASE}/secciones/${d.visible}`, {
          metodo: 'PATCH', cuerpo: { visible: !b.visible },
        });
        if (r) { estado.pagina.secciones = r.secciones; pintarBloques(); }
        return;
      }

      if (d.subir || d.bajar) {
        const ids = estado.pagina.secciones.map((x) => x.id);
        const i = ids.indexOf(d.subir || d.bajar);
        const j = d.subir ? i - 1 : i + 1;
        if (j < 0 || j >= ids.length) return;
        [ids[i], ids[j]] = [ids[j], ids[i]];
        const r = await llamar(`${BASE}/secciones/orden`, { metodo: 'PATCH', cuerpo: { ids } });
        if (r) { estado.pagina.secciones = r.secciones; pintarBloques(); }
      }
    });

    el('listaBloques').addEventListener('blur', async (e) => {
      const d = e.target.dataset || {};
      if (d.titulo) {
        await llamar(`${BASE}/secciones/${d.titulo}`, { metodo: 'PATCH', cuerpo: { titulo: e.target.value } });
      } else if (d.texto) {
        await llamar(`${BASE}/secciones/${d.texto}`, {
          metodo: 'PATCH', cuerpo: { cuerpo: { texto: e.target.value } },
        });
      } else if (d.lista) {
        const lista = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
        await llamar(`${BASE}/secciones/${d.lista}`, { metodo: 'PATCH', cuerpo: { cuerpo: { lista } } });
      }
    }, true);

    /* Publicar y despublicar. En modo soporte ni se conectan: los
       botones están ocultos y las rutas de administración no existen. */
    if (SOPORTE) return;
    el('btnPublicar').addEventListener('click', async () => {
      const r = await api(`${BASE}/publicar`, { metodo: 'POST', silencioso: true });
      if (!r) {
        /* El servidor dice exactamente qué falta; se sube a la lista
           de reglas, que es donde el dealer lo va a buscar. */
        await cargar();
        avisar('Todavía falta algo. Mire la lista de arriba.', false);
        el('listaReglas').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      await cargar();
      avisar('Su página está publicada', true);
    });

    el('btnDespublicar').addEventListener('click', async () => {
      const r = await llamar(`${BASE}/despublicar`, { metodo: 'POST' });
      if (r) { await cargar(); avisar('Su página vuelve a ser un borrador', true); }
    });
  }

  /* ── Arranque ───────────────────────────────────────────── */

  async function cargar() {
    const r = await api(BASE, { silencioso: true });
    if (!r) return false;
    estado = r;
    return true;
  }

  /* Todo lo que cambia en pantalla cuando es el personal quien edita.
     El nombre va por textContent: es texto de la empresa. */
  function prepararSoporte() {
    const nombre = (estado.organizacion && estado.organizacion.nombre) || estado.pagina.nombre || 'la empresa';
    el('franjaSoporte').hidden = false;
    el('nombreSoporte').textContent = nombre;

    const miga = el('migaPagina');
    miga.innerHTML = '<a href="index.html">Inicio</a> &rsaquo; <a href="admin.html">Revisión</a> &rsaquo; <span></span>';
    miga.querySelector('span').textContent = `Página de ${nombre}`;

    const titulo = el('tituloPagina');
    titulo.innerHTML = '<em>Página</em> de ';
    titulo.append(document.createTextNode(nombre));
    document.title = `Página de ${nombre} · Soporte · MercaMaquinarias`;
  }

  async function arrancar() {
    const sesion = await cargarSesion();

    if (SOPORTE) {
      /* Sin sesión, sin permiso o con una empresa que no existe, la API
         responde 404 (o 401) y `silencioso` da null: los tres acaban
         igual, en «no encontrada». Es el error barato. */
      if (!sesion || !sesion.usuario || !await cargar()) {
        el('cargando').hidden = true;
        el('noEncontrada').hidden = false;
        return;
      }
      el('cargando').hidden = true;
      el('contenidoPagina').hidden = false;
      prepararSoporte();
      pintarTodo();
      conectar();
      return;
    }

    if (!sesion || !sesion.usuario) {
      el('cargando').hidden = true;
      el('sinSesion').hidden = false;
      return;
    }

    if (!sesion.organizacion || sesion.organizacion.tipo !== 'dealer') {
      el('cargando').hidden = true;
      el('noEsDealer').hidden = false;
      return;
    }

    if (!await cargar()) {
      el('cargando').textContent = 'No se pudo cargar su página. Inténtelo de nuevo.';
      return;
    }

    el('cargando').hidden = true;
    el('contenidoPagina').hidden = false;
    pintarTodo();
    conectar();
  }

  document.addEventListener('DOMContentLoaded', arrancar);
})();
