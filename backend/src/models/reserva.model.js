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
    },
    nombre: {
        type: String,
        trim: true,
        maxlength: 120
    },
    correo: {
        type: String,
        trim: true,
        lowercase: true,
        maxlength: 254
    },
    motivo: {
        type: String,
        trim: true,
        maxlength: 120
    },
    observaciones: {
        type: String,
        trim: true,
        maxlength: 200
    }
}, {
    timestamps: true
})

export default mongoose.model('Reserva', reservaSchema)