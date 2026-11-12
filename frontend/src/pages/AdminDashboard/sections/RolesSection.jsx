import { Fragment, useState } from "react";
import {
  Shield,
  Plus,
  Edit2,
  Trash2,
  Search,
  Users,
  Lock,
  X,
  TriangleAlert,
} from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { useDialogo } from "../../../context/useDialogo";
import { plural } from "../adminFormat";

// Pendiente aprobado tras 1.12: abrir una cuenta exige que el responsable atienda mesas. Un rol con
// «abrir cuenta» pero sin «tomar comandas» (abre a su nombre) ni «transferir» (abre a nombre de un
// mesero) no puede abrir ninguna: el backend responde 400 MESERO_REQUERIDO o 403. Se avisa, sin bloquear.
const abreSinPoder = (permisos = []) =>
  permisos.includes("cuenta:abrir") && !permisos.includes("comanda:tomar") && !permisos.includes("cuenta:transferir");

// Títulos de los grupos de permisos (las claves del backend no llevan tildes)
const TITULO_MODULO = {
  catalogo: "Catálogo",
  pedidos: "Pedidos",
  reservas: "Reservas",
  resenas: "Reseñas",
  configuracion: "Configuración",
  identidad: "Usuarios y roles",
  caja: "Caja",
  inventario: "Inventario",
  reportes: "Reportes",
  salon: "Salón",
  cocina: "Cocina y barra", // 2.1
};
const tituloModulo = (modulo) => TITULO_MODULO[modulo] || modulo.charAt(0).toUpperCase() + modulo.slice(1);

const PERMISOS_VISIBLES = 2;
const MOTIVO_SISTEMA = "Rol de sistema: no se puede eliminar";

export default function RolesSection() {
  const { items: roles, cargando, error, guardando, cargar, crear, actualizar, eliminar } =
    useAdminResource("/v1/admin/roles");
  // Catálogo de permisos (los "reservados" son de fases futuras y aún no se asignan)
  const { items: catalogo } = useAdminResource("/v1/admin/permisos");
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [rolEnEdicion, setRolEnEdicion] = useState(null);
  const { confirmar } = useDialogo();
  // Filas con la lista de permisos desplegada ("+N más")
  const [desplegados, setDesplegados] = useState(() => new Set());
  const alternarDesplegado = (id) =>
    setDesplegados((actual) => {
      const nuevo = new Set(actual);
      if (nuevo.has(id)) nuevo.delete(id);
      else nuevo.add(id);
      return nuevo;
    });

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
          {plural(rolesFiltrados.length, "rol configurado", "roles configurados")}
        </div>
      </div>

      {/* GRID / TABLA DE ROLES */}
      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />
      <p className="admin-roles__nota-sistema">
        <Lock size={14} aria-hidden="true" />
        <span>
          Los roles de sistema (administrador, cliente y los del personal) son necesarios para que la app funcione:
          puedes editar su descripción y permisos (salvo el administrador), pero no eliminarlos.
        </span>
      </p>
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table admin-table--compacta admin-table--acciones-fijas">
            <thead>
              <tr>
                <th>Rol</th>
                <th>Descripción</th>
                <th>Usuarios</th>
                <th>Permisos</th>
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
                          className="admin-product-thumbnail-placeholder admin-roles__icono"
                          style={{
                            background: rol.codigo === "admin" ? "#890620" : "#eedfd9",
                            color: rol.codigo === "admin" ? "#ffffff" : "#2C0703",
                          }}
                        >
                          <Shield size={20} />
                        </div>
                        <div>
                          <strong className="admin-table__client-name">{rol.nombre}</strong>
                          <div className="admin-roles__slug">{rol.codigo}</div>
                          <span className={`admin-badge admin-roles__tipo ${rol.esSistema ? "admin-badge--warning" : "admin-badge--neutral"}`}>
                            {rol.esSistema ? "Sistema" : "Personalizado"}
                          </span>
                          {/* En la columna del rol: la de permisos queda bajo el bloque fijo de acciones en pantallas medianas */}
                          {abreSinPoder(rol.permisos) && (
                            <span className="admin-roles__aviso-fila">
                              <TriangleAlert size={14} aria-hidden="true" />
                              Sin «tomar comandas» ni «transferir»: no podrá abrir cuentas
                            </span>
                          )}
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
                    <td className="admin-roles__celda-permisos">
                      <div className="admin-roles__permisos" id={`permisos-${rol.id}`}>
                        {rol.permisos && rol.permisos.length > 0 ? (
                          (desplegados.has(rol.id) ? rol.permisos : rol.permisos.slice(0, PERMISOS_VISIBLES)).map((p) => (
                            <span key={p} className="admin-badge admin-badge--info admin-roles__permiso">
                              {etiquetaPermiso(p)}
                            </span>
                          ))
                        ) : (
                          <span className="admin-roles__sin-permisos">Sin permisos</span>
                        )}
                        {rol.permisos && rol.permisos.length > PERMISOS_VISIBLES && (
                          <button
                            type="button"
                            className="admin-roles__mas"
                            aria-expanded={desplegados.has(rol.id)}
                            aria-controls={`permisos-${rol.id}`}
                            onClick={() => alternarDesplegado(rol.id)}
                          >
                            {desplegados.has(rol.id) ? "Ver menos" : `+${rol.permisos.length - PERMISOS_VISIBLES} más`}
                          </button>
                        )}
                      </div>
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
                          <button
                            type="button"
                            className="admin-roles__candado"
                            disabled
                            aria-label={MOTIVO_SISTEMA}
                            title={MOTIVO_SISTEMA}
                          >
                            <Lock size={16} aria-hidden="true" />
                          </button>
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
                  <td colSpan="5" className="admin-table__empty">
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
                    <p className="admin-roles__nota">
                      Este rol no puede tener permisos de staff. Solo se editan el nombre y la descripción.
                    </p>
                  ) : (
                    modulos.map((modulo) => (
                      <Fragment key={modulo}>
                      <fieldset className="admin-permisos__grupo">
                        <legend>{tituloModulo(modulo)}</legend>
                        {catalogo
                          .filter((p) => p.modulo === modulo)
                          .map((permiso) => (
                            <label
                              key={permiso.clave}
                              className={`admin-checkbox-label admin-permiso ${permiso.reservado ? "admin-permiso--proximo" : ""}`}
                              title={permiso.reservado ? "Disponible en próximas fases" : undefined}
                            >
                              <input
                                type="checkbox"
                                disabled={permiso.reservado}
                                checked={formData.permisos.includes(permiso.clave)}
                                onChange={() => alternarPermiso(permiso.clave)}
                              />
                              <span className="admin-permiso__texto">{permiso.descripcion}</span>
                              {permiso.reservado && <span className="admin-permiso__proximamente">Próximamente</span>}
                            </label>
                          ))}
                      </fieldset>
                      {/* Junto al grupo «Salón», donde se marca la casilla */}
                      {modulo === "salon" && abreSinPoder(formData.permisos) && (
                        <p className="admin-roles__aviso" role="status">
                          <TriangleAlert size={18} aria-hidden="true" />
                          <span>
                            Este rol tiene «{etiquetaPermiso("cuenta:abrir")}», pero no podrá abrir ninguna cuenta: le falta
                            «{etiquetaPermiso("comanda:tomar")}» o «{etiquetaPermiso("cuenta:transferir")}» (para abrirla a su
                            nombre o a nombre de un mesero).
                          </span>
                        </p>
                      )}
                      </Fragment>
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
