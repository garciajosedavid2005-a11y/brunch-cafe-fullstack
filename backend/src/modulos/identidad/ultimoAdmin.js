import Usuario from './usuario.model.js'
import Contador from '../compartido/contador.model.js'
import { AppError } from '../compartido/errors.js'

// Documento común que escriben todas las transacciones que quitan un admin (degradar, desactivar o
// eliminar): dos a la vez chocan aquí (WriteConflict), la segunda se reintenta y vuelve a contar (0.9).
const BLOQUEO_ADMINS = 'bloqueo-ultimo-admin'

/** Crea el documento de bloqueo si no existe (fuera de la transacción). */
export const asegurarBloqueoAdmins = async () => {
    try {
        await Contador.updateOne({ _id: BLOQUEO_ADMINS }, { $setOnInsert: { seq: 0 } }, { upsert: true })
    } catch (error) {
        if (error?.code !== 11000) throw error // otro upsert simultáneo ya lo creó
    }
}

/** Dentro de la transacción: escribe el bloqueo y exige otro admin activo distinto de `excluirId`. */
export const comprobarQuedaOtroAdmin = async (rolAdminId, excluirId, session) => {
    await Contador.updateOne({ _id: BLOQUEO_ADMINS }, { $inc: { seq: 1 } }, { session })
    const otros = await Usuario.countDocuments({ rol: rolAdminId, activo: { $ne: false }, _id: { $ne: excluirId } }).session(session)
    if (otros === 0) throw new AppError(409, 'ULTIMO_ADMIN', 'Debe quedar al menos un administrador activo.')
}
