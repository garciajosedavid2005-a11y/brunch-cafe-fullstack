import mongoose from 'mongoose'

const reservaSchema = new mongoose.Schema({
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
    cantidadPersonas: {
        type: Number,
        required: true,
        min: 1
    },
    fecha: {
        type: Date,
        required: true
    },
    hora: {
        type: String,
        required: true
    }
}, {
    timestamps: true
})

export default mongoose.model('Reserva', reservaSchema)