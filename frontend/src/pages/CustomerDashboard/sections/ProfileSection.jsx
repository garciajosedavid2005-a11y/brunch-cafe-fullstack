import { useState } from "react";
import { useAuth } from "../../../context/useAuth";
import { apiRequest } from "../../../services/api";
import SectionHeading from "../SectionHeading";

export default function ProfileSection() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    nombre: user?.nombre || "",
    apellido: user?.apellido || "",
    email: user?.email || "",
    telefono: user?.telefono || "",
  });
  const [status, setStatus] = useState({ message: "", error: false });
  const [saving, setSaving] = useState(false);

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
        body: JSON.stringify({ nombre: form.nombre, apellido: form.apellido, correo: form.email, telefono: form.telefono }),
      });
      const actualizado = { nombre: perfil.nombre, apellido: perfil.apellido, email: perfil.correo, telefono: perfil.telefono };
      setForm(actualizado);
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
      {status.message && <p className={`dashboard-notice ${status.error ? "is-error" : ""}`} role="status">{status.message}</p>}
      <form className="dashboard-form" onSubmit={saveProfile}>
        <label>Nombre<input name="nombre" value={form.nombre} onChange={updateField} required maxLength={60} /></label>
        <label>Apellido<input name="apellido" value={form.apellido} onChange={updateField} required maxLength={60} /></label>
        <label>Correo electrónico<input name="email" type="email" value={form.email} onChange={updateField} required maxLength={254} /></label>
        <label>Teléfono<input name="telefono" type="tel" value={form.telefono} onChange={updateField} required maxLength={30} /></label>
        <button className="dashboard-button" type="submit" disabled={saving}>
          {saving ? "Guardando..." : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
