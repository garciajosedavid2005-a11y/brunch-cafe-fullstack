import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Lock, Mail } from "lucide-react";
import AuthBanner from "../Auth/AuthBanner";
import InputContrasena from "../../components/InputContrasena/InputContrasena";
import { apiRequest } from "../../services/api";
import "../Auth/Auth.css";

export default function RecuperarContrasena() {
  const [searchParams, setSearchParams] = useSearchParams();
  // El token se guarda en memoria y se quita de la dirección (historial, capturas, Referer): 0.15c
  const [token] = useState(() => searchParams.get("token") || "");
  // 1.5b · Cuenta creada por el admin: el mismo enlace de un solo uso sirve para crear la contraseña
  const [crear] = useState(() => Boolean(searchParams.get("token")) && searchParams.get("tipo") === "crear");

  useEffect(() => {
    if (searchParams.has("token")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [correo, setCorreo] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmacion, setConfirmacion] = useState("");
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState(null);
  const [completado, setCompletado] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMensaje(null);

    if (token && nueva !== confirmacion) {
      setMensaje({ error: true, texto: "Las contraseñas no coinciden." });
      return;
    }

    setCargando(true);
    try {
      const resultado = token
        ? await apiRequest("/v1/auth/restablecer-contrasena", {
            method: "POST",
            body: JSON.stringify({ token, nueva }),
          })
        : await apiRequest("/v1/auth/recuperar-contrasena", {
            method: "POST",
            body: JSON.stringify({ correo }),
          });
      setMensaje({ error: false, texto: crear ? "Contraseña creada. Ya puedes iniciar sesión." : resultado.message });
      setCompletado(true);
    } catch (error) {
      setMensaje({ error: true, texto: error.message });
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="auth-pagina">
      <div className="auth-card-container">
        <AuthBanner modo="login" />
        <div className="auth-formulario-contenedor">
          <nav className="auth-tabs" aria-label="Navegación de autenticación">
            <Link to="/login" className="auth-tab">Iniciar sesión</Link>
            <Link to="/registro" className="auth-tab">Registrarse</Link>
          </nav>

          <header className="auth-header">
            <span className="auth-header__subtitulo-acento">Seguridad de tu cuenta</span>
            <h1 className="auth-header__titulo">
              {crear ? "Crea tu contraseña" : token ? "Restablece tu contraseña" : "Recuperar contraseña"}
            </h1>
            <p className="auth-header__descripcion">
              {crear
                ? "Tu cuenta de Brunch Café está lista: elige la contraseña con la que vas a entrar."
                : token
                ? "Elige una contraseña nueva para volver a entrar a tu cuenta."
                : "Te enviaremos un enlace de un solo uso a tu correo."}
            </p>
          </header>

          {mensaje && (
            <div className={mensaje.error ? "auth-mensaje-error" : "auth-mensaje-exito"} role={mensaje.error ? "alert" : "status"}>
              {mensaje.texto}
            </div>
          )}

          {!completado && (
            <form className="auth-form" onSubmit={handleSubmit}>
              {!token ? (
                <div className="auth-campo">
                  <label htmlFor="recuperacion-correo" className="auth-label">Correo electrónico</label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icono" aria-hidden="true"><Mail size={18} /></span>
                    <input
                      id="recuperacion-correo"
                      className="auth-input"
                      type="email"
                      autoComplete="email"
                      value={correo}
                      onChange={(event) => setCorreo(event.target.value)}
                      required
                    />
                  </div>
                </div>
              ) : (
                <>
                  <div className="auth-campo">
                    <label htmlFor="recuperacion-nueva" className="auth-label">Nueva contraseña</label>
                    <div className="auth-input-wrapper">
                      <span className="auth-input-icono" aria-hidden="true"><Lock size={18} /></span>
                      <InputContrasena
                        id="recuperacion-nueva"
                        className="auth-input"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        value={nueva}
                        onChange={(event) => setNueva(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="auth-campo">
                    <label htmlFor="recuperacion-confirmacion" className="auth-label">Confirma la nueva contraseña</label>
                    <div className="auth-input-wrapper">
                      <span className="auth-input-icono" aria-hidden="true"><Lock size={18} /></span>
                      <InputContrasena
                        id="recuperacion-confirmacion"
                        className="auth-input"
                        autoComplete="new-password"
                        minLength={6}
                        maxLength={128}
                        value={confirmacion}
                        onChange={(event) => setConfirmacion(event.target.value)}
                        required
                      />
                    </div>
                  </div>
                </>
              )}
              <div>
                <button type="submit" className="auth-boton-primario" disabled={cargando}>
                  {cargando ? "Procesando..." : (
                    <>
                      <span>{crear ? "Crear contraseña" : token ? "Restablecer contraseña" : "Enviar enlace"}</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          <footer className="auth-footer-enlace">
            <Link to="/login" className="auth-footer-link">Volver a iniciar sesión</Link>
          </footer>
        </div>
      </div>
    </main>
  );
}
