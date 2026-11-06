// Reglas de horario (decisión 15 y N8) como funciones puras sobre la utilidad de fechas (0.10).
// `horarios` es el documento de configuración: { domicilio: { desde, hasta, anticipacionMinutos },
// reservas: { entreSemana: { desde, hasta }, finDeSemana: { desde, hasta } } }.
import { diaSemana, fechaLocal, instanteLocal } from '../modulos/compartido/fechas.js'

const dosDigitos = (n) => String(n).padStart(2, '0')

/** Horas en punto de un rango, con ambos extremos incluidos: 08:00–11:00 → 08, 09, 10, 11. */
export const horasEnPunto = ({ desde, hasta }) => {
    const inicio = Number(desde.slice(0, 2))
    const fin = Number(hasta.slice(0, 2))
    return Array.from({ length: Math.max(fin - inicio + 1, 0) }, (_, i) => `${dosDigitos(inicio + i)}:00`)
}

/** Rango de reservas que aplica a una fecha "YYYY-MM-DD" (sábado y domingo = fin de semana). */
export const rangoReserva = (horarios, fecha) =>
    ([0, 6].includes(diaSemana(fecha)) ? horarios.reservas.finDeSemana : horarios.reservas.entreSemana)

/** Horas que se pueden reservar ese día: las del rango que todavía no han pasado. */
export const horasReserva = (horarios, fecha, ahora = new Date()) =>
    horasEnPunto(rangoReserva(horarios, fecha)).filter((hora) => instanteLocal(fecha, hora) > ahora)

/** Horas de entrega a domicilio: solo hoy (Bogotá), dentro del rango y con la anticipación mínima. */
export const horasDomicilio = (horarios, ahora = new Date()) => {
    const hoy = fechaLocal(ahora)
    const limite = ahora.getTime() + horarios.domicilio.anticipacionMinutos * 60000
    return horasEnPunto(horarios.domicilio).filter((hora) => instanteLocal(hoy, hora).getTime() >= limite)
}

/** "19:00" → "7:00 p. m." (mismo formato que muestra el frontend). */
export const hora12 = (hora) => {
    const h = Number(hora.slice(0, 2))
    return `${h % 12 || 12}:${hora.slice(3, 5)} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

export const textoRango = ({ desde, hasta }) => `de ${hora12(desde)} a ${hora12(hasta)}`

export const textoAnticipacion = (minutos) =>
    (minutos % 60 === 0 ? `${minutos / 60} ${minutos === 60 ? 'hora' : 'horas'}` : `${minutos} minutos`)
