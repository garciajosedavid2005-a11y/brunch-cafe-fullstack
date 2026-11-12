import {
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

import { apiAssetUrl, apiRequest } from "../../services/api";

import TarjetaDestacado from "./TarjetaDestacado";

import useAnimacionEntrada from "../../hooks/useAnimacionEntrada";

import "./Destacados.css";

/* ════════════════════════════════
   Configuración
════════════════════════════════ */

const TARJETAS_VISIBLES = 4;
const AUTOPLAY_MS = 3000;

/* ════════════════════════════════
   Componente principal
════════════════════════════════ */

const Destacados = () => {
  const refEncabezado =
    useAnimacionEntrada();

  const refSlider =
    useAnimacionEntrada();

  /* ───────── Datos ───────── */

  const [menu, setMenu] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiRequest("/v1/catalogo?incluir=modificadores") // 1.12: grupos de opciones de cada plato
      .then(({ productos }) => {
        if (active) setMenu(productos);
      })
      .catch((error) => console.error("No se pudieron cargar los productos destacados:", error))
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const destacados = useMemo(() => menu.filter(({ destacado }) => destacado), [menu]);

  const total = destacados.length;

  const productosLoop = useMemo(
    () => [...destacados, ...destacados],
    [destacados]
  );

  /* ───────── Estado ───────── */

  const [indiceActual, setIndiceActual] =
    useState(0);

  /* ───────── Navegación ───────── */

  const siguiente = useCallback(() => {
    if (total < 2) return;
    setIndiceActual((prev) =>
      (prev + 1) % total
    );
  }, [total]);

  const anterior = useCallback(() => {
    if (total < 2) return;
    setIndiceActual((prev) =>
      (prev - 1 + total) % total
    );
  }, [total]);

  /* ───────── Autoplay ───────── */

  useEffect(() => {
    const intervalo = setInterval(
      siguiente,
      AUTOPLAY_MS
    );

    return () =>
      clearInterval(intervalo);
  }, [siguiente]);

  /* ───────── Early return ───────── */

  if (loading || !total) return null;

  /* ───────── Transform ───────── */

  const desplazamiento =
    indiceActual *
    (100 / TARJETAS_VISIBLES);

  return (
    <section
      id="destacados"
      className="destacados"
    >

      <div className="grid-container">

        {/* Encabezado */}

        <header
          ref={refEncabezado}
          className="destacados__encabezado animar-subir"
        >

          <div
            aria-hidden="true"
            className="destacados__divisor"
          >
            <span className="destacados__linea" />

            <span className="destacados__icono">
              ✦
            </span>

            <span className="destacados__linea" />
          </div>

          <h2 className="destacados__titulo">
            Nuestros Destacados
          </h2>

          <p className="destacados__subtitulo">
            Lo más pedido por nuestros clientes
          </p>

        </header>

        {/* Slider */}

        <div
          ref={refSlider}
          className="destacados__slider animar-subir retraso-2"
        >

          {/* Flecha anterior */}

          <button
            onClick={anterior}
            aria-label="Producto anterior"
            className="destacados__flecha destacados__flecha--anterior"
          >
            &#8592;
          </button>

          {/* Ventana */}

          <div className="destacados__ventana">

            <div
              className="destacados__pista"
              style={{
                transform: `translateX(-${desplazamiento}%)`,
              }}
            >
              {productosLoop.map(
                (producto, i) => (
                  <div
                    key={`${producto.id}-${i}`}
                    className="destacados__celda"
                  >
                    <TarjetaDestacado
                      producto={{ ...producto, imagen: apiAssetUrl(producto.imagen) }}
                    />
                  </div>
                )
              )}
            </div>

          </div>

          {/* Flecha siguiente */}

          <button
            onClick={siguiente}
            aria-label="Producto siguiente"
            className="destacados__flecha destacados__flecha--siguiente"
          >
            &#8594;
          </button>

        </div>

      </div>

    </section>
  );
};

export default Destacados;