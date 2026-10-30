import { useState } from "react";
import {
  Search,
  Star,
  Trash2,
  Eye,
  EyeOff,
  AlertCircle,
  MessageSquareQuote,
  CheckCircle2,
} from "lucide-react";
import { comentariosCompletos } from "../mockExtraData";

export default function ReviewsSection() {
  const [comentarios, setComentarios] = useState(comentariosCompletos);
  const [busqueda, setBusqueda] = useState("");
  const [filtroCalificacion, setFiltroCalificacion] = useState("todas");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [comentarioAEliminar, setComentarioAEliminar] = useState(null);

  // Alternar visibilidad (moderar)
  const handleToggleVisibilidad = (id) => {
    setComentarios((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c))
    );
  };

  // Eliminar comentario
  const handleEliminar = () => {
    if (!comentarioAEliminar) return;
    setComentarios((prev) => prev.filter((c) => c.id !== comentarioAEliminar.id));
    setComentarioAEliminar(null);
  };

  // Filtrado
  const comentariosFiltrados = comentarios.filter((c) => {
    const matchBusqueda =
      c.autor.toLowerCase().includes(busqueda.toLowerCase()) ||
      c.comentario.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.producto && c.producto.toLowerCase().includes(busqueda.toLowerCase()));

    const matchCalificacion =
      filtroCalificacion === "todas" ||
      c.calificacion.toString() === filtroCalificacion;

    const matchTipo =
      filtroTipo === "todos" || c.tipo.toLowerCase() === filtroTipo.toLowerCase();

    return matchBusqueda && matchCalificacion && matchTipo;
  });

  const promedioCalificacion = (
    comentarios.reduce((acc, curr) => acc + curr.calificacion, 0) /
    (comentarios.length || 1)
  ).toFixed(1);

  return (
    <div className="admin-section">
      {/* CABECERA */}
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Gestión de Comentarios</h2>
          <p className="admin-section__subtitle">
            Visualiza las calificaciones y comentarios enviados por comensales. Modera y administra su visibilidad.
          </p>
        </div>
      </div>

      {/* KPIS RÁPIDOS DE COMENTARIOS */}
      <div className="admin-overview__kpis">
        <div className="admin-kpi-card">
          <div className="admin-kpi-card__icon admin-kpi-card__icon--gold">
            <Star size={24} />
          </div>
          <div className="admin-kpi-card__info">
            <span className="admin-kpi-card__label">Calificación Promedio</span>
            <span className="admin-kpi-card__value">{promedioCalificacion} ★</span>
            <span className="admin-kpi-card__sub">Basado en {comentarios.length} opiniones</span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-card__icon admin-kpi-card__icon--primary">
            <MessageSquareQuote size={24} />
          </div>
          <div className="admin-kpi-card__info">
            <span className="admin-kpi-card__label">Total Opiniones</span>
            <span className="admin-kpi-card__value">{comentarios.length}</span>
            <span className="admin-kpi-card__sub">
              {comentarios.filter((c) => c.visible).length} visibles en la web
            </span>
          </div>
        </div>

        <div className="admin-kpi-card">
          <div className="admin-kpi-card__icon admin-kpi-card__icon--warning">
            <CheckCircle2 size={24} />
          </div>
          <div className="admin-kpi-card__info">
            <span className="admin-kpi-card__label">Satisfacción 5 Estrellas</span>
            <span className="admin-kpi-card__value">
              {Math.round(
                (comentarios.filter((c) => c.calificacion === 5).length /
                  (comentarios.length || 1)) *
                  100
              )}
              %
            </span>
            <span className="admin-kpi-card__sub">Mayoría de clientes satisfechos</span>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS Y BÚSQUEDA */}
      <div className="admin-toolbar">
        <div className="admin-search-wrapper">
          <Search size={18} className="admin-search-icon" />
          <input
            type="text"
            className="admin-input-search"
            placeholder="Buscar por cliente, comentario o plato..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>

        {/* FILTROS POR ESTRELLAS Y TIPO */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
          <div className="admin-filter-tabs">
            <button
              type="button"
              className={`admin-filter-tab ${filtroTipo === "todos" ? "is-active" : ""}`}
              onClick={() => setFiltroTipo("todos")}
            >
              Todos
            </button>
            <button
              type="button"
              className={`admin-filter-tab ${filtroTipo === "producto" ? "is-active" : ""}`}
              onClick={() => setFiltroTipo("producto")}
            >
              Platos
            </button>
            <button
              type="button"
              className={`admin-filter-tab ${filtroTipo === "general" ? "is-active" : ""}`}
              onClick={() => setFiltroTipo("general")}
            >
              General
            </button>
          </div>

          <div className="admin-filter-tabs">
            <button
              type="button"
              className={`admin-filter-tab ${filtroCalificacion === "todas" ? "is-active" : ""}`}
              onClick={() => setFiltroCalificacion("todas")}
            >
              Todas
            </button>
            <button
              type="button"
              className={`admin-filter-tab ${filtroCalificacion === "5" ? "is-active" : ""}`}
              onClick={() => setFiltroCalificacion("5")}
            >
              5 ★
            </button>
            <button
              type="button"
              className={`admin-filter-tab ${filtroCalificacion === "4" ? "is-active" : ""}`}
              onClick={() => setFiltroCalificacion("4")}
            >
              4 ★
            </button>
            <button
              type="button"
              className={`admin-filter-tab ${filtroCalificacion === "3" ? "is-active" : ""}`}
              onClick={() => setFiltroCalificacion("3")}
            >
              3 ★
            </button>
          </div>
        </div>
      </div>

      {/* TABLA DE COMENTARIOS */}
      <div className="admin-card">
        <div className="admin-table-container">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Calificación</th>
                <th>Tipo / Plato</th>
                <th>Comentario</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {comentariosFiltrados.length > 0 ? (
                comentariosFiltrados.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="admin-table__client">
                        <strong className="admin-table__client-name">{item.autor}</strong>
                        <span>{item.correo}</span>
                      </div>
                    </td>
                    <td>
                      <div className="admin-stars-display" style={{ color: "#b78103", fontWeight: 800 }}>
                        {"★".repeat(item.calificacion)}
                        <span style={{ color: "#dec7be" }}>
                          {"★".repeat(5 - item.calificacion)}
                        </span>
                        <span style={{ marginLeft: "0.4rem", color: "#2C0703", fontSize: "0.85rem" }}>
                          ({item.calificacion}/5)
                        </span>
                      </div>
                    </td>
                    <td>
                      {item.tipo === "Producto" ? (
                        <div>
                          <span className="admin-badge admin-badge--info">Producto</span>
                          <div style={{ fontSize: "0.82rem", color: "#2C0703", fontWeight: 700, marginTop: "0.2rem" }}>
                            {item.producto}
                          </div>
                        </div>
                      ) : (
                        <span className="admin-badge admin-badge--neutral">General Café</span>
                      )}
                    </td>
                    <td>
                      <div
                        style={{
                          maxWidth: "340px",
                          whiteSpace: "normal",
                          fontSize: "0.88rem",
                          lineHeight: "1.4",
                          color: "#2C0703",
                          fontStyle: "italic",
                        }}
                      >
                        "{item.comentario}"
                      </div>
                    </td>
                    <td>
                      <span className="admin-table__date">{item.fecha}</span>
                    </td>
                    <td>
                      {item.visible ? (
                        <span className="admin-badge admin-badge--success">Publicado</span>
                      ) : (
                        <span className="admin-badge admin-badge--danger">Oculto</span>
                      )}
                    </td>
                    <td>
                      <div className="admin-table__actions-row">
                        <button
                          type="button"
                          className="admin-button--secondary-sm"
                          onClick={() => handleToggleVisibilidad(item.id)}
                          title={item.visible ? "Ocultar comentario" : "Publicar comentario"}
                        >
                          {item.visible ? <EyeOff size={15} /> : <Eye size={15} />}
                          <span>{item.visible ? "Ocultar" : "Mostrar"}</span>
                        </button>
                        <button
                          type="button"
                          className="admin-button--icon-danger"
                          onClick={() => setComentarioAEliminar(item)}
                          title="Eliminar comentario"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" className="admin-table__empty">
                    No se encontraron comentarios con los criterios seleccionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL CONFIRMAR ELIMINACIÓN */}
      {comentarioAEliminar && (
        <div
          className="admin-modal-overlay"
          onClick={() => setComentarioAEliminar(null)}
        >
          <div
            className="admin-modal-container admin-modal-container--sm"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <div className="admin-modal-header">
              <h3 className="admin-modal-title">¿Eliminar Comentario?</h3>
            </div>
            <div className="admin-modal-body">
              <div className="admin-delete-alert">
                <AlertCircle size={28} className="admin-delete-alert__icon" />
                <p>
                  Estás a punto de eliminar permanentemente la opinión de{" "}
                  <strong>{comentarioAEliminar.autor}</strong> ({comentarioAEliminar.calificacion} ★).
                  Esta acción no se puede deshacer.
                </p>
              </div>
            </div>
            <div className="admin-modal-footer">
              <button
                type="button"
                className="admin-button--modal-cancel"
                onClick={() => setComentarioAEliminar(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="admin-button--danger"
                onClick={handleEliminar}
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

