import jwt from 'jsonwebtoken'
import { config } from '../../config.js'

export function generarToken(payload, expiresIn = config.JWT_EXPIRES_IN) {
    return new Promise((resolve, reject) => {
        jwt.sign(
            payload,
            config.JWT_SECRET,
            {
                expiresIn,
            },
            (err, token) => {
                if (err) reject(err)
                resolve(token)
            }
        )
    })
}

// Token de sesión: solo el id y la versión de sesiones del usuario.
// La duración la decide duracionSesion.js según el rol (1.1)
export const tokenDeSesion = (usuario, duracion) =>
    generarToken({ id: String(usuario._id || usuario.id), tv: usuario.tokenVersion || 0 }, duracion)

export const verificarToken = (token) => {
    return jwt.verify(token, config.JWT_SECRET)
}