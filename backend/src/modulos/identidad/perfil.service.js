// Servicio único del perfil de la sesión (lo usan /api/v1/cliente/perfil y sus alias).
import bcrypt from 'bcryptjs'
import Usuario from './usuario.model.js'
import { AppError, notFound } from '../compartido/errors.js'
import { invalidarSesionUsuario } from './sesiones.js'

const SIN_SECRETOS = '-contraseña -tokenVersion'
const CORREO_OCUPADO = () => new AppError(409, 'EMAIL_IN_USE', 'Ese correo ya está asociado a otra cuenta.')
// Cierre (Brayan, 2026-11-20) · La fecha de nacimiento queda fija tras el primer registro (si no, el cliente elegiría
// el mes de su 10 % de cumpleaños); solo el admin la corrige desde Admin › Usuarios
const FECHA_FIJA = () => new AppError(409, 'FECHA_NACIMIENTO_FIJA',
    'Tu fecha de nacimiento ya está registrada. Para corregirla, contacta al café.')
const mismaFecha = (a, b) => (a ? new Date(a).getTime() : null) === (b ? new Date(b).getTime() : null)

export const obtenerPerfil = async (usuarioId) => {
    const usuario = await Usuario.findById(usuarioId).select(SIN_SECRETOS).populate('rol').lean()
    if (!usuario) throw notFound('Usuario no encontrado')
    return usuario
}

/** datos: salida de perfilSchema (correo ya normalizado). */
export const actualizarPerfil = async (usuarioId, { nombre, apellido, correo, telefono, fechaNacimiento, alergias, preferencias }) => {
    // Mismo criterio que el registro: sin distinguir mayúsculas
    const ocupado = await Usuario.exists({ correo, _id: { $ne: usuarioId } }).collation({ locale: 'en', strength: 2 })
    if (ocupado) throw CORREO_OCUPADO()
    const cambios = { nombre, apellido, correo }
    if (telefono !== undefined) cambios.telefono = telefono
    // 6.4 · Omitidos = se conservan. Cierre · La fecha solo se pone si no hay ninguna (escritura condicional: dos
    // pestañas a la vez → una gana y la otra 409); reenviar la misma no cambia nada
    const filtro = { _id: usuarioId }
    if (fechaNacimiento !== undefined) {
        const actual = await Usuario.findById(usuarioId).select('fechaNacimiento').lean()
        if (!actual) throw notFound('Usuario no encontrado')
        if (!mismaFecha(actual.fechaNacimiento, fechaNacimiento)) {
            if (actual.fechaNacimiento) throw FECHA_FIJA()
            cambios.fechaNacimiento = fechaNacimiento
            filtro.fechaNacimiento = null // ausente o null
        }
    }
    if (alergias !== undefined) cambios.alergias = alergias
    if (preferencias !== undefined) cambios.preferencias = preferencias
    try {
        const usuario = await Usuario.findOneAndUpdate(filtro, { $set: cambios }, { returnDocument: 'after', runValidators: true })
            .select(SIN_SECRETOS).populate('rol').lean()
        if (!usuario) {
            // La fecha llegó de otra pestaña entre la lectura y la escritura
            if (filtro.fechaNacimiento === null && await Usuario.exists({ _id: usuarioId })) throw FECHA_FIJA()
            throw notFound('Usuario no encontrado')
        }
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
