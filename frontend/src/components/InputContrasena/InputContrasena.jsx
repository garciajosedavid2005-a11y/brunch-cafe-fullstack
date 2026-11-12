import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import "./InputContrasena.css";

// Revisión de 1.6 · Campo de contraseña con su botón para mostrarla u ocultarla. Es el único que usa
// la app (enlace «Crea tu contraseña», login, registro, Seguridad y perfil del admin). Recibe los mismos
// atributos que un <input> (id, value, onChange, autoComplete, minLength…); cada campo se muestra por separado.
export default function InputContrasena({ className = "", ...props }) {
  const [visible, setVisible] = useState(false);
  return (
    <span className="input-contrasena">
      <input {...props} type={visible ? "text" : "password"} className={`${className} input-contrasena__campo`.trim()} />
      <button
        type="button"
        className="input-contrasena__boton"
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? <EyeOff size={20} strokeWidth={2} aria-hidden="true" /> : <Eye size={20} strokeWidth={2} aria-hidden="true" />}
      </button>
    </span>
  );
}
