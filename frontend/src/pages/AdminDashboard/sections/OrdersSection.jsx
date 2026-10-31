import { useState } from "react";
import { Search, Eye, X, Filter, ShoppingBag, MapPin, Phone, CreditCard, Clock } from "lucide-react";
import { pedidosIniciales } from "../mockData";

export default function OrdersSection() {
  const [pedidos, setPedidos] = useState(pedidosIniciales);
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);

  const estadosDisponibles = [
    "Todos",
    "Pendiente",
    "En preparación",
    "Listo",
    "Entregado",
    "Cancelado",
  ];

  // Cambio de estado interactivo (simulado visualmente)
  const handleCambiarEstado = (id, nuevoEstado) => {
    setPedidos((prev) =>
      prev.map((p) => (p.id === id ? { ...p, estado: nuevoEstado } : p))
    );
    if (pedidoSeleccionado && pedidoSeleccionado.id === id) {
      setPedidoSeleccionado((prev) => ({ ...prev, estado: nuevoEstado }));
    }
  };

  // Filtrado de pedidos
  const pedidosFiltrados = pedidos.filter((pedido) => {
    const coincideEstado =
      filtroEstado === "Todos" || pedido.estado === filtroEstado;
    const coincideBusqueda =
      pedido.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
      pedido.id.toLowerCase().includes(busqueda.toLowerCase()) ||
      pedido.barrio.toLowerCase().includes(busqueda.toLowerCase());
    return coincideEstado && coincideBusqueda;
  });

  const getBadgeClass = (estado) => {
    switch (estado) {
      case "Pendiente":
        return "admin-badge--warning";
      case "En preparación":
        return "admin-badge--info";
      case "Listo":
      case "Entregado":
        return "admin-badge--success";
      case "Cancelado":
        return "admin-badge--danger";
      default:
        return "admin-badge--neutral";
    }
  };

  return (
    <div className="admin-section">
      {/* CABECERA DE LA SECCIÓN */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Gestión de Pedidos</h2>
          <p className="admin-section__subtitle">
            Visualiza los pedidos de domicilios, consulta el detalle de productos y actualiza sus estados en tiempo real.
          </p>
        </div>
      </div>

      {/* BARRA DE FILTROS Y BÚSQUEDA */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder="Buscar por cliente, código o barrio..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="admin-filter-tabs">
          {estadosDisponibles.map((estado) => (
            <button
              key={estado}
              type="button"
              className={`admin-filter-tab ${filtroEstado === estado ? "is-active" : ""}`}
              onClick={() => setFiltroEstado(estado)}
            >
              {estado}
            </button>
          ))}
        </div>
      </div>

      {/* TABLA DE PEDIDOS */}
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Entrega / Dirección</th>
                <th>Total</th>
                <th>Método de Pago</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.length > 0 ? (
                pedidosFiltrados.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>
                      <span className="admin-table__code">{pedido.id}</span>
                      <small className="admin-table__date">{pedido.fecha}</small>
                    </td>
                    <td>
                      <div className="admin-table__client">
                        <strong>{pedido.cliente}</strong>
                        <span>{pedido.telefono}</span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table__address">
                        <span>{pedido.direccion}</span>
                        <small>{pedido.barrio} · {pedido.hora}</small>
                      </div>
                    </td>
                    <td>
                      <span className="admin-table__amount">{pedido.total}</span>
                    </td>
                    <td>
                      <span className="admin-table__payment">{pedido.metodoPago}</span>
                    </td>
                    <td>
                      {/* SELECTOR INTERACTIVO DE ESTADO */}
                      <select
                        className={`admin-select-status ${getBadgeClass(pedido.estado)}`}
                        value={pedido.estado}
                        onChange={(e) => handleCambiarEstado(pedido.id, e.target.value)}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="En preparación">En preparación</option>
                        <option value="Listo">Listo</option>
                        <option value="Entregado">Entregado</option>
                        <option value="Cancelado">Cancelado</option>
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="admin-button--secondary-sm"
                        onClick={() => setPedidoSeleccionado(pedido)}
                      >
                        <Eye size={15} />
                        <span>Ver detalle</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="admin-table__empty">
                    No se encontraron pedidos con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE DETALLE DEL PEDIDO */}
      {pedidoSeleccionado && (
        <div className="admin-modal-overlay" onClick={() => setPedidoSeleccionado(null)}>
          <div
            className="admin-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-header">
              <div>
                <span className="admin-badge admin-badge--neutral">
                  Pedido {pedidoSeleccionado.id}
                </span>
                <h3 className="admin-modal-title">Detalle del Pedido</h3>
                <small className="admin-modal-date">{pedidoSeleccionado.fecha}</small>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setPedidoSeleccionado(null)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body">
              {/* Información del cliente y entrega */}
              <div className="admin-modal-grid">
                <div className="admin-modal-box">
                  <div className="admin-modal-box__title">
                    <Phone size={16} />
                    <strong>Datos del Cliente</strong>
                  </div>
                  <p><strong>Nombre:</strong> {pedidoSeleccionado.cliente}</p>
                  <p><strong>Teléfono:</strong> {pedidoSeleccionado.telefono}</p>
                </div>

                <div className="admin-modal-box">
                  <div className="admin-modal-box__title">
                    <MapPin size={16} />
                    <strong>Datos de Entrega</strong>
                  </div>
                  <p><strong>Dirección:</strong> {pedidoSeleccionado.direccion}</p>
                  <p><strong>Barrio:</strong> {pedidoSeleccionado.barrio}</p>
                  <p><strong>Hora estimada:</strong> {pedidoSeleccionado.hora}</p>
                  {pedidoSeleccionado.notas && (
                    <p className="admin-modal-box__note">
                      <strong>Indicaciones:</strong> {pedidoSeleccionado.notas}
                    </p>
                  )}
                </div>
              </div>

              {/* Lista de productos solicitados */}
              <div className="admin-modal-section">
                <h4>Productos solicitados</h4>
                <table className="admin-table admin-table--modal">
                  <thead>
                    <tr>
                      <th>Artículo</th>
                      <th>Cant.</th>
                      <th>Precio Unit.</th>
                      <th>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidoSeleccionado.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.nombre}</td>
                        <td>{item.cantidad}</td>
                        <td>{item.precio}</td>
                        <td><strong>{item.subtotal}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Resumen de pago y estado */}
              <div className="admin-modal-footer-info">
                <div className="admin-modal-payment">
                  <CreditCard size={18} />
                  <span>Método de pago: <strong>{pedidoSeleccionado.metodoPago}</strong></span>
                </div>
                <div className="admin-modal-total">
                  <span>Total a cobrar:</span>
                  <h3>{pedidoSeleccionado.total}</h3>
                </div>
              </div>

              {/* Selector de estado dentro del modal */}
              <div className="admin-modal-status-bar">
                <label>Cambiar estado del pedido:</label>
                <select
                  className={`admin-select-status ${getBadgeClass(pedidoSeleccionado.estado)}`}
                  value={pedidoSeleccionado.estado}
                  onChange={(e) =>
                    handleCambiarEstado(pedidoSeleccionado.id, e.target.value)
                  }
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="En preparación">En preparación</option>
                  <option value="Listo">Listo</option>
                  <option value="Entregado">Entregado</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </div>
            </div>

            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-button--primary"
                onClick={() => setPedidoSeleccionado(null)}
              >
                Cerrar detalle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

