import { z } from 'zod'
import { textoOpcional } from '../compartido/comunes.schema.js'
import { ESTADOS_ITEM } from '../compartido/estadosSalon.js'

// 2.2 · Entradas de la cocina y del servir (strict: los tiempos, quién y la estación nunca llegan del cliente)
const DESTINOS = ['en_preparacion', 'listo', 'servido']

export const cambioEstadoItemSchema = z.strictObject({
    a: z.enum(DESTINOS, { error: 'El estado debe ser en_preparacion, listo o servido' }),
    // Estado que la pantalla vio (obligatorio): si otro ya lo movió → 409 ITEM_MODIFICADO. Sin él,
    // «Empezar» sobre un ítem que ya está listo se confundiría con «Deshacer»
    de: z.enum(ESTADOS_ITEM, { error: 'Indica el estado que ves en pantalla (de)' }),
    // Solo para «Deshacer» pasados los 10 s (admin)
    motivo: textoOpcional('El motivo', 300),
})

export const todoListoSchema = z.strictObject({
    estacion: z.string({ error: 'Indica la estación' }).trim().toLowerCase()
        .min(1, { error: 'Indica la estación' }).max(30, { error: 'La estación no es válida' }),
})
