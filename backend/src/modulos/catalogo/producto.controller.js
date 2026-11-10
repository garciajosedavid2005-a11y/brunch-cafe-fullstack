import { cuerpoError } from '../compartido/errors.js'
import mongoose from 'mongoose'
import Categoria from './categoria.model.js'
import Producto from './producto.model.js'
import MenuImage from './menuImage.model.js'
import { manejarError } from '../compartido/manejarError.js'
import { sinUndefined } from '../compartido/utils.js'
import { siguienteValor } from '../compartido/contadores.js'
import { urlPublica, esDataUrl, guardarImagenSubida, borrarImagenSubida } from './imagenesProducto.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { estacionEfectiva } from './estaciones.js'
import { formatoEstacion, reservarEstacion } from './estaciones.service.js'
import { reservarGrupos, formatoGrupoPublico } from './modificadores.service.js'
import { consultaCatalogoSchema } from './catalogoConfig.schema.js'
import Estacion from './estacion.model.js'
import GrupoModificadores from './grupoModificadores.model.js'

// Poblado que necesita el formato del admin (1.3: estación de la categoría, propia y grupos)
const POBLAR_ADMIN = [
    { path: 'categoria', select: 'nombre estacion', populate: { path: 'estacion', select: 'codigo nombre' } },
    { path: 'estacion', select: 'codigo nombre' },
    { path: 'gruposModificadores', select: 'nombre activo' },
]

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
    // 1.3 · estacionId = estación propia (null = hereda la de la categoría); estacionEfectiva = la
    // que se usa (función única estacionEfectiva); grupos en el orden en que se ofrecen
    estacionId: producto.estacion ? String(producto.estacion._id || producto.estacion) : null,
    estacionEfectiva: formatoEstacion(estacionEfectiva(producto, producto.categoria)),
    gruposModificadores: (producto.gruposModificadores || [])
        .filter((g) => g?.nombre)
        .map((g) => ({ id: String(g._id), nombre: g.nombre, activo: g.activo })),
})

/**
 * Catálogo público (GET /api/v1/catalogo y su alias GET /api/productos/menu).
 * `id` es el ObjectId del producto (0.6: carrito, pedidos y reseñas lo envían como
 * `productoRef`); `codigo` es el número visible (enlaces /menu#producto-<codigo>).
 * Precio entero en COP; imagen siempre como URL (nunca base64).
 */
export const listarCatalogo = async (req, res) => {
    try {
        // 1.3 · ?incluir=modificadores añade estación y grupos; sin él, la respuesta no cambia
        const { incluir } = consultaCatalogoSchema.parse(req.query)
        const [productos, categorias] = await Promise.all([
            // $ne: false también incluye documentos antiguos sin el campo
            Producto.find({ disponible: { $ne: false } }).populate('categoria', 'nombre').sort({ codigo: 1, nombre: 1 }).lean(),
            Categoria.find().sort({ nombre: 1 }).select('nombre').lean(),
        ])

        const extra = incluir === 'modificadores' ? await extrasDeModificadores(productos) : null

        res.json({
            categorias: categorias.map(({ nombre }) => nombre),
            productos: productos.map((producto) => ({
                id: String(producto._id),
                codigo: producto.codigo,
                nombre: producto.nombre,
                precio: producto.precio, // entero en COP; el frontend lo formatea
                categoria: producto.categoria?.nombre || '',
                descripcion: producto.descripcion || '',
                imagen: urlPublica(producto.imagen),
                destacado: Boolean(producto.destacado),
                ...(extra ? extra(producto) : {}),
            })),
        })
    } catch (error) {
        manejarError(res, error)
    }
}

// Estación efectiva y grupos ACTIVOS de cada producto (opciones agotadas incluidas, con disponible)
export const extrasDeModificadores = async (productos) => {
    // Un producto cuya categoría ya no existe queda sin estación (no rompe el catálogo)
    const idsCategorias = [...new Set(productos.map((p) => p.categoria?._id).filter(Boolean).map(String))]
    const idsGrupos = [...new Set(productos.flatMap((p) => (p.gruposModificadores || []).map(String)))]
    const [cats, grupos] = await Promise.all([
        Categoria.find({ _id: { $in: idsCategorias } }).select('estacion').lean(),
        GrupoModificadores.find({ _id: { $in: idsGrupos }, activo: true }).lean(),
    ])
    const categoriaPorId = new Map(cats.map((c) => [String(c._id), c]))
    // Solo las estaciones que usan los productos devueltos (no se lista el resto)
    const idsEstaciones = [...new Set(productos
        .map((p) => estacionEfectiva(p, categoriaPorId.get(String(p.categoria?._id))))
        .filter(Boolean)
        .map(String))]
    const estaciones = await Estacion.find({ _id: { $in: idsEstaciones } }).select('codigo nombre').lean()
    const estacionPorId = new Map(estaciones.map((e) => [String(e._id), e]))
    const grupoPorId = new Map(grupos.map((g) => [String(g._id), g]))
    return (producto) => {
        const id = estacionEfectiva(producto, categoriaPorId.get(String(producto.categoria?._id)))
        const estacion = id ? estacionPorId.get(String(id)) : null
        return {
            estacion: estacion ? { codigo: estacion.codigo, nombre: estacion.nombre } : null,
            modificadores: (producto.gruposModificadores || [])
                .map((g) => grupoPorId.get(String(g)))
                .filter(Boolean)
                .map(formatoGrupoPublico),
        }
    }
}

export const obtenerImagenMenu = async (req, res) => {
    try {
        const imagen = await MenuImage.findOne({ nombre: req.params.nombre }).select('contentType data')
        if (!imagen) return res.status(404).json(cuerpoError('NOT_FOUND', 'Imagen no encontrada'))

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
            .populate(POBLAR_ADMIN)
            .sort({ codigo: 1, nombre: 1 })
        res.json(productos.map(formato))
    } catch (error) {
        manejarError(res, error)
    }
}

/**
 * Guarda el producto en una transacción que reserva la estación propia y los grupos (1.3): un
 * borrado o una desactivación simultáneos de la estación o un borrado del grupo entran en
 * conflicto. connection.transaction() restaura el estado del documento si hay que reintentar.
 */
const guardarConReferencias = (producto, { estacionId, gruposModificadoresIds }) => {
    // Grupos que ya tenía (leídos antes: un reintento de la transacción no debe ver los nuevos)
    const yaAsignados = producto.isNew ? [] : (producto.gruposModificadores || []).map(String)
    return conTransaccion(async (session) => {
        if (estacionId !== undefined) {
            producto.estacion = estacionId === null ? null : (await reservarEstacion(estacionId, session))._id
        }
        if (gruposModificadoresIds !== undefined) {
            producto.gruposModificadores = (await reservarGrupos(gruposModificadoresIds, session, { yaAsignados })).map((g) => g._id)
        }
        await producto.save({ session })
    })
}

// Solo los campos validados (req.validado): codigo, estacion o gruposModificadores en crudo no pasan
export const crearProducto = async (req, res) => {
    try {
        const { categoriaId, estacionId, gruposModificadoresIds, ...datos } = req.validado
        if (!mongoose.isValidObjectId(categoriaId)) {
            return res.status(400).json(cuerpoError('BAD_REQUEST', 'La categoría seleccionada no es válida'))
        }

        const categoria = await Categoria.findById(categoriaId)
        if (!categoria) return res.status(400).json(cuerpoError('BAD_REQUEST', 'La categoría seleccionada no existe'))

        // Código numérico (lo usan carrito y pedidos): contador atómico, sin carreras
        const ultimo = await Producto.findOne({ codigo: { $type: 'number' } }).sort({ codigo: -1 }).select('codigo')
        const codigo = await siguienteValor('producto', ultimo?.codigo || 0)
        const imagen = esDataUrl(datos.imagen) ? await guardarImagenSubida(datos.imagen, codigo) : datos.imagen
        const producto = new Producto(sinUndefined({ ...datos, imagen, codigo, categoria: categoria._id }))
        try {
            await guardarConReferencias(producto, { estacionId, gruposModificadoresIds })
        } catch (error) {
            await borrarImagenSubida(imagen) // no dejar la imagen huérfana
            throw error
        }
        await producto.populate(POBLAR_ADMIN)

        res.status(201).json(formato(producto))
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarProducto = async (req, res) => {
    try {
        const producto = await Producto.findById(req.params.id)
        if (!producto) return res.status(404).json(cuerpoError('NOT_FOUND', 'Producto no encontrado'))

        const { categoriaId, estacionId, gruposModificadoresIds, ...datos } = req.validado
        const cambios = { ...datos }
        if (categoriaId !== undefined) {
            if (!mongoose.isValidObjectId(categoriaId)) {
                return res.status(400).json(cuerpoError('BAD_REQUEST', 'La categoría seleccionada no es válida'))
            }
            const categoria = await Categoria.findById(categoriaId)
            if (!categoria) return res.status(400).json(cuerpoError('BAD_REQUEST', 'La categoría seleccionada no existe'))
            cambios.categoria = categoria._id
        }

        const imagenAnterior = producto.imagen
        if (esDataUrl(cambios.imagen)) cambios.imagen = await guardarImagenSubida(cambios.imagen, producto.codigo)
        producto.set(sinUndefined(cambios))
        try {
            await guardarConReferencias(producto, { estacionId, gruposModificadoresIds })
        } catch (error) {
            if (cambios.imagen !== imagenAnterior) await borrarImagenSubida(cambios.imagen)
            throw error
        }
        if (cambios.imagen !== undefined && cambios.imagen !== imagenAnterior) await borrarImagenSubida(imagenAnterior)
        await producto.populate(POBLAR_ADMIN)
        res.json(formato(producto))
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarProducto = async (req, res) => {
    try {
        const producto = await Producto.findById(req.params.id)
        if (!producto) return res.status(404).json(cuerpoError('NOT_FOUND', 'Producto no encontrado'))
        await producto.deleteOne()
        await borrarImagenSubida(producto.imagen)
        res.json({ message: 'Producto eliminado' })
    } catch (error) {
        manejarError(res, error)
    }
}