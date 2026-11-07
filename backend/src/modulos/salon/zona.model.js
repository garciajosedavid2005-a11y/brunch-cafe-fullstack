import mongoose from 'mongoose'

// Zona del salón (1.2, F1-1): Interior, Terraza… Se edita en Admin › Salón.
// Una zona con mesas no se borra: se desactiva (y solo si todas sus mesas están libres).
const zonaSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    // Orden de las pestañas del plano (1.6)
    orden: {
        type: Number,
        required: true,
        default: 0,
        min: 0,
        validate: { validator: Number.isInteger, message: 'El orden debe ser un número entero' },
    },
    activa: { type: Boolean, required: true, default: true },
    // Datos de ejemplo del seed (F1-1): el admin los reemplaza por los reales
    ejemplo: { type: Boolean, required: true, default: false },
}, { timestamps: true })

// Nombre único sin distinguir mayúsculas ni tildes («Salón» = «salon»)
export const COLACION_NOMBRE = { locale: 'es', strength: 1 }
zonaSchema.index({ nombre: 1 }, { unique: true, collation: COLACION_NOMBRE })
zonaSchema.index({ orden: 1, nombre: 1 })

export default mongoose.model('Zona', zonaSchema)
