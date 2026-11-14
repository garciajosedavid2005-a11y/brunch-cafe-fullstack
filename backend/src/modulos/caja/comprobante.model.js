import mongoose from 'mongoose'
import { AppError } from '../compartido/errors.js'

// Fase 3 · Comprobante interno del cobro (PLAN_FASE_3 §3.3; F3-4, F3-5). Sin DIAN: lleva la leyenda
// «Documento no válido como factura electrónica» y «Precios con impuestos incluidos» (sin desglose).
// Es una copia de lo cobrado en ese momento (líneas, montos y pagos): no cambia si después cambia el
// catálogo o la cuenta. Inmutable: solo se inserta (como los Eventos). Montos en COP enteros.
export const METODOS_PAGO_CAJA = ['efectivo', 'tarjeta', 'transferencia'] // F3-2: fijos en el código
export const LEYENDAS_COMPROBANTE = ['Precios con impuestos incluidos', 'Documento no válido como factura electrónica']
export const PREFIJO_COMPROBANTE = 'CI-'
/** 1 → «CI-000001» (F3-4: sin reinicio). */
export const codigoComprobante = (numero) => `${PREFIJO_COMPROBANTE}${String(numero).padStart(6, '0')}`

const entero = (campo) => ({ validator: Number.isSafeInteger, message: `${campo} debe ser un entero en COP` })
const monto = (campo, extra = {}) => ({ type: Number, required: true, min: 0, validate: entero(campo), ...extra })

const lineaSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    cantidad: { type: Number, required: true, min: 1, validate: entero('La cantidad') },
    opciones: { type: [String], default: [] },
    nota: { type: String, trim: true, maxlength: 300, default: '' },
    precioUnitario: monto('El precio unitario'),
    subtotal: monto('El subtotal'),
}, { _id: false })

const pagoSchema = new mongoose.Schema({
    metodo: { type: String, required: true, enum: METODOS_PAGO_CAJA },
    monto: monto('El monto', { min: 1 }),
    // Solo en efectivo: lo que entregó el cliente y el cambio
    recibido: { type: Number, default: null, min: 0, validate: { validator: (v) => v === null || Number.isSafeInteger(v), message: 'Lo recibido debe ser un entero en COP' } },
    cambio: { type: Number, default: null, min: 0, validate: { validator: (v) => v === null || Number.isSafeInteger(v), message: 'El cambio debe ser un entero en COP' } },
}, { _id: false })

const persona = new mongoose.Schema({
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    nombre: { type: String, trim: true, default: '' }, // copia: «Ana P.»
}, { _id: false })

const comprobanteSchema = new mongoose.Schema({
    numero: { type: Number, required: true, min: 1, validate: entero('El número') },
    codigo: { type: String, required: true },
    cuenta: { type: mongoose.Schema.Types.ObjectId, ref: 'Cuenta', required: true },
    mesas: { type: [Number], default: [] },
    mesero: { type: persona, required: true },
    cajero: { type: persona, required: true },
    emitidoEn: { type: Date, required: true },
    lineas: { type: [lineaSchema], validate: { validator: (v) => v.length > 0, message: 'El comprobante necesita al menos una línea' } },
    subtotal: monto('El subtotal'),
    propina: monto('La propina'),
    total: monto('El total'),
    pagos: { type: [pagoSchema], validate: { validator: (v) => v.length > 0 && v.length <= METODOS_PAGO_CAJA.length, message: 'Entre 1 y 3 pagos' } },
    cambio: monto('El cambio'),
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'comprobantes' })

// Un consecutivo por comprobante y un comprobante por cuenta (no se cobra dos veces la misma)
comprobanteSchema.index({ numero: 1 }, { unique: true })
comprobanteSchema.index({ cuenta: 1 }, { unique: true })
comprobanteSchema.index({ emitidoEn: -1 }) // «Cobradas hoy»

const inmutable = () => new AppError(500, 'COMPROBANTE_INMUTABLE', 'Los comprobantes no se pueden modificar ni borrar.')

/** Invariantes entre campos (los comprueba el esquema al insertar). */
export const problemasDeComprobante = (c) => {
    const problemas = []
    const suma = (lista, campo) => lista.reduce((n, x) => n + (x[campo] ?? 0), 0)
    if (c.codigo !== codigoComprobante(c.numero)) problemas.push('El código no corresponde al número')
    for (const l of c.lineas || []) if (l.subtotal !== l.precioUnitario * l.cantidad) problemas.push(`La línea «${l.nombre}» no cuadra`)
    if (suma(c.lineas || [], 'subtotal') !== c.subtotal) problemas.push('El subtotal no coincide con las líneas')
    if (c.total !== c.subtotal + c.propina) problemas.push('El total no es subtotal + propina')
    if (suma(c.pagos || [], 'monto') !== c.total) problemas.push('Los pagos no suman el total')
    for (const p of c.pagos || []) {
        if (p.metodo === 'efectivo' ? p.recibido === null || p.cambio !== p.recibido - p.monto : p.recibido !== null || p.cambio !== null) {
            problemas.push(`El pago en ${p.metodo} no es coherente`)
        }
    }
    if (c.cambio !== suma(c.pagos || [], 'cambio')) problemas.push('El cambio no coincide con los pagos')
    if (new Set((c.pagos || []).map((p) => p.metodo)).size !== (c.pagos || []).length) problemas.push('Un método de pago repetido')
    return problemas
}

comprobanteSchema.pre('validate', function () {
    if (!this.isNew) throw inmutable() // guardar uno existente: antes de validar (save valida primero)
    const problemas = problemasDeComprobante(this)
    if (problemas.length) this.invalidate('total', problemas.join('; '))
})

// Inmutable: ni consultas que cambian ni guardar uno existente ni borrarlo
comprobanteSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
    { query: true, document: false }, () => { throw inmutable() })
comprobanteSchema.pre(['deleteOne', 'updateOne'], { document: true, query: false }, () => { throw inmutable() })
comprobanteSchema.pre('save', function () {
    if (!this.isNew) throw inmutable()
})
// bulkWrite: solo inserciones (como los Eventos)
comprobanteSchema.pre('bulkWrite', function (operaciones) {
    if (operaciones.some((op) => !op.insertOne)) throw inmutable()
})

export default mongoose.model('Comprobante', comprobanteSchema)
