/**
 * TarjetaDestacado.jsx
 * Subcomponente — muestra un producto destacado individual.
 * El administrador NO edita este archivo.
 */

import { useAgregarAlCarrito } from "../AgregarAlCarrito/useAgregarAlCarrito";
import { formatearCOP } from "../../utils/moneda";

/* ════════════════════════════════
   Placeholder
════════════════════════════════ */

const PlaceholderImagen = () => (
  <div className="tarjeta-destacado__placeholder">
    <span className="tarjeta-destacado__placeholder-icono">
      ☕
    </span>

    <p className="tarjeta-destacado__placeholder-texto">
      Preparando imagen...
    </p>
  </div>
);

/* ════════════════════════════════
   Componente principal
════════════════════════════════ */

const TarjetaDestacado = ({
  producto,
}) => {
  const {
    nombre,
    descripcion,
    precio,
    categoria,
    imagen,
  } = producto;

  // 1.12 · Con opciones abre el diálogo; sin ellas agrega directo
  const { agregar: handleAgregar, dialogo } = useAgregarAlCarrito(producto);

  return (
    <article className="tarjeta-destacado">

      {/* Imagen */}

      <div className="tarjeta-destacado__imagen-wrap">

        {imagen ? (
          <img
            loading="lazy"
            src={imagen}
            alt={`Plato: ${nombre}`}
            className="tarjeta-destacado__imagen"
          />
        ) : (
          <PlaceholderImagen />
        )}

        <div className="tarjeta-destacado__overlay">
          <div className="tarjeta-destacado__overlay-body">
            <p className="tarjeta-destacado__overlay-text">
              {descripcion}
            </p>
            <button
              type="button"
              className="tarjeta-destacado__overlay-boton"
              onClick={handleAgregar}
            >
              Agregar al carrito
            </button>
          </div>
        </div>

        <span className="tarjeta-destacado__categoria">
          {categoria}
        </span>

      </div>

      {/* Contenido */}

      <div className="tarjeta-destacado__cuerpo">

        <div>

          <h3 className="tarjeta-destacado__nombre">
            {nombre}
          </h3>

          <p className="tarjeta-destacado__descripcion">
            {descripcion}
          </p>

        </div>

        <footer className="tarjeta-destacado__pie">

          <span className="tarjeta-destacado__precio">
            {formatearCOP(precio)}
          </span>

          <span
            aria-hidden="true"
            className="tarjeta-destacado__accion"
          >
            <span className="tarjeta-destacado__link-texto">
              Ver detalle
            </span>

            <i className="fi-rr-arrow-small-right" />
          </span>

        </footer>

      </div>

      {dialogo}
    </article>
  );
};

export default TarjetaDestacado;