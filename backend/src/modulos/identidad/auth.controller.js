import Usuario from './usuario.model.js'
import Rol from './rol.model.js'
import { ROL_CLIENTE } from './permisos.js'
import bcrypt from 'bcryptjs'
import mongoose from 'mongoose'
import { borrarCookieSesion, COOKIE_SESION } from './cookies.js'
import { abrirSesion, duracionSesionMs } from './duracionSesion.js'
import { config } from '../../config.js'
import { logger } from '../compartido/logger.js'
import { verificarToken } from './jwt.js'
import { obtenerSesion, invalidarSesionUsuario } from './sesiones.js'
import { AppError } from '../compartido/errors.js'
import { solicitarRecuperacion as solicitar, restablecerContrasena as restablecer } from './recuperacion.service.js'

// Comparación sin distinguir mayúsculas: las cuentas antiguas pueden tener
// el correo guardado con mayúsculas (ver scripts/reportar-correos-duplicados.js)
const SIN_MAYUSCULAS = { locale: 'en', strength: 2 }

const MENSAJE_LOGIN = 'Correo o contraseña incorrectos.'
const MENSAJE_REGISTRO = 'No fue posible completar el registro con esos datos. Si ya tienes una cuenta, inicia sesión.'

// Hash fijo para comparar aunque el correo no exista (tiempo de respuesta similar)
const HASH_FICTICIO = bcrypt.hashSync('contraseña-ficticia-para-tiempo-constante', 10)

const usuarioPublico = (usuario, rol) => ({
    id: usuario._id,
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    correo: usuario.correo,
    telefono: usuario.telefono,
    rol: rol.nombre,
    rolEtiqueta: rol.etiqueta || rol.nombre,
    permisos: rol.permisos || [],
    // El frontend separa al personal del cliente sin comparar nombres de rol (0.15d)
    esPersonal: rol.nombre !== ROL_CLIENTE,
    createdAt: usuario.createdAt,
    updatedAt: usuario.updatedAt,
})

export const register = async (req, res) => {
    const { nombre, apellido, correo, contraseña, telefono } = req.validado

    const existe = await Usuario.exists({ correo }).collation(SIN_MAYUSCULAS)
    if (existe) throw new AppError(400, 'REGISTRO_NO_DISPONIBLE', MENSAJE_REGISTRO)

    // El rol "cliente" lo crea sembrarRoles() al arrancar (sin upserts en peticiones)
    const rolCliente = await Rol.findOne({ nombre: 'cliente' })
    if (!rolCliente) throw new Error('Falta el rol "cliente": ejecuta npm run seed:base')

    let usuarioGuardado
    try {
        usuarioGuardado = await Usuario.create({
            nombre,
            apellido,
            correo,
            contraseña: await bcrypt.hash(contraseña, 10),
            telefono,
            rol: rolCliente._id,
        })
    } catch (error) {
        // Carrera entre dos registros con el mismo correo
        if (error.code === 11000) throw new AppError(400, 'REGISTRO_NO_DISPONIBLE', MENSAJE_REGISTRO)
        throw error
    }

    // El token solo identifica al usuario; rol y permisos se leen de la BD en cada petición
    await abrirSesion(res, usuarioGuardado, rolCliente)
    res.json(usuarioPublico(usuarioGuardado, rolCliente))
}

export const login = async (req, res) => {
    const { correo, contraseña } = req.validado

    const usuario = await Usuario.findOne({ correo }).collation(SIN_MAYUSCULAS).populate('rol')
    const coincide = await bcrypt.compare(contraseña, usuario?.contraseña || HASH_FICTICIO)
    if (!usuario || !coincide || !usuario.rol) {
        throw new AppError(401, 'CREDENCIALES_INVALIDAS', MENSAJE_LOGIN)
    }
    // Solo se informa después de validar la contraseña
    if (usuario.activo === false) {
        throw new AppError(403, 'ACCOUNT_DISABLED', 'Tu cuenta está desactivada. Contacta al administrador.')
    }

    await abrirSesion(res, usuario, usuario.rol)
    res.json(usuarioPublico(usuario, usuario.rol))
}

/**
 * Cierra la sesión del personal en el servidor (1.1b): sube tokenVersion para que el token deje
 * de servir al instante (también «Cambiar de usuario» en tablets compartidas). Cierra además sus
 * otras sesiones; aceptado para el personal. El cliente no cambia: solo se borra su cookie.
 * Nunca falla: sin cookie, con un token inválido, vencido o ya revocado, o si la BD falla, solo
 * se borra la cookie. Solo revoca un token vigente (misma regla de duración que autenticar) y
 * pedido desde el frontend: con otro Origin no revoca (CSRF si alguna vez sameSite=none).
 */
const revocarSesionDePersonal = async (token) => {
    let payload
    try {
        payload = verificarToken(token)
    } catch {
        return
    }
    if (!mongoose.isValidObjectId(payload?.id) || !Number.isInteger(payload.tv)) return
    const sesion = await obtenerSesion(payload.id)
    if (!sesion?.rol || sesion.rol === ROL_CLIENTE || sesion.tokenVersion !== payload.tv) return
    if (!Number.isFinite(payload.iat) || Date.now() >= payload.iat * 1000 + duracionSesionMs(sesion)) return
    // Condicional sobre la versión del token: dos cierres a la vez suben la versión una sola vez
    await Usuario.updateOne(
        { _id: payload.id, tokenVersion: payload.tv === 0 ? { $in: [0, null] } : payload.tv },
        { $inc: { tokenVersion: 1 } },
    )
    invalidarSesionUsuario(payload.id)
}

export const logout = async (req, res) => {
    const token = req.cookies?.[COOKIE_SESION]
    const origen = req.get('origin')
    const origenPermitido = !origen || config.CLIENT_URLS.includes(origen)
    if (token && origenPermitido) {
        try {
            await revocarSesionDePersonal(token)
        } catch (error) {
            // La cookie se borra igual; el error va al log sin el token
            logger.error({ err: error }, 'No se pudo revocar la sesión al cerrar sesión')
        }
    }
    borrarCookieSesion(res)
    return res.sendStatus(200)
}

export const solicitarRecuperacion = (req, res) => {
    res.status(202).json({ message: solicitar(req.validado.correo) })
}

export const restablecerContrasena = async (req, res) => {
    await restablecer(req.validado)
    res.json({ message: 'Tu contraseña fue restablecida. Ya puedes iniciar sesión.' })
}
