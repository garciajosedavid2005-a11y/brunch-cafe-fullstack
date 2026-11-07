import { useId, useState } from "react";
import { Plus, Edit2, Trash2, Search, X, Tags, AlertCircle, Check } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";

export default function CategoriesSection() {
  const { items: categorias, cargando, error, guardando, cargar, crear, actualizar, eliminar } =
    useAdminResource("/v1/admin/categorias");
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [categoriaEnEdicion, setCategoriaEnEdicion] = useState(null); // null = crear nueva
  const [categoriaAEliminar, setCategoriaAEliminar] = useState(null);
  // 1.3 · Estación por defecto de los productos de la categoría (F1-3)
  const { items: estaciones, error: errorEstaciones, cargar: cargarEstaciones } = useAdminResource("/v1/admin/estaciones");
  const estacionesActivas = estaciones.filter((e) => e.activa);
  const idTituloModal = useId();

  // Formulario local
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
    estacionId: "",
  });

  const abrirModalCrear = () => {
    setCategoriaEnEdicion(null);
    // F1-3: lo que no es bebida va a cocina; el admin puede elegir otra
    const cocina = estacionesActivas.find((e) => e.codigo === "cocina");
    setFormData({ nombre: "", descripcion: "", estacionId: cocina?.id || "" });
    setModalAbierto(true);
  };

  const abrirModalEditar = (cat) => {
    setCategoriaEnEdicion(cat);
    setFormData({
      nombre: cat.nombre,
      descripcion: cat.descripcion,
      // Una categoría anterior a migrate:1.3 no tiene estación: se pide elegirla
      estacionId: cat.estacion?.id || "",
    });
    setModalAbierto(true);
  };

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.estacionId) return;

    const guardada = categoriaEnEdicion
      ? await actualizar(categoriaEnEdicion.id, formData)
      : await crear(formData);
    if (guardada) setModalAbierto(false);
  };

  const handleEliminar = async () => {
    if (!categoriaAEliminar) return;
    if (await eliminar(categoriaAEliminar.id)) setCategoriaAEliminar(null);
  };

  const categoriasFiltradas = categorias.filter(
    (c) =>
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.descripcion.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <div className="admin-section">
      {/* CABECERA */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Categorías del Menú</h2>
          <p className="admin-section__subtitle">
            Organiza las secciones del menú de Brunch Café. Crea, edita y administra cada categoría.
          </p>
        </div>
        <button
          type="button"
          className="admin-button--primary"
          onClick={abrirModalCrear}
        >
          <Plus size={18} />
          <span>Nueva Categoría</span>
        </button>
      </div>

      {/* BUSCADOR */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder="Buscar categoría por nombre o descripción..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="admin-toolbar__count">
          <strong>{categoriasFiltradas.length}</strong> categorías registradas
        </div>
      </div>

      {/* TABLA DE CATEGORÍAS */}
      <AdminStatus cargando={cargando} error={error} onReintentar={cargar} />
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table" aria-label="Categorías del menú">
            <thead>
              <tr>
                <th>Nombre de Categoría</th>
                <th>Descripción</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {categoriasFiltradas.length > 0 ? (
                categoriasFiltradas.map((cat) => (
                  <tr key={cat.id}>
                    <td>
                      <strong className="admin-table__client-name">{cat.nombre}</strong>
                      {/* 1.3 · bajo el nombre (una columna más no cabía a 768 px) */}
                      {cat.estacion ? (
                        <span className="admin-salon__detalle">Estación: {cat.estacion.nombre}</span>
                      ) : (
                        <span className="admin-badge admin-badge--warning admin-categorias__sin-estacion">Sin estación</span>
                      )}
                    </td>
                    <td>
                      <span className="admin-table__category-desc">{cat.descripcion}</span>
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          onClick={() => abrirModalEditar(cat)}
                          title="Editar categoría"
                        >
                          <Edit2 size={14} />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          className="admin-button--icon-danger"
                          onClick={() => setCategoriaAEliminar(cat)}
                          title="Eliminar categoría"
                          aria-label={`Eliminar categoría ${cat.nombre}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="admin-table__empty">
                    No se encontraron categorías con los términos de búsqueda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR CATEGORÍA */}
      {modalAbierto && (
        <div className="admin-modal-overlay" onClick={() => setModalAbierto(false)}>
          <div
            className="admin-modal-container admin-modal-container--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTituloModal}
          >
            <div className="admin-modal-header">
              <div>
                <span className="admin-badge admin-badge--neutral">
                  {categoriaEnEdicion ? "Modificar" : "Crear nueva"}
                </span>
                <h3 className="admin-modal-title" id={idTituloModal}>
                  {categoriaEnEdicion ? "Editar Categoría" : "Nueva Categoría"}
                </h3>
              </div>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setModalAbierto(false)}
                aria-label="Cerrar modal"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleGuardar}>
              <div className="admin-modal-body">
                <div className="admin-form-group">
                  <label htmlFor="cat-nombre" className="admin-form-label">
                    Nombre de la categoría *
                  </label>
                  <input
                    id="cat-nombre"
                    type="text"
                    className="admin-form-input"
                    placeholder="Ej. Desayunos, Postres, Bebidas..."
                    required
                    value={formData.nombre}
                    onChange={(e) =>
                      setFormData({ ...formData, nombre: e.target.value })
                    }
                  />
                </div>

                <div className="admin-form-group">
                  <label htmlFor="cat-estacion" className="admin-form-label">
                    Estación por defecto *
                  </label>
                  <select
                    id="cat-estacion"
                    className="admin-form-select"
                    required
                    aria-describedby="cat-estacion-ayuda"
                    value={formData.estacionId}
                    onChange={(e) => setFormData({ ...formData, estacionId: e.target.value })}
                  >
                    {!formData.estacionId && <option value="">Selecciona una estación</option>}
                    {estacionesActivas.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                  <small id="cat-estacion-ayuda" className="admin-form-ayuda">
                    Dónde se preparan sus productos (cocina o barra). Cada producto puede cambiarla.
                  </small>
                  {errorEstaciones && (
                    <div className="admin-form-aviso" role="alert">
                      <span>No se pudieron cargar las estaciones: {errorEstaciones}</span>
                      <button type="button" className="admin-button--secondary-sm" onClick={cargarEstaciones}>Reintentar</button>
                    </div>
                  )}
                </div>

                <div className="admin-form-group">
                  <label htmlFor="cat-desc" className="admin-form-label">
                    Descripción
                  </label>
                  <textarea
                    id="cat-desc"
                    rows={3}
                    className="admin-form-textarea"
                    placeholder="Breve descripción de los productos que engloba esta sección..."
                    value={formData.descripcion}
                    onChange={(e) =>
                      setFormData({ ...formData, descripcion: e.target.value })
                    }
                  />
                </div>
              </div>

              <div className="admin-modal-actions">
                <button
                  type="button"
                  className="admin-button--secondary-sm"
                  onClick={() => setModalAbierto(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="admin-button--primary" disabled={guardando || !formData.estacionId}>
                  {categoriaEnEdicion ? "Guardar cambios" : "Crear categoría"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {categoriaAEliminar && (
        <div className="admin-modal-overlay" onClick={() => setCategoriaAEliminar(null)}>
          <div
            className="admin-modal-container admin-modal-container--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">¿Eliminar categoría?</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setCategoriaAEliminar(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-delete-alert">
                <AlertCircle size={28} className="admin-delete-alert__icon" />
                <p>
                  Estás a punto de eliminar la categoría{" "}
                  <strong>"{categoriaAEliminar.nombre}"</strong>. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-button--secondary-sm"
                onClick={() => setCategoriaAEliminar(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-button--danger"
                onClick={handleEliminar}
              >
                Sí, eliminar categoría
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
