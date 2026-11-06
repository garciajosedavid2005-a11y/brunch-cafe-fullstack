import { useEffect, useState } from "react";
import { apiRequest } from "../services/api";

// Horarios de domicilio y reservas desde el backend (GET /api/v1/horarios). Se piden una vez
// por carga de la página. `ahora` se renueva cada minuto para que las horas que van pasando
// desaparezcan de los selectores sin recargar.
let pendiente = null;

const cargar = () => {
  pendiente ??= apiRequest("/v1/horarios").then(({ horarios }) => horarios).catch((error) => {
    pendiente = null; // se reintenta en el próximo montaje
    throw error;
  });
  return pendiente;
};

/** Solo para tests: olvida los horarios ya pedidos. */
export const reiniciarHorarios = () => {
  pendiente = null;
};

export function useHorarios() {
  const [estado, setEstado] = useState({ horarios: null, error: "" });
  const [ahora, setAhora] = useState(() => new Date());

  useEffect(() => {
    let activo = true;
    cargar()
      .then((horarios) => activo && setEstado({ horarios, error: "" }))
      .catch((error) => activo && setEstado({ horarios: null, error: error.message || "No se pudieron cargar los horarios." }));
    const reloj = setInterval(() => setAhora(new Date()), 60000);
    return () => {
      activo = false;
      clearInterval(reloj);
    };
  }, []);

  return { ...estado, cargando: !estado.horarios && !estado.error, ahora };
}
