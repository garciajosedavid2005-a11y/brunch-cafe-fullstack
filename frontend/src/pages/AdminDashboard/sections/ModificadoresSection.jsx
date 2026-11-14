import { useId, useState } from "react";
import { Plus, Edit2, Trash2, X } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { useDialogo } from "../../../context/useDialogo";
import { formatearCOP } from "../../../utils/moneda";
import { plural } from "../adminFormat";

// 1.3 · Admin › Modificadores (F1-4): grupos reutilizables («Leche», «Tamaño»…) con sus opciones y
// recargo opcional en COP. Las mismas reglas que el backend se muestran aquí antes de guardar; el
// backend las vuelve a comprobar. «Sin ingrediente» no es un modificador: va como nota del ítem.
const MAX_SELECCION = 20;
const MAX_OPCIONES = 30;
const MAX_RECARGO = 1_000_000;

const OPCION_VACIA = { nombre: "", precioExtra: "0", disponible: true };
const GRUPO_VACIO = { nombre: "", obligatorio: false, min: "0", max: "1", activo: true, opciones: [OPCION_VACIA] };

const entero = (texto) => (/^\d+$/.test(String(texto).trim()) ? Number(texto) : null);
const recargo = (texto) => {
  const n = entero(texto);
  return n !== null && n <= MAX_RECARGO ? n : null;
};
const clave = (texto) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

const reglaDelGrupo = ({ obligatorio, min, max }) => {
  if (!obligatorio) return `Opcional · hasta ${max}`;
  return min === max ? `Obligatorio · elige ${min}` : `Obligatorio · elige de ${min} a ${max}`;
};

/** Las reglas del grupo (las mismas del esquema del backend), en frases para el formulario. */
const erroresDelGrupo = (d) => {
  const errores = [];
  const nombre = d.nombre.trim();
  if (nombre.length < 2 || nombre.length > 40) errores.push("El nombre debe tener entre 2 y 40 caracteres.");
  const min = entero(d.min);
  const max = entero(d.max);
  if (min === null || min > MAX_SELECCION) errores.push(`El mínimo debe ser un número entero de 0 a ${MAX_SELECCION}.`);
  if (max === null || max < 1 || max > MAX_SELECCION) errores.push(`El máximo debe ser un número entero de 1 a ${MAX_SELECCION}.`);
  if (min !== null && max !== null) {
    if (min > max) errores.push("El mínimo no puede ser mayor que el máximo.");
    if (d.opciones.length && max > d.opciones.length) errores.push(`El máximo no puede superar el número de opciones (${d.opciones.length}).`);
    if (d.obligatorio && min < 1) errores.push("Un grupo obligatorio exige elegir al menos 1 opción.");
    if (!d.obligatorio && min >= 1) errores.push("Con un mínimo de 1 o más, marca el grupo como obligatorio.");
  }
  if (d.opciones.length === 0) errores.push("El grupo debe tener al menos una opción.");
  if (d.opciones.length > MAX_OPCIONES) errores.push(`El grupo admite hasta ${MAX_OPCIONES} opciones.`);
  d.opciones.forEach((o, i) => {
    if (!o.nombre.trim()) errores.push(`Opción ${i + 1}: falta el nombre.`);
    if (recargo(o.precioExtra) === null) errores.push(`Opción ${i + 1}: el recargo debe ser un número entero de pesos (0 o más).`);
  });
  const nombres = d.opciones.map((o) => clave(o.nombre)).filter(Boolean);
  if (new Set(nombres).size !== nombres.length) errores.push("Hay opciones con el mismo nombre.");
  return errores;
};

function ModalGrupo({ titulo, onCerrar, children }) {
  const idTitulo = useId();
  return (
    <div className="admin-modal-overlay" onClick={onCerrar}>
      <div
        className="admin-modal-container"
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

export default function ModificadoresSection() {
  const grupos = useAdminResource("/v1/admin/grupos-modificadores");
  const { confirmar } = useDialogo();
  const [form, setForm] = useState(null); // { grupo?, datos }
  const idErrores = useId();

  const abrirNuevo = () => setForm({ datos: { ...GRUPO_VACIO, opciones: [{ ...OPCION_VACIA }] } });
  const abrirEdicion = (g) => setForm({
    grupo: g,
    datos: {
      nombre: g.nombre,
      obligatorio: g.obligatorio,
      min: String(g.min),
      max: String(g.max),
      activo: g.activo,
      opciones: g.opciones.map((o) => ({ id: o.id, nombre: o.nombre, precioExtra: String(o.precioExtra), disponible: o.disponible, disponibleAlAbrir: o.disponible })),
    },
  });

  const cambiar = (campo, valor) => setForm((f) => ({ ...f, datos: { ...f.datos, [campo]: valor } }));
  // «Obligatorio» y el mínimo van juntos (obligatorio ⇔ mínimo ≥ 1)
  const cambiarObligatorio = (obligatorio) => setForm((f) => {
    const min = entero(f.datos.min) ?? 0;
    return { ...f, datos: { ...f.datos, obligatorio, min: String(obligatorio ? Math.max(1, min) : 0) } };
  });
  const cambiarOpcion = (i, campo, valor) => setForm((f) => ({
    ...f,
    datos: { ...f.datos, opciones: f.datos.opciones.map((o, j) => (j === i ? { ...o, [campo]: valor } : o)) },
  }));
  const agregarOpcion = () => setForm((f) => ({ ...f, datos: { ...f.datos, opciones: [...f.datos.opciones, { ...OPCION_VACIA }] } }));
  const quitarOpcion = async (i) => {
    const opcion = form.datos.opciones[i];
    // Una opción ya guardada se confirma; una recién agregada se quita sin preguntar
    if (opcion.id) {
      const { confirmado } = await confirmar({
        titulo: "Quitar opción",
        mensaje: "Se quita del grupo al guardar los cambios.",
        detalle: <strong>{opcion.nombre}</strong>,
        confirmarTexto: "Quitar opción",
        cancelarTexto: "Conservar opción",
        peligroso: true,
      });
      if (!confirmado) return;
    }
    setForm((f) => ({ ...f, datos: { ...f.datos, opciones: f.datos.opciones.filter((_, j) => j !== i) } }));
  };

  const guardar = async (e) => {
    e.preventDefault();
    const d = form.datos;
    if (erroresDelGrupo(d).length) return;
    const original = form.grupo;
    if (original?.activo && !d.activo && original.productos > 0) {
      const { confirmado } = await confirmar({
        titulo: "Desactivar grupo",
        mensaje: `Lo usa ${plural(original.productos, "producto")}: dejará de ofrecerse hasta que lo actives de nuevo. Seguirá asignado.`,
        detalle: <strong>{original.nombre}</strong>,
        confirmarTexto: "Desactivar grupo",
        cancelarTexto: "Mantener activo",
      });
      if (!confirmado) return;
    }
    const datos = {
      nombre: d.nombre.trim(),
      obligatorio: d.obligatorio,
      min: Number(d.min),
      max: Number(d.max),
      activo: d.activo,
      opciones: d.opciones.map((o) => ({
        ...(o.id ? { id: o.id } : {}),
        nombre: o.nombre.trim(),
        precioExtra: Number(o.precioExtra),
        // 2.7b · De una opción guardada, «Disponible» solo si el admin lo cambió: así no se pisa lo que la
        // cocina agotó o reactivó con el diálogo abierto (el backend lo registra como en la operación)
        ...(!o.id || o.disponible !== o.disponibleAlAbrir ? { disponible: o.disponible } : {}),
      })),
    };
    const guardado = original ? await grupos.actualizar(original.id, datos) : await grupos.crear(datos);
    if (guardado) setForm(null);
  };

  const eliminar = async (g) => {
    const { confirmado } = await confirmar({
      titulo: "Eliminar grupo",
      mensaje: "Solo se puede eliminar un grupo que ningún producto usa. Si está en uso, desactívalo.",
      detalle: <strong>{g.nombre}</strong>,
      confirmarTexto: "Eliminar grupo",
      cancelarTexto: "Cancelar",
      peligroso: true,
    });
    if (confirmado) await grupos.eliminar(g.id);
  };

  const errores = form ? erroresDelGrupo(form.datos) : [];

  return (
    <div className="admin-section">
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Modificadores</h2>
          <p className="admin-section__subtitle">
            Grupos de opciones que se eligen al pedir (leche, tamaño, término del huevo…). Se asignan a cada producto en Productos.
          </p>
        </div>
        <button type="button" className="admin-button--primary" onClick={abrirNuevo}>
          <Plus size={18} />
          <span>Nuevo grupo</span>
        </button>
      </div>

      <AdminStatus cargando={grupos.cargando} error={grupos.error} onReintentar={grupos.cargar} />
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table admin-modificadores__tabla admin-table--acciones-fijas" aria-label="Grupos de modificadores">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Opciones</th>
                <th className="admin-col-estado">Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {grupos.items.length > 0 ? grupos.items.map((g) => (
                <tr key={g.id}>
                  <td>
                    <strong className="admin-table__client-name">{g.nombre}</strong>
                    {g.ejemplo && <span className="admin-badge admin-badge--neutral admin-salon__ejemplo">Ejemplo</span>}
                    <span className="admin-salon__detalle">{reglaDelGrupo(g)}</span>
                    <span className="admin-salon__detalle">{g.productos > 0 ? `Lo usa ${plural(g.productos, "producto")}` : "Sin productos"}</span>
                  </td>
                  <td>
                    <ul className="admin-modificadores__opciones">
                      {g.opciones.map((o) => (
                        <li key={o.id}>
                          {o.precioExtra > 0 ? `${o.nombre} (+${formatearCOP(o.precioExtra)})` : o.nombre}
                          {!o.disponible && <span className="admin-badge admin-badge--neutral">Agotada</span>}
                        </li>
                      ))}
                    </ul>
                  </td>
                  <td className="admin-col-estado">
                    <span className={`admin-badge ${g.activo ? "admin-badge--success" : "admin-badge--neutral"}`}>
                      {g.activo ? "Activo" : "Inactivo"}
                    </span>
                  </td>
                  <td>
                    <div className="admin-table__actions-row">
                      <button type="button" className="admin-button--secondary-sm" aria-label={`Editar grupo ${g.nombre}`} onClick={() => abrirEdicion(g)}>
                        <Edit2 size={14} />
                        <span>Editar</span>
                      </button>
                      <button
                        type="button"
                        className="admin-button--icon-danger"
                        aria-label={`Eliminar grupo ${g.nombre}`}
                        title="Eliminar grupo"
                        onClick={() => eliminar(g)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="4" className="admin-table__empty">Todavía no hay grupos de modificadores. Crea el primero (p. ej. Leche).</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {form && (
        <ModalGrupo titulo={form.grupo ? "Editar grupo" : "Nuevo grupo"} onCerrar={() => setForm(null)}>
          <form onSubmit={guardar} noValidate>
            <div className="admin-modal-body">
              <div className="admin-form-group">
                <label htmlFor="grupo-nombre" className="admin-form-label">Nombre *</label>
                <input
                  id="grupo-nombre"
                  className="admin-form-input"
                  maxLength={40}
                  placeholder="Ej. Leche, Tamaño, Término del huevo…"
                  value={form.datos.nombre}
                  onChange={(e) => cambiar("nombre", e.target.value)}
                />
              </div>

              <div className="admin-form-checkbox-row">
                <label className="admin-checkbox-label">
                  <input type="checkbox" checked={form.datos.obligatorio} onChange={(e) => cambiarObligatorio(e.target.checked)} />
                  <span>Obligatorio (hay que elegir al menos una opción)</span>
                </label>
              </div>

              <div className="admin-salon__fila">
                <div className="admin-form-group">
                  <label htmlFor="grupo-min" className="admin-form-label">Mínimo</label>
                  <input
                    id="grupo-min"
                    type="number"
                    className="admin-form-input"
                    min={0}
                    max={MAX_SELECCION}
                    step={1}
                    aria-describedby="grupo-seleccion-ayuda"
                    value={form.datos.min}
                    onChange={(e) => cambiar("min", e.target.value)}
                  />
                </div>
                <div className="admin-form-group">
                  <label htmlFor="grupo-max" className="admin-form-label">Máximo</label>
                  <input
                    id="grupo-max"
                    type="number"
                    className="admin-form-input"
                    min={1}
                    max={MAX_SELECCION}
                    step={1}
                    aria-describedby="grupo-seleccion-ayuda"
                    value={form.datos.max}
                    onChange={(e) => cambiar("max", e.target.value)}
                  />
                </div>
              </div>
              <small id="grupo-seleccion-ayuda" className="admin-form-ayuda">
                Cuántas opciones se pueden elegir. Ej.: Término del huevo, obligatorio con mínimo y máximo 1; Extras, opcional hasta 4.
              </small>

              <fieldset className="admin-modificadores__editor">
                <legend className="admin-form-label">Opciones</legend>
                {/* Encabezados visibles (los campos tienen además su aria-label por fila) */}
                <div className="admin-modificadores__opcion admin-modificadores__cabecera" aria-hidden="true">
                  <span>Opción</span>
                  <span>Recargo (COP)</span>
                </div>
                {form.datos.opciones.map((o, i) => {
                  const valor = recargo(o.precioExtra);
                  return (
                    <div key={o.id || `nueva-${i}`} className="admin-modificadores__opcion">
                      <input
                        className="admin-form-input"
                        aria-label={`Nombre de la opción ${i + 1}`}
                        maxLength={40}
                        placeholder="Nombre (ej. Almendra)"
                        value={o.nombre}
                        onChange={(e) => cambiarOpcion(i, "nombre", e.target.value)}
                      />
                      <div className="admin-modificadores__recargo">
                        <input
                          type="number"
                          className="admin-form-input"
                          aria-label={`Recargo de la opción ${i + 1} (COP)`}
                          min={0}
                          step={1}
                          value={o.precioExtra}
                          onChange={(e) => cambiarOpcion(i, "precioExtra", e.target.value)}
                        />
                        <span className="admin-modificadores__precio" aria-hidden="true">
                          {valor === null ? "Recargo no válido" : valor === 0 ? "Sin recargo" : `+${formatearCOP(valor)}`}
                        </span>
                      </div>
                      <label className="admin-checkbox-label">
                        <input
                          type="checkbox"
                          aria-label={`Disponible: opción ${i + 1}`}
                          checked={o.disponible}
                          onChange={(e) => cambiarOpcion(i, "disponible", e.target.checked)}
                        />
                        <span>Disponible</span>
                      </label>
                      <button
                        type="button"
                        className="admin-button--icon-danger"
                        aria-label={`Quitar opción ${i + 1}`}
                        title="Quitar opción"
                        onClick={() => quitarOpcion(i)}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
                <button type="button" className="admin-button--secondary-sm admin-modificadores__agregar" onClick={agregarOpcion} disabled={form.datos.opciones.length >= MAX_OPCIONES}>
                  <Plus size={14} />
                  <span>Agregar opción</span>
                </button>
              </fieldset>

              <div className="admin-form-checkbox-row">
                <label className="admin-checkbox-label">
                  <input type="checkbox" checked={form.datos.activo} onChange={(e) => cambiar("activo", e.target.checked)} />
                  <span>Activo (se ofrece en los productos que lo tienen)</span>
                </label>
              </div>

              {errores.length > 0 && (
                <div className="admin-modificadores__errores" id={idErrores} role="status">
                  <strong>Revisa antes de guardar:</strong>
                  <ul>
                    {errores.map((e) => <li key={e}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
            <div className="admin-modal-actions">
              <button type="button" className="admin-button--secondary-sm" onClick={() => setForm(null)}>Cancelar</button>
              <button
                type="submit"
                className="admin-button--primary"
                disabled={grupos.guardando || errores.length > 0}
                aria-describedby={errores.length > 0 ? idErrores : undefined}
              >
                {form.grupo ? "Guardar cambios" : "Crear grupo"}
              </button>
            </div>
          </form>
        </ModalGrupo>
      )}
    </div>
  );
}
