import mongoose from 'mongoose'
import { AppError } from '../compartido/errors.js'

// 6.7 (F6-6, F6-d) · Uso del descuento de cumpleaños (colección `usos_cumpleanos`): uno VIGENTE por usuario y año de
// Bogotá (índice único parcial). Se registra en la misma transacción que el cobro en la caja (referencia: el
// comprobante) o que el pedido a domicilio (referencia: el pedido). Si se cancela el domicilio o se anula el
// comprobante, se LIBERA (vigente: false con el motivo y la referencia que lo liberó) y el cliente puede volver a usarlo
// ese año. Lo único que cambia de un uso es esa liberación; no se borra.
export const MOTIVOS_LIBERACION = ['cancelado', 'anulado']

const entero = (que) => ({ validator: Number.isSafeInteger, message: `${que} debe ser un entero` })
const usoCumpleanosSchema = new mongoose.Schema({
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    anio: { type: Number, required: true, min: 2000, max: 9999, validate: entero('El año') },
    monto: { type: Number, required: true, min: 1, validate: entero('El monto') },
    referencia: {
        modelo: { type: String, required: true, enum: ['Comprobante', 'Pedido'] },
        id: { type: mongoose.Schema.Types.ObjectId, required: true },
        codigo: { type: String, required: true, trim: true, maxlength: 20 },
    },
    vigente: { type: Boolean, default: true },
    liberado: {
        type: new mongoose.Schema({
            motivo: { type: String, required: true, enum: MOTIVOS_LIBERACION },
            codigo: { type: String, trim: true, maxlength: 20, default: '' }, // la nota crédito, si la hay
            en: { type: Date, required: true },
        }, { _id: false }),
        default: null,
    },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'usos_cumpleanos' })

usoCumpleanosSchema.pre('validate', function () {
    if (this.vigente === Boolean(this.liberado)) this.invalidate('vigente', 'Un uso vigente no está liberado y uno liberado no está vigente')
})

usoCumpleanosSchema.index({ usuario: 1, anio: 1 }, { unique: true, partialFilterExpression: { vigente: true }, name: 'un_uso_vigente_por_anio' })
// Un cobro o un pedido tiene como mucho un uso vigente (y así se busca para liberarlo)
usoCumpleanosSchema.index({ 'referencia.id': 1 }, { unique: true, partialFilterExpression: { vigente: true }, name: 'una_vez_por_referencia' })

// Solo la liberación (vigente → false) cambia un uso, y por el servicio (updateOne condicional); nada se borra.
// La protección es de Mongoose: los servicios no usan bulkWrite ni el driver directo sobre esta colección
const inmutable = () => new AppError(500, 'USO_CUMPLEANOS_INMUTABLE', 'El uso del cumpleaños solo se libera; no se modifica ni se borra.')
usoCumpleanosSchema.pre(['updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
    { query: true, document: false }, () => { throw inmutable() })
usoCumpleanosSchema.pre('updateOne', { query: true, document: false }, function () {
    const cambio = this.getUpdate() || {}
    const claves = Object.keys(cambio)
    const soloLibera = claves.length === 1 && claves[0] === '$set' && cambio.$set.vigente === false
        && Object.keys(cambio.$set).every((k) => k === 'vigente' || k === 'liberado') && this.getFilter().vigente === true
    if (!soloLibera) throw inmutable()
})
usoCumpleanosSchema.pre('save', function () {
    if (!this.isNew) throw inmutable()
})

export default mongoose.model('UsoCumpleanos', usoCumpleanosSchema)
