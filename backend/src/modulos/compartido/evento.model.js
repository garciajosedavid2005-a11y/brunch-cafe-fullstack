import mongoose from 'mongoose'

// Bitácora de pedidos, reservas y (1.4) mesas y cuentas (solo se agregan registros).
// Los cambios de una comanda (ítems y rondas) se registran en su cuenta (entidad 'cuenta', con
// datos.comanda): así el historial de una cuenta sale con el índice { entidad, entidadId, createdAt }.
export const ENTIDADES_EVENTO = ['pedido', 'reserva', 'mesa', 'cuenta']
// Los Eventos anteriores a 1.4 no guardan `tipo` (se leen como 'cambio_estado' por el default): un filtro
// por tipo debe usar { tipo: { $in: ['cambio_estado', null] } } para incluirlos.
export const TIPOS_EVENTO = [
    'cambio_estado', 'item_agregado', 'item_modificado', 'item_quitado', 'item_anulado', 'ronda_enviada', 'ronda_descartada',
]
const eventoSchema = new mongoose.Schema({
    entidad: {
        type: String,
        enum: ENTIDADES_EVENTO,
        required: true
    },
    entidadId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true
    },
    tipo: {
        type: String,
        enum: TIPOS_EVENTO,
        default: 'cambio_estado'
    },
    // Códigos de estado; `de` es null en el registro inicial. `a` es obligatorio en los cambios de
    // estado (y en item_anulado lleva 'anulado'); los demás tipos describen el cambio en `datos`.
    de: {
        type: String,
        default: null
    },
    a: {
        type: String,
        required: function () { return this.tipo === 'cambio_estado' }
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
