import { useId, useState } from "react";
import { Bike, MapPin } from "lucide-react";
import { apiRequest } from "../../../services/api";

// Hasta «listo» se puede asignar o cambiar el repartidor; en camino ya salió (el backend responde 409)
const ASIGNABLES = ["pendiente", "confirmado", "en_preparacion", "listo"];

/**
 * 6.2 (F6-2) · Entrega de un domicilio: dirección, hora y teléfono (para quien lo lleva) y el repartidor asignado.
 * Con pedido:asignar_repartidor (admin, cajero) se elige o se cambia en un selector; los demás solo lo leen.
 */
export default function EntregaPedido({ pedido, repartidores, puedeAsignar, onActualizado }) {
  const idSelector = useId();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const editable = puedeAsignar && ASIGNABLES.includes(pedido.estadoCodigo);
  const lugar = [pedido.direccion, pedido.barrio].filter(Boolean).join(", ");

  const asignar = async (repartidorId) => {
    setGuardando(true);
    setError("");
    try {
      const actualizado = await apiRequest(`/v1/staff/pedidos/${pedido.id}/repartidor`, {
        method: "PATCH",
        body: JSON.stringify({ repartidorId: repartidorId || null }),
      });
      onActualizado(actualizado);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="staff-dashboard__entrega">
      {lugar && (
        <p className="staff-dashboard__entrega-lugar">
          <MapPin size={16} aria-hidden="true" />
          <span>
            {lugar}
            {pedido.hora ? ` · ${pedido.hora}` : ""}
            {pedido.telefono ? ` · Tel. ${pedido.telefono}` : ""}
          </span>
        </p>
      )}
      {editable ? (
        <label className="staff-dashboard__entrega-repartidor" htmlFor={idSelector}>
          <Bike size={16} aria-hidden="true" />
          <span>Repartidor</span>
          <select id={idSelector} className="staff-dashboard__select" value={pedido.repartidor?.id || ""} disabled={guardando}
            onChange={(e) => asignar(e.target.value)}>
            <option value="">Sin asignar</option>
            {/* El asignado va aunque ya no esté en la lista (p. ej. desactivado) */}
            {pedido.repartidor && !repartidores.some((r) => r.id === pedido.repartidor.id) && (
              <option value={pedido.repartidor.id}>{pedido.repartidor.nombre || "Repartidor"}</option>
            )}
            {repartidores.map((r) => <option key={r.id} value={r.id}>{r.nombre}</option>)}
          </select>
        </label>
      ) : (
        <p className="staff-dashboard__entrega-repartidor">
          <Bike size={16} aria-hidden="true" />
          <span>Repartidor: <strong>{pedido.repartidor?.nombre || "sin asignar"}</strong></span>
        </p>
      )}
      {error && <p className="dashboard-notice is-error" role="alert">{error}</p>}
    </div>
  );
}
