import { useEffect, useRef, useState } from "react";
import { API_URL } from "../../../services/api";

// 2.4 · Canal en tiempo real (SSE) de las vistas de sala: GET /v1/staff/eventos?canales=… con la cookie
// de sesión. Cada aviso solo trae tipo e ids: quien lo usa vuelve a leer con su permiso (alRecibir).
// Estados: «conectando», «en_vivo», «reconectando» (EventSource reintenta solo) y «sin_vivo» (el servidor
// rechazó el canal, se cerró la sesión o el navegador no tiene EventSource): en ese caso solo polling.
export function useEnVivo(canales, alRecibir, { activo = true } = {}) {
  const clave = (canales || []).join(",");
  const disponible = typeof globalThis.EventSource !== "undefined";
  const [estado, setEstado] = useState(() => (clave && activo && disponible ? "conectando" : "sin_vivo"));
  const recibir = useRef(alRecibir);
  useEffect(() => { recibir.current = alRecibir; }, [alRecibir]);

  useEffect(() => {
    if (!clave || !activo || !disponible) return undefined;
    const fuente = new globalThis.EventSource(`${API_URL}/v1/staff/eventos?canales=${encodeURIComponent(clave).replace(/%2C/g, ",")}`, { withCredentials: true });
    fuente.onopen = () => setEstado("en_vivo");
    fuente.onmessage = (evento) => {
      let aviso = null;
      try {
        aviso = JSON.parse(evento.data);
      } catch {
        return; // un mensaje mal formado no rompe la vista
      }
      recibir.current?.(aviso);
    };
    fuente.onerror = () => {
      // Cerrada = el servidor la rechazó (403, 429…): no se reintenta. Si no, EventSource reintenta solo
      setEstado(fuente.readyState === globalThis.EventSource.CLOSED ? "sin_vivo" : "reconectando");
    };
    fuente.addEventListener("sesion_cerrada", () => {
      fuente.close();
      setEstado("sin_vivo");
    });
    return () => fuente.close();
  }, [clave, activo, disponible]);

  return clave && activo && disponible ? estado : "sin_vivo";
}
