import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { AvisoCarritoContext } from "../../context/avisoCarritoValue";
import "./AvisoCarrito.css";

// 7.1 · Cuánto queda a la vista el aviso; se pausa mientras el ratón o el foco están encima
export const DURACION_AVISO_MS = 5000;

// 7.1 · Aviso breve «X agregado al carrito» con «Ver carrito». La región viva está SIEMPRE montada
// (aria-live="polite", sin role="status" para no duplicar el estado propio de cada página) para que los
// lectores de pantalla anuncien cada aviso nuevo, también con prefers-reduced-motion (allí solo cambia
// que no hay vuelo ni rebote).
export function AvisoCarritoProvider({ children }) {
  const [aviso, setAviso] = useState(null);
  const temporizador = useRef(null);
  const contador = useRef(0);

  const programarCierre = useCallback(() => {
    window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => setAviso(null), DURACION_AVISO_MS);
  }, []);
  const pausar = () => window.clearTimeout(temporizador.current);
  const cerrar = () => { window.clearTimeout(temporizador.current); setAviso(null); };

  useEffect(() => () => window.clearTimeout(temporizador.current), []);

  const avisarAgregado = useCallback((nombre) => {
    contador.current += 1;
    setAviso({ id: contador.current, nombre });
    programarCierre();
  }, [programarCierre]);

  const valor = useMemo(() => ({ avisarAgregado }), [avisarAgregado]);

  return (
    <AvisoCarritoContext.Provider value={valor}>
      {children}
      <div className="aviso-carrito__region" aria-live="polite" aria-atomic="true">
        {aviso && (
          <div
            key={aviso.id}
            className="aviso-carrito"
            onMouseEnter={pausar}
            onMouseLeave={programarCierre}
            onFocus={pausar}
            onBlur={programarCierre}
          >
            <p className="aviso-carrito__texto">
              <Check size={18} strokeWidth={2.5} aria-hidden="true" className="aviso-carrito__icono" />{" "}
              <strong>{aviso.nombre}</strong> agregado al carrito
            </p>
            <Link className="aviso-carrito__enlace" to="/domicilios" onClick={cerrar} data-carrito-destino="aviso">Ver carrito</Link>
            <button type="button" className="aviso-carrito__cerrar" onClick={cerrar} aria-label="Cerrar aviso">×</button>
          </div>
        )}
      </div>
    </AvisoCarritoContext.Provider>
  );
}
