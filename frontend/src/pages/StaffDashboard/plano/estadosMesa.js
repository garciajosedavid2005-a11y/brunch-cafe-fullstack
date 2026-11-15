import { CalendarCheck, CircleCheck, Lock, ReceiptText, Sparkles, UtensilsCrossed } from "lucide-react";

// 1.6 · Estados de mesa (F1-2) con texto e icono: el color nunca es la única señal.
// Orden de la leyenda = orden del ciclo de la mesa.
export const ESTADOS_MESA = {
  libre: { etiqueta: "Libre", icono: CircleCheck },
  // 4.6 · No es un estado de la mesa en la BD: una mesa libre apartada para una reserva próxima (estadoVisible)
  reservada: { etiqueta: "Reservada", icono: CalendarCheck },
  ocupada: { etiqueta: "Ocupada", icono: UtensilsCrossed },
  cuenta_pedida: { etiqueta: "Cuenta pedida", icono: ReceiptText },
  por_limpiar: { etiqueta: "Por limpiar", icono: Sparkles },
  bloqueada: { etiqueta: "Bloqueada", icono: Lock },
};

/** 4.6 · Estado que se muestra: «reservada» si está libre y apartada para su reserva próxima. */
export const estadoVisible = (mesa) => (mesa.estado === "libre" && !mesa.cuenta && mesa.reserva?.bloqueada ? "reservada" : mesa.estado);

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

// 4.3 · Reserva próxima de una mesa (F4-e): texto corto de la tarjeta y si ya se sugiere el no-show (15 min)
export const MINUTOS_NO_SHOW = 15;
export const retrasada = (reserva) => (reserva?.minutosRetraso || 0) >= MINUTOS_NO_SHOW;
