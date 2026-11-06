import mongoose from 'mongoose'

// Respuestas guardadas por Idempotency-Key (0.9). Una clave es de un usuario y una ruta;
// se borra sola a las 24 h (índice TTL sobre createdAt).
const solicitudIdempotenteSchema = new mongoose.Schema({
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    clave: { type: String, required: true },
    ruta: { type: String, required: true },
    // sha256 de método + ruta + cuerpo: la misma clave con otros datos se rechaza
    huella: { type: String, required: true },
    estado: { type: String, enum: ['en_proceso', 'completada'], default: 'en_proceso' },
    status: { type: Number },
    cuerpo: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
}, { versionKey: false, collection: 'solicitudes_idempotentes' })

solicitudIdempotenteSchema.index({ usuario: 1, clave: 1 }, { unique: true })

export default mongoose.model('SolicitudIdempotente', solicitudIdempotenteSchema)
