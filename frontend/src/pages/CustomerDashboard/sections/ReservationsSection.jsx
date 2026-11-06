import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../../services/api";
import { useAuth } from "../../../context/useAuth";
import SectionHeading from "../SectionHeading";
import { useDialogo } from "../../../context/useDialogo";
import { hoyLocal, formatearFechaCalendario, formatearHoraTexto } from "../../../utils/fechas";
import { useHorarios } from "../../../hooks/useHorarios";
import { horasReserva, opcionesDeHora } from "../../../utils/horarios";

const minimumDate = hoyLocal(); // día de Bogotá
const reservationStatus = {
  pending: "Pendiente de aprobación",
  confirmed: "Confirmada",
  seated: "En curso",
  completed: "Completada",
  cancelled: "Cancelada",
  no_show: "No asistió",
};
// El cliente solo puede editar o cancelar mientras la reserva está pendiente o confirmada
const editableStatuses = ["pending", "confirmed"];

function createEditForm(reservation, user) {
  return {
    nombre: reservation.nombre || `${user?.nombre || ""} ${user?.apellido || ""}`.trim(),
    correo: reservation.correo || user?.email || "",
    // Las reservas anteriores a 0.8 no tienen teléfono: se propone el del perfil
    telefono: reservation.telefono || user?.telefono || "",
    motivo: reservation.motivo || "",
    personas: String(reservation.personas || 1),
    fecha: new Date(reservation.fecha).toISOString().slice(0, 10),
    hora: reservation.hora,
    observaciones: reservation.observaciones || "",
  };
}

const formatTime = formatearHoraTexto;

export default function ReservationsSection() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ message: "", error: false });
  const { confirmar } = useDialogo();
  const { horarios, ahora } = useHorarios();

  useEffect(() => {
    apiRequest("/v1/cliente/reservas")
      .then(({ reservations: customerReservations }) => setReservations(customerReservations))
      .catch((error) => setNotice({ message: error.message, error: true }))
      .finally(() => setLoading(false));
  }, []);

  const updateEditField = (event) => {
    const { name, value } = event.target;
    setEditForm((current) => ({ ...current, [name]: value, ...(name === "fecha" ? { hora: "" } : {}) }));
  };

  const beginEditing = (reservation) => {
    setEditingId(reservation._id);
    setEditForm(createEditForm(reservation, user));
    setNotice({ message: "", error: false });
  };

  const saveChanges = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice({ message: "", error: false });
    try {
      const { reservation } = await apiRequest(`/v1/cliente/reservas/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({ ...editForm, personas: Number(editForm.personas) }),
      });
      setReservations((current) => current.map((item) => item._id === editingId ? reservation : item));
      setEditingId("");
      setEditForm(null);
      setNotice({ message: "Cambios guardados. La reserva volvió a quedar pendiente de aprobación.", error: false });
    } catch (error) {
      setNotice({ message: error.message, error: true });
    } finally {
      setSaving(false);
    }
  };

  const cancelReservation = async (id) => {
    const { confirmado } = await confirmar({
      titulo: "Cancelar reserva",
      mensaje: "¿Estás seguro de que deseas cancelar esta reserva?",
      confirmarTexto: "Sí, cancelar reserva",
      cancelarTexto: "Volver",
      peligroso: true,
    });
    if (!confirmado) return;
    setNotice({ message: "", error: false });
    try {
      const { reservation } = await apiRequest(`/v1/cliente/reservas/${id}/cancelar`, { method: "PATCH" });
      setReservations((current) => current.map((item) => item._id === id ? reservation : item));
      if (editingId === id) {
        setEditingId("");
        setEditForm(null);
      }
      setNotice({ message: "La reserva fue cancelada.", error: false });
    } catch (error) {
      setNotice({ message: error.message, error: true });
    }
  };

  return (
    <div>
      <SectionHeading eyebrow="PLANEA TU VISITA" title="Mis reservas">
        Consulta, edita o cancela tus reservas. Para solicitar una nueva, utiliza la sección <Link to="/reservas">Reservas</Link>.
      </SectionHeading>
      {notice.message && <p className={`dashboard-notice ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.message}</p>}

      <h3 className="dashboard-subheading">Reservas registradas</h3>
      {loading && <p className="dashboard-empty">Cargando tus reservas...</p>}
      {!loading && reservations.length === 0 && (
        <p className="dashboard-empty">Aún no tienes reservas. Puedes crear una desde la sección <Link to="/reservas">Reservas</Link>.</p>
      )}
      <div className="dashboard-list">
        {reservations.map((reservation) => (
          <article className="dashboard-card" key={reservation._id}>
            <div className="dashboard-reservation">
              <div>
                <span className={`dashboard-status status-${reservation.status}`}>{reservationStatus[reservation.status] || reservation.status}</span>
                <h3>{formatearFechaCalendario(reservation.fecha, "long")} · {formatTime(reservation.hora)}</h3>
                <p>{reservation.nombre || `${reservation.user?.nombre || user?.nombre || ""} ${reservation.user?.apellido || user?.apellido || ""}`.trim()} · {reservation.correo || reservation.user?.email || user?.email}</p>
                <p><strong>Motivo:</strong> {reservation.motivo || "No especificado"} · {reservation.personas} {reservation.personas === 1 ? "persona" : "personas"}{reservation.observaciones ? ` · ${reservation.observaciones}` : ""}</p>
              </div>
              {editableStatuses.includes(reservation.status) && (
                <div className="dashboard-reservation__actions">
                  <button className="dashboard-button dashboard-button--secondary" type="button" onClick={() => beginEditing(reservation)}>
                    Editar
                  </button>
                  <button className="dashboard-button dashboard-button--secondary" type="button" onClick={() => cancelReservation(reservation._id)}>
                    Cancelar reserva
                  </button>
                </div>
              )}
            </div>
            {editingId === reservation._id && editForm && (
              <form className="dashboard-form dashboard-reservation-edit" onSubmit={saveChanges}>
                <label>Nombre<input name="nombre" value={editForm.nombre} onChange={updateEditField} required minLength={3} maxLength={120} /></label>
                <label>Correo electrónico<input name="correo" type="email" value={editForm.correo} onChange={updateEditField} required maxLength={254} /></label>
                <label>Motivo<input name="motivo" value={editForm.motivo} onChange={updateEditField} required minLength={3} maxLength={120} /></label>
                <label>Teléfono<input name="telefono" type="tel" value={editForm.telefono} onChange={updateEditField} required maxLength={30} autoComplete="tel" /></label>
                <label>Personas<input name="personas" type="number" min="1" max="20" value={editForm.personas} onChange={updateEditField} required /></label>
                <label>Fecha<input name="fecha" type="date" min={minimumDate} value={editForm.fecha} onChange={updateEditField} required /></label>
                <label>Hora
                  <select name="hora" value={editForm.hora} onChange={updateEditField} required>
                    <option value="">Selecciona una hora</option>
                    {opcionesDeHora(horasReserva(horarios, editForm.fecha, ahora)).map((opcion) => (
                      <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
                    ))}
                  </select>
                </label>
                <label className="dashboard-form__wide">Observaciones<textarea name="observaciones" value={editForm.observaciones} onChange={updateEditField} maxLength={200} rows="3" /></label>
                <div className="dashboard-reservation__actions dashboard-form__wide">
                  <button className="dashboard-button" type="submit" disabled={saving}>{saving ? "Guardando..." : "Guardar cambios"}</button>
                  <button className="dashboard-button dashboard-button--secondary" type="button" onClick={() => { setEditingId(""); setEditForm(null); }}>Descartar</button>
                </div>
                <p className="dashboard-hours dashboard-form__wide">Al guardar cambios, la reserva volverá a estado pendiente para que el equipo la apruebe nuevamente.</p>
              </form>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
