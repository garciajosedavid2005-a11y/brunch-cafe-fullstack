import mongoose from 'mongoose'

const productoSchema = new mongoose.Schema({
    // Número del producto en el menú original (1, 2, 3...). Los productos nuevos
    // reciben el siguiente número desde el controlador. Permite que los pedidos
    // y comentarios que ya usan ese número sigan funcionando.
    codigo: {
        type: Number,
        min: 1,
        unique: true,
        sparse: true
    },
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
    // Producto destacado (se muestra en la portada)
    destacado: {
        type: Boolean,
        default: false
    },
    // Se relaciona con la categoría a la que pertenece el producto, usando el ObjectId de la categoría
    categoria: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Categoria',
        required: true
    }
}, {
    timestamps: true
})

export default mongoose.model('Producto', productoSchema)