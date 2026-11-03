import { z } from 'zod'

export const actualizarPerfilSchema = z.object({
    nombre: z.string().trim().min(1).max(60),
    apellido: z.string().trim().min(1).max(60),
    correo: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
    telefono: z.string().trim().max(30).optional(),
})
