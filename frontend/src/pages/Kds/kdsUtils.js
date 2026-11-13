// 2.5 · Utilidades del KDS (sin componentes, para que Fast Refresh funcione en los .jsx)
export const VENTANA_DESHACER_MS = 10_000; // F2-7 (igual que el backend)
export const CLAVE_ESTACION = "kds.estacion"; // estación elegida en este dispositivo
export const INTERVALO_MS = 10_000; // polling de la cola (con el canal vivo, 4 veces más)

export const textoMinutos = (min) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`);
export const textoMesas = (mesas = []) => (mesas.length > 1 ? `Mesas ${mesas.join(", ")}` : `Mesa ${mesas[0] ?? "—"}`);

/** Nivel del temporizador con los umbrales de la estación (F2-4). */
export const nivelTiempo = (minutos, { umbralAvisoMin, umbralAlertaMin }) => {
  if (minutos >= umbralAlertaMin) return "alerta";
  if (minutos >= umbralAvisoMin) return "aviso";
  return "normal";
};

export const leerEstacion = () => {
  try {
    return localStorage.getItem(CLAVE_ESTACION) || "";
  } catch {
    return "";
  }
};
export const guardarEstacion = (codigo) => {
  try {
    localStorage.setItem(CLAVE_ESTACION, codigo);
  } catch {
    // Sin almacenamiento: se recuerda solo mientras la pantalla siga abierta
  }
};
