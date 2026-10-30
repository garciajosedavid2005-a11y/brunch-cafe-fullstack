import { z } from 'zod'

export const crearComentarioSchema = z.object({
    calificacion: z.number({
        error: "La calificación es requerida"
    }).int().min(1, {
        message: "La calificación mínima es 1"
    }).max(5, {
        message: "La calificación máxima es 5"
    }),
    descripcion: z.string({
        error: "El comentario es requerido"
    }).trim().min(10, {
        message: "El comentario debe tener al menos 10 caracteres"
    }).max(300, {
        message: "El comentario no puede superar 300 caracteres"
    })
})