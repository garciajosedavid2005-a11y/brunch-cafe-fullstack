import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import menu from "../../../data/menu.json";
import { apiRequest } from "../../../services/api";
import SectionHeading from "../SectionHeading";

const reviewDate = (value) => new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(value));

export default function ReviewsSection() {
  const [reviews, setReviews] = useState([]);
  const [tipo, setTipo] = useState("general");
  const [productoId, setProductoId] = useState("");
  const [calificacion, setCalificacion] = useState(0);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState({ message: "", error: false });

  useEffect(() => {
    apiRequest("/customer/comentarios")
      .then(({ reviews: customerReviews }) => setReviews(customerReviews))
      .catch((error) => setNotice({ message: error.message, error: true }))
      .finally(() => setLoading(false));
  }, []);

  const publishReview = async (event) => {
    event.preventDefault();
    setSaving(true);
    setNotice({ message: "", error: false });
    try {
      const { review } = await apiRequest("/customer/comentarios", {
        method: "POST",
        body: JSON.stringify({
          tipo,
          ...(tipo === "producto"
            ? { productoId: Number(productoId) }
            : {}),
          calificacion,
          comentario,
        }),
      });
      setReviews((current) => [review, ...current]);
      setProductoId("");
      setCalificacion(0);
      setComentario("");
      setNotice({ message: "Tu comentario fue publicado.", error: false });
    } catch (error) {
      setNotice({ message: error.message, error: true });
    } finally {
      setSaving(false);
    }
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
            <select value={productoId} onChange={(event) => setProductoId(event.target.value)} required>
              <option value="">Selecciona el platillo o producto</option>
              {menu.map((product) => (
                <option key={product.id} value={product.id}>{product.nombre}</option>
              ))}
            </select>
          </label>
        )}
        <fieldset className="dashboard-rating">
          <legend>Tu calificación</legend>
          <div role="radiogroup" aria-label="Calificación de una a cinco estrellas">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={calificacion === value}
                aria-label={`${value} ${value === 1 ? "estrella" : "estrellas"}`}
                className={value <= calificacion ? "is-selected" : ""}
                onClick={() => setCalificacion(value)}
              >
                ★
              </button>
            ))}
          </div>
        </fieldset>
        <label className="dashboard-form__wide">
          Comentario
          <textarea value={comentario} onChange={(event) => setComentario(event.target.value)} required minLength={10} maxLength={300} rows="4" placeholder="Cuéntanos cómo fue tu experiencia..." />
          <span className="dashboard-character-count">{comentario.length}/300</span>
        </label>
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
              <span className="dashboard-stars" aria-label={`${review.calificacion} de 5 estrellas`}>{"★".repeat(review.calificacion)}{"☆".repeat(5 - review.calificacion)}</span>
              <time dateTime={review.createdAt}>{reviewDate(review.createdAt)}</time>
            </div>
            {review.tipo === "producto" && (
              <p className="dashboard-review__product">
                Producto: <Link to={`/menu#producto-${review.productoId}`}>
                  {menu.find((product) => product.id === review.productoId)?.nombre || `Producto ${review.productoId}`}
                </Link>
              </p>
            )}
            <p>{review.comentario}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
