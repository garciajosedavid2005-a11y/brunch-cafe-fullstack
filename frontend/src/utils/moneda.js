// Precios: el backend los envía como enteros en COP; aquí solo se formatean.
// Única utilidad de moneda del frontend (no parsea texto).
const COP = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

export const formatearCOP = (valor) => COP.format(Number.isFinite(valor) ? valor : 0);
