import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CalendarClock, Trash2, X } from "lucide-react";
import AdminStatus from "../AdminDashboard/components/AdminStatus";
import { api } from "../../services/api";
import { useDialogo } from "../../context/useDialogo";
import { formatearFechaCalendario } from "../../utils/fechas";
import { NIVELES, formatearCantidad } from "./inventarioFormato";

/** Fase 5 · 5.5 (F5-6) · Stock bajo y vencimientos de los próximos 7 días (lo que queda de cada lote es estimado). */
export default function AlertasPanel({ puedeAjustar, onCambio }) {
  const { avisar } = useDialogo();
  const [alertas, setAlertas] = useState({ stockBajo: [], vencimientos: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [descarte, setDescarte] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setAlertas(await api.get("/v1/inventario/alertas"));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    let activo = true;
    api.get("/v1/inventario/alertas")
      .then((d) => activo && setAlertas(d))
      .catch((e) => activo && setError(e.message))
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, []);

  const descartar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await api.post(`/v1/inventario/lotes/${descarte.lote.id}/descartar`, { motivo: descarte.motivo.trim() });
      setDescarte(null);
      await cargar();
      onCambio?.();
    } catch (err) {
      await avisar({ tipo: "error", titulo: "No se pudo descartar el lote", mensaje: err.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="inventario-panel">
      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />
      <div className="inventario-alertas">
        <section className="admin-card inventario-alerta" aria-labelledby="alerta-stock">
          <h3 id="alerta-stock" className="inventario-subtitulo">
            <AlertTriangle size={18} aria-hidden="true" /> Stock bajo ({alertas.stockBajo.length})
          </h3>
          {alertas.stockBajo.length === 0 && !cargando && <p className="inventario-ayuda">Ningún insumo está bajo su mínimo.</p>}
          <ul>
            {alertas.stockBajo.map((i) => (
              <li key={i.id}>
                <strong>{i.nombre}</strong>
                <span className={`admin-badge ${(NIVELES[i.nivel] || NIVELES.bajo).clase}`}>{(NIVELES[i.nivel] || NIVELES.bajo).texto}</span>
                <span className={`inventario-minimo${i.existencia < 0 ? " inventario-num--negativa" : ""}`}>Hay {formatearCantidad(i.existencia, i.unidad)} · mínimo {formatearCantidad(i.minimo, i.unidad)}</span>
                {i.existencia < 0 && <span className="inventario-aviso-negativo">Revisa el conteo: se descontó más de lo registrado.</span>}
              </li>
            ))}
          </ul>
        </section>
        <section className="admin-card inventario-alerta" aria-labelledby="alerta-vencimiento">
          <h3 id="alerta-vencimiento" className="inventario-subtitulo">
            <CalendarClock size={18} aria-hidden="true" /> Vencen en 7 días ({alertas.vencimientos.length})
          </h3>
          {alertas.vencimientos.length === 0 && !cargando && <p className="inventario-ayuda">Nada vence en los próximos 7 días.</p>}
          <ul>
            {alertas.vencimientos.map((l) => (
              <li key={l.id}>
                <strong>{l.insumo}</strong>
                <span className={`admin-badge ${l.vencido ? "admin-badge--danger" : "admin-badge--warning"}`}>
                  {l.vencido ? "Vencido el" : "Vence el"} {formatearFechaCalendario(l.vencimiento)}
                </span>
                <span className="inventario-minimo">Quedan unos {formatearCantidad(l.restante, l.unidad)} de {formatearCantidad(l.recibido, l.unidad)} · {l.ordenCodigo}</span>
                {puedeAjustar && (
                  <button type="button" className="admin-button--secondary-sm" onClick={() => setDescarte({ lote: l, motivo: `${l.insumo} vencido` })}>
                    <Trash2 size={14} aria-hidden="true" />
                    <span>Registrar vencimiento</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      {descarte && (
        <div className="admin-modal-overlay" onClick={() => setDescarte(null)}>
          <div className="admin-modal-container admin-modal-container--sm" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="descarte-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="descarte-titulo">Registrar vencimiento</h3>
              <button type="button" className="admin-modal-close" onClick={() => setDescarte(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <form onSubmit={descartar}>
              <div className="admin-modal-body">
                <p className="inventario-ayuda">
                  Se descuentan {formatearCantidad(descarte.lote.restante, descarte.lote.unidad)} de {descarte.lote.insumo} como «Vencimiento» y el lote deja de alertar.
                </p>
                <div className="admin-form-group">
                  <label className="admin-form-label" htmlFor="descarte-motivo">Motivo *</label>
                  <input id="descarte-motivo" className="admin-form-input" required minLength={3} maxLength={300} value={descarte.motivo}
                    onChange={(e) => setDescarte({ ...descarte, motivo: e.target.value })} />
                </div>
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button--modal-cancel" onClick={() => setDescarte(null)}>Cancelar</button>
                <button type="submit" className="admin-button--danger" disabled={guardando}>Registrar vencimiento</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
