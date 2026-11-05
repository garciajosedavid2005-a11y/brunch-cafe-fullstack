import { useState } from "react";
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  Search,
  Users,
  Lock,
  X,
} from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { useDialogo } from "../../../context/useDialogo";
import { plural } from "../adminFormat";

export default function RolesSection() {
  const { items: roles, cargando, error, guardando, cargar, crear, actualizar, eliminar } =
    useAdminResource("/roles");
  // Catálogo de permisos (los "reservados" son de fases futuras y aún no se asignan)
  const { items: catalogo } = useAdminResource("/permisos");
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [rolEnEdicion, setRolEnEdicion] = useState(null);
  const { confirmar } = useDialogo();

  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    permisos: [],
  });

  const etiquetaPermiso = (clave) =>
    clave === "*" ? "Todos los permisos" : catalogo.find((p) => p.clave === clave)?.descripcion || clave;

  const modulos = [...new Set(catalogo.map((p) => p.modulo))];

  const alternarPermiso = (clave) =>
    setFormData((actual) => ({
      ...actual,
      permisos: actual.permisos.includes(clave)
        ? actual.permisos.filter((p) => p !== clave)
        : [...actual.permisos, clave],
    }));

  const abrirModalCrear = () => {
    setRolEnEdicion(null);
    setFormData({
      nombre: "",
      descripcion: "",
      permisos: [],
    });
    setModalAbierto(true);
  };

  const abrirModalEditar = (item) => {
    if (item.editable === false) return;
    setRolEnEdicion(item);
    // Solo se conservan claves asignables del catálogo (los textos antiguos se descartan)
    const asignables = new Set(catalogo.filter((p) => !p.reservado).map((p) => p.clave));
    setFormData({
      nombre: item.nombre,
      descripcion: item.descripcion,
      permisos: (item.permisos || []).filter((p) => asignables.has(p)),
    });
    setModalAbierto(true);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    const permisosEditables = !rolEnEdicion || rolEnEdicion.permisosEditables !== false;
    const datos = {
      nombre: formData.nombre,
      descripcion: formData.descripcion,
      ...(permisosEditables ? { permisos: formData.permisos } : {}),
    };
    const guardado = rolEnEdicion
      ? await actualizar(rolEnEdicion.id, datos)
      : await crear(datos);
    if (guardado) setModalAbierto(false);
  };

  // Solo roles personalizados sin usuarios; el backend vuelve a validarlo (ROL_PROTEGIDO / ROL_CON_USUARIOS)
  const handleEliminar = async (rol) => {
    const { confirmado } = await confirmar({
      titulo: "Eliminar rol",
      mensaje: "¿Estás seguro de que deseas eliminar este rol? Esta acción no se puede deshacer.",
      detalle: <strong>{rol.nombre}</strong>,
      confirmarTexto: "Eliminar rol",
      cancelarTexto: "Cancelar",
      peligroso: true,
    });
    if (confirmado && (await eliminar(rol.id))) await cargar();
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
      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />
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
                        {plural(rol.usuariosAsignados, "usuario")}
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
                              {etiquetaPermiso(p)}
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
                        {rol.editable !== false && (
                          <button
                            type="button"
                            className="admin-button--secondary-sm"
                            onClick={() => abrirModalEditar(rol)}
                            title="Editar rol"
                          >
                            <Edit2 size={14} />
                            <span>Editar</span>
                          </button>
                        )}
                        {rol.esSistema ? (
                          <div className="admin-roles__protegido">
                            <span className="admin-badge admin-badge--neutral">
                              <Lock size={12} aria-hidden="true" /> Protegido
                            </span>
                            <small>Rol de sistema: no se puede eliminar.</small>
                          </div>
                        ) : (
                          <div className="admin-roles__eliminar">
                            <button
                              type="button"
                              className="admin-button--secondary-sm admin-button--peligro-sm"
                              disabled={rol.usuariosAsignados > 0 || guardando}
                              onClick={() => handleEliminar(rol)}
                              aria-describedby={rol.usuariosAsignados > 0 ? `motivo-${rol.id}` : undefined}
                            >
                              <Trash2 size={14} aria-hidden="true" />
                              <span>Eliminar</span>
                            </button>
                            {rol.usuariosAsignados > 0 && (
                              <small id={`motivo-${rol.id}`}>
                                Tiene {plural(rol.usuariosAsignados, "usuario asignado", "usuarios asignados")}
                              </small>
                            )}
                          </div>
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
                  <label className="admin-form-label">Permisos</label>
                  {rolEnEdicion && rolEnEdicion.permisosEditables === false ? (
                    <p style={{ fontSize: "0.85rem", color: "#8c726c" }}>
                      Este rol no puede tener permisos de staff. Solo se editan el nombre y la descripción.
                    </p>
                  ) : (
                    modulos.map((modulo) => (
                      <fieldset key={modulo} style={{ border: "none", padding: 0, margin: "0 0 0.6rem" }}>
                        <legend style={{ fontSize: "0.78rem", fontWeight: 600, textTransform: "capitalize", color: "#55332e" }}>
                          {modulo}
                        </legend>
                        {catalogo
                          .filter((p) => p.modulo === modulo)
                          .map((permiso) => (
                            <label
                              key={permiso.clave}
                              className="admin-checkbox-label"
                              style={{ opacity: permiso.reservado ? 0.55 : 1 }}
                            >
                              <input
                                type="checkbox"
                                disabled={permiso.reservado}
                                checked={formData.permisos.includes(permiso.clave)}
                                onChange={() => alternarPermiso(permiso.clave)}
                              />
                              <span>
                                {permiso.descripcion}
                                {permiso.reservado && " (próximas fases)"}
                              </span>
                            </label>
                          ))}
                      </fieldset>
                    ))
                  )}
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
                <button type="submit" className="admin-button--primary" disabled={guardando}>
                  {rolEnEdicion ? "Guardar Cambios" : "Crear Rol"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
