import { z } from 'zod'
import { esTelefono, MENSAJE_TELEFONO } from '../../schema/comunes.js'

// Mismas reglas para todas las rutas de perfil (v1 y alias). 0.8.
// Teléfono opcional en el perfil: omitido = se conserva; '' = se borra; si viene, la misma
// validación que en pedidos y reservas (donde sí es obligatorio).

export const perfilSchema = z.object({
    nombre: z.string({ error: 'El nombre es requerido' }).trim().min(1, { error: 'El nombre es requerido' }).max(60),
    apellido: z.string({ error: 'El apellido es requerido' }).trim().min(1, { error: 'El apellido es requerido' }).max(60),
    correo: z.string({ error: 'El correo es requerido' }).trim().toLowerCase()
        .pipe(z.email({ error: 'Ingresa un correo válido' }).max(254)),
    telefono: z.string().trim()
        .refine((v) => v === '' || esTelefono(v), { error: MENSAJE_TELEFONO })
        .optional(),
})

export const contrasenaSchema = z.object({
    actual: z.string({ error: 'Ingresa la contraseña actual' }).min(1, { error: 'Ingresa la contraseña actual' }),
    // Mismo mínimo que el registro
    nueva: z.string({ error: 'Ingresa la contraseña nueva' }).min(6, { error: 'La contraseña nueva debe tener al menos 6 caracteres' }),
})
