import { z } from 'zod'

export const registroSchema = z.object({
    nombre: z.string({
        required_error: "El nombre es requerido"
    }),
    apellido: z.string({
        required_error: "El apellido es requerido"
    }),
    correo: z.string({
        required_error: "El correo es requerido"
    }).email({
        message: "Correo invalido"
    }),
    contraseña: z.string({
        required_error: "La contraseña es requerida"
    }).min(6, {
        message: "La contraseña debe tener al menos 6 caracteres"
    }),
    telefono: z.string().optional()
})

export const loginSchema = z.object({
    correo: z.string({
        required_error: "El correo es requerido"
    }).email({
        message: "Correo invalido"
    }),
    contraseña: z.string({
        required_error: "La contraseña es requerida"
    }).min(6, {
        message: "La contraseña debe tener al menos 6 caracteres"
    })
})