// Fase 4 · Reservas conectadas al salón (PLAN_FASE_4). 4.1: mesa asignada sin solapamientos.
import { z } from 'zod'
import Reserva from './reserva.model.js'
import Mesa from './mesa.model.js'
import { AppError, detallesZod } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { cambiarEstado, codigoActual, registrarEvento } from '../compartido/estados.service.js'
import { tienePermiso } from '../identidad/permisos.js'
import { buscarChoque, codigoReserva, finBloque, textoChoque, ventanaSentar } from './reservas.bloque.js'
import { avisarReserva } from './reservas.avisos.js'
import { fechaLocal, horaLocal, inicioReserva } from '../compartido/fechas.js'
import { hora12 } from '../configuracion/horarios.reglas.js'
import { abrirEnTransaccion, prepararApertura } from './cuentas.service.js'

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
        return new AppError(409, 'MESA_OCUPADA_EN_HORARIO', textoChoque(mesa.numero, choque), { reserva: codigoReserva(choque._id) })
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

    const resultado = await conTransaccion(async (session) => {
        const reserva = await Reserva.findById(id).populate('estado', 'codigo').session(session)
        if (!reserva) throw reservaNoEncontrada()
        const codigo = await codigoActual(reserva)
        if (!RESERVA_CON_MESA_EDITABLE.includes(codigo)) {
            throw new AppError(409, 'RESERVA_NO_EDITABLE', 'Solo se asigna mesa a una reserva pendiente o confirmada.', { estado: codigo })
        }
        const anterior = reserva.mesa ? await Mesa.findById(reserva.mesa).select('numero capacidad').session(session).lean() : null
        // La misma mesa (o quitar sin tener): no escribe ni deja Evento (doble clic, reintento)
        if (String(reserva.mesa ?? '') === String(mesaId ?? '').toLowerCase()) {
            return { id: String(reserva._id), mesa: anterior ? { id: String(anterior._id), numero: anterior.numero, capacidad: anterior.capacidad } : null, cambio: false }
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
        return { id: String(reserva._id), mesa: mesa ? { id: String(mesa._id), numero: mesa.numero, capacidad: mesa.capacidad } : null, cambio: true }
    })
    // Sin cambio (la misma mesa) no se avisa
    const { cambio, ...respuesta } = resultado
    if (cambio) avisarReserva(respuesta.id)
    return respuesta
}

/**
 * 4.6.2 · 409 RESERVA_FUERA_DE_HORARIO si `ahora` no está en el horario de «Sentar» de la reserva: desde 10 min antes
 * de su hora y durante sus 90 min. Antes, dice desde cuándo; después, que solo queda «No llegó».
 */
const exigirHorarioDeSentar = (inicio, ahora = new Date()) => {
    const { desde, hasta } = ventanaSentar(inicio)
    if (ahora < desde) {
        const dia = fechaLocal(desde) === fechaLocal(ahora) ? '' : ' el día de la reserva,'
        throw new AppError(409, 'RESERVA_FUERA_DE_HORARIO', `Podrás sentar esta reserva${dia} desde las ${hora12(horaLocal(desde))}`,
            { desde: desde.toISOString(), hasta: hasta.toISOString() })
    }
    if (ahora >= hasta) {
        throw new AppError(409, 'RESERVA_FUERA_DE_HORARIO', `El horario de esta reserva terminó a las ${hora12(horaLocal(hasta))}: márcala como «No llegó».`,
            { desde: desde.toISOString(), hasta: hasta.toISOString() })
    }
}

const sentarSchema = z.object({
    // Quien no atiende mesas (el admin) indica el mesero, como al abrir una cuenta desde el plano
    meseroId: z.string().regex(OBJECT_ID, { error: 'El mesero no es válido.' }).optional(),
}).strict()

/**
 * 4.3 (F4-6, F4-f) · POST /staff/reservas/:id/sentar { meseroId? }: la reserva pendiente o confirmada, con mesa y
 * en su horario (4.6.2: desde 10 min antes y durante sus 90 min), pasa a «sentada» y abre la cuenta en su mesa (comensales = personas) en una sola transacción. La mesa
 * reservada solo la abre esta reserva (abrirEnTransaccion con `reserva`). → 201 { reserva, cuenta }
 */
export const sentarReserva = async (id, datos, sesion) => {
    exigir(sesion, 'reserva:cambiar_estado')
    exigir(sesion, 'cuenta:abrir') // antes de leer nada ni tomar un código de cuenta
    const r = sentarSchema.safeParse(datos ?? {})
    if (!r.success) throw new AppError(400, 'VALIDATION_ERROR', r.error.issues[0]?.message || 'Datos no válidos', detallesZod(r.error))
    if (!OBJECT_ID.test(String(id))) throw reservaNoEncontrada()
    const previa = await Reserva.findById(id).select('mesa cantidadPersonas inicio fecha hora estado').populate('estado', 'codigo').lean()
    if (!previa) throw reservaNoEncontrada()
    const noSentable = (codigo) => new AppError(409, 'RESERVA_NO_SENTABLE', 'Solo se sienta una reserva pendiente o confirmada.', { estado: codigo })
    const sinMesa = () => new AppError(409, 'RESERVA_SIN_MESA', 'Asigna una mesa a la reserva antes de sentarla.')
    // Primero el estado: una ya sentada o cerrada no recibe el mensaje del horario
    const codigoPrevio = await codigoActual(previa)
    if (!RESERVA_CON_MESA_EDITABLE.includes(codigoPrevio)) throw noSentable(codigoPrevio)
    if (!previa.mesa) throw sinMesa()
    // Fuera de horario no se toma un código de cuenta (se vuelve a comprobar en la transacción)
    exigirHorarioDeSentar(previa.inicio || inicioReserva(previa.fecha, previa.hora))
    // Permisos de apertura, mesero y código de la cuenta (fuera de la transacción, como al abrir desde el plano)
    const apertura = await prepararApertura({ mesaId: String(previa.mesa), comensales: previa.cantidadPersonas, ...(r.data.meseroId ? { meseroId: r.data.meseroId } : {}) }, sesion)

    const resultado = await conTransaccion(async (session) => {
        const reserva = await Reserva.findById(id).populate('estado', 'codigo').session(session)
        if (!reserva) throw reservaNoEncontrada()
        const codigo = await codigoActual(reserva)
        if (!RESERVA_CON_MESA_EDITABLE.includes(codigo)) throw noSentable(codigo)
        if (!reserva.mesa) throw sinMesa()
        if (String(reserva.mesa) !== String(previa.mesa) || reserva.cantidadPersonas !== previa.cantidadPersonas) {
            throw new AppError(409, 'CONFLICTO_ESTADO', 'La reserva cambió mientras la sentabas. Recarga e intenta de nuevo.')
        }
        exigirHorarioDeSentar(reserva.inicio || inicioReserva(reserva.fecha, reserva.hora))
        const cuenta = await abrirEnTransaccion(apertura, sesion, session, { reserva })
        await cambiarEstado({ tipo: 'reserva', Modelo: Reserva, documento: reserva, a: 'sentada', sesion, cambios: { cuenta: cuenta.id }, session })
        return { reserva: { id: String(reserva._id), codigo: codigoReserva(reserva._id), estadoCodigo: 'sentada', cuenta: cuenta.id }, cuenta }
    })
    avisarReserva(resultado.reserva.id)
    return resultado
}
