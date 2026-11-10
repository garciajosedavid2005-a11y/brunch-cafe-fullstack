import mongoose from 'mongoose'

const usuarioSchema = new mongoose.Schema({
    nombre: {
        type: String,
        required: true,
        trim: true
    },
    apellido: {
        type: String,
        required: true,
        trim: true
    },
    // Normalizado: sin espacios y en minúsculas (los registros antiguos pueden
    // tenerlo con mayúsculas; ver scripts/reportar-correos-duplicados.js)
    correo: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        unique: true
    },
    contraseña: {
        type: String,
        required: true
    },
    telefono: {
        type: String,
        trim: true
    },
    // Usuario desactivado = acceso cortado (los documentos sin el campo cuentan como activos)
    // Versión de las sesiones: subirla invalida todos los JWT emitidos antes
    // (cambio de contraseña, desactivación). Los tokens sin "tv" valen como 0.
    tokenVersion: {
        type: Number,
        default: 0,
        min: 0
    },
    passwordResetTokenHash: {
        type: String,
        select: false,
        index: { sparse: true },
    },
    passwordResetExpiresAt: {
        type: Date,
        select: false,
    },
    // Cuenta creada por el admin que todavía no definió su contraseña (1.5b). Sin el campo = ya la tiene.
    // Se quita al usar el enlace (restablecerContrasena).
    contraseñaPendiente: {
        type: Boolean,
        default: undefined,
    },
    activo: {
        type: Boolean,
        default: true
    },
    //Se relaciona con el rol del usuario, usando el ObjectId del rol
    rol: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rol',
        required: true
    }
}, {
    timestamps: true
})

export default mongoose.model('Usuario', usuarioSchema)