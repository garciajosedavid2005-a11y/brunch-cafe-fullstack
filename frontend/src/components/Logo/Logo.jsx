import { SIMBOLO_VIEWBOX, SIMBOLO_TRAZADO } from "./simbolo";
import "./Logo.css";

// 2.0c · Logo de Brunch Café: el símbolo en SVG y el nombre como texto HTML real (Fraunces 700), con
// «Neiva · Colombia» debajo. Un solo color (currentColor): `tono` «bordo» sobre fondos claros (el
// --color-primario) y «crema» sobre fotos o fondos oscuros (el --color-marfil).
// Para la tecnología de asistencia es una imagen llamada «Brunch Café».

/** Solo el símbolo; decorativo salvo que se le dé un `titulo`. */
export function SimboloBrunch({ className = "", titulo }) {
  return (
    <svg
      className={className}
      viewBox={SIMBOLO_VIEWBOX}
      fill="currentColor"
      focusable="false"
      {...(titulo ? { role: "img", "aria-label": titulo } : { "aria-hidden": true })}
    >
      <path d={SIMBOLO_TRAZADO} />
    </svg>
  );
}

/**
 * @param {"completo"|"simbolo"} variante  completo = símbolo + nombre (+ lugar)
 * @param {"bordo"|"crema"} tono
 * @param {boolean} lugar  muestra «Neiva · Colombia» bajo el nombre
 */
export default function Logo({ variante = "completo", tono = "bordo", lugar = true, className = "" }) {
  return (
    <span className={`logo logo--${tono} logo--${variante} ${className}`.trim()} role="img" aria-label="Brunch Café">
      <SimboloBrunch className="logo__simbolo" />
      {variante === "completo" && (
        <span className="logo__texto">
          <span className="logo__nombre">Brunch Café</span>
          {lugar && <span className="logo__lugar">Neiva · Colombia</span>}
        </span>
      )}
    </span>
  );
}
