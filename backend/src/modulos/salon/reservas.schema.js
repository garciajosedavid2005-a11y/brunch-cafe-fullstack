import { z } from 'zod'
import { esFechaValida } from '../../libs/fechas.js'

// Datos de una reserva del cliente: mismas reglas para /api/v1 y los alias. 0.8.
export const reservaSchema = z.object({
    nombre: z.string().trim().min(3).max(120),
    correo: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    motivo: z.string().trim().min(3).max(120),
    personas: z.coerce.number().int().min(1).max(20),
    fecha: z.string().refine(esFechaValida, { error: 'Fecha inválida (AAAA-MM-DD).' }),
    hora: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'Hora inválida (HH:mm).' }),
    observaciones: z.string().trim().max(200).default(''),
})

// Alias antiguo POST /api/reservas: usa `cantidadPersonas` en vez de `personas`
export const desdeLegado = ({ cantidadPersonas, ...resto } = {}) => ({ ...resto, personas: cantidadPersonas })
