import { RefreshCw } from "lucide-react";
import { useSegundosDesde } from "./useSondeo";

// «Actualizado hace N s» y el botón «Actualizar» de las vistas por polling (plano, cuentas abiertas)
export default function Actualizado({ desde, error, onActualizar }) {
  const segundos = useSegundosDesde(desde);
  return (
    <div className="plano__actualizado">
      <span aria-live="polite">
        {error
          ? `No se pudo actualizar${segundos === null ? "" : ` (último dato hace ${segundos} s)`}. Se reintenta solo.`
          : segundos === null ? "Cargando…" : `Actualizado hace ${segundos} s`}
      </span>
      <button type="button" className="plano__boton plano__boton--secundario" onClick={onActualizar}>
        <RefreshCw size={18} aria-hidden="true" />
        Actualizar
      </button>
    </div>
  );
}
