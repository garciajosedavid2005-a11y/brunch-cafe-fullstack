import { verificarToken } from '../libs/jwt.js'
import { COOKIE_SESION, borrarCookieSesion } from '../libs/cookies.js'

// Sin token, token inválido o vencido → 401 (la cookie inválida se borra)
export const validateToken = (req, res, next) => {
    const token = req.cookies?.[COOKIE_SESION]

    if (!token) {
        return res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'No hay sesión activa. Inicia sesión.' } })
    }

    try {
        req.usuario = verificarToken(token)
        next()
    } catch (error) {
        borrarCookieSesion(res)
        const vencido = error?.name === 'TokenExpiredError'
        return res.status(401).json({
            error: {
                code: vencido ? 'SESSION_EXPIRED' : 'INVALID_TOKEN',
                message: vencido ? 'Tu sesión expiró. Inicia sesión de nuevo.' : 'Sesión inválida. Inicia sesión de nuevo.',
            },
        })
    }
}
