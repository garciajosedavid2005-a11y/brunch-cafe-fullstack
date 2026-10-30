import Producto from '../models/producto.model.js'
import Categoria from '../models/categoria.model.js'
import { manejarError } from '../libs/manejarError.js'

// ---------- Públicas ----------
// Listar acepta filtro: GET /api/productos?categoria=<id>

export const listarProductos = async (req, res) => {
    try {
        const filtro = {}
        if (req.query.categoria) filtro.categoria = req.query.categoria

        const productos = await Producto.find(filtro)
            .populate('categoria')
            .sort({ nombre: 1 })

        res.json(productos)
    } catch (error) {
        manejarError(res, error)
    }
}

export const obtenerProducto = async (req, res) => {
    try {
        const producto = await Producto.findById(req.params.id).populate('categoria')
        if (!producto) return res.status(404).json({ message: 'Producto no encontrado' })

        res.json(producto)
    } catch (error) {
        manejarError(res, error)
    }
}

// ---------- Admin ----------

export const crearProducto = async (req, res) => {
    try {
        const { nombre, precio, descripcion, imagen, categoria } = req.body

        const categoriaValida = await Categoria.findById(categoria)
        if (!categoriaValida) {
            return res.status(400).json({ message: 'La categoría no existe' })
        }

        const producto = await new Producto({
            nombre,
            precio,
            descripcion,
            imagen,
            categoria
        }).save()

        await producto.populate('categoria')

        res.status(201).json(producto)
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarProducto = async (req, res) => {
    try {
        const { nombre, precio, descripcion, imagen, categoria } = req.body

        // Solo se actualizan los campos que realmente llegaron
        const datos = { nombre, precio, descripcion, imagen, categoria }
        Object.keys(datos).forEach((k) => datos[k] === undefined && delete datos[k])

        if (datos.categoria) {
            const categoriaValida = await Categoria.findById(datos.categoria)
            if (!categoriaValida) {
                return res.status(400).json({ message: 'La categoría no existe' })
            }
        }

        const producto = await Producto.findByIdAndUpdate(
            req.params.id,
            datos,
            { new: true, runValidators: true }
        ).populate('categoria')

        if (!producto) return res.status(404).json({ message: 'Producto no encontrado' })

        res.json(producto)
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarProducto = async (req, res) => {
    try {
        // Los pedidos viejos no se afectan: DetallePedido guarda copia del nombre y precio
        const producto = await Producto.findByIdAndDelete(req.params.id)
        if (!producto) return res.status(404).json({ message: 'Producto no encontrado' })

        res.json({ message: 'Producto eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}