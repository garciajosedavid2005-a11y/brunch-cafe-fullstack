import mongoose from 'mongoose'

// Contadores atómicos (colección "counters"): { _id: 'producto', seq: 24 }
const contadorSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0, min: 0 },
}, { versionKey: false })

export default mongoose.model('Contador', contadorSchema, 'counters')
