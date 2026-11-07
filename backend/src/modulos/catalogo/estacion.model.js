import mongoose from 'mongoose'

// Estación de preparación (1.3, F1-3): Cocina y Barra. Cada producto va a la estación de su
// categoría salvo que tenga una propia (ver estaciones.js). El KDS de la Fase 2 enruta por `codigo`,
// por eso es inmutable. Una estación en uso no se borra ni se desactiva (409 ESTACION_EN_USO).
export const FORMATO_CODIGO = /^[a-z][a-z0-9_]{1,29}$/
export const COLACION_NOMBRE = { locale: 'es', strength: 1 }

const estacionSchema = new mongoose.Schema({
    codigo: { type: String, required: true, immutable: true, match: FORMATO_CODIGO },
    nombre: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    activa: { type: Boolean, required: true, default: true },
}, { timestamps: true, collection: 'estaciones' })

estacionSchema.index({ codigo: 1 }, { unique: true })
// Nombre único sin distinguir mayúsculas ni tildes («Barra» = «barra»)
estacionSchema.index({ nombre: 1 }, { unique: true, collation: COLACION_NOMBRE })

export default mongoose.model('Estacion', estacionSchema)
