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

const idValido = z.string({ error: 'Cada ítem debe ser un id' }).regex(/^[0-9a-f]{24}$/, { error: 'Algún ítem no es válido' })

export const cobrarSchema = z.object({
    versionEsperada: z.number().int().min(0).optional(),
    propina: enteroCOP('La propina', 0),
    pagos: z.array(pago, { error: 'Indica cómo se paga' })
        .min(1, { error: 'Indica al menos un pago' })
        .max(METODOS_PAGO_CAJA.length, { error: 'Como máximo un pago por método' })
        .refine((ps) => new Set(ps.map((p) => p.metodo)).size === ps.length, { error: 'Como máximo un pago por método' }),
}).strict()

// 3b.2 · Cobrar una parte: lo mismo que el cobro más cómo se divide (F3b-3, F3b-4)
export const cobrarParteSchema = cobrarSchema.extend({
    // Obligatoria: sin ella, un doble envío en partes iguales cobraría dos partes (cada uno toma la siguiente)
    versionEsperada: z.number({ error: 'Falta la versión de la cuenta: recarga la caja' }).int().min(0),
    division: z.discriminatedUnion('modo', [
        z.strictObject({
            modo: z.literal('iguales'),
            partes: z.number({ error: 'Indica en cuántas partes' }).int({ error: 'Las partes deben ser un entero' })
                .min(2, { error: 'Divide en 2 partes o más' }).max(20, { error: 'Como máximo 20 partes' }),
        }),
        z.strictObject({
            modo: z.literal('items'),
            items: z.array(idValido, { error: 'Elige los ítems' }).min(1, { error: 'Elige al menos un ítem' }).max(200, { error: 'Demasiados ítems' })
                .refine((ids) => new Set(ids).size === ids.length, { error: 'Un ítem repetido' }),
        }),
    ], { error: 'Indica cómo se divide: en partes iguales o por ítems' }),
}).strict()
