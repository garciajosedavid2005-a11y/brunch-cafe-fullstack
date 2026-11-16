import { useCallback, useEffect, useState } from "react";
import { Edit2, Plus, Search, Trash2, X } from "lucide-react";
import AdminStatus from "../AdminDashboard/components/AdminStatus";
import { api } from "../../services/api";
import { useDialogo } from "../../context/useDialogo";
import { formatearCOP } from "../../utils/moneda";
import { formatearCantidad, leerNumero } from "./inventarioFormato";

const lineaVacia = () => ({ insumoId: "", cantidad: "", merma: "", reemplazaId: "" });

/** Fase 5 · 5.2 (F5-2) · Recetas por producto y lo que cambia cada opción de un modificador. */
export default function RecetasPanel({ puedeGestionar }) {
  const { avisar } = useDialogo();
  const [datos, setDatos] = useState({ productos: [], grupos: [], insumos: [] });
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [edicion, setEdicion] = useState(null); // { tipo, titulo, ruta, version, lineas }
  const [errorForm, setErrorForm] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      setDatos(await api.get("/v1/inventario/recetas"));
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);
  useEffect(() => {
    let activo = true;
    api.get("/v1/inventario/recetas")
      .then((d) => activo && setDatos(d))
      .catch((e) => activo && setError(e.message))
      .finally(() => activo && setCargando(false));
    return () => { activo = false; };
  }, []);

  const abrir = (tipo, titulo, ruta, receta) => {
    setErrorForm("");
    setEdicion({
      tipo, titulo, ruta, version: receta.version,
      lineas: receta.lineas.length
        ? receta.lineas.map((l) => ({ insumoId: l.insumoId, cantidad: String(l.cantidad), merma: l.merma ? String(l.merma) : "", reemplazaId: l.reemplazaId || "" }))
        : [lineaVacia()],
    });
  };
  const cambiarLinea = (i, campo, valor) =>
    setEdicion((e) => ({ ...e, lineas: e.lineas.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)) }));

  const guardar = async (ev) => {
    ev.preventDefault();
    const lineas = [];
    for (const l of edicion.lineas.filter((x) => x.insumoId || x.cantidad)) {
      const cantidad = leerNumero(l.cantidad);
      const merma = leerNumero(l.merma) ?? 0;
      if (!l.insumoId || !Number.isFinite(cantidad) || cantidad <= 0 || !Number.isFinite(merma) || merma < 0 || merma > 100) {
        setErrorForm("Cada línea necesita un insumo, una cantidad mayor que 0 y una merma entre 0 y 100 %.");
        return;
      }
      lineas.push({ insumoId: l.insumoId, cantidad, merma, ...(edicion.tipo === "opcion" ? { reemplazaId: l.reemplazaId || null } : {}) });
    }
    setGuardando(true);
    try {
      await api.put(edicion.ruta, { lineas, ...(edicion.version !== null && edicion.version !== undefined ? { versionEsperada: edicion.version } : {}) });
      setEdicion(null);
      await cargar();
    } catch (e) {
      await avisar({ tipo: "error", titulo: "No se pudo guardar la receta", mensaje: e.message });
    } finally {
      setGuardando(false);
    }
  };

  const texto = busqueda.trim().toLowerCase();
  const productos = datos.productos.filter((p) => p.nombre.toLowerCase().includes(texto) || p.categoria.toLowerCase().includes(texto));
  const unidadDe = (id) => datos.insumos.find((i) => i.id === id)?.unidad || "";
  const resumenLineas = (lineas) => lineas.map((l) => `${l.reemplaza ? `${l.insumo} en lugar de ${l.reemplaza}` : l.insumo} ${formatearCantidad(l.cantidad, l.unidad)}${l.merma ? ` (+${l.merma} % merma)` : ""}`).join(" · ");

  return (
    <div className="inventario-panel">
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" aria-hidden="true" />
          <input type="search" className="admin-input-search" placeholder="Buscar producto o categoría..." aria-label="Buscar producto"
            value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="admin-toolbar__count">
          <strong>{datos.productos.filter((p) => p.lineas.length).length}</strong> de {datos.productos.length} productos con receta
        </div>
      </div>
      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />

      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table inventario-tabla-compacta" aria-label="Recetas de los productos">
            <thead>
              <tr><th>Producto</th><th>Receta por unidad</th><th>Costo</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {productos.map((p) => {
                const margen = p.precio ? Math.round(((p.precio - p.costo) / p.precio) * 100) : 0;
                return (
                  <tr key={p.id}>
                    <td className="inventario-nombre">
                      <strong className="admin-table__client-name">{p.nombre}</strong>
                      <small className="inventario-minimo">{p.categoria} · {formatearCOP(p.precio)}</small>
                    </td>
                    <td className="inventario-receta">
                      {p.lineas.length ? resumenLineas(p.lineas) : <span className="admin-badge admin-badge--neutral">Sin receta: no descuenta inventario</span>}
                    </td>
                    <td className="inventario-num">
                      {p.lineas.length ? formatearCOP(p.costo) : "—"}
                      {p.lineas.length > 0 && <small className="inventario-minimo">margen {margen} %</small>}
                    </td>
                    <td>
                      {puedeGestionar && (
                        <button type="button" className="admin-button--secondary-sm inventario-icono" title="Editar receta" aria-label={`Editar receta de ${p.nombre}`}
                          onClick={() => abrir("producto", `Receta de ${p.nombre}`, `/v1/inventario/recetas/productos/${p.id}`, p)}>
                          <Edit2 size={16} aria-hidden="true" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!cargando && productos.length === 0 && <tr><td colSpan="4" className="admin-table__empty">Ningún producto coincide.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <h3 className="inventario-subtitulo">Opciones de los modificadores</h3>
      <p className="inventario-ayuda">Una opción puede sumar insumos (Extras › Tocineta) o reemplazar uno de la receta del producto (Leche › Almendra en lugar de la entera).</p>
      <div className="inventario-grupos">
        {datos.grupos.map((g) => (
          <section key={g.id} className="admin-card inventario-grupo" aria-label={`Grupo ${g.nombre}`}>
            <h4>{g.nombre}</h4>
            <ul>
              {g.opciones.map((o) => (
                <li key={o.id}>
                  <div>
                    <strong>{o.nombre}</strong>
                    <span className="inventario-minimo">{o.lineas.length ? resumenLineas(o.lineas) : "No cambia la receta"}</span>
                  </div>
                  {puedeGestionar && (
                    <button type="button" className="admin-button--secondary-sm inventario-icono" title="Editar" aria-label={`Editar receta de ${g.nombre} › ${o.nombre}`}
                      onClick={() => abrir("opcion", `${g.nombre} › ${o.nombre}`, `/v1/inventario/recetas/grupos/${g.id}/opciones/${o.id}`, o)}>
                      <Edit2 size={16} aria-hidden="true" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {edicion && (
        <div className="admin-modal-overlay" onClick={() => setEdicion(null)}>
          <div className="admin-modal-container inventario-modal-ancho" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="receta-titulo">
            <div className="admin-modal-header">
              <h3 className="admin-modal-title" id="receta-titulo">{edicion.titulo}</h3>
              <button type="button" className="admin-modal-close" onClick={() => setEdicion(null)} aria-label="Cerrar"><X size={18} /></button>
            </div>
            <form onSubmit={guardar}>
              <div className="admin-modal-body">
                <p className="inventario-ayuda">
                  {edicion.tipo === "producto" ? "Cantidad de cada insumo por unidad vendida. La merma suma ese porcentaje al descuento." : "Lo que agrega esta opción. Si reemplaza un insumo de la receta del producto, elígelo en «En lugar de»."}
                </p>
                {edicion.lineas.map((l, i) => (
                  <fieldset key={i} className="inventario-linea">
                    <legend className="inventario-oculto">Insumo {i + 1}</legend>
                    <label>
                      <span>Insumo</span>
                      <select className="admin-form-select" value={l.insumoId} onChange={(e) => cambiarLinea(i, "insumoId", e.target.value)}>
                        <option value="">Elige un insumo</option>
                        {datos.insumos.map((ins) => <option key={ins.id} value={ins.id}>{ins.nombre} ({ins.unidad})</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Cantidad{l.insumoId ? ` (${unidadDe(l.insumoId)})` : ""}</span>
                      <input className="admin-form-input" inputMode="decimal" value={l.cantidad} onChange={(e) => cambiarLinea(i, "cantidad", e.target.value)} />
                    </label>
                    <label>
                      <span>Merma %</span>
                      <input className="admin-form-input" inputMode="decimal" placeholder="0" value={l.merma} onChange={(e) => cambiarLinea(i, "merma", e.target.value)} />
                    </label>
                    {edicion.tipo === "opcion" && (
                      <label>
                        <span>En lugar de</span>
                        <select className="admin-form-select" value={l.reemplazaId} onChange={(e) => cambiarLinea(i, "reemplazaId", e.target.value)}>
                          <option value="">(suma, no reemplaza)</option>
                          {datos.insumos.map((ins) => <option key={ins.id} value={ins.id}>{ins.nombre}</option>)}
                        </select>
                      </label>
                    )}
                    <button type="button" className="admin-button--icon-danger inventario-icono inventario-quitar" aria-label={`Quitar el insumo ${i + 1}`}
                      onClick={() => setEdicion((e) => ({ ...e, lineas: e.lineas.filter((_, j) => j !== i) }))}>
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </fieldset>
                ))}
                <button type="button" className="admin-button--secondary-sm" onClick={() => setEdicion((e) => ({ ...e, lineas: [...e.lineas, lineaVacia()] }))}>
                  <Plus size={14} aria-hidden="true" />
                  <span>Agregar insumo</span>
                </button>
                {errorForm && <p className="admin-alert-error" role="alert">{errorForm}</p>}
              </div>
              <div className="admin-modal-footer">
                <button type="button" className="admin-button--modal-cancel" onClick={() => setEdicion(null)}>Cancelar</button>
                <button type="submit" className="admin-button--primary" disabled={guardando}>Guardar receta</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
