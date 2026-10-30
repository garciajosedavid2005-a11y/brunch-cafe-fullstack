import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import AuthBanner from "../Auth/AuthBanner";
import { useAuth } from "../../context/useAuth";
import "../Auth/Auth.css";

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    email: "",
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

    // Validación básica
    if (!formData.email.trim() || !formData.password.trim()) {
      setCargando(false);
      setMensaje({
        tipo: "error",
        texto: "Por favor, ingresa tu correo electrónico y contraseña.",
      });
      return;
    }

    try {
      await login(formData);
      setCargando(false);
      setMensaje({
        tipo: "exito",
        texto: "¡Bienvenido de nuevo a Brunch Café!",
      });
      navigate(location.state?.from || "/cuenta", { replace: true });
    } catch (error) {
      setCargando(false);
      setMensaje({ tipo: "error", texto: error.message });
    }
  };

  return (
    <main className="auth-pagina">
      <div className="auth-card-container">
        {/* Columna Izquierda: Banner de Marca & Experiencia (Split-Screen) */}
        <AuthBanner modo="login" />

        {/* Columna Derecha: Formulario Minimalista */}
        <div className="auth-formulario-contenedor">
          {/* Pestañas de navegación */}
          <nav className="auth-tabs auth-animar-item auth-delay-1" aria-label="Navegación de autenticación">
            <Link to="/login" className="auth-tab auth-tab--activo">
              Iniciar Sesión
            </Link>
            <Link to="/registro" className="auth-tab">
              Registrarse
            </Link>
          </nav>

          {/* Encabezado del Formulario */}
          <header className="auth-header auth-animar-item auth-delay-2">
            <span className="auth-header__subtitulo-acento">Nos alegra verte</span>
            <h1 className="auth-header__titulo">Iniciar Sesión</h1>
            <p className="auth-header__descripcion">
              Ingresa tus credenciales para ordenar, reservar y disfrutar de tus beneficios.
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

          {/* Formulario Tradicional */}
          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {/* Campo: Correo electrónico con icono perfectamente centrado */}
            <div className="auth-campo auth-animar-item auth-delay-3">
              <label htmlFor="login-email" className="auth-label">
                Correo electrónico
              </label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icono" aria-hidden="true">
                  <Mail size={18} strokeWidth={2} />
                </span>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  className="auth-input"
                  placeholder="tu.correo@ejemplo.com"
                  autoComplete="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                />
              </div>
            </div>

            {/* Campo: Contraseña con icono centrado y toggle */}
            <div className="auth-campo auth-animar-item auth-delay-4">
              <label htmlFor="login-password" className="auth-label">
                Contraseña
              </label>
              <div className="auth-input-wrapper">
                <span className="auth-input-icono" aria-hidden="true">
                  <Lock size={18} strokeWidth={2} />
                </span>
                <input
                  id="login-password"
                  name="password"
                  type={mostrarPassword ? "text" : "password"}
                  className="auth-input"
                  placeholder="Ingresa tu contraseña"
                  autoComplete="current-password"
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

            {/* Enlace sutil: ¿Olvidaste tu contraseña? */}
            <div className="auth-utilidades auth-animar-item auth-delay-5">
              <a
                href="#recuperar-contrasena"
                className="auth-link-olvido"
                onClick={(e) => {
                  e.preventDefault();
                  alert("Te enviaremos un correo con las instrucciones para restablecer tu contraseña.");
                }}
              >
                ¿Olvidaste tu contraseña?
              </a>
            </div>

            {/* Botón Principal Sólido en Color Granate con transición >= 0.3s */}
            <div className="auth-animar-item auth-delay-6">
              <button
                type="submit"
                className="auth-boton-primario"
                disabled={cargando}
              >
                {cargando ? (
                  "Verificando..."
                ) : (
                  <>
                    <span>Iniciar sesión</span>
                    <ArrowRight size={18} strokeWidth={2} />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Pie: Enlace a Registro */}
          <footer className="auth-footer-enlace auth-animar-item auth-delay-7">
            ¿Aún no tienes una cuenta?
            <Link to="/registro" className="auth-footer-link">
              Regístrate aquí
            </Link>
          </footer>
        </div>
      </div>
    </main>
  );
};

export default Login;
