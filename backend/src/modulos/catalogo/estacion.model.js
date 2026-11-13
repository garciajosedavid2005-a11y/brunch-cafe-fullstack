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
    // 2.3 · Umbrales del temporizador del KDS en minutos (F2-4): aviso y alerta. null = los de
    // umbralesDe (Barra 5/10, el resto 12/20), así las estaciones existentes no necesitan migración
    umbralAvisoMin: { type: Number, default: null, min: 1, max: 240, validate: { validator: (v) => v === null || Number.isInteger(v), message: 'El umbral debe ser un número entero de minutos' } },
    umbralAlertaMin: { type: Number, default: null, min: 1, max: 240, validate: { validator: (v) => v === null || Number.isInteger(v), message: 'El umbral debe ser un número entero de minutos' } },
}, { timestamps: true, collection: 'estaciones' })

// F2-4: Barra 5/10 min y Cocina (y cualquier otra) 12/20 por defecto
export const UMBRALES_POR_DEFECTO = { barra: { aviso: 5, alerta: 10 }, otra: { aviso: 12, alerta: 20 } }
export const umbralesDe = (estacion) => {
    const base = UMBRALES_POR_DEFECTO[estacion?.codigo === 'barra' ? 'barra' : 'otra']
    return { umbralAvisoMin: estacion?.umbralAvisoMin ?? base.aviso, umbralAlertaMin: estacion?.umbralAlertaMin ?? base.alerta }
}

estacionSchema.index({ codigo: 1 }, { unique: true })
// Nombre único sin distinguir mayúsculas ni tildes («Barra» = «barra»)
estacionSchema.index({ nombre: 1 }, { unique: true, collation: COLACION_NOMBRE })

export default mongoose.model('Estacion', estacionSchema)
