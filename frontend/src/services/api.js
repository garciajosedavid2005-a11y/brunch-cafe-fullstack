// Único cliente HTTP del frontend (0.8). Cookies de sesión incluidas, JSON y
// errores con el formato { error: { code, message, details } } del backend.
export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export function apiAssetUrl(path) {
  if (!path || /^(data:|https?:\/\/)/i.test(path)) return path || "";
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiRequest(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error("No se pudo conectar con el servidor.");
  }

  if (response.status === 204) return null;

  // Sin cuerpo → {} (los llamadores desestructuran la respuesta)
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || payload?.message || "No fue posible completar la solicitud.");
    error.code = payload?.error?.code;
    error.details = payload?.error?.details;
    error.status = response.status;
    throw error;
  }
  return payload;
}

const conCuerpo = (method) => (ruta, cuerpo) => apiRequest(ruta, { method, body: JSON.stringify(cuerpo ?? {}) });

export const api = {
  get: (ruta) => apiRequest(ruta),
  post: conCuerpo("POST"),
  put: conCuerpo("PUT"),
  patch: conCuerpo("PATCH"),
  delete: (ruta) => apiRequest(ruta, { method: "DELETE" }),
};
