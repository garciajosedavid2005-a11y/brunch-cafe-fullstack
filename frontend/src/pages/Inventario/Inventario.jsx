import { createElement, useState } from "react";
import { Package } from "lucide-react";
import { incluyePermiso, PERMISOS_INVENTARIO } from "../../utils/permisos";
import InsumosPanel from "./InsumosPanel";
import "../AdminDashboard/AdminDashboard.css";
import "./Inventario.css";

// Fase 5 (F5-b) · Una sola pantalla de inventario para Admin › Inventario y la pestaña «Inventario» de /staff
// (rol compras). Cada pestaña se muestra solo con su permiso; el backend lo vuelve a exigir.

const PESTANAS = [
  { id: "insumos", label: "Insumos", icon: Package, permisos: PERMISOS_INVENTARIO },
];

export default function Inventario({ permisos = [] }) {
  const visibles = PESTANAS.filter((p) => p.permisos.some((clave) => incluyePermiso(permisos, clave)));
  const [pestana, setPestana] = useState(visibles[0]?.id || "insumos");

  return (
    <div className="admin-section inventario">
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Inventario</h2>
          <p className="admin-section__subtitle">Insumos, existencias y costos del café.</p>
        </div>
      </div>
      {visibles.length > 1 && (
        <nav className="inventario-pestanas" aria-label="Secciones del inventario">
          {visibles.map(({ id, label, icon }) => (
            <button key={id} type="button" className={pestana === id ? "is-active" : ""} aria-current={pestana === id ? "page" : undefined} onClick={() => setPestana(id)}>
              {createElement(icon, { size: 18, "aria-hidden": true })}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      )}
      {pestana === "insumos" && <InsumosPanel puedeGestionar={incluyePermiso(permisos, "inventario:gestionar")} />}
    </div>
  );
}
