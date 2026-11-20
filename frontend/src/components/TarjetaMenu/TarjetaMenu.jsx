import "./TarjetaMenu.css";
import { UtensilsCrossed, Check } from "lucide-react";
import { useAgregarAlCarrito } from "../AgregarAlCarrito/useAgregarAlCarrito";
import { formatearCOP } from "../../utils/moneda";

const TarjetaMenu = ({ id, codigo, nombre, descripcion, precio, imagen, modificadores = [], rating = 5, ratingCount = 0, delay }) => {
  // 1.12 · Con opciones abre el diálogo; sin ellas agrega directo
  const { agregar: handleAgregar, dialogo, agregado } = useAgregarAlCarrito({ id, nombre, descripcion, precio, imagen, modificadores });

  return (
    <article id={`producto-${codigo}`} className={`tarjeta-menu ${delay ? `delay-${delay}` : ""}`} data-id={id}>
      <div className="tarjeta-menu__imagen-wrap" data-vuelo-origen>
        {imagen ? (
          <img
            className="tarjeta-menu__imagen"
            src={imagen}
            alt={`Imagen de ${nombre}`}
            loading="lazy"
          />
        ) : (
          <div className="tarjeta-menu__imagen-placeholder">
            {/* 3.6 · Icono de línea (antes el emoji 🍽️) */}
            <UtensilsCrossed className="tarjeta-menu__imagen-icon" size={40} strokeWidth={1.5} aria-hidden="true" />
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
              {/* 7.1 · «✓ Agregado» durante 1,5 s (el ícono no se lee: el aviso ya lo anuncia) */}
              {agregado ? <><Check size={16} strokeWidth={2.5} aria-hidden="true" className="boton-agregado__icono" /> Agregado</> : "Agregar al carrito"}
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

        <span className="tarjeta-menu__precio">{formatearCOP(precio)}</span>
      </div>
      {dialogo}
    </article>
  );
};

export default TarjetaMenu;
