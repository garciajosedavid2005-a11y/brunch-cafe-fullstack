import mongoose from 'mongoose'

const productoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    precio: {
        type: Number,
        required: true,
        min: 0
    },
    descripcion: {
        type: String,
        trim: true
    },
    imagen: {
        type: String
    },
    //Se relaciona con la categoría a la que pertenece el producto, usando el ObjectId de la categoría
    categoria: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categoria',
        required: true
    }
}, {
    timestamps: true
})

export default mongoose.model('Producto', productoSchema)