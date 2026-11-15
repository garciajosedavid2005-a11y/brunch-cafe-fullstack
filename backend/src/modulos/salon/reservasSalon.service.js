// Fase 4 · Reservas conectadas al salón (PLAN_FASE_4). 4.1: mesa asignada sin solapamientos.
import { z } from 'zod'
import Reserva from './reserva.model.js'
import Mesa from './mesa.model.js'
import { AppError, detallesZod } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { codigoActual, registrarEvento } from '../compartido/estados.service.js'
import { tienePermiso } from '../identidad/permisos.js'
import { buscarChoque, finBloque, textoChoque } from './reservas.bloque.js'
import { inicioReserva } from '../compartido/fechas.js'

// Estados en los que la reserva todavía puede cambiar de mesa (aún no llegó)
export const RESERVA_CON_MESA_EDITABLE = ['pendiente', 'confirmada']
const OBJECT_ID = /^[0-9a-f]{24}$/i

const asignarMesaSchema = z.object({
    mesaId: z.union([z.null(), z.string().regex(OBJECT_ID, { error: 'La mesa no es válida.' })], { error: 'Indica la mesa (o null para quitarla).' }),
}).strict()

const exigir = (sesion, clave) => {
    if (!tienePermiso(sesion?.permisos || [], clave)) {
        throw new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: [clave] })
    }
}

export const reservaNoEncontrada = () => new AppError(404, 'RESERVA_NO_ENCONTRADA', 'La reserva no existe.')
const mesaNoEncontrada = () => new AppError(404, 'MESA_NO_ENCONTRADA', 'La mesa no existe o está inactiva.')

/**
 * Comprueba que `mesa` (ya «tocada» en la transacción) recibe la reserva: capacidad y sin choques.
 * Devuelve el error a lanzar, o null si cabe.
 */
export const problemaDeMesa = async ({ mesa, reserva, session }) => {
    if (mesa.capacidad < reserva.cantidadPersonas) {
        return new AppError(409, 'MESA_PEQUENA', `La mesa ${mesa.numero} es para ${mesa.capacidad} ${mesa.capacidad === 1 ? 'persona' : 'personas'} y la reserva es de ${reserva.cantidadPersonas}.`,
            { capacidad: mesa.capacidad, personas: reserva.cantidadPersonas })
    }
    const choque = await buscarChoque({ mesaId: mesa._id, inicio: reserva.inicio, excepto: reserva._id, session })
    if (choque) {
        return new AppError(409, 'MESA_OCUPADA_EN_HORARIO', textoChoque(mesa.numero, choque), { reserva: `RES-${String(choque._id).slice(-6).toUpperCase()}` })
    }
    return null
}

/**
 * «Toca» la mesa activa dentro de la transacción (F4-a): dos asignaciones a la vez escriben el mismo
 * documento, chocan y la que se reintenta ya ve la otra reserva.
 */
export const tocarMesa = (mesaId, session) =>
    Mesa.findOneAndUpdate({ _id: mesaId, activa: true }, { $currentDate: { updatedAt: true } }, { returnDocument: 'after', session }).lean()

/** PATCH /staff/reservas/:id/mesa { mesaId | null } (reserva:cambiar_estado) → la reserva con su mesa */
export const asignarMesa = async (id, datos, sesion) => {
    exigir(sesion, 'reserva:cambiar_estado')
    const r = asignarMesaSchema.safeParse(datos ?? {})
    if (!r.success) throw new AppError(400, 'VALIDATION_ERROR', r.error.issues[0]?.message || 'Datos no válidos', detallesZod(r.error))
    if (!OBJECT_ID.test(String(id))) throw reservaNoEncontrada()
    const { mesaId } = r.data

    return conTransaccion(async (session) => {
        const reserva = await Reserva.findById(id).populate('estado', 'codigo').session(session)
        if (!reserva) throw reservaNoEncontrada()
        const codigo = await codigoActual(reserva)
        if (!RESERVA_CON_MESA_EDITABLE.includes(codigo)) {
            throw new AppError(409, 'RESERVA_NO_EDITABLE', 'Solo se asigna mesa a una reserva pendiente o confirmada.', { estado: codigo })
        }
        const anterior = reserva.mesa ? await Mesa.findById(reserva.mesa).select('numero capacidad').session(session).lean() : null
        // La misma mesa (o quitar sin tener): no escribe ni deja Evento (doble clic, reintento)
        if (String(reserva.mesa ?? '') === String(mesaId ?? '').toLowerCase()) {
            return { id: String(reserva._id), mesa: anterior ? { id: String(anterior._id), numero: anterior.numero, capacidad: anterior.capacidad } : null }
        }
        // Las reservas anteriores a 0.10 no guardan `inicio`: se calcula de la fecha y la hora
        const inicio = reserva.inicio || inicioReserva(reserva.fecha, reserva.hora)
        let mesa = null
        if (mesaId) {
            if (finBloque(inicio) <= new Date()) {
                throw new AppError(409, 'RESERVA_VENCIDA', 'La reserva ya pasó: no se le asigna mesa. Márcala como no asistió o cancélala.')
            }
            mesa = await tocarMesa(mesaId, session)
            if (!mesa) throw mesaNoEncontrada()
            const problema = await problemaDeMesa({ mesa, reserva: { _id: reserva._id, inicio, cantidadPersonas: reserva.cantidadPersonas }, session })
            if (problema) throw problema
        }
        // Escritura condicional: choca con un cambio de estado simultáneo (p. ej. cancelarla)
        const actualizada = await Reserva.findOneAndUpdate(
            { _id: reserva._id, estado: reserva.estado._id },
            { $set: { mesa: mesa?._id ?? null } },
            { returnDocument: 'after', session },
        )
        if (!actualizada) throw new AppError(409, 'CONFLICTO_ESTADO', 'La reserva cambió mientras la editabas. Recarga e intenta de nuevo.')
        await registrarEvento({
            entidad: 'reserva', entidadId: reserva._id, tipo: 'mesa_asignada', usuario: sesion.id, actor: sesion.rol || 'staff',
            // Número (para leer) e id (el número de una mesa se puede cambiar)
            datos: { de: anterior?.numero ?? null, a: mesa?.numero ?? null, mesaDe: reserva.mesa ?? null, mesaA: mesa?._id ?? null }, session,
        })
        return { id: String(reserva._id), mesa: mesa ? { id: String(mesa._id), numero: mesa.numero, capacidad: mesa.capacidad } : null }
    })
}
