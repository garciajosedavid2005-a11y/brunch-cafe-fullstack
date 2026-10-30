import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import menu from "../../data/menu.json";
import TarjetaMenu from "../../components/TarjetaMenu/TarjetaMenu";
import { apiRequest } from "../../services/api";
import useAnimacionEntrada from "../../hooks/useAnimacionEntrada";
import "./Menu.css";

const categorias = [
  "Todo",
  "Desayunos",
  "Postres",
  "Pancakes y Waffles",
  "Tostadas",
  "Bowls Saludables",
  "Bebidas",
];

const ITEMS_POR_PAGINA = 8;

function getVisibleCountForHash(hash) {
  const productId = Number(hash.replace("#producto-", ""));
  const productIndex = menu.findIndex((product) => product.id === productId);
  if (productIndex === -1) return ITEMS_POR_PAGINA;
  return Math.ceil((productIndex + 1) / ITEMS_POR_PAGINA) * ITEMS_POR_PAGINA;
}

const Menu = () => {
  const location = useLocation();
  const [categoriaActiva, setCategoriaActiva] = useState("Todo");
  const [visibleCount, setVisibleCount] = useState(() => getVisibleCountForHash(location.hash));
  const [productRatings, setProductRatings] = useState({});
  const heroRef = useAnimacionEntrada();
  const categoriasRef = useAnimacionEntrada();
  const gridRef = useAnimacionEntrada();

  useEffect(() => {
    apiRequest("/reviews/product-ratings")
      .then(({ productRatings: ratings }) => {
        setProductRatings(Object.fromEntries(ratings.map(({ productoId, average, count }) => [
          productoId,
          { average, count },
        ])));
      })
      .catch((error) => console.error("No se pudieron cargar las calificaciones del menú:", error));
  }, []);

  useEffect(() => {
    if (!location.hash.startsWith("#producto-")) return;
    const frame = requestAnimationFrame(() => {
      document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [location.hash, visibleCount]);

  // El hook aplica la clase `visible` a cada sección con `animar`
  // cuando entra en viewport. Esa clase activa las transiciones de
  // opacidad y transform en las secciones principales.

  const productosFiltrados = menu.filter((producto) => {
    const categoriaActual = categoriaActiva.toLowerCase();
    const categoriaProducto = String(producto.categoria).toLowerCase();

    if (categoriaActual === "todo") {
      return true;
    }

    return categoriaProducto === categoriaActual;
  });

  const productosVisibles = productosFiltrados.slice(0, visibleCount);

  const manejarCategoria = (categoria) => {
    setCategoriaActiva(categoria);
    setVisibleCount(ITEMS_POR_PAGINA);
  };

  const mostrarMas = () => {
    setVisibleCount((prevCount) => prevCount + ITEMS_POR_PAGINA);
  };

  return (
    <main className="menu-pagina">
      <div className="mancha mancha-1"></div>
      <div className="mancha mancha-2"></div>
      <div className="mancha mancha-3"></div>
      <div className="mancha mancha-4"></div>
      <section ref={heroRef} className="menu-hero animar">
        <h1 className="menu-hero__titulo">Brunch Café</h1>
        <p className="menu-hero__subtitulo">
          Explora nuestro menú de brunch con recetas frescas, dulces y café de autor.
        </p>
      </section>

      <section ref={categoriasRef} className="menu-categorias animar" aria-label="Categorías del menú">
        <ul className="menu-categorias__lista">
          {categorias.map((categoria) => (
            <li key={categoria}>
              <button
                type="button"
                className={`menu-categoria ${categoriaActiva === categoria ? "menu-categoria--activa" : ""}`}
                onClick={() => manejarCategoria(categoria)}
              >
                {categoria}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section ref={gridRef} className="menu-grid animar">
        {productosVisibles.map((producto, index) => {
          const imagenUrl = producto.imagen
            ? producto.imagen.startsWith("/")
              ? producto.imagen
              : new URL(`../../assets/menu/${producto.imagen}`, import.meta.url).href
            : "";

          return (
            <TarjetaMenu
              key={producto.id}
              id={producto.id}
              nombre={producto.nombre}
              descripcion={producto.descripcion}
              precio={producto.precio}
              imagen={imagenUrl}
              rating={productRatings[producto.id]?.average ?? 5}
              ratingCount={productRatings[producto.id]?.count ?? 0}
              delay={index % 5 + 1}
            />
          );
        })}
      </section>

      {productosFiltrados.length > productosVisibles.length && (
        <div className="menu-ver-mas">
          <button type="button" className="menu-ver-mas__boton" onClick={mostrarMas}>
            Ver más
          </button>
        </div>
      )}
    </main>
  );
};

export default Menu;
