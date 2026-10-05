import mongoose from 'mongoose'

const pedidoSchema = new mongoose.Schema({
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        required: true
    },
    estado: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Estado',
        required: true
    },
    metodoPago: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MetodoPago',
        required: true
    },
    total: {
        type: Number,
        required: true,
        min: 0
    }
}, {
    timestamps: true
})

export default mongoose.model('Pedido', pedidoSchema)