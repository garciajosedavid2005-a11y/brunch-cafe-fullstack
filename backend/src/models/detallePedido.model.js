import mongoose from 'mongoose'

const detallePedidoSchema = new mongoose.Schema({
    pedido: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pedido',
        required: true
    },
    // Referencia real al producto (0.6). Las líneas antiguas la reciben con migrate:0.6.
    producto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Producto',
        required: true
    },
    // Código numérico del producto en el momento del pedido (se conserva)
    productoId: {
        type: Number,
        min: 1,
    },
    nombreProducto: {
        type: String,
        required: true
    },
    precioProducto: {
        type: Number,
        required: true
    },
    cantidad: {
        type: Number,
        required: true,
        min: 1
    },
    subtotal: {
        type: Number,
        required: true
    }
}, {
    timestamps: true
})

export default mongoose.model('DetallePedido', detallePedidoSchema)