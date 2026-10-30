import "./TarjetaMenu.css";
import { useCarrito } from '../../context/CarritoContext'

const TarjetaMenu = ({ id, nombre, descripcion, precio, imagen, rating = 5, ratingCount = 0, delay }) => {
  const { agregarProducto } = useCarrito();

  const handleAgregar = () => {
    agregarProducto({ id, nombre, descripcion, precio, imagen });
  };

  return (
    <article id={`producto-${id}`} className={`tarjeta-menu ${delay ? `delay-${delay}` : ""}`} data-id={id}>
      <div className="tarjeta-menu__imagen-wrap">
        {imagen ? (
          <img
            className="tarjeta-menu__imagen"
            src={imagen}
            alt={`Imagen de ${nombre}`}
            loading="lazy"
          />
        ) : (
          <div className="tarjeta-menu__imagen-placeholder">
            <span className="tarjeta-menu__imagen-icon">🍽️</span>
          </div>
        )}

        <div className="tarjeta-menu__overlay">
          <div className="tarjeta-menu__overlay-body">
            <p className="tarjeta-menu__overlay-text">{descripcion}</p>
            <button
              type="button"
              className="tarjeta-menu__overlay-boton"
              onClick={handleAgregar}
            >
              Agregar al carrito
            </button>
          </div>
        </div>
      </div>

      <div className="tarjeta-menu__contenido">
        <h3 className="tarjeta-menu__nombre">{nombre}</h3>

        <div className="tarjeta-menu__valoracion" aria-label={`Calificación promedio de ${rating.toFixed(1)} de 5 estrellas, basada en ${ratingCount} ${ratingCount === 1 ? "comentario" : "comentarios"}`}>
          {Array.from({ length: 5 }, (_, index) => {
            const fill = Math.min(1, Math.max(0, rating - index));
            return (
              <span
                key={index}
                aria-hidden="true"
                style={{ "--rating-fill": `${fill * 100}%` }}
              >
                ★
              </span>
            );
          })}
        </div>
        <span className="tarjeta-menu__rating-count">
          {ratingCount ? `${rating.toFixed(1)} · ${ratingCount} ${ratingCount === 1 ? "opinión" : "opiniones"}` : "5.0 · Sin opiniones"}
        </span>

        <span className="tarjeta-menu__precio">{precio}</span>
      </div>
    </article>
  );
};

export default TarjetaMenu;
