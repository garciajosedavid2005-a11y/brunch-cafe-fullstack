import mongoose from 'mongoose'
import { ESTADOS_CUENTA, ESTADOS_CUENTA_ABIERTA } from '../compartido/estadosSalon.js'

// 1.4 · Cuenta de una mesa (o de varias unidas, F1-9). Una mesa no está en dos cuentas abiertas a la
// vez (F1-7): lo garantiza el servicio con Mesa.cuentaActual y, como respaldo, el índice único parcial
// sobre mesas.mesa. Los montos (COP enteros) los calcula el servidor desde las rondas (totales.js).
// Cambios: solo desde salon/cuentas.service.js, en transacción y «tocando» la cuenta ($inc version).
// 6.3 (F6-3) · para_llevar: cuenta sin mesas, con el nombre o el teléfono de quien la recoge. El domicilio sigue en Pedido (F6-1)
export const CANALES_CUENTA = ['salon', 'para_llevar']
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

// 3b.2 · División de la cuenta en la caja (F3b-3, F3b-4): se fija al cobrar la primera parte y desde
// entonces la cuenta no admite cambios (solo cobrar lo que falta o cerrarla sin cobro). Sin el campo = sin dividir
export const MODOS_DIVISION = ['iguales', 'items']
export const MAX_PARTES = 20
const divisionSchema = new mongoose.Schema({
    modo: { type: String, required: true, enum: MODOS_DIVISION },
    partes: { type: Number, default: null, min: 2, max: MAX_PARTES, validate: { validator: (v) => v === null || Number.isInteger(v), message: 'Las partes deben ser un número entero' } },
    cobradas: { type: Number, required: true, min: 0, validate: entero('Las partes cobradas') },
    cobrado: { type: Number, required: true, min: 0, validate: entero('Lo cobrado') }, // consumo ya cobrado (sin propinas)
    itemsCobrados: { type: [mongoose.Schema.Types.ObjectId], default: [] },
}, { _id: false })

// 6.3 · Quién recoge el pedido para llevar (al menos uno de los dos)
export const MAX_NOMBRE_PARA_LLEVAR = 60
// Una para llevar cobrada sigue en el KDS y en la lista «Para llevar» hasta 12 h, mientras le falte algo por entregar
export const VENTANA_PARA_LLEVAR_MS = 12 * 60 * 60 * 1000
const paraLlevarSchema = new mongoose.Schema({
    nombre: { type: String, trim: true, maxlength: MAX_NOMBRE_PARA_LLEVAR, default: '' },
    telefono: { type: String, trim: true, match: /^$|^\d{7,15}$/, default: '' },
}, { _id: false })

const cuentaSchema = new mongoose.Schema({
    // «C-000123» (contador atómico «cuenta»; los huecos son aceptables)
    codigo: { type: String, required: true, immutable: true, match: /^C-\d{6,}$/ },
    canal: { type: String, required: true, enum: CANALES_CUENTA, default: 'salon' },
    mesas: {
        type: [mesaDeCuentaSchema],
        validate: [
            { validator: (v) => v.length <= MAX_MESAS_POR_CUENTA, message: `Una cuenta tiene como máximo ${MAX_MESAS_POR_CUENTA} mesas` }, // el mínimo, en problemasDeCuenta
            { validator: (v) => new Set(v.map((m) => String(m.mesa))).size === v.length, message: 'Hay mesas repetidas en la cuenta' },
        ],
    },
    paraLlevar: { type: paraLlevarSchema, default: null }, // 6.3 · solo en canal para_llevar
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
    // 4.6 · Reserva sentada con esta cuenta (null = sin reserva; sin el campo, las anteriores a 4.6): al cerrar
    // la cuenta, la reserva pasa a «completada»
    reserva: { type: mongoose.Schema.Types.ObjectId, ref: 'Reserva', default: null },
    // Se incrementa con cada cambio: serializa operaciones concurrentes y permite el 409 CUENTA_MODIFICADA
    version: { type: Number, required: true, default: 0, min: 0, validate: entero('La versión') },
    // 2.2 · Lo que marcan cocina y barra (y el servir): contador aparte para no invalidar la
    // versionEsperada de la tablet del mesero. Sin el campo (cuentas anteriores) = 0
    versionCocina: { type: Number, default: 0, min: 0, validate: entero('La versión de cocina') },
    division: { type: divisionSchema, default: null },
}, { timestamps: true, collection: 'cuentas' })

/** Invariantes entre campos de una cuenta: [{ campo, mensaje }]. Los usa el esquema y el verificador. */
export const problemasDeCuenta = (cuenta) => {
    const problemas = []
    const anotar = (campo, mensaje) => problemas.push({ campo, mensaje })
    // total = subtotal mientras impuestos, propina y descuento sean null (Fase 3: subtotal + impuestos + propina − descuento)
    if (Number.isInteger(cuenta.subtotal) && cuenta.total !== cuenta.subtotal) anotar('total', 'El total no coincide con el subtotal')
    // 6.3 · El salón tiene mesas; para llevar, ninguna y el nombre o el teléfono de quien recoge
    const nMesas = cuenta.mesas?.length ?? 0
    if (cuenta.canal === 'para_llevar') {
        if (nMesas) anotar('mesas', 'Una cuenta para llevar no tiene mesas')
        if (!cuenta.paraLlevar?.nombre && !cuenta.paraLlevar?.telefono) anotar('paraLlevar', 'Indica el nombre o el teléfono de quien recoge')
    } else {
        if (nMesas < 1) anotar('mesas', `Una cuenta de salón tiene entre 1 y ${MAX_MESAS_POR_CUENTA} mesas`)
        if (cuenta.paraLlevar) anotar('paraLlevar', 'Solo una cuenta para llevar tiene quién la recoge')
    }
    // 3b.2 · División coherente: en partes iguales hay N y ningún ítem; por ítems, sin N; nunca más de lo que hay
    const d = cuenta.division
    if (d) {
        if (d.modo === 'iguales' && (!d.partes || d.itemsCobrados?.length)) anotar('division', 'Las partes iguales llevan N y ningún ítem')
        if (d.modo === 'items' && d.partes !== null && d.partes !== undefined) anotar('division', 'Por ítems no lleva número de partes')
        if (d.modo === 'iguales' && d.partes && d.cobradas > d.partes) anotar('division', 'Hay más partes cobradas que partes')
        if (Number.isInteger(cuenta.total) && d.cobrado > cuenta.total) anotar('division', 'Lo cobrado supera el total de la cuenta')
    }
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
// Una mesa en una sola cuenta abierta (F1-7). 6.3 · Solo las del salón: una para llevar no tiene mesas y, sin el
// filtro por canal, dos abiertas a la vez chocarían en el índice único (el arreglo vacío se indexa como un valor).
// Migración 6.3: reemplaza el índice anterior (`mesa_en_una_cuenta_abierta`, sin canal) por este
export const INDICE_MESA_ABIERTA = 'mesa_en_una_cuenta_abierta_salon'
cuentaSchema.index(
    { 'mesas.mesa': 1 },
    { unique: true, partialFilterExpression: { estado: { $in: ESTADOS_CUENTA_ABIERTA }, canal: 'salon' }, name: INDICE_MESA_ABIERTA },
)
cuentaSchema.index({ estado: 1, abiertaEn: -1 })   // cuentas abiertas (plano y «Cuentas abiertas»)
cuentaSchema.index({ 'mesas.mesa': 1, abiertaEn: -1 }) // historial de una mesa (409 MESA_CON_HISTORIAL)
cuentaSchema.index({ cerradaEn: -1 })                  // verificador: cerradas recientemente

export default mongoose.model('Cuenta', cuentaSchema)
