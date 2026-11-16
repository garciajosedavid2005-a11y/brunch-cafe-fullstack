import mongoose from 'mongoose'
import { AppError } from '../compartido/errors.js'
import { MAX_CANTIDAD_INVENTARIO, MAX_COSTO_UNITARIO, conDecimales } from './cantidades.js'

// Fase 5 · 5.4 (F5-5) · Proveedores, órdenes de compra, recepciones y lotes con vencimiento.
const ref = (modelo) => ({ type: mongoose.Schema.Types.ObjectId, ref: modelo, required: true })
const tresDecimales = { validator: conDecimales(3), message: 'Usa como mucho 3 decimales' }
const dosDecimales = { validator: conDecimales(2), message: 'El costo admite como mucho 2 decimales' }
const cantidad = (extra = {}) => ({ type: Number, required: true, min: 0, max: MAX_CANTIDAD_INVENTARIO, validate: tresDecimales, ...extra })
const costo = { type: Number, required: true, min: 0, max: MAX_COSTO_UNITARIO, validate: dosDecimales }
export const COLACION_PROVEEDOR = { locale: 'es', strength: 1 }
const FECHA = /^\d{4}-\d{2}-\d{2}$/

// ── Proveedor ── (no se borra: se desactiva; las órdenes guardan copia del nombre)
const proveedorSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
    nit: { type: String, trim: true, maxlength: 20, default: '' },
    contacto: { type: String, trim: true, maxlength: 80, default: '' },
    telefono: { type: String, trim: true, maxlength: 30, default: '' },
    correo: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    notas: { type: String, trim: true, maxlength: 300, default: '' },
    activo: { type: Boolean, required: true, default: true },
}, { timestamps: true, optimisticConcurrency: true, collection: 'proveedores' })
proveedorSchema.index({ nombre: 1 }, { unique: true, collation: COLACION_PROVEEDOR, name: 'nombre_unico' })
export const Proveedor = mongoose.model('Proveedor', proveedorSchema)

// ── Orden de compra ── abierta → parcial → recibida; abierta o parcial → cancelada (lo pendiente ya no llega)
export const ESTADOS_ORDEN = ['abierta', 'parcial', 'recibida', 'cancelada']
export const PREFIJO_ORDEN = 'OC-'
export const codigoOrden = (numero) => `${PREFIJO_ORDEN}${String(numero).padStart(6, '0')}`
export const MAX_LINEAS_ORDEN = 50

const lineaOrdenSchema = new mongoose.Schema({
    insumo: ref('Insumo'),
    insumoNombre: { type: String, required: true, trim: true, maxlength: 60 }, // copia
    unidad: { type: String, required: true, trim: true, maxlength: 10 },
    cantidad: cantidad({ min: 0.001 }),
    costoUnitario: costo, // COP por unidad de medida pactado con el proveedor
    recibido: cantidad({ default: 0 }),
})

const ordenSchema = new mongoose.Schema({
    numero: { type: Number, required: true, min: 1 },
    codigo: { type: String, required: true },
    proveedor: ref('Proveedor'),
    proveedorNombre: { type: String, required: true, trim: true, maxlength: 80 }, // copia
    estado: { type: String, required: true, enum: ESTADOS_ORDEN, default: 'abierta' },
    lineas: {
        type: [lineaOrdenSchema],
        validate: [
            { validator: (v) => v.length >= 1 && v.length <= MAX_LINEAS_ORDEN, message: `Una orden lleva entre 1 y ${MAX_LINEAS_ORDEN} insumos` },
            { validator: (v) => new Set(v.map((l) => String(l.insumo))).size === v.length, message: 'Hay insumos repetidos en la orden' },
        ],
    },
    total: { type: Number, required: true, min: 0, validate: { validator: Number.isSafeInteger, message: 'El total es un entero en COP' } },
    notas: { type: String, trim: true, maxlength: 300, default: '' },
    creadaPor: ref('Usuario'),
    motivoCancelacion: { type: String, trim: true, maxlength: 300, default: '' },
    cerradaEn: { type: Date, default: null }, // recibida o cancelada
}, { timestamps: true, optimisticConcurrency: true, collection: 'ordenes_compra' })

/** Total en COP entero: Σ cantidad × costo, redondeado. */
export const totalOrden = (lineas) => Math.round(lineas.reduce((t, l) => t + l.cantidad * l.costoUnitario, 0))

ordenSchema.pre('validate', function () {
    if (this.codigo !== codigoOrden(this.numero)) this.invalidate('codigo', 'El código no corresponde al número')
    if (this.lineas?.length && this.total !== totalOrden(this.lineas)) this.invalidate('total', 'El total no coincide con las líneas')
    if (this.lineas?.some((l) => l.recibido > l.cantidad)) this.invalidate('lineas', 'Se recibió más de lo pedido')
    const cerrada = ['recibida', 'cancelada'].includes(this.estado)
    if (cerrada !== Boolean(this.cerradaEn)) this.invalidate('cerradaEn', 'Una orden cerrada registra cuándo (y una abierta no)')
    if (this.estado === 'cancelada' && !this.motivoCancelacion) this.invalidate('motivoCancelacion', 'Cancelar una orden exige un motivo')
})
ordenSchema.index({ numero: 1 }, { unique: true, name: 'numero_unico' })
ordenSchema.index({ estado: 1, createdAt: -1 }) // órdenes abiertas primero
ordenSchema.index({ proveedor: 1, createdAt: -1 })
export const OrdenCompra = mongoose.model('OrdenCompra', ordenSchema)

// ── Recepción ── copia de lo recibido en una entrega (una orden puede tener varias). Inmutable.
const lineaRecepcionSchema = new mongoose.Schema({
    linea: { type: mongoose.Schema.Types.ObjectId, required: true }, // línea de la orden
    insumo: ref('Insumo'),
    insumoNombre: { type: String, required: true, trim: true, maxlength: 60 },
    cantidad: cantidad({ min: 0.001 }),
    costoUnitario: costo,
    vencimiento: { type: String, default: null, validate: { validator: (v) => v === null || FECHA.test(v), message: 'Fecha de vencimiento inválida' } },
}, { _id: false })

const recepcionSchema = new mongoose.Schema({
    orden: ref('OrdenCompra'),
    ordenCodigo: { type: String, required: true },
    lineas: { type: [lineaRecepcionSchema], validate: { validator: (v) => v.length >= 1, message: 'La recepción necesita al menos una línea' } },
    total: { type: Number, required: true, min: 0, validate: { validator: Number.isSafeInteger, message: 'El total es un entero en COP' } },
    recibidaPor: ref('Usuario'),
    nota: { type: String, trim: true, maxlength: 300, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'recepciones' })
recepcionSchema.index({ orden: 1, createdAt: 1 })
const inmutable = () => new AppError(500, 'RECEPCION_INMUTABLE', 'Las recepciones no se pueden modificar ni borrar.')
recepcionSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'deleteOne', 'deleteMany', 'findOneAndDelete'], { query: true, document: false }, () => {
    throw inmutable()
})
recepcionSchema.pre('save', function () {
    if (!this.isNew) throw inmutable()
})
export const Recepcion = mongoose.model('Recepcion', recepcionSchema)

// ── Lote ── lo recibido de un insumo con fecha de vencimiento (F5-g). Lo que queda de cada lote se estima con la
// existencia actual; «descartado» = se registró su vencimiento (merma) y ya no alerta.
const loteSchema = new mongoose.Schema({
    insumo: ref('Insumo'),
    recepcion: ref('Recepcion'),
    ordenCodigo: { type: String, required: true },
    cantidad: cantidad({ min: 0.001 }),
    vencimiento: { type: String, required: true, match: FECHA }, // fecha de calendario de Bogotá
    descartado: { type: Boolean, required: true, default: false },
    descartadoEn: { type: Date, default: null },
}, { timestamps: true, collection: 'lotes' })
loteSchema.index({ descartado: 1, vencimiento: 1 }) // alertas de vencimiento próximo
loteSchema.index({ insumo: 1, createdAt: -1 })
export const Lote = mongoose.model('Lote', loteSchema)
