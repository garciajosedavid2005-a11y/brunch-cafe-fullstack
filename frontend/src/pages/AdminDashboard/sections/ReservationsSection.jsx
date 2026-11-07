import { useState } from "react";
import { Search, Eye, Check, X, CalendarDays, Users, Clock, Mail, Phone, MessageSquare, Info } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { formatClock, formatCalendarDate } from "../adminFormat";
import EstadoSelector from "../components/EstadoSelector";
import { pedirMotivo } from "../components/estadoUtils";
import { useDialogo } from "../../../context/useDialogo";

export default function ReservationsSection() {
  const { items: reservas, cargando, error, cargar, parchear } = useAdminResource("/v1/staff/reservas");
  const estadosResource = useAdminResource("/v1/admin/estados?tipo=reserva");
  const [filtroEstado, setFiltroEstado] = useState("Todas");
  const [busqueda, setBusqueda] = useState("");
  const [reservaSeleccionada, setReservaSeleccionada] = useState(null);
  const { confirmar } = useDialogo();

  const estadosDisponibles = ["Todas", ...new Set(estadosResource.items.map((estado) => estado.nombre))];

  const handleCambiarEstado = async (id, codigo, motivo) => {
    const actualizada = await parchear(id, { codigo, ...(motivo ? { motivo } : {}) }, "/estado");
    if (actualizada && reservaSeleccionada?.id === id) setReservaSeleccionada(actualizada);
  };

  // Botones rápidos (confirmar / cancelar) solo si la transición está permitida
  const accionRapida = async (reserva, codigo) => {
    const transicion = (reserva.transiciones || []).find((t) => t.codigo === codigo);
    if (!transicion) return;
    const motivo = await pedirMotivo(confirmar, transicion);
    if (motivo === null) return;
    handleCambiarEstado(reserva.id, codigo, motivo);
  };
  const puede = (reserva, codigo) => (reserva.transiciones || []).some((t) => t.codigo === codigo);

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
          <table className="admin-table admin-table--compacta admin-reservas__tabla admin-table--acciones-fijas">
            <thead>
              <tr>
                <th>Reserva</th>
                <th>Contacto</th>
                <th>Fecha y hora</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {reservasFiltradas.length > 0 ? (
                reservasFiltradas.map((reserva) => (
                  <tr key={reserva.id}>
                    <td>
                      <div className="admin-reservas__reserva">
                        <strong className="admin-table__client-name">{reserva.cliente}</strong>
                        <span className="admin-table__code">{reserva.codigo}</span>
                        {reserva.motivo && <span className="admin-reservas__motivo">{reserva.motivo}</span>}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table__contact">
                        <span>{reserva.telefono}</span>
                        <small>{reserva.correo}</small>
                        {reserva.registradaPor && <small>Registrada por {reserva.registradaPor.nombre}</small>}
                      </div>
                    </td>
                    <td>
                      <div className="admin-table__schedule">
                        <strong>{formatCalendarDate(reserva.fecha)}</strong>
                        <span>{formatClock(reserva.hora)}</span>
                        <span className="admin-table__capacity">
                          <Users size={14} aria-hidden="true" />
                          {reserva.personas} pers.
                        </span>
                      </div>
                    </td>
                    <td>
                      <EstadoSelector item={reserva} onCambiar={(codigo, motivo) => handleCambiarEstado(reserva.id, codigo, motivo)} />
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        {(puede(reserva, "confirmada") || puede(reserva, "cancelada")) && reserva.estadoCodigo === "pendiente" && (
                          <>
                            <button
                              type="button"
                              className="admin-button--icon-success"
                              title="Confirmar reserva"
                              aria-label={`Confirmar reserva de ${reserva.cliente}`}
                              onClick={() => accionRapida(reserva, "confirmada")}
                            >
                              <Check size={16} />
                            </button>
                            <button
                              type="button"
                              className="admin-button--icon-danger"
                              title="Rechazar/Cancelar reserva"
                              aria-label={`Cancelar reserva de ${reserva.cliente}`}
                              onClick={() => accionRapida(reserva, "cancelada")}
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
                  <td colSpan="5" className="admin-table__empty">
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
                  Reserva {reservaSeleccionada.codigo}
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
                <span className="admin-modal-status-bar__titulo">Estado de la reserva</span>
                <EstadoSelector
                  item={reservaSeleccionada}
                  onCambiar={(codigo, motivo) => handleCambiarEstado(reservaSeleccionada.id, codigo, motivo)}
                />
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
