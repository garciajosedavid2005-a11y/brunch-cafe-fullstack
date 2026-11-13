import { createElement, useEffect, useMemo, useState } from "react";
import { BellRing, Users } from "lucide-react";
import { formatearCOP } from "../../../utils/moneda";
import { ESTADOS_MESA, datosEstado, formatearMinutos } from "./estadosMesa";
import { usePlano } from "./usePlano";
import Actualizado from "../compartido/Actualizado";
import PanelMesa from "./PanelMesa";
import TomaComanda from "../comanda/TomaComanda";
import "./PlanoMesas.css";

// 1.6 · Plano de mesas para tablet (PLAN_FASE_1 §1.6). Pestañas por zona, tarjetas con el estado en
// texto e icono, leyenda, panel de acciones según permisos y refresco por polling.
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
    if (c.listosParaServir > 0) partes.push(`listo para servir: ${c.listosParaServir}`); // 2.6
    if (c.mesas.length > 1) partes.push(`unida con ${c.mesas.filter((m) => m.id !== mesa.id).map((m) => m.numero).join(", ")}`);
  } else {
    partes.push(`${mesa.capacidad} puestos`);
  }
  return partes.join(", ");
};

function TarjetaMesa({ mesa, seleccionada, onElegir }) {
  const { etiqueta, icono } = datosEstado(mesa.estado);
  const c = mesa.cuenta;
  const unidaCon = c?.mesas.length > 1 ? c.mesas.filter((m) => m.id !== mesa.id).map((m) => m.numero) : [];
  return (
    <li>
      <button
        type="button"
        id={`mesa-${mesa.id}`}
        className={`plano__mesa plano__mesa--${mesa.estado}${seleccionada ? " is-seleccionada" : ""}`}
        aria-label={resumenAccesible(mesa)}
        aria-pressed={seleccionada}
        onClick={() => onElegir(mesa.id)}
      >
        <span className="plano__mesa-cabecera">
          <strong className="plano__mesa-numero">{mesa.numero}</strong>
          <span className="plano__estado">
            {createElement(icono, { size: 16, "aria-hidden": true })}
            {etiqueta}
          </span>
        </span>
        {mesa.nombre && <span className="plano__mesa-nombre">{mesa.nombre}</span>}
        {c?.listosParaServir > 0 && (
          // 2.6 · Lo que la cocina o la barra dejaron listo (texto e icono, no solo color)
          <span className="plano__listos">
            <BellRing size={15} aria-hidden="true" />
            <span>Listo para <span className="plano__listos-fin">servir ({c.listosParaServir})</span></span>
          </span>
        )}
        {c ? (
          <>
            <span className="plano__mesa-dato">
              <Users size={15} aria-hidden="true" />
              {c.comensales} · {formatearMinutos(c.minutosOcupada)}
            </span>
            <span className="plano__mesa-dato">{c.mesero?.nombre}</span>
            <span className="plano__mesa-total">{formatearCOP(c.total)}</span>
            {unidaCon.length > 0 && <span className="plano__mesa-unida">Unida con {unidaCon.join(", ")}</span>}
          </>
        ) : (
          <span className="plano__mesa-dato">
            <Users size={15} aria-hidden="true" />
            {mesa.capacidad} puestos
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
        <ul className="plano__mesas" aria-label="Mesas">
          {visibles.map((m) => (
            <TarjetaMesa key={m.id} mesa={m} seleccionada={m.id === elegida} onElegir={(id) => setElegida((actual) => (actual === id ? null : id))} />
          ))}
        </ul>
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
