import mongoose from 'mongoose'

const categoriaSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    descripcion: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ''
    },
    // Estación por defecto de sus productos (1.3, F1-3: bebidas → Barra, el resto → Cocina).
    // Obligatoria al crear (también fuera de la API); las categorías anteriores a 1.3 siguen siendo
    // válidas sin ella hasta que migrate:1.3 se la asigna. Tras aplicarla en todos los entornos,
    // puede pasar a required: true.
    estacion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Estacion',
        required: [function () { return this.isNew }, 'La estación es requerida']
    }
}, {
    timestamps: true
})

categoriaSchema.index({ estacion: 1 }) // «¿está en uso esta estación?»

export default mongoose.model('Categoria', categoriaSchema)