import { useState } from "react";
import { Search, Lock } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { useAuth } from "../../../context/useAuth";
import { useDialogo } from "../../../context/useDialogo";
import { plural } from "../adminFormat";

const etiquetaRol = (rol) => rol?.etiqueta || rol?.nombre || "Sin rol";

// Pantalla mínima: lista de usuarios, cambio de rol y activar/desactivar.
// Las protecciones (último admin, auto-bloqueo) las aplica el backend; aquí se confirman las acciones.
export default function UsersSection() {
  const { items: usuarios, cargando, error, guardando, cargar, parchear } =
    useAdminResource("/v1/admin/usuarios");
  const { items: roles } = useAdminResource("/v1/admin/roles");
  const { user } = useAuth();
  const { confirmar } = useDialogo();
  const [busqueda, setBusqueda] = useState("");

  const texto = busqueda.toLowerCase();
  const filtrados = usuarios.filter((u) =>
    `${u.nombre} ${u.apellido} ${u.correo} ${u.rol?.nombre || ""}`.toLowerCase().includes(texto)
  );

  const nombreCompleto = (usuario) => `${usuario.nombre} ${usuario.apellido}`.trim();

  const resumenUsuario = (usuario, extra) => (
    <>
      <strong>{nombreCompleto(usuario)}</strong>
      <br />
      {usuario.correo}
      {extra}
    </>
  );

  // El <select> es controlado por usuario.rol.id: si se cancela, vuelve solo al rol anterior
  const cambiarRol = async (usuario, rolId) => {
    if (!rolId || rolId === usuario.rol?.id) return;
    const nuevo = roles.find((rol) => rol.id === rolId);
    const { confirmado } = await confirmar({
      titulo: "Cambiar rol",
      mensaje: "¿Estás seguro de que deseas cambiar el rol de este usuario?",
      detalle: resumenUsuario(usuario, (
        <>
          <br />
          <span>{usuario.rol?.nombre || "Sin rol"} → {etiquetaRol(nuevo)}</span>
        </>
      )),
      confirmarTexto: "Confirmar cambio",
      cancelarTexto: "Cancelar",
    });
    if (confirmado) await parchear(usuario.id, { rolId });
  };

  const cambiarActivo = async (usuario) => {
    if (usuario.activo) {
      const { confirmado } = await confirmar({
        titulo: "Desactivar usuario",
        mensaje: "¿Estás seguro de que deseas desactivar esta cuenta?",
        detalle: resumenUsuario(usuario, (
          <>
            <br />
            <small>Perderá el acceso de inmediato. Podrás reactivarla cuando quieras.</small>
          </>
        )),
        confirmarTexto: "Desactivar usuario",
        cancelarTexto: "Cancelar",
        peligroso: true,
      });
      if (!confirmado) return;
    }
    await parchear(usuario.id, { activo: !usuario.activo });
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
        <div className="admin-toolbar__count">{plural(filtrados.length, "usuario")}</div>
      </div>

      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table admin-table--compacta">
            <thead>
              <tr>
                <th>Usuario</th>
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
                        <strong className="admin-table__client-name">{nombreCompleto(usuario)}</strong>
                        {esYo && <span className="admin-users__yo"> (tú)</span>}
                        <div className="admin-users__correo">{usuario.correo}</div>
                      </td>
                      <td>
                        {esYo ? (
                          <span className="admin-badge admin-badge--neutral">{usuario.rol?.nombre || "Sin rol"}</span>
                        ) : (
                          <select
                            className="admin-form-select admin-select-rol"
                            value={usuario.rol?.id || ""}
                            disabled={guardando}
                            onChange={(e) => cambiarRol(usuario, e.target.value)}
                            aria-label={`Rol de ${nombreCompleto(usuario)}`}
                          >
                            {!usuario.rol && <option value="">Sin rol</option>}
                            {roles.map((rol) => (
                              <option key={rol.id} value={rol.id}>
                                {etiquetaRol(rol)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <span className={`admin-badge ${usuario.activo ? "admin-badge--success" : "admin-badge--danger"}`}>
                          {usuario.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td>
                        {esYo ? (
                          <div className="admin-users__propia">
                            <span className="admin-badge admin-badge--neutral">
                              <Lock size={12} aria-hidden="true" /> Tu cuenta
                            </span>
                            <small>No puedes desactivarte ni cambiar tu propio rol.</small>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="admin-button--secondary-sm"
                            disabled={guardando}
                            onClick={() => cambiarActivo(usuario)}
                          >
                            {usuario.activo ? "Desactivar" : "Activar"}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="4" className="admin-table__empty">
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
