// Fase 5 · Formatos del inventario (F5-c): cantidades con hasta 3 decimales y costos con hasta 2.
import { formatearCOPDecimal, formatearNumero } from "../../utils/moneda";

/** Idempotency-Key de una acción (un formulario abierto = una clave): un reintento no la repite en el servidor. */
export const nuevaClave = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

export const UNIDADES = [
  { valor: "g", etiqueta: "Gramos (g)" },
  { valor: "ml", etiqueta: "Mililitros (ml)" },
  { valor: "unidad", etiqueta: "Unidades" },
];

const abreviatura = (unidad, valor) => (unidad === "unidad" ? (Math.abs(valor) === 1 ? "unidad" : "unidades") : unidad);

/** 1500 g → «1.500 g»; 0,5 unidad → «0,5 unidades». */
export const formatearCantidad = (valor, unidad) =>
  `${formatearNumero(valor)}${unidad ? ` ${abreviatura(unidad, valor)}` : ""}`;

/** Costo por unidad de medida: «$45,5 / g». */
export const formatearCosto = (valor, unidad) =>
  `${formatearCOPDecimal(valor)}${unidad ? ` / ${unidad === "unidad" ? "unidad" : unidad}` : ""}`;

/** Lee un número escrito con coma o punto decimal; vacío → null; texto inválido → NaN. */
export const leerNumero = (texto) => {
  const limpio = String(texto ?? "").trim().replace(",", ".");
  if (limpio === "") return null;
  return Number(limpio);
};

export const NIVELES = {
  agotado: { texto: "Sin existencia", clase: "admin-badge--danger" },
  bajo: { texto: "Bajo el mínimo", clase: "admin-badge--warning" },
  ok: { texto: "Suficiente", clase: "admin-badge--success" },
};

export const TIPOS_MOVIMIENTO = {
  inicial: "Existencia inicial",
  consumo: "Consumo",
  devolucion: "Devolución",
  recepcion: "Recepción de compra",
  ajuste: "Ajuste",
  merma: "Merma",
  vencimiento: "Vencimiento",
};
