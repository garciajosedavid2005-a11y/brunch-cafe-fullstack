import { useEffect, useId, useState } from "react";
import { Clock3, Users } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { formatearFechaCalendario, formatearHoraTexto } from "../../../utils/fechas";
import { claseEstado } from "../../AdminDashboard/components/estadoUtils";
import "./AgendaReservas.css";

// Fase 4 · Agenda de reservas de /staff. 4.1: cada reserva pendiente o confirmada lleva su mesa; quien tiene
// reserva:cambiar_estado (mesero, admin) la asigna o la quita. El backend valida capacidad y choques (90 min y
// la mesa reservada desde 15 min antes) y responde 409 con el motivo, que se muestra junto a la reserva.
const RESERVA_CON_MESA_EDITABLE = ["pendiente", "confirmada"];
const claseDeEstado = (codigo) => `staff-dashboard__status staff-dashboard__status--${claseEstado(codigo).replace("admin-badge--", "")}`;
const personasTexto = (n) => `${n} ${n === 1 ? "persona" : "personas"}`;

function SelectorMesa({ reserva, mesas, onCambio }) {
  const id = useId();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const cambiar = (mesaId) => {
    setEnviando(true);
    setError("");
    apiRequest(`/v1/staff/reservas/${reserva.id}/mesa`, { method: "PATCH", body: JSON.stringify({ mesaId: mesaId || null }) })
      .then(() => onCambio?.())
      .catch((e) => setError(e.message))
      .finally(() => setEnviando(false));
  };
  return (
    <div className="agenda__mesa">
      <label htmlFor={`${id}-mesa`}>Mesa</label>
      <select id={`${id}-mesa`} aria-label={`Mesa de la reserva ${reserva.codigo}`} value={reserva.mesa?.id || ""}
        disabled={enviando || !mesas} onChange={(e) => cambiar(e.target.value)}>
        <option value="">{mesas ? "Sin mesa" : "Cargando mesas…"}</option>
        {(mesas || []).map((m) => (
          <option key={m.id} value={m.id} disabled={m.capacidad < reserva.personas}>
            {`Mesa ${m.numero} · ${personasTexto(m.capacidad)}${m.capacidad < reserva.personas ? " (pequeña)" : ""}`}
          </option>
        ))}
      </select>
      {error && <p className="agenda__error" role="alert">{error}</p>}
    </div>
  );
}

export default function AgendaReservas({ reservas, puedeAsignar = false, onCambio }) {
  // Mesas activas del plano (mesa:ver), ordenadas por número; solo hacen falta para asignar
  const [mesas, setMesas] = useState(null);
  useEffect(() => {
    if (!puedeAsignar) return undefined;
    let vivo = true;
    apiRequest("/v1/staff/salon/mesas")
      .then((plano) => { if (vivo) setMesas([...(plano.mesas || [])].sort((a, b) => a.numero - b.numero)); })
      .catch(() => { if (vivo) setMesas([]); });
    return () => { vivo = false; };
  }, [puedeAsignar]);

  return (
    <div className="staff-dashboard__reservations">
      {reservas.map((reserva) => {
        const editable = puedeAsignar && RESERVA_CON_MESA_EDITABLE.includes(reserva.estadoCodigo);
        return (
          <article className="staff-dashboard__reservation" key={reserva.id}>
            <div className="staff-dashboard__reservation-time">
              <Clock3 size={17} />
              <strong>{formatearHoraTexto(reserva.hora)}</strong>
            </div>
            <div className="staff-dashboard__reservation-info">
              <div className="staff-dashboard__reservation-title">
                <h3>{reserva.cliente}</h3>
                <span className={claseDeEstado(reserva.estadoCodigo)}>{reserva.estado}</span>
              </div>
              <p>{[formatearFechaCalendario(reserva.fecha, "long"), reserva.telefono, reserva.correo].filter(Boolean).join(" · ")}</p>
              {reserva.registradaPor && <p className="staff-dashboard__registrada">Registrada por {reserva.registradaPor.nombre}</p>}
              <div className="staff-dashboard__reservation-meta">
                <span><Users size={15} />{personasTexto(reserva.personas)}</span>
                <span>{reserva.motivo}</span>
                <span>{reserva.codigo}</span>
                {!editable && reserva.mesa && <span className="agenda__mesa-fija">Mesa {reserva.mesa.numero}</span>}
              </div>
              {editable && <SelectorMesa reserva={reserva} mesas={mesas} onCambio={onCambio} />}
            </div>
          </article>
        );
      })}
    </div>
  );
}
