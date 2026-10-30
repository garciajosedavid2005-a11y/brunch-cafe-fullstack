import { useState } from "react";
import { Search, Eye, Check, X, CalendarDays, Users, Clock, Mail, Phone, MessageSquare, Info } from "lucide-react";
import { reservasIniciales } from "../mockData";

export default function ReservationsSection() {
  const [reservas, setReservas] = useState(reservasIniciales);
  const [filtroEstado, setFiltroEstado] = useState("Todas");
  const [busqueda, setBusqueda] = useState("");
  const [reservaSeleccionada, setReservaSeleccionada] = useState(null);

  const estadosDisponibles = ["Todas", "Pendiente", "Confirmada", "Cancelada"];

  // Cambiar estado de una reserva interactivamente
  const handleCambiarEstado = (id, nuevoEstado) => {
    setReservas((prev) =>
      prev.map((r) => (r.id === id ? { ...r, estado: nuevoEstado } : r))
    );
    if (reservaSeleccionada && reservaSeleccionada.id === id) {
      setReservaSeleccionada((prev) => ({ ...prev, estado: nuevoEstado }));
    }
  };

  // Filtrar reservas
  const reservasFiltradas = reservas.filter((reserva) => {
    const coincideEstado =
      filtroEstado === "Todas" || reserva.estado === filtroEstado;
    const coincideBusqueda =
      reserva.cliente.toLowerCase().includes(busqueda.toLowerCase()) ||
      reserva.id.toLowerCase().includes(busqueda.toLowerCase()) ||
      reserva.motivo.toLowerCase().includes(busqueda.toLowerCase()) ||
      reserva.correo.toLowerCase().includes(busqueda.toLowerCase());
    return coincideEstado && coincideBusqueda;
  });

  const getBadgeClass = (estado) => {
    switch (estado) {
      case "Pendiente":
        return "admin-badge--warning";
      case "Confirmada":
        return "admin-badge--success";
      case "Cancelada":
        return "admin-badge--danger";
      default:
        return "admin-badge--neutral";
    }
  };

  return (
    <div className="admin-section">
      {/* CABECERA */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Gestión de Reservas</h2>
          <p className="admin-section__subtitle">
            Consulta todas las reservas realizadas por los comensales y gestiona su aprobación o cancelación.
          </p>
        </div>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder="Buscar por cliente, correo, motivo o código..."
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

      {/* TABLA DE RESERVAS */}
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Cliente</th>
                <th>Contacto</th>
                <th>Fecha y Hora</th>
                <th>Personas</th>
                <th>Motivo</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reservasFiltradas.length > 0 ? (
                reservasFiltradas.map((reserva) => (
                  <tr key={reserva.id}>
                    <td>
                      <span className="admin-table__code">{reserva.id}</span>
                    </td>
                    <td>
                      <strong className="admin-table__client-name">{reserva.cliente}</strong>
                    </td>
                    <td>
                      <div className="admin-table__contact">
                        <span>{reserva.telefono}</span>
                        <small>{reserva.correo}</small>
                      </div>
                    </td>
                    <td>
                      <div className="admin-table__schedule">
                        <strong>{reserva.fecha}</strong>
                        <span>{reserva.hora}</span>
                      </div>
                    </td>
                    <td>
                      <span className="admin-table__capacity">
                        <Users size={14} />
                        {reserva.personas} pers.
                      </span>
                    </td>
                    <td>
                      <span className="admin-table__reason">{reserva.motivo}</span>
                    </td>
                    <td>
                      <select
                        className={`admin-select-status ${getBadgeClass(reserva.estado)}`}
                        value={reserva.estado}
                        onChange={(e) => handleCambiarEstado(reserva.id, e.target.value)}
                      >
                        <option value="Pendiente">Pendiente</option>
                        <option value="Confirmada">Confirmada</option>
                        <option value="Cancelada">Cancelada</option>
                      </select>
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        {reserva.estado === "Pendiente" && (
                          <>
                            <button
                              type="button"
                              className="admin-button--icon-success"
                              title="Confirmar reserva"
                              onClick={() => handleCambiarEstado(reserva.id, "Confirmada")}
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              className="admin-button--icon-danger"
                              title="Rechazar/Cancelar reserva"
                              onClick={() => handleCambiarEstado(reserva.id, "Cancelada")}
                            >
                              <X size={16} />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          onClick={() => setReservaSeleccionada(reserva)}
                          title="Ver detalle completo"
                        >
                          <Eye size={15} />
                          <span>Ver</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="8" className="admin-table__empty">
                    No se encontraron reservas con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL DE DETALLE DE RESERVA */}
      {reservaSeleccionada && (
        <div className="admin-modal-overlay" onClick={() => setReservaSeleccionada(null)}>
          <div
            className="admin-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-header">
              <div>
                <span className="admin-badge admin-badge--neutral">
                  Reserva {reservaSeleccionada.id}
                </span>
                <h3 className="admin-modal-title">Detalle de la Reserva</h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setReservaSeleccionada(null)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className="admin-modal-body">
              <div className="admin-modal-grid">
                <div className="admin-modal-box">
                  <div className="admin-modal-box__title">
                    <Users size={16} />
                    <strong>Datos de Contacto</strong>
                  </div>
                  <p><strong>Titular:</strong> {reservaSeleccionada.cliente}</p>
                  <p><strong>Teléfono:</strong> {reservaSeleccionada.telefono}</p>
                  <p><strong>Correo:</strong> {reservaSeleccionada.correo}</p>
                </div>

                <div className="admin-modal-box">
                  <div className="admin-modal-box__title">
                    <CalendarDays size={16} />
                    <strong>Fecha y Asistencia</strong>
                  </div>
                  <p><strong>Fecha:</strong> {reservaSeleccionada.fecha}</p>
                  <p><strong>Hora:</strong> {reservaSeleccionada.hora}</p>
                  <p><strong>Cantidad de personas:</strong> {reservaSeleccionada.personas}</p>
                  <p><strong>Motivo:</strong> {reservaSeleccionada.motivo}</p>
                </div>
              </div>

              {reservaSeleccionada.observaciones && (
                <div className="admin-modal-section">
                  <div className="admin-modal-box__title">
                    <MessageSquare size={16} />
                    <strong>Observaciones o requerimientos especiales</strong>
                  </div>
                  <div className="admin-modal-observations">
                    "{reservaSeleccionada.observaciones}"
                  </div>
                </div>
              )}

              {/* Selector de estado */}
              <div className="admin-modal-status-bar">
                <label>Estado de la reserva:</label>
                <select
                  className={`admin-select-status ${getBadgeClass(reservaSeleccionada.estado)}`}
                  value={reservaSeleccionada.estado}
                  onChange={(e) =>
                    handleCambiarEstado(reservaSeleccionada.id, e.target.value)
                  }
                >
                  <option value="Pendiente">Pendiente</option>
                  <option value="Confirmada">Confirmada</option>
                  <option value="Cancelada">Cancelada</option>
                </select>
              </div>
            </div>

            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-button--primary"
                onClick={() => setReservaSeleccionada(null)}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

