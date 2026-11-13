import { RefreshCw } from "lucide-react";
import { useSegundosDesde } from "./useSondeo";

// 2.4 · Estado del tiempo real, en texto (no solo color)
const TEXTO_VIVO = { en_vivo: "En vivo", reconectando: "Reconectando…", conectando: "Conectando…" };

// «Actualizado hace N s» y el botón «Actualizar» de las vistas por polling (plano, cuentas abiertas).
// `enVivo` (2.4): «En vivo», «Reconectando…» o, si no hay canal, «Sin tiempo real» cuando se pidió
export default function Actualizado({ desde, error, onActualizar, enVivo }) {
  const segundos = useSegundosDesde(desde);
  return (
    <div className="plano__actualizado">
      {enVivo && (
        <span className={`plano__vivo plano__vivo--${enVivo}`} role="status">
          {TEXTO_VIVO[enVivo] || "Sin tiempo real"}
        </span>
      )}
      {/* El contador cambia cada segundo: fuera de regiones vivas. Se anuncia solo el error (sin segundos) */}
      {error ? (
        <span>
          <span role="alert">No se pudo actualizar. Se reintenta solo.</span>
          {segundos !== null && <span> (último dato hace {segundos} s)</span>}
        </span>
      ) : (
        <span>{segundos === null ? "Cargando…" : `Actualizado hace ${segundos} s`}</span>
      )}
      <button type="button" className="plano__boton plano__boton--secundario" onClick={onActualizar}>
        <RefreshCw size={18} aria-hidden="true" />
        Actualizar
      </button>
    </div>
  );
}
