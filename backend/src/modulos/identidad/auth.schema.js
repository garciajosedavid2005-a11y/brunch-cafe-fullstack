import { z } from 'zod'
import { requerido, texto } from '../compartido/comunes.schema.js'

// Correo normalizado: sin espacios y en minúsculas (N2)
export const correo = z
    .string(requerido('El correo'))
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Correo inválido' }))
    .refine((valor) => valor.length <= 254, { error: 'El correo no puede superar 254 caracteres' })

export const registroSchema = z.object({
    nombre: texto('El nombre', 1, 60),
    apellido: texto('El apellido', 1, 60),
    correo,
    contraseña: z
        .string(requerido('La contraseña', { femenino: true }))
        .min(6, { error: 'La contraseña debe tener al menos 6 caracteres' })
        .max(128, { error: 'La contraseña no puede superar 128 caracteres' }),
    telefono: z.string(requerido('El teléfono')).trim().max(30, { error: 'El teléfono no puede superar 30 caracteres' }).optional(),
})

export const loginSchema = z.object({
    correo,
    contraseña: z
        .string(requerido('La contraseña', { femenino: true }))
        .min(1, { error: 'La contraseña es requerida' })
        .max(128, { error: 'La contraseña no puede superar 128 caracteres' }),
})

export const solicitarRecuperacionSchema = z.object({ correo })

export const restablecerContrasenaSchema = z.object({
    token: z.string().regex(/^[a-f0-9]{64}$/i, { error: 'El enlace de recuperación no es válido.' }),
    nueva: z.string(requerido('La contraseña', { femenino: true }))
        .min(6, { error: 'La contraseña nueva debe tener al menos 6 caracteres' })
        .max(128, { error: 'La contraseña nueva no puede superar 128 caracteres' }),
})
