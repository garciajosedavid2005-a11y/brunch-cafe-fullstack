import { useHorarios } from "../../hooks/useHorarios";
import { lineasDeHorario } from "../../utils/horarios";
import "./HorariosCafe.css";

// Horarios del café leídos de la configuración (GET /api/v1/horarios). Sin textos fijos:
// si no se pueden cargar, lo dice en vez de mostrar un horario inventado.
export default function HorariosCafe({ className = "" }) {
  const { horarios, error } = useHorarios();
  if (error) return <p className={`horarios-cafe ${className}`}>No pudimos cargar los horarios. Llámanos y te ayudamos.</p>;
  if (!horarios) return <p className={`horarios-cafe ${className}`} aria-busy="true">Cargando horarios…</p>;
  return (
    <ul className={`horarios-cafe ${className}`} aria-label="Horarios del café">
      {lineasDeHorario(horarios).map(({ etiqueta, valor }) => (
        <li key={etiqueta}>
          <strong className="horarios-cafe__etiqueta">{etiqueta}:</strong>{" "}
          <span className="horarios-cafe__valor">{valor}</span>
        </li>
      ))}
    </ul>
  );
}
