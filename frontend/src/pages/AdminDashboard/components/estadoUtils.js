// Utilidades de presentación de estados (dashboard)
const CLASE_POR_CODIGO = {
  pendiente: "admin-badge--warning",
  confirmado: "admin-badge--info",
  en_preparacion: "admin-badge--info",
  en_camino: "admin-badge--info",
  sentada: "admin-badge--info",
  listo: "admin-badge--success",
  entregado: "admin-badge--success",
  confirmada: "admin-badge--success",
  completada: "admin-badge--neutral",
  no_show: "admin-badge--neutral",
  cancelado: "admin-badge--danger",
  cancelada: "admin-badge--danger",
};

export const claseEstado = (codigo) => CLASE_POR_CODIGO[codigo] || "admin-badge--neutral";

// Pide el motivo si la transición lo exige; devuelve null si el usuario desiste
export const pedirMotivo = (transicion) => {
  if (!transicion?.requiereMotivo) return "";
  const motivo = window.prompt(`Motivo para pasar a "${transicion.nombre}":`);
  return motivo && motivo.trim() ? motivo.trim() : null;
};
