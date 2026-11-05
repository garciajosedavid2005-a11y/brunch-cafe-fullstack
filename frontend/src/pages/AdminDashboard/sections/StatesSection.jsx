import { useState } from "react";
import { Edit2, Search, X, ShoppingBag, CalendarDays } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";

export default function StatesSection() {
  const [tipoActivo, setTipoActivo] = useState("pedidos"); // "pedidos" | "reservas"
  const pedidosResource = useAdminResource("/v1/admin/estados?tipo=pedido");
  const reservasResource = useAdminResource("/v1/admin/estados?tipo=reserva");
  const [busqueda, setBusqueda] = useState("");

  const [modalAbierto, setModalAbierto] = useState(false);
  const [estadoEnEdicion, setEstadoEnEdicion] = useState(null);

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    color: "#7a5000",
    bg: "#fff8e1",
  });

  const recursoActual = tipoActivo === "pedidos" ? pedidosResource : reservasResource;
  const listaActual = recursoActual.items;

  const abrirModalEditar = (item) => {
    setEstadoEnEdicion(item);
    setFormData({
      nombre: item.nombre,
      descripcion: item.descripcion,
      color: item.color || "#b78103",
      bg: item.bg || "#fff8e1",
    });
    setModalAbierto(true);
  };

  // Solo se edita la presentación; el código, el tipo y si es final los fija el sistema
  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!estadoEnEdicion || !formData.nombre.trim()) return;
    const guardado = await recursoActual.actualizar(estadoEnEdicion.id, formData);
    if (guardado) setModalAbierto(false);
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
            Los estados y sus transiciones son fijos. Aquí puedes cambiar la etiqueta, la descripción y los colores con que se muestran.
          </p>
        </div>
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
          <span>Estados de Pedidos ({pedidosResource.items.length})</span>
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
          <span>Estados de Reservas ({reservasResource.items.length})</span>
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
      <AdminStatus
        cargando={pedidosResource.cargando || reservasResource.cargando}
        error={pedidosResource.error || reservasResource.error}
        onReintentar={() => {
          pedidosResource.cargar();
          reservasResource.cargar();
        }}
      />
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table admin-table--compacta">
            <thead>
              <tr>
                <th>Etiqueta</th>
                <th>Código</th>
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
                      <code>{item.codigo}</code>
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
                {`Editar Estado de ${tipoActivo === "pedidos" ? "Pedido" : "Reserva"}`}
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
                  <label className="admin-form-label">Etiqueta *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="Ej. En reparto"
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

                <p style={{ fontSize: "0.8rem", color: "#6b4f49", margin: 0 }}>
                  Código <code>{estadoEnEdicion?.codigo}</code> · {estadoEnEdicion?.esFinal ? "Estado final" : "En proceso"} (lo define el sistema).
                </p>
              </div>

              <div className="admin-modal-footer">
                <button
                  type="button"
                  className="admin-button--modal-cancel"
                  onClick={() => setModalAbierto(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-button--primary" disabled={recursoActual.guardando}>
                  Guardar Cambios
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
