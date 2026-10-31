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
    },
    descripcion: {
        type: String,
        trim: true,
        maxlength: 200,
        default: ''
    },
    // Colores de la etiqueta que muestra el dashboard
    color: {
        type: String,
        trim: true,
        default: '#b78103'
    },
    bg: {
        type: String,
        trim: true,
        default: '#fff8e1'
    },
    badgeType: {
        type: String,
        trim: true,
        default: 'warning'
    },
    // Estado final: el pedido o la reserva ya no cambia después de este estado
    esFinal: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
})

// El mismo nombre puede existir una vez como "pedido" y otra como "reserva"
// (ej. "Pendiente"), pero no repetido dentro del mismo tipo
estadoSchema.index({ nombre: 1, tipo: 1 }, { unique: true })

export default mongoose.model('Estado', estadoSchema)