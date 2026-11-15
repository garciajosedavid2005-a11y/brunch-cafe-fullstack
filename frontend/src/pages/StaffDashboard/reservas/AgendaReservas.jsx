import { useEffect, useId, useRef, useState } from "react";
import { CalendarClock, Clock3, Users } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { useDialogo } from "../../../context/useDialogo";
import { fechaLocal, formatearFechaCalendario, formatearHoraTexto, hoyLocal } from "../../../utils/fechas";
import { claseEstado } from "../../AdminDashboard/components/estadoUtils";
import { nuevaClave } from "../plano/estadosMesa";
import "./AgendaReservas.css";

// Fase 4 · Agenda de reservas de /staff. 4.1: cada reserva pendiente o confirmada lleva su mesa; quien tiene
// reserva:cambiar_estado (mesero, admin) la asigna o la quita. El backend valida capacidad y choques (90 min y
// la mesa reservada desde 15 min antes) y responde 409 con el motivo, que se muestra junto a la reserva.
// 4.3: grupos hoy (por hora), próximas y anteriores o cerradas; «Confirmar», «Sentar» (abre la cuenta en su
// mesa) y, a los 15 min de retraso de una reserva por llegar, «No llegó» (F4-5: lo marca el staff).
const RESERVA_CON_MESA_EDITABLE = ["pendiente", "confirmada"];
const FINALES = ["completada", "cancelada", "no_show"];
const MINUTOS_NO_SHOW = 15;
const claseDeEstado = (codigo) => `staff-dashboard__status staff-dashboard__status--${claseEstado(codigo).replace("admin-badge--", "")}`;
const personasTexto = (n) => `${n} ${n === 1 ? "persona" : "personas"}`;
const inicioDe = (r) => new Date(r.inicio || r.fecha).getTime();
const minutosDeRetraso = (r) => (RESERVA_CON_MESA_EDITABLE.includes(r.estadoCodigo) ? Math.floor((Date.now() - inicioDe(r)) / 60000) : 0);

const agrupar = (reservas, hoy) => {
  const dia = (r) => fechaLocal(r.inicio || r.fecha);
  const porInicio = (a, b) => inicioDe(a) - inicioDe(b);
  return {
    hoy: reservas.filter((r) => dia(r) === hoy).sort(porInicio),
    proximas: reservas.filter((r) => dia(r) > hoy && !FINALES.includes(r.estadoCodigo)).sort(porInicio),
    anteriores: reservas.filter((r) => dia(r) < hoy || (dia(r) > hoy && FINALES.includes(r.estadoCodigo))).sort((a, b) => porInicio(b, a)),
  };
};
const GRUPOS = [["hoy", "Hoy"], ["proximas", "Próximas"], ["anteriores", "Anteriores y cerradas"]];

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

function AccionesReserva({ reserva, esHoy, puedeGestionar, puedeSentar, onCambio }) {
  const { confirmar } = useDialogo();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  // Una clave por intento de «Sentar»: un reintento tras un corte de red no abre otra cuenta
  const claveSentar = useRef(nuevaClave());
  if (!puedeGestionar || !RESERVA_CON_MESA_EDITABLE.includes(reserva.estadoCodigo)) return null;
  const retraso = esHoy ? minutosDeRetraso(reserva) : 0;
  const llamar = (ruta, opciones) => {
    setEnviando(true);
    setError("");
    return apiRequest(`/v1/staff/reservas/${reserva.id}/${ruta}`, opciones)
      .then(() => { onCambio?.(); return true; })
      .catch((e) => { setError(e.message); return false; })
      .finally(() => setEnviando(false));
  };
  const sentar = async () => {
    if (await llamar("sentar", { method: "POST", body: "{}", headers: { "Idempotency-Key": claveSentar.current } })) claveSentar.current = nuevaClave();
  };
  const noLlego = async () => {
    const { confirmado } = await confirmar({
      titulo: "Marcar «No llegó»",
      mensaje: `La reserva de ${reserva.cliente} (${formatearHoraTexto(reserva.hora)}) queda como «No asistió»${reserva.mesa ? ` y la mesa ${reserva.mesa.numero} se libera` : ""}.`,
      confirmarTexto: "No llegó",
    });
    if (confirmado) await llamar("estado", { method: "PATCH", body: JSON.stringify({ codigo: "no_show" }) });
  };
  return (
    <div className="agenda__acciones">
      {retraso >= MINUTOS_NO_SHOW && (
        <span className="agenda__retraso"><CalendarClock size={15} aria-hidden="true" />Retrasada {retraso} min</span>
      )}
      {reserva.estadoCodigo === "pendiente" && (
        <button type="button" className="agenda__boton" disabled={enviando} aria-label={`Confirmar ${reserva.codigo}`}
          onClick={() => llamar("estado", { method: "PATCH", body: JSON.stringify({ codigo: "confirmada" }) })}>
          Confirmar
        </button>
      )}
      {esHoy && puedeSentar && reserva.mesa && (
        <button type="button" className="agenda__boton agenda__boton--primario" disabled={enviando}
          aria-label={`Sentar a ${reserva.cliente} (${reserva.codigo})`} onClick={sentar}>
          Sentar en la mesa {reserva.mesa.numero}
        </button>
      )}
      {retraso >= MINUTOS_NO_SHOW && (
        <button type="button" className="agenda__boton" disabled={enviando} aria-label={`No llegó ${reserva.codigo}`} onClick={noLlego}>
          No llegó
        </button>
      )}
      {error && <p className="agenda__error" role="alert">{error}</p>}
    </div>
  );
}

function TarjetaReserva({ reserva, esHoy, mesas, puedeAsignar, puedeGestionar, puedeSentar, onCambio }) {
  const editable = puedeAsignar && RESERVA_CON_MESA_EDITABLE.includes(reserva.estadoCodigo);
  return (
    <article className="staff-dashboard__reservation">
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
        <AccionesReserva reserva={reserva} esHoy={esHoy} puedeGestionar={puedeGestionar} puedeSentar={puedeSentar} onCambio={onCambio} />
      </div>
    </article>
  );
}

export default function AgendaReservas({ reservas, puedeAsignar = false, puedeGestionar = false, puedeSentar = false, onCambio }) {
  const id = useId();
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

  const grupos = agrupar(reservas, hoyLocal());
  return (
    <div className="agenda">
      {GRUPOS.filter(([clave]) => grupos[clave].length).map(([clave, titulo]) => (
        <section key={clave} className="agenda__grupo" aria-labelledby={`${id}-${clave}`}>
          <h3 id={`${id}-${clave}`} className="agenda__titulo">{titulo} <span className="agenda__conteo">{grupos[clave].length}</span></h3>
          <div className="staff-dashboard__reservations">
            {grupos[clave].map((reserva) => (
              <TarjetaReserva key={reserva.id} reserva={reserva} esHoy={clave === "hoy"} mesas={mesas} puedeAsignar={puedeAsignar}
                puedeGestionar={puedeGestionar} puedeSentar={puedeSentar} onCambio={onCambio} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
