const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

const pedir = async (ruta, opciones = {}) => {
  let respuesta;

  try {
    respuesta = await fetch(`${API_URL}${ruta}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...opciones,
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }

  let datos = null;
  try {
    datos = await respuesta.json();
  } catch {
    // respuesta sin cuerpo
  }

  if (!respuesta.ok) {
    const error = new Error(datos?.message || "No fue posible completar la solicitud.");
    error.status = respuesta.status;
    throw error;
  }

  return datos;
};

export const adminApi = {
  get: (ruta) => pedir(ruta),
  post: (ruta, cuerpo) => pedir(ruta, { method: "POST", body: JSON.stringify(cuerpo) }),
  put: (ruta, cuerpo) => pedir(ruta, { method: "PUT", body: JSON.stringify(cuerpo) }),
  patch: (ruta, cuerpo) => pedir(ruta, { method: "PATCH", body: JSON.stringify(cuerpo) }),
  delete: (ruta) => pedir(ruta, { method: "DELETE" }),
};