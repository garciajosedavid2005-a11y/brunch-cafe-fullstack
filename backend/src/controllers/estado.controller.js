import Estado from '../models/estado.model.js'
import Pedido from '../models/pedido.model.js'
import Reserva from '../models/reserva.model.js'
import { manejarError } from '../libs/manejarError.js'
import { sinUndefined } from '../libs/utils.js'

const COMPARACION = { locale: 'es', strength: 1 }
const TIPOS = ['pedido', 'reserva']

const formato = (estado, usosAsociados = 0) => ({
    id: estado._id,
    nombre: estado.nombre,
    tipo: estado.tipo,
    descripcion: estado.descripcion || '',
    color: estado.color || '#b78103',
    bg: estado.bg || '#fff8e1',
    badgeType: estado.badgeType || 'warning',
    esFinal: Boolean(estado.esFinal),
    usosAsociados,
})

// Cuenta cuántos pedidos y reservas usan cada estado
const contarUsos = async () => {
    const [enPedidos, enReservas] = await Promise.all([
        Pedido.aggregate([{ $group: { _id: '$estado', total: { $sum: 1 } } }]),
        Reserva.aggregate([{ $group: { _id: '$estado', total: { $sum: 1 } } }]),
    ])

    const usos = new Map()
    for (const fila of [...enPedidos, ...enReservas]) {
        usos.set(String(fila._id), (usos.get(String(fila._id)) || 0) + fila.total)
    }
    return usos
}

// GET /api/estados  ó  GET /api/estados?tipo=reserva
export const listarEstados = async (req, res) => {
    try {
        const filtro = {}

        if (req.query.tipo !== undefined) {
            if (!TIPOS.includes(req.query.tipo)) {
                return res.status(400).json({ message: 'El tipo debe ser "pedido" o "reserva"' })
            }
            filtro.tipo = req.query.tipo
        }

        const [estados, usos] = await Promise.all([
            Estado.find(filtro).sort({ tipo: 1, createdAt: 1 }),
            contarUsos(),
        ])

        res.json(estados.map((e) => formato(e, usos.get(String(e._id)) || 0)))
    } catch (error) {
        manejarError(res, error)
    }
}

export const crearEstado = async (req, res) => {
    try {
        const { nombre, tipo, descripcion, color, bg, badgeType, esFinal } = req.body

        const existe = await Estado.findOne({ nombre, tipo }).collation(COMPARACION)
        if (existe) {
            return res.status(409).json({ message: `Ya existe el estado '${nombre}' de tipo ${tipo}` })
        }

        const estado = await new Estado({ nombre, tipo, descripcion, color, bg, badgeType, esFinal }).save()

        res.status(201).json(formato(estado))
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarEstado = async (req, res) => {
    try {
        const estado = await Estado.findById(req.params.id)
        if (!estado) return res.status(404).json({ message: 'Estado no encontrado' })

        // El tipo no se puede cambiar: solo se editan estos campos
        const { nombre, descripcion, color, bg, badgeType, esFinal } = req.body

        if (nombre !== undefined) {
            const existe = await Estado.findOne({
                nombre,
                tipo: estado.tipo,
                _id: { $ne: estado._id },
            }).collation(COMPARACION)

            if (existe) {
                return res.status(409).json({ message: `Ya existe el estado '${nombre}' de tipo ${estado.tipo}` })
            }
        }

        estado.set(sinUndefined({ nombre, descripcion, color, bg, badgeType, esFinal }))
        await estado.save()

        const usos = await contarUsos()

        res.json(formato(estado, usos.get(String(estado._id)) || 0))
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarEstado = async (req, res) => {
    try {
        const estado = await Estado.findById(req.params.id)
        if (!estado) return res.status(404).json({ message: 'Estado no encontrado' })

        // No se puede borrar un estado que ya está asignado a pedidos o reservas
        const [enPedidos, enReservas] = await Promise.all([
            Pedido.countDocuments({ estado: estado._id }),
            Reserva.countDocuments({ estado: estado._id }),
        ])

        if (enPedidos + enReservas > 0) {
            return res.status(400).json({
                message: `No se puede eliminar: está en uso (${enPedidos} pedido(s), ${enReservas} reserva(s))`,
            })
        }

        await estado.deleteOne()

        res.json({ message: 'Estado eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}