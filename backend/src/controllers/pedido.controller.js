import mongoose from 'mongoose'
import Pedido from '../models/pedido.model.js'
import DetallePedido from '../models/detallePedido.model.js'
import Estado from '../models/estado.model.js'
import { manejarError } from '../libs/manejarError.js'

const formato = (pedido, detalles) => ({
    id: pedido._id,
    codigo: `PED-${pedido._id.toString().slice(-6).toUpperCase()}`,
    cliente: [pedido.usuario?.nombre, pedido.usuario?.apellido].filter(Boolean).join(' ') || pedido.nombreEntrega || 'Cliente',
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
        const pedido = await Pedido.findByIdAndUpdate(
            req.params.id,
            { estado: nuevoEstado._id },
            { new: true }
        )
            .populate('usuario', 'nombre apellido correo telefono')
            .populate('estado', 'nombre')
            .populate('metodoPago', 'nombre')
            .lean()

        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })
        const detalles = await DetallePedido.find({ pedido: pedido._id }).lean()
        res.json(formato(pedido, detalles))
    } catch (error) {
        manejarError(res, error)
    }
}