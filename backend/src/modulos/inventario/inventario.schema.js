import { z } from 'zod'
import mongoose from 'mongoose'
import { requerido, texto } from '../compartido/comunes.schema.js'
import { UNIDADES, MAX_CANTIDAD_INVENTARIO, MAX_COSTO_UNITARIO, conDecimales } from './cantidades.js'

// Fase 5 · Entradas del inventario (strict: la existencia, el autor o las fechas nunca llegan del cliente)
export const id = (campo) => z.string(requerido(campo))
    .regex(/^[0-9a-fA-F]{24}$/, { error: `${campo} no es válido` })
    .refine(mongoose.isValidObjectId, { error: `${campo} no es válido` })
    .transform((valor) => valor.toLowerCase())

/** Número con tope y como mucho `decimales` cifras decimales. */
export const cantidad = (campo, { min = 0, max = MAX_CANTIDAD_INVENTARIO, decimales = 3, positiva = false } = {}) =>
    z.number(requerido(campo))
        .refine(Number.isFinite, { error: `${campo} no es válido` })
        .refine(conDecimales(decimales), { error: `${campo} admite como mucho ${decimales} decimales` })
        .refine((v) => (positiva ? v > min : v >= min), { error: `${campo} debe ser ${positiva ? 'mayor que' : 'al menos'} ${min}` })
        .refine((v) => v <= max, { error: `${campo} no puede superar ${max}` })

export const motivoObligatorio = texto('El motivo', 3, 300)
const versionEsperada = z.number(requerido('La versión', { femenino: true })).int().min(0)

const unidad = z.enum(UNIDADES, { error: 'La unidad debe ser g, ml o unidad' })
const nombre = texto('El nombre', 2, 60)
const costo = cantidad('El costo promedio', { max: MAX_COSTO_UNITARIO, decimales: 2 })

export const crearInsumoSchema = z.strictObject({
    nombre,
    unidad,
    minimo: cantidad('El mínimo').optional(),
    costoPromedio: costo.optional(),
    // Existencia con la que empieza: queda como movimiento «inicial» (la existencia solo cambia con movimientos)
    existenciaInicial: cantidad('La existencia inicial').optional(),
})

export const editarInsumoSchema = z.strictObject({
    nombre: nombre.optional(),
    unidad: unidad.optional(),
    minimo: cantidad('El mínimo').optional(),
    costoPromedio: costo.optional(),
    activo: z.boolean({ error: 'Activo debe ser verdadero o falso' }).optional(),
    // Obligatoria: un PUT sin versión pisaría en silencio la edición de otra persona
    versionEsperada,
})
