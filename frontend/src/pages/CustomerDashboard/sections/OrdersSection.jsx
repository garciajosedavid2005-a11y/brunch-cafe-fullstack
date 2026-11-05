import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api";
import SectionHeading from "../SectionHeading";
import { useDialogo } from "../../../context/useDialogo";
import { formatearCOP } from "../../../utils/moneda";
import { formatearFecha } from "../../../utils/fechas";

const orderStatus = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "En preparación",
  ready: "Listo",
  on_the_way: "En camino",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const money = (value) => formatearCOP(Number(value) || 0);

const dateLabel = (value) =>
  formatearFecha(value, "long");

export default function OrdersSection() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancelando, setCancelando] = useState("");
  const { confirmar } = useDialogo();

  useEffect(() => {
    apiRequest("/customer/orders")
      .then(({ orders: customerOrders }) => setOrders(customerOrders))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

  // Solo se puede cancelar mientras el pedido sigue pendiente
  const cancelOrder = async (id) => {
    const { confirmado } = await confirmar({
      titulo: "Cancelar pedido",
      mensaje: "¿Estás seguro de que deseas cancelar este pedido?",
      confirmarTexto: "Sí, cancelar pedido",
      cancelarTexto: "Volver",
      peligroso: true,
    });
    if (!confirmado) return;
    setCancelando(id);
    setError("");
    try {
      const { order } = await apiRequest(`/customer/orders/${id}/cancel`, { method: "PATCH", body: JSON.stringify({}) });
      setOrders((current) => current.map((item) => (item._id === id ? order : item)));
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setCancelando("");
    }
  };

  return (
    <div>
      <SectionHeading eyebrow="TU HISTORIAL" title="Mis pedidos">
        Consulta el estado y el detalle de tus pedidos.
      </SectionHeading>
      {loading && <p className="dashboard-empty">Cargando tus pedidos...</p>}
      {error && <p className="dashboard-notice is-error" role="alert">{error}</p>}
      {!loading && !error && orders.length === 0 && (
        <p className="dashboard-empty">Todavía no tienes pedidos asociados a tu cuenta.</p>
      )}
      <div className="dashboard-list">
        {orders.map((order) => (
          <article className="dashboard-card" key={order._id}>
            <div className="dashboard-card__topline">
              <div>
                <span className="dashboard-card__eyebrow">PEDIDO {order.orderNumber}</span>
                <h3>{dateLabel(order.createdAt)}</h3>
              </div>
              <span className={`dashboard-status status-${order.status}`}>
                {order.statusLabel || orderStatus[order.status] || order.status}
              </span>
            </div>
            <div className="dashboard-order-items">
              {(order.items || []).map((item, index) => (
                <div key={`${item.name}-${index}`}>
                  <span>{item.quantity} × {item.name}</span>
                  <span>{money(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
            </div>
            {order.delivery && (
              <div className="dashboard-order-delivery">
                <h4>Datos de entrega</h4>
                <p>{order.delivery.nombre} · {order.delivery.direccion}, {order.delivery.barrio}</p>
                <p>Hora solicitada: {order.delivery.hora}</p>
                {order.delivery.indicaciones && <p>Indicaciones: {order.delivery.indicaciones}</p>}
                {order.paymentMethod && <p>Método de pago: {order.paymentMethod}</p>}
              </div>
            )}
            <div className="dashboard-card__total"><span>Total</span><strong>{money(order.total)}</strong></div>
            {order.status === "pending" && (
              <div className="dashboard-reservation__actions">
                <button
                  className="dashboard-button dashboard-button--secondary"
                  type="button"
                  disabled={cancelando === order._id}
                  onClick={() => cancelOrder(order._id)}
                >
                  Cancelar pedido
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
