import { useDialogo } from "../../context/useDialogo";
import "./BotonGoogle.css";

// 1.5b · «Continuar con Google» SIN integración real (trabajo universitario): no inicia sesión ni
// simula nada; abre el diálogo de la app con el aviso. La integración (OAuth de Google en el
// backend) está descrita en docs/PROGRESO.md › Pendientes.
// Diseño según las guías de marca de Google Identity: logo «G» oficial a cuatro colores sin
// modificar, tema claro (fondo #FFFFFF, borde #747775, texto #1F1F1F), Roboto Medium y el texto
// permitido «Continuar con Google». Alto ≥ 44 px (objetivo táctil del proyecto).
export const AVISO_GOOGLE = "El inicio de sesión con Google estará disponible próximamente. Por ahora usa tu correo y contraseña.";

function LogoGoogle() {
  return (
    <svg className="boton-google__logo" viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function BotonGoogle() {
  const { avisar } = useDialogo();
  const avisarProximamente = () => avisar({ titulo: "Continuar con Google", mensaje: AVISO_GOOGLE });

  return (
    <button type="button" className="boton-google" onClick={avisarProximamente}>
      <LogoGoogle />
      <span className="boton-google__texto">Continuar con Google</span>
    </button>
  );
}

/** Separador «o» entre el botón de Google y el formulario de correo. */
export function SeparadorO() {
  return (
    <div className="boton-google__separador" aria-hidden="true">
      <span>o</span>
    </div>
  );
}
