import { z } from 'zod'
import { texto, textoOpcional, colorHex } from '../modulos/compartido/comunes.schema.js'

// Solo la presentación es editable; codigo, tipo y esFinal los fija el catálogo
export const actualizarEstadoSchema = z.strictObject({
    nombre: texto('El nombre', 2, 50).optional(),
    descripcion: textoOpcional('La descripción', 200),
    color: colorHex('El color').optional(),
    bg: colorHex('El color de fondo').optional(),
    badgeType: z.enum(['warning', 'info', 'success', 'danger', 'neutral'], {
        error: 'El tipo de etiqueta no es válido',
    }).optional(),
}, { error: (iss) => (iss.code === 'unrecognized_keys' ? `Campo no editable: ${iss.keys.join(', ')}` : undefined) })
