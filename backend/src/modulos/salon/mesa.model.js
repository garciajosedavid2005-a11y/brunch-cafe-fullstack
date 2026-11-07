import mongoose from 'mongoose'
import { ESTADOS_MESA } from '../compartido/estadosSalon.js'

// Estados de mesa (F1-2). La máquina de transiciones está en compartido/estadosSalon.js (1.4) y los
// cambia la operación del salón (salon/cuentas.service.js); la configuración (1.2) nunca los asigna.
export { ESTADOS_MESA }
export const CAPACIDAD_MAXIMA = 20
export const NUMERO_MAXIMO = 999

const entero = (campo) => ({ validator: Number.isInteger, message: `${campo} debe ser un número entero` })

// Posición opcional en el plano (cuadrícula en %; la usa el plano de 1.6 si existe)
const posicionSchema = new mongoose.Schema({
    x: { type: Number, required: true, min: 0, max: 100, validate: entero('La posición x') },
    y: { type: Number, required: true, min: 0, max: 100, validate: entero('La posición y') },
}, { _id: false })

const mesaSchema = new mongoose.Schema({
    numero: { type: Number, required: true, min: 1, max: NUMERO_MAXIMO, validate: entero('El número') },
    nombre: { type: String, trim: true, maxlength: 40, default: '' },
    zona: { type: mongoose.Schema.Types.ObjectId, ref: 'Zona', required: true },
    capacidad: { type: Number, required: true, min: 1, max: CAPACIDAD_MAXIMA, validate: entero('La capacidad') },
    estado: { type: String, required: true, enum: ESTADOS_MESA, default: 'libre' },
    // Solo se unen mesas de la misma zona marcadas como combinables (F1-1)
    combinable: { type: Boolean, required: true, default: false },
    activa: { type: Boolean, required: true, default: true },
    posicion: { type: posicionSchema, default: null },
    // 1.4 · Cuenta abierta que ocupa la mesa (null = ninguna). Las mesas anteriores a 1.4 no tienen el
    // campo y cuentan como sin cuenta: el filtro { cuentaActual: null } también encuentra los ausentes.
    cuentaActual: { type: mongoose.Schema.Types.ObjectId, ref: 'Cuenta', default: null },
    ejemplo: { type: Boolean, required: true, default: false },
}, { timestamps: true })

mesaSchema.index({ numero: 1 }, { unique: true })
mesaSchema.index({ zona: 1, numero: 1 }) // plano por zona (1.5/1.6) y conteo por zona

export default mongoose.model('Mesa', mesaSchema)
