import mongoose from 'mongoose'
import { UNIDADES, MAX_CANTIDAD_INVENTARIO, MAX_COSTO_UNITARIO, conDecimales } from './cantidades.js'

// Fase 5 · 5.1 (F5-1) · Insumo del inventario: café en grano (g), leche entera (ml), aguacate (unidad).
// - La existencia SOLO cambia con movimientos (movimiento.model.js), en la misma transacción que el movimiento
//   y con una escritura atómica; la edición del insumo no la toca. Puede quedar negativa (F5-d: el descuento no
//   bloquea la ronda; el conteo se corrige con un ajuste).
// - costoPromedio: COP por unidad de medida (2 decimales); lo recalcula cada recepción (5.4).
// - No se borra: se desactiva (las recetas y los movimientos lo siguen referenciando).
// Concurrencia optimista (__v) para las ediciones del admin (dos ediciones de la misma versión no se pisan).
export const COLACION_INSUMO = { locale: 'es', strength: 1 }
const tresDecimales = { validator: conDecimales(3), message: 'Usa como mucho 3 decimales' }

const insumoSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, minlength: 2, maxlength: 60 },
    unidad: { type: String, required: true, enum: UNIDADES },
    existencia: { type: Number, required: true, default: 0, min: -MAX_CANTIDAD_INVENTARIO, max: MAX_CANTIDAD_INVENTARIO, validate: tresDecimales },
    minimo: { type: Number, required: true, default: 0, min: 0, max: MAX_CANTIDAD_INVENTARIO, validate: tresDecimales },
    costoPromedio: {
        type: Number, required: true, default: 0, min: 0, max: MAX_COSTO_UNITARIO,
        validate: { validator: conDecimales(2), message: 'El costo admite como mucho 2 decimales' },
    },
    activo: { type: Boolean, required: true, default: true },
}, { timestamps: true, optimisticConcurrency: true, collection: 'insumos' })

// Nombre único sin distinguir mayúsculas ni tildes («Café» = «cafe»)
insumoSchema.index({ nombre: 1 }, { unique: true, collation: COLACION_INSUMO, name: 'nombre_unico' })

export default mongoose.model('Insumo', insumoSchema)
