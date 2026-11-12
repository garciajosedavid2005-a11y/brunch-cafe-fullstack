import { CircleCheck, Lock, ReceiptText, Sparkles, UtensilsCrossed } from "lucide-react";

// 1.6 · Estados de mesa (F1-2) con texto e icono: el color nunca es la única señal.
// Orden de la leyenda = orden del ciclo de la mesa.
export const ESTADOS_MESA = {
  libre: { etiqueta: "Libre", icono: CircleCheck },
  ocupada: { etiqueta: "Ocupada", icono: UtensilsCrossed },
  cuenta_pedida: { etiqueta: "Cuenta pedida", icono: ReceiptText },
  por_limpiar: { etiqueta: "Por limpiar", icono: Sparkles },
  bloqueada: { etiqueta: "Bloqueada", icono: Lock },
};

export const datosEstado = (codigo) => ESTADOS_MESA[codigo] || { etiqueta: codigo, icono: CircleCheck };

/** «35 min», «1 h 20 min». */
export const formatearMinutos = (minutos) => {
  if (!Number.isFinite(minutos) || minutos < 0) return "";
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
};

/** Clave de idempotencia para una acción (0.9): la reutiliza el reintento de la misma acción. */
export const nuevaClave = () =>
  globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
