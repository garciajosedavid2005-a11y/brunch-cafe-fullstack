import { fechaLocal, formatearFechaCalendario, formatearHoraTexto } from "../../../utils/fechas";

// 4.5 (F4-7) · Aviso en vivo al staff cuando un cliente edita su reserva confirmada. El canal solo trae el id (el
// bus nunca envía datos personales): la pantalla vuelve a leer la agenda y compara con lo que tenía.
// El día de calendario de Bogotá, con las utilidades de fechas («20 de noviembre»)
const diaTexto = (valor) => formatearFechaCalendario(fechaLocal(valor), "diaMes");

// Sin doble punto cuando el texto termina en «a. m.» / «p. m.»
const conPunto = (texto) => (texto.endsWith(".") ? texto : `${texto}.`);

/**
 * «Laura Gómez cambió su reserva RES-…: hora 8:00 a. m. → 9:00 a. m.; 2 → 4 personas; …». El aviso solo llega
 * por una reserva confirmada que el cliente editó: si ahora está pendiente, se dice siempre (aunque la agenda
 * anterior ya la tuviera así por otro aviso que llegó antes).
 */
export const textoCambioReserva = (antes, despues) => {
  const quien = `${despues.cliente} cambió su reserva ${despues.codigo}`;
  if (!antes) return `${quien} (${formatearHoraTexto(despues.hora)}).`;
  const cambios = [];
  if (fechaLocal(antes.fecha) !== fechaLocal(despues.fecha)) cambios.push(`fecha ${diaTexto(antes.fecha)} → ${diaTexto(despues.fecha)}`);
  if (antes.hora !== despues.hora) cambios.push(`hora ${formatearHoraTexto(antes.hora)} → ${formatearHoraTexto(despues.hora)}`);
  if (antes.personas !== despues.personas) cambios.push(`${antes.personas} → ${despues.personas} personas`);
  if (antes.mesa && !despues.mesa) cambios.push(`ya no tiene la mesa ${antes.mesa.numero} (no cabe)`);
  const sinCambios = !cambios.length;
  if (despues.estadoCodigo === "pendiente") cambios.push("vuelve a estar pendiente de confirmar");
  if (sinCambios) return conPunto(`${quien} (sin cambios de fecha, hora ni personas)${cambios.length ? `; ${cambios.join("; ")}` : ""}`);
  return conPunto(`${quien}: ${cambios.join("; ")}`);
};
