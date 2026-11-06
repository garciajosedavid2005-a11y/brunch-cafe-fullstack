/**
 * useAnimacionEntrada.js
 * Hook que detecta cuando un elemento entra en pantalla
 * y activa una clase CSS de animación.
 *
 * Uso:
 *   const ref = useAnimacionEntrada();
 *   <div ref={ref} className="animar">...</div>
 *
 * Devuelve un "callback ref": se engancha cuando el elemento aparece en el DOM,
 * aunque sea después del primer render (p. ej. una sección que espera datos).
 * Antes era un useRef + useEffect de una sola vez: si el componente empezaba
 * devolviendo null, el observador nunca se creaba y la sección quedaba con
 * opacity:0 (bloque vacío en "Nuestros Destacados").
 */

import { useEffect, useState } from "react";

const useAnimacionEntrada = (opciones = {}) => {
  const [elemento, setElemento] = useState(null);
  const { threshold, rootMargin } = opciones;

  useEffect(() => {
    if (!elemento) return undefined;

    const observador = new IntersectionObserver(
      ([entrada]) => {
        if (entrada.isIntersecting) {
          elemento.classList.add("visible");
          observador.unobserve(elemento); // solo anima una vez
        }
      },
      {
        threshold: threshold || 0.15,
        rootMargin: rootMargin || "0px",
      }
    );

    observador.observe(elemento);
    return () => observador.disconnect();
  }, [elemento, threshold, rootMargin]);

  return setElemento;
};

export default useAnimacionEntrada;
