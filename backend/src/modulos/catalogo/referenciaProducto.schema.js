import { z } from 'zod'
import mongoose from 'mongoose'

/**
 * Producto referenciado por su ObjectId (`productoRef`, 0.6). Desde 0.12 ya no se acepta
 * el código numérico (`productoId`); el código se sigue guardando como dato visible.
 */
export const referenciaProducto = {
    productoRef: z.string({ error: 'Indica el producto (productoRef).' })
        .refine(mongoose.isValidObjectId, { error: 'El producto no es válido.' }),
}

/** Busca los productos referenciados; devuelve una función item → producto | undefined. */
export const resolverProductos = async (Producto, items) => {
    const productos = await Producto.find({ _id: { $in: items.map((i) => i.productoRef) } }).lean()
    const porId = new Map(productos.map((p) => [String(p._id), p]))
    return (item) => porId.get(item.productoRef)
}
