import Categoria from '../models/categoria.model.js'
import Producto from '../models/producto.model.js'
import { manejarError } from '../libs/manejarError.js'

// ---------- Públicas ----------

export const listarCategorias = async (req, res) => {
    try {
        const categorias = await Categoria.find().sort({ nombre: 1 })
        res.json(categorias)
    } catch (error) {
        manejarError(res, error)
    }
}

export const obtenerCategoria = async (req, res) => {
    try {
        const categoria = await Categoria.findById(req.params.id)
        if (!categoria) return res.status(404).json({ message: 'Categoría no encontrada' })

        res.json(categoria)
    } catch (error) {
        manejarError(res, error)
    }
}

// ---------- Admin ----------

export const crearCategoria = async (req, res) => {
    try {
        const { nombre } = req.body

        const categoria = await new Categoria({ nombre }).save()

        res.status(201).json(categoria)
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarCategoria = async (req, res) => {
    try {
        const { nombre } = req.body

        const categoria = await Categoria.findByIdAndUpdate(
            req.params.id,
            { nombre },
            { new: true, runValidators: true }
        )

        if (!categoria) return res.status(404).json({ message: 'Categoría no encontrada' })

        res.json(categoria)
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarCategoria = async (req, res) => {
    try {
        // No se puede borrar una categoría que todavía tiene productos
        const enUso = await Producto.countDocuments({ categoria: req.params.id })
        if (enUso > 0) {
            return res.status(400).json({
                message: `No se puede eliminar: hay ${enUso} producto(s) en esta categoría`
            })
        }

        const categoria = await Categoria.findByIdAndDelete(req.params.id)
        if (!categoria) return res.status(404).json({ message: 'Categoría no encontrada' })

        res.json({ message: 'Categoría eliminada' })
    } catch (error) {
        manejarError(res, error)
    }
}