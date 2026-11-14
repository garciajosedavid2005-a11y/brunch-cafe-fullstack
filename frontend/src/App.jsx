import { PortadaProvider } from "./context/PortadaContext";
import NoEncontrada from "./pages/NoEncontrada/NoEncontrada";
import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Navbar from "./components/Navbar/Navbar";
import Footer from "./components/Footer/Footer";
import Inicio from "./pages/Inicio/Inicio";
import Menu from "./pages/Menu/Menu";
import Nosotros from "./pages/Nosotros/Nosotros";
import Reservas from "./pages/Reservas/Reservas";
import Domicilios from "./pages/Domicilios/Domicilios";
import Comentarios from "./pages/Comentarios/Comentarios";
import Login from "./pages/Login/Login";
import Perfil from "./pages/Perfil/Perfil";
import Registro from "./pages/Registro/Registro";
import CustomerDashboard from "./pages/CustomerDashboard/CustomerDashboard";
import AdminDashboard from "./pages/AdminDashboard/AdminDashboard";
import StaffDashboard from "./pages/StaffDashboard/StaffDashboard";
import Kds from "./pages/Kds/Kds";
import RecuperarContrasena from "./pages/RecuperarContrasena/RecuperarContrasena";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";
import { CarritoProvider } from "./context/CarritoContext";
import { DialogoProvider } from "./context/DialogoContext";
import { esAdministrador, esPersonal, puedeEntrarAKds, puedeEntrarAStaff, rutaInicio, tienePermiso } from "./utils/permisos";

// 2.6c · Página de prueba del plano: solo en desarrollo (en el build, la rama se elimina con su import)
const PruebaPlano = import.meta.env.DEV ? lazy(() => import("./pages/PruebaPlano/PruebaPlano")) : null;

import "./styles/index.css";
import "./styles/variables.css";

// Rutas por permisos (0.15d): "*" → /admin; personal → /staff; cliente → /cuenta
function CustomerRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="customer-dashboard-loading">Cargando tu cuenta...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (rutaInicio(user) !== "/cuenta") return <Navigate to={rutaInicio(user)} replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="customer-dashboard-loading">Verificando permisos...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (!esAdministrador(user)) return <Navigate to={rutaInicio(user)} replace />;
  return children;
}

function StaffRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="customer-dashboard-loading">Verificando permisos...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (!puedeEntrarAStaff(user)) return <Navigate to={rutaInicio(user)} replace />;
  return children;
}

// 2.5 · Pantalla de cocina: personal con kds:ver (y el administrador)
function KdsRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="customer-dashboard-loading">Verificando permisos...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (!puedeEntrarAKds(user)) return <Navigate to={rutaInicio(user)} replace />;
  return children;
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return children;
  return <Navigate to={rutaInicio(user)} replace />;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && rutaInicio(user) !== "/cuenta") return <Navigate to={rutaInicio(user)} replace />;
  return <Inicio />;
}

function DomiciliosRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && rutaInicio(user) !== "/cuenta") return <Navigate to={rutaInicio(user)} replace />;
  return <Domicilios />;
}

function ReservationsRoute() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || user) return undefined;
    const timer = window.setTimeout(() => {
      navigate("/login", { replace: true, state: { from: location.pathname } });
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [loading, user, navigate, location.pathname]);

  if (loading) return <main className="customer-dashboard-loading">Verificando tu cuenta...</main>;
  if (esAdministrador(user)) return <Navigate to="/admin" replace />;
  if (esPersonal(user) && !tienePermiso(user, "reserva:crear")) return <Navigate to="/staff" replace />;
  if (user) return <Reservas />;

  return (
    <main className="reservation-auth-notice" role="alert">
      <div>
        <span aria-hidden="true">✦</span>
        <h1>Inicia sesión para reservar</h1>
        <p>Para crear una reserva, primero ingresa a tu cuenta de Brunch Café.</p>
        <p className="reservation-auth-notice__redirect">Te llevaremos al inicio de sesión...</p>
      </div>
    </main>
  );
}

// 1.6 · /staff (y /kds, 2.5) tienen su propio layout de tablet: sin la navegación ni el pie del sitio público
const RUTAS_STAFF = ["/staff", "/dashboard/staff", "/kds"];
const esRutaStaff = (ruta) => RUTAS_STAFF.some((r) => ruta === r || ruta.startsWith(`${r}/`));

function AppRoutes() {
  const { user } = useAuth();
  const location = useLocation();
  const sinPie = esAdministrador(user) || esPersonal(user);
  const enTablet = puedeEntrarAStaff(user) && esRutaStaff(location.pathname); // F1-19: también el admin

  return (
    <>
      {!enTablet && <Navbar />}
      <div className={`main-content${enTablet ? " main-content--staff" : ""}`}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/menu" element={<Menu />} />
          <Route path="/nosotros" element={<Nosotros />} />
          <Route path="/reservas" element={<ReservationsRoute />} />
          <Route path="/comentarios" element={<Comentarios />} />
          <Route path="/domicilios" element={<DomiciliosRoute />} />
          <Route path="/login" element={<GuestRoute><Login /></GuestRoute>} />
          <Route path="/recuperar-contrasena" element={<RecuperarContrasena />} />
          <Route path="/restablecer-contrasena" element={<RecuperarContrasena />} />
          <Route path="/registro" element={<GuestRoute><Registro /></GuestRoute>} />
          <Route path="/perfil" element={<CustomerRoute><Perfil /></CustomerRoute>} />
          <Route path="/cuenta" element={<CustomerRoute><CustomerDashboard /></CustomerRoute>} />
          <Route path="/dashboard/cliente" element={<CustomerRoute><CustomerDashboard /></CustomerRoute>} />
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/dashboard/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/staff" element={<StaffRoute><StaffDashboard /></StaffRoute>} />
          <Route path="/dashboard/staff" element={<StaffRoute><StaffDashboard /></StaffRoute>} />
          <Route path="/kds" element={<KdsRoute><Kds /></KdsRoute>} />
          {/* Rutas anteriores del panel (rama developers) */}
          <Route path="/mesero" element={<Navigate to="/staff" replace />} />
          <Route path="/dashboard/mesero" element={<Navigate to="/staff" replace />} />
          {PruebaPlano && <Route path="/prueba-plano" element={<Suspense fallback={null}><PruebaPlano /></Suspense>} />}
          {/* 2.0b · Ruta desconocida */}
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
      </div>
      {!sinPie && <Footer />}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <DialogoProvider>
        <AuthProvider>
          <CarritoProvider>
            <PortadaProvider>
              <AppRoutes />
            </PortadaProvider>
          </CarritoProvider>
        </AuthProvider>
      </DialogoProvider>
    </BrowserRouter>
  );
}

export default App;
