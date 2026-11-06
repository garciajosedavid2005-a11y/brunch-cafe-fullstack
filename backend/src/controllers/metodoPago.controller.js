import MetodoPago from '../models/metodoPago.model.js'
import Pedido from '../models/pedido.model.js'
import { manejarError } from '../modulos/compartido/manejarError.js'
import { slug, sinUndefined } from '../modulos/compartido/utils.js'

const COMPARACION = { locale: 'es', strength: 1 }

const formato = (metodo, pedidosAsociados = 0) => ({
    id: metodo._id,
    codigo: metodo.codigo || slug(metodo.nombre, '-'),
    nombre: metodo.nombre,
    descripcion: metodo.descripcion || '',
    icono: metodo.icono || 'CreditCard',
    // Los métodos creados antes de existir este campo no lo tienen: se consideran activos
    activo: metodo.activo !== false,
    pedidosAsociados,
})

export const listarMetodosPago = async (req, res) => {
    try {
        const [metodos, conteos] = await Promise.all([
            MetodoPago.find().sort({ nombre: 1 }),
            Pedido.aggregate([{ $group: { _id: '$metodoPago', total: { $sum: 1 } } }]),
        ])

        const porMetodo = new Map(conteos.map((c) => [String(c._id), c.total]))

        res.json(metodos.map((m) => formato(m, porMetodo.get(String(m._id)) || 0)))
    } catch (error) {
        manejarError(res, error)
    }
}

export const crearMetodoPago = async (req, res) => {
    try {
        const { nombre, descripcion, codigo, icono, activo } = req.body

        const identificador = slug(codigo || nombre, '-')
        if (!identificador) {
            return res.status(400).json({ message: 'El nombre debe contener letras o números' })
        }

        const existe = await MetodoPago.findOne({ nombre }).collation(COMPARACION)
        if (existe) {
            return res.status(409).json({ message: 'Ya existe un método de pago con ese nombre' })
        }

        const metodo = await new MetodoPago({
            nombre,
            descripcion,
            codigo: identificador,
            icono,
            activo,
        }).save()

        res.status(201).json(formato(metodo))
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarMetodoPago = async (req, res) => {
    try {
        const metodo = await MetodoPago.findById(req.params.id)
        if (!metodo) return res.status(404).json({ message: 'Método de pago no encontrado' })

        const { nombre, descripcion, icono, activo } = req.body

        if (nombre !== undefined) {
            const existe = await MetodoPago.findOne({ nombre, _id: { $ne: metodo._id } }).collation(COMPARACION)
            if (existe) {
                return res.status(409).json({ message: 'Ya existe un método de pago con ese nombre' })
            }
        }

        metodo.set(sinUndefined({ nombre, descripcion, icono, activo }))
        await metodo.save()

        const total = await Pedido.countDocuments({ metodoPago: metodo._id })

        res.json(formato(metodo, total))
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarMetodoPago = async (req, res) => {
    try {
        const metodo = await MetodoPago.findById(req.params.id)
        if (!metodo) return res.status(404).json({ message: 'Método de pago no encontrado' })

        const enUso = await Pedido.countDocuments({ metodoPago: metodo._id })
        if (enUso > 0) {
            return res.status(400).json({
                message: `No se puede eliminar: hay ${enUso} pedido(s) que lo usan. Puedes desactivarlo en su lugar`,
            })
        }

        await metodo.deleteOne()

        res.json({ message: 'Método de pago eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}