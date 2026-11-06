import mongoose from 'mongoose'

const estadoSchema = new mongoose.Schema({
    // Código fijo que usa la máquina de transiciones (src/modulos/compartido/estados.js).
    // No se edita desde el dashboard.
    codigo: {
        type: String,
        required: true,
        trim: true,
        immutable: true
    },
    // Posición en el flujo (para ordenar listas)
    orden: {
        type: Number,
        default: 0
    },
    // Etiqueta visible (editable por el admin)
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
    // Colores de la etiqueta que muestra el dashboard. Sin valor por defecto:
    // si faltan, la API usa los del catálogo del código (src/modulos/compartido/estados.js).
    // (Antes el default #b78103 se aplicaba al leer y teñía de amarillo hasta "Cancelada".)
    color: {
        type: String,
        trim: true
    },
    bg: {
        type: String,
        trim: true
    },
    badgeType: {
        type: String,
        trim: true
    },
    // Estado final: lo fija el catálogo; el pedido o la reserva ya no cambia después
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
// Un código por tipo (parcial: tolera documentos anteriores a la migración 0.7)
estadoSchema.index(
    { tipo: 1, codigo: 1 },
    { unique: true, partialFilterExpression: { codigo: { $type: 'string' } } }
)

export default mongoose.model('Estado', estadoSchema)