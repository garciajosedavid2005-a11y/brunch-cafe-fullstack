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
        // 4.2 · Aforo (personas por hora). Ausente = se conserva el guardado (clientes anteriores a la Fase 4)
        aforo: z.object({
            general: z.number({ error: 'El aforo general debe ser un número.' }).int({ error: 'El aforo general debe ser un número entero.' })
                .min(1, { error: 'El aforo general debe ser al menos 1 persona (vacío = sin límite).' })
                .max(500, { error: 'El aforo general no puede superar 500 personas.' }).nullable(),
            porHora: z.array(z.object({
                hora: horaEnPunto('La hora del aforo'),
                maximo: z.number({ error: 'El aforo de la hora debe ser un número.' }).int({ error: 'El aforo de la hora debe ser un número entero.' })
                    .min(0, { error: 'El aforo de una hora no puede ser negativo.' })
                    .max(500, { error: 'El aforo de una hora no puede superar 500 personas.' }),
            }).strict()).max(24).refine((horas) => new Set(horas.map((h) => h.hora)).size === horas.length, { error: 'Cada hora del aforo aparece una sola vez.' }),
        }).strict().optional(),
        // 4.6 · Minutos antes de una reserva con mesa desde los que la mesa queda apartada. Ausente = se conserva
        apartarMesaMin: z.number({ error: 'Los minutos para apartar la mesa deben ser un número.' })
            .int({ error: 'Los minutos para apartar la mesa deben ser un número entero.' })
            .min(15, { error: 'La mesa se aparta al menos 15 minutos antes de la reserva.' })
            .max(240, { error: 'La mesa se aparta como máximo 240 minutos (4 horas) antes de la reserva.' }).optional(),
    }),
    // 1.15 · La versión que leyó el admin (GET /admin/horarios): si otro guardó antes → 409
    versionEsperada: z.number({ error: 'Falta la versión de los horarios; recarga la página.' }).int().min(0),
})
