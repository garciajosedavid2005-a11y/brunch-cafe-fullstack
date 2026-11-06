// Reglas de horario en el frontend (0.8, decisión 15 y N8). Son las mismas que valida el
// backend (src/libs/horarios.js); aquí solo sirven para ofrecer las horas válidas.
// "Ahora" y "hoy" son los de America/Bogota, aunque el navegador esté en otra zona.
import { ZONA_HORARIA, fechaLocal, formatearHoraTexto } from "./fechas";

const dosDigitos = (n) => String(n).padStart(2, "0");
const horaDe = (hhmm) => Number(hhmm.slice(0, 2));

/** Minutos transcurridos del día en Bogotá. */
const minutosLocales = (ahora) => {
  const [h, m] = new Intl.DateTimeFormat("en-GB", {
    timeZone: ZONA_HORARIA, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(ahora).split(":").map(Number);
  return h * 60 + m;
};

/** Horas en punto de un rango, ambos extremos incluidos. */
export const horasEnPunto = ({ desde, hasta }) => {
  const inicio = horaDe(desde);
  return Array.from({ length: Math.max(horaDe(hasta) - inicio + 1, 0) }, (_, i) => `${dosDigitos(inicio + i)}:00`);
};

const esFinDeSemana = (fecha) => {
  const [a, m, d] = fecha.split("-").map(Number);
  return [0, 6].includes(new Date(Date.UTC(a, m - 1, d)).getUTCDay());
};

/** Horas que se pueden reservar el día `fecha` ("YYYY-MM-DD"): las del rango que no han pasado. */
export const horasReserva = (horarios, fecha, ahora = new Date()) => {
  if (!horarios || !/^\d{4}-\d{2}-\d{2}$/.test(fecha || "")) return [];
  const hoy = fechaLocal(ahora);
  if (fecha < hoy) return [];
  const rango = esFinDeSemana(fecha) ? horarios.reservas.finDeSemana : horarios.reservas.entreSemana;
  const horas = horasEnPunto(rango);
  if (fecha > hoy) return horas;
  const minutos = minutosLocales(ahora);
  return horas.filter((hora) => horaDe(hora) * 60 > minutos);
};

/** Horas de entrega a domicilio: hoy, dentro del rango y con la anticipación mínima. */
export const horasDomicilio = (horarios, ahora = new Date()) => {
  if (!horarios) return [];
  const limite = minutosLocales(ahora) + horarios.domicilio.anticipacionMinutos;
  return horasEnPunto(horarios.domicilio).filter((hora) => horaDe(hora) * 60 >= limite);
};

/** "08:00"–"19:00" → "8:00 a. m. a 7:00 p. m." */
export const textoRango = ({ desde, hasta }) => `${formatearHoraTexto(desde)} a ${formatearHoraTexto(hasta)}`;

export const textoAnticipacion = (minutos) =>
  minutos % 60 === 0 ? `${minutos / 60} ${minutos === 60 ? "hora" : "horas"}` : `${minutos} minutos`;

/** Opciones para un <select>: [{ valor: "09:00", etiqueta: "9:00 a. m." }]. */
export const opcionesDeHora = (horas) => horas.map((hora) => ({ valor: hora, etiqueta: formatearHoraTexto(hora) }));

/** Líneas para mostrar los horarios (pie de página y Nosotros): reservas por tipo de día y domicilio. */
export const lineasDeHorario = (horarios) => {
  const rango = ({ desde, hasta }) => `${formatearHoraTexto(desde)} – ${formatearHoraTexto(hasta)}`;
  return [
    { etiqueta: "Reservas de lunes a viernes", valor: rango(horarios.reservas.entreSemana) },
    { etiqueta: "Reservas de sábados y domingos", valor: rango(horarios.reservas.finDeSemana) },
    { etiqueta: "Domicilios para el mismo día", valor: rango(horarios.domicilio) },
  ];
};
