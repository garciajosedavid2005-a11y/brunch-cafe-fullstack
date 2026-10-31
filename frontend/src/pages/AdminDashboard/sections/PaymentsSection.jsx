import { useState } from "react";
import {
  CreditCard,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  AlertCircle,
  Banknote,
  Smartphone,
  X,
  Lock,
} from "lucide-react";
import { metodosPagoIniciales } from "../mockExtraData";

export default function PaymentsSection() {
  const [metodos, setMetodos] = useState(metodosPagoIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [metodoEnEdicion, setMetodoEnEdicion] = useState(null);
  const [metodoAEliminar, setMetodoAEliminar] = useState(null);

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    activo: true,
  });

  const abrirModalCrear = () => {
    setMetodoEnEdicion(null);
    setFormData({
      nombre: "",
      descripcion: "",
      activo: true,
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (item) => {
    setMetodoEnEdicion(item);
    setFormData({
      nombre: item.nombre,
      descripcion: item.descripcion,
      activo: item.activo,
    });
    setModalAbierto(true);
  };

  const handleGuardar = (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    if (metodoEnEdicion) {
      setMetodos((prev) =>
        prev.map((m) =>
          m.id === metodoEnEdicion.id ? { ...m, ...formData } : m
        )
      );
    } else {
      const nuevo = {
        id: Date.now(),
        codigo: formData.nombre.toLowerCase().replace(/\s+/g, "-"),
        ...formData,
        icono: "CreditCard",
        pedidosAsociados: 0,
      };
      setMetodos((prev) => [...prev, nuevo]);
    }
    setModalAbierto(false);
  };

  const handleEliminar = () => {
    if (!metodoAEliminar) return;
    setMetodos((prev) => prev.filter((m) => m.id !== metodoAEliminar.id));
    setMetodoAEliminar(null);
  };

  const handleToggleActivo = (id) => {
    setMetodos((prev) =>
      prev.map((m) => (m.id === id ? { ...m, activo: !m.activo } : m))
    );
  };

  const metodosFiltrados = metodos.filter(
    (m) =>
      m.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      m.descripcion.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="admin-section">
      {/* CABECERA */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Métodos de Pago</h2>
          <p className="admin-section__subtitle">
            Crea, lista, edita y administra las opciones de pago que los clientes eligen al pedir domicilios.
          </p>
        </div>
        <button
          type="button"
          className="admin-button--primary"
          onClick={abrirModalCrear}
        >
          <Plus size={18} />
          <span>Nuevo Método de Pago</span>
        </button>
      </div>

      {/* BUSCADOR */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder="Buscar método de pago..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="admin-toolbar__count">
          <strong>{metodosFiltrados.length}</strong> métodos configurados
        </div>
      </div>

      {/* TABLA DE MÉTODOS DE PAGO */}
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Método de Pago</th>
                <th>Descripción</th>
                <th>Pedidos Históricos</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {metodosFiltrados.length > 0 ? (
                metodosFiltrados.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="admin-product-cell">
                        <div className="admin-product-thumbnail-placeholder" style={{ background: "#eedfd9" }}>
                          <CreditCard size={20} color="#890620" />
                        </div>
                        <strong className="admin-table__client-name">{item.nombre}</strong>
                      </div>
                    </td>
                    <td>
                      <span className="admin-table__category-desc">{item.descripcion}</span>
                    </td>
                    <td>
                      <span className="admin-badge admin-badge--neutral">
                        {item.pedidosAsociados} pedidos
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => handleToggleActivo(item.id)}
                        className={`admin-badge ${
                          item.activo ? "admin-badge--success" : "admin-badge--danger"
                        }`}
                        style={{ cursor: "pointer", border: "none" }}
                        title="Haz clic para activar/desactivar"
                      >
                        {item.activo ? "✓ Activo" : "✕ Inactivo"}
                      </button>
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          onClick={() => abrirModalEditar(item)}
                          title="Editar método"
                        >
                          <Edit2 size={14} />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          className="admin-button--icon-danger"
                          onClick={() => setMetodoAEliminar(item)}
                          title="Eliminar método"
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
                    No se encontraron métodos de pago.
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
                {metodoEnEdicion ? "Editar Método de Pago" : "Nuevo Método de Pago"}
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
                  <label className="admin-form-label">Nombre del Método *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="Ej. Transferencia Nequi / Dale"
                    required
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Instrucciones o Descripción</label>
                  <textarea
                    rows={3}
                    className="admin-form-textarea"
                    placeholder="Instrucciones para el cliente sobre cómo pagar..."
                    value={formData.descripcion}
                    onChange={(e) =>
                      setFormData({ ...formData, descripcion: e.target.value })
                    }
                  />
                </div>

                <div className="admin-form-checkbox-row">
                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.activo}
                      onChange={(e) =>
                        setFormData({ ...formData, activo: e.target.checked })
                      }
                    />
                    <span>Método habilitado para el público</span>
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
                  {metodoEnEdicion ? "Guardar Cambios" : "Crear Método"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {metodoAEliminar && (
        <div className="admin-modal-overlay" onClick={() => setMetodoAEliminar(null)}>
          <div
            className="admin-modal-container admin-modal-container--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">¿Eliminar Método de Pago?</h3>
            </div>
            <div className="admin-modal-body">
              <div className="admin-delete-alert">
                <AlertCircle size={28} className="admin-delete-alert__icon" />
                <p>
                  Estás a punto de eliminar <strong>{metodoAEliminar.nombre}</strong>.
                  Si existen pedidos asociados históricos, se recomienda simplemente desactivarlo.
                </p>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-button--modal-cancel"
                onClick={() => setMetodoAEliminar(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-button--danger"
                onClick={handleEliminar}
              >
                Eliminar Definitivamente
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

