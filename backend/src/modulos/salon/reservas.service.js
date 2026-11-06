// Servicio único de reservas del cliente (0.8): lo usan /api/v1/cliente/reservas,
// /api/customer/reservations y /api/reservas (alias). Las validaciones viven aquí.
import Reserva from '../../models/reserva.model.js'
import { AppError, badRequest, notFound } from '../../libs/errors.js'
import { instanteLocal, inicioReserva } from '../../libs/fechas.js'
import { horasEnPunto, rangoReserva, textoRango } from '../../libs/horarios.js'
import { obtenerHorarios } from '../configuracion/horarios.service.js'
import { cambiarEstado, estadoPorCodigo, registrarEvento } from '../../services/estados.service.js'
import { reservaSchema } from './reservas.schema.js'

// Estados en los que el cliente todavía puede editar o cancelar su reserva
export const RESERVA_EDITABLE = ['pendiente', 'confirmada']

/**
 * Valida el cuerpo completo (formato, teléfono, fecha futura y horario configurado en BD).
 * Devuelve los datos normalizados.
 */
export const validarReserva = async (cuerpo) => {
    const datos = reservaSchema.parse(cuerpo)
    if (instanteLocal(datos.fecha, datos.hora) <= new Date()) {
        throw badRequest('La fecha y hora de la reserva deben ser futuras.')
    }
    const horarios = await obtenerHorarios()
    if (!horasEnPunto(rangoReserva(horarios, datos.fecha)).includes(datos.hora)) {
        const { entreSemana, finDeSemana } = horarios.reservas
        throw badRequest(`La hora debe respetar el horario de reservas: lunes a viernes ${textoRango(entreSemana)} y sábados y domingos ${textoRango(finDeSemana)}.`)
    }
    return datos
}

const aDocumento = (datos) => ({
    cantidadPersonas: datos.personas,
    fecha: new Date(`${datos.fecha}T12:00:00Z`), // día de calendario (mediodía UTC)
    hora: datos.hora,
    inicio: instanteLocal(datos.fecha, datos.hora),
    observaciones: datos.observaciones,
    nombre: datos.nombre,
    correo: datos.correo,
    telefono: datos.telefono,
    motivo: datos.motivo,
})

const POBLAR = (consulta) => consulta.populate('usuario', 'nombre apellido correo').populate('estado', 'nombre codigo')

export const listarMias = (usuarioId) =>
    POBLAR(Reserva.find({ usuario: usuarioId })).sort({ fecha: -1, hora: -1 }).lean()

export const obtenerMia = (usuarioId, id) => POBLAR(Reserva.findOne({ _id: id, usuario: usuarioId })).lean()

export const crear = async (sesion, cuerpo) => {
    const datos = await validarReserva(cuerpo)
    const pendiente = await estadoPorCodigo('reserva', 'pendiente')
    const reserva = await Reserva.create({ usuario: sesion.id, estado: pendiente._id, ...aDocumento(datos) })
    await registrarEvento({ entidad: 'reserva', entidadId: reserva._id, a: 'pendiente', usuario: sesion.id, actor: sesion.rol || 'cliente' })
    return obtenerMia(sesion.id, reserva._id)
}

export const editar = async (sesion, id, cuerpo) => {
    const datos = await validarReserva(cuerpo)
    const reserva = await Reserva.findOne({ _id: id, usuario: sesion.id }).populate('estado', 'codigo')
    if (!reserva || !RESERVA_EDITABLE.includes(reserva.estado?.codigo)) {
        throw notFound('No se encontró una reserva activa que puedas editar.')
    }
    const cambios = aDocumento(datos)
    if (reserva.estado.codigo === 'confirmada') {
        // Una reserva confirmada vuelve a pendiente de aprobación (queda en Evento)
        await cambiarEstado({
            tipo: 'reserva', Modelo: Reserva, documento: reserva, a: 'pendiente', actor: 'cliente',
            sesion, cambios, filtro: { usuario: sesion.id },
        })
    } else {
        reserva.set(cambios)
        await reserva.save()
    }
    return obtenerMia(sesion.id, reserva._id)
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
    return obtenerMia(sesion.id, reserva._id)
}
