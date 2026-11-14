import { useMemo, useState } from "react";
import { CircleCheck, CircleSlash, RotateCcw, Ban } from "lucide-react";
import { apiRequest } from "../../../services/api";
import { useDialogo } from "../../../context/useDialogo";
import { incluyePermiso } from "../../../utils/permisos";
import { useSondeo } from "../compartido/useSondeo";
import Actualizado from "../compartido/Actualizado";
import "./PanelAgotados.css";

// 2.7 · Agotar («86») y reactivar productos y opciones desde la operación (PLAN_FASE_2 §2.7; F2-5). Lo usan
// /staff (pestaña «Agotados») y /kds (empieza en la estación de la pantalla). Agotar exige producto:agotar y
// pide confirmación (quien no tiene producto:reactivar no puede deshacerlo); reactivar solo se ofrece con
// producto:reactivar. El estado va en texto e icono. Escucha el canal «catalogo»: lo que agota otra pantalla
// aparece al momento (con polling de respaldo). El backend vuelve a exigir cada permiso.
export const RUTA = "/v1/staff/agotados";
const INTERVALO_MS = 30_000;
const CANALES = ["catalogo"];

function Fila({ nombre, detalle, disponible, etiqueta, puedeAgotar, puedeReactivar, ocupado, onCambiar }) {
  return (
    <li className={`agotados__fila${disponible ? "" : " is-agotado"}`}>
      <div className="agotados__texto">
        <strong>{nombre}</strong>
        {detalle && <span className="agotados__detalle">{detalle}</span>}
      </div>
      <span className={`agotados__estado agotados__estado--${disponible ? "disponible" : "agotado"}`}>
        {disponible ? <CircleCheck size={16} aria-hidden="true" /> : <CircleSlash size={16} aria-hidden="true" />}
        {disponible ? "Disponible" : "Agotado"}
      </span>
      {disponible && puedeAgotar && (
        <button type="button" className="agotados__boton agotados__boton--agotar" aria-label={`Agotar ${etiqueta}`}
          disabled={ocupado} onClick={() => onCambiar(false)}>
          <Ban size={18} aria-hidden="true" /> Agotar
        </button>
      )}
      {!disponible && puedeReactivar && (
        <button type="button" className="agotados__boton" aria-label={`Reactivar ${etiqueta}`}
          disabled={ocupado} onClick={() => onCambiar(true)}>
          <RotateCcw size={18} aria-hidden="true" /> Reactivar
        </button>
      )}
      {/* Sin producto:reactivar: la fila dice que no puede volver a ofrecerlo (revisor-visual, 2.7); sin nombrar
          roles: los permisos se asignan en Admin › Roles (revisor-reglas) */}
      {!disponible && !puedeReactivar && <span className="agotados__sin-accion">Reactivar requiere permiso</span>}
    </li>
  );
}

// Agotados primero y, dentro de cada grupo, por nombre
const ordenar = (lista) => [...lista].sort((a, b) => (a.disponible - b.disponible) || a.nombre.localeCompare(b.nombre, "es"));

export default function PanelAgotados({ permisos = [], estacionInicial = "todas" }) {
  const { confirmar, avisar } = useDialogo();
  const puedeAgotar = incluyePermiso(permisos, "producto:agotar");
  const puedeReactivar = incluyePermiso(permisos, "producto:reactivar");
  const { datos, error, actualizadoEn, recargar, enVivo } = useSondeo(RUTA, INTERVALO_MS, {
    mensajeError: "No se pudo cargar la lista de agotados.",
    canales: CANALES,
  });
  const [estacion, setEstacion] = useState(estacionInicial);
  const [busqueda, setBusqueda] = useState("");
  const [ocupado, setOcupado] = useState("");

  const estaciones = useMemo(() => {
    const mapa = new Map((datos?.productos || []).filter((p) => p.estacion).map((p) => [p.estacion.codigo, p.estacion]));
    return [...mapa.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [datos]);
  const texto = busqueda.trim().toLocaleLowerCase("es");
  const coincide = (nombre) => !texto || nombre.toLocaleLowerCase("es").includes(texto);
  const deLaEstacion = (datos?.productos || []).filter((p) => estacion === "todas" || p.estacion?.codigo === estacion);
  const productos = ordenar(deLaEstacion.filter((p) => coincide(p.nombre)));
  // Opciones de los grupos que usan los productos de la estación elegida
  const idsGrupos = new Set(deLaEstacion.flatMap((p) => p.grupos));
  const grupos = (datos?.grupos || []).filter((g) => idsGrupos.has(g.id))
    .map((g) => ({ ...g, opciones: ordenar(g.opciones.filter((o) => coincide(o.nombre) || coincide(g.nombre))) }))
    .filter((g) => g.opciones.length);

  const cambiar = async ({ clave, ruta, nombre, disponible }) => {
    if (!disponible) {
      const { confirmado } = await confirmar({
        titulo: `Agotar ${nombre}`,
        mensaje: puedeReactivar
          ? `${nombre} deja de ofrecerse en la toma de comanda, el carrito y el menú hasta que lo reactives.`
          : `${nombre} deja de ofrecerse en la toma de comanda, el carrito y el menú. Solo quien tenga permiso para reactivar podrá volver a ofrecerlo.`,
        confirmarTexto: "Agotar",
        peligroso: true,
      });
      if (!confirmado) return;
    }
    setOcupado(clave);
    try {
      await apiRequest(ruta, { method: "POST", body: JSON.stringify({ disponible }) });
    } catch (e) {
      avisar({ tipo: "error", titulo: disponible ? "No se pudo reactivar" : "No se pudo agotar", mensaje: e.message });
    } finally {
      setOcupado("");
      recargar();
    }
  };

  return (
    <section className="agotados" aria-label="Agotados">
      <div className="agotados__barra">
        <h2 className="agotados__titulo">Agotados</h2>
        <Actualizado desde={actualizadoEn} error={error} onActualizar={recargar} enVivo={enVivo} />
      </div>
      <div className="agotados__filtros">
        <div className="agotados__estaciones" role="group" aria-label="Estación">
          {[{ codigo: "todas", nombre: "Todas" }, ...estaciones].map((e) => (
            <button key={e.codigo} type="button" className="agotados__estacion" aria-pressed={estacion === e.codigo} onClick={() => setEstacion(e.codigo)}>
              {e.nombre}
            </button>
          ))}
        </div>
        <input type="search" className="agotados__buscar" aria-label="Buscar" placeholder="Buscar producto u opción"
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
      </div>

      {!datos && !error && <p className="agotados__vacio">Cargando…</p>}
      {error && !datos && <p className="agotados__aviso" role="alert">{error}</p>}
      {datos && (
        <div className="agotados__columnas">
          <div>
            <h3 className="agotados__subtitulo">Productos</h3>
            {productos.length === 0
              ? <p className="agotados__vacio">Ningún producto coincide.</p>
              : (
                <ul className="agotados__lista" aria-label="Productos">
                  {productos.map((p) => (
                    <Fila key={p.id} nombre={p.nombre} etiqueta={p.nombre} disponible={p.disponible}
                      detalle={[p.categoria, p.estacion?.nombre].filter(Boolean).join(" · ")}
                      puedeAgotar={puedeAgotar} puedeReactivar={puedeReactivar} ocupado={Boolean(ocupado)}
                      onCambiar={(disponible) => cambiar({ clave: p.id, ruta: `${RUTA}/productos/${p.id}`, nombre: p.nombre, disponible })} />
                  ))}
                </ul>
              )}
          </div>
          {grupos.length > 0 && (
            <div>
              <h3 className="agotados__subtitulo">Opciones</h3>
              {grupos.map((g) => (
                <ul key={g.id} className="agotados__lista" aria-label={`Opciones: ${g.nombre}`}>
                  {g.opciones.map((o) => (
                    <Fila key={o.id} nombre={o.nombre} etiqueta={`${o.nombre} (${g.nombre})`} detalle={g.nombre} disponible={o.disponible}
                      puedeAgotar={puedeAgotar} puedeReactivar={puedeReactivar} ocupado={Boolean(ocupado)}
                      onCambiar={(disponible) => cambiar({ clave: o.id, ruta: `${RUTA}/grupos/${g.id}/opciones/${o.id}`, nombre: `${o.nombre} (${g.nombre})`, disponible })} />
                  ))}
                </ul>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
