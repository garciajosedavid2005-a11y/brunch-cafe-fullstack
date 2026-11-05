import { cuerpoError } from './errors.js'
import { logger } from './logger.js'
import { traducirError } from '../middlewares/errorHandler.js'

// Usado por los controladores del dashboard dentro de try/catch.
// Delega en el traductor central para mantener el formato único de errores.
export const manejarError = (res, error) => {
    const { status, code, message, details } = traducirError(error)
    if (status >= 500) logger.error({ err: error }, 'Error en controlador')
    return res.status(status).json(cuerpoError(code, message, details))
}
