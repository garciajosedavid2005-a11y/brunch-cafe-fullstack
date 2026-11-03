import { z } from 'zod'
import { texto, textoOpcional, booleano, colorHex } from './comunes.js'

export const crearEstadoSchema = z.object({
    nombre: texto('El nombre', 2, 50),
    tipo: z.enum(['pedido', 'reserva'], { error: 'El tipo debe ser "pedido" o "reserva"' }),
    descripcion: textoOpcional('La descripción', 200),
    color: colorHex('El color').optional(),
    bg: colorHex('El color de fondo').optional(),
    badgeType: textoOpcional('El tipo de etiqueta', 20),
    esFinal: booleano('El campo "es final"').optional(),
})

// Al editar, el tipo no se puede cambiar y todos los demás campos son opcionales
export const actualizarEstadoSchema = crearEstadoSchema.omit({ tipo: true }).partial()