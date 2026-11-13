import mongoose from 'mongoose'
import Estacion, { COLACION_NOMBRE, umbralesDe } from './estacion.model.js'
import Categoria from './categoria.model.js'
import Producto from './producto.model.js'
import { AppError, notFound } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { sinUndefined } from '../compartido/utils.js'

// 1.3 · Estaciones (Admin › Estaciones, permiso salon:configurar). Protecciones en el servidor:
//   - una estación en uso (categorías o productos) no se borra ni se desactiva (409 ESTACION_EN_USO);
//   - una estación inactiva o inexistente no se asigna (400 ESTACION_NO_VALIDA);
//   - asignar una estación la «toca» dentro de la transacción (reservarEstacion), así que un
//     borrado o una desactivación simultáneos entran en conflicto y ven el uso al reintentar.
export const CODIGO_POR_DEFECTO = 'cocina' // F1-3: lo que no es bebida va a cocina

const duplicada = () => new AppError(409, 'ESTACION_DUPLICADA', 'Ya existe una estación con ese código o nombre.')
export const estacionNoValida = () => new AppError(400, 'ESTACION_NO_VALIDA', 'La estación no existe o está inactiva.')
const esDuplicado = (error) => error?.code === 11000

const plural = (n, palabra) => `${n} ${palabra}${n === 1 ? '' : 's'}`

export const formatoEstacion = (estacion) => (estacion
    ? { id: String(estacion._id), codigo: estacion.codigo, nombre: estacion.nombre }
    : null)

const formato = (estacion, uso = { categorias: 0, productos: 0 }) => ({
    ...formatoEstacion(estacion),
    activa: estacion.activa,
    ...umbralesDe(estacion), // 2.3 (F2-4)
    ...uso,
})

// El aviso va antes que la alerta (con los valores que quedarán, propios o por defecto)
const exigirUmbrales = (estacion, cambios) => {
    const { umbralAvisoMin, umbralAlertaMin } = umbralesDe({ ...estacion, ...sinUndefined(cambios) })
    if (umbralAvisoMin >= umbralAlertaMin) {
        throw new AppError(400, 'UMBRALES_NO_VALIDOS', 'El aviso debe llegar antes que la alerta (menos minutos).', { umbralAvisoMin, umbralAlertaMin })
    }
}

const buscar = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw notFound('Estación no encontrada.')
    const estacion = await Estacion.findById(id)
    if (!estacion) throw notFound('Estación no encontrada.')
    return estacion
}

// En serie: dentro de una transacción no se lanzan operaciones en paralelo con la misma sesión
const usoDe = async (id, session) => {
    const categorias = await Categoria.countDocuments({ estacion: id }).session(session)
    const productos = await Producto.countDocuments({ estacion: id }).session(session)
    return { categorias, productos }
}

const exigirSinUso = async (id, session, accion) => {
    const { categorias, productos } = await usoDe(id, session)
    if (categorias + productos === 0) return
    const usos = [categorias && plural(categorias, 'categoría'), productos && plural(productos, 'producto')].filter(Boolean)
    throw new AppError(409, 'ESTACION_EN_USO',
        `No se puede ${accion}: la usan ${usos.join(' y ')}. Asígnales otra estación primero.`, { categorias, productos })
}

/**
 * Dentro de la transacción: comprueba que la estación exista y esté activa y la «toca» (escribe
 * updatedAt). Una transacción que la borre o la desactive a la vez entra en conflicto con esta.
 * Por eso `updatedAt` de una estación cambia también al asignarla: no significa «editada».
 */
export const reservarEstacion = async (id, session) => {
    if (!mongoose.isValidObjectId(id)) throw estacionNoValida()
    const estacion = await Estacion.findOneAndUpdate(
        { _id: id, activa: true },
        { $currentDate: { updatedAt: true } },
        { returnDocument: 'after', session },
    )
    if (!estacion) throw estacionNoValida()
    return estacion
}

/** Estación por defecto de una categoría nueva sin estación elegida (Cocina, F1-3). */
export const reservarEstacionPorDefecto = async (session) => {
    const cocina = await Estacion.findOne({ codigo: CODIGO_POR_DEFECTO }).select('_id').session(session)
    if (!cocina) {
        throw new AppError(400, 'ESTACION_NO_VALIDA', 'No existe la estación por defecto (Cocina): elige una estación para la categoría.')
    }
    return reservarEstacion(cocina._id, session)
}

export const listarEstaciones = async () => {
    const [estaciones, porCategoria, porProducto] = await Promise.all([
        Estacion.find().sort({ nombre: 1 }).collation(COLACION_NOMBRE).lean(),
        Categoria.aggregate([{ $match: { estacion: { $type: 'objectId' } } }, { $group: { _id: '$estacion', n: { $sum: 1 } } }]),
        Producto.aggregate([{ $match: { estacion: { $type: 'objectId' } } }, { $group: { _id: '$estacion', n: { $sum: 1 } } }]),
    ])
    const mapa = (lista) => new Map(lista.map((x) => [String(x._id), x.n]))
    const [cats, prods] = [mapa(porCategoria), mapa(porProducto)]
    return estaciones.map((e) => formato(e, { categorias: cats.get(String(e._id)) || 0, productos: prods.get(String(e._id)) || 0 }))
}

const nombreLibre = async (nombre, excepto) => {
    const filtro = excepto ? { nombre, _id: { $ne: excepto } } : { nombre }
    if (await Estacion.exists(filtro).collation(COLACION_NOMBRE)) throw duplicada()
}

export const crearEstacion = async ({ codigo, nombre, activa, umbralAvisoMin, umbralAlertaMin }) => {
    exigirUmbrales({ codigo }, { umbralAvisoMin, umbralAlertaMin })
    if (await Estacion.exists({ codigo })) throw duplicada()
    await nombreLibre(nombre)
    try {
        return formato(await Estacion.create(sinUndefined({ codigo, nombre, activa, umbralAvisoMin, umbralAlertaMin })))
    } catch (error) {
        if (esDuplicado(error)) throw duplicada() // dos altas simultáneas
        throw error
    }
}

export const actualizarEstacion = async (id, { nombre, activa, umbralAvisoMin, umbralAlertaMin }) => {
    const estacion = await buscar(id)
    exigirUmbrales(estacion.toObject(), { umbralAvisoMin, umbralAlertaMin })
    if (nombre !== undefined) await nombreLibre(nombre, estacion._id)
    try {
        return await conTransaccion(async (session) => {
            if (activa === false) await exigirSinUso(estacion._id, session, 'desactivar')
            // Condicional sobre los umbrales leídos: dos admins a la vez no dejan el aviso después de la alerta
            const actualizada = await Estacion.findOneAndUpdate(
                { _id: estacion._id, umbralAvisoMin: estacion.umbralAvisoMin ?? null, umbralAlertaMin: estacion.umbralAlertaMin ?? null },
                { $set: sinUndefined({ nombre, activa, umbralAvisoMin, umbralAlertaMin }) },
                { returnDocument: 'after', runValidators: true, session },
            )
            if (!actualizada) {
                if (await Estacion.exists({ _id: estacion._id }).session(session)) {
                    throw new AppError(409, 'ESTACION_MODIFICADA', 'Otro usuario cambió esta estación: recarga para ver los cambios.')
                }
                throw notFound('Estación no encontrada.')
            }
            return formato(actualizada, await usoDe(estacion._id, session))
        })
    } catch (error) {
        if (esDuplicado(error)) throw duplicada()
        throw error
    }
}

export const eliminarEstacion = async (id) => {
    const estacion = await buscar(id)
    await conTransaccion(async (session) => {
        await exigirSinUso(estacion._id, session, 'eliminar')
        const { deletedCount } = await Estacion.deleteOne({ _id: estacion._id }, { session })
        if (deletedCount === 0) throw notFound('Estación no encontrada.')
    })
}
