import mongoose from 'mongoose'
import { AppError } from '../compartido/errors.js'
import { MAX_CANTIDAD_INVENTARIO, MAX_COSTO_UNITARIO, conDecimales } from './cantidades.js'

// Fase 5 (F5-e) · Libro de movimientos del inventario (kárdex). Inmutable: solo se insertan (como los Eventos).
// Cada movimiento cambia la existencia de un insumo en la misma transacción y guarda cómo quedó.
//   inicial      existencia con la que se creó el insumo (5.1)
//   consumo      ronda enviada (referencia: ítem de la comanda) o domicilio confirmado (referencia: pedido) (5.3)
//   devolucion   ítem anulado o pedido cancelado: devuelve lo que consumió esa referencia (5.3)
//   recepcion    compra recibida (referencia: recepción) (5.4)
//   ajuste       conteo físico (+ o −) (5.3)
//   merma        pérdida (−) (5.3)
//   vencimiento  producto vencido que se descarta (−) (5.3)
export const TIPOS_MOVIMIENTO = ['inicial', 'consumo', 'devolucion', 'recepcion', 'ajuste', 'merma', 'vencimiento']
// Signo que exige cada tipo (null = cualquiera distinto de 0)
export const SIGNO_MOVIMIENTO = { inicial: 1, consumo: -1, devolucion: 1, recepcion: 1, ajuste: null, merma: -1, vencimiento: -1 }
export const TIPOS_REFERENCIA = ['insumo', 'item', 'pedido', 'recepcion', 'manual']

const tresDecimales = { validator: conDecimales(3), message: 'Usa como mucho 3 decimales' }

const referenciaSchema = new mongoose.Schema({
    tipo: { type: String, required: true, enum: TIPOS_REFERENCIA },
    id: { type: mongoose.Schema.Types.ObjectId, default: null },
    // Contexto para el historial (copias): cuenta y número de ronda, código del pedido, código de la orden…
    cuenta: { type: mongoose.Schema.Types.ObjectId, ref: 'Cuenta', default: undefined },
    codigo: { type: String, trim: true, maxlength: 40, default: undefined },
}, { _id: false })

const movimientoSchema = new mongoose.Schema({
    insumo: { type: mongoose.Schema.Types.ObjectId, ref: 'Insumo', required: true },
    tipo: { type: String, required: true, enum: TIPOS_MOVIMIENTO },
    cantidad: { type: Number, required: true, min: -MAX_CANTIDAD_INVENTARIO, max: MAX_CANTIDAD_INVENTARIO, validate: tresDecimales },
    existenciaDespues: { type: Number, required: true, min: -2 * MAX_CANTIDAD_INVENTARIO, max: 2 * MAX_CANTIDAD_INVENTARIO, validate: tresDecimales },
    // Costo por unidad de medida del movimiento: el de la compra en una recepción, el promedio en los demás
    costoUnitario: { type: Number, required: true, min: 0, max: MAX_COSTO_UNITARIO, validate: { validator: conDecimales(2), message: 'El costo admite 2 decimales' } },
    motivo: { type: String, required: true, trim: true, minlength: 1, maxlength: 300 },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    actor: { type: String, required: true, trim: true, maxlength: 40 }, // rol de quien lo hizo o «sistema»
    referencia: { type: referenciaSchema, required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'movimientos_inventario' })

movimientoSchema.pre('validate', function () {
    if (this.cantidad === 0) this.invalidate('cantidad', 'Un movimiento no puede ser de 0')
    const signo = SIGNO_MOVIMIENTO[this.tipo]
    if (signo && Math.sign(this.cantidad) !== signo) {
        this.invalidate('cantidad', `Un movimiento de tipo «${this.tipo}» debe ser ${signo > 0 ? 'positivo' : 'negativo'}`)
    }
    // Sin la referencia exacta no se podría devolver lo consumido (5.3)
    if (this.referencia && this.referencia.tipo !== 'manual' && !this.referencia.id) this.invalidate('referencia.id', 'El movimiento necesita su referencia')
    // Solo el sistema actúa sin usuario
    if (!this.usuario && this.actor !== 'sistema') this.invalidate('usuario', 'El movimiento necesita quién lo hizo')
})

movimientoSchema.index({ insumo: 1, createdAt: -1 }) // kárdex de un insumo
movimientoSchema.index({ 'referencia.tipo': 1, 'referencia.id': 1 }) // 5.3 · lo que consumió una referencia (devolución)
movimientoSchema.index({ createdAt: -1 }) // movimientos recientes
// Una referencia consume, devuelve o recibe cada insumo UNA vez (aplicarMovimientos agrupa por insumo y tipo):
// un reintento no descuenta dos veces aunque se escape de la escritura condicional de quien llama
movimientoSchema.index(
    { insumo: 1, 'referencia.tipo': 1, 'referencia.id': 1, tipo: 1 },
    { unique: true, name: 'una_vez_por_referencia', partialFilterExpression: { tipo: { $in: ['consumo', 'devolucion', 'recepcion'] } } },
)

// Como los Eventos (1.15): consultas, documentos y bulkWrite que cambian o borran se rechazan. El driver
// directo no pasa por aquí (los tests limpian así)
const inmutable = () => new AppError(500, 'MOVIMIENTO_INMUTABLE', 'Los movimientos de inventario no se pueden modificar ni borrar.')
const OPERACIONES_QUE_CAMBIAN = ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace',
    'deleteOne', 'deleteMany', 'findOneAndDelete']
movimientoSchema.pre(OPERACIONES_QUE_CAMBIAN, { query: true, document: false }, () => {
    throw inmutable()
})
movimientoSchema.pre('save', function () {
    if (!this.isNew) throw inmutable()
})
movimientoSchema.pre(['deleteOne', 'updateOne'], { document: true, query: false }, () => {
    throw inmutable()
})
movimientoSchema.pre('bulkWrite', (operaciones) => {
    if ((operaciones || []).some((op) => !('insertOne' in op))) throw inmutable()
})

export default mongoose.model('MovimientoInventario', movimientoSchema)
