import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { useCarrito } from "../../context/CarritoContext";
import { useAuth } from "../../context/useAuth";
import compras from "../../assets/carrito-de-compras.png";
import logoOscuro from "../../assets/logoOscuro.png";
import logoClaro from "../../assets/logoClaro.png";
import "./navbar.css";

const rutasTransparentes = [
  "/",
  "/reservas",
  "/nosotros",
  "/comentarios",
];

const Navbar = () => {
    const location = useLocation();
    return <NavbarContent key={location.key} pathname={location.pathname} />;
};

const NavbarContent = ({ pathname }) => {
    const [oculta, setOculta] = useState(false);
    const [menuAbierto, setMenuAbierto] = useState(false);
    const [cerrandoSesion, setCerrandoSesion] = useState(false);
    
    const esTransparente = rutasTransparentes.includes(pathname);
    const { productos } = useCarrito();
    const { user, loading, logout } = useAuth();
    const esAdmin = user?.role === "admin";

    const totalProductos = productos.reduce((acc, p) => acc + p.cantidad, 0);

    const manejarLogout = async () => {
        setCerrandoSesion(true);
        try {
            await logout();
            setMenuAbierto(false);
        } catch (error) {
            alert(error.message || "No se pudo cerrar la sesión. Intenta de nuevo.");
        } finally {
            setCerrandoSesion(false);
        }
    };

    useEffect(() => {
        if (esTransparente || menuAbierto) return;
        let ultimoScroll = window.scrollY;
        const manejarScroll = () => {
            const scrollActual = window.scrollY;
            if (scrollActual > ultimoScroll && scrollActual > 100) {
                setOculta(true);
            } else {
                setOculta(false);
            }
            ultimoScroll = scrollActual;
        };
        window.addEventListener("scroll", manejarScroll);
        return () => window.removeEventListener("scroll", manejarScroll);
    }, [esTransparente, menuAbierto]);

    return (
        <header className={`top-bar ${esTransparente ? "top-bar--transparente" : ""} ${oculta ? "top-bar--oculta" : ""} ${menuAbierto ? "top-bar--abierto" : ""}`}>
            
            {/* 1. BOTÓN HAMBURGUESA (Primero en el DOM para alinearse a la izquierda nativamente) */}
            <button 
                type="button"
                className={`navbar__hamburger ${menuAbierto ? "navbar__hamburger--activo" : ""}`}
                onClick={() => setMenuAbierto(!menuAbierto)}
                aria-label="Abrir menú de navegación"
            >
                <span></span>
                <span></span>
                <span></span>
            </button>

            {/* 2. LOGO (Se renderiza SOLO si el menú está cerrado) */}
            {!menuAbierto && (
                <div className="top-bar-left">
                    {esAdmin ? (
                        <div className="navbar__logo-enlace" style={{ cursor: "default" }}>
                            <div className="navbar__logo-wrapper">
                                <img
                                    src={esTransparente ? logoClaro : logoOscuro}
                                    alt="Brunch Café"
                                    className="navbar__logo"
                                />
                            </div>
                        </div>
                    ) : (
                        <NavLink to="/" className="navbar__logo-enlace">
                            <div className="navbar__logo-wrapper">
                                <img
                                    src={esTransparente ? logoClaro : logoOscuro}
                                    alt="Brunch Café"
                                    className="navbar__logo"
                                />
                            </div>
                        </NavLink>
                    )}
                </div>
            )}

            {/* 3. MENÚ DESPLEGABLE VERTICAL */}
            <nav className={`top-bar-right ${menuAbierto ? "top-bar-right--abierto" : ""}`}>
                <ul className="menu">
                    {esAdmin ? (
                        /* Si es Admin, solo ve Panel Admin */
                        <li>
                            <NavLink className="access" to="/admin" onClick={() => setMenuAbierto(false)}>
                                Panel Admin
                            </NavLink>
                        </li>
                    ) : (
                        /* Menú normal para clientes y visitantes */
                        <>
                            <li><NavLink className="access" to="/">Inicio</NavLink></li>
                            <li><NavLink className="access" to="/menu">Menú</NavLink></li>
                            <li><NavLink className="access" to="/nosotros">Nosotros</NavLink></li>
                            <li><NavLink className="access" to="/reservas">Reservas</NavLink></li>
                            <li><NavLink className="access" to="/comentarios">Comentarios</NavLink></li>
                            {!loading && (user ? (
                                <>
                                    <li><NavLink className="access" to="/cuenta">Mi cuenta</NavLink></li>
                                    <li>
                                        <button
                                            type="button"
                                            className="access navbar__logout"
                                            onClick={manejarLogout}
                                            disabled={cerrandoSesion}
                                        >
                                            {cerrandoSesion ? "Cerrando sesión..." : "Cerrar sesión"}
                                        </button>
                                    </li>
                                </>
                            ) : (
                                <li><NavLink className="access" to="/login">Ingresar</NavLink></li>
                            ))}

                            {/* Carrito integrado */}
                            <li className="menu__item-carrito">
                                <NavLink className="access" to="/domicilios">
                                    <div
                                        key={totalProductos}
                                        className={`navbar__carrito ${totalProductos > 0 ? "navbar__carrito--animando" : ""}`}
                                    >
                                        <img
                                            src={compras}
                                            alt="Carrito de compras"
                                            className="icon-carrito"
                                        />
                                        {totalProductos > 0 && (
                                            <span className="navbar__carrito-badge">
                                                {totalProductos}
                                            </span>
                                        )}
                                    </div>
                                </NavLink>
                            </li>
                        </>
                    )}
                </ul>
            </nav>

        </header>
    );
};

export default Navbar;
