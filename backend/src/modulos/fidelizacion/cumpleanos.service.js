import Usuario from '../identidad/usuario.model.js'
import { cumpleEsteMes } from '../identidad/clienteStaff.js'
import { fechaLocal } from '../compartido/fechas.js'
import { AppError } from '../compartido/errors.js'
import UsoCumpleanos from './usoCumpleanos.model.js'
import { PORCENTAJE_CUMPLEANOS, descuentoCumpleanos } from './reglas.js'

// 6.7 (F6-6, F6-d) · Descuento de cumpleaños: 10 % del consumo en UNA compra durante el mes de cumpleaños (hora de
// Bogotá), un uso vigente por usuario y año. En la caja va antes del canje de puntos; en el domicilio, en el carrito.
export { PORCENTAJE_CUMPLEANOS, descuentoCumpleanos }

const anioLocal = (ahora = new Date()) => Number(fechaLocal(ahora).slice(0, 4))
const noDisponible = () => new AppError(409, 'CUMPLEANOS_NO_DISPONIBLE', 'El descuento de cumpleaños no está disponible: solo en el mes de cumpleaños y una vez al año.')

/**
 * Estado del descuento para el usuario: 'disponible', 'usado' (ya lo usó este año), 'fuera_de_mes' o 'sin_fecha'
 * (sin fecha de nacimiento en el perfil).
 */
export const estadoCumpleanos = async (usuarioId, { ahora = new Date(), session = null } = {}) => {
    const usuario = await Usuario.findById(usuarioId).select('fechaNacimiento').session(session).lean()
    if (!usuario?.fechaNacimiento) return 'sin_fecha'
    if (!cumpleEsteMes(usuario.fechaNacimiento, ahora)) return 'fuera_de_mes'
    const usado = await UsoCumpleanos.exists({ usuario: usuarioId, anio: anioLocal(ahora), vigente: true }).session(session)
    return usado ? 'usado' : 'disponible'
}

/** 409 si no le corresponde hoy; 400 si el 10 % no llega a $1. */
export const comprobarCumpleanos = async ({ usuarioId, monto, session, ahora = new Date() }) => {
    if ((await estadoCumpleanos(usuarioId, { ahora, session })) !== 'disponible') throw noDisponible()
    if (monto < 1) throw new AppError(400, 'CUMPLEANOS_SIN_CONSUMO', 'No hay consumo sobre el cual aplicar el descuento de cumpleaños.')
}

/**
 * Registra el uso en la transacción de quien cobra o crea el pedido y devuelve el descuento para el comprobante o el
 * pedido. 409 si no le corresponde o ya lo usó (también si dos cobros a la vez lo intentan: el índice único decide).
 */
export const usarCumpleanos = async ({ usuarioId, consumo, referencia, session, ahora = new Date() }) => {
    const monto = descuentoCumpleanos(consumo)
    await comprobarCumpleanos({ usuarioId, monto, session, ahora })
    try {
        await UsoCumpleanos.create([{ usuario: usuarioId, anio: anioLocal(ahora), monto, referencia }], { session })
    } catch (error) {
        if (error?.code === 11000) throw noDisponible()
        throw error
    }
    return { tipo: 'cumpleanos', monto, detalle: `${PORCENTAJE_CUMPLEANOS} % de cumpleaños` }
}

/** Libera el uso ligado a alguna de esas referencias (pedido cancelado o comprobante anulado). Sin uso, no hace nada. */
export const liberarCumpleanos = async ({ referencias, motivo, codigo = '', session }) => {
    const ids = referencias.filter(Boolean)
    if (!ids.length) return
    await UsoCumpleanos.updateOne(
        { 'referencia.id': { $in: ids }, vigente: true },
        { $set: { vigente: false, liberado: { motivo, codigo, en: new Date() } } },
        { session, runValidators: true },
    )
}
