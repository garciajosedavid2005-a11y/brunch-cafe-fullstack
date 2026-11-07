import mongoose from 'mongoose'

export const MAX_GRUPOS_POR_PRODUCTO = 10

const productoSchema = new mongoose.Schema({
    // Número del producto en el menú original (1, 2, 3...). Los productos nuevos
    // reciben el siguiente número del contador atómico "producto" (colección counters). Permite que los pedidos
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
    // false = agotado: no sale en el catálogo ni se puede pedir (el admin lo ve igual).
    // Los productos anteriores a este campo se leen como disponibles (default).
    disponible: {
        type: Boolean,
        default: true
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
    },
    // 1.3 · Estación propia (sobrescribe la de la categoría); null = la hereda. Ver estaciones.js
    estacion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Estacion',
        default: null
    },
    // 1.3 · Grupos de modificadores reutilizables, en el orden en que se ofrecen (F1-4)
    gruposModificadores: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'GrupoModificadores' }],
        default: [],
        validate: [
            { validator: (v) => v.length <= MAX_GRUPOS_POR_PRODUCTO, message: `Un producto admite hasta ${MAX_GRUPOS_POR_PRODUCTO} grupos de modificadores` },
            { validator: (v) => new Set(v.map(String)).size === v.length, message: 'Hay grupos de modificadores repetidos' },
        ]
    }
}, {
    timestamps: true
})

// «¿Está en uso esta estación / este grupo / esta categoría?» (409 o 400 al borrar)
productoSchema.index({ estacion: 1 })
productoSchema.index({ gruposModificadores: 1 })
productoSchema.index({ categoria: 1 })

export default mongoose.model('Producto', productoSchema)