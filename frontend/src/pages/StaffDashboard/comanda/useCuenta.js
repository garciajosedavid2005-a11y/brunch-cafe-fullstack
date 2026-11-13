import { useMemo } from "react";
import { useSondeo } from "../compartido/useSondeo";
import { BASE } from "./estadosComanda";

// 1.7 · Cuenta por polling, como el plano: otro mesero puede sumar ítems a la misma cuenta (F1-17).
// Cada INTERVALO_MS con la pestaña visible, al volver a ella, al enfocar la ventana (1.7b), al recuperar
// la conexión y a demanda.
// 2.4 · Usa la mecánica común (compartido/useSondeo) y escucha el canal «cuenta:<id>» (quien la ve tiene
// cuenta:ver): cocina y barra, otro mesero o una acción del salón la recargan al momento; el polling
// queda de respaldo.
export const INTERVALO_MS = 15_000;

export function useCuenta(cuentaId) {
  const canales = useMemo(() => (cuentaId ? [`cuenta:${cuentaId}`] : []), [cuentaId]);
  const { datos, error, recargar, enVivo } = useSondeo(`${BASE}/cuentas/${cuentaId}`, INTERVALO_MS, {
    mensajeError: "No se pudo cargar la cuenta.",
    canales,
  });
  return { cuenta: datos, error, recargar, enVivo };
}
