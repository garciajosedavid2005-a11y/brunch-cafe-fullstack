import 'dotenv/config'
import pino from 'pino'

const entorno = process.env.NODE_ENV || 'development'

// Campos que nunca deben quedar en los logs
const redact = {
    paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.contraseña',
        '*.password',
        '*.token',
    ],
    censor: '[oculto]',
}

const nivel = process.env.LOG_LEVEL || (entorno === 'test' ? 'silent' : entorno === 'production' ? 'info' : 'debug')

export const logger = pino({
    level: nivel,
    redact,
    ...(entorno === 'development'
        ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname,req,res,responseTime' } } }
        : {}),
})
