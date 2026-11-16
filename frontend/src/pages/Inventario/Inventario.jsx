import { createElement, useState } from "react";
import { BellRing, BookOpen, Package, Truck } from "lucide-react";
import { incluyePermiso, PERMISOS_INVENTARIO } from "../../utils/permisos";
import InsumosPanel from "./InsumosPanel";
import RecetasPanel from "./RecetasPanel";
import ComprasPanel from "./ComprasPanel";
import AlertasPanel from "./AlertasPanel";
import "../AdminDashboard/AdminDashboard.css";
import "./Inventario.css";

// Fase 5 (F5-b) · Una sola pantalla de inventario para Admin › Inventario y la pestaña «Inventario» de /staff
// (rol compras). Cada pestaña se muestra solo con su permiso; el backend lo vuelve a exigir.

const PESTANAS = [
  { id: "insumos", label: "Insumos", icon: Package, permisos: PERMISOS_INVENTARIO },
  { id: "recetas", label: "Recetas", icon: BookOpen, permisos: ["inventario:ver", "inventario:gestionar"] }, // 5.2
  { id: "compras", label: "Compras", icon: Truck, permisos: ["inventario:ver", "compra:gestionar", "compra:recibir"] }, // 5.4
  { id: "alertas", label: "Alertas", icon: BellRing, permisos: PERMISOS_INVENTARIO }, // 5.5
];

export default function Inventario({ permisos = [], inicial }) {
  const visibles = PESTANAS.filter((p) => p.permisos.some((clave) => incluyePermiso(permisos, clave)));
  const [pestana, setPestana] = useState(visibles.some((p) => p.id === inicial) ? inicial : visibles[0]?.id || "insumos");
  const puede = (clave) => incluyePermiso(permisos, clave);

  return (
    <div className="admin-section inventario">
      <div className="admin-section__header">
        <div>
          <h2 className="admin-section__title">Inventario</h2>
          <p className="admin-section__subtitle">Insumos, recetas, compras y alertas del café.</p>
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
      {pestana === "insumos" && <InsumosPanel puedeGestionar={puede("inventario:gestionar")} puedeAjustar={puede("inventario:ajustar")} />}
      {pestana === "recetas" && <RecetasPanel puedeGestionar={puede("inventario:gestionar")} />}
      {pestana === "compras" && <ComprasPanel puedeGestionar={puede("compra:gestionar")} puedeRecibir={puede("compra:recibir")} />}
      {pestana === "alertas" && <AlertasPanel puedeAjustar={puede("inventario:ajustar")} />}
    </div>
  );
}
