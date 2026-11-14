import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { cuerpoError } from '../compartido/errors.js'

// Almacén en memoria: válido para una sola instancia del backend.
// Con varias instancias habría que usar un store compartido (Redis/Mongo).
const responder429 = (mensaje) => (req, res, next, options) => {
    res.status(options.statusCode).json(cuerpoError('TOO_MANY_REQUESTS', mensaje))
}

// El limitador corre antes de validar el cuerpo: la clave usa como mucho 254 caracteres (el máximo del schema)
// y solo si es texto, para que un cuerpo enorme o un objeto no creen claves sin fin en memoria (2.8, revisores)
const correoDelBody = (req) => {
    const correo = req.body?.correo
    return typeof correo === 'string' ? correo.trim().toLowerCase().slice(0, 254) : ''
}

// Login: 5 intentos FALLIDOS cada 15 min por IP + correo (los exitosos no cuentan)
export const crearLimiteLogin = () => rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${correoDelBody(req)}`,
    handler: responder429('Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.'),
})

// 2.8 · Todas las tablets del local (y los clientes en su wifi) salen por la misma IP pública. Lo que se pide
// con un correo o un enlace cuenta por IP + correo (o enlace), para que un error de una persona no deje sin
// recuperación a todo el personal; un tope más alto por IP sigue frenando el abuso desde una sola conexión.
const TOPE_IP_POR_HORA = 30
const UNA_HORA = 60 * 60 * 1000
const limite = ({ limit, clave, mensaje }) => rateLimit({
    windowMs: UNA_HORA,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: clave,
    handler: responder429(mensaje),
})
const porIp = (req) => ipKeyGenerator(req.ip)

// Registro: 30 por hora por IP (cada registro es de un correo nuevo: contar por correo no frenaría nada)
export const crearLimiteRegistro = () => limite({
    limit: TOPE_IP_POR_HORA,
    clave: porIp,
    mensaje: 'Demasiados registros desde esta conexión. Intenta de nuevo más tarde.',
})

// Recuperación: 3 por hora por IP + correo y 30 por hora por IP
export const crearLimitesRecuperacion = () => [
    limite({
        limit: 3,
        clave: (req) => `${porIp(req)}|${correoDelBody(req)}`,
        mensaje: 'Ya pediste varios enlaces para este correo. Revisa tu bandeja o intenta de nuevo en una hora.',
    }),
    limite({
        limit: TOPE_IP_POR_HORA,
        clave: porIp,
        mensaje: 'Demasiadas solicitudes de recuperación desde esta conexión. Intenta de nuevo más tarde.',
    }),
]

// Restablecimiento: 5 por hora por IP + enlace y 30 por hora por IP (el enlace son 64 hex: no se adivina)
const tokenDelBody = (req) => (typeof req.body?.token === 'string' ? req.body.token.trim().toLowerCase().slice(0, 64) : '')
export const crearLimitesRestablecimiento = () => [
    limite({
        limit: 5,
        clave: (req) => `${porIp(req)}|${tokenDelBody(req)}`,
        mensaje: 'Demasiados intentos con este enlace. Intenta de nuevo más tarde.',
    }),
    limite({
        limit: TOPE_IP_POR_HORA,
        clave: porIp,
        mensaje: 'Demasiados intentos para restablecer la contraseña. Intenta de nuevo más tarde.',
    }),
]
