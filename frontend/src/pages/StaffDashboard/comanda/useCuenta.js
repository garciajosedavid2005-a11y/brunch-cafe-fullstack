import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../services/api";
import { BASE } from "./estadosComanda";

// 1.7 · Cuenta por polling, como el plano (sin tiempo real hasta la Fase 2): otro mesero puede sumar
// ítems a la misma cuenta (F1-17). Cada INTERVALO_MS con la pestaña visible, al volver a ella, al enfocar
// la ventana (1.7b, como el plano), al recuperar la conexión y a demanda.
export const INTERVALO_MS = 15_000;

export function useCuenta(cuentaId) {
  const [cuenta, setCuenta] = useState(null);
  const [error, setError] = useState("");
  const montado = useRef(true);

  const recargar = useCallback(() => apiRequest(`${BASE}/cuentas/${cuentaId}`)
    .then((datos) => {
      if (!montado.current) return;
      setCuenta(datos);
      setError("");
    })
    .catch((e) => {
      if (montado.current) setError(e.message || "No se pudo cargar la cuenta.");
    }), [cuentaId]);

  useEffect(() => {
    montado.current = true;
    recargar();
    const intervalo = window.setInterval(() => {
      if (document.visibilityState !== "hidden") recargar();
    }, INTERVALO_MS);
    const alVolver = () => document.visibilityState === "visible" && recargar();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", recargar);
    return () => {
      montado.current = false;
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", recargar);
    };
  }, [recargar]);

  return { cuenta, error, recargar };
}
