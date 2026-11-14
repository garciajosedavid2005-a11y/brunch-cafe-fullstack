import { createElement, useEffect, useMemo, useState } from "react";
import { BellRing, Clock, Users } from "lucide-react";
import { formatearCOP } from "../../../utils/moneda";
import { ESTADOS_MESA, datosEstado, formatearMinutos } from "./estadosMesa";
import { usePlano } from "./usePlano";
import Actualizado from "../compartido/Actualizado";
import PanelMesa from "./PanelMesa";
import DibujoMesa from "./DibujoMesa";
import { nivelTiempo } from "./geometriaMesa";
import TomaComanda from "../comanda/TomaComanda";
import "./PlanoMesas.css";

// 1.6 · Plano de mesas para tablet (PLAN_FASE_1 §1.6). Pestañas por zona, tarjetas con el estado en
// texto e icono, leyenda, panel de acciones según permisos y refresco por polling.
// 2.6c · Propuesta B (Brayan): cada mesa dibujada con sus sillas y el anillo del tiempo ocupada, las zonas
// como salas, las mesas unidas como una sola pieza y el resumen «N de M mesas ocupadas».
// `bloqueada` es un estado operativo y temporal (sale en el plano); una mesa inactiva es
// configuración del admin y no sale.

const resumenAccesible = (mesa) => {
  const partes = [`Mesa ${mesa.numero}`, datosEstado(mesa.estado).etiqueta];
  if (mesa.nombre) partes.splice(1, 0, mesa.nombre);
  const c = mesa.cuenta;
  if (c) {
    partes.push(`${c.comensales} ${c.comensales === 1 ? "comensal" : "comensales"}`);
    if (c.mesero?.nombre) partes.push(c.mesero.nombre);
    partes.push(formatearMinutos(c.minutosOcupada));
    if (c.total > 0) partes.push(formatearCOP(c.total));
    if (c.listosParaServir > 0) partes.push(`listo para servir: ${c.listosParaServir}`); // 2.6
    if (c.mesas.length > 1) partes.push(`unida con ${c.mesas.filter((m) => m.id !== mesa.id).map((m) => m.numero).join(", ")}`);
  } else {
    partes.push(`${mesa.capacidad} puestos`);
  }
  return partes.join(", ");
};

const OCUPADAS = ["ocupada", "cuenta_pedida"];
/** «Ana P.» → «AP» (el nombre completo va en el nombre accesible del botón). */
const iniciales = (nombre = "") => nombre.split(/\s+/).map((p) => p.replace(/[^\p{L}]/gu, "")).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join("");

/**
 * Piezas del plano: cada mesa sola o, si su cuenta une varias, una sola pieza con todas (la de menor
 * número la representa y es la que se elige; el panel ofrece separar).
 */
const piezasDe = (visibles, todas) => {
  const vistas = new Set();
  const porId = new Map(todas.map((m) => [m.id, m]));
  return visibles.flatMap((mesa) => {
    const c = mesa.cuenta;
    if (!(c?.mesas.length > 1)) return [{ mesa, numeros: [mesa.numero], capacidad: mesa.capacidad, mesas: 1 }];
    if (vistas.has(c.id)) return [];
    vistas.add(c.id);
    const miembros = c.mesas.map((m) => porId.get(m.id)).filter(Boolean).sort((a, b) => a.numero - b.numero);
    return [{
      mesa: miembros[0] || mesa,
      numeros: miembros.map((m) => m.numero),
      capacidad: miembros.reduce((n, m) => n + m.capacidad, 0),
      mesas: miembros.length || 1,
    }];
  });
};

function TarjetaMesa({ pieza, seleccionada, onElegir }) {
  const { mesa } = pieza;
  const { etiqueta, icono } = datosEstado(mesa.estado);
  const c = mesa.cuenta;
  return (
    <li>
      <button
        type="button"
        id={`mesa-${mesa.id}`}
        className={`plano__mesa plano__mesa--${mesa.estado}${pieza.mesas > 1 ? " plano__mesa--unida" : ""}${seleccionada ? " is-seleccionada" : ""}`}
        aria-label={resumenAccesible(mesa)}
        aria-pressed={seleccionada}
        onClick={() => onElegir(mesa.id)}
      >
        {c?.listosParaServir > 0 && (
          // 2.6 · Lo que la cocina o la barra dejaron listo (texto e icono, no solo color)
          <span className="plano__listos">
            <BellRing size={15} aria-hidden="true" />
            <span>Listo para <span className="plano__listos-fin">servir ({c.listosParaServir})</span></span>
          </span>
        )}
        <DibujoMesa numero={pieza.numeros.join("+")} capacidad={pieza.capacidad} mesas={pieza.mesas}
          comensales={c?.comensales || 0} minutos={c ? c.minutosOcupada : null} />
        <span className="plano__estado">
          {createElement(icono, { size: 16, "aria-hidden": true })}
          {etiqueta}
        </span>
        {mesa.nombre && <span className="plano__mesa-nombre">{mesa.nombre}</span>}
        {c && (
          <span className="plano__mesa-detalle">
            {c.mesero?.nombre && <span className="plano__mesero" aria-hidden="true" title={c.mesero.nombre}>{iniciales(c.mesero.nombre)}</span>}
            <span className="plano__comensales" aria-hidden="true"><Users size={14} />{c.comensales}/{pieza.capacidad}</span>
            <span className={`plano__tiempo plano__tiempo--${nivelTiempo(c.minutosOcupada)}`}>
              <Clock size={14} aria-hidden="true" />
              {formatearMinutos(c.minutosOcupada)}
            </span>
            {c.total > 0 && <span className="plano__mesa-total">{formatearCOP(c.total)}</span>}
          </span>
        )}
      </button>
    </li>
  );
}

export default function PlanoMesas({ permisos = [], cuentaVista: cuentaExterna, onCuentaVista }) {
  // 1.7 · Cuenta abierta en la toma de comanda. 2.6 · /staff puede controlarla (el aviso «Listo para
  // servir» abre la cuenta desde cualquier pestaña); sin esas props, el plano la lleva solo
  const [cuentaInterna, setCuentaInterna] = useState(null);
  const controlada = onCuentaVista !== undefined;
  const cuentaVista = controlada ? cuentaExterna : cuentaInterna;
  const setCuentaVista = controlada ? onCuentaVista : setCuentaInterna;
  const { plano, error, actualizadoEn, cargando, recargar, enVivo } = usePlano({ activo: !cuentaVista });
  const [zona, setZona] = useState("todas");
  const [elegida, setElegida] = useState(null);

  const mesas = useMemo(() => plano?.mesas || [], [plano]);
  const visibles = zona === "todas" ? mesas : mesas.filter((m) => m.zona.id === zona);
  const mesaElegida = mesas.find((m) => m.id === elegida) || null;
  // En vertical la hoja inferior tapa parte del plano: la mesa elegida queda a la vista
  useEffect(() => {
    if (!elegida) return;
    document.getElementById(`mesa-${elegida}`)?.scrollIntoView?.({ block: "nearest" });
  }, [elegida]);

  // Zonas como salas, en el orden del plano (una mesa de una zona ya inactiva va en la suya, al final)
  const salas = useMemo(() => {
    const orden = new Map((plano?.zonas || []).map((z, i) => [z.id, i]));
    const grupos = new Map();
    for (const m of visibles) {
      if (!grupos.has(m.zona.id)) grupos.set(m.zona.id, { id: m.zona.id, nombre: m.zona.nombre, mesas: [] });
      grupos.get(m.zona.id).mesas.push(m);
    }
    return [...grupos.values()]
      .sort((a, b) => (orden.get(a.id) ?? Infinity) - (orden.get(b.id) ?? Infinity))
      .map((g) => ({ ...g, piezas: piezasDe(g.mesas, mesas) }));
  }, [plano, visibles, mesas]);
  const ocupadas = visibles.filter((m) => OCUPADAS.includes(m.estado)).length;

  const conteo = useMemo(() => {
    const c = Object.fromEntries(Object.keys(ESTADOS_MESA).map((k) => [k, 0]));
    for (const m of visibles) c[m.estado] = (c[m.estado] || 0) + 1;
    return c;
  }, [visibles]);

  if (cuentaVista) {
    return <TomaComanda cuentaId={cuentaVista} permisos={permisos} onVolver={() => setCuentaVista(null)} />;
  }

  return (
    <div className={`plano${mesaElegida ? " plano--con-panel" : ""}`}>
      <div className="plano__principal">
        <div className="plano__barra">
          <h2 className="plano__titulo">Plano de mesas</h2>
          {plano && visibles.length > 0 && (
            <p className="plano__resumen"><strong>{ocupadas} de {visibles.length}</strong> mesas ocupadas</p>
          )}
          <Actualizado desde={actualizadoEn} error={error} onActualizar={recargar} enVivo={enVivo} />
        </div>

        {plano?.zonas?.length > 0 && (
          <div className="plano__zonas" role="group" aria-label="Zonas">
            {[{ id: "todas", nombre: "Todas" }, ...plano.zonas].map((z) => (
              <button key={z.id} type="button" className="plano__zona" aria-pressed={zona === z.id} onClick={() => setZona(z.id)}>
                {z.nombre}
              </button>
            ))}
          </div>
        )}

        <ul className="plano__leyenda" aria-label="Leyenda de estados">
          {Object.entries(ESTADOS_MESA).map(([codigo, { etiqueta, icono }]) => (
            <li key={codigo} className={`plano__leyenda-item plano__leyenda-item--${codigo}`}>
              {createElement(icono, { size: 16, "aria-hidden": true })}
              <span>{etiqueta}</span>
              <strong>{conteo[codigo]}</strong>
            </li>
          ))}
        </ul>

        {error && !plano && <p className="plano__aviso" role="alert">{error}</p>}
        {cargando && !plano && <p className="plano__vacio">Cargando el plano…</p>}
        {plano && visibles.length === 0 && (
          <p className="plano__vacio">No hay mesas activas{zona === "todas" ? "" : " en esta zona"}. El administrador las configura en Admin › Salón.</p>
        )}
        <div className="plano__salas">
        {salas.map((sala) => (
          // Cada sala ocupa un ancho proporcional a sus mesas (lado a lado en horizontal)
          <section key={sala.id} className="plano__sala" style={{ "--mesas": sala.piezas.length }} aria-labelledby={`sala-${sala.id}`}>
            <h3 id={`sala-${sala.id}`} className="plano__sala-nombre">{sala.nombre}</h3>
            <ul className="plano__mesas" aria-label={`Mesas de ${sala.nombre}`}>
              {sala.piezas.map((p) => (
                <TarjetaMesa key={p.mesa.id} pieza={p} seleccionada={p.mesa.id === elegida} onElegir={(id) => setElegida((actual) => (actual === id ? null : id))} />
              ))}
            </ul>
          </section>
        ))}
        </div>
      </div>

      {mesaElegida && (
        <PanelMesa
          key={mesaElegida.id}
          mesa={mesaElegida}
          mesas={mesas}
          permisos={permisos}
          onHecho={recargar}
          onCerrar={() => setElegida(null)}
          onVerCuenta={setCuentaVista}
        />
      )}
    </div>
  );
}
