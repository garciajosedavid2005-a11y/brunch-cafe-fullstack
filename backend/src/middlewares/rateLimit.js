import { rateLimit, ipKeyGenerator } from 'express-rate-limit'
import { cuerpoError } from '../libs/errors.js'

// Almacén en memoria: válido para una sola instancia del backend.
// Con varias instancias habría que usar un store compartido (Redis/Mongo).
const responder429 = (mensaje) => (req, res, next, options) => {
    res.status(options.statusCode).json(cuerpoError('TOO_MANY_REQUESTS', mensaje))
}

const correoDelBody = (req) => String(req.body?.correo || '').trim().toLowerCase()

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

// Registro: 10 por hora por IP
export const crearLimiteRegistro = () => rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(req.ip),
    handler: responder429('Demasiados registros desde esta conexión. Intenta de nuevo más tarde.'),
})
