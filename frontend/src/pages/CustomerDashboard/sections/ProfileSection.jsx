import { useEffect, useState } from "react";
import { useAuth } from "../../../context/useAuth";
import { apiRequest } from "../../../services/api";
import { formatearFecha, hoyLocal } from "../../../utils/fechas";
import SectionHeading from "../SectionHeading";

const MAX_TEXTO = 200; // 6.4 · el mismo límite del backend (usuario.model.js)

export default function ProfileSection() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    nombre: user?.nombre || "",
    apellido: user?.apellido || "",
    email: user?.email || "",
    telefono: user?.telefono || "",
    // 6.4 (F6-8) · No vienen en la sesión: se cargan del perfil al abrir la sección
    fechaNacimiento: "",
    alergias: "",
    preferencias: "",
  });
  const [consentimiento, setConsentimiento] = useState(null);
  const [status, setStatus] = useState({ message: "", error: false });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let activo = true;
    apiRequest("/v1/cliente/perfil")
      .then(({ perfil }) => {
        if (!activo) return;
        setForm((actual) => ({
          ...actual,
          fechaNacimiento: perfil.fechaNacimiento || "",
          alergias: perfil.alergias || "",
          preferencias: perfil.preferencias || "",
        }));
        setConsentimiento(perfil.consentimiento || null);
      })
      .catch((error) => activo && setStatus({ message: error.message || "No se pudo cargar tu perfil.", error: true }));
    return () => { activo = false; };
  }, []);

  const updateField = (event) => {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    setSaving(true);
    setStatus({ message: "", error: false });
    try {
      // El formulario usa `email` (como la sesión); la API v1 usa `correo`
      const { perfil } = await apiRequest("/v1/cliente/perfil", {
        method: "PATCH",
        body: JSON.stringify({
          nombre: form.nombre, apellido: form.apellido, correo: form.email, telefono: form.telefono,
          fechaNacimiento: form.fechaNacimiento, alergias: form.alergias.trim(), preferencias: form.preferencias.trim(),
        }),
      });
      const actualizado = { nombre: perfil.nombre, apellido: perfil.apellido, email: perfil.correo, telefono: perfil.telefono };
      setForm({ ...actualizado, fechaNacimiento: perfil.fechaNacimiento || "", alergias: perfil.alergias || "", preferencias: perfil.preferencias || "" });
      setUser((currentUser) => ({ ...currentUser, ...actualizado }));
      setStatus({ message: "Tu perfil se actualizó correctamente.", error: false });
    } catch (error) {
      setStatus({ message: error.message, error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <SectionHeading eyebrow="TU INFORMACIÓN" title="Mi perfil">
        Mantén tus datos de contacto actualizados.
      </SectionHeading>
      {status.message && <p className={`dashboard-notice ${status.error ? "is-error" : ""}`} role={status.error ? "alert" : "status"}>{status.message}</p>}
      <form className="dashboard-form" onSubmit={saveProfile}>
        <label>Nombre<input name="nombre" value={form.nombre} onChange={updateField} required maxLength={60} /></label>
        <label>Apellido<input name="apellido" value={form.apellido} onChange={updateField} required maxLength={60} /></label>
        <label>Correo electrónico<input name="email" type="email" value={form.email} onChange={updateField} required maxLength={254} /></label>
        <label>Teléfono<input name="telefono" type="tel" value={form.telefono} onChange={updateField} required maxLength={30} /></label>
        {/* 6.4 · Para el descuento de cumpleaños (opcional) */}
        <label>Fecha de nacimiento
          <input name="fechaNacimiento" type="date" value={form.fechaNacimiento} onChange={updateField} min="1900-01-01" max={hoyLocal()} />
        </label>
        <p className="dashboard-form__wide dashboard-form__ayuda">
          Tus alergias y preferencias las ve el equipo de cocina y de sala cuando te atiende. Nada más de tu perfil.
        </p>
        <label>Alergias
          <textarea name="alergias" rows={2} value={form.alergias} onChange={updateField} maxLength={MAX_TEXTO} placeholder="Ej.: maní, mariscos" />
        </label>
        <label>Preferencias
          <textarea name="preferencias" rows={2} value={form.preferencias} onChange={updateField} maxLength={MAX_TEXTO} placeholder="Ej.: leche de almendra, sin cebolla" />
        </label>
        <button className="dashboard-button" type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
      {consentimiento && (
        <p className="dashboard-form__ayuda dashboard-consentimiento">
          Aceptaste la política de tratamiento de datos (versión {consentimiento.version}) el {formatearFecha(consentimiento.aceptadoEn)}.
        </p>
      )}
    </div>
  );
}
