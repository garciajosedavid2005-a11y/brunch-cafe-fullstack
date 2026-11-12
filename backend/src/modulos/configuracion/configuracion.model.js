import mongoose from 'mongoose'

// Configuración del negocio editable desde el admin (0.8, decisión 15).
// Un documento por clave; por ahora solo "horarios". Las horas son en punto ("HH:00")
// y de America/Bogota; "desde" y "hasta" son la primera y la última hora que se pueden elegir.
const HORA_EN_PUNTO = /^([01]\d|2[0-3]):00$/

const hora = { type: String, required: true, match: HORA_EN_PUNTO }
const rango = new mongoose.Schema({ desde: hora, hasta: hora }, { _id: false })

const configuracionSchema = new mongoose.Schema({
    clave: {
        type: String,
        required: true,
        unique: true,
        enum: ['horarios'],
    },
    domicilio: {
        desde: hora,
        hasta: hora,
        anticipacionMinutos: { type: Number, required: true, min: 0, max: 480 },
    },
    reservas: {
        entreSemana: { type: rango, required: true }, // lunes a viernes
        finDeSemana: { type: rango, required: true }, // sábado y domingo
    },
    actualizadoPor: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        default: null,
    },
    // 1.15 · Control de versión como las cuentas: cada cambio real la sube en 1 y el PUT exige la que
    // leyó el admin (409 si otro guardó antes). Sin el campo (documentos anteriores) = 0, sin migración
    version: {
        type: Number,
        default: 0,
        min: 0,
        validate: { validator: Number.isInteger, message: 'La versión debe ser un entero' },
    },
    // Cuándo cambiaron de verdad los horarios («Última modificación»). `updatedAt` no sirve: hasta
    // 1.15 lo movía el seed de cada arranque. null = nunca se cambiaron (o se cambiaron antes de 1.15)
    modificadoEn: {
        type: Date,
        default: null,
    },
}, {
    timestamps: true,
    collection: 'configuraciones',
})

export default mongoose.model('Configuracion', configuracionSchema)
