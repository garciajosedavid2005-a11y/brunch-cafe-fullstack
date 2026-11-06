import { createElement, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck2,
  CalendarDays,
  Clock3,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import "./WaiterDashboard.css";
import "../CustomerDashboard/CustomerDashboard.css";

const reservations = [
  {
    id: "RES-241",
    hora: "09:00 a. m.",
    cliente: "Valentina Rojas",
    correo: "valentina@example.com",
    personas: 2,
    motivo: "Brunch de cumpleaños",
    estado: "Confirmada",
  },
  {
    id: "RES-242",
    hora: "10:00 a. m.",
    cliente: "Andrés Martínez",
    correo: "andres@example.com",
    personas: 4,
    motivo: "Reunión familiar",
    estado: "Pendiente",
  },
  {
    id: "RES-243",
    hora: "11:00 a. m.",
    cliente: "Camila Torres",
    correo: "camila@example.com",
    personas: 3,
    motivo: "Encuentro con amigos",
    estado: "Confirmada",
  },
];

const navigation = [
  { id: "resumen", label: "Resumen", icon: CalendarCheck2 },
  { id: "reservas", label: "Reservas de hoy", icon: CalendarDays },
];

export default function WaiterDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("resumen");
  const [logoutError, setLogoutError] = useState("");

  const handleLogout = async () => {
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      setLogoutError(error.message);
    }
  };

  return (
    <main className="customer-dashboard waiter-dashboard">
      <header className="customer-dashboard__header waiter-dashboard__header">
        <div>
          <span className="customer-dashboard__eyebrow">BRUNCH CAFÉ · ÁREA DE SALA</span>
          <h1>Hola, {user?.nombre || "Mesero"}</h1>
          <p>Tu espacio para organizar las reservas y dar la bienvenida a cada visita.</p>
        </div>
        <div className="waiter-dashboard__header-actions">
          <button
            className="dashboard-button waiter-dashboard__reserve-button"
            type="button"
            onClick={() => navigate("/reservas")}
          >
            <Plus size={18} />
            Nueva reserva
          </button>
          <button
            className="dashboard-button dashboard-button--secondary"
            type="button"
            onClick={handleLogout}
          >
            <LogOut size={17} />
            Cerrar sesión
          </button>
        </div>
      </header>

      {logoutError && <p className="dashboard-notice is-error" role="alert">{logoutError}</p>}

      <div className="customer-dashboard__layout">
        <nav className="customer-dashboard__nav" aria-label="Secciones del panel de mesero">
          <span className="waiter-dashboard__nav-title">Panel de sala</span>
          {navigation.map(({ id, label, icon }) => (
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
          <div className="waiter-dashboard__nav-note">
            <strong>Acceso de mesero</strong>
            <span>Puedes registrar y consultar reservas.</span>
          </div>
        </nav>

        <section className="customer-dashboard__content" aria-live="polite">
          {activeSection === "resumen" ? (
            <div>
              <div className="waiter-dashboard__section-heading">
                <div>
                  <span className="customer-dashboard__eyebrow">TU TURNO</span>
                  <h2>Un buen servicio empieza aquí</h2>
                  <p>Vista de ejemplo para ayudarte a organizar la sala.</p>
                </div>
                <span className="waiter-dashboard__date-pill">
                  <CalendarDays size={16} />
                  Agenda de hoy
                </span>
              </div>

              <div className="waiter-dashboard__stats">
                <article className="waiter-dashboard__stat">
                  <span className="waiter-dashboard__stat-icon"><CalendarDays size={19} /></span>
                  <span>Reservas de hoy</span>
                  <strong>{reservations.length}</strong>
                </article>
                <article className="waiter-dashboard__stat">
                  <span className="waiter-dashboard__stat-icon"><Users size={19} /></span>
                  <span>Personas esperadas</span>
                  <strong>{reservations.reduce((total, reservation) => total + reservation.personas, 0)}</strong>
                </article>
                <article className="waiter-dashboard__stat">
                  <span className="waiter-dashboard__stat-icon"><Clock3 size={19} /></span>
                  <span>Próxima reserva</span>
                  <strong>{reservations[0].hora}</strong>
                </article>
              </div>

              <div className="waiter-dashboard__welcome">
                <div className="waiter-dashboard__welcome-icon"><CalendarCheck2 size={22} /></div>
                <div>
                  <strong>Todo listo para recibir a tus comensales</strong>
                  <p>Consulta la agenda de hoy o registra una nueva reserva desde el formulario.</p>
                </div>
                <button
                  type="button"
                  className="dashboard-button dashboard-button--secondary"
                  onClick={() => setActiveSection("reservas")}
                >
                  Ver agenda
                </button>
              </div>
            </div>
          ) : (
            <div>
              <div className="waiter-dashboard__section-heading">
                <div>
                  <span className="customer-dashboard__eyebrow">AGENDA DE SALA</span>
                  <h2>Reservas de hoy</h2>
                  <p>Datos de muestra para la primera versión del panel.</p>
                </div>
                <button
                  type="button"
                  className="dashboard-button"
                  onClick={() => navigate("/reservas")}
                >
                  <Plus size={17} />
                  Registrar reserva
                </button>
              </div>

              <div className="waiter-dashboard__reservations">
                {reservations.map((reservation) => (
                  <article className="waiter-dashboard__reservation" key={reservation.id}>
                    <div className="waiter-dashboard__reservation-time">
                      <Clock3 size={17} />
                      <strong>{reservation.hora}</strong>
                    </div>
                    <div className="waiter-dashboard__reservation-info">
                      <div className="waiter-dashboard__reservation-title">
                        <h3>{reservation.cliente}</h3>
                        <span className={`waiter-dashboard__status waiter-dashboard__status--${reservation.estado === "Confirmada" ? "confirmed" : "pending"}`}>
                          {reservation.estado}
                        </span>
                      </div>
                      <p>{reservation.correo}</p>
                      <div className="waiter-dashboard__reservation-meta">
                        <span><Users size={15} />{reservation.personas} {reservation.personas === 1 ? "persona" : "personas"}</span>
                        <span>{reservation.motivo}</span>
                        <span>{reservation.id}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <p className="waiter-dashboard__demo-note">
                La agenda mostrada es estática en esta versión inicial.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
