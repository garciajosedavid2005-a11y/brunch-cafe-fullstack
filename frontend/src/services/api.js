const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export function apiAssetUrl(path) {
  if (!path || /^(data:|https?:\/\/)/i.test(path)) return path || "";
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || payload.message || "No fue posible completar la solicitud.");
    error.code = payload.error?.code;
    error.details = payload.error?.details;
    error.status = response.status;
    throw error;
  }
  return payload;
}
