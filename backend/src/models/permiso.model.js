import mongoose from 'mongoose'

// Reflejo en BD del catálogo de src/libs/permisos.js (lo mantiene el seed)
const permisoSchema = new mongoose.Schema({
    clave: { type: String, required: true, unique: true, trim: true },
    modulo: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: '' },
    reservado: { type: Boolean, default: false },
}, {
    timestamps: true,
})

export default mongoose.model('Permiso', permisoSchema)
