import { createElement, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarDays,
  Gift,
  MapPin,
  MessageSquareText,
  PackageCheck,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import ProfileSection from "./sections/ProfileSection";
import DireccionesSection from "./sections/DireccionesSection";
import PuntosSection from "./sections/PuntosSection";
import OrdersSection from "./sections/OrdersSection";
import ReservationsSection from "./sections/ReservationsSection";
import ReviewsSection from "./sections/ReviewsSection";
import SecuritySection from "./sections/SecuritySection";
import "./CustomerDashboard.css";

const sections = [
  { id: "profile", label: "Mi perfil", icon: UserRound },
  { id: "addresses", label: "Mis direcciones", icon: MapPin }, // 6.4
  { id: "points", label: "Mis puntos", icon: Gift }, // 6.6
  { id: "orders", label: "Mis pedidos", icon: PackageCheck },
  { id: "reservations", label: "Mis reservas", icon: CalendarDays },
  { id: "reviews", label: "Mis comentarios", icon: MessageSquareText },
  { id: "security", label: "Seguridad y configuración", icon: ShieldCheck },
];

const sectionContent = {
  profile: ProfileSection,
  addresses: DireccionesSection,
  points: PuntosSection,
  orders: OrdersSection,
  reservations: ReservationsSection,
  reviews: ReviewsSection,
  security: SecuritySection,
};

export default function CustomerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("profile");
  const [logoutError, setLogoutError] = useState("");
  const CurrentSection = sectionContent[activeSection];

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      setLogoutError(error.message);
    }
  };

  return (
    <main className="customer-dashboard">
      <header className="customer-dashboard__header">
        <div>
          <span className="customer-dashboard__eyebrow">BRUNCH CAFÉ · MI CUENTA</span>
          <h1>Hola, {user?.nombre}</h1>
          <p>Administra tu perfil y consulta tu actividad en Brunch Café.</p>
        </div>
        <button className="dashboard-button dashboard-button--secondary" type="button" onClick={handleLogout}>
          Cerrar sesión
        </button>
      </header>
      {logoutError && <p className="dashboard-notice is-error" role="alert">{logoutError}</p>}

      <div className="customer-dashboard__layout">
        <nav className="customer-dashboard__nav" aria-label="Secciones de mi cuenta">
          {sections.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={activeSection === id ? "is-active" : ""}
              aria-current={activeSection === id ? "page" : undefined}
              onClick={() => setActiveSection(id)}
            >
              {createElement(icon, { size: 19, "aria-hidden": true })}
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <section className="customer-dashboard__content" aria-live="polite">
          <CurrentSection />
        </section>
      </div>
    </main>
  );
}
