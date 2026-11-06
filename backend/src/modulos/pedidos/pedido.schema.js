import { z } from 'zod'
import { CODIGOS_ESTADO } from '../compartido/estados.js'
import { esFechaValida } from '../compartido/fechas.js'

// El cambio de estado de pedidos usa el esquema común (codigo | estado, motivo)
export { cambioEstadoSchema as cambiarEstadoPedidoSchema } from '../compartido/cambioEstado.schema.js'

const CODIGOS_PEDIDO = CODIGOS_ESTADO.pedido

// Filtros del listado del staff (0.13), todos opcionales: sin ellos responde como antes
export const filtrosPedidosSchema = z.object({
    estado: z.string().trim()
        .transform((v) => v.split(',').map((c) => c.trim()).filter(Boolean))
        .refine((codigos) => codigos.length > 0 && codigos.every((c) => CODIGOS_PEDIDO.includes(c)), {
            error: `Estado inválido. Válidos: ${CODIGOS_PEDIDO.join(', ')}.`,
        })
        .optional(),
    fecha: z.string().refine(esFechaValida, { error: 'Fecha inválida (AAAA-MM-DD, día de Bogotá).' }).optional(),
    limite: z.coerce.number({ error: 'El límite debe ser un número' }).int()
        .min(1, { error: 'El límite debe estar entre 1 y 200.' })
        .max(200, { error: 'El límite debe estar entre 1 y 200.' })
        .optional(),
})

// Cancelación por el staff (0.13): motivo obligatorio
export const cancelacionStaffSchema = z.object({
    motivo: z.string({ error: 'El motivo es requerido' }).trim()
        .min(3, { error: 'El motivo debe tener al menos 3 caracteres' })
        .max(300, { error: 'El motivo no puede superar 300 caracteres' }),
})
