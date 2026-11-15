import mongoose from 'mongoose'

// 4.4 · Lista de espera de clientes sin reserva (PLAN_FASE_4, F4-4, F4-h). Colección `esperas`. Estados como enum:
// esperando → sentada («Sentar» abre la cuenta en una mesa) o retirada (se fue). `dia` es la fecha de Bogotá en que
// llegó (YYYY-MM-DD): la lista de /staff es la de hoy.
export const ESTADOS_ESPERA = ['esperando', 'sentada', 'retirada']
export const MAX_PERSONAS_ESPERA = 20

const esperaSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
    personas: {
        type: Number, required: true, min: 1, max: MAX_PERSONAS_ESPERA,
        validate: { validator: Number.isInteger, message: 'Las personas deben ser un número entero' },
    },
    telefono: { type: String, required: true, trim: true, maxlength: 30 },
    estado: { type: String, required: true, enum: ESTADOS_ESPERA, default: 'esperando' },
    dia: { type: String, required: true, match: /^\d{4}-\d{2}-\d{2}$/ },
    creadaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    // Al sentar: la mesa y la cuenta abiertas, y cuándo; al retirar, cuándo
    mesa: { type: mongoose.Schema.Types.ObjectId, ref: 'Mesa', default: null },
    cuenta: { type: mongoose.Schema.Types.ObjectId, ref: 'Cuenta', default: null },
    sentadaEn: { type: Date, default: null },
    retiradaEn: { type: Date, default: null },
}, { timestamps: true, collection: 'esperas' })

// Una sentada tiene su mesa y su cuenta (invariante en el esquema)
esperaSchema.pre('validate', function () {
    if (this.estado === 'sentada' && (!this.mesa || !this.cuenta)) {
        this.invalidate('cuenta', 'Una espera sentada necesita su mesa y su cuenta.')
    }
})

// La lista de hoy, en orden de llegada
esperaSchema.index({ dia: 1, createdAt: 1 }, { name: 'dia_llegada' })
// Historial en la baja de usuarios (3.8): quien agregó a alguien
esperaSchema.index({ creadaPor: 1 }, { name: 'creada_por' })

export default mongoose.model('Espera', esperaSchema)
