import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../services/api";

// Consulta por polling para las vistas de sala (sin tiempo real hasta la Fase 2). La usan el plano
// (1.6) y «Cuentas abiertas» (1.9): cada `intervaloMs` con la pestaña visible, al volver a ella, al
// enfocar la ventana, al recuperar la conexión y a demanda. Si una actualización falla se conservan
// los últimos datos y se avisa. `activo: false` pausa el polling; al reactivarlo recarga enseguida.
export function useSondeo(ruta, intervaloMs, { activo = true, mensajeError = "No se pudo actualizar." } = {}) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [actualizadoEn, setActualizadoEn] = useState(null); // hora local del último éxito
  const [cargando, setCargando] = useState(true);
  const enCurso = useRef(false);
  const montado = useRef(true);

  // Los cambios de estado van en los callbacks de la petición (nunca síncronos en el efecto)
  const recargar = useCallback(() => {
    if (enCurso.current) return Promise.resolve();
    enCurso.current = true;
    return apiRequest(ruta)
      .then((respuesta) => {
        if (!montado.current) return;
        setDatos(respuesta);
        setError("");
        setActualizadoEn(Date.now());
      })
      .catch((e) => {
        if (montado.current) setError(e.message || mensajeError);
      })
      .finally(() => {
        enCurso.current = false;
        if (montado.current) setCargando(false);
      });
  }, [ruta, mensajeError]);

  useEffect(() => {
    montado.current = true;
    if (!activo) return () => { montado.current = false; };
    recargar();
    const intervalo = window.setInterval(() => {
      if (document.visibilityState !== "hidden") recargar();
    }, intervaloMs);
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
  }, [recargar, activo, intervaloMs]);

  return { datos, error, actualizadoEn, cargando, recargar };
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
