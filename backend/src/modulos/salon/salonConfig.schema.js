import { z } from 'zod'
import mongoose from 'mongoose'
import { texto, textoOpcional, booleano, requerido } from '../compartido/comunes.schema.js'
import { CAPACIDAD_MAXIMA, NUMERO_MAXIMO } from './mesa.model.js'

// 1.2 · Configuración del salón. Solo se aceptan estos campos: el estado de la mesa y la
// marca de ejemplo no se asignan desde aquí (Zod descarta las claves desconocidas).
const entero = (campo, min, max) => z.number(requerido(campo))
    .int({ error: `${campo} debe ser un número entero` })
    .min(min, { error: `${campo} debe ser al menos ${min}` })
    .max(max, { error: `${campo} no puede superar ${max}` })

const idDeZona = z.string(requerido('La zona', { femenino: true }))
    .refine(mongoose.isValidObjectId, { error: 'La zona no es válida' })

export const crearZonaSchema = z.object({
    nombre: texto('El nombre', 2, 40),
    orden: entero('El orden', 0, 999).optional(),
    activa: booleano('Activa').optional(),
})
export const actualizarZonaSchema = crearZonaSchema.partial()

export const crearMesaSchema = z.object({
    numero: entero('El número', 1, NUMERO_MAXIMO),
    nombre: textoOpcional('El nombre', 40),
    zona: idDeZona,
    capacidad: entero('La capacidad', 1, CAPACIDAD_MAXIMA),
    combinable: booleano('Combinable').optional(),
    activa: booleano('Activa').optional(),
    posicion: z.object({ x: entero('La posición x', 0, 100), y: entero('La posición y', 0, 100) }).nullable().optional(),
})
export const actualizarMesaSchema = crearMesaSchema.partial()
