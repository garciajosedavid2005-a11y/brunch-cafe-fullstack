import { useEffect } from "react";

// 1.6b · Las tablas del admin fijan «Acciones» a la derecha (1.3b) y la columna de estado justo a su
// izquierda (`right: var(--ancho-acciones)`). El ancho de «Acciones» cambia según la tabla, el tamaño de
// pantalla y los botones de cada fila, así que se mide: un ResizeObserver por cabecera «Acciones» deja el
// ancho en --ancho-acciones de su tabla. Las tablas que aparecen después (al cargar) se enlazan solas.
const SELECTOR = ".admin-table--acciones-fijas thead th:last-child";

export default function useAnchoAccionesFijas(contenedorRef) {
  useEffect(() => {
    const raiz = contenedorRef.current;
    if (!raiz || typeof ResizeObserver === "undefined") return undefined;

    const medidor = new ResizeObserver((entradas) => {
      for (const { target } of entradas) {
        const ancho = target.getBoundingClientRect().width;
        target.closest("table")?.style.setProperty("--ancho-acciones", `${ancho}px`);
      }
    });
    const enlazadas = new WeakSet();
    const enlazar = () => {
      for (const th of raiz.querySelectorAll(SELECTOR)) {
        if (enlazadas.has(th)) continue;
        enlazadas.add(th);
        medidor.observe(th);
      }
    };
    enlazar();
    const cambios = new MutationObserver(enlazar);
    cambios.observe(raiz, { childList: true, subtree: true });
    return () => {
      cambios.disconnect();
      medidor.disconnect();
    };
  }, [contenedorRef]);
}
