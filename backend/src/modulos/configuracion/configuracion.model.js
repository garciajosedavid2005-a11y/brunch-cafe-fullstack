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
}, {
    timestamps: true,
    collection: 'configuraciones',
})

export default mongoose.model('Configuracion', configuracionSchema)
