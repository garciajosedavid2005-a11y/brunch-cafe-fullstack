// Servicio único del perfil de la sesión (lo usan /api/v1/cliente/perfil y sus alias).
import bcrypt from 'bcryptjs'
import Usuario from '../../models/usuario.model.js'
import { AppError, notFound } from '../../libs/errors.js'
import { invalidarSesionUsuario } from '../../libs/sesiones.js'

const SIN_SECRETOS = '-contraseña -tokenVersion'
const CORREO_OCUPADO = () => new AppError(409, 'EMAIL_IN_USE', 'Ese correo ya está asociado a otra cuenta.')

export const obtenerPerfil = async (usuarioId) => {
    const usuario = await Usuario.findById(usuarioId).select(SIN_SECRETOS).populate('rol').lean()
    if (!usuario) throw notFound('Usuario no encontrado')
    return usuario
}

/** datos: salida de perfilSchema (correo ya normalizado). */
export const actualizarPerfil = async (usuarioId, { nombre, apellido, correo, telefono }) => {
    // Mismo criterio que el registro: sin distinguir mayúsculas
    const ocupado = await Usuario.exists({ correo, _id: { $ne: usuarioId } }).collation({ locale: 'en', strength: 2 })
    if (ocupado) throw CORREO_OCUPADO()
    const cambios = { nombre, apellido, correo }
    if (telefono !== undefined) cambios.telefono = telefono
    try {
        const usuario = await Usuario.findByIdAndUpdate(usuarioId, { $set: cambios }, { returnDocument: 'after', runValidators: true })
            .select(SIN_SECRETOS).populate('rol').lean()
        if (!usuario) throw notFound('Usuario no encontrado')
        invalidarSesionUsuario(usuarioId) // /auth/me refleja el cambio de inmediato
        return usuario
    } catch (error) {
        if (error?.code === 11000) throw CORREO_OCUPADO()
        throw error
    }
}

/** Cambia la contraseña y sube tokenVersion (cierra las demás sesiones). Devuelve el usuario. */
export const cambiarContrasena = async (usuarioId, { actual, nueva }) => {
    const usuario = await Usuario.findById(usuarioId)
    if (!usuario) throw notFound('Usuario no encontrado')
    if (!(await bcrypt.compare(actual, usuario.contraseña))) {
        throw new AppError(400, 'WRONG_PASSWORD', 'La contraseña actual no es correcta.')
    }
    usuario.contraseña = await bcrypt.hash(nueva, 10)
    usuario.tokenVersion = (usuario.tokenVersion || 0) + 1
    await usuario.save()
    invalidarSesionUsuario(usuario._id)
    return usuario
}
