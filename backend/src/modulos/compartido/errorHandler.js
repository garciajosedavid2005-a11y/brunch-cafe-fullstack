import { ZodError } from 'zod'
import {
    AppError,
    MENSAJE_INTERNO,
    codigoPorStatus,
    cuerpoError,
    detallesZod,
} from './errors.js'
import { logger } from './logger.js'

// 0.11: se retiró normalizarErroresLegados; los controladores responden ya con el
// formato único { error: { code, message, details } } o lanzan AppError.

export const rutaNoEncontrada = (req, res) => {
    res.status(404).json(cuerpoError('NOT_FOUND', `No existe la ruta ${req.method} ${req.originalUrl}.`))
}

// Traduce cualquier error a { status, code, message, details }
export const traducirError = (error) => {
    if (error instanceof AppError) {
        return { status: error.status, code: error.code, message: error.message, details: error.details }
    }
    if (error instanceof ZodError) {
        return {
            status: 400,
            code: 'VALIDATION_ERROR',
            message: error.issues[0]?.message || 'Datos inválidos.',
            details: detallesZod(error),
        }
    }
    if (error?.name === 'CastError') {
        return { status: 400, code: 'INVALID_ID', message: 'ID inválido.' }
    }
    if (error?.name === 'ValidationError' && error.errors) {
        const details = Object.entries(error.errors).map(([campo, e]) => ({ campo, mensaje: e.message }))
        return { status: 400, code: 'VALIDATION_ERROR', message: details[0]?.mensaje || 'Datos inválidos.', details }
    }
    if (error?.code === 11000) {
        const campos = Object.keys(error.keyValue || error.keyPattern || {})
        return { status: 409, code: 'DUPLICATE', message: 'Ya existe un registro con esos datos.', details: campos.length ? { campos } : undefined }
    }
    // Errores de body-parser (JSON mal formado, cuerpo demasiado grande)
    if (error?.type === 'entity.parse.failed') {
        return { status: 400, code: 'INVALID_JSON', message: 'El cuerpo de la petición no es un JSON válido.' }
    }
    if (error?.type === 'entity.too.large') {
        return {
            status: 413,
            code: 'PAYLOAD_TOO_LARGE',
            message: 'La petición es demasiado grande (máximo 3 MB). Si subes una imagen, debe pesar como máximo 2 MB.',
        }
    }
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status < 600 ? error.status : 500
    return {
        status,
        code: codigoPorStatus(status),
        message: status >= 500 ? MENSAJE_INTERNO : error.message,
    }
}

export const manejadorErrores = (error, req, res, next) => {
    if (res.headersSent) return next(error)
    const { status, code, message, details } = traducirError(error)
    if (status >= 500) {
        (req.log || logger).error({ err: error }, 'Error no controlado')
    }
    return res.status(status).json(cuerpoError(code, message, details))
}
