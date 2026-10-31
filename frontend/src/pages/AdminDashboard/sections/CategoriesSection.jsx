import { useState } from "react";
import { Plus, Edit2, Trash2, Search, X, Tags, AlertCircle, Check } from "lucide-react";
import { categoriasIniciales } from "../mockCatalogData";

export default function CategoriesSection() {
  const [categorias, setCategorias] = useState(categoriasIniciales);
  const [busqueda, setBusqueda] = useState("");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [categoriaEnEdicion, setCategoriaEnEdicion] = useState(null); // null = crear nueva
  const [categoriaAEliminar, setCategoriaAEliminar] = useState(null);

  // Formulario local
  const [formData, setFormData] = useState({
    nombre: "",
    descripcion: "",
  });

  const abrirModalCrear = () => {
    setCategoriaEnEdicion(null);
    setFormData({ nombre: "", descripcion: "" });
    setModalAbierto(true);
  };

  const abrirModalEditar = (cat) => {
    setCategoriaEnEdicion(cat);
    setFormData({
      nombre: cat.nombre,
      descripcion: cat.descripcion,
    });
    setModalAbierto(true);
  };

  const handleGuardar = (e) => {
    e.preventDefault();
    if (!formData.nombre.trim()) return;

    if (categoriaEnEdicion) {
      // Editar
      setCategorias((prev) =>
        prev.map((c) =>
          c.id === categoriaEnEdicion.id
            ? { ...c, ...formData }
            : c
        )
      );
    } else {
      // Crear
      const nueva = {
        id: Date.now(),
        ...formData,
      };
      setCategorias((prev) => [...prev, nueva]);
    }
    setModalAbierto(false);
  };

  const handleEliminar = () => {
    if (!categoriaAEliminar) return;
    setCategorias((prev) => prev.filter((c) => c.id !== categoriaAEliminar.id));
    setCategoriaAEliminar(null);
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
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
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
          >
            <div className="admin-modal-header">
              <div>
                <span className="admin-badge admin-badge--neutral">
                  {categoriaEnEdicion ? "Modificar" : "Crear nueva"}
                </span>
                <h3 className="admin-modal-title">
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
                <button type="submit" className="admin-button--primary">
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

