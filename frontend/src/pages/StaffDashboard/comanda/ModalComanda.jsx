import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// 1.7 · Modal de la toma de comanda (producto y anulación): role="dialog", foco atrapado, Esc y el
// fondo cierran, y al cerrar el foco vuelve a quien lo abrió (mismo comportamiento que Dialogo).
export default function ModalComanda({ titulo, subtitulo, onCerrar, children, pie, className = "" }) {
  const id = useId();
  const cajaRef = useRef(null);

  useEffect(() => {
    const anterior = document.activeElement;
    const caja = cajaRef.current;
    (caja?.querySelector("[data-modal-inicial]") || caja)?.focus();
    return () => {
      if (anterior && typeof anterior.focus === "function" && document.contains(anterior)) anterior.focus();
    };
  }, []);

  const alTeclear = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCerrar();
      return;
    }
    if (event.key !== "Tab") return;
    const elementos = [...cajaRef.current.querySelectorAll(ENFOCABLES)];
    if (elementos.length === 0) return;
    const [primero, ultimo] = [elementos[0], elementos.at(-1)];
    if (event.shiftKey && document.activeElement === primero) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primero.focus();
    }
  };

  return (
    <div className="modal-comanda__fondo" onMouseDown={(e) => e.target === e.currentTarget && onCerrar()}>
      <div
        ref={cajaRef}
        className={`modal-comanda ${className}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        tabIndex={-1}
        onKeyDown={alTeclear}
      >
        <div className="modal-comanda__cabecera">
          <div>
            <h2 id={`${id}-titulo`} className="modal-comanda__titulo">{titulo}</h2>
            {subtitulo && <p className="modal-comanda__subtitulo">{subtitulo}</p>}
          </div>
          <button type="button" className="comanda__boton-icono" aria-label="Cerrar" onClick={onCerrar}>
            <X size={22} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-comanda__cuerpo">{children}</div>
        {pie && <div className="modal-comanda__pie">{pie}</div>}
      </div>
    </div>
  );
}
