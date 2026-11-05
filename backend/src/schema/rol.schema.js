import { z } from 'zod'
import { texto, textoOpcional } from './comunes.js'
import { CLAVES, CLAVES_ASIGNABLES } from '../libs/permisos.js'

// Solo claves del catálogo que ya se pueden asignar ("*" y las reservadas no)
const permiso = z.string({ error: 'Cada permiso debe ser un texto' }).superRefine((clave, ctx) => {
    if (CLAVES_ASIGNABLES.includes(clave)) return
    ctx.addIssue({
        code: 'custom',
        message: CLAVES.includes(clave)
            ? `El permiso "${clave}" está reservado para una fase futura y aún no se puede asignar`
            : `El permiso "${clave}" no existe en el catálogo`,
    })
})

export const crearRolSchema = z.object({
    nombre: texto('El nombre', 2, 50),
    codigo: textoOpcional('El identificador', 50),
    descripcion: textoOpcional('La descripción', 300),
    permisos: z
        .array(permiso, { error: 'Los permisos deben ser una lista' })
        .max(CLAVES_ASIGNABLES.length, { error: 'Hay permisos repetidos' })
        .refine((lista) => new Set(lista).size === lista.length, { error: 'Hay permisos repetidos' })
        .optional(),
})

// Al editar, el identificador no cambia y todos los demás campos son opcionales
export const actualizarRolSchema = crearRolSchema.omit({ codigo: true }).partial()
