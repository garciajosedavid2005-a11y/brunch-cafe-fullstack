import Reserva from '../models/reserva.model.js'
import { forbidden, notFound } from '../libs/errors.js'
import { esEstadoFinal } from '../libs/estados.js'
import {
    cambiarEstado, codigoDestino, estadoPorCodigo, estadosDelTipo, opcionesDeCambio, registrarEvento,
} from '../services/estados.service.js'

const formatoAdmin = (reserva, { permisos, estados }) => {
    const codigo = reserva.estado?.codigo || ''
    return {
        id: reserva._id,
        codigo: `RES-${reserva._id.toString().slice(-6).toUpperCase()}`,
        cliente: reserva.nombre || [reserva.usuario?.nombre, reserva.usuario?.apellido].filter(Boolean).join(' ') || 'Cliente',
        correo: reserva.correo || reserva.usuario?.correo || '',
        telefono: reserva.usuario?.telefono || '',
        personas: reserva.cantidadPersonas,
        fecha: reserva.fecha,
        hora: reserva.hora,
        motivo: reserva.motivo || '',
        estado: reserva.estado?.nombre || '',
        estadoId: reserva.estado?._id || reserva.estado,
        estadoCodigo: codigo,
        esFinal: esEstadoFinal('reserva', codigo),
        transiciones: opcionesDeCambio('reserva', codigo, { permisos }, estados),
        observaciones: reserva.observaciones || '',
    }
}

// Acciones del cliente (rutas antiguas /api/reservas; el portal usa /api/customer/reservations)

export const crearReserva = async (req, res) => {
    const { cantidadPersonas, fecha, hora, observaciones, nombre, correo, motivo } = req.body
    const pendiente = await estadoPorCodigo('reserva', 'pendiente')

    const reserva = await Reserva.create({
        usuario: req.usuario.id,
        estado: pendiente._id,
        cantidadPersonas,
        fecha,
        hora,
        observaciones,
        nombre,
        correo,
        motivo,
    })
    await registrarEvento({
        entidad: 'reserva', entidadId: reserva._id, a: 'pendiente', usuario: req.usuario.id, actor: req.usuario.rol || 'cliente',
    })
    await reserva.populate('estado')
    res.json(reserva)
}

export const misReservas = async (req, res) => {
    const reservas = await Reserva.find({ usuario: req.usuario.id })
        .populate('estado')
        .sort({ fecha: -1 })
    res.json(reservas)
}

export const cancelarReserva = async (req, res) => {
    const reserva = await Reserva.findById(req.params.id).populate('estado', 'codigo')
    if (!reserva) throw notFound('Reserva no encontrada')
    if (reserva.usuario.toString() !== req.usuario.id) {
        throw forbidden('No puedes cancelar una reserva que no es tuya')
    }

    const actualizada = await cambiarEstado({
        tipo: 'reserva',
        Modelo: Reserva,
        documento: reserva,
        a: 'cancelada',
        actor: 'cliente',
        sesion: req.usuario,
        filtro: { usuario: req.usuario.id },
    })
    await actualizada.populate('estado')
    res.json(actualizada)
}

// Acciones del staff

const POBLAR_ADMIN = (consulta) => consulta.populate('usuario', '-contraseña').populate('estado')

export const listarReservas = async (req, res) => {
    const [reservas, estados] = await Promise.all([
        POBLAR_ADMIN(Reserva.find()).sort({ fecha: -1 }),
        estadosDelTipo('reserva'),
    ])
    res.json(reservas.map((reserva) => formatoAdmin(reserva, { permisos: req.usuario.permisos, estados })))
}

// PATCH /api/reservas/:id/estado  { codigo | estado, motivo? }
export const cambiarEstadoReserva = async (req, res) => {
    const reserva = await Reserva.findById(req.params.id).populate('estado', 'codigo')
    if (!reserva) throw notFound('Reserva no encontrada')

    const a = await codigoDestino('reserva', req.validado)
    const actualizada = await cambiarEstado({
        tipo: 'reserva',
        Modelo: Reserva,
        documento: reserva,
        a,
        sesion: req.usuario,
        motivo: req.validado.motivo,
    })
    const [poblada, estados] = await Promise.all([
        POBLAR_ADMIN(Reserva.findById(actualizada._id)),
        estadosDelTipo('reserva'),
    ])
    res.json(formatoAdmin(poblada, { permisos: req.usuario.permisos, estados }))
}
