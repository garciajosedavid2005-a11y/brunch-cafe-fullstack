// Única utilidad de fechas del frontend (0.10).
// - Los instantes (createdAt, inicio, entregaEn) llegan en UTC y se muestran en America/Bogota,
//   aunque el navegador esté en otra zona.
// - Las fechas de calendario (día de una reserva, "YYYY-MM-DD") no tienen hora: se formatean
//   sin convertir de zona para que no se corran de día.
export const ZONA_HORARIA = "America/Bogota";

const fecha = (valor) => {
  const d = valor instanceof Date ? valor : new Date(valor ?? NaN);
  return Number.isNaN(d.getTime()) ? null : d;
};

const ESTILOS = {
  medium: { dateStyle: "medium" },
  long: { dateStyle: "long" },
  full: { dateStyle: "full" },
};

/** Instante → fecha en Bogotá ("5 nov 2026"). */
export const formatearFecha = (valor, estilo = "medium") => {
  const d = fecha(valor);
  return d ? new Intl.DateTimeFormat("es-CO", { ...ESTILOS[estilo], timeZone: ZONA_HORARIA }).format(d) : "";
};

/** Instante → hora en Bogotá ("10:30 p. m."). */
export const formatearHora = (valor) => {
  const d = fecha(valor);
  return d
    ? new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", timeZone: ZONA_HORARIA }).format(d)
    : "";
};

/** "YYYY-MM-DD" (o el Date de mediodía UTC con que se guarda) → fecha de calendario. */
export const formatearFechaCalendario = (valor, estilo = "medium") => {
  if (!valor) return "";
  const texto = typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? `${valor}T12:00:00Z` : valor;
  const d = fecha(texto);
  return d ? new Intl.DateTimeFormat("es-CO", { ...ESTILOS[estilo], timeZone: "UTC" }).format(d) : "";
};

/** "HH:mm" → "8:00 a. m." (si no es una hora, se devuelve tal cual). */
export const formatearHoraTexto = (valor) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(valor ?? ""));
  if (!m) return valor || "";
  return new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(1970, 0, 1, Number(m[1]), Number(m[2]))));
};

/** Instante → "YYYY-MM-DD" del calendario de Bogotá. */
export const fechaLocal = (valor) => {
  const d = fecha(valor);
  return d ? new Intl.DateTimeFormat("en-CA", { timeZone: ZONA_HORARIA }).format(d) : "";
};

/** Hoy en Bogotá ("YYYY-MM-DD"). */
export const hoyLocal = () => fechaLocal(new Date());
