import { cuerpoError } from '../compartido/errors.js'
import Categoria from './categoria.model.js'
import Producto from './producto.model.js'
import { manejarError } from '../compartido/manejarError.js'
import { sinUndefined } from '../compartido/utils.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { formatoEstacion, reservarEstacion, reservarEstacionPorDefecto } from './estaciones.service.js'

// Compara nombres sin importar mayúsculas ni tildes ("Postres" = "postres")
const COMPARACION = { locale: 'es', strength: 1 }

const formato = (categoria, productosAsociados = 0) => ({
    id: categoria._id,
    nombre: categoria.nombre,
    descripcion: categoria.descripcion || '',
    productosAsociados,
    // 1.3 · Estación por defecto (poblada); null solo en categorías anteriores a migrate:1.3
    estacion: formatoEstacion(categoria.estacion?.codigo ? categoria.estacion : null),
})

export const listarCategorias = async (req, res) => {
    try {
        const [categorias, conteos] = await Promise.all([
            Categoria.find().sort({ nombre: 1 }).populate('estacion', 'codigo nombre'),
            Producto.aggregate([{ $group: { _id: '$categoria', total: { $sum: 1 } } }]),
        ])

        const porCategoria = new Map(conteos.map((c) => [String(c._id), c.total]))

        res.json(categorias.map((c) => formato(c, porCategoria.get(String(c._id)) || 0)))
    } catch (error) {
        manejarError(res, error)
    }
}

// Crear y editar con estación van en una transacción que «toca» la estación (1.3): así una
// desactivación o un borrado simultáneos de la estación entran en conflicto (ver estaciones.service).
export const crearCategoria = async (req, res) => {
    try {
        const { nombre, descripcion, estacionId } = req.validado

        const existe = await Categoria.findOne({ nombre }).collation(COMPARACION)
        if (existe) {
            return res.status(409).json(cuerpoError('CONFLICT', 'Ya existe una categoría con ese nombre'))
        }

        const categoria = await conTransaccion(async (session) => {
            const estacion = estacionId === undefined
                ? await reservarEstacionPorDefecto(session)
                : await reservarEstacion(estacionId, session)
            const [creada] = await Categoria.create([sinUndefined({ nombre, descripcion, estacion: estacion._id })], { session })
            creada.estacion = estacion
            return creada
        })

        res.status(201).json(formato(categoria))
    } catch (error) {
        manejarError(res, error)
    }
}

export const actualizarCategoria = async (req, res) => {
    try {
        const categoria = await Categoria.findById(req.params.id)
        if (!categoria) return res.status(404).json(cuerpoError('NOT_FOUND', 'Categoría no encontrada'))

        const { nombre, descripcion, estacionId } = req.validado

        if (nombre !== undefined) {
            const existe = await Categoria.findOne({ nombre, _id: { $ne: categoria._id } }).collation(COMPARACION)
            if (existe) {
                return res.status(409).json(cuerpoError('CONFLICT', 'Ya existe una categoría con ese nombre'))
            }
        }

        const actualizada = await conTransaccion(async (session) => {
            const estacion = estacionId === undefined ? undefined : await reservarEstacion(estacionId, session)
            const doc = await Categoria.findOneAndUpdate(
                { _id: categoria._id },
                { $set: sinUndefined({ nombre, descripcion, estacion: estacion?._id }) },
                { returnDocument: 'after', runValidators: true, session },
            )
            if (!doc) return null
            await doc.populate({ path: 'estacion', select: 'codigo nombre', options: { session } })
            return doc
        })
        if (!actualizada) return res.status(404).json(cuerpoError('NOT_FOUND', 'Categoría no encontrada'))

        const total = await Producto.countDocuments({ categoria: categoria._id })

        res.json(formato(actualizada, total))
    } catch (error) {
        manejarError(res, error)
    }
}

export const eliminarCategoria = async (req, res) => {
    try {
        const categoria = await Categoria.findById(req.params.id)
        if (!categoria) return res.status(404).json(cuerpoError('NOT_FOUND', 'Categoría no encontrada'))

        // No se puede borrar una categoría que todavía tiene productos
        const enUso = await Producto.countDocuments({ categoria: categoria._id })
        if (enUso > 0) {
            return res.status(400).json(cuerpoError('BAD_REQUEST', `No se puede eliminar: hay ${enUso} producto(s) en esta categoría`))
        }

        await categoria.deleteOne()

        res.json({ message: 'Categoría eliminada' })
    } catch (error) {
        manejarError(res, error)
    }
}
