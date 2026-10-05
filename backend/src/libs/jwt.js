import jwt from 'jsonwebtoken'
import { config } from '../config.js'

export function generarToken(payload) {
    return new Promise((resolve, reject) => {
        jwt.sign(
            payload,
            config.JWT_SECRET,
            {
                expiresIn: config.JWT_EXPIRES_IN,
            },
            (err, token) => {
                if (err) reject(err)
                resolve(token)
            }
        )
    })
}

export const verificarToken = (token) => {
    return jwt.verify(token, config.JWT_SECRET)
}