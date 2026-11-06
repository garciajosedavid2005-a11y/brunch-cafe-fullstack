import { useEffect, useState, useSyncExternalStore } from "react";
import { apiRequest } from "../services/api";

// Horarios de domicilio y reservas desde el backend (GET /api/v1/horarios), compartidos por
// todo el sitio (pie de página, Nosotros, checkout, reservas). Se piden una vez por carga.
// 0.14: si la petición falla (p. ej. el backend estaba caído) se reintenta sola con espera
// creciente y también al volver el foco o la conexión; antes el pie se quedaba en el error
// hasta recargar la página. `ahora` se renueva cada minuto para que las horas que pasan
// desaparezcan de los selectores sin recargar.
const REINTENTOS_MS = [2000, 5000, 15000, 30000];

let estado = { horarios: null, error: "" };
let cargando = false;
let intento = 0;
let temporizador = null;
let reintentos = REINTENTOS_MS;
const suscriptores = new Set();

const publicar = (nuevo) => {
  estado = nuevo;
  suscriptores.forEach((avisar) => avisar());
};

const cargar = () => {
  if (cargando || estado.horarios) return;
  cargando = true;
  clearTimeout(temporizador);
  apiRequest("/v1/horarios")
    .then(({ horarios }) => {
      intento = 0;
      publicar({ horarios, error: "" });
    })
    .catch((error) => {
      publicar({ horarios: null, error: error.message || "No se pudieron cargar los horarios." });
      const espera = reintentos[Math.min(intento, reintentos.length - 1)];
      intento += 1;
      temporizador = setTimeout(cargar, espera);
    })
    .finally(() => {
      cargando = false;
    });
};

const suscribir = (avisar) => {
  suscriptores.add(avisar);
  cargar();
  // Al volver a la pestaña o recuperar la conexión, si faltan los horarios se piden ya
  const reintentarYa = () => {
    if (!estado.horarios) {
      intento = 0;
      cargar();
    }
  };
  window.addEventListener("focus", reintentarYa);
  window.addEventListener("online", reintentarYa);
  return () => {
    suscriptores.delete(avisar);
    window.removeEventListener("focus", reintentarYa);
    window.removeEventListener("online", reintentarYa);
  };
};

/** Solo para tests: olvida los horarios cargados y permite fijar las esperas de reintento. */
export const reiniciarHorarios = ({ reintentosMs = REINTENTOS_MS } = {}) => {
  clearTimeout(temporizador);
  estado = { horarios: null, error: "" };
  cargando = false;
  intento = 0;
  reintentos = reintentosMs;
};

export function useHorarios() {
  const { horarios, error } = useSyncExternalStore(suscribir, () => estado);
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    const reloj = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(reloj);
  }, []);

  return { horarios, error, cargando: !horarios && !error, ahora };
}
