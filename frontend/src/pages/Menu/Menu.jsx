import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import TarjetaMenu from "../../components/TarjetaMenu/TarjetaMenu";
import { apiAssetUrl, apiRequest } from "../../services/api";
import useAnimacionEntrada from "../../hooks/useAnimacionEntrada";
import "./Menu.css";

const ITEMS_POR_PAGINA = 8;

// Los enlaces /menu#producto-<codigo> usan el código visible del producto
function getVisibleCountForHash(hash, menu) {
  const codigo = Number(hash.replace("#producto-", ""));
  const productIndex = menu.findIndex((product) => product.codigo === codigo);
  if (productIndex === -1) return ITEMS_POR_PAGINA;
  return Math.ceil((productIndex + 1) / ITEMS_POR_PAGINA) * ITEMS_POR_PAGINA;
}

const Menu = () => {
  const location = useLocation();
  const [menu, setMenu] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loadingMenu, setLoadingMenu] = useState(true);
  const [menuError, setMenuError] = useState("");
  const [categoriaActiva, setCategoriaActiva] = useState("Todo");
  const [visibleCount, setVisibleCount] = useState(ITEMS_POR_PAGINA);
  const [productRatings, setProductRatings] = useState({});
  // Cambiarlo vuelve a pedir el menú (botón "Reintentar")
  const [intento, setIntento] = useState(0);
  const heroRef = useAnimacionEntrada();
  const categoriasRef = useAnimacionEntrada();
  const gridRef = useAnimacionEntrada();

  useEffect(() => {
    let active = true;
    apiRequest("/v1/catalogo")
      .then(({ productos, categorias: categoriasMenu }) => {
        if (!active) return;
        setMenu(productos);
        setCategorias(categoriasMenu);
        setVisibleCount(getVisibleCountForHash(location.hash, productos));
      })
      .catch((error) => {
        if (active) setMenuError(error.message);
      })
      .finally(() => {
        if (active) setLoadingMenu(false);
      });

    return () => {
      active = false;
    };
  }, [location.hash, intento]);

  useEffect(() => {
    apiRequest("/comentarios/product-ratings")
      .then(({ productRatings: ratings }) => {
        // Indexadas por el ObjectId del producto (el `id` del catálogo)
        setProductRatings(Object.fromEntries(ratings.map(({ productoRef, average, count }) => [
          productoRef,
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

  const reintentar = () => {
    setLoadingMenu(true);
    setMenuError("");
    setIntento((n) => n + 1);
  };

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
          {["Todo", ...categorias].map((categoria) => (
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
        {loadingMenu && <p role="status">Cargando menú...</p>}
        {!loadingMenu && menuError && (
          <div role="alert">
            <p>No pudimos cargar el menú. {menuError}</p>
            <button type="button" className="menu-ver-mas__boton" onClick={reintentar}>
              Reintentar
            </button>
          </div>
        )}
        {!loadingMenu && !menuError && menu.length === 0 && (
          <p role="status">Todavía no hay productos en el menú. Vuelve pronto.</p>
        )}
        {!loadingMenu && !menuError && menu.length > 0 && productosVisibles.length === 0 && (
          <p>En este momento no hay productos disponibles en esta categoría.</p>
        )}
        {productosVisibles.map((producto, index) => {
          return (
            <TarjetaMenu
              key={producto.id}
              id={producto.id}
              codigo={producto.codigo}
              nombre={producto.nombre}
              descripcion={producto.descripcion}
              precio={producto.precio}
              imagen={apiAssetUrl(producto.imagen)}
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
