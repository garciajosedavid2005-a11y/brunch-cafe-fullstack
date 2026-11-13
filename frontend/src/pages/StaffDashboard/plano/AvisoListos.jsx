import { useEffect, useMemo, useRef } from "react";
import { BellRing } from "lucide-react";
import { useSondeo } from "../compartido/useSondeo";
import { cuentasConListos, textoMesas } from "./listosParaServir";
import "./AvisoListos.css";

// 2.6 · Aviso no intrusivo en /staff: las cuentas del propio mesero con ítems «Listo para servir», en
// cualquier pestaña. No es un diálogo ni roba el foco: una franja que se anuncia con cortesía (role
// «status») y desaparece cuando ya no queda nada por servir. Escucha su canal «mesero:<id>» (la cocina y
// la barra avisan ahí de lo que queda listo, se sirve o se deshace) y relee el plano con su permiso; el
// polling queda de respaldo.
export const INTERVALO_MS = 30_000;

export default function AvisoListos({ usuarioId, onAbrirCuenta, onNuevos }) {
  const canales = useMemo(() => (usuarioId ? [`mesero:${usuarioId}`] : []), [usuarioId]);
  const { datos } = useSondeo("/v1/staff/salon/mesas", INTERVALO_MS, {
    mensajeError: "No se pudo comprobar lo listo para servir.",
    canales,
  });
  const cuentas = useMemo(() => cuentasConListos(datos, usuarioId), [datos, usuarioId]);
  const total = cuentas.reduce((suma, c) => suma + c.listos, 0);

  // Sonido solo cuando aparece algo nuevo listo (no en la primera carga ni al servir)
  const anterior = useRef(null);
  const avisar = useRef(onNuevos);
  useEffect(() => { avisar.current = onNuevos; }, [onNuevos]);
  useEffect(() => {
    if (!datos) return;
    if (anterior.current !== null && total > anterior.current) avisar.current?.();
    anterior.current = total;
  }, [datos, total]);

  if (!cuentas.length) return null;
  return (
    <section className="aviso-listos" role="status" aria-label="Listo para servir">
      <span className="aviso-listos__titulo">
        <BellRing size={18} aria-hidden="true" />
        Listo para servir
      </span>
      <ul className="aviso-listos__mesas">
        {cuentas.map((c) => (
          <li key={c.id}>
            <button type="button" className="aviso-listos__mesa" onClick={() => onAbrirCuenta(c.id)}>
              {`${textoMesas(c.mesas)} (${c.listos})`}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
