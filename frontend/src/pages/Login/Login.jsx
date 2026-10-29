import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, ArrowRight } from "lucide-react";
import AuthBanner from "../Auth/AuthBanner";
import "../Auth/Auth.css";
import { useAuth } from "../../context/AuthContext";   

const Login = () => {
  const navigate = useNavigate();
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

    try {
      const res = await fetch('http://localhost:4000/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ correo: formData.email, contraseña: formData.password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMensaje({
          tipo: "error",
          texto: data.message || 'Error al iniciar sesion',
        });
        setCargando(false);
        return;
      }
      login(data);  
      navigate('/perfil');
    } catch (err) {
      setMensaje({
        tipo: "error",
        texto: 'No se pudo conectar con el servidor',
      });
      setCargando(false);
    }
  };

  return (
    <main className="auth-pagina">
      <div className="auth-card-container">
        <AuthBanner modo="login" />

        <div className="auth-formulario-contenedor">
          <nav className="auth-tabs auth-animar-item auth-delay-1" aria-label="Navegación de autenticación">
            <Link to="/login" className="auth-tab auth-tab--activo">
              Iniciar Sesión
            </Link>
            <Link to="/registro" className="auth-tab">
              Registrarse
            </Link>
          </nav>

          <header className="auth-header auth-animar-item auth-delay-2">
            <span className="auth-header__subtitulo-acento">Nos alegra verte</span>
            <h1 className="auth-header__titulo">Iniciar Sesión</h1>
            <p className="auth-header__descripcion">
              Ingresa tus credenciales para ordenar, reservar y disfrutar de tus beneficios.
            </p>
          </header>

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

          <form className="auth-form" onSubmit={handleSubmit}>
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
