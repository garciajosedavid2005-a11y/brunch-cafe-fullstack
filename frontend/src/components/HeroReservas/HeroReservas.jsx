/**
 * HeroReservas.jsx
 * Hero estático de la página de Reservas.
 * El administrador NO edita este archivo.
 * Solo edita: src/data/heroReservas.json
 */

import heroBg from "../../assets/hero-reservas.jpg";
import datos from "../../data/heroReservas.json";
import "./HeroReservas.css";
import { useMarcarPortada } from "../../context/usePortada";

const HeroReservas = () => {
  useMarcarPortada(); // 2.0b · navbar transparente sobre la foto
  const imagen = datos.imagen || heroBg;

  return (
    <section className="hero-reservas">

      {/* Imagen de fondo */}
      <div className="hero-reservas__fondo">
        <img src={imagen} alt={datos.titulo} className="hero-reservas__imagen" />
      </div>

      {/* Overlay oscuro (controlado desde heroReservas.json) */}
      {datos.overlay && (
        <div className="hero-reservas__overlay" aria-hidden="true" />
      )}

      {/* Texto */}
      <div className="hero-reservas__contenido grid-container">
        <div className="hero-reservas__texto">
          {datos.titulo && (
            <h1 className="hero-reservas__titulo">{datos.titulo}</h1>
          )}
          {datos.subtitulo && (
            <p className="hero-reservas__subtitulo">{datos.subtitulo}</p>
          )}
        </div>
      </div>

      {/* Ola decorativa */}
      <div className="hero-reservas__ola" aria-hidden="true">
        <svg
          viewBox="0 0 1440 100"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M0,0 C480,100 960,0 1440,80 L1440,100 L0,100 Z"
            fill="var(--color-fondo)"
          />
        </svg>
      </div>

    </section>
  );
};

export default HeroReservas;