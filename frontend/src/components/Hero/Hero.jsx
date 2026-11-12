import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

import DIAPOSITIVAS from "../../data/heroSlides.json";

import "./Hero.css";
import { useMarcarPortada } from "../../context/usePortada";

/* ════════════════════════════════
   Configuración
════════════════════════════════ */

const TRANSICION_MS = 400;
const AUTOPLAY_MS = 5000;

/* ════════════════════════════════
   Placeholder
════════════════════════════════ */

const PlaceholderImagen = ({ indice }) => (
  <div
    className="hero__placeholder"
    aria-label={`Imagen de la diapositiva ${indice + 1}`}
  >
    <div className="hero__placeholder-icono">
      🖼
    </div>

    <p className="hero__placeholder-etiqueta">
      Imagen de la diapositiva {indice + 1}
    </p>

    <p className="hero__placeholder-pista">
      {`Agrega la ruta en heroSlides.json → [${indice}].image`}
    </p>
  </div>
);

/* ════════════════════════════════
   Botones
════════════════════════════════ */

const BotonesDiapositiva = ({
  botones = [],
}) => {
  if (!botones.length) return null;

  return (
    <div className="hero__acciones">
      {botones.map(
        ({ href, label }, i) => (
          <a
            key={href || i}
            href={href}
            className={`hero__boton ${
              i === 0
                ? "hero__boton--primario"
                : "hero__boton--contorno"
            }`}
          >
            {label}
          </a>
        )
      )}
    </div>
  );
};

/* ════════════════════════════════
   Ola decorativa
════════════════════════════════ */

const HeroWave = () => (
  <div
    className="hero__ola"
    aria-hidden="true"
  >
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
);

/* ════════════════════════════════
   Componente principal
════════════════════════════════ */

const Hero = ({
  estatico = false,
  titulo,
  colorFondo,
  centrado = false,
}) => {
  // 2.0b · Portada con foto (o fondo bordó): el navbar va transparente con texto claro
  useMarcarPortada();
  const [actual, setActual] =
    useState(0);

  const [animando, setAnimando] =
    useState(false);

  const total = DIAPOSITIVAS.length;

  /* ───────── Navegación ───────── */

  const cambiarSlide = useCallback(
    (nuevoIndice) => {
      if (animando) return;

      setAnimando(true);

      setTimeout(() => {
        setActual(nuevoIndice);

        requestAnimationFrame(() => {
          setAnimando(false);
        });
      }, TRANSICION_MS);
    },
    [animando]
  );

  const siguiente = useCallback(() => {
    cambiarSlide(
      (actual + 1) % total
    );
  }, [actual, total, cambiarSlide]);

  const anterior = useCallback(() => {
    cambiarSlide(
      (actual - 1 + total) % total
    );
  }, [actual, total, cambiarSlide]);

  /* ───────── Autoplay ───────── */

  useEffect(() => {
    if (estatico) return;

    const intervalo = setInterval(
      siguiente,
      AUTOPLAY_MS
    );

    return () =>
      clearInterval(intervalo);
  }, [siguiente, estatico]);

  /* ───────── Slide actual ───────── */

  const diapositiva = useMemo(
    () => DIAPOSITIVAS[actual],
    [actual]
  );

  /* ════════════════════════════════
     HERO ESTÁTICO
  ════════════════════════════════ */

  if (estatico) {
    return (
      <section
        className="hero hero--pequeño"
        style={{
          background:
            colorFondo ||
            "var(--color-primario)",
        }}
      >
        <div
          className={`hero__contenido hero__contenido--visible grid-container ${
            centrado
              ? "hero__contenido--centrado"
              : ""
          }`}
        >
          <div
            className={`hero__texto ${
              centrado
                ? "hero__texto--centrado"
                : ""
            }`}
          >
            {titulo && (
              <h1 className="hero__titulo">
                {titulo}
              </h1>
            )}
          </div>
        </div>

        <HeroWave />
      </section>
    );
  }

  /* ════════════════════════════════
     HERO CARRUSEL
  ════════════════════════════════ */

  return (
    <section
      className="hero"
      aria-label="Carrusel principal"
    >

      {/* Fondo */}

      <div
        className={`hero__fondo ${
          animando
            ? "hero__fondo--desvanecido"
            : ""
        }`}
      >
        {diapositiva.image ? (
          <img
            src={diapositiva.image}
            alt={
              diapositiva.title ||
              `Diapositiva ${actual + 1}`
            }
            className="hero__imagen"
          />
        ) : (
          <PlaceholderImagen
            indice={actual}
          />
        )}
      </div>

      {/* Overlay */}

      {diapositiva.image &&
        diapositiva.overlay && (
          <div
            className="hero__overlay"
            aria-hidden="true"
          />
        )}

      {/* Contenido */}

      {diapositiva.showText && (
        <div
          className={`hero__contenido grid-container ${
            animando
              ? "hero__contenido--oculto"
              : "hero__contenido--visible"
          }`}
        >
          <div className="hero__texto">

            {diapositiva.title && (
              <h1 className="hero__titulo">
                {diapositiva.title}
              </h1>
            )}

            {diapositiva.subtitle && (
              <p className="hero__subtitulo">
                {diapositiva.subtitle}
              </p>
            )}

            <BotonesDiapositiva
              botones={
                diapositiva.buttons
              }
            />

          </div>
        </div>
      )}

      {/* Decoración */}

      <HeroWave />

      {/* Flechas */}

      <button
        onClick={anterior}
        aria-label="Diapositiva anterior"
        className="hero__flecha hero__flecha--anterior"
      >
        &#8592;
      </button>

      <button
        onClick={siguiente}
        aria-label="Diapositiva siguiente"
        className="hero__flecha hero__flecha--siguiente"
      >
        &#8594;
      </button>

      {/* Indicadores */}

      <div
        role="tablist"
        className="hero__puntos"
        aria-label="Navegación del carrusel"
      >
        {DIAPOSITIVAS.map(
          ({ id }, i) => (
            <button
              key={id}
              role="tab"
              aria-selected={
                i === actual
              }
              aria-label={`Ir a la diapositiva ${
                i + 1
              }`}
              className={`hero__punto ${
                i === actual
                  ? "hero__punto--activo"
                  : ""
              }`}
              onClick={() =>
                cambiarSlide(i)
              }
            />
          )
        )}
      </div>

    </section>
  );
};

export default Hero;