import { useState } from "react";
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  Search,
  CheckCircle,
  AlertCircle,
  Users,
  Lock,
  X,
  ShieldAlert,
} from "lucide-react";
import { rolesIniciales } from "../mockExtraData";

export default function RolesSection() {
  const [roles, setRoles] = useState(rolesIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [rolEnEdicion, setRolEnEdicion] = useState(null);
  const [rolAEliminar, setRolAEliminar] = useState(null);

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    permisosTexto: "",
  });

  const abrirModalCrear = () => {
    setRolEnEdicion(null);
    setFormData({
      nombre: "",
      descripcion: "",
      permisosTexto: "",
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (item) => {
    setRolEnEdicion(item);
    setFormData({
      nombre: item.nombre,
      descripcion: item.descripcion,
      permisosTexto: item.permisos ? item.permisos.join("\n") : "",
    });
    setModalAbierto(true);
  };

  const handleGuardar = (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    const listaPermisos = formData.permisosTexto
      .split("\n")
      .map((p) => p.trim())
      .filter(Boolean);

    if (rolEnEdicion) {
      setRoles((prev) =>
        prev.map((r) =>
          r.id === rolEnEdicion.id
            ? {
                ...r,
                nombre: formData.nombre,
                descripcion: formData.descripcion,
                permisos: listaPermisos,
              }
            : r
        )
      );
    } else {
      const nuevo = {
        id: Date.now(),
        codigo: formData.nombre.toLowerCase().replace(/\s+/g, "_"),
        nombre: formData.nombre,
        descripcion: formData.descripcion,
        usuariosAsignados: 0,
        esSistema: false,
        permisos: listaPermisos,
      };
      setRoles((prev) => [...prev, nuevo]);
    }
    setModalAbierto(false);
  };

  const handleEliminar = () => {
    if (!rolAEliminar || rolAEliminar.esSistema) return;
    setRoles((prev) => prev.filter((r) => r.id !== rolAEliminar.id));
    setRolAEliminar(null);
  };

  const rolesFiltrados = roles.filter(
    (r) =>
      r.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      r.descripcion.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="admin-section">
      {/* CABECERA */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Catálogo de Roles y Permisos</h2>
          <p className="admin-section__subtitle">
            Administra los roles del sistema de Brunch Café y los privilegios asignados a cada tipo de usuario.
          </p>
        </div>
        <button
          type="button"
          className="admin-button--primary"
          onClick={abrirModalCrear}
        >
          <Plus size={18} />
          <span>Nuevo Rol</span>
        </button>
      </div>

      {/* BUSCADOR */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder="Buscar por rol o permisos..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="admin-toolbar__count">
          <strong>{rolesFiltrados.length}</strong> roles configurados
        </div>
      </div>

      {/* GRID / TABLA DE ROLES */}
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Descripción</th>
                <th>Usuarios Asignados</th>
                <th>Permisos Otorgados</th>
                <th>Tipo</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {rolesFiltrados.length > 0 ? (
                rolesFiltrados.map((rol) => (
                  <tr key={rol.id}>
                    <td>
                      <div className="admin-product-cell">
                        <div
                          className="admin-product-thumbnail-placeholder"
                          style={{
                            background: rol.codigo === "admin" ? "#890620" : "#eedfd9",
                            color: rol.codigo === "admin" ? "#ffffff" : "#2C0703",
                          }}
                        >
                          <Shield size={20} />
                        </div>
                        <div>
                          <strong className="admin-table__client-name">{rol.nombre}</strong>
                          <div style={{ fontSize: "0.75rem", color: "#55332e", fontFamily: "monospace" }}>
                            slug: {rol.codigo}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="admin-table__category-desc">{rol.descripcion}</span>
                    </td>
                    <td>
                      <span className="admin-badge admin-badge--neutral">
                        <Users size={12} style={{ display: "inline", marginRight: "4px" }} />
                        {rol.usuariosAsignados} usuarios
                      </span>
                    </td>
                    <td>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", maxWidth: "280px" }}>
                        {rol.permisos && rol.permisos.length > 0 ? (
                          rol.permisos.slice(0, 3).map((p, idx) => (
                            <span
                              key={idx}
                              className="admin-badge admin-badge--info"
                              style={{ fontSize: "0.74rem" }}
                            >
                              {p}
                            </span>
                          ))
                        ) : (
                          <span style={{ fontSize: "0.8rem", color: "#8c726c" }}>Sin permisos</span>
                        )}
                        {rol.permisos && rol.permisos.length > 3 && (
                          <span
                            className="admin-badge admin-badge--neutral"
                            style={{ fontSize: "0.74rem" }}
                          >
                            +{rol.permisos.length - 3} más
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      {rol.esSistema ? (
                        <span className="admin-badge admin-badge--warning">Sistema</span>
                      ) : (
                        <span className="admin-badge admin-badge--neutral">Personalizado</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          onClick={() => abrirModalEditar(rol)}
                          title="Editar rol"
                        >
                          <Edit2 size={14} />
                          <span>Editar</span>
                        </button>
                        {!rol.esSistema && (
                          <button
                            type="button"
                            className="admin-button--icon-danger"
                            onClick={() => setRolAEliminar(rol)}
                            title="Eliminar rol"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="6" className="admin-table__empty">
                    No se encontraron roles configurados.
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
                {rolEnEdicion ? `Editar Rol: ${rolEnEdicion.nombre}` : "Nuevo Rol de Usuario"}
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
                  <label className="admin-form-label">Nombre del Rol *</label>
                  <input
                    type="text"
                    className="admin-form-input"
                    placeholder="Ej. Cajero, Mesero, Supervisor..."
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
                    placeholder="Objetivo o nivel de responsabilidad de este rol..."
                    value={formData.descripcion}
                    onChange={(e) =>
                      setFormData({ ...formData, descripcion: e.target.value })
                    }
                  />
                </div>

                <div className="admin-form-group">
                  <label className="admin-form-label">Permisos (un permiso por línea)</label>
                  <textarea
                    rows={4}
                    className="admin-form-textarea"
                    placeholder="Crear pedidos&#10;Consultar reservas&#10;Ver reportes"
                    value={formData.permisosTexto}
                    onChange={(e) =>
                      setFormData({ ...formData, permisosTexto: e.target.value })
                    }
                  />
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
                  {rolEnEdicion ? "Guardar Cambios" : "Crear Rol"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL ELIMINAR */}
      {rolAEliminar && (
        <div className="admin-modal-overlay" onClick={() => setRolAEliminar(null)}>
          <div
            className="admin-modal-container admin-modal-container--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">¿Eliminar Rol?</h3>
            </div>
            <div className="admin-modal-body">
              <div className="admin-delete-alert">
                <AlertCircle size={28} className="admin-delete-alert__icon" />
                <p>
                  Estás a punto de eliminar el rol{" "}
                  <strong>{rolAEliminar.nombre}</strong>. Los usuarios que tengan este rol perderán sus accesos asociados.
                </p>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-button--modal-cancel"
                onClick={() => setRolAEliminar(null)}
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

