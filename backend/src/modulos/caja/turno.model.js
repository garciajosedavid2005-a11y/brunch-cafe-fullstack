import mongoose from 'mongoose'
import { METODOS_PAGO_CAJA } from './comprobante.model.js'

// Fase 3b · Turno de caja (PLAN_FASE_3B, F3b-1 y F3b-2). Una sola caja: como mucho un turno abierto a la vez
// (índice único parcial). Se abre con una base en efectivo y se cierra con el arqueo: por método, lo contado
// frente a lo esperado y la diferencia (contado − esperado). Cerrado, no cambia más.
export const ESTADOS_TURNO = ['abierto', 'cerrado']
export const PREFIJO_TURNO = 'T-'
export const codigoTurno = (numero) => `${PREFIJO_TURNO}${String(numero).padStart(6, '0')}`

const entero = (campo) => ({ validator: Number.isSafeInteger, message: `${campo} debe ser un entero en COP` })
const persona = new mongoose.Schema({
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario', required: true },
    nombre: { type: String, trim: true, default: '' }, // copia: «Carla C.»
}, { _id: false })

const arqueoSchema = new mongoose.Schema({
    metodo: { type: String, required: true, enum: METODOS_PAGO_CAJA },
    esperado: { type: Number, required: true, validate: entero('Lo esperado') }, // puede ser negativo con devoluciones
    contado: { type: Number, required: true, min: 0, validate: entero('Lo contado') },
    diferencia: { type: Number, required: true, validate: entero('La diferencia') },
}, { _id: false })

const turnoSchema = new mongoose.Schema({
    numero: { type: Number, required: true, min: 1, validate: entero('El número') },
    codigo: { type: String, required: true },
    estado: { type: String, required: true, enum: ESTADOS_TURNO, default: 'abierto' },
    base: { type: Number, required: true, min: 0, validate: entero('La base') },
    abiertoPor: { type: persona, required: true },
    abiertoEn: { type: Date, required: true },
    cerradoPor: { type: persona, default: null },
    cerradoEn: { type: Date, default: null },
    arqueo: { type: [arqueoSchema], default: [] },
    nota: { type: String, trim: true, maxlength: 300, default: '' },
    // Cada cobro «toca» el turno abierto ($inc): un cierre simultáneo choca con el cobro (WriteConflict)
    // y el que se reintenta ve el estado nuevo (no queda un comprobante en un turno ya cerrado)
    version: { type: Number, required: true, default: 0, min: 0 },
}, { timestamps: true, collection: 'turnosCaja' })

// Cerrado, no cambia más: se recuerda el estado leído de la BD y se rechaza guardar uno ya cerrado
turnoSchema.post('init', function () {
    this.$locals.estadoLeido = this.estado
})

turnoSchema.pre('validate', function () {
    if (this.$locals.estadoLeido === 'cerrado') this.invalidate('estado', 'Un turno cerrado no se modifica')
    if (new Set(this.arqueo.map((a) => a.metodo)).size !== this.arqueo.length) this.invalidate('arqueo', 'Un método repetido en el arqueo')
    if (this.codigo !== codigoTurno(this.numero)) this.invalidate('codigo', 'El código no corresponde al número')
    const cerrado = this.estado === 'cerrado'
    if (cerrado !== Boolean(this.cerradoEn && this.cerradoPor)) this.invalidate('cerradoEn', 'Un turno cerrado registra quién y cuándo (y uno abierto no)')
    if (!cerrado && this.arqueo.length) this.invalidate('arqueo', 'Un turno abierto no tiene arqueo')
    if (cerrado && this.arqueo.length !== METODOS_PAGO_CAJA.length) this.invalidate('arqueo', 'El arqueo lleva un renglón por método')
    for (const a of this.arqueo) if (a.diferencia !== a.contado - a.esperado) this.invalidate('arqueo', `La diferencia de ${a.metodo} no cuadra`)
})

turnoSchema.index({ numero: 1 }, { unique: true })
// Una sola caja: un único turno abierto
turnoSchema.index({ estado: 1 }, { unique: true, partialFilterExpression: { estado: 'abierto' }, name: 'un_turno_abierto' })
turnoSchema.index({ abiertoEn: -1 }) // historial de turnos

export default mongoose.model('TurnoCaja', turnoSchema)
