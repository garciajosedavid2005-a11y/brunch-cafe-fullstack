import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import menu from "../../data/menu.json";
import { apiRequest } from "../../services/api";
import useAnimacionEntrada from "../../hooks/useAnimacionEntrada";
import "./Testimonios.css";

const TRANSICION_MS = 350;
const AUTOPLAY_MS = 6000;

const Estrellas = ({ calificacion }) => (
  <div className="testimonios__estrellas" aria-label={`${calificacion} de 5 estrellas`}>
    {Array.from({ length: 5 }, (_, index) => (
      <span
        key={index}
        aria-hidden="true"
        className={`testimonios__estrella ${index < calificacion ? "testimonios__estrella--llena" : "testimonios__estrella--vacia"}`}
      >
        ★
      </span>
    ))}
  </div>
);

const Testimonios = () => {
  const ref = useAnimacionEntrada();
  const [reviews, setReviews] = useState([]);
  const [actual, setActual] = useState(0);
  const [animando, setAnimando] = useState(false);
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

  const cambiarTestimonio = useCallback((indice) => {
    if (animando || reviews.length < 2) return;

    setAnimando(true);
    window.setTimeout(() => {
      setActual(indice);
      requestAnimationFrame(() => setAnimando(false));
    }, TRANSICION_MS);
  }, [animando, reviews.length]);

  const siguiente = useCallback(() => {
    if (reviews.length < 2) return;
    cambiarTestimonio((actual + 1) % reviews.length);
  }, [actual, cambiarTestimonio, reviews.length]);

  useEffect(() => {
    if (animando || reviews.length < 2) return undefined;
    const interval = window.setInterval(siguiente, AUTOPLAY_MS);
    return () => window.clearInterval(interval);
  }, [siguiente, animando, reviews.length]);

  const testimonio = reviews[actual];
  const producto = testimonio?.tipo === "producto"
    ? menu.find((item) => item.id === testimonio.productoId)
    : null;

  return (
    <section ref={ref} className="testimonios-wrap animar-subir">
      <div className="testimonios">
        <div className="testimonios__divisor" aria-hidden="true">
          <span className="testimonios__linea" />
          <span className="testimonios__icono-divisor">✦</span>
          <span className="testimonios__linea" />
        </div>

        <h2 className="testimonios__titulo">Lo que dicen nuestros clientes</h2>

        {loading && <p role="status">Cargando opiniones...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && !testimonio && (
          <p>Aún no hay opiniones publicadas. Visita la <Link to="/comentarios">sección de comentarios</Link>.</p>
        )}

        {testimonio && (
          <>
            <div
              aria-live="polite"
              aria-atomic="true"
              className={`testimonios__cuerpo ${animando ? "testimonios__cuerpo--oculto" : "testimonios__cuerpo--visible"}`}
            >
              <blockquote className="testimonios__blockquote">
                {testimonio.tipo === "producto" && (
                  <p className="testimonios__producto">Sobre: {producto?.nombre || "un producto del menú"}</p>
                )}
                <p className="testimonios__comentario">“{testimonio.comentario}”</p>
                <footer className="testimonios__autor">
                  <cite className="testimonios__nombre">— {testimonio.nombre}</cite>
                  <Estrellas calificacion={testimonio.calificacion} />
                </footer>
              </blockquote>
            </div>

            {reviews.length > 1 && (
              <div className="testimonios__puntos" role="tablist" aria-label="Navegación de opiniones">
                {reviews.map((review, index) => (
                  <button
                    key={review._id}
                    type="button"
                    role="tab"
                    aria-selected={index === actual}
                    aria-label={`Opinión de ${review.nombre}`}
                    className={`testimonios__punto ${index === actual ? "testimonios__punto--activo" : ""}`}
                    onClick={() => cambiarTestimonio(index)}
                  />
                ))}
              </div>
            )}

            <Link className="testimonios__enlace" to="/comentarios">Leer todos los comentarios</Link>
          </>
        )}
      </div>
    </section>
  );
};

export default Testimonios;
