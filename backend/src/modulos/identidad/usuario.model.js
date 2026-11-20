import mongoose from 'mongoose'
import { esDireccionValida, MENSAJE_DIRECCION } from '../compartido/direccion.js'

// 6.4 (F6-8, F6-g) · Perfil del cliente. Todos los campos son opcionales con valor por defecto: los usuarios anteriores
// los leen vacíos (sin migración). La libreta guarda hasta 5 direcciones con UNA principal; el pedido sigue guardando
// su propia copia (borrar o editar una dirección no cambia los pedidos).
export const MAX_DIRECCIONES = 5
export const MAX_TEXTO_PERFIL = 200
const direccionSchema = new mongoose.Schema({
    etiqueta: { type: String, trim: true, maxlength: 30, default: '' },
    direccion: { type: String, required: true, trim: true, validate: { validator: esDireccionValida, message: MENSAJE_DIRECCION } },
    barrio: { type: String, required: true, trim: true, minlength: 3, maxlength: 40 },
    indicaciones: { type: String, trim: true, maxlength: 120, default: '' },
    principal: { type: Boolean, default: false },
})
const consentimientoSchema = new mongoose.Schema({
    version: { type: String, required: true, trim: true, maxlength: 20 },
    aceptadoEn: { type: Date, required: true },
}, { _id: false })

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
    // Última solicitud de recuperación con correo enviado: espera mínima entre correos a la misma cuenta.
    // Sin el campo (cuentas anteriores) = sin espera; no necesita migración.
    passwordResetSolicitadoEn: {
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
    // 3.8 · Cuenta del personal eliminada con historial (archivada): inactiva, fuera de listas y selectores,
    // con el correo liberado. Sin el campo = no eliminada (no necesita migración).
    eliminado: {
        type: Boolean,
        default: undefined,
    },
    eliminadoEn: {
        type: Date,
        default: undefined,
    },
    // Correo que tenía al archivarse (el campo correo pasa a una dirección interna para liberarlo)
    correoArchivado: {
        type: String,
        select: false,
    },
    // 6.4 · Fecha de nacimiento: el día del calendario a las 00:00 UTC (no es un instante; se muestra sin zona)
    fechaNacimiento: {
        type: Date,
        default: null,
        // También en el modelo (no solo en Zod): un día del calendario (00:00 UTC) desde 1900 y no futuro
        validate: {
            validator: (v) => v === null || (v >= new Date('1900-01-01T00:00:00.000Z') && v.getTime() % 86_400_000 === 0 && v.getTime() <= Date.now() + 86_400_000),
            message: 'La fecha de nacimiento no es válida',
        },
    },
    // 6.4 · Lo único del perfil que ve el personal (6.5): alergias y preferencias, texto libre
    alergias: { type: String, trim: true, maxlength: MAX_TEXTO_PERFIL, default: '' },
    preferencias: { type: String, trim: true, maxlength: MAX_TEXTO_PERFIL, default: '' },
    // Solo se modifica desde direcciones.service.js (con save: el validador de la principal no corre en updates)
    direcciones: {
        type: [direccionSchema],
        default: [],
        validate: [
            { validator: (v) => v.length <= MAX_DIRECCIONES, message: `Puedes guardar hasta ${MAX_DIRECCIONES} direcciones` },
            { validator: (v) => v.length === 0 || v.filter((d) => d.principal).length === 1, message: 'Una sola dirección es la principal' },
        ],
    },
    // 6.6 · Saldo de puntos (lo cambia solo fidelizacion/puntos.service.js junto con su movimiento). Puede quedar
    // negativo si se anula una compra cuyos puntos ya se gastaron (F6-c); con saldo negativo no se canjea
    puntos: { type: Number, default: 0, validate: { validator: Number.isSafeInteger, message: 'Los puntos son enteros' } },
    // 6.4 · Consentimiento de datos (Ley 1581): versión aceptada y cuándo. null = sin aceptar
    consentimiento: { type: consentimientoSchema, default: null },
    //Se relaciona con el rol del usuario, usando el ObjectId del rol
    rol: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Rol',
        required: true
    }
}, {
    timestamps: true
})

// Lista de meseros (1.5/1.7b): usuarios activos de los roles que atienden mesas. No destructivo.
usuarioSchema.index({ rol: 1, activo: 1 })

export default mongoose.model('Usuario', usuarioSchema)