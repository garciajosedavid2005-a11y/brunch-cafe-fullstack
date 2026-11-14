// Precios: el backend los envía como enteros en COP; aquí solo se formatean.
// Única utilidad de moneda del frontend (no parsea texto).
const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export const formatearCOP = (valor) => COP.format(Number.isFinite(valor) ? valor : 0);

// Fase 3 · Campos de pesos de la caja: 33000 → «33.000» (sin símbolo; vacío si es 0)
const MILES = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 0 });
export const formatearMiles = (valor) => (valor ? MILES.format(valor) : "");
