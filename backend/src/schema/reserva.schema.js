import { z } from 'zod'

export const crearReservaSchema = z.object({
    cantidadPersonas: z.number({
        required_error: "La cantidad de personas es requerida"
    }).int().min(1, {
        message: "Debe ser al menos 1 persona"
    }),
    fecha: z.coerce.date({
        required_error: "La fecha es requerida"
    }),
    hora: z.string({
        required_error: "La hora es requerida"
    })
})