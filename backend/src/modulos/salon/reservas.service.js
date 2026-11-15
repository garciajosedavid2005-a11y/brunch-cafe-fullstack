// Servicio único de reservas del cliente (0.8): lo usan /api/v1/cliente/reservas,
// /api/customer/reservations y /api/reservas (alias). Las validaciones viven aquí.
import Reserva from './reserva.model.js'
import { AppError, badRequest, notFound } from '../compartido/errors.js'
import { instanteLocal, inicioReserva } from '../compartido/fechas.js'
import { horasEnPunto, rangoReserva, textoRango } from '../configuracion/horarios.reglas.js'
import { obtenerHorarios } from '../configuracion/horarios.service.js'
import { cambiarEstado, estadoPorCodigo, registrarEvento } from '../compartido/estados.service.js'
import { reservaSchema, reservaStaffSchema } from './reservas.schema.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { notificarReservaCreada } from './reservas.correo.js'
import { problemaDeMesa, tocarMesa } from './reservasSalon.service.js'
import { verificarAforo } from './reservas.aforo.js'
import { avisarReserva } from './reservas.avisos.js'

// Estados en los que el cliente todavía puede editar o cancelar su reserva
export const RESERVA_EDITABLE = ['pendiente', 'confirmada']

/**
 * Valida el cuerpo completo (formato, teléfono, fecha futura y horario configurado en BD).
 * Devuelve los datos normalizados y los horarios leídos (4.2: el aforo se comprueba en la transacción).
 */
export const validarReserva = async (cuerpo, esquema = reservaSchema) => {
    const datos = esquema.parse(cuerpo)
    if (instanteLocal(datos.fecha, datos.hora) <= new Date()) {
        throw badRequest('La fecha y hora de la reserva deben ser futuras.')
    }
    const horarios = await obtenerHorarios()
    if (!horasEnPunto(rangoReserva(horarios, datos.fecha)).includes(datos.hora)) {
        const { entreSemana, finDeSemana } = horarios.reservas
        throw badRequest(`La hora debe respetar el horario de reservas: lunes a viernes ${textoRango(entreSemana)} y sábados y domingos ${textoRango(finDeSemana)}.`)
    }
    return { datos, horarios }
}

// 4.2 · Aforo de la franja, dentro de la transacción de quien crea o edita
const aforoDe = (datos, horarios, session, excepto) =>
    verificarAforo({ horarios, fecha: datos.fecha, hora: datos.hora, personas: datos.personas, excepto, session })

const aDocumento = (datos) => ({
    cantidadPersonas: datos.personas,
    fecha: new Date(`${datos.fecha}T12:00:00Z`), // día de calendario (mediodía UTC)
    hora: datos.hora,
    inicio: instanteLocal(datos.fecha, datos.hora),
    observaciones: datos.observaciones,
    nombre: datos.nombre,
    correo: datos.correo || undefined,
    telefono: datos.telefono,
    motivo: datos.motivo,
})

const POBLAR = (consulta) => consulta.populate('usuario', 'nombre apellido correo').populate('estado', 'nombre codigo')

export const listarMias = (usuarioId) =>
    POBLAR(Reserva.find({ usuario: usuarioId })).sort({ fecha: -1, hora: -1 }).lean()

export const obtenerMia = (usuarioId, id) => POBLAR(Reserva.findOne({ _id: id, usuario: usuarioId })).lean()

export const crear = async (sesion, cuerpo) => {
    const { datos, horarios } = await validarReserva(cuerpo)
    const pendiente = await estadoPorCodigo('reserva', 'pendiente')
    // Reserva y su Evento inicial: los dos o ninguno (0.9)
    const reserva = await conTransaccion(async (session) => {
        await aforoDe(datos, horarios, session)
        const [creada] = await Reserva.create([{ usuario: sesion.id, estado: pendiente._id, ...aDocumento(datos) }], { session })
        await registrarEvento({ entidad: 'reserva', entidadId: creada._id, a: 'pendiente', usuario: sesion.id, actor: sesion.rol || 'cliente', session })
        return creada
    })
    notificarReservaCreada(reserva) // después de guardar y sin bloquear la respuesta (0.16)
    avisarReserva(reserva._id)
    return obtenerMia(sesion.id, reserva._id)
}

/** El personal registra la reserva de un cliente: sin usuario dueño y con registradaPor (0.15e). */
export const crearPorStaff = async (sesion, cuerpo) => {
    const { datos, horarios } = await validarReserva(cuerpo, reservaStaffSchema)
    const pendiente = await estadoPorCodigo('reserva', 'pendiente')
    const reserva = await conTransaccion(async (session) => {
        await aforoDe(datos, horarios, session)
        const [creada] = await Reserva.create([{
            usuario: null, registradaPor: sesion.id, estado: pendiente._id, ...aDocumento(datos),
        }], { session })
        await registrarEvento({ entidad: 'reserva', entidadId: creada._id, a: 'pendiente', usuario: sesion.id, actor: sesion.rol || 'staff', session })
        return creada
    })
    notificarReservaCreada(reserva)
    avisarReserva(reserva._id)
    return reserva._id
}

export const editar = async (sesion, id, cuerpo) => {
    const { datos, horarios } = await validarReserva(cuerpo)
    const eraConfirmada = await conTransaccion(async (session) => {
        const reserva = await Reserva.findOne({ _id: id, usuario: sesion.id }).populate('estado', 'codigo').session(session)
        if (!reserva || !RESERVA_EDITABLE.includes(reserva.estado?.codigo)) {
            throw notFound('No se encontró una reserva activa que puedas editar.')
        }
        // 4.2 · Solo si la edición ocupa más en una franja: otra fecha u hora, o más personas (sin contarse a sí
        // misma). Así, si el admin bajó el aforo, cambiar las observaciones o reducir personas no da 409
        const inicioActual = reserva.inicio || inicioReserva(reserva.fecha, reserva.hora)
        if (instanteLocal(datos.fecha, datos.hora).getTime() !== inicioActual.getTime() || datos.personas > reserva.cantidadPersonas) {
            await aforoDe(datos, horarios, session, reserva._id)
        }
        const cambios = aDocumento(datos)
        // Fase 4 (F4-i) · Con mesa asignada, la nueva hora o el nuevo número de personas deben seguir cabiendo
        // en ella (sin choques con otras reservas de la mesa); si no, la mesa se quita y queda un Evento
        if (reserva.mesa) {
            const mesa = await tocarMesa(reserva.mesa, session)
            const problema = !mesa || await problemaDeMesa({
                mesa, reserva: { _id: reserva._id, inicio: cambios.inicio, cantidadPersonas: cambios.cantidadPersonas }, session,
            })
            if (problema) {
                cambios.mesa = null
                await registrarEvento({
                    entidad: 'reserva', entidadId: reserva._id, tipo: 'mesa_asignada', usuario: sesion.id, actor: sesion.rol || 'cliente',
                    motivo: 'la reserva editada ya no cabe en la mesa', datos: { de: mesa?.numero ?? null, a: null, mesaDe: reserva.mesa, mesaA: null }, session,
                })
            }
        }
        if (reserva.estado.codigo === 'confirmada') {
            // Una reserva confirmada vuelve a pendiente de aprobación (queda en Evento)
            await cambiarEstado({
                tipo: 'reserva', Modelo: Reserva, documento: reserva, a: 'pendiente', actor: 'cliente',
                sesion, cambios, filtro: { usuario: sesion.id }, session,
            })
        } else {
            reserva.set(cambios)
            await reserva.save({ session })
        }
        return reserva.estado.codigo === 'confirmada'
    })
    // 4.5 (F4-7) · Editar una confirmada avisa en vivo al staff (la agenda muestra qué cambió)
    avisarReserva(id, eraConfirmada ? 'reserva_editada' : 'reserva_cambio')
    return obtenerMia(sesion.id, id)
}

export const cancelar = async (sesion, id) => {
    const reserva = await Reserva.findOne({ _id: id, usuario: sesion.id }).populate('estado', 'codigo')
    if (!reserva) throw notFound('No se encontró la reserva.')
    if (reserva.estado?.codigo === 'cancelada') throw new AppError(409, 'CONFLICT', 'Esta reserva ya fue cancelada.')
    const inicio = reserva.inicio || inicioReserva(reserva.fecha, reserva.hora)
    if (inicio <= new Date()) throw new AppError(409, 'CONFLICT', 'No es posible cancelar una reserva que ya inició.')
    await cambiarEstado({
        tipo: 'reserva', Modelo: Reserva, documento: reserva, a: 'cancelada', actor: 'cliente',
        sesion, filtro: { usuario: sesion.id },
    })
    avisarReserva(reserva._id)
    return obtenerMia(sesion.id, reserva._id)
}
