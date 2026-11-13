import { z } from 'zod'
import mongoose from 'mongoose'
import { texto, booleano, requerido } from '../compartido/comunes.schema.js'
import { FORMATO_CODIGO } from './estacion.model.js'
import { MAX_OPCIONES, MAX_SELECCION, MAX_RECARGO } from './grupoModificadores.model.js'
import { MAX_GRUPOS_POR_PRODUCTO } from './producto.model.js'

// 1.3 · Estaciones y grupos de modificadores. Solo se aceptan estos campos (Zod descarta el resto:
// la marca de ejemplo y el código de una estación existente no se asignan desde la API). Las
// reglas entre campos del grupo (min ≤ max, max ≤ opciones, obligatorio ⇔ min ≥ 1) están en el
// esquema de Mongoose, que valida el grupo completo también al editar parcialmente.
const entero = (campo, min, max) => z.number(requerido(campo))
    .int({ error: `${campo} debe ser un número entero` })
    .min(min, { error: `${campo} debe ser al menos ${min}` })
    .max(max, { error: `${campo} no puede superar ${max}` })

export const idObjeto = (campo) => z.string(requerido(campo, { femenino: true }))
    .refine(mongoose.isValidObjectId, { error: `${campo} no es válida` })

// ── Estaciones ─────────────────────────────────────────────────────────────────────────
export const crearEstacionSchema = z.object({
    codigo: z.string(requerido('El código'))
        .trim()
        .regex(FORMATO_CODIGO, { error: 'El código va en minúsculas, sin espacios ni tildes (2 a 30 caracteres: letras, números o _)' }),
    nombre: texto('El nombre', 2, 40),
    activa: booleano('Activa').optional(),
    // 2.3 · Umbrales del temporizador del KDS en minutos (F2-4); el aviso va antes que la alerta
    // null = vuelve a los valores por defecto
    umbralAvisoMin: entero('El umbral de aviso', 1, 240).nullable().optional(),
    umbralAlertaMin: entero('El umbral de alerta', 1, 240).nullable().optional(),
})
export const actualizarEstacionSchema = crearEstacionSchema.omit({ codigo: true }).partial()

// ── Grupos de modificadores ────────────────────────────────────────────────────────────
const opcion = z.object({
    id: z.string().refine(mongoose.isValidObjectId, { error: 'La opción no es válida' }).optional(),
    nombre: texto('El nombre de la opción', 1, 40),
    precioExtra: entero('El recargo', 0, MAX_RECARGO).optional(),
    disponible: booleano('Disponible').optional(),
})

export const crearGrupoSchema = z.object({
    nombre: texto('El nombre', 2, 40),
    obligatorio: booleano('Obligatorio'),
    min: entero('El mínimo', 0, MAX_SELECCION),
    max: entero('El máximo', 1, MAX_SELECCION),
    opciones: z.array(opcion, requerido('Las opciones', { femenino: true }))
        .min(1, { error: 'El grupo debe tener al menos una opción' })
        .max(MAX_OPCIONES, { error: `El grupo admite hasta ${MAX_OPCIONES} opciones` }),
    activo: booleano('Activo').optional(),
})
export const actualizarGrupoSchema = crearGrupoSchema.partial()

// ── Asignación en categorías y productos (catalogo:gestionar) ───────────────────────────
export const estacionDeCategoria = idObjeto('La estación').optional()
export const estacionDeProducto = idObjeto('La estación').nullable().optional() // null = hereda
export const gruposDeProducto = z.array(
    z.string(requerido('El grupo')).refine(mongoose.isValidObjectId, { error: 'El grupo de modificadores no es válido' }),
    requerido('Los grupos'),
)
    .max(MAX_GRUPOS_POR_PRODUCTO, { error: `Un producto admite hasta ${MAX_GRUPOS_POR_PRODUCTO} grupos de modificadores` })
    .optional()

// ── Catálogo público ───────────────────────────────────────────────────────────────────
export const consultaCatalogoSchema = z.object({
    incluir: z.literal('modificadores', { error: 'incluir solo admite «modificadores»' }).optional(),
})
