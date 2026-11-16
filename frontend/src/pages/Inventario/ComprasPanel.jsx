import { useCallback, useEffect, useState } from "react";
import { Ban, Edit2, PackageCheck, Plus, Trash2, X } from "lucide-react";
import AdminStatus from "../AdminDashboard/components/AdminStatus";
import { api, apiRequest } from "../../services/api";
import { useDialogo } from "../../context/useDialogo";
import { formatearCOP } from "../../utils/moneda";
import { formatearFecha } from "../../utils/fechas";
import { formatearCantidad, formatearCosto, leerNumero, nuevaClave } from "./inventarioFormato";

const ESTADOS = {
  abierta: { texto: "Abierta", clase: "admin-badge--info" },
  parcial: { texto: "Recibida en parte", clase: "admin-badge--warning" },
  recibida: { texto: "Recibida", clase: "admin-badge--success" },
  cancelada: { texto: "Cancelada", clase: "admin-badge--neutral" },
};
const PROVEEDOR_VACIO = { nombre: "", nit: "", contacto: "", telefono: "", correo: "", notas: "", activo: true };

/** Fase 5 · 5.4 (F5-5) · Proveedores, órdenes de compra y recepción (suma stock y recalcula el costo promedio). */
export default function ComprasPanel({ puedeGestionar, puedeRecibir }) {
  const { avisar } = useDialogo();
  const [ordenes, setOrdenes] = useState([]);
  const [proveedores, setProveedores] = useState([]);
  const [insumos, setInsumos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [proveedor, setProveedor] = useState(null); // formulario de proveedor
  const [nuevaOrden, setNuevaOrden] = useState(null);
  const [recepcion, setRecepcion] = useState(null);
  const [cancelacion, setCancelacion] = useState(null);

  const leer = useCallback(() => Promise.all([
    api.get("/v1/inventario/ordenes"), api.get("/v1/inventario/proveedores"), api.get("/v1/inventario/insumos"),
  ]), []);
  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const [o, p, i] = await leer();
      setOrdenes(o);
      setProveedores(p);
      setInsumos(i.filter((x) => x.activo));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [leer]);
  useEffect(() => {
    let activo = true;
    leer()
      .then(([o, p, i]) => {
        if (!activo) return;
        setOrdenes(o);
        setProveedores(p);
        setInsumos(i.filter((x) => x.activo));
      })
      .catch((e) => activo && setError(e.message))
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, [leer]);

  const ejecutar = async (accion, titulo) => {
    setGuardando(true);
    try {
      await accion();
      await cargar();
      return true;
    } catch (e) {
      await avisar({ tipo: "error", titulo, mensaje: e.message });
      return false;
    } finally {
      setGuardando(false);
    }
  };

  const guardarProveedor = async (e) => {
    e.preventDefault();
    const { id, version, ...campos } = proveedor;
    const datos = Object.fromEntries(Object.entries(campos).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
    const ok = await ejecutar(() => (id
      ? api.put(`/v1/inventario/proveedores/${id}`, { ...datos, versionEsperada: version })
      : api.post("/v1/inventario/proveedores", { ...datos, activo: undefined })), "No se pudo guardar el proveedor");
    if (ok) setProveedor(null);
  };

  const guardarOrden = async (e) => {
    e.preventDefault();
    const lineas = nuevaOrden.lineas.filter((l) => l.insumoId).map((l) => ({ insumoId: l.insumoId, cantidad: leerNumero(l.cantidad), costoUnitario: leerNumero(l.costoUnitario) }));
    if (!nuevaOrden.proveedorId || !lineas.length || lineas.some((l) => !(l.cantidad > 0) || !(l.costoUnitario >= 0))) {
      setNuevaOrden((o) => ({ ...o, error: "Elige el proveedor y, en cada línea, el insumo, la cantidad y el costo por unidad." }));
      return;
    }
    const ok = await ejecutar(() => apiRequest("/v1/inventario/ordenes", {
      method: "POST",
      body: JSON.stringify({ proveedorId: nuevaOrden.proveedorId, lineas, notas: nuevaOrden.notas.trim() }),
      headers: { "Idempotency-Key": nuevaOrden.clave },
    }), "No se pudo crear la orden");
    if (ok) setNuevaOrden(null);
  };

  const abrirRecepcion = (orden) => setRecepcion({
    orden, error: "",
    lineas: orden.lineas.filter((l) => l.pendiente > 0).map((l) => ({ ...l, cantidad: String(l.pendiente), costo: String(l.costoUnitario), vencimiento: "" })),
  });
  const guardarRecepcion = async (e) => {
    e.preventDefault();
    const lineas = recepcion.lineas
      .map((l) => ({ lineaId: l.id, cantidad: leerNumero(l.cantidad), costoUnitario: leerNumero(l.costo), vencimiento: l.vencimiento || null }))
      .filter((l) => l.cantidad);
    if (!lineas.length || lineas.some((l) => !(l.cantidad > 0) || !(l.costoUnitario >= 0))) {
      setRecepcion((r) => ({ ...r, error: "Indica cuánto llegó (mayor que 0) y su costo." }));
      return;
    }
    // La versión de la orden evita registrar dos veces la misma entrega (un reintento recibe 409 ORDEN_CAMBIADA)
    const ok = await ejecutar(() => api.post(`/v1/inventario/ordenes/${recepcion.orden.id}/recepciones`, { versionEsperada: recepcion.orden.version, lineas }), "No se pudo registrar la recepción");
    if (ok) setRecepcion(null);
  };

  const confirmarCancelacion = async (e) => {
    e.preventDefault();
    const ok = await ejecutar(() => api.post(`/v1/inventario/ordenes/${cancelacion.orden.id}/cancelar`, { motivo: cancelacion.motivo.trim(), versionEsperada: cancelacion.orden.version }), "No se pudo cancelar la orden");
    if (ok) setCancelacion(null);
  };

  const unidadDe = (id) => insumos.find((i) => i.id === id)?.unidad || "";

  return (
    <div className="inventario-panel">
      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />

      <div className="inventario-encabezado">
        <h3 className="inventario-subtitulo">Órdenes de compra</h3>
        {puedeGestionar && (
          <button type="button" className="admin-button--primary" disabled={!proveedores.some((p) => p.activo)}
            onClick={() => setNuevaOrden({ proveedorId: "", notas: "", error: "", clave: nuevaClave(), lineas: [{ insumoId: "", cantidad: "", costoUnitario: "" }] })}>
            <Plus size={18} aria-hidden="true" />
            <span>Nueva orden</span>
          </button>
        )}
      </div>
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table inventario-tabla-compacta" aria-label="Órdenes de compra">
            <thead><tr><th>Orden</th><th>Insumos</th><th>Total</th><th>Acciones</th></tr></thead>
            <tbody>
              {ordenes.map((o) => (
                <tr key={o.id}>
                  <td className="inventario-nombre">
                    <strong className="admin-table__client-name">{o.codigo}</strong>
                    <small className="inventario-minimo">{o.proveedor.nombre} · {formatearFecha(o.creadaEn)}</small>
                    <span className="inventario-insignias">
                      <span className={`admin-badge ${ESTADOS[o.estado].clase}`}>{ESTADOS[o.estado].texto}</span>
                    </span>
                    {o.motivoCancelacion && <small className="inventario-minimo">Motivo: {o.motivoCancelacion}</small>}
                  </td>
                  <td className="inventario-receta">
                    {o.lineas.map((l) => `${l.insumo}: ${formatearCantidad(l.recibido, l.unidad)} de ${formatearCantidad(l.cantidad, l.unidad)}`).join(" · ")}
                  </td>
                  <td className="inventario-num">{formatearCOP(o.total)}</td>
                  <td>
                    <div className="admin-table__actions-row">
                      {puedeRecibir && ["abierta", "parcial"].includes(o.estado) && (
                        <button type="button" className="admin-button--secondary-sm inventario-icono" onClick={() => abrirRecepcion(o)} aria-label={`Recibir ${o.codigo}`} title="Recibir">
                          <PackageCheck size={16} aria-hidden="true" />
                        </button>
                      )}
                      {puedeGestionar && ["abierta", "parcial"].includes(o.estado) && (
                        <button type="button" className="admin-button--icon-danger inventario-icono" title="Cancelar orden" aria-label={`Cancelar ${o.codigo}`}
                          onClick={() => setCancelacion({ orden: o, motivo: "" })}>
                          <Ban size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!cargando && ordenes.length === 0 && <tr><td colSpan="4" className="admin-table__empty">Aún no hay órdenes de compra.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="inventario-encabezado">
        <h3 className="inventario-subtitulo">Proveedores</h3>
        {puedeGestionar && (
          <button type="button" className="admin-button--secondary-sm" onClick={() => setProveedor({ ...PROVEEDOR_VACIO })}>
            <Plus size={14} aria-hidden="true" />
            <span>Nuevo proveedor</span>
          </button>
        )}
      </div>
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table inventario-tabla-compacta" aria-label="Proveedores">
            <thead><tr><th>Proveedor</th><th>Contacto</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {proveedores.map((p) => (
                <tr key={p.id}>
                  <td className="inventario-nombre">
                    <strong className="admin-table__client-name">{p.nombre}</strong>
                    {p.nit && <small className="inventario-minimo">NIT {p.nit}</small>}
                  </td>
                  <td className="inventario-receta">{[p.contacto, p.telefono, p.correo].filter(Boolean).join(" · ") || "—"}</td>
                  <td><span className={`admin-badge ${p.activo ? "admin-badge--success" : "admin-badge--neutral"}`}>{p.activo ? "Activo" : "Inactivo"}</span></td>
                  <td>
                    {puedeGestionar && (
                      <button type="button" className="admin-button--secondary-sm inventario-icono" title="Editar" aria-label={`Editar ${p.nombre}`} onClick={() => setProveedor({ ...p })}>
                        <Edit2 size={16} aria-hidden="true" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!cargando && proveedores.length === 0 && <tr><td colSpan="4" className="admin-table__empty">Aún no hay proveedores.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {proveedor && (
        <div className="admin-modal-overlay" onClick={() => setProveedor(null)}>
          <div className="admin-modal-container admin-modal-container--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="proveedor-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="proveedor-titulo">{proveedor.id ? `Editar ${proveedor.nombre}` : "Nuevo proveedor"}</h3>
              <button type="button" className="admin-modal-close" onClick={() => setProveedor(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <form onSubmit={guardarProveedor}>
              <div className="admin-modal-body">
                {[["nombre", "Nombre *", 80], ["nit", "NIT", 20], ["contacto", "Persona de contacto", 80], ["telefono", "Teléfono", 30], ["correo", "Correo", 120], ["notas", "Notas", 300]].map(([campo, etiqueta, max]) => (
                  <div className="admin-form-group" key={campo}>
                    <label className="admin-form-label" htmlFor={`proveedor-${campo}`}>{etiqueta}</label>
                    <input id={`proveedor-${campo}`} className="admin-form-input" maxLength={max} required={campo === "nombre"} type={campo === "correo" ? "email" : "text"}
                      value={proveedor[campo] || ""} onChange={(e) => setProveedor({ ...proveedor, [campo]: e.target.value })} />
                  </div>
                ))}
                {proveedor.id && (
                  <label className="admin-checkbox-label">
                    <input type="checkbox" checked={proveedor.activo} onChange={(e) => setProveedor({ ...proveedor, activo: e.target.checked })} />
                    <span>Proveedor activo</span>
                  </label>
                )}
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button--modal-cancel" onClick={() => setProveedor(null)}>Cancelar</button>
                <button type="submit" className="admin-button--primary" disabled={guardando}>Guardar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {nuevaOrden && (
        <div className="admin-modal-overlay" onClick={() => setNuevaOrden(null)}>
          <div className="admin-modal-container inventario-modal-ancho" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="orden-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="orden-titulo">Nueva orden de compra</h3>
              <button type="button" className="admin-modal-close" onClick={() => setNuevaOrden(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <form onSubmit={guardarOrden}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="orden-proveedor">Proveedor *</label>
                  <select id="orden-proveedor" className="admin-form-select" value={nuevaOrden.proveedorId} onChange={(e) => setNuevaOrden({ ...nuevaOrden, proveedorId: e.target.value })}>
                    <option value="">Elige un proveedor</option>
                    {proveedores.filter((p) => p.activo).map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                {nuevaOrden.lineas.map((l, i) => (
                  <fieldset key={i} className="inventario-linea">
                    <legend className="inventario-oculto">Insumo {i + 1}</legend>
                    <label>
                      <span>Insumo</span>
                      <select className="admin-form-select" value={l.insumoId}
                        onChange={(e) => setNuevaOrden((o) => ({ ...o, lineas: o.lineas.map((x, j) => (j === i ? { ...x, insumoId: e.target.value } : x)) }))}>
                        <option value="">Elige un insumo</option>
                        {insumos.map((ins) => <option key={ins.id} value={ins.id}>{ins.nombre} ({ins.unidad})</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Cantidad{l.insumoId ? ` (${unidadDe(l.insumoId)})` : ""}</span>
                      <input className="admin-form-input" inputMode="decimal" value={l.cantidad}
                        onChange={(e) => setNuevaOrden((o) => ({ ...o, lineas: o.lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)) }))} />
                    </label>
                    <label>
                      <span>Costo por {l.insumoId ? unidadDe(l.insumoId) : "unidad"} (COP)</span>
                      <input className="admin-form-input" inputMode="decimal" value={l.costoUnitario}
                        onChange={(e) => setNuevaOrden((o) => ({ ...o, lineas: o.lineas.map((x, j) => (j === i ? { ...x, costoUnitario: e.target.value } : x)) }))} />
                    </label>
                    <button type="button" className="admin-button--icon-danger inventario-icono inventario-quitar" aria-label={`Quitar el insumo ${i + 1}`}
                      onClick={() => setNuevaOrden((o) => ({ ...o, lineas: o.lineas.filter((_, j) => j !== i) }))}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </fieldset>
                ))}
                <button type="button" className="admin-button--secondary-sm" onClick={() => setNuevaOrden((o) => ({ ...o, lineas: [...o.lineas, { insumoId: "", cantidad: "", costoUnitario: "" }] }))}>
                  <Plus size={14} aria-hidden="true" />
                  <span>Agregar insumo</span>
                </button>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="orden-notas">Notas</label>
                  <input id="orden-notas" className="admin-form-input" maxLength={300} value={nuevaOrden.notas} onChange={(e) => setNuevaOrden({ ...nuevaOrden, notas: e.target.value })} />
                </div>
                {nuevaOrden.error && <p className="admin-alert-error" role="alert">{nuevaOrden.error}</p>}
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button--modal-cancel" onClick={() => setNuevaOrden(null)}>Cancelar</button>
                <button type="submit" className="admin-button--primary" disabled={guardando}>Crear orden</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {recepcion && (
        <div className="admin-modal-overlay" onClick={() => setRecepcion(null)}>
          <div className="admin-modal-container inventario-modal-ancho" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="recepcion-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="recepcion-titulo">Recibir {recepcion.orden.codigo}</h3>
              <button type="button" className="admin-modal-close" onClick={() => setRecepcion(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <form onSubmit={guardarRecepcion}>
              <div className="admin-modal-body">
                <p className="inventario-ayuda">Lo que llegó suma a la existencia y recalcula el costo promedio. Si algo no llegó, déjalo en 0: la orden queda «Recibida en parte». La fecha de vencimiento es opcional.</p>
                {recepcion.lineas.map((l, i) => (
                  <fieldset key={l.id} className="inventario-linea">
                    <legend className="inventario-linea-titulo">{l.insumo} · pendiente {formatearCantidad(l.pendiente, l.unidad)} · pactado {formatearCosto(l.costoUnitario, l.unidad)}</legend>
                    <label>
                      <span>Llegó ({l.unidad})</span>
                      <input className="admin-form-input" inputMode="decimal" value={l.cantidad}
                        onChange={(e) => setRecepcion((r) => ({ ...r, lineas: r.lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)) }))} />
                    </label>
                    <label>
                      <span>Costo por {l.unidad} (COP)</span>
                      <input className="admin-form-input" inputMode="decimal" value={l.costo}
                        onChange={(e) => setRecepcion((r) => ({ ...r, lineas: r.lineas.map((x, j) => (j === i ? { ...x, costo: e.target.value } : x)) }))} />
                    </label>
                    <label>
                      <span>Vence</span>
                      <input className="admin-form-input" type="date" value={l.vencimiento}
                        onChange={(e) => setRecepcion((r) => ({ ...r, lineas: r.lineas.map((x, j) => (j === i ? { ...x, vencimiento: e.target.value } : x)) }))} />
                    </label>
                  </fieldset>
                ))}
                {recepcion.error && <p className="admin-alert-error" role="alert">{recepcion.error}</p>}
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button--modal-cancel" onClick={() => setRecepcion(null)}>Cancelar</button>
                <button type="submit" className="admin-button--primary" disabled={guardando}>Registrar recepción</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {cancelacion && (
        <div className="admin-modal-overlay" onClick={() => setCancelacion(null)}>
          <div className="admin-modal-container admin-modal-container--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="cancelar-orden-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="cancelar-orden-titulo">¿Cancelar {cancelacion.orden.codigo}?</h3>
            </div>
            <form onSubmit={confirmarCancelacion}>
              <div className="admin-modal-body">
                <p className="inventario-ayuda">Lo ya recibido se queda en el inventario; lo pendiente ya no se espera.</p>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="cancelar-motivo">Motivo *</label>
                  <input id="cancelar-motivo" className="admin-form-input" required minLength={3} maxLength={300} value={cancelacion.motivo}
                    onChange={(e) => setCancelacion({ ...cancelacion, motivo: e.target.value })} />
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button--modal-cancel" onClick={() => setCancelacion(null)}>Volver</button>
                <button type="submit" className="admin-button--danger" disabled={guardando}>Cancelar orden</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
