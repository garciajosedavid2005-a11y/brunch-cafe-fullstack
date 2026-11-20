import { z } from 'zod'
import { esTelefono, MENSAJE_TELEFONO } from '../compartido/comunes.schema.js'
import { esDireccionValida, MENSAJE_DIRECCION, normalizarDireccion } from '../compartido/direccion.js'
import { MAX_TEXTO_PERFIL } from './usuario.model.js'
import { fechaLocal } from '../compartido/fechas.js'

// 6.4 · Fecha de nacimiento «AAAA-MM-DD» (un día del calendario) → Date a las 00:00 UTC; '' la borra (null). Entre
// 1900-01-01 y hoy; una fecha imposible (30 de febrero) se rechaza
export const fechaNacimiento = z.string({ error: 'Ingresa la fecha de nacimiento' }).trim()
    .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), { error: 'Ingresa la fecha como AAAA-MM-DD' })
    .transform((v, ctx) => {
        if (v === '') return null
        const fecha = new Date(`${v}T00:00:00.000Z`)
        if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== v) {
            ctx.addIssue({ code: 'custom', message: 'Esa fecha no existe' })
            return z.NEVER
        }
        if (v < '1900-01-01' || v > fechaLocal()) { // «hoy» es el de Bogotá
            ctx.addIssue({ code: 'custom', message: 'Ingresa una fecha de nacimiento entre 1900 y hoy' })
            return z.NEVER
        }
        return fecha
    })
const textoPerfil = (campo) => z.string({ error: `${campo} debe ser un texto` }).trim()
    .max(MAX_TEXTO_PERFIL, { error: `${campo} no pueden superar ${MAX_TEXTO_PERFIL} caracteres` })

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
    // 6.4 · Opcionales: omitidos = se conservan; '' = se borran
    fechaNacimiento: fechaNacimiento.optional(),
    alergias: textoPerfil('Las alergias').optional(),
    preferencias: textoPerfil('Las preferencias').optional(),
})

// 6.4 (F6-g) · Una dirección de la libreta: las mismas reglas del domicilio (compartido/direccion.js y el barrio del
// pedido). La principal se elige con su propia ruta (no por asignación en el cuerpo)
const camposDireccion = {
    etiqueta: z.string({ error: 'La etiqueta debe ser un texto' }).trim().max(30, { error: 'La etiqueta no puede superar 30 caracteres' }),
    direccion: z.string({ error: 'Ingresa la dirección' }).max(200).transform(normalizarDireccion).refine(esDireccionValida, { error: MENSAJE_DIRECCION }),
    barrio: z.string({ error: 'Ingresa el barrio' }).trim().min(3, { error: 'El barrio debe tener al menos 3 caracteres' }).max(40, { error: 'El barrio no puede superar 40 caracteres' }),
    indicaciones: z.string({ error: 'Las indicaciones deben ser un texto' }).trim().max(120, { error: 'Las indicaciones no pueden superar 120 caracteres' }),
}
export const direccionSchema = z.strictObject({
    ...camposDireccion,
    etiqueta: camposDireccion.etiqueta.default(''),
    indicaciones: camposDireccion.indicaciones.default(''),
})
// PATCH: solo lo que se envía (sin valores por defecto que borren lo guardado); al menos un campo
export const cambioDireccionSchema = z.strictObject(camposDireccion).partial()
    .refine((d) => Object.keys(d).length > 0, { error: 'Indica qué quieres cambiar de la dirección' })

export const contrasenaSchema = z.object({
    actual: z.string({ error: 'Ingresa la contraseña actual' }).min(1, { error: 'Ingresa la contraseña actual' }),
    // Mismo mínimo que el registro
    nueva: z.string({ error: 'Ingresa la contraseña nueva' }).min(6, { error: 'La contraseña nueva debe tener al menos 6 caracteres' }),
})
