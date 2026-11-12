import mongoose from 'mongoose'
import { z } from 'zod'
import GrupoModificadores, { MAX_SELECCION } from './grupoModificadores.model.js'
import { MAX_GRUPOS_POR_PRODUCTO } from './producto.model.js'
import { AppError } from '../compartido/errors.js'
import { requerido } from '../compartido/comunes.schema.js'

// 1.12 · Modificadores elegidos para un producto: el MISMO validador y la misma copia para las cuentas
// del salón (1.4) y los pedidos a domicilio. Se movió aquí desde salon/cuentas.service.js sin cambios.

const error = (status, code, message, details) => new AppError(status, code, message, details)

/** Lo que llega del cliente: [{ grupoId, opcionIds }] (ids en minúsculas). */
const id = (campo) => z.string(requerido(campo))
    .refine(mongoose.isValidObjectId, { error: `${campo} no es válido` })
    .transform((valor) => valor.toLowerCase())
export const modificadoresEntradaSchema = z.array(z.strictObject({
    grupoId: id('El grupo de modificadores'),
    opcionIds: z.array(id('La opción')).max(MAX_SELECCION),
})).max(MAX_GRUPOS_POR_PRODUCTO).default([])

// La copia que se guarda (subesquema sin dependencias) y la nota, en catalogo/modificadorElegido.schema.js
export { modificadorElegidoSchema, MAX_NOTA_ITEM } from './modificadorElegido.schema.js'

/** Grupos ACTIVOS del producto, en el orden en que el producto los ofrece. */
export const gruposActivosDe = async (producto, session) => {
    const ids = producto.gruposModificadores || []
    if (!ids.length) return []
    const grupos = await GrupoModificadores.find({ _id: { $in: ids }, activo: true }).session(session).lean()
    const porId = new Map(grupos.map((g) => [String(g._id), g]))
    return ids.map((grupoId) => porId.get(String(grupoId))).filter(Boolean)
}

/** Lo mismo para varios productos en una sola consulta: (producto) → grupos activos. */
export const gruposActivosDeVarios = async (productos, session) => {
    const ids = [...new Set(productos.flatMap((p) => (p.gruposModificadores || []).map(String)))]
    const grupos = ids.length ? await GrupoModificadores.find({ _id: { $in: ids }, activo: true }).session(session).lean() : []
    const porId = new Map(grupos.map((g) => [String(g._id), g]))
    return (producto) => (producto.gruposModificadores || []).map((grupoId) => porId.get(String(grupoId))).filter(Boolean)
}

/**
 * Valida la elección contra los grupos activos del producto y devuelve la copia de los
 * modificadores (orden: el de los grupos en el producto y el de las opciones en el grupo).
 */
export const validarModificadores = (grupos, pedidos) => {
    const elegidasPorGrupo = new Map()
    for (const { grupoId, opcionIds } of pedidos) {
        if (elegidasPorGrupo.has(grupoId)) throw error(400, 'GRUPO_NO_VALIDO', 'Un grupo de modificadores viene repetido.', { grupoId })
        if (!grupos.some((g) => String(g._id) === grupoId)) {
            throw error(400, 'GRUPO_NO_VALIDO', 'Ese grupo de modificadores no se ofrece para este producto.', { grupoId })
        }
        if (new Set(opcionIds).size !== opcionIds.length) throw error(400, 'OPCION_NO_VALIDA', 'Hay una opción repetida.', { grupoId })
        elegidasPorGrupo.set(grupoId, opcionIds)
    }

    const snapshot = []
    for (const grupo of grupos) {
        const grupoId = String(grupo._id)
        const elegidas = elegidasPorGrupo.get(grupoId) || []
        if (elegidas.length === 0 && grupo.min >= 1) {
            throw error(400, 'MODIFICADOR_REQUERIDO', `Elige una opción de «${grupo.nombre}».`, { grupoId, grupo: grupo.nombre })
        }
        if (elegidas.length < grupo.min || elegidas.length > grupo.max) {
            const rango = grupo.min === grupo.max ? `${grupo.min}` : `entre ${grupo.min} y ${grupo.max}`
            throw error(400, 'MODIFICADORES_FUERA_DE_RANGO', `En «${grupo.nombre}» elige ${rango} opciones.`,
                { grupoId, grupo: grupo.nombre, min: grupo.min, max: grupo.max, elegidas: elegidas.length })
        }
        const opciones = elegidas.map((opcionId) => {
            const opcion = grupo.opciones.find((o) => String(o._id) === opcionId)
            if (!opcion) throw error(400, 'OPCION_NO_VALIDA', `Esa opción no pertenece a «${grupo.nombre}».`, { grupoId, opcionId })
            if (opcion.disponible === false) {
                throw error(409, 'OPCION_NO_DISPONIBLE', `«${opcion.nombre}» (${grupo.nombre}) está agotada.`, { grupoId, opcionId })
            }
            return opcion
        })
        opciones.sort((x, y) => grupo.opciones.indexOf(x) - grupo.opciones.indexOf(y))
        for (const opcion of opciones) {
            snapshot.push({ grupo: grupo._id, grupoNombre: grupo.nombre, opcion: opcion._id, opcionNombre: opcion.nombre, precioExtra: opcion.precioExtra ?? 0 })
        }
    }
    return snapshot
}
