import mongoose from 'mongoose'
import { instanteLocal, fechaLocal, esHoraValida } from '../libs/fechas.js'

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
    },
    nombreEntrega: {
        type: String,
        trim: true,
        maxlength: 50
    },
    direccion: {
        type: String,
        trim: true,
        maxlength: 60
    },
    barrio: {
        type: String,
        trim: true,
        maxlength: 40
    },
    horaEntrega: {
        type: String,
        trim: true
    },
    // Instante UTC de entrega: día de America/Bogota en que se hizo el pedido + horaEntrega. 0.10.
    entregaEn: {
        type: Date
    },
    indicaciones: {
        type: String,
        trim: true,
        maxlength: 120
    }
}, {
    timestamps: true
})

pedidoSchema.pre('validate', function () {
    if (esHoraValida(this.horaEntrega) && (this.isModified('horaEntrega') || !this.entregaEn)) {
        this.entregaEn = instanteLocal(fechaLocal(this.createdAt || new Date()), this.horaEntrega)
    }
})

export default mongoose.model('Pedido', pedidoSchema)