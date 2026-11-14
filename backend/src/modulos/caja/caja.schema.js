import { z } from 'zod'
import { METODOS_PAGO_CAJA } from './comprobante.model.js'

// Fase 3 · Cuerpo del cobro (estricto: montos en COP enteros; la cuenta, los totales y el cajero los pone
// el servidor). Pago mixto: hasta un pago por método. `recibido` solo en efectivo (para el cambio).
const MAXIMO = 100_000_000
const enteroCOP = (campo, minimo) => z.number({ error: `${campo} debe ser un número` })
    .int({ error: `${campo} debe ser un entero en COP` })
    .min(minimo, { error: `${campo} debe ser al menos ${minimo}` })
    .max(MAXIMO, { error: `${campo} es demasiado alto` })

const pago = z.object({
    metodo: z.enum(METODOS_PAGO_CAJA, { error: 'El método de pago debe ser efectivo, tarjeta o transferencia' }),
    monto: enteroCOP('El monto', 1),
    recibido: enteroCOP('Lo recibido', 0).optional(),
}).strict()
    .refine((p) => p.metodo === 'efectivo' || p.recibido === undefined, { error: 'Lo recibido solo se indica en efectivo', path: ['recibido'] })

export const cobrarSchema = z.object({
    versionEsperada: z.number().int().min(0).optional(),
    propina: enteroCOP('La propina', 0),
    pagos: z.array(pago, { error: 'Indica cómo se paga' })
        .min(1, { error: 'Indica al menos un pago' })
        .max(METODOS_PAGO_CAJA.length, { error: 'Como máximo un pago por método' })
        .refine((ps) => new Set(ps.map((p) => p.metodo)).size === ps.length, { error: 'Como máximo un pago por método' }),
}).strict()
