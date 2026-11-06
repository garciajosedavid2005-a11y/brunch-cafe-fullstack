import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../../../services/api";
import SectionHeading from "../SectionHeading";
import { formatearFecha } from "../../../utils/fechas";

const reviewDate = (value) => formatearFecha(value);

function SelectorEstrellas({ valor, onCambio }) {
  return (
    <fieldset className="dashboard-rating">
      <legend>Tu calificación</legend>
      <div role="radiogroup" aria-label="Calificación de una a cinco estrellas">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={valor === value}
            aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
            className={value <= valor ? "is-selected" : ""}
            onClick={() => onCambio(value)}
          >
            ★
          </button>
        ))}
      </div>
    </fieldset>
  );
}

// Edición de una reseña propia (0.12): solo calificación y texto
function EdicionResena({ review, onGuardada, onCancelar }) {
  const [calificacion, setCalificacion] = useState(review.calificacion);
  const [comentario, setComentario] = useState(review.comentario);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  const guardar = async (event) => {
    event.preventDefault();
    setGuardando(true);
    setError("");
    try {
      const { review: editada } = await apiRequest(`/v1/cliente/comentarios/${review._id}`, {
        method: "PATCH",
        body: JSON.stringify({ calificacion, comentario }),
      });
      onGuardada(editada);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form className="dashboard-form dashboard-review-edit" aria-label="Editar reseña" onSubmit={guardar}>
      {error && <p className="dashboard-notice is-error dashboard-form__wide" role="alert">{error}</p>}
      <SelectorEstrellas valor={calificacion} onCambio={setCalificacion} />
      <label className="dashboard-form__wide">
        Comentario
        <textarea aria-label="Comentario" value={comentario} onChange={(event) => setComentario(event.target.value)} required minLength={10} maxLength={300} rows="3" />
        <span className="dashboard-character-count">{comentario.length}/300</span>
      </label>
      <div className="dashboard-reservation__actions dashboard-form__wide">
        <button className="dashboard-button" type="submit" disabled={guardando}>{guardando ? "Guardando..." : "Guardar cambios"}</button>
        <button className="dashboard-button dashboard-button--secondary" type="button" onClick={onCancelar}>Descartar</button>
      </div>
    </form>
  );
}

export default function ReviewsSection() {
  const [reviews, setReviews] = useState([]);
  const [menu, setMenu] = useState([]);
  const [tipo, setTipo] = useState("general");
  const [productoRef, setProductoRef] = useState("");
  const [calificacion, setCalificacion] = useState(0);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ message: "", error: false });
  const [editandoId, setEditandoId] = useState("");

  useEffect(() => {
    apiRequest("/v1/cliente/comentarios")
      .then(({ reviews: customerReviews }) => setReviews(customerReviews))
      .catch((error) => setNotice({ message: error.message, error: true }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    apiRequest("/v1/catalogo")
      .then(({ productos }) => setMenu(productos))
      .catch((error) => setNotice({ message: error.message, error: true }));
  }, []);

  const publishReview = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice({ message: "", error: false });
    try {
      const { review } = await apiRequest("/v1/cliente/comentarios", {
        method: "POST",
        body: JSON.stringify({
          tipo,
          ...(tipo === "producto"
            ? { productoRef }
            : {}),
          calificacion,
          comentario,
        }),
      });
      setReviews((current) => [review, ...current]);
      setProductoRef("");
      setCalificacion(0);
      setComentario("");
      setNotice({ message: "Tu comentario fue publicado.", error: false });
    } catch (error) {
      setNotice({ message: error.message, error: true });
      // Ya había reseñado ese producto: se abre su reseña para editarla
      if (error.code === "RESENA_EXISTENTE" && error.details?.id) setEditandoId(error.details.id);
    } finally {
      setSaving(false);
    }
  };

  const reemplazar = (editada) => {
    setReviews((current) => current.map((item) => (item._id === editada._id ? editada : item)));
    setEditandoId("");
    setNotice({ message: "Tu reseña fue actualizada.", error: false });
  };

  return (
    <div>
      <SectionHeading eyebrow="COMPARTE TU EXPERIENCIA" title="Mis comentarios">
        Tu opinión ayuda a otros clientes a conocernos.
      </SectionHeading>
      {notice.message && <p className={`dashboard-notice ${notice.error ? "is-error" : ""}`} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
      <form className="dashboard-form dashboard-review-form" onSubmit={publishReview}>
        <fieldset className="dashboard-review-type">
          <legend>¿Sobre qué quieres comentar?</legend>
          <label>
            <input type="radio" name="tipo-comentario" value="general" checked={tipo === "general"} onChange={() => setTipo("general")} />
            Comentario general
          </label>
          <label>
            <input type="radio" name="tipo-comentario" value="producto" checked={tipo === "producto"} onChange={() => setTipo("producto")} />
            Sobre un platillo o producto
          </label>
        </fieldset>
        {tipo === "producto" && (
          <label className="dashboard-form__wide">
            Producto del menú
            <select value={productoRef} onChange={(event) => setProductoRef(event.target.value)} required>
              <option value="">Selecciona el platillo o producto</option>
              {menu.map((product) => (
                <option key={product.id} value={product.id}>{product.nombre}</option>
              ))}
            </select>
          </label>
        )}
        <SelectorEstrellas valor={calificacion} onCambio={setCalificacion} />
        <label className="dashboard-form__wide">
          Comentario
          <textarea aria-label="Comentario" value={comentario} onChange={(event) => setComentario(event.target.value)} required minLength={10} maxLength={300} rows="4" placeholder="Cuéntanos cómo fue tu experiencia..." />
          <span className="dashboard-character-count">{comentario.length}/300</span>
        </label>
        <p className="dashboard-hours dashboard-form__wide">
          Puedes reseñar los productos de pedidos que ya recibiste (una reseña por producto, que luego puedes editar).
          Los comentarios generales requieren un pedido recibido o una reserva completada.
        </p>
        <button className="dashboard-button" type="submit" disabled={saving || calificacion === 0}>
          {saving ? "Publicando..." : "Publicar comentario"}
        </button>
      </form>

      <h3 className="dashboard-subheading dashboard-subheading--form">Comentarios publicados</h3>
      {loading && <p className="dashboard-empty">Cargando tus comentarios...</p>}
      {!loading && reviews.length === 0 && <p className="dashboard-empty">Todavía no has publicado comentarios.</p>}
      <div className="dashboard-list">
        {reviews.map((review) => (
          <article className="dashboard-card dashboard-review" key={review._id}>
            <div className="dashboard-review__topline">
              <span className="dashboard-review__calificacion">
                <span className="dashboard-stars" aria-label={`${review.calificacion} de 5 estrellas`}>{"★".repeat(review.calificacion)}{"☆".repeat(5 - review.calificacion)}</span>
                {review.verificada && <span className="dashboard-review__verificada">Compra verificada</span>}
              </span>
              <time dateTime={review.createdAt}>{reviewDate(review.createdAt)}</time>
            </div>
            {review.tipo === "producto" && (
              <p className="dashboard-review__product">
                Producto: <Link to={`/menu#producto-${review.productoId}`}>
                  {menu.find((product) => product.codigo === review.productoId)?.nombre || `Producto ${review.productoId}`}
                </Link>
              </p>
            )}
            {editandoId === review._id ? (
              <EdicionResena review={review} onGuardada={reemplazar} onCancelar={() => setEditandoId("")} />
            ) : (
              <>
                <p>{review.comentario}</p>
                <div className="dashboard-reservation__actions dashboard-review__acciones">
                  <button className="dashboard-button dashboard-button--secondary" type="button" onClick={() => setEditandoId(review._id)}>
                    Editar
                  </button>
                </div>
              </>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
