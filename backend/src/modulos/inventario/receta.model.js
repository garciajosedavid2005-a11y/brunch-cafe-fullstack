import mongoose from 'mongoose'
import { MAX_CANTIDAD_INVENTARIO, conDecimales } from './cantidades.js'

// Fase 5 · 5.2 (F5-2) · Recetas. Dos tipos en la misma colección:
//   producto  insumos por unidad vendida, con su % de merma (huevos pericos: 2 huevos, 10 g de mantequilla…)
//   opcion    lo que cambia una opción de un modificador: SUMA insumos (Extras › Tocineta: +40 g) o REEMPLAZA uno
//             de la receta del producto (Leche › Almendra: 200 ml de leche de almendra en lugar de la entera)
// Consumo de un ítem = (receta del producto, quitando los insumos que reemplazan sus opciones, + las líneas de
// sus opciones) × (1 + merma/100) × cantidad. Sin receta, el producto no descuenta inventario.
export const TIPOS_RECETA = ['producto', 'opcion']
export const MAX_LINEAS_RECETA = 30
export const MAX_MERMA = 100

const lineaSchema = new mongoose.Schema({
    insumo: { type: mongoose.Schema.Types.ObjectId, ref: 'Insumo', required: true },
    cantidad: {
        type: Number, required: true, min: 0.001, max: MAX_CANTIDAD_INVENTARIO,
        validate: { validator: conDecimales(3), message: 'La cantidad admite como mucho 3 decimales' },
    },
    merma: {
        type: Number, required: true, default: 0, min: 0, max: MAX_MERMA,
        validate: { validator: conDecimales(1), message: 'La merma admite como mucho 1 decimal' },
    },
    // Solo en las opciones: insumo de la receta del producto que esta línea reemplaza (null = suma)
    reemplaza: { type: mongoose.Schema.Types.ObjectId, ref: 'Insumo', default: null },
}, { _id: false })

const recetaSchema = new mongoose.Schema({
    tipo: { type: String, required: true, enum: TIPOS_RECETA },
    producto: { type: mongoose.Schema.Types.ObjectId, ref: 'Producto', default: null },
    grupo: { type: mongoose.Schema.Types.ObjectId, ref: 'GrupoModificadores', default: null },
    opcion: { type: mongoose.Schema.Types.ObjectId, default: null },
    lineas: {
        type: [lineaSchema],
        default: [],
        validate: [
            { validator: (v) => v.length <= MAX_LINEAS_RECETA, message: `Una receta admite hasta ${MAX_LINEAS_RECETA} insumos` },
            { validator: (v) => new Set(v.map((l) => String(l.insumo))).size === v.length, message: 'Hay insumos repetidos en la receta' },
        ],
    },
}, { timestamps: true, optimisticConcurrency: true, collection: 'recetas' })

recetaSchema.pre('validate', function () {
    if (this.tipo === 'producto' && (!this.producto || this.grupo || this.opcion)) this.invalidate('producto', 'La receta de un producto lleva solo el producto')
    if (this.tipo === 'opcion' && (this.producto || !this.grupo || !this.opcion)) this.invalidate('opcion', 'La receta de una opción lleva su grupo y su opción')
    if (this.tipo === 'producto' && this.lineas.some((l) => l.reemplaza)) this.invalidate('lineas', 'Solo las opciones reemplazan insumos')
    if (this.lineas.some((l) => l.reemplaza && String(l.reemplaza) === String(l.insumo))) this.invalidate('lineas', 'Un insumo no se reemplaza a sí mismo')
})

// Una receta por producto y una por opción (índices únicos parciales)
recetaSchema.index({ producto: 1 }, { unique: true, name: 'una_por_producto', partialFilterExpression: { tipo: 'producto' } })
recetaSchema.index({ grupo: 1, opcion: 1 }, { unique: true, name: 'una_por_opcion', partialFilterExpression: { tipo: 'opcion' } })
recetaSchema.index({ 'lineas.insumo': 1 }) // qué recetas usan un insumo (agotado automático, 5.3)

export default mongoose.model('Receta', recetaSchema)
