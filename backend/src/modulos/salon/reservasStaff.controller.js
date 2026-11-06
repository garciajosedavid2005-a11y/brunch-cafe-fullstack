import Reserva from './reserva.model.js'
import { crearPorStaff } from './reservas.service.js'
import { notFound } from '../compartido/errors.js'
import { esEstadoFinal } from '../compartido/estados.js'
import {
    cambiarEstado, codigoDestino, estadosDelTipo, opcionesDeCambio,
} from '../compartido/estados.service.js'

const formatoAdmin = (reserva, { permisos, estados }) => {
    const codigo = reserva.estado?.codigo || ''
    return {
        id: reserva._id,
        codigo: `RES-${reserva._id.toString().slice(-6).toUpperCase()}`,
        cliente: reserva.nombre || [reserva.usuario?.nombre, reserva.usuario?.apellido].filter(Boolean).join(' ') || 'Cliente',
        correo: reserva.correo || reserva.usuario?.correo || '',
        // El de la reserva; las anteriores a 0.8 no lo tienen y se muestra el del perfil
        telefono: reserva.telefono || reserva.usuario?.telefono || '',
        personas: reserva.cantidadPersonas,
        fecha: reserva.fecha,
        hora: reserva.hora,
        inicio: reserva.inicio || null, // instante UTC (0.10)
        motivo: reserva.motivo || '',
        estado: reserva.estado?.nombre || '',
        estadoId: reserva.estado?._id || reserva.estado,
        estadoCodigo: codigo,
        esFinal: esEstadoFinal('reserva', codigo),
        transiciones: opcionesDeCambio('reserva', codigo, { permisos }, estados),
        observaciones: reserva.observaciones || '',
        // Personal que la registró en nombre del cliente; null si la hizo el cliente (0.15e)
        registradaPor: reserva.registradaPor?._id
            ? { id: String(reserva.registradaPor._id), nombre: [reserva.registradaPor.nombre, reserva.registradaPor.apellido].filter(Boolean).join(' ') }
            : null,
    }
}

// Las acciones del cliente viven en src/modulos/salon/reservas.* (0.8).

// Acciones del staff

const POBLAR_ADMIN = (consulta) => consulta.populate('usuario', '-contraseña').populate('registradaPor', 'nombre apellido').populate('estado')

export const listarReservas = async (req, res) => {
    const [reservas, estados] = await Promise.all([
        POBLAR_ADMIN(Reserva.find()).sort({ fecha: -1 }),
        estadosDelTipo('reserva'),
    ])
    res.json(reservas.map((reserva) => formatoAdmin(reserva, { permisos: req.usuario.permisos, estados })))
}

// POST /api/v1/staff/reservas (reserva:crear): la registra el personal para un cliente
export const crearReserva = async (req, res) => {
    const id = await crearPorStaff(req.usuario, req.body)
    const [poblada, estados] = await Promise.all([POBLAR_ADMIN(Reserva.findById(id)), estadosDelTipo('reserva')])
    res.status(201).json({ reservation: formatoAdmin(poblada, { permisos: req.usuario.permisos, estados }) })
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
