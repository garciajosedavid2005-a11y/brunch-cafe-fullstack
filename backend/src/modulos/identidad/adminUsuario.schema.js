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
        // Cierre · Solo el admin corrige la fecha de nacimiento (el cliente la pone una vez); '' la borra.
        // Limpieza final (Brayan) · Con motivo obligatorio, que es lo único que guarda el Evento junto con el autor
        fechaNacimiento: fechaNacimiento.optional(),
        motivo: z.string({ error: 'El motivo debe ser un texto' }).trim()
            .min(5, { error: 'Escribe el motivo de la corrección (al menos 5 caracteres)' })
            .max(300, { error: 'El motivo no puede superar 300 caracteres' })
            .optional(),
    })
    .strict({ error: 'Solo se pueden cambiar los campos activo, rolId y fechaNacimiento (con su motivo)' })
    .refine((datos) => datos.activo !== undefined || datos.rolId !== undefined || datos.fechaNacimiento !== undefined, {
        error: 'Indica activo, rolId o fechaNacimiento',
    })
    .refine((datos) => datos.fechaNacimiento === undefined || datos.motivo !== undefined, {
        error: 'Escribe el motivo de la corrección de la fecha de nacimiento', path: ['motivo'],
    })
    .refine((datos) => datos.motivo === undefined || datos.fechaNacimiento !== undefined, {
        error: 'El motivo solo acompaña la corrección de la fecha de nacimiento', path: ['motivo'],
    })
