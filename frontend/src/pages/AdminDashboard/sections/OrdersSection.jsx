import { useState } from "react";
import { textoModificadores } from "../../../utils/modificadores";
import { Search, Eye, X, Filter, ShoppingBag, MapPin, Phone, CreditCard, Clock } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { api } from "../../../services/api";
import { formatCurrency, formatDate, formatTime } from "../adminFormat";
import EstadoSelector from "../components/EstadoSelector";
import { useDialogo } from "../../../context/useDialogo";

export default function OrdersSection() {
  const { items: pedidos, cargando, error, cargar } = useAdminResource("/v1/staff/pedidos");
  const estadosResource = useAdminResource("/v1/admin/estados?tipo=pedido");
  const [filtroEstado, setFiltroEstado] = useState("Todos");
  const [busqueda, setBusqueda] = useState("");
  const [pedidoSeleccionado, setPedidoSeleccionado] = useState(null);
  const { avisar } = useDialogo();

  const estadosDisponibles = ["Todos", ...new Set(estadosResource.items.map((estado) => estado.nombre))];

  // Envía el código de destino; el backend valida la transición, el permiso y el motivo
  const handleCambiarEstado = async (id, codigo, motivo) => {
    try {
      const actualizado = await api.patch(`/v1/staff/pedidos/${id}/estado`, { codigo, ...(motivo ? { motivo } : {}) });
      if (pedidoSeleccionado?.id === id) setPedidoSeleccionado(actualizado);
      await cargar();
    } catch (requestError) {
      avisar({ tipo: "error", titulo: "No se pudo cambiar el estado", mensaje: requestError.message });
    }
  };

  // Filtrado de pedidos
  const pedidosFiltrados = pedidos.filter((pedido) => {
    const coincideEstado =
      filtroEstado === "Todos" || pedido.estado === filtroEstado;
    const coincideBusqueda =
      pedido.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
      pedido.codigo.toLowerCase().includes(busqueda.toLowerCase()) ||
      pedido.barrio.toLowerCase().includes(busqueda.toLowerCase());
    return coincideEstado && coincideBusqueda;
  });

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
      <AdminStatus
        cargando={cargando || estadosResource.cargando}
        error={error || estadosResource.error}
        onReintentar={() => {
          cargar();
          estadosResource.cargar();
        }}
      />
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
          <table className="admin-table admin-table--compacta admin-pedidos__tabla admin-table--acciones-fijas">
            <thead>
              <tr>
                <th>Pedido</th>
                <th>Entrega</th>
                <th>Total</th>
                <th className="admin-col-estado">Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {pedidosFiltrados.length > 0 ? (
                pedidosFiltrados.map((pedido) => (
                  <tr key={pedido.id}>
                    <td>
                      <div className="admin-pedidos__pedido">
                        <span className="admin-table__code">{pedido.codigo}</span>
                        <small className="admin-table__date">{formatDate(pedido.fecha)} · {formatTime(pedido.fecha)}</small>
                        <div className="admin-table__client">
                          <strong>{pedido.cliente}</strong>
                          <span>{pedido.telefono}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table__address">
                        <span>{pedido.direccion}</span>
                        <small>{pedido.barrio} · {pedido.hora}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-pedidos__total">
                        <span className="admin-table__amount">{formatCurrency(pedido.total)}</span>
                        <small className="admin-pedidos__pago">{pedido.metodoPago}</small>
                      </div>
                    </td>
                    <td className="admin-col-estado">
                      {/* SELECTOR DE ESTADO: solo los cambios permitidos */}
                      <EstadoSelector item={pedido} onCambiar={(codigo, motivo) => handleCambiarEstado(pedido.id, codigo, motivo)} />
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
                  <td colSpan="5" className="admin-table__empty">
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
                  Pedido {pedidoSeleccionado.codigo}
                </span>
                <h3 className="admin-modal-title">Detalle del Pedido</h3>
                <small className="admin-modal-date">{formatDate(pedidoSeleccionado.fecha)} · {formatTime(pedidoSeleccionado.fecha)}</small>
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
                  {pedidoSeleccionado.correo && <p><strong>Correo:</strong> {pedidoSeleccionado.correo}</p>}
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
                        <td className="admin-pedido__articulo">
                          {item.nombre}
                          {/* 1.12 · Opciones del plato y nota de la línea */}
                          {item.modificadores?.length > 0 && <small className="admin-pedido__opciones">{textoModificadores(item.modificadores)}</small>}
                          {item.nota && <small className="admin-pedido__opciones">Nota: {item.nota}</small>}
                        </td>
                        <td>{item.cantidad}</td>
                        <td>{formatCurrency(item.precio)}</td>
                        <td><strong>{formatCurrency(item.subtotal)}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Resumen de pago y estado */}
              <div className="admin-modal-footer-info">
                <div className="admin-modal-payment">
                  <CreditCard size={18} />
                  <span className="admin-modal-payment__texto">Método de pago: <strong>{pedidoSeleccionado.metodoPago}</strong></span>
                </div>
                <div className="admin-modal-total">
                  <span>Total a cobrar:</span>
                  <h3>{formatCurrency(pedidoSeleccionado.total)}</h3>
                </div>
              </div>

              {/* Selector de estado dentro del modal */}
              <div className="admin-modal-status-bar">
                <span className="admin-modal-status-bar__titulo" id="titulo-estado-pedido">Cambiar estado del pedido</span>
                <EstadoSelector
                  item={pedidoSeleccionado}
                  onCambiar={(codigo, motivo) => handleCambiarEstado(pedidoSeleccionado.id, codigo, motivo)}
                />
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
