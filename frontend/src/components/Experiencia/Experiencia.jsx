/**
 * Experiencia.jsx
 * Sección de características del café.
 * El administrador edita:
 * src/data/experiencia.json
 */

import experiencia from "../../data/experiencia.json";

import useAnimacionEntrada from "../../hooks/useAnimacionEntrada";
import { Leaf, Bean, Store } from "lucide-react";

import "./Experiencia.css";

const iconMap = {
  Leaf: Leaf,
  Bean: Bean,
  Store: Store,
};

const Experiencia = () => {
  const refTexto =
    useAnimacionEntrada();

  const refImagen =
    useAnimacionEntrada();

  return (
    <section className="experiencia-wrap">

      {/* Contenido */}

      <div
        ref={refTexto}
        className="experiencia animar-izquierda"
      >

        {/* Encabezado */}

        <div
          aria-hidden="true"
          className="experiencia__divisor"
        >
          <span className="experiencia__linea" />

          <span className="experiencia__icono-divisor">
            ✦
          </span>

          <span className="experiencia__linea" />
        </div>

        <h2 className="experiencia__titulo">
          Nuestra experiencia
        </h2>

        {/* Lista */}

        <ul className="experiencia__lista">

          {experiencia.map(
            ({
              id,
              icono,
              titulo,
              descripcion,
            }) => {
              const IconoComponente = iconMap[icono];
              return (

                <li key={id} className="experiencia__item">
                <span aria-hidden="true" className="experiencia__icono">
                  {/* 4. Renderizamos el componente con sus props (tamaño y grosor de línea) */}
                  {IconoComponente && <IconoComponente size={32} strokeWidth={1.5} />}
                </span>

                <div>

                  <h3 className="experiencia__item-titulo">
                    {titulo}
                  </h3>

                  <p className="experiencia__item-descripcion">
                    {descripcion}
                  </p>

                </div>

              </li>
            );
          })}

        </ul>

      </div>

      {/* Imagen */}

      <div
        ref={refImagen}
        className="experiencia__imagen-wrap animar-derecha"
      >

        <img
          loading="lazy"
          src="src/assets/imagenes/experiencia.png"
          alt="Ambiente del café"
          className="experiencia__imagen"
        />

        <div
          aria-hidden="true"
          className="experiencia__degradado"
        />

      </div>

    </section>
  );
};

export default Experiencia;