import Contador from '../models/contador.model.js'

/**
 * Siguiente valor del contador `nombre`, de forma atómica ($inc).
 * `minimo`: el contador nunca queda por debajo (p. ej. el código más alto ya usado,
 * incluidos los que el seed insertó con código fijo). $max tampoco lo baja nunca,
 * así que los códigos de productos borrados no se reutilizan.
 */
export const siguienteValor = async (nombre, minimo = 0) => {
    try {
        await Contador.updateOne({ _id: nombre }, { $max: { seq: minimo } }, { upsert: true })
    } catch (error) {
        // Dos upserts simultáneos del primer uso: uno gana y el otro choca con el _id; basta reintentar
        if (error?.code !== 11000) throw error
        await Contador.updateOne({ _id: nombre }, { $max: { seq: minimo } })
    }
    const { seq } = await Contador.findOneAndUpdate({ _id: nombre }, { $inc: { seq: 1 } }, { returnDocument: 'after' })
    return seq
}
