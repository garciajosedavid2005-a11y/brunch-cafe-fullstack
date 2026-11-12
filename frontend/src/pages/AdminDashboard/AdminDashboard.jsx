import { useRef, useState } from "react";
import {
  LayoutDashboard,
  ShoppingBag,
  CalendarDays,
  Coffee,
  Tags,
  MessageSquareQuote,
  CreditCard,
  Sliders,
  Shield,
  Users,
  UserRound,
  LogOut,
  ShieldCheck,
  Clock,
  LayoutGrid,
  ListPlus,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { useNavigate } from "react-router-dom";
import OverviewSection from "./sections/OverviewSection";
import OrdersSection from "./sections/OrdersSection";
import ReservationsSection from "./sections/ReservationsSection";
import ProductsSection from "./sections/ProductsSection";
import CategoriesSection from "./sections/CategoriesSection";
import ModificadoresSection from "./sections/ModificadoresSection";
import ReviewsSection from "./sections/ReviewsSection";
import PaymentsSection from "./sections/PaymentsSection";
import StatesSection from "./sections/StatesSection";
import RolesSection from "./sections/RolesSection";
import UsersSection from "./sections/UsersSection";
import HorariosSection from "./sections/HorariosSection";
import SalonSection from "./sections/SalonSection";
import ProfileSection from "./sections/ProfileSection";
import useAnchoAccionesFijas from "./hooks/useAnchoAccionesFijas";
import "./AdminDashboard.css";

const sections = [
  { id: "overview", label: "Resumen", icon: LayoutDashboard },
  { id: "orders", label: "Pedidos", icon: ShoppingBag },
  { id: "reservations", label: "Reservas", icon: CalendarDays },
  { id: "products", label: "Productos", icon: Coffee },
  { id: "categories", label: "Categorías", icon: Tags },
  { id: "modificadores", label: "Modificadores", icon: ListPlus }, // 1.3
  { id: "reviews", label: "Comentarios", icon: MessageSquareQuote },
  { id: "payments", label: "Métodos de Pago", icon: CreditCard },
  { id: "states", label: "Estados", icon: Sliders },
  { id: "horarios", label: "Horarios", icon: Clock },
  { id: "salon", label: "Salón", icon: LayoutGrid },
  { id: "users", label: "Usuarios", icon: Users },
  { id: "roles", label: "Roles", icon: Shield },
  { id: "profile", label: "Mi Perfil", icon: UserRound },
];

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("overview");
  // 1.6b · Ancho de «Acciones» en cada tabla para fijar la columna de estado a su izquierda
  const contenidoRef = useRef(null);
  useAnchoAccionesFijas(contenidoRef);

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  const renderContent = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewSection onNavigateTab={setActiveTab} />;
      case "orders":
        return <OrdersSection />;
      case "reservations":
        return <ReservationsSection />;
      case "products":
        return <ProductsSection />;
      case "categories":
        return <CategoriesSection />;
      case "modificadores":
        return <ModificadoresSection />;
      case "reviews":
        return <ReviewsSection />;
      case "payments":
        return <PaymentsSection />;
      case "states":
        return <StatesSection />;
      case "horarios":
        return <HorariosSection />;
      case "salon":
        return <SalonSection />;
      case "roles":
        return <RolesSection />;
      case "users":
        return <UsersSection />;
      case "profile":
        return <ProfileSection />;
      default:
        return <OverviewSection onNavigateTab={setActiveTab} />;
    }
  };

  return (
    <main className="admin-dashboard">
      {/* 1. BANNER SUPERIOR CON INFORMACIÓN DEL ADMINISTRADOR */}
      <header className="admin-dashboard__top-banner">
        <div className="admin-dashboard__top-info">
          <div className="admin-dashboard__badge">
            <ShieldCheck size={16} />
            <span>Panel de Administración</span>
          </div>
          <h1>Hola, {user?.nombre || "Administrador"}</h1>
          <p>
            Centro de control general de Brunch Café. Administra pedidos, reservas, catálogo y configuración.
          </p>
        </div>
        <div className="admin-dashboard__top-actions">
          <div className="admin-dashboard__user-pill">
            <span className="admin-dashboard__user-dot"></span>
            <span>{user?.email}</span>
          </div>
          <button
            type="button"
            className="admin-button--logout"
            onClick={handleLogout}
            title="Cerrar sesión de administrador"
          >
            <LogOut size={16} />
            <span>Salir</span>
          </button>
        </div>
      </header>

      {/* 2. LAYOUT CON SIDEBAR Y CONTENIDO DINÁMICO */}
      <div className="admin-dashboard__layout">
        {/* SIDEBAR DE LAS 10 SECCIONES */}
        <aside className="admin-dashboard__sidebar">
          <span className="admin-sidebar__title">Módulos del Sistema</span>
          <nav className="admin-sidebar__nav" aria-label="Navegación del panel de administración">
            {sections.map((section) => {
              const SectionIcon = section.icon;
              return (
                <button
                  key={section.id}
                  type="button"
                  className={`admin-sidebar__button ${activeTab === section.id ? "is-active" : ""}`}
                  onClick={() => setActiveTab(section.id)}
                >
                  <div className="admin-sidebar__button-left">
                    <SectionIcon size={18} className="admin-sidebar__icon" />
                    <span>{section.label}</span>
                  </div>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* ÁREA DE CONTENIDO */}
        <section ref={contenidoRef} className="admin-dashboard__content" aria-live="polite">
          {renderContent()}
        </section>
      </div>
    </main>
  );
}
