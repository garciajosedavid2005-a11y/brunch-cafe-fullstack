import { z } from 'zod'
import { requerido } from './comunes.js'

export const cambiarEstadoPedidoSchema = z.object({
    estado: z.string(requerido('El estado')).min(1, { error: 'El estado es requerido' }),
})