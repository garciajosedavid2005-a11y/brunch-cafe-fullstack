import { z } from 'zod'
import { texto, textoOpcional, booleano, requerido } from '../compartido/comunes.schema.js'
import { estacionDeProducto, gruposDeProducto } from './catalogoConfig.schema.js'
import { DATA_URL, esUrlDelMenu, bytesDeDataUrl, MAX_BYTES_IMAGEN } from './imagenesProducto.js'

// '' (sin imagen), la URL que ya tenía (/productos/menu/imagenes/...) o una imagen nueva incrustada
// Límite: 2 MB por imagen (decodificada). El cuerpo JSON admite hasta 3 MB (app.js).
const imagen = z.string(requerido('La imagen'))
    .refine((v) => v === '' || esUrlDelMenu(v) || DATA_URL.test(v), {
        error: 'La imagen debe ser PNG, JPG, WEBP o GIF.',
        abort: true,
    })
    .refine((v) => !DATA_URL.test(v) || bytesDeDataUrl(v) <= MAX_BYTES_IMAGEN, {
        error: 'La imagen no puede superar 2 MB.',
    })
    .optional()

export const crearProductoSchema = z.object({
    nombre: texto('El nombre', 2, 100),
    // Entero en COP (N3): "12000" se acepta como 12000; decimales y negativos no
    precio: z.coerce.number(requerido('El precio'))
        .int({ error: 'El precio debe ser un número entero de pesos (sin decimales)' })
        .min(0, { error: 'El precio no puede ser negativo' }),
    descripcion: textoOpcional('La descripción', 500),
    imagen,
    destacado: booleano('El campo destacado').optional(),
    disponible: booleano('El campo disponible').optional(),
    categoriaId: z.string(requerido('La categoría')).min(1, { error: 'La categoría es requerida' }),
    // 1.3 · Estación propia (null = hereda la de la categoría) y grupos de modificadores en orden
    estacionId: estacionDeProducto,
    gruposModificadoresIds: gruposDeProducto,
})

export const actualizarProductoSchema = crearProductoSchema.partial()