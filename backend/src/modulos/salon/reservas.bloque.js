// Fase 4 · Bloque de una reserva en su mesa (PLAN_FASE_4, F4-1): dura 90 min y la mesa queda reservada desde
// 15 min antes, es decir [inicio − 15 min, inicio + 90 min). Dos bloques de la misma mesa se cruzan si sus
// inicios están a menos de 105 min.
import Reserva from './reserva.model.js'
import Estado from '../compartido/estado.model.js'
import Configuracion from '../configuracion/configuracion.model.js'
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

export const codigoReserva = (id) => `RES-${String(id).slice(-6).toUpperCase()}`

// Reservas que todavía pueden llegar: bloquean su mesa y salen en el plano (una sentada ya tiene su cuenta)
export const ESTADOS_RESERVA_POR_LLEGAR = ['pendiente', 'confirmada']

// 4.6 · «Apartar la mesa desde … min antes» (Admin › Horarios); sin el campo, 60
export const APARTAR_MESA_POR_DEFECTO_MIN = 60

/** Minutos antes de una reserva con mesa desde los que la mesa queda apartada (leído en la transacción). */
export const minutosApartado = async (session) => {
    const doc = await Configuracion.findOne({ clave: 'horarios' }).select('reservas.apartarMesaMin').session(session ?? null).lean()
    return doc?.reservas?.apartarMesaMin ?? APARTAR_MESA_POR_DEFECTO_MIN
}

/**
 * 4.3 (F4-c) y 4.6 · Reserva por llegar que tiene la mesa apartada en `ahora`: desde `antesMin` antes del inicio
 * hasta que terminan sus 90 min. Mientras tanto la mesa no se abre, mueve ni une para otra persona. null si no
 * hay. Al abrir, mover o unir, `antesMin` es el apartado configurado; al sentar otra reserva de la mesa, el
 * margen de su bloque (15 min), porque las reservas de una misma mesa ya no se cruzan (F4-1).
 */
export const reservaQueBloquea = async ({ mesaId, ahora = new Date(), excepto = null, antesMin = MARGEN_ANTES_MIN, session }) => Reserva.findOne({
    mesa: mesaId,
    ...(excepto ? { _id: { $ne: excepto } } : {}),
    estado: { $in: await idsEstadosReserva(ESTADOS_RESERVA_POR_LLEGAR, session) },
    inicio: { $gt: new Date(ahora.getTime() - DURACION_RESERVA_MIN * MINUTO), $lte: new Date(ahora.getTime() + antesMin * MINUTO) },
}).sort({ inicio: 1 }).select('inicio hora nombre').session(session ?? null).lean()

/** Texto para el 409: «La mesa 3 ya está reservada a las 9:00 a. m.» */
export const textoChoque = (numeroMesa, choque) =>
    `La mesa ${numeroMesa} ya está reservada a las ${hora12(choque.hora || horaLocal(choque.inicio))} (cada reserva la ocupa desde 15 min antes y durante 90 min).`
