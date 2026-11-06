import mongoose from 'mongoose'

const metodoPagoSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    descripcion: {
        type: String,
        trim: true
    },
    // Identificador corto, ej. "contra-entrega" (el dashboard lo genera desde el nombre)
    codigo: {
        type: String,
        trim: true,
        lowercase: true,
        unique: true,
        sparse: true
    },
    // Nombre del ícono de lucide-react que muestra el dashboard
    icono: {
        type: String,
        trim: true,
        default: 'CreditCard'
    },
    // Si está en false, no se ofrece en el checkout
    activo: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
})

export default mongoose.model('MetodoPago', metodoPagoSchema)