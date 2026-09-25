/* tema.js — tema claro (por defecto) u oscuro.

   Se carga en el <head>, antes de pintar, para que no haya un destello
   del tema equivocado. La elección se recuerda en este navegador; si no
   se puede leer (modo privado, almacenamiento bloqueado), el sitio sale
   claro y el botón sigue funcionando durante la visita. */
(function () {
  var CLAVE = 'mm-tema';
  var raiz = document.documentElement;
  var transicion;

  function leer() {
    try { return localStorage.getItem(CLAVE); } catch (e) { return null; }
  }
  function guardar(t) {
    try { localStorage.setItem(CLAVE, t); } catch (e) { /* sin memoria: da igual */ }
  }

  // El logotipo tiene dos versiones: texto blanco (-oscuro, para fondo
  // oscuro) y texto azul noche (-claro, para fondo claro).
  function logos(t) {
    var imgs = document.querySelectorAll('.cab__logo img, .pie__logo');
    for (var i = 0; i < imgs.length; i++) {
      var src = imgs[i].getAttribute('src') || '';
      var nuevo = src.replace(/horizontal-(claro|oscuro)\.svg$/, 'horizontal-' + (t === 'dark' ? 'oscuro' : 'claro') + '.svg');
      if (nuevo !== src) imgs[i].setAttribute('src', nuevo);
    }
  }

  function boton(t) {
    var b = document.getElementById('temaToggle');
    if (!b) return;
    var oscuro = t === 'dark';
    b.setAttribute('aria-pressed', String(oscuro));
    b.setAttribute('aria-label', oscuro ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    b.title = oscuro ? 'Tema claro' : 'Tema oscuro';
  }

  /* La barra del navegador en el móvil: Chrome en Android la pinta del
     color de este meta, y Safari en iOS tiñe con él la zona de la hora
     y la de los botones.

     Los dos valores son, exactamente, los de `--app-bg` de cada bloque
     de tema en `styles.css`. Es el único sitio del proyecto donde el
     fondo de la aplicación vive escrito dos veces, porque un meta no
     entiende de variables CSS: quien cambie `--app-bg` tiene que venir
     aquí detrás, o la barra se queda del color viejo.

     Antes el meta llevaba `#071A2B` fijo en cada página —el azul noche
     de la marca vieja, que la piel app ya no usa—, así que la barra
     salía de un color que no aparecía en ninguna otra parte del sitio,
     y no se movía al cambiar de tema. */
  function barra(t) {
    var m = document.querySelector('meta[name="theme-color"]');
    // Hoy lo llevan todas las páginas que cargan este archivo, pero una
    // página nueva puede nacer sin él y esto corre en el <head>: si
    // lanzara aquí, se caería con ella el resto del arranque del tema.
    if (!m) return;
    m.setAttribute('content', t === 'dark' ? '#191A1A' : '#F4F4F1');
  }

  function aplicar(t) {
    raiz.setAttribute('data-theme', t);
    logos(t);
    boton(t);
    barra(t);
  }

  /* Sin elección guardada, manda el sistema.
   *
   * Antes se caía siempre a claro, así que el tema oscuro —que está
   * construido entero, con su paleta y sus logotipos— solo lo veía
   * quien encontrara el botón y lo pulsara. Quien lleva el teléfono en
   * oscuro espera que una página que sabe hacerlo la respete.
   *
   * Una elección explícita sigue mandando sobre el sistema: lo que se
   * guardó fue una decisión y no se le lleva la contraria. */
  function preferido() {
    var guardado = leer();
    if (guardado === 'dark' || guardado === 'light') return guardado;
    try {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch (e) {
      return 'light';
    }
  }

  /* Estas dos líneas corren en el <head>, antes de pintar. El meta ya
     está en el DOM cuando llegan —va en la línea 8 de cada página y
     este <script> en la 28—, así que la barra se puede fijar aquí
     mismo. Esperar a DOMContentLoaded sería dejar a quien entra con el
     tema oscuro con la barra clara hasta el final de la carga: el
     mismo destello que la línea del `data-theme` existe para evitar.

     El tema se guarda en una variable porque `preferido()` va a
     `localStorage` y a `matchMedia`: no hay razón para preguntarlo dos
     veces seguidas, y menos aquí, que es camino crítico. */
  var inicial = preferido();
  raiz.setAttribute('data-theme', inicial);
  barra(inicial);

  document.addEventListener('DOMContentLoaded', function () {
    var cab = document.querySelector('.cab__inner');
    if (cab && !document.getElementById('temaToggle')) {
      var b = document.createElement('button');
      b.type = 'button';
      b.id = 'temaToggle';
      b.className = 'tema-toggle';
      b.innerHTML =
        '<svg class="tema-toggle__sol" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>' +
        '<svg class="tema-toggle__luna" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/></svg>';
      var menu = document.getElementById('navToggle');
      cab.insertBefore(b, menu || null);
      b.addEventListener('click', function () {
        clearTimeout(transicion);
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          raiz.classList.add('tema-cambiando');
          // Register the color transitions before changing their target values.
          void window.getComputedStyle(document.body).backgroundColor;
          transicion = setTimeout(function () {
            raiz.classList.remove('tema-cambiando');
          }, 500);
        } else {
          raiz.classList.remove('tema-cambiando');
        }
        var t = raiz.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        guardar(t);
        aplicar(t);
      });
    }
    aplicar(raiz.getAttribute('data-theme'));
  });
})();
