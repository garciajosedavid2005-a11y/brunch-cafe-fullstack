import { useState } from "react";
import { Search } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { useAuth } from "../../../context/useAuth";

// Pantalla mínima: lista de usuarios, cambio de rol y activar/desactivar.
// Las protecciones (último admin, auto-bloqueo) las aplica el backend.
export default function UsersSection() {
  const { items: usuarios, cargando, error, guardando, cargar, parchear } =
    useAdminResource("/admin/usuarios");
  const { items: roles } = useAdminResource("/roles");
  const { user } = useAuth();
  const [busqueda, setBusqueda] = useState("");

  const texto = busqueda.toLowerCase();
  const filtrados = usuarios.filter((u) =>
    `${u.nombre} ${u.apellido} ${u.correo} ${u.rol?.nombre || ""}`.toLowerCase().includes(texto)
  );

  const cambiarRol = (usuario, rolId) => {
    if (rolId && rolId !== usuario.rol?.id) parchear(usuario.id, { rolId });
  };

  const cambiarActivo = (usuario) => {
    const accion = usuario.activo ? "desactivar" : "activar";
    if (window.confirm(`¿Seguro que quieres ${accion} a ${usuario.nombre} ${usuario.apellido}?`)) {
      parchear(usuario.id, { activo: !usuario.activo });
    }
  };

  return (
    <div className="admin-section">
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Usuarios</h2>
          <p className="admin-section__subtitle">
            Asigna roles y activa o desactiva cuentas. Un usuario desactivado pierde el acceso de inmediato.
          </p>
        </div>
      </div>

      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder="Buscar por nombre, correo o rol..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="admin-toolbar__count">
          <strong>{filtrados.length}</strong> usuarios
        </div>
      </div>

      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo</th>
                <th>Rol</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length > 0 ? (
                filtrados.map((usuario) => {
                  const esYo = String(usuario.id) === String(user?.id);
                  return (
                    <tr key={usuario.id}>
                      <td>
                        <strong className="admin-table__client-name">
                          {usuario.nombre} {usuario.apellido}
                        </strong>
                        {esYo && <div style={{ fontSize: "0.75rem", color: "#8c726c" }}>(tú)</div>}
                      </td>
                      <td>{usuario.correo}</td>
                      <td>
                        <select
                          className="admin-form-select"
                          value={usuario.rol?.id || ""}
                          disabled={guardando}
                          onChange={(e) => cambiarRol(usuario, e.target.value)}
                          aria-label={`Rol de ${usuario.nombre}`}
                        >
                          {!usuario.rol && <option value="">Sin rol</option>}
                          {roles.map((rol) => (
                            <option key={rol.id} value={rol.id}>
                              {rol.nombre}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <span className={`admin-badge ${usuario.activo ? "admin-badge--success" : "admin-badge--danger"}`}>
                          {usuario.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          disabled={guardando}
                          onClick={() => cambiarActivo(usuario)}
                        >
                          {usuario.activo ? "Desactivar" : "Activar"}
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="5" className="admin-table__empty">
                    No se encontraron usuarios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
