/* MercaMaquinarias · Guardado y baja de alertas de búsqueda.
   Este módulo queda separado del catálogo: app.js también se usa en otras
   páginas y las alertas no deben convertirlo en otro punto de conflicto. */

const CAMPOS_ALERTA = ['q', 'categoria', 'subcategoria', 'marca', 'provincia',
  'condicion', 'anioMin', 'anioMax', 'precioMin', 'precioMax', 'horasMax',
  'disponibilidad', 'permuta', 'itbis'];

function filtrosDeAlerta() {
  const actuales = new URLSearchParams(location.search);
  const filtros = {};
  CAMPOS_ALERTA.forEach((campo) => {
    const valores = actuales.getAll(campo).filter(Boolean);
    if (valores.length) filtros[campo] = valores.length === 1 ? valores[0] : valores;
  });
  return filtros;
}

async function montarGuardarBusqueda() {
  const caja = document.querySelector('#guardarBusqueda');
  if (!caja) return;
  const filtros = filtrosDeAlerta();
  if (!Object.keys(filtros).length) return;
  caja.hidden = false;

  const boton = document.querySelector('#btnGuardarBusqueda');
  const estado = document.querySelector('#estadoGuardarBusqueda');
  boton.addEventListener('click', async () => {
    await cargarSesion();
    if (!haySesion()) {
      const vuelta = `equipos.html${location.search}`;
      location.href = `cuenta.html?destino=${encodeURIComponent(vuelta)}`;
      return;
    }
    boton.disabled = true;
    try {
      const respuesta = await api('/busquedas', { metodo: 'POST', cuerpo: filtros });
      estado.textContent = respuesta.repetida
        ? 'Ya tenía guardada esta búsqueda.'
        : 'Le avisaremos por correo cuando entre un equipo que encaje.';
    } catch (e) {
      estado.textContent = e.message;
      boton.disabled = false;
    }
  });
}

async function montarBajaAlerta() {
  const caja = document.querySelector('#bajaAlerta');
  if (!caja) return;
  const testigo = new URLSearchParams(location.search).get('baja');
  const explicacion = document.querySelector('#explicacionAlerta');
  const boton = document.querySelector('#btnBajaAlerta');
  const estado = document.querySelector('#estadoBajaAlerta');
  if (!testigo) {
    explicacion.innerHTML = 'Puede revisar y borrar sus búsquedas guardadas desde <a href="panel.html">Mis alertas en el panel</a>.';
    return;
  }

  explicacion.textContent = 'Confirme si ya no quiere recibir correos cuando aparezcan equipos para esta búsqueda.';
  boton.hidden = false;
  boton.addEventListener('click', async () => {
    boton.disabled = true;
    try {
      const respuesta = await api('/busquedas/baja', { metodo: 'POST', cuerpo: { testigo } });
      boton.hidden = true;
      estado.textContent = `Listo: ya no le avisaremos de «${respuesta.resumen}».`;
    } catch (_) {
      boton.hidden = true;
      estado.textContent = 'Este enlace no es válido o ya no está disponible.';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  montarGuardarBusqueda();
  montarBajaAlerta();
});
