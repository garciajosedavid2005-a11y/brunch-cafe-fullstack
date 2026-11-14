// 2.7 · Agotar productos y opciones («86») desde la operación (PLAN_FASE_2 §2.7; F2-5). Agotan cocina,
// barista, mesero y admin (producto:agotar); reactivan cocina, barista y admin (producto:reactivar); sin
// reactivación automática. Cada cambio va en una transacción con su Evento (quién y cuándo) y, ya confirmado,
// avisa por el canal «catalogo» (solo ids): la toma de comanda y el KDS releen. Escritura condicional sobre
// el estado contrario: agotar lo ya agotado (dos tablets a la vez) responde `cambiado: false` sin Evento.
import mongoose from 'mongoose'
import Producto from './producto.model.js'
import GrupoModificadores from './grupoModificadores.model.js'
import { extrasDeModificadores } from './producto.controller.js'
import { AppError } from '../compartido/errors.js'
import { registrarEvento } from '../compartido/estados.service.js'
import { conTransaccion } from '../compartido/transacciones.js'
import { tienePermiso } from '../identidad/permisos.js'
import { validar } from '../salon/cuentas.schema.js'
import { publicar } from '../tiempoReal/bus.js'
import { disponibilidadSchema } from './agotados.schema.js'

export const PERMISOS_AGOTADOS = ['producto:agotar', 'producto:reactivar']
const prohibido = (claves) => new AppError(403, 'FORBIDDEN', 'No tienes permiso para realizar esta acción.', { requiere: claves })
const exigirAlguno = (sesion, claves) => {
    if (!claves.some((c) => tienePermiso(sesion?.permisos || [], c))) throw prohibido(claves)
}
/** Agotar exige producto:agotar y reactivar producto:reactivar (antes de leer nada). */
const exigirSegun = (sesion, disponible) => exigirAlguno(sesion, [disponible ? 'producto:reactivar' : 'producto:agotar'])
const textoEstado = (disponible) => (disponible ? 'disponible' : 'agotado')
const actorDe = (sesion) => sesion.rol || 'staff'

/**
 * Productos (también los agotados) con su estación efectiva y los grupos activos que usan, con sus opciones.
 * Sin tope ni `truncado` a propósito: es el catálogo de una carta (decenas de productos, como el catálogo de
 * la toma de comanda, que tampoco lo tiene) y un agotado que no saliera en la lista no se podría reactivar.
 */
export const listarAgotables = async (sesion) => {
    exigirAlguno(sesion, PERMISOS_AGOTADOS)
    const productos = await Producto.find().populate('categoria', 'nombre').sort({ nombre: 1 })
        .select('nombre categoria estacion disponible gruposModificadores').lean()
    const extra = await extrasDeModificadores(productos)
    const grupos = new Map()
    const lista = productos.map((p) => {
        const { estacion, modificadores } = extra(p)
        for (const g of modificadores) grupos.set(g.id, g)
        return {
            id: String(p._id),
            nombre: p.nombre,
            categoria: p.categoria?.nombre || '',
            estacion,
            disponible: p.disponible !== false,
            grupos: modificadores.map((g) => g.id),
        }
    })
    return {
        productos: lista,
        grupos: [...grupos.values()]
            .map((g) => ({ id: g.id, nombre: g.nombre, opciones: g.opciones.map((o) => ({ id: o.id, nombre: o.nombre, disponible: o.disponible !== false })) }))
            .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    }
}

export const cambiarDisponibilidadProducto = async (productoId, datos, sesion) => {
    const { disponible } = validar(disponibilidadSchema, datos)
    exigirSegun(sesion, disponible)
    const noExiste = () => new AppError(404, 'PRODUCTO_NO_ENCONTRADO', 'El producto no existe.')
    if (!mongoose.isValidObjectId(productoId)) throw noExiste()

    const resultado = await conTransaccion(async (session) => {
        // Solo si está en el estado contrario (los productos anteriores al campo se leen como disponibles)
        const filtro = disponible ? { _id: productoId, disponible: false } : { _id: productoId, disponible: { $ne: false } }
        const producto = await Producto.findOneAndUpdate(filtro, { $set: { disponible } }, { returnDocument: 'after', session })
        if (!producto) {
            if (!(await Producto.exists({ _id: productoId }).session(session))) throw noExiste()
            return { id: String(productoId), disponible, cambiado: false }
        }
        await registrarEvento({
            entidad: 'producto', entidadId: producto._id, tipo: disponible ? 'producto_reactivado' : 'producto_agotado',
            de: textoEstado(!disponible), a: textoEstado(disponible), usuario: sesion.id, actor: actorDe(sesion),
            datos: { nombre: producto.nombre }, session,
        })
        return { id: String(producto._id), disponible, cambiado: true }
    })
    if (resultado.cambiado) publicar(['catalogo'], { tipo: 'disponibilidad', ids: { productoId: resultado.id } })
    return resultado
}

export const cambiarDisponibilidadOpcion = async (grupoId, opcionId, datos, sesion) => {
    const { disponible } = validar(disponibilidadSchema, datos)
    exigirSegun(sesion, disponible)
    const noExiste = () => new AppError(404, 'OPCION_NO_ENCONTRADA', 'La opción no existe.')
    if (!mongoose.isValidObjectId(grupoId) || !mongoose.isValidObjectId(opcionId)) throw noExiste()

    const resultado = await conTransaccion(async (session) => {
        // Condicional sobre la opción exacta; sube __v (concurrencia optimista del admin al editar el grupo)
        const grupo = await GrupoModificadores.findOneAndUpdate(
            // Como en el producto: una opción sin el campo guardado se lee como disponible (schema-reviewer)
            { _id: grupoId, opciones: { $elemMatch: { _id: opcionId, disponible: disponible ? false : { $ne: false } } } },
            { $set: { 'opciones.$.disponible': disponible }, $inc: { __v: 1 } },
            { returnDocument: 'after', session },
        )
        if (!grupo) {
            if (!(await GrupoModificadores.exists({ _id: grupoId, 'opciones._id': opcionId }).session(session))) throw noExiste()
            return { id: String(opcionId), grupoId: String(grupoId), disponible, cambiado: false }
        }
        const opcion = grupo.opciones.id(opcionId)
        await registrarEvento({
            entidad: 'modificador', entidadId: grupo._id, tipo: disponible ? 'opcion_reactivada' : 'opcion_agotada',
            de: textoEstado(!disponible), a: textoEstado(disponible), usuario: sesion.id, actor: actorDe(sesion),
            datos: { opcion: opcion._id, nombre: opcion.nombre }, session,
        })
        return { id: String(opcion._id), grupoId: String(grupo._id), disponible, cambiado: true }
    })
    if (resultado.cambiado) publicar(['catalogo'], { tipo: 'disponibilidad', ids: { grupoId: resultado.grupoId, opcionId: resultado.id } })
    return resultado
}
