import { createElement, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Ban,
  CalendarCheck2,
  ChefHat,
  CalendarDays,
  Clock3,
  LayoutGrid,
  ListOrdered,
  ReceiptText,
  ShieldHalf,
  Plus,
  ShieldCheck,
  UserRound,
  UserRoundCog,
  Users,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { apiRequest } from "../../services/api";
import { fechaLocal, formatearFechaCalendario, formatearHoraTexto, horaLocal, hoyLocal } from "../../utils/fechas";
import { formatearCOP } from "../../utils/moneda";
import { esAdministrador, tienePermiso } from "../../utils/permisos";
import { textoModificadores } from "../../utils/modificadores";
import { claseEstado } from "../AdminDashboard/components/estadoUtils";
import ProfileSection from "../CustomerDashboard/sections/ProfileSection";
import SecuritySection from "../CustomerDashboard/sections/SecuritySection";
import PlanoMesas from "./plano/PlanoMesas";
import AvisoListos from "./plano/AvisoListos";
import PanelAgotados from "./agotados/PanelAgotados";
import LimiteErrores from "../../components/LimiteErrores/LimiteErrores";
import { useSonidoKds } from "../Kds/useSonidoKds";
import CuentasAbiertas from "./cuentas/CuentasAbiertas";
import Logo from "../../components/Logo/Logo";
import "./StaffDashboard.css";
import "../CustomerDashboard/CustomerDashboard.css";

// Mismo color por tipo de estado que en el admin (0.15f): pendiente, en curso, listo, cancelado…
const claseDeEstado = (codigo) => `staff-dashboard__status staff-dashboard__status--${claseEstado(codigo).replace("admin-badge--", "")}`;

const AVISO_CAMBIO_DE_USUARIO = "La sesión anterior se cerró. Ingresa con tu usuario.";

export default function StaffDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const permisos = user?.permisos || [];
  // F1-19 · El administrador también entra (con «*»). Las reservas las crea desde el admin:
  // /reservas lo devuelve allí, así que aquí no se le ofrece «Nueva reserva»
  const admin = esAdministrador(user);
  const puedeVerReservas = tienePermiso(user, "reserva:ver");
  const puedeCrearReservas = tienePermiso(user, "reserva:crear") && !admin;
  const puedeVerPedidos = tienePermiso(user, "pedido:ver");
  const puedeVerMesas = tienePermiso(user, "mesa:ver");
  const puedeVerKds = tienePermiso(user, "kds:ver"); // 2.5 · enlace a la pantalla de cocina
  // 2.7 · Agotar («86») o reactivar productos y opciones desde la operación
  const puedeAgotar = tienePermiso(user, "producto:agotar") || tienePermiso(user, "producto:reactivar");
  // 1.9 · «Cuentas abiertas» (salón con cuenta:ver, domicilio con pedido:ver)
  const puedeVerCuentas = tienePermiso(user, "cuenta:ver") || puedeVerPedidos;
  // Con mesa:ver, el panel abre primero el plano de mesas (decisión 1.6 del 2026-11-07)
  const [seccion, setSeccion] = useState(() => (puedeVerMesas ? "mesas" : "resumen"));
  // 2.6 · Aviso «Listo para servir» a quien sirve mesas (el de sus cuentas), con sonido apagado por
  // defecto en esta pantalla (F2-8). Tocar una mesa del aviso abre su cuenta en «Mesas»
  const avisaListos = puedeVerMesas && tienePermiso(user, "item:servir") && Boolean(user?.id);
  const [cuentaVista, setCuentaVista] = useState(null);
  const sonido = useSonidoKds({ clave: "staff.sonido", porDefecto: false });
  // Con el sonido ya activado en esta tablet, el primer toque en la pantalla desbloquea el audio
  const { activado: sonidoActivado, bloqueado: sonidoBloqueado, activar: activarSonido } = sonido;
  useEffect(() => {
    if (!avisaListos || !sonidoActivado || !sonidoBloqueado) return undefined;
    document.addEventListener("pointerdown", activarSonido, { once: true });
    return () => document.removeEventListener("pointerdown", activarSonido);
  }, [avisaListos, sonidoActivado, sonidoBloqueado, activarSonido]);
  const abrirCuentaLista = (cuentaId) => {
    setSeccion("mesas");
    setCuentaVista(cuentaId);
  };
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
      .filter((reserva) => fechaLocal(reserva.fecha) === hoy)
      .sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
  }, [reservas]);

  const personasHoy = reservasHoy.reduce((total, reserva) => total + (Number(reserva.personas) || 0), 0);
  const pedidosActivos = pedidos.filter((pedido) => !pedido.esFinal).length;
  const ahora = horaLocal(new Date());
  const siguienteReserva = reservasHoy.find((reserva) => String(reserva.hora) >= ahora);

  const navigation = [
    ...(puedeVerMesas ? [{ id: "mesas", label: "Mesas", icon: LayoutGrid }] : []),
    ...(puedeVerCuentas ? [{ id: "cuentas", label: "Cuentas", icon: ReceiptText }] : []),
    { id: "resumen", label: "Resumen", icon: CalendarCheck2 },
    ...(puedeVerReservas || puedeCrearReservas
      ? [{ id: "reservas", label: "Reservas", icon: CalendarDays }]
      : []),
    ...(puedeVerPedidos ? [{ id: "pedidos", label: "Pedidos", icon: ListOrdered }] : []),
    ...(puedeAgotar ? [{ id: "agotados", label: "Agotados", icon: Ban }] : []),
    { id: "perfil", label: "Mi perfil", icon: UserRound },
    { id: "seguridad", label: "Seguridad", icon: ShieldCheck },
  ];

  // Tablets compartidas (F1-10): cierra la sesión y deja el login listo para el siguiente
  // usuario, sin «from», para que cada uno entre a su propio inicio
  const cambiarDeUsuario = async () => {
    setErrorPanel("");
    try {
      await logout({ aviso: AVISO_CAMBIO_DE_USUARIO });
      navigate("/login", { replace: true });
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

  // 1.6 · Layout propio para tablet (sin navbar ni pie del sitio): cabecera compacta, pestañas
  // táctiles y el contenido a todo el ancho
  return (
    <main className="staff-tablet">
      <header className="staff-tablet__cabecera">
        <div className="staff-tablet__marca">
          {/* 2.0c · Logo de la marca (sin el lugar: aquí manda el área) */}
          <Logo lugar={false} className="staff-tablet__logo" />
          <span className="staff-tablet__marca-area">Sala</span>
        </div>
        <div className="staff-tablet__usuario">
          <h1 className="staff-tablet__hola">Hola, {user?.nombre}</h1>
          <strong className="staff-tablet__rol">{user?.roleLabel || "Personal"}</strong>
        </div>
        <div className="staff-tablet__acciones">
          {admin && (
            <Link className="staff-tablet__boton" to="/admin">
              <ShieldHalf size={18} aria-hidden="true" />
              Panel de administración
            </Link>
          )}
          {puedeVerKds && (
            <Link className="staff-tablet__boton" to="/kds">
              <ChefHat size={18} aria-hidden="true" />
              Pantalla de cocina
            </Link>
          )}
          {puedeCrearReservas && (
            <button className="staff-tablet__boton" type="button" onClick={() => navigate("/reservas")}>
              <Plus size={18} aria-hidden="true" />
              Nueva reserva
            </button>
          )}
          {avisaListos && sonido.disponible && (
            <button className="staff-tablet__boton staff-tablet__boton--sonido" type="button" aria-pressed={sonido.activado}
              title="Sonido de los avisos «Listo para servir» en esta pantalla" onClick={sonido.alternar}>
              {sonido.activado ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
              <span className="staff-tablet__boton-texto">Sonido</span>
            </button>
          )}
          <button className="staff-tablet__boton staff-tablet__boton--cambiar" type="button" onClick={cambiarDeUsuario}>
            <UserRoundCog size={18} aria-hidden="true" />
            Cambiar de usuario
          </button>
        </div>
      </header>

      <nav className="staff-tablet__nav" aria-label="Secciones del panel de personal">
        {navigation.map(({ id, label, icon }) => (
          <button
            key={id}
            type="button"
            className={seccion === id ? "is-active" : ""}
            aria-current={seccion === id ? "page" : undefined}
            onClick={() => {
              setSeccion(id);
              setCuentaVista(null); // como antes de 2.6: volver a «Mesas» muestra el plano
            }}
          >
            {createElement(icon, { size: 20, "aria-hidden": true })}
            <span>{label}</span>
          </button>
        ))}
      </nav>

      {errorPanel && <p className="dashboard-notice is-error staff-tablet__aviso" role="alert">{errorPanel}</p>}
      {/* 2.6b · Límites de errores: si el aviso o la sección fallan, el resto de /staff sigue en pie */}
      {avisaListos && (
        <LimiteErrores seccion="Listo para servir">
          <AvisoListos usuarioId={user.id} onAbrirCuenta={abrirCuentaLista} onNuevos={sonido.sonar} />
        </LimiteErrores>
      )}

      <div className="staff-tablet__contenido">
        <LimiteErrores key={seccion} seccion={navigation.find((n) => n.id === seccion)?.label}>
        {seccion === "mesas" && <PlanoMesas permisos={permisos} cuentaVista={cuentaVista} onCuentaVista={setCuentaVista} />}
        {seccion === "cuentas" && <CuentasAbiertas permisos={permisos} />}
        {seccion === "agotados" && <PanelAgotados permisos={permisos} />}

        {!["mesas", "cuentas", "agotados"].includes(seccion) && (
        <section className="customer-dashboard__content" aria-live="polite">
          {seccion === "resumen" && (
            <div>
              <div className="staff-dashboard__section-heading">
                <div>
                  <span className="customer-dashboard__eyebrow">TU TURNO</span>
                  <h2>Resumen del turno</h2>
                  <p>Estado de reservas y pedidos disponibles para tu rol.</p>
                </div>
                <span className="staff-dashboard__date-pill">
                  <CalendarDays size={16} />
                  {formatearFechaCalendario(hoyLocal(), "long")}
                </span>
              </div>

              <div className="staff-dashboard__stats">
                {puedeVerReservas && (
                  <>
                    <article className="staff-dashboard__stat">
                      <span className="staff-dashboard__stat-icon"><CalendarDays size={19} /></span>
                      <span>Reservas de hoy</span>
                      <strong>{cargandoReservas ? "…" : reservasHoy.length}</strong>
                    </article>
                    <article className="staff-dashboard__stat">
                      <span className="staff-dashboard__stat-icon"><Users size={19} /></span>
                      <span>Personas esperadas</span>
                      <strong>{cargandoReservas ? "…" : personasHoy}</strong>
                    </article>
                  </>
                )}
                {puedeVerPedidos && (
                  <article className="staff-dashboard__stat">
                    <span className="staff-dashboard__stat-icon"><ListOrdered size={19} /></span>
                    <span>Pedidos activos</span>
                    <strong>{cargandoPedidos ? "…" : pedidosActivos}</strong>
                  </article>
                )}
                {puedeVerReservas && (
                  <article className="staff-dashboard__stat">
                    <span className="staff-dashboard__stat-icon"><Clock3 size={19} /></span>
                    <span>Próxima reserva</span>
                    <strong className="staff-dashboard__stat-texto">
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
                <div className="staff-dashboard__welcome">
                  <div className="staff-dashboard__welcome-icon"><CalendarCheck2 size={22} /></div>
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
                <div className="staff-dashboard__welcome">
                  <div className="staff-dashboard__welcome-icon"><ListOrdered size={22} /></div>
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
              <div className="staff-dashboard__section-heading">
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
                <div className="staff-dashboard__reservations">
                  {reservas.map((reserva) => (
                    <article className="staff-dashboard__reservation" key={reserva.id}>
                      <div className="staff-dashboard__reservation-time">
                        <Clock3 size={17} />
                        <strong>{formatearHoraTexto(reserva.hora)}</strong>
                      </div>
                      <div className="staff-dashboard__reservation-info">
                        <div className="staff-dashboard__reservation-title">
                          <h3>{reserva.cliente}</h3>
                          <span className={claseDeEstado(reserva.estadoCodigo)}>
                            {reserva.estado}
                          </span>
                        </div>
                        <p>{[formatearFechaCalendario(reserva.fecha, "long"), reserva.telefono, reserva.correo].filter(Boolean).join(" · ")}</p>
                        {reserva.registradaPor && <p className="staff-dashboard__registrada">Registrada por {reserva.registradaPor.nombre}</p>}
                        <div className="staff-dashboard__reservation-meta">
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
              <div className="staff-dashboard__section-heading">
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
              <div className="staff-dashboard__reservations">
                {pedidos.map((pedido) => (
                  <article className="staff-dashboard__reservation staff-dashboard__order" key={pedido.id}>
                    <div className="staff-dashboard__reservation-time">
                      <ListOrdered size={17} />
                      <strong>{pedido.codigo}</strong>
                    </div>
                    <div className="staff-dashboard__reservation-info">
                      <div className="staff-dashboard__reservation-title">
                        <h3>{pedido.cliente}</h3>
                        <span className={claseDeEstado(pedido.estadoCodigo)}>{pedido.estado}</span>
                      </div>
                      <p>{formatearFechaCalendario(pedido.fecha, "long")} · {formatearCOP(pedido.total)}</p>
                      <div className="staff-dashboard__reservation-meta">
                        {/* 1.12 · Con sus opciones y su nota (el mismo plato puede ir en varias líneas) */}
                        {pedido.items?.map((item, i) => (
                          <span key={`${pedido.id}-${i}`}>
                            {item.cantidad} × {item.nombre}
                            {item.modificadores?.length > 0 ? ` — ${textoModificadores(item.modificadores)}` : ""}
                            {item.nota ? ` · Nota: ${item.nota}` : ""}
                          </span>
                        ))}
                      </div>
                      {pedido.transiciones?.length > 0 && (
                        <div className="staff-dashboard__order-actions">
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
        )}
        </LimiteErrores>
      </div>
    </main>
  );
}
