// Fase 4 · Bloque de una reserva en su mesa (PLAN_FASE_4, F4-1): dura 90 min y la mesa queda reservada desde
// 15 min antes, es decir [inicio − 15 min, inicio + 90 min). Dos bloques de la misma mesa se cruzan si sus
// inicios están a menos de 105 min.
import Reserva from './reserva.model.js'
import Estado from '../compartido/estado.model.js'
import { hora12 } from '../configuracion/horarios.reglas.js'
import { horaLocal } from '../compartido/fechas.js'

export const DURACION_RESERVA_MIN = 90
export const MARGEN_ANTES_MIN = 15
const MINUTO = 60000
const SEPARACION_MS = (DURACION_RESERVA_MIN + MARGEN_ANTES_MIN) * MINUTO

// Reservas que ocupan su mesa: las que aún pueden llegar o ya están sentadas
export const ESTADOS_RESERVA_ACTIVA = ['pendiente', 'confirmada', 'sentada']

export const inicioBloque = (inicio) => new Date(new Date(inicio).getTime() - MARGEN_ANTES_MIN * MINUTO)
export const finBloque = (inicio) => new Date(new Date(inicio).getTime() + DURACION_RESERVA_MIN * MINUTO)

/** ¿Se cruzan los bloques de dos reservas de la misma mesa? */
export const solapan = (inicioA, inicioB) => Math.abs(new Date(inicioA).getTime() - new Date(inicioB).getTime()) < SEPARACION_MS

export const idsEstadosReserva = async (codigos, session) =>
    (await Estado.find({ tipo: 'reserva', codigo: { $in: codigos } }).select('_id').session(session ?? null).lean()).map((e) => e._id)

/** Otra reserva activa de la mesa cuyo bloque se cruza con el de `inicio` (o null). */
export const buscarChoque = async ({ mesaId, inicio, excepto, session }) => {
    const t = new Date(inicio).getTime()
    return Reserva.findOne({
        mesa: mesaId,
        _id: { $ne: excepto },
        estado: { $in: await idsEstadosReserva(ESTADOS_RESERVA_ACTIVA, session) },
        inicio: { $gt: new Date(t - SEPARACION_MS), $lt: new Date(t + SEPARACION_MS) },
    }).select('inicio hora nombre').session(session ?? null).lean()
}

/** Texto para el 409: «La mesa 3 ya está reservada a las 9:00 a. m.» */
export const textoChoque = (numeroMesa, choque) =>
    `La mesa ${numeroMesa} ya está reservada a las ${hora12(choque.hora || horaLocal(choque.inicio))} (cada reserva la ocupa desde 15 min antes y durante 90 min).`
