// Selector de estado: muestra el estado actual y solo los cambios que el backend
// permite al usuario (item.transiciones). Si el cambio exige motivo, lo pide.
import { claseEstado, pedirMotivo } from "./estadoUtils";
import { useDialogo } from "../../../context/useDialogo";

export default function EstadoSelector({ item, onCambiar, disabled = false }) {
  const transiciones = item.transiciones || [];
  const { confirmar } = useDialogo();

  const handleChange = async (event) => {
    const transicion = transiciones.find((t) => t.codigo === event.target.value);
    if (!transicion) return;
    const motivo = await pedirMotivo(confirmar, transicion);
    if (motivo === null) return;
    onCambiar(transicion.codigo, motivo);
  };

  // El select va con estilo neutro; el color del estado actual se muestra como un punto al lado
  return (
    <span className="estado-selector">
      <span className={`estado-selector__punto ${claseEstado(item.estadoCodigo)}`} aria-hidden="true" />
      <select
        className="estado-selector__select"
        aria-label={`Estado actual: ${item.estado}. Cambiar estado`}
        value={item.estadoCodigo || ""}
        onChange={handleChange}
        disabled={disabled || transiciones.length === 0}
        title={transiciones.length === 0 ? (item.esFinal ? "Estado final" : "Sin cambios disponibles para tu rol") : undefined}
      >
        <option value={item.estadoCodigo || ""}>{item.estado}</option>
        {transiciones.map((t) => (
          <option key={t.codigo} value={t.codigo}>
            → {t.nombre}
          </option>
        ))}
      </select>
    </span>
  );
}
