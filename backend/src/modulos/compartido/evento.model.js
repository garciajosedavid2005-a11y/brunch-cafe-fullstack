import mongoose from 'mongoose'

// Bitácora de cambios de estado de pedidos y reservas (solo se agregan registros).
const eventoSchema = new mongoose.Schema({
    entidad: {
        type: String,
        enum: ['pedido', 'reserva'],
        required: true
    },
    entidadId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    tipo: {
        type: String,
        enum: ['cambio_estado'],
        default: 'cambio_estado'
    },
    // Códigos de estado; `de` es null en el registro inicial
    de: {
        type: String,
        default: null
    },
    a: {
        type: String,
        required: true
    },
    motivo: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    },
    // Quién hizo el cambio: usuario null + actor "sistema" para procesos automáticos
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        default: null
    },
    actor: {
        type: String,
        required: true
    },
    datos: {
        type: mongoose.Schema.Types.Mixed
    }
}, {
    timestamps: { createdAt: true, updatedAt: false }
})

eventoSchema.index({ entidad: 1, entidadId: 1, createdAt: 1 })

export default mongoose.model('Evento', eventoSchema)
