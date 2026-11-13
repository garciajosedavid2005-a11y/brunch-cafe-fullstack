import { useCallback, useEffect, useRef, useState } from "react";

// 2.5 · Sonido del KDS (F2-8): activado por defecto en /kds y configurable en cada pantalla (se guarda en
// el dispositivo). El navegador no deja reproducir audio hasta que alguien toca la página: mientras tanto
// `bloqueado` es true y la pantalla ofrece «Activar sonido». El aviso es un doble tono generado con Web
// Audio (sin archivos de audio).
// 2.6 · Lo usa también /staff para el aviso «Listo para servir», con su propia clave y apagado por defecto
// (F2-8): `clave` es dónde se recuerda en el dispositivo y `porDefecto`, el valor si nunca se tocó.
export const CLAVE_SONIDO = "kds.sonido";

const leer = (clave) => {
  try {
    return localStorage.getItem(clave);
  } catch {
    return null;
  }
};
const guardar = (clave, valor) => {
  try {
    localStorage.setItem(clave, valor);
  } catch {
    // Sin almacenamiento (modo privado): se recuerda solo mientras la pantalla siga abierta
  }
};

export function useSonidoKds({ clave = CLAVE_SONIDO, porDefecto = true } = {}) {
  const Contexto = globalThis.AudioContext || globalThis.webkitAudioContext;
  const disponible = typeof Contexto === "function";
  const [activado, setActivado] = useState(() => {
    const guardado = leer(clave);
    return guardado === null ? porDefecto : guardado !== "no";
  });
  const [bloqueado, setBloqueado] = useState(disponible);
  const contexto = useRef(null);

  // El contexto se crea al montar: si el navegador lo deja «suspended», hace falta un toque para activarlo
  useEffect(() => {
    if (!disponible) return undefined;
    const ctx = new Contexto();
    contexto.current = ctx;
    const alCambiar = () => setBloqueado(ctx.state !== "running");
    ctx.addEventListener?.("statechange", alCambiar);
    alCambiar();
    return () => {
      ctx.removeEventListener?.("statechange", alCambiar);
      ctx.close?.();
      contexto.current = null;
    };
  }, [disponible, Contexto]);

  const activar = useCallback(() => {
    contexto.current?.resume?.().then(() => setBloqueado(contexto.current?.state !== "running")).catch(() => {});
  }, []);

  const alternar = useCallback(() => {
    setActivado((antes) => {
      guardar(clave, antes ? "no" : "si");
      return !antes;
    });
    activar(); // el toque sirve también para desbloquear el audio
  }, [activar, clave]);

  const sonar = useCallback(() => {
    const ctx = contexto.current;
    if (!activado || !ctx || ctx.state !== "running") return;
    const inicio = ctx.currentTime;
    [0, 0.22].forEach((retraso, i) => {
      const osc = ctx.createOscillator();
      const vol = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 880 : 1175;
      vol.gain.setValueAtTime(0.0001, inicio + retraso);
      vol.gain.exponentialRampToValueAtTime(0.4, inicio + retraso + 0.02);
      vol.gain.exponentialRampToValueAtTime(0.0001, inicio + retraso + 0.18);
      osc.connect(vol).connect(ctx.destination);
      osc.start(inicio + retraso);
      osc.stop(inicio + retraso + 0.2);
    });
  }, [activado]);

  return { disponible, activado, bloqueado: disponible && bloqueado, activar, alternar, sonar };
}
