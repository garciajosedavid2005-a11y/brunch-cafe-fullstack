import mongoose from 'mongoose'
import { inicioReserva, esHoraValida } from '../compartido/fechas.js'

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

export default mongoose.model('Reserva', reservaSchema)