import { useId, useState } from "react";
import { Search, Lock, UserPlus, X } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { useAuth } from "../../../context/useAuth";
import { apiRequest } from "../../../services/api";
import { useDialogo } from "../../../context/useDialogo";
import { plural } from "../adminFormat";

const etiquetaRol = (rol) => rol?.etiqueta || rol?.nombre || "Sin rol";

const NUEVO_USUARIO = { nombre: "", apellido: "", correo: "", telefono: "", rolId: "" };

const SIN_SERVIDOR_CORREO = "No hay servidor de correo configurado: el enlace quedó en el registro (log) del backend.";

// 1.5b · Mensaje tras crear según cómo sale el enlace (lo decide el backend con su configuración SMTP)
const MENSAJE_ENTREGA = {
  correo: (correo) => `Enviamos a ${correo} el enlace «Crea tu contraseña». Vence en 24 horas y sirve una sola vez.`,
  // Revisión de 1.6 · Texto acordado con Brayan (cómo configurar el correo: backend/README.md › Configurar el correo (SMTP))
  registro_desarrollo: () => `${SIN_SERVIDOR_CORREO} Vence en 24 horas y sirve una sola vez.`,
  sin_smtp: () => "La cuenta se creó, pero el correo del sistema no está configurado: el enlace «Crea tu contraseña» no se envió. Cuando se configure, la persona puede pedir un enlace nuevo con «¿Olvidaste tu contraseña?».",
};

// Ajuste tras 1.5b · Aviso tras reenviar el enlace, según cómo salió
const MENSAJE_REENVIO = {
  correo: (correo) => `Enviamos a ${correo} un enlace nuevo «Crea tu contraseña». Vence en 24 horas; el anterior ya no sirve.`,
  registro_desarrollo: () => `${SIN_SERVIDOR_CORREO} Vence en 24 horas; el anterior ya no sirve.`,
  sin_smtp: () => "Se generó un enlace nuevo, pero el correo del sistema no está configurado: no se envió. El anterior ya no sirve.",
};

/** Formulario de alta (1.5b): sin contraseña; la persona la crea con el enlace. */
function FormularioCrear({ roles, guardando, onCrear, onCerrar }) {
  const id = useId();
  const [datos, setDatos] = useState(NUEVO_USUARIO);
  const campo = (nombre) => ({
    id: `${id}-${nombre}`,
    value: datos[nombre],
    onChange: (e) => setDatos((d) => ({ ...d, [nombre]: e.target.value })),
  });
  const enviar = (e) => {
    e.preventDefault();
    const { telefono, ...resto } = datos;
    const limpio = Object.fromEntries(Object.entries(resto).map(([k, v]) => [k, v.trim()]));
    onCrear(telefono.trim() ? { ...limpio, telefono: telefono.trim() } : limpio);
  };

  return (
    <div className="admin-modal-overlay" onClick={onCerrar}>
      <div className="admin-modal-container admin-modal-container--sm" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`}>
        <div className="admin-modal-header">
          <h3 className="admin-modal-title" id={`${id}-titulo`}>Crear usuario</h3>
          <button type="button" className="admin-modal-close" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={enviar}>
          <div className="admin-modal-body">
            <p className="admin-users__ayuda">
              No escribes la contraseña: le enviaremos un enlace para crear su contraseña (vence en 24 horas).
            </p>
            <div className="admin-modal-grid admin-users__fila">
            <div className="admin-form-group">
              <label htmlFor={`${id}-nombre`} className="admin-form-label">Nombre *</label>
              <input className="admin-form-input" required maxLength={60} autoComplete="off" {...campo("nombre")} />
            </div>
            <div className="admin-form-group">
              <label htmlFor={`${id}-apellido`} className="admin-form-label">Apellido *</label>
              <input className="admin-form-input" required maxLength={60} autoComplete="off" {...campo("apellido")} />
            </div>
            </div>
            <div className="admin-modal-grid admin-users__fila">
            <div className="admin-form-group">
              <label htmlFor={`${id}-correo`} className="admin-form-label">Correo *</label>
              <input className="admin-form-input" type="email" required maxLength={254} autoComplete="off" {...campo("correo")} />
            </div>
            <div className="admin-form-group">
              <label htmlFor={`${id}-telefono`} className="admin-form-label">Teléfono (opcional)</label>
              <input className="admin-form-input" type="tel" maxLength={30} autoComplete="off" {...campo("telefono")} />
            </div>
            </div>
            <div className="admin-form-group">
              <label htmlFor={`${id}-rolId`} className="admin-form-label">Rol *</label>
              <select className="admin-form-select" required {...campo("rolId")}>
                <option value="">Elige un rol</option>
                {roles.map((rol) => <option key={rol.id} value={rol.id}>{etiquetaRol(rol)}</option>)}
              </select>
            </div>
          </div>
          <div className="admin-modal-actions">
            <button type="button" className="admin-button--secondary-sm" onClick={onCerrar}>Cancelar</button>
            <button type="submit" className="admin-button--primary" disabled={guardando}>Crear usuario</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Pantalla mínima: lista de usuarios, alta de cuentas (1.5b), cambio de rol y activar/desactivar.
// Las protecciones (último admin, auto-bloqueo) las aplica el backend; aquí se confirman las acciones.
export default function UsersSection() {
  const { items: usuarios, setItems, cargando, error, guardando, cargar, parchear, crear } =
    useAdminResource("/v1/admin/usuarios");
  const { items: roles } = useAdminResource("/v1/admin/roles");
  const { user } = useAuth();
  const { confirmar, avisar } = useDialogo();
  const [busqueda, setBusqueda] = useState("");
  const [creando, setCreando] = useState(false);
  const [reenviando, setReenviando] = useState("");

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

  const crearUsuario = async (datos) => {
    const rol = roles.find((r) => r.id === datos.rolId);
    const { confirmado } = await confirmar({
      titulo: "Crear la cuenta",
      mensaje: "¿Crear esta cuenta? Le enviaremos un enlace para que cree su contraseña.",
      detalle: (
        <>
          <strong>{`${datos.nombre} ${datos.apellido}`}</strong>
          <br />
          {datos.correo}
          <br />
          <span>Rol: {etiquetaRol(rol)}</span>
        </>
      ),
      confirmarTexto: "Crear cuenta",
      cancelarTexto: "Cancelar",
    });
    if (!confirmado) return;
    const nuevo = await crear(datos);
    if (!nuevo) return; // el error ya se mostró (p. ej. 409 correo registrado)
    setCreando(false);
    await avisar({ titulo: "Cuenta creada", mensaje: (MENSAJE_ENTREGA[nuevo.entrega] || MENSAJE_ENTREGA.correo)(nuevo.correo) });
  };

  const reenviarEnlace = async (usuario) => {
    const { confirmado } = await confirmar({
      titulo: "Reenviar enlace",
      mensaje: "¿Enviar un enlace nuevo para crear la contraseña? El enlace anterior deja de servir.",
      detalle: resumenUsuario(usuario),
      confirmarTexto: "Reenviar",
      cancelarTexto: "Cancelar",
    });
    if (!confirmado) return;
    setReenviando(usuario.id);
    try {
      // Una clave por confirmación: un reintento de red no envía otro correo
      const clave = globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      const actualizado = await apiRequest(`/v1/admin/usuarios/${usuario.id}/reenviar-enlace`, {
        method: "POST", body: JSON.stringify({}), headers: { "Idempotency-Key": clave },
      });
      setItems((lista) => lista.map((u) => (u.id === usuario.id ? { ...u, ...actualizado } : u)));
      await avisar({ titulo: "Enlace reenviado", mensaje: (MENSAJE_REENVIO[actualizado.entrega] || MENSAJE_REENVIO.correo)(usuario.correo) });
    } catch (e) {
      if (e.status === 409) cargar(); // p. ej. ya creó su contraseña: la lista se refresca ya, sin esperar al aviso
      await avisar({ tipo: "error", titulo: "No se pudo reenviar el enlace", mensaje: e.message });
    } finally {
      setReenviando("");
    }
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
            Crea cuentas, asigna roles y activa o desactiva cuentas. Un usuario desactivado pierde el acceso de inmediato.
          </p>
        </div>
        <button type="button" className="admin-button--primary" onClick={() => setCreando(true)}>
          <UserPlus size={18} aria-hidden="true" />
          Crear usuario
        </button>
      </div>

      {creando && (
        <FormularioCrear roles={roles} guardando={guardando} onCrear={crearUsuario} onCerrar={() => setCreando(false)} />
      )}

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
          <table className="admin-table admin-table--compacta admin-table--acciones-fijas">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Rol</th>
                <th className="admin-col-estado">Estado</th>
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
                      <td className="admin-col-estado">
                        <span className={`admin-badge ${usuario.activo ? "admin-badge--success" : "admin-badge--danger"}`}>
                          {usuario.activo ? "Activo" : "Inactivo"}
                        </span>
                        {usuario.accesoPendiente && (
                          <div className="admin-users__pendiente">Sin contraseña aún</div>
                        )}
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
                          <div className="admin-users__acciones">
                            {usuario.accesoPendiente && usuario.activo && (
                              <button
                                type="button"
                                className="admin-button--secondary-sm"
                                disabled={guardando || reenviando === usuario.id}
                                onClick={() => reenviarEnlace(usuario)}
                              >
                                Reenviar enlace
                              </button>
                            )}
                            <button
                              type="button"
                              className="admin-button--secondary-sm"
                              disabled={guardando}
                              onClick={() => cambiarActivo(usuario)}
                            >
                              {usuario.activo ? "Desactivar" : "Activar"}
                            </button>
                          </div>
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
