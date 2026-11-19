import { useState } from "react";
import { Plus, Edit2, Search, X, History, SlidersHorizontal } from "lucide-react";
import useAdminResource from "../AdminDashboard/hooks/useAdminResource";
import AdminStatus from "../AdminDashboard/components/AdminStatus";
import { api, apiRequest } from "../../services/api";
import { useDialogo } from "../../context/useDialogo";
import { formatearCOP } from "../../utils/moneda";
import { formatearFecha, formatearHora } from "../../utils/fechas";
import { UNIDADES, NIVELES, TIPOS_MOVIMIENTO, formatearCantidad, formatearCosto, leerNumero, nuevaClave } from "./inventarioFormato";

const VACIO = { nombre: "", unidad: "g", minimo: "", costoPromedio: "", existenciaInicial: "", activo: true };

/** Fase 5 · 5.1 · Insumos: existencias frente al mínimo, costo promedio y kárdex de cada uno. */
export default function InsumosPanel({ puedeGestionar, puedeAjustar = false }) {
  const { items: insumos, cargando, error, guardando, cargar, crear, actualizar } = useAdminResource("/v1/inventario/insumos");
  const [busqueda, setBusqueda] = useState("");
  const [enEdicion, setEnEdicion] = useState(null); // null = cerrado; {} = nuevo; insumo = editar
  const [form, setForm] = useState(VACIO);
  const [errorForm, setErrorForm] = useState("");
  const [kardex, setKardex] = useState(null);
  // 5.3 (F5-4) · Ajuste, merma o vencimiento con motivo obligatorio
  const [ajuste, setAjuste] = useState(null);
  const [enviandoAjuste, setEnviandoAjuste] = useState(false);
  const { avisar } = useDialogo();

  const registrarAjuste = async (e) => {
    e.preventDefault();
    const valor = leerNumero(ajuste.cantidad);
    if (!Number.isFinite(valor) || valor <= 0) {
      setAjuste({ ...ajuste, error: "Escribe una cantidad mayor que 0." });
      return;
    }
    const cantidad = ajuste.tipo === "ajuste" && ajuste.sentido === "sale" ? -valor : valor;
    setEnviandoAjuste(true);
    try {
      await apiRequest("/v1/inventario/movimientos", {
        method: "POST",
        body: JSON.stringify({ insumoId: ajuste.insumo.id, tipo: ajuste.tipo, cantidad, motivo: ajuste.motivo.trim() }),
        headers: { "Idempotency-Key": ajuste.clave },
      });
      setAjuste(null);
      await cargar();
    } catch (err) {
      await avisar({ tipo: "error", titulo: "No se pudo registrar el movimiento", mensaje: err.message });
    } finally {
      setEnviandoAjuste(false);
    }
  };

  const abrirNuevo = () => {
    setForm(VACIO);
    setErrorForm("");
    setEnEdicion({});
  };
  const abrirEditar = (insumo) => {
    setForm({ nombre: insumo.nombre, unidad: insumo.unidad, minimo: String(insumo.minimo), costoPromedio: String(insumo.costoPromedio), existenciaInicial: "", activo: insumo.activo });
    setErrorForm("");
    setEnEdicion(insumo);
  };

  const guardar = async (e) => {
    e.preventDefault();
    const minimo = leerNumero(form.minimo);
    const costoPromedio = leerNumero(form.costoPromedio);
    const existenciaInicial = leerNumero(form.existenciaInicial);
    if ([minimo, costoPromedio, existenciaInicial].some((v) => v !== null && (!Number.isFinite(v) || v < 0))) {
      setErrorForm("Revisa los números: deben ser 0 o más (usa coma o punto para los decimales).");
      return;
    }
    const datos = { nombre: form.nombre.trim(), unidad: form.unidad };
    if (minimo !== null) datos.minimo = minimo;
    if (costoPromedio !== null) datos.costoPromedio = costoPromedio;
    const nuevo = !enEdicion.id;
    const guardado = nuevo
      ? await crear({ ...datos, ...(existenciaInicial ? { existenciaInicial } : {}) })
      : await actualizar(enEdicion.id, { ...datos, activo: form.activo, versionEsperada: enEdicion.version });
    if (guardado) setEnEdicion(null);
  };

  const verKardex = async (insumo) => {
    setKardex({ insumo, movimientos: null, error: "" });
    try {
      const datos = await api.get(`/v1/inventario/insumos/${insumo.id}/movimientos`);
      setKardex({ insumo: datos.insumo, movimientos: datos.movimientos, error: "" });
    } catch (e) {
      setKardex({ insumo, movimientos: [], error: e.message });
    }
  };

  const texto = busqueda.trim().toLowerCase();
  const filtrados = insumos.filter((i) => i.nombre.toLowerCase().includes(texto));
  const valorTotal = insumos.filter((i) => i.activo).reduce((t, i) => t + i.valor, 0);

  return (
    <div className="inventario-panel">
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" aria-hidden="true" />
          <input type="search" className="admin-input-search" placeholder="Buscar insumo..." aria-label="Buscar insumo"
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="admin-toolbar__count">
          <strong>{insumos.length}</strong> insumos · valor {formatearCOP(valorTotal)}
        </div>
        {puedeGestionar && (
          <button type="button" className="admin-button--primary" onClick={abrirNuevo}>
            <Plus size={18} aria-hidden="true" />
            <span>Nuevo insumo</span>
          </button>
        )}
      </div>

      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table inventario-tabla-compacta" aria-label="Insumos del inventario">
            <thead>
              <tr>
                <th>Insumo</th>
                <th>Existencia</th>
                <th>Costo promedio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((i) => (
                <tr key={i.id} className={i.activo ? "" : "inventario-fila--inactiva"}>
                  <td className="inventario-nombre">
                    <strong className="admin-table__client-name">{i.nombre}</strong>
                    <span className="inventario-insignias">
                      <span className={`admin-badge ${NIVELES[i.nivel].clase}`}>{NIVELES[i.nivel].texto}</span>
                      {!i.activo && <span className="admin-badge admin-badge--neutral">Inactivo</span>}
                    </span>
                  </td>
                  <td className={`inventario-num${i.existencia < 0 ? " inventario-num--negativa" : ""}`}>
                    {formatearCantidad(i.existencia, i.unidad)}
                    <small className="inventario-minimo">mín. {formatearCantidad(i.minimo, i.unidad)}</small>
                    {i.existencia < 0 && <small className="inventario-aviso-negativo">Revisa el conteo: se descontó más de lo registrado.</small>}
                  </td>
                  <td className="inventario-num">
                    {formatearCosto(i.costoPromedio, i.unidad)}
                    <small className="inventario-minimo">valor {formatearCOP(i.valor)}</small>
                  </td>
                  <td>
                    <div className="admin-table__actions-row">
                      <button type="button" className="admin-button--secondary-sm inventario-icono" onClick={() => verKardex(i)} aria-label={`Movimientos de ${i.nombre}`} title="Movimientos">
                        <History size={16} aria-hidden="true" />
                      </button>
                      {puedeAjustar && (
                        <button type="button" className="admin-button--secondary-sm inventario-icono" title="Ajuste, merma o vencimiento" aria-label={`Ajustar existencia de ${i.nombre}`}
                          onClick={() => setAjuste({ insumo: i, tipo: "ajuste", sentido: "entra", cantidad: "", motivo: "", error: "", clave: nuevaClave() })}>
                          <SlidersHorizontal size={16} aria-hidden="true" />
                        </button>
                      )}
                      {puedeGestionar && (
                        <button type="button" className="admin-button--secondary-sm inventario-icono" onClick={() => abrirEditar(i)} aria-label={`Editar ${i.nombre}`} title="Editar">
                          <Edit2 size={16} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!cargando && filtrados.length === 0 && (
                <tr><td colSpan="4" className="admin-table__empty">{insumos.length ? "Ningún insumo coincide con la búsqueda." : "Aún no hay insumos."}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {enEdicion && (
        <div className="admin-modal-overlay" onClick={() => setEnEdicion(null)}>
          <div className="admin-modal-container admin-modal-container--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="insumo-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="insumo-titulo">{enEdicion.id ? `Editar ${enEdicion.nombre}` : "Nuevo insumo"}</h3>
              <button type="button" className="admin-modal-close" onClick={() => setEnEdicion(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <form onSubmit={guardar}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="insumo-nombre">Nombre *</label>
                  <input id="insumo-nombre" className="admin-form-input" required minLength={2} maxLength={60} placeholder="Ej. Café en grano"
                    value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="insumo-unidad">Unidad *</label>
                  <select id="insumo-unidad" className="admin-form-select" value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
                    {UNIDADES.map((u) => <option key={u.valor} value={u.valor}>{u.etiqueta}</option>)}
                  </select>
                  {enEdicion.id && <small className="inventario-ayuda">Con movimientos registrados, la unidad ya no se puede cambiar.</small>}
                </div>
                <div className="inventario-form-fila">
                  <div className="admin-form-group">
                    <label className="admin-form-label" htmlFor="insumo-minimo">Mínimo ({form.unidad})</label>
                    <input id="insumo-minimo" className="admin-form-input" inputMode="decimal" placeholder="0"
                      value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} />
                  </div>
                  <div className="admin-form-group">
                    <label className="admin-form-label" htmlFor="insumo-costo">Costo por {form.unidad === "unidad" ? "unidad" : form.unidad} (COP)</label>
                    <input id="insumo-costo" className="admin-form-input" inputMode="decimal" placeholder="0"
                      value={form.costoPromedio} onChange={(e) => setForm({ ...form, costoPromedio: e.target.value })} />
                  </div>
                </div>
                {!enEdicion.id && (
                  <div className="admin-form-group">
                    <label className="admin-form-label" htmlFor="insumo-existencia">Existencia inicial ({form.unidad})</label>
                    <input id="insumo-existencia" className="admin-form-input" inputMode="decimal" placeholder="0"
                      value={form.existenciaInicial} onChange={(e) => setForm({ ...form, existenciaInicial: e.target.value })} />
                    <small className="inventario-ayuda">Queda registrada como movimiento «Existencia inicial».</small>
                  </div>
                )}
                {enEdicion.id && (
                  <label className="admin-checkbox-label">
                    <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
                    <span>Insumo activo</span>
                  </label>
                )}
                {errorForm && <p className="admin-alert-error" role="alert">{errorForm}</p>}
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button--modal-cancel" onClick={() => setEnEdicion(null)}>Cancelar</button>
                <button type="submit" className="admin-button--primary" disabled={guardando}>{enEdicion.id ? "Guardar cambios" : "Crear insumo"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {ajuste && (
        <div className="admin-modal-overlay" onClick={() => setAjuste(null)}>
          <div className="admin-modal-container admin-modal-container--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="ajuste-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="ajuste-titulo">Movimiento de {ajuste.insumo.nombre}</h3>
              <button type="button" className="admin-modal-close" onClick={() => setAjuste(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <form onSubmit={registrarAjuste}>
              <div className="admin-modal-body">
                <p className="inventario-ayuda">Existencia actual: <strong>{formatearCantidad(ajuste.insumo.existencia, ajuste.insumo.unidad)}</strong></p>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="ajuste-tipo">Tipo *</label>
                  <select id="ajuste-tipo" className="admin-form-select" value={ajuste.tipo} onChange={(e) => setAjuste({ ...ajuste, tipo: e.target.value })}>
                    <option value="ajuste">Ajuste por conteo</option>
                    <option value="merma">Merma (se dañó o se perdió)</option>
                    <option value="vencimiento">Vencimiento</option>
                  </select>
                </div>
                {ajuste.tipo === "ajuste" && (
                  <fieldset className="inventario-sentido">
                    <legend className="admin-form-label">El conteo da</legend>
                    <label className="admin-checkbox-label"><input type="radio" name="sentido" checked={ajuste.sentido === "entra"} onChange={() => setAjuste({ ...ajuste, sentido: "entra" })} /> <span>Más de lo registrado (suma)</span></label>
                    <label className="admin-checkbox-label"><input type="radio" name="sentido" checked={ajuste.sentido === "sale"} onChange={() => setAjuste({ ...ajuste, sentido: "sale" })} /> <span>Menos de lo registrado (resta)</span></label>
                  </fieldset>
                )}
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="ajuste-cantidad">Cantidad ({ajuste.insumo.unidad}) *</label>
                  <input id="ajuste-cantidad" className="admin-form-input" inputMode="decimal" required value={ajuste.cantidad} onChange={(e) => setAjuste({ ...ajuste, cantidad: e.target.value })} />
                  {ajuste.tipo !== "ajuste" && <small className="inventario-ayuda">Se resta de la existencia.</small>}
                </div>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="ajuste-motivo">Motivo *</label>
                  <input id="ajuste-motivo" className="admin-form-input" required minLength={3} maxLength={300} placeholder="Ej. conteo del cierre, se quemó una tanda"
                    value={ajuste.motivo} onChange={(e) => setAjuste({ ...ajuste, motivo: e.target.value })} />
                </div>
                {ajuste.error && <p className="admin-alert-error" role="alert">{ajuste.error}</p>}
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button--modal-cancel" onClick={() => setAjuste(null)}>Cancelar</button>
                <button type="submit" className="admin-button--primary" disabled={enviandoAjuste}>Registrar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {kardex && (
        <div className="admin-modal-overlay" onClick={() => setKardex(null)}>
          <div className="admin-modal-container inventario-modal-ancho" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="kardex-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="kardex-titulo">Movimientos de {kardex.insumo.nombre}</h3>
              <button type="button" className="admin-modal-close" onClick={() => setKardex(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <div className="admin-modal-body">
              <p className="inventario-ayuda">Existencia actual: <strong>{formatearCantidad(kardex.insumo.existencia, kardex.insumo.unidad)}</strong> · últimos 200 movimientos</p>
              {kardex.error && <p className="admin-alert-error" role="alert">{kardex.error}</p>}
              {!kardex.movimientos && <p>Cargando...</p>}
              {kardex.movimientos?.length === 0 && !kardex.error && <p>Sin movimientos.</p>}
              {kardex.movimientos?.length > 0 && (
                <div className="admin-table-container">
                  <table className="admin-table inventario-tabla-compacta" aria-label="Movimientos del insumo">
                    <thead><tr><th>Fecha</th><th>Tipo</th><th>Cantidad</th><th>Queda</th><th>Motivo</th><th>Quién</th></tr></thead>
                    <tbody>
                      {kardex.movimientos.map((m) => (
                        <tr key={m.id}>
                          <td>{formatearFecha(m.fecha)} {formatearHora(m.fecha)}</td>
                          <td>{TIPOS_MOVIMIENTO[m.tipo] || m.tipo}</td>
                          <td className={`inventario-num ${m.cantidad < 0 ? "inventario-salida" : "inventario-entrada"}`}>
                            {m.cantidad > 0 ? "+" : "−"}{formatearCantidad(Math.abs(m.cantidad), kardex.insumo.unidad)}
                          </td>
                          <td className="inventario-num">{formatearCantidad(m.existenciaDespues, kardex.insumo.unidad)}</td>
                          <td className="inventario-motivo">{m.motivo}{m.referencia.codigo ? ` · ${m.referencia.codigo}` : ""}</td>
                          <td>{m.autor || m.actor}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
