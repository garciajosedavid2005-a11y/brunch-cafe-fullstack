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