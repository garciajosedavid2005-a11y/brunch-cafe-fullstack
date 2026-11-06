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

const ES_CANCELACION = ["cancelado", "cancelada"];

// Pide el motivo (con el diálogo de la app) si la transición lo exige.
// Devuelve el motivo ("" si no hace falta) o null si el usuario desiste.
export const pedirMotivo = async (confirmar, transicion) => {
  if (!transicion?.requiereMotivo) return "";
  const cancela = ES_CANCELACION.includes(transicion.codigo);
  const { confirmado, motivo } = await confirmar({
    titulo: cancela ? "Cancelar" : `Pasar a "${transicion.nombre}"`,
    mensaje: cancela
      ? "Esta acción no se puede deshacer. Indica el motivo de la cancelación."
      : `Indica el motivo para pasar a "${transicion.nombre}".`,
    confirmarTexto: cancela ? "Sí, cancelar" : "Confirmar",
    cancelarTexto: "Volver",
    peligroso: cancela,
    motivo: { etiqueta: "Motivo", requerido: true },
  });
  return confirmado ? motivo : null;
};
