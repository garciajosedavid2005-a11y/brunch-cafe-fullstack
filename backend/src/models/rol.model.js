import mongoose from 'mongoose'

const rolSchema = new mongoose.Schema({
    // Identificador del rol ("admin", "cliente"). Es el valor que viaja en el token
    // y el que compara authorizeRole, por eso no se debe cambiar en los roles de sistema.
    nombre: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    // Nombre para mostrar en el dashboard (ej. "Administrador")
    etiqueta: {
        type: String,
        trim: true,
        default: ''
    },
    descripcion: {
        type: String,
        trim: true,
        maxlength: 300,
        default: ''
    },
    // Lista informativa de lo que puede hacer el rol (no se usa para autorizar)
    permisos: {
        type: [String],
        default: []
    },
    // Los roles de sistema (admin y cliente) no se pueden eliminar
    esSistema: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
})

export default mongoose.model('Rol', rolSchema)