import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Ban, LayoutGrid, UserRoundCog, Volume2, VolumeX } from "lucide-react";
import { useAuth } from "../../context/useAuth";
import { apiRequest } from "../../services/api";
import { tienePermiso } from "../../utils/permisos";
import Logo from "../../components/Logo/Logo";
import Actualizado from "../StaffDashboard/compartido/Actualizado";
import { useSondeo } from "../StaffDashboard/compartido/useSondeo";
import { nuevaClave } from "../StaffDashboard/plano/estadosMesa";
import { TarjetaDomicilio, TarjetaRonda } from "./TarjetasKds";
import { INTERVALO_MS, guardarEstacion, leerEstacion, nivelTiempo } from "./kdsUtils";
import { useSonidoKds } from "./useSonidoKds";
import LimiteErrores from "../../components/LimiteErrores/LimiteErrores";
import PanelAgotados from "../StaffDashboard/agotados/PanelAgotados";
import "../StaffDashboard/plano/PlanoMesas.css";
import "./Kds.css";

// 2.5 · Pantalla de cocina y barra (/kds) para tablet horizontal (1280×800) o TV (1920×1080). Cola de la
// estación elegida (se recuerda en el dispositivo) por SSE con polling de respaldo; tarjetas de la más
// antigua a la más nueva (salón y domicilio juntos). Cada persona entra con su cuenta (F2-6): sin cierre
// por inactividad, con «Cambiar de usuario». Sonido al llegar una ronda nueva (F2-8).
const AVISO_CAMBIO_DE_USUARIO = "La sesión anterior se cerró. Ingresa con tu usuario.";

/** Hora local que avanza cada segundo (temporizadores y «Deshacer»). */
function useAhora() {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return ahora;
}

export default function Kds() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const puedePreparar = tienePermiso(user, "item:preparar");
  const puedePrepararPedido = tienePermiso(user, "pedido:preparar");
  // 2.7 · «Agotados»: la cocina o la barra agotan y reactivan desde su pantalla (la cola sigue al día detrás)
  const puedeAgotar = tienePermiso(user, "producto:agotar") || tienePermiso(user, "producto:reactivar");
  const [vista, setVista] = useState("cola");
  const [estaciones, setEstaciones] = useState(null);
  const [errorEstaciones, setErrorEstaciones] = useState("");
  const [elegida, setElegida] = useState(leerEstacion);
  const [enCurso, setEnCurso] = useState("");
  const [errorAccion, setErrorAccion] = useState("");
  const [errorPanel, setErrorPanel] = useState("");
  const sonido = useSonidoKds();
  const { sonar } = sonido;

  useEffect(() => {
    let activa = true;
    apiRequest("/v1/staff/cocina/estaciones")
      .then((lista) => { if (activa) setEstaciones(lista); })
      .catch((e) => { if (activa) setErrorEstaciones(e.message || "No se pudieron cargar las estaciones."); });
    return () => { activa = false; };
  }, []);

  // La guardada si sigue activa; si no, la primera por nombre
  const estacion = estaciones?.find((e) => e.codigo === elegida) ?? estaciones?.[0] ?? null;
  const codigo = estacion?.codigo ?? "";
  const { datos: cola, error, actualizadoEn, recargar, enVivo } = useSondeo(
    `/v1/staff/cocina/cola?estacion=${encodeURIComponent(codigo)}`, INTERVALO_MS,
    { activo: Boolean(codigo), canales: codigo ? [`estacion:${codigo}`] : [], mensajeError: "No se pudo actualizar la cola." },
  );
  const datos = cola?.estacion?.codigo === codigo ? cola : null; // al cambiar de estación, no mezclar

  // Reloj del servidor: la diferencia con el reloj de la tablet se toma de la última respuesta
  const ahoraLocal = useAhora();
  const desfase = datos && actualizadoEn ? Date.parse(datos.actualizadoEn) - actualizadoEn : 0;
  const ahora = ahoraLocal + desfase;

  // Salón y domicilio juntos, de la más antigua a la más nueva
  const tarjetas = useMemo(() => (datos ? [
    ...datos.salon.map((r) => ({ clave: `r:${r.comandaId}`, desde: r.enviadaEn, ronda: r })),
    ...datos.domicilio.map((p) => ({ clave: `p:${p.pedidoId}`, desde: p.desde, pedido: p })),
  ].sort((a, b) => Date.parse(a.desde) - Date.parse(b.desde)) : []), [datos]);

  // F2-8 · Suena al aparecer una tarjeta nueva; no en la primera carga ni al cambiar de estación
  const vistas = useRef({ codigo: "", claves: null });
  useEffect(() => {
    if (!datos) return;
    const claves = new Set(tarjetas.map((t) => t.clave));
    const previo = vistas.current;
    if (previo.codigo === codigo && previo.claves && [...claves].some((c) => !previo.claves.has(c))) sonar();
    vistas.current = { codigo, claves };
  }, [datos, tarjetas, codigo, sonar]);

  const elegir = (nuevo) => {
    setElegida(nuevo);
    guardarEstacion(nuevo);
    setErrorAccion("");
  };

  // Toda acción: una Idempotency-Key por toque; con 409 (otro ya lo cambió) se avisa y siempre se recarga
  const ejecutar = useCallback(async (clave, ruta, cuerpo) => {
    setEnCurso(clave);
    setErrorAccion("");
    try {
      await apiRequest(ruta, { method: "POST", body: JSON.stringify(cuerpo), headers: { "Idempotency-Key": nuevaClave() } });
    } catch (e) {
      setErrorAccion(e.message || "No se pudo guardar el cambio.");
    } finally {
      setEnCurso("");
      recargar();
    }
  }, [recargar]);

  const cambiarDeUsuario = async () => {
    setErrorPanel("");
    try {
      await logout({ aviso: AVISO_CAMBIO_DE_USUARIO });
      navigate("/login", { replace: true });
    } catch (e) {
      setErrorPanel(e.message);
    }
  };

  const minutosDesde = (desde) => Math.max(0, Math.floor((ahora - Date.parse(desde)) / 60_000));
  const umbrales = datos?.estacion ?? estacion ?? { umbralAvisoMin: 12, umbralAlertaMin: 20 };

  return (
    <main className="kds">
      <header className="kds__cabecera">
        <div className="kds__marca">
          <Logo lugar={false} className="kds__logo" />
          <span className="kds__area">Cocina y barra</span>
        </div>
        {/* 2.5b · Solo las estaciones del rol; con una sola, entra directo sin botones de cambio */}
        {estaciones && estaciones.length > 1 && (
          <div className="kds__estaciones" role="group" aria-label="Estación">
            {estaciones.map((e) => (
              <button key={e.codigo} type="button" className="kds__estacion" aria-pressed={e.codigo === codigo}
                onClick={() => elegir(e.codigo)}>
                {e.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="kds__acciones">
          {/* 2.5b · Quién está en la pantalla, como en /staff, junto a «Cambiar de usuario» */}
          <p className="kds__hola">Hola, {user?.nombre}{user?.roleLabel ? ` · ${user.roleLabel}` : ""}</p>
          {sonido.disponible && sonido.activado && sonido.bloqueado && (
            <button type="button" className="kds__boton kds__boton--destacado" onClick={sonido.activar}>
              <Volume2 size={20} aria-hidden="true" /> Activar sonido
            </button>
          )}
          {sonido.disponible && (
            <button type="button" className="kds__boton" aria-pressed={sonido.activado} onClick={sonido.alternar}>
              {sonido.activado ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
              Sonido
            </button>
          )}
          {puedeAgotar && (vista === "cola" ? (
            <button type="button" className="kds__boton" onClick={() => setVista("agotados")}>
              <Ban size={20} aria-hidden="true" /> Agotados
            </button>
          ) : (
            <button type="button" className="kds__boton kds__boton--destacado" onClick={() => setVista("cola")}>
              <ArrowLeft size={20} aria-hidden="true" /> Volver a la cola
            </button>
          ))}
          <Link className="kds__boton" to="/staff">
            <LayoutGrid size={20} aria-hidden="true" /> Mi panel
          </Link>
          <button type="button" className="kds__boton" onClick={cambiarDeUsuario}>
            <UserRoundCog size={20} aria-hidden="true" /> Cambiar de usuario
          </button>
        </div>
      </header>

      {vista === "agotados" ? (
        <div className="kds__agotados">
          <LimiteErrores seccion="Agotados">
            <PanelAgotados permisos={user?.permisos || []} estacionInicial={codigo || "todas"} />
          </LimiteErrores>
        </div>
      ) : (
      <>
      <div className="kds__barra">
        {estacion && <p className="kds__estacion-activa">Estación: <strong>{estacion.nombre}</strong></p>}
        {codigo && <Actualizado desde={actualizadoEn} error={error} onActualizar={recargar} enVivo={enVivo} />}
      </div>

      {errorPanel && <p className="kds__error" role="alert">{errorPanel}</p>}
      {errorEstaciones && <p className="kds__error" role="alert">{errorEstaciones}</p>}
      {errorAccion && <p className="kds__error" role="alert">{errorAccion}</p>}
      {estaciones && estaciones.length === 0 && (
        <p className="kds__vacio">Tu rol no tiene estaciones asignadas. Pide al administrador que te asigne una en Admin › Roles.</p>
      )}
      {datos?.truncado && (
        <p className="kds__aviso">Hay más rondas de las que caben en pantalla: termina las más antiguas para ver el resto.</p>
      )}

      {datos && tarjetas.length === 0 && (
        <p className="kds__vacio">No hay nada pendiente en {datos.estacion.nombre}.</p>
      )}
      {!datos && codigo && !error && <p className="kds__vacio">Cargando la cola…</p>}

      {/* 2.6b · Si una tarjeta falla al dibujarse, la cabecera y «Cambiar de usuario» siguen en pie */}
      {tarjetas.length > 0 && (
        <LimiteErrores key={codigo} seccion={`Cola de ${datos.estacion.nombre}`}>
        <section className="kds__tarjetas" aria-label={`Cola de ${datos.estacion.nombre}`}>
          {tarjetas.map((t) => {
            const minutos = minutosDesde(t.desde);
            const nivel = nivelTiempo(minutos, umbrales);
            if (t.ronda) {
              return (
                <TarjetaRonda key={t.clave} ronda={t.ronda} minutos={minutos} nivel={nivel} ahora={ahora} usuarioId={user?.id}
                  puedePreparar={puedePreparar} ocupado={Boolean(enCurso)}
                  onMarcarItem={(item, a) => ejecutar(item.id, `/v1/staff/items/${item.id}/estado`, { a, de: item.estado })}
                  onTodoListo={() => ejecutar(t.clave, `/v1/staff/cocina/rondas/${t.ronda.comandaId}/todo-listo`, { estacion: codigo })} />
              );
            }
            return (
              <TarjetaDomicilio key={t.clave} pedido={t.pedido} minutos={minutos} nivel={nivel}
                puedePreparar={puedePrepararPedido} ocupado={Boolean(enCurso)}
                onMarcar={(a) => ejecutar(t.clave, `/v1/staff/cocina/pedidos/${t.pedido.pedidoId}/estacion`, { estacion: codigo, a })} />
            );
          })}
        </section>
        </LimiteErrores>
      )}
      </>
      )}
    </main>
  );
}
