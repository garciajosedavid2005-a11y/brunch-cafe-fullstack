import mongoose from 'mongoose'
import { inicioReserva, esHoraValida } from '../compartido/fechas.js'

const reservaSchema = new mongoose.Schema({
    // Cliente dueño de la reserva. null si la registró el personal (0.15e): el cliente
    // solo ve las suyas, aunque el correo coincida
    usuario: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        default: null,
        required: [function () { return !this.registradaPor }, 'La reserva necesita un cliente o quien la registró.']
    },
    // Personal que la registró en nombre del cliente (0.15e)
    registradaPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        default: null
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
    // Instante UTC de inicio (fecha + hora de America/Bogota). `fecha` (mediodía UTC)
    // y `hora` se conservan para los clientes actuales. 0.10.
    inicio: {
        type: Date
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
    // Teléfono de contacto de la reserva (obligatorio al crear o editar desde 0.8;
    // las reservas anteriores no lo tienen)
    telefono: {
        type: String,
        trim: true,
        maxlength: 30
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
    },
    // Fase 4 · Mesa asignada por el personal (null = sin mesa; las anteriores a la Fase 4 no tienen el campo).
    // Dos reservas activas de una mesa no se solapan (reservas.bloque.js, verificado en la transacción)
    mesa: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Mesa',
        default: null
    },
    // Fase 4 · Cuenta que abrió «Sentar» (null hasta entonces)
    cuenta: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cuenta',
        default: null
    }
}, {
    timestamps: true
})

// Toda reserva guardada con save()/create() lleva su instante de inicio
reservaSchema.pre('validate', function () {
    if (this.fecha && esHoraValida(this.hora) && (this.isModified('fecha') || this.isModified('hora') || !this.inicio)) {
        this.inicio = inicioReserva(this.fecha, this.hora)
    }
})

// Fase 4 · Choques de una mesa por horario y reservas próximas del plano (solo las que tienen mesa)
reservaSchema.index({ mesa: 1, inicio: 1 }, { name: 'mesa_inicio', partialFilterExpression: { mesa: { $type: 'objectId' } } })
// 4.2 · Aforo: reservas que empiezan a una hora, por estado
reservaSchema.index({ inicio: 1, estado: 1 }, { name: 'inicio_estado' })

export default mongoose.model('Reserva', reservaSchema)