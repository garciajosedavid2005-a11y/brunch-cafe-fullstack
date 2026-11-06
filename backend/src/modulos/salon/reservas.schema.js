import { z } from 'zod'
import { esFechaValida } from '../compartido/fechas.js'
import { telefono } from '../compartido/comunes.schema.js'

// Datos de una reserva del cliente: mismas reglas para /api/v1 y los alias. 0.8.
export const reservaSchema = z.object({
    nombre: z.string().trim().min(3).max(120),
    correo: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    // Contacto de la reserva (obligatorio; el formulario lo prellena con el del perfil)
    telefono: telefono(),
    motivo: z.string().trim().min(3).max(120),
    personas: z.coerce.number().int().min(1).max(20),
    fecha: z.string().refine(esFechaValida, { error: 'Fecha inválida (AAAA-MM-DD).' }),
    // Solo horas en punto; el rango del día lo da la configuración de horarios
    hora: z.string().regex(/^([01]\d|2[0-3]):00$/, { error: 'Elige una hora en punto (HH:00).' }),
    observaciones: z.string().trim().max(200).default(''),
})

// Reserva que registra el personal para un cliente (0.15e): nombre y teléfono obligatorios,
// correo opcional (vacío o ausente); si viene, debe ser válido
export const reservaStaffSchema = reservaSchema.extend({
    correo: z.string().trim().toLowerCase().pipe(z.union([z.literal(''), z.email().max(254)])).optional(),
})
