import { useSondeo } from "../compartido/useSondeo";

// 1.6 · Plano por polling (sin tiempo real hasta la Fase 2): cada INTERVALO_MS, al volver a la
// pestaña y a demanda. Si una actualización falla se conserva el último plano y se avisa.
// 1.9 · La mecánica de polling está en compartido/useSondeo (la comparte «Cuentas abiertas»).
export const INTERVALO_MS = 10_000;

// 1.7 · `activo: false` (se está viendo una cuenta) pausa el polling; al reactivarlo recarga enseguida
export function usePlano({ activo = true } = {}) {
  const { datos, ...resto } = useSondeo("/v1/staff/salon/mesas", INTERVALO_MS, { activo, mensajeError: "No se pudo actualizar el plano." });
  return { plano: datos, ...resto };
}

export { useSegundosDesde } from "../compartido/useSondeo";
