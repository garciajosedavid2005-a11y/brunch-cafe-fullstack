import Usuario from './usuario.model.js'
import Rol from './rol.model.js'
import { ROL_CLIENTE } from './permisos.js'
import { nombreCorto } from '../compartido/nombres.js'
import { fechaLocal } from '../compartido/fechas.js'
import { CONSENTIMIENTO_VERSION } from './consentimiento.js'

// 6.5 (F6-8, F6-e) · Lo que el personal ve de un cliente: nombre corto, alergias y preferencias (y si cumple años este
// mes, para 6.7). Nunca el correo ni el teléfono completos: en la búsqueda van enmascarados, en la cuenta no van.
export const MAX_RESULTADOS = 5

/** Aviso de alergias y preferencias (null si no tiene ninguna). */
export const avisoCliente = (u) => (u?.alergias || u?.preferencias
    ? { alergias: u.alergias || '', preferencias: u.preferencias || '' }
    : null)

/** «an***@example.com»: las 2 primeras letras y el dominio. */
export const enmascararCorreo = (correo = '') => {
    const [usuario, dominio] = String(correo).split('@')
    if (!dominio) return ''
    return `${usuario.slice(0, 2)}${'*'.repeat(Math.max(3, usuario.length - 2))}@${dominio}`
}

/** «*******4567»: solo los 4 últimos dígitos. */
export const enmascararTelefono = (telefono = '') => {
    const digitos = String(telefono).replace(/\D/g, '')
    return digitos ? `${'*'.repeat(Math.max(0, digitos.length - 4))}${digitos.slice(-4)}` : ''
}

/** ¿Cumple años en el mes de hoy (hora de Bogotá)? La fecha de nacimiento es un día a las 00:00 UTC. */
export const cumpleEsteMes = (fechaNacimiento, ahora = new Date()) => Boolean(fechaNacimiento)
    && new Date(fechaNacimiento).toISOString().slice(5, 7) === fechaLocal(ahora).slice(5, 7)

// Sin las alergias ni las preferencias (dato de salud): se ven solo después de identificar al cliente en una cuenta.
// `tieneAvisos` le dice al personal que hay algo que revisar
const formatoBusqueda = (u, ahora) => ({
    id: String(u._id), nombre: nombreCorto(u), tieneAvisos: Boolean(u.alergias || u.preferencias),
    correo: enmascararCorreo(u.correo), telefono: enmascararTelefono(u.telefono), cumpleEsteMes: cumpleEsteMes(u.fechaNacimiento, ahora),
})

const CAMPOS = 'nombre apellido correo telefono alergias preferencias fechaNacimiento'

/**
 * Busca clientes activos por correo exacto (sin distinguir mayúsculas) o por teléfono con los mismos dígitos (7 a 15).
 * Coincidencia exacta: un pedazo de correo o de número no lista a nadie (no sirve para recorrer la base de clientes).
 */
export const buscarClientes = async (texto, { ahora = new Date() } = {}) => {
    const rol = await Rol.findOne({ nombre: ROL_CLIENTE }).select('_id').lean()
    if (!rol) return { clientes: [] }
    // Solo clientes con el consentimiento de datos vigente (Ley 1581): sin él, sus datos no se tratan
    const base = { rol: rol._id, activo: { $ne: false }, eliminado: { $ne: true }, 'consentimiento.version': CONSENTIMIENTO_VERSION }
    const valor = String(texto).trim()
    let usuarios = []
    if (valor.includes('@')) {
        usuarios = await Usuario.find({ ...base, correo: valor.toLowerCase() }).collation({ locale: 'en', strength: 2 })
            .select(CAMPOS).limit(MAX_RESULTADOS).lean()
    } else {
        const digitos = valor.replace(/\D/g, '')
        if (digitos.length >= 7 && digitos.length <= 15) {
            // Los teléfonos se guardaron con espacios o guiones: mismos dígitos en el mismo orden, sin nada más
            const patron = `^\\D*${digitos.split('').join('\\D*')}\\D*$`
            usuarios = await Usuario.find({ ...base, telefono: { $regex: patron } }).select(CAMPOS).limit(MAX_RESULTADOS).lean()
        }
    }
    return { clientes: usuarios.map((u) => formatoBusqueda(u, ahora)) }
}

/** El cliente activo con ese id (o null): para identificarlo en una cuenta. */
export const clienteActivo = async (id) => {
    const rol = await Rol.findOne({ nombre: ROL_CLIENTE }).select('_id').lean()
    if (!rol) return null
    return Usuario.findOne({ _id: id, rol: rol._id, activo: { $ne: false }, eliminado: { $ne: true }, 'consentimiento.version': CONSENTIMIENTO_VERSION })
        .select('nombre apellido alergias preferencias').lean()
}
