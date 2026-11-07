import mongoose from 'mongoose'

// Grupo de modificadores reutilizable (1.3, F1-4): «Leche», «Tamaño», «Término del huevo»… Los
// productos lo referencian en `Producto.gruposModificadores`. Reglas del grupo (también en el
// esquema, no solo en la API):
//   - min ≤ max y max ≤ número de opciones (cuenta todas: agotar una opción no invalida el grupo);
//   - obligatorio ⇔ min ≥ 1 (un grupo «opcional» con mínimo 1 sería obligatorio de hecho);
//   - recargo entero en COP ≥ 0; nombres de opción únicos dentro del grupo.
// Cada opción tiene su propio _id estable: la comanda de 1.4 guarda una copia con ese id.
// Concurrencia optimista (__v): dos ediciones de la misma versión no se pisan.
export const MAX_OPCIONES = 30
export const MAX_SELECCION = 20
export const MAX_RECARGO = 1_000_000
export const COLACION_NOMBRE = { locale: 'es', strength: 1 }

const entero = (campo) => ({ validator: Number.isInteger, message: `${campo} debe ser un número entero` })
const clave = (texto) => texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

const opcionSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, minlength: 1, maxlength: 40 },
    precioExtra: { type: Number, required: true, default: 0, min: 0, max: MAX_RECARGO, validate: entero('El recargo') },
    disponible: { type: Boolean, required: true, default: true },
})

const grupoSchema = new mongoose.Schema({
    nombre: { type: String, required: true, trim: true, minlength: 2, maxlength: 40 },
    obligatorio: { type: Boolean, required: true },
    min: { type: Number, required: true, min: 0, max: MAX_SELECCION, validate: entero('El mínimo') },
    max: { type: Number, required: true, min: 1, max: MAX_SELECCION, validate: entero('El máximo') },
    opciones: {
        type: [opcionSchema],
        validate: [
            { validator: (v) => v.length >= 1 && v.length <= MAX_OPCIONES, message: `El grupo debe tener entre 1 y ${MAX_OPCIONES} opciones` },
            { validator: (v) => new Set(v.map((o) => clave(o.nombre))).size === v.length, message: 'Hay opciones repetidas' },
        ],
    },
    activo: { type: Boolean, required: true, default: true },
    // Datos de ejemplo del seed (F1-4): el admin los edita o reemplaza
    ejemplo: { type: Boolean, required: true, default: false },
}, { timestamps: true, optimisticConcurrency: true, collection: 'grupos_modificadores' })

// Reglas entre campos (se comprueban sobre el documento completo, también al editar parcialmente)
grupoSchema.pre('validate', function () {
    const { min, max, obligatorio, opciones } = this
    if (![min, max].every(Number.isInteger)) return
    if (min > max) this.invalidate('min', 'El mínimo no puede ser mayor que el máximo')
    if (Array.isArray(opciones) && opciones.length && max > opciones.length) {
        this.invalidate('max', `El máximo no puede superar el número de opciones (${opciones.length})`)
    }
    if (obligatorio === true && min < 1) this.invalidate('min', 'Un grupo obligatorio exige elegir al menos 1 opción')
    if (obligatorio === false && min >= 1) this.invalidate('obligatorio', 'Con un mínimo de 1 o más, el grupo es obligatorio')
})

grupoSchema.index({ nombre: 1 }, { unique: true, collation: COLACION_NOMBRE })

export default mongoose.model('GrupoModificadores', grupoSchema)
