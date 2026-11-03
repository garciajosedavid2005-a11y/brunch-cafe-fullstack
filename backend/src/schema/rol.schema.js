import { z } from 'zod'
import { texto, textoOpcional, requerido } from './comunes.js'

export const crearRolSchema = z.object({
    nombre: texto('El nombre', 2, 50),
    codigo: textoOpcional('El identificador', 50),
    descripcion: textoOpcional('La descripción', 300),
    permisos: z
        .array(z.string(requerido('El permiso')).trim().min(1, { error: 'Un permiso no puede estar vacío' }).max(120, { error: 'Un permiso no puede superar 120 caracteres' }), requerido('Los permisos'))
        .max(20, { error: 'Un rol puede tener máximo 20 permisos' })
        .optional(),
})

// Al editar, el identificador no cambia y todos los demás campos son opcionales
export const actualizarRolSchema = crearRolSchema.omit({ codigo: true }).partial()