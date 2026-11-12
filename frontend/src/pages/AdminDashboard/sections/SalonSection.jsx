import { useId, useState } from "react";
import { Plus, Edit2, Trash2, X } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { useDialogo } from "../../../context/useDialogo";

// 1.2 · Admin › Salón: zonas y mesas (permiso salon:configurar; el backend valida todo).
// El estado de una mesa no se edita aquí: lo cambian las operaciones del salón (1.5).
const ESTADOS_MESA = {
  libre: { texto: "Libre", clase: "admin-badge--success" },
  ocupada: { texto: "Ocupada", clase: "admin-badge--warning" },
  cuenta_pedida: { texto: "Cuenta pedida", clase: "admin-badge--info" },
  por_limpiar: { texto: "Por limpiar", clase: "admin-badge--neutral" },
  bloqueada: { texto: "Bloqueada", clase: "admin-badge--danger" },
};

const ZONA_VACIA = { nombre: "", orden: 0, activa: true };
const MESA_VACIA = { numero: "", nombre: "", zona: "", capacidad: "", combinable: false, activa: true };

function Modal({ titulo, onCerrar, children }) {
  const idTitulo = useId();
  return (
    <div className="admin-modal-overlay" onClick={onCerrar}>
      <div
        className="admin-modal-container admin-modal-container--sm"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
      >
        <div className="admin-modal-header">
          <h3 className="admin-modal-title" id={idTitulo}>{titulo}</h3>
          <button type="button" className="admin-modal-close" onClick={onCerrar} aria-label="Cerrar">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Pie({ onCancelar, guardando, texto }) {
  return (
    <div className="admin-modal-actions">
      <button type="button" className="admin-button--secondary-sm" onClick={onCancelar}>Cancelar</button>
      <button type="submit" className="admin-button--primary" disabled={guardando}>{texto}</button>
    </div>
  );
}

export default function SalonSection() {
  const zonas = useAdminResource("/v1/admin/zonas");
  const mesas = useAdminResource("/v1/admin/mesas");
  const { confirmar } = useDialogo();
  const [filtroZona, setFiltroZona] = useState("");
  const [zonaForm, setZonaForm] = useState(null); // { id?, datos }
  const [mesaForm, setMesaForm] = useState(null);

  const zonasActivas = zonas.items.filter((z) => z.activa);
  const mesasVisibles = filtroZona ? mesas.items.filter((m) => m.zona.id === filtroZona) : mesas.items;

  // ── Zonas ──
  const guardarZona = async (e) => {
    e.preventDefault();
    const datos = { nombre: zonaForm.datos.nombre.trim(), orden: Number(zonaForm.datos.orden), activa: zonaForm.datos.activa };
    const guardada = zonaForm.id ? await zonas.actualizar(zonaForm.id, datos) : await zonas.crear(datos);
    if (guardada) {
      setZonaForm(null);
      await mesas.cargar(); // el nombre de la zona aparece en las mesas
    }
  };

  const eliminarZona = async (zona) => {
    const { confirmado } = await confirmar({
      titulo: "Eliminar zona",
      mensaje: "Solo se puede eliminar una zona sin mesas. Si tiene mesas, desactívala.",
      detalle: <strong>{zona.nombre}</strong>,
      confirmarTexto: "Eliminar zona",
      cancelarTexto: "Cancelar",
      peligroso: true,
    });
    if (confirmado) await zonas.eliminar(zona.id);
  };

  // ── Mesas ──
  const guardarMesa = async (e) => {
    e.preventDefault();
    const d = mesaForm.datos;
    const datos = {
      numero: Number(d.numero),
      nombre: d.nombre.trim(),
      zona: d.zona,
      capacidad: Number(d.capacidad),
      combinable: d.combinable,
      activa: d.activa,
    };
    const guardada = mesaForm.id ? await mesas.actualizar(mesaForm.id, datos) : await mesas.crear(datos);
    if (guardada) {
      setMesaForm(null);
      await zonas.cargar(); // conteo de mesas por zona
    }
  };

  const eliminarMesa = async (mesa) => {
    const { confirmado } = await confirmar({
      titulo: `Eliminar mesa ${mesa.numero}`,
      mensaje: "Solo se puede eliminar una mesa libre. Esta acción no se puede deshacer.",
      confirmarTexto: "Eliminar mesa",
      cancelarTexto: "Cancelar",
      peligroso: true,
    });
    if (confirmado && (await mesas.eliminar(mesa.id))) await zonas.cargar();
  };

  const cambiarZonaForm = (campo, valor) => setZonaForm((f) => ({ ...f, datos: { ...f.datos, [campo]: valor } }));
  const cambiarMesaForm = (campo, valor) => setMesaForm((f) => ({ ...f, datos: { ...f.datos, [campo]: valor } }));

  return (
    <div className="admin-section">
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Salón</h2>
          <p className="admin-section__subtitle">
            Zonas y mesas del local. Las mesas combinables de una misma zona se pueden unir.
          </p>
        </div>
      </div>

      {/* ZONAS */}
      <div className="admin-section__header admin-salon__subheader">
        <h3 className="admin-salon__titulo">Zonas</h3>
        <button type="button" className="admin-button--primary" onClick={() => setZonaForm({ datos: ZONA_VACIA })}>
          <Plus size={18} />
          <span>Nueva zona</span>
        </button>
      </div>
      <AdminStatus cargando={zonas.cargando} error={zonas.error} onReintentar={zonas.cargar} />
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table admin-salon__tabla admin-table--acciones-fijas" aria-label="Zonas del salón">
            <thead>
              <tr>
                <th>Zona</th>
                <th>Mesas</th>
                <th className="admin-col-estado">Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {zonas.items.length > 0 ? zonas.items.map((zona) => (
                <tr key={zona.id}>
                  <td>
                    <strong className="admin-table__client-name">{zona.nombre}</strong>
                    {zona.ejemplo && <span className="admin-badge admin-badge--neutral admin-salon__ejemplo">Ejemplo</span>}
                    <span className="admin-salon__detalle">Orden {zona.orden}</span>
                  </td>
                  <td>{zona.mesas}</td>
                  <td className="admin-col-estado">
                    <span className={`admin-badge ${zona.activa ? "admin-badge--success" : "admin-badge--neutral"}`}>
                      {zona.activa ? "Activa" : "Inactiva"}
                    </span>
                  </td>
                  <td>
                    <div className="admin-table__actions-row">
                      <button
                        type="button"
                        className="admin-button--secondary-sm"
                        aria-label={`Editar zona ${zona.nombre}`}
                        onClick={() => setZonaForm({ id: zona.id, datos: { nombre: zona.nombre, orden: zona.orden, activa: zona.activa } })}
                      >
                        <Edit2 size={14} />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        className="admin-button--icon-danger"
                        aria-label={`Eliminar zona ${zona.nombre}`}
                        title="Eliminar zona"
                        onClick={() => eliminarZona(zona)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" className="admin-table__empty">Todavía no hay zonas. Crea la primera (p. ej. Interior).</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MESAS */}
      <div className="admin-section__header admin-salon__subheader">
        <h3 className="admin-salon__titulo">Mesas</h3>
        <div className="admin-salon__acciones">
          <select
            className="admin-salon__filtro"
            aria-label="Filtrar mesas por zona"
            value={filtroZona}
            onChange={(e) => setFiltroZona(e.target.value)}
          >
            <option value="">Todas las zonas</option>
            {zonas.items.map((z) => <option key={z.id} value={z.id}>{z.nombre}</option>)}
          </select>
          <button
            type="button"
            className="admin-button--primary"
            onClick={() => setMesaForm({ datos: { ...MESA_VACIA, zona: filtroZona && zonasActivas.some((z) => z.id === filtroZona) ? filtroZona : "" } })}
          >
            <Plus size={18} />
            <span>Nueva mesa</span>
          </button>
        </div>
      </div>
      <AdminStatus cargando={mesas.cargando} error={mesas.error} onReintentar={mesas.cargar} />
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table admin-salon__tabla admin-table--acciones-fijas" aria-label="Mesas del salón">
            <thead>
              <tr>
                <th>Mesa</th>
                <th>Zona</th>
                <th className="admin-col-estado">Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {mesasVisibles.length > 0 ? mesasVisibles.map((mesa) => {
                const estado = ESTADOS_MESA[mesa.estado] || { texto: mesa.estado, clase: "admin-badge--neutral" };
                return (
                  <tr key={mesa.id}>
                    <td>
                      <strong className="admin-table__client-name">Mesa {mesa.numero}</strong>
                      {mesa.nombre && <span className="admin-salon__detalle">{mesa.nombre}</span>}
                      <span className="admin-salon__marcas">
                        {mesa.combinable && <span className="admin-badge admin-badge--info">Combinable</span>}
                        {mesa.ejemplo && <span className="admin-badge admin-badge--neutral">Ejemplo</span>}
                      </span>
                    </td>
                    <td>
                      {mesa.zona.nombre}
                      <span className="admin-salon__detalle">{mesa.capacidad === 1 ? "1 persona" : `${mesa.capacidad} personas`}</span>
                    </td>
                    <td className="admin-col-estado">
                      <span className={`admin-badge ${estado.clase}`}>{estado.texto}</span>
                      {!mesa.activa && <span className="admin-salon__detalle">Inactiva</span>}
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          aria-label={`Editar mesa ${mesa.numero}`}
                          onClick={() => setMesaForm({
                            id: mesa.id,
                            datos: {
                              numero: String(mesa.numero), nombre: mesa.nombre, zona: mesa.zona.id,
                              capacidad: String(mesa.capacidad), combinable: mesa.combinable, activa: mesa.activa,
                            },
                          })}
                        >
                          <Edit2 size={14} />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          className="admin-button--icon-danger"
                          aria-label={`Eliminar mesa ${mesa.numero}`}
                          title="Eliminar mesa"
                          onClick={() => eliminarMesa(mesa)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan="4" className="admin-table__empty">
                    {filtroZona ? "No hay mesas en esta zona." : "Todavía no hay mesas."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {zonaForm && (
        <Modal titulo={zonaForm.id ? "Editar zona" : "Nueva zona"} onCerrar={() => setZonaForm(null)}>
          <form onSubmit={guardarZona}>
            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label htmlFor="zona-nombre" className="admin-form-label">Nombre *</label>
                <input
                  id="zona-nombre"
                  className="admin-form-input"
                  required
                  minLength={2}
                  maxLength={40}
                  placeholder="Ej. Interior, Terraza…"
                  value={zonaForm.datos.nombre}
                  onChange={(e) => cambiarZonaForm("nombre", e.target.value)}
                />
              </div>
              <div className="admin-form-group">
                <label htmlFor="zona-orden" className="admin-form-label">Orden en el plano</label>
                <input
                  id="zona-orden"
                  type="number"
                  className="admin-form-input"
                  min={0}
                  max={999}
                  step={1}
                  value={zonaForm.datos.orden}
                  onChange={(e) => cambiarZonaForm("orden", e.target.value)}
                />
              </div>
              <div className="admin-form-checkbox-row">
                <label className="admin-checkbox-label">
                  <input type="checkbox" checked={zonaForm.datos.activa} onChange={(e) => cambiarZonaForm("activa", e.target.checked)} />
                  <span>Activa (aparece en el plano)</span>
                </label>
              </div>
            </div>
            <Pie onCancelar={() => setZonaForm(null)} guardando={zonas.guardando} texto={zonaForm.id ? "Guardar cambios" : "Crear zona"} />
          </form>
        </Modal>
      )}

      {mesaForm && (
        <Modal titulo={mesaForm.id ? "Editar mesa" : "Nueva mesa"} onCerrar={() => setMesaForm(null)}>
          <form onSubmit={guardarMesa}>
            <div className="admin-modal-body">
              <div className="admin-salon__fila">
                <div className="admin-form-group">
                  <label htmlFor="mesa-numero" className="admin-form-label">Número *</label>
                  <input
                    id="mesa-numero"
                    type="number"
                    className="admin-form-input"
                    required
                    min={1}
                    max={999}
                    step={1}
                    value={mesaForm.datos.numero}
                    onChange={(e) => cambiarMesaForm("numero", e.target.value)}
                  />
                </div>
                <div className="admin-form-group">
                  <label htmlFor="mesa-capacidad" className="admin-form-label">Capacidad (personas) *</label>
                  <input
                    id="mesa-capacidad"
                    type="number"
                    className="admin-form-input"
                    required
                    min={1}
                    max={20}
                    step={1}
                    value={mesaForm.datos.capacidad}
                    onChange={(e) => cambiarMesaForm("capacidad", e.target.value)}
                  />
                </div>
              </div>
              <div className="admin-form-group">
                <label htmlFor="mesa-zona" className="admin-form-label">Zona *</label>
                <select
                  id="mesa-zona"
                  className="admin-form-select"
                  required
                  value={mesaForm.datos.zona}
                  onChange={(e) => cambiarMesaForm("zona", e.target.value)}
                >
                  <option value="">Selecciona una zona</option>
                  {/* Activas y, al editar, la zona actual aunque esté inactiva (para no perderla) */}
                  {zonas.items
                    .filter((z) => z.activa || z.id === mesaForm.datos.zona)
                    .map((z) => <option key={z.id} value={z.id}>{z.activa ? z.nombre : `${z.nombre} (inactiva)`}</option>)}
                </select>
              </div>
              <div className="admin-form-group">
                <label htmlFor="mesa-nombre" className="admin-form-label">Nombre (opcional)</label>
                <input
                  id="mesa-nombre"
                  className="admin-form-input"
                  maxLength={40}
                  placeholder="Ej. Ventana, Esquina…"
                  value={mesaForm.datos.nombre}
                  onChange={(e) => cambiarMesaForm("nombre", e.target.value)}
                />
              </div>
              <div className="admin-form-checkbox-row">
                <label className="admin-checkbox-label">
                  <input type="checkbox" checked={mesaForm.datos.combinable} onChange={(e) => cambiarMesaForm("combinable", e.target.checked)} />
                  <span>Combinable (se puede unir con otras de la misma zona)</span>
                </label>
              </div>
              <div className="admin-form-checkbox-row">
                <label className="admin-checkbox-label">
                  <input type="checkbox" checked={mesaForm.datos.activa} onChange={(e) => cambiarMesaForm("activa", e.target.checked)} />
                  <span>Activa (aparece en el plano)</span>
                </label>
              </div>
            </div>
            <Pie onCancelar={() => setMesaForm(null)} guardando={mesas.guardando} texto={mesaForm.id ? "Guardar cambios" : "Crear mesa"} />
          </form>
        </Modal>
      )}
    </div>
  );
}
