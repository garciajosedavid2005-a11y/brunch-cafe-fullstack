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
    }
}, {
    timestamps: true
})

export default mongoose.model('Categoria', categoriaSchema)