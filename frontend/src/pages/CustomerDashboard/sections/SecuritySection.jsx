import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SectionHeading from "../SectionHeading";
import InputContrasena from "../../../components/InputContrasena/InputContrasena";
import { useAuth } from "../../../context/useAuth";
import useDatosCuenta, { etiquetaRolCuenta, fechaRegistro } from "../../../hooks/useDatosCuenta";
import useCambioContrasena from "../../../hooks/useCambioContrasena";

// Campo de contraseña con su error visible y enlazado (aria-describedby)
function CampoContrasena({ id, etiqueta, valor, onChange, error, autoComplete }) {
  return (
    <div className="dashboard-field">
      {/* La etiqueta no envuelve el campo: dentro va el botón de mostrar, que no es parte de su nombre */}
      <label htmlFor={id}>{etiqueta}</label>
      <InputContrasena
        id={id}
        value={valor}
        onChange={onChange}
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      {error && <small id={`${id}-error`} className="dashboard-field-error">{error}</small>}
    </div>
  );
}

// Seguridad y configuración: datos de la cuenta, cambio de contraseña y cierre de sesión.
// Solo lo que el backend ya soporta (GET /v1/cliente/perfil y PUT /v1/cliente/perfil/contrasena).
export default function SecuritySection() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const { cuenta, cargando, error } = useDatosCuenta();
  const { datos, errores, mensaje, errorServidor, guardando, cambiar, enviar } = useCambioContrasena();
  const [errorSalida, setErrorSalida] = useState("");

  const cerrarSesion = async () => {
    setErrorSalida("");
    try {
      await logout();
      navigate("/login");
    } catch (e) {
      setErrorSalida(e.message);
    }
  };

  return (
    <div>
      <SectionHeading eyebrow="TU CUENTA" title="Seguridad y configuración">
        Revisa los datos de tu cuenta y cambia tu contraseña.
      </SectionHeading>

      <article className="dashboard-card dashboard-account">
        <h3>Datos de la cuenta</h3>
        {cargando && <p className="dashboard-empty">Cargando tu cuenta...</p>}
        {error && <p className="dashboard-notice is-error" role="alert">{error.message}</p>}
        {cuenta && (
          <dl className="dashboard-account__datos">
            <div><dt>Nombre</dt><dd>{`${cuenta.nombre} ${cuenta.apellido}`.trim()}</dd></div>
            <div><dt>Correo</dt><dd>{cuenta.correo}</dd></div>
            <div><dt>Teléfono</dt><dd>{cuenta.telefono || "Sin registrar"}</dd></div>
            <div><dt>Rol</dt><dd>{etiquetaRolCuenta(cuenta.rol)}</dd></div>
            <div><dt>Miembro desde</dt><dd>{fechaRegistro(cuenta.createdAt)}</dd></div>
          </dl>
        )}
      </article>

      <article className="dashboard-card dashboard-account">
        <h3>Cambiar contraseña</h3>
        {mensaje && <p className="dashboard-notice" role="status">{mensaje}</p>}
        {errorServidor && <p className="dashboard-notice is-error" role="alert">{errorServidor}</p>}
        <form className="dashboard-form" onSubmit={enviar} noValidate>
          <CampoContrasena id="pass-actual" etiqueta="Contraseña actual" valor={datos.actual} onChange={cambiar("actual")} error={errores.actual} autoComplete="current-password" />
          <CampoContrasena id="pass-nueva" etiqueta="Nueva contraseña" valor={datos.nueva} onChange={cambiar("nueva")} error={errores.nueva} autoComplete="new-password" />
          <CampoContrasena id="pass-confirmar" etiqueta="Confirmar nueva contraseña" valor={datos.confirmar} onChange={cambiar("confirmar")} error={errores.confirmar} autoComplete="new-password" />
          <p className="dashboard-account__ayuda">Mínimo 6 caracteres.</p>
          <button className="dashboard-button" type="submit" disabled={guardando}>
            {guardando ? "Guardando..." : "Cambiar contraseña"}
          </button>
        </form>
      </article>

      <article className="dashboard-card dashboard-account">
        <h3>Sesión</h3>
        <p className="dashboard-account__ayuda">Cierra tu sesión en este dispositivo.</p>
        {errorSalida && <p className="dashboard-notice is-error" role="alert">{errorSalida}</p>}
        <button className="dashboard-button dashboard-button--secondary" type="button" onClick={cerrarSesion}>
          Cerrar sesión
        </button>
      </article>
    </div>
  );
}
