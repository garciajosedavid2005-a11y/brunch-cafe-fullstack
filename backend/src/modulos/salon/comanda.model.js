import mongoose from 'mongoose'
import { ESTADOS_ITEM, MOTIVOS_ANULACION } from '../compartido/estadosSalon.js'
import { calcularItem, subtotalRonda } from './totales.js'
import { modificadorElegidoSchema, MAX_MODIFICADORES_POR_ITEM, MAX_NOTA_ITEM } from '../catalogo/modificadorElegido.schema.js'

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
export { MAX_MODIFICADORES_POR_ITEM } // tope del array embebido (catalogo/modificadorElegido.schema.js)

const entero = (campo) => ({ validator: Number.isInteger, message: `${campo} debe ser un número entero` })
const montoCOP = (campo) => ({ type: Number, required: true, min: 0, validate: entero(campo) })
const ref = (modelo, required = true) => ({ type: mongoose.Schema.Types.ObjectId, ref: modelo, required })


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
        type: [modificadorElegidoSchema], // 1.12: la misma copia que la línea del pedido a domicilio
        default: [],
        validate: { validator: (v) => v.length <= MAX_MODIFICADORES_POR_ITEM, message: `Un ítem admite hasta ${MAX_MODIFICADORES_POR_ITEM} modificadores` },
    },
    estacion: { type: estacionSchema, required: true },
    cantidad: { type: Number, required: true, min: 1, max: MAX_CANTIDAD, validate: entero('La cantidad') },
    nota: { type: String, trim: true, maxlength: MAX_NOTA_ITEM, default: '' }, // «sin cebolla» (F1-4)
    precioUnitario: montoCOP('El precio unitario'),
    subtotal: montoCOP('El subtotal'),
    estado: { type: String, required: true, enum: ESTADOS_ITEM, default: 'borrador' },
    anulacion: { type: anulacionSchema, default: null },
    agregadoPor: ref('Usuario'),
    agregadoEn: { type: Date, required: true },
    // 2.2 · Tiempos de preparación en el propio ítem (los reportes de la Fase 5 no reconstruyen nada
    // a partir de los Eventos). Sin migración: los ítems anteriores no los tienen y no pasaron de «enviado»
    iniciadoEn: { type: Date, default: null },
    iniciadoPor: { ...ref('Usuario', false), default: null },
    listoEn: { type: Date, default: null },
    listoPor: { ...ref('Usuario', false), default: null },
    servidoEn: { type: Date, default: null },
    servidoPor: { ...ref('Usuario', false), default: null },
})

// Qué tiempos lleva cada estado (anulado conserva los que tuviera)
const TIEMPOS_POR_ESTADO = {
    borrador: [],
    enviado: [],
    en_preparacion: ['iniciado'],
    listo: ['iniciado', 'listo'],
    servido: ['iniciado', 'listo', 'servido'],
}
const problemasDeTiempos = (item) => {
    const problemas = []
    const momentos = ['iniciado', 'listo', 'servido']
    for (const m of momentos) {
        if (Boolean(item[`${m}En`]) !== Boolean(item[`${m}Por`])) problemas.push(`El ítem ${item._id} tiene ${m}En y ${m}Por incoherentes`)
    }
    const esperados = TIEMPOS_POR_ESTADO[item.estado]
    if (esperados) {
        for (const m of momentos) {
            if (esperados.includes(m) !== Boolean(item[`${m}En`])) {
                problemas.push(`El ítem ${item._id} está «${item.estado}» y ${esperados.includes(m) ? 'le falta' : 'no debería tener'} ${m}En`)
            }
        }
    }
    // Anulado conserva los que tuviera, pero sin huecos (p. ej. servidoEn sin iniciadoEn)
    if (item.estado === 'anulado') {
        const presentes = momentos.map((m) => Boolean(item[`${m}En`]))
        if (presentes.some((p, i) => p && presentes.slice(0, i).some((antes) => !antes))) {
            problemas.push(`El ítem ${item._id} anulado tiene los tiempos con huecos`)
        }
    }
    const fechas = momentos.map((m) => item[`${m}En`]).filter(Boolean).map((f) => new Date(f).getTime())
    if (fechas.some((f, i) => i > 0 && f < fechas[i - 1])) problemas.push(`El ítem ${item._id} tiene los tiempos fuera de orden`)
    return problemas
}

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
        problemas.push(...problemasDeTiempos(item))
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
// 2.2 · La cocina y el servir buscan la ronda por el _id del ítem
comandaSchema.index({ 'items._id': 1 })
// Una sola ronda en borrador por cuenta
comandaSchema.index({ cuenta: 1 }, { unique: true, partialFilterExpression: { estado: 'borrador' }, name: 'un_borrador_por_cuenta' })

export default mongoose.model('Comanda', comandaSchema)
