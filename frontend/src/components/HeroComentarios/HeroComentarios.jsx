import heroBg from "../../assets/hero-Comentarios.jpg";
import datos from "../../data/heroComentarios.json";
import "./HeroComentarios.css";
import { useMarcarPortada } from "../../context/usePortada";

const HeroComentarios = () => {
  useMarcarPortada(); // 2.0b · navbar transparente sobre la foto
  const imagen = datos.imagen || heroBg;
  return (
    <section className="hero-comentarios">
      {/* Imagen de fondo */}
      <div className="hero-comentarios__fondo">
        <img src={imagen} alt={datos.titulo} className="hero-comentarios__imagen" />
      </div>
      {/* Overlay oscuro (controlado desde heroComentarios.json) */}
      {datos.overlay && (
        <div className="hero-comentarios__overlay" aria-hidden="true" />
      )}
      {/* Texto */}
      <div className="hero-comentarios__contenido grid-container">
        <div className="hero-comentarios__texto">
          {datos.titulo && (
            <h1 className="hero-comentarios__titulo">{datos.titulo}</h1>
          )}
          {datos.subtitulo && (
            <p className="hero-comentarios__subtitulo">{datos.subtitulo}</p>
          )}
        </div>
      </div>
      {/* Ola decorativa */}
      <div className="hero-comentarios__ola" aria-hidden="true">
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

export default HeroComentarios;
