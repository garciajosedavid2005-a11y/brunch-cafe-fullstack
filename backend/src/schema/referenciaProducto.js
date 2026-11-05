import { z } from 'zod'
import mongoose from 'mongoose'

/**
 * Producto referenciado por su ObjectId (`productoRef`, 0.6) o, por compatibilidad
 * con clientes anteriores, por su código numérico (`productoId`, deprecado: se
 * retira en 0.12). Exactamente uno de los dos.
 */
export const referenciaProducto = {
    productoRef: z.string()
        .refine(mongoose.isValidObjectId, { error: 'El producto no es válido.' })
        .optional(),
    productoId: z.coerce.number().int().min(1).optional(),
}

export const unaReferencia = (datos) => (datos.productoRef === undefined) !== (datos.productoId === undefined)
export const MENSAJE_REFERENCIA = 'Indica el producto con productoRef (o productoId), no ambos.'

/** Busca los productos referenciados; devuelve una función item → producto | undefined. */
export const resolverProductos = async (Producto, items) => {
    const refs = items.filter((i) => i.productoRef).map((i) => i.productoRef)
    const codigos = items.filter((i) => i.productoId !== undefined).map((i) => i.productoId)
    const productos = await Producto.find({ $or: [{ _id: { $in: refs } }, { codigo: { $in: codigos } }] }).lean()
    const porId = new Map(productos.map((p) => [String(p._id), p]))
    const porCodigo = new Map(productos.map((p) => [p.codigo, p]))
    return (item) => (item.productoRef ? porId.get(item.productoRef) : porCodigo.get(item.productoId))
}
