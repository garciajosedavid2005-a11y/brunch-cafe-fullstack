import { verificarToken } from '../libs/jwt.js'

export const validateToken = (req, res, next) => {
    const { token } = req.cookies

    if (!token)
        return res.status(401).json({ mensaje: "No hay token, autorizacion denegada" })

    try {
        const usuario = verificarToken(token)
        req.usuario = usuario
        next()
    } catch (error) {
        return res.status(403).json({ mensaje: "Token invalido" })
    }
}