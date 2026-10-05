import mongoose from 'mongoose'

const estadoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    tipo: {
        type: String,
        enum: ['pedido', 'reserva'],
        required: true
    }
}, {
    timestamps: true
})

export default mongoose.model('Estado', estadoSchema)