import mongoose from 'mongoose'

/**
 * Ejecuta `fn(session)` dentro de una transacción de MongoDB (requiere replica set, 0.9).
 * Si `fn` lanza, no queda nada escrito. Los conflictos transitorios (dos transacciones que
 * escriben el mismo documento) se reintentan solos; por eso `fn` debe poder repetirse.
 * Cada operación de `fn` debe recibir `{ session }`.
 */
export const conTransaccion = (fn) => mongoose.connection.transaction(fn)
