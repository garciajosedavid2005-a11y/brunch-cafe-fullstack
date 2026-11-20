// 7.1 · Vuelo de la miniatura hasta el carrito del navbar y rebote al llegar, con la API Web Animations
// (sin dependencias). Con prefers-reduced-motion no se anima nada: solo queda el aviso.

export const prefiereMenosMovimiento = () =>
  typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const TAM = 56; // px de la miniatura que vuela

const estaALaVista = (el) => {
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < window.innerHeight;
};

// Destino: el ícono del carrito; en el celular (carrito dentro del menú cerrado), la hamburguesa.
export function destinoCarrito() {
  for (const tipo of ["icono", "menu"]) {
    const el = document.querySelector(`[data-carrito-destino="${tipo}"]`);
    if (estaALaVista(el)) return el;
  }
  return null;
}

export function rebotar(el) {
  if (!el || typeof el.animate !== "function" || prefiereMenosMovimiento()) return;
  el.animate([
    { transform: "scale(1)" },
    { transform: "scale(1.3) rotate(-10deg)", offset: 0.3 },
    { transform: "scale(0.92) rotate(5deg)", offset: 0.6 },
    { transform: "scale(1)" },
  ], { duration: 500, easing: "ease-out" });
}

// Si el carrito no está a la vista (el navbar se va al bajar por la página), la miniatura vuela al
// «Ver carrito» del aviso, que se pinta justo después del clic (por eso el setTimeout).
export function volarAlCarrito(origen, imagen) {
  if (prefiereMenosMovimiento() || !origen?.getBoundingClientRect) return;
  const destino = destinoCarrito();
  if (destino) { volar(origen, imagen, destino); return; }
  window.setTimeout(() => {
    const aviso = document.querySelector('[data-carrito-destino="aviso"]');
    if (estaALaVista(aviso)) volar(origen, imagen, aviso);
  }, 0);
}

function volar(origen, imagen, destino) {
  if (!origen.isConnected) return;
  const o = origen.getBoundingClientRect();
  const d = destino.getBoundingClientRect();
  const x0 = o.left + o.width / 2 - TAM / 2;
  const y0 = o.top + o.height / 2 - TAM / 2;
  const dx = d.left + d.width / 2 - TAM / 2 - x0;
  const dy = d.top + d.height / 2 - TAM / 2 - y0;

  const ficha = document.createElement(imagen ? "img" : "div");
  if (imagen) { ficha.src = imagen; ficha.alt = ""; }
  ficha.className = "vuelo-carrito";
  ficha.setAttribute("aria-hidden", "true");
  ficha.style.left = `${x0}px`;
  ficha.style.top = `${y0}px`;
  document.body.appendChild(ficha);
  if (typeof ficha.animate !== "function") { ficha.remove(); return; }

  // Arco: sube un poco a mitad de camino y se encoge al llegar
  const animacion = ficha.animate([
    { transform: "translate(0, 0) scale(1)", opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(0.75)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${dx}px, ${dy}px) scale(0.3)`, opacity: 0.7 },
  ], { duration: 700, easing: "cubic-bezier(0.5, 0, 0.3, 1)" });
  animacion.onfinish = () => { ficha.remove(); rebotar(destino); };
  animacion.oncancel = () => ficha.remove();
}
