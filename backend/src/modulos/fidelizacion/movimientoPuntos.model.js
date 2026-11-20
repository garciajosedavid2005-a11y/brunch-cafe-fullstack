import mongoose from 'mongoose'
import { AppError } from '../compartido/errors.js'

// 6.6 (F6-5, F6-c) · Libro inmutable de puntos (colección `movimientos_puntos`). Cada movimiento cambia el saldo del
// usuario (`Usuario.puntos`) en la misma transacción y guarda el saldo que dejó:
//   acumula: +N al cobrar (1 punto por cada $1.000 pagados del consumo, sin propina; referencia: el comprobante)
//   canjea:  −N al usar bloques de 100 en la caja (referencia: el comprobante en que se descontaron)
//   revierte: al anular el comprobante (nota crédito): −ganados + canjeados (referencia: la nota)
// Una sola vez por referencia y tipo (índice único): un reintento no suma ni descuenta dos veces.
export const TIPOS_MOVIMIENTO_PUNTOS = ['acumula', 'canjea', 'revierte']

const entero = { validator: Number.isSafeInteger, message: 'Los puntos son enteros' }
const movimientoPuntosSchema = new mongoose.Schema({
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    tipo: { type: String, required: true, enum: TIPOS_MOVIMIENTO_PUNTOS },
    puntos: { type: Number, required: true, validate: entero }, // con signo
    saldoDespues: { type: Number, required: true, validate: entero },
    referencia: {
        modelo: { type: String, required: true, enum: ['Comprobante', 'NotaCredito'] },
        id: { type: mongoose.Schema.Types.ObjectId, required: true },
        codigo: { type: String, required: true, trim: true, maxlength: 20 }, // «CI-000012» o «NC-000003», para el historial
    },
    detalle: { type: String, trim: true, maxlength: 120, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'movimientos_puntos' })

movimientoPuntosSchema.pre('validate', function () {
    if (this.puntos === 0) this.invalidate('puntos', 'Un movimiento de 0 puntos no se registra')
    if (this.tipo === 'acumula' && this.puntos < 0) this.invalidate('puntos', 'Acumular suma puntos')
    if (this.tipo === 'canjea' && this.puntos > 0) this.invalidate('puntos', 'Canjear resta puntos')
})

movimientoPuntosSchema.index({ tipo: 1, 'referencia.id': 1 }, { unique: true, name: 'una_vez_por_referencia' })
movimientoPuntosSchema.index({ usuario: 1, createdAt: -1 }) // historial en Mi cuenta

// Como los Eventos y el libro de inventario: consultas, documentos y bulkWrite que cambian o borran se rechazan
const inmutable = () => new AppError(500, 'MOVIMIENTO_INMUTABLE', 'Los movimientos de puntos no se pueden modificar ni borrar.')
const OPERACIONES_QUE_CAMBIAN = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
    'deleteOne', 'deleteMany', 'findOneAndDelete']
movimientoPuntosSchema.pre(OPERACIONES_QUE_CAMBIAN, { query: true, document: false }, () => {
    throw inmutable()
})
movimientoPuntosSchema.pre('save', function () {
    if (!this.isNew) throw inmutable()
})
movimientoPuntosSchema.pre(['deleteOne', 'updateOne'], { document: true, query: false }, () => {
    throw inmutable()
})
movimientoPuntosSchema.pre('bulkWrite', (operaciones) => {
    if ((operaciones || []).some((op) => !('insertOne' in op))) throw inmutable()
})

export default mongoose.model('MovimientoPuntos', movimientoPuntosSchema)
