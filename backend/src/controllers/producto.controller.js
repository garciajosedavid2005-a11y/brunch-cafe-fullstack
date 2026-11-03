import mongoose from 'mongoose'
import Categoria from '../models/categoria.model.js'
import Producto from '../models/producto.model.js'
import MenuImage from '../models/menuImage.model.js'
import { manejarError } from '../libs/manejarError.js'
import { sinUndefined } from '../libs/utils.js'

const formato = (producto) => ({
    id: producto._id,
    codigo: producto.codigo,
    nombre: producto.nombre,
    precio: producto.precio,
    descripcion: producto.descripcion || '',
    imagen: producto.imagen || '',
    destacado: Boolean(producto.destacado),
    categoria: producto.categoria?.nombre || '',
    categoriaId: producto.categoria?._id || producto.categoria,
})

export const listarMenuPublico = async (req, res) => {
    try {
        const [productos, categorias] = await Promise.all([
            Producto.find().populate('categoria', 'nombre').sort({ codigo: 1, nombre: 1 }).lean(),
            Categoria.find().sort({ nombre: 1 }).select('nombre').lean(),
        ])

        res.json({
            categorias: categorias.map(({ nombre }) => nombre),
            productos: productos.map((producto) => ({
                id: producto.codigo,
                codigo: producto.codigo,
                nombre: producto.nombre,
                precio: `$${Number(producto.precio).toLocaleString('es-CO')}`,
                categoria: producto.categoria?.nombre || '',
                descripcion: producto.descripcion || '',
                imagen: producto.imagen || '',
                destacado: Boolean(producto.destacado),
            })),
        })
    } catch (error) {
        manejarError(res, error)
    }
}

export const obtenerImagenMenu = async (req, res) => {
    try {
        const imagen = await MenuImage.findOne({ nombre: req.params.nombre }).select('contentType data')
        if (!imagen) return res.status(404).json({ message: 'Imagen no encontrada' })

        res.set('Content-Type', imagen.contentType)
            .set('Cache-Control', 'public, max-age=3600')
            .send(imagen.data)
    } catch (error) {
        manejarError(res, error)
    }
}

export const listarProductos = async (req, res) => {
    try {
        const productos = await Producto.find()
            .populate('categoria', 'nombre')
            .sort({ codigo: 1, nombre: 1 })
        res.json(productos.map(formato))
    } catch (error) {
        manejarError(res, error)
    }
}

export const crearProducto = async (req, res) => {
    try {
        const { categoriaId, ...datos } = req.body
        if (!mongoose.isValidObjectId(categoriaId)) {
            return res.status(400).json({ message: 'La categoría seleccionada no es válida' })
        }

        const categoria = await Categoria.findById(categoriaId)
        if (!categoria) return res.status(400).json({ message: 'La categoría seleccionada no existe' })

        const ultimo = await Producto.findOne({ codigo: { $type: 'number' } }).sort({ codigo: -1 }).select('codigo')
        const producto = await new Producto({
            ...datos,
            codigo: (ultimo?.codigo || 0) + 1,
            categoria: categoria._id,
        }).save()
        await producto.populate('categoria', 'nombre')

        res.status(201).json(formato(producto))
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarProducto = async (req, res) => {
    try {
        const producto = await Producto.findById(req.params.id)
        if (!producto) return res.status(404).json({ message: 'Producto no encontrado' })

        const { categoriaId, ...datos } = req.body
        const cambios = { ...datos }
        if (categoriaId !== undefined) {
            if (!mongoose.isValidObjectId(categoriaId)) {
                return res.status(400).json({ message: 'La categoría seleccionada no es válida' })
            }
            const categoria = await Categoria.findById(categoriaId)
            if (!categoria) return res.status(400).json({ message: 'La categoría seleccionada no existe' })
            cambios.categoria = categoria._id
        }

        producto.set(sinUndefined(cambios))
        await producto.save()
        await producto.populate('categoria', 'nombre')
        res.json(formato(producto))
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarProducto = async (req, res) => {
    try {
        const producto = await Producto.findById(req.params.id)
        if (!producto) return res.status(404).json({ message: 'Producto no encontrado' })
        await producto.deleteOne()
        res.json({ message: 'Producto eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}