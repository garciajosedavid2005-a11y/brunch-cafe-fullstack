import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { pinoHttp } from 'pino-http'
import { config } from './config.js'
import { logger } from './libs/logger.js'
import routes from './routes/index.routes.js'
import {
    manejadorErrores,
    normalizarErroresLegados,
    rutaNoEncontrada,
} from './middlewares/errorHandler.js'

export const createApp = () => {
    const app = express()

    app.use(pinoHttp({
        logger,
        autoLogging: { ignore: (req) => req.url === '/api/health' },
        customLogLevel: (req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
        customSuccessMessage: (req, res, tiempo) => `${req.method} ${req.originalUrl} ${res.statusCode} ${tiempo}ms`,
        customErrorMessage: (req, res) => `${req.method} ${req.originalUrl} ${res.statusCode}`,
        // Solo lo necesario: nunca cabeceras (cookies) ni cuerpos
        serializers: {
            req: (req) => ({ id: req.id, method: req.method, url: req.url }),
            res: (res) => ({ statusCode: res.statusCode }),
        },
    }))
    if (config.TRUST_PROXY) app.set('trust proxy', config.TRUST_PROXY)
    app.disable('x-powered-by')

    // API JSON: CORP "same-site" por defecto; la ruta de imágenes del menú lo
    // sobrescribe a "cross-origin" para que el frontend pueda mostrarlas
    app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }))
    // CORS explícito: solo los orígenes de CLIENT_URL, con credenciales (cookie)
    app.use(cors({
        origin: (origin, callback) => callback(null, !origin || config.CLIENT_URLS.includes(origin)),
        credentials: true,
    }))
    app.use(express.json({ limit: '6mb' }))
    app.use(cookieParser())
    app.use(normalizarErroresLegados)

    app.get('/api/health', (req, res) => {
        res.json({ status: 'ok', entorno: config.NODE_ENV })
    })

    // Todas las rutas de la API se montan desde index.routes.js
    app.use('/api', routes)

    app.use(rutaNoEncontrada)
    app.use(manejadorErrores)

    return app
}
