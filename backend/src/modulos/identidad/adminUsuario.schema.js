import mongoose from 'mongoose'
import { z } from 'zod'
import { booleano, requerido, texto, esTelefono, MENSAJE_TELEFONO } from '../compartido/comunes.schema.js'
import { correo } from './auth.schema.js'
import { fechaNacimiento } from './perfil.schema.js'

// 1.5b · Alta desde el admin: sin contraseña (se define con el enlace) ni otros campos
export const crearUsuarioSchema = z.strictObject({
    nombre: texto('El nombre', 1, 60),
    apellido: texto('El apellido', 1, 60),
    correo,
    telefono: z.string(requerido('El teléfono')).trim()
        .refine((v) => v === '' || esTelefono(v), { error: MENSAJE_TELEFONO })
        .optional(),
    rolId: z.string(requerido('El rol')).refine(mongoose.isValidObjectId, { error: 'El rol seleccionado no es válido' }),
}, { error: 'Solo se aceptan nombre, apellido, correo, teléfono y rol' })

export const actualizarUsuarioSchema = z
    .object({
        activo: booleano('El campo activo').optional(),
        rolId: z
            .string(requerido('El rol'))
            .refine(mongoose.isValidObjectId, { error: 'El rol seleccionado no es válido' })
            .optional(),
        // Cierre · Solo el admin corrige la fecha de nacimiento (el cliente la pone una vez); '' la borra
        fechaNacimiento: fechaNacimiento.optional(),
    })
    .strict({ error: 'Solo se pueden cambiar los campos activo, rolId y fechaNacimiento' })
    .refine((datos) => datos.activo !== undefined || datos.rolId !== undefined || datos.fechaNacimiento !== undefined, {
        error: 'Indica activo, rolId o fechaNacimiento',
    })
