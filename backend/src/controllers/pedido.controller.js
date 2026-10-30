import Pedido from '../models/pedido.model.js'
import DetallePedido from '../models/detallePedido.model.js'
import Producto from '../models/producto.model.js'
import Estado from '../models/estado.model.js'
import MetodoPago from '../models/metodoPago.model.js'
import { manejarError } from '../libs/manejarError.js'

// ---------- Cliente ----------
// Body esperado: { metodoPago: "<id>", productos: [{ producto: "<id>", cantidad: 2 }, ...] }
// Los precios NUNCA vienen del cliente: se leen de la base de datos.

export const crearPedido = async (req, res) => {
    let pedidoGuardado = null

    try {
        const { metodoPago, productos } = req.body

        if (!Array.isArray(productos) || productos.length === 0) {
            return res.status(400).json({ message: 'El pedido debe tener al menos un producto' })
        }

        // Une productos repetidos sumando sus cantidades
        const cantidades = new Map()
        for (const item of productos) {
            const cantidad = Number(item.cantidad)
            if (!Number.isInteger(cantidad) || cantidad < 1) {
                return res.status(400).json({ message: 'La cantidad de cada producto debe ser un entero mayor a 0' })
            }
            const id = String(item.producto)
            cantidades.set(id, (cantidades.get(id) || 0) + cantidad)
        }

        const ids = [...cantidades.keys()]
        const productosDB = await Producto.find({ _id: { $in: ids } })
        if (productosDB.length !== ids.length) {
            return res.status(400).json({ message: 'Uno o más productos no existen' })
        }

        const metodoValido = await MetodoPago.findById(metodoPago)
        if (!metodoValido) {
            return res.status(400).json({ message: 'El método de pago no existe' })
        }

        const estadoPendiente = await Estado.findOne({ nombre: 'Pendiente', tipo: 'pedido' })
        if (!estadoPendiente) {
            return res.status(500).json({ message: "No existe el estado 'Pendiente' de tipo pedido, créalo primero" })
        }

        // Calcula detalles y total con los precios reales
        let total = 0
        const detalles = productosDB.map((p) => {
            const cantidad = cantidades.get(p._id.toString())
            const subtotal = p.precio * cantidad
            total += subtotal

            return {
                producto: p._id,
                nombreProducto: p.nombre,
                precioProducto: p.precio,
                cantidad,
                subtotal
            }
        })

        pedidoGuardado = await new Pedido({
            usuario: req.usuario.id,
            estado: estadoPendiente._id,
            metodoPago,
            total
        }).save()

        const detallesGuardados = await DetallePedido.insertMany(
            detalles.map((d) => ({ ...d, pedido: pedidoGuardado._id }))
        )

        res.status(201).json({ pedido: pedidoGuardado, detalles: detallesGuardados })
    } catch (error) {
        // Si el pedido llegó a crearse pero fallaron los detalles, se revierte
        if (pedidoGuardado) {
            await Pedido.findByIdAndDelete(pedidoGuardado._id).catch(() => {})
        }
        manejarError(res, error)
    }
}

export const misPedidos = async (req, res) => {
    try {
        const pedidos = await Pedido.find({ usuario: req.usuario.id })
            .populate('estado')
            .populate('metodoPago')
            .sort({ createdAt: -1 })

        res.json(pedidos)
    } catch (error) {
        manejarError(res, error)
    }
}

// ---------- Cliente (solo el suyo) y Admin (cualquiera) ----------

export const obtenerPedido = async (req, res) => {
    try {
        const pedido = await Pedido.findById(req.params.id)
            .populate('usuario', '-contraseña')
            .populate('estado')
            .populate('metodoPago')

        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })

        const esAdmin = req.usuario.rol === 'admin'
        if (!esAdmin && pedido.usuario._id.toString() !== req.usuario.id) {
            return res.status(403).json({ message: 'No puedes ver un pedido que no es tuyo' })
        }

        const detalles = await DetallePedido.find({ pedido: pedido._id })

        res.json({ pedido, detalles })
    } catch (error) {
        manejarError(res, error)
    }
}

// ---------- Admin ----------

export const listarPedidos = async (req, res) => {
    try {
        const pedidos = await Pedido.find()
            .populate('usuario', '-contraseña')
            .populate('estado')
            .populate('metodoPago')
            .sort({ createdAt: -1 })

        res.json(pedidos)
    } catch (error) {
        manejarError(res, error)
    }
}

export const cambiarEstadoPedido = async (req, res) => {
    try {
        const { estado } = req.body // _id del nuevo Estado

        if (!estado) return res.status(400).json({ message: 'El estado es requerido' })

        const estadoValido = await Estado.findOne({ _id: estado, tipo: 'pedido' })
        if (!estadoValido) {
            return res.status(400).json({ message: 'El estado enviado no existe o no es de tipo pedido' })
        }

        const pedido = await Pedido.findByIdAndUpdate(
            req.params.id,
            { estado },
            { new: true }
        )
            .populate('usuario', '-contraseña')
            .populate('estado')
            .populate('metodoPago')

        if (!pedido) return res.status(404).json({ message: 'Pedido no encontrado' })

        res.json(pedido)
    } catch (error) {
        manejarError(res, error)
    }
}