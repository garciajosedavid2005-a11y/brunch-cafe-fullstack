import mongoose from 'mongoose'
import { FORMATO_CODIGO } from '../catalogo/estacion.model.js'

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
    // Claves del catálogo (src/modulos/identidad/permisos.js) que autorizan las rutas.
    // El rol admin tiene ["*"] (todos los permisos).
    permisos: {
        type: [String],
        default: []
    },
    // 2.5b · Estaciones del KDS que el rol ve y opera (códigos de estación: no cambian y son los de los
    // canales SSE). Sin el campo o vacío = ninguna (cerrado por defecto); el comodín "*" las ve todas.
    // Sin valor por defecto: así la migración 2.5b distingue «nunca asignado» de «el admin las quitó».
    estaciones: {
        type: [{ type: String, match: FORMATO_CODIGO }],
        default: undefined,
        validate: {
            validator: (lista) => !lista || (lista.length <= 50 && new Set(lista).size === lista.length),
            message: 'Las estaciones del rol no pueden repetirse (máximo 50)',
        },
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