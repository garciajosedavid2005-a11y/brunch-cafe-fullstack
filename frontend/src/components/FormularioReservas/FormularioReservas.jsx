import { useState } from "react";
import { FaCalendarAlt, FaClock, FaCommentAlt, FaEnvelope, FaUser, FaUsers } from "react-icons/fa";
import { useAuth } from "../../context/useAuth";
import { apiRequest } from "../../services/api";
import ResumenReserva from "../ResumenReserva/ResumenReserva";
import "./FormularioReservas.css";

function getTimesForDate(date) {
  if (!date) return [];
  const [year, month, day] = date.split("-").map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const lastHour = weekday === 0 || weekday === 6 ? 11 : 12;

  return Array.from({ length: lastHour - 7 }, (_, index) => {
    const hour = index + 8;
    return {
      id: `${String(hour).padStart(2, "0")}:00`,
      nombre: hour === 12 ? "12:00 PM" : `${hour}:00 AM`,
    };
  });
}

export default function FormularioReservas() {
  const { user } = useAuth();
  const today = new Date().toLocaleDateString("en-CA");
  const [formData, setFormData] = useState({
    nombre: `${user?.nombre || ""} ${user?.apellido || ""}`.trim(),
    correo: user?.email || "",
    motivo: "",
    personas: "",
    fecha: "",
    hora: "",
    observaciones: "",
  });
  const [errores, setErrores] = useState({});
  const [mostrarModal, setMostrarModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ text: "", error: false });

  const handleChange = (event) => {
    const { name, value } = event.target;
    setFormData((current) => ({
      ...current,
      [name]: value,
      ...(name === "fecha" ? { hora: "" } : {}),
    }));
    setErrores((current) => ({ ...current, [name]: "" }));
  };

  const validar = () => {
    const nextErrors = {};
    if (formData.nombre.trim().length < 3) nextErrors.nombre = "Ingresa un nombre de al menos 3 caracteres.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.correo.trim())) nextErrors.correo = "Ingresa un correo válido.";
    if (!formData.motivo.trim() || formData.motivo.trim().length < 3) nextErrors.motivo = "Indica el motivo de la reserva.";
    if (!formData.personas) nextErrors.personas = "Selecciona la cantidad de personas.";
    if (!formData.fecha) nextErrors.fecha = "La fecha es requerida.";
    if (!formData.hora) nextErrors.hora = "Selecciona una hora disponible.";
    if (formData.observaciones.length > 200) nextErrors.observaciones = "Las observaciones no pueden superar 200 caracteres.";
    return nextErrors;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validar();
    if (Object.keys(nextErrors).length) {
      setErrores(nextErrors);
      return;
    }
    setErrores({});
    setMensaje({ text: "", error: false });
    setMostrarModal(true);
  };

  const handleConfirmar = async () => {
    setGuardando(true);
    try {
      await apiRequest("/customer/reservations", {
        method: "POST",
        body: JSON.stringify({ ...formData, personas: Number(formData.personas) }),
      });
      setMostrarModal(false);
      setMensaje({ text: "Tu solicitud de reserva fue enviada y quedó pendiente de aprobación.", error: false });
      setFormData({
        nombre: `${user?.nombre || ""} ${user?.apellido || ""}`.trim(),
        correo: user?.email || "",
        motivo: "",
        personas: "",
        fecha: "",
        hora: "",
        observaciones: "",
      });
    } catch (error) {
      setMostrarModal(false);
      setMensaje({ text: error.message, error: true });
    } finally {
      setGuardando(false);
    }
  };

  const resetForm = () => {
    setFormData({
      nombre: `${user?.nombre || ""} ${user?.apellido || ""}`.trim(),
      correo: user?.email || "",
      motivo: "",
      personas: "",
      fecha: "",
      hora: "",
      observaciones: "",
    });
    setErrores({});
  };

  return (
    <>
      <section className="formulario-seccion">
        <div className="grid-container">
          <div className="grid-x grid-padding-x">
            <div className="cell small-12 medium-8 large-6">
              <div className="formulario-card">
                <h2 className="formulario-titulo">BIENVENIDOS A BRUNCH CAFE...</h2>
                {mensaje.text && (
                  <p className={`formulario-reserva-notice ${mensaje.error ? "is-error" : ""}`} role={mensaje.error ? "alert" : "status"}>
                    {mensaje.text}
                  </p>
                )}
                <form onSubmit={handleSubmit}>
                  <label htmlFor="nombre">Ingrese el nombre:</label>
                  <div className="formulario-campo-icono">
                    <FaUser className="formulario-icono" />
                    <input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} placeholder="Ingrese su nombre" required maxLength={120} />
                  </div>
                  {errores.nombre && <p className="formulario-error">{errores.nombre}</p>}

                  <label htmlFor="correo">Ingrese su correo electrónico:</label>
                  <div className="formulario-campo-icono">
                    <FaEnvelope className="formulario-icono" />
                    <input id="correo" name="correo" type="email" value={formData.correo} onChange={handleChange} placeholder="ejemplo@correo.com" required maxLength={254} />
                  </div>
                  {errores.correo && <p className="formulario-error">{errores.correo}</p>}

                  <label htmlFor="motivo">Motivo de la reserva:</label>
                  <div className="formulario-campo-icono">
                    <FaCommentAlt className="formulario-icono" />
                    <input id="motivo" name="motivo" value={formData.motivo} onChange={handleChange} placeholder="Celebración, reunión, brunch..." required maxLength={120} />
                  </div>
                  {errores.motivo && <p className="formulario-error">{errores.motivo}</p>}

                  <label htmlFor="personas">Seleccione la cantidad de personas:</label>
                  <div className="formulario-campo-icono">
                    <FaUsers className="formulario-icono" />
                    <select id="personas" name="personas" value={formData.personas} onChange={handleChange} required>
                      <option value="">Seleccione...</option>
                      {Array.from({ length: 20 }, (_, index) => index + 1).map((count) => (
                        <option key={count} value={count}>{count} {count === 1 ? "Persona" : "Personas"}</option>
                      ))}
                    </select>
                  </div>
                  {errores.personas && <p className="formulario-error">{errores.personas}</p>}

                  <label htmlFor="fecha">Ingrese la fecha que desee:</label>
                  <div className="formulario-campo-icono">
                    <FaCalendarAlt className="formulario-icono" />
                    <input id="fecha" name="fecha" type="date" value={formData.fecha} onChange={handleChange} min={today} required />
                  </div>
                  {errores.fecha && <p className="formulario-error">{errores.fecha}</p>}

                  <label htmlFor="hora">Ingrese la hora:</label>
                  <div className="formulario-campo-icono">
                    <FaClock className="formulario-icono" />
                    <select id="hora" name="hora" value={formData.hora} onChange={handleChange} disabled={!formData.fecha} required>
                      <option value="">Seleccione...</option>
                      {getTimesForDate(formData.fecha).map((time) => (
                        <option key={time.id} value={time.id}>{time.nombre}</option>
                      ))}
                    </select>
                  </div>
                  {errores.hora && <p className="formulario-error">{errores.hora}</p>}

                  <label htmlFor="observaciones">Observaciones adicionales:</label>
                  <div className="formulario-campo-icono formulario-campo-icono--textarea">
                    <FaCommentAlt className="formulario-icono formulario-icono--top" />
                    <textarea id="observaciones" name="observaciones" value={formData.observaciones} onChange={handleChange} rows="4" maxLength={200} placeholder="Alguna solicitud especial, alergias, etc." />
                  </div>
                  {errores.observaciones && <p className="formulario-error">{errores.observaciones}</p>}

                  <div className="formulario-botones">
                    <button type="button" className="button secondary hollow" onClick={resetForm}>Limpiar Reserva</button>
                    <button type="submit" className="button">Enviar Reserva</button>
                  </div>
                  <p className="formulario-reserva-horario">Lunes a viernes: 8:00 a. m. – 12:00 p. m. · Sábados y domingos: 8:00 a. m. – 11:00 a. m.</p>
                </form>
              </div>
            </div>
          </div>
        </div>
      </section>
      {mostrarModal && (
        <ResumenReserva
          formData={formData}
          onEditar={() => setMostrarModal(false)}
          onConfirmar={handleConfirmar}
          guardando={guardando}
        />
      )}
    </>
  );
}
