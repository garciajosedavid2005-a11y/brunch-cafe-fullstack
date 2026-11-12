import { useId, useState, useRef } from "react";
import { Plus, Edit2, Trash2, Search, X, Coffee, Star, AlertCircle, Image as ImageIcon, UploadCloud } from "lucide-react";
import useAdminResource from "../hooks/useAdminResource";
import AdminStatus from "../components/AdminStatus";
import { formatCurrency } from "../adminFormat";
import { apiAssetUrl } from "../../../services/api";
import { useDialogo } from "../../../context/useDialogo";

// Mismo límite que el backend (2 MB por imagen; el cuerpo admite 3 MB)
const MAX_BYTES_IMAGEN = 2 * 1024 * 1024;
const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp", "image/gif"];
// "22000", "22.000", "$ 22.000" → 22000. Decimales, negativos o texto → null
// (antes se quitaban todos los caracteres no numéricos: "12.500,5" se guardaba como 125005)
const leerPrecio = (texto) => {
  const limpio = texto.replace(/[$\s]/g, "");
  return /^(\d+|\d{1,3}(\.\d{3})+)$/.test(limpio) ? Number(limpio.replace(/\./g, "")) : null;
};
const megas = (bytes) => (bytes / (1024 * 1024)).toLocaleString("es-CO", { maximumFractionDigits: 1 });
const nombreGrupo = (g) => (g.activo === false ? `${g.nombre} (inactivo)` : g.nombre);

export default function ProductsSection() {
  const { items: productos, cargando, error, guardando, cargar, crear, actualizar, eliminar } =
    useAdminResource("/v1/admin/productos");
  const {
    items: categorias,
    cargando: cargandoCategorias,
    error: errorCategorias,
    cargar: cargarCategorias,
  } = useAdminResource("/v1/admin/categorias");
  const [busqueda, setBusqueda] = useState("");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");
  const [modalAbierto, setModalAbierto] = useState(false);
  const [productoEnEdicion, setProductoEnEdicion] = useState(null); // null = nuevo
  const [productoAEliminar, setProductoAEliminar] = useState(null);
  const fileInputRef = useRef(null);
  const { avisar } = useDialogo();
  // 1.3 · Estaciones (para sobrescribir la de la categoría) y grupos de modificadores
  const { items: estaciones, error: errorEstaciones, cargar: cargarEstaciones } = useAdminResource("/v1/admin/estaciones");
  const { items: grupos, error: errorGrupos, cargar: cargarGrupos } = useAdminResource("/v1/admin/grupos-modificadores");
  const estacionesActivas = estaciones.filter((e) => e.activa);
  const idTituloModal = useId();

  // Formulario local
  const [formData, setFormData] = useState({
    nombre: "",
    categoria: "",
    precio: "",
    descripcion: "",
    imagen: "",
    destacado: false,
    estacionId: "", // "" = hereda la de la categoría
    grupos: [], // ids en el orden en que se ofrecen
  });
  // Grupos asignados al abrir el formulario (para mostrar los inactivos que ya tenía)
  const [gruposAsignados, setGruposAsignados] = useState([]);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Se valida antes de leerla: así no viaja al servidor una imagen que rechazaría
    const problema = !TIPOS_IMAGEN.includes(file.type)
      ? "El archivo debe ser una imagen PNG, JPG, WEBP o GIF."
      : file.size > MAX_BYTES_IMAGEN
        ? `La imagen pesa ${megas(file.size)} MB y el máximo es 2 MB. Redúcela o comprímela e inténtalo de nuevo.`
        : "";
    if (problema) {
      e.target.value = "";
      avisar({ tipo: "error", titulo: "Imagen no válida", mensaje: problema });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormData((prev) => ({
        ...prev,
        imagen: reader.result,
      }));
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = () => {
    setFormData((prev) => ({
      ...prev,
      imagen: "",
    }));
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const abrirModalCrear = () => {
    setProductoEnEdicion(null);
    setFormData({
      nombre: "",
      categoria: categorias[0]?.id || "",
      precio: "",
      descripcion: "",
      imagen: "",
      destacado: false,
      estacionId: "",
      grupos: [],
    });
    setGruposAsignados([]);
    setModalAbierto(true);
  };

  const abrirModalEditar = (prod) => {
    setProductoEnEdicion(prod);
    setFormData({
      nombre: prod.nombre,
      categoria: prod.categoriaId,
      precio: String(prod.precio),
      descripcion: prod.descripcion || "",
      imagen: prod.imagen || "",
      destacado: prod.destacado || false,
      estacionId: prod.estacionId || "",
      grupos: (prod.gruposModificadores || []).map((g) => g.id),
    });
    setGruposAsignados(prod.gruposModificadores || []);
    setModalAbierto(true);
  };

  // Marcados (en su orden) + activos sin marcar; un inactivo solo aparece mientras siga asignado
  const grupoPorId = new Map([...gruposAsignados, ...grupos].map((g) => [g.id, g]));
  const gruposDelForm = [
    ...formData.grupos.map((id) => grupoPorId.get(id)).filter(Boolean),
    ...grupos.filter((g) => g.activo && !formData.grupos.includes(g.id)),
  ];
  const alternarGrupo = (id) => setFormData((prev) => ({
    ...prev,
    grupos: prev.grupos.includes(id) ? prev.grupos.filter((g) => g !== id) : [...prev.grupos, id],
  }));
  const estacionHeredada = categorias.find((c) => c.id === formData.categoria)?.estacion?.nombre;

  const handleGuardar = async (e) => {
    e.preventDefault();
    if (!formData.nombre.trim() || !formData.precio.trim()) return;

    const precio = leerPrecio(formData.precio);
    if (precio === null || !Number.isSafeInteger(precio)) {
      await avisar({
        tipo: "error",
        titulo: "Precio no válido",
        mensaje: "El precio debe ser un número entero de pesos, sin decimales (por ejemplo 22000 o 22.000).",
      });
      return;
    }
    if (!formData.categoria) return;
    const { categoria, estacionId, grupos: idsGrupos, ...resto } = formData;
    const datos = {
      ...resto,
      precio,
      categoriaId: categoria,
      estacionId: estacionId || null, // null = hereda la de la categoría
      gruposModificadoresIds: idsGrupos,
    };
    const guardado = productoEnEdicion
      ? await actualizar(productoEnEdicion.id, datos)
      : await crear(datos);
    if (guardado) setModalAbierto(false);
  };

  const handleEliminar = async () => {
    if (!productoAEliminar) return;
    if (await eliminar(productoAEliminar.id)) setProductoAEliminar(null);
  };

  const handleToggleDestacado = async (producto) => {
    await actualizar(producto.id, { destacado: !producto.destacado });
  };

  // Agotado ↔ disponible (el backend lo saca del menú y rechaza pedidos con él)
  const handleToggleDisponible = async (producto) => {
    await actualizar(producto.id, { disponible: !producto.disponible });
  };

  // Filtrado
  const productosFiltrados = productos.filter((prod) => {
    const coincideCat =
      filtroCategoria === "Todas" || prod.categoria === filtroCategoria;
    const coincideBusqueda =
      prod.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      prod.descripcion.toLowerCase().includes(busqueda.toLowerCase());
    return coincideCat && coincideBusqueda;
  });

  return (
    <div className="admin-section">
      {/* CABECERA */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Catálogo de Productos</h2>
          <p className="admin-section__subtitle">
            Administra los platos, postres y bebidas que ofrece Brunch Café a sus comensales.
          </p>
        </div>
        <button
          type="button"
          className="admin-button--primary"
          onClick={abrirModalCrear}
        >
          <Plus size={18} />
          <span>Nuevo Producto</span>
        </button>
      </div>

      {/* BARRA DE BÚSQUEDA Y FILTRO POR CATEGORÍA */}
      <AdminStatus cargando={cargando || cargandoCategorias} error={error || errorCategorias} onReintentar={() => {
        cargar();
        cargarCategorias();
      }} />
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder="Buscar producto por nombre o ingrediente..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        <div className="admin-filter-tabs">
          <button
            type="button"
            className={`admin-filter-tab ${filtroCategoria === "Todas" ? "is-active" : ""}`}
            onClick={() => setFiltroCategoria("Todas")}
          >
            Todas
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id}
              type="button"
              className={`admin-filter-tab ${filtroCategoria === cat.nombre ? "is-active" : ""}`}
              onClick={() => setFiltroCategoria(cat.nombre)}
            >
              {cat.nombre}
            </button>
          ))}
        </div>
      </div>

      {/* TABLA DE PRODUCTOS */}
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table admin-table--compacta admin-products__tabla admin-table--acciones-fijas">
            <thead>
              <tr>
                <th>Plato / Producto</th>
                <th>Precio</th>
                <th className="admin-col-estado">Disponible</th>
                <th>Destacado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productosFiltrados.length > 0 ? (
                productosFiltrados.map((prod) => (
                  <tr key={prod.id} className={prod.disponible ? "" : "admin-products__fila--agotada"}>
                    <td>
                      <div className="admin-product-cell">
                        {prod.imagen ? (
                          <img
                            src={apiAssetUrl(prod.imagen)}
                            alt={prod.nombre}
                            className="admin-product-thumbnail"
                            onError={(e) => {
                              e.target.style.display = "none";
                            }}
                          />
                        ) : (
                          <div className="admin-product-thumbnail-placeholder">
                            <Coffee size={18} />
                          </div>
                        )}
                        <div className="admin-product-info">
                          <strong className="admin-table__client-name">{prod.nombre}</strong>
                          <span className="admin-product-desc-preview">
                            {prod.descripcion}
                          </span>
                          <span className="admin-products__etiquetas">
                            <span className="admin-badge admin-badge--neutral">{prod.categoria}</span>
                            {prod.estacionEfectiva && (
                              <span className="admin-badge admin-badge--marca" title={prod.estacionId ? "Estación propia del producto" : "Estación de la categoría"}>
                                {prod.estacionEfectiva.nombre}
                              </span>
                            )}
                            {!prod.disponible && <span className="admin-badge admin-badge--danger">Agotado</span>}
                          </span>
                          {prod.gruposModificadores?.length > 0 && (
                            <span className="admin-products__modificadores">
                              {prod.gruposModificadores.length === 1 ? "1 grupo de modificadores" : `${prod.gruposModificadores.length} grupos de modificadores`}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="admin-table__amount">{formatCurrency(prod.precio)}</span>
                    </td>
                    <td className="admin-col-estado">
                      <button
                        type="button"
                        role="switch"
                        aria-checked={prod.disponible}
                        aria-label={`Disponible: ${prod.nombre}`}
                        title={prod.disponible ? "Marcar como agotado (sale del menú)" : "Marcar como disponible (vuelve al menú)"}
                        className="admin-switch"
                        disabled={guardando}
                        onClick={() => handleToggleDisponible(prod)}
                      >
                        <span className="admin-switch__pista" aria-hidden="true">
                          <span className="admin-switch__perilla" />
                        </span>
                        <span className="admin-switch__texto">{prod.disponible ? "Sí" : "No"}</span>
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`admin-badge-star-btn ${prod.destacado ? "is-active" : ""}`}
                        onClick={() => handleToggleDestacado(prod)}
                        title={prod.destacado ? "Quitar de destacados" : "Marcar como destacado"}
                      >
                        <Star size={14} fill={prod.destacado ? "#f57f17" : "transparent"} />
                        <span>{prod.destacado ? "Destacado" : "Normal"}</span>
                      </button>
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          onClick={() => abrirModalEditar(prod)}
                          title="Editar producto"
                        >
                          <Edit2 size={15} />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          className="admin-button--icon-danger"
                          onClick={() => setProductoAEliminar(prod)}
                          title="Eliminar producto"
                          aria-label={`Eliminar producto ${prod.nombre}`}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="5" className="admin-table__empty">
                    No se encontraron productos con los filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CREAR / EDITAR PRODUCTO */}
      {modalAbierto && (
        <div className="admin-modal-overlay" onClick={() => setModalAbierto(false)}>
          <div
            className="admin-modal-container"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby={idTituloModal}
          >
            <div className="admin-modal-header">
              <div>
                <span className="admin-badge admin-badge--neutral">
                  {productoEnEdicion ? "Modificar" : "Crear nuevo"}
                </span>
                <h3 className="admin-modal-title" id={idTituloModal}>
                  {productoEnEdicion ? "Editar Producto" : "Nuevo Producto"}
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
                <div className="admin-modal-grid">
                  <div className="admin-form-group">
                    <label htmlFor="prod-nombre" className="admin-form-label">
                      Nombre del producto *
                    </label>
                    <input
                      id="prod-nombre"
                      type="text"
                      className="admin-form-input"
                      placeholder="Ej. Tostada de Salmón Ahumado"
                      required
                      value={formData.nombre}
                      onChange={(e) =>
                        setFormData({ ...formData, nombre: e.target.value })
                      }
                    />
                  </div>

                  <div className="admin-form-group">
                    <label htmlFor="prod-categoria" className="admin-form-label">
                      Categoría *
                    </label>
                    <select
                      id="prod-categoria"
                      className="admin-form-select"
                      required
                      value={formData.categoria}
                      onChange={(e) =>
                        setFormData({ ...formData, categoria: e.target.value })
                      }
                    >
                      {categorias.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.nombre}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="admin-modal-grid">
                  <div className="admin-form-group">
                    <label htmlFor="prod-precio" className="admin-form-label">
                      Precio de venta *
                    </label>
                    <input
                      id="prod-precio"
                      type="text"
                      className="admin-form-input"
                      placeholder="Ej. $22.000"
                      required
                      value={formData.precio}
                      onChange={(e) =>
                        setFormData({ ...formData, precio: e.target.value })
                      }
                    />
                  </div>

                  <div className="admin-form-group">
                    <label className="admin-form-label">
                      Imagen del Producto
                    </label>
                    <div className="admin-file-uploader">
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept={TIPOS_IMAGEN.join(",")}
                        aria-label="Imagen del producto"
                        style={{ display: "none" }}
                        onChange={handleFileChange}
                      />
                      {formData.imagen ? (
                        <div className="admin-file-preview-card">
                          <img
                            src={apiAssetUrl(formData.imagen)}
                            alt="Vista previa"
                            className="admin-file-preview-img"
                          />
                          <div className="admin-file-preview-info">
                            <span className="admin-file-preview-name">Imagen seleccionada</span>
                            <span className="admin-file-preview-status">✓ Lista para guardar</span>
                          </div>
                          <button
                            type="button"
                            className="admin-file-remove-btn"
                            onClick={handleRemoveImage}
                            title="Quitar imagen"
                            aria-label="Quitar imagen"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      ) : (
                        <div
                          className="admin-file-dropzone"
                          onClick={() => fileInputRef.current?.click()}
                          role="button"
                          tabIndex={0}
                        >
                          <UploadCloud size={24} className="admin-file-dropzone__icon" />
                          <span className="admin-file-dropzone__text">
                            Haz clic para subir desde tu equipo
                          </span>
                          <span className="admin-file-dropzone__hint">
                            PNG, JPG, WEBP o GIF · máximo 2 MB
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="admin-form-group">
                  <label htmlFor="prod-desc" className="admin-form-label">
                    Descripción / Ingredientes
                  </label>
                  <textarea
                    id="prod-desc"
                    rows={3}
                    className="admin-form-textarea"
                    placeholder="Describe los ingredientes, presentación y notas del plato..."
                    value={formData.descripcion}
                    onChange={(e) =>
                      setFormData({ ...formData, descripcion: e.target.value })
                    }
                  />
                </div>

                {/* 1.3 · Estación (F1-3) y grupos de modificadores (F1-4) */}
                <div className="admin-form-group">
                  <label htmlFor="prod-estacion" className="admin-form-label">
                    Estación
                  </label>
                  <select
                    id="prod-estacion"
                    className="admin-form-select"
                    aria-describedby="prod-estacion-ayuda"
                    value={formData.estacionId}
                    onChange={(e) => setFormData({ ...formData, estacionId: e.target.value })}
                  >
                    <option value="">Heredar de la categoría ({estacionHeredada || "sin estación"})</option>
                    {estacionesActivas.map((e) => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                  <small id="prod-estacion-ayuda" className="admin-form-ayuda">
                    Cámbiala solo si este producto se prepara en una estación distinta a la de su categoría.
                  </small>
                  {errorEstaciones && (
                    <div className="admin-form-aviso" role="alert">
                      <span>No se pudieron cargar las estaciones: {errorEstaciones}</span>
                      <button type="button" className="admin-button--secondary-sm" onClick={cargarEstaciones}>Reintentar</button>
                    </div>
                  )}
                </div>

                <fieldset className="admin-products__grupos">
                  <legend className="admin-form-label">Grupos de modificadores</legend>
                  {/* Si no cargan, se dice (y se conservan los que ya tenía el producto) */}
                  {errorGrupos && (
                    <div className="admin-form-aviso" role="alert">
                      <span>No se pudieron cargar los grupos de modificadores: {errorGrupos}. Se conservan los que ya tiene el producto.</span>
                      <button type="button" className="admin-button--secondary-sm" onClick={cargarGrupos}>Reintentar</button>
                    </div>
                  )}
                  {gruposDelForm.length > 0 ? (
                    <div className="admin-products__grupos-lista">
                      {gruposDelForm.map((g) => (
                        <label key={g.id} className="admin-checkbox-label">
                          <input
                            type="checkbox"
                            checked={formData.grupos.includes(g.id)}
                            onChange={() => alternarGrupo(g.id)}
                          />
                          <span>{nombreGrupo(g)}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    !errorGrupos && <p className="admin-form-ayuda">No hay grupos activos. Créalos en Modificadores.</p>
                  )}
                  <small className="admin-form-ayuda">
                    {formData.grupos.length > 0
                      ? `Orden en la comanda: ${formData.grupos.map((id) => grupoPorId.get(id)).filter(Boolean).map(nombreGrupo).join(" → ")}`
                      : "Sin modificadores. Los grupos se ofrecen en el orden en que los marques."}
                  </small>
                </fieldset>

                <div className="admin-form-checkbox-row">
                  <label className="admin-checkbox-label">
                    <input
                      type="checkbox"
                      checked={formData.destacado}
                      onChange={(e) =>
                        setFormData({ ...formData, destacado: e.target.checked })
                      }
                    />
                    <span>Marcar como <strong>Producto Destacado</strong> (visible en portada)</span>
                  </label>
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
                <button type="submit" className="admin-button--primary" disabled={guardando || categorias.length === 0}>
                  {productoEnEdicion ? "Guardar cambios" : "Crear producto"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL DE CONFIRMACIÓN DE ELIMINACIÓN */}
      {productoAEliminar && (
        <div className="admin-modal-overlay" onClick={() => setProductoAEliminar(null)}>
          <div
            className="admin-modal-container admin-modal-container--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">¿Eliminar producto?</h3>
              <button
                type="button"
                className="admin-modal-close"
                onClick={() => setProductoAEliminar(null)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="admin-modal-body">
              <div className="admin-delete-alert">
                <AlertCircle size={28} className="admin-delete-alert__icon" />
                <p>
                  Estás a punto de eliminar el producto{" "}
                  <strong>"{productoAEliminar.nombre}"</strong> del catálogo. Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="admin-modal-actions">
              <button
                type="button"
                className="admin-button--secondary-sm"
                onClick={() => setProductoAEliminar(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-button--danger"
                onClick={handleEliminar}
              >
                Sí, eliminar producto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
