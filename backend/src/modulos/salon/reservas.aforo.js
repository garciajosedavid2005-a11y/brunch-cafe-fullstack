// 4.2 · Aforo de reservas por franja horaria (PLAN_FASE_4, F4-2, F4-d): máximo de personas que empiezan a la misma
// hora. El de la hora (Admin › Horarios) o, si no tiene, el general; null = sin límite. Cuentan las reservas
// activas (pendiente, confirmada, sentada) de esa fecha y hora; la lista de espera no cuenta.
import Reserva from './reserva.model.js'
import Contador from '../compartido/contador.model.js'
import { AppError } from '../compartido/errors.js'
import { instanteLocal } from '../compartido/fechas.js'
import { hora12 } from '../configuracion/horarios.reglas.js'
import { ESTADOS_RESERVA_ACTIVA, idsEstadosReserva } from './reservas.bloque.js'

/** Máximo de personas a esa hora (null = sin límite). */
export const limiteAforo = (horarios, hora) => {
    const aforo = horarios?.reservas?.aforo
    const propio = aforo?.porHora?.find((h) => h.hora === hora)
    return propio ? propio.maximo : aforo?.general ?? null
}

/**
 * Comprueba dentro de la transacción que `personas` caben a esa fecha y hora (sin contar la reserva `excepto`,
 * la que se edita). Toca el contador `aforo:<fecha> <hora>` (F4-a): dos reservas a la vez para la misma franja
 * escriben el mismo documento, chocan y la que se reintenta ya ve la otra.
 */
export const verificarAforo = async ({ horarios, fecha, hora, personas, excepto = null, session }) => {
    const maximo = limiteAforo(horarios, hora)
    if (maximo == null) return
    await Contador.updateOne({ _id: `aforo:${fecha} ${hora}` }, { $inc: { seq: 1 } }, { upsert: true, session })
    const [suma] = await Reserva.aggregate([
        { $match: { inicio: instanteLocal(fecha, hora), estado: { $in: await idsEstadosReserva(ESTADOS_RESERVA_ACTIVA, session) }, ...(excepto ? { _id: { $ne: excepto } } : {}) } },
        { $group: { _id: null, personas: { $sum: '$cantidadPersonas' } } },
    ]).session(session ?? null)
    const ocupados = suma?.personas ?? 0
    if (ocupados + personas <= maximo) return
    const disponibles = Math.max(maximo - ocupados, 0)
    const texto = maximo === 0
        ? `A las ${hora12(hora)} no se reciben reservas.`
        : `A las ${hora12(hora)} ${disponibles ? `solo ${disponibles === 1 ? 'queda 1 cupo' : `quedan ${disponibles} cupos`}` : 'ya no quedan cupos'} (máximo ${maximo} personas por hora).`
    // Sin `ocupados`: al cliente le basta con los cupos que quedan
    throw new AppError(409, 'AFORO_COMPLETO', `${texto} Elige otra hora.`, { hora, maximo, disponibles })
}
