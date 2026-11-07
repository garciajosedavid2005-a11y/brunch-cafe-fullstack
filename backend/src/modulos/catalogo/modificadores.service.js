import mongoose from 'mongoose'
import GrupoModificadores, { COLACION_NOMBRE } from './grupoModificadores.model.js'
import Producto from './producto.model.js'
import { AppError, notFound } from '../compartido/errors.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { sinUndefined } from '../compartido/utils.js'

// 1.3 · Grupos de modificadores (Admin › Modificadores, permiso catalogo:gestionar). F1-4.
//   - Las reglas del grupo viven en el esquema (grupoModificadores.model.js) y se comprueban
//     sobre el documento completo también al editar parcialmente.
//   - Un grupo en uso no se borra (409 GRUPO_EN_USO); sí se desactiva (los productos dejan de
//     ofrecerlo, pero lo conservan asignado).
//   - Asignar grupos a un producto los «toca» dentro de la transacción (reservarGrupos): un borrado
//     simultáneo entra en conflicto y, al reintentar, ve el uso.
//   - Edición con concurrencia optimista: si el grupo cambió entre la lectura y la escritura → 409.

const duplicado = () => new AppError(409, 'GRUPO_DUPLICADO', 'Ya existe un grupo de modificadores con ese nombre.')
const modificado = () => new AppError(409, 'GRUPO_MODIFICADO', 'El grupo cambió mientras lo editabas. Recarga y vuelve a intentarlo.')
export const grupoNoValido = () => new AppError(400, 'GRUPO_NO_VALIDO', 'Algún grupo de modificadores no existe, está inactivo o está repetido.')
const esDuplicado = (error) => error?.code === 11000

const formatoOpcion = (o) => ({ id: String(o._id), nombre: o.nombre, precioExtra: o.precioExtra, disponible: o.disponible })

/** Grupo tal como lo ve quien toma el pedido (catálogo con ?incluir=modificadores). */
export const formatoGrupoPublico = (g) => ({
    id: String(g._id), nombre: g.nombre, obligatorio: g.obligatorio, min: g.min, max: g.max,
    opciones: g.opciones.map(formatoOpcion),
})

const formato = (g, productos = 0) => ({
    ...formatoGrupoPublico(g),
    activo: g.activo,
    ejemplo: Boolean(g.ejemplo),
    productos,
})

const buscar = async (id) => {
    if (!mongoose.isValidObjectId(id)) throw notFound('Grupo de modificadores no encontrado.')
    const grupo = await GrupoModificadores.findById(id)
    if (!grupo) throw notFound('Grupo de modificadores no encontrado.')
    return grupo
}

const nombreLibre = async (nombre, excepto) => {
    const filtro = excepto ? { nombre, _id: { $ne: excepto } } : { nombre }
    if (await GrupoModificadores.exists(filtro).collation(COLACION_NOMBRE)) throw duplicado()
}

export const listarGrupos = async () => {
    const [grupos, conteos] = await Promise.all([
        GrupoModificadores.find().sort({ nombre: 1 }).collation(COLACION_NOMBRE).lean(),
        Producto.aggregate([{ $unwind: '$gruposModificadores' }, { $group: { _id: '$gruposModificadores', n: { $sum: 1 } } }]),
    ])
    const uso = new Map(conteos.map((c) => [String(c._id), c.n]))
    return grupos.map((g) => formato(g, uso.get(String(g._id)) || 0))
}

export const crearGrupo = async ({ nombre, obligatorio, min, max, opciones, activo }) => {
    await nombreLibre(nombre)
    try {
        return formato(await GrupoModificadores.create(sinUndefined({ nombre, obligatorio, min, max, opciones, activo })))
    } catch (error) {
        if (esDuplicado(error)) throw duplicado()
        throw error
    }
}

// Las opciones que traen id conservan el suyo (la comanda de 1.4 lo guarda) y los campos que no se
// envían (recargo, disponible); las nuevas reciben un id. Las que no se envían se quitan del grupo
// (la comanda guarda su propia copia de nombre y precio).
const opcionNoValida = (mensaje) => new AppError(400, 'OPCION_NO_VALIDA', mensaje)
const fusionarOpciones = (actuales, nuevas) => {
    const porId = new Map(actuales.map((o) => [String(o._id), o]))
    const vistos = new Set()
    return nuevas.map(({ id, ...datos }) => {
        if (id === undefined) return datos
        if (!porId.has(id)) throw opcionNoValida('Alguna opción no pertenece a este grupo.')
        if (vistos.has(id)) throw opcionNoValida('Hay opciones repetidas.')
        vistos.add(id)
        const actual = porId.get(id)
        return { _id: actual._id, nombre: actual.nombre, precioExtra: actual.precioExtra, disponible: actual.disponible, ...datos }
    })
}

export const actualizarGrupo = async (id, { nombre, obligatorio, min, max, opciones, activo }) => {
    const grupo = await buscar(id)
    if (nombre !== undefined) await nombreLibre(nombre, grupo._id)
    grupo.set(sinUndefined({
        nombre, obligatorio, min, max, activo,
        opciones: opciones === undefined ? undefined : fusionarOpciones(grupo.opciones, opciones),
    }))
    try {
        await grupo.save() // valida el grupo completo; __v detecta otra edición intermedia
    } catch (error) {
        if (error?.name === 'VersionError' || error instanceof mongoose.Error.VersionError) throw modificado()
        if (esDuplicado(error)) throw duplicado()
        throw error
    }
    return formato(grupo, await Producto.countDocuments({ gruposModificadores: grupo._id }))
}

export const eliminarGrupo = async (id) => {
    const grupo = await buscar(id)
    await conTransaccion(async (session) => {
        const productos = await Producto.countDocuments({ gruposModificadores: grupo._id }).session(session)
        if (productos > 0) {
            throw new AppError(409, 'GRUPO_EN_USO',
                `No se puede eliminar: lo usan ${productos} producto${productos === 1 ? '' : 's'}. Desactívalo o quítalo de esos productos.`,
                { productos })
        }
        const { deletedCount } = await GrupoModificadores.deleteOne({ _id: grupo._id }, { session })
        if (deletedCount === 0) throw notFound('Grupo de modificadores no encontrado.')
    })
}

/**
 * Dentro de la transacción: comprueba que todos los grupos existan, estén activos y no se repitan,
 * y los «toca» (updatedAt) para entrar en conflicto con un borrado simultáneo. Devuelve los grupos
 * en el orden pedido. Por eso `updatedAt` de un grupo cambia también al asignarlo a un producto:
 * no significa «editado».
 * `yaAsignados`: grupos que el producto ya tenía; esos se pueden conservar aunque se hayan
 * desactivado después (si no, el producto no se podría volver a guardar). Uno inactivo nuevo, no.
 */
export const reservarGrupos = async (ids, session, { yaAsignados = [] } = {}) => {
    if (!ids.length) return []
    if (!ids.every(mongoose.isValidObjectId) || new Set(ids.map(String)).size !== ids.length) throw grupoNoValido()
    const conservados = ids.filter((id) => yaAsignados.map(String).includes(String(id)))
    const { matchedCount } = await GrupoModificadores.updateMany(
        { _id: { $in: ids }, $or: [{ activo: true }, { _id: { $in: conservados } }] },
        { $currentDate: { updatedAt: true } },
        { session },
    )
    if (matchedCount !== ids.length) throw grupoNoValido()
    const grupos = await GrupoModificadores.find({ _id: { $in: ids } }).select('nombre activo').session(session).lean()
    const porId = new Map(grupos.map((g) => [String(g._id), g]))
    return ids.map((i) => porId.get(String(i)))
}
