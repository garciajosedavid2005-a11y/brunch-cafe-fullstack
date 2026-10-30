import { useState } from "react";
import {
  Sliders,
  Plus,
  Edit2,
  Trash2,
  Search,
  AlertCircle,
  X,
  ShoppingBag,
  CalendarDays,
} from "lucide-react";
import {
  estadosPedidosIniciales,
  estadosReservasIniciales,
} from "../mockExtraData";

export default function StatesSection() {
  const [tipoActivo, setTipoActivo] = useState("pedidos"); // "pedidos" | "reservas"
  const [estadosPedidos, setEstadosPedidos] = useState(estadosPedidosIniciales);
  const [estadosReservas, setEstadosReservas] = useState(estadosReservasIniciales);
  const [busqueda, setBusqueda] = useState("");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [estadoEnEdicion, setEstadoEnEdicion] = useState(null);
  const [estadoAEliminar, setEstadoAEliminar] = useState(null);

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    color: "#b78103",
    bg: "#fff8e1",
    badgeType: "warning",
    esFinal: false,
  });

  const listaActual = tipoActivo === "pedidos" ? estadosPedidos : estadosReservas;
  const setListaActual = tipoActivo === "pedidos" ? setEstadosPedidos : setEstadosReservas;

  const abrirModalCrear = () => {
    setEstadoEnEdicion(null);
    setFormData({
      nombre: "",
      descripcion: "",
      color: "#b78103",
      bg: "#fff8e1",
      badgeType: "warning",
      esFinal: false,
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (item) => {
    setEstadoEnEdicion(item);
    setFormData({
      nombre: item.nombre,
      descripcion: item.descripcion,
      color: item.color || "#b78103",
      bg: item.bg || "#fff8e1",
      badgeType: item.badgeType || "warning",
      esFinal: item.esFinal || false,
    });
    setModalAbierto(true);
  };

  const handleGuardar = (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    if (estadoEnEdicion) {
      setListaActual((prev) =>
        prev.map((est) =>
          est.id === estadoEnEdicion.id ? { ...est, ...formData } : est
        )
      );
    } else {
      const nuevo = {
        id: Date.now(),
        tipo: tipoActivo === "pedidos" ? "pedido" : "reserva",
        ...formData,
      };
      setListaActual((prev) => [...prev, nuevo]);
    }
    setModalAbierto(false);
  };

  const handleEliminar = () => {
    if (!estadoAEliminar) return;
    setListaActual((prev) => prev.filter((est) => est.id !== estadoAEliminar.id));
    setEstadoAEliminar(null);
  };

  const estadosFiltrados = listaActual.filter(
    (est) =>
      est.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      est.descripcion.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="admin-section">
      {/* CABECERA */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Catálogo de Estados</h2>
          <p className="admin-section__subtitle">
            Administra el ciclo de vida y los estados por los que pasan los pedidos de domicilios y las reservas.
          </p>
        </div>
        <button
          type="button"
          className="admin-button--primary"
          onClick={abrirModalCrear}
        >
          <Plus size={18} />
          <span>Nuevo Estado ({tipoActivo === "pedidos" ? "Pedido" : "Reserva"})</span>
        </button>
      </div>

      {/* SELECTOR DE PESTAÑAS (PEDIDOS VS RESERVAS) */}
      <div className="admin-states-nav">
        <button
          type="button"
          className={`admin-states-tab ${tipoActivo === "pedidos" ? "is-active" : ""}`}
          onClick={() => {
            setTipoActivo("pedidos");
            setBusqueda("");
          }}
        >
          <ShoppingBag size={18} />
          <span>Estados de Pedidos ({estadosPedidos.length})</span>
        </button>
        <button
          type="button"
          className={`admin-states-tab ${tipoActivo === "reservas" ? "is-active" : ""}`}
          onClick={() => {
            setTipoActivo("reservas");
            setBusqueda("");
          }}
        >
          <CalendarDays size={18} />
          <span>Estados de Reservas ({estadosReservas.length})</span>
        </button>
      </div>

      {/* BUSCADOR */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder={`Buscar estado de ${tipoActivo}...`}
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      {/* TABLA DE ESTADOS */}
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Vista de Etiqueta (Badge)</th>
                <th>Nombre del Estado</th>
                <th>Descripción / Significado</th>
                <th>Etapa</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {estadosFiltrados.length > 0 ? (
                estadosFiltrados.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span
                        className="admin-badge"
                        style={{
                          backgroundColor: item.bg,
                          color: item.color,
                          borderColor: item.color,
                          borderWidth: "1.5px",
                          borderStyle: "solid",
                        }}
                      >
                        {item.nombre}
                      </span>
                    </td>
                    <td>
                      <strong className="admin-table__client-name">{item.nombre}</strong>
                    </td>
                    <td>
                      <span className="admin-table__category-desc">{item.descripcion}</span>
                    </td>
                    <td>
                      {item.esFinal ? (
                        <span className="admin-badge admin-badge--neutral">Estado Final</span>
                      ) : (
                        <span className="admin-badge admin-badge--info">En Proceso</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          onClick={() => abrirModalEditar(item)}
                          title="Editar estado"
                        >
                          <Edit2 size={14} />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          className="admin-button--icon-danger"
                          onClick={() => setEstadoAEliminar(item)}
                          title="Eliminar estado"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="admin-table__empty">
                    No se encontraron estados para {tipoActivo}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR */}
      {modalAbierto && (
        <div className="admin-modal-overlay" onClick={() => setModalAbierto(false)}>
          <div
            className="admin-modal-container admin-modal-container--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">
                {estadoEnEdicion
                  ? `Editar Estado de ${tipoActivo === "pedidos" ? "Pedido" : "Reserva"}`
                  : `Nuevo Estado de ${tipoActivo === "pedidos" ? "Pedido" : "Reserva"}`}
              </h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setModalAbierto(false)}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleGuardar}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label">Nombre del Estado *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="Ej. En reparto, En espera..."
                    required
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Descripción</label>
                  <textarea
                    rows={2}
                    className="admin-form-textarea"
                    placeholder="Describe qué significa este estado en el proceso..."
                    value={formData.descripcion}
                    onChange={(e) =>
                      setFormData({ ...formData, descripcion: e.target.value })
                    }
                  />
                </div>

                <div className="admin-modal-grid">
                  <div className="admin-form-group">
                    <label className="admin-form-label">Color del Texto / Borde</label>
                    <input
                      type="color"
                      className="admin-form-input"
                      style={{ height: "45px", padding: "0.2rem", cursor: "pointer" }}
                      value={formData.color}
                      onChange={(e) =>
                        setFormData({ ...formData, color: e.target.value })
                      }
                    />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label">Color de Fondo</label>
                    <input
                      type="color"
                      className="admin-form-input"
                      style={{ height: "45px", padding: "0.2rem", cursor: "pointer" }}
                      value={formData.bg}
                      onChange={(e) =>
                        setFormData({ ...formData, bg: e.target.value })
                      }
                    />
                  </div>
                </div>

                <div className="admin-form-checkbox-row">
                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.esFinal}
                      onChange={(e) =>
                        setFormData({ ...formData, esFinal: e.target.checked })
                      }
                    />
                    <span>¿Es un estado final? (Cierra el pedido o reserva)</span>
                  </label>
                </div>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="admin-button--modal-cancel"
                  onClick={() => setModalAbierto(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-button--primary">
                  {estadoEnEdicion ? "Guardar Cambios" : "Crear Estado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {estadoAEliminar && (
        <div className="admin-modal-overlay" onClick={() => setEstadoAEliminar(null)}>
          <div
            className="admin-modal-container admin-modal-container--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">¿Eliminar Estado?</h3>
            </div>
            <div className="admin-modal-body">
              <div className="admin-delete-alert">
                <AlertCircle size={28} className="admin-delete-alert__icon" />
                <p>
                  Estás a punto de eliminar el estado{" "}
                  <strong>{estadoAEliminar.nombre}</strong> del catálogo de {tipoActivo}.
                </p>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-button--modal-cancel"
                onClick={() => setEstadoAEliminar(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-button--danger"
                onClick={handleEliminar}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

