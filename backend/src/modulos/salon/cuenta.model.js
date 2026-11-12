import mongoose from 'mongoose'
import { ESTADOS_CUENTA, ESTADOS_CUENTA_ABIERTA } from '../compartido/estadosSalon.js'

// 1.4 · Cuenta de una mesa (o de varias unidas, F1-9). Una mesa no está en dos cuentas abiertas a la
// vez (F1-7): lo garantiza el servicio con Mesa.cuentaActual y, como respaldo, el índice único parcial
// sobre mesas.mesa. Los montos (COP enteros) los calcula el servidor desde las rondas (totales.js).
// Cambios: solo desde salon/cuentas.service.js, en transacción y «tocando» la cuenta ($inc version).
export const CANALES_CUENTA = ['salon'] // para_llevar y domicilio: Fase 6
export const MAX_COMENSALES = 50
export const MAX_MESAS_POR_CUENTA = 10

const entero = (campo) => ({ validator: Number.isInteger, message: `${campo} debe ser un número entero` })
const montoCOP = (campo) => ({ type: Number, required: true, default: 0, min: 0, validate: entero(campo) })
// Impuestos, propina y descuento existen pero quedan en null hasta decidirlos en la Fase 3
const reservadoFase3 = (campo) => ({
    type: Number,
    default: null,
    validate: { validator: (v) => v === null, message: `${campo} se define en la Fase 3` },
})

// Copia de la mesa al abrir (la cuenta conserva qué mesa era aunque luego se edite o se borre)
const mesaDeCuentaSchema = new mongoose.Schema({
    mesa: { type: mongoose.Schema.Types.ObjectId, ref: 'Mesa', required: true },
    numero: { type: Number, required: true, min: 1 },
    nombre: { type: String, trim: true, maxlength: 40, default: '' },
    zona: { type: mongoose.Schema.Types.ObjectId, ref: 'Zona', required: true },
    zonaNombre: { type: String, trim: true, maxlength: 40, default: '' },
}, { _id: false })

const cuentaSchema = new mongoose.Schema({
    // «C-000123» (contador atómico «cuenta»; los huecos son aceptables)
    codigo: { type: String, required: true, immutable: true, match: /^C-\d{6,}$/ },
    canal: { type: String, required: true, enum: CANALES_CUENTA, default: 'salon' },
    mesas: {
        type: [mesaDeCuentaSchema],
        validate: [
            { validator: (v) => v.length >= 1 && v.length <= MAX_MESAS_POR_CUENTA, message: `Una cuenta de salón tiene entre 1 y ${MAX_MESAS_POR_CUENTA} mesas` },
            { validator: (v) => new Set(v.map((m) => String(m.mesa))).size === v.length, message: 'Hay mesas repetidas en la cuenta' },
        ],
    },
    // Responsable (F1-17: cualquiera con el permiso puede operar la cuenta; el Evento dice quién lo hizo)
    mesero: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    comensales: { type: Number, required: true, min: 1, max: MAX_COMENSALES, validate: entero('Los comensales') },
    estado: { type: String, required: true, enum: ESTADOS_CUENTA, default: 'abierta' },
    // Número de la última ronda enviada (la del borrador es ultimaRonda + 1)
    ultimaRonda: { type: Number, required: true, default: 0, min: 0, validate: entero('La ronda') },
    subtotal: montoCOP('El subtotal'),   // rondas enviadas, sin anulados
    pendiente: montoCOP('El pendiente'), // ronda en borrador
    impuestos: reservadoFase3('Los impuestos'),
    propina: reservadoFase3('La propina'),
    descuento: reservadoFase3('El descuento'),
    total: montoCOP('El total'),
    abiertaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    abiertaEn: { type: Date, required: true },
    cerradaPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', default: null },
    cerradaEn: { type: Date, default: null },
    motivoCierre: { type: String, trim: true, maxlength: 300, default: '' },
    notas: { type: String, trim: true, maxlength: 300, default: '' },
    // Se incrementa con cada cambio: serializa operaciones concurrentes y permite el 409 CUENTA_MODIFICADA
    version: { type: Number, required: true, default: 0, min: 0, validate: entero('La versión') },
    // 2.2 · Lo que marcan cocina y barra (y el servir): contador aparte para no invalidar la
    // versionEsperada de la tablet del mesero. Sin el campo (cuentas anteriores) = 0
    versionCocina: { type: Number, default: 0, min: 0, validate: entero('La versión de cocina') },
}, { timestamps: true, collection: 'cuentas' })

/** Invariantes entre campos de una cuenta: [{ campo, mensaje }]. Los usa el esquema y el verificador. */
export const problemasDeCuenta = (cuenta) => {
    const problemas = []
    const anotar = (campo, mensaje) => problemas.push({ campo, mensaje })
    // total = subtotal mientras impuestos, propina y descuento sean null (Fase 3: subtotal + impuestos + propina − descuento)
    if (Number.isInteger(cuenta.subtotal) && cuenta.total !== cuenta.subtotal) anotar('total', 'El total no coincide con el subtotal')
    if (!ESTADOS_CUENTA_ABIERTA.includes(cuenta.estado)) {
        if (!cuenta.cerradaEn) anotar('cerradaEn', 'Una cuenta cerrada registra cuándo se cerró')
        if (!cuenta.cerradaPor) anotar('cerradaPor', 'Una cuenta cerrada registra quién la cerró')
        if (cuenta.pendiente !== 0) anotar('pendiente', 'Una cuenta cerrada no tiene ítems pendientes')
        if (['cancelada', 'cerrada_sin_cobro'].includes(cuenta.estado) && !cuenta.motivoCierre) {
            anotar('motivoCierre', 'Cancelar o cerrar sin cobro exige un motivo')
        }
    } else if (cuenta.cerradaEn || cuenta.cerradaPor) {
        anotar('cerradaEn', 'Una cuenta abierta no tiene datos de cierre')
    }
    return problemas
}

cuentaSchema.pre('validate', function () {
    for (const { campo, mensaje } of problemasDeCuenta(this)) this.invalidate(campo, mensaje)
})

cuentaSchema.index({ codigo: 1 }, { unique: true })
// Una mesa en una sola cuenta abierta (F1-7)
cuentaSchema.index(
    { 'mesas.mesa': 1 },
    { unique: true, partialFilterExpression: { estado: { $in: ESTADOS_CUENTA_ABIERTA } }, name: 'mesa_en_una_cuenta_abierta' },
)
cuentaSchema.index({ estado: 1, abiertaEn: -1 })   // cuentas abiertas (plano y «Cuentas abiertas»)
cuentaSchema.index({ 'mesas.mesa': 1, abiertaEn: -1 }) // historial de una mesa (409 MESA_CON_HISTORIAL)
cuentaSchema.index({ cerradaEn: -1 })                  // verificador: cerradas recientemente

export default mongoose.model('Cuenta', cuentaSchema)
