import mongoose from 'mongoose'
import { z } from 'zod'
import { booleano, requerido } from '../modulos/compartido/comunes.schema.js'

export const actualizarUsuarioSchema = z
    .object({
        activo: booleano('El campo activo').optional(),
        rolId: z
            .string(requerido('El rol'))
            .refine(mongoose.isValidObjectId, { error: 'El rol seleccionado no es válido' })
            .optional(),
    })
    .strict({ error: 'Solo se pueden cambiar los campos activo y rolId' })
    .refine((datos) => datos.activo !== undefined || datos.rolId !== undefined, {
        error: 'Indica activo o rolId',
    })
