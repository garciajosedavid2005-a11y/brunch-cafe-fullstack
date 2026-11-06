import mongoose from 'mongoose'
import { STATUS_CLIENTE } from '../../libs/estados.js'
import { notFound } from '../../libs/errors.js'
import Reserva from '../../models/reserva.model.js'
import * as servicio from './reservas.service.js'
import { desdeLegado } from './reservas.schema.js'

const statusCliente = (estado) => STATUS_CLIENTE.reserva[estado?.codigo] || 'pending'

// Forma del portal del cliente (la misma que usaba /api/customer/reservations)
export const formato = (reserva) => {
    const dueno = reserva.usuario && typeof reserva.usuario === 'object' ? reserva.usuario : null
    return {
        _id: reserva._id,
        nombre: reserva.nombre || [dueno?.nombre, dueno?.apellido].filter(Boolean).join(' '),
        correo: reserva.correo || dueno?.correo || '',
        telefono: reserva.telefono || '',
        motivo: reserva.motivo || '',
        personas: reserva.cantidadPersonas,
        fecha: reserva.fecha,
        hora: reserva.hora,
        inicio: reserva.inicio || null,
        observaciones: reserva.observaciones || '',
        status: statusCliente(reserva.estado),
        statusLabel: reserva.estado?.nombre || '',
        codigo: reserva.estado?.codigo || '',
        createdAt: reserva.createdAt,
        user: dueno ? { nombre: dueno.nombre, apellido: dueno.apellido, email: dueno.correo } : undefined,
    }
}

const idValido = (req) => {
    if (!mongoose.isValidObjectId(req.params.id)) throw notFound('No se encontró la reserva.')
    return req.params.id
}

// ── /api/v1/cliente/reservas (y el alias /api/customer/reservations) ──
export const listar = async (req, res) => {
    res.json({ reservations: (await servicio.listarMias(req.usuario.id)).map(formato) })
}
export const crear = async (req, res) => {
    res.status(201).json({ reservation: formato(await servicio.crear(req.usuario, req.body)) })
}
export const editar = async (req, res) => {
    res.json({ reservation: formato(await servicio.editar(req.usuario, idValido(req), req.body)) })
}
export const cancelar = async (req, res) => {
    res.json({ reservation: formato(await servicio.cancelar(req.usuario, idValido(req))) })
}

// ── Alias antiguo /api/reservas (respuesta: el documento con su estado) ──
const documento = (id) => Reserva.findById(id).populate('estado').lean()
export const legadoCrear = async (req, res) => {
    const reserva = await servicio.crear(req.usuario, desdeLegado(req.body))
    res.json(await documento(reserva._id)) // 200, como antes
}
export const legadoMias = async (req, res) => {
    res.json(await Reserva.find({ usuario: req.usuario.id }).populate('estado').sort({ fecha: -1 }).lean())
}
export const legadoCancelar = async (req, res) => {
    const reserva = await servicio.cancelar(req.usuario, idValido(req))
    res.json(await documento(reserva._id))
}
