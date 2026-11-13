import mongoose from 'mongoose'
import { instanteLocal, fechaLocal, esHoraValida } from '../compartido/fechas.js'

// 1.9 (F1-11, opción A): el domicilio sigue en Pedido. Para llevar y la unificación con Cuenta, Fase 6
export const CANALES_PEDIDO = ['domicilio']

const pedidoSchema = new mongoose.Schema({
    // Sin migración: los pedidos anteriores no tienen el campo y se leen como domicilio (pedidoComoCuenta)
    canal: {
        type: String,
        enum: CANALES_PEDIDO,
        default: 'domicilio'
    },
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
    // Teléfono de contacto del domicilio (obligatorio desde 0.8; los anteriores no lo tienen)
    telefono: {
        type: String,
        trim: true,
        maxlength: 30
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

// 2.3 · Domicilio en el KDS (F2-3): estaciones que ya terminaron su parte (códigos). El pedido pasa a
// listo cuando todas las estaciones con líneas están aquí. Sin el campo (pedidos anteriores) = ninguna
pedidoSchema.add({
    estacionesListas: {
        type: [{ type: String, match: /^[a-z][a-z0-9_]{1,29}$/ }],
        default: [],
        validate: { validator: (v) => v.length <= 20 && new Set(v).size === v.length, message: 'Las estaciones listas no se repiten (máximo 20)' },
    },
})

// 1.9 · «Cuentas abiertas»: pedidos en curso por estado, de los más nuevos a los más viejos
pedidoSchema.index({ estado: 1, createdAt: -1 })

export default mongoose.model('Pedido', pedidoSchema)