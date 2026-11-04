import mongoose from 'mongoose'
import Pedido from '../models/pedido.model.js'
import DetallePedido from '../models/detallePedido.model.js'
import Estado from '../models/estado.model.js'
import { manejarError } from '../libs/manejarError.js'

const formato = (pedido, detalles) => ({
    id: pedido._id,
    codigo: `PED-${pedido._id.toString().slice(-6).toUpperCase()}`,
    cliente: pedido.nombreEntrega || [pedido.usuario?.nombre, pedido.usuario?.apellido].filter(Boolean).join(' ') || 'Cliente',
    correo: pedido.usuario?.correo || '',
    telefono: pedido.usuario?.telefono || '',
    direccion: pedido.direccion || '',
    barrio: pedido.barrio || '',
    hora: pedido.horaEntrega || '',
    fecha: pedido.createdAt,
    estado: pedido.estado?.nombre || '',
    estadoId: pedido.estado?._id || pedido.estado,
    total: pedido.total,
    metodoPago: pedido.metodoPago?.nombre || '',
    notas: pedido.indicaciones || '',
    items: detalles.map((detalle) => ({
        nombre: detalle.nombreProducto,
        cantidad: detalle.cantidad,
        precio: detalle.precioProducto,
        subtotal: detalle.subtotal,
    })),
})

const conDetalles = async (pedidos) => {
    const ids = pedidos.map(({ _id }) => _id)
    const detalles = await DetallePedido.find({ pedido: { $in: ids } }).lean()
    const porPedido = new Map()
    for (const detalle of detalles) {
        const key = String(detalle.pedido)
        porPedido.set(key, [...(porPedido.get(key) || []), detalle])
    }
    return pedidos.map((pedido) => formato(pedido, porPedido.get(String(pedido._id)) || []))
}

export const listarPedidos = async (req, res) => {
    try {
        const pedidos = await Pedido.find()
            .populate('usuario', 'nombre apellido correo telefono')
            .populate('estado', 'nombre')
            .populate('metodoPago', 'nombre')
            .sort({ createdAt: -1 })
            .lean()
        res.json(await conDetalles(pedidos))
    } catch (error) {
        manejarError(res, error)
    }
}

export const cambiarEstadoPedido = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(404).json({ message: 'Pedido no encontrado' })
        }
        const { estado } = req.body
        if (!mongoose.isValidObjectId(estado)) {
            return res.status(400).json({ message: 'El estado seleccionado no es válido' })
        }
        const nuevoEstado = await Estado.findOne({ _id: estado, tipo: 'pedido' })
        if (!nuevoEstado) {
            return res.status(400).json({ message: 'El estado enviado no existe o no es de tipo pedido' })
        }
        const pedidoActual = await Pedido.findById(req.params.id).populate('estado', 'nombre esFinal')
        if (!pedidoActual) return res.status(404).json({ message: 'Pedido no encontrado' })
        if (pedidoActual.estado?.esFinal && String(pedidoActual.estado._id) !== String(nuevoEstado._id)) {
            return res.status(409).json({ message: 'El pedido ya llegó a un estado final y no puede modificarse.' })
        }

        const etapas = ['Pendiente', 'Confirmado', 'Recibido']
        const etapaActual = etapas.indexOf(pedidoActual.estado?.nombre)
        const etapaNueva = etapas.indexOf(nuevoEstado.nombre)
        if (
            etapaActual !== -1 &&
            etapaNueva !== -1 &&
            etapaNueva !== etapaActual &&
            etapaNueva !== etapaActual + 1
        ) {
            return res.status(409).json({ message: 'El pedido debe avanzar en orden: Pendiente, Confirmado y Recibido.' })
        }

        pedidoActual.estado = nuevoEstado._id
        await pedidoActual.save()
        await pedidoActual.populate('usuario', 'nombre apellido correo telefono')
        await pedidoActual.populate('estado', 'nombre')
        await pedidoActual.populate('metodoPago', 'nombre')
        const pedido = pedidoActual.toObject()
        const detalles = await DetallePedido.find({ pedido: pedido._id }).lean()
        res.json(formato(pedido, detalles))
    } catch (error) {
        manejarError(res, error)
    }
}