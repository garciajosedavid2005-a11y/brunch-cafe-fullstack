import { formatearCOP } from "../../utils/moneda";
import { formatearFecha, formatearHora, formatearFechaCalendario, formatearHoraTexto } from "../../utils/fechas";

// Montos del dashboard: enteros en COP (misma utilidad que el resto del sitio)
export const formatCurrency = (value) => formatearCOP(Number(value) || 0);

// Fechas: delegan en utils/fechas (America/Bogota). Se mantienen los nombres que usa el dashboard.
// Instante (createdAt, fecha de un pedido) → fecha / hora en Bogotá
export const formatDate = (value) => formatearFecha(value);
export const formatTime = (value) => formatearHora(value);
// Día de una reserva (fecha de calendario, sin hora)
export const formatCalendarDate = (value) => formatearFechaCalendario(value);
// "HH:mm" → "8:00 a. m."
export const formatClock = (value) => formatearHoraTexto(value);

// "1 usuario" / "3 usuarios"
export const plural = (cantidad, singular, pluralTexto = `${singular}s`) =>
  `${cantidad} ${cantidad === 1 ? singular : pluralTexto}`;
