import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../../services/api";
import { useAuth } from "../../../context/useAuth";
import SectionHeading from "../SectionHeading";

const today = new Date();
const minimumDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
const reservationStatus = { pending: "Pendiente de aprobación", confirmed: "Confirmada", cancelled: "Cancelada" };

function getAvailableTimes(date) {
  if (!date) return [];
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const lastHour = weekday === 0 || weekday === 6 ? 11 : 12;
  return Array.from({ length: lastHour - 7 }, (_, index) => `${String(index + 8).padStart(2, "0")}:00`);
}

function createEditForm(reservation, user) {
  return {
    nombre: reservation.nombre || `${user?.nombre || ""} ${user?.apellido || ""}`.trim(),
    correo: reservation.correo || user?.email || "",
    motivo: reservation.motivo || "",
    personas: String(reservation.personas || 1),
    fecha: new Date(reservation.fecha).toISOString().slice(0, 10),
    hora: reservation.hora,
    observaciones: reservation.observaciones || "",
  };
}

function formatTime(time) {
  const hour = Number(time.slice(0, 2));
  return hour === 12 ? "12:00 p. m." : `${hour > 12 ? hour - 12 : hour}:00 a. m.`;
}

export default function ReservationsSection() {
  const { user } = useAuth();
  const [reservations, setReservations] = useState([]);
  const [editingId, setEditingId] = useState("");
  const [editForm, setEditForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ message: "", error: false });

  useEffect(() => {
    apiRequest("/customer/reservations")
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
      const { reservation } = await apiRequest(`/customer/reservations/${editingId}`, {
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
    setNotice({ message: "", error: false });
    try {
      const { reservation } = await apiRequest(`/customer/reservations/${id}/cancel`, { method: "PATCH" });
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
                <h3>{new Intl.DateTimeFormat("es-CO", { dateStyle: "long", timeZone: "UTC" }).format(new Date(reservation.fecha))} · {formatTime(reservation.hora)}</h3>
                <p>{reservation.nombre || `${reservation.user?.nombre || user?.nombre || ""} ${reservation.user?.apellido || user?.apellido || ""}`.trim()} · {reservation.correo || reservation.user?.email || user?.email}</p>
                <p><strong>Motivo:</strong> {reservation.motivo || "No especificado"} · {reservation.personas} {reservation.personas === 1 ? "persona" : "personas"}{reservation.observaciones ? ` · ${reservation.observaciones}` : ""}</p>
              </div>
              {reservation.status !== "cancelled" && (
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
                <label>Personas<input name="personas" type="number" min="1" max="20" value={editForm.personas} onChange={updateEditField} required /></label>
                <label>Fecha<input name="fecha" type="date" min={minimumDate} value={editForm.fecha} onChange={updateEditField} required /></label>
                <label>Hora
                  <select name="hora" value={editForm.hora} onChange={updateEditField} required>
                    <option value="">Selecciona una hora</option>
                    {getAvailableTimes(editForm.fecha).map((time) => (
                      <option key={time} value={time}>{formatTime(time)}</option>
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
