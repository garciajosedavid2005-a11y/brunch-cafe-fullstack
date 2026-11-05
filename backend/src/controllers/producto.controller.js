import mongoose from 'mongoose'
import Categoria from '../models/categoria.model.js'
import Producto from '../models/producto.model.js'
import MenuImage from '../models/menuImage.model.js'
import { manejarError } from '../libs/manejarError.js'
import { sinUndefined } from '../libs/utils.js'
import { siguienteValor } from '../libs/contadores.js'
import { urlPublica, esDataUrl, guardarImagenSubida, borrarImagenSubida } from '../libs/imagenesProducto.js'

const formato = (producto) => ({
    id: producto._id,
    codigo: producto.codigo,
    nombre: producto.nombre,
    precio: producto.precio,
    descripcion: producto.descripcion || '',
    imagen: urlPublica(producto.imagen),
    destacado: Boolean(producto.destacado),
    disponible: producto.disponible !== false,
    categoria: producto.categoria?.nombre || '',
    categoriaId: producto.categoria?._id || producto.categoria,
})

/**
 * Catálogo público (GET /api/v1/catalogo y su alias GET /api/productos/menu).
 * `id` es el código numérico del producto (lo usan el carrito y los pedidos).
 * Precio entero en COP; imagen siempre como URL (nunca base64).
 */
export const listarCatalogo = async (req, res) => {
    try {
        const [productos, categorias] = await Promise.all([
            // $ne: false también incluye documentos antiguos sin el campo
            Producto.find({ disponible: { $ne: false } }).populate('categoria', 'nombre').sort({ codigo: 1, nombre: 1 }).lean(),
            Categoria.find().sort({ nombre: 1 }).select('nombre').lean(),
        ])

        res.json({
            categorias: categorias.map(({ nombre }) => nombre),
            productos: productos.map((producto) => ({
                id: producto.codigo,
                codigo: producto.codigo,
                nombre: producto.nombre,
                precio: producto.precio, // entero en COP; el frontend lo formatea
                categoria: producto.categoria?.nombre || '',
                descripcion: producto.descripcion || '',
                imagen: urlPublica(producto.imagen),
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
            .set('Cross-Origin-Resource-Policy', 'cross-origin')
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

        // Código numérico (lo usan carrito y pedidos): contador atómico, sin carreras
        const ultimo = await Producto.findOne({ codigo: { $type: 'number' } }).sort({ codigo: -1 }).select('codigo')
        const codigo = await siguienteValor('producto', ultimo?.codigo || 0)
        const imagen = esDataUrl(datos.imagen) ? await guardarImagenSubida(datos.imagen, codigo) : datos.imagen
        let producto
        try {
            producto = await new Producto({ ...datos, imagen, codigo, categoria: categoria._id }).save()
        } catch (error) {
            await borrarImagenSubida(imagen) // no dejar la imagen huérfana
            throw error
        }
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

        const imagenAnterior = producto.imagen
        if (esDataUrl(cambios.imagen)) cambios.imagen = await guardarImagenSubida(cambios.imagen, producto.codigo)
        producto.set(sinUndefined(cambios))
        try {
            await producto.save()
        } catch (error) {
            if (cambios.imagen !== imagenAnterior) await borrarImagenSubida(cambios.imagen)
            throw error
        }
        if (cambios.imagen !== undefined && cambios.imagen !== imagenAnterior) await borrarImagenSubida(imagenAnterior)
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
        await borrarImagenSubida(producto.imagen)
        res.json({ message: 'Producto eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}