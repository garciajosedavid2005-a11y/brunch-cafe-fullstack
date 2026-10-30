import mongoose from 'mongoose'

const detallePedidoSchema = new mongoose.Schema({
    pedido: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Pedido',
        required: true
    },
    producto: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Producto'
    },
    productoId: {
        type: Number,
        min: 1,
        max: 24
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