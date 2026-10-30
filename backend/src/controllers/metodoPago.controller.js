import MetodoPago from '../models/metodoPago.model.js'
import Pedido from '../models/pedido.model.js'
import { manejarError } from '../libs/manejarError.js'

// ---------- Públicas (el checkout necesita listarlos) ----------

export const listarMetodosPago = async (req, res) => {
    try {
        const metodos = await MetodoPago.find().sort({ nombre: 1 })
        res.json(metodos)
    } catch (error) {
        manejarError(res, error)
    }
}

export const obtenerMetodoPago = async (req, res) => {
    try {
        const metodo = await MetodoPago.findById(req.params.id)
        if (!metodo) return res.status(404).json({ message: 'Método de pago no encontrado' })

        res.json(metodo)
    } catch (error) {
        manejarError(res, error)
    }
}

// ---------- Admin ----------

export const crearMetodoPago = async (req, res) => {
    try {
        const { nombre, descripcion } = req.body

        const metodo = await new MetodoPago({ nombre, descripcion }).save()

        res.status(201).json(metodo)
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarMetodoPago = async (req, res) => {
    try {
        const { nombre, descripcion } = req.body

        const metodo = await MetodoPago.findByIdAndUpdate(
            req.params.id,
            { nombre, descripcion },
            { new: true, runValidators: true }
        )

        if (!metodo) return res.status(404).json({ message: 'Método de pago no encontrado' })

        res.json(metodo)
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarMetodoPago = async (req, res) => {
    try {
        const enUso = await Pedido.countDocuments({ metodoPago: req.params.id })
        if (enUso > 0) {
            return res.status(400).json({
                message: `No se puede eliminar: hay ${enUso} pedido(s) que lo usan`
            })
        }

        const metodo = await MetodoPago.findByIdAndDelete(req.params.id)
        if (!metodo) return res.status(404).json({ message: 'Método de pago no encontrado' })

        res.json({ message: 'Método de pago eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}