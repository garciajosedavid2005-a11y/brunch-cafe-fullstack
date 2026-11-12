import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../services/api";

// 1.6 Â· Plano por polling (sin tiempo real hasta la Fase 2): cada INTERVALO_MS, al volver a la
// pestaÃ±a y a demanda. Si una actualizaciÃ³n falla se conserva el Ãºltimo plano y se avisa.
export const INTERVALO_MS = 10_000;

// 1.7 Â· `activo: false` (se estÃ¡ viendo una cuenta) pausa el polling; al reactivarlo recarga enseguida
export function usePlano({ activo = true } = {}) {
  const [plano, setPlano] = useState(null);
  const [error, setError] = useState("");
  const [actualizadoEn, setActualizadoEn] = useState(null); // hora local del Ãºltimo Ã©xito
  const [cargando, setCargando] = useState(true);
  const enCurso = useRef(false);
  const montado = useRef(true);

  // Los cambios de estado van en los callbacks de la peticiÃ³n (nunca sÃ­ncronos en el efecto)
  const recargar = useCallback(() => {
    if (enCurso.current) return Promise.resolve();
    enCurso.current = true;
    return apiRequest("/v1/staff/salon/mesas")
      .then((datos) => {
        if (!montado.current) return;
        setPlano(datos);
        setError("");
        setActualizadoEn(Date.now());
      })
      .catch((e) => {
        if (montado.current) setError(e.message || "No se pudo actualizar el plano.");
      })
      .finally(() => {
        enCurso.current = false;
        if (montado.current) setCargando(false);
      });
  }, []);

  useEffect(() => {
    montado.current = true;
    if (!activo) return () => { montado.current = false; };
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
  }, [recargar, activo]);

  return { plano, error, actualizadoEn, cargando, recargar };
}

/** Segundos desde `desde`, actualizado cada segundo (solo re-pinta quien lo usa). */
export function useSegundosDesde(desde) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return desde ? Math.max(0, Math.round((ahora - desde) / 1000)) : null;
}
