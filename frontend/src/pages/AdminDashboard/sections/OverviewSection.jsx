import { ShoppingBag, CalendarDays, Star, ArrowRight } from "lucide-react";
import { metricasResumen, pedidosIniciales, reservasIniciales, comentariosRecientes } from "../mockData";

export default function OverviewSection({ onNavigateTab }) {
  // Tomamos los 3 pedidos más recientes
  const pedidosRecientes = pedidosIniciales.slice(0, 3);
  // Tomamos las reservas pendientes prioritarias
  const reservasPendientes = reservasIniciales.filter((r) => r.estado === "Pendiente");

  const getBadgeClass = (estado) => {
    switch (estado) {
      case "Pendiente":
        return "admin-badge--warning";
      case "En preparación":
        return "admin-badge--info";
      case "Listo":
      case "Confirmada":
      case "Entregado":
        return "admin-badge--success";
      case "Cancelado":
      case "Cancelada":
        return "admin-badge--danger";
      default:
        return "admin-badge--neutral";
    }
  };

  return (
    <div className="admin-overview">
      {/* 1. TARJETAS DE MÉTRICAS RÁPIDAS (KPIs) - AHORA TOTALMENTE INTERACTIVAS */}
      <div className="admin-overview__kpis">
        {/* KPI 1: Pedidos */}
        <button
          type="button"
          className="admin-kpi-card"
          onClick={() => onNavigateTab("orders")}
          title="Ver todos los pedidos"
        >
          <div className="admin-kpi-card__icon admin-kpi-card__icon--primary">
            <ShoppingBag size={26} />
          </div>
          <div className="admin-kpi-card__info">
            <span className="admin-kpi-card__label">Pedidos del Día</span>
            <h3 className="admin-kpi-card__value">{metricasResumen.pedidosHoy.total} pedidos</h3>
            <span className="admin-kpi-card__sub">{metricasResumen.pedidosHoy.ingresos} hoy</span>
          </div>
        </button>

        {/* KPI 2: Reservas */}
        <button
          type="button"
          className="admin-kpi-card"
          onClick={() => onNavigateTab("reservations")}
          title="Gestionar reservas"
        >
          <div className="admin-kpi-card__icon admin-kpi-card__icon--warning">
            <CalendarDays size={26} />
          </div>
          <div className="admin-kpi-card__info">
            <span className="admin-kpi-card__label">Reservas Pendientes</span>
            <h3 className="admin-kpi-card__value">{metricasResumen.reservasPendientes.total} por revisar</h3>
            <span className="admin-kpi-card__sub admin-kpi-card__sub--alert">
              {metricasResumen.reservasPendientes.urgentes} urgentes hoy
            </span>
          </div>
        </button>

        {/* KPI 3: Comentarios */}
        <button
          type="button"
          className="admin-kpi-card"
          onClick={() => onNavigateTab("reviews")}
          title="Ver opiniones y comentarios"
        >
          <div className="admin-kpi-card__icon admin-kpi-card__icon--gold">
            <Star size={26} />
          </div>
          <div className="admin-kpi-card__info">
            <span className="admin-kpi-card__label">Satisfacción Clientes</span>
            <h3 className="admin-kpi-card__value">{metricasResumen.comentarios.calificacionPromedio} ★</h3>
            <span className="admin-kpi-card__sub">{metricasResumen.comentarios.total} opiniones</span>
          </div>
        </button>
      </div>

      {/* 2. TABLAS RÁPIDAS DE ACTIVIDAD */}
      <div className="admin-overview__grid">
        {/* Pedidos recientes */}
        <div className="admin-card">
          <div className="admin-card__header">
            <div>
              <h3 className="admin-card__title">Últimos Pedidos del Día</h3>
              <p className="admin-card__subtitle">Actividad más reciente de domicilios</p>
            </div>
            <button
              type="button"
              className="admin-button--link"
              onClick={() => onNavigateTab("orders")}
            >
              <span>Ver todos</span>
              <ArrowRight size={15} />
            </button>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cliente</th>
                  <th>Total</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pedidosRecientes.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>
                      <span className="admin-table__code">{pedido.id}</span>
                    </td>
                    <td>
                      <div className="admin-table__client">
                        <strong>{pedido.cliente}</strong>
                        <span>{pedido.barrio}</span>
                      </div>
                    </td>
                    <td>
                      <span className="admin-table__amount">{pedido.total}</span>
                    </td>
                    <td>
                      <span className={`admin-badge ${getBadgeClass(pedido.estado)}`}>
                        {pedido.estado}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Reservas pendientes urgentes */}
        <div className="admin-card">
          <div className="admin-card__header">
            <div>
              <h3 className="admin-card__title">Reservas por Confirmar</h3>
              <p className="admin-card__subtitle">Solicitudes pendientes de aprobación</p>
            </div>
            <button
              type="button"
              className="admin-button--link"
              onClick={() => onNavigateTab("reservations")}
            >
              <span>Ver todas</span>
              <ArrowRight size={15} />
            </button>
          </div>

          <div className="admin-table-container">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Fecha/Hora</th>
                  <th>Personas</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {reservasPendientes.length > 0 ? (
                  reservasPendientes.map((reserva) => (
                    <tr key={reserva.id}>
                      <td>
                        <div className="admin-table__client">
                          <strong>{reserva.cliente}</strong>
                          <span>{reserva.motivo}</span>
                        </div>
                      </td>
                      <td>
                        <div className="admin-table__schedule">
                          <strong>{reserva.fecha}</strong>
                          <span>{reserva.hora}</span>
                        </div>
                      </td>
                      <td>
                        <strong className="admin-table__text-dark">{reserva.personas} pers.</strong>
                      </td>
                      <td>
                        <span className={`admin-badge ${getBadgeClass(reserva.estado)}`}>
                          {reserva.estado}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="4" className="admin-table__empty">
                      No hay reservas pendientes en este momento.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 3. ÚLTIMOS COMENTARIOS DE CLIENTES */}
      <div className="admin-card">
        <div className="admin-card__header">
          <div>
            <h3 className="admin-card__title">Opiniones y Comentarios Recientes</h3>
            <p className="admin-card__subtitle">Lo que dicen los comensales sobre Brunch Café</p>
          </div>
          <button
            type="button"
            className="admin-button--link"
            onClick={() => onNavigateTab("reviews")}
          >
            <span>Ver módulo comentarios</span>
            <ArrowRight size={15} />
          </button>
        </div>

        <div className="admin-reviews-preview">
          {comentariosRecientes.map((c) => (
            <div key={c.id} className="admin-review-item">
              <div className="admin-review-item__header">
                <strong className="admin-table__text-dark">{c.autor}</strong>
                <div className="admin-review-item__stars">
                  {"★".repeat(c.calificacion)}
                  {"☆".repeat(5 - c.calificacion)}
                </div>
                <span className="admin-review-item__time">{c.fecha}</span>
              </div>
              <p className="admin-review-item__text">"{c.comentario}"</p>
              <span className="admin-review-item__tag">{c.tipo}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
