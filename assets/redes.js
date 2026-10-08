/* MercaMaquinarias todavía no tiene cuentas de Instagram ni Facebook (2026-10-08):
   antes estos enlaces llevaban a la portada de cada red. Para encenderlos, ponga aquí
   la dirección https:// completa de cada cuenta y despliegue. */
const REDES = [
  { nombre: 'Instagram', enlace: '' },
  { nombre: 'Facebook', enlace: '' },
];

if (typeof document !== 'undefined') {
  for (const lista of document.querySelectorAll('ul[data-redes]')) {
    const elementos = document.createDocumentFragment();

    for (const red of REDES) {
      if (!red.enlace.startsWith('https://')) continue;

      const elemento = document.createElement('li');
      const enlace = document.createElement('a');
      enlace.href = red.enlace;
      enlace.rel = 'noopener';
      enlace.textContent = red.nombre;
      elemento.append(enlace);
      elementos.append(elemento);
    }

    lista.insertBefore(elementos, lista.firstChild);
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { REDES };
}
