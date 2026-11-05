import { z } from 'zod'
import { texto, textoOpcional, booleano, requerido } from './comunes.js'
import { DATA_URL, esUrlDelMenu } from '../libs/imagenesProducto.js'

// '' (sin imagen), la URL que ya tenía (/productos/menu/imagenes/...) o una imagen nueva incrustada
const imagen = z.string(requerido('La imagen'))
    .max(5_000_000, { error: 'La imagen no puede superar 5 MB' })
    .refine((v) => v === '' || esUrlDelMenu(v) || DATA_URL.test(v), {
        error: 'La imagen debe ser PNG, JPG, WEBP o GIF.',
    })
    .optional()

export const crearProductoSchema = z.object({
    nombre: texto('El nombre', 2, 100),
    precio: z.coerce.number(requerido('El precio')).min(0, { error: 'El precio no puede ser negativo' }),
    descripcion: textoOpcional('La descripción', 500),
    imagen,
    destacado: booleano('El campo destacado').optional(),
    categoriaId: z.string(requerido('La categoría')).min(1, { error: 'La categoría es requerida' }),
})

export const actualizarProductoSchema = crearProductoSchema.partial()