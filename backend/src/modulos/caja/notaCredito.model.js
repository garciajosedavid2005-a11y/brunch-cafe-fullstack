import mongoose from 'mongoose'
import { AppError } from '../compartido/errors.js'
import { METODOS_PAGO_CAJA } from './comprobante.model.js'

// Fase 3b.3 · Nota crédito interna (PLAN_FASE_3B, F3b-5): anula un comprobante (que sigue inmutable) con
// motivo y quién. Devuelve el total por los mismos métodos del comprobante y entra en el turno abierto en ese
// momento (si no hay, queda sin turno y no afecta ningún arqueo). Una por comprobante. Inmutable, como el
// comprobante y los Eventos. Montos en COP enteros.
export const PREFIJO_NOTA = 'NC-'
export const codigoNota = (numero) => `${PREFIJO_NOTA}${String(numero).padStart(6, '0')}`

const entero = (campo) => ({ validator: Number.isSafeInteger, message: `${campo} debe ser un entero en COP` })

const devolucionSchema = new mongoose.Schema({
    metodo: { type: String, required: true, enum: METODOS_PAGO_CAJA },
    monto: { type: Number, required: true, min: 1, validate: entero('El monto') },
}, { _id: false })

const notaCreditoSchema = new mongoose.Schema({
    numero: { type: Number, required: true, min: 1, validate: entero('El número') },
    codigo: { type: String, required: true },
    comprobante: { type: mongoose.Schema.Types.ObjectId, ref: 'Comprobante', required: true },
    comprobanteCodigo: { type: String, required: true },
    turno: { type: mongoose.Schema.Types.ObjectId, ref: 'TurnoCaja', default: null },
    motivo: { type: String, required: true, trim: true, minlength: 5, maxlength: 300 },
    autor: {
        type: new mongoose.Schema({
            id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
            nombre: { type: String, trim: true, default: '' },
        }, { _id: false }),
        required: true,
    },
    emitidaEn: { type: Date, required: true },
    total: { type: Number, required: true, min: 1, validate: entero('El total') },
    // Lo que se devuelve, por método (los mismos del comprobante): en el turno, el esperado los resta
    pagos: { type: [devolucionSchema], validate: { validator: (v) => v.length > 0 && v.length <= METODOS_PAGO_CAJA.length, message: 'Entre 1 y 3 devoluciones' } },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'notasCredito' })

notaCreditoSchema.index({ numero: 1 }, { unique: true })
notaCreditoSchema.index({ comprobante: 1 }, { unique: true }) // un comprobante se anula una sola vez
notaCreditoSchema.index({ turno: 1 }) // arqueo del turno
notaCreditoSchema.index({ 'autor.id': 1 }) // historial de quien la emitió (baja de usuarios, 3.8)

const inmutable = () => new AppError(500, 'NOTA_INMUTABLE', 'Las notas crédito no se pueden modificar ni borrar.')

notaCreditoSchema.pre('validate', function () {
    if (!this.isNew) throw inmutable()
    if (this.codigo !== codigoNota(this.numero)) this.invalidate('codigo', 'El código no corresponde al número')
    if ((this.pagos || []).reduce((n, p) => n + p.monto, 0) !== this.total) this.invalidate('total', 'Las devoluciones no suman el total')
    if (new Set((this.pagos || []).map((p) => p.metodo)).size !== (this.pagos || []).length) this.invalidate('pagos', 'Un método repetido')
})
notaCreditoSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
    { query: true, document: false }, () => { throw inmutable() })
notaCreditoSchema.pre(['deleteOne', 'updateOne'], { document: true, query: false }, () => { throw inmutable() })
notaCreditoSchema.pre('save', function () {
    if (!this.isNew) throw inmutable()
})
notaCreditoSchema.pre('bulkWrite', function (operaciones) {
    if (operaciones.some((op) => !op.insertOne)) throw inmutable()
})

export default mongoose.model('NotaCredito', notaCreditoSchema)
