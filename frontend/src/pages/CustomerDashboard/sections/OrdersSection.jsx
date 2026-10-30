import { useEffect, useState } from "react";
import { apiRequest } from "../../../services/api";
import SectionHeading from "../SectionHeading";

const orderStatus = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  preparing: "En preparación",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

const money = (value) =>
  new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(value || 0);

const dateLabel = (value) =>
  new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(new Date(value));

export default function OrdersSection() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    apiRequest("/customer/orders")
      .then(({ orders: customerOrders }) => setOrders(customerOrders))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, []);

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
              <span className={`dashboard-status status-${order.status}`}>{orderStatus[order.status] || order.status}</span>
            </div>
            <div className="dashboard-order-items">
              {(order.items || []).map((item, index) => (
                <div key={`${item.name}-${index}`}>
                  <span>{item.quantity} × {item.name}</span>
                  <span>{money(item.quantity * item.unitPrice)}</span>
                </div>
              ))}
            </div>
            <div className="dashboard-card__total"><span>Total</span><strong>{money(order.total)}</strong></div>
          </article>
        ))}
      </div>
    </div>
  );
}
