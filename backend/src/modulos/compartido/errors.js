// Error de dominio con formato único de API: { error: { code, message, details } }
export class AppError extends Error {
    // `opciones.cause`: el error original (va al log, nunca a la respuesta)
    constructor(status, code, message, details, opciones) {
        super(message, opciones)
        this.name = 'AppError'
        this.status = status
        this.code = code
        this.details = details
    }
}

// Código por defecto según el status HTTP (para respuestas que no traen uno propio)
export const CODIGOS_HTTP = {
    400: 'BAD_REQUEST',
    401: 'UNAUTHORIZED',
    403: 'FORBIDDEN',
    404: 'NOT_FOUND',
    409: 'CONFLICT',
    413: 'PAYLOAD_TOO_LARGE',
    422: 'UNPROCESSABLE_ENTITY',
    429: 'TOO_MANY_REQUESTS',
    500: 'INTERNAL_ERROR',
}

export const MENSAJE_INTERNO = 'Ocurrió un error interno.'

export const codigoPorStatus = (status) =>
    CODIGOS_HTTP[status] || (status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST')

export const cuerpoError = (code, message, details) => ({
    error: details === undefined ? { code, message } : { code, message, details },
})

// Convierte issues de Zod en una lista legible: [{ campo, mensaje }]
export const detallesZod = (zodError) =>
    zodError.issues.map((issue) => ({
        campo: issue.path.join('.'),
        mensaje: issue.message,
    }))

export const badRequest = (message, details) => new AppError(400, 'BAD_REQUEST', message, details)
export const unauthorized = (message = 'No autenticado.') => new AppError(401, 'UNAUTHORIZED', message)
export const forbidden = (message = 'No tienes permiso para realizar esta acción.') => new AppError(403, 'FORBIDDEN', message)
export const notFound = (message = 'Recurso no encontrado.') => new AppError(404, 'NOT_FOUND', message)
export const conflict = (message, details) => new AppError(409, 'CONFLICT', message, details)
