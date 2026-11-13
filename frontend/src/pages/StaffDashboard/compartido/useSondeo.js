import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest } from "../../../services/api";
import { useEnVivo } from "./useEnVivo";

// 2.4 · Con el canal vivo, el polling queda de respaldo con este factor sobre el intervalo
export const FACTOR_RESPALDO = 4;

// Consulta por polling para las vistas de sala. La usan el plano (1.6), «Cuentas abiertas» (1.9) y la
// cuenta (2.4): cada `intervaloMs` con la pestaña visible, al volver a ella, al enfocar la ventana, al
// recuperar la conexión y a demanda. Si una actualización falla se conservan los últimos datos y se
// avisa. `activo: false` pausa el polling; al reactivarlo recarga enseguida.
// 2.4 · Con `canales` (los que el usuario puede escuchar) recarga al recibir un aviso en tiempo real;
// mientras el canal está vivo, el polling queda de respaldo cada FACTOR_RESPALDO × intervalo.
export function useSondeo(ruta, intervaloMs, { activo = true, mensajeError = "No se pudo actualizar.", canales = [] } = {}) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");
  const [actualizadoEn, setActualizadoEn] = useState(null); // hora local del último éxito
  const [cargando, setCargando] = useState(true);
  const enCurso = useRef(false);
  const pendiente = useRef(false);
  const montado = useRef(true);

  // Los cambios de estado van en los callbacks de la petición (nunca síncronos en el efecto).
  // 2.4 · Si piden recargar con una petición en curso (un aviso, o la acción propia que acaba de
  // terminar), no se descarta: se repite una vez al terminar para no quedarse con datos viejos
  const recargar = useCallback(function pedir() {
    if (enCurso.current) {
      pendiente.current = true;
      return Promise.resolve();
    }
    enCurso.current = true;
    pendiente.current = false;
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
        if (!montado.current) return;
        setCargando(false);
        if (pendiente.current) pedir();
      });
  }, [ruta, mensajeError]);

  const enVivo = useEnVivo(canales, recargar, { activo });
  const cadaMs = enVivo === "en_vivo" ? intervaloMs * FACTOR_RESPALDO : intervaloMs;

  useEffect(() => {
    montado.current = true;
    if (!activo) return () => { montado.current = false; };
    recargar();
    return () => { montado.current = false; };
  }, [recargar, activo]);

  // El intervalo cambia al pasar a «En vivo» y de vuelta; este efecto no toca `montado`
  useEffect(() => {
    if (!activo) return undefined;
    const intervalo = window.setInterval(() => {
      if (document.visibilityState !== "hidden") recargar();
    }, cadaMs);
    const alVolver = () => document.visibilityState === "visible" && recargar();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    window.addEventListener("online", recargar);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
      window.removeEventListener("online", recargar);
    };
  }, [recargar, activo, cadaMs]);

  return { datos, error, actualizadoEn, cargando, recargar, enVivo };
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
