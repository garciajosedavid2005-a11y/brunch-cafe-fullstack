import mongoose from 'mongoose'
import { verificarToken } from '../libs/jwt.js'
import { COOKIE_SESION, borrarCookieSesion } from '../libs/cookies.js'
import { cuerpoError } from '../libs/errors.js'
import { obtenerSesion } from '../libs/sesiones.js'

const rechazar = (res, code, message) => {
    borrarCookieSesion(res)
    return res.status(401).json(cuerpoError(code, message))
}

/**
 * Autenticación: verifica el JWT de la cookie y relee usuario, rol y permisos
 * desde la BD (caché de 30 s, invalidación inmediata al cambiar usuario o rol).
 * El rol que pudiera traer el token NO se usa.
 *   req.usuario = { id, nombre, apellido, correo, rol, rolId, permisos, activo }
 * Sin sesión, token inválido/vencido, usuario borrado o desactivado, o versión
 * de sesión antigua (contraseña cambiada) → 401.
 */
export const autenticar = async (req, res, next) => {
    const token = req.cookies?.[COOKIE_SESION]
    if (!token) {
        return res.status(401).json(cuerpoError('UNAUTHORIZED', 'No hay sesión activa. Inicia sesión.'))
    }

    let payload
    try {
        payload = verificarToken(token)
    } catch (error) {
        return error?.name === 'TokenExpiredError'
            ? rechazar(res, 'SESSION_EXPIRED', 'Tu sesión expiró. Inicia sesión de nuevo.')
            : rechazar(res, 'INVALID_TOKEN', 'Sesión inválida. Inicia sesión de nuevo.')
    }

    if (!mongoose.isValidObjectId(payload?.id)) {
        return rechazar(res, 'INVALID_TOKEN', 'Sesión inválida. Inicia sesión de nuevo.')
    }

    const sesion = await obtenerSesion(payload.id)
    if (!sesion) return rechazar(res, 'INVALID_TOKEN', 'Sesión inválida. Inicia sesión de nuevo.')
    if (!sesion.activo) return rechazar(res, 'ACCOUNT_DISABLED', 'Tu cuenta está desactivada. Contacta al administrador.')
    // Token emitido antes de un cambio de contraseña o una desactivación
    if ((payload.tv || 0) !== sesion.tokenVersion) {
        return rechazar(res, 'SESSION_REVOKED', 'Tu sesión se cerró por seguridad. Inicia sesión de nuevo.')
    }

    req.usuario = sesion
    next()
}

// Nombre histórico usado por las rutas existentes
export const validateToken = autenticar
