import { useEffect, useState } from "react";
import {
  User,
  Mail,
  Phone,
  Shield,
  KeyRound,
  CheckCircle,
  AlertCircle,
  Save,
  Lock,
} from "lucide-react";
import { useAuth } from "../../../context/useAuth";
import { apiRequest } from "../../../services/api";

export default function ProfileSection() {
  const { user, setUser } = useAuth();

  // Datos personales del Administrador
  const [perfilData, setPerfilData] = useState({
    nombre: user?.nombre || "",
    apellido: user?.apellido || "",
    correo: user?.email || "",
    telefono: user?.telefono || "",
    rol: "Administrador del Sistema",
  });

  // Datos de cambio de contraseña
  const [passwordData, setPasswordData] = useState({
    actual: "",
    nueva: "",
    confirmar: "",
  });

  const [mensajePerfil, setMensajePerfil] = useState("");
  const [errorPerfil, setErrorPerfil] = useState("");
  const [mensajePass, setMensajePass] = useState("");
  const [errorPass, setErrorPass] = useState("");
  const [cargando, setCargando] = useState(true);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [guardandoPass, setGuardandoPass] = useState(false);

  useEffect(() => {
    let active = true;
    apiRequest("/usuarios/perfil")
      .then((profile) => {
        if (!active) return;
        setPerfilData({
          nombre: profile.nombre || "",
          apellido: profile.apellido || "",
          correo: profile.correo || "",
          telefono: profile.telefono || "",
          rol: profile.rol?.etiqueta || profile.rol?.nombre || "Administrador",
        });
      })
      .catch((error) => {
        if (active) setErrorPerfil(error.message);
      })
      .finally(() => {
        if (active) setCargando(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleGuardarPerfil = async (e) => {
    e.preventDefault();
    setGuardandoPerfil(true);
    setMensajePerfil("");
    setErrorPerfil("");
    try {
      const profile = await apiRequest("/usuarios/perfil", {
        method: "PUT",
        body: JSON.stringify({
          nombre: perfilData.nombre,
          apellido: perfilData.apellido,
          correo: perfilData.correo,
          telefono: perfilData.telefono,
        }),
      });
      setPerfilData((prev) => ({
        ...prev,
        nombre: profile.nombre,
        apellido: profile.apellido,
        correo: profile.correo,
        telefono: profile.telefono || "",
      }));
      setUser({
        ...user,
        nombre: profile.nombre,
        apellido: profile.apellido,
        email: profile.correo,
        telefono: profile.telefono || "",
        role: profile.rol?.nombre || user?.role,
      });
      setMensajePerfil("¡Datos personales actualizados correctamente!");
    } catch (error) {
      setErrorPerfil(error.message);
    } finally {
      setGuardandoPerfil(false);
    }
  };

  const handleCambiarPassword = async (e) => {
    e.preventDefault();
    setErrorPass("");
    setMensajePass("");

    if (!passwordData.actual) {
      setErrorPass("Debes ingresar tu contraseña actual.");
      return;
    }

    if (passwordData.nueva.length < 6) {
      setErrorPass("La nueva contraseña debe tener al menos 6 caracteres.");
      return;
    }

    if (passwordData.nueva !== passwordData.confirmar) {
      setErrorPass("La confirmación de contraseña no coincide.");
      return;
    }

    setGuardandoPass(true);
    try {
      await apiRequest("/usuarios/perfil/contrasena", {
        method: "PUT",
        body: JSON.stringify({ actual: passwordData.actual, nueva: passwordData.nueva }),
      });
      setMensajePass("¡Contraseña actualizada con éxito!");
      setPasswordData({ actual: "", nueva: "", confirmar: "" });
    } catch (error) {
      setErrorPass(error.message);
    } finally {
      setGuardandoPass(false);
    }
  };

  return (
    <div className="admin-section">
      {/* CABECERA */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Mi Perfil de Administrador</h2>
          <p className="admin-section__subtitle">
            Consulta y gestiona tu información personal, correo electrónico y credenciales de acceso.
          </p>
        </div>
      </div>

      <div className="admin-profile-grid">
        {cargando && <p role="status">Cargando perfil...</p>}
        {/* TARJETA 1: INFORMACIÓN PERSONAL */}
        <div className="admin-card">
          <div className="admin-card__header">
            <div>
              <h3 className="admin-card__title">Información Personal</h3>
              <p className="admin-card__subtitle">
                Datos de contacto y representación de tu cuenta de administrador
              </p>
            </div>
          </div>

          {errorPerfil && (
            <div className="admin-alert-error">
              <AlertCircle size={18} />
              <span>{errorPerfil}</span>
            </div>
          )}
          {mensajePerfil && (
            <div className="admin-alert-success">
              <CheckCircle size={18} />
              <span>{mensajePerfil}</span>
            </div>
          )}

          <form onSubmit={handleGuardarPerfil} className="admin-form">
            <div className="admin-modal-grid">
              <div className="admin-form-group">
                <label className="admin-form-label">
                  Nombre
                </label>
                <div className="admin-input-icon-wrapper">
                  <User size={18} className="admin-input-icon" />
                  <input
                    type="text"
                    className="admin-form-input admin-input--with-icon"
                    value={perfilData.nombre}
                    onChange={(e) =>
                      setPerfilData({ ...perfilData, nombre: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">
                  Apellido
                </label>
                <div className="admin-input-icon-wrapper">
                  <User size={18} className="admin-input-icon" />
                  <input
                    type="text"
                    className="admin-form-input admin-input--with-icon"
                    value={perfilData.apellido}
                    onChange={(e) =>
                      setPerfilData({ ...perfilData, apellido: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
            </div>

            <div className="admin-modal-grid">
              <div className="admin-form-group">
                <label className="admin-form-label">
                  Correo Electrónico
                </label>
                <div className="admin-input-icon-wrapper">
                  <Mail size={18} className="admin-input-icon" />
                  <input
                    type="email"
                    className="admin-form-input admin-input--with-icon"
                    value={perfilData.correo}
                    onChange={(e) =>
                      setPerfilData({ ...perfilData, correo: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">
                  Teléfono de Contacto
                </label>
                <div className="admin-input-icon-wrapper">
                  <Phone size={18} className="admin-input-icon" />
                  <input
                    type="tel"
                    className="admin-form-input admin-input--with-icon"
                    value={perfilData.telefono}
                    onChange={(e) =>
                      setPerfilData({ ...perfilData, telefono: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="submit" className="admin-button--primary" disabled={guardandoPerfil || cargando}>
                <Save size={18} />
                <span>Guardar Cambios</span>
              </button>
            </div>
          </form>
        </div>

        {/* TARJETA 2: SEGURIDAD Y CONTRASEÑA */}
        <div className="admin-card">
          <div className="admin-card__header">
            <div>
              <h3 className="admin-card__title">Seguridad y Credenciales</h3>
              <p className="admin-card__subtitle">
                Actualiza tu clave de acceso al panel para mantener tu cuenta protegida
              </p>
            </div>
          </div>

          {errorPass && (
            <div className="admin-alert-error">
              <AlertCircle size={18} />
              <span>{errorPass}</span>
            </div>
          )}

          {mensajePass && (
            <div className="admin-alert-success">
              <CheckCircle size={18} />
              <span>{mensajePass}</span>
            </div>
          )}

          <form onSubmit={handleCambiarPassword} className="admin-form">
            <div className="admin-form-group">
              <label className="admin-form-label">
                Contraseña Actual
              </label>
              <div className="admin-input-icon-wrapper">
                <Lock size={18} className="admin-input-icon" />
                <input
                  type="password"
                  className="admin-form-input admin-input--with-icon"
                  placeholder="••••••••"
                  value={passwordData.actual}
                  onChange={(e) =>
                    setPasswordData({ ...passwordData, actual: e.target.value })
                  }
                  required
                />
              </div>
            </div>

            <div className="admin-modal-grid">
              <div className="admin-form-group">
                <label className="admin-form-label">
                  Nueva Contraseña
                </label>
                <div className="admin-input-icon-wrapper">
                  <KeyRound size={18} className="admin-input-icon" />
                  <input
                    type="password"
                    className="admin-form-input admin-input--with-icon"
                    placeholder="Mínimo 6 caracteres"
                    value={passwordData.nueva}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, nueva: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="admin-form-group">
                <label className="admin-form-label">
                  Confirmar Nueva Contraseña
                </label>
                <div className="admin-input-icon-wrapper">
                  <KeyRound size={18} className="admin-input-icon" />
                  <input
                    type="password"
                    className="admin-form-input admin-input--with-icon"
                    placeholder="Repite la contraseña"
                    value={passwordData.confirmar}
                    onChange={(e) =>
                      setPasswordData({ ...passwordData, confirmar: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "1rem" }}>
              <button type="submit" className="admin-button--secondary-sm" disabled={guardandoPass} style={{ height: "42px", padding: "0 1.25rem" }}>
                <KeyRound size={16} />
                <span>Actualizar Contraseña</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
