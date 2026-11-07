import { useState } from "react";
import { FaCalendarAlt, FaClock, FaCommentAlt, FaEnvelope, FaPhone, FaUser, FaUsers } from "react-icons/fa";
import { useAuth } from "../../context/useAuth";
import { apiRequest } from "../../services/api";
import ResumenReserva from "../ResumenReserva/ResumenReserva";
import "./FormularioReservas.css";
import { hoyLocal } from "../../utils/fechas";
import { useHorarios } from "../../hooks/useHorarios";
import { horasReserva, opcionesDeHora, textoRango } from "../../utils/horarios";
import { esTelefono, MENSAJE_TELEFONO } from "../../utils/telefono";
import { esPersonal, tienePermiso } from "../../utils/permisos";

function getToday() {
  return hoyLocal(); // día de Bogotá, no el del navegador
}

function initialForm(user) {
  return {
    nombre: `${user?.nombre || ""} ${user?.apellido || ""}`.trim(),
    correo: user?.email || "",
    // Contacto de la reserva (obligatorio): se prellena con el del perfil
    telefono: user?.telefono || "",
    motivo: "",
    personas: "",
    fecha: "",
    hora: "",
    observaciones: "",
  };
}

export default function FormularioReservas() {
  const { user } = useAuth();
  // El personal registra la reserva de un cliente (0.15e): formulario vacío y correo opcional
  const porPersonal = esPersonal(user) && tienePermiso(user, "reserva:crear");
  const formularioInicial = () => initialForm(porPersonal ? null : user);
  const [formData, setFormData] = useState(formularioInicial);
  const [errores, setErrores] = useState({});
  const [mostrarModal, setMostrarModal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ text: "", error: false });
  // Horas en punto del horario configurado en el admin; hoy, solo las que no han pasado
  const { horarios, error: errorHorarios, ahora } = useHorarios();
  const horas = horasReserva(horarios, formData.fecha, ahora);

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
    const correo = formData.correo.trim();
    if ((correo || !porPersonal) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) nextErrors.correo = "Ingresa un correo válido.";
    if (!esTelefono(formData.telefono.trim())) nextErrors.telefono = formData.telefono.trim() ? MENSAJE_TELEFONO : "El teléfono es requerido.";
    if (formData.motivo.trim().length < 3) nextErrors.motivo = "Indica el motivo de la reserva.";
    if (!formData.personas) nextErrors.personas = "Selecciona la cantidad de personas.";
    if (!formData.fecha) nextErrors.fecha = "La fecha es requerida.";
    if (!formData.hora || !horas.includes(formData.hora)) nextErrors.hora = "Selecciona una hora disponible.";
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
      await apiRequest(porPersonal ? "/v1/staff/reservas" : "/v1/cliente/reservas", {
        method: "POST",
        body: JSON.stringify({ ...formData, personas: Number(formData.personas) }),
      });
      setMostrarModal(false);
      // La confirmación por correo la envía el backend al guardar (0.16), si la reserva tiene correo
      const conCorreo = Boolean(formData.correo.trim());
      setMensaje({
        text: porPersonal
          ? `Reserva registrada para ${formData.nombre.trim()}. Quedó pendiente de confirmación${conCorreo ? "; le enviaremos los detalles a su correo." : "."}`
          : "Tu solicitud de reserva fue enviada y quedó pendiente de aprobación. Te enviaremos un correo con los detalles.",
        error: false,
      });
      setFormData(formularioInicial());
    } catch (error) {
      setMostrarModal(false);
      setMensaje({ text: error.message, error: true });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <section className="formulario-seccion">
        <div className="grid-container">
          <div className="grid-x grid-padding-x">
            <div className="cell small-12 medium-8 large-6">
              <div className="formulario-card">
                <h2 className="formulario-titulo">{porPersonal ? "REGISTRAR LA RESERVA DE UN CLIENTE" : "BIENVENIDOS A BRUNCH CAFE..."}</h2>
                {mensaje.text && (
                  <p className={`formulario-reserva-notice ${mensaje.error ? "is-error" : ""}`} role={mensaje.error ? "alert" : "status"}>
                    {mensaje.text}
                  </p>
                )}
                <form onSubmit={handleSubmit}>
                  <label htmlFor="nombre">{porPersonal ? "Nombre del cliente:" : "Ingrese el nombre:"}</label>
                  <div className="formulario-campo-icono">
                    <FaUser className="formulario-icono" aria-hidden="true" />
                    <input id="nombre" name="nombre" value={formData.nombre} onChange={handleChange} placeholder={porPersonal ? "Nombre y apellido del cliente" : "Ingrese su nombre"} required minLength={3} maxLength={120} />
                  </div>
                  {errores.nombre && <p className="formulario-error">{errores.nombre}</p>}

                  <label htmlFor="correo">{porPersonal ? "Correo del cliente (opcional):" : "Ingrese su correo electrónico:"}</label>
                  <div className="formulario-campo-icono">
                    <FaEnvelope className="formulario-icono" aria-hidden="true" />
                    <input id="correo" name="correo" type="email" value={formData.correo} onChange={handleChange} placeholder="ejemplo@correo.com" required={!porPersonal} maxLength={254} />
                  </div>
                  {errores.correo && <p className="formulario-error">{errores.correo}</p>}

                  <label htmlFor="telefono">{porPersonal ? "Teléfono del cliente:" : "Teléfono de contacto:"}</label>
                  <div className="formulario-campo-icono">
                    <FaPhone className="formulario-icono" aria-hidden="true" />
                    <input id="telefono" name="telefono" type="tel" value={formData.telefono} onChange={handleChange} placeholder="Ej: 300 123 4567" required maxLength={30} autoComplete="tel" />
                  </div>
                  {errores.telefono && <p className="formulario-error">{errores.telefono}</p>}

                  <label htmlFor="motivo">Motivo de la reserva:</label>
                  <div className="formulario-campo-icono">
                    <FaCommentAlt className="formulario-icono" aria-hidden="true" />
                    <input id="motivo" name="motivo" value={formData.motivo} onChange={handleChange} placeholder="Celebración, reunión, brunch..." required minLength={3} maxLength={120} />
                  </div>
                  {errores.motivo && <p className="formulario-error">{errores.motivo}</p>}

                  <label htmlFor="personas">Seleccione la cantidad de personas:</label>
                  <div className="formulario-campo-icono">
                    <FaUsers className="formulario-icono" aria-hidden="true" />
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
                    <FaCalendarAlt className="formulario-icono" aria-hidden="true" />
                    <input id="fecha" name="fecha" type="date" value={formData.fecha} onChange={handleChange} min={getToday()} required />
                  </div>
                  {errores.fecha && <p className="formulario-error">{errores.fecha}</p>}

                  <label htmlFor="hora">Ingrese la hora:</label>
                  <div className="formulario-campo-icono">
                    <FaClock className="formulario-icono" aria-hidden="true" />
                    <select id="hora" name="hora" value={horas.includes(formData.hora) ? formData.hora : ""} onChange={handleChange} disabled={!horas.length} required>
                      <option value="">{!formData.fecha ? "Elija primero la fecha" : horas.length ? "Seleccione..." : "Sin horas disponibles ese día"}</option>
                      {opcionesDeHora(horas).map((opcion) => (
                        <option key={opcion.valor} value={opcion.valor}>{opcion.etiqueta}</option>
                      ))}
                    </select>
                  </div>
                  {errores.hora && <p className="formulario-error">{errores.hora}</p>}

                  <label htmlFor="observaciones">Observaciones adicionales:</label>
                  <div className="formulario-campo-icono formulario-campo-icono--textarea">
                    <FaCommentAlt className="formulario-icono formulario-icono--top" aria-hidden="true" />
                    <textarea id="observaciones" name="observaciones" value={formData.observaciones} onChange={handleChange} rows="4" maxLength={200} placeholder="Alguna solicitud especial, alergias, etc." />
                  </div>
                  {errores.observaciones && <p className="formulario-error">{errores.observaciones}</p>}

                  <div className="formulario-botones">
                    <button type="button" className="button secondary hollow" onClick={() => {
                      setFormData(initialForm(user));
                      setErrores({});
                    }}>Limpiar Reserva</button>
                    <button type="submit" className="button">Enviar Reserva</button>
                  </div>
                  <p className="formulario-reserva-horario">
                    {horarios
                      ? `Horario de reservas: lunes a viernes de ${textoRango(horarios.reservas.entreSemana)} · sábados y domingos de ${textoRango(horarios.reservas.finDeSemana)}.`
                      : errorHorarios || "Cargando el horario de reservas..."}
                  </p>
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
