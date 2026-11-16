// Precios: el backend los envía como enteros en COP; aquí solo se formatean.
// Única utilidad de moneda del frontend (no parsea texto).
const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export const formatearCOP = (valor) => COP.format(Number.isFinite(valor) ? valor : 0);

// Fase 3 · Campos de pesos de la caja: 33000 → «33.000» (sin símbolo). 3.7 · El 0 se muestra como «0»
// (un valor real, p. ej. «Sin propina»), no como un ejemplo gris que parezca vacío
const MILES = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export const formatearMiles = (valor) => (Number.isFinite(valor) ? MILES.format(valor) : "");

// Fase 5 (F5-c) · Inventario: cantidades con hasta 3 decimales («1.500», «0,5») y costos por unidad de medida
// con hasta 2 («$45,5»), que no son montos enteros
const CANTIDAD = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 3 });
const COP_DECIMAL = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const formatearNumero = (valor) => CANTIDAD.format(Number.isFinite(valor) ? valor : 0);
export const formatearCOPDecimal = (valor) => COP_DECIMAL.format(Number.isFinite(valor) ? valor : 0);
