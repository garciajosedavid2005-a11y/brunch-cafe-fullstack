import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { User, Mail, Phone, Lock, Eye, EyeOff, Sparkles } from "lucide-react";
import AuthBanner from "../Auth/AuthBanner";
import "../Auth/Auth.css";

const Registro = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    nombre: "",
    apellido: "",
    email: "",
    telefono: "",
    password: "",
  });
  const [mostrarPassword, setMostrarPassword] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setCargando(true);
    setMensaje(null);

    // Validación estricta de campos obligatorios
    if (
      !formData.nombre.trim() ||
      !formData.apellido.trim() ||
      !formData.email.trim() ||
      !formData.telefono.trim() ||
      !formData.password.trim()
    ) {
      setCargando(false);
      setMensaje({
        tipo: "error",
        texto: "Por favor, completa todos los campos obligatorios marcados con (*).",
      });
      return;
    }

    try {
      const res = await fetch("http://localhost:4000/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          nombre: formData.nombre.trim(),
          apellido: formData.apellido.trim(),
          correo: formData.email.trim(),
          contraseña: formData.password,
          telefono: formData.telefono.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setCargando(false);
        setMensaje({
          tipo: "error",
          // Zod responde un array de mensajes; los demás errores vienen como { message }
          texto: Array.isArray(data)
            ? data[0]
            : data.message || "Error al crear la cuenta",
        });
        return;
      }

      setCargando(false);
      setMensaje({
        tipo: "exito",
        texto: "¡Cuenta creada exitosamente! Ahora inicia sesión.",
      });
      setTimeout(() => {
        navigate("/login");
      }, 1400);
    } catch (err) {
      setCargando(false);
      setMensaje({
        tipo: "error",
        texto: "No se pudo conectar con el servidor",
      });
    }
  };

  return (
    <main className="auth-pagina">
      <div className="auth-card-container">
        {/* Columna Izquierda: Banner de Marca & Experiencia (Split-Screen) */}
        <AuthBanner modo="registro" />

        {/* Columna Derecha: Formulario Minimalista */}
        <div className="auth-formulario-contenedor">
          {/* Pestañas de navegación */}
          <nav className="auth-tabs auth-animar-item auth-delay-1" aria-label="Navegación de autenticación">
            <Link to="/login" className="auth-tab">
              Iniciar Sesión
            </Link>
            <Link to="/registro" className="auth-tab auth-tab--activo">
              Registrarse
            </Link>
          </nav>

          {/* Encabezado del Formulario */}
          <header className="auth-header auth-animar-item auth-delay-2">
            <span className="auth-header__subtitulo-acento">Empieza tu experiencia</span>
            <h1 className="auth-header__titulo">Crear Cuenta</h1>
            <p className="auth-header__descripcion">
              Únete a Brunch Café y disfruta de una atmósfera gastronómica única con beneficios exclusivos.
            </p>
          </header>

          {/* Mensajes de estado */}
          {mensaje && (
            <div
              className={`auth-animar-item ${
                mensaje.tipo === "exito"
                  ? "auth-mensaje-exito"
                  : "auth-mensaje-error"
              }`}
              role="alert"
            >
              {mensaje.texto}
            </div>
          )}

          {/* Formulario con los 5 campos obligatorios requeridos */}
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Fila doble: 1. Nombre * y 2. Apellido * */}
            <div className="auth-form-fila-doble auth-animar-item auth-delay-3">
              {/* 1. Nombre * */}
              <div className="auth-campo">
                <label htmlFor="registro-nombre" className="auth-label">
                  Nombre <span className="auth-asterisco">*</span>
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icono" aria-hidden="true">
                    <User size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="registro-nombre"
                    name="nombre"
                    type="text"
                    className="auth-input"
                    placeholder="Ej. Sofía"
                    autoComplete="given-name"
                    required
                    value={formData.nombre}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* 2. Apellido * */}
              <div className="auth-campo">
                <label htmlFor="registro-apellido" className="auth-label">
                  Apellido <span className="auth-asterisco">*</span>
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icono" aria-hidden="true">
                    <User size={18} strokeWidth={2} />
                  </span>
                  <input
                    id="registro-apellido"
                    name="apellido"
                    type="text"
                    className="auth-input"
                    placeholder="Ej. Morales"
                    autoComplete="family-name"
                    required
                    value={formData.apellido}
                    onChange={handleChange}
                  />
                </div>
              </div>
            </div>

            {/* 3. Correo electrónico * */}
            <div className="auth-campo auth-animar-item auth-delay-4">
              <label htmlFor="registro-email" className="auth-label">
                Correo electrónico <span className="auth-asterisco">*</span>
              </label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icono" aria-hidden="true">
                  <Mail size={18} strokeWidth={2} />
                </span>
                <input
                  id="registro-email"
                  name="email"
                  type="email"
                  className="auth-input"
                  placeholder="sofia.morales@ejemplo.com"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* 4. Teléfono * */}
            <div className="auth-campo auth-animar-item auth-delay-5">
              <label htmlFor="registro-telefono" className="auth-label">
                Teléfono <span className="auth-asterisco">*</span>
              </label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icono" aria-hidden="true">
                  <Phone size={18} strokeWidth={2} />
                </span>
                <input
                  id="registro-telefono"
                  name="telefono"
                  type="tel"
                  className="auth-input"
                  placeholder="+57 300 123 4567"
                  autoComplete="tel"
                  required
                  value={formData.telefono}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* 5. Contraseña * */}
            <div className="auth-campo auth-animar-item auth-delay-6">
              <label htmlFor="registro-password" className="auth-label">
                Contraseña <span className="auth-asterisco">*</span>
              </label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icono" aria-hidden="true">
                  <Lock size={18} strokeWidth={2} />
                </span>
                <input
                  id="registro-password"
                  name="password"
                  type={mostrarPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="Mínimo 6 caracteres"
                  autoComplete="new-password"
                  required
                  value={formData.password}
                  onChange={handleChange}
                />
                <button
                  type="button"
                  className="auth-input-toggle-password"
                  onClick={() => setMostrarPassword(!mostrarPassword)}
                  aria-label={mostrarPassword ? "Ocultar contraseña" : "Ver contraseña"}
                >
                  {mostrarPassword ? (
                    <EyeOff size={18} strokeWidth={2} />
                  ) : (
                    <Eye size={18} strokeWidth={2} />
                  )}
                </button>
              </div>
            </div>

            {/* Botón Principal Sólido en Color Granate para 'Crear cuenta' con transición >= 0.3s */}
            <div className="auth-animar-item auth-delay-7">
              <button
                type="submit"
                className="auth-boton-primario"
                disabled={cargando}
              >
                {cargando ? (
                  "Creando cuenta..."
                ) : (
                  <>
                    <span>Crear cuenta</span>
                    <Sparkles size={18} strokeWidth={2} />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Pie: Enlace a Login */}
          <footer className="auth-footer-enlace auth-animar-item auth-delay-8">
            ¿Ya tienes una cuenta?
            <Link to="/login" className="auth-footer-link">
              Inicia sesión
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
};

export default Registro;
