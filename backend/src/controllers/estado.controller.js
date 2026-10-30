import Estado from '../models/estado.model.js'
import Pedido from '../models/pedido.model.js'
import Reserva from '../models/reserva.model.js'
import { manejarError } from '../libs/manejarError.js'

// Todas son de admin. Listar acepta filtro: GET /api/estados?tipo=reserva

export const listarEstados = async (req, res) => {
    try {
        const filtro = {}
        if (req.query.tipo) filtro.tipo = req.query.tipo

        const estados = await Estado.find(filtro).sort({ tipo: 1, nombre: 1 })
        res.json(estados)
    } catch (error) {
        manejarError(res, error)
    }
}

export const obtenerEstado = async (req, res) => {
    try {
        const estado = await Estado.findById(req.params.id)
        if (!estado) return res.status(404).json({ message: 'Estado no encontrado' })

        res.json(estado)
    } catch (error) {
        manejarError(res, error)
    }
}

export const crearEstado = async (req, res) => {
    try {
        const { nombre, tipo } = req.body

        const existe = await Estado.findOne({ nombre, tipo })
        if (existe) {
            return res.status(400).json({ message: `Ya existe el estado '${nombre}' de tipo ${tipo}` })
        }

        const estado = await new Estado({ nombre, tipo }).save()

        res.status(201).json(estado)
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarEstado = async (req, res) => {
    try {
        const { nombre, tipo } = req.body

        const estado = await Estado.findByIdAndUpdate(
            req.params.id,
            { nombre, tipo },
            { new: true, runValidators: true }
        )

        if (!estado) return res.status(404).json({ message: 'Estado no encontrado' })

        res.json(estado)
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarEstado = async (req, res) => {
    try {
        // No se puede borrar un estado que ya está asignado a pedidos o reservas
        const enPedidos = await Pedido.countDocuments({ estado: req.params.id })
        const enReservas = await Reserva.countDocuments({ estado: req.params.id })

        if (enPedidos + enReservas > 0) {
            return res.status(400).json({
                message: `No se puede eliminar: está en uso (${enPedidos} pedido(s), ${enReservas} reserva(s))`
            })
        }

        const estado = await Estado.findByIdAndDelete(req.params.id)
        if (!estado) return res.status(404).json({ message: 'Estado no encontrado' })

        res.json({ message: 'Estado eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}