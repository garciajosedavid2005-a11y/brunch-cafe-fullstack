import { z } from 'zod'

// Horarios editables desde el admin (0.8). Solo horas en punto; "desde" ≤ "hasta".
export const HORA_EN_PUNTO = /^([01]\d|2[0-3]):00$/

const horaEnPunto = (campo) => z.string({ error: `${campo} es requerida` })
    .regex(HORA_EN_PUNTO, { error: `${campo} debe ser una hora en punto (HH:00).` })

const rango = (nombre) => z.object({
    desde: horaEnPunto('La primera hora'),
    hasta: horaEnPunto('La última hora'),
}).refine((r) => r.desde <= r.hasta, {
    error: `${nombre}: la primera hora no puede ser posterior a la última.`,
    path: ['hasta'],
})

export const horariosSchema = z.object({
    domicilio: z.object({
        desde: horaEnPunto('La primera hora'),
        hasta: horaEnPunto('La última hora'),
        anticipacionMinutos: z.coerce.number({ error: 'La anticipación es requerida' }).int()
            .min(0, { error: 'La anticipación no puede ser negativa.' })
            .max(480, { error: 'La anticipación no puede superar 8 horas (480 minutos).' }),
    }).refine((r) => r.desde <= r.hasta, {
        error: 'Domicilio: la primera hora no puede ser posterior a la última.',
        path: ['hasta'],
    }),
    reservas: z.object({
        entreSemana: rango('Reservas de lunes a viernes'),
        finDeSemana: rango('Reservas de sábado y domingo'),
    }),
})
