import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { api } from "../../services/api";

/**
 * Fase 5 · 5.5 (F5-6) · Aviso del Resumen del admin: insumos bajo el mínimo y lotes que vencen en 7 días.
 * Si la consulta falla, no se muestra (el Resumen sigue en pie); el detalle está en Inventario › Alertas.
 */
export default function AvisoAlertas({ onVer }) {
  const [alertas, setAlertas] = useState(null);
  useEffect(() => {
    let activo = true;
    api.get("/v1/inventario/alertas").then((d) => activo && setAlertas(d)).catch(() => {});
    return () => { activo = false; };
  }, []);
  if (!alertas) return null;
  // Una respuesta inesperada no rompe el Resumen: sin listas, no hay aviso
  const bajos = Array.isArray(alertas.stockBajo) ? alertas.stockBajo.length : 0;
  // 5.8.6 · Las existencias negativas se nombran aparte
  const negativos = Array.isArray(alertas.stockBajo) ? alertas.stockBajo.filter((i) => i.nivel === "negativo").length : 0;
  const vencen = Array.isArray(alertas.vencimientos) ? alertas.vencimientos.length : 0;
  if (!bajos && !vencen) return null;
  const partes = [
    bajos ? `${bajos} ${bajos === 1 ? "insumo está" : "insumos están"} bajo el mínimo` : "",
    negativos ? `${negativos} con existencia negativa (revisa el conteo)` : "",
    vencen ? `${vencen} ${vencen === 1 ? "lote vence" : "lotes vencen"} en los próximos 7 días` : "",
  ].filter(Boolean);
  const ultima = partes.pop();
  const texto = partes.length ? `${partes.join(", ")} y ${ultima}` : ultima;
  return (
    <div className="aviso-inventario" role="status">
      <BellRing size={20} aria-hidden="true" />
      <p><strong>Inventario:</strong> {texto}.</p>
      <button type="button" className="admin-button--secondary-sm" onClick={onVer}>Ver alertas</button>
    </div>
  );
}
