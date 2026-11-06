import { useEffect } from "react";
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
import WaiterDashboard from "./pages/WaiterDashboard/WaiterDashboard";
import RecuperarContrasena from "./pages/RecuperarContrasena/RecuperarContrasena";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/useAuth";
import { CarritoProvider } from "./context/CarritoContext";
import { DialogoProvider } from "./context/DialogoContext";

import "./styles/index.css";
import "./styles/variables.css";

function CustomerRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="customer-dashboard-loading">Cargando tu cuenta...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "admin") return <Navigate to="/admin" replace />;
  if (user.role === "mesero") return <Navigate to="/mesero" replace />;
  return children;
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="customer-dashboard-loading">Verificando permisos...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "admin") return <Navigate to={user.role === "mesero" ? "/mesero" : "/cuenta"} replace />;
  return children;
}

function WaiterRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <main className="customer-dashboard-loading">Verificando permisos...</main>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== "mesero") return <Navigate to={user.role === "admin" ? "/admin" : "/cuenta"} replace />;
  return children;
}

function dashboardPath(role) {
  if (role === "admin") return "/admin";
  if (role === "mesero") return "/mesero";
  return "/cuenta";
}

function GuestRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return children;
  return <Navigate to={dashboardPath(user.role)} replace />;
}

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user && user.role !== "cliente") return <Navigate to={dashboardPath(user.role)} replace />;
  return <Inicio />;
}

function DomiciliosRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  if (user?.role === "mesero") return <Navigate to="/mesero" replace />;
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
  if (user?.role === "admin") return <Navigate to="/admin" replace />;
  if (user?.role === "mesero" && !user.permisos?.includes("reserva:crear")) {
    return <Navigate to="/mesero" replace />;
  }
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

function AppRoutes() {
  const { user } = useAuth();
  const esPersonal = user?.role === "admin" || user?.role === "mesero";

  return (
    <>
      <Navbar />
      <div className="main-content">
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
          <Route path="/mesero" element={<WaiterRoute><WaiterDashboard /></WaiterRoute>} />
          <Route path="/dashboard/mesero" element={<WaiterRoute><WaiterDashboard /></WaiterRoute>} />
        </Routes>
      </div>
      {!esPersonal && <Footer />}
    </>
  );
}

function App() {
  return (
    <BrowserRouter>
      <DialogoProvider>
        <AuthProvider>
          <CarritoProvider>
            <AppRoutes />
          </CarritoProvider>
        </AuthProvider>
      </DialogoProvider>
    </BrowserRouter>
  );
}

export default App;
