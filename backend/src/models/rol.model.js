import mongoose from 'mongoose'

const rolSchema = new mongoose.Schema({
    // Identificador del rol ("admin", "cliente", "mesero"...). No cambia después de creado.
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
    // Claves del catálogo (src/libs/permisos.js) que autorizan las rutas.
    // El rol admin tiene ["*"] (todos los permisos).
    permisos: {
        type: [String],
        default: []
    },
    // Los roles de sistema (admin, cliente y los de staff sembrados) no se pueden eliminar
    esSistema: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true
})

export default mongoose.model('Rol', rolSchema)