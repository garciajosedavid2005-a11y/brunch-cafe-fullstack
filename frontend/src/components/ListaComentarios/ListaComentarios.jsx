import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import menu from "../../data/menu.json";
import { apiRequest } from "../../services/api";
import "./ListaComentarios.css";

const Estrellas = ({ calificacion }) => (
  <div className="lista-comentarios__estrellas" aria-label={`${calificacion} de 5 estrellas`}>
    {Array.from({ length: 5 }, (_, index) => (
      <span
        key={index}
        className={`lista-comentarios__estrella ${index < calificacion ? "lista-comentarios__estrella--llena" : "lista-comentarios__estrella--vacia"}`}
        aria-hidden="true"
      >
        ★
      </span>
    ))}
  </div>
);

const ListaComentarios = () => {
  const [reviews, setReviews] = useState([]);
  const [visibleCount, setVisibleCount] = useState(6);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    apiRequest("/reviews")
      .then(({ reviews: publishedReviews }) => {
        if (active) setReviews(publishedReviews);
      })
      .catch((requestError) => {
        if (active) setError(requestError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="lista-comentarios-seccion">
      <div className="grid-container">
        <div className="lista-comentarios__divisor" aria-hidden="true">
          <span className="lista-comentarios__linea" />
          <span className="lista-comentarios__icono-divisor">✦</span>
          <span className="lista-comentarios__linea" />
        </div>

        <h2 className="lista-comentarios__titulo">Lo que dicen nuestros clientes</h2>
        <p className="lista-comentarios__descripcion">
          Opiniones compartidas por clientes de Brunch Café.
        </p>

        {loading && <p className="lista-comentarios__estado" role="status">Cargando comentarios...</p>}
        {error && <p className="lista-comentarios__estado lista-comentarios__estado--error" role="alert">{error}</p>}
        {!loading && !error && reviews.length === 0 && (
          <p className="lista-comentarios__estado">Aún no hay comentarios publicados. ¡Sé el primero en compartir tu experiencia desde tu cuenta!</p>
        )}

        <div className="grid-x grid-padding-x">
          {reviews.slice(0, visibleCount).map((review) => {
            const product = review.tipo === "producto"
              ? menu.find((item) => item.id === review.productoId)
              : null;

            return (
              <div key={review._id} className="cell small-12 medium-6 large-4">
                <article className="lista-comentarios__tarjeta">
                  <div className="lista-comentarios__avatar" aria-hidden="true">
                    {(review.nombre || "?")[0].toLocaleUpperCase("es-CO")}
                  </div>
                  <div className="lista-comentarios__info">
                    <span className="lista-comentarios__nombre">{review.nombre}</span>
                    <Estrellas calificacion={review.calificacion} />
                  </div>
                  {product && <p className="lista-comentarios__producto">Sobre: {product.nombre}</p>}
                  <p className="lista-comentarios__comentario">{review.comentario}</p>
                  <time className="lista-comentarios__fecha" dateTime={review.createdAt}>
                    {new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" }).format(new Date(review.createdAt))}
                  </time>
                </article>
              </div>
            );
          })}
        </div>

        {!loading && !error && visibleCount < reviews.length && (
          <div className="lista-comentarios__ver-mas">
            <button className="button hollow" type="button" onClick={() => setVisibleCount((count) => count + 6)}>
              Ver más comentarios
            </button>
          </div>
        )}

        <p className="lista-comentarios__cta">
          ¿Ya visitaste el café? <Link to="/login">Inicia sesión</Link> y publica tu comentario desde “Mis comentarios” en tu dashboard.
        </p>
      </div>
    </section>
  );
};

export default ListaComentarios;
