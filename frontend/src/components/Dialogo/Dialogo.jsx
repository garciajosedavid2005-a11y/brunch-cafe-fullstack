import { useEffect, useId, useRef, useState } from "react";
import "./Dialogo.css";

const ENFOCABLES =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Diálogo modal accesible (confirmación o aviso) con el estilo de Brunch Café.
 * - role="dialog" (o "alertdialog" si es de tipo error), aria-modal y títulos enlazados.
 * - Foco atrapado; Esc y clic fuera cierran (equivale a "Cancelar").
 * - Al cerrar, el foco vuelve al elemento que lo abrió.
 * - `motivo`: si se pasa, muestra un campo de texto; con `requerido` no deja confirmar vacío.
 */
export default function Dialogo({
  titulo,
  mensaje,
  detalle,
  tipo = "confirmar", // "confirmar" | "aviso" | "error"
  confirmarTexto = "Aceptar",
  cancelarTexto = "Cancelar",
  peligroso = false,
  motivo,
  onConfirmar,
  onCancelar,
}) {
  const id = useId();
  const cajaRef = useRef(null);
  const [textoMotivo, setTextoMotivo] = useState("");
  const [intentoEnviar, setIntentoEnviar] = useState(false);
  const esAviso = tipo !== "confirmar";
  const motivoFalta = Boolean(motivo?.requerido) && !textoMotivo.trim();
  // Foco inicial: el campo de motivo; en acciones peligrosas, "Cancelar/Volver"; si no, el principal
  const inicial = motivo ? "motivo" : peligroso && !esAviso ? "cancelar" : "principal";
  const marcaInicial = (nombre) => (inicial === nombre ? { "data-dialogo-inicial": "" } : {});

  // Foco inicial y retorno del foco al cerrar
  useEffect(() => {
    const anterior = document.activeElement;
    const caja = cajaRef.current;
    // El elemento marcado con data-dialogo-inicial (ver abajo) recibe el foco
    const primero = caja?.querySelector("[data-dialogo-inicial]") || caja;
    primero?.focus();
    return () => {
      if (anterior && typeof anterior.focus === "function" && document.contains(anterior)) anterior.focus();
    };
  }, []);

  const cancelar = () => (esAviso ? onConfirmar({ motivo: "" }) : onCancelar());

  const confirmar = () => {
    setIntentoEnviar(true);
    if (motivoFalta) return;
    onConfirmar({ motivo: textoMotivo.trim() });
  };

  const handleKeyDown = (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      cancelar();
      return;
    }
    if (event.key !== "Tab") return;
    const elementos = [...cajaRef.current.querySelectorAll(ENFOCABLES)];
    if (elementos.length === 0) {
      event.preventDefault();
      return;
    }
    const primero = elementos[0];
    const ultimo = elementos[elementos.length - 1];
    if (event.shiftKey && document.activeElement === primero) {
      event.preventDefault();
      ultimo.focus();
    } else if (!event.shiftKey && document.activeElement === ultimo) {
      event.preventDefault();
      primero.focus();
    }
  };

  return (
    <div className="dialogo-fondo" onMouseDown={(e) => e.target === e.currentTarget && cancelar()} data-testid="dialogo-fondo">
      <div
        ref={cajaRef}
        className={`dialogo dialogo--${tipo}`}
        role={tipo === "error" ? "alertdialog" : "dialog"}
        aria-modal="true"
        aria-labelledby={`${id}-titulo`}
        aria-describedby={mensaje ? `${id}-mensaje` : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
      >
        <h2 id={`${id}-titulo`} className="dialogo__titulo">{titulo}</h2>
        {mensaje && <p id={`${id}-mensaje`} className="dialogo__mensaje">{mensaje}</p>}
        {detalle && <div className="dialogo__detalle">{detalle}</div>}

        {motivo && (
          <label className="dialogo__campo">
            <span>{motivo.etiqueta || "Motivo"}{motivo.requerido ? " *" : ""}</span>
            <textarea
              {...marcaInicial("motivo")}
              rows={3}
              maxLength={300}
              value={textoMotivo}
              onChange={(e) => setTextoMotivo(e.target.value)}
              aria-invalid={intentoEnviar && motivoFalta}
              aria-describedby={intentoEnviar && motivoFalta ? `${id}-error` : undefined}
            />
            {intentoEnviar && motivoFalta && (
              <small id={`${id}-error`} className="dialogo__error">Escribe el motivo para continuar.</small>
            )}
          </label>
        )}

        <div className="dialogo__acciones">
          {!esAviso && (
            <button type="button" {...marcaInicial("cancelar")} className="dialogo__boton dialogo__boton--secundario" onClick={onCancelar}>
              {cancelarTexto}
            </button>
          )}
          <button
            type="button"
            {...marcaInicial("principal")}
            className={`dialogo__boton ${peligroso ? "dialogo__boton--peligro" : "dialogo__boton--primario"}`}
            onClick={confirmar}
          >
            {confirmarTexto}
          </button>
        </div>
      </div>
    </div>
  );
}
