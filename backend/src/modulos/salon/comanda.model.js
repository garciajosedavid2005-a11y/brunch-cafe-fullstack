import mongoose from 'mongoose'
import { ESTADOS_ITEM, MOTIVOS_ANULACION } from '../compartido/estadosSalon.js'
import { calcularItem, subtotalRonda } from './totales.js'

// 1.4 · Comanda = una ronda de la cuenta (F1-5: se envía completa). Los ítems van embebidos con su
// propio _id estable (para anularlos o, en la Fase 3, moverlos) y con la copia del catálogo del
// momento en que se agregaron (F1-14): nombre, precio base, modificadores con su recargo y estación.
// Invariantes en el esquema (se guardan con save() en transacción, así que siempre se comprueban):
//   - precioUnitario = precioBase + Σ recargos; subtotal = precioUnitario × cantidad;
//   - subtotal de la ronda = Σ ítems no anulados;
//   - una ronda en borrador solo tiene ítems en borrador; una enviada, ninguno.
export const ESTADOS_COMANDA = ['borrador', 'enviada']
export const MAX_ITEMS_POR_RONDA = 100
export const MAX_CANTIDAD = 50
// Tope del array embebido: 10 grupos por producto × 20 opciones por grupo (catálogo de 1.3)
export const MAX_MODIFICADORES_POR_ITEM = 200

const entero = (campo) => ({ validator: Number.isInteger, message: `${campo} debe ser un número entero` })
const montoCOP = (campo) => ({ type: Number, required: true, min: 0, validate: entero(campo) })
const ref = (modelo, required = true) => ({ type: mongoose.Schema.Types.ObjectId, ref: modelo, required })

const modificadorSchema = new mongoose.Schema({
    grupo: ref('GrupoModificadores'),
    grupoNombre: { type: String, required: true, trim: true, maxlength: 40 },
    opcion: { type: mongoose.Schema.Types.ObjectId, required: true },
    opcionNombre: { type: String, required: true, trim: true, maxlength: 40 },
    precioExtra: montoCOP('El recargo'),
}, { _id: false })

const estacionSchema = new mongoose.Schema({
    id: ref('Estacion'),
    codigo: { type: String, required: true, trim: true, maxlength: 30 },
    nombre: { type: String, required: true, trim: true, maxlength: 40 },
}, { _id: false })

const anulacionSchema = new mongoose.Schema({
    motivo: { type: String, required: true, enum: Object.keys(MOTIVOS_ANULACION) },
    detalle: { type: String, trim: true, maxlength: 300, default: '' },
    por: ref('Usuario'),
    en: { type: Date, required: true },
}, { _id: false })

const itemSchema = new mongoose.Schema({
    producto: ref('Producto'),
    codigoProducto: { type: Number, default: null },
    nombre: { type: String, required: true, trim: true, maxlength: 120 },
    precioBase: montoCOP('El precio base'),
    modificadores: {
        type: [modificadorSchema],
        default: [],
        validate: { validator: (v) => v.length <= MAX_MODIFICADORES_POR_ITEM, message: `Un ítem admite hasta ${MAX_MODIFICADORES_POR_ITEM} modificadores` },
    },
    estacion: { type: estacionSchema, required: true },
    cantidad: { type: Number, required: true, min: 1, max: MAX_CANTIDAD, validate: entero('La cantidad') },
    nota: { type: String, trim: true, maxlength: 140, default: '' }, // «sin cebolla» (F1-4)
    precioUnitario: montoCOP('El precio unitario'),
    subtotal: montoCOP('El subtotal'),
    estado: { type: String, required: true, enum: ESTADOS_ITEM, default: 'borrador' },
    anulacion: { type: anulacionSchema, default: null },
    agregadoPor: ref('Usuario'),
    agregadoEn: { type: Date, required: true },
})

const comandaSchema = new mongoose.Schema({
    cuenta: ref('Cuenta'),
    numeroRonda: { type: Number, required: true, min: 1, validate: entero('La ronda') },
    estado: { type: String, required: true, enum: ESTADOS_COMANDA, default: 'borrador' },
    items: {
        type: [itemSchema],
        validate: { validator: (v) => v.length <= MAX_ITEMS_POR_RONDA, message: `Una ronda admite hasta ${MAX_ITEMS_POR_RONDA} ítems` },
    },
    subtotal: montoCOP('El subtotal'),
    creadaPor: ref('Usuario'),
    enviadaPor: ref('Usuario', false),
    enviadaEn: { type: Date, default: null },
}, { timestamps: true, collection: 'comandas' })

/** Problemas de invariantes de una comanda (los usa el esquema y el verificador de consistencia). */
export const problemasDeComanda = (comanda) => {
    const problemas = []
    for (const item of comanda.items || []) {
        let esperado
        try {
            esperado = calcularItem(item)
        } catch {
            problemas.push(`El ítem ${item._id} tiene montos no válidos`)
            continue
        }
        if (item.precioUnitario !== esperado.precioUnitario || item.subtotal !== esperado.subtotal) {
            problemas.push(`El ítem ${item._id} no cuadra: precio ${item.precioUnitario}/${esperado.precioUnitario}, subtotal ${item.subtotal}/${esperado.subtotal}`)
        }
        if ((item.estado === 'anulado') !== Boolean(item.anulacion)) problemas.push(`El ítem ${item._id} tiene la anulación incoherente con su estado`)
        if ((comanda.estado === 'borrador') !== (item.estado === 'borrador')) {
            problemas.push(`El ítem ${item._id} está «${item.estado}» en una ronda «${comanda.estado}»`)
        }
    }
    try {
        if (comanda.subtotal !== subtotalRonda(comanda.items)) problemas.push('El subtotal de la ronda no coincide con sus ítems')
    } catch {
        problemas.push('La ronda tiene montos no válidos')
    }
    if (comanda.estado === 'enviada' && (!comanda.enviadaEn || !comanda.enviadaPor)) {
        problemas.push('Una ronda enviada registra cuándo y quién la envió')
    }
    if (comanda.estado === 'borrador' && (comanda.enviadaEn || comanda.enviadaPor)) problemas.push('Una ronda en borrador no tiene datos de envío')
    return problemas
}

comandaSchema.pre('validate', function () {
    const problemas = problemasDeComanda(this)
    if (problemas.length) this.invalidate('items', problemas.join('; '))
})

comandaSchema.index({ cuenta: 1, numeroRonda: 1 }, { unique: true })
// Una sola ronda en borrador por cuenta
comandaSchema.index({ cuenta: 1 }, { unique: true, partialFilterExpression: { estado: 'borrador' }, name: 'un_borrador_por_cuenta' })

export default mongoose.model('Comanda', comandaSchema)
