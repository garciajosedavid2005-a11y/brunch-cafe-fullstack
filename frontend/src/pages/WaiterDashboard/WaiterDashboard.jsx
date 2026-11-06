import { createElement, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarCheck2,
  CalendarDays,
  Clock3,
  ListOrdered,
  LogOut,
  Plus,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { apiRequest } from "../../services/api";
import { formatearFechaCalendario, formatearHoraTexto, hoyLocal } from "../../utils/fechas";
import ProfileSection from "../CustomerDashboard/sections/ProfileSection";
import SecuritySection from "../CustomerDashboard/sections/SecuritySection";
import "./WaiterDashboard.css";
import "../CustomerDashboard/CustomerDashboard.css";

const moneda = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
});

const fechaDeReserva = (fecha) => {
  if (typeof fecha === "string" && /^\d{4}-\d{2}-\d{2}/.test(fecha)) return fecha.slice(0, 10);
  const date = new Date(fecha);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(date);
};

const permisosDe = (user) => user?.permisos || [];

export default function WaiterDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const permisos = permisosDe(user);
  const puedeVerReservas = permisos.includes("reserva:ver");
  const puedeCrearReservas = permisos.includes("reserva:crear");
  const puedeVerPedidos = permisos.includes("pedido:ver");
  const [seccion, setSeccion] = useState("resumen");
  const [estadoReservas, setEstadoReservas] = useState(() => ({
    permiso: puedeVerReservas,
    datos: [],
    cargando: puedeVerReservas,
    error: "",
  }));
  const [estadoPedidos, setEstadoPedidos] = useState(() => ({
    permiso: puedeVerPedidos,
    datos: [],
    cargando: puedeVerPedidos,
    error: "",
  }));
  const [errorPanel, setErrorPanel] = useState("");
  const [pedidoActualizando, setPedidoActualizando] = useState("");
  const [errorPedido, setErrorPedido] = useState("");

  useEffect(() => {
    if (!puedeVerReservas) return undefined;

    let activa = true;
    apiRequest("/v1/staff/reservas")
      .then((resultado) => {
        if (activa) setEstadoReservas({ permiso: true, datos: resultado, cargando: false, error: "" });
      })
      .catch((error) => {
        if (activa) setEstadoReservas({ permiso: true, datos: [], cargando: false, error: error.message });
      });

    return () => {
      activa = false;
    };
  }, [puedeVerReservas]);

  useEffect(() => {
    if (!puedeVerPedidos) return undefined;

    let activa = true;
    apiRequest("/v1/staff/pedidos?limite=20")
      .then((resultado) => {
        if (activa) setEstadoPedidos({ permiso: true, datos: resultado, cargando: false, error: "" });
      })
      .catch((error) => {
        if (activa) setEstadoPedidos({ permiso: true, datos: [], cargando: false, error: error.message });
      });

    return () => {
      activa = false;
    };
  }, [puedeVerPedidos]);

  const reservas = useMemo(
    () => puedeVerReservas ? estadoReservas.datos : [],
    [puedeVerReservas, estadoReservas.datos],
  );
  const pedidos = puedeVerPedidos ? estadoPedidos.datos : [];
  const cargandoReservas = puedeVerReservas
    && (estadoReservas.permiso !== puedeVerReservas || estadoReservas.cargando);
  const cargandoPedidos = puedeVerPedidos
    && (estadoPedidos.permiso !== puedeVerPedidos || estadoPedidos.cargando);
  const errorReservas = puedeVerReservas ? estadoReservas.error : "";
  const errorPedidos = puedeVerPedidos ? estadoPedidos.error : "";

  const reservasHoy = useMemo(() => {
    const hoy = hoyLocal();
    return reservas
      .filter((reserva) => fechaDeReserva(reserva.fecha) === hoy)
      .sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  }, [reservas]);

  const personasHoy = reservasHoy.reduce((total, reserva) => total + (Number(reserva.personas) || 0), 0);
  const pedidosActivos = pedidos.filter((pedido) => !pedido.esFinal).length;
  const siguienteReserva = reservasHoy.find((reserva) => {
    const horaBogota = new Intl.DateTimeFormat("en-GB", {
      timeZone: "America/Bogota",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date());
    return String(reserva.hora) >= horaBogota;
  });

  const navigation = [
    { id: "resumen", label: "Resumen", icon: CalendarCheck2 },
    ...(puedeVerReservas || puedeCrearReservas
      ? [{ id: "reservas", label: "Reservas", icon: CalendarDays }]
      : []),
    ...(puedeVerPedidos ? [{ id: "pedidos", label: "Pedidos", icon: ListOrdered }] : []),
    { id: "perfil", label: "Mi perfil", icon: UserRound },
    { id: "seguridad", label: "Seguridad", icon: ShieldCheck },
  ];

  const handleLogout = async () => {
    setErrorPanel("");
    try {
      await logout();
      navigate("/login");
    } catch (error) {
      setErrorPanel(error.message);
    }
  };

  const cambiarEstadoPedido = async (pedido, transicion) => {
    setPedidoActualizando(pedido.id);
    setErrorPedido("");
    try {
      const actualizado = await apiRequest(`/v1/staff/pedidos/${pedido.id}/estado`, {
        method: "PATCH",
        body: JSON.stringify({ codigo: transicion.codigo }),
      });
      setEstadoPedidos((estado) => ({
        ...estado,
        datos: estado.datos.map((item) => item.id === actualizado.id ? actualizado : item),
      }));
    } catch (error) {
      setErrorPedido(error.message);
    } finally {
      setPedidoActualizando("");
    }
  };

  return (
    <main className="customer-dashboard waiter-dashboard">
      <header className="customer-dashboard__header waiter-dashboard__header">
        <div>
          <span className="customer-dashboard__eyebrow">BRUNCH CAFÉ · ÁREA DE SALA</span>
          <h1>Hola, {user?.nombre || "Mesero"}</h1>
          <p>Resumen del turno y acceso a los módulos habilitados para tu rol.</p>
        </div>
        <div className="waiter-dashboard__header-actions">
          {puedeCrearReservas && (
            <button
              className="dashboard-button waiter-dashboard__reserve-button"
              type="button"
              onClick={() => navigate("/reservas")}
            >
              <Plus size={18} />
              Nueva reserva
            </button>
          )}
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

      {errorPanel && <p className="dashboard-notice is-error" role="alert">{errorPanel}</p>}

      <div className="customer-dashboard__layout">
        <nav className="customer-dashboard__nav" aria-label="Secciones del panel de mesero">
          <span className="waiter-dashboard__nav-title">Panel de sala</span>
          {navigation.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              className={seccion === id ? "is-active" : ""}
              aria-current={seccion === id ? "page" : undefined}
              onClick={() => setSeccion(id)}
            >
              {createElement(icon, { size: 19, "aria-hidden": true })}
              <span>{label}</span>
            </button>
          ))}
          <div className="waiter-dashboard__nav-note">
            <strong>{user?.roleLabel || "Mesero"}</strong>
            <span>El menú muestra solo los módulos autorizados para tu cuenta.</span>
          </div>
        </nav>

        <section className="customer-dashboard__content" aria-live="polite">
          {seccion === "resumen" && (
            <div>
              <div className="waiter-dashboard__section-heading">
                <div>
                  <span className="customer-dashboard__eyebrow">TU TURNO</span>
                  <h2>Resumen del turno</h2>
                  <p>Estado de reservas y pedidos disponibles para tu rol.</p>
                </div>
                <span className="waiter-dashboard__date-pill">
                  <CalendarDays size={16} />
                  {formatearFechaCalendario(hoyLocal(), "long")}
                </span>
              </div>

              <div className="waiter-dashboard__stats">
                {puedeVerReservas && (
                  <>
                    <article className="waiter-dashboard__stat">
                      <span className="waiter-dashboard__stat-icon"><CalendarDays size={19} /></span>
                      <span>Reservas de hoy</span>
                      <strong>{cargandoReservas ? "…" : reservasHoy.length}</strong>
                    </article>
                    <article className="waiter-dashboard__stat">
                      <span className="waiter-dashboard__stat-icon"><Users size={19} /></span>
                      <span>Personas esperadas</span>
                      <strong>{cargandoReservas ? "…" : personasHoy}</strong>
                    </article>
                  </>
                )}
                {puedeVerPedidos && (
                  <article className="waiter-dashboard__stat">
                    <span className="waiter-dashboard__stat-icon"><ListOrdered size={19} /></span>
                    <span>Pedidos activos</span>
                    <strong>{cargandoPedidos ? "…" : pedidosActivos}</strong>
                  </article>
                )}
                {puedeVerReservas && (
                  <article className="waiter-dashboard__stat">
                    <span className="waiter-dashboard__stat-icon"><Clock3 size={19} /></span>
                    <span>Próxima reserva</span>
                    <strong>
                      {cargandoReservas
                        ? "…"
                        : siguienteReserva
                          ? formatearHoraTexto(siguienteReserva.hora)
                          : "Sin próximas"}
                    </strong>
                  </article>
                )}
              </div>

              {errorReservas && <p className="dashboard-notice is-error" role="alert">{errorReservas}</p>}
              {errorPedidos && <p className="dashboard-notice is-error" role="alert">{errorPedidos}</p>}

              {puedeVerReservas && (
                <div className="waiter-dashboard__welcome">
                  <div className="waiter-dashboard__welcome-icon"><CalendarCheck2 size={22} /></div>
                  <div>
                    <strong>Agenda de reservas</strong>
                    <p>
                      {cargandoReservas
                        ? "Cargando reservas..."
                        : `${reservasHoy.length} ${reservasHoy.length === 1 ? "reserva" : "reservas"} para hoy.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="dashboard-button dashboard-button--secondary"
                    onClick={() => setSeccion("reservas")}
                  >
                    Ver reservas
                  </button>
                </div>
              )}
              {puedeVerPedidos && (
                <div className="waiter-dashboard__welcome">
                  <div className="waiter-dashboard__welcome-icon"><ListOrdered size={22} /></div>
                  <div>
                    <strong>Pedidos del equipo</strong>
                    <p>
                      {cargandoPedidos
                        ? "Cargando pedidos..."
                        : `${pedidosActivos} ${pedidosActivos === 1 ? "pedido activo" : "pedidos activos"}.`}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="dashboard-button dashboard-button--secondary"
                    onClick={() => setSeccion("pedidos")}
                  >
                    Ver pedidos
                  </button>
                </div>
              )}
              {!puedeVerReservas && !puedeVerPedidos && (
                <p className="dashboard-empty">Tu cuenta aún no tiene módulos operativos asignados.</p>
              )}
            </div>
          )}

          {seccion === "reservas" && (
            <div>
              <div className="waiter-dashboard__section-heading">
                <div>
                  <span className="customer-dashboard__eyebrow">AGENDA DE SALA</span>
                  <h2>Reservas</h2>
                  <p>Consulta las reservas registradas y su estado actual.</p>
                </div>
                {puedeCrearReservas && (
                  <button className="dashboard-button" type="button" onClick={() => navigate("/reservas")}>
                    <Plus size={17} />
                    Registrar reserva
                  </button>
                )}
              </div>

              {errorReservas && <p className="dashboard-notice is-error" role="alert">{errorReservas}</p>}
              {!puedeVerReservas && puedeCrearReservas && (
                <p className="dashboard-empty">Puedes registrar reservas, pero tu rol no incluye permiso para consultar la agenda.</p>
              )}
              {cargandoReservas && <p className="dashboard-empty">Cargando reservas...</p>}
              {puedeVerReservas && !cargandoReservas && !errorReservas && reservas.length === 0 && (
                <p className="dashboard-empty">No hay reservas registradas.</p>
              )}
              {puedeVerReservas && (
                <div className="waiter-dashboard__reservations">
                  {reservas.map((reserva) => (
                    <article className="waiter-dashboard__reservation" key={reserva.id}>
                      <div className="waiter-dashboard__reservation-time">
                        <Clock3 size={17} />
                        <strong>{formatearHoraTexto(reserva.hora)}</strong>
                      </div>
                      <div className="waiter-dashboard__reservation-info">
                        <div className="waiter-dashboard__reservation-title">
                          <h3>{reserva.cliente}</h3>
                          <span className={`waiter-dashboard__status waiter-dashboard__status--${reserva.estadoCodigo === "confirmada" ? "confirmed" : "pending"}`}>
                            {reserva.estado}
                          </span>
                        </div>
                        <p>{formatearFechaCalendario(reserva.fecha, "long")} · {reserva.correo}</p>
                        <div className="waiter-dashboard__reservation-meta">
                          <span><Users size={15} />{reserva.personas} {reserva.personas === 1 ? "persona" : "personas"}</span>
                          <span>{reserva.motivo}</span>
                          <span>{reserva.codigo}</span>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}

          {seccion === "pedidos" && (
            <div>
              <div className="waiter-dashboard__section-heading">
                <div>
                  <span className="customer-dashboard__eyebrow">OPERACIÓN</span>
                  <h2>Pedidos</h2>
                  <p>Los cambios de estado disponibles dependen de tus permisos.</p>
                </div>
              </div>
              {errorPedidos && <p className="dashboard-notice is-error" role="alert">{errorPedidos}</p>}
              {errorPedido && <p className="dashboard-notice is-error" role="alert">{errorPedido}</p>}
              {cargandoPedidos && <p className="dashboard-empty">Cargando pedidos...</p>}
              {!cargandoPedidos && !errorPedidos && pedidos.length === 0 && (
                <p className="dashboard-empty">No hay pedidos para mostrar.</p>
              )}
              <div className="waiter-dashboard__reservations">
                {pedidos.map((pedido) => (
                  <article className="waiter-dashboard__reservation waiter-dashboard__order" key={pedido.id}>
                    <div className="waiter-dashboard__reservation-time">
                      <ListOrdered size={17} />
                      <strong>{pedido.codigo}</strong>
                    </div>
                    <div className="waiter-dashboard__reservation-info">
                      <div className="waiter-dashboard__reservation-title">
                        <h3>{pedido.cliente}</h3>
                        <span className="waiter-dashboard__status waiter-dashboard__status--pending">{pedido.estado}</span>
                      </div>
                      <p>{formatearFechaCalendario(pedido.fecha, "long")} · {moneda.format(pedido.total)}</p>
                      <div className="waiter-dashboard__reservation-meta">
                        {pedido.items?.map((item) => (
                          <span key={`${pedido.id}-${item.nombre}`}>{item.cantidad} × {item.nombre}</span>
                        ))}
                      </div>
                      {pedido.transiciones?.length > 0 && (
                        <div className="waiter-dashboard__order-actions">
                          {pedido.transiciones.map((transicion) => (
                            <button
                              className="dashboard-button dashboard-button--secondary"
                              key={transicion.codigo}
                              type="button"
                              disabled={pedidoActualizando === pedido.id}
                              onClick={() => cambiarEstadoPedido(pedido, transicion)}
                            >
                              {pedidoActualizando === pedido.id ? "Guardando..." : transicion.nombre}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}

          {seccion === "perfil" && <ProfileSection />}
          {seccion === "seguridad" && <SecuritySection />}
        </section>
      </div>
    </main>
  );
}
